/* ============================================================
   HIDDEN HOMESTAY — app.js
   Front-end for the themed private-room booking experience.

   · Demo mode (default): everything runs locally, bookings are
     kept in localStorage with an in-memory fallback.
   · Live mode: if a booking backend is reachable (same origin,
     or CONFIG.api.baseUrl), the site checks real availability
     and submits bookings to it (which notifies the owner on
     Telegram). All content/settings live in CONFIG below.
   ============================================================ */
'use strict';

/* ---------- image assets (injected at build time) ---------- */
const IMG = {
  logo:     '{{LOGO}}',
  burger:   '{{IMG_BURGER}}',
  vintage:  '{{IMG_VINTAGE}}',
  fishing:  '{{IMG_FISHING}}',
  branchA:  '{{IMG_BRANCH_A}}',
  branchB:  '{{IMG_BRANCH_B}}'
};

/* ============================================================
   CONFIG — edit prices / copy / payment here
   ============================================================ */
const CONFIG = {
  brand: 'Hidden Homestay',
  tagline: 'stay cosy. stay HIDDEN',
  currency: '$',
  phone: '+855 12 345 678',
  telegram: '@Hppy4D',

  /* Backend connection.
     '' (empty)  → auto-detect: if the site is served by the
                   booking server (see server/ folder) it goes live,
                   otherwise it stays in demo mode.
     'https://…' → point at your deployed server from anywhere.   */
  api: { baseUrl: '' },

  /* KHQR payment (scan with ABA, ACLEDA, Wing, Bakong, any bank app).
     The payload below was generated for ABA account 000 523 457
     (Bakong ID 000523457@ABA) in the official KHQR format — the site
     builds a fresh QR with each booking's exact amount automatically.
     ⚠️ Scan-test it ONCE with the ABA app before going public: the
     recipient shown must be your account. If it isn't, open ABA →
     “My QR” → copy the QR text (starts with “000201…”) and paste it
     into `payload` instead.                                        */
  khqr: {
    payload: '00020101021129170013000523457@ABA5204599953038405802KH5915HIDDEN HOMESTAY6010Phnom Penh6304F893',
    bakongId: '000523457@ABA',
    merchantName: 'HIDDEN HOMESTAY',
    city: 'Phnom Penh'
  },

  rooms: [
    {
      id: 'burger',
      name: 'Burger Room',
      kicker: 'Theme 01 · Playful',
      rate: 6.00,
      img: IMG.burger,
      blurb: 'Bold, juicy and deliciously playful. A fast-food fantasy in warm colours — built for fun nights, laughter and camera-roll memories.',
      tags: ['Themed Décor', 'Smart TV', 'Bluetooth Speaker']
    },
    {
      id: 'vintage',
      name: 'Vintage Room',
      kicker: 'Theme 02 · Nostalgic',
      rate: 7.00,
      img: IMG.vintage,
      blurb: 'Slow afternoons and warm light. Retro furniture, classic records and a nostalgic calm you can sink into and never want to leave.',
      tags: ['Retro Furniture', 'Reading Corner', 'Record Player']
    },
    {
      id: 'fishing',
      name: 'Fishing Room',
      kicker: 'Theme 03 · Serene',
      rate: 7.50,
      img: IMG.fishing,
      blurb: 'Quietly cool and oddly calming. An underwater-inspired escape in soft blues, designed for deep rest and gentle daydreaming.',
      tags: ['Cool Blue Palette', 'Ambient Lighting', 'Aroma Diffuser']
    }
  ],
  branches: [
    {
      id: 'cheasophara',
      name: 'Borey Vimean Phnom Penh',
      area: 'Cheasophara · Phnom Penh',
      short: 'Cheasophara',
      badge: 'Branch 01',
      img: IMG.branchA,
      blurb: 'Our original hideaway, tucked into the quiet streets of Borey Vimean Phnom Penh at Cheasophara. Peaceful, easy to find, with plenty of space to park.'
    },
    {
      id: 'penghout',
      name: 'Peng Hout',
      area: 'Boeung Snor · Phnom Penh',
      short: 'Boeung Snor',
      badge: 'Branch 02',
      img: IMG.branchB,
      blurb: 'The second chapter, in the Peng Hout community at Boeung Snor. A calm residential setting close to cafés, minimarts and everything you need.'
    }
  ]
};

/* ============================================================
   SAFE STORAGE (localStorage may be blocked in sandboxed previews)
   ============================================================ */
const store = (() => {
  const mem = {};
  let ok = false;
  try {
    localStorage.setItem('__hh_t', '1');
    localStorage.removeItem('__hh_t');
    ok = true;
  } catch (e) { ok = false; }
  return {
    persistent: ok,
    get(k) {
      if (ok) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
      return (k in mem) ? mem[k] : null;
    },
    set(k, v) {
      mem[k] = v;
      if (ok) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    }
  };
})();
const BOOKINGS_KEY = 'hiddenHomestayBookings';

