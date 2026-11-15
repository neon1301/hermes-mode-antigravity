# ✅ Verification-Before-Completion Protocol

*Adapted from `obra/superpowers` under the MIT License.*

---

## 🏛️ The Iron Law

> **NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**
> *If you have not executed the exact verification command in your current turn and inspected its exit code and output, you cannot claim success.*

---

## 🚫 Banned Assumption Phrases

The following patterns are strictly banned in completion reports before executing validation commands:
- ❌ *"Should pass now..."*
- ❌ *"Tests probably succeed..."*
- ❌ *"The fix looks correct, so everything is working..."*
- ❌ *"I have implemented the changes and everything is done!"* (without test execution output)
- ❌ Premature congratulations or hand-waving before checking exit codes.

---

## 🚦 The 5-Step Gate Function

Before marking any task, issue, or pull request as complete, execute this deterministic sequence:

| Step | Action | Required Execution | Failure Handling |
| :--- | :--- | :--- | :--- |
| **1. IDENTIFY** | Determine exact verification command | e.g. `npm test`, `pytest`, `dotnet test`, `verify.ps1` | If no command exists, author a test first |
| **2. RUN** | Execute command freshly in current session | Run tool `run_command` with full arguments | Do not rely on previous turn runs |
| **3. READ** | Read stdout/stderr, status code & totals | Parse passed/failed counts and exit code | Non-zero exit code = immediate halt |
| **4. VERIFY** | Compare output against success criteria | Confirm 0 failures, 0 regressions, all suites green | If mismatched, revert to Root Cause Debugging |
| **5. STATE** | Declare completion with raw evidence | Report: `Command: <cmd>`, `Exit: 0`, `Counts: X/X PASS` | Never state completion without this block |

---

## 📊 Verification Evidence Template

Every Hermes task closure or PR review must provide a verifiable evidence block:

```markdown
### 🛡️ Verification Evidence
- **Command:** `npm test`
- **Exit Code:** `0`
- **Suites:** 8/8 passed
- **Tests Total:** 298 passed, 0 failed
- **Log / Summary Path:** `.hermes/test-summary.json`
- **Diff Cleanliness:** `git status` reports working tree clean
```
