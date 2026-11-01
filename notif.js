// LLM Deck: reads Windows notifications from the Claude, ChatGPT and Codex apps
// (the same ones Windows shows), so chats that finish in the background still reach the deck.
const fs = require('fs');
const os = require('os');
const path = require('path');

let sqlite = null; try { sqlite = require('node:sqlite'); } catch (_) {}
const SRC = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
const TMP = path.join(os.tmpdir(), 'claude-deck-wpn');
const EPOCH = 11644473600000; // Windows FILETIME starts in 1601
let cache = { at: 0, list: [] };

const dec = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&');

function read() {
  if (!sqlite || process.platform !== 'win32' || !fs.existsSync(SRC)) return [];
  if (Date.now() - cache.at < 20000) return cache.list;
  cache.at = Date.now();
  try {
    fs.mkdirSync(TMP, { recursive: true });
    for (const s of ['', '-wal', '-shm']) {
      const dst = path.join(TMP, 'wpn.db' + s);
      try { if (fs.existsSync(SRC + s)) fs.copyFileSync(SRC + s, dst); else fs.rmSync(dst, { force: true }); } catch (_) {}
    }
    const db = new sqlite.DatabaseSync(path.join(TMP, 'wpn.db'), { readOnly: true });
    try {
      const handlers = db.prepare('SELECT RecordId, PrimaryId FROM NotificationHandler').all()
        .map(h => ({ id: h.RecordId, app: /^Claude_[^!]+!Claude$/.test(h.PrimaryId) ? 'claude' : /^OpenAI\.Codex_[^!]+!App$/.test(h.PrimaryId) ? 'codex' : /^OpenAI\.ChatGPT-Desktop_[^!]+!ChatGPT$/.test(h.PrimaryId) ? 'chatgpt' : '' }))
        .filter(h => h.app);
      const since = BigInt(Date.now() - 48 * 3600e3 + EPOCH) * 10000n;
      const out = [];
      for (const h of handlers) {
        const st = db.prepare('SELECT ArrivalTime, Payload FROM Notification WHERE HandlerId = ? AND ArrivalTime > ? ORDER BY ArrivalTime DESC LIMIT 200');
        st.setReadBigInts(true);
        for (const r of st.all(BigInt(h.id), since)) {
          if (!r.Payload) continue;
          const xml = Buffer.from(r.Payload).toString('utf8');
          const texts = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => dec(m[1]).trim());
          if (!texts[0]) continue;
          out.push({ app: h.app, title: texts[0], text: texts[1] || '', at: Number(r.ArrivalTime / 10000n) - EPOCH });
        }
      }
      cache.list = out;
    } finally { db.close(); }
  } catch (e) { cache.err = String((e && e.message) || e); }
  return cache.list;
}

// Turns recent notifications into card states. Runs before dismissals are applied.
function apply(sessions, cfg, extras) {
  const list = read(); if (!list.length) return;
  const latest = new Map();
  for (const n of list) { const k = n.app + '|' + n.title; const p = latest.get(k); if (!p || n.at > p.at) latest.set(k, n); }
  const now = Date.now(), win = (cfg.notifHours || 12) * 3600e3;
  for (const n of latest.values()) {
    if (now - n.at > win) continue;
    const fam = n.app === 'claude' ? ['claude', 'claude-chat'] : ['codex', 'chatgpt'];
    const cards = sessions.filter(s => fam.includes(s.app) && s.title === n.title);
    if (!cards.length) {
      if (n.app !== 'claude') continue;
      const id = 'chat:claude:' + n.title;
      if (extras.chatSeen(id) >= n.at) continue;
      sessions.push({ id, app: 'claude-chat', cwd: id, project: '', title: n.title, state: 'ready', since: n.at, detail: n.text || 'New reply', lastTs: n.at, ended: false, pinned: false, notified: true });
      continue;
    }
    for (const s of cards) {
      if (s.state === 'working' || s.state === 'waiting' || s.state === 'failed') continue;
      if (s.app === 'claude' || s.app === 'codex') {
        if (s.state === 'ready' && n.text && Math.abs((s.since || 0) - n.at) < 15 * 60e3) s.summary = n.text;
        continue;
      }
      if (s.state === 'idle' && n.at > (s.since || 0) && extras.chatSeen(s.id) < n.at) { s.state = 'ready'; s.since = n.at; s.detail = n.text || 'New reply'; s.notified = true; }
      else if (s.state === 'ready' && n.text && !s.summary) s.summary = n.text;
    }
  }
}

module.exports = { read, apply, lastError: () => cache.err || '' };
