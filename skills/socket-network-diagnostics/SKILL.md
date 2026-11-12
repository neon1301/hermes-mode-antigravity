---
name: socket-network-diagnostics
description: Industrial socket debugging, TCP/UDP stream diagnostics, framing defect remediation, and network resilience. Use when analyzing socket disconnects, TIME_WAIT socket leaks, CA2022 Stream.Read defects, or designing machine telemetry protocols.
---

# Socket & Network Protocol Diagnostics Skill

This skill guides network and systems engineers (primarily **⚙️ Alexey & 🏭 Igor**) in diagnosing, stress-testing, and optimizing industrial socket communication between factory equipment and central servers.

---

## 1. The CA2022 Stream.Read Framing Trap

### The Defect
`Stream.Read(buffer, 0, count)` is **never guaranteed** to return `count` bytes in TCP streams. Network packets can arrive in fragments. Assuming a single `Read()` call returns the full header or packet leads to silent payload corruption and broken framing.

### The Correct Pattern (.NET 7 / 8 / 9 / 10)
```csharp
// Modern, safe, guaranteed complete read
await stream.ReadExactlyAsync(buffer.AsMemory(0, expectedLength), cancellationToken);
```

### Fallback Loop Pattern (Older .NET / Framework)
```csharp
int totalRead = 0;
while (totalRead < expectedLength)
{
    int bytesRead = await stream.ReadAsync(buffer, totalRead, expectedLength - totalRead, ct);
    if (bytesRead == 0) throw new EndOfStreamException("Socket disconnected prematurely.");
    totalRead += bytesRead;
}
```

---

## 2. Detecting Half-Open Sockets & Zombie Connections

In factory environments, machinery power cycles or cable cuts often disconnect without sending a TCP `FIN` packet. The server's OS socket remains stuck in `ESTABLISHED` indefinitely.

### Solutions:
1. **Application-Level Heartbeats:** Enforce an explicit heartbeat deadline:
   - If no telemetry or heartbeat frame arrives from Machine X within `15,000ms`, close the socket handle and flag connection as `DISCONNECTED`.
2. **OS TCP Keep-Alives:**
   ```csharp
   socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.KeepAlive, true);
   socket.SetSocketOption(SocketOptionLevel.Tcp, SocketOptionName.TcpKeepAliveTime, 5);
   socket.SetSocketOption(SocketOptionLevel.Tcp, SocketOptionName.TcpKeepAliveInterval, 1);
   ```

---

## 3. Socket Leaks & Exhaustion (TIME_WAIT / CLOSE_WAIT)
- **`CLOSE_WAIT` Trap:** Indicates the remote machine closed the connection, but the local application failed to call `socket.Close()` or `stream.Dispose()`.
- **`TIME_WAIT` Accumulation:** Avoid rapid connect/disconnect cycles. Use persistent, long-lived TCP connections with reconnect backoff (Exponential Backoff + Jitter).
- **Socket Backlog:** Set `serverSocket.Listen(100)` sufficiently high to absorb simultaneous reconnection storms after plant power restoration.
