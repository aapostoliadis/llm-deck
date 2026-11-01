# LLM Deck

A touch dashboard for everything your AI tools are doing. LLM Deck shows your Claude Code
sessions, Claude and ChatGPT desktop chats, and Codex threads as cards, each with a small mascot
whose outfit tells you the state at a glance:

- **Headphones and a laptop**: working
- **A bell**: waiting for you (a permission request or a question)
- **Glasses and a cap**: a new result is ready
- **A nightcap**: idle
- **A bandage**: something failed

It was built for a small touch screen sitting under a main monitor, so you never have to click
through windows to see which session finished and which one needs you.

## What it does

- Four columns: **Pinned**, **Waiting for you**, **New result** and **Background**, with cards
  grouped by project.
- **Tap** a card to jump straight to that session, chat or thread in its app. **Double-tap** a
  Claude Code or Codex card to read its last reply without switching windows.
- **Allow or Deny** safe permission requests right on the card. Risky ones (deletes, pushes,
  sending, publishing) always go to the app.
- **Quick replies** such as "Yes, continue", typed into the right conversation for you.
- Your **Claude and Codex usage limits**, with a forecast of when you'd hit them at the current pace.
- A soft chime when something needs you, quiet hours, night dimming, a weekly summary per project,
  an overnight digest, backups, a built-in self-test, and optional access from your phone on the
  same Wi-Fi via a private link.

## Requirements

- Windows 10 or 11 (the core dashboard also runs on macOS and Linux, without the desktop-app features)
- [Node.js](https://nodejs.org) 22.5 or newer
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
- Optional: the Claude, ChatGPT and Codex desktop apps, and Microsoft Edge for the full-screen window

## Install

    git clone https://github.com/aapostoliadis/llm-deck.git
    cd llm-deck
    node install.js

The installer copies the program to `%USERPROFILE%\.claude-deck`, registers the Claude Code hooks
(saving a backup of your Claude Code settings first), creates **LLM Deck** shortcuts on the desktop
and for start at login, and starts the deck. Running it again is safe: your settings are kept.

Check that everything works:

    node "%USERPROFILE%\.claude-deck\selfcheck.js"

## Settings

Everything adjustable is in the deck's **Settings** panel: project groups (with suggestions based on
your recent work), quiet hours, quick replies, permission buttons, the screen, phone access and
backups. Every setting and its default is listed in `defaults.js`; your choices are saved in
`config.json` in the install folder.

## How it works

The deck reads Claude Code's session files and hook events, Codex's local thread records, the
sidebars of the Claude and ChatGPT desktop apps through Windows UI Automation, and the notifications
those apps send to Windows. Everything stays on your computer; the only outside requests are the
weather and the dashboard's fonts.

## Notes

LLM Deck is an independent project, not affiliated with or endorsed by Anthropic or OpenAI.
The Claude and ChatGPT icons shown on cards are copied at install time from the apps already
installed on your computer and are not part of this repository.

## Remove

Delete the LLM Deck shortcuts, remove the hook entries that mention `claude-deck` from your Claude
Code `settings.json` (or restore the `.before-llm-deck.bak` copy next to it), and delete the
`%USERPROFILE%\.claude-deck` folder.
