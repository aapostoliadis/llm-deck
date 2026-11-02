#!/usr/bin/env node
// LLM Deck server. No dependencies, Node 18+.
// Reads Claude Code transcripts (~/.claude/projects) and hook events
// (~/.claude-deck/events.jsonl), serves the touch dashboard and opens terminals.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { exec, spawn, execSync } = require('child_process');
const codex = require('./codex');
const platform = require('./platform');
const extras = require('./extras');
const v3 = require('./v3');
const notif = require('./notif');
const suggester = require('./suggest');
const backup = require('./backup');
function openUrl(url, proc, pkg) {
  if (process.platform !== 'win32') { platform.openUrl(url); setTimeout(() => platform.focus(url.startsWith('codex:') ? 'codex' : /claude/i.test(proc) ? 'claude' : 'chatgpt'), 1500); return; }
  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', "Start-Process '" + url + "'"], { stdio: 'ignore', windowsHide: true }).unref();
  setTimeout(() => focusApp(proc, pkg), 1500);
}
const DESK = path.join(platform.claudeDataDir(), 'claude-code-sessions');
let deskCache = { at: 0, map: new Map() };
function desktopTitles() {
  if (Date.now() - deskCache.at < 15000) return deskCache.map;
  const map = new Map();
  const walk = d => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!e.name.startsWith('local_') || !e.name.endsWith('.json')) continue;
      try {
        const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(6144); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
        const h = b.toString('utf8', 0, n);
        const cli = (h.match(/"cliSessionId":"([^"]+)"/) || [])[1];
        const tm = h.match(/"title":"((?:[^"\\]|\\.)*)"/);
        if (cli && tm) map.set(cli, JSON.parse('"' + tm[1] + '"'));
      } catch (_) {}
    }
  };
  walk(DESK);
  deskCache = { at: Date.now(), map };
  return map;
}
function focusApp(proc, pkg) {
  if (process.platform !== 'win32') return platform.focus(/claude/i.test(proc) ? 'claude' : 'chatgpt');
  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'focus-app.ps1'), '-Proc', proc, '-Package', pkg], { stdio: 'ignore', windowsHide: true }).unref();
}

const HOME = os.homedir();
const DECK = __dirname;
const DATA = path.join(HOME, '.claude-deck');
const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const EVENTS = path.join(DATA, 'events.jsonl');
const PINS = path.join(DATA, 'pins.json');
const IGNORED = path.join(DATA, 'ignored.json');
fs.mkdirSync(DATA, { recursive: true });

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const cfgFile = fs.existsSync(path.join(DATA, 'config.json')) ? path.join(DATA, 'config.json') : path.join(DECK, 'config.json');
const DEFAULTS = require('./defaults');
let cfg = { ...DEFAULTS, ...readJSON(cfgFile, {}) };
fs.watchFile(cfgFile, { interval: 3000 }, () => { cfg = { ...DEFAULTS, ...readJSON(cfgFile, cfg) }; });

let pins = new Set([...(readJSON(PINS, [])), ...(cfg.pinnedProjects || [])]);
const savePins = () => fs.writeFileSync(PINS, JSON.stringify([...pins], null, 2));
let ignored = new Set(readJSON(IGNORED, []));
const saveIgnored = () => fs.writeFileSync(IGNORED, JSON.stringify([...ignored].slice(-500), null, 2));

