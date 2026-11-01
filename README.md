<p align="center">
  <img src="public/icons/llm-deck-128.png" width="104" height="104" alt="LLM Deck icon">
</p>

<h1 align="center">LLM Deck</h1>

<p align="center">
  <strong>A touch dashboard for everything your AI tools are doing.</strong><br>
  Claude Code sessions, Claude and ChatGPT chats, and Codex threads on one screen,<br>
  each with a little mascot that tells you its state at a glance.
</p>

<p align="center">
  <img alt="Platform: Windows 10 and 11" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-4F7BF2">
  <img alt="Node.js 22.5 or newer" src="https://img.shields.io/badge/node-%E2%89%A5%2022.5-2AA87F">
  <img alt="Works with Claude Code, Claude, ChatGPT and Codex" src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Claude%20%C2%B7%20ChatGPT%20%C2%B7%20Codex-EE9F25">
  <img alt="No cloud service, runs locally" src="https://img.shields.io/badge/runs-locally-9C98BC">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
    <img src="docs/screenshot-light.png" width="900" alt="LLM Deck showing pinned, waiting, new result and background cards with mascots">
  </picture>
</p>

## Why

When several AI sessions run at once, you end up clicking through windows to see which one finished
and which one is waiting for you. LLM Deck was built for a small touch screen under the main monitor:
one glance shows what every session is doing, and one tap takes you straight to it.

## The mascots

<p align="center">
  <img src="docs/mascots.svg" width="750" alt="Five mascots: headphones and laptop for working, a bell for waiting, glasses and a cap for a new result, a nightcap for idle, a bandage for failed">
</p>

| Mascot | State | When |
|---|---|---|
| Headphones and a laptop | **Working** | A session is running, or a chat is writing its reply |
| A bell | **Waiting for you** | A permission request or a question needs your answer |
| Glasses and a cap | **New result** | Work finished while you were elsewhere |
| A nightcap | **Idle** | Nothing happening |
| A bandage | **Failed** | A session ended on an error |

## Features

- 🗂️ **Four columns**: Pinned, Waiting for you, New result and Background, grouped by project.
- 👆 **One tap** opens that exact session, chat or thread in its own app.
- 👀 **Double-tap** a Claude Code or Codex card to read its last reply without switching windows.
- ✅ **Allow or Deny** safe permission requests right on the card. Risky ones (deletes, pushes, sending, publishing) always go to the app.
- 💬 **Quick replies** such as "Yes, continue", typed into the right conversation for you.
- 📈 **Usage limits** for Claude and Codex, with a forecast of when you'd hit them at the current pace.
- 🔔 **A soft chime** when something needs you, a reminder if it waits too long, and quiet hours.
- 🌙 **Night mode and dimming** on a schedule, with a gentle shift to protect the screen.
- 📅 **This week** and **Overnight** summaries per project.
- 🧭 **Project groups**, with suggestions based on your recent work.
- 📱 **Phone access** on the same Wi-Fi through a private link.
- 💾 **Backups**, a built-in **self-test**, and a watchdog that restarts the deck if it stops.

## Gestures

| Gesture | On a card |
|---|---|
| Tap | Open the session, chat or thread |
| Double-tap | Peek at the last reply (Claude Code and Codex) |
| Press and hold | Pin or unpin its project |
| Swipe a result | Mark it as seen |
| Swipe an idle card | Hide it (Settings brings hidden cards back) |
| Tap a project heading | Show only that project; tap again for everything |
| Tap **+** on a heading | Start a new Claude Code session for that project |

Press **F11** to switch the deck between full screen and a window.

## Requirements

- Windows 10 or 11. The core dashboard also runs on macOS and Linux, without the desktop-app features.
- [Node.js](https://nodejs.org) 22.5 or newer.
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).
- Optional: the Claude, ChatGPT and Codex desktop apps, and Microsoft Edge for the full-screen window.

## Install

```
git clone https://github.com/aapostoliadis/llm-deck.git
cd llm-deck
node install.js
```

The installer copies the program to `%USERPROFILE%\.claude-deck`, registers the Claude Code hooks
(saving a backup of your Claude Code settings first), creates **LLM Deck** shortcuts on the desktop
and for start at login, and starts the deck. It opens full screen on the smaller of your displays.

To update, pull the latest version and run `node install.js` again. Your settings are kept.

Check that everything works:

```
node "%USERPROFILE%\.claude-deck\selfcheck.js"
```

## Settings

Everything adjustable is in the deck's **Settings** panel: project groups, quiet hours, quick replies,
permission buttons, the screen, phone access, backups and the self-test. Every setting and its default
is listed in [`defaults.js`](defaults.js); your own choices are saved in `config.json` in the install folder.

## Phone access

Switch on **Settings › Phone** and scan the QR code with your phone on the same Wi-Fi. If the phone
can't connect, Windows Firewall is blocking it: allow **Node.js** on **private** networks only, either
in the prompt Windows shows or in Windows Security › Firewall & network protection › Allow an app
through firewall, and make sure your Wi-Fi's network profile is set to Private. Keep the link to
yourself, since anyone with it on your network can approve requests.

## Privacy

Everything runs on your computer. The deck reads Claude Code's session files and hook events, Codex's
local thread records, the sidebars of the Claude and ChatGPT desktop apps through Windows UI Automation,
and the notifications those apps send to Windows. Nothing is sent anywhere; the only outside requests
are the weather ([Open-Meteo](https://open-meteo.com)) and the dashboard's fonts. Backups never include
the private phone link.

## Troubleshooting

| Problem | What to do |
|---|---|
| The phone can't connect | Allow Node.js through Windows Firewall on private networks, as described above. |
| Taps on the touch screen land on the other monitor | Search Start for **Calibrate the screen for pen or touch input**, choose **Setup** and tap the touch screen. |
| Chat cards stop updating after an app update | The left panel says so. Please open an issue with the app's version. |
| ChatGPT cards look out of date | The deck can only read ChatGPT while its window is open; minimised is fine. |
| Something else looks wrong | Run the self-check and **Settings › Run self-test**, then open an issue with the results. |

## How it's built

| File | What it does |
|---|---|
| `server.js` | Local web server: gathers every source into cards and serves the dashboard |
| `hook.js`, `perm-hook.js` | Claude Code hooks for session events and permission requests |
| `codex.js` | Reads Codex threads and limits |
| `chat-watch.ps1`, `notif.js` | Read the Claude and ChatGPT desktop apps and their Windows notifications |
| `focus-*.ps1`, `reply.ps1` | Open the right session or chat, and type quick replies |
| `extras.js`, `v3.js`, `suggest.js`, `backup.js` | Permissions, settings, phone access, group suggestions, backups |
| `watchdog.ps1`, `open-deck.ps1`, `start-deck.vbs` | Keep it running and open the full-screen window |
| `public/` | The dashboard itself: `index.html`, `deck.css`, `deck.js` and the icons |
| `selfcheck.js`, `defaults.js`, `install.js` | Automated checks, default settings, installer |

## Uninstall

Delete the LLM Deck shortcuts, remove the hook entries that mention `claude-deck` from your Claude Code
`settings.json` (or restore the `.before-llm-deck.bak` copy next to it), and delete the
`%USERPROFILE%\.claude-deck` folder.

## Notes

LLM Deck is an independent project, not affiliated with or endorsed by Anthropic or OpenAI. The Claude
and ChatGPT icons shown on cards are copied at install time from the apps already installed on your
computer and are not part of this repository.
