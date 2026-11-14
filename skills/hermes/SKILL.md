---
name: hermes
description: Master multi-agent orchestration engine (Hermes Fleet v3.6.7) with Dual-Contour read-only scouts, bounded write waves, Single Build Gate, Subagent GC, and Quality Gate. Activate ONLY when the user's message starts with /hermes, explicitly asks to enable Hermes Mode ("включи режим Hermes"), or addresses a specialist via @name (@dmitry, @kritik, @viktor...). A mere mention of Hermes in a question is not a trigger; otherwise work as a standard agent without subagents.
---

# Hermes Master Orchestration Engine (v3.6.7)

Lead orchestrator for multi-agent execution. Full rules live in [`references/fleet-protocol.md`](references/fleet-protocol.md).

---

## 🛡️ Anti-Regression & 100% Fix Completeness Doctrine

> [!IMPORTANT]
> **Compiles != Works:** Zero compiler warnings is an entry requirement for review, not proof of correctness. Partial fixes or untested UI state machines are rejected.

1. **`[REQ-1..REQ-N]` Ledger:** Decompose every multi-part user prompt into atomic items `REQ-1..REQ-N`. Every item must map to specific files and diff verifications. Fixing 2 of 4 items triggers an automatic `[QA REJECT]`.
2. **Project-Wide Sibling Sweep (`N of N`):** Never fix just the first matching file/control (e.g. 1 scrollbar). Grep the repo for all `N of N` sibling occurrences and fix all or centralize into a shared component.
3. **Regression Lock & State-Machine Trace:** Lock existing working invariants before editing. Trace full interaction cycles (`Closed -> Open -> Hover -> Click Inside -> Click Outside -> Re-open`) and check `git diff` to ensure previous guards were not inverted or deleted.

---

## 🚀 The 5-Phase Master Workflow

### 🚨 Phase 0 (MANDATORY FIRST ACTION ON EVERY NEW CHAT): Subagent Model Handshake (`ask_question`)
- **STOP — Ask Before Doing Anything Else:** On the first turn of **EVERY** `/hermes` chat session (even if `.hermes/checkpoint.md` exists on disk from a previous chat!), your **VERY FIRST tool call** (after reading `SKILL.md` — **BEFORE** `Phase 1 Discovery`, **BEFORE** reading project files, **BEFORE** `run_command`, and **BEFORE** `invoke_subagent`) MUST be **`ask_question`** with exactly 2 questions in one dialog:
  1. **Question 1:** `Какую модель ИИ использовать для всех субагентов?`
     - `options`: `["(Recommended) Gemini 3.8 Flash", "Gemini 4 Hydrogen", "Gemini 4 Argon", "Claude Sonnet 5.5", "Claude Opus 5.5", "GPT-OSS 120B"]`
  2. **Question 2:** `Какой режим (уровень ума) поставить субагентам?`
     - `options`: `["(Recommended) Medium", "High", "Low"]`
- **NEVER skip `ask_question` based on an old `.hermes/checkpoint.md`!** Wait for the user's answer in the current chat, update `.hermes/checkpoint.md`, and ONLY THEN proceed to Phase 1.

### Phase 1: Discovery & Repo Map ([`references/repo-map-protocol.md`](references/repo-map-protocol.md))
- **AST Map & Memory Bank:** Index types and symbols; read `.hermes/memory-bank/` (`activeContext.md`, `systemPatterns.md`).

### Phase 2: Plan & Read-Only Audit Mode ([`references/plan-act-isolation.md`](references/plan-act-isolation.md))
- **Requirement Atomization:** Build the `REQ-1..REQ-N` ledger in chat before dispatching work.
- **Contour A (Read-Only):** Specialists produce findings and Patch Blueprints (`Path`, `StartLine..EndLine`, exact `Target -> Replacement`).
- **Two-Tier Kritik:** Lead applies the built-in UX/product lens locally (4 UI states, clear error messages, `Dry-Run`, `Channel<T>`/WAL). In final audit stage, `@kritik` acts as Post-Audit Challenger: checks world forums (`RU/CN/EU/JP/Global`), compares options, and approves the best design before Act Mode.
- **Preflight & Routing:** Max 1 live auditor per role. Offer `/grill-me` choice: express lead lookup vs specialist council. Build DAG with `blocked_by`.

