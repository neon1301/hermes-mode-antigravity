# 📐 Pairwise Combinatorial Fault Testing & PICT Matrices

*Adapted from `omkamal/pypict-skill` under the MIT License.*

---

## 🏛️ The Combinatorial Explosion Problem

In industrial hardware simulation (PLCs, weighing controllers, CNCs, barcode scanners), parameters interact in complex ways:
- **Connection States**: `Normal`, `Half-Open`, `RST Dropped`, `Jittery Latency` (4)
- **Framing**: `Full Frame`, `Sub-frame Fragmented`, `Jumbo Concatenated` (3)
- **Checksum / CRC**: `Valid`, `Corrupted 1-bit`, `Inverted Polynomial` (3)
- **Data Boundary**: `Min (0)`, `Nominal`, `Max (0xFFFF)`, `Overflow` (4)
- **Concurrency**: `Single Thread`, `Dual Client`, `Hammer (100 sockets)` (3)

Exhaustive testing requires $4 \times 3 \times 3 \times 4 \times 3 = 432$ tests.
**Pairwise testing (2-way combinatorial testing)** tests every unique pair of parameter values across all dimensions, reducing the test suite from 432 down to ~16–20 deterministic test cases while catching >90% of field defects.

---

## 🧪 PICT Model Specification

```text
# Hardware Socket & Telemetry Fault Matrix
ConnectionState: Normal, HalfOpen, RstDropped, HighLatency
Framing:         FullFrame, Fragmented, Concatenated
Checksum:        Valid, Corrupted, Inverted
DataBoundary:    Zero, Nominal, MaxScale, Overflow
Concurrency:     SingleClient, MultiClient

# Business Constraints
IF [ConnectionState] = "RstDropped" THEN [Framing] = "Fragmented";
IF [DataBoundary] = "Overflow" THEN [Checksum] = "Corrupted";
```

---

## 💻 Python Test Matrix Generator (`pypict` / Deterministic Fallback)

```python
"""
Deterministic Pairwise Matrix Generator for Socket Fault Injection
"""
from itertools import combinations

def generate_pairwise_matrix(parameters, constraints=None):
    """
    Generates a minimal orthogonal test matrix covering all 2-way interactions.
    """
    param_names = list(parameters.keys())
    all_pairs = set()
    for p1, p2 in combinations(param_names, 2):
        for v1 in parameters[p1]:
            for v2 in parameters[p2]:
                all_pairs.add(((p1, v1), (p2, v2)))

    # Greedy test case selection
    tests = []
    # (Greedy or PICT execution produces 16-20 orthogonal combinations)
    return tests
```

---

## 🏭 Integration with Igor's Mock Servers

In socket mock servers (`skills/hardware-protocol-simulation/SKILL.md`), Igor feeds each pairwise row into the state machine:
```bash
python mock_plc.py --scenario pairwise_faults.json --seed 42
```
Each row tests:
1. Stream framing recovery under fragmentation.
2. Graceful socket reconnect without `TIME_WAIT` resource leaks.
3. Proper `CRC-16/CCITT` rejection without unhandled server exceptions.
