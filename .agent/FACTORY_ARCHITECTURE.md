# Factory Architecture (`v1.0.0`)

Myfactory is a modular, zero-dependency Node.js (`>=22.5`) software engineering factory using built-in `node:sqlite` (WAL mode), isolated Git worktrees, and progressive Antigravity + Cursor IDE integration.

## System Modules

```text
CLI & Entrypoint (bin/factory.mjs)
  ├── Core Persistence & Versioned Migrations (src/db.mjs, src/migrations.mjs -> schema v2)
  ├── Project Stack Adapters & Profiles (src/adapters.mjs, src/profiles.mjs -> Profiles A-H + Desktop)
  ├── Specialist Registry & Native IDE Adapters (src/agent-registry.mjs -> 60 agents, 9 categories)
  ├── Smart Agent Router (src/router.mjs -> FAST/STANDARD/DEEP/RELEASE)
  ├── Security & Boundary Guard (src/security.mjs -> secret/PII/biometric filters, path jail, safeSpawn)
  ├── 3-Level Memory & Learning Engine (src/memory.mjs, src/improvement.mjs)
  ├── Context Budget Engine (src/context-engine.mjs -> cache invalidation + byte benchmarks)
  ├── Skill Discovery & Security Scanner (src/skills-engine.mjs, src/skill-allowlist.json)
  ├── 14-Role Legacy Execution Engine & DAG Orchestrator (src/agents.mjs, src/orchestrator.mjs)
  ├── Quality Gates & Release Verifier (src/gates.mjs -> PASS/FAIL/NOT VERIFIED)
  ├── Deployment Advisor (src/deployment-advisor.mjs)
  ├── Safe Updater & Project Sync (src/updater.mjs -> manifests, backups, auto-rollback)
  ├── Read-Only Control Room Dashboard (src/dashboard.mjs -> 127.0.0.1:4177)
  └── Cross-Platform Installers (installer/Setup.ps1, Install-Factory.ps1, install.sh)
```

## SQLite Persistence Schema (`v2`, 19 Application Tables + `schema_migrations`)

- **v1 Core (`11`):** `projects`, `pipelines`, `tasks`, `task_history`, `execution_logs`, `gate_runs`, `security_findings`, `review_findings`, `releases`, `approvals`, `agent_runs`.
- **v2 Additions (`8`):** `memories`, `project_profiles`, `skill_registry`, `routing_decisions`, `context_metrics`, `update_history`, `improvement_proposals`, `deployment_advice`.

## Parallel Execution & Compatibility Layers

- Legacy 14 roles (`src/agents.mjs`) remain intact and map cleanly to V1.0 specialists via `LEGACY_TO_SPECIALIST_MAP`.
- Concurrent code-modifying tasks use dedicated worktrees under `.factory/worktrees/<id>` on branch `factory/<id>` and require passing `verify` + clean `HEAD` before `integrate` or `approve`.
