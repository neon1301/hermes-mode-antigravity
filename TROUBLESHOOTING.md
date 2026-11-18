# 🛠️ Hermes Fleet Troubleshooting Guide

This guide explains the most common guard and gate notices, why they occur, and how to resolve them immediately.

### 🔎 Quick Code Index (`Ctrl+F`)

| Code / Gate | Meaning (1 line) | First Action |
| :--- | :--- | :--- |
| `plan_missing` | Source write blocked — `.hermes/plan.md` does not exist | Create `.hermes/plan.md` (4 sections + EARS-lite) and confirm via `ask_question` |
| `plan_unconfirmed` | `.hermes/plan.md` exists, but authentic `[Делай]` confirmation is missing | Show plan and ask user via `ask_question` (`[Делай]` / `[Убрать лишнее]` / `[Добавить своё]`) |
| `plan_revision_pending` | User chose `[Убрать лишнее]` / `[Добавить своё]` or edit phrasing | Update `.hermes/plan.md` to v2 and request fresh confirmation |
| `plan_negated_consent` | User negated plan («не надо план, делай сразу», «план не подтверждаю») | Get explicit `[Делай]` confirmation or use Fast-Path / human `planGate: "off"` |
| `plan_lint_failed` | `.hermes/plan.md` failed EARS-lite / 4-section / convention-source lint | Fix reported sections/items/sources in `.hermes/plan.md` and re-confirm |
| `plan_tampered` | `.hermes/plan.md` SHA-256 changed after confirmation (v1 -> v2) | Confirm updated plan v2 via a new `ask_question` (never silently overwrite) |
| `plan_stale` | `.hermes/plan.md` edited after `ask_question` was sent (TOCTOU) | Re-send updated `.hermes/plan.md` via `ask_question` |
| `grade_missing` | Confirmed-plan Stop blocked — no authentic PASS `.hermes/grade-report.json` | Invoke independent read-only grader outside council & write-workers |
| `grade_conflict_of_interest` | Grader UUID belongs to council roster, write-workers, or Lead | Re-invoke a read-only specialist outside `.hermes/council-state.json` & writers |
| `grade_hash_mismatch` | `taskHash`/`planHash`/`rubricHash` in `hermes-grade` does not match confirmed rubric | Re-run grader against current `.hermes/rubric.json` |
| `grade_incomplete_coverage` | `hermes-grade` omitted one or more `reqId` items from `.hermes/rubric.json` | Re-run grader covering 100% of `rubric.items` |
| `grade_evidence_invalid` | `evidence` `path:line` does not exist or line exceeds file length | Provide real existing workspace `path:line` within valid line bounds |
| `grade_overall_mismatch` | Declared `overall` contradicts item verdicts (`UNKNOWN` can never be `PASS`) | Re-emit `overall` matching `UNKNOWN→NEEDS_HUMAN`, `NOT_FULFILLED→REWORK`, all `FULFILLED→PASS` |
| `grade_rework_required` | Grader returned `REWORK` (cycle 1–2 of 3) | Fix `NOT_FULFILLED` items and request fresh independent grade |
| `grade_rework_ceiling` | Reached 3/3 `REWORK` cycles on `taskHash` | Call `ask_question`: `[Продолжить доработку]` / `[Принять как есть]` / `[Остановить задачу]` |
| `grade_needs_human` | Grader marked one or more items `UNKNOWN` | Call `ask_question`: `[Дать улику]` / `[Переделать]` / `[Принять риск как есть]` |
| `grade_override_negated` | User negated «Принять как есть» override | Rework unresolved items or obtain explicit validated user choice |
| `team_stop_active` | Hard-stop `.hermes/team-stop.json` active (`sec_l1_pattern` / `tamper_protected` / `plan_tampered`) | Diagnose (read-only council allowed) and obtain validated user unblock via `ask_question` |
| `l2_binding_uncertain` | Multiple L2 `invoke_subagent` calls in one step without `tool_call_id` | Re-invoke L2 auditor / grader as a single `invoke_subagent` call |
| `plan_ask_mirror_invalid` | Plan confirmation `ask_question` contained internal IDs (`REQ-*`/`FINDING-*`) | Rewrite plan prompt in plain Russian with 4 mirror sections |
| `logs_direct_write_deny` | Agent attempted direct write into `logs/` | Use portable `scripts/export-logs.mjs` from installed plugin root |
| `xray_window_plain_ru_no_internal_codes` | X-ray advisory window had internal codes, scores/`%`, or `>5` items | Show `<=5` plain-Russian items in 3 buckets + `ещё N в отчёте` |
| `xray_delete_without_zero_ref_proof_deny` | Attempted delete of X-ray flagged code/packaged file without `refs=0` proof | Verify zero refs across repo or authorize deletion explicitly in plan |
| `xray_fix_now_requires_plan_revision_deny` | Code edit after `[Почини сейчас]` before plan revision `v(N+1)` | Update `.hermes/plan.md` to `v(N+1)` and confirm `[Делай]` via `ask_question` |
| `xray_consent_negated_deny` | User negated X-ray fix («не чини сейчас» / «ничего не удаляй») | Leave flagged file untouched unless explicitly re-approved in plan |
| `xray_error` | Advisory X-ray scanner failed or hit Stop headroom (fail-open) | Session is NOT blocked; re-run `scripts/xray-scan.mjs --workspace=.` manually |

