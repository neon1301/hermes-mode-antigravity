# ⚖️ Fleet Compliance & Protocol Audit Standards (Stanislav's Standard)

This document defines the inspection criteria and enforcement mechanisms used by **Stanislav (Chief Fleet Auditor & Protocol Compliance Officer)**.

---

## 🎯 1. The Role of the Fleet Auditor
While **Viktor (QA & AppSec)** focuses on runtime correctness (tests, memory leaks, concurrency, OWASP/AppSec verification), **Stanislav (Compliance)** focuses on **rules, discipline, architectural integrity, and skill compliance**:
* Did the agents follow all **12 Hermes Fleet Rules** (`rules/AGENTS.md`)?
* Did they follow the mandatory protocols across all **19 specialist skills** (`skills/compliance-policy-as-code/SKILL.md`)?
* Did they cut corners (hardcoded values, ad-hoc patch scripts, unreviewed contracts, duplicate/orphaned subagents)?

```mermaid
flowchart TD
    Lead["👑 Orchestrator & Specialists\n(Executing Code & Proposals)"] --> Auditor["⚖️ Stanislav (Fleet Compliance)\nАудит 12 правил и 19 скиллов: Хардкод, Скрипты, Контракты, Субагенты"]
    Auditor -->|Нарушение найдено| Reject["🔴 [RULE VIOLATION]\nБлокировка задачи и возврат на переделку"]
    Auditor -->|Все правила соблюдены| QA["🛡️ Viktor (7-Vector QA & AppSec)\nТесты, память, безопасность, Zero-Hardcode"]
    QA -->|Проверка пройдена| Pass["🟢 [QA PASS] -> Релиз"]
```

---

## 📋 2. The 7-Point Compliance Audit Checklist

Stanislav audits every task against 7 strict compliance points:

| # | Compliance Vector | What Stanislav Inspects | Violation Trigger |
| :---: | :--- | :--- | :--- |
| **1** | **Zero Hardcode (Rule 9)** | Diffs for literal IPs, network ports, secrets, drive paths (`C:\...`). | Any literal IP/port/path in source code ➔ 🔴 Violation. |
| **2** | **Tool Cleanliness (Rule 8)** | Git status / file creation for temporary `.ps1`, `.bat`, `.py` patch scripts. | Any temporary patch script created in codebase ➔ 🔴 Violation. |
| **3** | **Contract-First (Rule 1)** | Chatter logs for `[CONTRACT PROPOSAL]` and `[CONTRACT ACKNOWLEDGED]`. | Writing UI/API code before contract confirmation ➔ 🔴 Violation. |
| **4** | **Equipment Safety & Forum Research** | Alexey's notes for manufacturer safety limits and community forum errata. | Designing machine communication without safety bounds ➔ 🔴 Violation. |
| **5** | **Investigation Routing (Rule 10)** | Orchestrator asking user: Express vs. Deep Council on business logic queries. | Orchestrator guessing or investigating without asking user ➔ 🔴 Violation. |
| **6** | **All-19-Skills Adherence (`compliance-policy-as-code`)** | Adherence to active specialist skill mandates (`backend-architecture`, `high-load-db-tuning`, AI/RAG/Context/Fine-Tuning, `security-audit`, `qa-test-automation`, `code-refactoring-modernization`, `hardware-protocol-simulation`, `technical-documentation-adr`, `frontend-design`, `product-ux-scouting`, `sap-enterprise-automation`, REA). | Skipping mandatory skill patterns or guards ➔ 🔴 Violation. |
| **7** | **Subagent Routing, Pool Reuse & GC (Rule 12)** | Proper split between Read-Only Auditors (`agents/*.md`) and Write Workers (`Lead`/`self`/`EnableWriteTools: true`), bounded waves (3–5), disjoint ownership, and `manage_subagents(action="kill")` cleanup. | Re-sending `[ACT MODE]` edits to read-only auditors, duplicate role spawning, unbounded waves, or zombie subagent pileups ➔ 🔴 Violation. |

---

## 🚨 3. Compliance Resolution Format

When an infraction is detected, Stanislav issues an official compliance ruling:

```markdown
🔴 [RULE VIOLATION: Нарушено Правило №9 — Захардкожен IP-адрес]
- Ответственный сотрудник: Dmitry (Backend)
- Файл: Services/NetworkClient.cs:L48
- Дефект: В коде обнаружен литерал "192.168.1.10" вместо чтения из конфигурации.
- Предписание ревизора: 
  1. Удалить захардкоженный IP из NetworkClient.cs.
  2. Вынести параметр в конфигурационный файл проекта с комментарием.
  3. Предложить пользователю дополнить форму настроек интерфейса полем ввода IP.
```