// ---------- official limits from Claude Code (/usage) ----------
let official = extras.loadOfficial();
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function parseReset(str) {
  const m = String(str).match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = +m[3] % 12; if (m[5].toLowerCase() === 'pm') h += 12;
  const now = new Date();
  const r = new Date(now.getFullYear(), MONTHS.indexOf(m[1].toLowerCase()), +m[2], h, +(m[4] || 0));
  if (r.getTime() < now.getTime() - 60 * 24 * 3600e3) r.setFullYear(r.getFullYear() + 1);
  return r.getTime();
}
function refreshOfficial() {
  if (cfg.officialLimits === false) return;
  exec('claude -p "/usage" --output-format json --no-session-persistence', { cwd: HOME, timeout: 90000, windowsHide: true, env: { ...process.env, CLAUDE_DECK_POLL: '1' } }, (err, out) => {
    let j; try { j = JSON.parse(out); } catch (_) { return; }
    if (j.session_id) { ignored.add(j.session_id); saveIgnored(); }
    const text = String(j.result || '');
    const s = text.match(/Current session:\s*(\d+)% used[^\n]*?resets ([^\n(]+)/i);
    const w = text.match(/Current week \(all models\):\s*(\d+)% used[^\n]*?resets ([^\n(]+)/i);
    if (s || w) official = { at: Date.now(), s: s && { pct: +s[1], resetsAt: parseReset(s[2]) }, w: w && { pct: +w[1], resetsAt: parseReset(w[2]) } };
  });
}
setTimeout(refreshOfficial, 1000);
setInterval(refreshOfficial, (cfg.officialLimitsMinutes || 15) * 60e3);
let savedOfficial = official;
setInterval(() => { if (official && official !== savedOfficial) { extras.saveOfficial(official); extras.recordLimits(official); savedOfficial = official; } }, 5000);

const H = 3600e3;
const live = new Map();     // session id -> live state from hooks
let evOffset = 0;

// ---------- hook events ----------
function readEvents() {
  let st; try { st = fs.statSync(EVENTS); } catch (_) { return; }
  if (st.size < evOffset) evOffset = 0;
  if (st.size === evOffset) return;
  const fd = fs.openSync(EVENTS, 'r');
  const buf = Buffer.alloc(st.size - evOffset);
  fs.readSync(fd, buf, 0, buf.length, evOffset); fs.closeSync(fd);
  const text = buf.toString('utf8');
  const lastNL = text.lastIndexOf('\n');
  if (lastNL < 0) return;
  evOffset += Buffer.byteLength(text.slice(0, lastNL + 1));
  for (const l of text.slice(0, lastNL).split('\n')) {
    let ev; try { ev = JSON.parse(l); } catch (_) { continue; }
    apply(ev);
  }
}

function apply(ev) {
  const s = live.get(ev.sid) || { id: ev.sid, state: 'idle', since: ev.t, turnStart: 0 };
  s.cwd = ev.cwd || s.cwd; s.tp = ev.tp || s.tp; s.last = ev.t;
  if (ev.term && (ev.term.program || ev.term.tty || ev.term.tmuxPane)) s.term = ev.term;
  const set = (state, detail) => { if (s.state !== state) s.since = ev.t; s.state = state; s.detail = detail || ''; };
  switch (ev.e) {
    case 'SessionStart': s.ended = false; if (s.state !== 'working') set('idle'); break;
    case 'UserPromptSubmit': s.ended = false; s.turnStart = ev.t; if (ev.prompt) s.lastPrompt = ev.prompt; set('working'); break;
    case 'PostToolUse': set('working', ev.tool ? `Used ${ev.tool}` : ''); break;
    case 'Notification': {
      const idleNote = ev.ntype === 'idle_prompt' || /waiting for your input/i.test(ev.msg || '');
      if (idleNote) { if (s.state === 'working') set('waiting', 'Waiting for your input'); }
      else set('waiting', ev.msg || 'Needs your decision');
      break;
    }
    case 'Stop': {
      const turn = s.turnStart ? ev.t - s.turnStart : 0;
      const minTurn = (cfg.readyMinTurnSeconds ?? 30) * 1000;
      s.turnMs = turn;
      if (turn >= minTurn) set('ready', `Finished after ${fmtDur(turn)}`); else set('idle');
      break;
    }
    case 'SessionEnd': s.ended = true; set('idle', 'Closed'); break;
  }
  live.set(ev.sid, s);
}

function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.round(ms / 1000)}s`;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ---------- transcripts ----------
const fileCache = new Map(); // path -> {mtime, size, meta, entries}

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  for (const p of cfg.pricing || []) if (new RegExp(p.match).test(m)) return p;
  return cfg.fallbackPricing || { input: 5, output: 25 };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) { const t = content.find(c => c.type === 'text'); return t ? t.text : ''; }
  return '';
}

function cleanTitle(raw) {
  let t = String(raw || '').trim();
  if (!t || t.startsWith('<') || t.startsWith('Caveat:')) return '';
  if (/^This session is being continued from a previous conversation/i.test(t)) return '';
  if (/^\[Request interrupted/i.test(t)) return '';
  t = t.replace(/^[`'"\s]+/, '').replace(/\s+/g, ' ');
  return t;
}

function parseTranscript(file, st) {
  const meta = { id: path.basename(file, '.jsonl'), cwd: '', title: '', summary: '', lastTs: st.mtimeMs, lastUser: '' };
  const entries = [];
  const seen = new Set();
  let data; try { data = fs.readFileSync(file, 'utf8'); } catch (_) { return { meta, entries }; }
  for (const line of data.split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch (_) { continue; }
    if (r.type === 'summary' && r.summary) meta.summary = r.summary;
    if (r.cwd && !meta.cwd) meta.cwd = r.cwd;
    if (r.type === 'user' && !r.isMeta && r.message) { const ut = textOf(r.message.content); if (ut && !ut.startsWith('<')) meta.lastErr = ''; }
    if (r.type === 'assistant' && r.message) {
      if (r.isApiErrorMessage) { meta.lastErr = String(textOf(r.message.content) || 'API error').replace(/\s+/g, ' ').slice(0, 90); meta.lastErrTs = Date.parse(r.timestamp) || 0; }
      else meta.lastErr = '';
    }
    if (r.type === 'user' && r.message && !r.isMeta) {
      const t = cleanTitle(textOf(r.message.content));
      if (t) { if (!meta.title) meta.title = t; meta.lastUser = t; }
    }
    const u = r.message && r.message.usage;
    if (r.type === 'assistant' && u && r.timestamp) {
      const key = `${r.message.id || ''}:${r.requestId || ''}`;
      if (key !== ':' && seen.has(key)) continue;
      seen.add(key);
      const p = priceFor(r.message.model);
      const cost = ((u.input_tokens || 0) * p.input + (u.output_tokens || 0) * p.output
        + (u.cache_creation_input_tokens || 0) * p.input * 1.25 + (u.cache_read_input_tokens || 0) * p.input * 0.1) / 1e6;
      entries.push({ ts: Date.parse(r.timestamp), cost });
    }
  }
  return { meta, entries };
}

