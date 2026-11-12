# 🏭 Hardware Mock & Socket Simulation Reference (Igor's Standard)

This reference defines the creation and orchestration of virtual industrial hardware mocks and telemetry simulators.

> [!IMPORTANT]
> Full simulation, fault-injection & fuzzing standards live in **`skills/hardware-protocol-simulation/SKILL.md`** (paired with **`skills/socket-network-diagnostics/SKILL.md`**), with modules in [references/fault-injection-fuzzing.md](../../hardware-protocol-simulation/references/fault-injection-fuzzing.md) (Zero-Hardcode endpoints, deterministic `--seed`, byte-by-byte TCP segmentation, `RST` vs `FIN` drops, CRC-valid fuzzing) and [references/stateful-protocol-emulators.md](../../hardware-protocol-simulation/references/stateful-protocol-emulators.md) (stateful PLC/machine FSMs, multi-vendor Modbus/OPC UA/socket mocks, CLI test harness hooks).

---

## 1. Universal Machine Simulator Patterns (TCP/UDP Mocks)
- **Local Port Binding:** Spin up local listeners on configured ports mirroring factory equipment.
- **Protocol Cadence:** Simulate realistic machine heartbeats (e.g., periodic status frames: RUNNING, STOPPED, ERROR).
- **Data Variability:** Emit dynamic cycle counters, operational speed variations, and realistic sensor telemetry.

---

## 2. Failure Injection Modes
- **Abrupt Reset (`RST`):** Close active TCP sockets without a graceful FIN handshake to verify server auto-reconnect logic.
- **Framing Fragmentation:** Send packet headers in one TCP segment and payload in another with a 200ms delay to stress-test `Stream.ReadExactly` implementations.
- **Garbage Ingestion:** Transmit frames with corrupt CRC/checksum to verify parser discard logic.
