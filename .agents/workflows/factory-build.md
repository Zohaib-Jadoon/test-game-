---
description: Execute the approved factory plan using isolated worktrees, pstack engineering rigor, and Ponytail simplicity.
---

# /factory-build

$ARGUMENTS

Use `factory-build`, `poteto-mode`, and `ponytail`.

1. Run `node "%USERPROFILE%\.gemini\factory-home\bin\factory.mjs" run "."`.
2. For `awaiting_agent` tasks, create isolated worktrees (`factory worktree "." --id <id>`), implement minimal complete changes with tests, verify (`factory verify "." --id <id>`), and integrate (`factory integrate "." --id <id>`).
3. Never push, deploy, or build signed APKs without explicit human approval.
