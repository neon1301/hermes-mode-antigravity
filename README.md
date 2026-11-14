# 🏛️ Hermes Fleet Enterprise для Google Antigravity (v3.6.8)

Автономный мультиагентный комплекс Hermes Enterprise: **Мастер-Оркестратор Lead (с встроенным продуктовым «Глазом Критика») + 14 универсальных специалистов (оптимизированных под быстрые модели `Gemini 3.8 Flash` со Stack-First маршрутизацией, анти-регрессионным контролем `REQ-1..REQ-N`, сквозным поиском `N из N` мест, защитой от частичных фиксов и UI-гонок, триггерной подгрузкой через `PreInvocation`, защитными хуками `PreToolUse`/`Stop`, независимым ревизором Stanislav, 3D/Digital Twin инженером Gleb `@gleb` и 360° UX-критиком/скаутом мировых трендов Критик `@kritik`) + 20 профессиональных скиллов**.

Команда Hermes спроектирована как **универсальные разработчики промышленных систем**: мы не привязаны к конкретным брендам станков или контроллеров, а работаем с любым промышленным оборудованием, автоматизированными линиями и вендорами по всему миру.

---

## 👥 Полный штаб специалистов Hermes (14 экспертов):
* 👑 **Lead (Оркестратор)** — архитектурная декомпозиция, канбан, двухконтурное исполнение (Read-Only `agents/*.md` аудит + Act/Write через Lead / `define_subagent(EnableWriteTools: true)` / `self`-пул), ограниченные волны (3–5), `manage_subagents` preflight & GC, встроенный «Глаз Критика» (Zero-Cost продуктовый и инженерный фильтр на каждом ТЗ: 4 состояния UI, человечные ошибки, Dry-Run, авто-бэкап, Channel<T>/WAL).
* ⚖️ **Stanislav** — Chief Fleet Auditor & Protocol Compliance Officer (независимый ревизор команды: Policy as Code, 12 правил флота, аудит соблюдения всех 20 скиллов, нулевой хардкод, запрет патч-скриптов, арбитраж контрактов и контроль жизненного цикла субагентов).
* 💻 **Dmitry** — Senior Backend & Systems Engineer (мультистек .NET/C#, Python/FastAPI, Node.js/TS, Go: Clean/Hexagonal, API-контракты RFC 7807, Outbox, resilience, backpressure).
* 🎨 **Elena** — Frontend Lead & UI/UX (Anthropic Frontend Design, Web & Desktop GUI WinForms/WPF, контракт 4 состояний, анимации и формы настроек GUI, иконки через `image-generator`, A11y).
* 🌐 **Gleb** — Lead 3D Graphics & Industrial Digital Twin Engineer (`procedural-3d-digital-twin`: процедурные 3D-модели Three.js/WebGL, цифровые двойники станков, 3D-карта цеха T01–T20 через `InstancedMesh`, привязка телеметрии к 3D-кинематике и шейдерам, WebView2-мост, нулевые утечки VRAM).
* 🔥 **Критик (`kritik`)** — 360° Product Critic, Global Tech Trend Scout, Post-Audit Challenger & UX Inspector (`product-ux-scouting`: 360° самостоятельная разведка мировых продуктовых и инженерных трендов, киллер-фич, Doctor-mode, ускорения ядра и эргономики по RU/CN/BE/EU/JP/Global форумам через `search_web` и Read-Only `browser` + роль замыкающего супер-рецензента аудита с выбором лучшего мирового решения + беспощадная прожарка интерфейса по `P0–P3` и эвристикам Нильсена `0–4` + проверенные библиотеки и паттерны `Adopt/Trial/Hold`; строго Read-Only Scout в изолированном контексте для экономии токенов и защиты главного чата).
* 🛡️ **Viktor** — Lead QA Automation & AppSec Reviewer (7-векторный барьер: `qa-test-automation` + прокачанный `security-audit` — Cloudflare 6-Phase Fresh-Verifier, Trail of Bits `differential-review`/`sharp-edges`, OWASP Auth/JWT/IDOR/SSRF/Crypto, DevSecOps SCA/Docker/CI, TDD, E2E и Zero-Hardcode).
* ⚙️ **Alexey** — Lead Industrial Hardware, Equipment & Protocol Systems Engineer (универсальное исследование оборудования и вендоров, даташиты, мануалы, регистровые карты, Modbus, Profinet, EtherCAT, OPC UA, сокеты, безопасность станка).
* 📊 **Ruslan** — Principal SAP & Enterprise Integration Architect (Все 5 столпов интеграции: SAP .NET Connector NCo 3.1/4.0, BAPI/RFC транзакции, SAP GUI Scripting без утечек COM, асинхронные IDoc/ALE очереди, современные OData/REST API).
* 🔍 **Artem** — Reverse Engineering (REA methodology, реверс бинарных протоколов, декомпиляция .NET/CIL и ASAR/JS, Evidence Ledger).
* 🧠 **Mikhail** — AI/ML & LLM Systems Engineer (полный стек AI: `ai-rag-engineering` Hybrid RAG + HNSW + Langfuse/RAGAS + Polars/DuckDB, `agent-context-memory-engineering` контекст/память/LLM-as-a-Judge/Promptfoo+Garak red-team, `llm-finetuning-multimodal-ops` LoRA/Unsloth/TRL/vLLM/Docling/Whisper).
* 🧹 **Sergey** — Senior Refactoring Architect & Code Modernizer (`code-refactoring-modernization`: CRAP-Score triage, Characterization Tests, Strangler Fig, SOLID-декомпозиция < 300-400 строк без патчеров).
* 🏭 **Igor** — Industrial Hardware & Protocol Simulation Engineer (`hardware-protocol-simulation` + `socket-network-diagnostics`: stateful FSM эмуляторы PLC/TCP/UDP, `--seed` воспроизводимость, fault injection и CRC-валидный фаззинг).
* 📝 **Anna** — Principal Technical Writer & Architecture Documentation Architect (`technical-documentation-adr` + `c4-architecture-mermaid`: grounded truth по коду, Diátaxis, `ADR-NNNN`, OpenAPI, паспорта бинарных протоколов, цеховые runbook).
* 🗄️ **Denis** — Senior Database Architect & High-Load DBA (SQLite/libSQL, PostgreSQL, MSSQL, MySQL/InnoDB, Redis/MongoDB, ClickHouse/DuckDB: WAL/`BEGIN IMMEDIATE`, MVCC/Vacuum, RCSI, InnoDB Gap Locks, SARGable-индексы, пулы и миграции).

---

## 🛠️ Встроенная библиотека профессиональных скиллов (20 скиллов):

1. **`compliance-policy-as-code`** — Автоматизированный аудит правил флота, архитектурные фитнес-функции (Thoughtworks), AST-фильтры Policy as Code (Semgrep/ast-grep), арбитраж контрактов и машиночитаемый отчёт `compliance-report.json`.
2. **`hermes`** — Мастер-оркестрация мультиагентной команды (v3.6.8): Repo Map, двухконтурный цикл `Plan/Audit (Read-Only) vs Act/Write`, триггерная подгрузка протокола (`PreInvocation`), анти-регрессионный реестр `REQ-1..REQ-N` + сквозной поиск `N из N` мест, `Pool Reuse First`, ограниченные волны 3–5, Single Build Gate, `Subagent GC`, Git Auto-Revert, Memory Bank, TDD и `/hermes save`/`resume`.
3. **`backend-architecture`** — Универсальный мультистековый бэкенд (.NET/C#, Python/FastAPI, Node.js/TS, Go): Clean/Hexagonal, REST/OpenAPI/RFC 7807, Idempotency & Outbox, Circuit Breaker/Retry-Jitter, bounded backpressure, кэширование и zero-alloc перформанс.
4. **`industrial-equipment-research`** — Универсальная методология исследования промышленного оборудования, станков, контроллеров и датчиков любых мировых производителей. Поиск мануалов, даташитов, защитных директив и майнинг форумов (PLCS.net, Control.com).
5. **`socket-network-diagnostics`** — Диагностика промышленных сокетов, устранение дефектов `CA2022 Stream.Read` (`ReadExactlyAsync`), защита от полузакрытых соединений, бюджеты таймаутов и keep-alive.
6. **`sap-enterprise-automation`** — Промышленная интеграция со всеми модулями SAP (NCo 3.1/4.0, BAPI-транзакции, SAP GUI Scripting без утечек COM, IDoc очереди, OData REST).
7. **`frontend-design`** — Официальный авторский дизайн от Anthropic (борьба с AI-клише, токен-палитры из 4–6 цветов, правило Коко Шанель).
8. **`reverse-engineer-anything` (REA)** — Мировой стандарт реверса закрытых программ, .NET/CIL сборок, Electron/ASAR и протоколов.
9. **`security-audit`** — Продвинутый AppSec и аудит кибербезопасности: Cloudflare 6-Phase **Fresh-Verifier** (`confirmed` vs `needs_validation` vs `rejected`), Trail of Bits `differential-review` / `sharp-edges` / `insecure-defaults`, OWASP Top 10 / ASVS (Auth, JWT, OAuth2, IDOR/BOLA, SSRF, XSS/CSRF, криптография, TLS), сокет/DoS-защита, DevSecOps (`Semgrep`/`Trivy`/`Gitleaks`, Docker, GitHub Actions) и `findings.json` с CWE.
10. **`c4-architecture-mermaid`** — Инженерная C4-модель и интерактивные диаграммы Mermaid для наглядного картирования системы.
11. **`high-load-db-tuning`** — Мультидвижковый промышленный тюнинг БД (SQLite `WAL + BEGIN IMMEDIATE` + UNC-защита, PostgreSQL MVCC/Vacuum/PgBouncer, MSSQL RCSI/DMV/deadlock `1205`, MySQL/InnoDB PK/Gap Locks, Redis/MongoDB/ClickHouse/DuckDB, SARGability и zero-downtime миграции).
12. **`ai-rag-engineering`** — End-to-end AI, Hybrid RAG (Dense + BM25 + RRF, Cross-Encoder reranking), тюнинг Qdrant/`pgvector`/Chroma (HNSW, quantization, payload indexes), Langfuse/OTel трассировка, RAGAS-эвалы, Structured Outputs (Pydantic/Zod), Semantic Caching, Polars/DuckDB и локальный ONNX/GGUF инференс.
13. **`code-refactoring-modernization`** — Безопасная декомпозиция монолитов (CRAP-Score triage, 300-400 строк на модуль, Seam extraction, устранение циклов и мертвого кода), Characterization Tests (>=80% baseline), Strangler Fig поэтапный cutover, Branch by Abstraction и атомарные правки без патч-скриптов.
14. **`qa-test-automation`** — Строгий 7-векторный барьер `[QA PASS]` (включая Zero-Hardcode Вектор 7), Iron Law TDD, Systematic Root-Cause Debugging, устранение тест-антипаттернов и CRAP-рейтинг, Property-Based тестирование (Roundtrip, Idempotence, Oracle, Invariants), flaky-free Playwright/E2E и стресс-тесты гонок/утечек.
15. **`technical-documentation-adr`** — Документация строго по коду (grounded truth без выдуманных символов), система Diátaxis (4 квадранта), `ADR-NNNN` решения, OpenAPI/AsyncAPI (RFC 7807), паспорта бинарных сокет-протоколов (байты, endianness, CRC), цеховые runbook-регламенты (в связке с **`c4-architecture-mermaid`**).
16. **`hardware-protocol-simulation`** — Универсальные stateful FSM эмуляторы оборудования и PLC (Modbus TCP, OPC UA, бинарные/ASCII сокеты), Zero-Hardcode динамические порты, детерминированный `--seed`, fault injection (байтовая фрагментация, TCP `RST` vs `FIN`, jitter) и CRC-валидный фаззинг пакетов.
17. **`agent-context-memory-engineering`** — Инженерия контекста и архитектуры автономных ИИ-агентов: борьба с деградацией внимания (*lost-in-the-middle*, poisoning), оптимизация KV-cache, сжатие с якорями, многоуровневая память агентов, изоляция субагентов, непредвзятый LLM-as-a-Judge (position swap) и автоматический LLM Red-Teaming (`Promptfoo` / `Garak`).
18. **`llm-finetuning-multimodal-ops`** — Fine-Tuning и Post-Training (`Unsloth`, `LLaMA-Factory`, `TRL` SFT/DPO/GRPO), гигиена синтетических датасетов и паритет chat-template/EOS, высоконагруженный GPU-сервинг (`vLLM` / `SGLang`, Continuous Batching, prefix caching, FP8/AWQ/GGUF), сложный парсинг PDF/таблиц (`Docling`) и мультимодальные пайплайны (`Whisper` VAD / VLM).
19. **`product-ux-scouting`** — 360° продуктовая критика, разведка мировых инженерных и продуктовых трендов (RU/CN/BE/EU/JP/US), киллер-фичи, ускорение ядра, Doctor-mode и аудит эргономики/UI глазами обычного пользователя (Нильсен `0–4`, приоритеты `P0–P3`, режим «прожарки» `Roast Mode` с `File:Line`, иконки через `image-generator`/SVG, анимации с `Dispose()`, 5-пунктовая проверка `Adopt/Trial/Hold`, строго Read-Only Scout).
20. **`procedural-3d-digital-twin`** — Процедурное 3D-моделирование (Three.js/WebGL), цифровые двойники оборудования, визуализация телеметрии станков (обороты, обрыв нити, аварии, термокарты), интерактивная 3D-карта цеха (T01–T20, InstancedMesh, Raycaster), WebGL VRAM гигиена (dispose) и интеграция с WinForms/WPF через WebView2.

---

## ⚡ Доступные команды:

| Команда | Назначение |
| :--- | :--- |
| **/hermes [задача]** | Запуск оркестратора, декомпозиция цели и координация специалистов |
| **/hermes board** | 📊 Вывод живой интерактивной Канбан-доски прямо в чат через Generative UI |
| **/hermes fix-warnings** | 🧹 Пакетное устранение предупреждений компилятора до нуля (Zero Warnings Policy) |
| **/hermes audit** | ⚖️ Независимая ревизия соблюдения всех 12 правил флота и 19 скиллов силами Stanislav (Compliance) |
| **/hermes save** | 💾 Мгновенный снимок спринта в `.hermes/checkpoint.md` |
| **/hermes resume** | 🔄 Восстановление контекста, задач и договоренностей из Memory Bank |
| **/hermes review** | 🛡️ Комплексный аудит кода силами Viktor (QA) по 7 векторам надежности (`qa-test-automation` + `security-audit`) |
| **/hermes standup** | 📋 Стендап-синхронизация команды с фиксацией в `.hermes/standups.md` |
| **@имя [запрос]** | Прямой вызов конкретного специалиста (`@kritik` / `@критик`, `@elena`, `@stanislav`, `@alexey`, `@dmitry`, `@viktor`, `@ruslan` и др.) |

> **Когда Hermes включается.** Только по явному запросу: сообщение начинается с `/hermes`, просьба «включи режим Hermes» или обращение `@имя`. Упоминание `/hermes` в середине вопроса режим не включает. Вне режима плагин ничего не добавляет в контекст (always-on правила нет), а хуки Clean Edits / Zero-Hardcode / QA Gate пропускают всё без проверок.

---

## 📦 Быстрая установка на любой ПК:

**Кроссплатформенно (Windows / macOS / Linux — рекомендуемый способ через CLI):**
```bash
git clone https://github.com/neon1301/hermes-mode-antigravity.git
cd hermes-mode-antigravity
agy plugin install .
agy plugin validate . --strict
```

**Windows (через PowerShell-инсталлятор с автопроверкой хуков):**
```powershell
git clone https://github.com/neon1301/hermes-mode-antigravity.git
cd hermes-mode-antigravity
powershell -ExecutionPolicy Bypass -File .\install.ps1
```
