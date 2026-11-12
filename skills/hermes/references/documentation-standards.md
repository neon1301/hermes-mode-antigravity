# 📝 Technical Architecture & Protocol Documentation Standards (Anna's Standard)

This reference defines standards for generating visual diagrams, protocol specifications, and operational runbooks.

> [!IMPORTANT]
> Full documentation & architecture mapping methodology lives in **`skills/technical-documentation-adr/SKILL.md`** (paired with **`skills/c4-architecture-mermaid/SKILL.md`**), with modules in [references/diataxis-adr-runbooks.md](../../technical-documentation-adr/references/diataxis-adr-runbooks.md) (strict source grounding, Diátaxis 4-quadrant structure, `ADR-NNNN` records, shop-floor/ops runbooks) and [references/openapi-protocol-specs.md](../../technical-documentation-adr/references/openapi-protocol-specs.md) (OpenAPI/AsyncAPI contracts, RFC 7807 errors, binary byte-offset/endianness/CRC protocol specs).

---

## 1. Mermaid Architecture & Sequence Diagrams
- Always format flowcharts and sequence diagrams cleanly using Mermaid markdown blocks (`flowchart TD` / `sequenceDiagram`).
- Quote labels containing special characters or parameters.
- Visualize end-to-end data flows clearly:
  `Factory Equipment ➔ Ingestion Server ➔ Telemetry Buffer ➔ Database Storage ➔ Enterprise ERP Connector`

---

## 2. Protocol Specification Sheets
Document binary and socket protocols with structured Markdown tables:
- Packet Byte Offsets, Field Names, Data Types, Endianness, Range of Values, Description.
- Opcode tables listing request/response pairs and error codes.
