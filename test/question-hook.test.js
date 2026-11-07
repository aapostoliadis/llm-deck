// The question hook: a tap answers, "Answer in app" and unknown answers hand the question back.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HOOK = path.join(__dirname, '..', 'question-hook.js');
const home = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdeck-q-')); fs.mkdirSync(path.join(h, '.claude-deck'), { recursive: true }); return h; };
const ask = multi => ({ session_id: 's1', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Redis or memory?', multiSelect: !!multi, options: [{ label: 'Redis' }, { label: 'In memory' }] }] } });

function run(h, payload, answer) {
  return new Promise(resolve => {
    const env = { ...process.env, HOME: h, USERPROFILE: h }; delete env.CLAUDE_DECK_POLL;
    const p = spawn(process.execPath, [HOOK], { env });
    let out = ''; p.stdout.on('data', d => (out += d)); p.on('exit', () => resolve(out));
    p.stdin.end(JSON.stringify(payload));
    if (!answer) return;
    const dir = path.join(h, '.claude-deck', 'perms');
    const t = setInterval(() => {
      let f = []; try { f = fs.readdirSync(dir).filter(x => x.endsWith('.req.json')); } catch (_) {}
      if (f.length) { clearInterval(t); fs.writeFileSync(path.join(dir, f[0].replace('.req.json', '.ans.json')), JSON.stringify(answer)); }
    }, 50);
  });
}

test('a tap on an option answers the question', async () => {
  const out = await run(home(), ask(), { decision: 'answer', label: 'Redis' });
  const o = JSON.parse(out).hookSpecificOutput;
  assert.equal(o.permissionDecision, 'allow');
  assert.deepEqual(o.updatedInput.answers, { 'Redis or memory?': 'Redis' });
});

test('"Answer in app" hands the question back to the app', async () => {
  assert.equal(await run(home(), ask(), { decision: 'ask' }), '');
});

test('an answer that is not one of the options is ignored', async () => {
  assert.equal(await run(home(), ask(), { decision: 'answer', label: 'Delete everything' }), '');
});

test('questions with several picks go straight to the app', async () => {
  const h = home();
  assert.equal(await run(h, ask(true)), '');
  assert.equal(fs.existsSync(path.join(h, '.claude-deck', 'perms')), false);
});