---

### 1. `Hermes Rule 12 (Step 0 Model Handshake)`
* **Message:** `В этом чате ещё не выполнен выбор модели для субагентов! ПЕРВЫМ действием в новой сессии /hermes... вызовите инструмент ask_question...`
* **Why it happens:** At the beginning of every new chat session, Hermes requires an explicit agreement on which model and reasoning tier (High / Medium / Low) to use for subagents.
* **Resolution:** Call `ask_question` with 2 questions:
  1. *Какую модель ИИ использовать для всех субагентов?* (e.g., Gemini 3.8 Flash)
  2. *Какой режим (уровень ума) поставить субагентам?* (High, Medium, Low)
  Wait for the user's answer, record it in `.hermes/profile.json` (`{ "model": "<model>", "tier": "high|medium|low", "updatedAt": "<ISO-timestamp>" }`) and `.hermes/checkpoint.md`, and only then proceed with the task.

---

### 1b. `Hermes Gate (Council Gate: Pre-Plan Specialist Consultation)`
* **Message:** `Hermes Gate (Council Gate): Первая запись задачи (<tool>) заблокирована! До перехода к правкам кода или созданию воркеров Lead обязан провести Council Gate — определить затронутые домены по specialist-dispatch-matrix.md и вызвать ask_question: «Посоветоваться с советом специалистов до финального плана?»...`
* **Why it happens:** In active `/hermes` orchestrations for Standard/Complex tasks, Lead Orchestrator must not skip domain consultation or design solutions solo. The PreToolUse hook blocks the first write tool (`write_file`, `edit_file`, `define_subagent` with `EnableWriteTools: true`, `swarm`) until Council Gate is resolved.
* **Resolution:**
  1. **Standard interactive flow:** Call `ask_question` with the 3 canonical choices:
     - `(Recommended) Посоветоваться с работниками: @имена — независимые мнения + синтез (1 раунд)`
     - `🗣️ Собраться за столом: @имена — живое обсуждение, 3 стадии (NGT/Дельфи)`
     - `Нет, оркестр решает сам (экономия токенов)`
  2. If the user selects «Lead решает сам», writes are immediately unlocked and logged in `.hermes/gate-log.jsonl`.
  3. If the user selects «Собрать совет», launch the specialists in Contour A (read-only), await their authentic deliveries via `<SYSTEM_MESSAGE>`, present the comparative synthesis table in chat, and save state to `.hermes/decisions.md` and `.hermes/council-state.json`.
  4. **Exceptions & Configuration:**
     - Trivial fixes (Micro/Fast-Path, typo, 1-line changes) and `/hermes fix-warnings` bypass the gate automatically.
     - Direct specialist queries (`@dmitry`, `@elena`, etc.) are exempt.
     - To disable globally or in CI test scripts, a **human user** (outside agent tools) may set `"councilGate": "off"` in `.hermes/config.json` or export `HERMES_COUNCIL_GATE=off`.
     - **Gate Config Tamper Protection (v4.6.2):** `.hermes/config.json` is strictly protected from agent `write_file`/`edit_file`/shell mutations so an agent cannot weaken gates (`councilGate: "off"`, emptying `protectedVerdictPaths`, or downgrading `qaVerdictMode`). Built-in protected paths are immutable (config can only extend them). If `.hermes/config.json` is missing, unreadable, or invalid JSON, gates fail closed to strict mode (`councilGate: "ask"`). Every bypass/exception records its explicit `source` in `.hermes/gate-log.jsonl`.
     - In `"councilGate": "auto"` mode, the prompt dialog is bypassed, but specialist deliveries remain strictly mandatory before writing.

