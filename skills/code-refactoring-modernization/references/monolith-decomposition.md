# Monolith Decomposition, CRAP Triage & Clean Modularity

Synthesized from **`github/awesome-copilot`** (`refactor`), **`dotnet/skills`** (`crap-score`), and Hermes Fleet modularity standards (300–400 lines per file ceiling).

---

## 1. Triage by Risk: Complexity + Coverage (`CRAP` Formula)

Do not chop monolithic files randomly. Measure where risk actually concentrates:
$$\text{CRAP}(m) = \text{CC}(m)^2 \times (1 - \text{Coverage}(m))^3 + \text{CC}(m)$$
- High cyclomatic complexity (`CC`) + low test coverage (`0%`) = extreme regression danger (**pin with Characterization Tests FIRST**, then extract pure logic from side effects).
- Low complexity boilerplate or isolated pure helpers = safe immediate extraction targets.

---

## 2. Step-by-Step Seam Extraction Playbook

### Step A: Separate Pure Domain/Parsing from Side-Effect Shells ("Functional Core, Imperative Shell")
Look inside a 2,000-line God-class for interleaved code:
1. Extract **pure stateless transformations** first (checksums, byte-frame decoders, validation rules, formatting, pricing math) into static/pure helper classes -> trivial to unit-test in milliseconds.
2. Isolate **external I/O boundaries** next (DB queries, TCP sockets, HTTP clients, filesystem IO, COM/SAP wrappers) behind small consumer-facing interfaces (`IMachineSocket`, `ITelemetryStore`).
3. Keep the remaining orchestrator slim (~100–250 lines): wiring, error boundary, and flow control only.

### Step B: Targeted Splitting Patterns
- **WinForms / Giant Partial Classes:** If splitting an existing WinForms/monolith file safely, separate cleanly by domain sub-concern (`*.Schema.cs`, `*.Ingestion.cs`, `*.Connection.cs`) or dedicated DI services, keeping constructor/event subscriptions deterministic and explicitly unhooked on `Dispose`.
- **Replace Boolean Flag Explosions & Long `if/else` Chains:** Replace repeated `if (vendor == "A") ... else if (vendor == "B")` switches with a Strategy interface + dictionary/DI registry (`IDictionary<string, IHandler>`) so adding variants stops editing existing core code (Open-Closed Principle).
- **Consolidate Copy-Pasted Blocks:** When 2+ methods repeat identical error handling, retry loops, or validation guards differing only by types/delegates, extract one parameterized helper.

---

## 3. Breaking Circular Dependencies

If `ServiceA` calls `ServiceB` and `ServiceB` calls `ServiceA`:
1. **Extract Shared Contract / Mediator Interface:** Push shared DTOs/events into a lower layer (`Domain` / `Abstractions`) neither concrete service owns exclusively.
2. **Invert Control with Callbacks / Domain Events:** `ServiceB` raises an event or returns a result object rather than calling back into `ServiceA`.
3. Verify zero package/namespace cycles remain after extraction.

---

## 4. Dead Code & Warning Purge Checklist

After extracting every module:
- Remove unreachable branches, commented-out code blocks, obsolete feature flags, unused private fields/methods, and unused `using`/`import` statements.
- Confirm zero new compiler warnings (`CS0168`, `CS0219`, `CS8600+`, unused TypeScript/Python lint warnings).
- Record old-to-new module mapping in `.hermes/memory/sergey.md` so other agents find extracted services immediately.
