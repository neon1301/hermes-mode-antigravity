import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

function resolveBindConfig(argv) {
  let cliPort;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      cliPort = argv[i + 1];
      break;
    }
    if (argv[i].startsWith('--port=')) {
      cliPort = argv[i].slice('--port='.length);
      break;
    }
  }
  const rawPort = cliPort ?? process.env.HERMES_MONITOR_PORT ?? process.env.PORT ?? '0';
  const parsedPort = Number.parseInt(rawPort, 10);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 0;
  const host = process.env.HERMES_MONITOR_HOST || '127.0.0.1';
  return { host, port };
}

const { host: HOST, port: PORT } = resolveBindConfig(process.argv.slice(2));
const hermesDir = path.join(process.cwd(), '.hermes');
const chatterJsonl = path.join(hermesDir, 'chatter.jsonl');

function getMessages() {
  if (!fs.existsSync(chatterJsonl)) return [];
  try {
    const lines = fs.readFileSync(chatterJsonl, 'utf-8').split('\n').filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/hermes/chatter') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(JSON.stringify({ messages: getMessages() }));
  }

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Hermes Fleet Monitor</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --primary: #38bdf8;
      --accent: #818cf8;
      --success: #34d399;
      --warn: #f59e0b;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    body {
      margin: 0; padding: 24px;
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
    }
    .title-group { display: flex; align-items: center; gap: 14px; }
    .logo {
      width: 42px; height: 42px; background: linear-gradient(135deg, #38bdf8, #818cf8);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 20px; color: #fff;
    }
    h1 { margin: 0; font-size: 22px; }
    .badge {
      background: rgba(56, 189, 248, 0.1); border: 1px solid var(--primary);
      color: var(--primary); padding: 4px 10px; border-radius: 9999px;
      font-size: 12px; font-weight: 600;
    }
    .grid { display: grid; grid-template-columns: 340px 1fr; gap: 24px; }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
    .panel h2 {
      margin-top: 0; font-size: 15px; font-weight: 600; border-bottom: 1px solid var(--border);
      padding-bottom: 10px; margin-bottom: 14px; color: var(--muted); text-transform: uppercase;
    }
    .worker-card {
      background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
    }
    .worker-name { font-weight: 600; color: var(--primary); font-size: 14px; }
    .worker-role { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .chat-container { display: flex; flex-direction: column; gap: 10px; max-height: 76vh; overflow-y: auto; }
    .chat-msg {
      background: rgba(255, 255, 255, 0.03); border-left: 3px solid var(--primary);
      border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 14px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .chat-msg.system { border-left-color: var(--accent); }
    .chat-msg.task { border-left-color: var(--success); }
    .chat-msg.warn { border-left-color: var(--warn); }
    .msg-meta { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .sender { font-weight: 600; color: #fff; }
    .target { color: var(--primary); }
    .empty { color: var(--muted); font-style: italic; text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-group">
      <div class="logo">H</div>
      <div>
        <h1>Hermes Fleet Monitor</h1>
        <div style="font-size: 12px; color: var(--muted);">Multi-Agent Orchestration &amp; Chatter Live Stream (127.0.0.1)</div>
      </div>
    </div>
    <div class="badge">&#9679; LIVE SYNC</div>
  </div>
  <div class="grid">
    <div class="panel">
      <h2>Hermes Fleet (Lead + 13)</h2>
      <div class="worker-card"><div class="worker-name">&#128081; lead (Оркестратор)</div><div class="worker-role">Декомпозиция, волны 3–5, Build Gate, Subagent GC</div></div>
      <div class="worker-card"><div class="worker-name">&#9878;&#65039; stanislav</div><div class="worker-role">Chief Fleet Auditor (12 правил, 19 скиллов, Read-Only)</div></div>
      <div class="worker-card"><div class="worker-name">&#128293; kritik (Критик)</div><div class="worker-role">UX Critic, Product Roast &amp; Forum/Methods Scout (Read-Only)</div></div>
      <div class="worker-card"><div class="worker-name">&#128737;&#65039; viktor</div><div class="worker-role">Lead QA &amp; AppSec (7-векторный QA, TDD, OWASP, DevSecOps)</div></div>
      <div class="worker-card"><div class="worker-name">&#128187; dmitry</div><div class="worker-role">Multi-Stack Backend (Clean Arch, API, Outbox, .NET/Py/Node/Go)</div></div>
      <div class="worker-card"><div class="worker-name">&#127912; elena</div><div class="worker-role">Frontend &amp; UI/UX (4 состояния, A11y, иконки, токены)</div></div>
      <div class="worker-card"><div class="worker-name">&#128452;&#65039; denis</div><div class="worker-role">Multi-Engine High-Load DBA (SQLite, Postgres, MSSQL, MySQL, OLAP)</div></div>
      <div class="worker-card"><div class="worker-name">&#129504; mikhail</div><div class="worker-role">AI/ML &amp; LLM Architect (Hybrid RAG, Context/Memory, Fine-Tuning/vLLM)</div></div>
      <div class="worker-card"><div class="worker-name">&#129529; sergey</div><div class="worker-role">Refactoring Architect (CRAP-Score, Characterization, Strangler Fig)</div></div>
      <div class="worker-card"><div class="worker-name">&#9881;&#65039; alexey</div><div class="worker-role">Industrial Hardware &amp; Protocols (PLC, Modbus, OPC UA, сокеты)</div></div>
      <div class="worker-card"><div class="worker-name">&#127981; igor</div><div class="worker-role">Hardware Mock &amp; Simulator (Stateful FSM, Fault Injection, Fuzzing)</div></div>
      <div class="worker-card"><div class="worker-name">&#128221; anna</div><div class="worker-role">Technical Writer (C4/Mermaid, Di&#225;taxis, ADR, OpenAPI, Read-Only)</div></div>
      <div class="worker-card"><div class="worker-name">&#128202; ruslan</div><div class="worker-role">SAP &amp; Enterprise (NCo, BAPI, GUI Scripting, IDoc, OData)</div></div>
      <div class="worker-card"><div class="worker-name">&#128269; artem</div><div class="worker-role">Reverse Engineering (REA, CIL/ASAR, бинарные протоколы)</div></div>
    </div>
    <div class="panel">
      <h2>Inter-Agent Chatter Feed (<span id="count">0</span>)</h2>
      <div class="chat-container" id="chat-feed">
        <div class="empty">Ожидание сообщений агентов...</div>
      </div>
    </div>
  </div>
  <script>
    const ALLOWED_KINDS = new Set(['system', 'task', 'warn']);
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }
    async function refresh() {
      try {
        const res = await fetch('/api/hermes/chatter');
        const data = await res.json();
        if (!data || !Array.isArray(data.messages)) return;
        document.getElementById('count').textContent = String(data.messages.length);
        const feed = document.getElementById('chat-feed');
        if (data.messages.length === 0) {
          feed.innerHTML = '<div class="empty">Сообщений пока нет. Они появятся здесь при работе агентов.</div>';
          return;
        }
        feed.innerHTML = data.messages.map((m) => {
          const kind = ALLOWED_KINDS.has(m.kind) ? m.kind : '';
          return '<div class="chat-msg ' + kind + '">' +
            '<div class="msg-meta">' +
              '<span>' + escapeHtml(m.timeFormatted || '') + '</span>' +
              '<span class="sender">' + escapeHtml(m.sender || 'unknown') + '</span>' +
              '<span>&#10132;</span>' +
              '<span class="target">' + escapeHtml(m.target || 'all') + '</span>' +
            '</div>' +
            '<div>' + escapeHtml(m.content || '') + '</div>' +
          '</div>';
        }).join('');
      } catch (err) {}
    }
    setInterval(refresh, 2000);
    refresh();
  </script>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
  console.log(`[Hermes Monitor] Запущен на http://${HOST}:${actualPort}`);
});