---

### 1c. `Hermes «Руль» (Plan Gate — v4.7.0)`
* **Codes:** `plan_missing`, `plan_unconfirmed`, `plan_revision_pending`, `plan_negated_consent`, `plan_lint_failed`, `plan_tampered`, `plan_stale`.
* **Why it happens:** For Standard/Complex tasks with new behavior (independently of council mode, including solo or `councilGate: "off"`), `clean-edits-guard` blocks code writes and write-worker spawns (`define_subagent`, `swarm`, `invoke_subagent(self)`) until `.hermes/plan.md` passes EARS-lite lint and receives authentic user confirmation (`[Делай]`), frozen mechanically into protected `.hermes/plan-state.json` and `.hermes/plan-ledger.jsonl`.
* **Resolution by code:**
  - **`plan_missing` / `plan_unconfirmed`:** Create `.hermes/plan.md` (meta-path, writable before confirmation) with the 4 required sections (`ВОТ ЧТО Я ПОНЯЛ`, `ВОТ ЧТО Я ДОБАВЛЮ САМ`, `ЧЕГО Я НЕ ДЕЛАЮ`, `СПРОШУ ТОЛЬКО ОДНО-ДВА`), show the 1-screen plan to the user, and call `ask_question` with `[Делай]`, `[Убрать лишнее]`, `[Добавить своё]`.
  - **`plan_revision_pending`:** User picked «Убрать лишнее» / «Добавить своё» or a hybrid edit («Делай, но убери Д1»). Revise `.hermes/plan.md` (v2), note the reason, and request fresh confirmation.
  - **`plan_negated_consent`:** Negations («не надо план, делай сразу», «план не подтверждаю», «никакого плана») are never treated as approval. Obtain explicit `[Делай]`, or use `--fast-path` for trivial tasks / human-authored `"planGate": "off"` in `.hermes/config.json` (`HERMES_PLAN_GATE=off`).
  - **`plan_lint_failed`:** Ensure every item in «Понял» and «Добавлю сам» follows `КОГДА <условие> — СИСТЕМА ДОЛЖНА <поведение>. Проверка: <тест или артефакт>` (no empty stubs like `Проверка: ок`); for any «так принято» / `best practice` claim add `https://` URL + verbatim quote + date (inline or `## Источники` `[n]`), existing local `path:line`, or «мой выбор, не конвенция». («Добавлю сам» may be honestly empty: «Ничего сверх твоей просьбы».)
  - **`plan_tampered` / `plan_stale`:** `.hermes/plan.md` changed after confirmation or after `ask_question` was sent. Send a new `ask_question` to confirm plan `v2` cleanly.

---

