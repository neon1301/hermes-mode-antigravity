# 🩺 Hermes «Рентген» — Advisory Static Scanner & Product Debt Protocol (v4.7.2)

> **Назначение:** механический поиск скрытого мусора, недоделок и костылей внутри работающего проекта + ведение append-only книги долга (`.hermes/debt-ledger.jsonl`). **«Рентген» советует, а не запирает:** он работает в режиме `advisory` + `fail-open` и никогда не блокирует завершение (`Stop`) или обычные правки кода.

---

## 1. Архитектура и переносимый запуск

- **Сканер:** `scripts/xray-scan.mjs` (pure Node.js stdlib ESM, ноль внешних зависимостей, ноль сети).
- **Модуль состояния и книги долга:** `hooks/xray-ledger.mjs` (тонкий helper для `hooks/context-injector.mjs`, `hooks/clean-edits-guard.mjs` и `hooks/qa-gate.mjs`).
- **Переносимый запуск из ЛЮБОГО чужого репозитория** (скрипты резолвятся от корня установленного плагина через `resolvePluginRoot()` / `resolvePluginScript()` в `hooks/workspace.mjs`):
  - **Windows PowerShell:**
    ```powershell
    node "$env:USERPROFILE\.gemini\config\plugins\hermes-fleet\scripts\xray-scan.mjs" --workspace=.
    ```
  - **Linux / macOS / Git Bash:**
    ```bash
    node "${AGY_PLUGIN_DIR:-$HOME/.gemini/config/plugins/hermes-fleet}/scripts/xray-scan.mjs" --workspace=.
    ```
- **Режим в `.hermes/config.json` / env (`HERMES_XRAY`):**
  - `xray: "advisory"` (дефолт) — скан на `allow`-ветке Stop (с остаточным бюджетом `<=5s` до 10s-таймаута `hooks.json`) и CLI.
  - `xray: "off"` — отключение человеком (агент не может редактировать `.hermes/config.json`).
  - Ключ `enforce` **не реализован** (вынесен в отдельный бэклог `TASK-021`).

---

## 2. Детерминированная таблица правил (`dead`, `stub`, `fragile`)

Каждая находка имеет фиксированную схему:
`{ id, rule, class, category, path, line, symbol, evidence, impact, refs }`, где:
- `class`: строго `"fact"` (доказано кодом) | `"hypothesis"` (эвристика или неполный скан; гипотеза никогда не даёт права на удаление).
- `id`: `sha256(rule + "\0" + normalizedPath + "\0" + symbol).slice(0, 16)` — стабилен при сдвиге строк, повторный скан не плодит дублей.
- `evidence`: строго `normalizedPath:line`, провалидированный через общий `validateEvidenceRef` (`hooks/grade-gate.mjs`).

