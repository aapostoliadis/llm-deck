# Contributing to LLM Deck

Thanks for helping. LLM Deck is small on purpose, and these notes keep it that way.

## Reporting a problem

Please open an issue and include:

- your system (Windows 10 or 11, or the macOS version) and your Node.js version (`node --version`)
- the versions of the Claude, ChatGPT or Codex apps involved, if the problem is about one of them
- the output of the self-check:

  ```
  node "%USERPROFILE%\.claude-deck\selfcheck.js"     # Windows
  node ~/.claude-deck/selfcheck.js                   # macOS
  ```

- what you did, what you expected, and what happened instead

Please don't paste your `config.json`: it holds your private phone link.

## Making a change

1. Fork the repository and create a branch.
2. Make your change and run the checks below on your own machine.
3. Open a pull request. The automated checks run on Windows, macOS and Linux, and need to pass before a change is merged.

## Running the checks yourself

The same steps the automated checks run:

```
for f in *.js public/deck.js; do node --check "$f"; done
bash -n open-deck.sh
LLM_DECK_NO_SYSTEM=1 node install.js
node ~/.claude-deck/server.js &
LLM_DECK_CI=1 node ~/.claude-deck/selfcheck.js
```

`LLM_DECK_NO_SYSTEM=1` installs without shortcuts, login items or starting the deck. `LLM_DECK_CI=1` makes the
self-check skip the checks that need a real desktop, such as the Claude and ChatGPT apps or the watchdog. To try a
change on your real setup, run `node install.js` without them and then the self-check.

## Tools

- `node tools/record-demo.js` records `docs/demo.gif` from a throwaway demo deck with neutral example sessions. It needs
  Edge or Chrome and never reads your real setup.
- `bash tools/mac-ui-probe.sh ChatGPT` lists how a macOS app exposes its window to accessibility tools. It only reads
  what's on screen and saves the result to your Desktop, to help add chat support for that app.

## Principles

- **No dependencies.** Everything runs on Node.js and what the operating system provides. Please don't add packages.
- **Everything stays local.** No accounts, no analytics, no outside services beyond the weather and fonts.
- **Risky actions stay in the apps.** Deletes, pushes, sending and publishing never get buttons on the deck.
- **No personal data in the repository.** Examples use neutral names; personal settings live in `config.json`,
  which is never committed.
- **Calm by default.** Motion and sound only where they mean something, so the deck stays light on CPU and attention.
