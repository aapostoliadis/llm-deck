// LLM Deck: are you at your computer right now? The permission and question hooks use this to hand a prompt straight
// to the app when you are, instead of waiting for a tap on the deck. A tap on the deck itself doesn't count.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DATA = path.join(os.homedir(), '.claude-deck');

// When the last keyboard, mouse or touch input happened, or null when the system can't say.
function lastInputAt() {
  if (process.platform === 'win32') { // recorded every few seconds by the chat reader
    try { const a = JSON.parse(fs.readFileSync(path.join(DATA, 'apps.json'), 'utf8')); if (a.lastInputAt && Date.now() - a.at < 20e3) return a.lastInputAt; } catch (_) {}
    return null;
  }
  if (process.platform === 'darwin') {
    try { const m = execFileSync('ioreg', ['-c', 'IOHIDSystem'], { encoding: 'utf8', timeout: 3000 }).match(/"HIDIdleTime"\s*=\s*(\d+)/); if (m) return Date.now() - Number(m[1]) / 1e6; } catch (_) {}
  }
  return null;
}

function deckTouchAt() { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'touch.json'), 'utf8')).at || 0; } catch (_) { return 0; } }

// The decision on its own, so it can be tested.
function decide(last, touch, now, cfg) {
  if (!cfg || cfg.deskAware === false || !last) return false;
  if (now - last > (cfg.deskActiveSeconds || 60) * 1000) return false;
  if (touch && last <= touch + 3000) return false; // the latest input was a tap on the deck
  return true;
}

const atDesk = cfg => { try { return decide(lastInputAt(), deckTouchAt(), Date.now(), cfg); } catch (_) { return false; } };

module.exports = { atDesk, decide, lastInputAt };
