#!/bin/bash
# Gate: run typecheck before any git commit
COMMAND=$(cat | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '^git commit'; then
  if ! npm run typecheck 2>&1; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"TypeScript errors found. Fix them before committing."}}'
    exit 0
  fi
fi

exit 0