/* ============================================================
   HELPERS
   ============================================================ */
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const money = n => CONFIG.currency + Number(n).toFixed(2);
const toMin = t => { const p = t.split(':'); return (+p[0]) * 60 + (+p[1]); };
const toHHMM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const fmtTime = t => {
  const p = t.split(':').map(Number);
  const ap = p[0] >= 12 ? 'PM' : 'AM';
  const h = p[0] % 12 || 12;
  return h + ':' + String(p[1]).padStart(2, '0') + ' ' + ap;
};
const fmtDate = d => {
  const p = d.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
};
const fmtDur = m => {
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return mm + ' min';
  if (!mm) return h + (h > 1 ? ' hrs' : ' hr');
  return h + (h > 1 ? ' hrs ' : ' hr ') + mm + ' min';
};
const genRef = () => {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return 'HH-' + s;
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
function fetchTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 4000);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
}
const overlaps = (aIn, aOut, bIn, bOut) => toMin(aIn) < toMin(bOut) && toMin(bIn) < toMin(aOut);

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  info:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
  cal:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  spin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9" /></svg>'
};

/* ============================================================
   KHQR — Cambodia's universal payment QR (EMV merchant QR).
   Builds a payload containing the exact amount to pay, then
   renders it with the bundled qrcode-generator library.
   ============================================================ */
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;

function khqrConfigured() {
  const k = CONFIG.khqr || {};
  return !!(k.payload || (k.bakongId && k.bakongId.indexOf('your.name') === -1 && k.bakongId.indexOf('REPLACE') === -1));
}

function buildKHQRPayload(amount) {
  const k = CONFIG.khqr || {};
  const amt = amount != null ? Number(amount).toFixed(2) : null;
  if (k.payload) {                                    // owner pasted their full KHQR string
    const parts = [];
    let s = k.payload, i = 0;
    while (i + 4 <= s.length) {                       // parse top-level TLVs
      const id = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
      if (i + 4 + len > s.length) break;
      if (id !== '63' && id !== '54') parts.push({ id: id, value: s.substr(i + 4, len) });
      i += 4 + len;
    }
    if (!parts.find(p => p.id === '53')) parts.push({ id: '53', value: '840' });
    parts.forEach(p => { if (p.id === '01') p.value = amt ? '12' : '11'; });
    if (amt) parts.push({ id: '54', value: amt });
    parts.sort((a, b) => (a.id === '54' && b.id === '53') ? 1 : (a.id === '53' && b.id === '54') ? -1 : (a.id < b.id ? -1 : 1));
    let out = parts.map(p => tlv(p.id, p.value)).join('') + '6304';
    return out + crc16(out);
  }
  // build from parts
  let merchant = tlv('00', 'KHQR') + tlv('01', k.bakongId || 'your.name@aba');
  if (k.accountNumber) merchant += tlv('02', String(k.accountNumber));
  let out = tlv('00', '01') + tlv('01', amt ? '12' : '11') + tlv('29', merchant);
  out += tlv('52', '0000') + tlv('53', '840');
  if (amt) out += tlv('54', amt);
  out += tlv('58', 'KH') + tlv('59', String(k.merchantName || 'HIDDEN HOMESTAY').slice(0, 25));
  out += tlv('60', String(k.city || 'Phnom Penh').slice(0, 15));
  out += '6304';
  return out + crc16(out);
}

/* Bakong official payment link — opens the guest's banking app with the
   exact amount (same mechanism cinema/restaurant "Pay Now" buttons use). */
function bakongPayLink(amount) {
  return 'https://bakong-deeplink.nbc.gov.kh/bakong/payment?qr=' + encodeURIComponent(buildKHQRPayload(amount));
}

function renderKHQR(canvas, amount) {
  const payload = buildKHQRPayload(amount);
  const qr = qrcode(0, 'M');           // global from qrcode.min.js
  qr.addData(payload);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = canvas.width;           // square canvas
  const scale = Math.max(1, Math.floor(size / (n + quiet * 2)));
  const dim = scale * n;
  const off = Math.floor((size - dim) / 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#161028';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(off + c * scale, off + r * scale, scale, scale);
    }
  }
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  step: 1,
  branch: null,            // branch id
  room: null,              // room id
  date: '',
  start: '',               // check-in  HH:MM
  end: '',                 // check-out HH:MM
  name: '', phone: '', contact: '',
  agreed: false,
  ref: null,
  completed: false,
  avail: 'off'             // 'off' | 'unknown' | 'checking' | 'ok' | 'busy' | 'error'
};
const live = { on: false, availCtrl: null };

