# Database Engineering Playbook

## 1. PostgreSQL, Neon & Prisma Patterns
- Use `prisma migrate deploy` in production/CI; never run `prisma db push --force-reset` against live databases.
- Configure Neon/serverless connection pooling (`pgbouncer` / direct URL for migrations) and avoid connection exhaustion under serverless concurrency.
- Use parameterized queries or Prisma/ORM bindings everywhere; prohibit string-concatenated SQL.
- Official docs: https://www.prisma.io/docs & https://www.postgresql.org/docs/

## 2. Microsoft SQL Server & T-SQL Legacy Preservation
- Guard `ALTER TABLE` / stored procedure updates with idempotent existence checks, explicit transactions (`SET XACT_ABORT ON`), and `TRY...CATCH` rollback.
- Preserve existing legacy views/procedures depended upon by Classic ASP or ERP reports; bridge incrementally via versioned views/procedures.
- Inspect execution plans for table scans and parameter sniffing before adding hints.

## 3. Integrity Testing & Backups
- Verify constraints reject invalid states, duplicate keys, and cross-tenant orphan writes.
- Require verified backup/snapshot instructions and reversible downgrade/restore procedures before any schema migration receives approval.
- Store only connection variable names (`DATABASE_URL`, `SHADOW_DATABASE_URL`) in `.env.example`.