function scanTranscripts() {
  const out = [];
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch (_) { return out; }
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const horizon = Math.min(monthStart.getTime(), Date.now() - 8 * 24 * H);
  for (const d of dirs) {
    const full = path.join(PROJECTS, d);
    let files = []; try { files = fs.readdirSync(full).filter(f => f.endsWith('.jsonl')); } catch (_) { continue; }
    for (const f of files) {
      const file = path.join(full, f);
      let st; try { st = fs.statSync(file); } catch (_) { continue; }
      if (st.mtimeMs < horizon) continue;
      let c = fileCache.get(file);
      if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) { c = { mtime: st.mtimeMs, size: st.size, ...parseTranscript(file, st) }; fileCache.set(file, c); }
      out.push(c);
    }
  }
  return out;
}

// ---------- usage ----------
function lastWeeklyReset(now) {
  const spec = (cfg.weeklyReset || '').trim(); // e.g. "Thursday 09:00"
  const m = spec.match(/^(\w+)\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dow = days.indexOf(m[1].toLowerCase()); if (dow < 0) return null;
  const d = new Date(now); d.setHours(+m[2], +m[3], 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7));
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

function usage(files) {
  const now = Date.now();
  const all = files.flatMap(f => f.entries).sort((a, b) => a.ts - b.ts);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = all.filter(e => e.ts >= monthStart.getTime()).reduce((s, e) => s + e.cost, 0);

  let blockStart = null;
  for (const e of all) if (blockStart === null || e.ts >= blockStart + 5 * H) { const d = new Date(e.ts); d.setMinutes(0, 0, 0); blockStart = d.getTime(); }
  const blockActive = blockStart !== null && now < blockStart + 5 * H;
  const blockCost = blockActive ? all.filter(e => e.ts >= blockStart).reduce((s, e) => s + e.cost, 0) : 0;

  const wr = lastWeeklyReset(now);
  const weekFrom = wr || now - 7 * 24 * H;
  const weekCost = all.filter(e => e.ts >= weekFrom).reduce((s, e) => s + e.cost, 0);

  const fresh = official && Date.now() - official.at < 24 * 3600e3;
  if (fresh && official.s) { official.s.cost = blockCost; }
  if (fresh && official.w) { official.w.cost = weekCost; }
  if (fresh && (official.s || official.w)) return {
    fiveHour: official.s ? { pct: (official.s.resetsAt && official.s.resetsAt < Date.now()) ? 0 : official.s.pct, resetsAt: official.s.resetsAt, cost: blockCost, source: 'claude' } : { pct: Math.min(100, blockCost / (cfg.fiveHourBudgetUSD || 250) * 100), resetsAt: blockActive ? blockStart + 5 * H : null, cost: blockCost },
    weekly: official.w ? { pct: official.w.pct, resetsAt: official.w.resetsAt, cost: weekCost, source: 'claude' } : { pct: Math.min(100, weekCost / (cfg.weeklyBudgetUSD || 1500) * 100), resetsAt: wr ? wr + 7 * 24 * H : null, cost: weekCost },
    month: { cost: month, label: monthStart.toLocaleString('en', { month: 'long' }) }
  };
  return {
    fiveHour: { pct: Math.min(100, blockCost / (cfg.fiveHourBudgetUSD || 250) * 100), resetsAt: blockActive ? blockStart + 5 * H : null, cost: blockCost },
    weekly: { pct: Math.min(100, weekCost / (cfg.weeklyBudgetUSD || 1500) * 100), resetsAt: wr ? wr + 7 * 24 * H : null, cost: weekCost },
    month: { cost: month, label: monthStart.toLocaleString('en', { month: 'long' }) }
  };
}

// ---------- desktop app chats (Claude, ChatGPT) ----------
const APPS = path.join(DATA, 'apps.json');
function startWatcher() {
  if (process.platform !== 'win32' || cfg.desktopChats === false) return;
  const w = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'chat-watch.ps1'), '-ParentPid', String(process.pid), '-Interval', String(cfg.chatPollSeconds || 4)], { stdio: 'ignore', windowsHide: true });
  w.on('exit', () => setTimeout(startWatcher, 10000));
}
startWatcher();
const chatMem = extras.chatMem;
const LASTAPP = path.join(DATA, 'apps-last.json');
const lastApp = readJSON(LASTAPP, {});
let lastAppSaved = 0;
function chatSessions(codexTitles) {
  const j = readJSON(APPS, null);
  if (!j) return [];
  const now = Date.now();
  const fresh = now - (j.at || 0) < 60e3;
  const out = [];
  for (const [key, tag] of [['claude', 'claude-chat'], ['chatgpt', 'chatgpt']]) {
    let a = j[key];
    const live = fresh && a && a.open;
    if (live) { lastApp[key] = a; if (Date.now() - lastAppSaved > 30000) { lastAppSaved = Date.now(); try { fs.writeFileSync(LASTAPP, JSON.stringify(lastApp)); } catch (_) {} } } else a = lastApp[key];
    if (!a || !a.chats) continue;
    const limit = cfg.chatRecents ?? 8;
    let recent = 0;
    a.chats.forEach((c, i) => {
      if (!c || !c.title) return;
      if (tag === 'chatgpt' && codexTitles.some(t => t === c.title || (c.title.endsWith('…') && t.startsWith(c.title.slice(0, -1))))) return;
      const id = 'chat:' + key + ':' + c.title;
      let state = 'idle', detail = '';
      const isCur = live && a.current && a.current === c.title;
      if (isCur) extras.markChatSeen(id);
      if (isCur && a.waiting) { state = 'waiting'; detail = 'Needs your decision'; }
      else if (isCur && a.generating) state = 'working';
      else if (c.status === 'unread') { state = 'ready'; detail = c.unread ? c.unread + ' new' : 'Unread reply'; }
      else if (/need|wait|input|approv|permission/i.test(c.status || '')) { state = 'waiting'; detail = c.status; }
      else if (c.status && !/^idle$/i.test(c.status)) state = 'working';
      const pinned = pins.has(id);
      if (!c.pinned) recent++;
      if (state === 'idle' && !pinned && (c.pinned || recent > limit)) return;
      const m = chatMem.get(id);
      if (!m || m.state !== state) chatMem.set(id, { state, since: now });
      out.push({ id, app: tag, cwd: id, project: '', title: c.title, state, since: chatMem.get(id).since, detail, lastTs: (j.at || now) - i * 60e3, ended: false, pinned });
    });
  }
  return out;
}

