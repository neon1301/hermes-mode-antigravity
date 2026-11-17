# 📌 Hermes Fleet Enterprise — Engineering Backlog

This backlog tracks architectural tasks, technical debt, and external donor evaluations across Hermes Fleet releases.

---

### [TASK-001] Split 30-KB Fleet Protocol into Core + Modular References
* **Priority:** P1
* **Status:** ✅ COMPLETED in v3.9.0
* **Resolution:** 
  - `skills/hermes/references/fleet-protocol.md` reduced from 30,305 bytes (~30 KB) to 12,008 bytes (11.73 KB <= 12 KB budget).
  - Initial injection payload reduced by **-60.38%** (-18,297 bytes saved eager per session).
  - Specialized content extracted to modular references:
    * `skills/hermes/references/specialist-dispatch-matrix.md` (Chain-reaction matrix, Two-tier Kritik, Model matrix).
    * `skills/hermes/references/orchestrator-planning.md` (BMAD planning ladder, `.hermes/decisions.md` ledger, Spec Law «Done when»).
    * `skills/hermes/references/orchestrator-parallel.md` (Gas Town Refinery merge queue, Beads `.hermes/tasks.json`, Watchdog recovery).
  - All 18 tests in `context-injector.test.mjs` pass cleanly.

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

---

### [TASK-003] Lightweight Merge-Queue Utility (Gas Town Refinery Automation)
* **Priority:** P2
* **Target Version:** v4.0.0
* **Status:** ✅ COMPLETED in v4.0.0
* **Resolution:** 
  - Designed via `docs/adr/ADR-0002-refinery-merge-queue.md` (interception at user-space CLI/module `scripts/refinery.mjs` avoiding hook 10s timeout risks).
  - Implemented standalone Bors-style staging pipeline and recursive binary bisection in `scripts/refinery.mjs`.
  - Added deterministic test suite `hooks/refinery.test.mjs` (9/9 PASS) verifying green batch merges, red batch bisection isolation, injection resistance, atomic rollback, and Beads ledger synchronization.
  - Zero external Go binaries (`gt`), zero patch scripts (Rule 8), zero hardcoding (Rule 9).

---

### [TASK-004] Narrow `hermes-hardcode-ignore` Scope to Trigger Line (±1 Line) & ADR 0001 Schema Shim
* **Priority:** P1
* **Target Version:** v4.3.0
* **Scope & Context:**
  - `hermes-hardcode-ignore` currently acts on the entire write operation. Narrow scope to the line of violation (±1 line).
  - **Spec Law «Done when»:** Negative test «ignore on line 5 does not suppress hardcode on line 40» is proven red on current codebase, green after fix.
  - Document schema divergence (schema requires `ackToken`, while gate accepts `ackToken || signature`) as a deprecated backward-compatibility shim in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md`.

---

### [TASK-005] Subagent UUID FIFO Assignment Verification & tool_call_id Binding
* **Priority:** P2
* **Target Version:** v4.3.0
* **Status:** [ГИПОТЕЗА]
* **Scope & Context:**
  - **Hypothesis:** FIFO distribution of UUIDs from `pendingSubagents` might misassign `viktor`/`kritik` if multiple subagents are invoked in a single step with out-of-order execution.
  - **Cheapest Refuting Check (Дешевейшая проверка):** Deterministic test with two simultaneous `invoke_subagent` calls and reversed `conversationId` ordering in subsequent GENERIC steps.
  - If platform does not guarantee sequential FIFO order: bind via `tool_call_id`.
  - If platform guarantees FIFO order: document as a known platform constraint in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md`.

---

### [TASK-006] Convoy Stall & Distributed Deadlock Detection Hook
* **Priority:** P3
* **Target Version:** Post-v4.3 Evaluation
* **Scope & Context:**
  Dynamic detection of circular dependency chains (`Worker A awaits Worker B awaits Worker A`) in multi-agent swarms using `.hermes/tasks.json` dependency graph.

---

### [TASK-007] External Scout Audit & Rejected Donors Registry (v3.9.0)
* **Priority:** P3
* **Audit Verdict Ledger:**
  1. **`ruvnet/ruflo` (ex-Claude-Flow, ~66k★)**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Unbounded swarm auto-spawning contradicts Hermes Fleet Rule 12 (bounded waves 3–5) and Rule 3 (Token Economy Post-Edit Gate). Would lead to uncontrolled token expenditure and quota exhaustion.
  2. **`itqan-engineering`**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Duplicates existing 7-Phase feature development protocol (`skills/hermes/references/feature-dev-protocol.md`). Zero unique delta.
  3. **`NeoLabHQ/sdd` (Spec-Driven Development)**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Redundant. Contract First (Rule 1), Spec Law «Done when» (BMAD), and REQ-1..REQ-N already enforce strict spec-driven verification.
  4. **`github/spec-kit` (Specification-Driven Development)**:
     - *Verdict:* `ADOPT` (Templates) / `HOLD` (`specify-cli`).
     - *Rationale:* Clean markdown templates (`spec.md`, `plan.md`, `tasks.md`) ported to `skills/hermes/references/spec-driven-templates.md` under Apache 2.0 for Anna and Lead on Enterprise tasks. Heavy CLI tool (`specify-cli`) and orchestration logic are held to avoid external Python dependencies and keep Hermes zero-context outside `/hermes`.


---

### [TASK-008] Mechanical QA Rails & Artifact-Driven Gate Acceptance (Track B1–B5)
* **Priority:** P1
* **Target Version:** v4.1.0
* **Status:** ✅ COMPLETED in v4.1.0
* **Resolution:**
  - Transitioned `[QA PASS]` from conversational text token matching to deterministic machine-verified artifact (`.hermes/qa-verdict.json`).
  - Implemented `hooks/qa-runner.mjs` with automated stack detection (`dotnet`, `pytest`, `npm`, `go`), real process exit codes, and `diffHash` binding.
  - Expanded `qa-verdict.schema.json` with contract validation.
  - Implemented fail-closed Stop gate acceptance in `hooks/qa-gate.mjs` with backward-compatible `qaVerdictMode: "legacy"` flag.
  - Added Mutation Testing MVP (advisory-first, Rule 13 honest reporting, strict mode option).
  - Documented in `docs/adr/ADR-0005-mechanical-qa-rails-and-artifact-gate.md` and `docs/troubleshooting.md`.
  - Added 11 negative and anti-spoofing test vectors in `hooks/qa-gate.test.mjs` (82/82 PASS).
