# 💾 Hermes Session Checkpoints & Memory System

This document specifies the persistence architecture for session state snapshots in `.hermes/checkpoint.md`.

---

## 1. Checkpoint Structure (`.hermes/checkpoint.md`)

When `/hermes save` or automatic checkpointing is triggered, generate this structured document:

```markdown
# 🏛️ Hermes Fleet — Session Checkpoint
> Generated: YYYY-MM-DD HH:MM:SS

## 🎯 Current Milestone & Objective
- **Goal:** [Concise description of user objective]
- **Status:** [In-Progress / QA-Review / Blocked / Complete]

## 📋 Task Board Snapshot
| Task ID | Specialist | Title | Status | Blocked By |
| :--- | :--- | :--- | :--- | :--- |
| TASK-1 | Dmitry | UserAuth Endpoint | DONE | - |
| TASK-2 | Elena | LoginForm Component | IN_PROGRESS | TASK-1 |
| TASK-3 | Viktor | Security Audit | PENDING | TASK-2 |

## 📁 Modified Files & Artifacts
- `src/controllers/auth.ts` (Dmitry: added JWT token issue)
- `src/components/Login.tsx` (Elena: connected 4-state form)

## 🤝 Active Contracts & Architecture Decisions
- Auth DTO: `POST /api/v1/login` -> `{ token: string, expiresAt: number }`
- Error Contract: `401 Unauthorized` with `{ code: "INVALID_CREDENTIALS" }`

## 🚀 Immediate Next Actions
1. Elena: finalize form error boundaries.
2. Viktor: execute QA audit on TASK-2.
```

---

## 2. Resume Protocol (`/hermes resume`)

When the user enters `/hermes resume` or opens a new chat:
1. Orchestrator reads `.hermes/checkpoint.md` and `.hermes/chatter.md`.
2. Restores the task dependencies and identifies the exact in-progress tasks.
3. Outputs a concise status summary to the user:
   *"Контекст успешно восстановлен из чекпоинта. Продолжаем работу над задачей [TASK-ID]..."*
4. Seamlessly reactivates the assigned specialists.
