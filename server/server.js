#!/usr/bin/env node
/* ============================================================
   HIDDEN HOMESTAY — booking server + Telegram bot
   ------------------------------------------------------------
   Zero npm dependencies — plain Node.js (18+).

   What it does:
     1. Serves the website (../index.html) at /
     2. REST API used by the website:
          GET  /api/health
          GET  /api/availability?branch=&room=&date=
          POST /api/bookings
          GET  /api/bookings?date=&key=      (key needed if ADMIN_KEY set)
     3. Telegram bot (long polling — no webhook/HTTPS setup needed):
          - notifies you of every new website booking, with
            ✅ Confirm / ❌ Cancel buttons
          - lets you take bookings yourself while chatting with a
            customer; the website immediately sees those hours as
            unavailable ("sync" between Telegram and website)

   Bot commands (chat with your bot):
          /start            link this chat as the owner
          /help             show all commands
          /list [date|all]  bookings for a date (default: today)
          /busy [date]      busy hours per room (default: today)
          /book <b> <r> <date> <HH:MM> <hours> <phone> <name>
                            take a booking manually, e.g.
                            /book 1 2 2026-09-10 14:00 3 012345678 Sokha Pen
          /confirm <REF>    confirm a booking
          /cancel <REF>     cancel a booking (frees the hours)

   Storage:
     - default: JSON file at server/data/store.json
     - optional (recommended for free hosting): Supabase
       set SUPABASE_URL + SUPABASE_KEY (see DEPLOYMENT.md)

   Environment variables:
     BOT_TOKEN      Telegram bot token from @BotFather
     OWNER_CHAT_ID  (optional) your Telegram chat id — otherwise the
                    first person to send /start to the bot becomes owner
     ADMIN_KEY      (optional) password for GET /api/bookings
     SUPABASE_URL / SUPABASE_KEY   (optional) database
     PORT           (default 8080)
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const CFG = {
  port: parseInt(process.env.PORT || '8080', 10),
  botToken: process.env.BOT_TOKEN || '',
  ownerChatId: process.env.OWNER_CHAT_ID || '',
  adminKey: process.env.ADMIN_KEY || '',
  dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),
  publicDir: path.join(__dirname, '..'),
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_KEY || '',
  publicUrl: (process.env.PUBLIC_URL || 'https://hidden-homestay.onrender.com').replace(/\/$/, '')
};

/* ---------- business data (keep in sync with the website CONFIG) ----------
   One branch: Borey Vimean Phnom Penh (No 235D, Road 777, Russey Keo).
   12 rooms: 1 pool ($5/h) + 8 standard (2-6h / overnight tables) + 3 VIP (+$3). */
const ROOMS = {
  pool:     { name: 'Pool Room',     type: 'pool' },
  vintage:  { name: 'Vintage Room',  type: 'standard' },
  shanghai: { name: 'Shanghai Room', type: 'standard' },
  classic:  { name: 'Classic Room',  type: 'standard' },
  london:   { name: 'London Room',   type: 'standard' },
  camping:  { name: 'Camping Room',  type: 'standard' },
  fishing:  { name: 'Fishing Room',  type: 'standard' },
  burger:   { name: 'Burger Room',   type: 'standard' },
  kuromi:   { name: 'Kuromi Room',   type: 'standard' },
  veggie:   { name: 'Veggie Room',   type: 'vip' },
  slayer:   { name: 'Slayer Room',   type: 'vip' },
  gaming:   { name: 'Gaming Room',   type: 'vip' }
};
const ROOM_ORDER = Object.keys(ROOMS);
const ADDRESS = 'No 235D, Road 777, Sangkat Jranh Chomres II, Khan Russey Keo, Phnom Penh';
const PRICING = {
  weekday: { 2: 10, 3: 12, 4: 14, 5: 18, 6: 20, overnight: 18 },
  weekend: { 2: 12, 3: 15, 4: 18, 5: 20, 6: 23, overnight: 18 }
};
const VIP_UPGRADE = 3;
const POOL_RATE = 5;
const isWeekend = dateStr => { const w = new Date(dateStr + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
/* priceFor(room, date, hours, overnight) — server-side truth, never trust the client */
function priceFor(room, date, hours, overnight) {
  const r = ROOMS[room]; if (!r) return null;
  if (r.type === 'pool') return overnight ? null : POOL_RATE * hours;
  const table = PRICING[isWeekend(date) ? 'weekend' : 'weekday'];
  let base;
  if (overnight) base = table.overnight;
  else { base = table[hours]; if (!base) return null; }
  return r.type === 'vip' ? base + VIP_UPGRADE : base;
}
const roomAssets = room => ({
  photo: CFG.publicUrl + '/assets/rooms/' + room + '.png',
  guide: CFG.publicUrl + '/assets/guides/' + room + '.jpg',
  parking: CFG.publicUrl + '/assets/guides/parking.jpg',
  menus: [1, 2, 3, 4, 5].map(i => CFG.publicUrl + '/assets/menu/menu' + i + '.jpg')
});

/* ---------- small helpers ---------- */
const toMin = t => { const p = t.split(':'); return (+p[0]) * 60 + (+p[1]); };
const pad = n => String(n).padStart(2, '0');
const money = n => '$' + Number(n).toFixed(2);
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const todayKH = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // Asia/Phnom_Penh
function genRef() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return 'HH-' + s;
}
function fmtTime(t) {
  const p = t.split(':').map(Number);
  const ap = p[0] >= 12 ? 'PM' : 'AM';
  const h = p[0] % 12 || 12;
  return h + ':' + pad(p[1]) + ' ' + ap;
}
function fmtDate(d) {
  const p = d.split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1, p[2]);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/* ============================================================
   STORAGE — JSON file (default) or Supabase (optional)
   ============================================================ */
const useSupabase = !!(CFG.supabaseUrl && CFG.supabaseKey);

function sbHeaders(extra) {
  return Object.assign({
    apikey: CFG.supabaseKey,
    Authorization: 'Bearer ' + CFG.supabaseKey,
    'Content-Type': 'application/json'
  }, extra || {});
}
const sbRowToBooking = r => ({
  ref: r.ref, source: r.source, branch: r.branch, room: r.room,
  date: r.date, checkIn: r.check_in, checkOut: r.check_out,
  hours: +r.hours, overnight: !!(r.overnight), rate: +r.rate, total: +r.total,
  name: r.name, phone: r.phone, contact: r.contact || '',
  status: r.status, created: r.created_at, idCard: r.id_card || ''
});
const bookingToSbRow = b => ({
  ref: b.ref, source: b.source, room: b.room,
  date: b.date, check_in: b.checkIn, check_out: b.checkOut,
  hours: b.hours, overnight: b.overnight ? true : false, rate: b.rate, total: b.total,
  name: b.name, phone: b.phone, contact: b.contact,
  status: b.status, id_card: b.idCard || ''
});

const store = {
  /* --- JSON file --- */
  _file() { return path.join(CFG.dataDir, 'store.json'); },
  _readJSON() {
    try {
      return JSON.parse(fs.readFileSync(this._file(), 'utf8'));
    } catch (e) { return { bookings: [], ownerChatId: '' }; }
  },
  _writeJSON(data) {
    fs.mkdirSync(CFG.dataDir, { recursive: true });
    const tmp = this._file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this._file());
  },

  /* --- public API (async) --- */
  async all() {
    if (!useSupabase) return this._readJSON().bookings;
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/bookings?select=*&order=created_at.desc&limit=500', { headers: sbHeaders() });
    if (!r.ok) throw new Error('supabase select failed ' + r.status);
    return (await r.json()).map(sbRowToBooking);
  },
  async add(booking) {
    if (!useSupabase) {
      const d = this._readJSON();
      d.bookings.push(booking);
      this._writeJSON(d);
      return booking;
    }
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/bookings', {
      method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(bookingToSbRow(booking))
    });
    if (!r.ok && r.status === 409) throw new Error('duplicate ref');
    if (!r.ok) throw new Error('supabase insert failed ' + r.status);
    return booking;
  },
  async update(ref, patch) {
    if (!useSupabase) {
      const d = this._readJSON();
      const b = d.bookings.find(x => x.ref === ref);
      if (b) Object.assign(b, patch);
      this._writeJSON(d);
      return b || null;
    }
    const row = {};
    Object.keys(patch || {}).forEach(k => { row[k === 'idCard' ? 'id_card' : k] = patch[k]; });
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/bookings?ref=eq.' + encodeURIComponent(ref), {
      method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(row)
    });
    if (!r.ok) throw new Error('supabase update failed ' + r.status);
    return null;
  },
  async getOwner() {
    if (CFG.ownerChatId) return String(CFG.ownerChatId);
    if (!useSupabase) return this._readJSON().ownerChatId || '';
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/kv?key=eq.owner&select=value', { headers: sbHeaders() });
    if (!r.ok) return '';
    const j = await r.json();
    return String((j[0] && j[0].value) || '');
  },
  async setOwner(chatId) {
    if (!useSupabase) {
      const d = this._readJSON();
      d.ownerChatId = chatId;
      this._writeJSON(d);
      return;
    }
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/kv', {
      method: 'POST', headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ key: 'owner', value: String(chatId) })
    });
    if (!r.ok) console.error('[store] WARNING: supabase setOwner failed ' + r.status + ' ' + (await r.text()).slice(0, 120) + ' — did you create the kv table?');
    return r.ok;
  },
  /* generic key/value storage (used for the bot's polling offset so a
     restart never re-processes old Telegram messages) */
  async getKv(key) {
    if (!useSupabase) { const d = this._readJSON(); return (d.kv && d.kv[key]) || ''; }
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: sbHeaders() });
    if (!r.ok) return '';
    const j = await r.json();
    return String((j[0] && j[0].value) || '');
  },
  async setKv(key, value) {
    if (!useSupabase) {
      const d = this._readJSON();
      d.kv = d.kv || {};
      d.kv[key] = value;
      this._writeJSON(d);
      return;
    }
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/kv', {
      method: 'POST', headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ key: key, value: value })
    });
    if (!r.ok) console.error('[store] WARNING: supabase setKv(' + key + ') failed ' + r.status + ' ' + (await r.text()).slice(0, 120));
    return r.ok;
  }
};

