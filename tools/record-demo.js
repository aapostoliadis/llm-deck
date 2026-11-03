#!/usr/bin/env node
// LLM Deck: records docs/demo.gif from a throwaway demo deck with neutral example sessions.
// Needs Node 22+ and Microsoft Edge or Google Chrome. Nothing on your real setup is read or changed.
// Usage: node tools/record-demo.js [output.gif]      the animation (docs/demo.gif)
//        node tools/record-demo.js --screens         dark and light screenshots (docs/screenshot-*.png)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { readPng, writeGif } = require('./gif.js');

const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2), SCREENS = ARGS.includes('--screens');
const OUT = path.resolve(ARGS.find(a => !a.startsWith('--')) || path.join(ROOT, 'docs', 'demo.gif'));
const W = 1280, H = 720, SCALE = 0.75, FPS = 8;
const net = require('net');
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-deck-demo-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = t => new Date(t).toISOString();

(async () => {
const PORT = await freePort(), CDP = await freePort();

// ---------- 1. a throwaway home folder with neutral example sessions ----------
const now = Date.now(), DATA = path.join(HOME, '.claude-deck'), PROJ = path.join(HOME, '.claude', 'projects', '-work-acme');
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true }); fs.mkdirSync(path.join(DATA, 'perms'), { recursive: true });
const user = (t, text, cwd) => JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: text }, timestamp: iso(t) });
const said = (t, content) => JSON.stringify({ type: 'assistant', requestId: 'r' + t, message: { id: 'm' + t, model: 'claude-opus-4-5', content, usage: { input_tokens: 40, output_tokens: 120 } }, timestamp: iso(t) });
const sessions = [
  ['s-orders', '/work/acme-api', 'Migrate the orders service to the new schema', [{ type: 'text', text: 'Working on it.' }], 9],
  ['s-tests', '/work/acme-api', 'Fix the flaky checkout tests', [{ type: 'text', text: 'Running the suite.' }], 4],
  ['s-story', '/work/story-engine', 'Refactor the story graph renderer', [{ type: 'text', text: 'Renderer refactored. Should I also split the layout code into its own module?' }], 30],
  ['s-cache', '/work/shop-site', 'Add a cache layer to the product API', [{ type: 'text', text: 'Ready to add the cache.' }, { type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Should the cache live in Redis or in memory?' }] } }], 2],
  ['s-docs', '/work/docs-site', 'Rewrite the getting started guide', [{ type: 'text', text: 'Done.' }], 120],
  ['s-zsh', '/work/dotfiles', 'Clean up shell aliases', [{ type: 'text', text: 'Done.' }], 150]
];
for (const [id, cwd, title, reply, minsAgo] of sessions)
{ const f = path.join(PROJ, id + '.jsonl'); fs.writeFileSync(f, user(now - (minsAgo + 3) * 60e3, title, cwd) + '\n' + said(now - minsAgo * 60e3, reply) + '\n'); const t = (now - minsAgo * 60e3) / 1000; fs.utimesSync(f, t, t); }
const ev = (t, e, sid, extra) => JSON.stringify(Object.assign({ t, e, sid, cwd: sessions.find(s => s[0] === sid)[1] }, extra || {}));
const EVENTS = path.join(DATA, 'events.jsonl');
fs.writeFileSync(EVENTS, [
  ev(now - 12 * 60e3, 'UserPromptSubmit', 's-orders'), ev(now - 60e3, 'PostToolUse', 's-orders', { tool: 'Edit' }),
  ev(now - 6 * 60e3, 'UserPromptSubmit', 's-tests'), ev(now - 2 * 60e3, 'Notification', 's-tests', { msg: 'Claude needs your permission to use Bash' }),
  ev(now - 41 * 60e3, 'UserPromptSubmit', 's-story'), ev(now - 30 * 60e3, 'Stop', 's-story'),
  ev(now - 120 * 60e3 - 20e3, 'UserPromptSubmit', 's-docs'), ev(now - 120 * 60e3, 'Stop', 's-docs'),
  ev(now - 150 * 60e3 - 15e3, 'UserPromptSubmit', 's-zsh'), ev(now - 150 * 60e3, 'Stop', 's-zsh'),
  ev(now - 2 * 60e3, 'SessionStart', 's-cache')
].join('\n') + '\n');
fs.writeFileSync(path.join(DATA, 'perms', 'demo-1.req.json'), JSON.stringify({ id: 'demo-1', sid: 's-tests', tool: 'Bash', summary: 'npm run test -- checkout', cwd: '/work/acme-api', t: now - 2 * 60e3, wait: 600 }));
fs.writeFileSync(path.join(DATA, 'limits.json'), JSON.stringify({ at: now, s: { pct: 24, resetsAt: now + 3.2 * 3600e3 }, w: { pct: 41, resetsAt: now + 3.6 * 864e5 } }));
fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify({
  port: PORT, city: 'London', latitude: 51.51, longitude: -0.13, officialLimits: false, desktopChats: false, notifications: false,
  remoteAccess: false, alertSound: false, autoTheme: false, dimAtNight: false, pixelShift: false, groups: { 'Acme': ['acme'] }, pinnedProjects: ['/work/story-engine']
}, null, 2));
const addEvent = (e, sid, extra) => fs.appendFileSync(EVENTS, ev(Date.now(), e, sid, extra) + '\n');

// ---------- 2. the deck server, pointed at the throwaway home ----------
const env = { ...process.env, HOME, USERPROFILE: HOME };
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: 'ignore', windowsHide: true });
let serverExited = false; server.on('exit', () => { serverExited = true; });

