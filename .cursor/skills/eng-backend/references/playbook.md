# Backend Engineering Playbook

## 1. REST Contracts & DTO Validation
- Validate payloads at controller/router boundaries (`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, Zod, or Pydantic).
- Return consistent HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`) and non-leaking error shapes in production.
- Paginate list endpoints cleanly with hard max page-size caps.

## 2. RBAC & Multi-Tenancy
- Derive `tenantId` and `actorId` exclusively from verified auth context (JWT/session), never trusting client-supplied tenant IDs.
- Apply fail-closed authorization guards (`default deny`) and unit-test cross-tenant access denial (`403` / `404`).

## 3. Transactions, Idempotency & Retries
- Execute ledger, attendance/payroll, or state-changing multi-table operations inside atomic DB transactions.
- Require idempotency keys on payment webhooks, offline mobile sync uploads, and GPS telemetry ingestion to tolerate duplicate deliveries safely.
- Set explicit timeouts and bounded exponential backoff with jitter on external HTTP calls; avoid heavy job queues unless real async volume justifies them.

## 4. Auditing & Observability
- Record who/what/when/outcome audit rows for privilege changes, approvals, financial mutations, and clinical records.
- Expose lightweight `/health` checks verifying process and database readiness without leaking internals.
- Official NestJS docs: https://docs.nestjs.com/
