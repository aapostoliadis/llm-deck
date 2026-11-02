#!/bin/bash
# LLM Deck (macOS): shows how an app exposes its window to accessibility tools, so chat support can be built.
# Read-only: it only lists what's on screen. Terminal needs Accessibility access (System Settings > Privacy & Security).
# Usage: bash tools/mac-ui-probe.sh [ChatGPT]   -> writes ~/Desktop/llm-deck-ui-probe.txt
APP="${1:-ChatGPT}"
OUT="$HOME/Desktop/llm-deck-ui-probe.txt"
SCRIPT="$(mktemp -t llmdeck).js"
cat > "$SCRIPT" <<'JXA'
function run(argv) {
  var app = argv[0];
  var se = Application('System Events');
  if (!se.processes.whose({ name: app }).length) return app + ' is not running. Open it with a chat visible, then run this again.';
  var proc = se.processes.byName(app);
  if (!proc.windows.length) return app + ' has no open window.';
  var out = [app + ' window: ' + proc.windows[0].name()], n = 0;
  function walk(el, depth) {
    if (n >= 800 || depth > 16) return;
    var role = '', name = '', desc = '', val = '';
    try { role = el.role(); } catch (e) {}
    try { name = el.name() || ''; } catch (e) {}
    try { desc = el.description() || ''; } catch (e) {}
    try { var v = el.value(); val = v === null || v === undefined ? '' : String(v); } catch (e) {}
    out.push(new Array(depth + 1).join('  ') + role + ' | ' + String(name).slice(0, 70) + ' | ' + String(desc).slice(0, 50) + ' | ' + val.slice(0, 50));
    n++;
    var kids = []; try { kids = el.uiElements(); } catch (e) {}
    for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
  }
  walk(proc.windows[0], 0);
  return out.join('\n');
}
JXA
echo "Reading the $APP window (this can take up to a minute)..."
osascript -l JavaScript "$SCRIPT" "$APP" > "$OUT" 2>&1
rm -f "$SCRIPT"
echo "Saved $OUT ($(wc -l < "$OUT" | tr -d ' ') lines). Share it in an issue or with whoever is building chat support."
