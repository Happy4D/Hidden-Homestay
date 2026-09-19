#!/usr/bin/env node
/* Automated test for server/server.js — v2 model:
   12 rooms · weekday/weekend pricing · overnight · ID card · phone validation ·
   customer Telegram confirmation · bot flows · admin API · Supabase mode. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-test-'));
process.env.BOT_TOKEN = 'test-disabled';   // disables polling
process.env.ADMIN_KEY = 'test-key-123';    // protects GET /api/bookings

const S = require('../server/server.js');
const { createBooking, handleUpdate, store, digestText, sendDailyDigest, deliverConfirmation, priceFor, ROOMS } = S;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   -> ' + (extra !== undefined ? JSON.stringify(extra).slice(0, 220) : '')));
  cond ? pass++ : fail++;
};

/* stub Telegram that records every API call */
function makeTg() {
  const calls = [];
  const tg = {
    calls,
    call: async (method, params) => { calls.push({ method, params }); return { ok: true }; },
    sendMessage: async (chatId, text, extra) => { calls.push({ method: 'sendMessage', params: { chat_id: chatId, text, ...(extra || {}) } }); return { ok: true }; },
    sendMediaGroup: async (chatId, media) => { calls.push({ method: 'sendMediaGroup', params: { chat_id: chatId, media } }); return { ok: true }; },
    sendPhotoBuffer: async (chatId, buf, caption) => { calls.push({ method: 'sendPhotoBuffer', params: { chat_id: chatId, bytes: buf.length, caption } }); return { ok: true }; },
    downloadFile: async () => Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD', 'base64')  // fake jpeg bytes
  };
  return tg;
}
const upd = (chatId, text) => ({ message: { chat: { id: chatId }, text } });
const cbk = (chatId, data) => ({ callback_query: { id: 'q1', data, message: { chat: { id: chatId }, message_id: 42 } } });
const photoUpd = (chatId, caption) => ({ message: { chat: { id: chatId }, caption, photo: [{ file_id: 'f1' }, { file_id: 'f2' }] } });
const texts = tg => tg.calls.filter(c => c.method === 'sendMessage').map(c => c.params.text);
const edits = tg => tg.calls.filter(c => c.method === 'editMessageText').map(c => c.params.text);

/* date helpers — pick a guaranteed weekday + a guaranteed Saturday, in the future */
function nextDow(dow, minAhead) {
  let d = new Date(Date.now() + (minAhead || 2) * 86400000);
  while (d.getUTCDay() !== dow) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}
const aWeekday = nextDow(3);            // a Wednesday
const aSaturday = nextDow(6);           // a Saturday
const ID_PNG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD';
const OWNER = 111222333, CUSTOMER = 777888999, STRANGER = 555000111;

