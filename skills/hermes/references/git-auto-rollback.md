# ⏪ Git Auto-Revert & Safety Rollback Protocol

Pioneered by **Aider**, the **Git Auto-Revert Protocol** guarantees that the codebase is **never left in a broken, half-edited state**.

---

## 🛡️ 1. The Rollback Trigger
Whenever an agent executes an atomic modification via `edit_file`:

```mermaid
flowchart TD
    A["Atomic Edit via edit_file"] --> B["Immediate Build/Test Gate (dotnet build / tsc / pytest / go test)"]
    B -->|Build Succeeded (0 Errors)| C["Submit Diff to Viktor (QA)"]
    C -->|QA Approved [QA PASS]| D["Git Commit [TASK-ID]"]
    
    B -->|Build Failed (>0 Errors)| E["Autonomous Self-Repair Attempt (Max 3 tries)"]
    E -->|Repair Succeeded| B
    E -->|3 Attempts Exhausted| F["🚨 EXECUTE GIT ROLLBACK\ngit checkout -- <file>\ngit clean -fd"]
    F --> G["Codebase Restored to Clean State\nNotify User with Exact Diagnostics"]
```

---

## ⚙️ 2. Execution Rules
1. **Never Commit Broken Code:** If a modification causes compiler errors (`CS0103`, `CS0246`) or test regressions that cannot be repaired within 3 attempts, the Orchestrator **immediately rolls back the target file**:
   ```powershell
   git checkout -- <modified_file>
   ```
2. **Clean State Guarantee:** The user can always rest assured that their workspace will never compile worse after an AI turn than it did before.
3. **Transparent Reporting:** The failure reason and stack trace are logged in `.hermes/chatter.md`, and the user is offered a sanitized alternative approach.
