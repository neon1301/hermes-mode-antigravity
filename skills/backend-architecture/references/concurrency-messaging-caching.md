# Concurrency, Event-Driven Messaging & Caching Patterns

Synthesized from `affaan-m/ECC` (`backend-patterns`), enterprise distributed-systems standards, and industrial streaming reliability rules.

---

## 1. Reliable Messaging: Solving Dual-Write (Transactional Outbox)

**Classic Bug:** Committing a DB order/telemetry change AND publishing a broker message (`Kafka.Produce` / `RabbitMQ.Publish` / `HttpClient.Post`) as two separate non-atomic steps. If either crashes or times out in between, DB and downstream systems drift permanently out of sync.

### Mandatory Fix — Transactional Outbox + Idempotent Consumer
1. **Outbox Write (Same ACID Transaction):** Persist business row + insert event row `(id, event_type, payload_json, trace_id, created_utc)` into `outbox_messages` inside the **same database transaction**.
2. **Background Relay Worker:** Poll/stream unpublished outbox rows (`FOR UPDATE SKIP LOCKED` in Postgres, monotonic watermark/batched claim in MSSQL/SQLite), publish to broker/HTTP, and mark published.
3. **Idempotent Consumer (Inbox / Dedup Table):** Message delivery is *At-Least-Once* — duplicates WILL happen. Track processed `message_id` in an `inbox_processed` unique constraint inside the consumer transaction so duplicates are safely ignored.
4. **Dead-Letter Queue (DLQ) & Poison Pill Isolation:** Retry transient broker consumer errors cleanly, then route unparseable/permanently invalid messages to a DLQ after max attempts with structured error context — never block an entire partition forever on one corrupt frame.

---

## 2. In-Process Concurrency & Backpressure

- **Bound Every Memory Queue:** Never push socket packets, webhooks, or telemetry onto an unbounded `ConcurrentQueue` or unbounded channel. Under downstream slowness, memory explodes until OOM crash.
- **Explicit Backpressure Policies:** Configure bounded capacity (dynamically from project settings) and choose an intentional full-queue strategy:
  - *Critical financial/audit commands:* `Wait` (apply backpressure to caller / `429`/`503`).
  - *High-rate non-critical sensor telemetry:* `DropOldest` + increment dropped-frame metric counter and log rate-limited warnings.
- **Lock Hygiene:**
  - Never perform `await`, network calls, file IO, or SAP COM calls inside `lock (...)` / `Monitor` / non-async mutexes.
  - Use `SemaphoreSlim(1, 1)` carefully with `try { ... } finally { sem.Release(); }` and cancellation timeouts when async serialization is truly unavoidable.
  - Prefer immutable messages passing across producer-consumer pipelines over shared mutable dictionaries wrapped in nested locks (eliminates AB-BA deadlocks).

---

## 3. Real-Time Streaming (WebSockets, SignalR, SSE, gRPC)

- **Server-Side Send Buffering & Slow-Client Eviction:** Always put bounded per-client outbound queues with send timeouts around WebSocket/SSE/TCP clients; one frozen slow consumer must NEVER stall broadcast loops for other healthy clients.
- **Heartbeats & Half-Open Detection:** Configure ping/pong keep-alive intervals and idle read deadlines cleanly (coordinate raw framing/TCP diagnostics with `socket-network-diagnostics`).
- **Ordered Per-Entity Processing:** When machine state transitions or entity events must stay ordered concurrently across threads, partition work by `entityKey.GetHashCode() % shardCount` into independent single-consumer shard queues rather than locking globally.

---

## 4. Distributed Caching & Stampede Prevention

- **Cache-Aside Flow:** Read cache ➔ on miss acquire single-flight lock (per cache key) ➔ load DB once ➔ store with `TTL + random jitter` (prevents synchronized mass expiry!) ➔ release.
- **Thundering Herd / Stampede Protection:** Use in-process `SingleFlight` / keyed semaphore deduplication so 500 simultaneous misses for expired key `X` trigger **1 DB fetch**, not 500.
- **Negative Caching:** Cache explicit `"not found"` sentinel entries with a short TTL (e.g. 15–60s) when bots/scanners hammer missing IDs, protecting the database from penetration floods.
- **Cache Invalidation Discipline:** Explicitly define TTL vs. write-through/invalidation strategy; never cache rapidly mutating inventory/locks without versioning or short stale tolerances.
- **Distributed Locks Safeguard:** Simple `SET key val NX EX 30` locks do NOT guarantee exclusivity if GC pause > 30s! Pair distributed locks with **fencing tokens** (monotonic sequence validated by storage) or database-level optimistic concurrency (`rowversion` / `ETag` / `version = version + 1`).