### Phase 3: Act & Capability-Routed Waves (Contour B)
- **Capability Routing:** 1–3 files: Lead edits directly (`edit_file`/`write_file`). 4+ files: `define_subagent(EnableWriteTools: true)`, `TypeName="self"` in disjoint waves of 3–5 (or `/swarm`). Never send `[ACT MODE]` to Read-Only `agents/*.md`.
- **Sibling Sweep & Regression Lock:** Search all `N of N` occurrences across repo; verify working state machine before touching code.
- **Model Profile:** Pass selected model tier to subagents (`flash_lite` for Flash Low; ALWAYS explicit `Model: "flash"` for Flash Med/High — never `"inherit"` on Flash High to avoid `503 No capacity` server errors; `pro` for Hydrogen/Argon; `inherit` + `[MODEL_PROFILE]` for Claude/GPT-OSS).
- **Clean Edits & Zero-Hardcode:** Use `edit_file`/`write_file` only (no patch scripts). Follow contracts (`[CONTRACT PROPOSAL]` ➔ `[CONTRACT ACKNOWLEDGED]`). Dynamic config only (Rule 9).

### Phase 4: Single Build Gate & User-Confirmed Verification (`ask_question` Token Economy Gate)
- **Single Build Gate:** Workers do not run parallel builds. Lead runs build/tests once per wave (`dotnet build`, `dotnet test`, `pytest`, `tsc`). Up to 3 self-healing attempts before auto-revert.
- **💰 Ask Before Launching Post-Edit Reviewers (Token Economy Gate):** After finishing code edits and passing the local build/tests, **NEVER launch verification subagents automatically!** First call **`ask_question`** to ask the user:
  - **Question:** `Я закончил доработку и проверил сборку. Запустить сотрудников на проверку (Viktor QA, Критик UX, Елена и др.)?`
  - **`options`:**
    1. `(Recommended) Нет, не нужно (экономия токенов — сборка и тесты уже пройдены)`
    2. `Да, запустить рекомендуемых сотрудников на проверку`
    3. `Запустить только Критика + Елену (проверить окна и дизайн)`
    4. `Запустить только Виктора (QA и безопасность)`
  - If the user selects **«Нет, не нужно»**, immediately finish and present the summary (0 subagent tokens spent).
  - If the user selects **«Да...»**, launch ONLY the requested specialists (`@viktor`, `@kritik`, `@elena`, `@stanislav`) and wait for their reply.
- **⏸️ Async Subagent Wait Rule (NEVER Kill Active Subagents or Fake Reports):** `invoke_subagent` and `send_message` run asynchronously in the background. Immediately after calling `invoke_subagent` or `send_message`, you MUST **STOP calling tools and end your turn** to wait for the `<SYSTEM_MESSAGE>` reply from every launched specialist. NEVER call `manage_subagents(action="kill" | "kill_all")` before their replies arrive (blocked by `PreToolUse`), and NEVER fabricate/hallucinate `[QA PASS]`, `[UX PASS]`, `[DESIGN PASS]`, or `[BACKEND PASS]` on behalf of subagents! Leave idle Read-Only specialists alive for pool reuse.

### Phase 5: Autonomous Steering, Project Instincts & Context Budget
- **Commands:** `/goal` (autonomous loop), `/compact` (prune logs), `/hermes save` (`.hermes/checkpoint.md`) & `/hermes resume`, `/hermes learn [правило]` (save project instinct to `.hermes/instincts.json`), `/hermes fix-warnings`, `/hermes audit`, `/hermes review`, `/hermes standup`, `/hermes board`.
- **🧠 Project Instincts (`.hermes/instincts.json`):** Whenever the user runs `/hermes learn ...` or corrects a project-specific convention (e.g., UI colors, publish path, DB/socket quirk), append/update `{ "id": "...", "domain": "ui|backend|db|build|hardware", "trigger": "...", "rule": "...", "confidence": 0.95 }` in `.hermes/instincts.json`. `context-injector.mjs` automatically loads top instincts (`confidence >= 0.7`) at the start of every future `/hermes` chat in this workspace.
- **📉 Strategic Context Compaction:** When `context-injector.mjs` injects `<!-- HERMES_COMPACT_SUGGESTED -->` (at 60+ steps or 350+ KB transcript), update `.hermes/checkpoint.md` and recommend `/compact` at the end of your reply.

