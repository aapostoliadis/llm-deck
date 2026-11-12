// LLM Deck: updates itself to a newer release from GitHub when you tap "Update now". It does what
// git pull + node install.js does: downloads that release, checks its version, and runs its installer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const REPO = 'aapostoliadis/llm-deck';
const archiveUrl = v => 'https://codeload.github.com/' + REPO + '/tar.gz/refs/tags/v' + v;
const tarCmd = () => { const t = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); return process.platform === 'win32' && fs.existsSync(t) ? t : 'tar'; };
const usesCodexHook = () => { try { return fs.readFileSync(path.join(os.homedir(), '.codex', 'hooks.json'), 'utf8').includes('claude-deck'); } catch (_) { return false; } };

function download(url, file, cb, hops = 0) {
  https.get(url, { headers: { 'User-Agent': 'llm-deck' }, timeout: 60000 }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return download(new URL(res.headers.location, url).href, file, cb, hops + 1); }
    if (res.statusCode !== 200) { res.resume(); return cb(new Error('the download failed (HTTP ' + res.statusCode + ')')); }
    const out = fs.createWriteStream(file);
    res.pipe(out);
    out.on('finish', () => out.close(() => cb(null)));
    out.on('error', cb);
  }).on('timeout', function () { this.destroy(new Error('the download timed out')); }).on('error', cb);
}

// cb(err, installerOutput). Nothing in the deck changes unless the installer runs to the end.
function run(version, cb) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) return cb(new Error('not a release version: ' + version));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-deck-update-'));
  const done = (err, out) => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {} cb(err, out); };
  const tgz = path.join(work, 'release.tar.gz');
  download(archiveUrl(version), tgz, err => {
    if (err) return done(err);
    execFile(tarCmd(), ['-xzf', tgz, '-C', work], { timeout: 60000, windowsHide: true }, err2 => {
      if (err2) return done(new Error('the release could not be unpacked'));
      const src = fs.readdirSync(work).map(n => path.join(work, n)).find(p => fs.existsSync(path.join(p, 'install.js')));
      if (!src) return done(new Error('the release has no installer'));
      let v = ''; try { v = require(path.join(src, 'version.js')); } catch (_) {}
      if (v !== version) return done(new Error('the download says ' + (v || 'no version') + ' instead of ' + version));
      const args = [path.join(src, 'install.js')].concat(usesCodexHook() ? ['--codex'] : []);
      execFile(process.execPath, args, { cwd: src, timeout: 180000, windowsHide: true, env: { ...process.env, LLM_DECK_UPDATING: '1' } }, (err3, stdout, stderr) => {
        if (err3) return done(new Error('the installer stopped: ' + String(stderr || err3.message).trim().slice(0, 300)));
        done(null, String(stdout));
      });
    });
  });
}

module.exports = { run, archiveUrl, usesCodexHook };