### 1d. `Hermes «Инспектор» (Independent Grader, Team-Stop & L2 Binding — v4.7.1)`
* **Codes:** `grade_missing`, `grade_conflict_of_interest`, `grade_hash_mismatch`, `grade_incomplete_coverage`, `grade_evidence_invalid`, `grade_overall_mismatch`, `grade_rework_required`, `grade_rework_ceiling`, `grade_needs_human`, `grade_override_negated`, `team_stop_active`, `l2_binding_uncertain`.
* **Why it happens:**
  - **Independent Grading (`grade_*`):** Every confirmed-plan task mechanically derives protected `.hermes/rubric.json`. Stop (`hooks/qa-gate.mjs`) requires an authentic `hermes-grade` delivery from a read-only specialist outside `councilRoster ∪ writeWorkers ∪ {Lead}` with verified `path:line` evidence and 100% `reqId` coverage (not disabled by `qaVerdictMode="legacy"`, `economy skip`, or `MAX_RETURNS = 2`).
  - **Hard-Stop (`team_stop_active`):** Layer 1 security (`sec_l1_pattern`), protected artifact/config tamper (`tamper_protected`, file-write or shell), or `plan_tampered` activates `.hermes/team-stop.json` (`status: "active"`), halting all writes and write-worker spawns for both Lead and subagents.
  - **L2 Binding (`l2_binding_uncertain`):** Multiple L2 auditor/grader `invoke_subagent` calls in the same step without `tool_call_id` fail closed to prevent misattributed verdicts.
* **Resolution:**
  - **`grade_*`:** Summon an independent read-only specialist (`@viktor`/`@stanislav` if not in council, else any other free read-only specialist) with paths to `.hermes/rubric.json`, `.hermes/*`, and `git diff` (see `skills/hermes/references/independent-grading-protocol.md`). On `NEEDS_HUMAN` or `REWORK` 3/3 ceiling, invoke `ask_question` for a validated user decision.
  - **`team_stop_active`:** Read-only council, diagnostics, `ask_question`, and emergency `manage_subagents(kill/kill_all)` remain allowed. Resolve the root violation and obtain explicit user approval via `ask_question` («Разблокировать команду»); mechanical `PASS` never clears a hard-stop.
  - **`l2_binding_uncertain`:** Re-invoke the auditor/grader as a single `invoke_subagent` call (or on a harness providing `tool_call_id`).

---

### 2. `Hermes Rule 12 (Policy as Code: Model Tier Mismatch)`
* **Message:** `Hermes Rule 12 (Policy as Code: Model Tier Mismatch): В текущей сессии выбран уровень <Tier>...`
* **Why it happens:** In Step 0 Handshake, a specific reasoning tier was chosen, but an `invoke_subagent` call attempted to use an incompatible `Model` enum:
  - **High:** Passing `Model: "flash"` or `"flash_lite"` is denied to prevent silent downgrades of the reasoning budget. Use `Model: "inherit"` (inherits host `gemini-3.8-flash-high`) or `"pro"`.
  - **Medium:** On a Flash High host, passing `Model: "inherit"` without explicit model is denied to prevent accidental overspending. Pass `Model: "flash"` explicitly.
  - **Low:** Passing models other than `Model: "flash_lite"` is denied, with an exception (whitelist) allowing `Model: "pro"` for `@elena` (UI visual taste) and write workers (`self`).
  - **Unspecified / External LLMs (`tier=null`):** If no tier was specified (e.g. Claude Sonnet or GPT-OSS), the guard operates in fail-open mode, permitting valid enum values (`inherit`, `flash`, `flash_lite`, `pro`).
* **Resolution:** Ensure the requested `Model` enum matches the tier recorded in `.hermes/profile.json`.

---

### 3. `Hermes Rule 8 (Tool Cleanliness / No Patch Scripts)`
* **Message:** `Запрещено создавать временные скрипты-патчи (*.ps1, *.bat, *.py)...`
* **Why it happens:** Attempting to run `sed -i`, ad-hoc python scripts, bash scripts, or PowerShell files to edit source code.
* **Resolution:** Use the native tools `edit_file` (for surgical in-place edits) and `write_file` (for new files).

