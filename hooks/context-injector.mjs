import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHermesInSteps, isHermesTrigger, parseJsonl, readTranscriptSlices } from './hermes-trigger.mjs';

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const HEAD_SCAN_BYTES = 64 * 1024;
const PROTOCOL_MARKER = '<!-- HERMES_PROTOCOL_LOADED -->';
// A single @specialist call does not need the full 15 KB fleet protocol (token budget).
const TRIGGER_OPTIONS = { includeMentions: false };

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function allowEmpty() {
  process.stdout.write('{}');
}

function inspectTranscript(steps) {
  const alreadyInjected = steps.some((s) => String(s?.content || '').includes(PROTOCOL_MARKER));
  return { hermesActive: detectHermesInSteps(steps, TRIGGER_OPTIONS), alreadyInjected };
}

function resolveWorkspaceDir(payload) {
  let rawDir = payload?.cwd;
  if (!rawDir && Array.isArray(payload?.workspacePaths) && payload.workspacePaths.length > 0) {
    rawDir = payload.workspacePaths[0];
  }
  if (!rawDir || typeof rawDir !== 'string') return null;
  const trimmed = rawDir.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  return trimmed;
}

const raw = readStdin().trim();
if (!raw) {
  allowEmpty();
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allowEmpty();
  process.exit(0);
}

let hermesActive = isHermesTrigger(payload?.lastUserInput, TRIGGER_OPTIONS);
let alreadyInjected = false;

const transcriptPath = payload?.transcriptPath;
if (transcriptPath && fs.existsSync(transcriptPath)) {
  try {
    const { headText, tailText } = readTranscriptSlices(transcriptPath, {
      maxTailBytes: MAX_TAIL_BYTES,
      headScanBytes: HEAD_SCAN_BYTES
    });
    const info = inspectTranscript([...parseJsonl(headText), ...parseJsonl(tailText)]);
    hermesActive = hermesActive || info.hermesActive;
    alreadyInjected = info.alreadyInjected;
  } catch {
    // Ignore transcript read failures
  }
}

if (!hermesActive || alreadyInjected) {
  allowEmpty();
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protocolPath = path.resolve(__dirname, '..', 'skills', 'hermes', 'references', 'fleet-protocol.md');

if (!fs.existsSync(protocolPath)) {
  allowEmpty();
  process.exit(0);
}

try {
  const protocolText = fs.readFileSync(protocolPath, 'utf-8').trim();
  let content = protocolText.includes(PROTOCOL_MARKER)
    ? protocolText
    : `${PROTOCOL_MARKER}\n${protocolText}`;

  const workspaceDir = resolveWorkspaceDir(payload);
  if (workspaceDir) {
    const checkpointPath = path.join(workspaceDir, '.hermes', 'checkpoint.md');
    if (fs.existsSync(checkpointPath)) {
      try {
        const stat = fs.statSync(checkpointPath);
        if (stat.size > 0) {
          let cpText = fs.readFileSync(checkpointPath, 'utf-8');
          if (cpText.length > 2048) {
            cpText = cpText.slice(0, 2048);
          }
          if (cpText.trim().length > 0) {
            content += `\n\n---\n## 📌 Авто-подхват чекпоинта (.hermes/checkpoint.md)\n${cpText}`;
          }
        }
      } catch {
        // Ignore checkpoint read failures
      }
    }
  }

  process.stdout.write(JSON.stringify({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: content
        }
      }
    ]
  }));
} catch {
  allowEmpty();
}
