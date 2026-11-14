import fs from 'node:fs';
import path from 'node:path';

/**
 * Hermes Fleet Rule Engine (ported from anthropics/claude-plugins-official hookify).
 * Evaluates declarative Markdown+YAML rules in .hermes/rules/*.md without host restarts.
 * Zero external dependencies (pure Node.js stdlib).
 * Fail-open on malformed YAML or syntax errors.
 */

export function parseSimpleYamlFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!match) return null;

  const rawYaml = match[1];
  const body = (match[2] || '').trim();
  const data = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;
  let currentListItem = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.trim().startsWith('#')) continue;

    // Check list item with mapping e.g. "  - field: CommandLine"
    const listItemMatch = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (listItemMatch && currentList) {
      currentListItem = { [listItemMatch[1]]: unquote(listItemMatch[2].trim()) };
      currentList.push(currentListItem);
      continue;
    }

    // Check continued properties in list item e.g. "    operator: regex_match"
    const subPropMatch = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (subPropMatch && currentListItem) {
      currentListItem[subPropMatch[1]] = unquote(subPropMatch[2].trim());
      continue;
    }

    // Top-level key: value or key: list start
    const topMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topMatch) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      currentListItem = null;
      if (!val) {
        currentList = [];
        data[currentKey] = currentList;
      } else {
        currentList = null;
        data[currentKey] = parseScalar(val);
      }
    }
  }

  return { frontmatter: data, body };
}

function unquote(str) {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

function parseScalar(val) {
  const u = unquote(val);
  if (u.toLowerCase() === 'true') return true;
  if (u.toLowerCase() === 'false') return false;
  if (/^-?\d+$/.test(u)) return parseInt(u, 10);
  return u;
}

export function loadRules(rulesDir) {
  const rules = [];
  if (!rulesDir || !fs.existsSync(rulesDir)) return rules;

  try {
    const entries = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    for (const file of entries) {
      const fullPath = path.join(rulesDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = parseSimpleYamlFrontmatter(content);
        if (!parsed) continue;

        const fm = parsed.frontmatter;
        if (fm.enabled === false) continue;

        rules.push({
          file,
          name: String(fm.name || file.replace(/\.md$/, '')),
          enabled: fm.enabled !== false,
          event: String(fm.event || 'all').toLowerCase(),
          action: String(fm.action || 'warn').toLowerCase(),
          conditions: Array.isArray(fm.conditions) ? fm.conditions : [],
          message: parsed.body || String(fm.message || '')
        });
      } catch (err) {
        // Fail-open on individual corrupt files
      }
    }
  } catch {
    // Fail-open
  }

  return rules;
}

export function evaluateCondition(condition, context) {
  const field = String(condition.field || '').trim();
  const operator = String(condition.operator || 'regex_match').toLowerCase();
  const pattern = String(condition.pattern || '');

  const rawVal = context[field] ?? '';
  const val = String(rawVal);

  try {
    switch (operator) {
      case 'regex_match':
      case 'regex':
        return new RegExp(pattern, 'i').test(val);
      case 'contains':
        return val.toLowerCase().includes(pattern.toLowerCase());
      case 'not_contains':
        return !val.toLowerCase().includes(pattern.toLowerCase());
      case 'equals':
        return val.toLowerCase() === pattern.toLowerCase();
      case 'starts_with':
        return val.toLowerCase().startsWith(pattern.toLowerCase());
      case 'ends_with':
        return val.toLowerCase().endsWith(pattern.toLowerCase());
      default:
        return false;
    }
  } catch {
    return false; // Fail-open on bad regex pattern
  }
}

export function evaluateRules({ event, context = {}, rulesDir } = {}) {
  const rules = loadRules(rulesDir);
  const matchedRules = [];
  const normalizedEvent = String(event || 'all').toLowerCase();

  for (const rule of rules) {
    if (rule.event !== 'all' && rule.event !== normalizedEvent) continue;

    let allConditionsMet = rule.conditions.length > 0;
    for (const cond of rule.conditions) {
      if (!evaluateCondition(cond, context)) {
        allConditionsMet = false;
        break;
      }
    }

    if (allConditionsMet) {
      matchedRules.push(rule);
    }
  }

  const blockingRules = matchedRules.filter(r => r.action === 'block' || r.action === 'deny');
  const warningRules = matchedRules.filter(r => r.action === 'warn');

  return {
    blocked: blockingRules.length > 0,
    blockingRules,
    warningRules,
    matchedRules
  };
}

export function formatRulesSummary(rulesDir) {
  const rules = loadRules(rulesDir);
  if (rules.length === 0) {
    return 'No active declarative rules found in .hermes/rules/*.md';
  }
  const lines = [
    '| Rule Name | Event | Action | Conditions | Description |',
    '|---|---|---|---|---|'
  ];
  for (const r of rules) {
    const condStr = r.conditions.map(c => `${c.field} ${c.operator} "${c.pattern || ''}"`).join(' AND ');
    lines.push(`| ${r.name} | ${r.event} | ${r.action} | ${condStr || 'none'} | ${r.body || r.name} |`);
  }
  return lines.join('\n');
}
