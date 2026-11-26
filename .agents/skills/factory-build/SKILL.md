---
name: factory-build
description: Execute the approved factory plan using the multi-agent orchestrator, isolated Git worktrees, pstack rigor, Ponytail simplicity, tests, review, and verified evidence.
---

# Build Protocol — Antigravity & Cursor IDE Native

1. Inspect repository state (`git status`, `.factory/config.json`, `factory status "<project>"`) before editing. Never overwrite unrelated repositories or existing data.
2. Run `factory run "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" run "<project>"`) to execute automated planning, architecture, UI/UX, and pre-implementation stages in dependency order.
3. For implementation tasks (`awaiting_agent`), use isolated Git worktrees (`factory worktree "<project>" --id <id>`) and execute inside Antigravity or Cursor with `/poteto-mode` and `/ponytail full`.
4. Implement the smallest complete diff with input validation, authz, error handling, accessible UI, migrations, and unit/integration tests.
5. Verify each worktree with `factory verify "<project>" --id <id>`, integrate clean verified branches via `factory integrate "<project>" --id <id>`, and run `factory review "<project>"`.
6. Never push, merge without verification, deploy, build signed APKs, or run production migrations without explicit human approval.
