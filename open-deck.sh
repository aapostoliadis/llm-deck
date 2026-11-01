#!/bin/bash
# LLM Deck (macOS): open the dashboard full screen, on the smaller display when there are two.
# Uses Chrome, Edge or Brave in app mode when installed, otherwise the default browser.
PORT="${LLM_DECK_PORT:-7777}"
URL="http://localhost:$PORT"
DECK="$HOME/.claude-deck"
for i in $(seq 1 30); do curl -s -o /dev/null "$URL" && break; sleep 2; done

# x,y,width,height of the smallest screen in top-left coordinates (empty with one screen)
GEOM=$(osascript -l JavaScript -e '
ObjC.import("AppKit");
var s = $.NSScreen.screens, main = s.objectAtIndex(0).frame, best = null;
for (var i = 0; i < s.count; i++) {
  var f = s.objectAtIndex(i).frame, a = f.size.width * f.size.height;
  if (!best || a < best.a) best = { a: a, x: f.origin.x, y: main.size.height - (f.origin.y + f.size.height), w: f.size.width, h: f.size.height };
}
s.count > 1 ? [best.x, best.y, best.w, best.h].map(Math.round).join(",") : "";' 2>/dev/null)

for APP in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
  if [ -d "/Applications/$APP.app" ]; then
    ARGS=(--user-data-dir="$DECK/browser-profile" --no-first-run --no-default-browser-check --disable-extensions
          --autoplay-policy=no-user-gesture-required --app="$URL" --start-fullscreen)
    if [ -n "$GEOM" ]; then
      IFS=, read -r X Y W H <<< "$GEOM"
      ARGS+=(--window-position="$((X + W / 8)),$((Y + H / 8))" --window-size="$((W * 3 / 4)),$((H * 3 / 4))")
    fi
    open -na "$APP" --args "${ARGS[@]}"
    exit 0
  fi
done
open "$URL"
