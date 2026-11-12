# 📊 Generative UI: Interactive Hermes Kanban Board

This reference guides **Lead (Orchestrator)** on rendering interactive visual Kanban boards in Antigravity.

---

## 1. When to Render the Visual Board
- At the conclusion of architectural decomposition;
- When the user asks for `/hermes board`, `/hermes status`, or `/hermes standup`;
- When significant task state transitions occur (e.g. from `In Progress` to `QA Review` or `Done`).

---

## 2. Interactive HTML Artifact Template

Save as an HTML artifact in `<artifactDirectory>/hermes_kanban.html` and embed with `<agent-embed>` or present as an interactive artifact:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-4">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-6 shadow-lg max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between pb-5 border-b border-[var(--border)] mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-md">H</div>
        <div>
          <h2 class="font-bold text-xl leading-tight">Hermes Fleet — Live Kanban</h2>
          <p class="text-[var(--muted-foreground)] text-xs">Мультиагентный прогресс разработки в реальном времени</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Агенты активны
        </span>
      </div>
    </div>

    <!-- Metrics Bar -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)]">
        <div class="text-[var(--muted-foreground)] text-xs">Всего задач</div>
        <div id="stat-total" class="text-xl font-bold mt-1">12</div>
      </div>
      <div class="bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)]">
        <div class="text-[var(--muted-foreground)] text-xs">В работе</div>
        <div id="stat-active" class="text-xl font-bold mt-1 text-sky-400">3</div>
      </div>
      <div class="bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)]">
        <div class="text-[var(--muted-foreground)] text-xs">На аудите QA</div>
        <div id="stat-qa" class="text-xl font-bold mt-1 text-amber-400">2</div>
      </div>
      <div class="bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)]">
        <div class="text-[var(--muted-foreground)] text-xs">Завершено</div>
        <div id="stat-done" class="text-xl font-bold mt-1 text-emerald-400">7</div>
      </div>
    </div>

    <!-- 4 Kanban Columns -->
    <div class="grid grid-cols-4 gap-4">
      <!-- To Do -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider px-1">
          <span>Бэклог</span>
          <span class="bg-[var(--background)] px-2 py-0.5 rounded-full border border-[var(--border)]">2</span>
        </div>
        <div class="space-y-2.5">
          <div class="bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)] hover:border-sky-500/50 transition">
            <div class="flex justify-between items-start mb-1.5">
              <span class="text-xs font-mono text-[var(--muted-foreground)]">TASK-08</span>
              <span class="text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-medium">Elena</span>
            </div>
            <div class="text-sm font-medium">Адаптация формы под 4 состояния</div>
          </div>
        </div>
      </div>

      <!-- In Progress -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs font-semibold text-sky-400 uppercase tracking-wider px-1">
          <span>В работе</span>
          <span class="bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">2</span>
        </div>
        <div class="space-y-2.5">
          <div class="bg-[var(--background)] p-3.5 rounded-xl border border-sky-500/30">
            <div class="flex justify-between items-start mb-1.5">
              <span class="text-xs font-mono text-sky-400">TASK-05</span>
              <span class="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-medium">Dmitry</span>
            </div>
            <div class="text-sm font-medium">Устранение CA2022 Stream.Read</div>
          </div>
        </div>
      </div>

      <!-- QA Review -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs font-semibold text-amber-400 uppercase tracking-wider px-1">
          <span>Проверка QA</span>
          <span class="bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">1</span>
        </div>
        <div class="space-y-2.5">
          <div class="bg-[var(--background)] p-3.5 rounded-xl border border-amber-500/30">
            <div class="flex justify-between items-start mb-1.5">
              <span class="text-xs font-mono text-amber-400">TASK-04</span>
              <span class="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-medium">Viktor</span>
            </div>
            <div class="text-sm font-medium">Аудит многопоточных дедлоков сетевых сокетов</div>
          </div>
        </div>
      </div>

      <!-- Done -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs font-semibold text-emerald-400 uppercase tracking-wider px-1">
          <span>Завершено</span>
          <span class="bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">1</span>
        </div>
        <div class="space-y-2.5">
          <div class="bg-[var(--background)] p-3.5 rounded-xl border border-emerald-500/30 opacity-80">
            <div class="flex justify-between items-start mb-1.5">
              <span class="text-xs font-mono text-emerald-400">TASK-01</span>
              <span class="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-medium">Alexey</span>
            </div>
            <div class="text-sm font-medium line-through text-[var(--muted-foreground)]">Таймауты сетевого стека</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```
