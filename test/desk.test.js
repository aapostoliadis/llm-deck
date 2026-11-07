// Desk-aware prompts: recent keyboard or mouse input sends prompts to the app; a tap on the deck doesn't count.
const test = require('node:test');
const assert = require('node:assert');
const { decide } = require('../desk.js');

const now = 1_800_000_000_000, cfg = { deskActiveSeconds: 60 };

test('typing a moment ago means you are at your computer', () => assert.equal(decide(now - 5e3, 0, now, cfg), true));
test('no input for over a minute means you are away', () => assert.equal(decide(now - 90e3, 0, now, cfg), false));
test('a tap on the deck is not desk activity', () => assert.equal(decide(now - 5e3, now - 5e3, now, cfg), false));
test('typing after a tap on the deck is desk activity', () => assert.equal(decide(now - 2e3, now - 30e3, now, cfg), true));
test('switched off in Settings', () => assert.equal(decide(now - 1e3, 0, now, { deskAware: false }), false));
test('unknown input time means waiting for the deck, as before', () => assert.equal(decide(null, 0, now, cfg), false));
