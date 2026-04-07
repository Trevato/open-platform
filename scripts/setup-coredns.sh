#!/usr/bin/env bash
set -euo pipefail

# Creates a CoreDNS custom zone so *.DOMAIN resolves to Traefik inside the cluster.
# Required for in-cluster services (oauth2-proxy, Flux) to reach Forgejo/etc by domain name.
# Detects hostNetwork: if Traefik uses hostNetwork, resolves to node IP instead of ClusterIP.
# Idempotent — uses kubectl apply.

DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set}"

HOST_NETWORK=$(kubectl get ds traefik -n kube-system \
  -o jsonpath='{.spec.template.spec.hostNetwork}' 2>/dev/null || echo "false")

if [ "$HOST_NETWORK" = "true" ]; then
  # Use Traefik ClusterIP for in-cluster resolution (works regardless of node count)
  TRAEFIK_IP=$(kubectl get svc traefik -n kube-system -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
  if [ -z "$TRAEFIK_IP" ]; then
    # Fallback: first node IP (single-node case where ClusterIP isn't available yet)
    TRAEFIK_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' \
      | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -1)
  fi
else
  # Deployment mode: prefer LoadBalancer external IP, fall back to ClusterIP
  LB_IP=$(kubectl get svc traefik -n kube-system \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [ -n "$LB_IP" ]; then
    TRAEFIK_IP="$LB_IP"
  else
    TRAEFIK_IP=$(kubectl get svc traefik -n kube-system -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
  fi
fi

if [ -z "$TRAEFIK_IP" ]; then
  echo "Warning: Traefik service not found — skipping CoreDNS setup."
  exit 0
fi

PLATFORM_ZONE="${DOMAIN}:53 {
  errors
  cache 30
  template IN A {
    answer \"{{ .Name }} 60 IN A ${TRAEFIK_IP}\"
    fallthrough
  }
  template IN AAAA {
    rcode NOERROR
    fallthrough
  }
}"

kubectl create configmap coredns-custom -n kube-system \
  --from-literal="platform.server=${PLATFORM_ZONE}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "CoreDNS custom zone: *.${DOMAIN} → ${TRAEFIK_IP} (hostNetwork=${HOST_NETWORK})"
