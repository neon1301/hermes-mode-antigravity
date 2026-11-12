# 🏛️ Anthropic Advanced Agent Architecture

This reference codifies the official architectural paradigms from Anthropic's *"Building Effective AI Agents"* and the **Claude Code** engineering core into the Hermes Fleet Orchestrator.

---

## 🎯 1. Autonomous Goal Steering (`/goal` Pattern)
* **Definition:** A closed-loop execution pattern where the Orchestrator does not pause after each turn, but continuously drives subagents until an explicit verifiable condition is satisfied.
* **Verifiable Conditions:**
  - Stack build/typecheck returns exit code `0` (`dotnet build`, `tsc --noEmit`, `pytest`, or `go build`).
  - Compiler warnings reduced to `0` (Zero Warnings Policy).
  - Viktor (QA & AppSec) issues `[QA PASS]` and Stanislav (Compliance) issues `[COMPLIANCE PASS]`.
* **Iteration Limits:** To prevent runaway loops, an explicit iteration cap (default: 10 turns per macro-phase) is enforced.

---

## 🎙️ 2. Architectural Alignment Interview (`/grill-me` Pattern)
* **Definition:** A proactive probing mode triggered before modifying core architecture, databases, or public APIs.
* **Protocol:**
  - Lead asks 2–3 targeted multiple-choice questions with recommended defaults.
  - Locks in technical decisions (e.g. SQLite vs. MSSQL, Sync vs. Async sockets, In-Memory vs. File Cache).
  - User answers are saved directly to `systemPatterns.md`.

---

## 🧹 3. Context Compaction & Sliding-Window Pruning (`/compact`)
* **Definition:** Preventing context window saturation through structured distillation.
* **Protocol:**
  - When conversation tokens exceed 70% of model capacity, Lead performs auto-compaction:
    1. Discards raw terminal output, stack traces, and intermediate tool responses.
    2. Retains the active task graph, file anchor links, and key architectural decisions.
    3. Resets the conversational context with a pristine summary, keeping the model sharp and hallucination-free.

---

## 🚦 4. Constitutional Action Gates (Tiered Safety)
Every tool invocation by Lead and subagents is classified into 3 risk tiers:

| Tier | Actions | Execution Policy |
| :--- | :--- | :--- |
| 🟢 **Tier 1: Safe** | `read_file`, build/test commands (`dotnet build`, `tsc --noEmit`, `pytest`, `go test`), configured local loopback mock servers | Executed immediately without user friction |
| 🟡 **Tier 2: Cautious** | `edit_file`, creating new services via `write_file` | Executed with immediate compiler check & Git Auto-Revert protection |
| 🔴 **Tier 3: Critical** | Deleting files, modifying production databases, triggering real hardware/SAP transactions | **STRICTLY BLOCKED** until explicit user confirmation |

---

## ⚡ 5. Prompt Caching Optimization
* Static system prompts, team rosters, and references are anchored at the top of agent prompts.
* Dynamic workspace variables and user tasks are placed at the bottom.
* This guarantees 90%+ Prompt Cache hit rates, speeding up agent execution by **2.5x** and saving **80% of token compute**.
