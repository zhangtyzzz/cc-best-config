#!/usr/bin/env bash
set -u

agents=(codex opencode qodercli)
available=()
missing=()

for agent in "${agents[@]}"; do
  if command -v "$agent" >/dev/null 2>&1; then
    available+=("$agent")
  else
    missing+=("$agent")
  fi
done

join_by() {
  local IFS=", "
  echo "$*"
}

available_text="none"
missing_text="none"

if [ ${#available[@]} -gt 0 ]; then
  available_text=$(join_by "${available[@]}")
fi

if [ ${#missing[@]} -gt 0 ]; then
  missing_text=$(join_by "${missing[@]}")
fi

printf 'Available external CLI agents: %s. Missing: %s.\n' "$available_text" "$missing_text"
