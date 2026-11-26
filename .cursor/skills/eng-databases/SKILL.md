---
name: eng-databases
description: Database engineering standards for PostgreSQL, Neon, Prisma, SQLite, and Microsoft SQL Server T-SQL migrations, indexing, and integrity tests.
---
# Engineering Standards — Databases

Load `references/playbook.md` when designing schemas, writing SQL/Prisma migrations, tuning queries, or working on SQL Server / Postgres systems.

## Core Checklist
1. Enforce referential integrity (`FOREIGN KEY`), uniqueness, and `NOT NULL` constraints at the database layer.
2. Add indexes aligned with real filter/sort predicates (`WHERE tenant_id = ? AND created_at DESC`), avoiding blind index bloat.
3. Make migrations backward-compatible (expand-and-contract) with verified rollback plans and backup checkpoints.
4. Test migrations and query behavior against isolated SQLite/Postgres/MSSQL instances, never destructive commands against production.
