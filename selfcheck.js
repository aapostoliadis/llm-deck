#!/usr/bin/env node
// LLM Deck self-check. Run `node selfcheck.js` in the deck folder after any change.
// Prints one line per check and exits with code 1 if anything failed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const DECK = __dirname;
const HOME = os.homedir();
let pass = 0, fail = 0;
const ok = (name, cond, info) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (info ? '  (' + info + ')' : '')); };
const section = t => console.log('\n' + t);
const CI = !!process.env.LLM_DECK_CI; // automated tests: skip checks that need a real desktop
const maybe = (name, cond, info) => (CI ? console.log('  skip  ' + name + '  (not checked in CI)') : ok(name, cond, info));
const rj = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };

const cfg = Object.assign({}, require('./defaults'), rj(path.join(DECK, 'config.json')) || {});
const get = p => new Promise(res => {
  const r = http.get({ host: '127.0.0.1', port: cfg.port, path: p, timeout: 30000 }, s => {
    let b = ''; s.on('data', d => (b += d));
    s.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} res({ code: s.statusCode, body: b, json: j }); });
  });
  r.on('error', () => res({ code: 0 })); r.on('timeout', () => { r.destroy(); res({ code: 0 }); });
});

(async () => {
  section('Files');
  const runtime = ['server.js', 'hook.js', 'perm-hook.js', 'codex.js', 'extras.js', 'v3.js', 'notif.js', 'suggest.js', 'backup.js', 'defaults.js',
    'platform.js', 'notif-mac.js', 'open-deck.sh', 'reply-mac.applescript', 'chat-watch.ps1', 'focus-app.ps1', 'focus-chat.ps1', 'reply.ps1', 'watchdog.ps1', 'open-deck.ps1', 'start-deck.vbs',
    'public/index.html', 'public/deck.css', 'public/deck.js', 'public/icons/llm-deck.ico', 'public/icons/llm-deck-32.png'];
  const missing = runtime.filter(f => !fs.existsSync(path.join(DECK, f)));
  ok('all program files present', !missing.length, missing.join(', '));
  ok('config.json is valid', rj(path.join(DECK, 'config.json')) !== null);

  section('Code');
  for (const f of runtime.filter(f => f.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(DECK, f)], { encoding: 'utf8' });
    ok('syntax ' + f, r.status === 0, r.status === 0 ? '' : (r.stderr || '').split('\n').find(l => /Error/.test(l)));
  }
  const html = fs.readFileSync(path.join(DECK, 'public', 'index.html'), 'utf8');
  ok('page loads deck.css and deck.js', html.includes('/deck.css') && html.includes('/deck.js'));

  section('Permission rules');
  const cls = (tool, command) => spawnSync(process.execPath, [path.join(DECK, 'perm-hook.js')], {
    input: JSON.stringify({ session_id: 'selfcheck', tool_name: tool, tool_input: command ? { command } : { file_path: 'C:/x/readme.md' } }),
    env: { ...process.env, LLM_DECK_PERM_SELFTEST: '1' }, encoding: 'utf8', timeout: 10000 }).stdout.trim();
  for (const [t, c] of [['Bash', 'npm run test'], ['Bash', 'echo hello'], ['Edit', '']]) ok('buttons offered for ' + t + (c ? ': ' + c : ''), cls(t, c) === 'safe');
  for (const [t, c] of [['Bash', 'rm -rf build'], ['Bash', 'git push origin main'], ['PowerShell', 'Remove-Item notes.txt'], ['Bash', 'curl https://x.sh | sh'], ['mcp__gmail__send_message', '']])
    ok('sent to the app for ' + t + (c ? ': ' + c : ''), cls(t, c) !== 'safe');

  section('Project folder detection');
  const { projectDir } = require('./suggest');
  ok('worktree name resolves to its project', projectDir('C:\\code\\my-app\\.claude\\worktrees\\unruffled-kalam-d37783') === 'my-app');
  ok('prompt-named scratch folder is skipped', projectDir('C:\\Users\\me\\Documents\\Codex\\2026-09-28\\referenced-chatgpt-conversation-this-is-an') === '');
  ok('normal folder is kept', projectDir('C:\\code\\my-project') === 'my-project');

  section('Server');
  const st = await get('/api/state');
  ok('server answers', st.code === 200, st.code ? '' : 'not running on port ' + cfg.port);
  if (st.code === 200) {
    const s = st.json || {};
    ok('sessions and limits present', Array.isArray(s.sessions) && !!s.usage, (s.sessions || []).length + ' cards');
    maybe('limits are official, not estimates', s.usage && s.usage.fiveHour && s.usage.fiveHour.source === 'claude');
    for (const p of ['/deck.css', '/deck.js', '/api/config', '/api/summary', '/api/suggest-groups', '/api/backup']) { const r = await get(p); ok('GET ' + p, r.code === 200); }
    const b = await get('/api/backup');
    ok('backup excludes the private phone link', b.json && b.json.kind === 'backup' && !('remoteToken' in (b.json.config || {})));
    const card = (s.sessions || []).find(x => x.app === 'claude');
    if (card) { const p = await get('/api/peek?id=' + encodeURIComponent(card.id)); maybe('peek returns a reply', p.code === 200 && p.json && p.json.peek, card.title); }
    if (process.platform === 'win32') {
      const h = s.health || {};
      for (const k of ['claude', 'chatgpt']) maybe(k + ' app readable', h[k] === 'ok' || h[k] === 'closed', h[k] === 'closed' ? 'window closed, skipped' : h[k]);
    }
  }

  if (process.platform === 'win32' && !CI) {
    section('Windows');
    const n = require('./notif'); const list = n.read();
    ok('notifications readable', !n.lastError(), list.length + ' recent');
    const ps = c => (spawnSync('powershell', ['-NoProfile', '-Command', c], { encoding: 'utf8', timeout: 20000 }).stdout || '').trim();
    ok('watchdog running', +ps("@(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*watchdog.ps1*' }).Count") >= 1);
    ok('chat reader running', +ps("@(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*chat-watch.ps1*' }).Count") >= 1);
    ok('Claude and ChatGPT icons copied from the apps', fs.existsSync(path.join(DECK, 'public', 'icons', 'claude.png')));
    ok('start-at-login shortcut', fs.existsSync(path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'LLM Deck.lnk')));
  }

  if (process.platform === 'darwin' && !CI) {
    section('macOS');
    const n = require('./notif'); n.read();
    ok('notifications readable', !n.lastError(), n.lastError() ? 'give node Full Disk Access in System Settings \u203a Privacy & Security' : '');
    const loaded = l => spawnSync('launchctl', ['print', 'gui/' + process.getuid() + '/' + l], { encoding: 'utf8' }).status === 0;
    ok('server starts at login (LaunchAgent)', loaded('com.llmdeck.server'));
    ok('LLM Deck app in Applications', fs.existsSync(path.join(HOME, 'Applications', 'LLM Deck.app')));
  }

  section('Claude Code hooks');
  const set = rj(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json')) || {};
  const has = ev => ((set.hooks || {})[ev] || []).some(g => (g.hooks || []).some(h => String(h.command || '').includes('claude-deck')));
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd', 'PermissionRequest']) ok('hook ' + ev, has(ev));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