/* ============================================================
   INTERACTIVE BOOKING FLOW — buttons, mirrors the website steps
   (owner sends /book and taps: branch → room → date → time →
   hours → phone → name → confirm)
   ============================================================ */
const drafts = new Map();                 // chatId -> draft booking
const DRAFT_TTL = 15 * 60 * 1000;         // drafts expire after 15 min

function getDraft(chatId) {
  const d = drafts.get(chatId);
  if (!d) return null;
  if (Date.now() - d.ts > DRAFT_TTL) { drafts.delete(chatId); return null; }
  return d;
}
const kb = rows => ({ inline_keyboard: rows });
const cancelRow = [{ text: '❌ Cancel', callback_data: 'bk:cancel' }];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function roomRows() {
  return [
    [{ text: '🏊 Pool · $5/h', callback_data: 'bk:room:pool' }],
    [{ text: '📻 Vintage', callback_data: 'bk:room:vintage' }, { text: '🏮 Shanghai', callback_data: 'bk:room:shanghai' }, { text: '🎩 Classic', callback_data: 'bk:room:classic' }],
    [{ text: '🇬🇧 London', callback_data: 'bk:room:london' }, { text: '⛺ Camping', callback_data: 'bk:room:camping' }, { text: '🎣 Fishing', callback_data: 'bk:room:fishing' }],
    [{ text: '🍔 Burger', callback_data: 'bk:room:burger' }, { text: '🖤 Kuromi', callback_data: 'bk:room:kuromi' }],
    [{ text: '👑 Veggie VIP', callback_data: 'bk:room:veggie' }, { text: '👑 Slayer VIP', callback_data: 'bk:room:slayer' }, { text: '👑 Gaming VIP', callback_data: 'bk:room:gaming' }]
  ];
}
/* duration buttons depend on the room type */
function durationRows(room) {
  const cells = [];
  if (ROOMS[room] && ROOMS[room].type === 'pool') {
    for (let h = 1; h <= 12; h++) cells.push({ text: h + 'h', callback_data: 'bk:dur:' + h });
  } else {
    for (let h = 2; h <= 6; h++) cells.push({ text: h + 'h', callback_data: 'bk:dur:' + h });
    cells.push({ text: '🌙 8PM–8AM', callback_data: 'bk:dur:ON8' });
    cells.push({ text: '🌙 9PM–9AM', callback_data: 'bk:dur:ON9' });
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
  return rows;
}
function dateRows() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);        // Phnom Penh time
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(base + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? '📅 Today' : i === 1 ? '📅 Tomorrow' : '📅 ' + DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
    cells.push({ text: label, callback_data: 'bk:date:' + iso });
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return rows;
}
function timeRows() {
  const rows = [];
  for (let h = 8; h <= 23; h += 4) {
    const row = [];
    for (let k = 0; k < 4 && h + k <= 23; k++) row.push({ text: pad(h + k) + ':00', callback_data: 'bk:time:' + pad(h + k) + ':00' });
    rows.push(row);
  }
  return rows;
}
function hoursRows(checkIn) {
  const base = toMin(checkIn);
  const cells = [];
  for (let h = 1; h <= 6; h++) {
    if (base + h * 60 <= 1440) cells.push({ text: h + ' hr' + (h > 1 ? 's' : ''), callback_data: 'bk:hours:' + h });
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  return rows;
}

async function startDraft(chatId, tg) {
  drafts.set(chatId, { ts: Date.now(), step: 'room' });
  await draftShow(chatId, tg, getDraft(chatId));
}

async function draftBusyLine(d) {
  const list = (await store.all()).filter(b =>
    b.room === d.room && b.date === d.date && b.status !== 'cancelled');
  if (!list.length) return '🟢 This room is completely free on that date.';
  list.sort((a, b) => toMin(a.checkIn) - toMin(b.checkIn));
  return '📕 Already booked then: ' + list.map(b =>
    (b.overnight ? '🌙 ' + fmtTime(b.checkIn) + '→' + fmtTime(b.checkOut) + '+1' : fmtTime(b.checkIn) + ' – ' + fmtTime(b.checkOut))
  ).join(' · ');
}

function draftSummary(d) {
  const total = priceFor(d.room, d.date, d.hours, d.overnight);
  const r = ROOMS[d.room];
  return '📋 <b>Please check the booking:</b>\n\n' +
    '🏡 ' + esc(ADDRESS) + '\n' +
    '🛏 Room: ' + r.name + (r.type === 'vip' ? ' 👑 VIP (+' + VIP_UPGRADE + ')' : r.type === 'pool' ? ' 🏊' : '') + '\n' +
    '📅 Date: ' + fmtDate(d.date) + (isWeekend(d.date) ? ' (weekend rate)' : '') + '\n' +
    (d.overnight
      ? '🌙 Overnight: ' + fmtTime(d.checkIn) + ' → ' + fmtTime(d.checkOut) + ' next morning\n'
      : '🕐 Check-in: ' + fmtTime(d.checkIn) + ' → Check-out: ' + fmtTime(d.checkOut) + ' (' + d.hours + ' hr' + (d.hours > 1 ? 's' : '') + ')\n') +
    '💵 Total: <b>' + money(total) + '</b>' + (d.overnight ? ' (ask for ID Card!)' : '') + '\n' +
    '🙋 Guest: ' + esc(d.name) + ' · ' + esc(d.phone);
}

/* advance the draft to a step and send/edit the right message */
async function draftShow(chatId, tg, d, editMessageId) {
  const send = editMessageId
    ? (text, markup) => tg.call('editMessageText', { chat_id: chatId, message_id: editMessageId, text, parse_mode: 'HTML', reply_markup: markup })
    : (text, markup) => tg.sendMessage(chatId, text, { reply_markup: markup });
  if (d.step === 'room') {
    await send('🏠 <b>NEW BOOKING — step 1 of 6</b>\n\nOne address: ' + esc(ADDRESS) + '\n\n<b>Choose the room:</b>', kb(roomRows().concat([cancelRow])));
  } else if (d.step === 'date') {
    await send('✅ ' + ROOMS[d.room].name + '\n\n📅 <b>Step 2 of 6 — the date:</b>\n\n' + await draftBusyLine(d), kb(dateRows().concat([cancelRow])));
  } else if (d.step === 'time') {
    await send('📅 ' + fmtDate(d.date) + '\n\n🕐 <b>Step 3 of 6 — check-in time:</b>\n\n' + await draftBusyLine(d) + '\n\n<i>Or type a time like 19:30.</i>', kb(timeRows().concat([cancelRow])));
  } else if (d.step === 'dur') {
    const isPool = ROOMS[d.room].type === 'pool';
    const hint = isPool ? '1–12 hours ($5/h)' : '2–6 hours, or overnight 🌙';
    await send('🕐 Check-in ' + fmtTime(d.checkIn) + '\n\n⏱ <b>Step 4 of 6 — how long?</b>\n(' + hint + ')\n\n' + await draftBusyLine(d),
      kb(durationRows(d.room).concat([cancelRow])));
  } else if (d.step === 'phone') {
    await send('✅ ' + (d.overnight ? '🌙 overnight ' + fmtTime(d.checkIn) + ' → ' + fmtTime(d.checkOut) : fmtTime(d.checkIn) + ' → ' + fmtTime(d.checkOut) + ' (' + d.hours + 'h)') + '\n\n📞 <b>Step 5 of 6 — type the customer\'s phone number</b> (send it as a message)', kb([cancelRow]));
  } else if (d.step === 'name') {
    await send('📞 ' + esc(d.phone) + '\n\n🙋 <b>Step 6 of 6 — and the customer\'s name?</b> (send it as a message)', kb([cancelRow]));
  } else if (d.step === 'review') {
    await send(draftSummary(d), kb([
      [{ text: '✅ Confirm Booking', callback_data: 'bk:ok' }, { text: '❌ Cancel', callback_data: 'bk:cancel' }]
    ]));
  }
}

/* button taps during the draft */
async function draftCallback(cb, tg) {
  const chatId = String(cb.message.chat.id);
  const owner = await store.getOwner();
  if (owner && chatId !== owner) { await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Not allowed' }); return; }
  const d = getDraft(chatId);
  const parts = (cb.data || '').split(':');
  const action = parts[1];
  const val = parts.slice(2).join(':');
  const msgId = cb.message.message_id;

  if (action === 'cancel') {
    drafts.delete(chatId);
    await tg.call('answerCallbackQuery', { callback_query_id: cb.id });
    await tg.call('editMessageText', { chat_id: chatId, message_id: msgId, text: '❌ Booking cancelled. Send /book whenever you\'re ready. 🔄', parse_mode: 'HTML', reply_markup: kb([]) });
    return;
  }
  if (!d) {
    await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Draft expired' });
    await tg.call('editMessageText', { chat_id: chatId, message_id: msgId, text: 'This draft has expired. Send /book to start a new booking. 🔄', parse_mode: 'HTML', reply_markup: kb([]) });
    return;
  }
  d.ts = Date.now();

  if (action === 'room' && ROOMS[val]) {
    d.room = val; d.step = 'date';
  } else if (action === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(val) && val >= todayKH()) {
    d.date = val; d.step = 'time';
  } else if (action === 'time' && /^\d{2}:\d{2}$/.test(val)) {
    d.checkIn = val; d.step = 'dur';
  } else if (action === 'dur') {
    if (val === 'ON8' || val === 'ON9') {
      if (ROOMS[d.room].type === 'pool') { await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Pool is hourly only' }); return; }
      d.overnight = true;
      d.checkIn = val === 'ON8' ? '20:00' : '21:00';
      d.checkOut = val === 'ON8' ? '08:00' : '09:00';
      d.hours = 12;
    } else if (/^\d{1,2}$/.test(val)) {
      const h = +val;
      const isPool = ROOMS[d.room].type === 'pool';
      const minH = isPool ? 1 : 2, maxH = isPool ? 12 : 6;
      if (h < minH || h > maxH) { await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: isPool ? '1–12 hours' : '2–6 hours or overnight' }); return; }
      const outMin = toMin(d.checkIn) + h * 60;
      if (outMin > 1440) { await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'That would pass midnight — choose overnight instead' }); return; }
      d.overnight = false;
      d.hours = h;
      d.checkOut = pad(Math.floor(outMin / 60)) + ':' + pad(outMin % 60);
    } else { await tg.call('answerCallbackQuery', { callback_query_id: cb.id }); return; }
    const conflicts = await findConflicts(d.room, d.date, d.checkIn, d.hours);
    if (conflicts.length) {
      d.step = 'dur';
      await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: '⚠️ Those hours are taken' });
      await draftShow(chatId, tg, d, msgId);
      await tg.sendMessage(chatId, '⚠️ <b>Clash:</b> ' + conflicts.map(b => fmtTime(b.checkIn) + ' – ' + fmtTime(b.checkOut) + (b.overnight ? ' (overnight)' : '') + ' (' + b.ref + ')').join(' · ') + '\nChoose different hours or a different check-in time.');
      return;
    }
    d.step = 'phone';
  } else if (action === 'ok' && d.step === 'review') {
    const res = await createBooking(
      { room: d.room, date: d.date, checkIn: d.checkIn, checkOut: d.checkOut, hours: d.hours, overnight: d.overnight, name: d.name, phone: d.phone },
      'telegram');
    drafts.delete(chatId);
    if (res.ok) {
      await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Booked ✅' });
      await tg.call('editMessageText', {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb([]),
        text: '✅ <b>BOOKED &amp; CONFIRMED</b> — ref ' + res.booking.ref + '\n\n' + draftSummary(d).replace('📋 <b>Please check the booking:</b>\n\n', '') +
          '\n\n🌐 The website and dashboard now show these hours as taken.' +
          (res.booking.overnight ? '\n\n🪪 <b>Overnight booking</b> — send the guest\'s ID Card photo with caption <code>ID ' + res.booking.ref + '</code>' : '')
      });
      return;
    }
    await tg.call('editMessageText', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb([]), text: '⚠️ Could not book: ' + (res.message || 'those hours were just taken') });
    return;
  } else {
    await tg.call('answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }
  await tg.call('answerCallbackQuery', { callback_query_id: cb.id });
  await draftShow(chatId, tg, d, msgId);
}

/* typed input during the draft (date / time / hours / phone / name) */
async function draftText(chatId, text, tg) {
  const d = getDraft(chatId);
  if (!d) return false;
  const t = text.trim();
  d.ts = Date.now();

  if (d.step === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || t < todayKH()) {
      await tg.sendMessage(chatId, '⚠️ Please send a date like <code>2026-09-20</code> (today or later), or use the buttons.');
      return true;
    }
    d.date = t; d.step = 'time';
  } else if (d.step === 'time') {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) {
      await tg.sendMessage(chatId, '⚠️ Please send a time like <code>19:30</code>, or use the buttons.');
      return true;
    }
    d.checkIn = pad(+m[1]) + ':' + pad(+m[2]); d.step = 'hours';
  } else if (d.step === 'dur') {
    const isPool = ROOMS[d.room].type === 'pool';
    const on = t.replace(/\s+/g, '').toUpperCase();
    if (on === 'OVERNIGHT' || on === 'OVERNIGHT8' || on === 'ON8' || on === '8PM-8AM') {
      if (isPool) { await tg.sendMessage(chatId, '⚠️ Pool Room is hourly only — no overnight.'); return true; }
      d.overnight = true; d.checkIn = '20:00'; d.checkOut = '08:00'; d.hours = 12;
    } else if (on === 'OVERNIGHT9' || on === 'ON9' || on === '9PM-9AM') {
      if (isPool) { await tg.sendMessage(chatId, '⚠️ Pool Room is hourly only — no overnight.'); return true; }
      d.overnight = true; d.checkIn = '21:00'; d.checkOut = '09:00'; d.hours = 12;
    } else if (/^\d{1,2}$/.test(t)) {
      const h = +t;
      const minH = isPool ? 1 : 2, maxH = isPool ? 12 : 6;
      if (h < minH || h > maxH) {
        await tg.sendMessage(chatId, isPool ? '⚠️ Pool: 1–12 hours. Send a number.' : '⚠️ Standard/VIP: 2–6 hours, or write <b>overnight</b>.');
        return true;
      }
      const outMin = toMin(d.checkIn) + h * 60;
      if (outMin > 1440) { await tg.sendMessage(chatId, '⚠️ That would pass midnight — choose <b>overnight</b> instead.'); return true; }
      d.overnight = false; d.hours = h;
      d.checkOut = pad(Math.floor(outMin / 60)) + ':' + pad(outMin % 60);
    } else {
      await tg.sendMessage(chatId, '⚠️ Send a number of hours (2–6), or <b>overnight</b>.');
      return true;
    }
    const conflicts = await findConflicts(d.room, d.date, d.checkIn, d.hours);
    if (conflicts.length) {
      await tg.sendMessage(chatId, '⚠️ <b>Clash:</b> ' + conflicts.map(b => fmtTime(b.checkIn) + ' – ' + fmtTime(b.checkOut) + (b.overnight ? ' (overnight)' : '') + ' (' + b.ref + ')').join(' · ') + '\nChoose different hours.');
      await draftShow(chatId, tg, d);
      return true;
    }
    d.step = 'phone';
  } else if (d.step === 'phone') {
    if ((t.match(/\d/g) || []).length < 6) {
      await tg.sendMessage(chatId, '⚠️ That doesn\'t look like a phone number — try again (e.g. 012 345 678).');
      return true;
    }
    d.phone = t; d.step = 'name';
  } else if (d.step === 'name') {
    if (t.length < 2) { await tg.sendMessage(chatId, '⚠️ Please send the customer\'s name.'); return true; }
    d.name = t; d.step = 'review';
  } else {
    await tg.sendMessage(chatId, '👆 Please use the buttons above to continue (or send /book to start over).');
    return true;
  }
  await draftShow(chatId, tg, d);
  return true;
}

