# 💻 Backend Architecture & Systems Reliability Quick Reference (Dmitry's Standard)

Full multi-stack playbooks live in skill **`backend-architecture`** (`skills/backend-architecture/SKILL.md` and `skills/backend-architecture/references/`). Also pair with **`high-load-db-tuning`** and **`socket-network-diagnostics`**.

---

## 1. Architecture & API Mandates

- **Boundaries & DTOs:** Keep Domain Core independent of framework/ORM drivers; never expose database entities directly on API boundaries.
- **Contract-First & RFC 7807:** Agree DTOs/endpoints via `[CONTRACT PROPOSAL]` before coding; map failures to clean structured RFC 7807 error responses without leaking internals.
- **Idempotency & Resilience Triad:** Support `Idempotency-Key` on mutating callbacks; apply strict **Timeouts + Retry with Jitter + Circuit Breaker** on outbound calls; never hardcode URLs/ports/secrets (Hermes Rule 9).

---

## 2. Concurrency, Messaging & Caching

- **Transactional Outbox (No Dual-Write):** Persist domain state + outbox event in the same ACID transaction; relay asynchronously to brokers and deduplicate consumers via Inbox keys.
- **Bounded Backpressure:** Cap every in-memory queue (`Channel<T>` / ring buffer) explicitly; never run unbounded memory queues or hold locks/transactions across async I/O.
- **Cache-Aside Hygiene:** Use `SingleFlight` per-key locking on cold misses, jittered TTLs, and explicit invalidation.

---

## 3. Runtime Safety Guardrails

- **.NET / C#:** Ban `.Result`/`.Wait()` sync-over-async, pass `CancellationToken` end-to-end, use `IHttpClientFactory`, prevent DI Captive Dependencies, apply `Span<T>`/`ArrayPool<T>` only on hot paths.
- **Python / Node.js / Go:** Keep `asyncio` and Node event loops non-blocking, validate inputs at runtime (Pydantic v2 / Zod), use Go consumer-side interfaces + `context.Context` + `go test -race`.