// ---------- app versions (for update warnings) and daily backups ----------
const VERF = path.join(DATA, 'versions.json');
let appVersions = readJSON(VERF, {});
function checkVersions() {
  if (process.platform === 'darwin') return platform.macVersions(v => {
    let changed = false;
    for (const [k, ver] of Object.entries(v)) { const cur = appVersions[k]; if (!cur) { appVersions[k] = { version: ver, changedAt: 0 }; changed = true; } else if (cur.version !== ver) { appVersions[k] = { version: ver, previous: cur.version, changedAt: Date.now() }; changed = true; } }
    if (changed) { try { fs.writeFileSync(VERF, JSON.stringify(appVersions, null, 2)); } catch (_) {} }
  });
  if (process.platform !== 'win32') return;
  const p = spawn('powershell', ['-NoProfile', '-Command', "'Claude','OpenAI.ChatGPT-Desktop' | ForEach-Object { Get-AppxPackage -Name $_ } | ForEach-Object { $_.Name + '=' + $_.Version }"], { windowsHide: true });
  let o = ''; p.stdout.on('data', d => (o += d));
  p.on('close', () => {
    let changed = false;
    for (const line of o.split(/\r?\n/)) {
      const m = line.trim().match(/^(Claude|OpenAI\.ChatGPT-Desktop)=(.+)$/); if (!m) continue;
      const k = m[1] === 'Claude' ? 'claude' : 'chatgpt', v = m[2], cur = appVersions[k];
      if (!cur) { appVersions[k] = { version: v, changedAt: 0 }; changed = true; }
      else if (cur.version !== v) { appVersions[k] = { version: v, previous: cur.version, changedAt: Date.now() }; changed = true; }
    }
    if (changed) { try { fs.writeFileSync(VERF, JSON.stringify(appVersions, null, 2)); } catch (_) {} }
  });
}
setTimeout(checkVersions, 5000); setInterval(checkVersions, 3600e3);
setTimeout(() => backup.autoDaily(cfg), 15000); setInterval(() => backup.autoDaily(cfg), 3600e3);

