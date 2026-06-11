---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.
license: MIT
metadata:
  author: supabase
  version: "1.0.0"
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
rules/query-missing-indexes.md
rules/schema-partial-indexes.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`

---

## 2025–2026 Updates (verified June 2026)
- **Supavisor replaced PgBouncer** as the default pooler on all projects: transaction mode (port 6543) for serverless/app traffic; **session mode (5432)** for migrations, `CREATE INDEX`, advisory locks, LISTEN/NOTIFY.
- **RLS auto-enables on every new table (2025+)** via a ddl_command_end trigger — including tables created by Prisma/Drizzle migrations. Secure-by-default consequence: **table with RLS and no policy returns zero rows**. Every migration that creates a table must ship its policies in the same migration; test as anon + authed roles.
- RLS performance patterns: wrap `auth.uid()` in a scalar subquery (`(select auth.uid())`) so it evaluates once; index every column used in policies; prefer security-definer helper functions for complex role logic.
- **pgvector 0.7+**: up to 16,000 dims; **HNSW is the default index** (parallel builds since 0.6.x; up to ~30x faster on unlogged build tables); keep HNSW in RAM; store text + embedding in one row for hybrid search; tune `lists`/`probes` only if using IVFFlat.
- Postgres 17 platform: `pg_cron` scheduling, pgmq/pg-boss queues, and PostGIS in-database before reaching for external infra.
