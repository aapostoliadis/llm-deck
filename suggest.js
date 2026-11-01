// LLM Deck: suggests project groups from recurring folders and title words.
const path = require('path');

const STOP = new Set('the and for with from into onto that this your you our are was were has have had not but all any can will would should could about after before over under than then them they their there here what when where which while who why how also just only more most some such very new old get got make made use used using add added fix fixed build built create created update updated review set setup plan plans design draft ideas idea post posts help check write work task tasks test tests data file files page pages app apps application project projects overview session sessions chat chats prompt prompts code claude chatgpt codex agent agents system version final weekly daily list error issue issues run running start started open next first last one two three continue implement improve improvements please finish finished fixes found done makes making need needs want wants still keep look show shows thing things'.split(' '));
const GENERIC_DIR = /^(downloads?|desktop|documents|onedrive|projects?|repos?|src|code|tmp|temp|outputs?|scratch.*|\d{4}-\d{2}-\d{2}.*|users?|home|codex|claude|work|dev|git|new folder|\.claude.*)$/i;

const tokens = t => (String(t || '').toLowerCase().match(/[\p{L}][\p{L}\p{N}]{3,}/gu) || []).filter(w => !STOP.has(w));
const prettify = name => { const s = String(name).replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The folder that names the project: looks past random worktree names and prompt-named scratch folders.
function projectDir(cwd) {
  const parts = String(cwd || '').split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return '';
  const wt = parts.findIndex(p => p.toLowerCase() === 'worktrees');
  if (wt > 0) { const i = parts[wt - 1].toLowerCase() === '.claude' ? wt - 2 : wt - 1; return i >= 0 ? parts[i] : ''; }
  const last = parts[parts.length - 1], parent = parts[parts.length - 2] || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(parent)) return '';
  if (/^[a-z]+-[a-z]+-[0-9a-f]{4,}$/i.test(last)) return parent;
  if (last.length > 32) return '';
  return last;
}

function suggest(items, isGrouped, homeName) {
  const rest = items.filter(i => !isGrouped(i)).map(i => ({ ...i }));
  const byDir = new Map();
  for (const i of rest) {
    const b = projectDir(i.cwd);
    if (!b || GENERIC_DIR.test(b) || b.toLowerCase() === homeName) continue;
    if (!byDir.has(b)) byDir.set(b, []);
    byDir.get(b).push(i);
  }
  const out = [], used = new Set();
  for (const [dir, list] of [...byDir].sort((a, b) => b[1].length - a[1].length)) {
    if (list.length < 2 || out.length >= 8) continue;
    const counts = new Map();
    for (const i of list) for (const w of new Set(tokens(i.title))) counts.set(w, (counts.get(w) || 0) + 1);
    const extra = [...counts].filter(([w, c]) => c >= 2 && !dir.toLowerCase().includes(w)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
    const keys = [esc(dir), ...extra];
    keys.forEach(k => used.add(k.toLowerCase()));
    out.push({ name: prettify(dir), keywords: keys, count: list.length, why: list.length + ' sessions in the \u201c' + dir + '\u201d folder' });
    list.forEach(i => { i.taken = true; });
  }
  const counts = new Map();
  for (const i of rest) if (!i.taken) for (const w of new Set(tokens(i.title))) counts.set(w, (counts.get(w) || 0) + 1);
  for (const [w, c] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (out.length >= 8) break;
    if (c < 3 || used.has(w)) continue;
    out.push({ name: prettify(w), keywords: [w.length < 5 ? '\\b' + w + '\\b' : w], count: c, why: c + ' titles mention \u201c' + w + '\u201d' });
    used.add(w);
  }
  return out;
}

module.exports = { suggest, projectDir };
