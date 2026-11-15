# Living C4 Architecture Diagrams, Protocol Sequence Flows & ADR Governance

This reference manual provides production-grade architectural documentation patterns for **📝 Anna** (Principal Technical Writer & Docs Architect) covering living Mermaid C4 models, dynamic protocol sequence diagrams, and ADR lifecycle governance.

---

## 1. Living C4 Container & Component Diagrams (Mermaid)

C4 diagrams must reflect the actual runtime codebase. To prevent rendering syntax errors in markdown viewers, **all node labels containing special characters, brackets, or commas MUST be double-quoted**. Never embed raw HTML tags (`<br>`, `<div>`) in Mermaid nodes.

### Container-Level Example (Industrial Factory Telemetry System)
```mermaid
C4Container
    title "Container Diagram — Industrial Factory Floor Telemetry System"

    Person(operator, "Plant Operator", "Monitors loom fleet status and responds to alarms.")

    System_Boundary(factory_system, "Manufacturing Execution System") {
        Container(desktop_ui, "Desktop Dashboard (WinForms / WebView2)", "C# 14 / Three.js", "Displays 2D status grid and 3D digital twin of looms.")
        Container(socket_gateway, "Socket Ingestion Gateway", "C# / System.IO.Pipelines", "Receives raw binary frames from PLCs over TCP.")
        Container(api_service, "Central API Service", "ASP.NET Core / .NET 10", "Processes business rules and provides REST/WS endpoints.")
        ContainerDb(timeseries_db, "Telemetry Database", "PostgreSQL / Timescale", "Stores raw sensor metrics and alarm events.")
    }

    System_Ext(plc_fleet, "Loom PLC Fleet", "Factory floor machinery with serial/Ethernet bridges.")

    Rel(operator, desktop_ui, "Interacts with", "UI / Mouse")
    Rel(plc_fleet, socket_gateway, "Streams telemetry frames", "TCP / Binary")
    Rel(socket_gateway, timeseries_db, "Persists micro-batches", "Npgsql")
    Rel(desktop_ui, api_service, "Fetches telemetry & sends commands", "HTTP / WebSocket")
    Rel(api_service, timeseries_db, "Queries historical trends", "SQL")
```

---

## 2. Dynamic Industrial Protocol Sequence Diagrams

Sequence diagrams document packet flow, timeouts, and error handling across distributed components:

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Operator UI
    participant Gateway as Ingestion Gateway
    participant Machine as Loom PLC
    participant DB as Central DB

    Note over Gateway, Machine: Initial Connection & Handshake
    Machine->>Gateway: TCP Connect (SYN)
    Gateway-->>Machine: TCP Accept (SYN-ACK)
    Machine->>Gateway: Telemetry Frame [Sync: 0xAA55, Len: 32B]
    activate Gateway
    Gateway->>Gateway: Verify CRC-16 Checksum
    alt CRC Valid
        Gateway->>DB: Batch Insert Telemetry (WAL)
        Gateway-->>Operator: Push WebSocket Update (RPM, Status)
    else CRC Corrupted
        Gateway->>Gateway: Log Malformed Frame Warning
        Gateway-->>Machine: NACK Frame (Err: BadChecksum)
    end
    deactivate Gateway
```

---

## 3. Living OpenAPI / Contract Synchronization

To prevent documentation rot, technical documentation must be generated from or validated against code contracts:
1. **Source of Truth:** C# DTO records and Controller endpoints define the wire schema.
2. **RFC 7807 Problem Details:** Document error responses using standard RFC 7807 format (`type`, `title`, `status`, `detail`, `instance`).
3. **No Phantom Endpoints:** Every endpoint listed in OpenAPI docs must have a corresponding test in `@viktor`'s test suite.

---

## 4. ADR (Architecture Decision Record) Lifecycle

Format all architectural decisions as lightweight, version-controlled records:
- **Title:** `ADR-NNNN: [Short imperative summary]`
- **Status:** `Proposed` | `Accepted` | `Deprecated` | `Superseded by ADR-XXXX`
- **Context:** The technical driver, constraints, and problem statement.
- **Decision:** The chosen architecture or technology and why alternatives were rejected.
- **Consequences:** Positive benefits, trade-offs, and operational liabilities.
