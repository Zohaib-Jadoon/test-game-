# Security & Execution Boundaries (`v1.0.0`)

1. **IDE Protection:** No script, updater, skill scanner rule, or workflow may terminate or restart Antigravity IDE or Cursor IDE processes. Installers and `skills-engine.mjs` never write inside `~/.cursor/skills-cursor/`.
2. **Project Path Jailing (`assertInsideRoot`):** Gate `cwd` values and worktree paths are canonicalized via `realpathSync` and restricted strictly inside repository boundaries.
3. **Non-Overridable Safety Policy (`enforceSafetyPolicy`):** Project `.factory/config.json` cannot disable `human_approval_required: true`, enable `automatic_deployment: true`, or set `allow_outside_root: true`.
4. **Secret, PII & Biometric Filtering (`scanSecrets`, `redactSecrets`, `detectSensitiveMemoryContent`):** Scrubs credentials in logs/DBs and rejects secrets, DB connection passwords, emails, SSNs, payment cards, JWTs, and raw biometric embeddings before storing any memory.
5. **External Skill Security (`inspectSkillSecurity`):** Scans `SKILL.md` and scripts for remote pipe execution, `rm -rf`, IDE kills, credential exfiltration, and prompt injection; verifies SHA-256 digests and requires `--approve` for unallowlisted skills without executing untrusted install scripts.
6. **Safe Windows Subprocess Execution (`safeSpawn`):** Invokes Windows shims cleanly with `shell: false`, avoiding Node `DEP0190`.
7. **Read-Only Local Dashboard:** Binds strictly to `127.0.0.1`, accepts `GET` only (`405` on mutations), sets strict `Content-Security-Policy`, and HTML-escapes dynamic output.
8. **Human Approval & Rollback Integrity:** `approve` requires clean git status, verified `HEAD`, and unchanged config SHA-256. Automatic deployments, pushes, and production DB drops are disabled.