const getRoom    = () => CONFIG.rooms.find(r => r.id === state.room) || null;
const getBranch  = () => CONFIG.branches.find(b => b.id === state.branch) || null;
const scheduleValid = () => {
  if (!(state.date && state.start && state.end)) return false;
  const d = toMin(state.end) - toMin(state.start);
  return d > 0 && d % 60 === 0;            // whole hours only
};
const durationMin   = () => scheduleValid() ? toMin(state.end) - toMin(state.start) : 0;
const totalPrice    = () => { const r = getRoom(); return r ? +(r.rate * durationMin() / 60).toFixed(2) : 0; };
const reviewEnabled = () => scheduleValid() && !(live.on && state.avail === 'busy');

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function toast(msg, icon) {
  const t = $('#toast');
  t.innerHTML = (icon || ICON.check) + '<span>' + esc(msg) + '</span>';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function copyText(txt, label) {
  const done = () => toast((label || 'Copied') + ' — ' + txt);
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { toast('Copy is blocked here — ' + txt); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, fallback);
  } else fallback();
}

/* ============================================================
   NAV
   ============================================================ */
const nav = $('#nav');
const navLinks = $('#navLinks');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 14), { passive: true });
$('#burger').addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  $('#burger').setAttribute('aria-expanded', open ? 'true' : 'false');
});
navLinks.addEventListener('click', e => { if (e.target.closest('a, button.btn')) navLinks.classList.remove('open'); });

/* ============================================================
   HOMEPAGE — render rooms & branches
   ============================================================ */
function renderHomeRooms() {
  $('#roomGrid').innerHTML = CONFIG.rooms.map((r, i) => `
    <article class="room-card reveal" data-delay="${i % 3 + 1}">
      <div class="room-media">
        <img src="${r.img}" alt="${esc(r.name)} — themed private room" loading="lazy">
        <div class="room-price"><b>${money(r.rate)}</b><span>/ hour</span></div>
        <div class="room-kicker">${esc(r.kicker)}</div>
      </div>
      <div class="room-body">
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.blurb)}</p>
        <ul class="room-tags">${r.tags.map(t => '<li>' + esc(t) + '</li>').join('')}</ul>
        <button class="btn btn-primary" data-book data-room="${r.id}">Book This Room</button>
      </div>
    </article>`).join('');
}

function renderHomeBranches() {
  $('#branchGrid').innerHTML = CONFIG.branches.map((b, i) => `
    <article class="branch-card reveal" data-delay="${i + 1}">
      <div class="branch-media">
        <img src="${b.img}" alt="${esc(b.name)} branch" loading="lazy">
        <span class="branch-badge">${esc(b.badge)}</span>
      </div>
      <div class="branch-body">
        <div class="branch-loc">${ICON.pin} ${esc(b.area)}</div>
        <h3>${esc(b.name)}</h3>
        <p>${esc(b.blurb)}</p>
        <button class="btn btn-ghost" data-book data-branch="${b.id}">Book at This Branch</button>
      </div>
    </article>`).join('');
}

/* ============================================================
   HERO SLIDER — random order, 3s, fade + subtle zoom
   ============================================================ */
const slider = (() => {
  const showcase = $('#showcaseFrame');
  const ambient = $('#heroAmbient');
  const chip = $('#showcaseChip');
  let slides = [], ambSlides = [], cur = -1, timer = null, altZoom = false, chipT = null;

  function build() {
    showcase.innerHTML = CONFIG.rooms.map(r =>
      `<div class="slide" style="background-image:url('${r.img}')" role="img" aria-label="${esc(r.name)}"></div>`).join('');
    ambient.innerHTML = CONFIG.rooms.map(r =>
      `<div class="amb" style="background-image:url('${r.img}')"></div>`).join('');
    slides = $$('.slide', showcase);
    ambSlides = $$('.amb', ambient);
  }

  function show(i) {
    if (i === cur) return;
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    ambSlides.forEach((s, k) => s.classList.toggle('active', k === i));
    if (cur >= 0) {
      altZoom = !altZoom;
      slides[i].classList.toggle('zoom-out', altZoom);
    }
    cur = i;
    const r = CONFIG.rooms[i];
    chip.classList.add('swap');
    clearTimeout(chipT);
    chipT = setTimeout(() => {
      $('#chipName').textContent = r.name;
      $('#chipRate').textContent = money(r.rate) + ' / hour';
      chip.classList.remove('swap');
    }, 320);
  }

  function nextRandom() {
    if (slides.length < 2) { show(0); return; }
    let i = cur;
    while (i === cur) i = Math.floor(Math.random() * slides.length);
    show(i);
  }

  function start() { if (!timer) { nextRandom(); timer = setInterval(nextRandom, 3000); } }
  function stop()  { clearInterval(timer); timer = null; }

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

  return { build, start, stop, nextRandom };
})();

/* ============================================================
   REVEAL ON SCROLL
   ============================================================ */
function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  els.forEach(e => io.observe(e));
}

/* ============================================================
   LIVE MODE — talk to the booking backend when one exists
   ============================================================ */
async function detectLive() {
  const base = CONFIG.api.baseUrl || '';
  if (!base && (location.protocol !== 'http:' && location.protocol !== 'https:')) {
    // opened as a local file (or sandboxed preview) — no backend to talk to
    live.on = false;
    updateModeUI();
    return;
  }
  try {
    const r = await fetchTimeout(base + '/api/health', { method: 'GET' }, 3000);
    if (r.ok) {
      const j = await r.json();
      live.on = !!(j && j.ok);
    }
  } catch (e) { live.on = false; }
  updateModeUI();
}

