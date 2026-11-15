# SAP NCo .NET Connector & SAP GUI COM Hygiene Playbook

This reference manual provides production-grade architectural patterns for **📊 Ruslan** (Lead SAP Enterprise Integration Architect) to prevent unmanaged COM memory leaks, execute resilient BAPI transactions, and manage RFC connection pools with .NET 10.

---

## 1. SAP GUI Scripting COM Release Hygiene (Strict Zero-Leak)

When automating SAP GUI via COM interop (`sapfewse.ocx`), .NET RCW (Runtime Callable Wrapper) instances hold unmanaged COM pointers in the process. Relying on .NET garbage collection causes process bloat, zombie `saplogon.exe` processes, and memory leaks.

### The Double-Dot Anti-Pattern
```csharp
// LEAK TRAP: The intermediate object returned by FindById is an untracked RCW!
// It will never be released and leaks unmanaged COM memory.
string text = ((GuiTextField)session.FindById("wnd[0]/usr/txtNAME")).Text;
```

### The Explicit COM Disposal Pattern
```csharp
using System;
using System.Runtime.InteropServices;

public static class ComHygiene
{
    /// <summary>
    /// Safely releases an unmanaged COM RCW pointer and clears reference.
    /// </summary>
    public static void SafeReleaseCom<T>(ref T? comObject) where T : class
    {
        if (comObject != null && Marshal.IsComObject(comObject))
        {
            try
            {
                Marshal.FinalReleaseComObject(comObject);
            }
            finally
            {
                comObject = null;
            }
        }
    }
}

// Correct usage:
dynamic? field = null;
try
{
    field = session.FindById("wnd[0]/usr/txtNAME");
    string text = field.Text;
}
finally
{
    ComHygiene.SafeReleaseCom(ref field);
}
```

---

## 2. SAP .NET Connector (NCo 3.1) BAPI Transaction Pattern

When invoking standard BAPIs (`BAPI_PO_CREATE1`, `BAPI_MATERIAL_SAVEDATA`) via SAP NCo:
1. Always maintain transaction context across RFC function calls.
2. Must call `BAPI_TRANSACTION_COMMIT` with `WAIT = 'X'` to ensure database commit in SAP before proceeding.
3. Call `BAPI_TRANSACTION_ROLLBACK` on any error or business return code `E` / `A`.

```csharp
using System;
using System.Threading.Tasks;
using SAP.Middleware.Connector;

public static class SapBapiTransactionExecutor
{
    public static void ExecuteBapiWithCommit(RfcDestination destination, Action<RfcRepository> bapiAction)
    {
        // Maintain same RFC context across multiple function calls in a transaction
        RfcSessionManager.BeginContext(destination);
        try
        {
            RfcRepository repo = destination.Repository;

            // 1. Execute the business BAPI
            bapiAction(repo);

            // 2. Commit transaction with WAIT = 'X'
            IRfcFunction commitFunc = repo.CreateFunction("BAPI_TRANSACTION_COMMIT");
            commitFunc.SetValue("WAIT", "X");
            commitFunc.Invoke(destination);

            IRfcStructure returnStruct = commitFunc.GetStructure("RETURN");
            string returnType = returnStruct.GetString("TYPE");
            if (returnType == "E" || returnType == "A")
            {
                throw new InvalidOperationException($"BAPI commit failed: {returnStruct.GetString("MESSAGE")}");
            }
        }
        catch
        {
            // 3. Rollback on failure
            try
            {
                IRfcFunction rollbackFunc = destination.Repository.CreateFunction("BAPI_TRANSACTION_ROLLBACK");
                rollbackFunc.Invoke(destination);
            }
            catch { /* Log rollback secondary error */ }
            throw;
        }
        finally
        {
            RfcSessionManager.EndContext(destination);
        }
    }
}
```

---

## 3. SAP RFC Connection Pool Hygiene & Resilience

1. **Explicit Pool Configuration:**
   - Always configure `POOL_SIZE` (default 5) and `MAX_POOL_SIZE` (e.g. 20) to prevent thread pool starvation.
   - Set `IDLE_TIMEOUT` (e.g. 600s) to reclaim inactive network connections on the SAP Gateway.
2. **Circuit Breaker for RFC Errors:**
   - Handle `RfcCommunicationException` and `RfcLogonException` with retry backoff.
   - Catch transient `RFC_COMMUNICATION_FAILURE` and reset connection pool via `RfcDestinationManager`.
