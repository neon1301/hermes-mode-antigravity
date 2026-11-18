import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveWorkspaceDir } from './workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(__dirname, 'context-injector.mjs');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ctx-inj-test-'));

function writeTranscript(name, steps) {
  const p = path.join(tmpDir, `${name}.jsonl`);
  fs.writeFileSync(p, steps.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf-8');
  return p;
}

function runInjector(payload) {
  const out = execFileSync('node', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf-8'
  });
  return JSON.parse(out);
}

const cases = [
  {
    name: 'skip_non_hermes_normal_chat',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'Fix a bug in Program.cs',
      transcriptPath: writeTranscript('normal', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'Fix a bug in Program.cs' }
      ])
    })
  },
  {
    name: 'skip_when_system_context_only_mentions_hermes_without_trigger',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'Explain C# records',
      transcriptPath: writeTranscript('sys_only', [
        { step_index: 0, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: 'loaded hermes-fleet plugin' },
        { step_index: 1, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'Explain C# records' }
      ])
    })
  },
  {
    name: 'inject_once_on_slash_hermes_trigger',
    check: (res) => Array.isArray(res.injectSteps)
      && res.injectSteps.length === 1
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('<!-- HERMES_PROTOCOL_LOADED -->')
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('Zero-Hardcode'),
    run: () => runInjector({
      lastUserInput: '/hermes check architecture',
      transcriptPath: writeTranscript('slash_hermes', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes check architecture' }
      ])
    })
  },
  {
    name: 'skip_full_protocol_on_single_specialist_mention',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: '@критик прожарь интерфейс'
    })
  },
  {
    name: 'inject_on_hermes_mode_phrase',
    check: (res) => Array.isArray(res.injectSteps)
      && res.injectSteps.length === 1
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('<!-- HERMES_PROTOCOL_LOADED -->'),
    run: () => runInjector({
      lastUserInput: 'включи режим hermes'
    })
  },
  {
    name: 'skip_mid_sentence_slash_mention_with_skill_metadata',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'правило не должно было попасть без вызова /hermes',
      transcriptPath: writeTranscript('mid_sentence', [
        {
          step_index: 0,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          content: '<USER_REQUEST>\nправило не должно было попасть без вызова /hermes \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n/hermes is a [Slash Command]: C:/Users/u/.gemini/config/plugins/hermes-fleet/skills/hermes/SKILL.md\n</ADDITIONAL_METADATA>'
        }
      ])
    })
  },
  {
    name: 'skip_question_about_hermes_mode',
    check: (res) => !res.injectSteps,
    run: () => runInjector({ lastUserInput: 'что такое режим hermes и hermes mode?' })
  },
  {
    name: 'inject_on_slash_hermes_inside_user_request_wrapper',
    check: (res) => Array.isArray(res.injectSteps) && res.injectSteps.length === 1,
    run: () => runInjector({
      lastUserInput: '',
      transcriptPath: writeTranscript('wrapped_slash', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes audit\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\ntime\n</ADDITIONAL_METADATA>' }
      ])
    })
  },
  {
    name: 'dedup_skip_when_protocol_already_in_transcript',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'continue',
      transcriptPath: writeTranscript('already_loaded', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes build' },
        { step_index: 1, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_PROTOCOL_LOADED -->\n# Full rules...' },
        { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'continue' }
      ])
    })
  },
  {
    name: 'inject_checkpoint_when_present_in_cwd',
    check: (res) => Array.isArray(res.injectSteps)
      && res.injectSteps.length === 1
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('<!-- HERMES_PROTOCOL_LOADED -->')
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('Active Model Profile: Hybrid'),
    run: () => {
      const hermesDir = path.join(tmpDir, '.hermes');
      fs.mkdirSync(hermesDir, { recursive: true });
      fs.writeFileSync(path.join(hermesDir, 'checkpoint.md'), 'Active Model Profile: Hybrid', 'utf-8');
      return runInjector({
        cwd: tmpDir,
        lastUserInput: '/hermes start'
      });
    }
  },
  {
    name: 'inject_project_instincts_filtered_by_confidence',
    check: (res) => {
      const msg = String(res.injectSteps?.[0]?.systemMessage?.systemMessage || '');
      return msg.includes('Выученные инстинкты проекта')
        && msg.includes('Always use Color.FromArgb(20, 26, 38) for sidebar')
        && !msg.includes('Low confidence draft rule');
    },
    run: () => {
      const instDir = path.join(tmpDir, 'proj_instincts', '.hermes');
      fs.mkdirSync(instDir, { recursive: true });
      fs.writeFileSync(path.join(instDir, 'instincts.json'), JSON.stringify([
        { id: 'ui-sidebar', domain: 'ui', trigger: 'styling TreeView or sidebar', rule: 'Always use Color.FromArgb(20, 26, 38) for sidebar', confidence: 0.95 },
        { id: 'draft', domain: 'misc', trigger: 'testing', rule: 'Low confidence draft rule', confidence: 0.4 }
      ]), 'utf-8');
      return runInjector({
        cwd: path.join(tmpDir, 'proj_instincts'),
        lastUserInput: '/hermes style treeview'
      });
    }
  },
  {
    name: 'suggest_strategic_compact_when_transcript_exceeds_step_threshold',
    check: (res) => {
      const msg = String(res.injectSteps?.[0]?.systemMessage?.systemMessage || '');
      return msg.includes('<!-- HERMES_COMPACT_SUGGESTED -->') && msg.includes('/compact');
    },
    run: () => {
      const steps = [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes build' },
        { step_index: 1, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_PROTOCOL_LOADED -->\n# Full rules...' }
      ];
      for (let i = 2; i < 62; i++) {
        steps.push({ step_index: i, source: 'MODEL', type: 'PLANNER_RESPONSE', content: `step ${i}` });
      }
      return runInjector({
        lastUserInput: 'продолжай',
        transcriptPath: writeTranscript('long_session', steps)
      });
    }
  },
  {
    name: 'skip_strategic_compact_during_cooldown',
    check: (res) => !res.injectSteps,
    run: () => {
      const steps = [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes build' },
        { step_index: 1, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_PROTOCOL_LOADED -->\n# Full rules...' }
      ];
      for (let i = 2; i < 60; i++) {
        steps.push({ step_index: i, source: 'MODEL', type: 'PLANNER_RESPONSE', content: `step ${i}` });
      }
      steps.push({ step_index: 60, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_COMPACT_SUGGESTED -->\nSuggested recently' });
      steps.push({ step_index: 61, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'ok' });
      return runInjector({
        lastUserInput: 'ok',
        transcriptPath: writeTranscript('cooldown_session', steps)
      });
    }
  },
  {
    name: 'workspace_resolve_from_workspacePaths_array',
    check: (res) => res === '/test/project/dir',
    run: () => resolveWorkspaceDir({ workspacePaths: ['/test/project/dir'] }, '/fallback')
  },
  {
    name: 'workspace_resolve_from_workspacePaths_file_uri',
    check: (res) => path.resolve(res) === path.resolve('/some/test/path'),
    run: () => {
      const targetDir = path.resolve('/some/test/path');
      const fileUri = pathToFileURL(targetDir).href;
      return resolveWorkspaceDir({ workspacePaths: [fileUri] }, '/fallback');
    }
  },
  {
    name: 'workspace_workspacePaths_takes_precedence_over_plugin_root_cwd',
    check: (res) => res === '/user/actual/workspace',
    run: () => resolveWorkspaceDir({
      workspacePaths: ['/user/actual/workspace'],
      cwd: '/plugin/root/directory'
    }, '/fallback')
  },
  {
    name: 'workspace_fallback_to_payload_cwd_when_workspacePaths_absent',
    check: (res) => res === '/user/workspace/from/cwd',
    run: () => resolveWorkspaceDir({ cwd: '/user/workspace/from/cwd' }, '/fallback')
  },
  {
    name: 'workspace_fallback_to_process_cwd_when_payload_empty_or_null',
    check: (res) => res.nullOk && res.emptyOk && res.emptyArrOk,
    run: () => {
      const fb = '/custom/fallback/dir';
      return {
        nullOk: resolveWorkspaceDir(null, fb) === fb,
        emptyOk: resolveWorkspaceDir({}, fb) === fb,
        emptyArrOk: resolveWorkspaceDir({ workspacePaths: [] }, fb) === fb
      };
    }
  },
  {
    name: 'injector_loads_lessons_within_budget_allow',
    check: (res) => {
      const msg = String(res.injectSteps?.[0]?.systemMessage?.systemMessage || '');
      const marker = '## 🧯 Память ошибок проекта';
      const idx = msg.indexOf(marker);
      if (idx < 0) return false;
      const lessonsSection = msg.slice(idx);
      const byteLen = Buffer.byteLength(lessonsSection, 'utf-8');
      const bulletCount = lessonsSection.split(/\r?\n/).filter((l) => l.startsWith('- **[`')).length;
      return byteLen <= 2048
        && bulletCount >= 1
        && bulletCount <= 5
        && !lessonsSection.includes('fake_prose_rule')
        && !lessonsSection.includes('SYSTEM_MESSAGE')
        && lessonsSection.includes('qa_reject');
    },
    run: () => {
      const lesDir = path.join(tmpDir, 'proj_lessons', '.hermes');
      fs.mkdirSync(lesDir, { recursive: true });
      const entries = [
        // Non-mechanical / forged prose entry MUST be ignored
        { ts: '2026-11-18T00:00:00Z', taskHash: 't0', rule: 'fake_prose_rule', reasonHash: 'r0', count: 5, source: 'model' },
        // Duplicate mechanical entry (should dedup)
        { ts: '2026-11-18T00:01:00Z', taskHash: 't1', rule: 'rule9_hardcode', reasonHash: 'r1', count: 2, source: 'mechanical' },
        { ts: '2026-11-18T00:02:00Z', taskHash: 't1', rule: 'rule9_hardcode', reasonHash: 'r1', count: 3, source: 'mechanical' },
        // 7 distinct mechanical rules (> 5 cap, must load <= 5 unique within <= 2048 bytes)
        { ts: '2026-11-18T00:03:00Z', taskHash: 't2', rule: 'rule8_clean_edits', reasonHash: 'r2', count: 2, source: 'mechanical' },
        { ts: '2026-11-18T00:04:00Z', taskHash: 't3', rule: 'plan_missing', reasonHash: 'r3', count: 2, source: 'mechanical' },
        { ts: '2026-11-18T00:05:00Z', taskHash: 't4', rule: 'plan_lint_failed', reasonHash: 'r4', count: 2, source: 'mechanical' },
        { ts: '2026-11-18T00:06:00Z', taskHash: 't5', rule: 'stall_breaker', reasonHash: 'r5', count: 3, source: 'mechanical' },
        { ts: '2026-11-18T00:07:00Z', taskHash: 't6', rule: 'sec_l1_pattern', reasonHash: 'r6', count: 2, source: 'mechanical' },
        { ts: '2026-11-18T00:08:00Z', taskHash: 't7', rule: 'qa_reject', reasonHash: 'r7', count: 1, source: 'mechanical' }
      ];
      fs.writeFileSync(
        path.join(lesDir, 'lessons.jsonl'),
        entries.map((e) => JSON.stringify(e)).join('\n') + '\n{CORRUPT_LINE_IGNORED\n',
        'utf-8'
      );
      return runInjector({
        cwd: path.join(tmpDir, 'proj_lessons'),
        lastUserInput: '/hermes start feature'
      });
    }
  },
  {
    name: 'xray_debt_injected_within_budget',
    check: (res) => {
      const msg = String(res.injectSteps?.[0]?.systemMessage?.systemMessage || '');
      const marker = '## 🩺 Открытый долг продукта';
      const idx = msg.indexOf(marker);
      if (idx < 0) return false;
      const debtSection = msg.slice(idx);
      const byteLen = Buffer.byteLength(debtSection, 'utf-8');
      const bulletCount = debtSection.split(/\r?\n/).filter((l) => l.startsWith('- [')).length;
      return byteLen <= 1024
        && bulletCount >= 1
        && bulletCount <= 3
        && debtSection.includes('src/target.js')
        && !debtSection.includes('acceptedRiskFn')
        && !debtSection.includes('fixedOldFn');
    },
    run: () => {
      const debtDir = path.join(tmpDir, 'proj_debt', '.hermes');
      fs.mkdirSync(debtDir, { recursive: true });
      const rows = [
        { id: 'd1', status: 'open', path: 'src/target.js', line: 12, symbol: 'pollLoop', rule: 'fragile.unstopped_timer', impact: 'resource_waste', evidence: 'src/target.js:12', source: 'mechanical', ts: '2026-11-18T00:00:00Z' },
        { id: 'd2', status: 'debt', path: 'src/other1.js', line: 5, symbol: 'emptyErr', rule: 'stub.empty_catch', impact: 'brick_risk', evidence: 'src/other1.js:5', source: 'user_ask_question:xray', ts: '2026-11-18T00:01:00Z' },
        { id: 'd3', status: 'open', path: 'src/other2.js', line: 9, symbol: 'alwaysOk', rule: 'stub.always_true_return', impact: 'lies_to_user', evidence: 'src/other2.js:9', source: 'mechanical', ts: '2026-11-18T00:02:00Z' },
        { id: 'd4', status: 'debt', path: 'src/other3.js', line: 20, symbol: 'fourthItem', rule: 'stub.todo_fixme', impact: 'cosmetic', evidence: 'src/other3.js:20', source: 'mechanical', ts: '2026-11-18T00:03:00Z' },
        { id: 'd5', status: 'accepted', path: 'src/target.js', line: 30, symbol: 'acceptedRiskFn', rule: 'fragile.unstopped_timer', impact: 'lies_to_user', evidence: 'src/target.js:30', source: 'user_ask_question:xray', ts: '2026-11-18T00:04:00Z' },
        { id: 'd6', status: 'fixed', path: 'src/target.js', line: 40, symbol: 'fixedOldFn', rule: 'dead.unused_symbol', impact: 'lies_to_user', evidence: 'src/target.js:40', source: 'mechanical', ts: '2026-11-18T00:05:00Z' }
      ];
      fs.writeFileSync(
        path.join(debtDir, 'debt-ledger.jsonl'),
        rows.map((r) => JSON.stringify(r)).join('\n') + '\n{BROKEN_JSON_LINE\n',
        'utf-8'
      );
      return runInjector({
        cwd: path.join(tmpDir, 'proj_debt'),
        lastUserInput: '/hermes исправь src/target.js'
      });
    }
  }
];

let failed = 0;
try {
  for (const c of cases) {
    const res = c.run();
    const ok = c.check(res);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}`);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log(`CONTEXT-INJECTOR SUMMARY: ${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