/* ============================================================
   BOOKING LOGIC (shared by API + bot)
   ============================================================ */
const dateIdx = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
const spanHours = b => (b.hours && b.hours > 0) ? b.hours : Math.max(1, Math.round((toMin(b.checkOut) - toMin(b.checkIn)) / 60));
/* overlap in absolute minutes — overnight bookings spill into the next morning automatically */
async function findConflicts(room, date, checkIn, hours) {
  const list = await store.all();
  const aStart = dateIdx(date) * 1440 + toMin(checkIn);
  const aEnd = aStart + hours * 60;
  return list.filter(b => {
    if (b.room !== room || b.status === 'cancelled') return false;
    const bStart = dateIdx(b.date) * 1440 + toMin(b.checkIn);
    const bEnd = bStart + spanHours(b) * 60;
    return bStart < aEnd && aStart < bEnd;
  });
}

async function createBooking(data, source, opts) {
  const { room, date, checkIn, checkOut, hours, overnight, name, phone, contact, idCard } = data;

  if (!ROOMS[room]) return { ok: false, error: 'invalid', message: 'Unknown room.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { ok: false, error: 'invalid', message: 'Date must be YYYY-MM-DD.' };
  if (!(name && String(name).trim())) return { ok: false, error: 'invalid', message: 'Guest name is required.' };
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (!phoneDigits) return { ok: false, error: 'invalid', message: 'Phone number is required.' };
  if (phoneDigits.length < 8 || phoneDigits.length > 15)
    return { ok: false, error: 'invalid', message: 'Phone number must be 8-15 digits (Telegram phone, numbers only).' };

  const isON = !!(overnight && overnight !== 'false');
  const r = ROOMS[room];
  let h, out;
  if (isON) {
    if (r.type === 'pool') return { ok: false, error: 'invalid', message: 'Pool Room is hourly only — no overnight.' };
    const okOut = { '20:00': '08:00', '21:00': '09:00' }[String(checkIn || '')];
    if (!okOut) return { ok: false, error: 'invalid', message: 'Overnight check-in must be 20:00 or 21:00.' };
    h = 12; out = okOut;
    if (!(idCard && String(idCard).startsWith('data:image/')) && source !== 'telegram')
      return { ok: false, error: 'invalid', message: 'ID Card photo is required for overnight stays.' };
    if (String(idCard).length > 6e6) return { ok: false, error: 'invalid', message: 'ID Card photo is too large.' };
  } else {
    if (!/^\d{2}:\d{2}$/.test(checkIn || '')) return { ok: false, error: 'invalid', message: 'Check-in must be HH:MM.' };
    h = parseInt(hours, 10);
    if (!h || h < 1) return { ok: false, error: 'invalid', message: 'Hours must be a whole number.' };
    if (r.type === 'standard' || r.type === 'vip') {
      if (h < 2 || h > 6) return { ok: false, error: 'invalid', message: 'Standard/VIP rooms: 2-6 hours, or overnight.' };
    } else if (h > 12) return { ok: false, error: 'invalid', message: 'Pool Room: 1-12 hours.' };
    const outMin = toMin(checkIn) + h * 60;
    if (outMin > 1440) return { ok: false, error: 'invalid', message: 'Hourly stays must finish before midnight — book overnight instead.' };
    if (checkOut && toMin(checkOut) !== outMin) return { ok: false, error: 'invalid', message: 'Check-out does not match check-in + hours.' };
    out = pad(Math.floor(outMin / 60)) + ':' + pad(outMin % 60);
  }

  const total = priceFor(room, date, h, isON);
  if (total == null) return { ok: false, error: 'invalid', message: 'No price for that room/duration.' };

  const conflicts = await findConflicts(room, date, checkIn, h);
  if (conflicts.length) return { ok: false, error: 'conflict', busy: conflicts.map(b => ({ start: b.checkIn, end: b.checkOut, ref: b.ref, status: b.status })) };

  let ref = genRef();
  const all = await store.all();
  while (all.some(b => b.ref === ref)) ref = genRef();

  const booking = {
    ref, source: source || 'website',
    room, date, checkIn, checkOut: out,
    hours: h, overnight: isON, rate: total, total,
    name: String(name).trim(), phone: phoneDigits, contact: String(contact || '').trim(),
    idCard: isON ? String(idCard) : '',
    status: (opts && (opts.status === 'confirmed' || opts.status === 'pending')) ? opts.status
      : (source === 'telegram' ? 'confirmed' : 'pending'),
    created: new Date().toISOString()
  };
  await store.add(booking);
  return { ok: true, booking };
}

function bookingText(b) {
  const r = ROOMS[b.room] || { name: b.room, type: '?' };
  return (
    '🆕 New booking request — Hidden Homestay\n\n' +
    'Ref: ' + b.ref + '  (via ' + b.source + ')\n' +
    'Room: ' + r.name + (r.type === 'vip' ? ' 👑 VIP' : r.type === 'pool' ? ' 🏊' : '') + '\n' +
    'Date: ' + fmtDate(b.date) + (isWeekend(b.date) ? '  (weekend rate)' : '') + '\n' +
    (b.overnight
      ? '🌙 Overnight: ' + fmtTime(b.checkIn) + ' → ' + fmtTime(b.checkOut) + ' next morning\n' +
        '🪪 ID Card: ' + (b.idCard ? 'attached ✓' : 'MISSING') + '\n'
      : 'Check-in: ' + fmtTime(b.checkIn) + ' → Check-out: ' + fmtTime(b.checkOut) + '  (' + b.hours + ' hr' + (b.hours > 1 ? 's' : '') + ')\n') +
    'Total: ' + money(b.total) + '\n\n' +
    'Guest: ' + b.name + '\n' +
    'Phone: ' + b.phone + (b.contact ? '\nContact: ' + b.contact : '')
  );
}
function bookingLine(b) {
  const mark = b.status === 'confirmed' ? '✅' : b.status === 'cancelled' ? '🚫' : '⏳';
  const r = ROOMS[b.room] || { name: b.room };
  return mark + ' ' + b.ref + ' · ' + r.name + ' · ' + fmtDate(b.date) + ' · ' +
    (b.overnight ? '🌙 ' + fmtTime(b.checkIn) + '→' + fmtTime(b.checkOut) + '+1' : fmtTime(b.checkIn) + '–' + fmtTime(b.checkOut)) +
    ' · ' + money(b.total) + ' · ' + esc(b.name) + ' ' + esc(b.phone);
}

/* ============================================================
   TELEGRAM BOT
   ============================================================ */
function makeTelegram(token) {
  const base = 'https://api.telegram.org/bot' + token;
  return {
    async call(method, params) {
      const r = await fetch(base + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
      });
      return r.json();
    },
    sendMessage(chatId, text, extra) {
      return this.call('sendMessage', Object.assign({ chat_id: chatId, text, parse_mode: 'HTML' }, extra || {}));
    },
    sendMediaGroup(chatId, media) {            // media: [{type:'photo', media:url, caption?}]
      return this.call('sendMediaGroup', { chat_id: chatId, media });
    },
    async sendPhotoBuffer(chatId, buffer, caption) {   // multipart upload (ID cards)
      const bound = '----hh' + Date.now();
      const parts = [];
      const add = (name, val) => parts.push(Buffer.from('--' + bound + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + val + '\r\n'));
      add('chat_id', String(chatId));
      if (caption) add('caption', caption);
      parts.push(Buffer.from('--' + bound + '\r\nContent-Disposition: form-data; name="photo"; filename="id-card.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'));
      parts.push(buffer);
      parts.push(Buffer.from('\r\n--' + bound + '--\r\n'));
      const r = await fetch(base + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=' + bound },
        body: Buffer.concat(parts)
      });
      return r.json();
    },
    async downloadFile(fileId) {               // telegram file -> Buffer
      const j = await this.call('getFile', { file_id: fileId });
      if (!j || !j.ok) throw new Error('getFile failed');
      const r = await fetch('https://api.telegram.org/file/bot' + token + '/' + j.result.file_path);
      return Buffer.from(await r.arrayBuffer());
    }
  };
}

