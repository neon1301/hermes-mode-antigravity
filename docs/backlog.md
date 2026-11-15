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
