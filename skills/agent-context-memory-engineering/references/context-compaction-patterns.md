# 🧠 Context Compaction & Token Economy Patterns

*Adapted from `muratcankoylan/context-*` under the MIT License.*

---

## 🏛️ Context Engineering Invariants

1. **Prefix Caching & KV Reusability**:
   - Keep system instructions, tool definitions, and long immutable references static at the beginning of the context window.
   - Dynamic prompt fragments (user queries, timestamps, transient state) must be placed at the end so LLM providers can reuse cached KV computations.
2. **Deterministic Pruning (Lossless vs Lossy)**:
   - Tool outputs containing repetitive logs or massive data dumps should be truncated to the first 25 lines + summary + disk pointer.
   - Preserving exact file:line references is mandatory; never omit line numbers during compaction.

---

## 🔄 Compaction State Machine

```
┌────────────────────────┐
│ Turn Activity Monitor  │  Track step count (>60) and transcript size (>350KB)
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Checkpoint Snapshot    │  Persist current decisions & REQ ledger to .hermes/checkpoint.md
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Strategic Suggestion   │  Inject <!-- HERMES_COMPACT_SUGGESTED --> via PreInvocation
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Context Pruning        │  Run /compact to compress conversation history
└────────────────────────┘
```

---

## 📐 Structured Output Density

To maximize reasoning efficiency while minimizing generated token consumption:
- Encode inter-agent proposals as dense JSON blueprints (`contract-proposal`, `patch-blueprint`, `security-verdict`, `qa-verdict`).
- Use compact keys (`path`, `lines`, `old`, `new`) rather than verbose conversational narrative.
- Eliminate markdown formatting filler inside machine-to-machine subagent communications.
