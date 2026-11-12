---
name: technical-documentation-adr
description: Grounded technical writing, Diataxis structuring, Architecture Decision Records (ADRs), OpenAPI/AsyncAPI specs, binary protocol sheets, and operator runbooks. Use alongside c4-architecture-mermaid when documenting systems, protocols, APIs, or troubleshooting guides.
---

# Technical Documentation, ADRs & Protocol Specification Skill

This skill guides **📝 Anna** in turning complex architectures, industrial socket protocols, and backend APIs into crisp, maintainable documentation **strictly grounded in actual source files**.

---

## 1. Grounded Truth & Co-Authoring Discipline (`anthropics/skills`)

- **Never Document From Memory or Assumptions:** Read the exact source files, DTOs, config keys, packet parsers, and endpoints before writing a single table row or example payload.
- **Zero Hallucinated Paths or Symbols:** Every mentioned file path, symbol name, HTTP status, config key, byte offset, and port default MUST match the verified codebase!
- **Co-Activate Visual Diagrams:** Pair structural architecture docs with **`c4-architecture-mermaid`** (`skills/c4-architecture-mermaid/SKILL.md`) for clean C4 Context/Container/Component/Sequence Mermaid diagrams.

---

## 2. Progressive Reference Routing Matrix

Load ONLY the reference guide matching the documentation artifact:

| Artifact Type | Load Reference | Core Standards Covered |
| :--- | :--- | :--- |
| **Diátaxis, ADRs & Operator Runbooks** | [references/diataxis-adr-runbooks.md](references/diataxis-adr-runbooks.md) | **Diátaxis 4-Quadrant System** (Tutorials, How-To, Reference, Explanation), **ADR Template (`ADR-NNNN`)** with Context/Options/Trade-offs/Consequences, **Shop-Floor & Ops Runbooks** (Symptoms, Triage, Mitigation, Rollback) |
| **OpenAPI, AsyncAPI & Binary Protocol Specs** | [references/openapi-protocol-specs.md](references/openapi-protocol-specs.md) | **OpenAPI 3.0/3.1** (`document-api-endpoint`, RFC 7807 errors, realistic payloads), **Binary & Industrial Socket Spec Format** (Byte Offsets, Types, Endianness, Bitmasks, CRC, State Tables), Changelogs |

---

## 3. `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Separate documentation intent clearly (do not bury reference parameter tables inside step-by-step onboarding tutorials).
- Quote Mermaid node labels containing parentheses, brackets, or special characters (`id["Parser (v2.1)"]`), avoiding raw HTML tags inside Mermaid nodes.
- Keep secrets/credentials out of all documentation and sample configs (`YOUR_API_KEY`, `<DB_CONNECTION_STRING>` placeholders only).

### `MUST NOT DO`
- NEVER invent undocumented error codes, field names, or protocol flags to fill gaps — mark unverified fields explicitly as `TBD / Verify in hardware manual` and confirm with `@alexey` / `@artem` / `@dmitry`.
- NEVER use vague filler prose ("this component handles various tasks smoothly"); state exact inputs, outputs, failure modes, and config keys.
