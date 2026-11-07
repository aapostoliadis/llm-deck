#!/usr/bin/env node
// LLM Deck permission hook (PermissionRequest).
// Safe requests are posted to the deck and wait for Allow/Deny from the touch screen.
// Risky requests, or no answer in time, fall through to the normal prompt in Claude.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DECK = path.join(os.homedir(), '.claude-deck');
const DIR = path.join(DECK, 'perms');
const RISKY = /(\brm\b|\brmdir\b|\bdel\b|\berase\b|Remove-Item|\brd\b|\bformat\b|\bmkfs|\bdd\b|\bshred\b|\btruncate\b|\bdrop\s+(table|database)|git\s+push|git\s+reset\s+--hard|git\s+clean|git\s+branch\s+-D|--force|\bnpm\s+publish|\bsudo\b|chmod\s+-R|\bchown\b|curl[^|\n]*\|\s*(sh|bash)|iwr[^|\n]*\|\s*iex|Invoke-Expression|\bshutdown\b|Stop-Computer|reg\s+delete|Set-ExecutionPolicy|Clear-RecycleBin)/i;

function out(decision) {
  if (decision === 'allow' || decision === 'deny') {
    const d = decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied from LLM Deck' };
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: d } }));
  }
  process.exit(0);
}

if (process.env.CLAUDE_DECK_POLL) out();
let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', main);

function main() {
  let p; try { p = JSON.parse(raw || '{}'); } catch (_) { return out(); }
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(DECK, 'config.json'), 'utf8')); } catch (_) {}
  if (cfg.deckPermissions === false || !p.session_id) return out();

  const tool = String(p.tool_name || '');
  if (tool === 'AskUserQuestion') return out(); // questions are handled by question-hook.js
  const inp = p.tool_input || {};
  const cmd = String(inp.command || '');
  let summary = cmd || (inp.file_path && path.basename(String(inp.file_path))) || inp.url || inp.path || inp.pattern || Object.keys(inp).slice(0, 3).join(', ');
  summary = String(summary || '').replace(/\s+/g, ' ').slice(0, 160);
  const risky = RISKY.test(cmd) || /delete|remove|trash|send|publish|deploy|purchase|pay|transfer|share/i.test(tool);
  if (process.env.LLM_DECK_PERM_SELFTEST) { process.stdout.write(risky ? 'risky' : 'safe'); process.exit(0); }
  if (risky) return out();
  try { if (require('./desk.js').atDesk(cfg)) return out(); } catch (_) {} // at your computer: the app asks you directly

  fs.mkdirSync(DIR, { recursive: true });
  const id = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const wait = cfg.permWaitSeconds || 300;
  const req = path.join(DIR, id + '.req.json');
  const ans = path.join(DIR, id + '.ans.json');
  fs.writeFileSync(req, JSON.stringify({ id, sid: p.session_id, tool, summary, cwd: p.cwd || '', t: Date.now(), wait }));
  const cleanup = () => { for (const f of [req, ans]) { try { fs.unlinkSync(f); } catch (_) {} } };
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  const start = Date.now();
  const tick = setInterval(() => {
    let a = null; try { a = JSON.parse(fs.readFileSync(ans, 'utf8')); } catch (_) {}
    if (a) { clearInterval(tick); cleanup(); return out(a.decision); }
    if (Date.now() - start > wait * 1000) { clearInterval(tick); cleanup(); return out(); }
  }, 300);
}