function updateModeUI() {
  const badge = $('#modeBadge');
  if (badge) {
    badge.textContent = live.on ? 'Live' : 'Demo';
    badge.classList.toggle('is-live', live.on);
  }
  const note = $('#schedModeNote');
  if (note) {
    note.innerHTML = live.on
      ? '<b>Live mode</b> — availability is checked in real time with our booking system.'
      : 'Demo build — no real-time availability is checked in this version.';
  }
  const sn = $('#successModeNote');
  if (sn) {
    sn.innerHTML = live.on
      ? 'Our team has been notified on Telegram and will confirm your booking shortly.'
      : 'Demo mode — saved only in this browser, no real payment was processed.';
  }
}

async function checkAvailability() {
  if (!live.on || !scheduleValid()) return;
  state.avail = 'checking';
  paintStatus();
  renderActions();
  if (live.availCtrl) live.availCtrl.abort();
  live.availCtrl = new AbortController();
  const base = CONFIG.api.baseUrl || '';
  const url = base + '/api/availability?branch=' + encodeURIComponent(state.branch) +
              '&room=' + encodeURIComponent(state.room) + '&date=' + encodeURIComponent(state.date);
  try {
    const r = await fetchTimeout(url, { signal: live.availCtrl.signal }, 5000);
    const j = await r.json();
    const busy = (j && j.busy) || [];
    const conflicts = busy.filter(b => overlaps(state.start, state.end, b.start, b.end));
    state.avail = conflicts.length ? 'busy' : 'ok';
    state.busyInfo = conflicts;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    state.avail = 'error';
  }
  paintStatus();
  renderActions();
}

function paintStatus() {
  const st = $('#availStatus');
  st.classList.remove('show', 'ok', 'busy', 'warn', 'checking');
  if (!scheduleValid()) { st.innerHTML = ''; return; }
  st.classList.add('show');
  if (!live.on) {
    st.classList.add('ok');
    st.innerHTML = '<span class="st-ico">' + ICON.check + '</span><span>Available — Demo Mode<small>Real-time availability is not enabled in this demonstration.</small></span>';
    return;
  }
  if (state.avail === 'checking') {
    st.classList.add('checking');
    st.innerHTML = '<span class="st-ico spin">' + ICON.spin + '</span><span>Checking real-time availability…</span>';
  } else if (state.avail === 'ok') {
    st.classList.add('ok');
    st.innerHTML = '<span class="st-ico">' + ICON.check + '</span><span>Available — real time<small>Live availability from our booking system.</small></span>';
  } else if (state.avail === 'busy') {
    const c = (state.busyInfo || []).map(b => fmtTime(b.start) + ' – ' + fmtTime(b.end)).join(' · ');
    st.classList.add('busy');
    st.innerHTML = '<span class="st-ico">' + ICON.cross + '</span><span>Not available for those hours<small>Already booked: ' + esc(c || 'overlapping slot') + '. Please choose different hours.</small></span>';
  } else {
    st.classList.add('warn');
    st.innerHTML = '<span class="st-ico">' + ICON.info + '</span><span>Could not verify availability right now<small>You can still submit — our team will confirm with you.</small></span>';
  }
}

/* ============================================================
   BOOKING OVERLAY
   ============================================================ */
const overlay = $('#bookingOverlay');
const overlayBody = $('#overlayBody');
const stepperEl = $('#stepper');
const actionsEl = $('#overlayActions');

function lockScroll(on) { document.documentElement.style.overflow = on ? 'hidden' : ''; }

function openBooking(opts) {
  opts = opts || {};
  if (state.completed && !opts.room && !opts.branch) resetState(); // fresh flow after a completed booking
  if (opts.room) state.room = opts.room;
  if (opts.branch) state.branch = opts.branch;
  let target;
  if (opts.branch && opts.room) target = 3;
  else if (opts.branch) target = 2;
  else if (opts.room) target = 1;
  else if (state.branch && state.room) target = Math.min(Math.max(state.step, 3), 4);
  else if (state.branch) target = 2;
  else target = 1;
  overlay.classList.add('open');
  lockScroll(true);
  slider.stop();
  goStep(target);
}

function closeBooking() {
  overlay.classList.remove('open');
  lockScroll(false);
  slider.start();
}

/* allow clicking completed steps in the stepper to jump back */
$$('.step-btn', stepperEl).forEach(btn => {
  btn.addEventListener('click', () => {
    const s = +btn.dataset.step;
    if (s < state.step && s < 5) goStep(s);
  });
});

