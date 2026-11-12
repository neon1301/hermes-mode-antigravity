# OpenAPI Contracts, Protocol Specifications & Changelogs

Synthesized from **`getsentry/skills`** (`document-api-endpoint`), **`full-stack-skills/document-skills`**, and industrial protocol documentation standards.

---

## 1. REST / HTTP API Documentation Standard (OpenAPI 3.0 / 3.1)

When documenting endpoints (manually or verifying generated Swagger/`drf-spectacular`/Swashbuckle specs):
- **Required Endpoint Elements:**
  1. HTTP Method + Versioned Path + Auth Scope/Permissions (`Bearer`, API Key, role requirements).
  2. Request Headers (`Idempotency-Key`, `Content-Type`), Path/Query parameters (types, ranges, defaults, cursor pagination syntax).
  3. Concrete, valid **Request & Response JSON Examples** matching exact serializer casing (`camelCase` vs `PascalCase`).
  4. All Failure Statuses (`400/422`, `401/403`, `404`, `409`, `429`, `503`) aligned to **RFC 7807 Problem Details**.
- Cross-check DTO property nullability and enum values directly against source models before publishing!

---

## 2. Binary & Industrial Socket Protocol Specification Template

When turning `@alexey`'s hardware research or `@artem`'s reverse-engineered evidence into official docs:

### Transport & Framing Header
- **Transport:** TCP / UDP / Serial RS-485 (`Baud`, `Data/Parity/Stop`), Role (Client vs. Listener), Default Config Keys (never hardcoded IPs).
- **Framing:** Length-prefix vs. Delimiter (`STX`/`ETX`, CRLF) vs. Fixed-Size Frame, Keep-Alive / Heartbeat cadence, Max Frame Allocation Guard.
- **Byte Order & Checksum:** `Big-Endian` / `Little-Endian`, Checksum (`CRC-16/MODBUS`, `CRC-32`, LRC) including polynomial, initial seed, reflection, XOR-out, and exact covered byte range.

### Byte Layout Table Format
| Byte Offset | Length (Bytes) | Field Name | Type / Encoding | Endianness | Valid Range / Bitmask | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `0..1` | `2` | `SyncHeader` | `uint16` / Raw Hex | Big | `0xAA 0x55` | Fixed frame preamble |
| `2..3` | `2` | `PayloadLen` | `uint16` | Big | `0..4096` | Payload byte length excluding header/CRC |
| `4` | `1` | `Opcode` | `uint8` | N/A | See Opcode Table | Command / Telemetry identifier |
| `...` | `N` | `Payload` | Struct / UTF-8 | Spec per field | Variable | Command/status body |
| `End-2..End-1` | `2` | `Crc16` | `uint16` | Little | Calculated | `CRC-16/MODBUS` over bytes `0..End-3` |

Always pair with a **Mermaid `sequenceDiagram`** showing normal handshake, retry on NACK/timeout, and abrupt reconnect recovery, plus an **Opcode & Error Code Matrix**.

---

## 3. Release Changelogs (Keep a Changelog)

Group verified user/operator-visible changes cleanly:
- **Added / Changed / Fixed / Security / Breaking Changes & Migration Steps** — citing only actually shipped PRs, config key additions, and verified behavioral changes.
