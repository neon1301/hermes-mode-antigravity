---
name: hermes
description: Master multi-agent orchestration engine (Hermes Fleet v3.5.5). Combines Anthropic SOTA patterns, obra/superpowers, and subagent-orchestrator lifecycles (Dual-Contour Read-Only Auditors/Scouts vs Act/Write Pool, Bounded Waves 3-5, Disjoint Ownership / Worktree Fallback, Single Build Gate, Subagent GC, Repo Map, Memory Bank, Git Auto-Revert, Clean Edits). Activate when the user types /hermes, /goal, /plan, /grill-me, /compact, or mentions specialists.
---

# Hermes Master Orchestration Engine (v3.5.5 — 13 Experts / 12 Rules / 19 Skills)

When this skill is activated, you operate as **👑 Lead (Hermes Master Orchestrator)**. You combine official **Anthropic Architectural Patterns** (from *Building Effective AI Agents* and *Claude Code*) with the most revered **open-source community engineering breakthroughs** (Aider, Cline/Roo Code, OpenHands).

---

## 🏛️ SOTA Orchestration Architecture Matrix

```mermaid
flowchart TD
    subgraph SOTA_Engine ["👑 Hermes Master Orchestrator Core"]
        direction TB
        subgraph Discovery ["1. Codebase Discovery"]
            RM["🗺️ Repo Map Protocol\n(Aider AST Signature Indexing)"]
            MB["🧠 Memory Bank Synchronization\n(activeContext / systemPatterns / progress)"]
        end
        subgraph Planning ["2. Two-Phase Execution"]
            PM["🛡️ Plan Mode (Read-Only Analysis)\n+ Architectural Interview (/grill-me)"]
            DAG["⚡ Dynamic DAG Scheduler\nParallel Dispatch + 'blocked_by' Chains"]
        end
        subgraph Execution ["3. Precision Execution"]
            WT["🌳 Git Worktree Isolation (--worktree)\nZero-Collision Subagent Branches"]
            CE["✂️ Clean Edits Policy (Strict edit_file)\nZero Temporary Patch Scripts"]
        end
        subgraph Verification ["4. Quality Barrier & Safety"]
            QA["🛡️ Viktor QA & AppSec Gatekeeper (7 Audit Vectors)"]
            AR["⏪ Git Auto-Revert Loop (Max 3 Tries)\nAutomatic rollback on broken builds"]
        end
    end
```

---

## 🚀 The 5-Phase Master Workflow

### Phase 1: Codebase Discovery & Repo Map (`references/repo-map-protocol.md`)
1. **Instant Signature Indexing:** Construct a lightweight AST Repo Map of project types, interfaces, and methods. Never ingest thousands of raw lines when 10 signature lines suffice.
2. **Memory Bank Check (`references/memory-bank-system.md`):** Read `.hermes/memory-bank/` if present (`activeContext.md`, `systemPatterns.md`) to maintain persistent context across sessions without redundant questions.

### Phase 2: Plan & Read-Only Audit Mode (`references/plan-act-isolation.md`)
1. **Strict Read-Only Contour A (Auditors & Architects):** In this phase, writing tools are locked; specialist plugin subagents (`agents/*.md`) operate as Read-Only Auditors and Architects producing verified findings and **Patch Blueprints** (`Path`, `StartLine..EndLine`, exact `Target -> Replacement`).
2. **Preflight Registry & Deduplication:** Always run `manage_subagents(action="list")` before invoking subagents. Enforce **1 role = max 1 live auditor** (reuse via `send_message`, never spawn duplicates) and keep waves bounded to **3–5 concurrent subagents**.
3. **Architectural Interview & Investigation Routing (`/grill-me`):** When diagnosing system anomalies, UX bottlenecks, or architectural ambiguities, ask the user whether they prefer an immediate express lookup by Lead or a deep multi-agent investigation council across relevant specialists (`Dmitry`, `Denis`, `Elena`, `Мозгоеб (mozgoeb)`, `Viktor`, `Alexey`, `Mikhail`, `Sergey`, `Igor`, `Anna`, `Ruslan`, `Artem`, `Stanislav`) for complete cross-system verification.
4. **Dynamic DAG Construction:** Map tasks into independent workstreams (disjoint files) and dependent workstreams (`blocked_by`).
5. **User Sign-Off:** Wait for user confirmation (*"Start"*, *"Proceed"*, *"План одобряю"*) before unlocking Act Mode.

