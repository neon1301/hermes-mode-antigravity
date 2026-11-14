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
- [ ] Тест `version_alignment` в `hooks/consistency.test.mjs` проходит успешно (зелёный).
- [ ] Исторические файлы (`CHANGELOG.md`, `docs/adr/*`) исключены из проверок устаревших счётчиков.

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
- [ ] `powershell -ExecutionPolicy Bypass -File .\verify.ps1` (или `npm test`) проходит со 100% успехом:
  - `consistency.test.mjs`
  - `context-injector.test.mjs`
  - `clean-edits-guard.test.mjs`
  - `qa-gate.test.mjs`
  - `rule-engine.test.mjs`
- [ ] Pre-push хук `.githooks/pre-push` активен (`git config core.hooksPath .githooks`).
- [ ] Инсталляция `install.ps1` / `install.sh` синхронизирована с каталогом плагина Antigravity.
