// LLM Deck extras: permissions, dismissals, project groups, saved timestamps, app health, cached limits.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = path.join(os.homedir(), '.claude-deck');
const PERMS = path.join(DATA, 'perms');
fs.mkdirSync(PERMS, { recursive: true });
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const wj = (f, o) => { try { fs.writeFileSync(f, JSON.stringify(o)); } catch (_) {} };

// 6. chat state times survive restarts
const MEMF = path.join(DATA, 'chat-mem.json');
const chatMem = new Map(Object.entries(rj(MEMF, {})));
setInterval(() => {
  const o = {}, cutoff = Date.now() - 7 * 864e5;
  for (const [k, v] of chatMem) if (v && v.since > cutoff) o[k] = v;
  wj(MEMF, o);
}, 15000);

// 2. dismissed chat results (hidden until the unread count changes)
const DISF = path.join(DATA, 'dismissed.json');
const dismissed = rj(DISF, {});
function dismiss(id, detail) { dismissed[id] = detail || ''; wj(DISF, dismissed); }

// 8. last official limits, so a restart doesn't flash estimates
const LIMF = path.join(DATA, 'limits.json');
function loadOfficial() {
  const o = rj(LIMF, null); if (!o) return null;
  const now = Date.now();
  for (const k of ['s', 'w']) if (o[k] && o[k].resetsAt && o[k].resetsAt < now) { /* kept as last read; the server marks it expired */ }
  return o;
}
function saveOfficial(o) { wj(LIMF, o); }

// 1. permission requests waiting for Allow/Deny
function dropPerm(id) { for (const x of ['.req.json', '.ans.json']) { try { fs.unlinkSync(path.join(PERMS, id + x)); } catch (_) {} } }
function perms() {
  const now = Date.now(), out = [];
  let files = []; try { files = fs.readdirSync(PERMS); } catch (_) {}
  for (const f of files) {
    if (!f.endsWith('.req.json')) continue;
    const p = rj(path.join(PERMS, f), null);
    if (!p || now - p.t > (p.wait || 300) * 1000 + 5000) { // past its waiting time: clear it away
      if (!p || now - (p.t || 0) > (p.wait || 300) * 1000 + 60e3) dropPerm(f.replace('.req.json', ''));
      continue;
    }
    if (fs.existsSync(path.join(PERMS, p.id + '.ans.json'))) continue;
    out.push(p);
  }
  return out;
}
function answer(req, decision, label) {
  if (!/^[\w-]+$/.test(String(req)) || !['allow', 'deny', 'ask', 'answer'].includes(decision)) throw new Error('bad request');
  if (decision === 'answer') { // only one of the options the agent offered
    const r = rj(path.join(PERMS, req + '.req.json'), null);
    if (!r || !Array.isArray(r.options) || !r.options.includes(label)) throw new Error('bad answer');
  }
  wj(path.join(PERMS, req + '.ans.json'), decision === 'answer' ? { decision, label, t: Date.now() } : { decision, t: Date.now() });
}
function releasePerms(sid) { for (const p of perms()) if (p.sid === sid) answer(p.id, 'ask'); }

// 5. project groups across apps
let groupCache = { src: null, list: [] };
function groupsFrom(cfg) {
  const src = JSON.stringify(cfg.groups || {});
  if (groupCache.src !== src) {
    groupCache = { src, list: Object.entries(cfg.groups || {}).map(([name, keys]) => ({ name, res: keys.map(k => { try { return new RegExp(k, 'i'); } catch (_) { return null; } }).filter(Boolean) })) };
  }
  return groupCache.list;
}
function groupOf(s, cfg) {
  const text = [s.title, s.cwd, s.project].filter(Boolean).join(' ');
  for (const g of groupsFrom(cfg)) if (g.res.some(r => r.test(text))) return g.name;
  return '';
}