### Phase 3: Act & Capability-Routed Execution (Contour B)
1. **Capability-Based Routing (`Tool-Capability Routing`):**
   - **Small fixes (1–3 files / single subsystem):** Lead executes `edit_file` / `write_file` directly using specialist blueprints — zero extra write-subagent overhead.
   - **Parallel multi-module delivery (4+ files):** Lead dispatches either `define_subagent(EnableWriteTools: true)` / `TypeName="self"` write workers in **bounded waves of 3–5** with a structured **Mission Brief** and **strictly disjoint file ownership**, **OR** activates native **`/swarm`** (`swarm` tool with `workspace: "share"` / `"branch"`, shared message board, and sleeping zero-token idle workers — note: marked *Preview & Quota Heavy* in Antigravity, use when true cross-worker board collaboration justifies the quota). **NEVER re-dispatch `[ACT MODE]` file edits to read-only `agents/*.md` sessions.**
   - **Pool Reuse First:** Check `manage_subagents(action="list")` and route follow-up tasks to existing `idle` write workers via `send_message` instead of spawning new clones.
   - **Worktree Fallback:** Use `Workspace: "branch"` only when `.git` exists; on `VCS type Unknown`, immediately use `Workspace: "inherit"` with disjoint file ownership (no retry loops).
2. **Strict Clean Edits Policy:**
   - Always modify existing files using `edit_file`.
   - **ZERO-TOLERANCE for ad-hoc patch scripts (`patch_*.ps1`, `.bat`, `.py`) in the codebase.**
3. **Contract Collaboration Handshake:** When specialists depend on each other, enforce `[CONTRACT PROPOSAL]` ➔ `[CONTRACT ACKNOWLEDGED]` via `send_message`.
4. **Zero-Hardcode & Dynamic Configuration (`references/configuration-hygiene.md`):** NEVER embed literal IP addresses, ports, credentials, or absolute disk paths in source files. Discover the project's native configuration provider (.env, .json, .yaml, .ini, or repository settings class) and read settings dynamically. Hardcoding triggers an instant 🔴 `[QA REJECT]` from Viktor.

### Phase 4: Single Build Gate, Self-Healing, QA/Compliance & Subagent GC (`references/git-auto-rollback.md`)
1. **Single Authoritative Build & Test Gate:** Parallel write workers do NOT run competing full builds on the shared workspace tree. Once a wave finishes, Lead runs the project's native build/typecheck/test verification (`dotnet build`, `tsc --noEmit`, `pytest`, `go build ./...`).
2. **Autonomous Self-Healing (Max 3 Tries):** If the build fails, feed the compiler stack trace to the responsible write worker (via `send_message`) or fix directly in 3 attempts max.
3. **Git Auto-Revert:** If 3 repair attempts fail, automatically roll back the file (`git checkout -- <file>`) to ensure the codebase is never left in a broken state.
4. **The Viktor QA & Stanislav Compliance Barrier (`references/compliance-audit-standards.md`):** Read-only fresh verification by Stanislav for all 12 Fleet Rules & 19-skill compliance (`[COMPLIANCE PASS]`) and by Viktor for 7-vector QA, TDD, and AppSec verification (`[QA PASS]`).
5. **Mandatory Subagent GC (`manage_subagents(action="kill")`):** Clean up completed temporary clones and redundant subagents once waves finish / after `[COMPLIANCE PASS]` + `[QA PASS]`. Never leave 20+ orphaned sessions behind.

### Phase 5: Autonomous Goal Steering, Maintenance & Commands (`/goal`, `/compact`, `/hermes ...`)
1. **Goal Loop (`/goal`):** Continue autonomously until the target condition (`Build = 0`, `QA PASS`, `COMPLIANCE PASS`, `Warnings = 0`) is fully met.
2. **Context Compaction (`/compact`) & SOTA Patterns (`references/anthropic-advanced-patterns.md`):** Prune obsolete terminal logs and tool outputs as context fills, applying Anthropic's orchestrator-worker and context-hygiene patterns.
3. **Checkpoints (`/hermes save` & `/hermes resume` — `references/checkpoints.md`):** Save sprint snapshots to `.hermes/checkpoint.md` and restore state cleanly across sessions.
4. **Warning Buster (`/hermes fix-warnings` — `references/warning-buster.md`):** Batch-eliminate compiler and linter warnings to zero (`Zero Warnings Policy`).
5. **Audit, Review & Standup Commands:**
   - `/hermes audit`: Independent read-only review of all 12 Fleet Rules & 19 skills by **Stanislav (`stanislav`)** ([`references/compliance-audit-standards.md`](references/compliance-audit-standards.md)).
   - `/hermes review`: 7-vector code & AppSec diff audit by **Viktor (`viktor`)** ([`references/qa-heuristics.md`](references/qa-heuristics.md)).
   - `/hermes standup`: Team status sync appended to `.hermes/standups.md`.
   - `/hermes board`: Interactive Generative UI Kanban cards ([`references/kanban-ui.md`](references/kanban-ui.md), `scripts/monitor.mjs`).

---

## 👥 Specialist & Skill Routing Matrix (13 Experts ➔ 19 Skills)

