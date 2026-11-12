# Universal SQL Tuning, Ingestion & Zero-Downtime Migration Patterns

Engine-agnostic rules synthesized from `github/awesome-copilot` (`sql-optimization`), `sickn33/agentic-awesome-skills` (`database-design`, `sql-pro`), `alirezarezvani/claude-skills` (`sql-database-assistant`), `affaan-m/ECC`, and `u1pns/skill-dba`.

---

## 1. SARGability Checklist (Keep Indexes Alive)

A predicate is **SARGable** (*Search ARGument-able*) only if the engine can traverse a B-tree directly without transforming every row first:

| Anti-Pattern (Breaks Index -> Full Scan) | SARGable Fix (Uses Index Seek/Search) |
| :--- | :--- |
| `WHERE YEAR(created_at) = 2026` | `WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'` |
| `WHERE LOWER(email) = @email` | Normalize on write (`email_lower`) OR create an expression/generated-column index |
| `WHERE amount * 1.2 > 1000` | `WHERE amount > 1000 / 1.2` |
| `WHERE code LIKE '%ALARM%'` | `LIKE 'ALARM%'` (prefix only), OR FTS5 / PostgreSQL GIN trigram `pg_trgm` |
| `WHERE col = 123` when `col` is `VARCHAR`/`TEXT` | Match parameter type & collation strictly (`@p` as exact `varchar`/`nvarchar`/text) |
| `WHERE a = @x OR b = @y` (disjoint cols) | Split into `UNION ALL` (avoiding duplicates with `AND b <> @y` if overlapping) |

---

## 2. Joins, Subqueries, Projections & `NULL` Traps

- **Ban `SELECT *` in production paths:** explicitly select required columns to enable Covering Index-Only Scans, reduce network/driver serialization, and protect against schema drift breaking positional ORMs.
- **Store Timestamps in UTC Always:** Persist timestamps in UTC (`timestamptz` in Postgres, UTC `datetimeoffset`/`datetime2` in MSSQL, `DATETIME(6)` UTC or Unix epoch ms in SQLite/MySQL) — never naive local server time without timezone offset.
- **Prefer `EXISTS` / `NOT EXISTS` over `IN` / `NOT IN` on subqueries:**
  - `EXISTS` short-circuits on the first match.
  - **`NOT IN` + any `NULL` value returns ZERO rows** silently due to SQL three-valued logic (`x <> NULL` yields `UNKNOWN`). Always rewrite negative checks as `WHERE NOT EXISTS (...)`.
- **Eliminate N+1 Queries:** Replace per-item ORM/SQL lookups in loops with single set-based `JOIN`, batched `IN (@ids)` / `ANY($1)` / TVP, or `DataLoader` aggregation.
- **Avoid ORM Cartesian Explosions:** When preloading multiple one-to-many collections (`Include` chains), use split queries (`AsSplitQuery()` in EF Core) or separate projections instead of multiplying parent columns $M \times N$ times.

---

## 3. Pagination & Counting at Scale

- **Ban Deep `OFFSET` Pagination (`OFFSET 100000 LIMIT 50`):** The engine must scan and discard 100,000 rows every page, slowing linearly to $O(N)$.
- **Mandate Keyset / Seek Pagination ($O(1)$ with index):**
  ```sql
  -- Page 1: ORDER BY recorded_at DESC, id DESC
  -- Next Page using cursor (@lastTs, @lastId):
  WHERE (recorded_at < @lastTs)
     OR (recorded_at = @lastTs AND id < @lastId)
  ORDER BY recorded_at DESC, id DESC
  LIMIT 50;
  ```
- **Avoid exact `SELECT COUNT(*)` on massive live tables for UI badges:** use capped counts (`LIMIT 1001` "1000+"), catalog estimates (`reltuples` in Postgres / `sys.dm_db_partition_stats` in MSSQL), or maintained summary counters.

---

## 4. High-Frequency Ingestion & Batch Retention

Never commit 1-row transactions inside high-frequency network/telemetry loops:
1. **Producer-Consumer Micro-Batching:** Buffer inbound messages in a bounded memory queue (`Channel<T>` / ring buffer with explicit backpressure/drop-policy metrics) and flush batches (e.g., `100–1,000` records or every `100–250 ms`) inside **one short transaction**.
2. **Batch Upserts / Bulk Primitives:**
   - SQLite: parameterized prepared statement reused across loop inside `BEGIN IMMEDIATE ... COMMIT`
   - Postgres: binary `COPY` / `UNNEST($1::bigint[], $2::text[], ...)` / `INSERT ... ON CONFLICT DO UPDATE`
   - MSSQL: `SqlBulkCopy` / TVP + `MERGE` (with `HOLDLOCK` if concurrent upserts)
   - MySQL: multi-row `INSERT INTO ... VALUES (...), (...) ON DUPLICATE KEY UPDATE ...`
3. **Chunked Retention & Partitioning:** Purge old time-series logs via small batched deletes (`1,000–5,000` rows per commit) or `DROP/TRUNCATE PARTITION` sliding windows — never `DELETE FROM huge_table WHERE ts < ...;` in one giant transaction.

---

## 5. Expand-and-Contract (Zero-Downtime Migrations)

Never break running older app instances during rolling deploys:
1. **Expand:** Add new nullable column / new table / `CONCURRENTLY` (online) index alongside legacy fields.
2. **Dual-Write & Backfill:** App writes both old + new; background job backfills historical rows in small throttled batches.
3. **Switch Reads:** Point readers to the new schema once verified.
4. **Harden & Contract:** Validate `NOT NULL` / `CHECK` constraints safely (Postgres `NOT VALID` -> `VALIDATE CONSTRAINT`), wait for legacy code retirement, then drop old columns/triggers cleanly.
