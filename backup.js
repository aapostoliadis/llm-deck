// LLM Deck backups: one file with your settings, pins, hidden cards and dismissals.
// The private phone link token is never included. A rolling daily backup is kept per weekday.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = path.join(os.homedir(), '.claude-deck');
const DIR = path.join(DATA, 'backups');
const FILES = { pins: 'pins.json', hidden: 'hidden.json', dismissed: 'dismissed.json', ignored: 'ignored.json' };
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };

function make(cfg) {
  const config = { ...cfg }; delete config.remoteToken;
  const o = { app: 'LLM Deck', kind: 'backup', version: 1, createdAt: new Date().toISOString(), config };
  for (const [k, f] of Object.entries(FILES)) o[k] = rj(path.join(DATA, f), null);
  return o;
}

function restore(b, cfgFile) {
  if (!b || b.app !== 'LLM Deck' || b.kind !== 'backup' || !b.config || typeof b.config !== 'object') throw new Error('That file isn\u2019t an LLM Deck backup');
  const cur = rj(cfgFile, {});
  const next = { ...b.config };
  if (cur.remoteToken) next.remoteToken = cur.remoteToken;
  fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(cfgFile, path.join(DIR, 'before-restore-config.json'));
  fs.writeFileSync(cfgFile, JSON.stringify(next, null, 2));
  for (const [k, f] of Object.entries(FILES)) if (b[k] != null) fs.writeFileSync(path.join(DATA, f), JSON.stringify(b[k]));
}

function autoDaily(cfg) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
    const f = path.join(DIR, 'backup-' + day + '.json');
    let st = null; try { st = fs.statSync(f); } catch (_) {}
    if (st && Date.now() - st.mtimeMs < 20 * 3600e3) return;
    fs.writeFileSync(f, JSON.stringify(make(cfg), null, 2));
  } catch (_) {}
}

module.exports = { make, restore, autoDaily };