// ---------- state ----------
let cache = { at: 0, files: [], usage: null };
function state() {
  readEvents();
  const now = Date.now();
  if (now - cache.at > 5000) { cache.files = scanTranscripts(); cache.at = now; cache.usage = usage(cache.files); }
  const byId = new Map(cache.files.map(f => [f.meta.id, f]));
  const ids = new Set([...live.keys()]);
  const bgFrom = now - (cfg.backgroundHours || 24) * H;
  for (const f of cache.files) if (f.meta.lastTs >= bgFrom) ids.add(f.meta.id);

  const dt = desktopTitles();
  const sessions = [];
  for (const id of ids) {
    if (ignored.has(id)) continue;
    const f = byId.get(id); const l = live.get(id);
    if (f && !l && !f.meta.title && !f.meta.summary && f.entries.length === 0) continue; // empty or command-only transcript
    const lastTs = Math.max(f ? f.meta.lastTs : 0, l ? l.last : 0);
    let st = l ? l.state : 'idle';
    // a session that stopped reporting for a long time while "working" probably crashed
    if (st === 'working' && now - lastTs > 20 * 60e3) st = 'idle';
    const keep = lastTs >= bgFrom || st === 'waiting' || (st === 'ready' && now - lastTs < 3 * 24 * H);
    if (!keep) continue;
    const cwd = (l && l.cwd) || (f && f.meta.cwd) || '';
    sessions.push({
      id, cwd, app: 'claude',
      project: cwd ? path.basename(cwd) : 'unknown project',
      title: dt.get(id) || (f && (f.meta.summary || f.meta.title)) || (l && l.lastPrompt) || 'New session',
      state: st,
      since: l ? l.since : lastTs,
      detail: l ? l.detail : '',
      lastTs, ended: l ? !!l.ended : true,
      pinned: pins.has(cwd)
    });
  }
  try { for (const c of codex.sessions(cfg)) { c.pinned = pins.has(c.cwd); sessions.push(c); } } catch (_) {}
  try { const shown = sessions.filter(x => x.app === 'codex').map(x => x.title); for (const c of chatSessions(shown)) sessions.push(c); } catch (_) {}
  if (cache.usage) { try { cache.usage.extra = codex.limits(); } catch (_) {} }
  for (const s of sessions) {
    if (s.app !== 'claude' || s.state === 'working' || s.state === 'waiting') continue;
    const f = byId.get(s.id);
    if (f && f.meta.lastErr) { s.state = 'failed'; s.detail = f.meta.lastErr; s.since = f.meta.lastErrTs || s.lastTs; }
  }
  for (const s of sessions) if (s.app === 'claude' && (s.state === 'waiting' || s.state === 'ready')) { try { s.ask = v3.askFor(s.id); } catch (_) {} }
  try { notif.apply(sessions, cfg, extras); } catch (_) {}
  extras.decorate(sessions, cfg);
  extras.dropHidden(sessions);
  return { appUpdates: appVersions, health: extras.health(), deck: { quietHours: cfg.quietHours || '22:00-08:00', sound: cfg.alertSound !== false, olderHours: cfg.olderHours || 3, quickReplies: cfg.quickReplies || [], autoTheme: cfg.autoTheme !== false, dimAtNight: cfg.dimAtNight !== false, dimAfterMinutes: cfg.dimAfterMinutes || 10, pixelShift: cfg.pixelShift !== false, staleMinutes: cfg.staleMinutes || 30, version: v3.version() }, sessions, usage: cache.usage, config: { city: cfg.city, latitude: cfg.latitude, longitude: cfg.longitude }, now };
}