| Правило (`rule`) | Категория (`category`) | Класс (`class`) | Влияние (`impact`) | Что ловит механически |
| :--- | :--- | :--- | :--- | :--- |
| `dead.unused_symbol` | `dead` | `fact` (если `refs=0` и полный скан) / `hypothesis` | `resource_waste` | Неэкспортированная функция с `0` ссылок по всему репо |
| `dead.unused_file` | `dead` | `fact` (если `refs=0`, не в упаковке, полный скан) | `resource_waste` | Исходный файл вне точек входа и упаковки с `0` ссылок |
| `dead.unreferenced_element` | `dead` | `fact` / `hypothesis` | `lies_to_user` (кнопки/ссылки) / `resource_waste` | HTML-элемент с `id="..."` без обработчика и с `0` ссылок в JS/CSS/тестах |
| `dead.element_never_assigned` | `dead` | `fact` / `hypothesis` | `lies_to_user` | Объявленная `var`/`let` переменная, которой ни разу не присвоено значение |
| `dead.unused_css_selector` | `dead` | `fact` / `hypothesis` | `resource_waste` | CSS `#id`-селектор без совпадений в HTML/JS |
| `dead.broken_asset_ref` | `dead` | `fact` | `brick_risk` | Локальный `<script src>` / `<link href>` на несуществующий файл |
| `stub.empty_catch` | `stub` | `fact` | `brick_risk` | Пустой `catch {}` / `except: pass` |
| `stub.always_true_return` | `stub` | `fact` | `lies_to_user` | Функция/ветка `catch`, безусловно возвращающая константу (`return true`, `{ returnValue: true }`) |
| `stub.todo_fixme` | `stub` | `fact` | `cosmetic` | Пометки `TODO`/`FIXME`/`XXX` в исходном коде |
| `stub.unreachable_branch` | `stub` | `fact` | `resource_waste` | `if (false)` или код сразу после безусловного `return`/`throw` |
| `fragile.retry_sleep_mask` | `fragile` | `hypothesis` | `lies_to_user` | Ошибка в `catch` замазана `setTimeout`/`sleep`/`retry` без проброса |
| `fragile.poll_side_effect` | `fragile` | `hypothesis` | `brick_risk` | `setInterval` с побочным эффектом (`exec`/`spawn`/`--reset`/запись) |
| `fragile.unstopped_timer` | `fragile` | `fact` | `resource_waste` | `setInterval(...)` в файле без единого `clearInterval` |
| `fragile.duplicate_listener` | `fragile` | `hypothesis` | `resource_waste` | `addEventListener` внутри цикла/рендера/таймера без `removeEventListener` и `{ once: true }` |
| `fragile.duplicate_literal` | `fragile` | `fact` | `cosmetic` | Один нетривиальный литерал (`>= 8` символов) в `>= 3` местах кода |

---

## 3. Детерминированная таблица приоритетов (`impact`)

Сортировка строго механическая (никаких «на глаз», процентов и оценок качества — Rule 13):

1. **`lies_to_user`** (наивысший) — программа врёт пользователю (успех при ошибке, мёртвая кнопка).
2. **`brick_risk`** — риск поломки/зависания/тихой потери состояния.
3. **`resource_waste`** — утечка таймеров/слушателей, мёртвый балласт.
4. **`cosmetic`** (низший) — дублирующиеся литералы, пометки TODO/FIXME.

Тай-брейк: `impact` → `class` (`fact` > `hypothesis`) → `path` → `line` → `rule` → `id`.

---

## 4. Бюджет сканирования и покрытие адаптеров

