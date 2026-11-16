# 🎮 Справочник команд Hermes (Commands Reference)

Полный справочник команд Lead Orchestrator и интерфейсов взаимодействия в Hermes Fleet Protocol v4.0.0.

---

## Таблица команд

| Команда | Назначение | Описание |
| :--- | :--- | :--- |
| **/hermes [задача]** | Оркестрация | Реестр `REQ-1..REQ-N`, декомпозиция, выбор специалистов и контроль исполнения |
| **/hermes feature [описание]** | Проектирование фич | 🚀 7-фазный протокол фич (Discovery, 3 альтернативы, Fast-Path). Подробнее: [`feature-dev-protocol.md`](feature-dev-protocol.md) |
| **/hermes council [задача]** | Совет специалистов | 🏛️ Принудительный созыв совета экспертов до проектирования плана ([`specialist-council-protocol.md`](specialist-council-protocol.md)) |
| **/hermes board** | Канбан-доска | Отображение интерактивной канбан-доски в чате (Generative UI) |
| **/hermes loop / fix-warnings** | Сходимость | 🔄 Ограниченный цикл сходимости компилятора и тестов (потолок 25 итераций) |
| **/hermes audit** | Комплаенс-аудит | Ревизия 15 правил флота Hermes и стековых скиллов (Stanislav, `[COMPLIANCE PASS]`) |
| **/hermes save / resume** | Контроль состояния | Снимок контекста и графа задач (`checkpoint.md`, `tasks.json`) и восстановление |
| **/hermes learn [правило]** | Инстинкты | Сохранение инстинкта в `.hermes/instincts.json` |
| **/hermes review / report** | Ревью и отчётность | 7-векторный аудит диффа (Viktor) и отчёт сессии (Data Honesty) |
| **/hermes rules / standup** | Сводка и статус | Сводка правил (`rules/*.md`) и стендап (`standups.md`) |
| **@имя [запрос]** | Прямой вызов | Адресный вызов конкретного специалиста (`@dmitry`, `@kritik`, `@viktor`...) |

---

## Связанные регламенты

* **Ядро регламента флота:** [`fleet-protocol.md`](fleet-protocol.md)
* **Матрица маршрутизации специалистов:** [`specialist-dispatch-matrix.md`](specialist-dispatch-matrix.md)
* **Совет специалистов (Council Gate):** [`specialist-council-protocol.md`](specialist-council-protocol.md)
* **7-фазный протокол фич:** [`feature-dev-protocol.md`](feature-dev-protocol.md)
