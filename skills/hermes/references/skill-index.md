# 🗺️ Hermes Fleet Skill & Tool Index (Track C4 — Lazy-Loading Architecture)

> **Architectural Doctrine (Token Economy):** Do NOT preload or dump the full bodies of all 22 specialized skills into the orchestrator context. The 22 full `SKILL.md` documents total ~85–90 KB (~22,000 tokens). Instead, keep this lightweight index in context (~1.5 KB / ~400 tokens) and lazily load only the relevant skill when the task enters that domain.

---

## 📌 Domain-to-Skill Routing Directory

| Task Domain | Specialist | Skill Directory & File | Lazy Trigger Condition |
| :--- | :--- | :--- | :--- |
| **Backend & Architecture** | `@dmitry` | `skills/backend-architecture/SKILL.md` | REST/gRPC/WebSocket APIs, Outbox, RFC 7807, concurrency |
| **Monolith Decomposition** | `@sergey` | `skills/code-refactoring-modernization/SKILL.md` | Legacy refactoring, god-classes (>300 lines), Strangler Fig |
| **Tech Docs & Architecture** | `@anna` | `skills/technical-documentation-adr/SKILL.md` | ADRs, OpenAPI specs, Diátaxis runbooks |
| **C4 System Mapping** | `@anna` | `skills/c4-architecture-mermaid/SKILL.md` | Interactive Mermaid/C4 container & component diagrams |
| **High-Load Databases** | `@denis` | `skills/high-load-db-tuning/SKILL.md` | SQLite WAL, PostgreSQL MVCC, MSSQL, deadlocks, pool tuning |
| **Frontend & UI Systems** | `@elena` | `skills/frontend-design/SKILL.md` | Bespoke UI design, WinForms/WPF, 4-state async, A11y WCAG |
| **3D Digital Twins** | `@gleb` | `skills/procedural-3d-digital-twin/SKILL.md` | Procedural Three.js, WebGL, factory digital twins, VRAM leaks |
| **Product & UX Critique** | `@kritik` | `skills/product-ux-scouting/SKILL.md` | Nielsen 0–4 roast, click audit, global dev forum scouting |
| **QA Automation & TDD** | `@viktor` | `skills/qa-test-automation/SKILL.md` | TDD Iron Law, Playwright, integration barriers `[QA PASS]` |
| **AppSec & Cybersecurity** | `@viktor` | `skills/security-audit/SKILL.md` | OWASP Top 10, CWE triage, input quarantine `[SECURITY PASS]` |
| **Policy as Code & Rules** | `@stanislav` | `skills/compliance-policy-as-code/SKILL.md` | 15 Fleet Rules audit, AST validation `[COMPLIANCE PASS]` |
| **Cognitive Sobriety** | `@stanislav` | `skills/cognitive-discipline/SKILL.md` | Pre-mortem checklists, grounded citations, sober plans |
| **Industrial Equipment** | `@alexey` | `skills/industrial-equipment-research/SKILL.md` | PLCs, machinery, datasheets, manual hunting, safety |
| **Socket & Network Streams** | `@alexey` | `skills/socket-network-diagnostics/SKILL.md` | TCP/UDP streaming, `CA2022` Stream.Read, socket leaks |
| **Hardware Simulation** | `@igor` | `skills/hardware-protocol-simulation/SKILL.md` | Stateful FSM socket mocks, telemetry emulators, fuzzing |
| **SAP Enterprise** | `@ruslan` | `skills/sap-enterprise-automation/SKILL.md` | SAP .NET Connector (NCo), BAPI, GUI Scripting, IDoc |
| **Office Workbooks/Docs** | `@ruslan` | `skills/office-documents/SKILL.md` | Formula-first Excel (.xlsx) and Word (.docx) automation |
| **Reverse Engineering** | `@artem` | `skills/reverse-engineer-anything/SKILL.md` | Binary disassembly, CIL/.NET decompile, Evidence Ledger |
| **AI & Hybrid RAG** | `@mikhail` | `skills/ai-rag-engineering/SKILL.md` | RAG pipelines, HNSW/vector indexes, structured outputs |
| **Context & Memory Ops** | `@mikhail` | `skills/agent-context-memory-engineering/SKILL.md` | Long-term memory, compaction, red-teaming, prompt budget |
| **LLM Multimodal Ops** | `@mikhail` | `skills/llm-finetuning-multimodal-ops/SKILL.md` | LoRA/QLoRA fine-tuning, vLLM serving, Whisper/Docling |
| **Orchestration & Governance**| 👑 Lead | `skills/hermes/SKILL.md` | Master orchestration, Dual-Contour waves, gates |

---

## ⚡ Batch Tool Execution Pattern (Intermediate State Quarantine)

To prevent LLM context pollution when querying multiple files or executing multi-step inspection:
1. **Never fan out 20 separate individual tool calls to chat context** if intermediate outputs are not needed by the user.
2. **Execute batch inspection via Python/Workflow script:**
   - Execute the scan inside `run_workflow` or scratch script (`node`/`python`).
   - Filter, aggregate, and deduplicate outputs in the execution process memory.
   - Return strictly the synthesized, actionable summary to the agent context.
3. **Measured Economy:**
   - Eager 22-skill preload: **~88 KB (~22,500 tokens)**
   - Lean Skill Index + On-demand load: **~1.6 KB (~420 tokens)**
   - **Net Context Reduction:** **>95% prompt budget saved** per standard orchestration turn.
