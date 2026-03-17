#!/usr/bin/env bash
set -euo pipefail

# Health-check CronJob script for the open-platform provisioner.
# Polls all 'ready' instances and verifies they are reachable.
# Marks instances as 'unhealthy' if unreachable for >15 minutes.
# Runs on the HOST k3s cluster as a CronJob (every 5 minutes).
#
# Expected environment:
#   - PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (from provisioner-db secret)

DOMAIN="${PLATFORM_DOMAIN:-open-platform.sh}"

# Unhealthy threshold: 15 minutes (900 seconds)
UNHEALTHY_THRESHOLD_MINUTES=15

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

echo "[$(timestamp)] Health check starting"

# ── Check Database Connectivity ──────────────────────────────────────────────

if ! db_query "SELECT 1" >/dev/null 2>&1; then
  echo "[$(timestamp)] ERROR: Cannot connect to console database — exiting"
  exit 1
fi

# ── Query Ready Instances ────────────────────────────────────────────────────

READY_ROWS=$(db_query "SELECT id, slug, last_healthy_at FROM instances WHERE status = 'ready' ORDER BY slug" || echo "")

if [ -z "$READY_ROWS" ]; then
  echo "[$(timestamp)] No ready instances to check — exiting"
  exit 0
fi

TOTAL=0
HEALTHY=0
UNHEALTHY=0

while IFS='|' read -r INSTANCE_ID SLUG LAST_HEALTHY; do
  [ -z "$SLUG" ] && continue
  TOTAL=$((TOTAL + 1))

  FORGEJO_URL="https://${SLUG}-forgejo.${DOMAIN}"

  # Check Forgejo accessibility via curl (follows redirects, 10s timeout)
  HTTP_CODE=$(curl -sSo /dev/null -w "%{http_code}" --max-time 10 -L "$FORGEJO_URL" 2>/dev/null || echo "000")

  NOW=$(timestamp)

  FAIL_FILE="/tmp/health-fail-${SLUG}"

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
    # Healthy: update last_healthy_at and reset failure counter
    db_exec "UPDATE instances SET last_healthy_at = '${NOW}', updated_at = '${NOW}' WHERE id = '${INSTANCE_ID}'"
    rm -f "$FAIL_FILE"
    HEALTHY=$((HEALTHY + 1))
  else
    # Unreachable: increment consecutive failure counter
    UNHEALTHY=$((UNHEALTHY + 1))
    PREV_FAILS=0
    if [ -f "$FAIL_FILE" ]; then
      PREV_FAILS=$(cat "$FAIL_FILE" 2>/dev/null || echo "0")
    fi
    CONSECUTIVE_FAILS=$((PREV_FAILS + 1))
    echo "$CONSECUTIVE_FAILS" > "$FAIL_FILE"

    if [ -z "$LAST_HEALTHY" ] || [ "$LAST_HEALTHY" = "" ]; then
      # Never been healthy — could still be initializing. Check provisioned_at.
      PROVISIONED_AT=$(db_query "SELECT provisioned_at FROM instances WHERE id = '${INSTANCE_ID}'" || echo "")
      if [ -z "$PROVISIONED_AT" ]; then
        echo "[$(timestamp)] Instance ${SLUG} unreachable (HTTP ${HTTP_CODE}) — no provisioned_at, skipping"
        continue
      fi
      REFERENCE_TIME="$PROVISIONED_AT"
    else
      REFERENCE_TIME="$LAST_HEALTHY"
    fi

    # Calculate minutes since last healthy (using PostgreSQL for reliable timestamp math)
    MINUTES_SINCE=$(db_query "SELECT EXTRACT(EPOCH FROM (NOW() - '${REFERENCE_TIME}'::timestamptz))::int / 60" || echo "0")

    if [ "$CONSECUTIVE_FAILS" -ge 3 ] && [ "$MINUTES_SINCE" -ge "$UNHEALTHY_THRESHOLD_MINUTES" ]; then
      db_exec "UPDATE instances SET status = 'unhealthy', updated_at = '${NOW}' WHERE id = '${INSTANCE_ID}' AND status = 'ready'"
      insert_event "$INSTANCE_ID" "health_failed" "Instance ${SLUG} unreachable for ${MINUTES_SINCE}m, ${CONSECUTIVE_FAILS} consecutive failures (HTTP ${HTTP_CODE})"
      echo "[$(timestamp)] Instance ${SLUG} marked UNHEALTHY (unreachable ${MINUTES_SINCE}m, ${CONSECUTIVE_FAILS} consecutive failures, HTTP ${HTTP_CODE})"
      rm -f "$FAIL_FILE"
    else
      echo "[$(timestamp)] Instance ${SLUG} unreachable (HTTP ${HTTP_CODE}, ${CONSECUTIVE_FAILS}/3 failures, ${MINUTES_SINCE}m/${UNHEALTHY_THRESHOLD_MINUTES}m threshold)"
    fi
  fi
done <<< "$READY_ROWS"

# Also check unhealthy instances for recovery
UNHEALTHY_ROWS=$(db_query "SELECT id, slug FROM instances WHERE status = 'unhealthy' ORDER BY slug" || echo "")

if [ -n "$UNHEALTHY_ROWS" ]; then
  while IFS='|' read -r INSTANCE_ID SLUG; do
    [ -z "$SLUG" ] && continue

    FORGEJO_URL="https://${SLUG}-forgejo.${DOMAIN}"
    HTTP_CODE=$(curl -sSo /dev/null -w "%{http_code}" --max-time 10 -L "$FORGEJO_URL" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
      NOW=$(timestamp)
      db_exec "UPDATE instances SET status = 'ready', last_healthy_at = '${NOW}', updated_at = '${NOW}' WHERE id = '${INSTANCE_ID}'"
      insert_event "$INSTANCE_ID" "health_recovered" "Instance ${SLUG} recovered from unhealthy (HTTP ${HTTP_CODE})"
      echo "[$(timestamp)] Instance ${SLUG} recovered from unhealthy (HTTP ${HTTP_CODE})"
      rm -f "/tmp/health-fail-${SLUG}"
      HEALTHY=$((HEALTHY + 1))
    fi
  done <<< "$UNHEALTHY_ROWS"
fi

echo "[$(timestamp)] Health check complete: ${TOTAL} checked, ${HEALTHY} healthy, ${UNHEALTHY} unreachable"
