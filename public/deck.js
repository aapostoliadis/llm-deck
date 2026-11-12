/* LLM Deck dashboard */
(() => {
  const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const REMOTE = !LOCAL && (/^(\d{1,3}\.){3}\d{1,3}$/.test(location.hostname) || /\.local$/.test(location.hostname));
  const LIVE = LOCAL || REMOTE;
  const $ = id => document.getElementById(id);
  const M = 60e3, H = 60 * M;

  /* ---------- theme ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const paintTheme = () => { $('theme').innerHTML = isDark() ? sun + 'Day mode' : moon + 'Night mode'; };
  const saved = store.get('deck-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  paintTheme();
  $('theme').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.set('deck-theme', next); paintTheme();
  });

  /* ---------- clock ---------- */
  const tick = () => {
    const d = new Date();
    $('clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  tick(); setInterval(tick, 1000);

  /* ---------- helpers ---------- */
  const ago = ms => {
    const m = Math.max(0, Math.round(ms / M));
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${Math.floor(h / 24)}d`;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (() => { let t; return msg => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 2200); }; })();

  /* ---------- mascot ---------- */
  const base = `
    <ellipse class="body" cx="28" cy="62" rx="5" ry="2.6"/>
    <ellipse class="body" cx="44" cy="62" rx="5" ry="2.6"/>
    <ellipse class="body" cx="36" cy="45" rx="20.5" ry="18"/>
    <circle cx="24" cy="50" r="2.6" fill="#FF8FA3" opacity=".35"/>
    <circle cx="48" cy="50" r="2.6" fill="#FF8FA3" opacity=".35"/>`;
  const eyesOpen = (y = 43, r = 2.4) => `<circle class="ink" cx="29" cy="${y}" r="${r}"/><circle class="ink" cx="43" cy="${y}" r="${r}"/>`;
  const outfits = {
    working: `<g class="who">${base}
        <circle class="ink" cx="29" cy="44" r="2.1"/><circle class="ink" cx="43" cy="44" r="2.1"/>
        <path class="acc-line" d="M15.5 44 C15.5 17 56.5 17 56.5 44" stroke-width="3.4"/>
        <rect class="acc" x="11" y="38" width="8" height="13" rx="4"/>
        <rect class="acc" x="53" y="38" width="8" height="13" rx="4"/></g>
      <rect x="20" y="49" width="32" height="16" rx="2.5" fill="var(--laptop)"/>
      <circle cx="36" cy="57" r="2" fill="var(--gear-soft)" opacity=".8"/>
      <rect class="acc" x="15" y="64" width="42" height="3.2" rx="1.6"/>`,
    waiting: `${base}${eyesOpen(42, 2.9)}
      <circle cx="30" cy="41" r=".9" fill="#fff"/><circle cx="44" cy="41" r=".9" fill="#fff"/>
      <ellipse class="ink" cx="36" cy="52" rx="2.2" ry="2.6"/>
      <g class="bell">
        <circle cx="56" cy="5.5" r="1.8" fill="var(--bell)"/>
        <path d="M48 20 C48 10 51 6.5 56 6.5 C61 6.5 64 10 64 20 L66.5 22.5 L45.5 22.5 Z" fill="var(--bell)"/>
        <circle cx="56" cy="25" r="2.4" fill="var(--bell)"/>
      </g>
      <circle cx="66" cy="8" r="6.2" fill="var(--alert)"/>
      <rect x="65" y="3.6" width="2" height="5.6" rx="1" fill="#fff"/><circle cx="66" cy="11.6" r="1.1" fill="#fff"/>`,
    ready: `${base}
      <circle cx="29" cy="43" r="5.6" fill="#fff" opacity=".28"/><circle cx="43" cy="43" r="5.6" fill="#fff" opacity=".28"/>
      ${eyesOpen(43, 2)}
      <circle class="stroke" cx="29" cy="43" r="5.6" stroke-width="2"/><circle class="stroke" cx="43" cy="43" r="5.6" stroke-width="2"/>
      <path class="stroke" d="M34.6 42.4 Q36 41.4 37.4 42.4" stroke-width="2"/>
      <path class="stroke" d="M31 51 Q36 55.5 41 51" stroke-width="2.2"/>
      <path d="M16.5 34 C16.5 17.5 55.5 17.5 55.5 34 Z" class="acc"/>
      <path d="M50 32 L67 34.5 Q67.5 37.8 63 37.8 L50 36 Z" class="acc"/>
      <circle cx="36" cy="20.5" r="2.2" fill="var(--ready)"/>
      <path class="spark" d="M64 14 l1.4 3.2 3.2 1.4 -3.2 1.4 -1.4 3.2 -1.4 -3.2 -3.2 -1.4 3.2 -1.4 Z" fill="var(--bell)"/>`,
    idle: `${base}
      <path class="stroke" d="M26 44 Q29 46.5 32 44" stroke-width="2.2"/>
      <path class="stroke" d="M40 44 Q43 46.5 46 44" stroke-width="2.2"/>
      <path class="stroke" d="M34 52 Q36 53 38 52" stroke-width="2"/>
      <path d="M17 31 Q20 13 42 11.5 Q58 11 63 26 L59.5 28 Q56 20 50 21.5 L55.5 31 Z" fill="var(--working)" opacity=".85"/>
      <rect x="15" y="29" width="42" height="6.5" rx="3.25" fill="#F4F6FA"/>
      <circle cx="61.5" cy="28.5" r="4" fill="#F4F6FA"/>
      <text class="z acc" x="60" y="12" font-size="9" font-weight="700" font-family="var(--display)">z</text>
      <text class="z z2 acc" x="65" y="6" font-size="7" font-weight="700" font-family="var(--display)">z</text>`
  };
  const mascot = st => `<svg class="mascot" viewBox="0 0 72 72" aria-hidden="true">${outfits[st] || outfits.idle}</svg>`;
  const pinIcon = '<svg class="pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 3l6 6-3 1-4 4 1 5-2 1-4-4-5 5-1-1 5-5-4-4 1-2 5 1 4-4z"/></svg>';

  const tags = { codex: ['Codex', 'codex'], chatgpt: ['ChatGPT', 'chatgpt'], 'claude-chat': ['Claude chat', 'claude-chat'], claude: ['Claude Code', ''] };
  // app icons are copied from your installed apps by the installer; a missing one is simply left out
  const icoPair = n => '<img class="app-ico on-light" src="/icons/' + n + '-light.png" alt="" onerror="this.remove()"><img class="app-ico on-dark" src="/icons/' + n + '-dark.png" alt="" onerror="this.remove()">';
  const icoFor = a => a === 'codex' ? icoPair('codex') : a === 'chatgpt' ? icoPair('chatgpt')
    : '<img class="app-ico" src="/icons/claude.png" alt="" onerror="this.remove()">';
  const tagFor = a => { const t = tags[a] || tags.claude; return '<b class="app ' + t[1] + '">' + icoFor(a) + t[0] + '</b>'; };
  const isChat = s => s.app === 'claude-chat' || s.app === 'chatgpt';
  const statusText = (s, now) => {
    if (s.perm) return (s.perm.kind === 'question' ? 'Has a question for you' : 'Wants to use ' + s.perm.tool) + ', ' + ago(now - s.since);
    if (s.state === 'failed') { const a = ago(now - s.since); return 'Failed' + (s.detail ? ': ' + s.detail : '') + (a === 'just now' ? ', just now' : ', ' + a + ' ago'); }
    if (s.state === 'ready' && s.summary) { const a = ago(now - s.since); return (a === 'just now' ? 'Ready just now' : 'Ready ' + a + ' ago') + ': ' + s.summary; }
    if (isChat(s) && s.state === 'idle') return 'No unread replies';
    if (isChat(s) && s.state === 'ready') return 'New reply' + (s.detail ? ', ' + s.detail : '');
    if (isChat(s) && s.state === 'working') return 'Writing a reply';
    const d = now - s.since;
    if (s.state === 'working') return `Working for ${ago(d)}`;
    if (s.state === 'waiting') return `${s.detail || 'Needs your decision'}, ${ago(d)}`;
    if (s.state === 'ready') return `Ready ${ago(d) === 'just now' ? 'just now' : ago(d) + ' ago'}${s.detail ? ', ' + s.detail.toLowerCase() : ''}`;
    { const a = ago(now - s.lastTs); return s.ended ? (a === 'just now' ? 'Closed just now' : `Closed ${a} ago`) : (a === 'just now' ? 'Idle just now' : `Idle for ${a}`); }
  };
  const label = { working: 'working', waiting: 'waiting for you', ready: 'result ready', idle: 'idle' };

  /* ---------- v2: permissions, swipe, alerts, tidy, groups, health ---------- */
  let OLDER_H = 3, showOlder = false, swipeCard = null, swiped = false, sx = 0, sy = 0;
  const questionBlock = s => '<span class="perm question"><span class="perm-q">' + esc(s.perm.question || s.perm.summary) + '</span><span class="qopts">'
    + (s.perm.options || []).map(o => '<span class="qbtn" role="button" data-act="answer" data-req="' + esc(s.perm.id) + '" data-label="' + esc(o) + '">' + esc(o) + '</span>').join('')
    + '<span class="qbtn app" role="button" data-act="ask" data-req="' + esc(s.perm.id) + '">Answer in app</span></span></span>';
  const permBlock = s => s.perm.kind === 'question' ? questionBlock(s) : '<span class="perm"><span class="perm-sum">' + esc(s.perm.summary) + '</span>'
    + '<span class="perm-actions"><span class="pbtn allow" role="button" data-act="allow" data-req="' + esc(s.perm.id) + '">Hold to allow</span>'
    + '<span class="pbtn deny" role="button" data-act="deny" data-req="' + esc(s.perm.id) + '">Deny</span></span></span>';

  const arrange = (g, list, now) => {
    let items = list, older = [];
    if (g === 'background') {
      const cut = now - OLDER_H * 3600e3;
      const recent = s => s.state !== 'idle' || s.lastTs >= cut;
      items = list.filter(recent); older = list.filter(s => !recent(s));
      if (showOlder) items = items.concat(older);
    }
    const order = [], buckets = {};
    for (const s of items) { const k = s.group || ''; if (!buckets[k]) { buckets[k] = []; order.push(k); } buckets[k].push(s); }
    const named = order.filter(k => k);
    const keys = named.concat(order.includes('') ? [''] : []);
    const out = [];
    for (const k of keys) {
      if (named.length) out.push({ __html: '<div class="grp" role="button" data-g="' + esc(k || 'Other') + '">' + esc(k || 'Other') + (focusGroup ? ', tap to show all' : '') + (LOCAL && k ? '<span class="grp-new" role="button" data-new="' + esc(k) + '" aria-label="New session">+</span>' : '') + '</div>' });
      out.push(...buckets[k]);
    }
    if (older.length) out.push({ __html: '<button class="more" type="button">' + (showOlder ? 'Hide older' : 'Show older (' + older.length + ')') + '</button>' });
    return out;
  };

  async function dismissCard(id) {
    const s = sessions.find(x => x.id === id); if (!s) return;
    if (String(id).startsWith('selftest')) { testCards = testCards.filter(x => x.id !== id); sessions = sessions.filter(x => x.id !== id); setTimeout(() => render(), 260); return selfTestEvent(s.state === 'idle' ? 'hide' : 'swipe'); }
    if (s.state === 'idle') return hideCard(s);
    const key = isChat(s) ? (s.detail || '') : String(s.since);
    s.state = 'idle';
    setTimeout(() => render(), 260);
    if (!LIVE) return toast('Marked as seen');
    try { await fetch('/api/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, key }) }); } catch (_) {}
  }

  async function answerPerm(req, decision, label) {
    if (String(req).startsWith('selftest')) { toast(decision === 'allow' ? 'Allowed' : 'Denied'); return selfTestEvent('perm'); }
    toast(decision === 'answer' ? 'Answered: ' + label : decision === 'ask' ? 'Handed back to the app' : decision === 'allow' ? 'Allowed' : 'Denied');
    if (!LIVE) return;
    try { await fetch('/api/perm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ req, decision, label }) }); poll(); }
    catch (_) { toast('Could not reach the LLM Deck server'); }
  }

  const appNames = { claude: 'Claude', chatgpt: 'ChatGPT' };
  const upd = k => { const u = (window.__appUpdates || {})[k]; return u && u.changedAt && Date.now() - u.changedAt < 48 * 3600e3 ? ' This started after the app updated to version ' + u.version + '.' : ''; };
  function renderHealth(h) {
    const msgs = [];
    for (const k of Object.keys(h || {})) {
      if (h[k] === 'closed') msgs.push(appNames[k] + ' has no open window, so its chat cards may be out of date.');
      else if (h[k] === 'stopped') msgs.push('The chat reader has stopped, so ' + appNames[k] + ' cards may be out of date.');
      else if (h[k] === 'nosidebar') msgs.push('The deck can\u2019t read the ' + appNames[k] + ' sidebar any more, so its chat cards may be out of date.' + upd(k));
      else if (h[k] === 'nocomposer') msgs.push('Quick replies can\u2019t find the ' + appNames[k] + ' message box.' + upd(k));
      else if (h[k] === 'error') msgs.push('The deck can\u2019t read the ' + appNames[k] + ' app right now.');
    }
    const el = $('health'); if (!el) return;
    el.hidden = !msgs.length; el.textContent = [...new Set(msgs)].join(' ');
  }

  let prevWaiting = null, actx = null;
  function inQuiet(spec) {
    const m = String(spec || '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/); if (!m) return false;
    const n = new Date(), cur = n.getHours() * 60 + n.getMinutes(), a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
  }
  function chime() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      [[880, 0], [1318.5, 0.18]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
        o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.65);
      });
    } catch (_) {}
  }
  document.addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (_) {} }, { once: true });
  function alertCheck(deck) {
    if (deck.olderHours) OLDER_H = deck.olderHours;
    const cur = new Set(sessions.filter(s => s.state === 'waiting' || s.state === 'failed').map(s => s.id + (s.perm ? ':' + s.perm.id : '')));
    if (prevWaiting && [...cur].some(k => !prevWaiting.has(k))) {
      document.body.classList.remove('alerting'); void document.body.offsetWidth; document.body.classList.add('alerting');
      if (deck.sound !== false && !inQuiet(deck.quietHours)) chime();
    }
    prevWaiting = cur;
  }

  /* ---------- v3: replies, focus, forecast, peek, digest, settings, screen care, phone ---------- */
  let QUICK = [], focusGroup = null, DECK = {}, pageVersion = null, tapTimer = null, tapId = null;
  let lastActivity = Date.now(), wakeUntil = 0, wasDown = false, swallowClick = false;

  const replyChips = s => {
    if (!LIVE || s.perm || !QUICK.length || !['ready', 'waiting'].includes(s.state)) return '';
    return '<span class="chips">' + QUICK.map(t => '<span class="chip" role="button" data-reply="' + esc(t) + '">' + esc(t) + '</span>').join('') + '</span>';
  };

  async function sendReply(id, text) {
    toast('Sending \u201c' + text + '\u201d');
    if (!LIVE) return;
    try {
      const r = await fetch('/api/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast(j.error || 'Couldn\u2019t send that reply');
    } catch (_) { toast('Could not reach the LLM Deck server'); }
  }

  function updateFocusBar() {
    const el = $('focusBar'); if (!el) return;
    el.hidden = !focusGroup;
    el.textContent = focusGroup ? 'Showing ' + focusGroup + ' only. Tap here to show everything.' : '';
  }

  function forecastText(pct, reset, windowH, fallback) {
    if (!reset) return fallback;
    const now = Date.now(), base = 'Resets in ' + ago(reset - now);
    if (pct >= 100) return 'Full. ' + base;
    const start = reset - windowH * 3600e3, used = now - start;
    if (pct < 3 || used < 10 * 60e3) return base;
    const eta = start + used * (100 / pct);
    if (eta >= reset) return base + ', on pace to last';
    const d = new Date(eta), t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const when = d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + t;
    return 'At this pace, full by ' + when + '. ' + base;
  }

  function openModal(html, onReady) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back'; back.id = 'modalBack';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(back);
    if (onReady) onReady(back);
  }
  function closeModal() { const m = $('modalBack'); if (m) m.remove(); }

  async function peek(id) {
    const s = sessions.find(x => x.id === id); if (!s) return;
    if (String(id).startsWith('selftest')) { selfTestEvent('peek'); return openModal('<h3>Self-test</h3><p class="sub">Double-tap works.</p><div class="peek-text">This is where a session\u2019s last reply appears.</div><div class="modal-actions"><button type="button" class="primary" data-close>Close</button></div>'); }
    openModal('<h3>' + esc(s.title) + '</h3><p class="sub">Loading the last reply\u2026</p>');
    let p = null;
    if (LIVE) { try { p = (await (await fetch('/api/peek?id=' + encodeURIComponent(id))).json()).peek; } catch (_) {} }
    else p = { text: 'The session\u2019s last reply appears here.', at: Date.now() };
    const a = p ? ago(Date.now() - p.at) : '';
    const body = p ? '<p class="sub">Last reply, ' + (a === 'just now' ? a : a + ' ago') + '</p><div class="peek-text">' + esc(p.text) + '</div>' : '<p class="sub">No reply yet.</p>';
    openModal('<h3>' + esc(s.title) + '</h3>' + body + '<div class="modal-actions"><button type="button" data-close>Close</button>'
      + (REMOTE ? '' : '<button type="button" class="primary" id="peekOpen">Open</button>') + '</div>',
      back => { const b = back.querySelector('#peekOpen'); if (b) b.addEventListener('click', () => { closeModal(); openSession(id); }); });
  }

  function routeTap(card) {
    const id = card.dataset.id, s = sessions.find(x => x.id === id);
    if (s && (s.app === 'claude' || s.app === 'codex')) {
      if (tapTimer && tapId === id) { clearTimeout(tapTimer); tapTimer = null; return peek(id); }
      clearTimeout(tapTimer); tapId = id;
      tapTimer = setTimeout(() => { tapTimer = null; REMOTE ? peek(id) : openSession(id); }, 280);
      return;
    }
    if (REMOTE) return toast('Chats open on your PC');
    openSession(id);
  }

  function quietWindow(spec) {
    const m = String(spec || '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/); if (!m) return null;
    const now = new Date(), end = new Date(now); end.setHours(+m[3], +m[4], 0, 0);
    if (end > now) end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setHours(+m[1], +m[2], 0, 0);
    if (start >= end) start.setDate(start.getDate() - 1);
    return { start: start.getTime(), end: end.getTime() };
  }
  function showDigest(auto) {
    const w = quietWindow(DECK.quietHours || '23:00-07:00');
    const items = [];
    if (w) {
      const inW = t => t >= w.start && t <= w.end + 30 * 60e3;
      for (const s of sessions) {
        if (s.state === 'waiting' && inW(s.since)) items.push([s, 'Needs you']);
        else if (s.state === 'ready' && inW(s.since)) items.push([s, 'Finished']);
        else if ((s.app === 'claude' || s.app === 'codex') && inW(s.lastTs)) items.push([s, s.state === 'working' ? 'Still running' : 'Ran overnight']);
      }
    }
    if (auto && !items.length) return;
    const fmt = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const list = items.length ? items.map(([s, what]) => '<div class="digest-item"><b>' + esc(s.title) + '</b><span>' + what + '</span></div>').join('') : '<p class="sub">Nothing happened overnight.</p>';
    openModal('<h3>Overnight</h3><p class="sub">' + (w ? fmt(w.start) + ' to ' + fmt(w.end) : '') + '</p>' + list + '<div class="modal-actions"><button type="button" class="primary" data-close>Done</button></div>');
  }
  function maybeAutoDigest() {
    const w = quietWindow(DECK.quietHours || ''); if (!w) return;
    const now = Date.now(), today = new Date().toDateString();
    if (now < w.end || now > w.end + 5 * 3600e3 || store.get('deck-digest') === today) return;
    store.set('deck-digest', today);
    showDigest(true);
  }

  function loadScript(src) { return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); }
  async function openSettings() {
    if (!LIVE) return toast('Settings work on the live deck');
    let data; try { data = await (await fetch('/api/config')).json(); } catch (_) { return toast('Could not reach the LLM Deck server'); }
    const c = data.config || {};
    const [qa, qb] = String(c.quietHours || '23:00-07:00').split('-').map(t => t.padStart(5, '0'));
    const replies = (c.quickReplies || []).slice(0, 6); while (replies.length < 4) replies.push('');
    const grpRow = (n, k) => '<div class="grp-row"><input type="text" class="g-name" value="' + esc(n) + '" placeholder="Project name"><input type="text" class="g-keys" value="' + esc(k) + '" placeholder="Keywords, separated by commas"><button type="button" class="icon-btn g-del" aria-label="Remove group">\u00d7</button></div>';
    const html = '<h3>Settings</h3><p class="sub">Changes apply as soon as you save.</p>'
      + '<div class="set-sec"><h4>Alerts</h4><div class="set-row"><label><input type="checkbox" id="sUsage"> Check Claude limits every 5 minutes with my Claude Code sign-in</label></div><div class="set-row"><label><input type="checkbox" id="sUpd"> Tell me when a new version is out (asks GitHub once a day)</label></div><div class="set-row"><label><input type="checkbox" id="sSound"> Chime when something needs me</label></div>'
      + '<div class="set-row"><span>Quiet from</span><input type="time" id="sQa"><span>to</span><input type="time" id="sQb"></div><div class="set-row"><span>Phone alerts (ntfy topic)</span><input type="text" id="sTopic" style="flex:1;min-width:120px" maxlength="64" placeholder="Off"></div><div class="set-row"><button type="button" class="ghost" id="sTopicNew" style="flex:none;padding:0 18px">Make a private topic</button><button type="button" class="ghost" id="sTopicTest" style="flex:none;padding:0 18px">Send a test</button></div></div>'
      + '<div class="set-sec"><h4>Permission buttons</h4><div class="set-row"><label><input type="checkbox" id="sPerm"> Show Allow and Deny on the deck</label></div><div class="set-row"><label><input type="checkbox" id="sQuest"> Show an agent’s questions with its options</label></div><div class="set-row"><label><input type="checkbox" id="sDesk"> When I’m at my computer, ask me in the app instead</label></div>'
      + '<div class="set-row"><span>Wait for the deck</span><input type="number" id="sWait" min="1" max="60"><span>minutes, then ask in the app</span></div></div>'
      + '<div class="set-sec"><h4>Quick replies</h4>' + replies.map(r => '<div class="set-row"><input type="text" class="r-text" style="flex:1" maxlength="80" value="' + esc(r) + '" placeholder="Reply text"></div>').join('') + '</div>'
      + '<div class="set-sec"><h4>Background column</h4><div class="set-row"><span>Fold idle cards older than</span><input type="number" id="sOlder" min="0.5" max="72" step="0.5"><span>hours</span></div>'
      + '<div class="set-row"><span>Show</span><input type="number" id="sChats" min="0" max="50"><span>recent chats per app</span></div></div>'
      + '<div class="set-sec"><h4>Project groups</h4><div id="sGroups">' + Object.entries(c.groups || {}).map(([n, k]) => grpRow(n, k.join(', '))).join('') + '</div>'
      + '<div class="set-row"><button type="button" class="ghost" id="sAddGroup" style="flex:none;padding:0 18px">Add a group</button> <button type="button" class="ghost" id="sSuggest" style="flex:none;padding:0 18px">Suggest groups</button></div></div>'
      + '<div class="set-sec"><h4>Screen</h4><div class="set-row"><label><input type="checkbox" id="sAuto"> Night mode during quiet hours</label></div>'
      + '<div class="set-row"><label><input type="checkbox" id="sDim"> Dim during quiet hours after</label><input type="number" id="sDimMin" min="1" max="240"><span>minutes without a tap</span></div>'
      + '<div class="set-row"><label><input type="checkbox" id="sShift"> Shift the layout slightly over time</label></div><div class="set-row"><label><input type="checkbox" id="sWeather"> Show the weather</label></div></div>'
      + '<div class="set-sec"><h4>Reminders and cleanup</h4><div class="set-row"><span>Remind me again after</span><input type="number" id="sStale" min="5" max="240"><span>minutes of waiting</span></div>'
      + '<div class="set-row"><button type="button" class="ghost" id="sUnhide" style="flex:none;padding:0 18px">Show hidden cards again</button><span id="sHiddenN" class="sub" style="margin:0"></span></div>'
      + '<div class="set-row"><button type="button" class="ghost" id="sSelfTest" style="flex:none;padding:0 18px">Run self-test</button><button type="button" class="ghost" id="sUpdCheck" style="flex:none;padding:0 18px">Check for updates now</button></div></div>'
      + '<div class="set-sec"><h4>Backup</h4><div class="set-row"><button type="button" class="ghost" id="sBackup" style="flex:none;padding:0 18px">Download backup</button><button type="button" class="ghost" id="sRestore" style="flex:none;padding:0 18px">Restore from file</button><input type="file" id="sRestoreFile" accept=".json,application/json" hidden></div><p class="sub" style="margin:4px 0 0">The deck also keeps a daily backup for each day of the week.</p></div>'
      + '<div class="set-sec"><h4>Phone</h4><div class="set-row"><label><input type="checkbox" id="sRemote"> Open the deck from my phone on this Wi-Fi</label></div><div id="sPhone"></div></div>'
      + '<div class="modal-actions"><button type="button" data-close>Cancel</button><button type="button" class="primary" id="sSave">Save</button></div>';
    openModal(html, back => {
      const q = sel => back.querySelector(sel);
      q('#sSound').checked = c.alertSound !== false; q('#sUsage').checked = !!c.usageCheck; q('#sTopic').value = c.alertTopic || ''; q('#sUpd').checked = !!c.updateCheck; q('#sQa').value = qa; q('#sQb').value = qb;
      q('#sPerm').checked = c.deckPermissions !== false; q('#sQuest').checked = c.deckQuestions !== false; q('#sDesk').checked = c.deskAware !== false; q('#sWait').value = Math.round((c.permWaitSeconds || 600) / 60);
      q('#sOlder').value = c.olderHours || 3; q('#sChats').value = c.chatRecents ?? 8;
      q('#sAuto').checked = c.autoTheme !== false; q('#sDim').checked = c.dimAtNight !== false; q('#sWeather').checked = c.showWeather !== false; q('#sDimMin').value = c.dimAfterMinutes || 10;
      q('#sShift').checked = c.pixelShift !== false; q('#sRemote').checked = !!c.remoteAccess;
      q('#sStale').value = c.staleMinutes || 30; q('#sHiddenN').textContent = (data.hiddenCount || 0) + ' hidden';
      q('#sUnhide').addEventListener('click', async () => { try { await fetch('/api/unhide-all', { method: 'POST' }); } catch (_) {} q('#sHiddenN').textContent = '0 hidden'; toast('Hidden cards are back'); poll(); });
      q('#sSelfTest').addEventListener('click', () => { closeModal(); startSelfTest(); });
      q('#sUpdCheck').addEventListener('click', async () => {
        try { const r = await (await fetch('/api/update-check', { method: 'POST' })).json(); toast(!r.ok ? 'Couldn\u2019t reach GitHub' : r.newer ? 'LLM Deck ' + r.newer + ' is out: see the left panel' : 'You have the latest version (' + r.current + ')'); poll(); }
        catch (_) { toast('Couldn\u2019t reach GitHub'); }
      });
      q('#sTopicNew').addEventListener('click', () => { const b = new Uint8Array(10); crypto.getRandomValues(b); q('#sTopic').value = 'llmdeck-' + [...b].map(x => (x % 36).toString(36)).join(''); });
      q('#sTopicTest').addEventListener('click', async () => {
        const t = q('#sTopic').value.trim(); if (!/^[\w-]{1,64}$/.test(t)) return toast('Enter or make a topic first');
        try { const r = await fetch('/api/alert-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: t }) }); toast(r.ok ? 'Test alert sent' : 'Couldn\u2019t send the test alert'); } catch (_) { toast('Couldn\u2019t send the test alert'); }
      });
      q('#sBackup').addEventListener('click', async () => {
        try {
          const j = await (await fetch('/api/backup')).json();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
          a.download = 'llm-deck-backup-' + new Date().toISOString().slice(0, 10) + '.json';
          document.body.appendChild(a); a.click(); a.remove(); toast('Backup saved to your Downloads folder');
        } catch (_) { toast('Couldn\u2019t make the backup'); }
      });
      q('#sRestore').addEventListener('click', () => q('#sRestoreFile').click());
      q('#sRestoreFile').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const r = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return toast(j.error || 'Couldn\u2019t restore that file');
          closeModal(); toast('Restored. The deck restarts in a moment');
        } catch (_) { toast('That file isn\u2019t an LLM Deck backup'); }
      });
      q('#sGroups').addEventListener('click', e => { const d = e.target.closest('.g-del'); if (d) { const r = d.closest('.grp-row'); if (r.nextElementSibling && r.nextElementSibling.classList.contains('sg-why')) r.nextElementSibling.remove(); r.remove(); } });
      q('#sSuggest').addEventListener('click', async () => {
        toast('Looking at your recent work\u2026');
        try {
          const j = await (await fetch('/api/suggest-groups')).json();
          const have = new Set([...back.querySelectorAll('.g-name')].map(i => i.value.trim().toLowerCase()));
          let n = 0;
          for (const sg of (j.suggestions || [])) {
            if (have.has(sg.name.toLowerCase())) continue;
            q('#sGroups').insertAdjacentHTML('beforeend', grpRow(sg.name, sg.keywords.join(', ')));
            const r = q('#sGroups').lastElementChild; r.classList.add('suggested');
            r.insertAdjacentHTML('afterend', '<p class="sub sg-why">Suggested: ' + esc(sg.why) + '</p>'); n++;
          }
          toast(n ? 'Added ' + n + ' suggestions in green. Remove any you don\u2019t want, then Save' : 'No new groups to suggest');
        } catch (_) { toast('Could not reach the LLM Deck server'); }
      });
      q('#sAddGroup').addEventListener('click', () => { q('#sGroups').insertAdjacentHTML('beforeend', grpRow('', '')); q('#sGroups').lastElementChild.querySelector('.g-name').focus(); });
      if (c.remoteAccess && data.phone) {
        q('#sPhone').innerHTML = '<div class="phone-box"><div id="phoneQr"></div><div><p class="sub" style="margin:0 0 6px">Scan with your phone on the same Wi-Fi, or open this link. Keep it private.</p><code>' + esc(data.phone) + '</code></div></div>';
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(() => { new QRCode(q('#phoneQr'), { text: data.phone, width: 140, height: 140 }); }).catch(() => {});
      } else if (c.remoteAccess) q('#sPhone').innerHTML = '<p class="sub">Couldn\u2019t find this PC\u2019s Wi-Fi address.</p>';
      q('#sSave').addEventListener('click', async () => {
        const num = (v, lo, hi, d) => { const n = +v; return isFinite(n) && v !== '' ? Math.max(lo, Math.min(hi, n)) : d; };
        const patch = {
          alertSound: q('#sSound').checked, usageCheck: q('#sUsage').checked, updateCheck: q('#sUpd').checked, alertTopic: q('#sTopic').value.trim(), quietHours: (q('#sQa').value || '23:00') + '-' + (q('#sQb').value || '07:00'),
          deckPermissions: q('#sPerm').checked, deckQuestions: q('#sQuest').checked, deskAware: q('#sDesk').checked, permWaitSeconds: Math.round(num(q('#sWait').value, 1, 60, 10)) * 60,
          quickReplies: [...back.querySelectorAll('.r-text')].map(i => i.value.trim()).filter(Boolean),
          olderHours: num(q('#sOlder').value, 0.5, 72, 3), chatRecents: Math.round(num(q('#sChats').value, 0, 50, 8)),
          autoTheme: q('#sAuto').checked, dimAtNight: q('#sDim').checked, showWeather: q('#sWeather').checked, dimAfterMinutes: Math.round(num(q('#sDimMin').value, 1, 240, 10)),
          pixelShift: q('#sShift').checked, remoteAccess: q('#sRemote').checked, staleMinutes: Math.round(num(q('#sStale').value, 5, 240, 30)), groups: {}
        };
        back.querySelectorAll('.grp-row').forEach(r => {
          const n = r.querySelector('.g-name').value.trim(), k = r.querySelector('.g-keys').value.split(',').map(x => x.trim()).filter(Boolean);
          if (n && k.length) patch.groups[n] = k;
        });
        try {
          const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return toast(j.error || 'Couldn\u2019t save');
          closeModal(); toast(j.restarting ? 'Saved. The deck restarts for phone access' : 'Saved'); poll();
        } catch (_) { toast('Could not reach the LLM Deck server'); }
      });
    });
  }

  function screenCare() {
    const quiet = inQuiet(DECK.quietHours) || Date.now() < forceQuietUntil;
    if (DECK.autoTheme && Date.now() >= forceQuietUntil) {
      const want = quiet ? 'dark' : 'light', last = store.get('deck-auto-theme');
      if (last && last !== want) { document.documentElement.dataset.theme = want; store.set('deck-theme', want); paintTheme(); }
      if (last !== want) store.set('deck-auto-theme', want);
    }
    const waiting = sessions.some(s => s.state === 'waiting');
    const idleMin = (Date.now() - lastActivity) / 60000;
    const forced = Date.now() < forceQuietUntil;
    document.body.classList.toggle('dimmed', Date.now() > wakeUntil && (forced ? idleMin >= 0.02 : (!!DECK.dimAtNight && quiet && !waiting && idleMin >= (DECK.dimAfterMinutes || 10))));
  }
  document.addEventListener('pointerdown', e => {
    lastActivity = Date.now();
    if (document.body.classList.contains('dimmed')) { document.body.classList.remove('dimmed'); wakeUntil = Date.now() + 2 * 60e3; swallowClick = true; if (window.__deckWake) window.__deckWake(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  setInterval(() => {
    if (!DECK.pixelShift) { document.body.style.translate = ''; return; }
    const r = () => Math.round(Math.random() * 6 - 3);
    document.body.style.translate = r() + 'px ' + r() + 'px';
  }, 10 * 60e3);
  setInterval(screenCare, 30000);

  function connState(ok) {
    const el = $('conn');
    if (!ok) { if (fails >= 2 && el) { el.hidden = false; el.textContent = 'Reconnecting to the deck\u2026'; wasDown = true; } return; }
    if (wasDown) { wasDown = false; if (el) el.hidden = true; toast('Reconnected'); }
  }
  // the update note: "Update now", a progress bar while the update runs, and a message if it fails
  const UPD_STEP = { starting: 'Starting', download: 'Downloading', unpack: 'Unpacking', check: 'Checking the release', install: 'Installing', restart: 'Restarting' };
  function updateNote(v) {
    const ver = document.getElementById('ver');
    if (ver && DECK.release && ver.dataset.v !== DECK.release) { // written once per version, so a tap on the link is not lost
      ver.dataset.v = DECK.release;
      ver.innerHTML = 'LLM Deck ' + esc(DECK.release) + '<br><a class="credit" href="https://xperiencedsign.com" target="_blank" rel="noopener">Crafted by XD</a>';
    }
    let n = document.getElementById('updNote');
    const st = DECK.updateState || {};
    if (!v && !st.running && !st.failed && !st.done) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.id = 'updNote'; n.className = 'upd-note'; const rail = document.querySelector('.rail-actions'); if (rail) rail.parentNode.insertBefore(n, rail); else document.body.appendChild(n); }
    if (st.running || st.done) {
      const target = st.running || st.done, step = st.done ? 'restart' : (st.phase || 'starting');
      const pct = st.done ? 100 : (typeof st.percent === 'number' ? st.percent : null);
      if (n.dataset.key !== 'run') { n.dataset.key = 'run'; n.innerHTML = '<div class="upd-title"></div><div class="upd-bar" role="progressbar"><i></i></div><div class="upd-label"></div>'; }
      n.querySelector('.upd-title').textContent = 'Updating to LLM Deck ' + target;
      const bar = n.querySelector('.upd-bar i');
      bar.classList.toggle('indeterminate', pct === null);
      bar.style.width = pct === null ? '' : pct + '%';
      const soFar = step === 'download' ? (pct !== null ? ' ' + pct + '%' : st.bytes ? ' ' + Math.round(st.bytes / 1024) + ' KB' : '') : '';
      n.querySelector('.upd-label').textContent = st.done ? 'Installed. Restarting the deck…' : (UPD_STEP[step] || 'Updating') + soFar + '…';
      return;
    }
    const here = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
    const btn = label => here ? ' <button type="button" class="ghost" id="updNow" style="margin-top:6px;padding:0 14px">' + label + '</button>' : ' Update it from the deck’s own screen.';
    const key = st.failed ? 'fail:' + st.failed : 'new:' + v;
    if (n.dataset.key === key) return;
    n.dataset.key = key;
    if (st.failed) n.innerHTML = 'The update didn’t finish: ' + esc(st.failed) + '. This version keeps running.' + (v ? btn('Try again') : '');
    else n.innerHTML = 'LLM Deck ' + esc(v) + ' is out.' + btn('Update now');
    const b = document.getElementById('updNow');
    if (b) b.addEventListener('click', async e => {
      e.stopPropagation(); const label = b.textContent; b.disabled = true; b.textContent = 'Starting…';
      try { const r = await (await fetch('/api/update', { method: 'POST' })).json(); if (!r.ok) { toast(r.error || 'The update couldn’t start'); b.disabled = false; b.textContent = label; } else poll(); }
      catch (_) { toast('The update couldn’t start'); b.disabled = false; b.textContent = label; }
    });
  }

  function problemNote(list) {
    let n = document.getElementById('probNote');
    if (!list || !list.length) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('div'); n.id = 'probNote'; n.className = 'upd-note warn'; n.setAttribute('role', 'button');
      const rail = document.querySelector('.rail-actions'); if (rail) rail.parentNode.insertBefore(n, rail); else document.body.appendChild(n);
      n.addEventListener('click', () => openModal('<h3>Needs attention</h3>' + (DECK.problems || []).map(t => '<p>' + esc(t) + '</p>').join('') + '<p class="sub">Settings has a full self-test.</p><div class="modal-actions"><button type="button" class="primary" data-close>Done</button></div>'));
    }
    n.textContent = list.length === 1 ? '1 thing needs attention' : list.length + ' things need attention';
  }
  // taps on this screen are reported, so the hooks don't mistake them for you working at the computer
  let touchSent = 0;
  document.addEventListener('pointerdown', () => {
    if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || Date.now() - touchSent < 2000) return;
    touchSent = Date.now(); fetch('/api/touch', { method: 'POST' }).catch(() => {});
  }, true);

  function applyDeck(deck) {
    DECK = deck || {}; QUICK = DECK.quickReplies || [];
    if (DECK.version) { if (pageVersion === null) pageVersion = DECK.version; else if (DECK.version !== pageVersion) { location.reload(); return; } }
    { const w = document.querySelector('.weather'); if (w) w.style.display = DECK.showWeather === false ? 'none' : ''; }
    maybeAutoDigest(); screenCare(); staleCheck(); updateNote(DECK.newRelease); problemNote(DECK.problems);
  }

  $('settingsBtn').addEventListener('click', openSettings);
  $('digestBtn').addEventListener('click', () => showDigest(false));
  $('focusBar').addEventListener('click', () => { focusGroup = null; render(); updateFocusBar(); });
  if (REMOTE) $('settingsBtn').hidden = true;

  /* ---------- v4: failures, stale nudges, hide, new session, week, self-test ---------- */
  outfits.failed = base
    + '<path class="stroke" d="M26.5 40.5 l5 5 M31.5 40.5 l-5 5" stroke-width="2.2"/>'
    + '<path class="stroke" d="M40.5 40.5 l5 5 M45.5 40.5 l-5 5" stroke-width="2.2"/>'
    + '<path class="stroke" d="M31 54 Q36 50.5 41 54" stroke-width="2.2"/>'
    + '<g transform="rotate(-18 44 26)"><rect x="34" y="22" width="20" height="8" rx="3" fill="#F4E3C8"/><rect x="41.5" y="22" width="5" height="8" fill="#E5C99B"/>'
    + '<circle cx="37" cy="26" r=".8" fill="#C9A878"/><circle cx="51" cy="26" r=".8" fill="#C9A878"/></g>';
  label.failed = 'failed';
  let testCards = [], nudged = null, forceQuietUntil = 0, lastSig = '';

  const isStale = s => s.state === 'waiting' && (Date.now() - s.since) > (DECK.staleMinutes || 30) * 60e3;
  function staleCheck() {
    const stale = sessions.filter(isStale).map(s => s.id + ':' + s.since);
    if (nudged === null) { nudged = new Set(stale); return; }
    const fresh = stale.filter(k => !nudged.has(k));
    stale.forEach(k => nudged.add(k));
    if (fresh.length) {
      document.body.classList.remove('alerting'); void document.body.offsetWidth; document.body.classList.add('alerting');
      if (DECK.sound !== false && !inQuiet(DECK.quietHours)) chime();
    }
  }

  function markSeenQuiet(s) {
    if (!LIVE || String(s.id).startsWith('selftest')) return;
    const key = isChat(s) ? (s.detail || '') : String(s.since);
    fetch('/api/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, key }) }).catch(() => {});
  }

  async function hideCard(s) {
    sessions = sessions.filter(x => x !== s); testCards = testCards.filter(x => x !== s);
    setTimeout(() => render(), 260);
    toast('Hidden. Settings can bring it back');
    if (!LIVE || String(s.id).startsWith('selftest')) return;
    try { await fetch('/api/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) }); } catch (_) {}
  }

  async function newSession(group) {
    if (!LIVE || REMOTE) return toast('New sessions open on your PC');
    toast('Opening a new session for ' + group);
    try {
      const r = await fetch('/api/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast(j.error || 'Couldn\u2019t open a new session');
      if (j.folder) setTimeout(() => toast('Folder copied: ' + j.folder.split(/[\\/]/).pop() + '. Paste it in the folder picker'), 1800);
    } catch (_) { toast('Could not reach the LLM Deck server'); }
  }

  /* weekly outlook: will the weekly limit last until it resets, at this week's pace? */
  const spanText = ms => {
    const h = Math.round(ms / 3600e3), d = Math.floor(h / 24), r = h % 24;
    if (d && r) return d + (d === 1 ? ' day' : ' days') + ' and ' + r + (r === 1 ? ' hour' : ' hours');
    if (d) return d + (d === 1 ? ' day' : ' days');
    return Math.max(1, r) + (r === 1 ? ' hour' : ' hours');
  };
  const whenText = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'long' }) + ' at ' + new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  function weeklyOutlook(name, pct, reset, now) {
    now = now || Date.now();
    if (pct == null || !reset || reset <= now) return null;
    const start = reset - 7 * 864e5, used = now - start, resetAt = whenText(reset);
    if (pct >= 100) return { warn: true, text: 'Your ' + name + ' weekly limit is used up. It resets on ' + resetAt + '.' };
    if (used < 6 * 3600e3 || pct < 2) return { warn: false, text: 'It\u2019s too early in the week to forecast your ' + name + ' weekly limit. It resets on ' + resetAt + '.' };
    const runsOut = start + used * (100 / pct);
    if (runsOut < reset) {
      const d = new Date(runsOut);
      const day = d.toLocaleDateString('en-GB', { weekday: 'long' }), at = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return { warn: true, text: 'At this week\u2019s pace, your ' + name + ' weekly limit won\u2019t be enough: it runs out on ' + day + ' around ' + at + ', ' + spanText(reset - runsOut) + ' before it resets on ' + resetAt + '.' };
    }
    const projected = Math.min(99, Math.round(pct * (7 * 864e5) / used));
    return { warn: false, text: 'At this week\u2019s pace, you\u2019ll use about ' + projected + '% of your ' + name + ' weekly limit by the time it resets on ' + resetAt + ', so it should last.' };
  }

  async function showWeek() {
    if (!LIVE) return toast('The weekly summary works on the live deck');
    openModal('<h3>This week</h3><p class="sub">Adding it up\u2026</p>');
    let j;
    try { j = await (await fetch('/api/summary')).json(); }
    catch (_) { return openModal('<h3>This week</h3><p class="sub">Could not reach the LLM Deck server.</p><div class="modal-actions"><button type="button" data-close>Close</button></div>'); }
    const hrs = m => m >= 60 ? Math.floor(m / 60) + 'h ' + Math.round(m % 60) + 'm' : Math.round(m) + 'm';
    const rows = (j.rows || []).map(r => '<tr><td>' + esc(r.project) + '</td><td class="n">' + hrs(r.minutes) + '</td><td class="n">' + r.sessions + '</td><td class="n">' + r.turns + '</td><td class="n">' + r.codex + '</td></tr>').join('');
    const L = j.limits || {}, lim = [];
    const looks = [weeklyOutlook('Claude', L.weekNow, L.weekResetsAt)]
      .concat((L.extra || []).filter(x => /weekly/i.test(x.label)).map(x => weeklyOutlook(x.label.replace(/\s*weekly/i, ''), x.pct, x.resetsAt)))
      .filter(Boolean);
    const outlookHtml = looks.map(o => '<p class="outlook' + (o.warn ? ' warn' : '') + '">' + esc(o.text) + '</p>').join('');
    if (L.weekNow != null) lim.push('Claude weekly limit: ' + Math.round(L.weekNow) + '% used now' + (L.weekPeak != null ? ', highest recorded this week ' + Math.round(L.weekPeak) + '%' : '') + '.');
    if (L.since) lim.push('5-hour limit reached ' + L.fiveHits + (L.fiveHits === 1 ? ' time' : ' times') + ' (records start ' + new Date(L.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ').');
    openModal('<h3>This week</h3>' + outlookHtml + '<p class="sub">Last 7 days. Active time and turns count Claude Code; Codex shows threads worked on. Chats aren\u2019t included.</p>'
      + '<table class="week-table"><thead><tr><th>Project</th><th class="n">Active time</th><th class="n">Sessions</th><th class="n">Turns finished</th><th class="n">Codex threads</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">Nothing yet.</td></tr>') + '</tbody></table>'
      + '<p class="sub" style="margin-top:14px">' + lim.join(' ') + '</p><div class="modal-actions"><button type="button" class="primary" data-close>Done</button></div>');
  }

  /* self-test */
  let wizStep = -1, wizResults = [], wizSavedTheme = null, wizTimer = null, wizTick = null;
  const addTestCard = extra => {
    const c = Object.assign({ app: 'claude', title: 'Self-test', project: '', cwd: '', group: '', since: Date.now(), lastTs: Date.now(), ended: false, pinned: false, detail: '' }, extra);
    testCards = testCards.filter(x => x.id !== c.id).concat(c);
    sessions = sessions.filter(x => x.id !== c.id).concat(c);
    render();
  };
  const restoreTheme = () => {
    if (wizSavedTheme === null) return;
    if (wizSavedTheme) document.documentElement.dataset.theme = wizSavedTheme; else delete document.documentElement.dataset.theme;
    wizSavedTheme = null; paintTheme();
  };
  const WIZ = [
    { key: 'chime', title: 'Chime and pulse', text: 'Listen for a two-note chime and watch the screen edge pulse.', ask: true,
      run() { document.body.classList.remove('alerting'); void document.body.offsetWidth; document.body.classList.add('alerting'); chime(); } },
    { key: 'perm', title: 'Allow and Deny', text: 'A Self-test card is under \u201cWaiting for you\u201d. Press and hold Allow for a second, or tap Deny.',
      run() { addTestCard({ id: 'selftest-perm', state: 'waiting', perm: { id: 'selftest-' + Date.now(), tool: 'Bash', summary: 'echo self-test' } }); } },
    { key: 'swipe', title: 'Swipe to dismiss', text: 'A Self-test card is under \u201cNew result\u201d. Swipe it left or right.',
      run() { addTestCard({ id: 'selftest-swipe', state: 'ready', detail: 'Test result' }); } },
    { key: 'peek', title: 'Double-tap to peek', text: 'Double-tap the Self-test card in the background column.',
      run() { addTestCard({ id: 'selftest-peek', state: 'working' }); } },
    { key: 'reply', title: 'Quick reply typing', text: 'Typing a test phrase into ChatGPT\u2019s message box, then clearing it without sending\u2026',
      async run() {
        try {
          const r = await fetch('/api/selftest/reply', { method: 'POST' }); const j = await r.json().catch(() => ({}));
          wizPass('reply', !!j.ok, j.ok ? (j.note || '') : (j.output || 'didn\u2019t type'));
        } catch (_) { wizPass('reply', false, 'server unreachable'); }
      } },
    { key: 'night', title: 'Night dimming', text: 'The deck switches to night mode and dims. Tap anywhere to wake it.',
      run() {
        wizSavedTheme = document.documentElement.dataset.theme || '';
        document.documentElement.dataset.theme = 'dark'; paintTheme();
        forceQuietUntil = Date.now() + 90e3; lastActivity = Date.now() - 5000; wakeUntil = 0;
        window.__deckWake = () => { window.__deckWake = null; forceQuietUntil = 0; restoreTheme(); setTimeout(() => wizPass('night', true), 300); };
        clearInterval(wizTick); wizTick = setInterval(() => { screenCare(); if (Date.now() > forceQuietUntil) clearInterval(wizTick); }, 1000);
        wizTimer = setTimeout(() => { if (window.__deckWake) { window.__deckWake = null; forceQuietUntil = 0; document.body.classList.remove('dimmed'); restoreTheme(); wizPass('night', false, 'no tap to wake'); } }, 90e3);
      } },
    { key: 'digest', title: 'Overnight panel', text: 'The Overnight panel is open. Did it appear?', ask: true, run() { showDigest(false); } }
  ];
  function wizRender() {
    let el = $('wizard');
    if (!el) { el = document.createElement('div'); el.id = 'wizard'; el.className = 'wizard'; el.addEventListener('click', wizClick); document.body.appendChild(el); }
    if (wizStep >= WIZ.length) {
      const ok = wizResults.filter(r => r.ok).length;
      el.innerHTML = '<h4>Self-test finished: ' + ok + ' of ' + wizResults.length + ' passed</h4><p>'
        + wizResults.map(r => (r.ok ? '\u2713 ' : '\u2717 ') + esc(r.title) + (r.note ? ' (' + esc(r.note) + ')' : '')).join('<br>')
        + '</p><div class="row"><button type="button" class="primary" data-w="close">Done</button></div>';
      return;
    }
    const st = WIZ[wizStep];
    el.innerHTML = '<h4>Step ' + (wizStep + 1) + ' of ' + WIZ.length + ': ' + esc(st.title) + '</h4><p>' + esc(st.text) + '</p><div class="row"><button type="button" data-w="stop">Stop</button>'
      + (st.ask ? '<button type="button" data-w="no">It didn\u2019t work</button><button type="button" class="primary" data-w="yes">It worked</button>' : '<button type="button" data-w="skip">Skip</button>') + '</div>';
  }
  function wizClick(e) {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const st = WIZ[wizStep], w = b.dataset.w;
    if (w === 'yes') wizPass(st.key, true);
    else if (w === 'no') wizPass(st.key, false);
    else if (w === 'skip') wizPass(st.key, false, 'skipped');
    else if (w === 'stop' || w === 'close') wizEnd();
  }
  function wizCleanup() {
    clearTimeout(wizTimer); clearInterval(wizTick); window.__deckWake = null; forceQuietUntil = 0;
    document.body.classList.remove('dimmed'); restoreTheme();
    const ids = new Set(testCards.map(c => c.id)); testCards = [];
    sessions = sessions.filter(s => !ids.has(s.id)); closeModal(); render();
  }
  function wizPass(key, ok, note) {
    if (wizStep < 0 || wizStep >= WIZ.length || WIZ[wizStep].key !== key) return;
    wizResults.push({ title: WIZ[wizStep].title, ok, note: note || '' });
    wizCleanup(); wizStep++; wizNext();
  }
  function wizNext() { wizRender(); if (wizStep < WIZ.length) { const st = WIZ[wizStep]; setTimeout(() => st.run(), 450); } }
  function wizEnd() { wizCleanup(); wizStep = -1; const el = $('wizard'); if (el) el.remove(); poll(); }
  function selfTestEvent(key) { wizPass(key, true); }
  function startSelfTest() { if (!LIVE || REMOTE) return toast('Run the self-test on the deck itself'); wizResults = []; wizStep = 0; wizNext(); }

  $('weekBtn').addEventListener('click', showWeek);

  /* ---------- render ---------- */
  const empties = {
    pinned: 'Press and hold any session to pin its project here.',
    waiting: 'Nobody needs you right now.',
    ready: 'No unread results.',
    background: 'No other sessions in the last day.'
  };
  let sessions = [];
  function render(now = Date.now()) {
    if (swipeCard || allowTimer) return;
    const groups = { pinned: [], waiting: [], ready: [], background: [] };
    for (const s of (focusGroup ? sessions.filter(x => (x.group || 'Other') === focusGroup) : sessions)) {
      if (s.pinned) groups.pinned.push(s);
      else if (s.state === 'waiting' || s.state === 'failed') groups.waiting.push(s);
      else if (s.state === 'ready') groups.ready.push(s);
      else groups.background.push(s);
    }
    const rank = { waiting: 0, failed: 0, ready: 1, working: 2, idle: 3 };
    groups.pinned.sort((a, b) => rank[a.state] - rank[b.state] || b.lastTs - a.lastTs);
    groups.waiting.sort((a, b) => a.since - b.since);
    groups.ready.sort((a, b) => b.since - a.since);
    groups.background.sort((a, b) => rank[a.state] - rank[b.state] || b.lastTs - a.lastTs);

    for (const col of document.querySelectorAll('.col')) {
      const g = col.dataset.group, list = groups[g];
      const c = col.querySelector('.count'); c.textContent = list.length; c.classList.toggle('has', list.length > 0);
      col.querySelector('.list').innerHTML = list.length ? arrange(g, list, now).map(s => s.__html !== undefined ? s.__html : `
        <button class="card s-${s.state}${isStale(s) ? ' stale' : ''}" type="button" data-id="${esc(s.id)}" data-cwd="${esc(s.cwd)}"
          aria-label="${esc(s.project)}, ${label[s.state]}. ${esc(s.title)}">
          ${mascot(s.state)}
          <span>
            <span class="title">${esc(s.title)}</span>
            <span class="proj">${tagFor(s.app)}${esc(s.project)}</span>
            <span class="status">${esc(statusText(s, now))}</span>
            ${s.ask && !s.perm ? '<span class="ask">' + esc(s.ask) + '</span>' : ''}
            ${s.perm ? permBlock(s) : ''}
            ${replyChips(s)}
          </span>
          ${s.pinned ? pinIcon : ''}
        </button>`).join('') : `<p class="empty">${empties[g]}</p>`;
    }
    const waiting = sessions.filter(s => s.state === 'waiting').length;
    document.title = waiting ? `(${waiting}) LLM Deck` : 'LLM Deck';
  }

  function renderUsage(u) {
    if (!u) return;
    const usageWhy = () => DECK.usageError ? '. ' + String(DECK.usageError).replace(/^the usage service is turning requests away/, 'Usage service busy').replace(/^./, c => c.toUpperCase()) : '';
    const readAt = t => { const d = new Date(t), hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? hm : d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + hm; };
    const meter = (k, pct, reset, fallback, info) => {
      info = info || {};
      const r = $('r' + k), l = $('l' + k), b0 = $('b' + k);
      if (pct == null) {
        l.textContent = '\u2013'; l.classList.add('stale'); b0.style.width = '0%'; b0.className = '';
        r.textContent = info.expired ? 'Window reset since the last reading (' + readAt(info.asOf) + ')' : 'No reading yet'; r.textContent += usageWhy();
        r.classList.remove('warn'); r.classList.add('stale'); return;
      }
      const stale = !!(info.asOf && Date.now() - info.asOf > 30 * 60e3);
      l.classList.toggle('stale', stale); r.classList.toggle('stale', stale);
      $('l' + k).textContent = `${Math.round(pct)}%`;
      const b = $('b' + k); b.style.width = `${Math.max(2, pct)}%`;
      b.className = pct >= 90 ? 'max' : pct >= 70 ? 'hot' : '';
      $('r' + k).textContent = forecastText(pct, reset, k === '5' ? 5 : 168, fallback);
      $('r' + k).classList.toggle('warn', /^(At this pace|Full)/.test($('r' + k).textContent));
      if (stale) { r.textContent += ' (last reading ' + readAt(info.asOf) + ')' + usageWhy(); r.classList.remove('warn'); }
    };
    meter('5', u.fiveHour.pct, u.fiveHour.resetsAt, 'No active window', u.fiveHour);
    meter('w', u.weekly.pct, u.weekly.resetsAt, 'Rolling 7 days', u.weekly);
    $('extraLimits').innerHTML = (u.extra || []).map(x => {
      const pct = Math.round(x.pct), cls = pct >= 90 ? 'max' : pct >= 70 ? 'hot' : '';
      return `<div class="meter"><div class="meter-head"><span>${/^Codex/.test(x.label) ? icoFor('codex') : ''}${esc(x.label)}</span><strong>${pct}%</strong></div><div class="bar"><i class="${cls}" style="width:${Math.max(2, pct)}%"></i></div><small class="${/^(At this pace|Full)/.test(forecastText(x.pct, x.resetsAt, /5-hour/.test(x.label) ? 5 : 168, '')) ? 'warn' : ''}">${forecastText(x.pct, x.resetsAt, /5-hour/.test(x.label) ? 5 : 168, '')}</small></div>`;
    }).join('');
    try { // one chime the first time a weekly limit is on track to run out
      const outs = [weeklyOutlook('Claude', u.weekly && u.weekly.pct, u.weekly && u.weekly.resetsAt)]
        .concat((u.extra || []).filter(x => /weekly/i.test(x.label)).map(x => weeklyOutlook(x.label.replace(/\s*weekly/i, ''), x.pct, x.resetsAt)));
      const key = outs.filter(o => o && o.warn).map(o => ((o.text.match(/your (\S+) weekly/) || [])[1] || '') + ':' + ((o.text.match(/runs out on (\w+)/) || [])[1] || 'used up')).join('|');
      if (key && store.get('deck-limit-alert') !== key) {
        store.set('deck-limit-alert', key);
        document.body.classList.remove('alerting'); void document.body.offsetWidth; document.body.classList.add('alerting');
        if (DECK.sound !== false && !inQuiet(DECK.quietHours)) chime();
      }
    } catch (_) {}
    $('spend').textContent = '$' + Math.round(u.month.cost).toLocaleString('en-US');
    $('spendLabel').textContent = `${u.month.label}, Claude Code at API prices`;
  }

  /* ---------- touch: tap opens, hold pins ---------- */
  let hold = null, held = false;
  const board = $('board');
  board.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-act]') || e.target.closest('.more') || e.target.closest('[data-reply]') || e.target.closest('.grp')) return;
    const card = e.target.closest('.card'); if (!card) return;
    sx = e.clientX; sy = e.clientY; swipeCard = /\bs-(ready|failed|idle)\b/.test(card.className) ? card : null;
    held = false; card.classList.add('holding');
    hold = setTimeout(() => { held = true; card.classList.remove('holding'); togglePin(card.dataset.cwd); }, 600);
  });
  const cancel = () => { clearTimeout(hold); document.querySelectorAll('.holding').forEach(c => c.classList.remove('holding')); };
  board.addEventListener('pointermove', e => {
    if (!swipeCard) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      clearTimeout(hold); swipeCard.classList.remove('holding'); swipeCard.classList.add('swiping');
      swipeCard.style.transform = 'translateX(' + dx + 'px)'; swipeCard.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 320));
    }
  });
  board.addEventListener('pointerup', e => {
    cancel();
    if (!swipeCard) return;
    const c = swipeCard, dx = e.clientX - sx; swipeCard = null; c.classList.remove('swiping');
    if (Math.abs(dx) > 90) { swiped = true; c.style.transform = 'translateX(' + (dx > 0 ? 700 : -700) + 'px)'; c.style.opacity = '0'; dismissCard(c.dataset.id); }
    else { c.style.transform = ''; c.style.opacity = ''; }
  });
  board.addEventListener('pointerleave', cancel);
  board.addEventListener('pointercancel', cancel);
  board.addEventListener('contextmenu', e => { if (e.target.closest('.card')) e.preventDefault(); });
  board.addEventListener('click', e => {
    const rp = e.target.closest('[data-reply]');
    if (rp) { e.stopPropagation(); sendReply(rp.closest('.card').dataset.id, rp.dataset.reply); return; }
    const nw = e.target.closest('[data-new]');
    if (nw) { e.stopPropagation(); newSession(nw.dataset.new); return; }
    const grp = e.target.closest('.grp[data-g]');
    if (grp) { focusGroup = focusGroup ? null : grp.dataset.g; render(); updateFocusBar(); return; }
    const act = e.target.closest('[data-act]');
    if (act) { e.stopPropagation(); if (act.dataset.act === 'allow') { if (!holdDone) toast('Press and hold Allow for a second'); holdDone = false; return; } answerPerm(act.dataset.req, act.dataset.act, act.dataset.label); return; }
    if (e.target.closest('.more')) { showOlder = !showOlder; render(); return; }
    if (swiped) { swiped = false; return; }
    const card = e.target.closest('.card'); if (!card) return;
    if (held) { held = false; return; }
    routeTap(card);
  });

  /* hold-to-allow: Allow needs a one-second press, so a stray tap can't approve anything */
  let allowTimer = null, holdDone = false;
  board.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-act="allow"]'); if (!b) return;
    clearTimeout(allowTimer); holdDone = false; b.classList.add('arming');
    allowTimer = setTimeout(() => { allowTimer = null; b.classList.remove('arming'); holdDone = true; answerPerm(b.dataset.req, 'allow'); }, 1000);
  });
  const stopAllow = () => { if (allowTimer) { clearTimeout(allowTimer); allowTimer = null; } document.querySelectorAll('.pbtn.arming').forEach(x => x.classList.remove('arming')); };
  ['pointerup', 'pointercancel'].forEach(t => board.addEventListener(t, stopAllow));
  board.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-act="allow"]')) stopAllow(); });

  async function openSession(id) {
    const s = sessions.find(x => x.id === id); if (!s) return;
    if (String(id).startsWith('selftest')) return toast('That\u2019s a test card');
    if (s.state === 'ready' || s.state === 'failed') markSeenQuiet(s);
    if (!LIVE) {
      toast(`Opening ${s.project} in its terminal`);
      if (s.state === 'ready') { s.state = 'idle'; s.since = Date.now(); s.lastTs = Date.now(); }
      return render();
    }
    toast(`Opening ${s.project} in its terminal`);
    try {
      await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      poll();
    } catch (_) { toast('Could not reach the LLM Deck server'); }
  }

  async function togglePin(cwd) {
    const proj = cwd.split(/[\\/]/).filter(Boolean).pop() || 'project';
    if (!LIVE) {
      const on = !sessions.some(s => s.cwd === cwd && s.pinned);
      sessions.forEach(s => { if (s.cwd === cwd) s.pinned = on; });
      toast(on ? `Pinned ${proj}` : `Unpinned ${proj}`);
      return render();
    }
    try {
      const r = await (await fetch('/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }) })).json();
      toast(r.pinned ? `Pinned ${proj}` : `Unpinned ${proj}`); poll();
    } catch (_) { toast('Could not reach the LLM Deck server'); }
  }

  /* ---------- weather ---------- */
  const codes = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'snow', 80: 'showers', 81: 'showers', 82: 'showers', 95: 'thunderstorm' };
  async function weather(cfg) {
    if (DECK.showWeather === false) return; // hidden in Settings: no request either
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.latitude}&longitude=${cfg.longitude}&current=temperature_2m,weather_code`;
      const d = await (await fetch(u)).json();
      $('temp').textContent = Math.round(d.current.temperature_2m) + '°';
      $('weather').textContent = `${codes[d.current.weather_code] || 'outside'} in ${cfg.city || 'town'}`;
    } catch (_) { $('weather').textContent = 'weather unavailable'; }
  }

  /* ---------- data ---------- */
  let weatherStarted = false, fails = 0;
  async function poll() {
    try {
      const d = await (await fetch('/api/state', { cache: 'no-store' })).json();
      connState(true); fails = 0; sessions = d.sessions.concat(testCards); applyDeck(d.deck || {}); const sig = JSON.stringify(sessions); if (sig !== lastSig) { lastSig = sig; render(); } renderUsage(d.usage); window.__appUpdates = d.appUpdates || {}; renderHealth(d.health || {}); alertCheck(d.deck || {});
      if (!weatherStarted && d.config && !(d.deck && d.deck.showWeather === false)) { weatherStarted = true; weather(d.config); setInterval(() => weather(d.config), 10 * M); }
    } catch (_) { fails++; connState(false); const sl = document.querySelector('#updNote .upd-label'); if (sl && DECK.updateState && (DECK.updateState.running || DECK.updateState.done)) sl.textContent = 'Restarting the deck…'; }
  }

  function demo() {
    $('demoNote').hidden = false;
    const now = Date.now();
    const mk = (id, project, title, state, sinceMin, extra = {}) => ({
      id, project, cwd: '~/code/' + project, title, state, since: now - sinceMin * M, lastTs: now - sinceMin * M, detail: '', ended: false, pinned: false, ...extra
    });
    sessions = [
      mk('a1', 'acme-api', 'Migrate the orders service to the new schema', 'working', 18, { pinned: true }),
      mk('a2', 'research-notes', 'Cluster interview snippets by theme', 'waiting', 3, { pinned: true, detail: 'Wants to run npm install' }),
      mk('a3', 'story-engine', 'Refactor the story graph renderer', 'ready', 6, { pinned: true, detail: 'Finished after 41m' }),
      mk('b1', 'game-dialogue', 'Write branching dialogue for episode 4', 'waiting', 11, { detail: 'Asks which ending to keep', ask: 'Should I keep the hopeful ending or the open one?' }),
      mk('b2', 'agent-router', 'Draft the orchestrator routing rules', 'waiting', 1, { detail: 'Wants to edit routes.ts' }),
      mk('c1', 'shop-site', 'Rebuild the product page with the new photos', 'ready', 2, { detail: 'Finished after 27m' }),
      mk('c2', 'course-builder', 'Generate the homework index for module 6', 'ready', 34, { detail: 'Finished after 1h 12m' }),
      mk('d1', 'portfolio', 'Compress case study images', 'working', 7),
      mk('d2', 'dotfiles', 'Clean up zsh aliases', 'idle', 140),
      mk('d3', 'ux-assistant', 'Prototype the research synthesis prompt chain', 'idle', 410, { ended: true }),
      mk('d4', 'invoices', 'Reconcile September exports', 'idle', 960, { ended: true })
    ];
    render();
    renderUsage({
      fiveHour: { pct: 62, resetsAt: now + 108 * M },
      weekly: { pct: 41, resetsAt: now + (3 * 24 + 15) * H },
      month: { cost: 3830, label: 'October' }
    });
    $('temp').textContent = '21°'; $('weather').textContent = 'mostly clear in London';
    // keep the demo feeling alive: the working session finishes after a while
    setTimeout(() => { const s = sessions.find(x => x.id === 'd1'); if (s && s.state === 'working') { Object.assign(s, { state: 'ready', since: Date.now(), detail: 'Finished after 8m' }); render(); } }, 45000);
  }

  if (LIVE) { poll(); setInterval(poll, 2000); } else demo();
  setInterval(() => render(), 30000);
})();
