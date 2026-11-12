// The updater: which download it asks for, and whether it keeps the Codex hook.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveUrl, usesCodexHook, run } = require('../update.js');

test('downloads the tagged release from GitHub', () => {
  assert.equal(archiveUrl('1.5.0'), 'https://codeload.github.com/aapostoliadis/llm-deck/tar.gz/refs/tags/v1.5.0');
});

test('keeps the Codex hook only when it was installed', () => {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdeck-up-')), before = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = process.env.USERPROFILE = h;
  try {
    assert.equal(usesCodexHook(), false);
    fs.mkdirSync(path.join(h, '.codex'));
    fs.writeFileSync(path.join(h, '.codex', 'hooks.json'), JSON.stringify({ hooks: { PermissionRequest: [{ hooks: [{ command: 'node "x/.claude-deck/perm-hook.js" --codex' }] }] } }));
    assert.equal(usesCodexHook(), true);
  } finally { [process.env.HOME, process.env.USERPROFILE] = before; }
});

test('refuses anything that is not a release version', (t, done) => {
  run('../../etc', err => { assert.match(err.message, /not a release version/); done(); });
});