/* ---------- selection panes ---------- */
function buildPickBranches() {
  $('#pickBranches').innerHTML = CONFIG.branches.map(b => `
    <button type="button" class="pick-card" data-branch-id="${b.id}">
      <span class="pick-media">
        <img src="${b.img}" alt="${esc(b.name)}" loading="lazy">
        <span class="pick-check">${ICON.check}</span>
        <span class="pick-rate">${ICON.pin}<span style="color:var(--ink-dim);font-weight:600">${esc(b.area)}</span></span>
      </span>
      <span class="pick-body">
        <span class="pick-eyebrow">${ICON.pin} ${esc(b.badge)}</span>
        <b class="pick-title">${esc(b.name)}</b>
        <span class="pick-desc">${esc(b.blurb)}</span>
        <span class="pick-cta">Select this branch →</span>
      </span>
    </button>`).join('');
  $$('#pickBranches .pick-card').forEach(card => {
    card.addEventListener('click', () => {
      state.branch = card.dataset.branchId;
      refreshPicks();
      renderActions();
    });
  });
}

function buildPickRooms() {
  $('#pickRooms').innerHTML = CONFIG.rooms.map(r => `
    <button type="button" class="pick-card" data-room-id="${r.id}">
      <span class="pick-media">
        <img src="${r.img}" alt="${esc(r.name)}" loading="lazy">
        <span class="pick-check">${ICON.check}</span>
        <span class="pick-rate"><b>${money(r.rate)}</b><span>/ hour</span></span>
      </span>
      <span class="pick-body">
        <span class="pick-eyebrow">${esc(r.kicker)}</span>
        <b class="pick-title">${esc(r.name)}</b>
        <span class="pick-desc">${esc(r.blurb)}</span>
        <span class="pick-cta">Select this room →</span>
      </span>
    </button>`).join('');
  $$('#pickRooms .pick-card').forEach(card => {
    card.addEventListener('click', () => {
      state.room = card.dataset.roomId;
      refreshPicks();
      renderActions();
    });
  });
}

function refreshPicks() {
  $$('#pickBranches .pick-card').forEach(c => c.classList.toggle('selected', c.dataset.branchId === state.branch));
  $$('#pickRooms .pick-card').forEach(c => c.classList.toggle('selected', c.dataset.roomId === state.room));
}

/* ---------- stepper / panes / actions ---------- */
function goStep(n) {
  state.step = n;
  $$('.step-btn', stepperEl).forEach((el, i) => {
    const s = i + 1;
    el.classList.toggle('current', s === n);
    el.classList.toggle('done', s < n);
  });
  $$('.step-line', stepperEl).forEach((el, i) => el.classList.toggle('done', i + 1 < n));
  stepperEl.style.display = (n === 5) ? 'none' : '';
  $$('.pane', overlayBody).forEach(p => p.classList.toggle('active', +p.dataset.pane === n));
  overlayBody.scrollTop = 0;
  if (n === 3) initSchedulePane();
  if (n === 4) buildReview();
  if (n === 5) buildSuccess();
  renderActions();
  $('#overlayBack').style.visibility = (n === 5) ? 'hidden' : 'visible';
}

function renderActions() {
  const n = state.step;
  let html = '';
  if (n === 1) {
    html = `<span class="hint">Step 1 of 4 · Choose where your story begins</span>
      <span class="actions-right"><button class="btn btn-primary btn-lg" id="actNext" ${state.branch ? '' : 'disabled'}>Continue</button></span>`;
  } else if (n === 2) {
    html = `<button class="btn btn-ghost" id="actBack">← Back</button>
      <span class="actions-right"><button class="btn btn-primary btn-lg" id="actNext" ${state.room ? '' : 'disabled'}>Continue</button></span>`;
  } else if (n === 3) {
    html = `<button class="btn btn-ghost" id="actBack">← Back</button>
      <span class="actions-right"><button class="btn btn-primary btn-lg" id="actNext" ${reviewEnabled() ? '' : 'disabled'}>Review Booking →</button></span>`;
  } else if (n === 4) {
    html = `<button class="btn btn-ghost" id="actBack">← Back</button>
      <span class="actions-right"><button class="btn btn-primary btn-lg" id="actConfirm" ${reviewValid() && !(live.on && state.avail === 'busy') ? '' : 'disabled'}>Confirm Booking ✓</button></span>`;
  } else {
    html = `<button class="btn btn-ghost" id="actReset">Book Another Stay</button>
      <span class="actions-right"><button class="btn btn-primary btn-lg" id="actDone">Done</button></span>`;
  }
  actionsEl.innerHTML = html;
  const back = $('#actBack');
  if (back) back.addEventListener('click', () => goStep(state.step - 1));
  const next = $('#actNext');
  if (next) next.addEventListener('click', () => goStep(state.step + 1));
  const confirm = $('#actConfirm');
  if (confirm) confirm.addEventListener('click', confirmBooking);
  const done = $('#actDone');
  if (done) done.addEventListener('click', () => { resetFlow(); closeBooking(); });
  const reset = $('#actReset');
  if (reset) reset.addEventListener('click', resetFlow);
}

