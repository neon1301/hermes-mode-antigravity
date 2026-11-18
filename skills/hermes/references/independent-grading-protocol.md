# 🔎 Протокол независимого грейдинга (Independent Grading Protocol — v4.7.1 «Инспектор»)

Данный модульный регламент дополняет ядро [`fleet-protocol.md`](fleet-protocol.md) без увеличения его байтового бюджета (`+0 B`) и вводит роль **Независимого грейдера** среди существующих 14 read-only специалистов флота (без добавления 15-й карточки агента).

---

## 1. Механическая рубрика из плана (`.hermes/rubric.json`)

При заморозке подтверждённого плана (`PLAN_FROZEN`) или его ревизии (`PLAN_REVISED`) хук `hooks/plan-gate.mjs` (через `hooks/grade-gate.mjs`) механически деривирует защищённый артефакт `.hermes/rubric.json` строго из EARS-lite пунктов `.hermes/plan.md`:

```json
{
  "schemaVersion": "1.0",
  "taskHash": "<16-hex>",
  "planHash": "<sha256>",
  "rubricHash": "<sha256>",
  "version": 1,
  "generatedAt": "2026-11-18T00:00:00.000Z",
  "items": [
    {
      "reqId": "REQ-1",
      "condition": "<условие после КОГДА>",
      "behavior": "<поведение после ДОЛЖНА>",
      "verification": "<проверка после Проверка:>"
    }
  ]
}
```

- При ревизии плана `v(N+1)` генерируется рубрика `v(N+1)`, а предыдущий `rubricHash` сохраняется в защищённом `.hermes/plan-ledger.jsonl`.
- `.hermes/rubric.json` входит в 19 защищённых путей — агент не может его создавать или редактировать ни через `write_file`/`edit_file`, ни через shell.
- Для задач без подтверждённого плана (`Micro`/`Fast-Path`, прямой `@специалист`, `/hermes fix-warnings`) рубрика не создаётся и grade-гейт не применяется.

---

## 2. Назначение независимого грейдера (роль, не карточка)

После прохождения QA (`@viktor`), Security (`@viktor`) и Compliance (`@stanislav`) Lead назначает на роль **Независимого грейдера** одного из существующих 14 read-only специалистов при строгом выполнении инварианта разделения обязанностей:

```text
graderUuid ∉ councilRoster(taskHash) ∪ writeWorkers ∪ {Lead}
```

- **Рекомендуемый порядок выбора:** `@viktor` или `@stanislav`, если они **не участвовали** в совете этой задачи (по `roster` и `prunedUuids` в `.hermes/council-state.json`); иначе — любой другой read-only специалист Контура A вне ростера совета и воркеров (например, `@sergey`, `@anna`, `@dmitry`, `@denis`).
- **Одиночный вызов:** грейдер вызывается одиночным `invoke_subagent` (либо с точным `tool_call_id`), чтобы исключить `bindingConfidence: "uncertain"` (`l2_binding_uncertain`).

---

## 3. Стерильное приглашение (без пересказа Lead)

Приглашение грейдеру **обязано** содержать только первичные указатели — пересказ выводов Lead и убеждающая проза запрещены протоколом:

```text
[Independent Grader | Read-Only Contour A]
taskHash: <taskHash>
Файлы для самостоятельного чтения:
- .hermes/rubric.json (источник критериев, planHash и rubricHash)
- .hermes/test-summary.json, .hermes/qa-verdict.json, .hermes/security-verdict.json
- Команда для инспекции изменений: git diff (плюс read_file затронутых файлов)

Не полагайся на пересказ. Прочитай rubric.json, артефакты и код сам и верни блок ```hermes-grade```.
```

---

## 4. Контракт доставки `hermes-grade` и механическая верификация

