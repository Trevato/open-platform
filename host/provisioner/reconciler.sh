#!/usr/bin/env bash
set -euo pipefail

# Reconciler CronJob script for the open-platform provisioner.
# Polls the console database for pending/terminating instances and acts on them.
# Runs on the HOST k3s cluster as a CronJob (every 1 minute).
#
# Expected environment:
#   - kubectl access to host cluster (via ServiceAccount)
#   - PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (from provisioner-db secret)
#   - Repo cloned at /repo (by init container)

PROVISION_SCRIPT="/repo/scripts/provision-instance.sh"
TEARDOWN_SCRIPT="/repo/scripts/teardown-instance.sh"

# ── Helpers ──────────────────────────────────────────────────────────────────

db_query() {
  local sql="$1"
  psql -tAc "$sql" 2>/dev/null
}

db_exec() {
  local sql="$1"
  psql -c "$sql" >/dev/null
}

insert_event() {
  local instance_id="$1" phase="$2" message="$3" status="${4:-info}"
  phase="${phase//\'/\'\'}"
  message="${message//\'/\'\'}"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  db_exec "INSERT INTO provision_events (instance_id, phase, status, message, created_at) VALUES ('${instance_id}', '${phase}', '${status}', '${message}', '${ts}')"
}

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

echo "[$(timestamp)] Reconciler starting"

# ── Check Database Connectivity ──────────────────────────────────────────────

if ! db_query "SELECT 1" >/dev/null 2>&1; then
  echo "[$(timestamp)] ERROR: Cannot connect to console database — exiting"
  exit 1
fi

# ── Discover Console Databases ───────────────────────────────────────────────
# pg_database is a shared catalog — any user can read it.
# Discover all console databases (prod + preview) and reconcile each.

