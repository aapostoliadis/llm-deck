#!/usr/bin/env node
// LLM Deck installer. Safe to run again: your settings and data are kept, program files are updated,
// any new settings are added with their defaults, and the Claude Code hooks are refreshed.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execSync, spawn } = require('child_process');

const HOME = os.homedir();
const SRC = __dirname;
const DECK = path.join(HOME, '.claude-deck');          // internal folder name kept for compatibility
const SETTINGS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json');
const say = m => console.log('  ' + m);
const NOSYS = !!process.env.LLM_DECK_NO_SYSTEM; // automated tests: no shortcuts, login items or start

// node install.js --uninstall: removes what the installer added, keeps your deck folder with its settings and backups
if (process.argv.includes('--uninstall')) {
  const { execFileSync } = require('child_process');
  console.log('Removing LLM Deck from your setup');
  if (fs.existsSync(SETTINGS)) {
    const st = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    fs.copyFileSync(SETTINGS, SETTINGS + '.before-uninstall.bak');
    const ours = h => String(h.command || '').includes('claude-deck');
    let removed = 0;
    for (const ev of Object.keys(st.hooks || {})) {
      const before = (st.hooks[ev] || []).reduce((n, g) => n + (g.hooks || []).filter(ours).length, 0);
      st.hooks[ev] = (st.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !ours(h)) })).filter(g => g.hooks.length);
      removed += before; if (!st.hooks[ev].length) delete st.hooks[ev];
    }
    if (st.hooks && !Object.keys(st.hooks).length) delete st.hooks;
    say(removed + ' hooks removed from ' + SETTINGS + ' (a backup is next to it)');
    if (ours(st.statusLine || {})) {
      let orig = null; try { orig = JSON.parse(fs.readFileSync(path.join(DECK, 'statusline-original.json'), 'utf8')); } catch (_) {}
      if (orig && orig.command) { st.statusLine = orig; say('your previous status line is back'); } else { delete st.statusLine; say('status line removed'); }
    }
    fs.writeFileSync(SETTINGS, JSON.stringify(st, null, 2));
  }
  if (process.platform === 'win32' && !NOSYS) {
    const ps = "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne " + process.pid + " -and $_.CommandLine -match '\\.claude-deck\\(server\\.js|watchdog\\.ps1|chat-watch\\.ps1|start-deck\\.vbs|edge-profile)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }); } catch (_) {}
    const lnk = "foreach ($f in [Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Desktop')) { Remove-Item (Join-Path $f 'LLM Deck.lnk') -ErrorAction SilentlyContinue }";
    try { execFileSync('powershell', ['-NoProfile', '-Command', lnk], { stdio: 'ignore' }); } catch (_) {}
    say('deck stopped, start-at-login and desktop shortcuts removed');
  } else if (process.platform === 'darwin' && !NOSYS) {
    for (const label of ['com.llmdeck.server', 'com.llmdeck.open']) {
      try { execFileSync('launchctl', ['bootout', 'gui/' + process.getuid() + '/' + label], { stdio: 'ignore' }); } catch (_) {}
      try { fs.unlinkSync(path.join(HOME, 'Library', 'LaunchAgents', label + '.plist')); } catch (_) {}
    }
    try { fs.rmSync(path.join(HOME, 'Applications', 'LLM Deck.app'), { recursive: true, force: true }); } catch (_) {}
    say('deck stopped, login items and the LLM Deck app removed');
  }
  say('Kept your deck folder with its settings and backups: ' + DECK);
  say('Delete that folder too if you want everything gone.');
  process.exit(0);
}

console.log('Installing LLM Deck into ' + DECK);
fs.mkdirSync(DECK, { recursive: true });

// 1. program files
let copied = 0;
for (const f of fs.readdirSync(SRC)) {
  if (!/\.(js|ps1|vbs|sh|applescript)$/.test(f) || /^install/.test(f) || /^(patch|probe)/.test(f)) continue;
  fs.copyFileSync(path.join(SRC, f), path.join(DECK, f)); copied++;
}
fs.cpSync(path.join(SRC, 'public'), path.join(DECK, 'public'), { recursive: true });
say(copied + ' program files and the dashboard copied');

// 2. settings: keep yours, add new ones with their defaults
const DEFAULTS = require(path.join(SRC, 'defaults.js'));
const cfgFile = path.join(DECK, 'config.json');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (_) {}
const added = Object.keys(DEFAULTS).filter(k => !(k in cfg));
for (const k of added) cfg[k] = DEFAULTS[k];
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
say(added.length ? 'settings: added ' + added.join(', ') : 'settings: up to date');

