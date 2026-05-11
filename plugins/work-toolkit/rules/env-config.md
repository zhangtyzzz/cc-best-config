---
name: env-config
description: Unified environment variable loading and initialization convention for all skills in this plugin.
---

# Environment Variable Convention

## Loading Priority (highest wins)

1. **`process.env`** — set via Claude Code `settings.json` `env` field or shell environment
2. **`{skillDir}/.env`** — skill's own directory (inside plugin cache, lost on update)
3. **`<cwd>/.env`** — current working directory
4. **`~/.cc-best-config/.env`** — user-level persistent config (survives plugin updates)

All `.env` files are loaded with `override=False` so earlier sources always take precedence.

## Initialization: Where to Write

When a skill needs to collect API keys or config from the user for the first time:

1. **Always write to `~/.cc-best-config/.env`** — this is the persistent location that survives plugin updates.
2. If the file already exists, read it first and only append/update the mentioned fields.
3. Create `~/.cc-best-config/` directory if it does not exist.
4. Only show the first 8 characters of API keys when confirming with the user.
5. **Never write to `{skillDir}/.env`** in the plugin cache — it will be lost on the next plugin update.

## Why Not `{skillDir}/.env`?

Plugin updates replace the entire cache directory (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`). Any `.env` written inside it is deleted when the user runs `claude plugin update`. The `~/.cc-best-config/.env` path is outside the cache and fully controlled by the user.