/* ============================================================
   BOOKING TEMPLATE — paste a filled form, it books instantly
   ============================================================ */
const TEMPLATE_TEXT =
  'BOOKING\n' +
  'Room: Vintage\n' +
  'Date: 2026-09-20\n' +
  'Check-in: 14:00\n' +
  'Hours: 3\n' +
  'Name: \n' +
  'Phone: ';

function parseTemplate(text) {
  const keys = {
    room: 'room', date: 'date',
    'check-in': 'checkIn', checkin: 'checkIn', 'check-in time': 'checkIn', time: 'checkIn', start: 'checkIn',
    hours: 'hours', duration: 'hours', stay: 'hours',
    name: 'name', guest: 'name', 'guest name': 'name',
    phone: 'phone', 'phone number': 'phone', tel: 'phone', telephone: 'phone',
    contact: 'contact', telegram: 'contact',
    status: 'status'
  };
  const out = {};
  for (let line of String(text).split('\n')) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z \-]*?)\s*[:\uff1a]\s*(.+?)\s*$/);
    if (!m) continue;
    const k = keys[m[1].toLowerCase().trim()];
    if (k) out[k] = m[2].trim();
  }
  return out;
}

function looksLikeTemplate(text) {
  return Object.keys(parseTemplate(text)).length >= 3;
}

