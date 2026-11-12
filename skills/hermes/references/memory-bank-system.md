# 🧠 Memory Bank Architecture (Zero-Context-Loss System)

Pioneered by **Cline / Roo Code**, the **Memory Bank** guarantees that the Hermes Fleet maintains complete, persistent memory of a project across days, sessions, crashes, and IDE restarts.

---

## 📂 1. Memory Bank Structure (`.hermes/memory-bank/`)

The Memory Bank lives in `.hermes/` and consists of 3 synchronized files (created as decisions emerge, never as empty boilerplate):

| File | Purpose | When Updated |
| :--- | :--- | :--- |
| **`activeContext.md`** | What the team is doing **right now**: active workstreams, current blockers, and immediate next steps. | At the beginning and end of each work package. |
| **`systemPatterns.md`** | Discovered architectural invariants and rules (e.g. *"SQLite writes require `_sqliteWriteLock`"*, *"SAP COM objects must call `FinalReleaseComObject`"*). | Whenever a new technical rule is established. |
| **`progress.md`** | High-level milestones checklist: completed features, remaining tasks, and known technical debt. | Whenever a milestone passes QA approval. |

---

## 🔄 2. Multi-Session Resumption (`/hermes resume`)
When the user starts a new session or types `/hermes resume`:
1. Lead reads `activeContext.md`, `systemPatterns.md`, and `progress.md`.
2. Lead reconstructs the full project context in **under 3 seconds**.
3. The team resumes work immediately from the exact line where it left off, with zero repeated questions.
