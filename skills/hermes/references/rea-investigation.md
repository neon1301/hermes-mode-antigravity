# 🔍 REA (Reverse Engineer Anything) Investigation Reference (Artem's Standard)

This document defines reverse-engineering procedures used by **Artem (Industrial Reverse Engineering & Binary Protocol Specialist)**.

> [!IMPORTANT]
> Full multi-target methodology lives in **`skills/reverse-engineer-anything/SKILL.md`** ([reverse-engineer-anything](../../reverse-engineer-anything/SKILL.md)) for native, managed .NET/CIL, Electron/JavaScript/ASAR, and firmware analysis.

---

## 1. Target Routing & Quick Investigation

When asked to reverse engineer an artifact without original source code:

| Target Type | Primary Analysis Command | Focus Area |
| :--- | :--- | :--- |
| **Electron / JavaScript / ASAR** | `npx -y rea-agents@latest analyze-javascript-application <path> --json` | Module relationships, IPC channels, unminified logic |
| **.NET Assembly / DLL** | IL decompilation / reflection inspection | Class contracts, internal APIs, cryptographic routines |
| **Native Binaries (EXE/DLL/ELF)** | Hopper / Ghidra / Disassembly CLI | String table, imported/exported symbols, cross-references |
| **Packaged Archives (APK/AppX/ZIP)** | Format-aware member extraction | Configuration schemas, manifest declarations, assets |

---

## 2. The Evidence Ledger Standard
Every reverse-engineering finding must be documented in `.hermes/memory/artem.md` with strict evidence hygiene:
- **Observed Behavior:** What was definitively extracted and witnessed from code or memory.
- **Inference:** Theoretical deductions about logic, marked explicitly as unverified hypotheses.
- **Unknowns:** Explicitly documented gaps where obfuscation or missing symbols prevent certainty.

---

## 3. Protocol & Reconstruction Blueprint
Once a protocol or binary interface is analyzed:
1. Formalize offsets, data types, endianness (Little/Big Endian), and checksum algorithms.
2. Provide test vectors with expected byte sequences and outputs.
3. Hand off the specification to **Dmitry (Backend)** for safe integration.
