# Microsoft SQL Server (MSSQL) Concurrency & DMV Playbook

Synthesized from `vince-winkintel/sql-server-skills`, `sanjay3290/ai-skills` (`mssql`), and enterprise .NET / T-SQL DBA standards.

---

## 1. Isolation Levels & Blocking Mitigation

### Read Committed Snapshot Isolation (RCSI) — Preferred Default
Under classic `READ COMMITTED`, writers acquire exclusive locks that block readers, and shared locks delay writers — causing timeouts and deadlocks.
```sql
ALTER DATABASE [YourDatabase]
SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
```
- Readers read row versions from `tempdb` without holding shared locks or blocking writers.
- **Avoid `WITH (NOLOCK)` in application logic:** causes dirty reads, skipped rows, or duplicate row reads during page splits. Use RCSI instead (reserve `READ UNCOMMITTED` strictly for disposable read-only diagnostic triage).

### Prevent Lock Escalation (~5,000 Locks -> Table Lock)
A single `DELETE` or `UPDATE` touching >5,000 rows escalates to an **exclusive table lock**, stalling all readers/writers:
- Chunk maintenance DML into batches of **1,000–4,000 rows** inside separate short transactions:
```sql
WHILE 1 = 1
BEGIN
    DELETE TOP (2000) FROM dbo.TelemetryArchive
    WHERE CreatedUtc < @CutoffUtc;
    IF @@ROWCOUNT = 0 BREAK;
END
```

---

## 2. Deadlock Prevention & Transient Retry (`Error 1205`)

- **Deterministic Lock Ordering:** Acquire locks on shared tables in the exact same order across all stored procedures and services (`Orders -> OrderLines`, never reversed).
- **Keep Transactions Pure:** Never call external HTTP APIs, SAP RFC/GUI calls, or filesystem writes inside an active `SqlTransaction`.
- **Resilient Retry Policy:** Wrap idempotent transactional operations with bounded exponential backoff + jitter on SQL Server error `1205` (Deadlock Victim), `-2` (timeout), and `40197`/`40613`/`49918` (transient Azure/failover codes).

---

## 3. Read-Only DMV Triage Queries

When inspecting a slow MSSQL server, inspect **Wait Stats + Active Blockers + Top CPU/IO Queries + Index Usage** before changing code:

```sql
-- 1. Active blocking tree & running SQL
SELECT r.session_id, r.blocking_session_id, r.status, r.wait_type, r.wait_time,
       r.cpu_time, r.logical_reads, SUBSTRING(st.text, (r.statement_start_offset/2)+1,
       ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1) AS running_stmt
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE r.session_id > 50 AND r.session_id <> @@SPID;

-- 2. Cumulative wait stats (filter benign background waits)
SELECT TOP 15 wait_type, waiting_tasks_count, wait_time_ms / 1000.0 AS wait_sec,
       signal_wait_time_ms / 1000.0 AS cpu_queue_sec
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN ('SLEEP_TASK','BROKER_TASK_STOP','XE_TIMER_EVENT','LAZYWRITER_SLEEP',
    'SQLTRACE_BUFFER_FLUSH','WAITFOR','CHECKPOINT_QUEUE','CLR_AUTO_EVENT','DIRTY_PAGE_POLL')
ORDER BY wait_time_ms DESC;
```

### Wait Type -> Root Cause Quick Map
- `LCK_M_S` / `LCK_M_X` / `LCK_M_IX`: Lock blocking / missing RCSI / oversized transactions.
- `PAGEIOLATCH_SH` / `PAGEIOLATCH_EX`: Missing indexes causing massive disk scans or starved Buffer Pool RAM.
- `WRITELOG`: Log disk latency, unbatched per-row commits, excessive nonclustered indexes slowing inserts.
- `ASYNC_NETWORK_IO`: App reads result rows too slowly (huge `SELECT *` or UI stalling reader loops).
- `SOS_SCHEDULER_YIELD` / `CXPACKET`: CPU pressure, inefficient plans, bad MAXDOP/Cost Threshold settings.

---

## 4. Execution Plan Traps & Covering Indexes

- **Covering Indexes Eliminate Key Lookups:**
  ```sql
  CREATE NONCLUSTERED INDEX IX_Telemetry_Device_Utc
  ON dbo.Telemetry(DeviceId, RecordedUtc DESC)
  INCLUDE (MetricValue, OperationalState, AlarmCode);
  ```
- **Implicit Conversion (`CONVERT_IMPLICIT`):** Passing ANSI `varchar` / `DbType.AnsiString` to an `nvarchar` column forces T-SQL to convert every row, converting `Index Seek` into a full scan! Always match parameter types (`SqlDbType.NVarChar` vs `VarChar`) and exact lengths.
- **Parameter Sniffing:** If cached plans oscillate wildly between selective and skewed tenants, diagnose via `sys.dm_exec_query_stats` and use targeted `OPTION (RECOMPILE)` (for rare dynamic searches) or `OPTION (OPTIMIZE FOR UNKNOWN)` — never blindly sprinkle `RECOMPILE` inside high-QPS tight loops.
- **Missing Index DMVs (`sys.dm_db_missing_index_details`):** Always treat DMV suggestions as hints ONLY — coalesce overlapping columns with existing indexes (`sys.dm_db_index_usage_stats`) so writes are not choked by 15 redundant indexes.

---

## 5. High-Speed Ingestion & Read-Only Safety

- **Bulk Ingestion in .NET:** Use `SqlBulkCopy` (with `BatchSize` 1,000–5,000 and `SqlBulkCopyOptions.CheckConstraints`) or **Table-Valued Parameters (TVPs)** for structured upsert batches instead of 1,000 roundtrip `INSERT` calls.
- **Read-Only Diagnostic Safety (Agent Rule):** When running ad-hoc SQL diagnostics against production/staging MSSQL, restrict to single-statement `SELECT` / `WITH` queries, enforce `TOP N` + strict `CommandTimeout` (e.g., 30s), disallow `;`-chained multi-statements and write keywords (`INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE`), and mask secrets/connection strings in logs.
