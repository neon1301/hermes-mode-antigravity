# SQLite & Embedded Engine High-Concurrency Playbook

Covers SQLite 3.x, libSQL/Turso, `Microsoft.Data.Sqlite`, `sqlite3` (Python/Node), and `rusqlite`.

---

## 1. Mandatory PRAGMA Baseline (Local Storage vs. Network Shares)

Always detect whether the database path resides on a local drive or a network share (UNC `\\server\share`, SMB, NFS) **before** applying journal mode. WAL shared-memory (`-shm`) files do NOT coordinate across network hosts and risk database corruption or permanent locking on SMB/NFS.

### Local SSD / NVMe Profile
```sql
PRAGMA journal_mode = WAL;        -- Readers never block writers; 1 writer + N readers concurrently
PRAGMA busy_timeout = 5000;       -- Wait up to 5000ms before returning SQLITE_BUSY (set per connection!)
PRAGMA synchronous = NORMAL;      -- Crash-safe in WAL mode, avoids extra fsync per commit
PRAGMA foreign_keys = ON;         -- Disabled by default in SQLite; must be set on EVERY connection
PRAGMA temp_store = MEMORY;       -- Keep temp sorts/indexes in RAM
PRAGMA cache_size = -64000;       -- ~64 MB page cache (negative = KiB)
PRAGMA mmap_size = 268435456;     -- Optional 256 MB memory-mapped I/O on 64-bit hosts
```

### Network Share / UNC / SMB Fallback Profile
```sql
PRAGMA journal_mode = DELETE;     -- Safe rollback journal when -shm mmap cannot cross hosts
PRAGMA synchronous = FULL;        -- Strict durability over network filesystems
PRAGMA busy_timeout = 10000;      -- Higher wait tolerance for network lock latency
PRAGMA foreign_keys = ON;
```

> **Driver Gotcha:** `busy_timeout` and `foreign_keys` are **per-connection**, not persisted in the file header like `journal_mode`. Apply them inside a central `OpenConnection` helper every time a connection opens.

---

## 2. Eliminating the `DEFERRED` Upgrade Deadlock (`BEGIN IMMEDIATE`)

### Why `busy_timeout` Alone Still Fails
By default, SQLite `BEGIN` starts a **`DEFERRED`** transaction:
1. Connection A starts `BEGIN`, runs `SELECT` (acquires SHARED lock).
2. Connection B commits a write (database advances to a newer snapshot).
3. Connection A runs `INSERT`/`UPDATE`, trying to upgrade SHARED -> RESERVED -> EXCLUSIVE.
4. Because A's snapshot is now stale, upgrading would violate serializability. SQLite returns **`SQLITE_BUSY` immediately — bypassing `busy_timeout` completely** because waiting cannot fix a stale snapshot!

### Mandatory Fix
Any transaction that **may write** MUST start immediately with a RESERVED lock:
- Raw SQL: `BEGIN IMMEDIATE;`
- `Microsoft.Data.Sqlite` (.NET): pass `deferred: false` (`connection.BeginTransaction(deferred: false)`) or ensure writes are serialized behind a process-wide writer gate (`SemaphoreSlim(1, 1)` / single-writer `Channel<T>`).
- Node (`better-sqlite3`): `db.transaction(fn).immediate()`
- Python (`sqlite3`): set `isolation_level = None` and execute `BEGIN IMMEDIATE` manually (or driver equivalent).

---

## 3. Single-Writer Queue + Read Pool Pattern

Under multi-threaded ingestion, synchronize all write transactions cleanly:
- **In-Process Serialization:** Route high-frequency writes through a bounded FIFO queue (`Channel<T>` / queue worker) committing micro-batches of 100–500 rows every 100–250 ms inside one `BEGIN IMMEDIATE ... COMMIT`.
- **Dedicated Read Connections:** Open reader connections with read-only intent (`Mode=ReadOnly` / `SQLITE_OPEN_READONLY`) or clean pool separation so readers never hold dirty write scopes.
- **No Long-Running Reads in WAL Mode:** An idle open `SELECT` cursor pins an older WAL snapshot and prevents SQLite from resetting the `-wal` file, causing unbounded `-wal` growth until disk exhaustion. Dispose/close readers immediately.

---

## 4. WAL Checkpoint & Backup Hygiene

- Monitor WAL growth when ingestion bursts outpace auto-checkpointing (`wal_autocheckpoint`, default `1000` pages).
- Schedule non-blocking maintenance checkpoints during idle windows:
  ```sql
  PRAGMA wal_checkpoint(PASSIVE);   -- Moves committed pages without blocking active readers
  PRAGMA optimize;                  -- Refreshes SQLite planner statistics before closing/idle
  ```
- **Safe Online Backups:** Never raw-copy `.db` files while WAL writes are active (you risk missing `-wal` tail pages). Use SQLite's online backup API or `VACUUM INTO '<target_path>';` (built dynamically from app paths).
- **`.NET Microsoft.Data.Sqlite` File Locks:** Before deleting/replacing a SQLite file on Windows, call `SqliteConnection.ClearAllPools()` after disposing all connections, otherwise the pool retains a handle lock. Also normalize `.NET null` parameters to `DBNull.Value`.

---

## 5. `STRICT` Tables & Index Verification

- Prefer **`STRICT` tables** on SQLite 3.37+ (`CREATE TABLE telemetry (...) STRICT;`) to reject accidental dynamic type coercions (`'abc'` stored inside an `INTEGER` column).
- Every non-trivial query MUST be checked with `EXPLAIN QUERY PLAN`:
  - Good: `SEARCH tbl USING INDEX ...` or `USING COVERING INDEX ...`
  - Defect (fix before merge): `SCAN tbl` on large tables or `USE TEMP B-TREE FOR ORDER BY`.
- Put equality predicates first, range predicates second in composite indexes; avoid leading-wildcard `LIKE '%term%'` or functions wrapped around indexed columns (`WHERE strftime(...) = ...`). Use FTS5 for text search.
