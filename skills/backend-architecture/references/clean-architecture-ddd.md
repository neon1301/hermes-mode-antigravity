# Clean Architecture, Boundaries & DDD Patterns

Synthesized from `wshobson/agents` (`architecture-patterns`), `jeffallan/claude-skills` (`architecture-designer`), `obra/superpowers`, and `github/awesome-copilot` (`.NET DDD`).

---

## 1. Topology Selection (Simplicity-First / YAGNI)

Never default to distributed microservices for a problem a **Modular Monolith** solves cleanly with zero network latency or distributed-transaction overhead:

| Context | Recommended Topology | Rationale |
| :--- | :--- | :--- |
| Single team, shared deployment lifecycle, coupled domain workflows | **Modular Monolith** (isolated feature modules + explicit internal contracts) | In-process calls, ACID transactions across modules when needed, clean extraction seams later |
| Distinct scaling profiles, independent release cadences, heterogeneous runtimes | **Service Extraction / Microservices** | Isolated deployment & failure domains; requires Async Outbox, tracing, and schema versioning |
| Mixed CRUD + complex orchestration workflows | **Vertical Slice Architecture + Domain Core** | Co-locates handler, validator, DTO, and tests per use-case instead of bloated 200-method "Service" classes |

---

## 2. Clean / Hexagonal Architecture (Ports & Adapters)

Maintain strict **inward dependency direction**:

```text
[Presentation / Transport (HTTP, gRPC, Socket, CLI, WinForms)]
                         │  (depends on)
                         ▼
[Application Layer (Use Cases, DTOs, Validators, Port Interfaces)]
                         │  (depends on)
                         ▼
[Domain Core (Entities, Value Objects, Domain Rules, Events)]
                         ▲  (implemented by)
[Infrastructure (DB Repositories, SMTP, ERP/SAP, File IO, Redis)]
```

### Boundary Rules
- **Domain Core MUST NOT reference** EF Core, `SqlConnection`, `HttpClient`, `Microsoft.AspNetCore.*`, FastAPI, Express, or SAP COM interop assemblies.
- **Public API Boundaries MUST NEVER expose Persistence Entities directly:** Always map inputs and outputs to explicit request/response DTOs so internal column renames never break callers or leak sensitive fields (e.g. password hashes, internal flags).
- **Define Ports at the Consumer Side:** Keep repository/gateway interfaces cohesive and minimal (Interface Segregation); do not create bloated 30-method `IRepository<T>` God-interfaces.

---

## 3. Domain-Driven Design (DDD) Guardrails

- **Aggregate Consistency Boundaries:** Mutate one Aggregate Root per ACID transaction; propagate cross-aggregate or cross-module side effects via **Domain Events** + **Transactional Outbox** rather than chaining unrelated entity mutations inside giant distributed locks.
- **Value Objects Over Primitive Obsession:** Encapsulate invariants (e.g., `Money(Amount, Currency)`, `MachinePort`, `EmailAddress`, `TemperatureRange`) so invalid states cannot even be constructed.
- **Guard Against Anemic Bypassing:** State transitions (e.g. `Order.Cancel()`, `Batch.Complete()`) belong on domain methods enforcing invariants, not scattered `order.Status = "Cancelled"` assignments across controllers.

---

## 4. Specification & ADR Discipline

Before coding major architectural shifts (new messaging bus, auth overhaul, multi-tenant split, protocol boundary):
1. Check **Existing Constraints & Spec:** Clarify throughput targets, consistency requirements (strong ACID vs. eventual), failure modes, and rollback paths first.
2. **Author a Concise Architecture Decision Record (ADR)** (e.g. inside `.hermes/memory/dmitry.md` or project docs):
   - **Context** ➔ **Options Considered** ➔ **Decision** ➔ **Trade-offs & Consequences**.
3. **Break Dependencies Cleanly:** Never allow circular module dependencies (`Module A <-> Module B`). Extract shared domain contracts or mediate via events.
