# High-Load Deadlock Killer & Concurrency Isolation Playbook

This reference manual provides production-grade architectural rules and C# / T-SQL / SQLite patterns to diagnose, eliminate, and recover from database deadlocks, lock escalation, and contention under high concurrency.

---

## 1. The Deadlock Triad & Core Diagnostic Protocol

A deadlock occurs when two or more transactions hold shared or exclusive locks on resources the other requires in a circular dependency:
```
Transaction A (holds Lock 1) ── waiting for Lock 2 ──► Transaction B (holds Lock 2)
              ▲                                                    │
              └────────────────── waiting for Lock 1 ──────────────┘
```

### Triad of Deadlock Defense
1. **Reduce Lock Duration:** Keep transactions microscopic; perform external I/O (HTTP, disk, socket) strictly outside DB transactions.
2. **Access Objects in Uniform Order:** Always update shared entities in a deterministic order (e.g. sorted by Primary Key `id ASC`) across all queries.
3. **Snapshot Isolation (RCSI / MVCC):** Readers must never block writers, and writers must never block readers.

---

## 2. MSSQL RCSI & Lock Escalation Defense

### The `NOLOCK` Anti-Pattern vs. RCSI
Using `WITH (NOLOCK)` allows dirty reads, phantom reads, and torn reads (reading a half-updated row). The modern enterprise solution is **Read Committed Snapshot Isolation (RCSI)**:

```sql
-- Enable RCSI with immediate rollback of blocking sessions
ALTER DATABASE CURRENT
SET READ_COMMITTED_SNAPSHOT ON
WITH ROLLBACK IMMEDIATE;

-- Allow Snapshot Isolation for explicit BEGIN TRAN; SET TRANSACTION ISOLATION LEVEL SNAPSHOT
ALTER DATABASE CURRENT
SET ALLOW_SNAPSHOT_ISOLATION ON;
```

With RCSI enabled:
- `SELECT` statements read the committed row version from `tempdb` without taking Shared (`S`) locks.
- Readers never block Writers (`X` locks).
- Writers never block Readers.

### Lock Escalation Defense (The 5,000 Lock Threshold)
SQL Server automatically escalates fine-grained row/page locks to a full **Table Lock (`Sch-M` / `X`)** when a single statement acquires more than 5,000 locks. This immediately freezes all concurrent queries on that table.

#### Chunked Batch DML Pattern (Zero Escalation)
```sql
-- Process high-volume updates or deletes in bounded batches
DECLARE @BatchSize INT = 5000;
DECLARE @RowsAffected INT = 1;

WHILE (@RowsAffected > 0)
BEGIN
    DELETE TOP (@BatchSize)
    FROM dbo.TelemetryTelemetryArchive WITH (ROWLOCK)
    WHERE TimestampUtc < DATEADD(DAY, -90, SYSUTCDATETIME());

    SET @RowsAffected = @@ROWCOUNT;

    -- Release log space and yield lock manager CPU briefly
    WAITFOR DELAY '00:00:00.050';
END
```

---

## 3. C# / .NET 10 Deadlock 1205 Resilience Loop

Under high concurrency, occasional deadlocks can still occur due to asymmetric write graphs. Production code MUST handle SQL Server error `1205` with jittered exponential backoff:

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;

public static class SqlDeadlockResilience
{
    private const int SqlDeadlockErrorNumber = 1205;
    private const int MaxRetries = 5;

    public static async Task<T> ExecuteWithDeadlockRetryAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken ct = default)
    {
        for (int attempt = 1; attempt <= MaxRetries; attempt++)
        {
            try
            {
                return await operation(ct).ConfigureAwait(false);
            }
            catch (SqlException ex) when (ex.Number == SqlDeadlockErrorNumber && attempt < MaxRetries)
            {
                // Jittered exponential backoff: 50ms * 2^(attempt) + random jitter (0..50ms)
                int baseDelay = 50 * (1 << attempt);
                int jitter = Random.Shared.Next(0, 50);
                int totalDelay = baseDelay + jitter;

                await Task.Delay(totalDelay, ct).ConfigureAwait(false);
            }
        }

        // Final attempt without catching
        return await operation(ct).ConfigureAwait(false);
    }
}
```

---

## 4. SQLite Deadlock & `database is locked` Elimination

In SQLite, the notorious `SQLiteException: database is locked` (`SQLITE_BUSY`) happens when:
1. Two connections start a default `BEGIN DEFERRED` transaction.
2. Both read data simultaneously (shared read locks).
3. Both attempt an `UPDATE` or `INSERT` simultaneously. Neither can acquire the exclusive write lock because the other holds a read lock — deadlock!

### Modern SQLite Concurrency Blueprint
```csharp
using Microsoft.Data.Sqlite;

public static class SqliteConcurrencyConfig
{
    public static void ConfigureConnection(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        // 1. Write-Ahead Logging allows concurrent readers and 1 writer
        // 2. busy_timeout forces SQLite to wait up to 5000ms instead of failing immediately
        // 3. synchronous = NORMAL provides durability with minimal disk flush stalls
        command.CommandText = @"
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA synchronous = NORMAL;
        ";
        command.ExecuteNonQuery();
    }

    public static SqliteTransaction BeginImmediateWriteTransaction(SqliteConnection connection)
    {
        // BEGIN IMMEDIATE acquires the RESERVED lock upfront.
        // Prevents two writers from starting concurrently and deadlocking later!
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "BEGIN IMMEDIATE;";
        cmd.ExecuteNonQuery();
        return connection.BeginTransaction();
    }
}
```

---

## 5. Deadlock Graph XML Analysis (Extended Events / DMV)

Capture deadlocks via system-health Extended Events (`sys.dm_xe_session_targets` or `system_health.xel`).

### Key Elements to Dissect:
1. **Victim Identification:** Look for `<victim-list><victimProcess id="process..."/>`. The victim transaction was chosen by SQL Server based on rollback cost (`DEADLOCK_PRIORITY`).
2. **Process List:**
   - `isolationlevel`: Is it running under `read committed` (with locks) instead of `read committed snapshot`?
   - `inputbuf`: Inspect the exact SQL text causing the conflict.
3. **Resource List:**
   - `<keylock>`: Row-level conflict. Ensure indexes cover the search predicate to avoid scanning adjacent keys.
   - `<pagelock>`: Page-level conflict. Check fillfactor or index fragmentation.
   - `<objectlock>`: Table-level conflict. Look for lock escalation (`>5000` rows) or unindexed foreign keys.
4. **Lock Mode Matrix:**
   - `mode="X"` (Exclusive) vs. `mode="U"` (Update) vs. `mode="S"` (Shared).
   - If `S` lock is conflicting with `X`, enable RCSI immediately!
