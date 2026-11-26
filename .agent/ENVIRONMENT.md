# Environment Configuration (`v1.0.0`)

Store only environment variable **NAMES** in documentation and `.env.example` files. Never store live secret values in source control, SQLite logs, factory memory, or Markdown files.

## Core Factory Variables

| Variable Name | Default | Purpose |
|---|---|---|
| `FACTORY_GLOBAL_HOME` | `~/.gemini/factory` | Base directory for SQLite control plane, global memory, and update backups |
| `FACTORY_DB_PATH` | `~/.gemini/factory/factory.db` | Optional override for SQLite orchestration database path |
| `FACTORY_GLOBAL_MEMORY_DB` | `~/.gemini/factory/memory/global-memory.db` | Optional override for Global Factory Memory SQLite path |
| `FACTORY_SKIP_EXTERNAL` | unset (`"1"` disables) | Skip upstream GitHub external skill auto-install during `factory init` |
| `FACTORY_TEST_USERPROFILE` | unset | Sandbox home directory override for non-destructive installer smoke testing |
| `CI` | `true` | Forced during `factory verify` quality gate execution |

## Optional External Provider CLI Keys

Only needed if invoking external CLI tools outside Antigravity / Cursor sessions:

- `ANTHROPIC_API_KEY` — Claude Code CLI (`claude`)
- `OPENAI_API_KEY` — OpenAI Codex CLI (`codex`)
- `GEMINI_API_KEY` — Gemini CLI (`gemini`)
