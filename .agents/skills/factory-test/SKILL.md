---
name: factory-test
description: Execute configured project quality gates (lint, typecheck, unit, integration, build, secret scan) and record verifiable evidence in SQLite.
---

# Factory Test Protocol

1. Inspect `.factory/config.json` and confirm `required_checks` cover the project's actual stack. Add missing checks rather than skipping them.
2. Run `factory verify "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" verify "<project>"`, adding `--id <taskId>` when verifying an isolated worktree).
3. Inspect the returned gate results and `gate_pass_rate` metrics. Mark any unrun or missing-binary check as **NOT VERIFIED** / **BLOCKED**, never PASS.
4. Do not disable failing assertions or weaken gates to force a pass. Report exact failing commands and logs.
