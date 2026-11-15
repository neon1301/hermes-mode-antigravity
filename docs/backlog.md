# 📌 Hermes Fleet Enterprise — Engineering Backlog

This backlog tracks architectural tasks and technical debt deferred from minor releases to dedicated feature releases.

---

### [TASK-001] Split 30-KB Fleet Protocol into Core + Modular References
* **Priority:** P2
* **Target Version:** v3.8.0
* **Scope & Context:** 
  `skills/hermes/references/fleet-protocol.md` currently sizes ~30 KB. While PreInvocation injection operates with strict deduplication (`<!-- HERMES_PROTOCOL_LOADED -->`), injecting the full 30 KB on the initial `/hermes` turn consumes ~7,500 tokens of the initial context window.
* **Proposed Architecture:**
  1. **Core Kernel (`fleet-core.md` ~8-10 KB):** Rules 1–15, Phase 0 Handshake, Single Build Gate, Subagent GC, and Quality Gate boundaries.
  2. **Modular References (`references/*.md`):** Deep tables, Convergence Loop state machines, and ADR links loaded on-demand by specific specialists.
* **Acceptance Criteria:**
  - Initial injection payload reduced to <= 10 KB.
  - Zero loss of rule enforcement across all 8 test suites.
  - Test suites and consistency checks updated in lockstep.

---

### [TASK-002] Deferred Skill Candidates Registry (v3.8.0 External Scout Audit)
* **Priority:** P3
* **Target Version:** Post-v3.8.0 Evaluation
* **Audit Verdict Ledger:**
  1. **`mcollina/skills` (Fastify & Node.js Performance)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Dmitry (`backend-architecture`) already provides high-throughput Node.js/Go/.NET patterns and zero-alloc streams. Additional standalone skill would cause token budget bloat.
  2. **`prisma/skills` (Prisma ORM)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Narrow ORM scope. Denis (`high-load-db-tuning`) focuses on database engine fundamentals (PostgreSQL/SQLite WAL/MSSQL/DuckDB) rather than high-level JS ORMs.
  3. **`sanjay3290/postgres` (PostgreSQL Optimization)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Redundant. `high-load-db-tuning` already covers MVCC bloat, EXPLAIN ANALYZE, partial indexes, and connection pool sizing.
  4. **`mattpocock/skills` (TypeScript Type Gymnastics)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Dmitry and Elena already maintain strict TypeScript types and schemas; overly complex type acrobatics reduce codebase readability.
  5. **`supercorp-ai/supercov` (Coverage Reporting)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Viktor (`qa-test-automation`) already enforces 100% `REQ-1..REQ-N` coverage and deterministic TDD without external SaaS coverage tools.
  6. **`aklofas/kicad-happy` (KiCad EDA / PCB Design)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Hardware PCB layout is outside the Hermes Fleet software engineering scope. Physical interfaces and PLCs are covered by Alexey and Igor.
  7. **`tt-a1i/archify` (Architecture Diagrams)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Anna (`c4-architecture-mermaid`) already delivers living C4 architecture and validated Mermaid diagrams.
  8. **`anthropics/skills` (`webapp-testing`, `mcp-builder`)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Web app testing is unified under Viktor (`playwright-e2e-patterns.md`), and MCP authoring is covered under Antigravity built-in `agy-customizations`.
