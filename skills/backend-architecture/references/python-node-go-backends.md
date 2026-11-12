# Python, Node.js / TypeScript & Go Backend Playbook

Synthesized from `affaan-m/ECC` (`golang-patterns`, `python-patterns`), `fastapi/fastapi` (`.agents/skills/fastapi`), `jeffallan/claude-skills` (`fastapi-expert`, `nestjs-expert`, `golang-pro`), and `getsentry/skills`.

---

## 1. Python Backends (FastAPI / Django / Asyncio)

- **Never Block the `asyncio` Event Loop:**
  - Calling synchronous DB drivers, `requests.get`, `time.sleep()`, or heavy CPU parsing inside `async def` freezes the entire worker!
  - Use genuine async drivers (`httpx.AsyncClient`, `asyncpg`, `aiosqlite`, async SQLAlchemy) OR offload unavoidable sync calls via `await anyio.to_thread.run_sync(...)` / worker queues.
- **Strict Pydantic v2 Boundaries:** Define separate Pydantic v2 `BaseModel` schemas for Request / Response / Config (`pydantic-settings`), validate limits (`Field(ge=..., max_length=...)`), and never unpack raw `dict` payloads straight into ORM models.
- **FastAPI Dependency & Session Lifecycle:** Scope DB sessions cleanly per request using `Depends(get_db)` generator (`try: yield session finally: await session.close()`), propagate OpenTelemetry traces, and keep OpenAPI tags/descriptions/response models explicit.
- **Django Audit Checkpoints (`getsentry/skills`):** Always enforce permission classes / object-level auth checks before business mutations, and guard querysets with `select_related` / `prefetch_related` to eliminate N+1 spikes.
- **Tooling Gate:** Type-check cleanly (`mypy`/`pyright`), lint/format (`ruff`), and test endpoints asynchronously with `pytest` + `httpx.AsyncClient`.

---

## 2. Node.js / TypeScript (NestJS / Fastify / Express)

- **Protect the Single-Threaded Event Loop:** Never run unbounded JSON transforms, huge regexes (ReDoS), sync `fs.*Sync`, or blocking crypto on hot request paths. Measure event-loop lag (`monitorEventLoopDelay`).
- **Runtime Boundary Validation (TypeScript Types Vanish at Runtime!):** Validate every `req.body`, `req.params`, `req.query`, and `process.env` at runtime via **Zod** or **`class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`** in NestJS.
- **Outbound Abort & Leak Hygiene:** Pass `AbortSignal.timeout(ms)` / `AbortController` into every `fetch`/upstream call; always handle `SIGTERM`/`SIGINT` (`app.close()`, drain HTTP/WebSocket connections, close pools); bind global `unhandledRejection` loggers without leaving zombie states.
- **NestJS Module & Circular Dependency Discipline:** Keep Modules cohesive (`exports` minimal), encapsulate Guards/Interceptors/Exception Filters properly, and resolve shared events via EventEmitter/queues instead of `forwardRef()` hacks.

---

## 3. Go (Golang 1.21+ Services)

- **Design Philosophy (`golang-patterns`):**
  - *"Accept interfaces, return structs"*: define small 1–3 method interfaces on the **consumer side**, returning concrete structs from constructors.
  - Use **Functional Options** (`NewServer(addr string, opts ...Option)`) for clean, backwards-compatible configuration.
- **Context & Concurrency Safety:**
  - Pass `ctx context.Context` as the first parameter of every I/O/blocking function; check `ctx.Done()` in loops and workers.
  - Never spawn fire-and-forget goroutines without lifecycle ownership and `errgroup.Group` / bounded worker pools + panic recovery where appropriate; always avoid leaking unclosed channels or blocked senders.
- **Explicit Error Handling:** Never silently drop `_ = err`; wrap contextual errors with `%w` (`fmt.Errorf("load order %s: %w", id, err)`) and classify with sentinel errors + `errors.Is` / `errors.As`.
- **Verification Gate:** Run `go vet ./...`, linter (`golangci-lint`), **`go test -race ./...`** on concurrent code, and profile hot allocations/goroutines with `pprof`.
