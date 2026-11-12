# Stateful Industrial Protocol Emulators & Test Harnesses

Covers **Custom Binary/ASCII TCP & UDP**, **Modbus TCP/RTU**, **OPC UA**, and serial bridge emulators.

---

## 1. Stateful Machine Finite-State Machine (FSM)

Simple "echo" mocks miss synchronization bugs. Model realistic machine state transitions and realistic sensor drift:

```text
   [OFFLINE / IDLE] ──(Start Cmd)──> [SETUP / RAMPING] ──> [RUNNING]
         ▲                                                      │
         └────(Stop / Reset)──── [STOPPED / ALARM / E_STOP] ◄───┘
```

- **State-Driven Telemetry:** Telemetry values MUST react realistically to state and commands (`RUNNING` advances counters/meters and heat; `STOPPED` halts counters and emits explicit stop/alarm code; `ALARM` rejects invalid job-start commands with proper hardware NACK opcodes!).
- **Dual-Channel / Concurrent Clients:** Support configurable max clients, duplicate session conflict simulation (like PLCs allowing only 1 active TCP master!), and realistic periodic unsolicited telemetry alongside command/response polling.

---

## 2. Reusable CLI & Automated Test Harness Architecture

Write lightweight emulators in the project's native runtime (C# / Python / Node.js) usable BOTH manually in terminal and programmatically in tests:

1. **Standardized CLI Interface (Config-Driven):**
   - `--bind <host>` (defaults dynamically to loopback) & `--port <num>` (`0` for ephemeral test port printed cleanly to stdout as JSON/line).
   - `--scenario <normal|drip|rst-storm|crc-corrupt|burst|alarm-cycle>`
   - `--cadence-ms <int>`, `--burst-rate <int>`, `--fault-rate <0.0..1.0>`, `--seed <int>`
2. **Golden Capture Playback (`--replay <capture_file>`):**
   - Replay sanitized real-world hex/JSONL frame traces captured during commissioning or reverse engineering (`@artem`) to reproduce exact historical shop-floor edge bugs deterministically.
3. **Structured Telemetry Ledger:** Emit clean timestamped packet counters (`txFrames`, `rxFrames`, `injectedFaults`, `activeClients`) so `@viktor`'s automated tests can assert exact packet delivery and reconnect counts without fragile `Thread.Sleep` guesses.
