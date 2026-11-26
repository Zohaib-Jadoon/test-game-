---
name: factory-learn
description: Extract verified engineering lessons, review candidate preferences, manage 3-level factory memory, and generate reflection proposals.
---
# Factory Learning & Memory Protocol

1. Record task or feedback lessons safely: `factory learn "." --task <id>` or `factory learn "." --from-feedback --statement "..." --category ui-ux`.
2. Distinguish explicit preferences (`--explicit`) from inferred candidate lessons; review and approve before global promotion: `factory memory review` / `factory memory approve --id <mem-id>`.
3. Search, consolidate, export (with optional `--passphrase`), or disable/delete memories via `factory memory <subcommand>`.
4. Never store credentials, tokens, connection strings, PII, or raw biometric templates in memory.
5. Analyze workflow effectiveness with `factory reflect "."`.