(async () => {
  /* ============================================================
     1 — PRICING ENGINE
     ============================================================ */
  console.log('== PRICING ENGINE ==');
  ok('weekday 3h standard = $12', priceFor('vintage', aWeekday, 3, false) === 12, priceFor('vintage', aWeekday, 3, false));
  ok('weekend 3h standard = $15', priceFor('vintage', aSaturday, 3, false) === 15, priceFor('vintage', aSaturday, 3, false));
  ok('weekday overnight standard = $18', priceFor('vintage', aWeekday, 12, true) === 18);
  ok('weekend overnight also $18', priceFor('camping', aSaturday, 12, true) === 18);
  ok('VIP 3h weekday = $15 (12+3)', priceFor('veggie', aWeekday, 3, false) === 15);
  ok('VIP overnight = $21 (18+3)', priceFor('gaming', aWeekday, 12, true) === 21);
  ok('pool 3h = $15, 1h = $5', priceFor('pool', aWeekday, 3, false) === 15 && priceFor('pool', aWeekday, 1, false) === 5);
  ok('pool overnight has no price', priceFor('pool', aWeekday, 12, true) === null);
  ok('standard 1h / 7h have no price (2-6 only)', priceFor('classic', aWeekday, 1, false) === null && priceFor('classic', aWeekday, 7, false) === null);
  ok('12 rooms configured', Object.keys(ROOMS).length === 12, Object.keys(ROOMS));

  /* ============================================================
     2 — BOOKING VALIDATION
     ============================================================ */
  console.log('== BOOKING VALIDATION ==');
  let r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '14:00', hours: 3, name: 'Sokha', phone: '012345678' }, 'website');
  ok('standard 3h website booking ok', r.ok === true && r.booking.total === 12 && r.booking.status === 'pending', r);
  ok('website booking has no branch field', r.ok && !('branch' in r.booking), r.booking);

  r = await createBooking({ room: 'classic', date: aWeekday, checkIn: '14:00', hours: 1, name: 'One Hour', phone: '012345678' }, 'website');
  ok('standard 1h rejected (min 2h)', r.ok === false && /2-6 hours/.test(r.message), r);

  r = await createBooking({ room: 'pool', date: aWeekday, checkIn: '10:00', hours: 1, name: 'Pool Guest', phone: '012345678' }, 'website');
  ok('pool 1h ok at $5', r.ok === true && r.booking.total === 5, r);

  r = await createBooking({ room: 'kuromi', date: aSaturday, checkIn: '14:00', hours: 3, name: 'Weekend Guest', phone: '012345678' }, 'website');
  ok('weekend price applied ($15)', r.ok === true && r.booking.total === 15, r);

  r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '14:00', hours: 3, name: 'No Digits', phone: '01a2b3c' }, 'website');
  ok('phone with letters rejected', r.ok === false && /digits/.test(r.message), r);

  r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '14:00', hours: 3, name: 'Short', phone: '0123' }, 'website');
  ok('phone too short rejected (8-15)', r.ok === false && /8-15/.test(r.message), r);

  /* ============================================================
     3 — OVERNIGHT BOOKINGS
     ============================================================ */
  console.log('== OVERNIGHT ==');
  r = await createBooking({ room: 'shanghai', date: aWeekday, checkIn: '20:00', hours: 12, overnight: true, name: 'Night Owl', phone: '012345678' }, 'website');
  ok('overnight without ID rejected (website)', r.ok === false && /ID Card photo is required/.test(r.message), r);

  r = await createBooking({ room: 'shanghai', date: aWeekday, checkIn: '22:00', hours: 12, overnight: true, idCard: ID_PNG, name: 'Night Owl', phone: '012345678' }, 'website');
  ok('overnight check-in must be 20:00 or 21:00', r.ok === false && /20:00 or 21:00/.test(r.message), r);

  r = await createBooking({ room: 'shanghai', date: aWeekday, checkIn: '20:00', hours: 12, overnight: true, idCard: ID_PNG, name: 'Night Owl', phone: '012345678' }, 'website');
  const ON1 = r.ok ? r.booking.ref : '';
  ok('overnight with ID ok · $18 · checkOut 08:00 · 12h', r.ok === true && r.booking.total === 18 && r.booking.checkOut === '08:00' && r.booking.hours === 12 && r.booking.overnight === true, r);

  r = await createBooking({ room: 'veggie', date: aWeekday, checkIn: '21:00', hours: 12, overnight: true, idCard: ID_PNG, name: 'Vip Night', phone: '012345678' }, 'telegram');
  ok('VIP overnight via telegram ok at $21 (no ID needed for owner-side)', r.ok === true && r.booking.total === 21 && r.booking.status === 'confirmed', r);

  /* overnight blocks the NEXT MORNING of the same room */
  const dayAfter = new Date(aWeekday + 'T00:00:00Z').toISOString().slice(0, 10) === aWeekday
    ? new Date(Date.parse(aWeekday + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : aWeekday;
  r = await createBooking({ room: 'shanghai', date: dayAfter, checkIn: '07:00', hours: 2, name: 'Early Bird', phone: '012345678' }, 'website');
  ok('overnight blocks 07:00 the NEXT DAY (true cross-midnight)', r.ok === false && r.error === 'conflict', r);

  r = await createBooking({ room: 'shanghai', date: dayAfter, checkIn: '09:00', hours: 2, name: 'Late Bird', phone: '012345678' }, 'website');
  ok('09:00 next day is free after 8AM checkout', r.ok === true, r);

  /* same slot, different room = fine */
  r = await createBooking({ room: 'classic', date: aWeekday, checkIn: '14:00', hours: 3, name: 'Other Room', phone: '088877766' }, 'website');
  ok('same slot different room is fine', r.ok === true, r);

  /* same room overlapping hours = conflict */
  r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '16:00', hours: 2, name: 'Clash', phone: '012345678' }, 'website');
  ok('overlapping hours same room → conflict', r.ok === false && r.error === 'conflict', r);

  /* 1-hour cleaning gap between bookings */
  r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '17:00', hours: 2, name: 'Too Soon', phone: '012345678' }, 'website');
  ok('cleaning: 17:00 start blocked right after a 14:00-17:00 booking', r.ok === false && r.error === 'conflict', r);
  r = await createBooking({ room: 'vintage', date: aWeekday, checkIn: '18:00', hours: 2, name: 'Clean Gap', phone: '012345678' }, 'website');
  ok('cleaning: 18:00 start allowed (full 1h gap)', r.ok === true, r);

  /* ============================================================
     4 — BOT: OWNER LINK + COMMANDS
     ============================================================ */
  console.log('== SAME-DAY RULES (Cambodia time, UTC+7) ==');
  const kd = new Date(Date.now() + 7 * 3600e3);
  const todayKH = kd.toISOString().slice(0, 10);
  const nowMin = kd.getUTCHours() * 60 + kd.getUTCMinutes();
  if (nowMin >= 10 * 60) {
    const pastHH = String(Math.floor((nowMin - 90) / 60)).padStart(2, '0') + ':00';
    r = await createBooking({ room: 'london', date: todayKH, checkIn: pastHH, hours: 2, name: 'Past Guest', phone: '012345678' }, 'website');
    ok('website: past check-in time rejected today', r.ok === false && /passed/.test(r.message || ''), r);
    r = await createBooking({ room: 'london', date: todayKH, checkIn: pastHH, hours: 2, name: 'Walk-in', phone: '012345678' }, 'telegram');
    ok('owner bot: past times still allowed (walk-ins)', r.ok === true, r);
  } else {
    console.log('  SKIP  past-time tests (Cambodia clock before 10:00)');
  }
  if (nowMin >= 8 * 60 && nowMin < 21 * 60) {
    r = await createBooking({ room: 'london', date: todayKH, checkIn: '22:00', hours: 2, name: 'Late Guest', phone: '012345678' }, 'website');
    ok('website: same-day check-in after 21:00 rejected', r.ok === false && /21:00/.test(r.message || ''), r);
  } else {
    console.log('  SKIP  21:00 cap test (Cambodia clock outside 08:00-21:00)');
  }

  console.log('== BOT COMMANDS ==');
  const tg = makeTg();
  await handleUpdate(upd(OWNER, '/start'), tg);
  await handleUpdate(upd(STRANGER, '/start'), tg);
  ok('first /start links owner',
    /Welcome/.test(texts(tg)[0] || ''), texts(tg));
  ok('customer /start gets the booking form directly',
    /BOOKING FORM/.test(texts(tg)[1] || '') && /hidden-homestay/.test(texts(tg)[1] || ''), (texts(tg)[1] || '').slice(0, 120));

  await handleUpdate(upd(OWNER, '/template'), tg);
  const tplMsg = texts(tg).slice(-1)[0] || '';
  ok('/template has no Branch line, has Room + Hours', /Room:/i.test(tplMsg) && /Hours:/i.test(tplMsg) && !/Branch:/i.test(tplMsg), tplMsg.slice(0, 120));

  /* paste a filled template (owner → confirmed) */
  await handleUpdate(upd(OWNER, 'BOOKING\nRoom: London\nDate: ' + aWeekday + '\nCheck-in: 15:00\nHours: 4\nName: Template Guest\nPhone: 099887766'), tg);
  const tplDone = texts(tg).slice(-1)[0] || '';
  ok('owner template paste → confirmed booking', /HH-/.test(tplDone) && /London/.test(tplDone), tplDone.slice(0, 140));
  ok('booking text shows "(5) London Room"', /\(5\) London Room/.test(tplDone), tplDone.slice(0, 140));
  ok('owner booking info includes Food Order', /Food Order: 015 233 598/.test(tplDone), tplDone.slice(-120));
  ok('template reply includes customer link', /https:\/\/t\.me\/HiddenHomestayBot\?start=HH-/.test(tplDone), tplDone.slice(-160));

  /* template overnight (owner side) */
  await handleUpdate(upd(OWNER, 'BOOKING\nRoom: kuromi\nDate: ' + aSaturday + '\nCheck-in: 20:00\nHours: overnight\nName: ON Guest\nPhone: 099887766'), tg);
  const tplON = texts(tg).slice(-1)[0] || '';
  ok('template overnight → booked + ID prompt', /HH-/.test(tplON) && /ID/.test(tplON), tplON.slice(0, 160));

  /* quick /book path */
  await handleUpdate(upd(OWNER, '/book gaming ' + aWeekday + ' 14:00 3 011122233 Quick VIP'), tg);
  const quick = texts(tg).slice(-1)[0] || '';
  ok('/book quick path: VIP 3h = $15', /HH-/.test(quick) && /\$15\.00/.test(quick), quick.slice(0, 160));

  await handleUpdate(upd(OWNER, '/book pool ' + aWeekday + ' 12:00 2 011122233 Pool Quick'), tg);
  ok('/book pool 2h = $10', /\$10\.00/.test(texts(tg).slice(-1)[0] || ''), texts(tg).slice(-1)[0]);
  ok('quick /book reply includes forwardable customer link', /https:\/\/t\.me\/HiddenHomestayBot\?start=HH-/.test(texts(tg).slice(-1)[0] || ''), (texts(tg).slice(-1)[0] || '').slice(-160));

  /* guided flow with buttons */
  const tg2 = makeTg();
  await handleUpdate(upd(OWNER, '/start'), tg2); // owner already set
  await handleUpdate(upd(OWNER, '/book'), tg2);
  const guided0 = JSON.stringify(tg2.calls);
  ok('guided /book starts at room picker (no branch step)', /bk:room:kuromi/.test(guided0) && !/bk:branch/.test(guided0));
  await handleUpdate(cbk(OWNER, 'bk:room:kuromi'), tg2);
  const dateBtn = (JSON.stringify(tg2.calls).match(/bk:date:(\d{4}-\d{2}-\d{2})/) || [])[1];
  ok('room → date step offers dates', !!dateBtn, dateBtn);
  if (dateBtn) {
    await handleUpdate(cbk(OWNER, 'bk:time:14:00'), tg2).catch(() => {});
    /* date first, then time */
  }
  // step order: room → date → time → dur → phone → name → review
  if (dateBtn) {
    await handleUpdate(cbk(OWNER, 'bk:date:' + dateBtn), tg2);
    await handleUpdate(cbk(OWNER, 'bk:time:14:00'), tg2);
    const durKb = JSON.stringify(tg2.calls);
    ok('time → duration picker with overnight chips', /bk:dur:ON8/.test(durKb) && /bk:dur:2/.test(durKb));
    await handleUpdate(cbk(OWNER, 'bk:dur:3'), tg2);
    await handleUpdate(upd(OWNER, '012 345 678'), tg2);
    await handleUpdate(upd(OWNER, 'Button Guest'), tg2);
    const review = texts(tg2).slice(-1)[0] || '';
    ok('guided flow reaches review with computed price', /Please check the booking/.test(review) && /Total/.test(review), review.slice(0, 160));
    await handleUpdate(cbk(OWNER, 'bk:ok'), tg2);
    const done = edits(tg2).slice(-1)[0] || '';
    ok('guided flow confirms booking', /BOOKED/.test(done) && /HH-/.test(done), done.slice(0, 160));
    ok('guided flow reply includes customer link', /https:\/\/t\.me\/HiddenHomestayBot\?start=HH-/.test(done), done.slice(-160));
  }

  /* ============================================================
     5 — CUSTOMER CONFIRMATION (deep link /start HH-REF)
     ============================================================ */
  console.log('== CUSTOMER CONFIRMATION ==');
  const onRef = ON1;
  await store.update(onRef, { status: 'confirmed' });      // owner confirmed from the dashboard
  const tg3 = makeTg();
  await handleUpdate(upd(CUSTOMER, '/start ' + onRef), tg3);
  const cMsgs = texts(tg3);
  const cMedia = tg3.calls.filter(c => c.method === 'sendMediaGroup');
  ok('customer /start REF gets confirmation text', cMsgs.some(x => /BOOKING CONFIRMED/.test(x) && /Night Owl/.test(x)), cMsgs[0] && cMsgs[0].slice(0, 140));
  ok('confirmation includes Food Order number', cMsgs.some(x => /Food Order: 015 233 598/.test(x)), cMsgs[0] && cMsgs[0].slice(0, 200));
  ok('confirmation includes room label', cMsgs.some(x => /\(2\) Shanghai Room/.test(x)), cMsgs[0] && cMsgs[0].slice(0, 200));
  ok('customer gets media album: room + guideline + parking + 5 menus', cMedia.length === 1 && cMedia[0].params.media.length === 8, cMedia[0] && cMedia[0].params.media.length);
  ok('media URLs use the public site', cMedia.length === 1 && cMedia[0].params.media.every(m => m.media.startsWith('https://')), cMedia[0] && cMedia[0].params.media[0]);

  /* pool booking → no guideline image (7 photos) */
  const tg3b = makeTg();
  const poolRes = await createBooking({ room: 'pool', date: aWeekday, checkIn: '15:00', hours: 2, name: 'Pool C', phone: '099887766' }, 'website');
  await store.update(poolRes.booking.ref, { status: 'confirmed' });
  await handleUpdate(upd(CUSTOMER, '/start ' + poolRes.booking.ref), tg3b);
  const poolMedia = tg3b.calls.filter(c => c.method === 'sendMediaGroup');
  ok('pool confirmation: room + parking + 5 menus (no guideline)', poolMedia.length === 1 && poolMedia[0].params.media.length === 7, poolMedia[0] && poolMedia[0].params.media.length);

  await handleUpdate(upd(CUSTOMER, '/start HH-NOPE99'), tg3);
  ok('unknown ref → friendly message', /don.t know the booking/i.test(texts(tg3).slice(-1)[0] || ''), texts(tg3).slice(-1)[0]);

  /* pending bookings: details only — the full guide unlocks after the owner confirms */
  const pendRes = await createBooking({ room: 'classic', date: aSaturday, checkIn: '12:00', hours: 2, name: 'Pending P', phone: '099887766' }, 'website');
  const tg3p = makeTg();
  await handleUpdate(upd(CUSTOMER, '/start ' + pendRes.booking.ref), tg3p);
  const pMsgs = texts(tg3p);
  ok('pending /start REF → received message (no full guide yet)', pMsgs.some(x => /BOOKING RECEIVED/.test(x) && /pending/i.test(x)) && tg3p.calls.filter(c => c.method === 'sendMediaGroup').length === 0, pMsgs[0] && pMsgs[0].slice(0, 120));
  await store.update(pendRes.booking.ref, { status: 'confirmed' });
  const tg3p2 = makeTg();
  await handleUpdate(upd(CUSTOMER, '/start ' + pendRes.booking.ref), tg3p2);
  ok('after owner confirms → full package unlocks', texts(tg3p2).some(x => /BOOKING CONFIRMED/.test(x)) && tg3p2.calls.filter(c => c.method === 'sendMediaGroup').length === 1, texts(tg3p2)[0] && texts(tg3p2)[0].slice(0, 100));

  /* owner sends ID photo for a telegram-side overnight booking */
  const tg4 = makeTg();
  const onTg = await createBooking({ room: 'camping', date: aWeekday, checkIn: '21:00', hours: 12, overnight: true, name: 'ID Less', phone: '012345678' }, 'telegram');
  await handleUpdate(photoUpd(OWNER, 'ID ' + onTg.booking.ref), tg4);
  const after = (await store.all()).find(b => b.ref === onTg.booking.ref);
  ok('owner photo caption "ID HH-REF" attaches the ID card', after && /data:image\/jpeg/.test(after.idCard || ''), after && (after.idCard || '').slice(0, 40));
  ok('bot confirms ID saved', /ID Card saved/.test(texts(tg4).slice(-1)[0] || ''), texts(tg4).slice(-1)[0]);

  /* /list and /busy work with 12 rooms */
  await handleUpdate(upd(OWNER, '/list ' + aWeekday), tg);
  ok('/list shows bookings with room names', /Vintage|Shanghai|Kuromi|London/.test(texts(tg).slice(-1)[0] || ''), texts(tg).slice(-1)[0]);

  /* /list sorted by room number, then check-in time */
  const sortDate = nextDow(0);   // a Sunday with no other bookings
  const s1r = await createBooking({ room: 'fishing', date: sortDate, checkIn: '13:00', hours: 2, name: 'A', phone: '012345678' }, 'telegram');
  const s2r = await createBooking({ room: 'camping',  date: sortDate, checkIn: '15:00', hours: 2, name: 'B', phone: '012345678' }, 'telegram');
  const s3r = await createBooking({ room: 'fishing', date: sortDate, checkIn: '10:00', hours: 2, name: 'C', phone: '012345678' }, 'telegram');
  await handleUpdate(upd(OWNER, '/list ' + sortDate), tg);
  const sortMsg = texts(tg).slice(-1)[0] || '';
  const iCamp = sortMsg.indexOf(s2r.booking.ref);
  const iFish10 = sortMsg.indexOf(s3r.booking.ref);
  const iFish13 = sortMsg.indexOf(s1r.booking.ref);
  ok('/list sorted: room number asc, then check-in asc', iCamp > -1 && iFish10 > -1 && iFish13 > -1 && iCamp < iFish10 && iFish10 < iFish13, sortMsg);

  /* /book accepts "(502) Kuromi" display labels */
  await handleUpdate(upd(OWNER, '/book (101) Veggie ' + aSaturday + ' 14:00 2 012345678 Label Test'), tg);
  ok('/book accepts room display labels', /HH-/.test(texts(tg).slice(-1)[0] || '') && /\(101\) Veggie Room/.test(texts(tg).slice(-1)[0] || ''), (texts(tg).slice(-1)[0] || '').slice(0, 120));

  /* customer template with a display label + overnight → pending + ID instruction */
  await handleUpdate(upd(STRANGER, 'BOOKING\nRoom: (3) Classic\nDate: ' + sortDate + '\nCheck-in: 20:00\nHours: overnight\nName: Customer ON\nPhone: 099887766'), tg);
  const custON = texts(tg).slice(-1)[0] || '';
  ok('customer overnight template → pending + send ID instruction', /HH-/.test(custON) && /ID HH-/.test(custON) && /owner will confirm/i.test(custON), custON.slice(0, 160));
  await handleUpdate(upd(OWNER, '/busy ' + aWeekday), tg);
  const busyMsg = texts(tg).slice(-1)[0] || '';
  ok('/busy lists all 12 rooms', (busyMsg.match(/all free/g) || []).length + (busyMsg.match(/·/g) || []).length >= 12, busyMsg.slice(0, 100));

  /* /link — forwardable customer confirmation link */
  const someRef = (texts(tg).join('\n').match(/HH-[A-Z0-9]{4,10}/) || [])[0] || '';
  await handleUpdate(upd(OWNER, '/link ' + someRef), tg);
  ok('/link REF returns the forwardable link', ('https://t.me/HiddenHomestayBot?start=' + someRef) === (texts(tg).slice(-1)[0] || '').split('\n').find(l => l.includes('t.me/')) , texts(tg).slice(-1)[0]);
  await handleUpdate(upd(OWNER, '/link'), tg);
  ok('/link without ref shows usage', /Usage: \/link/.test(texts(tg).slice(-1)[0] || ''), texts(tg).slice(-1)[0]);
  await handleUpdate(upd(OWNER, '/link HH-NOPE99'), tg);
  ok('/link unknown ref → not found', /No booking/.test(texts(tg).slice(-1)[0] || ''), texts(tg).slice(-1)[0]);
  await handleUpdate(upd(STRANGER, '/link ' + someRef), tg);
  ok('/link is owner-only (stranger turned away)', /private/.test(texts(tg).slice(-1)[0] || ''), texts(tg).slice(-1)[0]);

  /* ============================================================
     6 — HTTP API
     ============================================================ */
  console.log('== HTTP API ==');
  await new Promise(res => S.server.listen(0, res));
  const port = S.server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const KEY = 'test-key-123';
  const get = p => fetch(base + p).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));

  let h = (await get('/api/health')).j;
  ok('health ok', h.ok === true && h.storage === 'json-file', h);

  let av = (await get('/api/availability?date=' + aWeekday + '&checkIn=15:00&hours=2')).j;
  ok('availability marks busy rooms for the slot', av.ok === true && av.busy.some(b => b.room === 'vintage'), av);

  av = (await get('/api/availability?date=' + dayAfter + '&checkIn=07:00&hours=2')).j;
  ok('availability sees overnight spill into next morning', av.ok === true && av.busy.some(b => b.room === 'shanghai'), av);

  av = (await get('/api/availability?date=' + aWeekday + '&checkIn=22:00&hours=3')).j;
  ok('availability rejects missing/bad params', (await get('/api/availability?date=' + aWeekday)).status === 400);

  let pr = await post('/api/bookings', { room: 'gaming', date: aWeekday, checkIn: '18:00', hours: 2, name: 'Web Guest', phone: '012345678' });
  ok('POST booking ok + ref', pr.status === 200 && pr.j.ok && /^HH-/.test(pr.j.ref), pr.j);

  pr = await post('/api/bookings', { room: 'gaming', date: aWeekday, checkIn: '19:00', hours: 2, name: 'Clash', phone: '012345678' });
  ok('POST conflict → 409 with busy list', pr.status === 409 && pr.j.error === 'conflict', pr.j);

  pr = await post('/api/bookings', { room: 'london', date: aWeekday, checkIn: '20:00', hours: 12, overnight: true, name: 'No ID', phone: '012345678' });
  ok('POST overnight without ID → 400', pr.status === 400 && /ID Card/.test(pr.j.message), pr.j);

  pr = await post('/api/bookings', { room: 'london', date: aWeekday, checkIn: '20:00', hours: 12, overnight: true, idCard: ID_PNG, name: 'With ID', phone: '012345678' });
  ok('POST overnight with ID → ok $18', pr.status === 200 && pr.j.ok && pr.j.total === 18, pr.j);

  pr = await post('/api/bookings', { room: 'vintage', date: aWeekday, checkIn: '10:00', hours: 3, total: 1, name: 'Cheater', phone: '012345678' });
  ok('server ignores client-sent total (computes $12 itself)', pr.status === 200 && pr.j.total === 12, pr.j);

  let list = await get('/api/bookings');
  console.log('== ROOMS + STATUS API ==');
  {
    const rooms1 = await get('/api/rooms');
    ok('GET /api/rooms lists disabled (empty at first)', rooms1.status === 200 && rooms1.j.ok && Array.isArray(rooms1.j.disabled), rooms1.j);
    const noKey = await post('/api/rooms/status', { room: 'slayer', available: false });
    ok('rooms/status without key → 401', noKey.status === 401, noKey.status);
    const off = await post('/api/rooms/status', { key: 'test-key-123', room: 'slayer', available: false });
    ok('owner disables (201) Slayer', off.status === 200 && off.j.ok && off.j.disabled.includes('slayer'), off.j);
    const blocked = await createBooking({ room: 'slayer', date: aSaturday, checkIn: '14:00', hours: 2, name: 'Maint Test', phone: '012345678' }, 'telegram');
    ok('booking a maintenance room → rejected', blocked.ok === false && /maintenance/.test(blocked.message || ''), blocked);
    const rooms2 = await get('/api/rooms');
    ok('GET /api/rooms reflects the switch', (rooms2.j.disabled || []).includes('slayer'), rooms2.j);
    const avail = await get('/api/availability?date=' + aSaturday + '&checkIn=14%3A00&hours=2');
    ok('availability marks the room disabled', (avail.j.disabled || []).includes('slayer'), avail.j);
    const st = await get('/api/status?refs=' + poolRes.booking.ref + ',HH-NOPE99');
    ok('GET /api/status returns live statuses', st.j.ok && st.j.statuses[poolRes.booking.ref] === 'confirmed' && !st.j.statuses['HH-NOPE99'], st.j);
    const on = await post('/api/rooms/status', { key: 'test-key-123', room: 'slayer', available: true });
    ok('owner re-enables (201) Slayer', on.status === 200 && !(on.j.disabled || []).includes('slayer'), on.j);
    const okAgain = await createBooking({ room: 'slayer', date: aSaturday, checkIn: '14:00', hours: 2, name: 'Back Online', phone: '012345678' }, 'telegram');
    ok('room bookable again after re-enable', okAgain.ok === true, okAgain);
  }

  ok('GET /api/bookings blocked without key', list.status === 401 || list.status === 403, list.status);
  list = await get('/api/bookings?key=' + KEY);
  ok('GET /api/bookings with admin key works', list.status === 200 && list.j.ok && Array.isArray(list.j.bookings), list.status);

  const html = await fetch(base + '/admin').then(x => x.text());
  ok('admin dashboard served at /admin', /Hidden Homestay/.test(html));
  const site = await fetch(base + '/').then(x => x.text());
  ok('static site served at /', /Hidden Homestay/.test(site));

  S.server.close();

  /* ============================================================
     7 — DAILY DIGEST
     ============================================================ */
  console.log('== DAILY DIGEST ==');
  const dList = (await store.all()).filter(b => b.date === aWeekday && b.status !== 'cancelled');
  const dt = digestText(dList, aWeekday);
  ok('digest lists guests with rooms + totals', /TODAY/.test(dt) && /Sokha/.test(dt) && /Total/.test(dt), dt.slice(0, 120));
  ok('digest marks overnight stays', /🌙/.test(dt), dt.slice(0, 200));
  ok('digest empty day says no bookings', /No bookings/.test(digestText([], aWeekday)));
  const tgD = makeTg();
  await store.setOwner(OWNER);
  ok('digest sent to owner once', (await sendDailyDigest(tgD, aWeekday)) === true && texts(tgD).length === 1);
  ok('digest kv guard prevents double send', (await sendDailyDigest(tgD, aWeekday)) === false);

  /* ============================================================
     8 — SUPABASE MODE (mock PostgREST)
     ============================================================ */
  console.log('== SUPABASE STORAGE MODE ==');
  {
    const http = require('http');
    const sbRows = [], sbKv = {};
    let sawKey = true;
    const mock = http.createServer((rq, rs) => {
      let body = '';
      rq.on('data', c => body += c);
      rq.on('end', () => {
        sawKey = sawKey && rq.headers.apikey === 'test-sb-key' && rq.headers.authorization === 'Bearer test-sb-key';
        const u = new URL(rq.url, 'http://x');
        const json = o => { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
        if (rq.method === 'GET' && u.pathname === '/rest/v1/bookings') return json(sbRows);
        if (rq.method === 'POST' && u.pathname === '/rest/v1/bookings') { const row = JSON.parse(body); sbRows.push(row); return json([row]); }
        if (rq.method === 'PATCH' && u.pathname === '/rest/v1/bookings') {
          const ref = u.searchParams.get('ref').replace('eq.', '');
          const row = sbRows.find(x => x.ref === ref);
          if (row) Object.assign(row, JSON.parse(body));
          return json(row ? [row] : []);
        }
        if (rq.method === 'GET' && u.pathname === '/rest/v1/kv') {
          const k = u.searchParams.get('key').replace('eq.', '');
          return json(k in sbKv ? [{ value: sbKv[k] }] : []);
        }
        if (rq.method === 'PUT' && u.pathname === '/rest/v1/kv') {
          rs.writeHead(405, { 'Content-Type': 'application/json' });
          return rs.end('{"code":"PGRST105","message":"Filters must include all and only primary key columns with eq"}');
        }
        if (rq.method === 'POST' && u.pathname === '/rest/v1/kv') {
          const p = JSON.parse(body);
          if (typeof p.value !== 'string' || typeof p.key !== 'string') { rs.writeHead(400, { 'Content-Type': 'application/json' }); return rs.end('{"message":"invalid input for kv columns"}'); }
          sbKv[p.key] = p.value; return json([p]);
        }
        rs.writeHead(404); rs.end('{}');
      });
    });
    await new Promise(r => mock.listen(8099, r));

    process.env.SUPABASE_URL = 'http://localhost:8099';
    process.env.SUPABASE_KEY = 'test-sb-key';
    delete require.cache[require.resolve('../server/server.js')];
    const S2 = require('../server/server.js');
    try {
      await S2.store.setOwner('424242');
      ok('supabase mode: owner saved in kv table', (await S2.store.getOwner()) === '424242');

      const cs = await S2.createBooking({ room: 'veggie', date: aWeekday, checkIn: '18:00', hours: 2, name: 'Cloud Sokha', phone: '099887766' }, 'website');
      ok('supabase mode: booking created', cs.ok === true, cs);
      const row = sbRows.find(x => x.ref === cs.booking.ref);
      ok('supabase mode: row has overnight + id_card columns', row && row.overnight === false && row.id_card === '' && !('branch' in row), row);
      const back = (await S2.store.all()).find(b => b.ref === cs.booking.ref);
      ok('supabase mode: row read back as booking', back && back.checkIn === '18:00' && back.total === 13 && back.name === 'Cloud Sokha', back);

      const dup = await S2.createBooking({ room: 'veggie', date: aWeekday, checkIn: '19:00', hours: 2, name: 'Clash', phone: '088777666' }, 'telegram');
      ok('supabase mode: conflicts detected across cloud rows', dup.ok === false && dup.error === 'conflict', dup);

      await S2.store.update(cs.booking.ref, { idCard: ID_PNG });
      ok('supabase mode: idCard patch maps to id_card column', sbRows.find(x => x.ref === cs.booking.ref).id_card === ID_PNG);

      const tgSb = makeTg();
      ok('supabase mode: digest reads cloud rows + kv guard', (await S2.sendDailyDigest(tgSb, aWeekday)) === true && /Cloud Sokha/.test(texts(tgSb).join(' ')) && (await S2.sendDailyDigest(tgSb, aWeekday)) === false);
      ok('supabase mode: service-role key sent on every request', sawKey);
    } finally {
      delete require.cache[require.resolve('../server/server.js')];
      delete process.env.SUPABASE_URL; delete process.env.SUPABASE_KEY;
      mock.close();
    }
  }

  console.log('\n===========================\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