- **Бюджет:** `<= 2000` файлов, `<= 2 МБ` на файл, таймбокс `10 с` (в CLI) и остаточный `<= 5 с` (на Stop с буфером `>= 2.5 с` до 10s-лимита `hooks.json`). Пропускаются `node_modules/`, `.git/`, `.hermes/`, `logs/`, бинарники (NUL-байт в первых 8 KiB) и минифицированные строки (`> 4096` символов). При достижении лимита выставляется `truncated: true` + `truncatedReason` + честные счётчики.
- **Адаптеры v4.7.2:**
  - **JS / ES5 / ESM / TS** (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx`) — поддержан.
  - **HTML / CSS** (`.html`, `.htm`, `.css`) — поддержан.
  - **Generic** (`.py`, `.go`, `.sh`, `.ps1`, `.rb`, `.java`, `.php`) — текстовые сигналы (`TODO`/`FIXME`, пустой `except: pass`, дубли литералов).
  - **C# / XAML (`.cs`, `.xaml`)** — **честно НЕ покрыт в v4.7.2** (считается в `filesSkippedUnsupported`, вынесено в `TASK-020`).

---

## 5. Доказательство нулевых ссылок и список «никогда не удалять»

Подсчёт `refs` выполняется по всему репозиторию (`['code', 'strings', 'css', 'config', 'manifest', 'docs', 'tests']`): импорты, вызовы, строковые имена (`getElementById`, `querySelector`, `dispatch`, `service.register`, `luna://`), CSS-селекторы, JSON/конфиги, упаковка (`package.json`, `plugin.json`, `hooks.json`, `appinfo.json`, `services.json`, `install.ps1`/`install.sh`, IPK/Makefile), доки и тесты.

- **`safeToDelete === true`** только если одновременно: `refs.count === 0`, `refs.protectedBy.length === 0`, `class === 'fact'` и `!report.truncated`.
- **Никогда не удалять:** точки входа и публичные API (`export`), вызовы по строковому имени из другого процесса, файлы из упаковки/инсталлера/IPK.
- **Хирургический замок `xray_delete_without_zero_ref_proof_deny`:** блокирует удаление файла или символа из отчёта без `safeToDelete === true`, если удаление не согласовано явно в подтверждённом `.hermes/plan.md` и живые ссылки ещё есть (или скан усечён).

---

## 6. Защищённые артефакты (21 путь = 19 + 2) и книга долга

Оба артефакта входят в `DEFAULT_PROTECTED_VERDICT_PATHS` (`hooks/consent-validator.mjs`):
- **`.hermes/xray-report.json`** — `{ taskHash, scanVersion, adapters, unsupportedStacks, findings[], protectedFiles[], counts, truncated, truncatedReason, ts }`. Пишет только сканер/хук.
- **`.hermes/debt-ledger.jsonl`** — append-only журнал `{ id, status: "open"|"debt"|"accepted"|"fixed", reason, source, ts, ... }`. Пишет только хук/сканер.
  - Повторный скан не плодит дублей (стабильный `id`).
  - Исчезновение находки `open`/`debt` при рескане механически переводит запись в `fixed` (если `!truncated`, либо файл реально был просканирован, либо удалён с диска).
  - **Инъекция контекста (`hooks/context-injector.mjs`):** подгружает `<= 3` записей `open`/`debt`, релевантных задаче, в бюджете `<= 1024 B`, **строго отдельно** от `.hermes/lessons.jsonl`. Записи `accepted` и `fixed` не подгружаются.

---

## 7. Окно простым русским (advisory, ≤5 пунктов) и согласия

- Показывается только при `>= 1` активной находке (на 0 находок окно не открывается; пустые корзины не рендерятся).
- **3 корзины:**
  1. `Мусор (можно удалить, доказано)` (только `category === 'dead' && class === 'fact' && safeToDelete === true`)
  2. `Недоделка (риск для тебя)` (`stub`)
  3. `Костыль (работает, но хрупко)` (`fragile` и недоказанный `dead`)
- **Формат пункта:** что найдено + «что ты почувствуешь» + `path:line`. Внутренние коды (`REQ-*`, `FINDING-*`, `XRAY-*`, `dead.*`, `lies_to_user`) и оценки качества (`%`, `/10`, `score`) запрещены (`xray_window_plain_ru_no_internal_codes`). При `> 5` находках — честная строка `ещё N в отчёте`.
- **Опции (`consent-validator.mjs` с negation-guard и привязкой к тексту опции):**
  - `[Почини сейчас]` → запрещена молчаливая правка (`xray_fix_now_requires_plan_revision_deny`): Lead обновляет `.hermes/plan.md` до `v(N+1)` и получает новое подтверждение `[Делай]` + новую `.hermes/rubric.json`.
  - `[Запиши в долг]` → `status: "debt"` в `.hermes/debt-ledger.jsonl`.
  - `[Не трогай]` → `status: "accepted"` + причина в `.hermes/debt-ledger.jsonl`; в отчёте риск виден честно, но больше не напоминает.
- **Защита от угона чужих гейтов:** `isXrayWindowAskArgs` исключён из Step 0 Handshake (`clean-edits-guard.mjs`) и Post-Edit Token Economy (`clean-edits-guard.mjs` и `qa-gate.mjs`).

---

## 8. Осознанное исключение Fail-Open (REQ-6)

Все гейты безопасности и процесса (`clean-edits-guard`, `plan-gate`, `grade-gate`, `team-stop`, `qa-gate`) работают **fail-closed**. «Рентген» — **не гейт**, а советчик:
- При ошибке, нехватке времени до Stop-таймаута или повреждении advisory-файлов при чтении он уходит в **fail-open**, пишет честную запись `xray_error` в `.hermes/gate-log.jsonl` и **никогда** не блокирует Stop или обычные записи.
- При этом защита самих файлов `.hermes/xray-report.json` и `.hermes/debt-ledger.jsonl` от прямой записи агента остаётся строго **fail-closed** (`tamper_protected`).