// ---------- opening terminals ----------
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
const has = cmd => { try { execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch (_) { return false; } };
const osa = script => new Promise(res => { const p = spawn('osascript', ['-e', script]); let out = ''; p.stdout.on('data', d => out += d); p.on('close', () => res(out.trim())); });

async function openSession(id) {
  try { extras.releasePerms(id); } catch (_) {}
  if (String(id).startsWith('chat:')) {
    if (process.platform !== 'win32') { platform.focus(String(id).split(':')[1] === 'claude' ? 'claude' : 'chatgpt'); return 'app'; }
    const parts = String(id).split(':'); const app = parts[1]; const title = parts.slice(2).join(':');
    if (!['claude', 'chatgpt'].includes(app)) throw new Error('bad app');
    spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'focus-chat.ps1'), '-App', app, '-Title', title], { stdio: 'ignore', windowsHide: true }).unref();
    return 'chat';
  }
  if (codex.has(id)) { codex.markSeen(id); const tid = String(id).slice(6); if (!/^[\w-]+$/.test(tid)) throw new Error('bad id'); openUrl('codex://threads/' + tid, '^ChatGPT$', 'OpenAI.ChatGPT-Desktop'); return 'codex-thread'; }
  if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
  const s = live.get(id) || {};
  const f = cache.files.find(x => x.meta.id === id);
  const cwd = s.cwd || (f && f.meta.cwd) || HOME;
  const t = s.term || {};
  const active = s.state && !s.ended && live.has(id);
  const resume = `claude --resume ${id}`;

  if (s.state === 'ready') { s.state = 'idle'; s.since = Date.now(); s.detail = 'Seen'; }

  if (active && t.tmuxPane && has('tmux')) {
    exec(`tmux switch-client -t ${q(t.tmuxPane)} ; tmux select-window -t ${q(t.tmuxPane)} ; tmux select-pane -t ${q(t.tmuxPane)}`);
    if (process.platform === 'darwin' && t.program) exec(`open -a ${q(t.program === 'iTerm.app' ? 'iTerm' : t.program === 'Apple_Terminal' ? 'Terminal' : t.program)}`);
    return 'tmux';
  }
  if (active && t.program === 'vscode' && has('code')) { exec(`code ${q(cwd)}`); return 'vscode'; }

  if (process.platform === 'darwin' && !(t.iterm || t.tty || t.tmuxPane || t.program)) { openUrl('claude://resume?session=' + id, '^claude$', 'Claude'); return 'claude-session'; }
  if (process.platform === 'darwin') {
    if (active && t.iterm) {
      const guid = t.iterm.split(':').pop();
      const r = await osa(`tell application "iTerm2"
        activate
        repeat with w in windows
          repeat with tb in tabs of w
            repeat with se in sessions of tb
              if unique id of se is "${guid}" then
                select w
                tell tb to select
                tell se to select
                return "ok"
              end if
            end repeat
          end repeat
        end repeat
      end tell`);
      if (r === 'ok') return 'iterm';
    }
    if (active && t.tty) {
      const r = await osa(`tell application "Terminal"
        repeat with w in windows
          repeat with tb in tabs of w
            if tty of tb is "/dev/${t.tty.replace(/[^\w]/g, '')}" then
              set selected of tb to true
              set index of w to 1
              activate
              return "ok"
            end if
          end repeat
        end repeat
      end tell`);
      if (r === 'ok') return 'terminal';
    }
    await osa(`tell application "Terminal"
      activate
      do script "cd ${q(cwd).replace(/"/g, '\\"')} && ${resume}"
    end tell`);
    return 'resumed';
  }

  if (process.platform === 'win32') {
    if (!(t.wt || t.program || t.tmuxPane)) { openUrl('claude://resume?session=' + id, '^claude$', 'Claude'); return 'claude-session'; }
    if (active) {
      spawn('powershell', ['-NoProfile', '-Command', '$p=Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1; if($p){(New-Object -ComObject WScript.Shell).AppActivate($p.Id)}'], { detached: true, stdio: 'ignore' }).unref();
      return 'focused-terminal';
    }
    spawn('wt', ['-w', '0', 'nt', '-d', cwd, 'cmd', '/k', resume], { detached: true, stdio: 'ignore', shell: true }).unref();
    return 'resumed';
  }

  // Linux without tmux
  const term = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'kitty', 'alacritty'].find(has);
  if (term) spawn(term, term === 'gnome-terminal' ? ['--', 'bash', '-c', `cd ${q(cwd)} && ${resume}; exec bash`] : ['-e', 'bash', '-c', `cd ${q(cwd)} && ${resume}; exec bash`], { detached: true, stdio: 'ignore' }).unref();
  return 'resumed';
}