Грейдер возвращает структурированный JSON-блок в ограждении ```` ```hermes-grade ````:

```json
{
  "taskHash": "<16-hex>",
  "planHash": "<sha256 из rubric.json>",
  "rubricHash": "<sha256 из rubric.json>",
  "items": [
    {
      "reqId": "REQ-1",
      "verdict": "FULFILLED",
      "evidence": "hooks/grade-gate.mjs:21-46"
    }
  ],
  "overall": "PASS"
}
```

Хук `hooks/qa-gate.mjs` (через `hooks/grade-gate.mjs`) механически записывает защищённый `.hermes/grade-report.json` и дополняет защищённый `.hermes/grade-ledger.jsonl` **только если**:
1. Доставка пришла в подлинном входящем `SYSTEM`-сообщении от harness-bound `graderUuid` (`bindingConfidence` = `exact` или `fifo`, никогда `uncertain`, никогда `MODEL`-проза).
2. `graderUuid ∉ councilRoster(taskHash) ∪ writeWorkers ∪ {Lead}`.
3. `taskHash`, `planHash` и `rubricHash` совпадают с текущими подтверждёнными `.hermes/plan-state.json`, `.hermes/plan.md` и `.hermes/rubric.json`.
4. Покрыты **100% `reqId`** из `.hermes/rubric.json` без пропусков и дубликатов.
5. Каждое `evidence` (`path:line` или `path:start-end` / `path#L10-L20`, с поддержкой Windows `\` и корневых файлов) физически существует в workspace (`realpathSync` внутри корня, без `..`, и `1 <= startLine <= endLine <= totalLines`). Выдуманная улика отклоняется (`grade_evidence_invalid`).
6. Поле `overall` строго соответствует вердиктам (приоритет **`UNKNOWN` > `NOT_FULFILLED` > `FULFILLED`**):
   - Есть хотя бы один `UNKNOWN` → **`NEEDS_HUMAN`** (`UNKNOWN` **никогда** не становится `PASS`).
   - Иначе есть хотя бы один `NOT_FULFILLED` → **`REWORK`**.
   - Иначе (все `FULFILLED`) → **`PASS`**.

---

## 5. Stop-гейт, потолок `REWORK` (3 цикла) и решение пользователя

Для любой задачи с подтверждённым планом `Stop` (`hooks/qa-gate.mjs`) блокируется без `.hermes/grade-report.json` со статусом `PASS` (независимо от `qaVerdictMode="legacy"`, `isEconomySkipRequested` и счётчика `MAX_RETURNS = 2`):

- **`REWORK`:** Lead исправляет указанные `reqId` и запрашивает повторный грейд (`version++`). Потолок — **3 цикла на `taskHash`** (считается по `.hermes/grade-ledger.jsonl`), после чего обязательно окно `ask_question` пользователю: `[Продолжить доработку]` / `[Принять как есть]` / `[Остановить задачу]`.
- **`NEEDS_HUMAN`:** окно `ask_question` открывается **сразу** (грейдер не смог проверить пункт X: `[Дать улику / уточнить]` / `[Переделать проблемный пункт]` / `[Принять риск как есть]`).
- **«Принять как есть»:** принимается исключительно через `hooks/consent-validator.mjs` (привязка к тексту опции, bidirectional Cyrillic negation-guard, запрет `MODEL`-прозы и `<SYSTEM_MESSAGE>`-эхо). Решение пишется в `.hermes/grade-ledger.jsonl` с `source` и причиной — поле `overall` в `.hermes/grade-report.json` **никогда** не переворачивается молча в `PASS`.

---

## 6. Честная граница (Rule 13)

- **Механически гарантируется:** деривация `.hermes/rubric.json`, защита 19 артефактов, непересечение `graderUuid`, совпадение хэшей, 100% покрытие `reqId`, физическое существование `path:line` и диапазона строк, пересчёт `overall`, потолок 3 `REWORK` и валидация человеческих решений через `consent-validator.mjs`.
- **Остаётся протокольным уровнем:** отсутствие тонкой подсказки Lead в тексте приглашения и смысловая полнота рассуждений грейдера (см. [`docs/known-boundaries.md`](../../../docs/known-boundaries.md)).
