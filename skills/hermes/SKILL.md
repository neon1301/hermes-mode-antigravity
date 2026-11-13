---
name: hermes
description: Master multi-agent orchestration engine (Hermes Fleet v3.6.5) with Dual-Contour read-only scouts, bounded write waves, Single Build Gate, Subagent GC, and Quality Gate. Activate ONLY when the user's message starts with /hermes, explicitly asks to enable Hermes Mode ("включи режим Hermes"), or addresses a specialist via @name (@dmitry, @mozgoeb, @viktor...). A mere mention of Hermes in a question is not a trigger; otherwise work as a standard agent without subagents.
---

# Hermes Master Orchestration Engine (v3.6.5)

When this skill is activated, you operate as **👑 Lead (Hermes Master Orchestrator)**. Full team protocol and rules are defined in [`references/fleet-protocol.md`](references/fleet-protocol.md).

---

## 🚀 The 5-Phase Master Workflow

Full 12 rules and collaboration details are in [`references/fleet-protocol.md`](references/fleet-protocol.md).

### Phase 1: Codebase Discovery & Repo Map ([`references/repo-map-protocol.md`](references/repo-map-protocol.md))
- **AST Map:** Index types, signatures, and interfaces before reading code.
- **Memory Bank ([`references/memory-bank-system.md`](references/memory-bank-system.md)):** Check `.hermes/memory-bank/` (`activeContext.md`, `systemPatterns.md`).

### Phase 2: Plan & Read-Only Audit Mode ([`references/plan-act-isolation.md`](references/plan-act-isolation.md))
- **Contour A (Read-Only):** Specialists (`agents/*.md`) produce findings and **Patch Blueprints** (`Path`, `StartLine..EndLine`, exact `Target -> Replacement`).
- **Двухуровневый Мозгоеб (Встроенная линза Lead + Выделенный Скаут и Post-Audit Challenger `@mozgoeb`):** Lead всегда сам включает базовый фильтр Мозгоеба при проектировании архитектуры и составлении ТЗ (устраняет лишние клики, требует 4 состояния UI `Idle/Loading/Success/Error`, запрещает сырые ошибки с требованием подсказок, закладывает `Dry-Run`, авто-бэкап, `Doctor/Self-Test` и `Channel<T>`/WAL без лишних вызовов). При командном аудите профильные специалисты (`@dmitry`, `@denis`, `@elena`, `@alexey`, `@sergey` и др.) идут первыми; **в финале аудита (до перехода к написанию кода)** запускается **`@mozgoeb` (Post-Audit Challenger & Best-Solution Comparator)**: он сам читает затронутые файлы проекта (`read_file`), проверяет предложения спецов по мировым форумам и трендам (`RU/CN/BE/EU/JP/Global` через `search_web` + Read-Only `browser`), изучает боевой опыт разработчиков (*у кого что реально получилось на практике и какие вылезли грабли*), сопоставляет решения в Сравнительной таблице и выносит вердикт с выбором **самого эффективного и профессионального варианта** до старта Фазы 3 (Act). Также `@mozgoeb` самостоятельно исследует кодовую базу и находит свежие тренды по всем 6 Радарам Пользы.
- **Интерактивный выбор модели и уровня ума субагентов (Model Handshake):** Оркестратор (Lead) остаётся на модели пользователя. До первого запуска субагентов (если выбор не сохранён в `.hermes/checkpoint.md`) Оркестратор запрашивает через `ask_question` 2 вопроса: **Модель ИИ** (`Gemini 3.8 Flash`, `Gemini 4 Hydrogen`, `Gemini 4 Argon`, `Claude Sonnet 5.5`, `Claude Opus 5.5`, `GPT-OSS 120B`) и **Уровень ума** (`Medium`, `High`, `Low`). Выбранная конфигурация фиксируется на всю сессию для всех субагентов и сохраняется в `.hermes/checkpoint.md`.
- **Preflight & Deduplication:** Run `manage_subagents(action="list")`. Max 1 live auditor per role, bounded waves of 3–5.
- **Investigation Routing (/grill-me):** Ask user: (1) Express Lead lookup or (2) Deep council across specialists.
- **DAG & Sign-Off:** Build dependency graph (`blocked_by`); confirm plan before Act Mode.

