---
name: factory-security
description: Audit authorization, secrets, supply-chain, data handling, input validation, and operational safety before a software release.
---

# Security review protocol

1. Inventory trust boundaries, roles, third-party dependencies, exposed routes and sensitive data.
2. Prioritize authn/authz bypass, tenant isolation, SQL/command injection, XSS/CSRF, SSRF, unsafe deserialization, rate limiting, replay, leaked tokens, server-side secret exposure and audit trails.
3. Test unauthorized access with a non-privileged account; for sensitive biometrics, enforce consent, encryption, access controls, retention policy, device trust and liveness/anti-spoof testing.
4. Run `factory review "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" review "<project>"`). The built-in scanner checks tracked secret filenames, workspace file contents, and `npm audit` (when `package-lock.json` is present); pair with reputable ecosystem scanners before production releases. Avoid executing untrusted package scripts outside a sandbox.
5. Report findings with severity, evidence, reproduction, scope and verification after fix. Never reveal live credentials or tokens in report.
6. No deployment if unresolved critical/high findings without documented, explicit exception approval.
