# PostgreSQL, MVCC & High-Concurrency Playbook

Synthesized from industry rulebooks (`supabase/agent-skills`, `affaan-m/ECC`, `planetscale/database-skills`). Covers PostgreSQL 14–18, Supabase, Neon, RDS/Cloud SQL, TimescaleDB, and `pgvector`.

---

## 1. Diagnostic Priority Ladder

Inspect production Postgres issues strictly in this order of leverage:
1. **Query Plans & Missing Indexes** (`EXPLAIN (ANALYZE, BUFFERS)`, `pg_stat_statements`)
2. **Connection Saturation & Idle Transactions** (`pg_stat_activity`, PgBouncer pools)
3. **MVCC Bloat & Autovacuum Starvation** (`pg_stat_user_tables`, dead tuples, `xmin horizon`)
4. **Lock Chains & Long DDL** (`pg_locks`, `pg_blocking_pids()`)
5. **Schema, Partitioning & RLS Efficiency**

---

## 2. Indexing & Query Plan Mastery

### Index Selection Matrix
| Workload / Data Shape | Index Type | Notes |
| :--- | :--- | :--- |
| Equality (`=`), Range (`<`, `>`, `BETWEEN`), Sorting | **B-Tree** | Default; equality cols first, range/sort cols after |
| Index-Only Scans without heap fetches | **Covering (`INCLUDE`)** | `CREATE INDEX ... ON tbl(tenant_id, ts DESC) INCLUDE (status, val);` |
| Hot subset of huge table (e.g. `status = 'pending'`) | **Partial Index** | Dramatically smaller, faster writes: `WHERE deleted_at IS NULL` |
| JSONB `@>`, arrays, `tsvector` FTS | **GIN** | Pair with `jsonb_path_ops` when only `@>` containment is needed |
| Huge monotonic time-series / append-only telemetry | **BRIN** | Tiny footprint vs B-Tree; ideal for `created_at` telemetry |
| Vector similarity (`pgvector`) | **HNSW** | Tune `m` / `ef_construction` and `hnsw.ef_search` |

### Plan Inspection (`EXPLAIN (ANALYZE, BUFFERS)`)
- **Estimated vs Actual Rows skew > 10x:** run `ANALYZE tbl;` or inspect correlated columns (`CREATE STATISTICS`).
- **Foreign Keys ARE NOT auto-indexed:** ALWAYS index FK columns on child tables; deleting or updating a parent row triggers a sequential scan / table lock on unindexed children.
- **`CREATE INDEX CONCURRENTLY`:** mandatory on live production tables so writes are never blocked (`ShareLock` vs `ShareUpdateExclusiveLock`). Set explicit `lock_timeout = '2s'` before any production DDL!

---

## 3. MVCC, Vacuum & Bloat Control

PostgreSQL writes new row versions on `UPDATE`/`DELETE`; dead tuples require `VACUUM` to reclaim space and keep visibility maps intact for Index-Only Scans:
- **Never hold `idle in transaction` sessions:** an open transaction pins the global `xmin horizon`, preventing `VACUUM` from cleaning dead tuples across **the entire cluster**.
- **Enforce defensive session timeouts** in app connection setup or role defaults:
  ```sql
  SET lock_timeout = '2000ms';
  SET statement_timeout = '30000ms';
  SET idle_in_transaction_session_timeout = '15000ms';
  ```
- **Tune Autovacuum per high-churn table:** default `autovacuum_vacuum_scale_factor = 0.2` (20%) is far too lazy for 50M-row queue/telemetry tables. Lower per-table thresholds (e.g., `0.01–0.05` + `autovacuum_vacuum_threshold = 1000`).
- **Index Bloat Recovery:** use `REINDEX INDEX CONCURRENTLY ...` rather than blocking `VACUUM FULL`.

---

## 4. Connection Pooling & High-Concurrency SQL

- **Connection Pool Sizing:** Postgres forks an OS process per connection. Too many connections trash CPU context switches and `work_mem`. Keep active direct connections low (typically near `(2 * vCPU) + disk_spindles` up to small dozens) and place **PgBouncer / Supavisor** in front for bursty microservices.
- **Transaction Mode vs. Session Mode:**
  - **Transaction Mode (port `6432` default):** max throughput for stateless APIs; avoid session-pinned state (`SET` without `LOCAL`, temp tables, advisory session locks, named prepared statements if unsupported by driver mode).
  - **Session Mode:** reserve for migrations, LISTEN/NOTIFY, and legacy state.
- **Race-Free Patterns:**
  - Atomic idempotency: `INSERT INTO ... ON CONFLICT (...) DO UPDATE SET ...;`
  - Distributed job queues without lock contention: `SELECT ... FROM jobs WHERE state = 'queued' ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED;`
  - Cursor / Keyset pagination instead of `OFFSET`: `WHERE (ts, id) < ($1, $2) ORDER BY ts DESC, id DESC LIMIT 50;`

---

## 5. Schema & Security Discipline

- Prefer `bigint` (`GENERATED ALWAYS AS IDENTITY`) or time-ordered UUIDv7 over random UUIDv4 PKs (reduces B-tree page splits and cache churn).
- Prefer `timestamptz` (UTC storage), `text` (over arbitrary `varchar(255)`), and `numeric(p,s)` for financial/exact decimals.
- **Row-Level Security (RLS) Performance:** wrap per-session helpers inside scalar subqueries (`USING ((SELECT auth.uid()) = user_id)`) so Postgres caches the InitPlan per statement rather than evaluating `auth.uid()` per row. Always add an index supporting the RLS predicate column.