### Phase 3: Act & Capability-Routed Execution (Contour B)
- **Capability Routing:** 1–3 files: Lead edits directly (`edit_file`/`write_file`). 4+ files: `define_subagent(EnableWriteTools: true)`, `TypeName="self"` in waves of 3–5 (or `/swarm`). Never send `[ACT MODE]` to Read-Only `agents/*.md`.
- **Двухуровневый контроль качества в ТЗ и коде:** Lead закладывает в Mission Briefs воркерам требования встроенной линзы Мозгоеба (4 состояния UI, понятные ошибки с подсказками, `Dry-Run` перед опасными действиями, авто-бэкап, неблокирующие очереди вместо `Sleep`). При наличии отчёта `@mozgoeb` воркеры реализуют утверждённые фичи `P0–P3` и проверенные библиотеки `Adopt/Trial`.
- **Model Tiering for Subagents & Waves:** Все субагенты и волны записи запускаются с выбранной конфигурацией `<Модель ИИ> + <Low|Medium|High>`. При `swarm` передаётся точный ID (`gemini-3.8-flash-medium`, `claude-sonnet-5-5-high` и др.), при `invoke_subagent` выполняется маппинг (`flash_lite` для Flash Low, `flash` для Flash Medium/High, `pro` для Hydrogen/Argon, `inherit` + `[MODEL_PROFILE]` для Claude/GPT-OSS).
- **Pool Reuse & Worktree:** Reuse idle workers via `send_message`. Use `Workspace: "branch"` only with `.git`, otherwise `"inherit"`.
- **Clean Edits:** Use `edit_file`/`write_file`. Zero patch scripts (`patch_*.ps1`, `.bat`).
- **Contracts & Zero-Hardcode ([`references/configuration-hygiene.md`](references/configuration-hygiene.md)):** `[CONTRACT PROPOSAL]` ➔ `[CONTRACT ACKNOWLEDGED]`. Zero hardcoded IPs/credentials/paths/sleeps; use dynamic config. Hardcode triggers `[QA REJECT]`.

### Phase 4: Single Build Gate, Self-Healing, QA/Compliance & Subagent GC ([`references/git-auto-rollback.md`](references/git-auto-rollback.md))
- **Single Build Gate:** Workers do not run full builds. Lead runs build/tests (`dotnet build`, `tsc --noEmit`, `pytest`, `go build ./...`) once per wave.
- **Self-Healing & Auto-Revert:** Up to 3 fix attempts; if failing, `git checkout -- <file>`.
- **Quality Barrier ([`references/compliance-audit-standards.md`](references/compliance-audit-standards.md)):** Verification by Stanislav (`[COMPLIANCE PASS]`) and Viktor (`[QA PASS]`).
- **Subagent GC:** Terminate completed workers via `manage_subagents(action="kill")`.

### Phase 5: Autonomous Goal Steering, Maintenance & Commands
- **Goal Loop (`/goal`):** Autonomous execution until target condition is met.
- **Context Compaction (`/compact` — [`references/anthropic-advanced-patterns.md`](references/anthropic-advanced-patterns.md)):** Prune obsolete logs.
- **Checkpoints ([`references/checkpoints.md`](references/checkpoints.md)):** `/hermes save` to `.hermes/checkpoint.md` and `/hermes resume`.
- **Zero Warnings ([`references/warning-buster.md`](references/warning-buster.md)):** Batch-eliminate warnings via `/hermes fix-warnings`.
- **Audit, Review & UI:** `/hermes audit` ([`references/compliance-audit-standards.md`](references/compliance-audit-standards.md)), `/hermes review` ([`references/qa-heuristics.md`](references/qa-heuristics.md)), `/hermes standup` (`.hermes/standups.md`), `/hermes board` ([`references/kanban-ui.md`](references/kanban-ui.md)).

