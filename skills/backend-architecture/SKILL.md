---
name: backend-architecture
description: Multi-stack backend architecture, API contracts, concurrency, resilience, distributed messaging (Outbox/Idempotency), caching, and systems performance across .NET/C#, Python/FastAPI, Node.js/TypeScript, and Go. Use when designing backend services, REST/gRPC/WebSocket APIs, async pipelines, retry/circuit-breaker resilience, or reviewing service boundaries.
---

# Universal Backend & Systems Architecture Skill

This skill guides backend architects and systems engineers (**💻 Dmitry** and **👑 Lead**) in building resilient, decoupled, high-throughput services across **.NET/C#, Python, Node.js/TypeScript, and Go**.

---

## 1. Preflight Discovery & Contract Gate (Before Writing Code)

1. **Discover Stack & Constraints First:** Inspect the repository runtime (.NET, Python, Node/TS, Go), transport layer (REST, gRPC, WebSockets/SignalR, TCP/UDP sockets, brokers), and native configuration provider (`.env`, `appsettings.json`, `.ini`, `config.yaml`, `IOptions<T>`).
2. **Enforce Spec & Contract-First (Hermes Rules 1 & 9):**
   - Agree DTO fields, pagination cursors, validation ranges, and error contracts (`[CONTRACT PROPOSAL]` -> `[CONTRACT ACKNOWLEDGED]`) before implementing endpoints or breaking shared schemas.
   - **Zero-Hardcode:** Never embed literal hostnames/IPs, ports, credentials, or absolute file paths in source code; bind dynamically from project configuration and validate on startup.

---

## 2. Progressive Reference Routing Matrix

Load ONLY the reference playbook matching your active subsystem or language runtime:

| Subsystem / Language Scope | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **System Topology, Clean Arch & DDD** | [references/clean-architecture-ddd.md](references/clean-architecture-ddd.md) | Modular Monolith vs. Microservices (YAGNI), Clean/Hexagonal Ports & Adapters, Vertical Slices, DTO-Entity separation, Aggregate boundaries, ADRs |
| **APIs, Resilience & Observability** | [references/api-resilience-contracts.md](references/api-resilience-contracts.md) | REST resource semantics, OpenAPI, RFC 7807 Problem Details, Idempotency Keys, Rate Limiting, Timeouts + Retry-Jitter + Circuit Breaker, `/health/live` vs `/health/ready`, OTel `traceId`, Graceful Shutdown |
| **Messaging, Concurrency & Caching** | [references/concurrency-messaging-caching.md](references/concurrency-messaging-caching.md) | Transactional Outbox + Inbox deduplication (no dual-write), DLQ/Poison Pill, bounded `Channel`/queue backpressure, sharded ordered workers, WebSocket slow-client guards, Cache-Aside + Single-Flight Stampede protection, Fencing Tokens |
| **.NET / C# Enterprise (`dotnet/skills`)** | [references/dotnet-csharp-enterprise.md](references/dotnet-csharp-enterprise.md) | Zero sync-over-async (no `.Result`/`.Wait()`), end-to-end `CancellationToken`, `IHttpClientFactory`, DI Captive Dependency defense, `PeriodicTimer`, `Span<T>`/`ArrayPool<T>` zero-alloc hot paths (`dotnet-diag`), `BackgroundService` resilience, CPM |
| **Python, Node.js/TS & Go Backends** | [references/python-node-go-backends.md](references/python-node-go-backends.md) | FastAPI async loop safety + Pydantic v2 + Django audit, Node/NestJS/Fastify runtime Zod/`ValidationPipe` + `AbortSignal` + shutdown drain, Go small interfaces + Functional Options + `errgroup` + `errors.Is` + `-race` |

---

## 3. Cross-Skill Fleet Routing

- **Database Schema, Locks, MVCC, SQL Tuning & Pools** ➔ co-activate **`high-load-db-tuning`** (`@denis`).
- **Raw TCP/UDP Industrial Sockets, Framing & `Stream.ReadExactly`** ➔ co-activate **`socket-network-diagnostics`** (`@alexey` / `@igor`).
- **ERP / SAP NCo / BAPI / COM Automation** ➔ integrate via **`sap-enterprise-automation`** (`@ruslan`).
- **Security Boundaries, Taint & DoS Hardening** ➔ verify against **`security-audit`** (`@viktor`).

---

## 4. `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Validate every input cleanly at the public boundary; return structured RFC 7807 errors without leaking stack traces or SQL.
- Enforce bounded capacity and explicit backpressure (`Wait` or `DropOldest` + metric) on every background queue.
- Wrap every outbound network/RPC dependency in explicit timeout budgets and clean cancellation propagation.
- Persist architectural decisions (ADRs), endpoint contracts, and resilience settings in `.hermes/memory/dmitry.md`.

### `MUST NOT DO`
- NEVER return internal ORM/DB entities straight from API controllers, or hold DB locks/transactions across HTTP/RPC calls.
- NEVER swallow exceptions (`catch {}`), use sync-over-async (`.Result`/`.Wait()`), or instantiate per-request `HttpClient`/DB/Redis multiplexers.
- NEVER optimize cold initialization code prematurely or introduce `unsafe` hacks where safe managed abstractions suffice.

---

## 5. Verification Gate

Before delivering any backend change:
1. Run native build + unit + integration/race tests (`dotnet build && dotnet test`, `pytest`, `npm test`, `go test -race ./...`) targeting zero warnings.
2. Verify configuration bindings exist cleanly in config files/options validation (never hardcoded literals).
3. Submit contracts, changed files, and edge-case checklist to **🛡️ Viktor** (`[QA PASS]`) and **⚖️ Stanislav** (`[COMPLIANCE PASS]`).
