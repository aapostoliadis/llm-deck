// LLM Deck: updates itself to a newer release from GitHub when you tap "Update now". It does what
// git pull + node install.js does: downloads that release, checks its version, and runs its installer.
// progress({ phase, percent }) reports each step: download (with a percentage when GitHub says the size), unpack, check, install.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

const REPO = 'aapostoliadis/llm-deck';
// LLM_DECK_TEST_ARCHIVE_BASE is for the automated tests only: it serves a release from a local address instead of GitHub.
const archiveUrl = v => process.env.LLM_DECK_TEST_ARCHIVE_BASE ? process.env.LLM_DECK_TEST_ARCHIVE_BASE.replace(/\/+$/, '') + '/v' + v + '.tar.gz' : 'https://codeload.github.com/' + REPO + '/tar.gz/refs/tags/v' + v;
const tarCmd = () => { const t = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); return process.platform === 'win32' && fs.existsSync(t) ? t : 'tar'; };
const usesCodexHook = () => { try { return fs.readFileSync(path.join(os.homedir(), '.codex', 'hooks.json'), 'utf8').includes('claude-deck'); } catch (_) { return false; } };

// onBytes(received, total) while downloading; total is 0 when GitHub doesn't say how big the file is.
function download(url, file, onBytes, cb, hops = 0) {
  let finished = false;
  const finish = err => { if (!finished) { finished = true; cb(err || null); } };
  (url.startsWith('http:') ? http : https).get(url, { headers: { 'User-Agent': 'llm-deck' }, timeout: 60000 }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return download(new URL(res.headers.location, url).href, file, onBytes, cb, hops + 1); }
    if (res.statusCode !== 200) { res.resume(); return finish(new Error('the download failed (HTTP ' + res.statusCode + ')')); }
    const total = Number(res.headers['content-length']) || 0;
    let got = 0;
    res.on('data', chunk => { got += chunk.length; try { onBytes(got, total); } catch (_) {} });
    res.on('error', () => finish(new Error('the download was interrupted')));
    res.on('aborted', () => finish(new Error('the download was interrupted')));
    const out = fs.createWriteStream(file);
    res.pipe(out);
    out.on('finish', () => out.close(() => finish(null)));
    out.on('error', finish);
  }).on('timeout', function () { this.destroy(new Error('the download timed out')); }).on('error', finish);
}

// cb(err, installerOutput). Nothing in the deck changes unless the installer runs to the end.
// Whatever goes wrong is reported through cb: an error here must never stop the deck itself.
function run(version, progress, cb) {
  try { runSteps(version, progress, cb); } catch (e) { cb(e); }
}

function runSteps(version, progress, cb) {
  const say = (phase, percent, bytes) => { try { if (progress) progress({ phase, percent: percent == null ? null : percent, bytes: bytes || 0 }); } catch (_) {} };
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) return cb(new Error('not a release version: ' + version));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-deck-update-'));
  const done = (err, out) => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {} cb(err, out); };
  const tgz = path.join(work, 'release.tar.gz');
  let last = -2, lastBytes = 0;
  say('download', 0);
  download(archiveUrl(version), tgz, (got, total) => {
    const pct = total ? Math.min(100, Math.floor(got * 100 / total)) : null;
    if (pct !== last || got - lastBytes >= 65536) { last = pct; lastBytes = got; say('download', pct, got); }
  }, err => {
    if (err) return done(err);
    say('unpack', null);
    execFile(tarCmd(), ['-xzf', tgz, '-C', work], { timeout: 60000, windowsHide: true }, err2 => {
      if (err2) return done(new Error('the release could not be unpacked'));
      say('check', null);
      const src = fs.readdirSync(work).map(n => path.join(work, n)).find(p => fs.existsSync(path.join(p, 'install.js')));
      if (!src) return done(new Error('the release has no installer'));
      let v = ''; try { v = require(path.join(src, 'version.js')); } catch (_) {}
      if (v !== version) return done(new Error('the download says ' + (v || 'no version') + ' instead of ' + version));
      const args = [path.join(src, 'install.js')].concat(usesCodexHook() ? ['--codex'] : []);
      say('install', null);
      execFile(process.execPath, args, { cwd: src, timeout: 180000, windowsHide: true, env: { ...process.env, LLM_DECK_UPDATING: '1' } }, (err3, stdout, stderr) => {
        if (err3) return done(new Error('the installer stopped: ' + String(stderr || err3.message).trim().slice(0, 300)));
        done(null, String(stdout));
      });
    });
  });
}

module.exports = { run, archiveUrl, usesCodexHook };