// 3. Claude Code hooks (a backup of your settings is saved first)
let settings = {};
if (fs.existsSync(SETTINGS)) { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); fs.copyFileSync(SETTINGS, SETTINGS + '.before-llm-deck.bak'); }
else fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
settings.hooks = settings.hooks || {};
const strip = list => (list || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes('claude-deck')) })).filter(g => g.hooks.length);
const hookCmd = 'node "' + path.join(DECK, 'hook.js') + '"';
for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd']) {
  const list = strip(settings.hooks[ev]);
  const entry = { hooks: [{ type: 'command', command: hookCmd, timeout: 5 }] };
  if (ev === 'PostToolUse') entry.matcher = '*';
  list.push(entry); settings.hooks[ev] = list;
}
const perm = strip(settings.hooks.PermissionRequest);
perm.push({ matcher: '*', hooks: [{ type: 'command', command: 'node "' + path.join(DECK, 'perm-hook.js') + '"', timeout: (cfg.permWaitSeconds || 600) + 30 }] });
settings.hooks.PermissionRequest = perm;
const pre = strip(settings.hooks.PreToolUse);
pre.push({ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: 'node "' + path.join(DECK, 'question-hook.js') + '"', timeout: (cfg.questionWaitSeconds || 120) + 30 }] });
settings.hooks.PreToolUse = pre;
if (!settings.cleanupPeriodDays || settings.cleanupPeriodDays < 90) { settings.cleanupPeriodDays = 90; say('Claude Code now keeps session history for 90 days'); }
// status line: records Claude's official usage limits for the deck, and keeps showing any status line you had
if (!String((settings.statusLine || {}).command || '').includes('claude-deck')) {
  if (settings.statusLine && settings.statusLine.command) fs.writeFileSync(path.join(DECK, 'statusline-original.json'), JSON.stringify(settings.statusLine));
  settings.statusLine = { type: 'command', command: 'node "' + path.join(DECK, 'statusline.js') + '"', padding: 0 };
  say('status line: records your official usage limits for the deck');
}
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
say('Claude Code hooks registered in ' + SETTINGS);

// 4. Windows: desktop and start-at-login shortcuts with the LLM Deck icon
if (process.platform === 'win32' && !NOSYS) {
  const ps = [
    "$icons = '" + path.join(DECK, 'public', 'icons') + "'",
    "$c = Get-AppxPackage -Name Claude | Select-Object -First 1",
    "if ($c) { $f = Join-Path $c.InstallLocation 'Assets\\Square44x44Logo.targetsize-96.png'; if (Test-Path $f) { Copy-Item $f (Join-Path $icons 'claude.png') -Force } }",
    "$g = Get-AppxPackage -Name OpenAI.ChatGPT-Desktop | Select-Object -First 1",
    "if ($g) { foreach ($p in @(@('AppList.targetsize-96_altform-unplated.png', 'chatgpt-dark.png'), @('AppList.targetsize-96_altform-lightunplated.png', 'chatgpt-light.png'))) { $f = Join-Path $g.InstallLocation ('assets\\' + $p[0]); if (Test-Path $f) { Copy-Item $f (Join-Path $icons $p[1]) -Force } } }",
    "$ws = New-Object -ComObject WScript.Shell",
    "foreach ($folder in [Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Desktop')) {",
    "  $old = Join-Path $folder 'Claude Deck.lnk'; $new = Join-Path $folder 'LLM Deck.lnk'",
    "  if ((Test-Path $old) -and -not (Test-Path $new)) { Rename-Item $old 'LLM Deck.lnk' }",
    "  $l = $ws.CreateShortcut($new)",
    "  $l.TargetPath = \"$env:WINDIR\\System32\\wscript.exe\"",
    "  $l.Arguments = '\"" + path.join(DECK, 'start-deck.vbs') + "\"'",
    "  $l.WorkingDirectory = '" + DECK + "'",
    "  $l.IconLocation = '" + path.join(DECK, 'public', 'icons', 'llm-deck.ico') + ",0'",
    "  $l.Description = 'LLM Deck dashboard'",
    "  $l.Save()",
    "}"
  ].join('\r\n');
  const tmp = path.join(os.tmpdir(), 'llm-deck-shortcuts.ps1');
  fs.writeFileSync(tmp, ps);
  try { execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + tmp + '"', { stdio: 'ignore' }); say('shortcuts: desktop and start at login'); }
  catch (_) { say('couldn\u2019t create the shortcuts; start LLM Deck with: wscript "' + path.join(DECK, 'start-deck.vbs') + '"'); }
}

// 4b. macOS: start at login, an LLM Deck app, and the app icons
if (process.platform === 'darwin' && !NOSYS) require('./install-mac.js')({ HOME, DECK, say });

// 5. start it, unless it's already running
if (NOSYS) { say('test mode: shortcuts, login items and start skipped'); done(); } else {
const sock = net.connect(cfg.port || 7777, '127.0.0.1');
sock.on('connect', () => { sock.end(); say('LLM Deck is already running. Restart it (or sign out and in) to load the new files.'); done(); });
sock.on('error', () => {
  if (process.platform === 'win32') { spawn('wscript.exe', [path.join(DECK, 'start-deck.vbs')], { detached: true, stdio: 'ignore' }).unref(); say('starting LLM Deck'); }
  else if (process.platform === 'darwin') say('LLM Deck is starting');
  else say('start it with: node "' + path.join(DECK, 'server.js') + '", then open http://localhost:' + (cfg.port || 7777));
  done();
});
}
function done() { console.log('Done. Check everything with: node "' + path.join(DECK, 'selfcheck.js') + '"'); }
