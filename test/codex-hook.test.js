// The Codex approval hook entry: added once, other hooks untouched, removed cleanly.
const test = require('node:test');
const assert = require('node:assert');
const { add, remove } = require('../codex-hook.js');

const CMD = 'node "/home/me/.claude-deck/perm-hook.js" --codex';
const theirs = { hooks: { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-policy' }] }], Stop: [{ hooks: [{ type: 'command', command: 'my-stop' }] }] } };

test('adds the deck hook next to existing ones', () => {
  const c = add(JSON.parse(JSON.stringify(theirs)), CMD);
  assert.equal(c.hooks.PermissionRequest.length, 2);
  assert.equal(c.hooks.Stop[0].hooks[0].command, 'my-stop');
  assert.equal(c.hooks.PermissionRequest[1].hooks[0].command, CMD);
});

test('adding twice keeps one deck hook', () => {
  const c = add(add({}, CMD), CMD);
  assert.equal(c.hooks.PermissionRequest.length, 1);
});

test('removing leaves other hooks in place', () => {
  const r = remove(add(JSON.parse(JSON.stringify(theirs)), CMD));
  assert.equal(r.removed, 1);
  assert.deepEqual(r.cfg, theirs);
});

test('removing the only hook leaves nothing behind', () => {
  const r = remove(add({}, CMD));
  assert.equal(r.removed, 1);
  assert.deepEqual(r.cfg, {});
});
