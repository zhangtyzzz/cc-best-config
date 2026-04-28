#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLUGIN_DIR="$ROOT_DIR/plugins/work-toolkit"
BRIDGE_DIR="$PLUGIN_DIR/skills/agent-task/scripts/bridge"
RUN_E2E=0

if [[ "${1:-}" == "--e2e" ]]; then
  RUN_E2E=1
fi

log() {
  printf '\n==> %s\n' "$1"
}

require_file() {
  if [[ ! -f "$1" ]]; then
    printf 'Missing required file: %s\n' "$1" >&2
    exit 1
  fi
}

require_absent_dir() {
  if [[ -d "$1" ]]; then
    printf 'Directory should not exist: %s\n' "$1" >&2
    exit 1
  fi
}

json_value() {
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const path=process.argv[2].split("."); let cur=data; for (const key of path) cur=cur?.[key]; if (cur == null) process.exit(1); process.stdout.write(String(cur));' "$1" "$2"
}

log "Validate marketplace manifest"
claude plugin validate "$ROOT_DIR"

log "Validate work-toolkit plugin manifest"
claude plugin validate "$PLUGIN_DIR"

log "Check required files"
require_file "$PLUGIN_DIR/skills/agent-task/SKILL.md"
require_file "$BRIDGE_DIR/bridge.js"
require_file "$BRIDGE_DIR/config.js"
require_file "$BRIDGE_DIR/router.js"
require_file "$BRIDGE_DIR/state.js"
require_file "$BRIDGE_DIR/package.json"
require_file "$BRIDGE_DIR/adapters/base.js"
require_file "$BRIDGE_DIR/adapters/codex.js"
require_file "$BRIDGE_DIR/adapters/opencode.js"
require_file "$BRIDGE_DIR/adapters/qoder.js"
require_file "$PLUGIN_DIR/hooks/agent-cli-context.sh"
require_absent_dir "$PLUGIN_DIR/skills/cli-agents"

log "Run vendored bridge smoke checks"
node "$BRIDGE_DIR/bridge.js" --task list >/dev/null
node "$BRIDGE_DIR/bridge.js" --task health >/dev/null

log "Run hook smoke check"
"$PLUGIN_DIR/hooks/agent-cli-context.sh" >/dev/null

log "Check stale cli-agents references"
if command -v rg >/dev/null 2>&1; then
  stale=$(rg -n "cli-agents" "$ROOT_DIR/README.md" "$ROOT_DIR/README_CN.md" "$ROOT_DIR/CLAUDE.md" "$PLUGIN_DIR/skills" || true)
else
  stale=$(grep -RIn "cli-agents" "$ROOT_DIR/README.md" "$ROOT_DIR/README_CN.md" "$ROOT_DIR/CLAUDE.md" "$PLUGIN_DIR/skills" 2>/dev/null || true)
fi
if [[ -n "$stale" ]]; then
  allowed=$(printf '%s\n' "$stale" | awk '
    /skills\/agent-task\/SKILL.md/ { next }
    /README.*replaces the old `cli-agents` workflow/ { next }
    /README.*old `cli-agents` directory/ { next }
    /README.*stale `cli-agents` reference scan/ { next }
    /README_CN.*替代旧的 `cli-agents` 工作流/ { next }
    /README_CN.*旧 `cli-agents` 目录/ { next }
    /README_CN.*`cli-agents` 旧引用/ { next }
    { print }
  ')
  if [[ -n "$allowed" ]]; then
    printf 'Unexpected stale cli-agents references:\n%s\n' "$allowed" >&2
    exit 1
  fi
fi

if [[ "$RUN_E2E" -eq 1 ]]; then
  log "Run local marketplace install E2E"
  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/cc-best-config-marketplace.XXXXXX")
  marketplace_name="cc-best-config-local-$(date +%s)-$$"
  plugin_version=$(json_value "$PLUGIN_DIR/.claude-plugin/plugin.json" version)

  cleanup() {
    claude plugin uninstall --scope local "work-toolkit@$marketplace_name" >/dev/null 2>&1 || true
    claude plugin marketplace remove "$marketplace_name" >/dev/null 2>&1 || true
    rm -rf "$tmp_dir"
  }
  trap cleanup EXIT

  mkdir -p "$tmp_dir/.claude-plugin" "$tmp_dir/plugins"
  cp -R "$PLUGIN_DIR" "$tmp_dir/plugins/work-toolkit"
  node -e 'const fs=require("fs"); const [out,name]=process.argv.slice(1); fs.writeFileSync(out, JSON.stringify({name, owner:{name:"local"}, metadata:{description:"Temporary local marketplace for work-toolkit verification"}, plugins:[{name:"work-toolkit", description:"Curated skills, hooks, and rules for productive AI-assisted daily work", source:"./plugins/work-toolkit", category:"productivity"}]}, null, 2) + "\n");' "$tmp_dir/.claude-plugin/marketplace.json" "$marketplace_name"

  claude plugin validate "$tmp_dir"
  claude plugin marketplace add --scope local "$tmp_dir" >/dev/null
  claude plugin install --scope local "work-toolkit@$marketplace_name" >/dev/null

  install_info=$(claude plugin list --json)
  install_path=$(node -e 'const id=process.argv[1]; const expected=process.argv[2]; let found=false; for (const p of JSON.parse(require("fs").readFileSync(0,"utf8"))) { if (p.id === id) { found=true; if (p.version !== expected) { console.error(`Expected ${expected}, got ${p.version}`); process.exit(2); } process.stdout.write(p.installPath); } } if (!found) process.exit(1);' "work-toolkit@$marketplace_name" "$plugin_version" <<< "$install_info")

  require_file "$install_path/skills/agent-task/SKILL.md"
  require_file "$install_path/skills/agent-task/scripts/bridge/bridge.js"
  require_file "$install_path/hooks/agent-cli-context.sh"
  require_absent_dir "$install_path/skills/cli-agents"

  node "$install_path/skills/agent-task/scripts/bridge/bridge.js" --task list >/dev/null
  node "$install_path/skills/agent-task/scripts/bridge/bridge.js" --task health >/dev/null
  "$install_path/hooks/agent-cli-context.sh" >/dev/null
fi

log "Verification passed"
