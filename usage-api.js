// LLM Deck: checks Claude's official usage limits with Anthropic's usage service, the same request Claude Code
// makes for /usage. Opt-in (Settings, or usageCheck: true). Your existing Claude Code sign-in is read at the moment
// of each check and sent only to api.anthropic.com. It is never stored, logged, refreshed or copied anywhere.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

function readSignIn(cb) {
  if (process.platform === 'darwin') {
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 10000 }, (err, out) => {
      if (err) return cb(null);
      try { cb(JSON.parse(out).claudeAiOauth.accessToken || null); } catch (_) { cb(null); }
    });
    return;
  }
  try {
    const f = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), '.credentials.json');
    cb((JSON.parse(fs.readFileSync(f, 'utf8')).claudeAiOauth || {}).accessToken || null);
  } catch (_) { cb(null); }
}

// One limit window from the service's answer: { utilization: 0-100, resets_at: ISO date }.
function windowOf(x) {
  if (!x || typeof x.utilization !== 'number') return null;
  const t = x.resets_at ? Date.parse(x.resets_at) : NaN;
  return { pct: x.utilization, resetsAt: isNaN(t) ? null : t };
}

function parse(body) {
  const j = JSON.parse(body);
  const s = windowOf(j.five_hour), w = windowOf(j.seven_day);
  if (!s && !w) throw new Error('no limits in the answer');
  return { at: Date.now(), s, w, via: 'usage-service' };
}

function check(cb) {
  readSignIn(token => {
    if (!token) return cb(new Error('no Claude Code sign-in found'));
    const req = https.request({
      host: 'api.anthropic.com', path: '/api/oauth/usage', method: 'GET', timeout: 15000,
      headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json', 'User-Agent': 'llm-deck' }
    }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        if (res.statusCode === 401) return cb(new Error('sign-in expired; Claude Code renews it on its next use'));
        if (res.statusCode !== 200) return cb(new Error('usage service answered ' + res.statusCode));
        try { cb(null, parse(body)); } catch (e) { cb(new Error('unreadable answer: ' + e.message)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', e => cb(new Error(String(e.message || e))));
    req.end();
  });
}

module.exports = { check, parse };