function resetState() {
  state.step = 1; state.branch = null; state.room = null;
  state.date = ''; state.start = ''; state.end = '';
  state.name = ''; state.phone = ''; state.contact = '';
  state.agreed = false; state.ref = null; state.completed = false;
  state.avail = live.on ? 'unknown' : 'off';
  refreshPicks();
  const d = $('#bkDate'), s = $('#bkIn'), e = $('#bkOut');
  if (d) d.value = '';
  if (s) s.value = '';
  if (e) e.value = '';
  const nm = $('#bkName'), ph = $('#bkPhone'), ct = $('#bkContact');
  if (nm) nm.value = '';
  if (ph) ph.value = '';
  if (ct) ct.value = '';
  const ag = $('#agreeChk');
  if (ag) ag.checked = false;
}

function resetFlow() {
  resetState();
  goStep(1);
}

/* ============================================================
   STEP 3 — SCHEDULE (check-in / check-out, whole hours only)
   ============================================================ */
function initSchedulePane() {
  const d = $('#bkDate'), s = $('#bkIn'), e = $('#bkOut');
  if (!d.dataset.init) {
    d.dataset.init = '1';
    d.min = new Date().toLocaleDateString('en-CA');
    [d, s, e].forEach(el => { el.addEventListener('input', recalcSchedule); el.addEventListener('change', recalcSchedule); });
    $$('#hourChips button').forEach(chip => {
      chip.addEventListener('click', () => {
        const h = +chip.dataset.hours;
        if (!state.start) { toast('Pick a check-in time first', ICON.info); $('#bkIn').focus(); return; }
        const out = toMin(state.start) + h * 60;
        if (out >= 1440) { toast('That would pass midnight — choose fewer hours', ICON.info); return; }
        $('#bkOut').value = toHHMM(out);
        recalcSchedule();
      });
    });
  }
  d.value = state.date; s.value = state.start; e.value = state.end;
  $('#schedRoomPill').innerHTML = ICON.cal + ' <b>' + esc(getRoom() ? getRoom().name : '—') + '</b>&nbsp;·&nbsp;' + money(getRoom() ? getRoom().rate : 0) + ' / hour';
  $('#schedBranchPill').innerHTML = ICON.pin + ' <b>' + esc(getBranch() ? getBranch().name : '—') + '</b>';
  recalcSchedule();
  if (live.on) checkAvailability();
}

function recalcSchedule() {
  if (!getRoom() || !getBranch()) return;
  state.date  = $('#bkDate').value || '';
  state.start = $('#bkIn').value || '';
  state.end   = $('#bkOut').value || '';

  const hasIn = !!state.start, hasOut = !!state.end;
  const orderOk = hasIn && hasOut && toMin(state.end) > toMin(state.start);
  const wholeOk = orderOk && (toMin(state.end) - toMin(state.start)) % 60 === 0;

  const items = {
    date:  state.date ? 'ok' : '',
    in:    hasIn ? 'ok' : '',
    out:   hasOut ? 'ok' : '',
    order: (hasIn && hasOut) ? (orderOk ? 'ok' : 'bad') : '',
    whole: orderOk ? (wholeOk ? 'ok' : 'bad') : ''
  };
  $$('#schedChecks li').forEach(li => {
    const k = li.dataset.check;
    li.classList.toggle('ok', items[k] === 'ok');
    li.classList.toggle('bad', items[k] === 'bad');
  });

  /* hour chips: highlight matching duration, disable ones past midnight */
  const mins = orderOk ? toMin(state.end) - toMin(state.start) : 0;
  $$('#hourChips button').forEach(chip => {
    const h = +chip.dataset.hours;
    chip.classList.toggle('active', wholeOk && mins === h * 60);
    const crossesMidnight = hasIn && toMin(state.start) + h * 60 >= 1440;
    chip.disabled = crossesMidnight;
  });

  const valid = scheduleValid();
  $('#sumRoom').innerHTML = '<b>' + esc(getRoom().name) + '</b> · ' + money(getRoom().rate) + ' / hour';
  $('#sumBranch').textContent = getBranch().name;
  $('#sumRate').textContent = money(getRoom().rate) + ' / hour';
  $('#sumDur').textContent = valid ? fmtDur(mins) : '—';
  $('#sumTotal').textContent = valid ? money(totalPrice()) : '—';
  $('#sumHours').textContent = valid ? (mins / 60) + (mins >= 120 ? ' hours' : ' hour') : 'select times';

  if (valid && live.on && (state.avail === 'ok' || state.avail === 'busy')) {
    // times changed → previous verdict is stale
    state.avail = 'unknown';
  }
  paintStatus();
  renderActions();
  if (valid && live.on) checkAvailability();
}

/* ============================================================
   RECEIPT BUILDER
   ============================================================ */
