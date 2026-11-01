// LLM Deck: the few things that work differently on Windows, macOS and Linux.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const HOME = os.homedir();
const DECK = __dirname;
const MAC_APPS = { claude: ['Claude'], chatgpt: ['ChatGPT'], codex: ['Codex', 'ChatGPT'] };

function run(cmd, args) { try { spawn(cmd, args, { stdio: 'ignore', windowsHide: true, detached: !WIN }).unref(); } catch (_) {} }

// Opens a link such as claude://resume?session=... in the app that owns it.
function openUrl(url) {
  if (WIN) run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', "Start-Process '" + url + "'"]);
  else if (MAC) run('open', [url]);
  else run('xdg-open', [url]);
}

// Brings an app to the front: 'claude', 'chatgpt' or 'codex'.
function focus(app) {
  if (WIN) {
    const [proc, pkg] = app === 'claude' ? ['^claude$', 'Claude'] : ['^ChatGPT$', 'OpenAI.ChatGPT-Desktop'];
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(DECK, 'focus-app.ps1'), '-Proc', proc, '-Package', pkg]);
  } else if (MAC) {
    run('/bin/sh', ['-c', (MAC_APPS[app] || [app]).map(n => 'open -a "' + n + '"').join(' 2>/dev/null || ')]);
  }
}

// Puts text on the clipboard.
function copy(text) {
  try {
    const p = WIN ? spawn('powershell', ['-NoProfile', '-Command', '$input | Set-Clipboard'], { windowsHide: true })
      : MAC ? spawn('pbcopy') : spawn('xclip', ['-selection', 'clipboard']);
    p.on('error', () => {}); p.stdin.end(String(text));
  } catch (_) {}
}

// Where the Claude desktop app keeps its data (Code session titles live there).
function claudeDataDir() {
  if (WIN) return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Claude');
  if (MAC) return path.join(HOME, 'Library', 'Application Support', 'Claude');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'Claude');
}

// macOS: installed versions of the Claude and ChatGPT apps, for update warnings.
function macVersions(cb) {
  const out = {}; let left = 2;
  const done = () => { if (--left === 0) cb(out); };
  for (const [k, app] of [['claude', 'Claude'], ['chatgpt', 'ChatGPT']]) {
    execFile('defaults', ['read', '/Applications/' + app + '.app/Contents/Info', 'CFBundleShortVersionString'], { timeout: 10000 }, (e, so) => { if (!e && so.trim()) out[k] = so.trim(); done(); });
  }
}

// macOS: opens a session link, checks the app is in front, types a preset reply and sends it.
// Needs Accessibility permission for the app running the deck.
function macType(url, appName, text) {
  run('osascript', [path.join(DECK, 'reply-mac.applescript'), url, appName, text]);
}

module.exports = { WIN, MAC, openUrl, focus, copy, claudeDataDir, macVersions, macType };
