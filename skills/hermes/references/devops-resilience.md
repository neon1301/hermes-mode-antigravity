# ⚙️ ECC DevOps & Systems Resilience Standards (Alexey's Standard)

This document defines systems and automation reliability standards applied by **Alexey (Lead Industrial Hardware, Equipment & Protocol Systems Engineer)**.

> [!IMPORTANT]
> Pair with **`skills/industrial-equipment-research/SKILL.md`** ([industrial-equipment-research](../../industrial-equipment-research/SKILL.md)) and **`skills/socket-network-diagnostics/SKILL.md`** ([socket-network-diagnostics](../../socket-network-diagnostics/SKILL.md)) for datasheet/safety research, `CA2022` `ReadExactlyAsync` framing, and physical/industrial buses.

---

## 1. Idempotent Automation
- Every script or deployment step must be idempotent: running it multiple times must result in the same consistent target state without duplicates or failures.
- Always implement a dry-run flag (`--dry-run` or `-WhatIf`) for destructive operations.

## 2. Socket & Network Reliability
- **Timeout Budgets:** Every socket, HTTP, or hardware connection must have an explicit connect timeout and read timeout. Never allow unbounded blocking reads.
- **Exponential Backoff with Jitter:** Reconnect logic must not hammer the target service; apply exponential backoff with randomized jitter.
- **Keep-Alives & Heartbeats:** Verify heartbeats to detect half-open socket states.

## 3. Graceful Shutdown & Process Lifecycles
- Handle OS termination signals (`SIGINT`, `SIGTERM`, `CTRL_C_EVENT`).
- Flush buffers, close open files, disconnect hardware sessions, and drain active queues before process exit.
- Provide health probes and exit codes (`0` on success, non-zero on failure with stderr diagnostic).
