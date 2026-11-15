# 📋 Hermes Fleet Release Checklist

Данный чеклист обязателен к выполнению перед каждым релизом и пушем в `origin/main`.

---

## 1. 🔍 Матрица версий и манифестов (N из N sweep)
- [ ] `plugin.json`: поле `version` и номер версии в `description`.
- [ ] `package.json`: поле `version`.
- [ ] `README.md`: заголовок `# 🏛️ Hermes Fleet Enterprise для Google Antigravity (vX.Y.Z)`.
- [ ] `skills/hermes/SKILL.md`: заголовок скилла с актуальной версией.
- [ ] `skills/hermes/references/fleet-protocol.md`: заголовок протокола `Protocol vX.Y.Z`.
- [ ] `install.ps1`: заголовок инсталлятора `(vX.Y.Z)`.
- [ ] `install.sh`: заголовок инсталлятора `(vX.Y.Z)`.
- [ ] Исторические файлы (`CHANGELOG.md`, `docs/adr/*`) исключены из проверок устаревших счётчиков.

### 🎯 Разграничение зон тестовой ответственности (Test Responsibility Boundaries)
- **`consistency.test.mjs` (тест 3, `no_stale_counters_in_docs`):** Проверяет отсутствие устаревших счетчиков (12 правил ➔ 15 правил, 22 скилла) и наличие декларации 15 правил в `fleet-protocol.md`.
- **`consistency.test.mjs` (тест 5, `version_alignment`):** Проверяет строгую синхронизацию версии по всем 7 таргетам манифестов и документации.
- **`consistency.test.mjs` (тест 17, `fleet_core_protocol_size_and_orchestrator_references_integrity`):** Проверяет соблюдение лимита размера ядра протокола (`<= 12 288 байт`), наличие модульных файлов `references/*`, атрибуцию доноров в `THIRD_PARTY_NOTICES.md` и целостность задач в `docs/backlog.md`.
- **`context-injector.test.mjs` (тесты 3 и 5):** Проверяют инжекцию системного маркера `<!-- HERMES_PROTOCOL_LOADED -->`, инвариантов `Zero-Hardcode` и срабатывание триггеров при вызове `/hermes` или активационных фраз.

---

## 2. 🛡️ Трёхуровневая система безопасности (Three-Layer Security)
- [ ] **Layer 1 (PreToolUse Pattern Guard):**
  - Блокировка опасной десериализации (`pickle.loads`, `yaml.unsafe_load`, `torch.load` без `weights_only=True`).
  - Блокировка небезопасного выполнения в DOM/коде (`innerHTML =`, `eval()`).
  - Блокировка обхода промышленных аварийных блокировок (`bypass_interlock`, `estop = false`).
  - Исключения для тестов, моков, фикстур и симуляторов Игоря (`tests/`, `simulators/`, `mock`, `igor`).
  - Возможность явного аннотирования `// hermes-security-ignore: <причина>`.
  - Предупреждение (warn-only) для прямых FC-записей Modbus.
- [ ] **Layer 2 (Stop Diff-Review):**
  - Артефактная схема проверки `.hermes/security-verdict.json` без тяжёлых LLM-вызовов из Stop-хука (лимит 10 с).
  - Защита от самоподписания (Anti-Self-Signing):
    - Наличие реального вызова `invoke_subagent` для `@viktor` в транскрипте хода (`hasTranscriptProof`).
    - Строгая привязка к хэшу текущего дифа (`diffHash`).
    - Привязка к `conversationId` и `turnMarker`.
    - Проверка свежести по TTL (не старше 5 минут).
    - Отсутствие неразрешённых High/Critical уязвимостей (`unresolvedHighCritical === 0`).
  - Негативные тесты блокируют попытки Lead подделать вердикт.
- [ ] **Layer 3 (Commit Review):**
  - Финальный аудит Виктора перед интеграцией.

---

## 3. ⚖️ Декларативный движок правил (Rule Engine)
- [ ] Чистый Node.js stdlib (0 внешних npm-зависимостей).
- [ ] Поддержка 6 операторов: `regex_match`, `contains`, `not_contains`, `equals`, `starts_with`, `ends_with`.
- [ ] Горячая перезагрузка правил из `.hermes/rules/*.md`.
- [ ] Команда `/hermes rules` для сводки и валидации правил.

---

## 4. 📊 Логирование и учёт ресурсов
- [ ] Запись решений гейта в `.hermes/gate-log.jsonl` (только в Hermes-сессиях).
- [ ] Запись метрик использования в `.hermes/cost-log.jsonl`.
- [ ] Авто-ротация логов при достижении 512 КБ (с сохранением `.1.jsonl`).

---

## 5. 📜 Лицензионная чистота и атрибуция
- [ ] Файл `THIRD_PARTY_NOTICES.md` присутствует в корне репозитория.
- [ ] Содержит полный текст Apache License, Version 2.0.
- [ ] Описаны все 7 портированных механик из `anthropics/claude-plugins-official`.
- [ ] Тест `third_party_notices_attribution` проходит успешно.

---

## 6. 🧪 Локальный CI-гейт (Zero Billing Dependency)
- [ ] `powershell -ExecutionPolicy Bypass -File .\verify.ps1` (или `npm test`) проходит со 100% успехом (10 сьютов, 332 теста):
  - `context-injector.test.mjs` (18 тестов)
  - `clean-edits-guard.test.mjs` (106 тестов)
  - `qa-gate.test.mjs` (67 тестов)
  - `rule-engine.test.mjs` (20 тестов)
  - `session-report.test.mjs` (3 теста)
  - `eval-harness.test.mjs` (68 тестов)
  - `contract-validator.test.mjs` (9 тестов)
  - `doc-lint.test.mjs` (15 тестов)
  - `refinery.test.mjs` (9 тестов)
  - `consistency.test.mjs` (17 тестов)
- [ ] Pre-push хук `.githooks/pre-push` активен (`git config core.hooksPath .githooks`).
- [ ] Инсталляция `install.ps1` / `install.sh` синхронизирована с каталогом плагина Antigravity.
