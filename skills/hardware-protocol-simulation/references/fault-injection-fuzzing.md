# Network Fault Injection & Smart Protocol Fuzzing

Synthesized from **`trailofbits/skills`** (`fuzzing-obstacles`, `property-based-testing`), **WireMock Chaos / Toxiproxy** patterns, and `socket-network-diagnostics`.

---

## 1. Network Chaos Matrix (Testing Client Resilience)

Physical factory links drop packets, stall mid-frame, and break abruptly without TCP `FIN`. Every hardware client written by `@dmitry` MUST survive all 6 chaos modes without crashing, hanging forever, or leaking sockets:

| Chaos Mode | Physical Equivalent | What It Exposes in Client Code |
| :--- | :--- | :--- |
| **1. Drip / Byte-by-Byte Segmentation** | Slow serial-to-Ethernet bridge splitting 1 packet across multiple TCP segments (`1–3` bytes every `20–100 ms`) | Exposes **`CA2022 Stream.Read` bugs** assuming 1 `ReadAsync` returns the entire message (proves `ReadExactlyAsync`!) |
| **2. Abrupt TCP `RST` (`LingerState(true, 0)`)** | Switch reboot, cable yanked, PLC crash | Verifies socket error cleanup, zero zombie handles, and exponential-backoff reconnect loop |
| **3. Half-Open Blackhole (No Response)** | Dead link / firewall silently dropping packets after handshake | Exposes missing read/idle timeout budgets and missing TCP keep-alive / app heartbeat probes |
| **4. Delay + Jitter Spike** | Congested shop-floor Wi-Fi / PLC CPU burst | Exposes race conditions, overlapping timer ticks, and missing cancellation tokens |
| **5. Telemetry Burst Flood** | Reconnected controller dumping buffered backlog at `1,000+ msg/sec` | Stress-tests `@dmitry`'s bounded `Channel<T>` backpressure and `@denis`'s WAL/micro-batch DB writer |
| **6. Slow-Reader / Backpressure Stall** | Client or ERP hangs while reading response stream | Verifies server/emulator doesn't block other clients or OOM buffer |

---

## 2. Smart Protocol Fuzzing (`trailofbits/skills` Approach)

Dumb random bytes fail at the very first `if (header != MAGIC)` check and never test real parser logic. Bypass parser obstacles intentionally using **Two-Stage Fuzzing**:

### Stage A — Format-Blind / Framing Bombs (DoS & Bounds Defense)
- **Huge Declared Payload Length:** Send valid preamble + `PayloadLen = 0x7FFFFFFF` (`2 GB`) followed by 10 bytes -> verifies parser checks max frame limit BEFORE `new byte[len]`!
- **Truncated EOF Mid-Frame:** Close stream halfway through declared payload length -> ensures `EndOfStreamException` resets cleanly without hanging.
- **Boundary Extreme Payloads:** All `0x00`, all `0xFF`, invalid UTF-8 sequences, negative signed counters, `NaN`/`Infinity` IEEE-754 floats.

### Stage B — Checksum/Magic-Valid Mutation Fuzzing
Compute **valid sync headers and valid CRCs/checksums** around mutated internal opcodes, bitmasks, and field lengths so packets **bypass initial header validation** and stress deep state transitions, deserializers, and DB insertion pipelines!
- Always log the PRNG `--seed` and dump failing raw hex bytes (`0xAA 0x55 ...`) to `.hermes/memory/igor.md` (or test fixtures) on any crash or parser exception.
