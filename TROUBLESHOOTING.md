# 🛠️ Hermes Fleet Troubleshooting Guide

This guide explains the most common guard and gate notices, why they occur, and how to resolve them immediately.

---

### 1. `Hermes Rule 12 (Step 0 Model Handshake)`
* **Message:** `В этом чате ещё не выполнен выбор модели для субагентов! ПЕРВЫМ действием в новой сессии /hermes... вызовите инструмент ask_question...`
* **Why it happens:** At the beginning of every new chat session, Hermes requires an explicit agreement on which model and reasoning tier (High / Medium / Low) to use for subagents.
* **Resolution:** Call `ask_question` with 2 questions:
  1. *Какую модель ИИ использовать для всех субагентов?* (e.g., Gemini 3.8 Flash)
  2. *Какой режим (уровень ума) поставить субагентам?* (High, Medium, Low)
  Wait for the user's answer, record it in `.hermes/profile.json` (`{ "model": "<model>", "tier": "high|medium|low", "updatedAt": "<ISO-timestamp>" }`) and `.hermes/checkpoint.md`, and only then proceed with the task.

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

---

### 7. `Gate Log Isolation & Size Management (.hermes/gate-log.jsonl)`
* **Behavior:** Decision audit logs (`clean-edits-guard` and `qa-gate`) are written **only** when Hermes is active in the session. Normal user chats never generate `.hermes/`.
* **Rotation:** When `gate-log.jsonl` exceeds **512 KB**, it automatically rotates to `gate-log.1.jsonl`.
* **Git Cleanliness:** The entire `.hermes/` directory is in `.gitignore` to prevent committing logs, checkpoints, or profiles to the repo.

---

### 8. `E2E Smoke Verification Checklist (12 Points)`
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