function receiptHTML() {
  const r = getRoom(), b = getBranch();
  const valid = scheduleValid();
  return `
  <div class="receipt-head">
    <img src="${IMG.logo}" alt="${esc(CONFIG.brand)} logo">
    <div>
      <b>${esc(CONFIG.brand.toUpperCase())}</b>
      <span>Private Room Experience · Phnom Penh</span>
    </div>
    <div class="receipt-ref">Booking Ref<b>${esc(state.ref || '—')}</b></div>
  </div>
  <div class="receipt-rows">
    <div class="receipt-row"><span>Branch</span><b>${esc(b ? b.name + ' — ' + b.short : '—')}</b></div>
    <div class="receipt-row"><span>Room</span><b>${esc(r ? r.name : '—')}</b></div>
    <div class="receipt-row"><span>Booking date</span><b>${state.date ? esc(fmtDate(state.date)) : '—'}</b></div>
    <div class="receipt-row mono"><span>Check-in</span><b>${state.start ? esc(fmtTime(state.start)) : '—'}</b></div>
    <div class="receipt-row mono"><span>Check-out</span><b>${state.end ? esc(fmtTime(state.end)) : '—'}</b></div>
    <div class="receipt-row"><span>Duration</span><b>${valid ? esc(fmtDur(durationMin())) : '—'}</b></div>
    <div class="receipt-row"><span>Hourly rate</span><b>${r ? money(r.rate) + ' / hour' : '—'}</b></div>
  </div>
  <div class="receipt-total"><span>Estimated Total</span><b>${valid ? money(totalPrice()) : '—'}</b></div>
  <div class="receipt-rows">
    <div class="receipt-row"><span>Guest name</span><b>${state.name ? esc(state.name) : '—'}</b></div>
    <div class="receipt-row mono"><span>Contact</span><b>${state.phone ? esc(state.phone + (state.contact ? ' · ' + state.contact : '')) : '—'}</b></div>
  </div>
  <div class="receipt-foot">
    <b>Thank you for staying hidden</b>
    ${live.on ? 'Please complete the KHQR payment to confirm your booking' : 'Please present this slip upon arrival · Demonstration copy — not a real transaction'}
  </div>`;
}

/* ============================================================
   STEP 4 — REVIEW + KHQR PAYMENT
   ============================================================ */
function reviewValid() {
  return !!(scheduleValid() && state.agreed && state.name.trim() && state.phone.trim());
}

function buildReview() {
  if (!state.ref) state.ref = genRef();
  $('#reviewReceipt').innerHTML = receiptHTML();
  $('#payAmount').textContent = money(totalPrice());
  $('#payAmount2').textContent = money(totalPrice());
  $('#payDate').textContent = state.date ? fmtDate(state.date) : '—';
  renderKHQR($('#khqrCanvas'), totalPrice());
  $('#khqrDemoNote').style.display = khqrConfigured() ? 'none' : '';
  const ab = $('#abaPayBtn');
  if (ab) {
    ab.href = bakongPayLink(totalPrice());
    ab.style.display = khqrConfigured() ? '' : 'none';
    const amt = $('#abaPayAmt'); if (amt) amt.textContent = money(totalPrice());
  }

  const nm = $('#bkName'), ph = $('#bkPhone'), ct = $('#bkContact'), ag = $('#agreeChk');
  nm.value = state.name; ph.value = state.phone; ct.value = state.contact; ag.checked = state.agreed;
  $('#paySection').classList.toggle('open', state.agreed);

  if (!nm.dataset.init) {
    nm.dataset.init = ph.dataset.init = ct.dataset.init = ag.dataset.init = '1';
    nm.addEventListener('input', () => { state.name = nm.value; nm.closest('.field').classList.remove('invalid'); syncReview(); });
    ph.addEventListener('input', () => { state.phone = ph.value; ph.closest('.field').classList.remove('invalid'); syncReview(); });
    ct.addEventListener('input', () => { state.contact = ct.value; });
    ag.addEventListener('change', () => {
      state.agreed = ag.checked;
      $('#paySection').classList.toggle('open', state.agreed);
      syncReview();
      if (state.agreed) toast('Terms accepted — payment section unlocked');
    });
  }
  syncReview();
}

function syncReview() {
  $('#reviewReceipt').innerHTML = receiptHTML();
  const btn = $('#actConfirm');
  if (btn) btn.disabled = !reviewValid();
}

