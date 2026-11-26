---
name: factory-update
description: Safely check, dry-run, apply, or roll back factory installation updates and synchronize project-managed IDE adapters.
---
# Factory Update & Sync Protocol

1. Check update availability safely first: `factory update --check` and `factory update --dry-run`.
2. Apply update preserving user-customized rules, skills, memories, and dirty Git working trees: `factory update --yes`.
3. Propagate compatible updated managed skills/agents/rules to an existing repo safely: `factory sync "."` (or `--dry-run` first).
4. Roll back immediately if any check fails: `factory update --rollback`. Never close or restart Antigravity or Cursor IDE.
