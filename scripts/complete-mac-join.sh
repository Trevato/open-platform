#!/usr/bin/env bash
set -euo pipefail

# Completes the Mac Colima agent join after enabling cross-network connectivity.
#
# Option A (recommended): Authenticate Tailscale in the VM:
#   colima ssh -p mac-node -- sudo tailscale up --hostname=colima-mac-node --accept-routes
#
# Option B: Approve Mac's subnet route in Tailscale admin console:
#   Visit https://login.tailscale.com/admin/machines → otavert-mac → approve 192.168.64.0/24
#   (VxRail already has --accept-routes enabled)
#
# Usage: ./scripts/complete-mac-join.sh

PROFILE="${1:-mac-node}"

echo "=== Completing Mac Agent Join ==="

# 1. Determine node external IP (Tailscale preferred, bridge as fallback)
TS_IP=$(colima ssh -p "$PROFILE" -- tailscale ip -4 2>/dev/null || echo "")
BRIDGE_IP=$(colima ssh -p "$PROFILE" -- ip -4 addr show col0 2>/dev/null | grep inet | awk '{print $2}' | cut -d/ -f1 || echo "")

if [ -n "$TS_IP" ]; then
  NODE_IP="$TS_IP"
  echo "  Using Tailscale IP: $NODE_IP"
elif [ -n "$BRIDGE_IP" ]; then
  NODE_IP="$BRIDGE_IP"
  echo "  Using bridge IP: $NODE_IP (ensure Tailscale subnet route approved)"
  echo "  Approve at: https://login.tailscale.com/admin/machines → otavert-mac → 192.168.64.0/24"
else
  echo "Error: No routable IP found for VM."
  echo "  Either authenticate Tailscale or ensure Colima bridge network is available."
  exit 1
fi

# 2. Test bidirectional connectivity
VXRAIL_TS="100.84.55.62"
if colima ssh -p "$PROFILE" -- curl -sk --connect-timeout 5 "https://${VXRAIL_TS}:6443/healthz" >/dev/null 2>&1; then
  echo "  VM → VxRail: OK"
else
  echo "  Warning: VM cannot reach VxRail at ${VXRAIL_TS}:6443"
fi

if ssh -o ConnectTimeout=5 vxrail "ping -c 1 -W 3 ${NODE_IP}" >/dev/null 2>&1; then
  echo "  VxRail → VM: OK"
else
  echo "  Warning: VxRail cannot reach VM at ${NODE_IP}"
  echo "  Flannel VXLAN requires bidirectional connectivity."
  if [ "$NODE_IP" = "$BRIDGE_IP" ]; then
    echo "  Approve the subnet route in Tailscale admin, or use Tailscale in the VM."
  fi
fi

# 3. Get join token
K3S_TOKEN=$(ssh -o ConnectTimeout=10 vxrail "sudo cat /var/lib/rancher/k3s/server/node-token" 2>/dev/null)
if [ -z "$K3S_TOKEN" ]; then
  echo "Error: Cannot fetch join token from VxRail"
  exit 1
fi

# 4. Stop existing agent, delete stale node, clean Flannel state
colima ssh -p "$PROFILE" -- sudo systemctl stop k3s-agent 2>/dev/null || true
VM_HOSTNAME=$(colima ssh -p "$PROFILE" -- hostname 2>/dev/null || echo "colima-${PROFILE}")
kubectl delete node "$VM_HOSTNAME" 2>/dev/null || true
colima ssh -p "$PROFILE" -- sudo sh -c "ip link del flannel.1 2>/dev/null; rm -rf /var/lib/cni/networks/cbr0/* 2>/dev/null; true"

# 5. Reinstall with Tailscale IP and correct Flannel interface
echo "  Reinstalling k3s agent with Tailscale IP..."
TS_IFACE=$(colima ssh -p "$PROFILE" -- ip -o addr show 2>/dev/null | grep "$NODE_IP" | awk '{print $2}' || echo "tailscale0")
FLANNEL_IFACE_FLAG=""
if [ -n "$TS_IFACE" ] && [ "$TS_IFACE" != "eth0" ]; then
  FLANNEL_IFACE_FLAG="--flannel-iface=${TS_IFACE}"
  echo "  Flannel interface: $TS_IFACE"
fi
colima ssh -p "$PROFILE" -- sh -c \
  "curl -sfL https://get.k3s.io | K3S_URL='https://${VXRAIL_TS}:6443' K3S_TOKEN='${K3S_TOKEN}' INSTALL_K3S_EXEC='agent --node-ip=${NODE_IP} --node-external-ip=${NODE_IP} ${FLANNEL_IFACE_FLAG}' sh -" 2>&1

# 6. Wait for node
VM_HOSTNAME=$(colima ssh -p "$PROFILE" -- hostname 2>/dev/null || echo "colima-${PROFILE}")
echo "  Waiting for node '${VM_HOSTNAME}'..."
RETRIES=0
while [ $RETRIES -lt 30 ]; do
  if kubectl get node "$VM_HOSTNAME" &>/dev/null 2>&1; then
    NODE_STATUS=$(kubectl get node "$VM_HOSTNAME" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
    if [ "$NODE_STATUS" = "True" ]; then
      echo "  Node ready!"
      break
    fi
  fi
  sleep 5
  RETRIES=$((RETRIES + 1))
done

if [ $RETRIES -ge 30 ]; then
  echo "  Warning: Node not ready within 150s"
  echo "  Check: colima ssh -p $PROFILE -- sudo journalctl -u k3s-agent -f"
  exit 1
fi

# 7. Label node
kubectl label node "$VM_HOSTNAME" "open-platform.sh/node-role=worker" --overwrite 2>/dev/null || true
echo "  Labeled: worker"

# 8. Test cross-node networking
echo "  Testing cross-node pod networking..."
kubectl run nettest-mac --image=busybox --restart=Never \
  --overrides="{\"spec\":{\"nodeSelector\":{\"open-platform.sh/node-role\":\"worker\"}}}" \
  -- sh -c "wget -q -O /dev/null --timeout=10 http://forgejo-http.forgejo.svc.cluster.local:3000/ && echo OK || echo FAIL" 2>/dev/null
sleep 15
RESULT=$(kubectl logs nettest-mac 2>/dev/null || echo "pending")
kubectl delete pod nettest-mac --ignore-not-found >/dev/null 2>&1

if [ "$RESULT" = "OK" ]; then
  echo "  Cross-node networking: OK"
else
  echo "  Cross-node networking: $RESULT (may need time for Flannel)"
fi

echo ""
echo "=== Mac Agent Joined ==="
kubectl get nodes -o wide
echo ""
echo "Next: make deploy  (to apply multinode affinity rules)"
