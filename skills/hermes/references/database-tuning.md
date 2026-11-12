# 🗄️ Multi-Engine Database Architecture & High-Load Tuning (Denis's Quick Reference)

Full progressive playbooks live in skill **`high-load-db-tuning`** (`skills/high-load-db-tuning/SKILL.md` and `skills/high-load-db-tuning/references/`).

---

## 1. Engine-Specific Mandates

- **SQLite / libSQL:**
  - Local disk: `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;`.
  - Network share (UNC/SMB): fall back safely to `journal_mode = DELETE` + `synchronous = FULL` (never share `-wal`/`-shm` over SMB).
  - Use **`BEGIN IMMEDIATE`** (never `DEFERRED`) for transactions that read then write, or route writes via a Single-Writer queue (`Channel<T>` / mutex) to avoid upgrade `SQLITE_BUSY`.
- **PostgreSQL / Supabase / Neon:**
  - Choose the right index: B-tree, covering `INCLUDE`, partial (`WHERE ...`), `GIN` (JSONB/FTS), `BRIN` (time-series), `HNSW` (`pgvector`); ALWAYS index FK columns and build live indexes `CONCURRENTLY`.
  - Protect MVCC & vacuum: prevent `idle in transaction` snapshots (`idle_in_transaction_session_timeout`, `lock_timeout`), tune per-table autovacuum on high-churn tables, size PgBouncer Transaction-mode pools accurately.
  - Use `ON CONFLICT` upserts and `FOR UPDATE SKIP LOCKED` for queues.
- **MSSQL (SQL Server):**
  - Enable RCSI (`READ_COMMITTED_SNAPSHOT ON`) to eliminate reader-writer blocking without dirty-read `NOLOCK`.
  - Chunk bulk `UPDATE`/`DELETE` (1,000–4,000 rows) to prevent lock escalation; retry SQL error `1205` with exponential jitter; match `nvarchar`/`varchar` parameter types to avoid `CONVERT_IMPLICIT`.
  - Inspect wait stats (`sys.dm_os_wait_stats`), blocking chains, and `sys.dm_db_index_usage_stats` before tuning.
- **MySQL / MariaDB / InnoDB:**
  - Always use narrow monotonic clustered PKs (`BIGINT UNSIGNED` or `UUIDv7` binary) — never random `UUIDv4` PKs.
  - Order composite indexes leftmost equality-first, range-last; keep `WHERE` indexed on DML to stop InnoDB Gap Lock freezes; use Online DDL (`INSTANT`/`gh-ost`/`pt-osc`).
- **NoSQL, Cache & OLAP (Redis / MongoDB / ClickHouse / DuckDB):**
  - Redis: reuse multiplexed singleton pool, ban `KEYS *` (use `SCAN`), align `maxmemory-policy`, jitter TTLs.
  - MongoDB: index by **ESR** (Equality -> Sort -> Range), avoid `COLLSCAN` and unbounded arrays.
  - ClickHouse/DuckDB: batch bulk inserts (`10k–100k+`), align `ORDER BY` key to primary filters, avoid OLTP row-by-row mutations.

---

## 2. Universal Non-Negotiables (All Engines)

1. **Plan Proof:** Inspect `EXPLAIN QUERY PLAN` / `EXPLAIN (ANALYZE, BUFFERS)` / `EXPLAIN ANALYZE` / Actual Plan on every critical query.
2. **SARGability & Keyset:** Never wrap indexed columns in functions; prefer `WHERE (ts, id) < (@ts, @id)` over deep `OFFSET`; prefer `NOT EXISTS` over `NOT IN`.
3. **Micro-Batching & Pool Hygiene:** Never issue single-row `INSERT` inside telemetry/socket hot loops; dispose connections promptly; never hold transactions open across network calls; follow Zero-Hardcode (Rule 9) for all connection strings and paths.
