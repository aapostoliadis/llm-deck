// The weekly forecast shown in the This week card and used for the one-time chime.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'deck.js'), 'utf8');
const code = src.slice(src.indexOf('/* weekly outlook'), src.indexOf('async function showWeek'));
const weeklyOutlook = new Function(code + '\nreturn weeklyOutlook;')();
const D = 864e5, now = Date.UTC(2026, 10, 2, 10, 0), reset = now + 3 * D; // four days into the week

test('a pace that runs out before the reset warns and names the day', () => {
  const o = weeklyOutlook('Claude', 70, reset, now);
  assert.equal(o.warn, true);
  assert.match(o.text, /runs out on \w+day around \d\d:\d\d/);
});

test('a pace that lasts says roughly where you will end up', () => {
  const o = weeklyOutlook('Claude', 40, reset, now);
  assert.equal(o.warn, false);
  assert.match(o.text, /about 70%/);
});

test('a used-up limit says so', () => {
  assert.match(weeklyOutlook('Claude', 100, reset, now).text, /used up/);
});

test('the first hours of a week are too early to forecast', () => {
  assert.match(weeklyOutlook('Claude', 1, now + 7 * D - 2 * 3600e3, now).text, /too early/);
});
