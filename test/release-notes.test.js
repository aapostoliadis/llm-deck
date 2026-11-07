// Release notes come from the matching CHANGELOG.md section.
const test = require('node:test');
const assert = require('node:assert');
const { notes } = require('../tools/release-notes.js');

const log = '# Changelog\n\n## 1.2.0, 9 November 2026\n\n### Added\n\n- Desk-aware prompts.\n\n## 1.1.0, 3 November 2026\n\n- Older things.\n';

test('takes only the requested version', () => {
  const n = notes('1.2.0', log, 'me/repo');
  assert.match(n, /Desk-aware prompts/);
  assert.doesNotMatch(n, /Older things/);
  assert.match(n, /me\/repo\/blob\/main\/CHANGELOG\.md/);
});
test('refuses a version without a section', () => assert.throws(() => notes('9.9.9', log, 'me/repo'), /no section/));
test('refuses a section still marked unreleased', () => assert.throws(() => notes('1.3.0', log.replace('## 1.2.0, 9 November 2026', '## 1.3.0, unreleased'), 'me/repo'), /unreleased/));
