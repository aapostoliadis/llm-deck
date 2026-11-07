// Limit readings: the usage service's answer, and the status line recorder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parse } = require('../usage-api.js');

test('the usage service answer becomes a reading', () => {
  const r = parse(JSON.stringify({ five_hour: { utilization: 97, resets_at: '2026-11-03T12:00:00Z' }, seven_day: { utilization: 48, resets_at: null } }));
  assert.equal(r.s.pct, 97);
  assert.equal(r.s.resetsAt, Date.parse('2026-11-03T12:00:00Z'));
  assert.equal(r.w.pct, 48);
  assert.equal(r.w.resetsAt, null);
});

test('an answer without limits is rejected', () => {
  assert.throws(() => parse('{}'));
});

test('the status line records limits and keeps showing a previous status line', () => {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdeck-sl-'));
  const data = path.join(h, '.claude-deck'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'statusline-original.json'), JSON.stringify({ command: '"' + process.execPath + '" -e "process.stdout.write(\'old line\')"' }));
  const now = Math.floor(Date.now() / 1000);
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'statusline.js')], {
    input: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 97, resets_at: now + 600 }, seven_day: { used_percentage: 48, resets_at: '2026-11-06T11:00:00Z' } } }),
    env: { ...process.env, HOME: h, USERPROFILE: h }, encoding: 'utf8'
  });
  assert.equal(r.stdout, 'old line');
  const rec = JSON.parse(fs.readFileSync(path.join(data, 'ratelimits.json'), 'utf8'));
  assert.equal(rec.s.pct, 97);
  assert.equal(rec.s.resetsAt, (now + 600) * 1000);
  assert.equal(rec.w.resetsAt, Date.parse('2026-11-06T11:00:00Z'));
});