// ---------- 3. a headless browser we can drive ----------
const browserPath = process.env.BROWSER || [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(p => fs.existsSync(p));
if (!browserPath) { console.error('No Edge or Chrome found. Set BROWSER to its path.'); process.exit(1); }
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0; // Chrome needs this flag only when run as root
const browser = spawn(browserPath, [...(asRoot ? ['--no-sandbox'] : []), '--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(HOME, 'browser'), '--no-first-run',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore', windowsHide: true });

const getJson = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => (b += d)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
async function connect() {
  for (let i = 0; i < 60; i++) {
    try { const pages = await getJson('http://127.0.0.1:' + CDP + '/json/list'); const pg = pages.find(p => p.type === 'page'); if (pg) return pg.webSocketDebuggerUrl; } catch (_) {}
    await sleep(500);
  }
  throw new Error('browser did not start');
}

await (async () => {
  let ws;
  const finish = code => { try { ws && ws.close(); } catch (_) {} browser.kill(); server.kill(); try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (_) {} process.exit(code); };
  try {
    let up = false;
    for (let i = 0; i < 60 && !serverExited; i++) { try { await getJson('http://127.0.0.1:' + PORT + '/api/config'); up = true; break; } catch (_) { await sleep(500); } }
    if (!up) throw new Error('the demo server did not start');
    ws = new WebSocket(await connect());
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let seq = 0; const waiting = new Map();
    ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d.result || {}); waiting.delete(d.id); } });
    const cmd = (method, params) => new Promise(r => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const js = async expr => (await cmd('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

    await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
    await sleep(1500);
    await js("localStorage.setItem('deck-theme','dark'); location.reload()");
    await sleep(3500);

    if (SCREENS) { // full-size stills in both themes
      await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const theme of ['dark', 'light']) {
        await js("localStorage.setItem('deck-theme','" + theme + "'); location.reload()");
        await sleep(3500);
        const shot = await cmd('Page.captureScreenshot', { format: 'png' });
        const file = path.join(ROOT, 'docs', 'screenshot-' + theme + '.png');
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        console.log('Saved ' + file);
      }
      return finish(0);
    }

    const frames = [];
    const shoot = async () => { const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } }); frames.push({ ...readPng(Buffer.from(r.data, 'base64')), delay: 1000 / FPS }); };
    const film = async ms => { const end = Date.now() + ms; while (Date.now() < end) { const t = Date.now(); await shoot(); await sleep(Math.max(0, 1000 / FPS - (Date.now() - t))); } };
    const centre = async sel => js("(() => { const r = document.querySelector('" + sel + "').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
    const mouse = (type, p) => cmd('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });

    await film(1500);                                            // the board at a glance
    addEvent('Stop', 's-orders');                                // a long session finishes: headphones become a cap
    await film(3000);
    const allow = await centre('[data-act="allow"]');            // hold Allow for a second
    await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: allow.x, y: allow.y });
    await mouse('mousePressed', allow); await film(1300); await mouse('mouseReleased', allow);
    addEvent('PostToolUse', 's-tests', { tool: 'Bash' });        // the approved session goes back to work
    await film(3000);
    addEvent('UserPromptSubmit', 's-cache'); await sleep(200);
    addEvent('Notification', 's-cache', { msg: 'Claude needs your input' }); // a new question arrives
    await film(3500);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, writeGif(frames));
    console.log('Saved ' + OUT + ' (' + frames.length + ' frames, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
    finish(0);
  } catch (e) { console.error('Recording failed: ' + e.message); finish(1); }
})();
})();
