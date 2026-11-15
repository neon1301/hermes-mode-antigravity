# Industrial Network Fault Injection & Protocol Fuzzing Implementation Playbook

This reference manual provides production-grade network fault injection, socket chaos simulation, and smart protocol fuzzing patterns in C# / .NET 10 to harden industrial client software without physical factory hardware.

---

## 1. Network Fault Injection Engine (`SocketFaultInjector`)

In physical plants, serial-to-Ethernet bridges, unmanaged industrial switches, and vibrating cables introduce severe transport anomalies. This pattern simulates all 4 major network failure modes:

```csharp
using System;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

public sealed class SocketFaultInjector
{
    private readonly Random _random;

    public SocketFaultInjector(int seed = 42)
    {
        _random = new Random(seed);
    }

    /// <summary>
    /// 1. Abrupt TCP RST Drop: Closes socket immediately without TCP FIN handshake.
    /// Simulates cable yank, switch reboot, or sudden PLC power loss.
    /// </summary>
    public static void InjectAbruptRstDrop(Socket socket)
    {
        // Linger with timeout 0 forces the OS to send an RST packet immediately
        socket.LingerState = new LingerOption(enable: true, seconds: 0);
        socket.Close();
    }

    /// <summary>
    /// 2. Byte-by-Byte Drip Fragmentation: Sends packet in 1-3 byte fragments with delays.
    /// Proves client parser uses ReadExactlyAsync instead of buggy single-Read assumptions (CA2022).
    /// </summary>
    public async Task SendDripFragmentedAsync(
        NetworkStream stream,
        ReadOnlyMemory<byte> payload,
        int minDelayMs = 10,
        int maxDelayMs = 50,
        CancellationToken ct = default)
    {
        int offset = 0;
        while (offset < payload.Length)
        {
            // Chunk size: 1 to 3 bytes
            int chunkSize = Math.Min(_random.Next(1, 4), payload.Length - offset);
            ReadOnlyMemory<byte> chunk = payload.Slice(offset, chunkSize);

            await stream.WriteAsync(chunk, ct).ConfigureAwait(false);
            await stream.FlushAsync(ct).ConfigureAwait(false);

            offset += chunkSize;

            if (offset < payload.Length)
            {
                int delay = _random.Next(minDelayMs, maxDelayMs);
                await Task.Delay(delay, ct).ConfigureAwait(false);
            }
        }
    }

    /// <summary>
    /// 3. Jitter & Spike Delay: Injects unpredictable latency jitter.
    /// Exposes race conditions and missing cancellation timeouts in client handlers.
    /// </summary>
    public async Task InjectLatencyJitterAsync(int minJitterMs, int maxJitterMs, CancellationToken ct)
    {
        int delay = _random.Next(minJitterMs, maxJitterMs);
        await Task.Delay(delay, ct).ConfigureAwait(false);
    }
}
```

---

## 2. Smart Protocol Mutation Fuzzer (CRC-16 Modbus / Industrial Preamble)

Dumb random fuzzing fails immediately at the preamble and never reaches internal business logic. Smart fuzzing mutates payload registers while maintaining valid framing or deliberately testing CRC validation.

```csharp
using System;

public static class IndustrialProtocolFuzzer
{
    /// <summary>
    /// Computes standard Modbus RTU / Industrial CRC-16 (Polynomial 0xA001).
    /// </summary>
    public static ushort ComputeCrc16(ReadOnlySpan<byte> data)
    {
        ushort crc = 0xFFFF;
        foreach (byte b in data)
        {
            crc ^= b;
            for (int i = 0; i < 8; i++)
            {
                if ((crc & 0x0001) != 0)
                    crc = (ushort)((crc >> 1) ^ 0xA001);
                else
                    crc >>= 1;
            }
        }
        return crc;
    }

    /// <summary>
    /// Mutates payload registers while recalculating a valid CRC.
    /// Bypasses header checks to stress internal decoders and DB persistence.
    /// </summary>
    public static byte[] CreateSmartMutatedFrame(byte slaveId, byte functionCode, ushort registerStart, ushort registerValue, bool corruptCrc = false)
    {
        byte[] frame = new byte[8];
        frame[0] = slaveId;
        frame[1] = functionCode;
        frame[2] = (byte)(registerStart >> 8);
        frame[3] = (byte)(registerStart & 0xFF);
        frame[4] = (byte)(registerValue >> 8);
        frame[5] = (byte)(registerValue & 0xFF);

        ushort crc = ComputeCrc16(frame.AsSpan(0, 6));

        if (corruptCrc)
        {
            crc ^= 0x5555; // Deliberate CRC corruption to verify client drop/alarm
        }

        frame[6] = (byte)(crc & 0xFF);         // Low byte first (Modbus standard)
        frame[7] = (byte)((crc >> 8) & 0xFF);  // High byte second

        return frame;
    }
}
```

---

## 3. Half-Open Connection & Blackhole Simulation

In dirty factory networks, power outages or fiber cuts cause half-open connections where the server continues sending or waiting indefinitely:

```csharp
public static class BlackholeSimulator
{
    /// <summary>
    /// Simulates a dead machine by reading and discarding all client frames
    /// without sending any response or ACK back. Tests client request timeouts.
    /// </summary>
    public static async Task RunBlackholeLoopAsync(NetworkStream stream, CancellationToken ct)
    {
        byte[] discardBuffer = new byte[1024];
        while (!ct.IsCancellationRequested)
        {
            int read = await stream.ReadAsync(discardBuffer, 0, discardBuffer.Length, ct).ConfigureAwait(false);
            if (read == 0) break; // Client disconnected
            // Do not reply; let client timeout trigger!
        }
    }
}
```

---

## 4. Verification Checkpoints for Igor

1. **Deterministic PRNG:** Always require `--seed <N>` for all simulation and fuzzing runs so any failure can be reproduced 100% deterministically.
2. **Ephemeral Port Binding (`0`):** Always bind mock servers to port `0` (`IPEndPoint(IPAddress.Loopback, 0)`) in automated test suites to avoid port collision.
3. **No Thread Starvation:** Always use non-blocking asynchronous socket methods (`AcceptAsync`, `ReadAsync`, `WriteAsync`) in emulator loops.
