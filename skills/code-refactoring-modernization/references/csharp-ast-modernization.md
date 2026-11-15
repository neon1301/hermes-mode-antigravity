# Modern C# 14 / .NET 10 Refactoring & AST Modernization Playbook

This reference manual provides concrete refactoring patterns for **🧹 Sergey** to safely decompose legacy C# god-classes, reduce cyclomatic complexity, eliminate cyclic dependencies, and modernize syntax to modern C# 14 standards with zero behavioral regressions.

---

## 1. Monolith God-Class Partial Decomposition Pattern

Legacy desktop forms (`MainForm.cs`, `MachineMonitorView.cs`) often exceed 2,000–5,000 lines, conflating UI rendering, socket communication, database persistence, and business logic.

### Safe Decomposition Strategy
Instead of a risky big-bang rewrite that breaks designer files and event bindings:
1. Split the single monolithic file into cohesive `partial class` files organized by concern:
   - `MainForm.cs`: Core class definition, component initialization, lifecycle (`OnLoad`, `OnClosing`, `Dispose`).
   - `MainForm.UI.cs`: Control styling, layout adjustments, menu handlers, and theme application.
   - `MainForm.Telemetry.cs`: Socket streaming callbacks, packet dispatch, connection state UI binding.
   - `MainForm.Database.cs`: Historical telemetry queries, grid bindings, and export routines.
2. Ensure all fields and helper methods remain within the same type boundary first to guarantee compile-time safety, then gradually extract independent services (`ITelemetryService`, `IDatabaseService`).

```csharp
// MainForm.Telemetry.cs
public partial class MainForm
{
    private async Task HandleIncomingTelemetryFrameAsync(ReadOnlyMemory<byte> frame)
    {
        if (frame.IsEmpty) return;
        var packet = TelemetryParser.Parse(frame.Span);
        await InvokeAsync(() => UpdateGaugeDisplays(packet)).ConfigureAwait(false);
    }
}
```

---

## 2. Flattening Deep Nesting with Inverted Guard Clauses

Deep nested `if/else` ladders inflate the CRAP score and make error handling error-prone. Modernization demands flattening logic with early exits:

### Legacy Anti-Pattern (Cyclomatic Complexity = 8)
```csharp
public void ProcessOrder(Order? order)
{
    if (order != null)
    {
        if (order.IsValid)
        {
            if (order.Items.Count > 0)
            {
                if (PaymentGateway.Authorize(order.Total))
                {
                    ExecuteFulfillment(order);
                }
            }
        }
    }
}
```

### Modernized Pattern with Guard Clauses (Cyclomatic Complexity = 1)
```csharp
public void ProcessOrder(Order? order)
{
    ArgumentNullException.ThrowIfNull(order);

    if (!order.IsValid)
        throw new InvalidOperationException($"Order {order.Id} is not in a valid state.");

    if (order.Items.Count == 0)
        return; // Nothing to process

    if (!PaymentGateway.Authorize(order.Total))
        throw new PaymentFailedException(order.Id);

    ExecuteFulfillment(order);
}
```

---

## 3. Modern Pattern Matching & Switch Expressions (C# 14)

Replace brittle `is` type casts, nested `switch` blocks, and magic constants with expressive pattern matching:

```csharp
public sealed record MachineEvent;
public sealed record SpeedAlarmEvent(int Rpm, double Temperature) : MachineEvent;
public sealed record EStopEvent(string Reason, int OperatorId) : MachineEvent;
public sealed record HeartbeatEvent(DateTime UtcNow) : MachineEvent;

public static class MachineEventDispatcher
{
    public static string EvaluateEventSeverity(MachineEvent ev) => ev switch
    {
        EStopEvent { Reason: "SafetyGateOpened" } => "CRITICAL_E_STOP_INTERLOCK",
        EStopEvent => "CRITICAL_E_STOP_MANUAL",
        SpeedAlarmEvent { Rpm: > 5000, Temperature: > 85.0 } => "HIGH_SPEED_OVERHEAT_DANGER",
        SpeedAlarmEvent { Rpm: > 3500 } => "WARNING_HIGH_RPM",
        HeartbeatEvent => "INFO_HEARTBEAT",
        null => throw new ArgumentNullException(nameof(ev)),
        _ => "INFO_GENERIC"
    };
}
```

---

## 4. Primary Constructors & Dependency Injection

Modernize boilerplate constructor parameter assignments to primary constructors in C# 12+:

### Legacy Boilerplate
```csharp
public class TelemetryService : ITelemetryService
{
    private readonly ISocketClient _socketClient;
    private readonly ILogger<TelemetryService> _logger;

    public TelemetryService(ISocketClient socketClient, ILogger<TelemetryService> logger)
    {
        _socketClient = socketClient ?? throw new ArgumentNullException(nameof(socketClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }
}
```

### Modernized Primary Constructor
```csharp
public sealed class TelemetryService(
    ISocketClient socketClient,
    ILogger<TelemetryService> logger) : ITelemetryService
{
    public async Task StartStreamingAsync(CancellationToken ct)
    {
        logger.LogInformation("Starting telemetry streaming...");
        await socketClient.ConnectAsync(ct).ConfigureAwait(false);
    }
}
```

---

## 5. Breaking Cyclic Dependencies via Interfaces & Events

When Class A references Class B and Class B references Class A, extract a decoupled Interface or use an Inversion of Control event:

```
[Legacy]:  MachineController ◄────── mutual reference ──────► UIStatusPanel
[Modern]:  MachineController ────► IStatusSink ◄──── UIStatusPanel (implements)
```

```csharp
// Decoupling Interface
public interface IStatusSink
{
    void ReportStatus(string status, bool isAlarm);
}

public sealed class MachineController(IStatusSink sink)
{
    public void TriggerAlarm(string reason)
    {
        sink.ReportStatus($"ALARM: {reason}", isAlarm: true);
    }
}
```