---

### 4. `Hermes Rule 9 (Zero Hardcode & Dynamic Configuration)`
* **Message:** `Обнаружен захардкоженный IP-адрес / порт / путь / секрет...`
* **Why it happens:** Writing literal IP addresses (`192.168.x.x`), drive letters (`C:\...`), passwords, or API tokens directly into application source code.
* **Resolution:** Move all environment-specific values to configuration providers (`appsettings.json`, `.env`, configuration classes, or environment variables). If a literal is truly unavoidable (e.g. local loopback in dev harness or fixed protocol constant), add a **line-scoped** escape comment with a mandatory non-empty reason directly on the trigger line (`N`) or adjacent line (`N-1` / `N+1`): `// hermes-hardcode-ignore: <причина>` (legacy shim forms `hermes-hardcode-ignore(<причина>)` and `hermes-hardcode-ignore = <причина>` are also recognized strictly within `±1` line; see `docs/adr/0001-l2-diff-review-and-anti-self-signing.md`). Note: violations 2+ lines away, bare markers without a reason, and blanket file-wide directives in the marker zone (`hermes-hardcode-ignore-file`, `-all`, `-global`, `-block`, or blanket words before `:`/`=`/`(`) are strictly rejected (`deny`). Free-form reason text after the delimiter is never blocked by blanket keywords (e.g., `// hermes-hardcode-ignore: globally unique protocol constant` is allowed strictly within `±1` line). This directive never bypasses Layer 1 security patterns (`innerHTML`, `eval`, `pickle`, `interlock`).

---

### 5. `Hermes Gate (Попытка N/2): изменено исходников: X`
* **Message:** `Чтобы не тратить токены на мелких правках, вызовите ask_question и спросите пользователя: «Я закончил доработку. Запустить сотрудников на проверку... или завершить без проверки?»`
* **Why it happens:** Source code files were modified, and the Stop hook prevents silent exits without either running automated checks or giving the user the option to finish with token economy.
* **Resolution:** Call `ask_question` asking the user whether to run verification (`[QA PASS]` via Viktor) or complete immediately. If the user chooses token economy (`skip`, `без проверки`), the gate allows termination for non-UI code. For UI files, `[UX PASS]` from Kritik is strictly required even in economy mode to guarantee layout and visual integrity. Casual replies (`достаточно`, `no`) do not bypass verification.

---

### 6. `GitHub Actions CI Billing Lock & Local CI`
* **Message:** `The job was not started because your account is locked due to a billing issue`
* **Why it happens:** GitHub Actions runs may be paused at the account level when free-tier action minutes, storage quotas, or expired payment authorizations trigger a billing lock, even on public repositories where standard runners are otherwise free.
* **Resolution:** 
  1. Inspect `Settings -> Billing and plans -> Payment information / Overview` on GitHub. Ensure active products are on GitHub Free ($0.00) and any past-due invoices are resolved.
  2. Use the **Local CI Gate**: Run `./verify.ps1` (Windows) or `./verify.sh` (macOS/Linux).
  3. Pre-push automation: Run `git config core.hooksPath .githooks` to automatically block broken commits before pushing.

---

### 7. `Token Economy Gate: Self-Signing Protection & Fail-Closed Rationale`
* **Context & Threat Model:** In Hermes, after source edits, Lead must ask the user whether to run full QA (`[QA PASS]` via Viktor) or proceed under token economy. If the gate blindly trusted any step containing `Created At:` / `Completed At:`, the Lead model could forge these headers in prose and bypass QA without user consent (self-signing regression).
* **Empirical Evidence (Live Antigravity Transcript):**
  From session transcript `transcript.jsonl` (Steps 367–368):
  ```json
  // Step 367: Planner tool call
  {
    "step_index": 367,
    "source": "MODEL",
    "type": "PLANNER_RESPONSE",
    "status": "DONE",
    "tool_calls": [{ "name": "ask_question", "args": { ... } }]
  }

  // Step 368: Tool response step in Antigravity harness
  {
    "step_index": 368,
    "source": "MODEL",
    "type": "GENERIC",
    "status": "DONE",
    "created_at": "2026-11-14T13:35:27Z",
    "content": "Created At: 2026-11-14T18:35:27+05:00\nCompleted At: 2026-11-14T18:37:28+05:00\nA1: (Recommended) Gemini 3.8 Flash\nA2: High"
  }
  ```
  *Analysis:* The live harness generates `source: "MODEL"`, `type: "GENERIC"`, and `status: "DONE"`, but currently omits `tool_call_id` binding on the step itself.