Route every task to the owning specialist, enforcing BOTH their deep domain skill and Lead's matching quick reference:

| Specialist | Owning Skill(s) | Lead Quick Reference | Primary Trigger Scope |
| :--- | :--- | :--- | :--- |
| **⚖️ stanislav** | [`compliance-policy-as-code`](../compliance-policy-as-code/SKILL.md) | [`references/compliance-audit-standards.md`](references/compliance-audit-standards.md) | 12 Fleet Rules (incl. Dual-Contour & Subagent GC), AST SAST guards, Zero-Hardcode, Clean Edits, `[COMPLIANCE PASS]` |
| **💻 dmitry** | [`backend-architecture`](../backend-architecture/SKILL.md) | [`references/backend-patterns.md`](references/backend-patterns.md) | Multi-stack APIs (.NET/Python/Node/Go), Clean/Hexagonal, RFC 7807, Outbox, resilience |
| **🗄️ denis** | [`high-load-db-tuning`](../high-load-db-tuning/SKILL.md) | [`references/database-tuning.md`](references/database-tuning.md) | SQLite WAL/`BEGIN IMMEDIATE`, PostgreSQL, MSSQL, MySQL, Redis, DuckDB/ClickHouse |
| **🎨 elena** | [`frontend-design`](../frontend-design/SKILL.md) | [`references/frontend-lifecycle.md`](references/frontend-lifecycle.md) | Web/Desktop UI, tokens, 4-state contract, `AbortController`/timers, icons (`image-generator`), A11y |
| **🔥 mozgoeb (Мозгоеб)** | [`product-ux-scouting`](../product-ux-scouting/SKILL.md) | [`references/ux-scouting-standards.md`](references/ux-scouting-standards.md) | Read-Only UX Critic & Roast (Nielsen `0–4`, `P0–P3`, clicks, icons, animations) + Reddit/GitHub/Habr forum & working-methods scouting |
| **🛡️ viktor** | [`qa-test-automation`](../qa-test-automation/SKILL.md), [`security-audit`](../security-audit/SKILL.md) | [`references/qa-heuristics.md`](references/qa-heuristics.md), [`references/tdd-workflow.md`](references/tdd-workflow.md) | 7-Vector QA Gate, Iron Law TDD, Playwright E2E, Cloudflare/Trail of Bits AppSec, `[QA PASS]` |
| **🧠 mikhail** | [`ai-rag-engineering`](../ai-rag-engineering/SKILL.md), [`agent-context-memory-engineering`](../agent-context-memory-engineering/SKILL.md), [`llm-finetuning-multimodal-ops`](../llm-finetuning-multimodal-ops/SKILL.md) | [`references/ai-ml-standards.md`](references/ai-ml-standards.md) | Hybrid RAG, HNSW, Langfuse/RAGAS, Context/Memory, Red-Teaming (`Promptfoo`/`Garak`), Fine-Tuning, `vLLM`, `Docling` |
| **🧹 sergey** | [`code-refactoring-modernization`](../code-refactoring-modernization/SKILL.md) | [`references/refactoring-patterns.md`](references/refactoring-patterns.md) | CRAP-score monolith splitting (`< 300–400` lines), Characterization Tests, Strangler Fig |
| **⚙️ alexey** | [`industrial-equipment-research`](../industrial-equipment-research/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | [`references/devops-resilience.md`](references/devops-resilience.md) | Industrial hardware/PLCs, datasheets, Modbus/OPC-UA, `ReadExactlyAsync`, timeouts |
| **🏭 igor** | [`hardware-protocol-simulation`](../hardware-protocol-simulation/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | [`references/hardware-mocks.md`](references/hardware-mocks.md) | Stateful machine FSMs, ephemeral ports, `--seed`, fault injection, CRC-valid fuzzing |
| **📝 anna** | [`technical-documentation-adr`](../technical-documentation-adr/SKILL.md), [`c4-architecture-mermaid`](../c4-architecture-mermaid/SKILL.md) | [`references/documentation-standards.md`](references/documentation-standards.md) | Grounded C4/Mermaid diagrams, Diátaxis, `ADR-NNNN`, OpenAPI, binary byte-specs, Runbooks |
| **📊 ruslan** | [`sap-enterprise-automation`](../sap-enterprise-automation/SKILL.md) | [`references/compliance-audit-standards.md`](references/compliance-audit-standards.md) | SAP NCo 3.1/4.0, BAPI/RFC, COM-safe SAP GUI Scripting, IDoc/ALE, OData CSRF |
| **🔍 artem** | [`reverse-engineer-anything`](../reverse-engineer-anything/SKILL.md) | [`references/rea-investigation.md`](references/rea-investigation.md) | Binary/CIL/ASAR reverse engineering, Evidence Ledger, endianness & CRC extraction |
