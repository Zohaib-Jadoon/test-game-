---
name: factory-status
description: Inspect persisted SQLite task queue, 14-agent assignments, pipeline stage, quality gate reports, security findings, and blockers for a project.
---

# Factory Status Protocol

1. Run `factory status "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" status "<project>"`) to read live persisted records from SQLite (`factory.db`) and `.factory/`.
2. Report:
   - Detected adapters and active pipeline stage (from `requirements` through `verification`)
   - Task counts (`queued`, `running`, `awaiting_agent`, `completed`, `blocked`, `failed`)
   - Active blockers, failed gates, open critical/high security findings, and pending human approvals
   - Latest verification revision and whether working tree is clean
3. Offer the dashboard command `factory serve "<project>" --port 4177` without assuming or fabricating unobserved metrics.
