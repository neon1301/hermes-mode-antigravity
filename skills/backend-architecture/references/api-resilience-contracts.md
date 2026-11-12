# API Contracts, Resilience & Observability Patterns

Synthesized from `affaan-m/ECC` (`api-design`), `wshobson/agents` (`api-design-principles`), `getsentry/skills` (`document-api-endpoint`, `code-review`), and enterprise distributed-systems practices.

---

## 1. API Design & Contract Discipline

- **Contract-First Before Coding:** Agree DTO schemas, required/optional fields, validation bounds, pagination shapes, and error codes with frontend/hardware teams (`[CONTRACT PROPOSAL]`) before changing handlers.
- **Resource & Verb Semantics (REST):**
  - Use plural resource nouns (`/api/v1/machines/{id}/telemetry`), never RPC verbs in REST paths (`/getMachine`).
  - Status codes cleanly mapped: `200 OK`, `201 Created` (+ `Location`), `204 No Content`, `400/422` validation failure, `401` unauthenticated, `403` forbidden, `404` missing, `409` conflict/duplicate idempotency mismatch, `429 Too Many Requests` (+ `Retry-After`), `503 Service Unavailable`.
- **Uniform Error Contract — RFC 7807 / RFC 9457 Problem Details:**
  ```json
  {
    "type": "https://errors.internal/validation-error",
    "title": "Validation Failed",
    "status": 422,
    "detail": "BatchSize must be between 1 and 5000.",
    "instance": "/api/v1/telemetry/batches",
    "traceId": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
  }
  ```
  Never leak stack traces, SQL fragments, connection strings, or internal filesystem paths in client error payloads!
- **Pagination & Payload Bounds:** Never return unbounded lists (`SELECT *` without limit). Default to explicit bounded `limit` (e.g. default `50`, max `200`) and Cursor/Keyset tokens for large timelines.
- **API Evolution & Versioning:** Add optional fields backwards-compatibly; version breaking contract changes explicitly (`/v2/...` or header versioning) and deprecate with explicit sunset headers. Keep OpenAPI / Swagger schemas accurate (`drf-spectacular`, Swashbuckle, Zod-to-OpenAPI).

---

## 2. Fail-Fast Validation & Idempotency

- **Validate at Every Entry Boundary:** Reject malformed JSON, negative quantities, out-of-range ports, oversized arrays, or invalid state transitions immediately before opening DB transactions or locks.
- **Idempotency Keys on Mutating Endpoints:** For payment, ERP/SAP posting, order creation, or retryable machine webhooks, accept an explicit `Idempotency-Key` header:
  1. Persist `(key, request_hash, status, response_payload)` atomically.
  2. Exact replay returns the cached response instead of executing twice; same key with different payload returns `409/422`.

---

## 3. Resilience Triad (Timeouts, Retries, Circuit Breakers)

Every outbound network call (HTTP APIs, gRPC, ERP/SAP, Redis, brokers) MUST configure all three:

1. **Strict Timeout Budgets:** Set both per-attempt timeout and total operation deadline (`CancellationTokenSource` / `AbortController` / `context.WithTimeout`). Never rely on framework infinite/100s defaults.
2. **Bounded Retry with Exponential Backoff + Jitter:**
   - Retry **ONLY transient failures** (`502/503/504`, `429` honoring `Retry-After`, connection resets, DB deadlock `1205`) and **ONLY idempotent operations**!
   - Never hammer a recovering downstream service in synchronized bursts — always add random jitter (`Full Jitter`).
3. **Circuit Breaker & Bulkhead Isolation:**
   - Trip fast (`503`) when failure rate exceeds threshold so broken dependencies do not exhaust worker threads/socket pools across the whole process.
   - Isolate heavy or slow external integrations on dedicated connection pools / bounded semaphores (Bulkhead).
4. **Rate Limiting & Load Shedding:** Protect public and expensive endpoints with Token Bucket / Sliding Window limits (per tenant/IP/API key) returning `429` + `Retry-After`.

---

## 4. Observability, Health Checks & Graceful Shutdown

- **Structured Logging + Correlation:** Log JSON/structured key-value fields (`traceId`, `requestId`, `tenantId`, `durationMs`, `statusCode`), NEVER interpolate secrets, JWTs, API keys, or PII into log strings.
- **OpenTelemetry Instrumentation:** Propagate W3C `traceparent` across HTTP, gRPC, message headers, and background jobs.
- **Liveness vs. Readiness Health Probes:**
  - `/health/live`: Cheap process event-loop/thread-pool heartbeat (do NOT fail liveness if Postgres/Redis blips, or orchestrators restart-loop healthy pods!).
  - `/health/ready`: Verifies critical dependencies (DB, broker, critical config) before receiving traffic.
- **Graceful Shutdown (`SIGTERM` / Host Stop):** Stop accepting new ingress first ➔ drain active requests/batches up to shutdown deadline ➔ flush telemetry/logs ➔ close pools cleanly.
