# Quality Gates & Verification Policy

## Truthful Gate States

Every check executed by `factory verify` or `factory release` produces one of three explicit states:

- **PASS:** Command executed cleanly (exit code `0`) against current checkout.
- **FAIL:** Command returned non-zero exit code, security finding detected, or invalid configuration.
- **NOT VERIFIED:** Required check is unconfigured (`required_checks: []`) or target binary is absent (`ENOENT`).

Any `FAIL` or `NOT VERIFIED` result marks overall verification `ok: false` and sets release status to **BLOCKED**.

## Standard Gate Checklist

| Gate | How Evaluated | Blocking Behavior |
|---|---|---|
| `tracked-secret-files` | Inspects Git index / workspace filenames (`.env`, `*.pem`, `*.key`, `id_rsa`, etc.) | Blocks on any match (excluding `.env.example` / `.sample`) |
| `secret-content-scan` | Scans text files (<= 512 KB) for tokens, private keys, DB password URIs | Blocks on any match; scrubs output before logging |
| `required-checks-configured` | Verifies `.factory/config.json` has >= 1 explicit check | Blocks empty checklists (`NOT VERIFIED`) |
| `lint` / `typecheck` / `test` / `build` | Runs configured stack commands in jailed `cwd` with `CI=true` | Blocks on non-zero exit or missing binary |
| `git diff --check` | Runs inside Code Review Agent | Blocks on conflict markers or whitespace corruption |
| `npm audit --omit=dev` | Runs when `package-lock.json` is present | Blocks on critical/high vulnerabilities; `NOT VERIFIED` if no lockfile |

## Measurable Quality Metrics

Recorded per `gate_runs` row in SQLite:
- `total_gates`, `passed_gates`, `failed_gates`, `not_verified_gates`
- `gate_pass_rate` (`(passed_gates / total_gates) * 100`)
- `secret_findings`, `files_scanned`
- Revision SHA (`HEAD`), dirty-tree flag, and `config_hash` (SHA-256 of `.factory/config.json`).

**Reliability Disclaimer:** A 100% gate pass rate proves only that the configured local checks passed on that exact revision and environment. Production reliability targets (90%–99.99%) require observed staging/production SLO telemetry, load testing, and real incident monitoring.

