# 📈 Протокол Обучения Совета на Исходах (Council Outcome Learning & Criteria Freeze Protocol)

Данный документ описывает механическую подсистему обучения флота Hermes (v4.6.0) на реальных исходах тестов и аудитов, механическую репутацию специалистов по доменам, заморозку критериев (анти metric-shopping) и честность привязки `имя -> UUID`.

---

## 1. Журнал исходов совета (`.hermes/council-outcomes.jsonl`)

- **Защита от подделки (Tamper Protection):** файл защищён `clean-edits-guard` (`protectedVerdictPaths` + shell-паттерны `>`, `>>`, `Set-Content`, `Out-File`, `Remove-Item`, `rm`, `truncate`). Запись (append) выполняется **исключительно хуком**.
- **Схема записи:**
  ```json
  {
    "taskHash": "a1b2c3d4e5f60718",
    "domain": "backend",
    "mode": "roundtable",
    "earlyStop": false,
    "rounds": 3,
    "roster": [
      { "name": "dmitry", "uuid": "aaaaaaaa-1111-2222-3333-444444444444", "bindingConfidence": "exact" }
    ],
    "declaredAuthors": [
      { "name": "dmitry", "source": "lead_declared", "verifiedInRoster": true }
    ],
    "outcome": "PASS",
    "outcomeSource": "test-summary",
    "diffHash": "4b28361b5aedcffc",
    "ts": "2026-11-17T13:00:00.000Z"
  }
  ```
- **Источники исхода (Rule 13 — Zero Fabrication):** исход берётся **строго из защищённых машинных артефактов** (`.hermes/test-summary.json`, `.hermes/qa-verdict.json`, `.hermes/security-verdict.json`). Проза модели (`[QA PASS]` в тексте ответа) источником быть **не может**.
- **Авторство принятых идей (`declaredAuthors`):** извлекается из `.hermes/decisions.md` с обязательной пометкой `source: "lead_declared"`. Хук механически проверяет присутствие автора в реальном ростере транскрипта (`verifiedInRoster`). Если заявленный автор не вызывался в совете (или имеет `bindingConfidence: "uncertain"`), его запись **отклоняется** и на репутацию не влияет.
- **Режим `solo`:** при `mode: "solo"` репутация специалистов **не начисляется**.

---

## 2. Механическая репутация по доменам (`.hermes/instincts.json`)

- **Защита:** `.hermes/instincts.json` защищён `clean-edits-guard` (запрет `write_file`/`edit_file`/shell-мутаций). Обновляется **только хуком** детерминированным пересчётом из `.hermes/council-outcomes.jsonl` с сохранением ручного массива `instincts`.
- **Структура на пару `специалист × домен`:** `{ observations, successes, failures, score, lastTs }`.
- **Документированные пороги и формула (`hooks/council-learning.mjs`):**
  - **Нейтральный холодный старт (`priorScore`):** `0.5` (при отсутствии наблюдений рекомендации не меняются).
  - **Порог активации (`minObservations`):** `3`. Влияние на ранжирование рекомендаций включается **только при `observations >= 3`**.
  - **Границы оценки (`minScore..maxScore`):** строго `[0.0, 1.0]`.
  - **Ограничение шага (`maxDeltaPerObservation` / cap):** `±0.15` на одно наблюдение (`rawDelta = (target - score) * 0.35`, где `target = 1.0` для `PASS` и `0.0` для `FAIL`, обрезается до `[-0.15, +0.15]`).
  - **Старение по времени (`halfLifeDays`):** экспоненциальный распад к нейтральному `0.5` с периодом полураспада **30 дней**:
    `decayed = 0.5 + (score - 0.5) * 0.5^(ageDays / 30)`.

---

## 3. Инвариант разделения: только рекомендации, никогда — замки

- **Разрешено:** при формировании вариантов окна `ask_question` (`specialist-dispatch-matrix.md` + `context-injector.mjs`) переупорядочивать или дополнять **предлагаемых** специалистов по репутации в домене, честно указывая число наблюдений (`n=...`).
- **Категорически запрещено:**
  - изменять `requiredCount` или ослаблять кворум по именам (`missingNames`);
  - подменять или выбрасывать специалиста, названного пользователем;
  - влиять на решение `allow`/`deny` в `clean-edits-guard` или `qa-gate`;
  - отменять обязательного адвоката дьявола (`@kritik` / `@stanislav`).

---

## 4. Заморозка критериев (анти metric-shopping) и роль арбитра

- **Механический замок (`.hermes/council-criteria.json`):**
  - Артефакт защищён `clean-edits-guard`.
  - По завершении Стадии 2 (`R2`) хук извлекает секцию критериев (`## Критерии оценки` / `## Criteria`) из `.hermes/council-roundtable.md` (или `.hermes/decisions.md`) и замораживает её SHA-256 хэш в `.hermes/council-criteria.json` (`{ taskHash, criteriaHash, source, ts }`).
  - Перед засчитыванием Стадии 3 (`R3`) хук сверяет текущий хэш критериев с замороженным. При расхождении (изменении или удалении критериев после обсуждения) запись блокируется с отказом `deny` («критерии изменены после обсуждения (metric-shopping)»).
- **Роль арбитра (протокольный уровень — Rule 13):**
  - Если в ростере присутствует `@stanislav`, он качественно проверяет честность, измеримость и неизменность критериев.
  - Если `@stanislav` не включён в ростер, Lead фиксирует проверку честности критериев в `.hermes/decisions.md`.
  - *Честное разграничение:* проверка хэша неизменности после R2 — **механическая** (хук); смысловая оценка качества критериев арбитром или Lead — **протокольный уровень**.

---

## 5. Честность привязки `имя -> UUID` (`bindingConfidence`)

- **Приоритет 1 (`exact`):** при наличии `tool_call_id` у вызова `invoke_subagent` и соответствующего `TOOL_OUTPUT`/`TOOL_RESULT` с тем же `tool_call_id` привязка `имя <-> UUID` считается точной (`bindingConfidence: "exact"`).
- **Приоритет 2 (`fifo`):** при одиночном `invoke_subagent` в шаге без `tool_call_id` используется однозначный FIFO-fallback (`bindingConfidence: "fifo"`).
- **Неоднозначная привязка (`uncertain`):** при нескольких `invoke_subagent` в одном шаге без `tool_call_id` FIFO-fallback сохраняет участие в кворуме совета/стола, но маркирует записи как `bindingConfidence: "uncertain"` — **репутация по таким записям не начисляется**.
