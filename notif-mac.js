// LLM Deck: reads macOS Notification Center records for the Claude, ChatGPT and Codex apps.
// The database is protected: the app running the deck (node) needs Full Disk Access.
const fs = require('fs');
const os = require('os');
const path = require('path');

let sqlite = null; try { sqlite = require('node:sqlite'); } catch (_) {}
const DB_DIRS = [path.join(os.homedir(), 'Library', 'Group Containers', 'group.com.apple.usernoted', 'db2')];
const TMP = path.join(os.tmpdir(), 'llm-deck-usernoted');
const MAC_EPOCH = 978307200; // seconds between 1970 and 2001
const cache = { at: 0, list: [], err: '' };

// Minimal binary property list (bplist00) reader: enough for notification records.
function bplist(buf) {
  if (buf.toString('ascii', 0, 8) !== 'bplist00') throw new Error('not a binary plist');
  const t = buf.length - 32;
  const offSize = buf[t + 6], refSize = buf[t + 7];
  const num = Number(buf.readBigUInt64BE(t + 8)), top = Number(buf.readBigUInt64BE(t + 16)), tab = Number(buf.readBigUInt64BE(t + 24));
  const uint = (pos, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + buf[pos + i]; return v; };
  const offsets = []; for (let i = 0; i < num; i++) offsets.push(uint(tab + i * offSize, offSize));
  const seen = new Map();
  const obj = idx => {
    if (seen.has(idx)) return seen.get(idx);
    let p = offsets[idx];
    const m = buf[p], hi = m >> 4, lo = m & 15;
    const len = () => { if (lo !== 15) { p += 1; return lo; } const ib = buf[p + 1], n = 1 << (ib & 15); const v = uint(p + 2, n); p += 2 + n; return v; };
    let v;
    if (hi === 0) v = lo === 8 ? false : lo === 9 ? true : null;
    else if (hi === 1) { const n = 1 << lo; v = uint(p + 1, n); }
    else if (hi === 2) v = lo === 3 ? buf.readDoubleBE(p + 1) : buf.readFloatBE(p + 1);
    else if (hi === 3) v = buf.readDoubleBE(p + 1);
    else if (hi === 4) { const n = len(); v = buf.subarray(p, p + n); }
    else if (hi === 5) { const n = len(); v = buf.toString('latin1', p, p + n); }
    else if (hi === 6) { const n = len(); const s = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) s.writeUInt16LE(buf.readUInt16BE(p + i * 2), i * 2); v = s.toString('utf16le'); }
    else if (hi === 8) v = { uid: uint(p + 1, lo + 1) };
    else if (hi === 10 || hi === 12) { const n = len(); v = []; seen.set(idx, v); for (let i = 0; i < n; i++) v.push(obj(uint(p + i * refSize, refSize))); }
    else if (hi === 13) {
      const n = len(); v = {}; seen.set(idx, v);
      for (let i = 0; i < n; i++) v[obj(uint(p + i * refSize, refSize))] = obj(uint(p + (n + i) * refSize, refSize));
    } else v = null;
    seen.set(idx, v);
    return v;
  };
  return obj(top);
}

// Title and body of one notification record.
function texts(data) {
  try {
    const r = bplist(Buffer.from(data));
    const req = (r && r.req) || {};
    return { title: String(req.titl || req.subt || ''), body: String(req.body || '') };
  } catch (_) { return { title: '', body: '' }; }
}

function appKind(identifier) {
  const s = String(identifier || '').toLowerCase();
  if (s.includes('anthropic') || s.includes('claude')) return 'claude';
  if (s.includes('codex')) return 'codex';
  if (s.includes('openai.chat') || s.includes('chatgpt')) return 'chatgpt';
  return '';
}

function read() {
  if (!sqlite) return [];
  if (Date.now() - cache.at < 30000) return cache.list;
  cache.at = Date.now();
  const dir = DB_DIRS.find(d => fs.existsSync(path.join(d, 'db')));
  if (!dir) { cache.err = 'notification database not found or not readable (give node Full Disk Access)'; return cache.list = []; }
  try {
    fs.mkdirSync(TMP, { recursive: true });
    for (const s of ['', '-wal', '-shm']) {
      const src = path.join(dir, 'db' + s), dst = path.join(TMP, 'db' + s);
      try { if (fs.existsSync(src)) fs.copyFileSync(src, dst); else fs.rmSync(dst, { force: true }); } catch (_) {}
    }
    const db = new sqlite.DatabaseSync(path.join(TMP, 'db'), { readOnly: true });
    try {
      const apps = db.prepare('SELECT app_id, identifier FROM app').all().map(a => ({ id: a.app_id, app: appKind(a.identifier) })).filter(a => a.app);
      const since = Date.now() / 1000 - MAC_EPOCH - 48 * 3600;
      const out = [];
      for (const a of apps) {
        for (const r of db.prepare('SELECT data, delivered_date FROM record WHERE app_id = ? AND delivered_date > ? ORDER BY delivered_date DESC LIMIT 60').all(a.id, since)) {
          if (!r.data) continue;
          const t = texts(r.data); if (!t.title) continue;
          out.push({ app: a.app, title: t.title, text: t.body, at: Math.round((Number(r.delivered_date) + MAC_EPOCH) * 1000) });
        }
      }
      cache.list = out; cache.err = '';
    } finally { db.close(); }
  } catch (e) { cache.err = String((e && e.message) || e); }
  return cache.list;
}

module.exports = { read, lastError: () => cache.err, bplist, texts, appKind };