// ---------- weekly summary, new sessions, self-test ----------
function weekly() {
  if (!cache.usage) state();
  const now = Date.now(), from = now - 7 * 864e5, dt = desktopTitles(), rows = new Map(), turns = new Map();
  const row = g => { if (!rows.has(g)) rows.set(g, { project: g, minutes: 0, sessions: 0, turns: 0, codex: 0 }); return rows.get(g); };
  try { for (const l of fs.readFileSync(EVENTS, 'utf8').split('\n')) { if (!l.includes('"Stop"')) continue; try { const e = JSON.parse(l); if (e.e === 'Stop' && e.t >= from) turns.set(e.sid, (turns.get(e.sid) || 0) + 1); } catch (_) {} } } catch (_) {}
  for (const f of cache.files) {
    const ts = f.entries.map(e => e.ts).filter(t => t >= from).sort((a, b) => a - b);
    if (!ts.length) continue;
    let ms = 60e3; for (let i = 1; i < ts.length; i++) { const gap = ts[i] - ts[i - 1]; ms += gap <= 5 * 60e3 ? gap : 60e3; }
    const g = extras.groupOf({ title: dt.get(f.meta.id) || f.meta.summary || f.meta.title, cwd: f.meta.cwd }, cfg) || 'Other';
    const r = row(g); r.minutes += ms / 60e3; r.sessions += 1; r.turns += turns.get(f.meta.id) || 0;
  }
  try { for (const t of codex.weekThreads(7)) row(extras.groupOf(t, cfg) || 'Other').codex += 1; } catch (_) {}
  return { from, rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes || b.codex - a.codex), limits: Object.assign(extras.limitHistory(from), { weekNow: cache.usage && cache.usage.weekly ? cache.usage.weekly.pct : null, weekResetsAt: cache.usage && cache.usage.weekly ? cache.usage.weekly.resetsAt : null, extra: (cache.usage && cache.usage.extra) || [] }) };
}
function newSession(group) {
  if (process.platform !== 'win32') {
    const r = state().sessions.filter(s => s.app === 'claude' && s.group === group && s.cwd).sort((a, b) => b.lastTs - a.lastTs)[0];
    if (r) platform.copy(r.cwd);
    platform.openUrl('claude://code/new?source=desktop_action'); setTimeout(() => platform.focus('claude'), 1500);
    return { ok: true, folder: r ? r.cwd : '' };
  }
  const recent = state().sessions.filter(s => s.app === 'claude' && s.group === group && s.cwd).sort((a, b) => b.lastTs - a.lastTs)[0];
  const folder = recent ? recent.cwd : '';
  const cmd = (folder ? "Set-Clipboard -Value '" + folder.replace(/'/g, "''") + "'; " : '') + "Start-Process 'claude://code/new?source=desktop_action'";
  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', cmd], { stdio: 'ignore', windowsHide: true }).unref();
  setTimeout(() => focusApp('^claude$', 'Claude'), 1500);
  return { ok: true, folder };
}
function selfTestReply() {
  if (process.platform !== 'win32') return Promise.resolve({ ok: true, note: 'typing test runs on Windows only' });
  return new Promise(resolve => {
    let done = false; const finish = r => { if (!done) { done = true; resolve(r); } };
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'reply.ps1'), '-App', 'chatgpt', '-Text', 'LLM Deck self-test', '-DryRun'], { windowsHide: true });
    let o = ''; p.stdout.on('data', d => (o += d));
    p.on('close', c => finish({ ok: c === 0 && /typed ok: True/.test(o), output: c === 1 ? 'ChatGPT has no open window' : c === 2 ? 'message box not found' : c === 3 ? 'ChatGPT didn\u2019t come to the front' : o.trim(), code: c }));
    setTimeout(() => finish({ ok: false, output: 'timed out' }), 25000);
  });
}

// ---------- quick replies ----------
function replyTo(id, text) {
  if (process.platform === 'darwin') {
    if (!(cfg.quickReplies || []).includes(text)) throw new Error('Only the preset replies can be sent');
    if (id.startsWith('chat:')) throw new Error('On macOS, quick replies work for Claude Code and Codex sessions');
    if (codex.has(id)) { const tid = id.slice(6); if (!/^[\w-]+$/.test(tid)) throw new Error('bad id'); codex.markSeen(id); platform.macType('codex://threads/' + tid, 'Codex', text); return 'codex'; }
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    const mt = (live.get(id) || {}).term || {};
    if (mt.iterm || mt.tty || mt.tmuxPane) throw new Error('Quick replies work for sessions in the Claude app');
    platform.macType('claude://resume?session=' + id, 'Claude', text); return 'claude-code';
  }
  if (process.platform !== 'win32') throw new Error('Quick replies work on Windows and macOS');
  if (!(cfg.quickReplies || []).includes(text)) throw new Error('Only the preset replies can be sent');
  const ps = args => spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'reply.ps1'), ...args], { stdio: 'ignore', windowsHide: true }).unref();
  const link = url => spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', "Start-Process '" + url + "'"], { stdio: 'ignore', windowsHide: true }).unref();
  if (id.startsWith('chat:')) {
    const parts = id.split(':'), app = parts[1];
    if (!['claude', 'chatgpt'].includes(app)) throw new Error('bad app');
    ps(['-App', app, '-Title', parts.slice(2).join(':'), '-Text', text]); return 'chat';
  }
  if (codex.has(id)) {
    const tid = id.slice(6); if (!/^[\w-]+$/.test(tid)) throw new Error('bad id');
    codex.markSeen(id); link('codex://threads/' + tid); ps(['-App', 'chatgpt', '-WaitMs', '3500', '-Text', text]); return 'codex';
  }
  if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
  const t = (live.get(id) || {}).term || {};
  if (t.wt || t.program || t.tmuxPane) throw new Error('Quick replies work for sessions in the Claude app');
  const l = live.get(id); if (l && l.state === 'ready') { l.state = 'idle'; l.since = Date.now(); }
  link('claude://resume?session=' + id); ps(['-App', 'claude', '-WaitMs', '3500', '-Text', text]); return 'claude-code';
}

