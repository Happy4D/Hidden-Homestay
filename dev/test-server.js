#!/usr/bin/env node
/* Automated test for server/server.js — booking logic, bot commands (incl. interactive
   button flow), admin API, HTTP endpoints. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-test-'));
process.env.BOT_TOKEN = 'test-disabled';   // disables polling
process.env.ADMIN_KEY = 'test-key-123';    // protects GET/PATCH /api/bookings

const S = require('../server/server.js');
const { createBooking, handleUpdate, store } = S;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   -> ' + (extra !== undefined ? JSON.stringify(extra).slice(0, 200) : '')));
  cond ? pass++ : fail++;
};

/* stub Telegram that records every API call */
function makeTg() {
  const calls = [];
  const tg = {
    calls,
    call: async (method, params) => { calls.push({ method, params }); return { ok: true }; },
    sendMessage: async (chatId, text, extra) => { calls.push({ method: 'sendMessage', params: { chat_id: chatId, text, ...(extra || {}) } }); return { ok: true }; }
  };
  return tg;
}
const upd = (chatId, text) => ({ message: { chat: { id: chatId }, text } });
const cbk = (chatId, data) => ({ callback_query: { id: 'q1', data, message: { chat: { id: chatId }, message_id: 42 } } });
const texts = tg => tg.calls.filter(c => c.method === 'sendMessage').map(c => c.params.text);
const edits = tg => tg.calls.filter(c => c.method === 'editMessageText').map(c => c.params.text);
const tomorrow = () => new Date(Date.now() + 86400000 + 7 * 3600000).toISOString().slice(0, 10);

