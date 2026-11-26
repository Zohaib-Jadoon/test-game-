---
name: factory-verify
description: Run the factory quality gates for a project or branch, gather test/build/security evidence, and block release claims when checks are missing or fail.
---

# Verification protocol

1. Inspect `.factory/config.json` and compare configured checks against the actual tech stack: lint, typecheck, unit, integration, E2E, build, migrations, security scanning, dependency audit, performance, a11y, deployment smoke tests. Add missing appropriate gates with explicit commands; do not silently weaken checks.
2. Run `factory verify "<project>" --id <taskid>` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" verify "<project>" --id <taskid>`, omitting `--id` for project-level checks). This executes required checks and writes a JSON + SQLite report.
3. Check `git diff --check`, recent test coverage, error handling, auth/authorization, data migration safety, secrets, dependency vulnerabilities, and untrusted input paths. The built-in secret gate scans tracked filenames and workspace file contents (up to 512 KB per text file); pair with an external secret scanner before production releases.
4. Inspect user flows in the running UI (including mobile/physical hardware if relevant). Label anything that cannot be tested as PENDING MANUAL VERIFICATION, not PASS.
5. Any omitted obligatory gate, failed command, unverified high-risk change or stale run => BLOCKED. Give exact failures and proposed fixes.
6. An observed pass is valid only for the revision/environment tested. No 90%/99.99% correctness claim without a defined benchmark, adequate sample size and measured operations.
