# MySQL, MariaDB & InnoDB Performance Playbook

Synthesized from `planetscale/database-skills` (`mysql` / `vitess`), `github/awesome-copilot`, and production InnoDB DBA standards.

---

## 1. Clustered Primary Key & Schema Rules (InnoDB Core)

In InnoDB, **every table IS physically clustered by its Primary Key**, and **every secondary index stores a copy of the PK** as its row pointer:
- **Mandatory Narrow Monotonic PK:** Always use `BIGINT UNSIGNED AUTO_INCREMENT` or monotonic time-ordered `UUIDv7` stored in `BINARY(16)`.
- **Never use random `UUIDv4` (`CHAR(36)`) as InnoDB PK:** Causes severe B+Tree random page splits, dirty Buffer Pool fragmentation, and bloated secondary indexes. If you expose public UUIDs, put `uuid` in a secondary `UNIQUE KEY` and keep `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`.
- **Types & Collations:**
  - Default charset/collation: `utf8mb4` / `utf8mb4_0900_ai_ci` (never legacy 3-byte `utf8mb3` which corrupts emojis/extended symbols).
  - Prefer `DATETIME(6)` over `TIMESTAMP` (avoids 2038 integer overflow).
  - Use `DECIMAL(p,s)` for exact numeric/financial values; never `FLOAT`/`DOUBLE`.
  - Mark columns `NOT NULL` wherever semantically non-nullable to simplify query optimizer estimates and save null-bitmap overhead.

---

## 2. Composite Indexing & `performance_schema` Hygiene

### Leftmost Prefix + Equality-Before-Range Rule
Given `INDEX idx_tenant_status_created (tenant_id, status, created_at)`:
1. Put **equality (`=`, `IN`) columns first**, **range (`>`, `<`, `BETWEEN`) column last**.
2. Once a query evaluates a **range** condition on column $k$, InnoDB **cannot use index columns $> k$** for filtering (only `Index Condition Pushdown` may skip rows, not narrow tree bounds).
3. Put `ORDER BY` alignment only after equality columns when no preceding range breaks sort order.

### Auditing Dead & Redundant Indexes
Inspect `performance_schema.table_io_waits_summary_by_index_usage` (look for `COUNT_STAR = 0` on write-heavy tables after full workload coverage) and `sys.schema_redundant_indexes` before adding new indexes — redundant indexes amplify redo log and Change Buffer pressure on every `INSERT`/`UPDATE`.

Use `EXPLAIN ANALYZE` (MySQL 8.0+) to verify actual row counts, loops, `Using filesort`, `Using temporary`, and table scan fallbacks (`type = ALL`).

---

## 3. InnoDB Gap Locks, Next-Key Locks & Deadlocks

- Under default `REPEATABLE READ`, InnoDB locks not only matching index records, but also **gaps** between index keys (Next-Key Locks) to prevent phantom reads during `UPDATE`, `DELETE`, or `SELECT ... FOR UPDATE`.
- **Hidden Deadlock Amplifier:** Running `UPDATE`/`DELETE` with a non-indexed `WHERE` predicate locks **every scanned record and every gap** in the table, halting concurrent inserts! ALWAYS verify mutating `WHERE` clauses hit selective indexes.
- When serializable gap semantics aren't needed and lock contention spikes on secondary indexes, evaluate `READ COMMITTED` (`transaction_isolation = 'READ-COMMITTED'`), which disables gap locking (except FK/duplicate checks) and keeps row-based binlogging clean.
- Keep transactions tiny and access tables in deterministic order across workers; inspect recent deadlocks via `SHOW ENGINE INNODB STATUS\G` (section `LATEST DETECTED DEADLOCK`).

---

## 4. Zero-Downtime DDL & Connection Discipline

- **Online DDL Awareness:** Standard `ALTER TABLE` with `COPY` algorithm blocks concurrent writes (`Metadata Lock` queue stalls the entire application!). Verify whether MySQL 8 supports `ALGORITHM=INSTANT` (e.g., adding nullable column at end) or `ALGORITHM=INPLACE, LOCK=NONE`. For large tables (>1M rows), use external online schema migration tools (`gh-ost`, `pt-online-schema-change`, Vitess VReplication).
- **Connection Hygiene:** Avoid leaving sleeping transactions holding locks; inspect blockers with `SELECT * FROM performance_schema.data_lock_waits;` / `SHOW PROCESSLIST;` and configure strict app connection pool ceilings + `wait_timeout` / `innodb_lock_wait_timeout`.
