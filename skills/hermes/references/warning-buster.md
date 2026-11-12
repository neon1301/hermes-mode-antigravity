# 🧹 Warning Buster: Zero-Warnings Engineering Protocol

This reference defines the systematic elimination of compiler and linter warnings, turning noisy legacy builds into clean, defect-free codebases without behavioral regressions.

---

## 1. The 5 Warning Triage Buckets (C# / .NET & TypeScript)

Compiler warnings are not cosmetic: they are frequently dormant runtime bugs, memory leaks, or race conditions.
Group all warnings into 5 prioritized buckets:

| Priority | Category | Typical Warning Codes | Root Cause & Standard Remediation |
| :--- | :--- | :--- | :--- |
| **P1** | **I/O & Socket Framing** | `CA2022` | `Stream.Read` does not guarantee reading buffer count. Replace with `Stream.ReadExactly` (.NET 7+) or explicit read loop. |
| **P2** | **Null Dereference & Safety** | `CS8602`, `CS8600`, `CS8604` | Dereferencing possible null. Apply null-coalescing (`??`), pattern matching (`is not null`), or guard clauses. |
| **P3** | **Uninitialized Properties** | `CS8618` | Non-nullable property uninitialized. Add `required` keyword, default initialization, or mark nullable (`?`). |
| **P4** | **Async Misuse & Threading** | `CS1998`, `CS4014` | Async method without `await` or unawaited Task. Remove `async` keyword or use `Task.FromResult`, await properly. |
| **P5** | **Dead Code & Obsolete APIs** | `CS0168`, `CS0219`, `CS0414`, `CS0618` | Unused variables, unreachable code, or deprecated methods. Safely discard (`_ = ...`) or remove. |

---

## 2. The Safe Batching Execution Loop (`/hermes fix-warnings`)

When `/hermes fix-warnings` is triggered:

```text
[1. Baseline Audit]       ──> Run stack compiler/linter (e.g. `dotnet build /warnaserror:false -v:quiet`, `tsc --noEmit`) to capture total warnings count
          │
          ▼
[2. Group by Diagnostic] ──> Group output by code (e.g., 240x CS8618, 85x CS8602, 12x CA2022)
          │
          ▼
[3. Isolate & Fix Bucket]──> Dmitry addresses ONE specific warning code across all occurrences
          │
          ▼
[4. Build Verification]  ──> Rerun compiler to verify that exact warning count dropped with ZERO new errors
          │
          ▼
[5. QA Regression Guard] ──> Viktor audits diffs to verify business logic and serialization were not altered
          │
          ▼
[Repeat for Next Bucket] ──> Iterate until warnings reach 0 (Zero-Warnings Milestone)
```

---

## 3. Guiding Rules
- **Never suppress with `#pragma warning disable` without explicit approval:** Fix the underlying cause rather than masking the symptom.
- **Preserve Serialization Contracts:** Do not arbitrarily change public property types or names in DTOs.
- **Deterministic Progress Reporting:** Log warning reduction milestones in `chatter.md` (e.g., *"Warnings reduced: 724 -> 480 -> 120 -> 0"*).
