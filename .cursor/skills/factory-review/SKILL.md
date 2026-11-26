---
name: factory-review
description: Run independent code quality, architecture, Ponytail simplicity, and security reviews against current changes.
---

# Factory Review Protocol

1. Run `factory review "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" review "<project>"`) to execute the Security Agent secret/dependency audit and Code Review Agent diff hygiene checks, persisting findings to SQLite.
2. Apply `/poteto-mode` (`unslop`, `no-comments`, `deslop`, `principle-minimize-reader-load`) and `/ponytail review` to inspect modified code for unnecessary abstractions, duplicated logic, weak boundary validation, or missing tests.
3. Verify acceptance criteria coverage against `docs/factory/PRD.md` or the task `.md` brief.
4. Report concrete findings with severity, file paths, and required fixes. Block approval if critical/high security or correctness findings remain open.
