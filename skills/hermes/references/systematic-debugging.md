# 🐞 Systematic Debugging Methodology

*Adapted from `obra/superpowers` under the MIT License.*

---

## 🏛️ The Iron Law of Systematic Debugging

> **FIND ROOT CAUSES BEFORE PROPOSING FIXES.**
> *Never write code or modify configurations to fix a bug until you have proven you understand the root cause.*
> *Shotgun debugging — making random code changes hoping a test turns green — is strictly prohibited.*

---

## 🔄 The 4-Phase Debugging Process

```
┌────────────────────────┐
│ Phase 1: Investigate   │  Reproduce reliably & isolate symptom from cause
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Phase 2: Pattern Diff  │  Review git diffs, environmental state & logs
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Phase 3: Hypothesis    │  Formulate falsifiable hypothesis & test invariants
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Phase 4: Atomic Fix    │  Implement minimal root-cause fix + regression test
└────────────────────────┘
```

### Phase 1: Root Cause Investigation (Reproduce & Isolate)
1. **Deterministic Reproduction**: Create a minimal reproduction script, isolated unit test, or exact CLI invocation. Document the reproduction rate (e.g. 10/10 runs).
2. **Symptom vs Cause Separation**: Differentiate between where the failure manifests (e.g., a crash in an assertion or a null reference downstream) and where the invalid state originated (e.g., an unhandled null in an earlier pipeline step).
3. **Trace the Invariant**: Identify which specific invariant was violated and find the exact line where reality diverged from expectations.

### Phase 2: Pattern & Differential Analysis
1. **Recent Changes (`git log -p`)**: Inspect commits touching the failing code path. Did a recent refactoring, dependency bump, or interface change introduce this?
2. **Environmental & Platform Diffs**: Check OS differences (Windows CRLF vs Linux LF, case-insensitive vs case-sensitive paths), Node.js/runtime versions, and shell differences (PowerShell vs Bash).
3. **Data Path Inspection**: Log or inspect intermediate state payloads without modifying business logic.

### Phase 3: Hypothesis Formulation & Testing
1. **Falsifiable Statement**: Write down a single, clear hypothesis: *"The bug occurs because component X assumes Y, but under condition Z, payload W is provided."*
2. **Prediction**: *"If this hypothesis is true, altering input A to B will produce symptom C."*
3. **Condition-Based Verification**: For concurrency or async bugs, never use arbitrary delays (`sleep(100)`). Use condition-based polling or event listening to verify race conditions deterministically.

### Phase 4: Atomic Fix & Verification
1. **Minimal Surface**: Address the root cause directly at the origin point. Do not add band-aids or defensive null checks across 10 unrelated files to mask an upstream defect.
2. **Regression Test Lock**: Write an automated regression test that fails before the fix and passes after the fix.
3. **Verification-Before-Completion**: Run the full test suite fresh before declaring the bug resolved.
