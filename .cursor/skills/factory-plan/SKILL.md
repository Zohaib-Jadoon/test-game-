---
name: factory-plan
description: Plan a new application or change with measurable acceptance criteria, risk review, architecture, 14-agent DAG tasks, and verification gates.
---

# Planning Protocol

1. Read the user's requirements and inspect relevant repository files, `.factory/config.json`, and tests. State unknowns without blocking sensible defaults.
2. Ensure project initialization (`factory init "<project>"`, or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" init "<project>"`) and run `factory plan "<project>" --goal "<requirements>"` to generate the SQLite pipeline and DAG task graph.
3. Capture PRD (`docs/factory/PRD.md`), architecture (`docs/factory/ARCHITECTURE.md`), API/database contracts, threat model, accessibility, and measurable SLO/quality targets.
4. Apply `/poteto-mode` (`architect` / `principle-foundational-thinking`) for complex boundaries and `/ponytail full` to eliminate speculative abstractions.
5. Assign independent tasks to isolated Git worktrees (`factory worktree "<project>" --id <taskId>`). Order database migrations ahead of dependent backend/frontend tasks.
6. Never label an unverified plan or app production-ready.