async function handleTemplate(chatId, text, tg, isOwner) {
  const t = parseTemplate(text);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const room = ROOM_ORDER.find(id => norm(id) === norm(t.room)) ||
    { poolroom: 'pool', pool: 'pool' }[norm(t.room)] || null;
  const hoursRaw = String(t.hours || '').toLowerCase().replace(/\s+/g, '');
  const overnight = hoursRaw === 'overnight' || hoursRaw === 'on8' || hoursRaw === '8pm-8am'
    ? 'ON8' : (hoursRaw === 'on9' || hoursRaw === '9pm-9am' || hoursRaw === 'overnight9' ? 'ON9' : '');
  const hours = parseInt(t.hours, 10);

  const problems = [];
  if (!room) problems.push('Room — one of: <b>pool, vintage, shanghai, classic, london, camping, fishing, burger, kuromi, veggie, slayer, gaming</b>');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) problems.push('Date — like <b>2026-09-20</b> (year-month-day)');
  if (!overnight && (!hours || hours < 1)) problems.push('Hours — a whole number (2-6), or <b>overnight</b>');
  if (!overnight && !/^\d{1,2}:\d{2}$/.test(t.checkIn || '')) problems.push('Check-in — like <b>14:00</b>');
  if (!((t.name || '').trim().length >= 2)) problems.push('Name — the guest\u2019s name');
  if (!((t.phone || '').replace(/\D/g, '').length >= 8)) problems.push('Phone — the guest\u2019s phone number (8-15 digits)');
  if (problems.length) {
    await tg.sendMessage(chatId,
      '⚠️ The booking template is missing a few things:\n\n• ' + problems.join('\n• ') +
      '\n\nSend /template to get a fresh one to copy and fill.');
    return;
  }

  const checkIn = overnight ? (overnight === 'ON8' ? '20:00' : '21:00') : t.checkIn;
  let checkOut = '';
  if (!overnight) {
    const outMin = toMin(t.checkIn) + hours * 60;
    if (outMin > 1440) { await tg.sendMessage(chatId, '⚠️ That would pass midnight — choose fewer hours, or write <b>overnight</b>.'); return; }
    checkOut = pad(Math.floor(outMin / 60)) + ':' + pad(outMin % 60);
  }

  const status = isOwner
    ? (String(t.status || '').toLowerCase() === 'pending' ? 'pending' : 'confirmed')
    : 'pending';
  const res = await createBooking(
    { room, date: t.date, checkIn, checkOut, hours: overnight ? 12 : hours, overnight: !!overnight, name: t.name, phone: t.phone, contact: t.contact || '' },
    'telegram', { status }
  );
  if (!res.ok) {
    if (res.error === 'conflict') {
      await tg.sendMessage(chatId, '⚠️ Those hours clash with:\n' +
        res.busy.map(b => fmtTime(b.start) + ' – ' + fmtTime(b.end) + ' (' + b.ref + ')').join('\n') +
        '\n\nChange the date, check-in time or hours and send the template again.');
    } else {
      await tg.sendMessage(chatId, '⚠️ ' + res.message + ' — send /template for a fresh form.');
    }
    return;
  }
  if (isOwner) {
    await tg.sendMessage(chatId, '✅ Booking saved — the website now shows these hours as taken.\n\n' +
      bookingText(res.booking).replace('\u{1F195} New booking request — Hidden Homestay\n\n', '') +
      (res.booking.overnight ? '\n\n🪪 <b>Overnight booking</b> — send the guest\'s ID Card photo with caption <code>ID ' + res.booking.ref + '</code>' : ''));
  } else {
    await tg.sendMessage(chatId, '\u{1F64F} Thank you ' + esc(t.name) + '! Your booking request was received:\n\n' +
      bookingText(res.booking).replace('\u{1F195} New booking request — Hidden Homestay\n\n', '') +
      '\n\nThe owner will confirm shortly.');
    notifyOwner(res.booking).catch(() => {});
  }
}

