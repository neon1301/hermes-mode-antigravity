# High-Throughput Zero-Copy Socket Streaming with System.IO.Pipelines

This reference manual provides industrial-grade socket streaming architecture and C# / .NET 10 implementation patterns for processing continuous machine telemetry, IoT frames, and hardware protocols without heap allocations or GC pressure.

---

## 1. Why System.IO.Pipelines for Industrial Telemetry

In high-frequency manufacturing environments, hundreds of machines stream telemetry frames (100–10,000 msgs/sec). Traditional `NetworkStream.ReadAsync(byte[])` or `SocketAsyncEventArgs` suffers from:
1. **Buffer thrashing & GC pauses:** Frequent `byte[]` allocations degrade real-time responsiveness.
2. **Buffer management nightmare:** Slicing partial TCP packets and stitching split frames across read boundaries requires manual ring buffers.
3. **CA2022 stream framing bugs:** Naive reads assume complete frames arrive in one socket chunk.

`System.IO.Pipelines` solves this by decoupling reading from parsing, using `MemoryPool<byte>.Shared` rented memory blocks, and presenting a unified `ReadOnlySequence<byte>` view.

---

## 2. Core PipeReader Processing Loop Pattern

The heart of `System.IO.Pipelines` is the read-parse-advance loop. The reader must always tell the pipeline how much was consumed and how much was examined.

```csharp
using System;
using System.Buffers;
using System.IO.Pipelines;
using System.Threading;
using System.Threading.Tasks;

public sealed class MachineTelemetryPipeProcessor
{
    private const int MaxFrameSize = 64 * 1024; // 64 KB safety ceiling

    public async Task ProcessSocketPipeAsync(PipeReader reader, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            ReadResult result = await reader.ReadAsync(ct).ConfigureAwait(false);
            ReadOnlySequence<byte> buffer = result.Buffer;

            while (TryReadFrame(ref buffer, out ReadOnlySequence<byte> framePayload))
            {
                // Process isolated frame payload with zero allocations
                DispatchFrame(framePayload);
            }

            // Tell the PipeReader how much of the buffer was consumed and how much was examined
            // CRITICAL: If no frame was complete, buffer.Start is consumed, but buffer.End is examined.
            // Failing to examine to buffer.End causes ReadAsync to spin in an infinite 100% CPU loop!
            reader.AdvanceTo(buffer.Start, buffer.End);

            if (result.IsCompleted)
            {
                break;
            }
        }

        await reader.CompleteAsync().ConfigureAwait(false);
    }

    private bool TryReadFrame(ref ReadOnlySequence<byte>, out ReadOnlySequence<byte> framePayload)
    {
        // Framing logic (Delimiter or Length-Prefixed) goes here
        framePayload = default;
        return false;
    }

    private void DispatchFrame(in ReadOnlySequence<byte> framePayload) { }
}
```

---

## 3. Framing Decoders: Length-Prefixed & Delimiter

### Pattern A: Length-Prefixed Framing (4-Byte Header)
Common in industrial PLCs and binary machine protocols: `[4-Byte Big-Endian Length][Payload...]`.

```csharp
using System.Buffers;
using System.Buffers.Binary;

public static class LengthPrefixedDecoder
{
    private const int HeaderSize = 4;
    private const int MaxAllowedPayload = 1024 * 1024; // 1MB safety ceiling

    public static bool TryReadLengthPrefixedFrame(
        ref ReadOnlySequence<byte> buffer,
        out ReadOnlySequence<byte> frame)
    {
        frame = default;
        if (buffer.Length < HeaderSize)
            return false;

        // Fast path: SequenceReader allows reading primitives across multi-segment buffers
        var reader = new SequenceReader<byte>(buffer);
        if (!reader.TryReadBigEndian(out int payloadLength))
            return false;

        if (payloadLength < 0 || payloadLength > MaxAllowedPayload)
            throw new InvalidOperationException($"Protocol framing violation: invalid payload size {payloadLength}");

        int totalFrameSize = HeaderSize + payloadLength;
        if (buffer.Length < totalFrameSize)
            return false; // Incomplete frame; wait for more data

        // Slice frame without copying memory
        frame = buffer.Slice(HeaderSize, payloadLength);

        // Advance buffer past this completed frame
        buffer = buffer.Slice(totalFrameSize);
        return true;
    }
}
```

### Pattern B: Delimiter-Based Framing (`\r\n` or `0x03` ETX)
Common in ASCII telemetry (e.g. barcode scanners, scale indicators, serial-to-ethernet bridges):

```csharp
using System.Buffers;

public static class DelimiterFrameDecoder
{
    private static readonly byte[] Delimiter = [(byte)'\r', (byte)'\n'];

    public static bool TryReadDelimiterFrame(
        ref ReadOnlySequence<byte> buffer,
        out ReadOnlySequence<byte> frame)
    {
        frame = default;
        var reader = new SequenceReader<byte>(buffer);

        // Advance until delimiter sequence is matched
        if (!reader.TryReadTo(out ReadOnlySequence<byte> matchedFrame, Delimiter.AsSpan()))
            return false;

        frame = matchedFrame;
        // Advance input buffer past the delimiter
        buffer = buffer.Slice(reader.Position);
        return true;
    }
}
```

---

## 4. Adapting Sockets to Pipelines & Backpressure

Connect a raw `Socket` directly to `PipeReader` / `PipeWriter`:

```csharp
using System.IO.Pipelines;
using System.Net.Sockets;

public static class SocketPipeAdapter
{
    public static (PipeReader Reader, PipeWriter Writer) CreateSocketPipe(Socket socket)
    {
        var networkStream = new NetworkStream(socket, ownsSocket: true);

        var readerOptions = new StreamPipeReaderOptions(
            pool: MemoryPool<byte>.Shared,
            bufferSize: 4096,
            minimumReadSize: 1024,
            leaveOpen: false);

        var writerOptions = new StreamPipeWriterOptions(
            pool: MemoryPool<byte>.Shared,
            leaveOpen: false);

        return (
            PipeReader.Create(networkStream, readerOptions),
            PipeWriter.Create(networkStream, writerOptions)
        );
    }
}
```

---

## 5. Non-Negotiable Safety Invariants

1. **Never Call `reader.AdvanceTo(buffer.Start, buffer.Start)` on Incomplete Data:** If data is unconsumed, the examined position MUST be `buffer.End`. Otherwise `ReadAsync()` thinks no new data is needed and returns immediately, pegging a CPU core at 100%.
2. **Always Enforce `MaxFrameSize`:** An open TCP stream without delimiters or with corrupted length headers will accumulate buffer until `OutOfMemoryException`. Throw or drop when `buffer.Length > MaxFrameSize`.
3. **Always Call `reader.CompleteAsync()` / `writer.CompleteAsync()`:** Ensure rented memory blocks from `MemoryPool<byte>.Shared` are returned to the pool upon disconnection.
