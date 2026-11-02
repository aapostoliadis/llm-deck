// Claude Deck: Codex threads (desktop app + CLI) from ~/.codex
const fs = require('fs');
const os = require('os');
const path = require('path');

const CX = path.join(os.homedir(), '.codex');
const SEEN = path.join(os.homedir(), '.claude-deck', 'codex-seen.json');
const H = 3600e3;
const cache = new Map();   // file -> parsed
let seen = {}; try { seen = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch (_) {}
let names = new Map(), namesMtime = 0, known = new Map(), latestLimits = null;

function readSlice(file, size, fromEnd) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, fs.fstatSync(fd).size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, fromEnd ? fs.fstatSync(fd).size - len : 0);
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}

function loadNames() {
  const f = path.join(CX, 'session_index.jsonl');
  let st; try { st = fs.statSync(f); } catch (_) { return; }
  if (st.mtimeMs === namesMtime) return;
  namesMtime = st.mtimeMs; names = new Map();
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    try { const j = JSON.parse(l); if (j.id) names.set(j.id, j.thread_name || ''); } catch (_) {}
  }
}

function parse(file, st) {
  const id = (path.basename(file, '.jsonl').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/) || [])[1];
  const head = readSlice(file, 256 * 1024, false);
  const cwdM = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  let cwd = ''; try { cwd = cwdM ? JSON.parse('"' + cwdM[1] + '"') : ''; } catch (_) {}
  const subagent = /"subagent":\s*[\{"]/.test(head.slice(0, 20000));
  let firstPrompt = '';
  const tail = readSlice(file, 512 * 1024, true).split('\n').slice(1);
  let start = 0, complete = 0, abort = 0, approval = 0, last = 0, rl = null, rlTs = 0, err = 0, errMsg = '', abortReason = '', approvalText = '', lastMsg = '';
  for (const l of tail) {
    if (!l) continue;
    let j; try { j = JSON.parse(l); } catch (_) { continue; }
    const ts = Date.parse(j.timestamp) || 0; if (ts > last) last = ts;
    const t = j.payload && j.payload.type;
    if (t === 'task_started') start = ts;
    else if (t === 'task_complete') complete = ts;
    else if (t === 'turn_aborted') { abort = ts; abortReason = String((j.payload && j.payload.reason) || ''); }
    else if (t === 'error' || t === 'stream_error') { err = ts; errMsg = String((j.payload && j.payload.message) || 'Error').replace(/\s+/g, ' ').slice(0, 90); }
    else if (t && /approval_request|request_user_input|elicitation/.test(t)) {
      approval = ts; const pl = j.payload || {};
      approvalText = String(pl.reason || pl.question || (Array.isArray(pl.command) ? pl.command.join(' ') : pl.command || '')).replace(/\s+/g, ' ').slice(0, 160);
    }
    if (t === 'agent_message' && j.payload && j.payload.message) lastMsg = String(j.payload.message);
    if (t === 'token_count' && j.payload.rate_limits) { rl = j.payload.rate_limits; rlTs = ts; }
    if (!firstPrompt && j.type === 'response_item' && j.payload.type === 'message' && j.payload.role === 'user') {
      const c = (j.payload.content || []).find(x => x.text); if (c && !c.text.startsWith('<')) firstPrompt = c.text;
    }
  }
  return { id, cwd, subagent, firstPrompt, start, complete, abort, approval, approvalText, lastMsg, err, errMsg, abortReason, last: last || st.mtimeMs, rl, rlTs, mtime: st.mtimeMs, size: st.size };
}

function files(days) {
  const out = [];
  const base = path.join(CX, 'sessions');
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * H);
    const dir = path.join(base, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let list = []; try { list = fs.readdirSync(dir); } catch (_) { continue; }
    for (const f of list) if (f.endsWith('.jsonl')) out.push(path.join(dir, f));
  }
  return out;
}

// The last question in a message, if it ends with one.
function questionOf(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t.includes('?')) return '';
  const parts = t.split(/(?<=[.!?])\s+/);
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].includes('?')) return parts[i].slice(0, 160);
  return '';
}

