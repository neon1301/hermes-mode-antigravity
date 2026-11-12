# .NET / C# Enterprise Backend Playbook

Synthesized from official Microsoft **`dotnet/skills`** (`dotnet-aspnet`, `dotnet-diag`, `dotnet-test`, `dotnet-nuget`), **`Aaronontheweb/dotnet-skills`**, **`jeffallan/claude-skills`** (`dotnet-core-expert`), and **`github/awesome-copilot`**.

---

## 1. Async, Tasks & Thread-Pool Deadlock Defense

- **Zero Sync-Over-Async:** NEVER call `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` inside ASP.NET Core, WinForms UI threads, or ThreadPool workers — causes immediate `SynchronizationContext` deadlocks and thread-pool starvation. Propagate `async Task` end-to-end.
- **End-to-End `CancellationToken`:** Accept `CancellationToken ct = default` on every async controller/endpoint/service/repository method and forward it to EF Core, ADO.NET, `HttpClient`, `Channel`, and `Task.Delay`.
- **`Task` vs. `ValueTask` Hygiene:** Never await a `ValueTask` multiple times, store it across boundaries, or call `.AsTask()` blindly; reserve `ValueTask` strictly for proven high-frequency hot paths that complete synchronously most of the time.
- **`PeriodicTimer` Over `Timer`:** Prefer `using var timer = new PeriodicTimer(interval); while (await timer.WaitForNextTickAsync(ct))` inside background loops — avoids overlapping re-entrant callbacks and leaks.
- **Never Swallow `BackgroundService` Failures:** Wrap `ExecuteAsync` loop iterations in structured `try/catch` (re-throwing `OperationCanceledException` only on genuine shutdown `ct.IsCancellationRequested`) so transient exceptions don't silently terminate the hosted worker!

---

## 2. Dependency Injection, `HttpClient` & Configuration

- **No Raw `new HttpClient()` Per Request:** Always register typed/named clients via `IHttpClientFactory` (`AddHttpClient<T>()`) + `Microsoft.Extensions.Http.Resilience` (or Polly) so sockets recycle cleanly without `TIME_WAIT` SNAT exhaustion.
- **Prevent Captive Dependencies:** NEVER inject a `Scoped` service (like EF `DbContext` or unit-of-work) into a `Singleton` service! Use `IServiceScopeFactory.CreateScope()` inside singletons/`BackgroundService` workers.
- **Typed Options Validation (Zero-Hardcode Rule 9):** Bind configuration via `IOptions<TOptions>` + `.ValidateDataAnnotations().ValidateOnStart()` so missing URLs/ports/secrets fail immediately on startup instead of crashing hours later at runtime.
- **Clean DI Registration Order:** Keep `Program.cs` readable by organizing cohesive `services.AddInfrastructure(config)` / `AddApplication()` extension methods.

---

## 3. High-Performance .NET (`dotnet-diag` Standards)

Apply zero-allocation practices on **proven hot paths** (socket parsers, telemetry loops, tight serialization — do NOT obsess over cold startup code):
- **Span & Buffer Pooling:** Parse binary/text telemetry slices using `ReadOnlySpan<byte>` / `ReadOnlySequence<byte>` (`System.Buffers`) and `ArrayPool<byte>.Shared` (always returning in `finally`) or `RecyclableMemoryStream` instead of allocating new `byte[]` / `string.Substring` per frame.
- **Prefer Safe Managed Abstractions First:** Exhaust `Span<T>`, `Memory<T>`, `stackalloc` (small fixed sizes), `SearchValues<T>`, and source-generated JSON/Regex (`[JsonSerializable]`, `[GeneratedRegex]`) before ever considering `unsafe`.
- **Avoid LINQ Allocation Traps in Tight Loops:** Replace `.Where().Select().ToList()` inside per-packet/per-tick handlers with direct `for`/`foreach` loops and pre-sized collections (`new List<T>(capacity)`).
- **Seal Non-Inherited Concrete Classes:** Mark internal/domain leaf services and DTO records `sealed` cleanly (improves JIT devirtualization).
- **Verify Before & After:** Confirm claims with `BenchmarkDotNet`, `dotnet-counters`, or allocation profiling; report actual ratios rather than guessing.

---

## 4. ASP.NET Core, Packaging & Verification Gate

- **Minimal APIs / Controllers Hygiene:** Enable Nullable Reference Types (`<Nullable>enable</Nullable>`), enforce global exception-to-ProblemDetails mapping (`IExceptionHandler`), return immutable `record` DTOs, validate requests at the boundary (`FluentValidation` / DataAnnotations / Endpoint Filters).
- **Central Package Management (CPM):** For multi-project solutions, prefer `Directory.Packages.props` (`dotnet/skills` standard) to prevent silent NuGet version drift.
- **Mandatory Build & Test Gate:** Run `dotnet build` with zero warnings target and `dotnet test` (including `WebApplicationFactory` integration tests + mocked boundary unit tests) after edits.
