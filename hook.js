#!/usr/bin/env node
// Claude Deck hook. Claude Code calls this on session events and pipes a JSON
// payload on stdin. We append one line to ~/.claude-deck/events.jsonl and exit.
// It must never block or fail a session, so every error is swallowed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DIR = path.join(os.homedir(), '.claude-deck');
if (process.env.CLAUDE_DECK_POLL) process.exit(0); // the deck's own /usage polling
let raw = '';
const done = () => { try { record(); } catch (_) {} process.exit(0); };
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', done);
process.stdin.on('error', done);
setTimeout(done, 1500);

let written = false;
function record() {
  if (written) return; written = true;
  const p = JSON.parse(raw || '{}');
  if (!p.session_id) return;
  const term = {
    program: process.env.TERM_PROGRAM || '',
    iterm: process.env.ITERM_SESSION_ID || '',
    tmuxPane: process.env.TMUX ? (process.env.TMUX_PANE || '') : '',
    wt: process.env.WT_SESSION || '',
    tty: ''
  };
  if (process.platform !== 'win32') {
    try { term.tty = execSync(`ps -o tty= -p ${process.ppid}`, { timeout: 400 }).toString().trim().replace(/^[?]+$/, ''); } catch (_) {}
  }
  const line = {
    t: Date.now(),
    e: p.hook_event_name,
    sid: p.session_id,
    cwd: p.cwd || '',
    tp: p.transcript_path || '',
    msg: p.message || '',
    ntype: p.notification_type || '',
    tool: p.tool_name || '',
    prompt: typeof p.prompt === 'string' ? p.prompt.slice(0, 140) : '',
    term
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(path.join(DIR, 'events.jsonl'), JSON.stringify(line) + '\n');
}
