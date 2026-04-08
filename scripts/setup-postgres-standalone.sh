#!/usr/bin/env bash
set -euo pipefail

# Deploys a standalone PostgreSQL instance for external infrastructure mode.
#
# In external mode, the CNPG operator runs on the host cluster but its CRDs
# are not available inside the vCluster. This script creates a simple
# PostgreSQL StatefulSet that provides the same database layout as the CNPG
# Cluster manifest (forgejo, platform_ledger, product_garden databases).
#
# The credentials are read from the same secrets that ensure-secrets.sh creates,
# so Forgejo and other consumers work without config changes.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up standalone PostgreSQL for external infrastructure mode..."

# Read credentials from existing secrets
FORGEJO_DB_PASS=$(kubectl get secret forgejo-db-credentials -n postgres \
  -o jsonpath='{.data.password}' 2>/dev/null | base64 -d) || true

if [ -z "$FORGEJO_DB_PASS" ]; then
  echo "  Warning: forgejo-db-credentials secret not found, using state file"
  [ -f "$ROOT_DIR/.env" ] && set -a && source "$ROOT_DIR/.env" && set +a
  FORGEJO_DB_PASS="${FORGEJO_DB_PASSWORD:-postgres}"
fi

# Check if postgres is already running
if kubectl get statefulset postgres -n postgres -o name >/dev/null 2>&1; then
  echo "  PostgreSQL StatefulSet already exists — skipping creation"
  kubectl wait --for=condition=ready pod/postgres-0 -n postgres --timeout=120s || true
  exit 0
fi

# Also skip if CNPG Cluster exists (bundled mode or host-managed)
if kubectl get cluster postgres -n postgres -o name >/dev/null 2>&1; then
  echo "  CNPG Cluster already exists — skipping standalone setup"
  kubectl wait --for=condition=ready pod/postgres-1 -n postgres --timeout=120s || true
  exit 0
fi

echo "  Creating standalone PostgreSQL StatefulSet..."

kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init
  namespace: postgres
data:
  init.sql: |
    CREATE DATABASE platform_ledger;
    CREATE DATABASE product_garden;
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: postgres
  labels:
    app: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
              name: postgres
          env:
            - name: POSTGRES_DB
              value: forgejo
            - name: POSTGRES_USER
              value: forgejo
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: forgejo-db-credentials
                  key: password
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
            - name: init
              mountPath: /docker-entrypoint-initdb.d
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "forgejo"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "forgejo"]
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: init
          configMap:
            name: postgres-init
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-rw
  namespace: postgres
  labels:
    app: postgres
spec:
  ports:
    - port: 5432
      targetPort: 5432
  selector:
    app: postgres
  type: ClusterIP
EOF

echo "  Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod/postgres-0 -n postgres --timeout=180s

echo "  Standalone PostgreSQL ready."