async function confirmBooking() {
  const nm = $('#bkName'), ph = $('#bkPhone');
  let ok = true;
  if (!state.name.trim()) { nm.closest('.field').classList.add('invalid'); ok = false; }
  if (!state.phone.trim()) { ph.closest('.field').classList.add('invalid'); ok = false; }
  if (!ok || !reviewValid() || !scheduleValid()) { toast('Please complete your details and accept the terms', ICON.info); return; }

  const btn = $('#actConfirm');
  const busyInfo = live.on && state.avail === 'busy';
  if (busyInfo) { toast('Those hours are not available — please change your schedule', ICON.cross); goStep(3); return; }

  /* local record (works in demo AND live) */
  const r = getRoom(), b = getBranch();
  const localBooking = {
    ref: state.ref,
    branch: b.name, branchArea: b.short,
    room: r.name,
    date: fmtDate(state.date),
    start: fmtTime(state.start),
    end: fmtTime(state.end),
    duration: fmtDur(durationMin()),
    rate: money(r.rate) + ' / hour',
    total: money(totalPrice()),
    name: state.name.trim(),
    phone: state.phone.trim(),
    contact: state.contact.trim(),
    status: 'Pending · Demo',
    source: live.on ? 'website · live' : 'website · demo',
    created: new Date().toISOString()
  };

  if (live.on) {
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const base = CONFIG.api.baseUrl || '';
    try {
      const resp = await fetchTimeout(base + '/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: state.branch, room: state.room,
          date: state.date, checkIn: state.start, checkOut: state.end,
          name: state.name.trim(), phone: state.phone.trim(), contact: state.contact.trim()
        })
      }, 8000);
      const j = await resp.json().catch(() => ({}));
      if (resp.status === 409) {
        state.avail = 'busy';
        state.busyInfo = (j && j.busy) || [];
        paintStatus();
        toast('Those hours were just taken — please pick other hours', ICON.cross);
        goStep(3);
        return;
      }
      if (!resp.ok || !j.ok) throw new Error('server error');
      if (j.ref) state.ref = j.ref;                    // use the server's reference
      localBooking.ref = state.ref;
      localBooking.status = 'Pending · Live';
    } catch (e) {
      // network/server failure → keep the booking locally, warn
      toast('Could not reach the server — saved locally for now', ICON.info);
    }
    btn.textContent = 'Confirm Booking ✓';
  }

  const list = store.get(BOOKINGS_KEY) || [];
  list.push(localBooking);
  store.set(BOOKINGS_KEY, list);
  state.completed = true;
  goStep(5);
}

/* ============================================================
   STEP 5 — SUCCESS
   ============================================================ */
function buildSuccess() {
  $('#successReceipt').innerHTML = receiptHTML();
}

/* ============================================================
   MY BOOKINGS (localStorage viewer)
   ============================================================ */
const bookingsModal = $('#bookingsModal');
function openBookings() { renderBookings(); bookingsModal.classList.add('open'); }
function closeBookings() { bookingsModal.classList.remove('open'); }

function renderBookings() {
  const list = (store.get(BOOKINGS_KEY) || []).slice().reverse();
  const body = $('#bookingsBody');
  if (!list.length) {
    body.innerHTML = `<div class="modal-empty">${ICON.cal}<p>No bookings yet on this device.<br>Make your first one — it only takes a minute.</p></div>`;
  } else {
    body.innerHTML = list.map(bk => `
      <div class="bk-item">
        <div class="bk-item-top"><b>${esc(bk.ref)}</b><span class="bk-status">${esc(bk.status)}</span></div>
        <div class="bk-item-rows">
          <div><span>Room</span><b>${esc(bk.room)}</b></div>
          <div><span>Branch</span><b>${esc(bk.branch)}</b></div>
          <div><span>Date</span><b>${esc(bk.date)}</b></div>
          <div><span>Check-in / out</span><b>${esc(bk.start)} – ${esc(bk.end)} · ${esc(bk.duration)}</b></div>
          <div><span>Guest</span><b>${esc(bk.name)}</b></div>
        </div>
        <div class="bk-item-foot">
          <span class="amt">${esc(bk.total)}</span>
          <button class="bk-del" data-ref="${esc(bk.ref)}">Remove</button>
        </div>
      </div>`).join('');
    $$('.bk-del', body).forEach(btn => btn.addEventListener('click', () => {
      const cur = store.get(BOOKINGS_KEY) || [];
      store.set(BOOKINGS_KEY, cur.filter(x => x.ref !== btn.dataset.ref));
      renderBookings();
      toast('Booking removed from this device');
    }));
  }
  $('#storageNote').innerHTML = store.persistent
    ? 'Bookings are saved locally in this browser only (demo storage).'
    : '<b>Preview note:</b> this sandbox blocks saved storage, so bookings last only for this preview session. Open the file in a normal browser tab and they will persist on the device.';
}

/* ============================================================
   GLOBAL EVENTS
   ============================================================ */
document.addEventListener('click', e => {
  const bookBtn = e.target.closest('[data-book]');
  if (bookBtn) {
    e.preventDefault();
    openBooking({
      room: bookBtn.dataset.room || null,
      branch: bookBtn.dataset.branch || null
    });
    return;
  }
  if (e.target.closest('[data-open-bookings]')) { openBookings(); return; }
  if (e.target.closest('[data-close-bookings]') || e.target === bookingsModal) { closeBookings(); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { copyText(cp.dataset.copy, cp.dataset.copyLabel); }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (bookingsModal.classList.contains('open')) closeBookings();
  else if (overlay.classList.contains('open')) closeBooking();
});

$('#overlayClose').addEventListener('click', closeBooking);
$('#overlayBack').addEventListener('click', () => {
  if (state.step > 1 && state.step < 5) goStep(state.step - 1);
  else closeBooking();
});

/* ============================================================
   INIT
   ============================================================ */
renderHomeRooms();
renderHomeBranches();
buildPickBranches();
buildPickRooms();
slider.build();
slider.start();
initReveal();
detectLive();
