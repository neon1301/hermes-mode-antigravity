# 🗺️ Repo Map Protocol (Aider AST Pattern)

The **Repo Map** is an industry-standard mechanism pioneered by **Aider** for maintaining a compressed, high-fidelity mental model of an entire codebase without consuming hundreds of thousands of tokens.

---

## 🎯 1. The Core Problem
When an agent searches a codebase using random `search_dir` or grepping, it:
1. Wastes dozens of tool calls trying to find where classes and methods live.
2. Ingests entire 4,000-line files just to find one method signature.
3. Rapidly bloats the context window, causing memory degradation.

---

## ⚡ 2. The Repo Map Solution
A **Repo Map** extracts only the **syntactic signatures** of all types, classes, interfaces, and public methods across the codebase, omitting internal implementation details.

### Example Transformation:
```csharp
// Full 500-line file:
public class EquipmentCommunicationService : IEquipmentDriver
{
    private readonly ILogger _logger;
    // ... 480 lines of socket handling, packet buffers, timers ...
    public async Task<bool> ConnectAsync(string ip, int port, CancellationToken ct) { ... }
    public async Task<MachineTelemetry> PollTelemetryAsync(CancellationToken ct) { ... }
    public void Disconnect() { ... }
}

// ➔ Repo Map Signature Extract (only 6 lines!):
// [EquipmentCommunicationService.cs] : IEquipmentDriver
// - ConnectAsync(ip: string, port: int, ct: CancellationToken) -> Task<bool>
// - PollTelemetryAsync(ct: CancellationToken) -> Task<MachineTelemetry>
// - Disconnect() -> void
```

---

## 🛠️ 3. Orchestrator Repo Map Protocol
1. **Initial Scan:** When onboarding a new project, Lead scans `.csproj`, `.sln`, or directory trees to index all service classes and interfaces.
2. **Signature Indexing:** Before modifying code, Lead checks the Repo Map to locate the exact file holding the target symbol in **one shot**, eliminating blind trial-and-error searches.
3. **Subagent Briefing:** When briefing Dmitry, Elena, or Alexey, Lead attaches the relevant 5–10 signature lines from the Repo Map rather than pasting full files, saving 90% of token bandwidth.