* **Fail-Closed Contract (Updated in v3.7.3 — Platform Hardening):**
  1. **Bound Platforms:** Automated harness tool outputs are accepted ONLY if `status === 'DONE'` AND `tool_call_id` strictly matches the `ask_question` call ID.
  2. **Unbound Platforms (Antigravity Runtime):** When the platform omits `tool_call_id` on `ask_question`, the gate accepts the response ONLY if all three conditions hold: (a) `isDirectNext` (immediate next step after `ask_question`), (b) `status === 'DONE'`, and (c) authentic execution banner (`Created At:` / `Completed At:`). Any later system tool outputs (such as `run_command echo ...`) lacking call ID binding are strictly ignored and NEVER accumulated in `postEditAskAnswer`.
  3. **Rejection of Unverified Steps:** Steps with `source: 'MODEL'` lacking verified harness metadata (`status: 'DONE'` and execution banner) are NEVER accepted as user skip decisions.
  4. **Explicit User Input:** Explicit user input (`source: 'USER_EXPLICIT'` or `'USER'`, e.g. clicking an interactive choice or user typing `A1: (Recommended) Без проверки`) is always accepted.
  5. **Residual Limitation:** Parallel tool calls within the same step as `ask_question` are prohibited by protocol (see ADR 0001).

---

### 8. `Gate Log Isolation & Size Management (.hermes/gate-log.jsonl)`
* **Behavior:** Decision audit logs (`clean-edits-guard` and `qa-gate`) are written **only** when Hermes is active in the session. Normal user chats never generate `.hermes/`.
* **Rotation:** When `gate-log.jsonl` exceeds **512 KB**, it automatically rotates to `gate-log.1.jsonl`.
* **Git Cleanliness:** The entire `.hermes/` directory is in `.gitignore` to prevent committing logs, checkpoints, or profiles to the repo.

---

### 8b. `Тестирование внешних проектов в Antigravity (payload.workspacePaths)`
* **Поведение:** Antigravity передаёт хукам массив `payload.workspacePaths`, указывающий на корневую папку, открытую в окне IDE (`File -> Open Folder`).
* **Проблема:** Если вы тестируете сторонний проект (например, `E:\hermes-smoke\telemetry-client`), но сессия Antigravity открыта в репозитории самого плагина (`e:\hermes-mode-antigravity`), хуки плагина (`qa-gate.mjs`, `clean-edits-guard.mjs`, `qa-runner.mjs`) будут рассчитывать `diffHash`, искать `.hermes/tasks.json` и писать логи в репозитории плагина, а не во внешнем проекте.
* **Решение:**
  1. **Отдельное окно IDE:** Всегда открывайте целевой проект через `File -> Open Folder` в отдельном окне Antigravity.
  2. **Реестр требований (.hermes/tasks.json):** Создайте в корне проекта `.hermes/tasks.json` с задачами (`REQ-1..N` со статусом `DONE`) перед запуском верификации.
  3. **Канонический запуск раннера:**
     `node <путь-к-плагину>/hooks/qa-runner.mjs --reqLedger=REQ-1,REQ-2 --viktorUuid=<uuid> --conversationId=<convId> --turnMarker=<turn>`
  4. **Отказ от реестра для быстрых тестов:** Если проект ad-hoc и реестр требований не ведётся, передайте `--requireReqLedger=false` или установите `HERMES_REQUIRE_REQ_LEDGER=0`.

