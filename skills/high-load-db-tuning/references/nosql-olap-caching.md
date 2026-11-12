# NoSQL, Caching & Analytical (OLAP) Database Playbook

Covers **Redis / Valkey**, **MongoDB**, **DuckDB**, and **ClickHouse** when projects pair OLTP engines with caches, document stores, or analytical telemetry pipelines.

---

## 1. Redis / Valkey (In-Memory Cache, Locks & Queues)

- **Reuse Multiplexed Connections:** Use one long-lived singleton multiplexer / thread-safe pool (`IConnectionMultiplexer` in .NET, pooled async client in Node/Python); NEVER open/close TCP connections per request.
- **Ban Blocking $O(N)$ Commands on Production Paths:**
  - Never run `KEYS *` or massive unbounded `HGETALL`/`SMEMBERS`/`FLUSHALL` synchronously; use cursor-based `SCAN` / `HSCAN` with `COUNT` chunks.
  - Monitor slow commands with `SLOWLOG GET 20`.
- **Memory & Eviction Discipline:**
  - Explicitly choose `maxmemory-policy`: use **`allkeys-lru` / `volatile-lru`** strictly for pure caches, and **`noeviction`** for queues, locks, or persistent rate-limit state!
  - Set `TTL` on every cache key + jittered expiration (`ttl + random(0..15%)`) and single-flight/mutex stampede protection on hot keys so expiring keys never stampede the primary DB.
- **Minimize Roundtrips:** Batch multi-key operations with **Pipelines** or atomic **Lua scripts** (`EVALSHA`), keeping each script microsecond-fast (Redis event loop is single-threaded!).

---

## 2. MongoDB (Document Stores & Aggregation)

- **Follow the ESR Rule for Compound Indexes:** Always order fields strictly as **Equality ➔ Sort ➔ Range**:
  - Good: `{ tenantId: 1, status: 1, createdAt: -1 }` for `find({ tenantId, status, createdAt: { $gte } }).sort({ createdAt: -1 })`.
- **Verify with `.explain("executionStats")`:** Flag **`COLLSCAN`** on growing collections and `SORT` stages spilling memory (>100 MB) without index support.
- **Avoid Unbounded Document Growth (16 MB Limit):** Never push infinite telemetry/log arrays inside a single parent document; break high-frequency child events into a bucketed or separate time-series collection (`timeseries` collections in MongoDB 5.0+).
- **Project Fields & Avoid Unanchored `$regex`:** Project only needed fields (`{ _id: 1, state: 1 }`), use prefix regex `/^CODE/` (indexable) instead of `/CODE/`, and batch writes with `bulkWrite({ ordered: false })`.

---

## 3. DuckDB & ClickHouse (Columnar / OLAP Analytics)

Columnar analytics engines invert standard OLTP rules — **small frequent row mutations destroy performance**:

### ClickHouse (`MergeTree` Family)
- **Batch Inserts Heavily:** Insert **10,000–100,000+ rows per batch** (or at intervals of several seconds / async inserts), NEVER single-row `INSERT` bursts (creates "Too many parts" `MergeTree` failures).
- **Primary Key (`ORDER BY`) Drives Everything:** ClickHouse uses a sparse primary index over data granules (`8,192` rows). Put lowest-cardinality / most common filter columns first in `ORDER BY (tenant_id, machine_id, toStartOfHour(ts), ts)`.
- **Avoid OLTP-Style `ALTER TABLE ... UPDATE/DELETE`:** Mutations rewrite whole immutable data parts asynchronously. Prefer `ReplacingMergeTree` / `CollapsingMergeTree` / TTL / `DROP PARTITION` instead.

### DuckDB (Embedded In-Process Analytics)
- **Single Writer Process + Read-Only Analytics:** Only one process may open a DuckDB file read-write at a time; read Parquet / CSV / Iceberg snapshots directly (`read_parquet('...')`) for zero-copy vectorized scans.
- **Bulk Load (`COPY` / `Appender`):** Stream bulk frames or Parquet files rather than transactional row inserts.
- **Explicit Memory & Thread Limits:** Configure `SET memory_limit = '...';` and `SET threads = ...;` dynamically via configuration on shared backend hosts so analytical queries do not OOM OLTP services.
