#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version, as the notes of its GitHub release. Stops with an error when the
// section is missing or still marked unreleased, or when version.js says another version.
// Usage: node tools/release-notes.js v1.2.0
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function notes(version, changelog, repo) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(l => l.startsWith('## ' + version + ','));
  if (start < 0) throw new Error('CHANGELOG.md has no section for ' + version);
  if (/unreleased/i.test(lines[start])) throw new Error('The ' + version + ' section in CHANGELOG.md is still marked unreleased');
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim() + '\n\nFull history: [CHANGELOG.md](https://github.com/' + repo + '/blob/main/CHANGELOG.md).\n';
}

if (require.main === module) {
  const v = String(process.argv[2] || '').replace(/^v/, '');
  try {
    const own = require(path.join(ROOT, 'version.js'));
    if (own !== v) throw new Error('version.js says ' + own + ' but the release is ' + v);
    process.stdout.write(notes(v, fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), process.env.GITHUB_REPOSITORY || 'aapostoliadis/llm-deck'));
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { notes };