function sessions(cfg) {
  const now = Date.now();
  const bgFrom = now - (cfg.backgroundHours || 24) * H;
  const minTurn = (cfg.readyMinTurnSeconds ?? 30) * 1000;
  if (cfg.codex === false || !fs.existsSync(CX)) return [];
  loadNames();
  const out = []; known = new Map(); latestLimits = null;
  for (const file of files(8)) {
    let st; try { st = fs.statSync(file); } catch (_) { continue; }
    if (st.mtimeMs < now - 3 * 24 * H) continue;
    let p = cache.get(file);
    if (!p || p.mtime !== st.mtimeMs || p.size !== st.size) { try { p = parse(file, st); } catch (_) { continue; } cache.set(file, p); }
    if (p.rl && (!latestLimits || p.rlTs > latestLimits.ts)) latestLimits = { ts: p.rlTs, rl: p.rl };
    if (!p.id || (p.subagent && !names.has(p.id))) continue;

    let state = 'idle', since = p.last, detail = '';
    const running = p.start > Math.max(p.complete, p.abort);
    if (running && p.approval >= p.start) { state = 'waiting'; since = p.approval; detail = 'Needs your approval'; }
    else if (running) { state = now - p.last > 20 * 60e3 ? 'idle' : 'working'; since = p.start; }
    else if (((p.err && p.err >= p.start && p.err > p.complete) || (p.abort > p.complete && p.abortReason && p.abortReason !== 'interrupted')) && !(seen[p.id] >= Math.max(p.err || 0, p.abort || 0))) {
      state = 'failed'; since = Math.max(p.err || 0, p.abort || 0); detail = p.err > p.abort ? (p.errMsg || 'Error') : 'Stopped: ' + p.abortReason;
    }
    else if (p.complete && p.complete > p.abort && p.complete - p.start >= minTurn && !(seen[p.id] >= p.complete)) {
      state = 'ready'; since = p.complete; detail = 'Finished after ' + Math.round((p.complete - p.start) / 60000) + 'm';
    }
    const keep = p.last >= bgFrom || state === 'waiting' || state === 'ready' || state === 'failed';
    if (!keep) continue;
    const s = {
      id: 'codex:' + p.id, app: 'codex', cwd: p.cwd,
      project: p.cwd ? path.basename(p.cwd) : 'Codex',
      title: names.get(p.id) || p.firstPrompt.replace(/\s+/g, ' ').slice(0, 140) || 'Codex thread',
      state, since, detail, ask: state === 'waiting' ? p.approvalText : state === 'ready' ? questionOf(p.lastMsg) : '', lastTs: p.last, ended: false, pinned: false
    };
    known.set(s.id, s); out.push(s);
  }
  return out;
}

function limits() {
  if (!latestLimits) return [];
  const out = [];
  for (const k of ['primary', 'secondary']) {
    const w = latestLimits.rl[k]; if (!w) continue;
    const label = w.window_minutes === 300 ? 'Codex 5-hour' : w.window_minutes === 10080 ? 'Codex weekly' : `Codex ${Math.round(w.window_minutes / 60)}h`;
    out.push({ label, pct: w.used_percent, resetsAt: w.resets_at ? w.resets_at * 1000 : null });
  }
  return out;
}

function markSeen(id) {
  seen[id.replace(/^codex:/, '')] = Date.now();
  try { fs.writeFileSync(SEEN, JSON.stringify(seen)); } catch (_) {}
}

function weekThreads(days) {
  loadNames(); const out = [];
  for (const file of files(days)) {
    let st; try { st = fs.statSync(file); } catch (_) { continue; }
    let p = cache.get(file);
    if (!p || p.mtime !== st.mtimeMs || p.size !== st.size) { try { p = parse(file, st); } catch (_) { continue; } cache.set(file, p); }
    if (!p.id || (p.subagent && !names.has(p.id))) continue;
    out.push({ title: names.get(p.id) || p.firstPrompt || 'Codex thread', cwd: p.cwd });
  }
  return out;
}

module.exports = { weekThreads, titles: () => { loadNames(); return [...names.values()]; }, sessions, limits, markSeen, has: id => String(id).startsWith('codex:') };
