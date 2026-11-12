---
name: hardware-protocol-simulation
description: Universal industrial equipment mocking, stateful TCP/UDP/Modbus/OPC-UA protocol emulators, network fault injection (RST drops, byte fragmentation, latency jitter), and smart packet fuzzing. Use when testing hardware integration, stream parsers, reconnection loops, or load resilience without physical factory equipment.
---

# Hardware Emulation, Fault Injection & Protocol Fuzzing Skill

This skill guides **🏭 Igor** (alongside **`socket-network-diagnostics`**) in building local virtual machine simulators, adversarial network proxies, and deterministic packet fuzzers across any industrial or backend protocol.

---

## 1. Zero-Hardcode & Simulator Safety Rules

1. **Dynamic Endpoint Configuration (Hermes Rule 9):** Simulator host, listening ports (or ephemeral test port `0`), telemetry cadence, and failure rates MUST come from CLI flags, environment variables, or project config — NEVER hardcode literal IP addresses or production ports inside simulator code.
2. **Deterministic Reproducibility (`--seed`):** Every random fault injector, telemetry generator, and fuzzer MUST accept a `--seed` integer and print the exact active seed on failure so `@dmitry` and `@viktor` can replay any discovered crash 1:1.
3. **Bind Loopback Only by Default:** Keep local fault-injection/fuzz mock listeners bound strictly to local loopback/configured test interfaces so malformed frames never hit real shop-floor PLCs.

---

## 2. Progressive Reference Routing Matrix

Load ONLY the reference guide needed for the simulation objective:

| Simulation Objective | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **Fault Injection & Smart Fuzzing** | [references/fault-injection-fuzzing.md](references/fault-injection-fuzzing.md) | **Trail of Bits Fuzzing Obstacles** (CRC/magic-header valid fuzzing), **Byte-by-Byte TCP Segmentation** (`CA2022` / `ReadExactly` stress test), abrupt TCP **`RST` vs graceful `FIN`**, half-open blackholes, latency+jitter, slow-reader/burst floods, OOM payload-length header bombs |
| **Stateful Protocol Emulators** | [references/stateful-protocol-emulators.md](references/stateful-protocol-emulators.md) | **Machine FSM Emulation** (`IDLE -> RUNNING -> STOPPED -> ALARM -> E_STOP`), multi-vendor **Modbus TCP / OPC UA / Custom Binary & ASCII** mock servers, CLI test harness contract (`start`, `--port`, `--scenario`, `--burst`), PCAP/hex-dump golden playback |

---

## 3. `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Consume exact byte layouts, endianness, CRC polynomials, and register maps from **⚙️ Alexey** (`industrial-equipment-research`) or **🔍 Artem** (`reverse-engineer-anything`) before building protocol frames.
- Expose clean start/stop lifecycle hooks (`await simulator.StartAsync()`, disposable ephemeral port binding, graceful teardown) so **🛡️ Viktor** can embed simulators directly inside automated integration tests.
- Document simulated ports, CLI flags, fault scenarios, and golden hex fixtures in `.hermes/memory/igor.md`.

### `MUST NOT DO`
- NEVER fake protocol success solely with `200 OK` / naive ASCII strings when the real hardware sends multi-segment binary frames, heartbeats, or stateful NACKs.
- NEVER build fuzzers that get stuck at byte 0 failing trivial checksums when testing deeper parser state machines (compute valid CRC on mutated payloads too!).
