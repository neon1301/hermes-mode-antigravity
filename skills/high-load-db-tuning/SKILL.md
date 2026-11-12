---
name: high-load-db-tuning
description: Multi-engine production database architecture, lock contention elimination, high-throughput ingestion, query optimization, safe zero-downtime migrations, and connection pool hygiene across SQLite, PostgreSQL, MSSQL, MySQL/InnoDB, Redis, MongoDB, ClickHouse, and DuckDB. Use when solving 'database is locked', deadlocks, MVCC bloat, slow query plans, schema design, or tuning pools.
---

# High-Load Multi-Engine Database Architecture & Tuning Skill

This skill guides database engineers (**🗄️ Denis** and **💻 Dmitry**) when designing schemas, eliminating lock contention, tuning slow queries, or scaling high-throughput workloads across **any** relational or embedded DBMS.

---

## 1. Engine Discovery & Preflight Triage

Before recommending PRAGMAs, indexes, or SQL rewrites:
1. **Identify Exact Engine & Stack:** Check database engine and version (SQLite/libSQL, PostgreSQL/Timescale/Supabase/Neon, MSSQL/Azure SQL, MySQL/MariaDB/InnoDB, Redis/Valkey, MongoDB, ClickHouse/DuckDB), driver/ORM (`Microsoft.Data.Sqlite`, `Npgsql`, `SqlClient`, `Dapper`, `EF Core`, `Prisma`, `Drizzle`, `SQLAlchemy`, `psycopg`, `mysql2`, `rusqlite`, `StackExchange.Redis`, Mongo driver), pooler (`PgBouncer`, ADO.NET pool), and storage topology (local SSD vs. network share UNC/SMB vs. serverless).
2. **Enforce Zero-Hardcode Configuration (Hermes Rule 9):** Discover the project's native configuration provider (`.env`, `appsettings.json`, `.ini`, `config.yaml`, settings service). Never embed literal DB hosts, credentials, ports, absolute filesystem paths, or magic timeout numbers in source code.
3. **Inspect Live Telemetry Read-Only First:** When querying a live staging/production DB for diagnostics (`EXPLAIN`, DMVs, `pg_stat_*`, `performance_schema`), restrict statements to read-only single queries with explicit timeouts (`CommandTimeout`/`statement_timeout`) and `LIMIT`/`TOP` caps; mask credentials in logs.

---

## 2. Progressive Engine Routing Matrix

Read ONLY the reference playbook matching the target DBMS and task:

| Engine / Problem Scope | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **SQLite / libSQL / Turso / `.db`** | [references/sqlite-concurrency.md](references/sqlite-concurrency.md) | `WAL + busy_timeout + BEGIN IMMEDIATE` (fix `DEFERRED` upgrade deadlock), UNC/SMB `DELETE` fallback, `-wal` checkpoint hygiene, `STRICT` tables, Single-Writer queue + Read Pool, `.NET Microsoft.Data.Sqlite` pitfalls, `EXPLAIN QUERY PLAN` |
| **PostgreSQL / Supabase / Neon / `pgvector`** | [references/postgres-mvcc-tuning.md](references/postgres-mvcc-tuning.md) | 8-layer priority ladder, B-tree / `INCLUDE` / Partial / `GIN` / `BRIN` / `HNSW` indexes, MVCC bloat & autovacuum tuning, `xmin horizon`, PgBouncer Transaction vs. Session mode, `ON CONFLICT`, `SKIP LOCKED`, `(SELECT auth.uid())` RLS caching, `EXPLAIN (ANALYZE, BUFFERS)` |
| **Microsoft SQL Server (MSSQL / T-SQL)** | [references/mssql-concurrency-dmv.md](references/mssql-concurrency-dmv.md) | RCSI (`READ_COMMITTED_SNAPSHOT`) vs. `NOLOCK`, chunked DML lock-escalation defense, deadlock `1205` jitter retries, read-only wait-stats & blocking DMVs, `CONVERT_IMPLICIT` & parameter sniffing, covering `INCLUDE` indexes, `SqlBulkCopy`/TVPs |
| **MySQL / MariaDB / InnoDB / Vitess** | [references/mysql-innodb-tuning.md](references/mysql-innodb-tuning.md) | Monotonic clustered PK rules (`BIGINT UNSIGNED` / `UUIDv7`, no random `UUIDv4` PK), `utf8mb4` & `DATETIME(6)`, leftmost prefix + range-stop indexing, InnoDB Gap/Next-Key locks, `performance_schema` dead index pruning, Online DDL (`INSTANT`/`gh-ost`) |
| **NoSQL, Cache & OLAP (Redis, MongoDB, ClickHouse, DuckDB)** | [references/nosql-olap-caching.md](references/nosql-olap-caching.md) | Redis multiplexer/eviction/`SCAN`/Lua atomicity, MongoDB ESR index rule & bounded documents, ClickHouse `MergeTree` bulk batches & sparse `ORDER BY`, DuckDB vectorized memory bounds |
| **Query Tuning, Batching & Migrations (All DBs)** | [references/query-migration-patterns.md](references/query-migration-patterns.md) | SARGability rewrites, Keyset/Cursor pagination vs. `OFFSET`, N+1 elimination, `NOT EXISTS` vs. `NOT IN (NULL)`, Producer-Consumer micro-batching (`Channel<T>`/bulk copy), chunked retention, Expand-and-Contract zero-downtime migrations |

---

## 3. Universal DBA Non-Negotiables (All Engines)

1. **Verify Execution Plans Before Merge:** Flag unindexed scans (`SCAN TABLE` / `Seq Scan` / `type = ALL` / `Table Scan`) on growing tables (>10k rows) or `USE TEMP B-TREE` / `Using filesort` on hot paths.
2. **Enforce SARGability & Clean Projections:** Never wrap indexed columns in SQL functions inside `WHERE`, avoid leading `%` wildcards for B-tree lookups, ban `SELECT *` in service paths, and match parameter types/collations strictly.
3. **Never Execute Single-Row Inserts in Hot Loops:** Buffer high-frequency streams (machine telemetry, IoT, audit events, webhooks) into bounded producer-consumer micro-batches inside short atomic transactions.
4. **Never Hold Transactions Across Network I/O:** Complete HTTP, SAP RFC/GUI, socket, or LLM calls *outside* open database transactions so locks, MVCC snapshots (`xmin`), and SQLite `-wal` frames release immediately.
5. **Keyset Pagination & Safe Counts:** Replace deep `OFFSET` queries with deterministic Keyset/Seek cursors `(sort_col, id)` and use capped or metadata counts instead of unguarded `COUNT(*)` on multi-million-row tables.
6. **Plan Connection Pools Explicitly:** Match app pool ceilings to DB capacity, enforce idle/statement/lock timeouts, dispose connections deterministically, and keep DDL (`CONCURRENTLY`/online) non-blocking.

---

## 4. Verification & Fleet Sign-Off Gate

Before marking any database task complete:
1. Run or inspect the execution plan (`EXPLAIN QUERY PLAN` / `EXPLAIN (ANALYZE, BUFFERS)` / Actual Execution Plan / `EXPLAIN ANALYZE`) for every added or modified query.
2. Confirm explicit disposal, parameterized SQL (zero string concatenation), and Zero-Hardcode configuration binding.
3. Run concurrency stress checks when modifying locking, retry policies, batch ingestion, or pragmas.
4. Persist key schema contracts, index rationale, and connection pool parameters in `.hermes/memory/denis.md` when working in Hermes sprints, then submit to **🛡️ Viktor** (`[QA PASS]`) and **⚖️ Stanislav** (`[COMPLIANCE PASS]`).