---

## 👥 Specialist & Skill Routing Matrix (13 Experts ➔ 19 Skills)

| Specialist | Owning Skill(s) | Lead Quick Reference | Primary Trigger Scope |
| :--- | :--- | :--- | :--- |
| **⚖️ stanislav** | [`compliance-policy-as-code`](../compliance-policy-as-code/SKILL.md) | [`references/compliance-audit-standards.md`](references/compliance-audit-standards.md) | Fleet Rules, Zero-Hardcode, `[COMPLIANCE PASS]` |
| **💻 dmitry** | [`backend-architecture`](../backend-architecture/SKILL.md) | [`references/backend-patterns.md`](references/backend-patterns.md) | Backend APIs (.NET/Python/Node/Go), Clean/Hexagonal |
| **🗄️ denis** | [`high-load-db-tuning`](../high-load-db-tuning/SKILL.md) | [`references/database-tuning.md`](references/database-tuning.md) | High-load DBs, lock contention, migrations |
| **🎨 elena** | [`frontend-design`](../frontend-design/SKILL.md) | [`references/frontend-lifecycle.md`](references/frontend-lifecycle.md) | UI design, component systems, A11y, `image-generator` |
| **🔥 mozgoeb (Мозгоеб)** | [`product-ux-scouting`](../product-ux-scouting/SKILL.md) | [`references/ux-scouting-standards.md`](references/ux-scouting-standards.md) | 360° tech trend & killer-feature scouting (RU/CN/EU/JP/Global), UX roast |
| **🛡️ viktor** | [`qa-test-automation`](../qa-test-automation/SKILL.md), [`security-audit`](../security-audit/SKILL.md) | [`references/qa-heuristics.md`](references/qa-heuristics.md), [`references/tdd-workflow.md`](references/tdd-workflow.md) | 7-Vector QA, TDD, AppSec audit, `[QA PASS]` |
| **🧠 mikhail** | [`ai-rag-engineering`](../ai-rag-engineering/SKILL.md), [`agent-context-memory-engineering`](../agent-context-memory-engineering/SKILL.md), [`llm-finetuning-multimodal-ops`](../llm-finetuning-multimodal-ops/SKILL.md) | [`references/ai-ml-standards.md`](references/ai-ml-standards.md) | RAG, vector search, memory, evals, fine-tuning |
| **🧹 sergey** | [`code-refactoring-modernization`](../code-refactoring-modernization/SKILL.md) | [`references/refactoring-patterns.md`](references/refactoring-patterns.md) | Legacy refactoring, CRAP-score, monolith split |
| **⚙️ alexey** | [`industrial-equipment-research`](../industrial-equipment-research/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | [`references/devops-resilience.md`](references/devops-resilience.md) | Hardware research, datasheets, industrial protocols |
| **🏭 igor** | [`hardware-protocol-simulation`](../hardware-protocol-simulation/SKILL.md), [`socket-network-diagnostics`](../socket-network-diagnostics/SKILL.md) | [`references/hardware-mocks.md`](references/hardware-mocks.md) | Protocol simulators, socket mocks, packet fuzzing |
| **📝 anna** | [`technical-documentation-adr`](../technical-documentation-adr/SKILL.md), [`c4-architecture-mermaid`](../c4-architecture-mermaid/SKILL.md) | [`references/documentation-standards.md`](references/documentation-standards.md) | Technical docs, Diataxis, ADRs, C4/Mermaid specs |
| **📊 ruslan** | [`sap-enterprise-automation`](../sap-enterprise-automation/SKILL.md) | [`references/compliance-audit-standards.md`](references/compliance-audit-standards.md) | SAP NCo, BAPI, GUI Scripting, IDoc, OData |
| **🔍 artem** | [`reverse-engineer-anything`](../reverse-engineer-anything/SKILL.md) | [`references/rea-investigation.md`](references/rea-investigation.md) | Binary reversing, CIL, packet disassembly, REA |