async function handleUpdate(update, tg) {
  /* --- button presses --- */
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = String(cb.message.chat.id);
    if ((cb.data || '').startsWith('bk:')) return draftCallback(cb, tg);
    const owner = await store.getOwner();
    if (owner && chatId !== owner) { await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Not allowed' }); return; }
    const [action, ref] = (cb.data || '').split(':');
    if (action !== 'confirm' && action !== 'cancel') return;
    const status = action === 'confirm' ? 'confirmed' : 'cancelled';
    await store.update(ref, { status });
    await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: action === 'confirm' ? 'Confirmed ✅' : 'Cancelled' });
    await tg.sendMessage(chatId, (action === 'confirm' ? '✅ Confirmed: ' : '🚫 Cancelled: ') + ref +
      (action === 'cancel' ? ' — those hours are free again.' : ''), { reply_markup: { inline_keyboard: [] } });
    return;
  }

  /* --- messages (text / photos) --- */
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  /* owner sends an ID Card photo with caption "ID HH-XXXXXX" */
  if (msg.photo && msg.caption) {
    const owner = await store.getOwner();
    if (owner && chatId !== String(owner)) return;
    const m = String(msg.caption).match(/ID\s*(HH-[A-Z0-9]{4,10})/i);
    if (!m) {
      await tg.sendMessage(chatId, '📎 To attach an ID Card to a booking, send the photo with the caption: <code>ID HH-XXXXXX</code>');
      return;
    }
    try {
      const buf = await tg.downloadFile(msg.photo[msg.photo.length - 1].file_id);
      const b64 = 'data:image/jpeg;base64,' + buf.toString('base64');
      await store.update(m[1].toUpperCase(), { idCard: b64 });
      await tg.sendMessage(chatId, '🪪 ID Card saved for ' + m[1].toUpperCase() + ' ✓');
    } catch (e) { await tg.sendMessage(chatId, '⚠️ Could not save that photo: ' + e.message); }
    return;
  }

  if (!msg.text) return;
  const text = msg.text.trim();

  /* typed input for an active booking draft (owner only) */
  if (!text.startsWith('/')) {
    const owner = await store.getOwner();
    if (getDraft(chatId) && (!owner || String(chatId) === String(owner))) {
      await draftText(chatId, text, tg);
      return;
    }
    /* a pasted booking template (owner or guest — guests create a pending request) */
    if (looksLikeTemplate(text)) { await handleTemplate(chatId, text, tg, !!(owner && String(chatId) === String(owner))); return; }
    return;
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0].split('@')[0].toLowerCase();
  const args = parts.slice(1);
  const owner = await store.getOwner();

  if (cmd === '/start') {
    const payload = (parts[1] || '').trim();
    if (/^HH-[A-Z0-9]{4,10}$/i.test(payload)) { await deliverConfirmation(chatId, payload.toUpperCase(), tg); return; }
    if (!owner) {
      await store.setOwner(chatId);
      await tg.sendMessage(chatId,
        '👋 Welcome to the <b>Hidden Homestay</b> booking bot!\n\n' +
        'This chat is now linked as the owner — you will receive an alert here every time a guest books on the website.\n\n' +
        'Send /help to see everything I can do.');
    } else if (String(chatId) === String(owner)) {
      await tg.sendMessage(chatId, 'Welcome back 👋 The website and this bot are connected. Send /help for commands.');
    } else {
      await tg.sendMessage(chatId, 'This bot is private. 🙏');
    }
    return;
  }

  if (cmd === '/chatid') {
    await tg.sendMessage(chatId, 'Your chat id is: <code>' + chatId + '</code>');
    return;
  }
  if (cmd === '/help') {
    await tg.sendMessage(chatId,
      '<b>Hidden Homestay bot — commands</b>\n\n' +
      '<b>Easiest — paste a filled booking template:</b>\n' +
      '/template — get the form to copy 📋\n' +
      'Fill it in (you or the guest), paste it back here — done.\n\n' +
      '<b>Take a booking (with buttons, like the website):</b>\n' +
      '/book — start the guided booking flow 🏠\n\n' +
      '/list — bookings for today\n' +
      '/list 2026-09-10 — bookings for a date\n' +
      '/list all — the 20 most recent bookings\n' +
      '/busy — busy hours per room today\n' +
      '/busy 2026-09-10 — busy hours for a date\n\n' +
      '<b>Quick booking (typing, for experts):</b>\n' +
      '<code>/book room date check-in hours phone name</code>\n' +
      'Example:\n<code>/book vintage 2026-09-10 14:00 3 012345678 Sokha Pen</code>\n' +
      'rooms: pool, vintage, shanghai, classic, london, camping, fishing, burger, kuromi, veggie, slayer, gaming\n' +
      'hours: 2–6, or <b>overnight</b> (8PM–8AM / 9PM–9AM)\n\n' +
      '/confirm HH-XXXXXX — confirm a pending booking\n' +
      '/cancel — cancel the current booking draft\n' +
      '/cancel HH-XXXXXX — cancel a booking (hours become free)\n\n' +
      'Bookings taken here appear on the website instantly.\n' +
      'The owner dashboard shows everything: yourwebsite.com/admin');
    return;
  }

  if (!owner || String(chatId) !== String(owner)) {
    await tg.sendMessage(chatId, 'This bot is private. 🙏');
    return;
  }

  if (cmd === '/template') {
    await tg.sendMessage(chatId,
      '\U0001F4CB <b>Booking template</b> — copy this, fill it in and send it back:\n\n' +
      '<pre>' + TEMPLATE_TEXT + '</pre>' +
      'Room: pool, vintage, shanghai, classic, london, camping, fishing, burger, kuromi, veggie, slayer, gaming\n' +
      'Hours: <b>2–6</b> or <b>overnight</b> (8PM-8AM / 9PM-9AM) · Date: year-month-day\n\n' +
      'The moment you send it back, the booking is saved and those hours show as <b>taken on the website</b>.\n' +
      'Add <code>Status: pending</code> if the guest hasn\u2019t paid yet (default is confirmed).\n' +
      'You can also send this form to the guest — if <i>they</i> paste it filled, you get an alert to confirm.');
    return;
  }

  if (cmd === '/list' || cmd === '/today') {
    const which = args[0] || todayKH();
    let list = await store.all();
    if (which !== 'all') list = list.filter(b => b.date === which);
    else list = list.slice(0, 20);
    if (!list.length) { await tg.sendMessage(chatId, 'No bookings' + (which === 'all' ? ' yet.' : ' for ' + which + '.')); return; }
    await tg.sendMessage(chatId, '<b>📅 ' + (which === 'all' ? 'Recent bookings' : 'Bookings — ' + fmtDate(which)) + '</b>\n\n' + list.map(bookingLine).join('\n'));
    return;
  }

  if (cmd === '/busy') {
    const date = args[0] || todayKH();
    const list = (await store.all()).filter(b => b.date === date && b.status !== 'cancelled');
    const lines = [];
    for (const room of ROOM_ORDER) {
      const busy = list.filter(b => b.room === room).sort((a, b) => toMin(a.checkIn) - toMin(b.checkIn));
      lines.push('<b>' + ROOMS[room].name + '</b>\n' + (busy.length ? busy.map(b => '· ' + fmtTime(b.checkIn) + ' – ' + fmtTime(b.checkOut) + ' (' + b.status + ')').join('\n') : '· all free ✨'));
    }
    await tg.sendMessage(chatId, '<b>📅 ' + fmtDate(date) + '</b>\n\n' + lines.join('\n\n'));
    return;
  }

  if (cmd === '/book') {
    if (args.length < 7) return startDraft(chatId, tg);   // no args → guided flow with buttons
    // /book <room> <date> <HH:MM> <hours> <phone> <name...>  (quick path)
    const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rIdx = ROOM_ORDER.find(id => norm(id) === norm(args[0]));
    const date = args[1];
    const checkIn = args[2];
    const hoursRaw = args[3].toLowerCase();
    const phone = args[4];
    const name = args.slice(5).join(' ');
    const overnight = /^(overnight8?|on8|8pm-8am|overnight)$/.test(hoursRaw.replace(/\s+/g, '')) ? 'ON8'
                    : /^(on9|9pm-9am|overnight9)$/.test(hoursRaw.replace(/\s+/g, '')) ? 'ON9' : '';
    if (!rIdx) { await tg.sendMessage(chatId, 'Room must be one of: ' + ROOM_ORDER.join(', ') + '.'); return; }
    if (!overnight && (!parseInt(hoursRaw, 10) || parseInt(hoursRaw, 10) < 1)) { await tg.sendMessage(chatId, 'Hours must be a number (2-6) or <b>overnight</b>.'); return; }
    let hours, chkIn = checkIn, checkOut = '';
    if (overnight === 'ON8') { hours = 12; chkIn = '20:00'; }
    else if (overnight === 'ON9') { hours = 12; chkIn = '21:00'; }
    else {
      hours = parseInt(hoursRaw, 10);
      const outMin = toMin(checkIn) + hours * 60;
      if (!/^\d{2}:\d{2}$/.test(checkIn || '') || outMin > 1440) { await tg.sendMessage(chatId, 'Check-in must be HH:MM and the stay must finish before midnight (use overnight otherwise).'); return; }
    }
    const res = await createBooking({ room: rIdx, date, checkIn: chkIn, checkOut, hours, overnight: !!overnight, name, phone }, 'telegram');
    if (!res.ok) {
      if (res.error === 'conflict') {
        await tg.sendMessage(chatId, '⚠️ Those hours clash with:\n' + res.busy.map(b => fmtTime(b.start) + ' – ' + fmtTime(b.end) + ' (' + b.ref + ')').join('\n'));
      } else {
        await tg.sendMessage(chatId, '⚠️ ' + res.message);
      }
      return;
    }
    await tg.sendMessage(chatId, '✅ Booked and confirmed — the website now shows these hours as taken.\n\n' + bookingText(res.booking).replace('🆕 New booking request — Hidden Homestay\n\n', ''));
    return;
  }

  if (cmd === '/confirm' || cmd === '/cancel') {
    const ref = (args[0] || '').toUpperCase();
    if (!ref) {
      if (cmd === '/cancel' && drafts.delete(chatId)) {
        await tg.sendMessage(chatId, '🧹 Booking draft cleared. Send /book to start again.');
      } else {
        await tg.sendMessage(chatId, 'Usage: ' + cmd + ' HH-XXXXXX');
      }
      return;
    }
    const status = cmd === '/confirm' ? 'confirmed' : 'cancelled';
    await store.update(ref, { status });
    await tg.sendMessage(chatId, (cmd === '/confirm' ? '✅ Confirmed: ' : '🚫 Cancelled: ') + ref +
      (cmd === '/cancel' ? ' — those hours are free again.' : ''));
    return;
  }

  await tg.sendMessage(chatId, 'Unknown command. Send /help to see what I can do.');
}