---

### 9. `E2E Smoke Verification Checklist (12 Points)`
1. **Trigger:** Start a new chat with `/hermes` or `@dmitry`.
2. **Phase 0 Handshake:** Verify `ask_question` appears with model + tier options.
3. **High Tier Enforcement:** Select `Gemini 3.8 Flash (High)` -> verify `.hermes/profile.json` has `tier: "high"`.
4. **Subagent Model:** Verify `invoke_subagent` passes `Model: "inherit"`.
5. **Low Tier Escalation:** In Low tier, verify `@elena` with `Model: "pro"` is allowed.
6. **Tool Rule 8:** Run `sed -i` -> verify immediate `deny`.
7. **Tool Rule 9:** Attempt to write hardcoded `http://192.168.1.1` in source -> verify `deny`.
8. **Contour A Audit:** Ensure read-only specialists do not write files.
9. **Single Build Gate:** Lead executes build/test once per wave.
10. **Token Economy Gate:** After source edits, verify `ask_question` asks whether to run review.
11. **Anti-Premature Kill:** Verify `manage_subagents(kill)` is blocked while subagents are running.
12. **Session Persistence:** Call `/hermes save` -> verify `.hermes/checkpoint.md` & `.hermes/profile.json` are updated.

---

### 10. `Как проверить, что хуки реально исполняются в вашей поверхности (App / IDE / CLI)`
* **Официальный контекст:** В официальной документации Antigravity плагинные хуки (`hooks.json`) гарантированно активируются для CLI-интерфейса (`agy`). В некоторых графических поверхностях (IDE / App) механизмы диспетчеризации хуков могут вести себя иначе (или работать в режиме fail-open).
* **Пошаговый смоук-чек:**
  1. **Инъекция протокола (PreInvocation):** Отправьте в чат команду `/hermes статус`. В первом же ответе модели или системном контексте должен присутствовать невидимый маркер `<!-- HERMES_PROTOCOL_LOADED -->`.
  2. **Создание директории и лога гейта (PreToolUse):** Выполните чтение файла (`view_file` или `read_file`) или запуск команды (`run_command`). Проверьте корень текущего воркспейса (`workspacePaths[0]`): там должна появиться скрытая папка `.hermes/` и файл `.hermes/gate-log.jsonl`.
  3. **Проверка содержимого лога:** Откройте `.hermes/gate-log.jsonl` — в нём должны быть записи с полями `{"hook":"clean-edits-guard","decision":"allow|deny",...}`.
  4. **Шлюз при завершении (Stop):** Отредактируйте исходный код (`src/...`). При попытке завершить ход без вызова `ask_question` или проверки субагентом Stop-хук вернёт `continue` и запишет решение в `.hermes/gate-log.jsonl`.
  5. **Что делать, если `.hermes/gate-log.jsonl` не появляется:**
     - Убедитесь, что плагин установлен и включен: `agy plugin list` или перезапустите сессию.
     - Проверьте, что в `hooks.json` пути к скриптам относительны (`node ./hooks/...`).
     - Если ваша графическая оболочка IDE временно не поддерживает локальные command-хуки, используйте CLI `agy` либо запускайте проверки вручную через `./verify.ps1` (Windows) / `./verify.sh` (Linux/macOS) и `node hooks/session-report.mjs`.

---

