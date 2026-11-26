# Factory Memory

Durable operational log and verified engineering state for Myfactory (`v1.0.0`).

## 1. Incident Investigation Record (2026-11-19)

**Verified Conclusion:** Prior Antigravity shutdown was triggered by Antigravity Electron AutoUpdater (`v2.32.2` -> `v2.33.0`, `%APPDATA%\Antigravity\logs\main.log`), not any factory script. A secondary UTF-8 BOM bug in local `ponytail/plugin.json` was resolved. All factory installers, updaters, and skills enforce zero IDE process termination (`taskkill`/`Stop-Process` blocked by policy and `skills-engine.mjs`).

---

## 2. Implementation Decisions & Phase Log

- [x] **v0.2.0 Baseline:** SQLite `node:sqlite` WAL store, secret scanning/redaction, `safeSpawn`, path jailing, stack adapters, 14-role DAG orchestrator, read-only dashboard, Antigravity + Cursor dual setup, and automatic pstack/Ponytail installation (`20/20` baseline tests).
- [x] **v1.0 Phase 1 (`ee548f4`):** Added versioned transactional SQLite migrations (`src/migrations.mjs` v1 -> v2, 8 new tables), `src/db.mjs` V1.0 CRUD + `FACTORY_GLOBAL_HOME` isolation, expanded adapters (Prisma, IIS/ASP, Unity, Unreal, Godot, IoT, Biometrics), and 9 reusable project profiles (`src/profiles.mjs`).
- [x] **v1.0 Phase 2 (`eec18e9`):** Built 60 specialist registry (`src/agent-registry.mjs`, 9 categories, 13 attributes, 14-role bidirectional compatibility), generated 180 native Antigravity/Cursor/canonical `.md` adapters, and implemented smart complexity & domain-filtering router (`src/router.mjs`).
- [x] **v1.0 Phase 3 (`8ef3aa5`):** Built 3-level memory engine (`src/memory.mjs`), PII/secret/biometric guards (`detectSensitiveMemoryContent`), failed-task & unverified-assertion blocks, candidate approval gates, conflict overrides, consolidation, AES-256-GCM export/import, and workflow effectiveness reflection (`src/improvement.mjs`). Verified mandatory Project A -> B -> C isolation scenario.
- [x] **v1.0 Phases 4–5 (`dd2d6dc`):** Implemented Context Budget Engine (`src/context-engine.mjs`) with git/config cache invalidation and real byte benchmark harness (`154,737` baseline B -> `3,511` B `FAST` / `25,449` B `DEEP`), plus Skill Discovery, Ranking, Security Audit, and `.factory/skills-lock.json` engine (`src/skills-engine.mjs`, `src/skill-allowlist.json`).
- [x] **v1.0 Phases 6–7 (`4f22d5b`):** Removed hardcoded `C:/Users/CP/` paths from `.agents/workflows/` and `.agents/rules/`, added 5 conditional Antigravity/Cursor rules, authored 10 `eng-*` skills with lazy `references/playbook.md` playbooks, added 4 slash workflows/skills (`factory-{update,learn,skills,deploy}`), and built `src/deployment-advisor.mjs`.
- [x] **v1.0 Phase 8 (`896040d`):** Built `src/updater.mjs` (`updateFactory`, `syncProject`, manifest SHA-256 tracking, dirty Git tree protection, crash-recovery journal, backup + SQLite DB snapshot, auto & manual rollback). Verified mandatory upgrade & simulated rollback scenario.
- [x] **v1.0 Phases 9–10 (`2155467`):** Wired all V1.0 CLI commands (`bin/factory.mjs`), extended dashboard APIs (`/api/{agents,skills,memory,updates,metrics}`) & HTML views, added `installer/install.sh` (Ubuntu/Linux) alongside `Install-Factory.ps1` / `Setup.ps1` `-Offline` & backup support, updated `.github/workflows/factory-tests.yml`, and verified `39/39` tests + Windows sandbox installer smoke checks + `bash -n`.

---

## 3. Known Limitations & `NOT VERIFIED` Items

- Global host directory `~/.gemini/factory-home` remains at prior installation until owner approves running `Setup.ps1 -Scope Global -UpdateFactory` (`doctor` measured `cursor_agents_count: 2` on host vs `60` validated inside repo & sandbox).
- Live Antigravity/Cursor UI dropdown visibility for newly added skills/agents requires manual IDE window reload after host installation (`PENDING MANUAL RESTART`).
- Remote GitHub Actions `ubuntu-latest` / `windows-latest` CI workflow execution for `feat/myfactory-v1.0` awaits owner approval to push.
- Online `npx skills add` live fetch & live LLM API token telemetry (`input_tokens`/`output_tokens`) remain `NOT VERIFIED` / `unavailable` in local offline execution.
