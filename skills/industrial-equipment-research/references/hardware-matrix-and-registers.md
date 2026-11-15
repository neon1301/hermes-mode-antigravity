# Hardware Matrix, Electrical I/O & Register Map Playbook

Authoritative engineering reference for **Alexey (`@alexey`)** and the Hermes Fleet. Defines four-dimensional equipment modeling, electrical pinouts, communication budgets, and register map decoding rules.

---

## 1. The Four-Dimensional Hardware Matrix

### Dimension 1: Operational States & Machine State Machine
- **Offline / Disconnected:** No electrical or network heartbeat.
- **Standby / Ready:** Control system energized, interlocks satisfied, waiting for run command.
- **Active / Running:** Machine actively executing cycles, generating output, reporting continuous telemetry.
- **Paused / Idle:** Temporary hold (operator pause, material wait, downstream blockage).
- **Warning / Degraded:** Operating within non-fatal warning thresholds (high temperature, low lubrication).
- **Alarm / Fault:** Hard stop triggered by sensor or software interlock (overload, jam, limit switch, emergency stop).
- **Maintenance / Setup:** Manual jogging, calibration, parameter adjustment mode.

### Dimension 2: Electrical & Physical I/O Specifications
- **Power Supply:** Voltage (24V DC, 110V/230V AC, 380V/400V 3-phase), current consumption, surge protection.
- **Digital Inputs (DI):** 24V PNP/NPN, optical isolation, push-buttons, limit switches, optical encoders, proximity sensors.
- **Digital Outputs (DO):** Relay contacts, solid-state switches, indicator towers, solenoid valves, contactor relays.
- **Analog I/O (AI/AO):** 4–20 mA current loops, 0–10 V voltage signals, thermocouples (PT100, Type K), load cells.
- **Safety Interlocks:** SIL / PL rating, dual-channel E-stop circuits, safety light curtains, guard switches.

### Dimension 3: Communication & Protocol Architecture
- **Physical Bus:** RS-232, RS-422, RS-485 (half/full duplex), 10/100/1000 Mbps Ethernet, CAN 2.0B, Fieldbus.
- **Standard Protocol Family:**
  - **Modbus (RTU / ASCII / TCP):** Function codes (0x01 Read Coils, 0x03 Read Holding Registers, 0x06 Write Single Register, 0x10 Write Multiple Registers).
  - **Industrial Ethernet:** Profinet (IO Controller/Device), EtherCAT (EtherCAT Slave Controller), Ethernet/IP (CIP messaging).
  - **Industrial IoT & SCADA:** OPC UA (Binary/XML TCP, security profiles, NodeIds), MQTT (Sparkplug B, JSON telemetry).
  - **Proprietary Socket Protocols:** Raw TCP/UDP streams, custom binary framing (Header, Length, Command, Payload, Checksum/CRC), or delimiter-separated ASCII streams (`STX ... ETX\r\n`).

### Dimension 4: Timing, Telemetry Rates & Network Budgets
- **Telemetry Polling Interval:** Safe polling rate derived from manufacturer manual + forum field findings (e.g. 200ms – 1000ms).
- **Heartbeat & Watchdog Deadline:** Maximum time before connection is declared dead (e.g. 5,000ms – 15,000ms).
- **Command Acknowledgment Timeout:** Expected latency between sending a control command and receiving the machine's ACK frame.

---

## 2. Register Map & Data Decoding Rules

| Parameter | Standard Variations & Pitfalls | Resolution Rule |
| :--- | :--- | :--- |
| **Addressing Base** | 0-based vs. 1-based (PLC offset 40001 vs. protocol register 0x0000) | Always document both PLC address and wire hex address |
| **Endianness** | Big-Endian (Motorola) vs. Little-Endian (Intel) | Check documentation for multi-byte integers (`AB CD` vs `CD AB`) |
| **Word Swapping (32-bit/64-bit)** | Big-Endian with word swap (`CD AB` vs `AB CD`) | Test with known non-zero values (e.g. total runtime meter) |
| **Data Types** | `INT16`, `UINT16`, `INT32`, `UINT32`, `IEEE 754 Float`, `ASCII String`, `Bitmask` | Use explicit strong typing in C# / backend models |
| **Scaling & Engineering Units** | Raw integer representing scaled decimals (e.g. `245` with scale `0.1` = `24.5 °C`) | Separate raw value from scaled engineering unit value in models |
| **Bitfields & Flags** | Single 16-bit word packing 16 individual boolean machine states | Decode using bitwise masks: `(word & 0x0001) != 0` |