CONSOLE_DATABASES=$(psql -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'op_system_console%' ORDER BY datname" 2>/dev/null || echo "$PGDATABASE")

if [ -z "$CONSOLE_DATABASES" ]; then
  CONSOLE_DATABASES="$PGDATABASE"
fi

FOUND_WORK=false

for CURRENT_DB in $CONSOLE_DATABASES; do
  export PGDATABASE="$CURRENT_DB"
  echo "[$(timestamp)] Checking database: $CURRENT_DB"

# ── Process Pending Instances ────────────────────────────────────────────────

PENDING_ROW=$(db_query "SELECT id, slug, tier, admin_username, admin_email FROM instances WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1" || echo "")

if [ -n "$PENDING_ROW" ]; then
  FOUND_WORK=true
  # Parse pipe-delimited row: id|slug|tier|admin_username|admin_email
  IFS='|' read -r INSTANCE_ID SLUG TIER ADMIN_USER ADMIN_EMAIL <<< "$PENDING_ROW"

  echo "[$(timestamp)] Found pending instance: ${SLUG} (id=${INSTANCE_ID}, tier=${TIER}) in ${CURRENT_DB}"

  # Update status to provisioning
  db_exec "UPDATE instances SET status = 'provisioning', updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
  insert_event "$INSTANCE_ID" "provisioning_started" "Provisioning instance ${SLUG}"

  # Run provisioner
  PROVISION_EXIT=0
  if "$PROVISION_SCRIPT" "$SLUG" "$TIER" "$ADMIN_USER" "$ADMIN_EMAIL" "$INSTANCE_ID"; then
    PROVISION_EXIT=0
  else
    PROVISION_EXIT=$?
  fi

  if [ "$PROVISION_EXIT" -eq 0 ]; then
    # Read provision log for details
    LOG_FILE="/tmp/provision-${SLUG}.log"
    LAST_MESSAGE="Provisioned successfully"
    if [ -f "$LOG_FILE" ]; then
      LAST_MESSAGE=$(tail -1 "$LOG_FILE" | jq -r '.message // "Provisioned successfully"' 2>/dev/null || echo "Provisioned successfully")
    fi

    # Store admin password from provision script
    PASSWORD_FILE="/tmp/provision-${SLUG}.password"
    if [ -f "$PASSWORD_FILE" ]; then
      ADMIN_PASS=$(cat "$PASSWORD_FILE")
      ADMIN_PASS_ESC="${ADMIN_PASS//\'/\'\'}"
      db_exec "UPDATE instances SET admin_password = '${ADMIN_PASS_ESC}' WHERE id = '${INSTANCE_ID}'"
      rm -f "$PASSWORD_FILE"
    fi

    # Store kubeconfig from provision script
    KUBECONFIG_FILE="/tmp/provision-${SLUG}.kubeconfig"
    if [ -f "$KUBECONFIG_FILE" ]; then
      KUBECONFIG_DATA=$(cat "$KUBECONFIG_FILE")
      KUBECONFIG_ESC="${KUBECONFIG_DATA//\'/\'\'}"
      db_exec "UPDATE instances SET kubeconfig = '${KUBECONFIG_ESC}' WHERE id = '${INSTANCE_ID}'"
      rm -f "$KUBECONFIG_FILE"
    fi

    # Store vCluster ClusterIP for in-browser terminal
    CLUSTERIP_FILE="/tmp/provision-${SLUG}.clusterip"
    if [ -f "$CLUSTERIP_FILE" ]; then
      CLUSTER_IP=$(cat "$CLUSTERIP_FILE")
      CLUSTER_IP_ESC="${CLUSTER_IP//\'/\'\'}"
      db_exec "UPDATE instances SET cluster_ip = '${CLUSTER_IP_ESC}' WHERE id = '${INSTANCE_ID}'"
      rm -f "$CLUSTERIP_FILE"
    fi

    db_exec "UPDATE instances SET status = 'ready', provisioned_at = '$(timestamp)', updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
    insert_event "$INSTANCE_ID" "provisioning_complete" "$LAST_MESSAGE"
    echo "[$(timestamp)] Instance ${SLUG} provisioned successfully"
  else
    # Read error from log
    LOG_FILE="/tmp/provision-${SLUG}.log"
    ERROR_MESSAGE="Provisioning failed with exit code ${PROVISION_EXIT}"
    if [ -f "$LOG_FILE" ]; then
      ERROR_LINE=$(grep '"error"' "$LOG_FILE" | tail -1 || echo "")
      if [ -n "$ERROR_LINE" ]; then
        ERROR_MESSAGE=$(echo "$ERROR_LINE" | jq -r '.message // "Unknown error"' 2>/dev/null || echo "Unknown error")
      fi
    fi

    # Escape single quotes for safe SQL interpolation
    ERROR_MESSAGE="${ERROR_MESSAGE//\'/\'\'}"

    db_exec "UPDATE instances SET status = 'failed', error_message = '${ERROR_MESSAGE}', updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
    insert_event "$INSTANCE_ID" "provisioning_failed" "$ERROR_MESSAGE"
    echo "[$(timestamp)] ERROR: Instance ${SLUG} provisioning failed: ${ERROR_MESSAGE}"
  fi
fi

# ── Process Terminating Instances ────────────────────────────────────────────

TERMINATING_ROW=$(db_query "SELECT id, slug FROM instances WHERE status = 'terminating' ORDER BY created_at ASC LIMIT 1" || echo "")

if [ -n "$TERMINATING_ROW" ]; then
  FOUND_WORK=true
  IFS='|' read -r INSTANCE_ID SLUG <<< "$TERMINATING_ROW"

  echo "[$(timestamp)] Found terminating instance: ${SLUG} (id=${INSTANCE_ID}) in ${CURRENT_DB}"

  insert_event "$INSTANCE_ID" "teardown_started" "Tearing down instance ${SLUG}"

  TEARDOWN_EXIT=0
  if "$TEARDOWN_SCRIPT" "$SLUG"; then
    TEARDOWN_EXIT=0
  else
    TEARDOWN_EXIT=$?
  fi

  if [ "$TEARDOWN_EXIT" -eq 0 ]; then
    db_exec "UPDATE instances SET status = 'terminated', admin_password = NULL, kubeconfig = NULL, cluster_ip = NULL, updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
    insert_event "$INSTANCE_ID" "teardown_complete" "Instance ${SLUG} terminated"
    echo "[$(timestamp)] Instance ${SLUG} terminated successfully"
  else
    db_exec "UPDATE instances SET status = 'failed', error_message = 'Teardown failed with exit code ${TEARDOWN_EXIT}', updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
    insert_event "$INSTANCE_ID" "teardown_failed" "Teardown failed with exit code ${TEARDOWN_EXIT}"
    echo "[$(timestamp)] ERROR: Instance ${SLUG} teardown failed"
  fi
fi

# ── Process Password Resets ─────────────────────────────────────────────────

RESET_ROWS=$(psql -tA --field-separator=$'\x01' -c "SELECT id, slug, admin_username, admin_password FROM instances WHERE password_reset_at IS NOT NULL AND status = 'ready'" 2>/dev/null || echo "")

if [ -n "$RESET_ROWS" ]; then
  FOUND_WORK=true
  while IFS=$'\x01' read -r INSTANCE_ID SLUG ADMIN_USER NEW_PASS; do
    [ -z "$INSTANCE_ID" ] && continue
    echo "[$(timestamp)] Applying password reset for ${SLUG}"

    NAMESPACE="vc-${SLUG}"

    # Get vCluster kubeconfig
    VC_KUBECONFIG=$(mktemp)
    kubectl get secret "vc-${SLUG}" -n "$NAMESPACE" \
      -o jsonpath='{.data.config}' | base64 -d > "$VC_KUBECONFIG" 2>/dev/null

    if [ ! -s "$VC_KUBECONFIG" ]; then
      echo "[$(timestamp)] WARNING: Cannot get kubeconfig for ${SLUG} — skipping"
      rm -f "$VC_KUBECONFIG"
      continue
    fi

    # Port-forward to vCluster
    LOCAL_PORT=14443
    while (echo >/dev/tcp/127.0.0.1/$LOCAL_PORT) 2>/dev/null; do
      LOCAL_PORT=$((LOCAL_PORT + 1))
    done

    sed -i "s|server:.*|server: https://127.0.0.1:${LOCAL_PORT}|" "$VC_KUBECONFIG"
    kubectl port-forward -n "$NAMESPACE" "svc/${SLUG}" "${LOCAL_PORT}:443" &>/dev/null &
    PF_PID=$!
    sleep 3

    # Get current admin password from Forgejo secret (to authenticate the PATCH)
    OLD_PASS=$(KUBECONFIG="$VC_KUBECONFIG" kubectl get secret forgejo-admin-credentials \
      -n forgejo -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "")

    if [ -z "$OLD_PASS" ]; then
      OLD_PASS="$NEW_PASS"
    fi

    # Port-forward to Forgejo inside vCluster
    FORGEJO_PORT=13000
    while (echo >/dev/tcp/127.0.0.1/$FORGEJO_PORT) 2>/dev/null; do
      FORGEJO_PORT=$((FORGEJO_PORT + 1))
    done
    KUBECONFIG="$VC_KUBECONFIG" kubectl port-forward -n forgejo svc/forgejo-http "${FORGEJO_PORT}:3000" &>/dev/null &
    FORGEJO_PF_PID=$!
    sleep 3

    RESET_OK=false
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
      -X PATCH "http://127.0.0.1:${FORGEJO_PORT}/api/v1/admin/users/${ADMIN_USER}" \
      -u "${ADMIN_USER}:${OLD_PASS}" \
      -H "Content-Type: application/json" \
      -d "{\"login_name\":\"${ADMIN_USER}\",\"source_id\":0,\"password\":\"${NEW_PASS}\",\"must_change_password\":false}" \
      --max-time 15 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
      RESET_OK=true
    elif [ "$HTTP_CODE" = "401" ]; then
      # Already applied — try authenticating with new password
      HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
        -X PATCH "http://127.0.0.1:${FORGEJO_PORT}/api/v1/admin/users/${ADMIN_USER}" \
        -u "${ADMIN_USER}:${NEW_PASS}" \
        -H "Content-Type: application/json" \
        -d "{\"login_name\":\"${ADMIN_USER}\",\"source_id\":0,\"password\":\"${NEW_PASS}\",\"must_change_password\":false}" \
        --max-time 15 2>/dev/null || echo "000")
      [ "$HTTP_CODE" = "200" ] && RESET_OK=true
    fi

    # Update Forgejo K8s secret with new password
    if [ "$RESET_OK" = "true" ]; then
      KUBECONFIG="$VC_KUBECONFIG" kubectl create secret generic forgejo-admin-credentials \
        -n forgejo \
        --from-literal=username="${ADMIN_USER}" \
        --from-literal=password="${NEW_PASS}" \
        --dry-run=client -o yaml | KUBECONFIG="$VC_KUBECONFIG" kubectl apply -f -

      db_exec "UPDATE instances SET password_reset_at = NULL, updated_at = '$(timestamp)' WHERE id = '${INSTANCE_ID}'"
      insert_event "$INSTANCE_ID" "password_reset" "Admin password reset applied"
      echo "[$(timestamp)] Password reset applied for ${SLUG}"
    else
      echo "[$(timestamp)] WARNING: Password reset failed for ${SLUG} (HTTP ${HTTP_CODE})"
      insert_event "$INSTANCE_ID" "password_reset" "Password reset failed (HTTP ${HTTP_CODE})" "error"
    fi

    # Cleanup port-forwards
    kill "$FORGEJO_PF_PID" 2>/dev/null || true
    kill "$PF_PID" 2>/dev/null || true
    wait "$FORGEJO_PF_PID" 2>/dev/null || true
    wait "$PF_PID" 2>/dev/null || true
    rm -f "$VC_KUBECONFIG"

  done <<< "$RESET_ROWS"
fi

done  # end database loop

# ── Summary ──────────────────────────────────────────────────────────────────

if [ "$FOUND_WORK" = "false" ]; then
  echo "[$(timestamp)] No pending work — exiting"
fi

echo "[$(timestamp)] Reconciler complete"
