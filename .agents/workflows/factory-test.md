---
description: Run configured project quality gates, secret scans, and measurable verification checks.
---

# /factory-test

$ARGUMENTS

Use `factory-test`.

1. Run `node "%USERPROFILE%\.gemini\factory-home\bin\factory.mjs" verify "."`.
2. Report every gate result (`PASS`, `FAIL`, or `NOT VERIFIED`). Block release if any required check fails or is unconfigured.