### 11. `«Инспектор» (v4.7.1): грейдер (grade_*), стоп команды (team_stop_active), зеркало плана и «Чёрный ящик» (logs/)`
* **`grade_*` / `l2_binding_uncertain` (Stop):** Задачи с подтверждённым планом требуют `hermes-grade` `PASS` от независимого read-only грейдера вне `councilRoster ∪ writeWorkers ∪ {Lead}` (не обходится `qaVerdictMode="legacy"`, экономией или `MAX_RETURNS = 2`). При `NEEDS_HUMAN` или 3/3 `REWORK` откройте `ask_question` для валидированного решения пользователя; при `l2_binding_uncertain` перевызовите L2-аудитора одиночным `invoke_subagent`.
* **`team_stop_active` (PreToolUse):** Записывается в `.hermes/team-stop.json` при жёстких нарушениях (`sec_l1_pattern`, `tamper_protected`, `plan_tampered`). Блокирует записи Lead и субагентов (разрешая read-only совет, чтение и `manage_subagents(kill/kill_all)`). Снимается только валидированным ответом пользователя в `ask_question` (механический `PASS` стоп не снимает).
* **`--fast-path` на сложной задаче / `plan_ask_mirror_invalid`:** Флаг `--fast-path` работает только для тривиальных правок/опечаток (для ручного отключения гейтов человеком используйте `.hermes/config.json` или env). Окно подтверждения плана `ask_question` должно показывать 4 блока понятного зеркала простым языком без `REQ-*`/`FINDING-*`/`HIGH-*`.
* **`logs_direct_write_deny` (`REQ-10`):** Прямая запись агента в `logs/` запрещена — артефакты выгружаются строго механическим скриптом `scripts/export-logs.mjs` от корня установленного плагина (см. `skills/hermes/references/log-export-protocol.md`).

---

### 12. `«Рентген» (v4.7.2): переносимый запуск в любом чужом репо, 3 корзины и закрытие долга`
* **Одна команда запуска в любом репозитории (включая `tailscale-webos` и другие внешние проекты):**
  - **Windows PowerShell:**
    ```powershell
    node "$env:USERPROFILE\.gemini\config\plugins\hermes-fleet\scripts\xray-scan.mjs" --workspace=.
    node "$env:USERPROFILE\.gemini\config\plugins\hermes-fleet\scripts\export-logs.mjs" --workspace=.
    ```
  - **Linux / macOS / Git Bash:**
    ```bash
    node "${AGY_PLUGIN_DIR:-$HOME/.gemini/config/plugins/hermes-fleet}/scripts/xray-scan.mjs" --workspace=.
    node "${AGY_PLUGIN_DIR:-$HOME/.gemini/config/plugins/hermes-fleet}/scripts/export-logs.mjs" --workspace=.
    ```
* **Что значат 3 корзины окна Рентгена (строго ≤5 пунктов, без внутренних кодов и процентов):**
  1. **«Мусор (можно удалить, доказано)»** — неиспользуемый символ/элемент/файл с доказанным `refs=0` по всему репо (не точка входа и не в упаковке).
  2. **«Недоделка (риск для тебя)»** — пустые `catch {}`, функции-заглушки `return true`, `TODO`/`FIXME`, недостижимые ветки.
  3. **«Костыль (работает, но хрупко)»** — `setInterval` без `clearInterval`, повторные слушатели, опрос с побочными эффектами, повторение одного литерала ≥3 раз.
* **Как закрыть или принять долг (`.hermes/debt-ledger.jsonl` защищён — 21 встроенный путь, руками агент его не правит):**
  - **`[Почини сейчас]`** → добавьте выбранный пункт в `.hermes/plan.md` (ревизия `v(N+1)`), подтвердите `[Делай]`, исправьте код — при следующем скане исчезнувшая находка перейдёт в `status: "fixed"` механически.
  - **`[Запиши в долг]`** → фиксируется `status: "debt"`, до 3 релевантных открытых долгов (≤1 КБ) всплывают в стартовом контексте отдельно от `lessons.jsonl`.
  - **`[Не трогай]`** → фиксируется `status: "accepted"` с причиной; риск честно виден в отчёте, но больше не напоминает.
* **Advisory fail-open:** Рентген никогда не блокирует `Stop` и обычные записи; при сбое или нехватке времени в `gate-log.jsonl` пишется `xray_error`, а сессия завершается свободно. Конфиг человека: `.hermes/config.json` → `"xray": "advisory" | "off"` (`HERMES_XRAY`). Подробнее: `skills/hermes/references/xray-protocol.md`.
