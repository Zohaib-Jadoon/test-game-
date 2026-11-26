---
name: factory-release
description: Prepare an auditable release candidate from verified SQLite gate evidence, rollback plan, and human approval. Never silently deploys.
---

# Release Protocol

1. Run `factory release "<project>" --version "<semver-rc>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" release "<project>" --version "<semver-rc>"`) to execute fresh quality gates, secret scans, and dirty-tree checks on current HEAD.
2. If any gate fails, returns `NOT VERIFIED`, working tree is dirty, or critical/high security findings remain open, release status is **BLOCKED**.
3. Verify `.env.example` contains variable NAMES only, rollback instructions exist in `docs/factory/RUNBOOK.md`, and release notes match observed checks.
4. Record explicit human approval with `factory approve "<project>" --id <taskId> --by "<Owner>" [--release <releaseId>]`.
5. Never trigger automatic deployment, GitHub Actions pushes, or mobile APK builds without explicit owner authorization.
