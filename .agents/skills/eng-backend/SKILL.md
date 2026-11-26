---
name: eng-backend
description: Backend service standards covering REST contracts, DTO validation, RBAC, multi-tenancy, transactions, idempotency, retries, and auditing.
---
# Engineering Standards — Backend

Load `references/playbook.md` when designing NestJS/Node/Python/.NET APIs, auth/RBAC, multi-tenant isolation, or transactional workflows.

## Core Checklist
1. Validate every inbound param, query, and body with strict schemas; reject unknown fields cleanly (`400`/`422`).
2. Enforce authentication AND object-level authorization (RBAC + tenant ID scoping) on every handler.
3. Wrap multi-write mutations in database transactions and protect retries/webhooks with idempotency keys.
4. Emit structured redacted logs (never tokens/passwords/PII) and immutable security/audit trail events.