/* ---------- customer confirmation package (deep link /start HH-XXXX) ---------- */
async function deliverConfirmation(chatId, ref, tg) {
  const b = (await store.all()).find(x => String(x.ref).toUpperCase() === ref);
  if (!b) { await tg.sendMessage(chatId, '🙏 I don\u2019t know the booking ' + esc(ref) + ' — please use the Telegram button on the website after booking.'); return; }
  const r = ROOMS[b.room] || { name: b.room, type: '?' };
  const a = roomAssets(b.room);
  const txt =
    '✅ <b>BOOKING CONFIRMED — HIDDEN HOMESTAY</b>\n\n' +
    'Ref: <b>' + b.ref + '</b>\n' +
    'Room: <b>' + esc(r.name) + '</b>' + (r.type === 'vip' ? ' 👑 VIP' : '') + '\n' +
    'Date: ' + fmtDate(b.date) + '\n' +
    (b.overnight
      ? '🌙 Overnight: ' + fmtTime(b.checkIn) + ' → ' + fmtTime(b.checkOut) + ' next morning\n'
      : '🕐 ' + fmtTime(b.checkIn) + ' → ' + fmtTime(b.checkOut) + ' (' + b.hours + 'h)\n') +
    '💵 Total: <b>' + money(b.total) + '</b>\n' +
    '🙋 Guest: ' + esc(b.name) + ' · ' + esc(b.phone) + '\n\n' +
    '📍 ' + esc(ADDRESS) + '\n\n' +
    (b.status === 'confirmed'
      ? 'Your booking is <b>confirmed</b> ✅ — see you soon!\n'
      : '⏳ Status: <b>pending</b> — full payment confirms your booking.\n') +
    '🍜 ការកក់ត្រូវបានទទួល — សូមមើលរូបភាពខាងក្រោមសម្រាប់មគ្គុទ្ទេសក៍ចូល និងមឺនុយអាហារ។\n\n' +
    'Below: your room \u{1F3E8}, how to enter \u{1F5FA}\uFE0F, parking \u{1F17F}\uFE0F and the food menu \u{1F35C}. Enjoy your stay!';
  await tg.sendMessage(chatId, txt);
  const media = [{ type: 'photo', media: a.photo, caption: '🛏 ' + esc(r.name) }];
  if (ROOMS[b.room] && ROOMS[b.room].type !== 'pool') media.push({ type: 'photo', media: a.guide, caption: '🗺 How to enter & find your room' });
  media.push({ type: 'photo', media: a.parking, caption: '🅿️ Parking guide' });
  a.menus.forEach((m, i) => media.push({ type: 'photo', media: m, caption: '🍜 Food menu ' + (i + 1) + '/5' }));
  try { await tg.sendMediaGroup(chatId, media); }
  catch (e) { console.error('[bot] confirmation media failed:', e.message); }
}

/* ---------- polling loop ---------- */
async function startPolling() {
  if (!CFG.botToken) { console.log('[bot] No BOT_TOKEN set — running without Telegram.'); return; }
  if (CFG.botToken.startsWith('test')) { console.log('[bot] Test token — polling disabled.'); return; }
  const tg = makeTelegram(CFG.botToken);
  let offset = parseInt(await store.getKv('tgOffset'), 10) || 0;   // persisted → no replay after restart
  let invalidToken = false;
  console.log('[bot] Polling Telegram for updates…');
  (async function loop() {
    while (!invalidToken) {
      try {
        const r = await fetch('https://api.telegram.org/bot' + CFG.botToken + '/getUpdates?timeout=25&offset=' + offset, { method: 'GET' });
        if (r.status === 401 || r.status === 404) {
          console.error('[bot] BOT_TOKEN rejected by Telegram (' + r.status + '). Check the token from @BotFather.');
          invalidToken = true;
          break;
        }
        const j = await r.json();
        for (const u of (j.result || [])) {
          offset = u.update_id + 1;
          try { await handleUpdate(u, tg); }
          catch (e) { console.error('[bot] handler error:', e.message); }
          try { await store.setKv('tgOffset', String(offset)); } catch (e) {}
        }
      } catch (e) {
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  })();
}

/* ---------- notify owner about new website bookings ---------- */
async function notifyOwner(booking) {
  if (!CFG.botToken || CFG.botToken.startsWith('test')) return;
  const owner = await store.getOwner();
  if (!owner) return; // not linked yet — guest bookings still stored
  const tg = makeTelegram(CFG.botToken);
  await tg.sendMessage(owner, bookingText(booking), {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Confirm', callback_data: 'confirm:' + booking.ref },
      { text: '❌ Cancel', callback_data: 'cancel:' + booking.ref }
    ]] }
  });
  if (booking.overnight && booking.idCard) {
    try {
      const b64 = String(booking.idCard).split(',')[1];
      await tg.sendPhotoBuffer(owner, Buffer.from(b64, 'base64'), '🪪 ID Card — ' + booking.ref + ' · ' + booking.name);
    } catch (e) { console.error('[bot] could not send ID photo:', e.message); }
  }
}

