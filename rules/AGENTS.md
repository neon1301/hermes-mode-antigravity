# HERMES Fleet Router (`hermes-fleet` v3.6.1)

> **Обычный режим (по умолчанию):** если пользователь **не** вводил `/hermes`, не просил включить «Режим Hermes» / «Hermes Mode» и не обращался через **@имя**, работайте как стандартный агент без создания субагентов.

## Триггеры активации Hermes Mode
* Команды: `/hermes [задача]`, `/hermes board`, `/hermes fix-warnings`, `/hermes audit`, `/hermes save`, `/hermes resume`, `/hermes review`, `/hermes standup`
* Прямой вызов специалиста **@имя**: `@dmitry`, `@elena`, `@mozgoeb` (`@мозгоеб`), `@viktor`, `@alexey`, `@ruslan`, `@artem`, `@mikhail`, `@sergey`, `@igor`, `@anna`, `@denis`, `@stanislav`

## Полный регламент (12 правил и 13 экспертов)
При активации триггера `PreInvocation`-хук автоматически подгружает полный протокол из `skills/hermes/references/fleet-protocol.md` (а скилл `hermes` содержит фазы оркестрации). Если полный протокол ещё не в контексте, прочитайте [`fleet-protocol.md`](../skills/hermes/references/fleet-protocol.md) перед началом оркестрации.

Ключевые инварианты на любой задаче Hermes:
* **Plan ➔ Act & Контуры:** Read-Only специалисты (`agents/*.md`) делают аудит/контракты/Patch Blueprint; 1–3 файла правит Lead напрямую, 4+ — через `self`/`define_subagent`/`swarm` волнами 3–5 с Subagent GC.
* **Интерактивный выбор профиля моделей на старте сессии (Model Profile Handshake):** на Plan Mode до первого запуска субагентов (если профиль не сохранён в `.hermes/checkpoint.md`) Оркестратор запрашивает через `ask_question` или вопрос в плане профиль: ⚡ **Гибридный (Recommended)** (Lead на текущей; разведка/доки `mozgoeb`/`anna`/`igor` и волны `self` на `Model: "flash"`; сложная архитектура/БД/реверс/QA `dmitry`/`denis`/`artem`/`viktor`/`stanislav` на `Model: "inherit"`/`"pro"`), 🧠 **Максимум (All Inherit / Pro)** (все субагенты и волны записи на `Model: "inherit"`/`"pro"`), 🚀 **Эконом / Скорость (All Workers Flash)** (все вызываемые воркеры на `Model: "flash"`). Профиль фиксируется на всю сессию.
* **Clean Edits & Zero-Hardcode:** только `edit_file`/`write_file` (без `patch_*` и переписывающих однострочников); никаких зашитых IP/секретов/абсолютных путей/магических пауз.
* **Quality Gate:** приёмка `[QA PASS]` (Viktor) + `[COMPLIANCE PASS]` (Stanislav, при 4+ файлах) перед финализацией.
