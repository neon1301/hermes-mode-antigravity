---
name: reverse-engineer-anything
description: Reverse engineer native, managed, Electron, packaged, firmware, and browser targets with REA, and build AgentEnv bundles. Use when analyzing compiled binaries, decompiling .NET/CIL or ASAR, inspecting protocol framing, verifying runtime evidence, or investigating closed-source artifacts.
metadata:
  version: "63"
---

# REA — Reverse Engineer Anything

Use REA when an engineering claim depends on a shipped binary or package, decompilation, requested runtime evidence, or comparison with behavior not established by available source code. For ordinary analysis of an open repository, use standard repository tools.

---

## 🔌 1. Connection & Diagnostics

- Installing this skill supplies methodology; it does not automatically register analysis engines. If tools are available, proceed directly to the target.
- For setup-owned registrations, run `rea doctor`. For plugin installs, restart/re-enable the plugin.
- For JS/ASAR fallback without MCP, execute:
  ```bash
  npx -y rea-agents@latest analyze-javascript-application /path/to/app --json
  ```
- Full recovery ladders & prerequisites: [`references/connection-recovery.md`](references/connection-recovery.md).

---

## 🎯 2. Route the Target First

Select entry tools by target artifact type:

1. **ASAR / JS / Electron:** `analyze_javascript_application` (check fuses with `inspect_electron_fuses` before `--inspect`).
2. **.NET / Managed PE/CLI:** `inspect_managed_artifact` (NativeAOT routes to Ghidra).
3. **Native Binary (ELF/PE/Mach-O):** `open_binary` ➔ `binary_overview` / `analyze_function` (supports Ghidra, IDA, Kuna).
4. **Static Binary Headers & Hardening:** `inspect_binary_hardening`, `inspect_pe_imports`, `inspect_elf_notes`, `inspect_go_binary`, `inspect_rust_binary`.
5. **Archives & Firmware:** `open_binary` ➔ `inspect_artifact`, `inspect_android_package`, `inspect_firmware_regions`.
6. **Web / Network Captures:** `inspect_web_network_capture`, `inspect_pcap_capture` (HAR, SAZ, PCAP).

👉 Detailed routing specifications & provider flags: [`references/target-routing-reference.md`](references/target-routing-reference.md).

---

## 📊 3. Summary-First Execution Loop

- **Default to Summary:** For large targets, start with `"detail": "summary"` to preserve memory budget.
- **Retained Evidence References:** Use `parent_evidence_id` for facet paging and comparison views (`compare_functions`, `match_native_functions`). Request `"detail": "complete"` only when the payload must travel inline.
- **Handling Truncation:** If transport limits or client truncation occur, use retained IDs with `inspect_analysis_view` or call `export_evidence_bundle` to write full sessions to disk.
- **Evidence Integrity:** Distinguish direct observations, inferences, and unknowns. Cite Evidence IDs; never imply static analysis observed execution.

---

## 📋 4. Staged Investigation Plan

1. **Target Checklist:** Convert request into concrete questions and required evidence types.
2. **State Reuse:** Inspect existing REA session, bookmarks, and prior evidence before reopening.
3. **Iterative Drilling:** Start from smallest useful inventory, follow entry points to state changes, and expand only when concrete gaps remain.
4. **Corroborate Conclusions:** Validate static findings with runtime observation only when necessary.
5. **Evidence Ledger:** Maintain structured findings linking claims to Evidence IDs, confidence, and unresolved unknowns. Revisit original checklist before sign-off.

---

## 📚 References & Protocols

- Framing & Opcode Reversing: [`references/binary-frame-disassembly.md`](references/binary-frame-disassembly.md)
- Complete Routing Table & Flags: [`references/target-routing-reference.md`](references/target-routing-reference.md)
- Connection Recovery Ladder: [`references/connection-recovery.md`](references/connection-recovery.md)
- Hermes Fleet Investigation Guide: [`../hermes/references/rea-investigation.md`](../hermes/references/rea-investigation.md)
