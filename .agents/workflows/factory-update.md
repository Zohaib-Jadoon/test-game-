---
description: Safely check, apply, sync, or roll back Myfactory updates without overwriting customizations.
---
# /factory-update

$ARGUMENTS

Use `factory-update` skill.
1. Run `factory update --dry-run` (or `node "$HOME/.gemini/factory-home/bin/factory.mjs" update --dry-run`).
2. Run `factory update --yes` to update managed files and SQLite migrations while backing up and preserving user edits.
3. Run `factory sync "."` to synchronize compatible project files cleanly.
