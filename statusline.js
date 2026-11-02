#!/usr/bin/env node
// LLM Deck status line: Claude Code passes its official usage limits (5-hour and weekly) to status line
// scripts. This records them for the deck, then shows the status line you had before, if any.
// With no previous status line it prints nothing, so your terminal looks the same.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA = path.join(os.homedir(), '.claude-deck');
const FILE = path.join(DATA, 'ratelimits.json');
const toMs = v => { if (v == null) return null; if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; const t = Date.parse(v); return isNaN(t) ? null : t; };
const win = w => (w && typeof w.used_percentage === 'number' ? { pct: w.used_percentage, resetsAt: toMs(w.resets_at) } : null);

let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  try {
    const rl = (JSON.parse(raw || '{}') || {}).rate_limits;
    if (rl && (rl.five_hour || rl.seven_day)) {
      const next = { at: Date.now(), s: win(rl.five_hour), w: win(rl.seven_day), via: 'statusline' };
      let prev = null; try { prev = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
      const same = prev && JSON.stringify([prev.s, prev.w]) === JSON.stringify([next.s, next.w]);
      if (!same || Date.now() - prev.at > 60e3) {          // write when it changes, or once a minute
        fs.mkdirSync(DATA, { recursive: true });
        fs.writeFileSync(FILE + '.tmp', JSON.stringify(next)); fs.renameSync(FILE + '.tmp', FILE);
      }
    }
  } catch (_) {}
  try {
    const orig = JSON.parse(fs.readFileSync(path.join(DATA, 'statusline-original.json'), 'utf8'));
    if (orig && orig.command) {
      const r = spawnSync(orig.command, { shell: true, input: raw, encoding: 'utf8', timeout: 5000, windowsHide: true });
      if (r.stdout) process.stdout.write(r.stdout);
    }
  } catch (_) {}
});