function decorate(sessions, cfg) {
  const pend = perms();
  for (const s of sessions) {
    s.group = groupOf(s, cfg);
    if ((s.state === 'ready' || s.state === 'failed') && Object.prototype.hasOwnProperty.call(dismissed, s.id) && dismissed[s.id] === ((s.app === 'claude-chat' || s.app === 'chatgpt') ? (s.detail || '') : String(s.since))) s.state = 'idle';
    let p = pend.find(x => x.sid === s.id);
    // the session moved on after the request (the tool ran, or it was denied): it was settled in the app
    if (p && s.state !== 'waiting' && s.lastTs && s.lastTs > p.t + 2000) { dropPerm(p.id); p = null; }
    if (p) { s.state = 'waiting'; s.since = p.t; s.perm = { id: p.id, tool: p.tool, summary: p.summary, kind: p.kind || 'perm', question: p.question, options: p.options }; s.detail = p.kind === 'question' ? 'Has a question for you' : p.tool + ': ' + p.summary; }
  }
}

// 7. can the deck read the desktop apps right now?
const missSince = {};
function health(cfg) {
  if (process.platform !== 'win32' || (cfg && cfg.desktopChats === false)) return {}; // chat reading switched off on purpose
  const j = rj(path.join(DATA, 'apps.json'), null);
  const fresh = j && Date.now() - (j.at || 0) < 60e3;
  const h = {};
  for (const k of ['claude', 'chatgpt']) {
    let st = !fresh ? 'stopped' : (j[k] && j[k].open ? 'ok' : (j[k] && j[k].error ? 'error' : 'closed'));
    if (st === 'ok') {
      const n = Array.isArray(j[k].chats) ? j[k].chats.length : (j[k].chats ? 1 : 0);
      const bad = !n ? 'nosidebar' : (j[k].composer === false ? 'nocomposer' : '');
      if (bad) { if (!missSince[k + bad]) missSince[k + bad] = Date.now(); if (Date.now() - missSince[k + bad] > 2 * 60e3) st = bad; }
      else { delete missSince[k + 'nosidebar']; delete missSince[k + 'nocomposer']; }
    }
    h[k] = st;
  }
  return h;
}

// hidden cards
const HIDF = path.join(DATA, 'hidden.json');
const hidden = new Set(rj(HIDF, []));
function hide(id) { if (id) { hidden.add(id); wj(HIDF, [...hidden]); } }
function unhideAll() { hidden.clear(); wj(HIDF, []); }
function hiddenCount() { return hidden.size; }
function dropHidden(sessions) { for (let i = sessions.length - 1; i >= 0; i--) if (hidden.has(sessions[i].id)) sessions.splice(i, 1); }

// chats seen open in the app (so an old notification doesn't flag them again)
const SEENF = path.join(DATA, 'seen-chats.json');
const seenChats = new Map(Object.entries(rj(SEENF, {})));
let seenDirty = false;
function markChatSeen(id) { seenChats.set(id, Date.now()); seenDirty = true; }
function chatSeen(id) { return seenChats.get(id) || 0; }
setInterval(() => { if (seenDirty) { seenDirty = false; const o = {}, cut = Date.now() - 3 * 864e5; for (const [k, v] of seenChats) if (v > cut) o[k] = v; wj(SEENF, o); } }, 15000);

// limit history for the weekly summary
const HISTF = path.join(DATA, 'limits-history.json');
let hist = rj(HISTF, []);
function recordLimits(o) {
  if (!o) return;
  hist.push({ at: o.at || Date.now(), s: o.s ? { pct: o.s.pct, resetsAt: o.s.resetsAt } : null, w: o.w ? { pct: o.w.pct } : null });
  const cut = Date.now() - 30 * 864e5; hist = hist.filter(h => h.at > cut); wj(HISTF, hist);
}
function limitHistory(from) {
  const h = hist.filter(x => x.at >= from);
  const fives = new Set(h.filter(x => x.s && x.s.pct >= 100).map(x => x.s.resetsAt || x.at));
  const peak = h.reduce((m, x) => (x.w && x.w.pct > m ? x.w.pct : m), -1);
  return { since: hist.length ? hist[0].at : null, weekPeak: peak >= 0 ? peak : null, fiveHits: fives.size };
}

module.exports = { chatMem, dismiss, loadOfficial, saveOfficial, perms, answer, releasePerms, decorate, health, groupOf, hide, unhideAll, hiddenCount, dropHidden, markChatSeen, chatSeen, recordLimits, limitHistory };