// ---------- http ----------
const body = req => new Promise(res => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (_) { res({}); } }); });
const send = (res, code, obj, type = 'application/json') => { if (res.headersSent) { try { res.end(); } catch (_) {} return; } res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };

http.createServer(async (req, res) => {
  try {
    if (!v3.authorize(req, res, cfg, cfgFile)) return;
    if (req.method === 'GET' && req.url === '/api/state') return send(res, 200, state());
    if (req.method === 'POST' && req.url === '/api/open') { const { id } = await body(req); return send(res, 200, { ok: true, via: await openSession(id) }); }
    if (req.method === 'GET' && req.url === '/api/config') return send(res, 200, { hiddenCount: extras.hiddenCount(), config: v3.publicConfig(cfg), phone: v3.isLocal(req) && cfg.remoteAccess ? v3.phoneUrl(cfg, cfgFile, cfg.port || 7777) : null });
    if (req.method === 'POST' && req.url === '/api/config') {
      const b = await body(req); const was = !!cfg.remoteAccess;
      const out = v3.saveConfig(cfgFile, cfg, b); const restarting = !!cfg.remoteAccess !== was;
      if (restarting) setTimeout(() => process.exit(0), 700);
      return send(res, 200, { ok: true, config: out, restarting });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/peek?')) return send(res, 200, { peek: v3.peek(new URL(req.url, 'http://x').searchParams.get('id')) });
    if (req.method === 'POST' && req.url === '/api/reply') { const b = await body(req); return send(res, 200, { ok: true, via: replyTo(String(b.id || ''), String(b.text || '')) }); }
    if (req.method === 'GET' && req.url === '/api/suggest-groups') {
      const dt = desktopTitles(), items = [];
      for (const f of cache.files) items.push({ title: dt.get(f.meta.id) || f.meta.summary || f.meta.title || '', cwd: f.meta.cwd || '' });
      try { for (const t of codex.weekThreads(30)) items.push(t); } catch (_) {}
      for (const k of ['claude', 'chatgpt']) for (const c of ((lastApp[k] || {}).chats || [])) items.push({ title: c.title, cwd: '' });
      return send(res, 200, { suggestions: suggester.suggest(items, i => !!extras.groupOf(i, cfg), path.basename(HOME).toLowerCase()) });
    }
    if (req.method === 'GET' && req.url === '/api/backup') return send(res, 200, backup.make(cfg));
    if (req.method === 'POST' && req.url === '/api/restore') { const b = await body(req); backup.restore(b, cfgFile); setTimeout(() => process.exit(0), 700); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && req.url === '/api/hide') { const b = await body(req); extras.hide(String(b.id || '')); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && req.url === '/api/unhide-all') { extras.unhideAll(); return send(res, 200, { ok: true }); }
    if (req.method === 'GET' && req.url === '/api/summary') return send(res, 200, weekly());
    if (req.method === 'POST' && req.url === '/api/new') { const b = await body(req); return send(res, 200, newSession(String(b.group || ''))); }
    if (req.method === 'POST' && req.url === '/api/selftest/reply') return send(res, 200, await selfTestReply());
    if (req.method === 'POST' && req.url === '/api/dismiss') {
      const { id, key } = await body(req);
      if (id) { extras.dismiss(String(id), String(key ?? '')); if (codex.has(id)) codex.markSeen(id); }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/perm') {
      const b = await body(req);
      extras.answer(b.req, b.decision);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/pin') {
      const { cwd } = await body(req);
      if (cwd) { pins.has(cwd) ? pins.delete(cwd) : pins.add(cwd); savePins(); }
      return send(res, 200, { ok: true, pinned: pins.has(cwd) });
    }
    if (req.method === 'GET' && (req.url.startsWith('/deck.css') || req.url.startsWith('/deck.js'))) {
      const f = req.url.startsWith('/deck.css') ? 'deck.css' : 'deck.js';
      res.writeHead(200, { 'Content-Type': (f.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(DECK, 'public', f)));
    }
    if (req.method === 'GET' && req.url.startsWith('/icons/')) {
      const name = path.basename(req.url.split('?')[0]);
      if (!/^[\w-]+\.png$/.test(name)) return send(res, 404, { error: 'not found' });
      try { const img = fs.readFileSync(path.join(DECK, 'public', 'icons', name)); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }); return res.end(img); }
      catch (_) { return send(res, 404, { error: 'not found' }); }
    }
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) return send(res, 200, fs.readFileSync(path.join(DECK, 'public', 'index.html')), 'text/html; charset=utf-8');
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(cfg.port || 7777, cfg.remoteAccess ? '0.0.0.0' : '127.0.0.1', () => console.log(`LLM Deck on http://localhost:${cfg.port || 7777}`));
