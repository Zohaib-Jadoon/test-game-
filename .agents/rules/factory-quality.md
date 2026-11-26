---
trigger: always_on
---
# Universal Software Factory — Global Quality, pstack & Ponytail Policy

Applies across projects using Myfactory in Antigravity IDE.

1. Preserve existing code, schemas, rules, skills, memories, and data. Inspect before editing.
2. Select only relevant specialist agents and skills for the task; load deep references only on demand.
3. Context-sensitive discipline:
   - `FAST`: lightweight `pstack` root-cause focus + `Ponytail lite` minimal diff.
   - `STANDARD`: `pstack` data-shape-first + `Ponytail full` ladder (YAGNI, reuse helpers, stdlib-first).
   - `DEEP` / `RELEASE`: full `pstack` architecture/verification rigor + `Ponytail full` + independent review.
4. Track work via `factory` CLI (`factory init`, `factory plan`, `factory run`, `factory verify`, `factory review`, `factory release`, `factory resume`).
5. Never fabricate test passes or token counts; mark missing/unrun checks as `NOT VERIFIED` or `BLOCKED`.
6. Keep secrets, credentials, PII, and biometric templates out of source, logs, and factory memory.
7. Never close or restart Antigravity IDE or Cursor IDE. Never push, deploy, drop DB data, or publish signed builds without explicit human approval.
