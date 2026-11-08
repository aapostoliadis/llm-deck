// LLM Deck: adds or removes the deck's Codex approval hook in ~/.codex/hooks.json, leaving any other hooks alone.
const MARK = 'claude-deck';
const ours = h => String((h && h.command) || '').includes(MARK);

function add(cfg, command, timeout) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  c.hooks = c.hooks || {};
  const list = (c.hooks.PermissionRequest || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !ours(h)) })).filter(g => g.hooks.length);
  list.push({ matcher: '*', hooks: [{ type: 'command', command, timeout: timeout || 660 }] });
  c.hooks.PermissionRequest = list;
  return c;
}

function remove(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  let removed = 0;
  for (const ev of Object.keys(c.hooks || {})) {
    removed += (c.hooks[ev] || []).reduce((n, g) => n + (g.hooks || []).filter(ours).length, 0);
    c.hooks[ev] = (c.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !ours(h)) })).filter(g => g.hooks.length);
    if (!c.hooks[ev].length) delete c.hooks[ev];
  }
  if (c.hooks && !Object.keys(c.hooks).length) delete c.hooks;
  return { cfg: c, removed };
}

module.exports = { add, remove };
