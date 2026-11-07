#!/usr/bin/env node
// LLM Deck question hook (PreToolUse, matcher AskUserQuestion).
// Shows an agent's multiple-choice question on the deck. A tap answers it; "Answer in app", or no answer in time,
// hands the question back to the app's own picker. Questions with several parts or several picks go to the app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DECK = path.join(os.homedir(), '.claude-deck');
const DIR = path.join(DECK, 'perms');

function out(answer) {
  if (answer) process.stdout.write(JSON.stringify({ hookSpecificOutput: answer }));
  process.exit(0);
}

if (process.env.CLAUDE_DECK_POLL) out();
let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', main);

function main() {
  let p; try { p = JSON.parse(raw || '{}'); } catch (_) { return out(); }
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(DECK, 'config.json'), 'utf8')); } catch (_) {}
  if (cfg.deckQuestions === false || !p.session_id || p.tool_name !== 'AskUserQuestion') return out();
  const qs = (p.tool_input || {}).questions;
  if (!Array.isArray(qs) || qs.length !== 1) return out();
  const q = qs[0];
  if (!q || !q.question || q.multiSelect || !Array.isArray(q.options) || !q.options.length) return out();
  const options = q.options.map(o => String((o && o.label) || '').slice(0, 80)).filter(Boolean).slice(0, 6);
  if (!options.length) return out();
  try { if (require('./desk.js').atDesk(cfg)) return out(); } catch (_) {} // at your computer: the app asks you directly

  fs.mkdirSync(DIR, { recursive: true });
  const id = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const wait = cfg.questionWaitSeconds || 120;
  const req = path.join(DIR, id + '.req.json');
  const ans = path.join(DIR, id + '.ans.json');
  const question = String(q.question).replace(/\s+/g, ' ').slice(0, 300);
  fs.writeFileSync(req, JSON.stringify({ id, sid: p.session_id, kind: 'question', tool: 'AskUserQuestion', summary: question, question, options, cwd: p.cwd || '', t: Date.now(), wait }));
  const cleanup = () => { for (const f of [req, ans]) { try { fs.unlinkSync(f); } catch (_) {} } };
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  const start = Date.now();
  const tick = setInterval(() => {
    let a = null; try { a = JSON.parse(fs.readFileSync(ans, 'utf8')); } catch (_) {}
    if (a) {
      clearInterval(tick); cleanup();
      if (a.decision === 'answer' && options.includes(a.label)) {
        return out({
          hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Answered on LLM Deck',
          updatedInput: { ...(p.tool_input || {}), questions: qs, answers: { [q.question]: a.label } }
        });
      }
      return out();
    }
    if (Date.now() - start > wait * 1000) { clearInterval(tick); cleanup(); return out(); }
  }, 300);
}
