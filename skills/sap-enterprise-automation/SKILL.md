---
name: sap-enterprise-automation
description: Robust enterprise SAP automation, universal SAP GUI Scripting Engine interop, SAP .NET Connector (NCo), RFC/BAPI connectors, IDoc messaging, and modern OData APIs. Use when developing or debugging SAP automation services, preventing COM leaks, calling BAPIs, or integrating .NET with SAP.
---

# Enterprise SAP Architecture & Automation Skill

This skill guides enterprise automation specialists (primarily **📊 Ruslan**) through designing robust, high-performance SAP integrations in C# / .NET across all official SAP integration vectors.

---

## 🏛️ The 5 SAP Integration Pillars

```text
                           ┌───────────────────────────────┐
                           │    SAP Landscape (ECC / S4)   │
                           └──────────────┬────────────────┘
                                          │
       ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
       ▼                  ▼               ▼               ▼                  ▼
 [1. SAP NCo]      [2. BAPI/RFC]    [3. SAP GUI]     [4. IDoc/ALE]      [5. OData/REST]
Direct .NET RFC    Business Objects   Screen RPA     Async Queues        HTTP/JSON API
Low-latency        Transactional      sapfewse.ocx   Bulk Data           Clean Core
```

---

## 1. Pillar 1: SAP .NET Connector (NCo 3.1 / 4.0)
The official SAP library for direct C# integration without launching desktop SAP GUI.

### Destination Configuration Pattern (`IDestinationConfiguration`)
```csharp
public class SapDestinationConfig : IDestinationConfiguration
{
    public RfcConfigParameters GetParameters(string destinationName)
    {
        var parms = new RfcConfigParameters();
        parms[RfcConfigParameters.AppServerHost] = "192.168.1.50";
        parms[RfcConfigParameters.SystemNumber] = "00";
        parms[RfcConfigParameters.SystemID] = "PRD";
        parms[RfcConfigParameters.User] = "RFC_USER";
        parms[RfcConfigParameters.Password] = "Secret";
        parms[RfcConfigParameters.Client] = "100";
        parms[RfcConfigParameters.Language] = "EN";
        parms[RfcConfigParameters.PoolSize] = "10"; // Connection pool size
        parms[RfcConfigParameters.PeakLimit] = "20";
        return parms;
    }

    public bool ChangeEventsSupported() => false;
    public event RfcDestinationManager.ConfigurationChangeHandler ConfigurationChanged;
}
```

### Executing a BAPI/RFC via NCo
```csharp
RfcDestination dest = RfcDestinationManager.GetDestination("PRD");
RfcRepository repo = dest.Repository;
IRfcFunction bapi = repo.CreateFunction("BAPI_MATERIAL_GET_DETAIL");

bapi.SetValue("MATERIAL", "MAT-100293");
bapi.SetValue("PLANT", "1000");
bapi.Invoke(dest);

string description = bapi.GetStructure("MATERIAL_GENERAL_DATA").GetString("MATL_DESC");
```

---

## 2. Pillar 2: SAP GUI Scripting & Zero-Zombie COM Lifecycle
When backend RFCs are restricted and screen automation via `sapfewse.ocx` is required.

### The Mandatory COM Cleanup Pattern
```csharp
GuiApplication sapGuiApp = null;
GuiConnection connection = null;
GuiSession session = null;

try
{
    var sapGuiAuto = Activator.CreateInstance(Type.GetTypeFromProgID("Sapgui.ScriptingCtrl.1"));
    sapGuiApp = (GuiApplication)sapGuiAuto.GetType().InvokeMember("GetScriptingEngine", 
        BindingFlags.InvokeMethod, null, sapGuiAuto, null);

    connection = sapGuiApp.OpenConnection(systemName, true);
    session = (GuiSession)connection.Sessions.Item(0);

    // Business transaction logic here...
}
finally
{
    // Deterministic release in reverse acquisition order prevents orphaned saplogon.exe
    if (session != null) { Marshal.FinalReleaseComObject(session); session = null; }
    if (connection != null) { Marshal.FinalReleaseComObject(connection); connection = null; }
    if (sapGuiApp != null) { Marshal.FinalReleaseComObject(sapGuiApp); sapGuiApp = null; }

    GC.Collect();
    GC.WaitForPendingFinalizers();
}
```

### Modal Window (`wnd[1]`) Interception
```csharp
private void DismissUnexpectedModalDialog(GuiSession session)
{
    try
    {
        var modalWnd = session.FindById<GuiFrameWindow>("wnd[1]", false);
        if (modalWnd != null)
        {
            _logger.LogWarning("SAP Modal Dialog intercepted: {Title}", modalWnd.Text);
            modalWnd.SendVKey(0); // Press Enter to unblock
        }
    }
    catch {}
}
```

---

## 3. Pillar 3: BAPI Transactional Integrity (Commit & Rollback)
- **Always Commit Explicitly:** BAPI mutations are not committed automatically. Always call `BAPI_TRANSACTION_COMMIT` with `WAIT = 'X'` to guarantee synchronous database persistence.
- **Rollback on Error:** Inspect the `RETURN` table for `TYPE == 'E'` or `TYPE == 'A'`. On error, invoke `BAPI_TRANSACTION_ROLLBACK` immediately.

---

## 4. Pillar 4: IDoc & ALE Asynchronous Messaging
- **When to use:** High-volume asynchronous data replication (e.g. material movements, order statuses) where real-time blocking is undesirable.
- **Queued RFC (qRFC):** Ensures strict sequential execution (FIFO) of manufacturing order updates.

---

## 5. Pillar 5: Modern OData & S/4HANA Clean Core Integration
- **OData (REST/JSON):** The strategic standard for modern SAP S/4HANA systems.
- **CSRF Token Handling:** OData mutations (`POST`, `PUT`, `DELETE`) require a two-phase handshake:
  1. `GET` request with header `X-CSRF-Token: Fetch` + capture response cookie.
  2. `POST` request with the returned `X-CSRF-Token` header and session cookies.
- **Batching:** Use `$batch` endpoints to bundle multiple telemetry updates into a single HTTP roundtrip.
