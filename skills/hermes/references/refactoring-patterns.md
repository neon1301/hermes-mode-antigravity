# 🧹 Monolith Decomposition & Refactoring Standards (Sergey's Standard)

This reference outlines safe refactoring workflows for decomposing massive legacy files (such as 4000+ line server entrypoints) into clean, modular components.

> [!IMPORTANT]
> Full methodology lives in **`skills/code-refactoring-modernization/SKILL.md`**, with specialized modules in [references/monolith-decomposition.md](../../code-refactoring-modernization/references/monolith-decomposition.md) (CRAP-score triage, 300-400 line modularity target, seam extraction, cyclic dependency removal, dead-code elimination) and [references/strangler-characterization.md](../../code-refactoring-modernization/references/strangler-characterization.md) (Characterization/Golden Master baseline, Strangler Fig phased cutover, rollback triggers, clean atomic edits).

---

## 1. Monolith Decomposition Principles
- **Target Size:** Aim to keep individual service classes focused and under 300–400 lines.
- **Single Responsibility:** A class should have one reason to change. Separate socket networking, database persistence, and business orchestration into distinct files.
- **Interface Segregation:** Extract interfaces (`IEquipmentCommunicationService`, `ITelemetryProcessor`) to allow unit testing and mock injection.

---

## 2. Safe Step-by-Step Extraction Workflow
1. **Identify Seams:** Find self-contained groups of private methods and fields that operate on a common concern.
2. **Extract to New File:** Move methods and state into a new dedicated class file with internal/public visibility.
3. **Inject Dependency:** Pass the new class instance into the original caller via constructor or method parameter.
4. **Compile & Verify:** Run the stack build and test suite immediately (`dotnet build`, `tsc --noEmit`, `pytest`, or `go test`) to confirm zero syntax or visibility regressions.
5. **Repeat:** Move to the next subsystem until the original file is reduced to clean orchestration code.
