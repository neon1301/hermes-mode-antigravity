# Context Engineering, Memory Architectures & Multi-Agent Harnesses

Synthesized from **`muratcankoylan/Agent-Skills-for-Context-Engineering`** (~18.3k ★) and production agent-harness practices.

---

## 1. Diagnosing & Eliminating Context Degradation

Long-running agent loops rarely fail because a model "forgot how to code" — they fail because the context window degrades silently:
1. **Lost-in-the-Middle Effect:** Attention drops sharply in the middle of very long prompts. Place invariant rules/system instructions at the **beginning** and active task criteria/output constraints near the **end** (recency zone).
2. **Context Poisoning:** Once a hallucinated file path, wrong stack-trace guess, or transient tool error stays inside conversation history, subsequent turns treat it as fact. Explicitly prune, replace, or isolate stale/incorrect error branches cleanly.
3. **Observation Masking & Filesystem Offloading (`filesystem-context`):**
   - Never inject multi-megabyte SQL dumps, full test runner logs, or raw DOM snapshots directly into active context.
   - Write full raw outputs to a scoped scratch artifact file and feed the agent a compact summary (`top lines / counts / matched lines + file path`) so it can inspect slices on demand.
4. **Tool Proliferation Tax (`tool-design`):**
   - Giving one agent 40+ overlapping tools wastes system tokens and causes parameter confusion. Keep per-role tools focused (`<= 10–15` cohesive primitives) with explicit descriptions covering: *what it does, when NOT to use it, parameter invariants, and actionable recovery error messages*.

---

## 2. Anchored Context Compression & KV-Cache Hygiene

- **Static Prefix First (`context-optimization`):** Organize requests strictly as `[System Instructions + Tool Definitions + Stable Docs] -> [History Summary] -> [Recent Turns]`. Never inject shifting timestamps (`Current time: ...`) or random IDs before stable blocks — it invalidates provider prefix KV-caches on every single turn!
- **Anchored Iterative Compaction (`context-compression`):** When summarizing old turns to free context:
  - Preserve **non-negotiable factual anchors** explicitly: *(1) User Goal & Constraints, (2) Files Read/Edited with exact paths, (3) Decisions & Contracts agreed, (4) Remaining Steps & Exact Last Error*.
  - Update the anchored summary incrementally on threshold rather than regenerating lossy free-form prose from scratch.

---

## 3. Agent Memory Systems & Multi-Agent Isolation

- **Tier Memory Intentionally (`memory-systems`):**
  1. *Working Context:* current task window (high precision, disposable).
  2. *Episodic / Checkpoint Memory:* structured handoff state between sessions (goals, status, blockers).
  3. *Semantic / Entity Store:* durable project/user facts indexed cleanly by `tenant_id`, entity key, and timestamp/validity window — handle **fact conflicts and obsolescence** explicitly when requirements change.
- **Multi-Agent Harness Patterns (`multi-agent-patterns`, `harness-engineering`):**
  - Isolate heavy research or specialized execution inside fresh worker contexts returning structured summaries (`files, findings, diffs`) instead of leaking noisy raw search loops back into the coordinator.
  - Guard autonomous loops with hard runtime **step limits (`max_steps`)**, **cost/token circuit breakers**, **clean rollback hooks**, and mandatory approval gates before destructive mutations.
