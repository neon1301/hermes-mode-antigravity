---
name: c4-architecture-mermaid
description: Architectural system mapping using the C4 Model (Context, Container, Component, Code) and interactive Mermaid diagrams. Use when documenting complex distributed software, industrial data flows, protocol handshakes, or component hierarchies.
---

# C4 Architecture & Mermaid Diagramming Skill

This skill guides technical architects (primarily **📝 Anna**) in translating complex, sprawling codebases into clear, hierarchical architectural models using the **C4 Model** and **Mermaid.js**.

---

## 1. The 4 Levels of the C4 Model

```text
[Level 1: System Context] ──> Big picture: People, external enterprise systems (SAP), factory machines
            │
            ▼
[Level 2: Container]      ──> Executable units: WinForms App, Windows Service, SQLite, MSSQL
            │
            ▼
[Level 3: Component]      ──> Internal building blocks: SocketServer, TelemetryPipeline, SapConnector
            │
            ▼
[Level 4: Code]           ──> Class diagrams, state machines, and sequence handshakes
```

---

## 2. Mermaid Diagram Templates

### Level 1: System Context Diagram
```mermaid
flowchart TD
    Machines["🏭 Industrial Equipment & PLCs (Multi-Vendor Hardware)"]
    Server["🖥️ Central Ingestion Server (Backend Service)"]
    DB["💾 Telemetry Storage (Database Cache / Historian)"]
    ERP["🏢 Enterprise ERP / Management System"]
    Operator["👷 Plant Operator / Dispatcher (Client UI)"]

    Machines -->|"Raw Network Telemetry (TCP/UDP/Serial)"| Server
    Server -->|"Persists High-Frequency Records"| DB
    Server -->|"Synchronizes Production Orders"| ERP
    Operator -->|"Monitors & Manages Plant State"| Server
```

---

### Level 2 & 3: Container / Component Sequence Diagram
```mermaid
sequenceDiagram
    autonumber
    actor Machine as 🏭 Factory Equipment
    participant Socket as 🔌 EquipmentSocketHandler
    participant Engine as ⚙️ TelemetryEngine
    participant DB as 🗄️ Database Storage
    participant ERP as 📊 Enterprise ERP Connector

    Machine->>Socket: Protocol Frame (Metrics, State, Alarms)
    Socket->>Socket: Stream.ReadExactly & CRC Verification
    Socket->>Engine: IngestTelemetry(TelemetryPacket)
    Engine->>DB: Batch Insert (High-Throughput Mode)
    opt Production Target Reached
        Engine->>ERP: Trigger Production Order Confirmation
        ERP-->>Engine: Confirmation ID: 1049281
    end
    Socket-->>Machine: ACK Response Frame
```

---

## 3. Best Practices & Rules
- **Escape Special Characters:** Always quote node labels containing brackets, colons, or parentheses (e.g. `Server["Ingestion Server (v2.0)"]`).
- **Use Semantic Icons:** Pair emojis with labels to make large diagrams immediately legible to factory operators and engineers.
- **Save to `.hermes/docs/`:** Store generated diagrams alongside Markdown documentation for permanent project retention.
