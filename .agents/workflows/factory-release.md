---
description: Prepare and validate an auditable release candidate requiring explicit human approval.
---

# /factory-release

$ARGUMENTS

Use `factory-release`.

1. Run `node "%USERPROFILE%\.gemini\factory-home\bin\factory.mjs" release "." --version "${ARGUMENTS:-0.1.0-rc.1}"`.
2. If blocked, report exact failed/unverified checks. If verified, request explicit human `approve` command execution; never auto-deploy.
