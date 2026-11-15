# Binary Protocol Frame Disassembly & MSIL Bytecode Reversing Playbook

This reference manual provides industrial-grade methodologies and C# / Python / Node.js patterns for **🔍 Artem** (Lead Protocol Reverse-Engineer) to dissect unknown binary network packets, hex streams, and decompile CIL/MSIL opcodes.

---

## 1. Proprietary Binary Framing Dissection Protocol

When reversing unknown factory machine sockets or IoT telemetry without documentation:

### Step 1: Sync Word & Delimiter Identification
Search for repeating frame anchors:
- `0xAA 0x55` or `0x55 0xAA` (common microcontroller telemetry headers)
- `0x7E` (HDLC / PPP framing)
- `0x02` (STX) and `0x03` (ETX)
- Fixed length vs. Variable length: Look at bytes 2–4. If bytes 2–3 monotonically increase with packet size, it is a declared payload length.

### Step 2: Binary Frame Layout Unpacking (C# Zero-Alloc)
```csharp
using System;
using System.Buffers.Binary;

public readonly ref struct IndustrialTelemetryFrame
{
    public ushort SyncWord { get; }
    public byte MachineId { get; }
    public byte CommandCode { get; }
    public ushort PayloadLength { get; }
    public ReadOnlySpan<byte> Payload { get; }
    public ushort Checksum { get; }

    public IndustrialTelemetryFrame(ReadOnlySpan<byte> raw)
    {
        if (raw.Length < 8)
            throw new ArgumentException("Frame too short", nameof(raw));

        // Read Big Endian header primitives safely
        SyncWord = BinaryPrimitives.ReadUInt16BigEndian(raw[..2]);
        if (SyncWord != 0xAA55)
            throw new FormatException($"Invalid sync word: 0x{SyncWord:X4}");

        MachineId = raw[2];
        CommandCode = raw[3];
        PayloadLength = BinaryPrimitives.ReadUInt16BigEndian(raw[4..6]);

        if (raw.Length < 6 + PayloadLength + 2)
            throw new ArgumentException("Incomplete payload bytes", nameof(raw));

        Payload = raw.Slice(6, PayloadLength);
        Checksum = BinaryPrimitives.ReadUInt16BigEndian(raw.Slice(6 + PayloadLength, 2));
    }
}
```

---

## 2. Bitfield & Status Register Decoding

Industrial machines pack dozens of boolean sensor states into 16-bit or 32-bit integer registers:

```csharp
[Flags]
public enum MachineAlarmFlags : ushort
{
    None             = 0,
    EStopEngaged     = 1 << 0, // Bit 0
    SafetyInterlock  = 1 << 1, // Bit 1
    MotorOverheat    = 1 << 2, // Bit 2
    YarnBreakDetected= 1 << 3, // Bit 3
    LowOilPressure   = 1 << 4, // Bit 4
    GuardDoorOpen    = 1 << 5  // Bit 5
}

public static class BitfieldDecoder
{
    public static MachineAlarmFlags ParseStatusRegister(ushort rawRegister)
    {
        return (MachineAlarmFlags)rawRegister;
    }

    public static bool IsCriticalAlarm(ushort rawRegister)
    {
        const ushort CriticalMask = (1 << 0) | (1 << 1) | (1 << 2);
        return (rawRegister & CriticalMask) != 0;
    }
}
```

---

## 3. CIL / MSIL Opcode Disassembly & Static Decompilation

When reverse-engineering compiled .NET binaries (`.dll` / `.exe`):

### Common Opcode Control Flow Archetypes
| CIL Opcode | Operation | Equivalent High-Level C# Construct |
| :--- | :--- | :--- |
| `ldarg.0` / `ldarg.1` | Load argument onto evaluation stack | Access method parameter (`this` or param) |
| `ldfld` / `stfld` | Load / store object instance field | Field read/write (`this._client = value`) |
| `callvirt` | Virtual method invocation | Polymorphic or interface call (`client.Read()`) |
| `brfalse.s` / `brtrue.s` | Branch if false / true | `if (!condition)` or `if (condition)` |
| `switch` | Jump table branch | `switch` statement on enum/integer |
| `box` / `unbox.any` | Value type boxing to `object` | Casting struct to object (GC allocation hotspot!) |

### Branch Deconstruction Heuristic
When an IL block shows:
```cil
IL_0005: ldarg.1
IL_0006: brfalse.s IL_0012
IL_0008: ldarg.0
IL_0009: callvirt instance void ILogger::Log()
IL_0012: ret
```
Reconstruct to C# guard clause:
```csharp
if (arg1)
{
    this.Log();
}
return;
```

---

## 4. Reverse-Engineering Verification Invariants

1. **Verify Checksum Algorithms:** Test XOR, Additive sum, CRC-16 (Modbus polynomial `0xA001`, CCITT `0x1021`), and Fletcher-16 against known good packet captures.
2. **Never Execute Untrusted Binaries on Host:** Analyze binaries in read-only sandbox mode; use static disassembly tools (`monodis`, `ildasm`, `dnSpy`, `ghidra`) rather than running untrusted executables.
3. **Capture Golden Hex Dumps:** Document raw hex streams and parsed field tables in `.hermes/memory/artem.md`.
