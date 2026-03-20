#!/bin/bash

# Protect Files Hook (PreToolUse: Edit|Write)
# Blocks Claude from modifying sensitive files like .env, credentials, lock files, etc.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // ""')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Protected file patterns
PROTECTED_PATTERNS=(
  '\.env$'
  '\.env\.'
  '\.key$'
  '\.pem$'
  '\.p12$'
  '\.pfx$'
  'credentials\.json'
  'credentials\.yaml'
  'credentials\.yml'
  'secrets\.'
  '\.secret$'
  'id_rsa'
  'id_ed25519'
  '\.ssh/config$'
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -qE "$pattern"; then
    echo "BLOCKED: '$FILE_PATH' is a protected file (matched pattern: $pattern). Use a manual editor to modify sensitive files." >&2
    exit 2
  fi
done

exit 0