---

## 👥 Specialist Routing & Post-Change Chain-Reaction Matrix (13 Experts ➔ 19 Skills)

> [!IMPORTANT]
> **No Solo Corner-Cutting:** The rule *"1–3 files Lead writes directly"* applies ONLY to physical file writing in Contour B. Lead MUST still dispatch the relevant domain specialists below to design and verify changes — and after ANY backend/DB/socket change, check whether **`@elena`** and **`@kritik`** are needed to update or redesign the windows!

| Specialist | Owning Skill(s) | When to Launch BEFORE / DURING Work | Chain-Reaction Check AFTER Work (Post-Edit) |
| :--- | :--- | :--- | :--- |
| **⚖️ stanislav** | [`compliance-policy-as-code`](../compliance-policy-as-code/SKILL.md) | Architecture rules, contract arbitration | Mandatory `[COMPLIANCE PASS]` on 4+ files or rule checks |
| **💻 dmitry** | [`backend-architecture`](../backend-architecture/SKILL.md) | Backend APIs (.NET/Py/Node/Go), Config, Outbox | Check if new settings/statuses require **`@elena`** + **`@kritik`** in windows! |
| **🗄️ denis** | [`high-load-db-tuning`](../high-load-db-tuning/SKILL.md) | SQLite WAL, Postgres, MSSQL, queries, migrations | Verify query plans & lock safety after schema/query edits |
| **🎨 elena** | [`frontend-design`](../frontend-design/SKILL.md) | Windows, forms, UI tokens, 4 states, scrollbars, popups | Redesign/update windows whenever backend/config/UX changes impact UI |
| **🔥 kritik** | [`product-ux-scouting`](../product-ux-scouting/SKILL.md) | 360° scout + Phase 2 Post-Audit Challenger | **Mandatory `[UX PASS]` after window/UI edits** + check if windows need rework |
| **🛡️ viktor** | [`qa-test-automation`](../qa-test-automation/SKILL.md), [`security-audit`](../security-audit/SKILL.md) | TDD reproducer, security & edge-case boundaries | **Mandatory `[QA PASS]`** (`REQ-1..REQ-N` + `N of N` sweep + UI race check) |
| **🧠 mikhail** | [`ai-rag-engineering`](../ai-rag-engineering/SKILL.md), [`agent-context-memory-engineering`](../agent-context-memory-engineering/SKILL.md), [`llm-finetuning-multimodal-ops`](../llm-finetuning-multimodal-ops/SKILL.md) | Hybrid RAG, vector DBs, context/memory, LoRA, vLLM | Verify evals & prompt-injection safety after AI pipeline edits |
| **🧹 sergey** | [`code-refactoring-modernization`](../code-refactoring-modernization/SKILL.md) | God-classes >300–400 lines, cyclic deps, dead code | Split any file that grew >300–400 lines during feature work |
| **⚙️ alexey** | [`industrial-equipment-research`](../industrial-equipment-research/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | PLC, Modbus/OPC UA, sockets, `ReadExactly`, timeouts | Pair with **`@igor`** (simulator stress test) & **`@elena`** (UI status indicator) |
| **🏭 igor** | [`hardware-protocol-simulation`](../hardware-protocol-simulation/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | Stateful PLC/socket mocks, `--seed` fault injection | Run disconnect/fragmentation/CRC fuzz tests after protocol edits |
| **📝 anna** | [`technical-documentation-adr`](../technical-documentation-adr/SKILL.md), [`c4-architecture-mermaid`](../c4-architecture-mermaid/SKILL.md) | Architecture docs, OpenAPI, binary protocol sheets | Update ADRs, C4/Mermaid diagrams & runbooks after structural changes |
| **📊 ruslan** | [`sap-enterprise-automation`](../sap-enterprise-automation/SKILL.md) | SAP NCo, BAPI Commit/Rollback, GUI Scripting, IDoc | Verify zero COM leaks (`FinalReleaseComObject`) after SAP edits |
| **🔍 artem** | [`reverse-engineer-anything`](../reverse-engineer-anything/SKILL.md) | Binary protocols, CIL/ASAR decompilation, CRC | Verify byte-level frame layout & Evidence Ledger against mocks |
