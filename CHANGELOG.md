# Changelog

All notable changes to LLM Deck, newest first. Versions follow [semantic versioning](https://semver.org).

## 1.2.0, unreleased

### Added

- **An agent's own options as buttons.** When Claude Code asks a multiple-choice question, the card shows its options;
  one tap answers it. "Answer in app", or no tap within 2 minutes, hands the question back to the app's picker.
  Questions with several parts or several picks go straight to the app. A Settings switch turns it off.
- **Desk-aware prompts.** When you've used your keyboard or mouse in the last minute, permissions and questions go
  straight to the app instead of waiting for the deck. A tap on the deck itself doesn't count. A Settings switch turns
  it off. On Windows it needs the chat reader running (the default).
- **Problems on the deck.** The left panel says when something needs attention (an old limit reading, missing hooks, a
  missing status line), and tapping it explains what to do.
- **Releases from the changelog.** Pushing a version tag publishes the release with that version's changelog section,
  after the tests pass and `version.js` is checked against the tag.
- **`node install.js --uninstall`** removes what the installer added and restores your previous status line.
- **Optional "new version" note.** With the setting on, the deck asks GitHub once a day and says when a newer release is
  out. It's off by default.
- **Unit tests** for the question hook, the limit readers, the status line and the weekly forecast, run on every change.

### Changed

- When a limit reading is old, the left panel says why, for example "Usage service busy; next try in 15 min".

### Fixed

- A permission answered in the app stayed on the deck for up to 10 minutes. It now leaves as soon as the session moves on.
- Permission request files piled up when a prompt was answered in the app on Windows. Old ones are now cleared.

## 1.1.0, 3 November 2026

### Added

- **Official Claude limits from the status line.** Claude Code passes your 5-hour and weekly limits to status line
  scripts, and the deck now records them. Its status line prints nothing, or keeps showing the one you had before.
- **Optional 5-minute limit check.** In Settings, "Check Claude limits every 5 minutes with my Claude Code sign-in" asks
  Anthropic's usage service directly. It's off by default. The sign-in is read only at the moment of each check, sent
  only to `api.anthropic.com`, and never stored or logged. The deck skips a check when the status line has just
  reported, and waits 15, 30, then 60 minutes when the service turns requests away.
- `node tools/record-demo.js --screens` saves the dark and light screenshots from the demo deck.

### Changed

- Cards grow to fit their content and columns scroll, instead of cards being squeezed to fit the column.
- Cards show the full title, project, status, question and command, in compact text.
- "Hold to allow" fits its button at any width. Deny moves below it when a column is narrow.
- Fresh demo animation and screenshots.

### Fixed

- Limit bars kept showing an old reading as current after Claude Code's `/usage` stopped reporting limits in the
  background. A reading over 30 minutes old now turns grey with "last reading 14:05", a window that has reset since the
  last reading shows a dash instead of 0%, and the self-check fails when the newest reading is over an hour old.
- Quotes and reply buttons spilled over the next card in crowded columns.

## 1.0.0, 2 November 2026

First stable release.

### Added

- Four columns (pinned, waiting for you, new result, background), grouped by project, with a mascot for each state.
- One tap opens the exact session, chat or thread. Double-tap a Claude Code or Codex card to read its last reply.
- Hold to allow, tap to deny safe permission requests on the card. Risky requests always go to the app.
- Tiles that need you quote the question the session asked.
- Claude and Codex limits with a forecast under each bar, an amber line and one chime when a limit is on track to run
  out, and a This week summary that names the day it would.
- Quick replies, project groups with suggestions, an overnight digest, night dimming, phone access through a private
  link, backups and a built-in self-test.
- Windows and macOS, both tested end to end. The core dashboard also runs on Linux.
- Automated checks on Windows, macOS and Linux for every change.
- Demo animation, issue forms, a contributing guide and a read-only macOS probe for adding chat support.

### Fixed

- A card that had just closed read "Closed just now ago".
- A "chat reader has stopped" notice appeared when chat reading was switched off on purpose.