(async () => {
  console.log('== BOOKING LOGIC ==');
  let r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '14:00', checkOut: '17:00', name: 'Sokha', phone: '012' }, 'website');
  ok('valid booking created, pending, 3h vintage = $21', r.ok && r.booking.status === 'pending' && r.booking.total === 21, r);
  const ref1 = r.booking ? r.booking.ref : null;

  r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '16:00', checkOut: '18:00', name: 'X', phone: '1' }, 'website');
  ok('overlap rejected (14-17 vs 16-18)', !r.ok && r.error === 'conflict', r);

  r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '17:00', checkOut: '19:00', name: 'X', phone: '1' }, 'website');
  ok('back-to-back allowed (17-19)', r.ok, r);

  r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '14:00', checkOut: '15:30', name: 'X', phone: '1' }, 'website');
  ok('fractional hours rejected (1.5h)', !r.ok && /whole hours/.test(r.message), r);

  r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '15:00', checkOut: '14:00', name: 'X', phone: '1' }, 'website');
  ok('checkout before checkin rejected', !r.ok && /later/.test(r.message), r);

  r = await createBooking({ branch: 'penghout', room: 'vintage', date: tomorrow(), checkIn: '14:00', checkOut: '15:00', name: '', phone: '1' }, 'website');
  ok('missing name rejected', !r.ok && /name/i.test(r.message), r);

  console.log('== BOT: OWNER + BASIC COMMANDS ==');
  const tg = makeTg();
  const OWNER = 111222333, STRANGER = 999;
  await handleUpdate(upd(OWNER, '/start'), tg);
  ok('/start claims ownership', texts(tg).some(t => /linked as the owner/.test(t)), texts(tg)[0]);

  await handleUpdate(upd(STRANGER, '/start'), tg);
  ok('stranger rejected', texts(tg).some(t => /private/.test(t)));

  await handleUpdate(upd(OWNER, '/book 1 3 ' + tomorrow() + ' 10:00 2 098765432 Dara Chhan'), tg);
  const bookMsg = texts(tg).pop();
  ok('/book (typed) creates confirmed booking', /Booked and confirmed/.test(bookMsg), bookMsg);
  ok('telegram booking stored + confirmed', (await store.all()).some(b => b.source === 'telegram' && b.status === 'confirmed' && b.name === 'Dara Chhan' && b.checkIn === '10:00' && b.checkOut === '12:00' && b.room === 'fishing'));

  /* kv store (bot polling offset persistence) */
  await store.setKv('tgOffset', '424242');
  ok('kv set/get round-trip (tgOffset)', (await store.getKv('tgOffset')) === '424242');
  ok('kv missing key returns empty', (await store.getKv('never-set')) === '');

  r = await createBooking({ branch: 'cheasophara', room: 'fishing', date: tomorrow(), checkIn: '11:00', checkOut: '13:00', name: 'Y', phone: '2' }, 'website');
  ok('telegram booking blocks website overlap', !r.ok && r.error === 'conflict', r);

  await handleUpdate(upd(OWNER, '/busy ' + tomorrow()), tg);
  ok('/busy lists fishing 10:00 – 12:00 PM', texts(tg).some(t => /Fishing Room/.test(t) && /10:00 AM – 12:00 PM/.test(t)), texts(tg).slice(-1)[0]);

  await handleUpdate(upd(OWNER, '/list ' + tomorrow()), tg);
  ok('/list shows bookings', texts(tg).some(t => /Bookings —/.test(t) && /Dara Chhan/.test(t)));

  console.log('== BOT: INTERACTIVE /book FLOW (buttons) ==');
  const tb = makeTg();
  await handleUpdate(upd(OWNER, '/book'), tb);
  ok('/book starts guided flow with branch buttons', texts(tb).some(t => /step 1 of 6/i.test(t) && /Choose the branch/.test(t)), texts(tb)[0]);
  ok('branch buttons present', tb.calls.some(c => (c.params.reply_markup || {}).inline_keyboard && JSON.stringify(c.params.reply_markup).includes('bk:branch:cheasophara')));

  await handleUpdate(cbk(OWNER, 'bk:branch:penghout'), tb);
  ok('branch tap → room step', edits(tb).some(t => /step 2 of 6/i.test(t) && /choose the room/i.test(t)), edits(tb));

  await handleUpdate(cbk(OWNER, 'bk:room:vintage'), tb);
  ok('room tap → date step with buttons', edits(tb).some(t => /step 3 of 6/i.test(t) && /the date/i.test(t)), edits(tb).slice(-1)[0]);

  await handleUpdate(cbk(OWNER, 'bk:date:' + tomorrow()), tb);
  ok('date tap → check-in step (free slot shown)', edits(tb).some(t => /step 4 of 6/i.test(t) && /Already booked|completely free/.test(t)), edits(tb).slice(-1)[0]);

  await handleUpdate(cbk(OWNER, 'bk:time:19:00'), tb);
  ok('time tap → hours step', edits(tb).some(t => /step 5 of 6/i.test(t) && /how many hours/i.test(t)), edits(tb).slice(-1)[0]);

  /* clash path: vintage@penghout 14:00-17:00 exists → 18:00+3h is free, but test clash with 2h? 18-20 vs 14-17 no clash. Use 13:00? already past step. Test clash with the existing 14-17: pick hours so it overlaps: check-in was 18:00 — choose 6h → 18:00-24:00 no overlap with 14-17. So do a separate clash draft later. */
  await handleUpdate(cbk(OWNER, 'bk:hours:3'), tb);
  ok('hours tap (19-22, no clash) → phone step', edits(tb).some(t => /step 6 of 6/i.test(t) && /phone number/i.test(t)), edits(tb).slice(-1)[0]);

  await handleUpdate(upd(OWNER, '012 345 678'), tb);
  ok('typed phone → name step', texts(tb).some(t => /customer's name/i.test(t)), texts(tb).slice(-1)[0]);

  await handleUpdate(upd(OWNER, 'Button Booking'), tb);
  const review = texts(tb).find(t => /Please check the booking/.test(t));
  ok('typed name → review summary', !!review && review.includes('$21.00') && review.includes('Button Booking') && review.includes('7:00 PM'), review);
  ok('review has confirm button', tb.calls.some(c => JSON.stringify(c.params.reply_markup || {}).includes('bk:ok')));

  await handleUpdate(cbk(OWNER, 'bk:ok'), tb);
  const done = edits(tb).slice(-1)[0] || '';
  ok('confirm tap → BOOKED & CONFIRMED', /BOOKED/.test(done) && /website and dashboard now show/.test(done), done);
  const saved = (await store.all()).find(b => b.name === 'Button Booking');
  ok('button-flow booking stored (telegram, confirmed, 18-21)', saved && saved.source === 'telegram' && saved.status === 'confirmed' && saved.checkIn === '19:00' && saved.checkOut === '22:00' && saved.total === 21, saved);

  /* clash path */
  const tc = makeTg();
  await handleUpdate(upd(OWNER, '/book'), tc);
  await handleUpdate(cbk(OWNER, 'bk:branch:penghout'), tc);
  await handleUpdate(cbk(OWNER, 'bk:room:vintage'), tc);
  await handleUpdate(cbk(OWNER, 'bk:date:' + tomorrow()), tc);
  await handleUpdate(cbk(OWNER, 'bk:time:15:00'), tc);
  await handleUpdate(cbk(OWNER, 'bk:hours:3'), tc);   // 15-18 overlaps 14-17
  ok('clash detected during flow → warning', texts(tc).some(t => /Clash/.test(t) && /2:00 PM/.test(t)), texts(tc).slice(-1)[0]);
  ok('flow returns to hours step', edits(tc).some(t => /step 5 of 6/i.test(t)));

  /* /cancel clears the draft */
  await handleUpdate(upd(OWNER, '/cancel'), tc);
  ok('/cancel clears draft', texts(tc).some(t => /draft cleared/i.test(t)), texts(tc).slice(-1)[0]);

  /* non-owner cannot run the flow */
  const ts = makeTg();
  await handleUpdate(upd(STRANGER, '/book'), ts);
  ok('stranger cannot start booking flow', texts(ts).some(t => /private/.test(t)), texts(ts)[0]);

  console.log('== BOT: WEBSITE ALERT BUTTONS ==');
  const tgB = makeTg();
  const cbRef = (await store.all()).find(b => b.source === 'telegram' && b.name === 'Dara Chhan').ref;
  await handleUpdate({ callback_query: { id: '1', data: 'cancel:' + cbRef, message: { chat: { id: OWNER } } } }, tgB);
  ok('cancel button cancels booking', (await store.all()).find(b => b.ref === cbRef).status === 'cancelled');

  r = await createBooking({ branch: 'cheasophara', room: 'fishing', date: tomorrow(), checkIn: '11:00', checkOut: '13:00', name: 'Y', phone: '2' }, 'website');
  ok('cancelled slot becomes free', r.ok, r);

  await handleUpdate(upd(OWNER, '/confirm ' + ref1), tg);
  ok('/confirm confirms', (await store.all()).find(b => b.ref === ref1).status === 'confirmed');

  /* ===== booking template (paste-a-form) ===== */
  console.log('== BOOKING TEMPLATE ==');
  await handleUpdate(upd(OWNER, '/template'), tg);
  const tplMsg = texts(tg).pop();
  ok('/template sends a copyable blank form', /BOOKING/.test(tplMsg) && /Branch:/.test(tplMsg) && /Phone:/.test(tplMsg), tplMsg);

  const d2 = new Date(Date.now() + 2 * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  await handleUpdate(upd(OWNER, 'BOOKING\nBranch: Peng Hout\nRoom: Vintage Room\nDate: ' + d2 + '\nCheck-in: 20:00\nHours: 2\nName: Thida Kou\nPhone: 097 111 222'), tg);
  const tMsg = texts(tg).pop();
  ok('owner template saved + confirmed', /Booking saved/i.test(tMsg) && /HH-/.test(tMsg), tMsg);
  const tplB = (await store.all()).find(b => b.name === 'Thida Kou');
  ok('template booking stored (vintage 20-22 · $14 · confirmed · website syncs)', tplB && tplB.source === 'telegram' && tplB.status === 'confirmed' && tplB.checkIn === '20:00' && tplB.checkOut === '22:00' && tplB.total === 14, tplB);

  await handleUpdate(upd(OWNER, 'BOOKING\nBranch: Peng Hout\nRoom: Vintage\nDate: ' + d2 + '\nCheck-in: 21:00\nHours: 2\nName: Clash Man\nPhone: 012345678'), tg);
  ok('template clash rejected with a clear warning', /clash/.test(texts(tg).pop()) && !(await store.all()).some(b => b.name === 'Clash Man'));

  await handleUpdate(upd(OWNER, 'BOOKING\nBranch: Peng Hout\nRoom: Vintage\nName: Half Done'), tg);
  const halfMsg = texts(tg).pop();
  ok('incomplete template lists the missing fields', /missing/.test(halfMsg) && /Date/.test(halfMsg) && /Phone/.test(halfMsg), halfMsg);

  await handleUpdate(upd(STRANGER, 'Branch: Cheasophara\nRoom: Burger\nDate: ' + d2 + '\nCheck-in: 10:00\nHours: 1\nName: Walk In\nPhone: 012 999 888'), tg);
  const gMsg = texts(tg).pop();
  ok('guest template → thank-you + pending request', /Thank you/.test(gMsg) || /received/.test(gMsg), gMsg);
  const gb = (await store.all()).find(b => b.name === 'Walk In');
  ok('guest template stored as pending', gb && gb.status === 'pending' && gb.source === 'telegram', gb);

  await handleUpdate(upd(OWNER, 'BOOKING\nBranch: Cheasophara\nRoom: Fishing\nDate: ' + d2 + '\nCheck-in: 09:00\nHours: 2\nName: Pending One\nPhone: 012 111 222\nStatus: pending'), tg);
  const pb = (await store.all()).find(b => b.name === 'Pending One');
  ok('Status: pending override works', pb && pb.status === 'pending', pb);

  console.log('== HTTP API (admin key enforced) ==');
  await new Promise(res => S.server.listen(0, res));
  const port = S.server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const KEY = 'test-key-123';

  const get = p => fetch(base + p).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  const patch = (p, body) => fetch(base + p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));

  let h = (await get('/api/health')).j;
  ok('health ok, json storage, bot off', h.ok && h.storage === 'json-file' && h.botLinked === false, h);

  let av = (await get('/api/availability?branch=cheasophara&room=fishing&date=' + tomorrow())).j;
  ok('availability returns busy slots', av.ok && av.busy.length === 1 && av.busy[0].start === '11:00', av);

  let pr = await post('/api/bookings', { branch: 'cheasophara', room: 'burger', date: tomorrow(), checkIn: '18:00', checkOut: '21:00', name: 'Web Guest', phone: '011' });
  ok('POST booking ok + ref', pr.status === 200 && pr.j.ok && /^HH-/.test(pr.j.ref), pr.j);

  pr = await post('/api/bookings', { branch: 'cheasophara', room: 'burger', date: tomorrow(), checkIn: '20:00', checkOut: '22:00', name: 'Clash', phone: '012' });
  ok('POST conflict → 409 with busy list', pr.status === 409 && pr.j.error === 'conflict' && pr.j.busy.length === 1, pr.j);

  pr = await post('/api/bookings', { branch: 'cheasophara', room: 'burger', date: tomorrow(), checkIn: '20:00', checkOut: '20:30', name: 'Frac', phone: '012' });
  ok('POST fractional hours → 400', pr.status === 400 && /whole hours/.test(pr.j.message), pr.j);

  let list = await get('/api/bookings');
  ok('GET bookings without key → 401', list.status === 401);

  list = await get('/api/bookings?key=' + KEY);
  ok('GET bookings with key lists all', list.j.ok && list.j.bookings.length >= 5, list.j.bookings && list.j.bookings.length);

  const webRef = (await get('/api/bookings?key=' + KEY)).j.bookings.find(b => b.name === 'Web Guest').ref;
  let pa = await patch('/api/bookings?key=' + KEY + '&ref=' + webRef, { status: 'confirmed' });
  ok('PATCH confirm with key → 200', pa.status === 200 && pa.j.ok && pa.j.status === 'confirmed', pa.j);
  ok('status really changed in store', (await store.all()).find(b => b.ref === webRef).status === 'confirmed');

  pa = await patch('/api/bookings?ref=' + webRef, { status: 'cancelled' });
  ok('PATCH without key → 401', pa.status === 401);

  pa = await patch('/api/bookings?key=' + KEY + '&ref=' + webRef, { status: 'nonsense' });
  ok('PATCH invalid status → 400', pa.status === 400);

  const html = await fetch(base + '/admin').then(x => x.text());
  ok('admin dashboard served at /admin', html.includes('Owner Dashboard') && html.includes('Export CSV') && html.includes('New Booking'), html.slice(0, 80));

  /* dashboard "New Booking" (manual source, status honored with key) */
  pr = await post('/api/bookings', { key: KEY, branch: 'penghout', room: 'fishing', date: tomorrow(), checkIn: '08:00', checkOut: '10:00', name: 'Manual One', phone: '013', status: 'confirmed' });
  ok('dashboard manual booking → confirmed + ✍️ manual source', pr.status === 200 && pr.j.status === 'confirmed', pr.j);
  const mb = (await store.all()).find(b => b.name === 'Manual One');
  ok('manual booking stored with source manual (no owner alert)', mb && mb.source === 'manual' && mb.status === 'confirmed', mb);

  pr = await post('/api/bookings', { branch: 'penghout', room: 'fishing', date: tomorrow(), checkIn: '12:00', checkOut: '14:00', name: 'Sneaky', phone: '014', status: 'confirmed' });
  ok('status override ignored without the admin key (stays pending)', pr.status === 200 && pr.j.status === 'pending', pr.j);

  const site = await fetch(base + '/').then(x => x.text());
  ok('static site served at /', site.includes('Stay Somewhere') && site.includes('KHQR') && site.includes('abaPayBtn'), site.slice(0, 60));

  S.server.close();
  console.log('\n===========================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
