# 🛠️ Hermes Fleet Troubleshooting Guide

This guide explains the most common guard and gate notices, why they occur, and how to resolve them immediately.

---

### 1. `Hermes Rule 12 (Step 0 Model Handshake)`
* **Message:** `В этом чате ещё не выполнен выбор модели для субагентов! ПЕРВЫМ действием в новой сессии /hermes... вызовите инструмент ask_question...`
* **Why it happens:** At the beginning of every new chat session, Hermes requires an explicit agreement on which model and reasoning tier (High / Medium / Low) to use for subagents.
* **Resolution:** Call `ask_question` with 2 questions:
  1. *Какую модель ИИ использовать для всех субагентов?* (e.g., Gemini 3.8 Flash)
  2. *Какой режим (уровень ума) поставить субагентам?* (High, Medium, Low)
  Wait for the user's answer, record it in `.hermes/profile.json` and `.hermes/checkpoint.md`, and then proceed with the task.

---

### 2. `Hermes Rule 12 (Policy as Code: Model Tier Mismatch)`
* **Message:** `Запрещено занижать модель субагента до Model: "flash"! Для сохранения уровня High передайте Model: "inherit"...`
* **Why it happens:** In Step 0 Handshake, the user chose **High**, but an `invoke_subagent` call attempted to pass `Model: "flash"` or `Model: "flash_lite"`, which silently erases the High reasoning tier.
* **Resolution:** Pass `Model: "inherit"` (which inherits the host's `gemini-3.8-flash-high`) or `Model: "pro"` (for heavy UI design with `@elena` or complex architectural tasks).

---

### 3. `Hermes Rule 8 (Tool Cleanliness / No Patch Scripts)`
* **Message:** `Запрещено создавать временные скрипты-патчи (*.ps1, *.bat, *.py)...`
* **Why it happens:** Attempting to run `sed -i`, ad-hoc python scripts, bash scripts, or PowerShell files to edit source code.
* **Resolution:** Use the native tools `edit_file` (for surgical in-place edits) and `write_file` (for new files).

---

### 4. `Hermes Rule 9 (Zero Hardcode & Dynamic Configuration)`
* **Message:** `Обнаружен захардкоженный IP-адрес / порт / путь / секрет...`
* **Why it happens:** Writing literal IP addresses (`192.168.x.x`), drive letters (`C:\...`), passwords, or API tokens directly into application source code.
* **Resolution:** Move all environment-specific values to configuration providers (`appsettings.json`, `.env`, configuration classes, or environment variables).

---

### 5. `Hermes Gate (Попытка N/2): изменено исходников: X`
* **Message:** `Чтобы не тратить токены на мелких правках, вызовите ask_question и спросите пользователя: «Я закончил доработку. Запустить сотрудников на проверку... или завершить без проверки?»`
* **Why it happens:** Source code files were modified, and the Stop hook prevents silent exits without either running automated checks or giving the user the option to finish with token economy.
* **Resolution:** Call `ask_question` asking the user whether to run verification (`[QA PASS]` via Viktor) or complete immediately. If the user chooses token economy (`skip`, `без проверки`), the gate immediately allows termination.

---

### 6. `GitHub Actions CI Billing Lock`
* **Message:** `The job was not started because your account is locked due to a billing issue`
* **Why it happens:** GitHub Actions runs are paused at the account level when free-tier action minutes or storage quota limits need a payment profile re-verification.
* **Resolution:** Update billing/payment details in GitHub Account Settings (`Settings -> Billing & plans -> Spending limits`), or run test suites locally (`npm test` or `powershell -ExecutionPolicy Bypass -File .\install.ps1`). All tests run 100% locally with zero external dependencies.
