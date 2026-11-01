// LLM Deck installer, macOS part: start at login (LaunchAgents), an LLM Deck app, and the app icons.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = function installMac({ HOME, DECK, say }) {
  const agents = path.join(HOME, 'Library', 'LaunchAgents');
  fs.mkdirSync(agents, { recursive: true });
  try { fs.chmodSync(path.join(DECK, 'open-deck.sh'), 0o755); } catch (_) {}

  // 1. LaunchAgents: the server runs at login and is restarted if it stops; the deck window opens at login
  const pathEnv = [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local', 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const plist = (label, args, keepAlive) => [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '  <key>Label</key><string>' + label + '</string>',
    '  <key>ProgramArguments</key><array>' + args.map(a => '<string>' + x(a) + '</string>').join('') + '</array>',
    '  <key>WorkingDirectory</key><string>' + x(DECK) + '</string>',
    '  <key>RunAtLoad</key><true/>',
    keepAlive ? '  <key>KeepAlive</key><true/>' : '',
    '  <key>EnvironmentVariables</key><dict><key>PATH</key><string>' + x(pathEnv) + '</string></dict>',
    '  <key>StandardOutPath</key><string>' + x(path.join(DECK, label + '.log')) + '</string>',
    '  <key>StandardErrorPath</key><string>' + x(path.join(DECK, label + '.log')) + '</string>',
    '</dict></plist>', ''
  ].join('\n');
  const uid = process.getuid();
  for (const [label, args, keep] of [
    ['com.llmdeck.server', [process.execPath, path.join(DECK, 'server.js')], true],
    ['com.llmdeck.open', ['/bin/bash', path.join(DECK, 'open-deck.sh')], false]
  ]) {
    const f = path.join(agents, label + '.plist');
    fs.writeFileSync(f, plist(label, args, keep));
    try { execSync('launchctl bootout gui/' + uid + ' "' + f + '"', { stdio: 'ignore' }); } catch (_) {}
    try { execSync('launchctl bootstrap gui/' + uid + ' "' + f + '"', { stdio: 'ignore' }); }
    catch (_) { say('couldn\u2019t load ' + label + '; load it with: launchctl bootstrap gui/' + uid + ' "' + f + '"'); }
  }
  say('starts at login (LaunchAgents in ~/Library/LaunchAgents)');

  // 2. a clickable LLM Deck app with the LLM Deck icon
  const app = path.join(HOME, 'Applications', 'LLM Deck.app');
  try {
    fs.mkdirSync(path.dirname(app), { recursive: true });
    const script = 'do shell script "/bin/bash \\"' + path.join(DECK, 'open-deck.sh') + '\\" > /dev/null 2>&1 &"';
    execSync('osacompile -o "' + app + '" -e \'' + script + '\'', { stdio: 'ignore' });
    execSync('sips -s format icns "' + path.join(DECK, 'public', 'icons', 'llm-deck-192.png') + '" --out "' + path.join(app, 'Contents', 'Resources', 'applet.icns') + '"', { stdio: 'ignore' });
    execSync('touch "' + app + '"', { stdio: 'ignore' });
    say('LLM Deck app added to ~/Applications');
  } catch (_) { say('couldn\u2019t create the LLM Deck app; open the deck with: bash "' + path.join(DECK, 'open-deck.sh') + '"'); }

  // 3. Claude and ChatGPT icons, copied from the apps installed on this Mac
  for (const [name, outs] of [['Claude', ['claude.png']], ['ChatGPT', ['chatgpt-light.png', 'chatgpt-dark.png']]]) {
    try {
      let icon = execSync('defaults read "/Applications/' + name + '.app/Contents/Info" CFBundleIconFile', { encoding: 'utf8' }).trim();
      if (!icon.endsWith('.icns')) icon += '.icns';
      for (const o of outs) execSync('sips -s format png -Z 96 "/Applications/' + name + '.app/Contents/Resources/' + icon + '" --out "' + path.join(DECK, 'public', 'icons', o) + '"', { stdio: 'ignore' });
    } catch (_) {}
  }

  say('to finish: in System Settings \u203a Privacy & Security, give node Full Disk Access (for chat notifications)');
  say('and Accessibility (for quick replies). The deck works without them, with those two features off.');
};
