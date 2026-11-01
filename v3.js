// LLM Deck v3: settings API, peek, phone access with a private link, page version.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = os.homedir();
const DECK = __dirname;
const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const CX = path.join(HOME, '.codex', 'sessions');

// ---------- settings ----------
const bool = v => typeof v === 'boolean';
const EDITABLE = {
  quietHours: v => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v),
  alertSound: bool, deckPermissions: bool, autoTheme: bool, dimAtNight: bool, pixelShift: bool, remoteAccess: bool,
  permWaitSeconds: v => Number.isInteger(v) && v >= 30 && v <= 3600,
  olderHours: v => typeof v === 'number' && v >= 0.5 && v <= 72,
  chatRecents: v => Number.isInteger(v) && v >= 0 && v <= 50,
  dimAfterMinutes: v => Number.isInteger(v) && v >= 1 && v <= 240,
  staleMinutes: v => Number.isInteger(v) && v >= 5 && v <= 240,
  quickReplies: v => Array.isArray(v) && v.length <= 6 && v.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 80),
  groups: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 30 &&
    Object.entries(v).every(([k, a]) => k.length > 0 && k.length <= 40 && Array.isArray(a) && a.length <= 20 && a.every(s => typeof s === 'string' && s.length > 0 && s.length <= 60))
};
function publicConfig(cfg) { const o = {}; for (const k of Object.keys(EDITABLE)) o[k] = cfg[k]; return o; }
function syncHookTimeout(wait) {
  const S = path.join(HOME, '.claude', 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(S, 'utf8')); let n = 0;
    for (const g of (s.hooks && s.hooks.PermissionRequest) || []) for (const h of g.hooks || []) if (String(h.command || '').includes('claude-deck')) { h.timeout = wait + 30; n++; }
    if (n) { fs.copyFileSync(S, S + '.before-deck-settings.bak'); fs.writeFileSync(S, JSON.stringify(s, null, 2)); }
  } catch (_) {}
}
function saveConfig(cfgFile, cfg, patch) {
  patch = patch || {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE[k]) continue;
    if (!EDITABLE[k](v)) throw new Error('That value for ' + k + ' isn\u2019t valid');
    cfg[k] = v;
  }
  fs.copyFileSync(cfgFile, cfgFile + '.bak');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  if ('permWaitSeconds' in patch) syncHookTimeout(cfg.permWaitSeconds);
  return publicConfig(cfg);
}

// ---------- peek: last reply of a Claude Code session or Codex thread ----------
function tailLines(file, bytes = 600 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, len = Math.min(bytes, size), b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, size - len);
    const lines = b.toString('utf8').split('\n'); if (len < size) lines.shift();
    return lines;
  } finally { fs.closeSync(fd); }
}
function claudeFile(id) {
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch (_) { return null; }
  for (const d of dirs) { const f = path.join(PROJECTS, d, id + '.jsonl'); if (fs.existsSync(f)) return f; }
  return null;
}
function codexFile(id) {
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 864e5);
    const dir = path.join(CX, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let list = []; try { list = fs.readdirSync(dir); } catch (_) { continue; }
    const f = list.find(x => x.endsWith(id + '.jsonl')); if (f) return path.join(dir, f);
  }
  return null;
}
function peek(id) {
  id = String(id || '');
  const cut = t => t.length > 6000 ? t.slice(0, 6000) + '\n\u2026' : t;
  if (id.startsWith('codex:')) {
    const tid = id.slice(6); if (!/^[\w-]+$/.test(tid)) return null;
    const f = codexFile(tid); if (!f) return null;
    const lines = tailLines(f);
    for (let i = lines.length - 1; i >= 0; i--) {
      let j; try { j = JSON.parse(lines[i]); } catch (_) { continue; }
      const p = j.payload || {};
      if (p.type === 'agent_message' && p.message) return { text: cut(String(p.message)), at: Date.parse(j.timestamp) };
      if (j.type === 'response_item' && p.type === 'message' && p.role === 'assistant') {
        const t = (p.content || []).map(c => c.text || '').join('\n').trim(); if (t) return { text: cut(t), at: Date.parse(j.timestamp) };
      }
    }
    return null;
  }
  if (!/^[\w-]+$/.test(id)) return null;
  const f = claudeFile(id); if (!f) return null;
  const lines = tailLines(f);
  for (let i = lines.length - 1; i >= 0; i--) {
    let j; try { j = JSON.parse(lines[i]); } catch (_) { continue; }
    if (j.type !== 'assistant' || !j.message) continue;
    const c = j.message.content;
    const t = Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n').trim() : String(c || '').trim();
    if (t) return { text: cut(t), at: Date.parse(j.timestamp) };
  }
  return null;
}

// ---------- phone access ----------
function isLocal(req) { const a = (req.socket && req.socket.remoteAddress) || ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'; }
function token(cfg, cfgFile) {
  if (!cfg.remoteToken) { cfg.remoteToken = crypto.randomBytes(18).toString('base64url'); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)); }
  return cfg.remoteToken;
}
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function authorize(req, res, cfg, cfgFile) {
  if (isLocal(req)) return true;
  if (!cfg.remoteAccess) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Phone access is off'); return false; }
  const t = token(cfg, cfgFile);
  const k = new URL(req.url, 'http://x').searchParams.get('k');
  const ck = ((req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('deck_k=')) || '').slice(7);
  if (k && same(k, t)) { res.setHeader('Set-Cookie', 'deck_k=' + encodeURIComponent(t) + '; HttpOnly; SameSite=Strict; Max-Age=31536000; Path=/'); return true; }
  if (ck && same(decodeURIComponent(ck), t)) return true;
  res.writeHead(401, { 'Content-Type': 'text/plain' }); res.end('Open the deck with its private link');
  return false;
}
function phoneUrl(cfg, cfgFile, port) {
  const ips = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|VirtualBox|VMware|Loopback|Hyper-V/i.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  const ip = ips.find(x => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x)) || ips[0];
  return ip ? 'http://' + ip + ':' + port + '/?k=' + token(cfg, cfgFile) : null;
}

function version() { let v = 0; for (const f of ['index.html', 'deck.css', 'deck.js']) { try { v = Math.max(v, fs.statSync(path.join(DECK, 'public', f)).mtimeMs); } catch (_) {} } return v; }

module.exports = { publicConfig, saveConfig, peek, isLocal, authorize, phoneUrl, version };