/* ============================================================
   HTTP SERVER — API + static site
   ============================================================ */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};
function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(CFG.publicDir, file);
  if (!full.startsWith(CFG.publicDir)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  try {
    if (p === '/api/health') {
      let count = 0, owner = '';
      try { count = (await store.all()).length; owner = await store.getOwner(); } catch (e) {}
      return json(res, 200, {
        ok: true, live: true,
        storage: useSupabase ? 'supabase' : 'json-file',
        botLinked: !!(CFG.botToken && !CFG.botToken.startsWith('test')),
        ownerLinked: !!owner,
        bookings: count, now: new Date().toISOString()
      });
    }

    if (p === '/api/availability' && req.method === 'GET') {
      const date = url.searchParams.get('date') || '';
      const checkIn = url.searchParams.get('checkIn') || '';
      const hours = parseInt(url.searchParams.get('hours') || '', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(checkIn) || !hours || hours < 1 || hours > 12)
        return json(res, 400, { ok: false, message: 'date, checkIn and hours (1-12) are required' });
      const aStart = dateIdx(date) * 1440 + toMin(checkIn);
      const aEnd = aStart + hours * 60;
      const busy = (await store.all()).filter(b => {
        if (b.status === 'cancelled') return false;
        const bStart = dateIdx(b.date) * 1440 + toMin(b.checkIn);
        const bEnd = bStart + spanHours(b) * 60;
        return bStart < aEnd && aStart < bEnd;
      }).map(b => ({ room: b.room, start: b.checkIn, end: b.checkOut, ref: b.ref, status: b.status }));
      return json(res, 200, { ok: true, busy });
    }

    if (p === '/api/bookings' && req.method === 'POST') {
      const body = await readBody(req);
      const admin = !!(CFG.adminKey && body.key === CFG.adminKey);   // dashboard "New Booking"
      delete body.key;
      const resv = await createBooking(body, admin ? 'manual' : 'website', admin ? { status: body.status } : undefined);
      if (!resv.ok) {
        if (resv.error === 'conflict') return json(res, 409, { ok: false, error: 'conflict', busy: resv.busy });
        return json(res, 400, { ok: false, error: 'invalid', message: resv.message });
      }
      if (!admin) notifyOwner(resv.booking).catch(e => console.error('[bot] notify failed:', e.message));
      return json(res, 200, { ok: true, ref: resv.booking.ref, status: resv.booking.status, total: resv.booking.total });
    }

    if (p === '/api/bookings' && req.method === 'GET') {
      if (CFG.adminKey && url.searchParams.get('key') !== CFG.adminKey)
        return json(res, 401, { ok: false, message: 'key required' });
      const date = url.searchParams.get('date');
      let list = await store.all();
      if (date) list = list.filter(b => b.date === date);
      return json(res, 200, { ok: true, bookings: list.slice(0, 200) });
    }

    /* admin action: confirm / cancel a booking */
    if (p === '/api/bookings' && req.method === 'PATCH') {
      if (CFG.adminKey && url.searchParams.get('key') !== CFG.adminKey)
        return json(res, 401, { ok: false, message: 'key required' });
      const ref = (url.searchParams.get('ref') || '').toUpperCase();
      const body = await readBody(req);
      if (!ref || ['pending', 'confirmed', 'cancelled'].indexOf(body.status) === -1)
        return json(res, 400, { ok: false, message: 'ref and a valid status (pending/confirmed/cancelled) are required' });
      await store.update(ref, { status: body.status });
      return json(res, 200, { ok: true, ref: ref, status: body.status });
    }

    /* owner dashboard */
    if (p === '/admin' || p === '/admin/') return serveStatic(req, res, '/admin.html');

    serveStatic(req, res, p);
  } catch (e) {
    console.error('[api] error:', e.message);
    json(res, 500, { ok: false, message: 'server error' });
  }
});

/* ---------- daily digest to the owner (12:30 Phnom Penh time) ----------
   One forwardable text with all of TODAY's guests, sent once a day.
   Same-day bookings also alert instantly (no waiting) via notifyOwner. */
function phnomPenhNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = t => { const p = parts.find(x => x.type === t); return p ? p.value : ''; };
  return { date: get('year') + '-' + get('month') + '-' + get('day'), hour: +get('hour'), minute: +get('minute') };
}

function digestText(list, date) {
  const head = '\u{1F4CB} TODAY\u2019S GUESTS \u2014 ' + fmtDate(date) + '\n\n';
  if (!list.length) return head + '\u{1F4ED} No bookings for today.';
  const lines = list.map((b, i) =>
    (i + 1) + '. ' + (b.overnight ? '\u{1F319} ' : '') + fmtTime(b.checkIn) + ' \u2013 ' + fmtTime(b.checkOut) + (b.overnight ? ' +1 day' : '') + ' \u00b7 ' + (ROOMS[b.room] ? ROOMS[b.room].name : b.room) + '\n' +
    '      ' + esc(b.name) + ' \u00b7 ' + esc(b.phone) + (b.contact ? ' \u00b7 ' + esc(b.contact) : '') +
    ' \u00b7 ' + (b.status === 'confirmed' ? '\u2705' : '\u23F3') + ' ' + b.ref);
  const total = list.reduce((sum, b) => sum + b.total, 0);
  return head + lines.join('\n\n') + '\n\n' + list.length + ' booking(s) \u00b7 Total ' + money(total) + '\nForward this to your staff \u{1F64F}';
}

let digestSentInProc = '';
async function sendDailyDigest(tg, date) {
  const owner = await store.getOwner();
  if (!owner) return false;
  if (digestSentInProc === date) return false;                   // memory guard
  if ((await store.getKv('digestDate')) === date) return false;   // once per day
  const list = (await store.all()).filter(b => b.date === date && b.status !== 'cancelled');
  await tg.sendMessage(owner, digestText(list, date));
  await store.setKv('digestDate', date);
  digestSentInProc = date;
  return true;
}

async function supabaseBootCheck() {
  if (!useSupabase) return;
  try {
    const w = await store.setKv('bootCheck', String(Date.now()));
    const rb = await store.getKv('bootCheck');
    if (w === false || !rb) throw new Error('kv write/read failed — is the kv table created? (run the SQL from DEPLOYMENT.md)');
    console.log('  · Supabase storage: CONNECTED ✓ (cloud database read/write OK)');
  } catch (e) {
    console.error('  · Supabase storage: NOT WORKING — ' + e.message);
  }
}

function startDailyDigest() {
  if (!CFG.botToken || CFG.botToken.startsWith('test')) return;
  const tg = makeTelegram(CFG.botToken);
  setInterval(() => {
    const now = phnomPenhNow();
    const afterLunch = now.hour > 12 || (now.hour === 12 && now.minute >= 30);
    if (afterLunch) sendDailyDigest(tg, now.date).catch(e => console.error('[bot] digest failed:', e.message));
  }, 30000);
}

/* ---------- start ---------- */
if (require.main === module) {
  server.listen(CFG.port, () => {
    console.log(' Hidden Homestay server  ·  BUILD v2.2.3 (no KH tags)');
    console.log('  · site:    http://localhost:' + CFG.port);
    console.log('  · api:     http://localhost:' + CFG.port + '/api/health');
    console.log('  · storage: ' + (useSupabase ? 'Supabase' : 'JSON file (' + path.join(CFG.dataDir, 'store.json') + ')'));
  });
  startPolling();
  startDailyDigest();
  supabaseBootCheck();
}

/* exported for testing */
module.exports = { createBooking, handleUpdate, store, findConflicts, bookingText, digestText, sendDailyDigest, deliverConfirmation, priceFor, ROOMS, PRICING, server };
