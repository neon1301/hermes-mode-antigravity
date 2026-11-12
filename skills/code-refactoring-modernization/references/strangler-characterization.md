# Legacy Modernization: Characterization Tests & Strangler Fig

Synthesized from **`jeffallan/claude-skills`** (`legacy-modernizer`) and **`obra/superpowers`** incremental verification workflows.

---

## 1. Characterization Tests (Pin Before You Cut)

Legacy code often preserves subtle undocumented edge behaviors callers rely on (rounding quirks, null coercion, exact wire framing, error messages). Before rewriting or splitting brittle legacy paths:
1. **Wrap at the Nearest Safe Seam:** Write automated black-box Characterization (Golden Master / Approval) tests around public entrypoints or module seams covering happy paths, nulls, boundary zeros/maxima, and error branches.
2. **Capture Current Actual Behavior:** Record exact outputs, return codes, emitted frames, or DB side-effects into snapshot/fixture assertions (target **>=80% path coverage** of the code being refactored).
3. **Lock & Refactor:** Run characterization tests after **every** micro-extraction. If output changes unexpectedly, either restore exact semantics immediately or escalate as an explicit bug fix to Lead/User — never silently alter behavior mid-refactor.

---

## 2. Strangler Fig Pattern (Incremental Replacement)

Reject risky multi-month "stop-everything full rewrites". Replace legacy subsystems live piece-by-piece:

```text
[Callers / UI / Devices]
           │
           ▼
[Routing Facade / Adapter Interface]
     ├── Legacy Path (default safe fallback)
     └── Modern Clean Service (shadow -> canary -> 100%)
```

### Execution Phases
1. **Introduce Facade / Interface:** Put an abstraction in front of callers (`IOrderSyncGateway`) backed initially 100% by the legacy implementation.
2. **Migrate One Slice at a Time:** Implement one cohesive capability in the clean modern module behind the interface.
3. **Shadow / Parity Compare (High-Risk Paths):** Run both legacy and modern pure paths in shadow/test harnesses comparing outputs for 0 mismatches before switching live callers.
4. **Gradual Cutover with Config Toggle:** Route via project configuration feature flag (Rule 9 Zero-Hardcode!), shifting gradually (e.g. `5% -> 25% -> 50% -> 100%` or per-module) while monitoring error rates and latency.
5. **Decommission Cleanly:** Only delete legacy branches after parity holds cleanly in production/staging and rollback windows close.

---

## 3. Branch by Abstraction & Safety Rollbacks

When upgrading an internal library/ORM/driver across a large codebase (e.g., old DB driver -> modern pooled driver):
- Introduce an internal abstraction wrapper, migrate callers incrementally against the interface, swap the underlying adapter implementation in one isolated class, verify tests pass, and remove the temporary wrapper once migration finishes.
- **Explicit Rollback Trigger:** Define before starting what failure triggers revert (`Build failure after 3 attempts -> git checkout`, error rate spike -> flip config flag back to legacy path).
