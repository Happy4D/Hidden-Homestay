/* ============================================================
   HIDDEN HOMESTAY — app.js (v3)
   12 rooms · weekday/weekend pricing · overnight · ID upload ·
   phone validation · EN/ខ្មែរ · Telegram confirmation
   ============================================================ */
'use strict';

/* ---------- tiny helpers ---------- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* safe localStorage (sandboxed previews may block it) */
const store = (() => {
  try { const k = '__hh'; localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
             set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  } catch (e) {
    const mem = {}; return { get: k => mem[k] || null, set: (k, v) => { mem[k] = v; } };
  }
})();

async function fetchTimeout(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 8000);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

const ICON = { ok: '✅', info: 'ℹ️', cross: '❌' };
function toast(msg, icon) {
  const z = $('#toastZone'); if (!z) return;
  const d = document.createElement('div');
  d.className = 'toast' + (icon === ICON.cross ? ' err' : '');
  d.textContent = (icon ? icon + ' ' : '') + msg;
  z.appendChild(d); setTimeout(() => d.remove(), 4200);
}

/* ============================================================
   CONFIG
   ============================================================ */
const CONFIG = {
  brand: 'Hidden Homestay',
  telegram: '@Hppy4D',
  telegramUrl: 'https://t.me/Hppy4D',
  botUrl: 'https://t.me/HiddenHomestayBot',        // confirmation delivery only
  address: 'No 235D, Road No 777, Sangkat Jranh Chomres II, Khan Russey Keo, Phnom Penh',
  api: { baseUrl: '' },                            // '' → auto-detect (same origin)

  khqr: {
    payload: '00020101021129170013000523457@ABA5204599953038405802KH5915HIDDEN HOMESTAY6010Phnom Penh6304F893',
    bakongId: '000523457@ABA',
    merchantName: 'HIDDEN HOMESTAY',
    city: 'Phnom Penh'
  },

  /* weekday / weekend duration tables (Standard rooms) */
  pricing: {
    weekday: { 2: 10, 3: 12, 4: 14, 5: 18, 6: 20, overnight: 18 },
    weekend: { 2: 12, 3: 15, 4: 18, 5: 20, 6: 23, overnight: 18 }
  },
  vipUpgrade: 3,          /* VIP = standard price + $3 */
  poolRate: 5             /* Pool Room: $5 / hour */
};

/* ---------- the 12 rooms ---------- */
const ROOMS = [
  { id: 'pool',     no: 501, name: 'Pool Room',     nameKh: 'បន្ទប់Pool',     type: 'pool',     img: 'assets/rooms/pool.png',
    blurb: 'Your own private 8-ball pool table — rack them up, break, and enjoy the game in your own themed room.', tags: ['8-Ball Table', 'Private Play', 'Cosy Seating'],
    blurbKh: '8Ball — Dart និងរីករាយជាមួយហ្គេម នៅក្នុងបន្ទប់ផ្ទាល់ខ្លួន។', tagsKh: ['8 Ball', 'ឯកជនភាព', 'Dart'] },
  { id: 'vintage',  no: 1,   name: 'Vintage Room',  nameKh: 'បន្ទប់វីនតាក់',  type: 'standard', img: 'assets/rooms/vintage.png',
    blurb: 'Retro furniture, warm light and a nostalgic calm you can sink into and never want to leave.', tags: ['Retro Décor', 'Reading Corner', 'Record Player'],
    blurbKh: 'គ្រឿងសង្ហារិបបែបបុរាណ ពន្លឺទន់ភ្លន់ និងភាពស្ងប់ស្ងៀមដែលធ្វើឱ្យអ្នកមិនចង់ចាកចេញឡើយ។', tagsKh: ['ការតុបតែងបែបបុរាណ', 'អានសៀវភៅ', 'ម៉ាស៊ីនចាក់តន្ត្រី'] },
  { id: 'shanghai', no: 2,   name: 'Shanghai Room', nameKh: 'បន្ទប់សាំងហៃ', type: 'standard', img: 'assets/rooms/shanghai.png',
    blurb: 'Lantern light and oriental charm — a little piece of old Shanghai right here in Phnom Penh.', tags: ['Oriental Décor', 'Warm Lighting'],
    blurbKh: 'ពន្លឺចង្កៀងបែបបុរាណ និងសម្រស់បែបអាស៊ីបូព៌ា — នាំអារម្មណ៍ដូចបានធ្វើដំណើរត្រឡប់ទៅកាន់ទីក្រុងសៀងហៃសម័យមុន នៅកណ្ដាលរាជធានីភ្នំពេញ។', tagsKh: ['ការតុបតែងបែបបូព៌ន', 'ពន្លឺភ្លឺទន់'] },
  { id: 'classic',  no: 3,   name: 'Classic Room',  nameKh: 'បន្ទប់ក្លាស៊ីក',  type: 'standard', img: 'assets/rooms/classic.png',
    blurb: 'Timeless, clean and quietly elegant. The room that never goes out of style.', tags: ['Elegant Décor', 'Work Desk', 'Blackout Curtains'],
    blurbKh: 'សាមញ្ញ ស្អាត និងមានភាពប្រណិតបែបស្ងប់ស្ងាត់។ រចនាបថដែលមិនចេះចាស់ និងមិនដែលហួសសម័យ។', tagsKh: ['ការតុបតែងបែបធំទូលាយ', 'តុធ្វើការងារ', 'ស្រោមបង្អួចបិទពន្លឺ'] },
  { id: 'london',   no: 5,   name: 'London Room',   nameKh: 'បន្ទប់ឡុងដ៍',   type: 'standard', img: 'assets/rooms/london.png',
    blurb: 'Checkerboard floors, red-postbox reds and a cosy British mood — tea time, anyone?', tags: ['British Theme', 'Cosy Chairs'],
    blurbKh: 'ពណ៌ក្រហមដ៏លេចធ្លោ និងបរិយាកាសបែបប្រទេសអង់គ្លេស', tagsKh: ['រចនាបថអង់គ្លេស', 'កៅអីទន់ៗ'] },
  { id: 'camping',  no: 102, name: 'Camping Room',  nameKh: 'បន្ទប់កាំពីង',  type: 'standard', img: 'assets/rooms/camping.png',
    blurb: 'A starry indoor camp — tent vibes, fairy lights and marshmallow dreams, no mosquitoes included.', tags: ['Tent Style', 'Fairy Lights', 'Floor Mattress'],
    blurbKh: 'បរិយាកាសដូចជាកំពុងបោះតង់ក្រោមមេឃពោរពេញដោយផ្កាយ — តង់តូចៗ ភ្លើងតុបតែងភ្លឺស្រទន់។', tagsKh: ['រចនាបថតែន', 'ពន្លឺផ្កាយតូចៗ', 'ពូកគ្រែលើជាន់'] },
  { id: 'fishing',  no: 202, name: 'Fishing Room',  nameKh: 'បន្ទប់នេសាទ',  type: 'standard', img: 'assets/rooms/fishing.png',
    blurb: 'Quietly cool and oddly calming. An underwater-inspired escape in soft blues.', tags: ['Blue Palette', 'Ambient Light', 'Aroma Diffuser'],
    blurbKh: 'សាមញ្ញ តែមានស្ទីល និងផ្តល់អារម្មណ៍ស្ងប់ស្ងាត់ប្លែកៗ។ បន្ទប់បែបពិភពក្រោមសមុទ្រ ជាមួយពណ៌ខៀវស្រទន់ដែលធ្វើឱ្យមានអារម្មណ៍ស្រស់ស្រាយ។', tagsKh: ['ពណ៌ខៀវ', 'ពន្លឺភ្លឺទន់', 'ឧបករណ៍ធ្វើឱ្យក្រអូប'] },
  { id: 'burger',   no: 302, name: 'Burger Room',   nameKh: 'បន្ទប់បឺរហ្គឺរ', type: 'standard', img: 'assets/rooms/burger.png',
    blurb: 'Bold, juicy and deliciously playful. A fast-food fantasy built for fun nights and laughter.', tags: ['Playful Décor', 'Smart TV', 'Bluetooth Speaker'],
    blurbKh: 'ក្រអូប ឆ្ងាញ់ និងគួរឱ្យចាប់អារម្មណ៍ខ្លាំង។ ពិភពម្ហូបរហ័ស សម្រាប់ពេលរាត្រីសប្បាយៗ និងសំណើចគួរឱ្យចូលចិត្ត។', tagsKh: ['ការតុបតែង', 'Smart TV', 'អូឌីយ៉ូ Bluetooth'] },
  { id: 'kuromi',   no: 502, name: 'Kuromi Room',   nameKh: 'បន្ទប់កូរ៉ូមី',  type: 'standard', img: 'assets/rooms/kuromi.png',
    blurb: 'Sanrio\u2019s punky little rabbit takes over — black, pink and irresistibly cute.', tags: ['Kuromi Theme', 'Plush Pillows', 'Photo Corner'],
    blurbKh: 'កូរ៉ូមី ក្រុមបេឡែតតូចរបស់ Sanrio — ពណ៌ខ្មៅ ផ្កាឈូក និងគួរឱ្យស្រលាញ់ខ្លាំងពុំអាចទប់ទេ។', tagsKh: ['រចនាបថកូរ៉ូមី', 'ពូកទន់', 'មុំថតរូប'] },
  { id: 'veggie',   no: 101, name: 'Veggie Room',   nameKh: 'បន្ទប់បន្លែ',   type: 'vip',      img: 'assets/rooms/veggie.png',
    blurb: 'Fresh greens and garden calm — a VIP breath of fresh air with everything upgraded.', tags: ['VIP Room', 'Garden Vibe', 'Extra Space'],
    blurbKh: 'ពណ៌បៃតងស្រស់ស្អាត និងបរិយាកាសស្ងប់ស្ងាត់ដូចសួនច្បារ — បន្ទប់ VIP សម្រាប់អ្នកដែលចង់សម្រាកក្នុងបរិយាកាសស្រស់ស្រាយ និងទទួលបានភាពពិសេសជាងមុន។', tagsKh: ['បន្ទប់ VIP', 'អារម្មណ៍សួនច្បារ', 'ទំហំធំជាង'] },
  { id: 'slayer',   no: 201, name: 'Slayer Room',   nameKh: 'បន្ទប់ស្លេយអ៊ែរ', type: 'vip',      img: 'assets/rooms/slayer.png',
    blurb: 'Dark, dramatic and boldly styled for those who like their comfort with an edge.', tags: ['VIP Room', 'Dramatic Décor', 'Extra Space'],
    blurbKh: 'បែបងងឹត មានភាពទាក់ទាញ និងរចនាយ៉ាងលេចធ្លោ — ស័ក្តិសមសម្រាប់អ្នកដែលចូលចិត្តភាពកក់ក្ដៅ ប៉ុន្តែចង់បានស្ទីលដ៏មានភាពខុសប្លែក។', tagsKh: ['បន្ទប់ VIP', 'ការតុបតែងខ្លាំងៗ', 'ទំហំធំជាង'] },
  { id: 'gaming',   no: 301, name: 'Gaming Room',   nameKh: 'បន្ទប់ហ្គេម',   type: 'vip',      img: 'assets/rooms/gaming.png',
    blurb: 'Big screens, fast internet and glow-in-the-dark vibes. Built for all-night gaming sessions.', tags: ['VIP Room', 'Gaming Setup', 'Fast Wi-Fi'],
    blurbKh: 'អេក្រង់ធំ អ៊ីនធឺណិតលឿន និងពន្លឺពណ៌នៅពេលយប់។ បង្កើតឡើងសម្រាប់ការលេងហ្គេមពេញមួយយប់។', tagsKh: ['បន្ទប់ VIP', 'គ្រឿងហ្គេមពេញលេញ', 'Wi-Fi លឿន'] }
];
const roomById = id => ROOMS.find(r => r.id === id);
const roomName = r => (r && r.no != null ? '(' + r.no + ') ' : '') + (LANG === 'kh' ? (r.nameKh || r.name) : r.name);
const roomTags = r => LANG === 'kh' ? (r.tagsKh || r.tags) : r.tags;
const roomBlurb = r => LANG === 'kh' ? (r.blurbKh || r.blurb) : r.blurb;
const VIP_INCLUDES = {
  en: ['VIP Bed', 'Sofa', 'Water Boiling Machine', 'Hair Dryer', '2 Cups of Noodles'],
  kh: ['គ្រែ VIP', 'សូហ្វា', 'ម៉ាស៊ីនក្តៅទឹក', 'ម៉ាស៊ីនសម្ងួតសក់', 'មី២កំប៉ុង']
};

/* ============================================================
   I18N — English / ខ្មែរ
   ============================================================ */
const I18N = {
  en: {
    tagline: 'stay cosy. stay HIDDEN',
    navRooms: 'Rooms', navBook: 'Book', navTerms: 'Terms', navContact: 'Contact',
    heroKicker: 'Borey Vimean Phnom Penh · 12 themed rooms',
    heroTitle: 'Your next favourite room is waiting.',
    heroSub: 'Pool, Standard and VIP rooms — by the hour or overnight. Pick a date, choose your room, and get your confirmation plus entry guide straight to your Telegram.',
    heroCta: 'Book Your Stay', heroCta2: 'See the 12 rooms',
    heroFact1: 'Overnight stays 8PM–8AM / 9PM–9AM',
    heroFact2: 'Instant Telegram confirmation & entry guide',
    heroBadge: '12 rooms · 1 address · open daily',
    roomsKicker: 'Pick your vibe', roomsTitle: 'Twelve rooms. Twelve personalities.',
    roomsSub: 'One homestay, twelve self-contained themed rooms — each spotless, private and ready for your next memory. All at Borey Vimean Phnom Penh.',
    grpPool: 'Pool Room',
    grpStd: 'Standard Rooms',
    grpVip: 'VIP Rooms',
    flagPool: 'POOL', flagStd: 'STANDARD',
    bookThisRoom: 'Book this room',
    csTitle: 'EZ Stay', csTag: 'Coming Soon · Peng Hout Boung Snour',
    lblStd: 'Standard', lblVip: 'VIP', lblPool: 'Pool',
    navMy: 'My Bookings', heroCta3: 'My Bookings', s5My: 'View My Bookings',
    mbKicker: 'Your stays', mbTitle: 'My Bookings',
    mbSub: 'Bookings made from this device. Tap “Telegram” to receive the confirmation again.',
    mbEmpty: 'No bookings yet on this device. Make your first one — it only takes two minutes.',
    mbRoom: 'Room', mbDate: 'Date', mbTimes: 'Check-in / out', mbGuest: 'Guest',
    mbTgBtn: 'Get all information via Telegram', mbRemove: 'Remove', mbRemoved: 'Booking removed from this device',
    mbWait: 'Waiting for the owner to confirm your booking',
    s4CheckMy: '📋 Please check <b>My Booking</b> later to see whether your booking has been confirmed by the owner.',
    maintFlag: 'Under Maintenance', maintNote: 'Currently unavailable for booking.',
    tMaint: 'This room is under maintenance — please choose another room.',
    stPending: 'Pending', stConfirmed: 'Confirmed', stCancelled: 'Cancelled',
    howKicker: 'Effortless booking', howTitle: 'Three steps to your hideaway',
    how1T: 'Date & duration', how1P: 'Choose your date and how long you\u2019ll stay — 2 to 6 hours, or a full overnight (8PM–8AM / 9PM–9AM). The price shows instantly, weekday or weekend.',
    how2T: 'Pick your room', how2P: 'Twelve themed rooms, one address. Only rooms that are actually free for your slot are shown — no double bookings, ever.',
    how3T: 'Confirm & relax', how3P: 'Agree to the house rules, confirm your booking, and get your confirmation, room photo, entry guideline and parking guide straight to your Telegram.',
    bookKicker: 'Reserve in two minutes', bookTitle: 'Book your stay',
    bookSub: 'Select your date, room, and check-in time — it only takes two minutes.',
    step1: 'Schedule', step2: 'Room', step3: 'Your details', step4: 'Confirm & pay',
    s1Title: 'When would you like to stay?',
    s1Date: 'Date', hrs: 'hrs', ovNight: 'overnight',
    s1Dur: 'Duration', s1PoolHours: 'Pool Room — hours:', s1In: 'Check-in time', s1Ov: 'Overnight check-in / check-out',
    roomLockLbl: 'Room', timeNA: 'unavailable',
    slotNote: '🧹 1 hour cleaning between bookings · today: check-in until 21:00',
    cleanNote: '🧹 1 hour cleaning between bookings',
    tSlotGone: 'That option is no longer available — please pick another time or date.',
    s1OvLine: 'Check-in {in} (evening) · Check-out {out} (next morning)',
    s2Title: 'Choose your room',
    s2Note: '{n} of {t} rooms free for your slot', s2NoteDemo: 'Demo mode — availability checking is active on the live site',
    s3Title: 'Your details', s3Name: 'Full name', s3Phone: 'Telegram phone number',
    s3PhoneNote: '📱 Please enter the phone number registered with your Telegram account — your booking confirmation and entry guideline will be sent there.',
    s3Id: 'ID Card photo (required for overnight)',
    s3IdNote: 'Overnight stays require a photo of your ID Card. Please upload a clear picture (front side).',
    s3IdRetake: 'Retake', s3IdOk: 'ID photo attached ✓',
    s4Title: 'Review & confirm', s4Rules: 'House rules',
    s4Agree: 'I have read and agree to the house rules above.',
    s4PayTitle: 'Payment',
    s4PayNote: 'Full payment is required to confirm your booking. Scan the KHQR below with any Cambodian banking app (ABA, ACLEDA, Wing, Bakong…).',
    s4PayDone: 'After you tap \u201CConfirm Booking\u201D, open Telegram to receive your confirmation, room photo, entry guideline and parking guide.',
    total: 'Total', confirmBtn: 'Confirm Booking ✓', back: '← Back', next: 'Next →',
    s5Title: 'Booking received!',
    s5Sub: 'Your request is in. One last tap — open Telegram and press START to receive your confirmation, your room\u2019s photo, the entry guideline, the parking guide and the food menu.',
    s5Btn: 'Get my confirmation in Telegram', s5Again: 'Book another stay',
    s5RefNote: 'Booking reference: {ref}',
    locKicker: 'One address', locTitle: 'Hidden Homestay — Borey Vimean Phnom Penh',
    locL1: 'No 235D, Road No 777', locL2: 'Sangkat Jranh Chomres II, Khan Russey Keo', locL3: 'Phnom Penh, Cambodia',
    locSub: 'Easy to find, calm streets, and space to park. The exact entry guideline and parking guide are sent to your Telegram with every booking.',
    termsKicker: 'Please read before booking', termsTitle: 'Terms & Conditions',
    addrLabel: 'Address', hoursValue: 'Every day · 8:00 AM – 11:00 PM',
    addrValue: 'No 235D, Road 777, Sangkat Jranh Chomres II, Khan Russey Keo, Phnom Penh',
    footFine: 'Bookings are confirmed after full payment.',
    weekday: 'weekday', weekend: 'weekend', overnight: 'overnight', hoursWord: 'hours',
    fromPrice: 'from', perHour: '/ hour', vipPlus: 'VIP upgrade +$3',
    vipIncludesTitle: 'VIP rooms include',
    roomTaken: 'Already booked for this slot',
    poolNoOvernight: 'Pool Room is hourly only (no overnight)',
    rules: [
      '<b>No Smoking</b>',
      '<b>No Smelly Food</b>',
      '<b>Do not use towels to clean the floor</b>',
      'Please flush the toilet after use.',
      'Material damage will be charged accordingly.',
      'We do not accept guests under 18 years old.',
      'No illegal activities / No drugs.',
      'ID Card is required for overnight / gaming stays.',
      '<b>Early check-in</b> must be arranged with the owner via Telegram.',
      'Late check-out — $5/hour',
      'No refund for cancellation.',
      'Full payment is required to confirm a booking.'
    ],
    rcDate: 'Date', rcRoom: 'Room', rcType: 'Type', rcIn: 'Check-in', rcOut: 'Check-out',
    rcDur: 'Duration', rcGuest: 'Guest', rcPhone: 'Phone', rcId: 'ID Card', rcPriceType: 'Pricing',
    rcIdYes: 'Attached ✓', rcIdNo: '— (not required)',
    tName: 'Please enter your full name',
    tPhone: 'Phone number must contain digits only',
    tPhoneLen: 'Please enter a valid phone number (8–15 digits)',
    tId: 'Overnight stays require an ID Card photo',
    tRoom: 'Please choose a room first',
    tDur: 'Please choose a duration first',
    tBusy: 'Those hours were just taken — please pick another room or time',
    tServer: 'Could not reach the server — please try again',
    tDone: 'Booking sent! Open Telegram to get your confirmation 🎉',
    tLang: 'Language switched to English'
  },

  kh: {
    tagline: 'stay cosy. stay HIDDEN',
    navRooms: 'បន្ទប់', navBook: 'កក់', navTerms: 'លក្ខខណ្ឌ', navContact: 'ទំនាក់ទំនង',
    heroKicker: 'បូរីវៀនភ្នំពេញ · បន្ទប់ចម្រុះ ១២ បន្ទប់',
    heroTitle: 'បន្ទប់ដែលអ្នកចូលចិត្តបំផុត កំពុងរង់ចាំអ្នក',
    heroSub: 'បន្ទប់ Pool, Standard និង VIP — កក់តាមម៉ោង ឬពេលយប់។ ជ្រើសរើសកាលបរិច្ឆេទ បន្ទប់ ហើយទទួលបានការបញ្ជាក់ និងចូល តាម Telegram របស់អ្នក។',
    heroCta: 'កក់ការស្នាក់នៅ', heroCta2: 'មើលបន្ទប់ទាំង ១២',
    heroFact1: 'ស្នាក់ពេលយប់ 20:00–08:00 / 21:00–09:00',
    heroFact2: 'ការបញ្ជាក់ និងចូលភ្លាមៗតាម Telegram',
    heroBadge: 'បន្ទប់ ១២ · អាសយដ្ឋានមួយ · បើករាល់ថ្ងៃ',
    roomsKicker: 'ជ្រើសរើសស្ទីលរបស់អ្នក', roomsTitle: 'បន្ទប់ ១២ បន្ទប់ · ជាមួយនឹងស្ទីលទាំង១២ ខុសៗគ្នា',
    roomsSub: 'ផ្ទះមួយ បន្ទប់ចម្រុះ ១២ បន្ទប់ — ស្អាត ឯកជនភាពមាននៅបូរីវៀនភ្នំពេញ។',
    grpPool: 'បន្ទប់ Pool', grpPoolSub: '៥$ / ម៉ោង',
    grpStd: 'បន្ទប់ Standard', grpStdSub: '៨ បន្ទប់ · ចាប់ពី ១០$ / ២ ម៉ោង',
    grpVip: 'បន្ទប់ VIP',
    flagPool: 'ប៉ុល', flagStd: 'ស្តង់ដារ',
    bookThisRoom: 'កក់បន្ទប់នេះ',
    csTitle: 'EZ Stay', csTag: 'ជិតមកដល់ · Peng Hout Boung Snour',
    lblStd: 'ស្តង់ដារ', lblVip: 'VIP', lblPool: 'ប៉ុល',
    navMy: 'ការកក់របស់ខ្ញុំ', heroCta3: 'ការកក់របស់ខ្ញុំ', s5My: 'មើលការកក់របស់ខ្ញុំ',
    mbKicker: 'ការស្នាក់របស់អ្នក', mbTitle: 'ការកក់របស់ខ្ញុំ',
    mbSub: 'ការកក់ដែលបានធ្វើពីឧបករណ៍នេះ។ ចុច “Telegram” ដើម្បីទទួលបានការបញ្ជាក់ម្តងទៀត។',
    mbEmpty: 'មិនមានការកក់នៅលើឧបករណ៍នេះទេ។ កក់ដំបូងរបស់អ្នក — ចំណាយពេលតែពីរនាទីប៉ុណ្ណោះ។',
    mbRoom: 'បន្ទប់', mbDate: 'កាលបរិច្ឆេទ', mbTimes: 'ចូល / ចេញ', mbGuest: 'អតិថិជន',
    mbTgBtn: 'ទទួលព័ត៌មានពេញលេញតាម Telegram', mbRemove: 'លុប', mbRemoved: 'បានលុបការកក់ចេញពីឧបករណ៍នេះ',
    mbWait: 'កំពុងរង់ចាំម្ចាស់ផ្ទះបញ្ជាក់ការកក់របស់អ្នក',
    s4CheckMy: '📋 សូមពិនិត្យមើល <b>ការកក់របស់ខ្ញុំ</b> នៅពេលក្រោយ ដើម្បីដឹងថាម្ចាស់ផ្ទះបានបញ្ជាក់ការកក់របស់អ្នកឬនៅ។',
    maintFlag: 'កំពុងជួសជុល', maintNote: 'បច្ចុប្បន្នមិនអាចកក់បានទេ។',
    tMaint: 'បន្ទប់នេះកំពុងជួសជុល — សូមជ្រើសរើសបន្ទប់ផ្សេង។',
    stPending: 'រង់ចាំ', stConfirmed: 'បានបញ្ជាក់', stCancelled: 'បានបោះបង់',
 grpVipSub: 'តម្លៃ Standard + ៣$ · សេវាបន្ថែម VIP',
    howKicker: 'កក់ងាយស្រួល', howTitle: 'បីជំហាន ទៅកាន់កន្លែងសម្រាប់អ្នក',
    how1T: 'កាលបរិច្ឆេទ និងរយៈពេល', how1P: 'ជ្រើសរើសកាលបរិច្ឆេទ និងរយៈពេលស្នាក់ — ២ ទៅ ៦ ម៉ោង ឬពេញមួយយប់ (20:00–08:00 / 21:00–09:00)។ តម្លៃបង្ហាញភ្លាមៗ ថ្ងៃធ្វើការ ឬចុងសប្តាហ៍។',
    how2T: 'ជ្រើសរើសបន្ទប់', how2P: 'បន្ទប់ចម្រុះ ១២ បន្ទប់ នៅអាសយដ្ឋានតែមួយ។ បង្ហាញតែបន្ទប់ដែលទំនេងពិតប្រាកដសម្រាប់ពេលរបស់អ្នក — មិនមានការកក់ទ្វេដងឡើយ។',
    how3T: 'បញ្ជាក់ ហើយសម្រាក', how3P: 'យល់ព្រមនឹងច្បាប់ផ្ទះ បញ្ជាក់ការកក់របស់អ្នក ហើយទទួលបានការបញ្ជាក់ រូបបន្ទប់ មគ្គុទ្ទេសក៍ចូល និងមគ្គុទ្ទេសក៍ចត់ឡាន តាម Telegram ដោយផ្ទាល់។',
    bookKicker: 'កក់ក្នុងរយៈពេលពីរនាទី', bookTitle: 'កក់ការស្នាក់នៅរបស់អ្នក',
    bookSub: 'ជ្រើសរើសកាលបរិច្ឆេទ បន្ទប់ និងម៉ោងចូល — ចំណាយពេលតែពីរនាទីប៉ុណ្ណោះ។',
    step1: 'កាលវិភាគ', step2: 'បន្ទប់', step3: 'ព័ត៌មានរបស់អ្នក', step4: 'បញ្ជាក់ និងបង់ប្រាក់',
    s1Title: 'តើអ្នកចង់ស្នាក់នៅពេលណា?',
    s1Date: 'កាលបរិច្ឆេទ', hrs: 'ម៉ោង', ovNight: 'ពេលយប់',
    s1Dur: 'រយៈពេល', s1PoolHours: 'បន្ទប់ Pool — ចំនួនម៉ោង:', s1In: 'ម៉ោងចូល', s1Ov: 'ចូល / ចេញ ពេលយប់',
    roomLockLbl: 'បន្ទប់', timeNA: 'មិនទំនេរ',
    slotNote: '🧹 សម្អាត ១ ម៉ោងរវាងការកក់ · ថ្ងៃនេះ កក់បានដល់ 21:00',
    cleanNote: '🧹 សម្អាត ១ ម៉ោងរវាងការកក់',
    tSlotGone: 'ជម្រើសនេះមិនទំនេរទេ — សូមជ្រើសរើសពេលវេលា ឬកាលបរិច្ឆេទផ្សេងទៀត។',
    s1OvLine: 'ចូលម៉ោង {in} (ល្ងាច) · ចេញម៉ោង {out} (ព្រឹកថ្ងៃក្រោយ)',
    s2Title: 'ជ្រើសរើសបន្ទប់របស់អ្នក',
    s2Note: 'មានបន្ទប់ {n} ក្នុងចំណោម {t} ទំនេងសម្រាប់ពេលរបស់អ្នក', s2NoteDemo: 'របៀបសាកល្បង — ការពិនិត្យភាពទំនេងដំណើរការនៅលើគេហទំព័រពិត',
    s3Title: 'ព័ត៌មានរបស់អ្នក', s3Name: 'ឈ្មោះពេញ', s3Phone: 'លេខទូរស័ព្ទ Telegram',
    s3PhoneNote: '📱 សូមបញ្ចូលលេខទូរស័ព្ទដែលបានចុះឈ្មោះក្នុង Telegram របស់អ្នក — ការបញ្ជាក់ការកក់ និងមគ្គុទ្ទេសក៍ចូល នឹងផ្ញើទៅទីនោះ។',
    s3Id: 'រូបភាពអត្តសញ្ញាណប័ណ្ណ (តម្រូវសម្រាប់ពេលយប់)',
    s3IdNote: 'ការស្នាក់ពេលយប់តម្រូវឱ្យមានរូបភាពអត្តសញ្ញាណប័ណ្ណ។ សូមបញ្ចូលរូបភាពច្បាស់ (ផ្នែកខាងមុខ)។',
    s3IdRetake: 'យកឡើងវិញ', s3IdOk: 'បានភ្ជាប់រូបអត្តសញ្ញាណ ✓',
    s4Title: 'ពិនិត្យ និងបញ្ជាក់', s4Rules: 'ច្បាប់ផ្ទះ',
    s4Agree: 'ខ្ញុំបានអាន ហើយយល់ព្រមនឹងច្បាប់ផ្ទះខាងលើ។',
    s4PayTitle: 'ការបង់ប្រាក់',
    s4PayNote: 'ត្រូវបង់ប្រាក់ពេញលេញ ដើម្បីបញ្ជាក់ការកក់។ សូមស្កេន KHQR ខាងក្រោម ដោយកម្មវិធីធនាគារកម្ពុជាណាមួយ (ABA, ACLEDA, Wing, Bakong…)។',
    s4PayDone: 'បន្ទាប់ពីចុច \u201Cបញ្ជាក់ការកក់\u201D សូមបើក Telegram ដើម្បីទទួលការបញ្ជាក់ រូបបន្ទប់ មគ្គុទ្ទេសក៍ចូល និងមគ្គុទ្ទេសក៍ចត់ឡាន។',
    total: 'សរុប', confirmBtn: 'បញ្ជាក់ការកក់ ✓', back: '← ត្រឡប់', next: 'បន្ទាប់ →',
    s5Title: 'បានទទួលការកក់!',
    s5Sub: 'សំណើរបស់អ្នកបានជោគជ័យ។ នៅសល់មួយចុច — បើក Telegram ហើយចុច START ដើម្បីទទួលការបញ្ជាក់ រូបបន្ទប់របស់អ្នក មគ្គុទ្ទេសក៍ចូល មគ្គុទ្ទេសក៍ចត់ឡាន និងមឺនុុយអាហារ។',
    s5Btn: 'ទទួលការបញ្ជាក់តាម Telegram', s5Again: 'កក់ម្តងទៀត',
    s5RefNote: 'លេខយោងការកក់: {ref}',
    locKicker: 'អាសយដ្ឋានតែមួយ', locTitle: 'Hidden Homestay — បូរីវៀនភ្នំពេញ',
    locL1: 'លេខ 235D, ផ្លូវលេខ 777', locL2: 'សង្កាត់ជ្រាញ់ជំនុះ II, ខណ្ឌ Russey Keo', locL3: 'ភ្នំពេញ, កម្ពុជា',
    locSub: 'ងាយស្រួលរក តំបន់ស្ងប់ស្ងាត់ និងមានកន្លែងចត់ឡាន។ មគ្គុទ្ទេសក៍ចូល និងមគ្គុទ្ទេសក៍ចត់ឡានត្រូវបានផ្ញើទៅ Telegram របស់អ្នកជាមួយគ្រប់ការកក់។',
    termsKicker: 'សូមអានមុនពេលកក់', termsTitle: 'លក្ខខណ្ឌ និងច្បាប់',
    addrLabel: 'អាសយដ្ឋាន', hoursValue: 'រាល់ថ្ងៃ · 8:00 ព្រឹក – 11:00 យប់',
    addrValue: 'លេខ 235D, ផ្លូវលេខ 777, សង្កាត់ជ្រាញ់ជំនុះទី២, ខណ្ឌឫស្សីកែវ, ភ្នំពេញ',
    footFine: 'ការកក់ត្រូវបានបញ្ជាក់ បន្ទាប់ពីបង់ប្រាក់ពេញលេញ។',
    weekday: 'ថ្ងៃធ្វើការ', weekend: 'ចុងសប្តាហ៍', overnight: 'ពេលយប់', hoursWord: 'ម៉ោង',
    fromPrice: 'ចាប់ពី', perHour: '/ ម៉ោង', vipPlus: 'សេវា VIP +៣$',
    vipIncludesTitle: 'បន្ទប់ VIP រួមមាន',
    roomTaken: 'បានកក់រួចហើយសម្រាប់ពេលនេះ',
    poolNoOvernight: 'បន្ទប់ Pool កក់តាមម៉ោងប៉ុណ្ណោះ (មិនមានពេលយប់)',
    rules: [
      '<b>ហាមជក់បារី</b>',
      '<b>ហាមអាហារមានក្លិនខ្លាំង</b>',
      '<b>កុំប្រើកន្សែងជូតដី</b>',
      'សូមបង្ហូរទឹកបង្គន់ បន្ទាប់ពីប្រើប្រាស់។',
      'ការខូចខាតសម្ភារៈ នឹងត្រូវទូទាត់តាមតម្លៃពិត។',
      'យើងមិនទទួលភ្ញៀវអាយុក្រោម ១៨ ឆ្នាំទេ។',
      'ហាមសកម្មភាពខុសច្បាប់ / ហាមគ្រឿងញៀន។',
      'តម្រូវឱ្យមានអត្តសញ្ញាណប័ណ្ណ សម្រាប់ការស្នាក់ពេលយប់ / លេងហ្គេម។',
      'ការចូលមុនម៉ោង ត្រូវសម្របសម្រួលជាមួយម្ចាស់ផ្ទះតាម Telegram។',
      'ចេញយឺត — ៥ ដុល្លារ / ម៉ោង',
      'ការលុបចោលការកក់ នឹងមិនត្រូវបង់វិញទេ។',
      'ត្រូវបង់ប្រាក់ពេញលេញ ដើម្បីបញ្ជាក់ការកក់។'
    ],
    rcDate: 'កាលបរិច្ឆេទ', rcRoom: 'បន្ទប់', rcType: 'ប្រភេទ', rcIn: 'ចូល', rcOut: 'ចេញ',
    rcDur: 'រយៈពេល', rcGuest: 'ភ្ញៀវ', rcPhone: 'ទូរស័ព្ទ', rcId: 'អត្តសញ្ញាណ', rcPriceType: 'ការកំណត់តម្លៃ',
    rcIdYes: 'បានភ្ជាប់ ✓', rcIdNo: '— (មិនតម្រូវ)',
    tName: 'សូមបញ្ចូលឈ្មោះពេញរបស់អ្នក',
    tPhone: 'លេខទូរស័ព្ទត្រូវមានតែលេខប៉ុណ្ណោះ',
    tPhoneLen: 'សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ (៨–១៥ ខ្ទង់)',
    tId: 'ការស្នាក់ពេលយប់តម្រូវឱ្យមានរូបភាពអត្តសញ្ញាណប័ណ្ណ',
    tRoom: 'សូមជ្រើសរើសបន្ទប់ជាមុនសិន',
    tDur: 'សូមជ្រើសរើសរយៈពេលជាមុនសិន',
    tBusy: 'ពេលនោះទើបតែមានមនុស្សកក់ — សូមជ្រើសបន្ទប់ ឬពេលផ្សេង',
    tServer: 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើបានទេ — សូមព្យាយាមម្តងទៀត',
    tDone: 'បានផ្ញើការកក់! សូមបើក Telegram ដើម្បីទទួលការបញ្ជាក់ 🎉',
    tLang: 'បានប្តូរភាសាទៅខ្មែរ'
  }
};

let LANG = 'en';
const t = (k, vars) => {
  let s = (I18N[LANG] && I18N[LANG][k]) != null ? I18N[LANG][k] : (I18N.en[k] != null ? I18N.en[k] : k);
  if (vars) Object.keys(vars).forEach(v => { s = String(s).split('{' + v + '}').join(vars[v]); });
  return s;
};

function applyI18n() {
  document.documentElement.lang = LANG === 'kh' ? 'km' : 'en';
  document.body.dataset.lang = LANG;
  $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $('#langEn').classList.toggle('active', LANG === 'en');
  $('#langKh').classList.toggle('active', LANG === 'kh');
}

/* ============================================================
   PRICING ENGINE
   ============================================================ */
const isWeekend = dateStr => { const d = new Date(dateStr + 'T12:00:00'); const w = d.getDay(); return w === 0 || w === 6; };

/* duration: 2..6 (hours) | 'ON8' | 'ON9' | {poolHours:n} handled via state.poolCustom */
function priceFor(roomId, dateStr, dur) {
  const room = roomById(roomId); if (!room) return null;
  const isPool = room.type === 'pool';
  if (dur === 'ON8' || dur === 'ON9') {
    if (isPool) return null;                                   // pool is hourly only
    const base = CONFIG.pricing[isWeekend(dateStr) ? 'weekend' : 'weekday'].overnight;
    return room.type === 'vip' ? base + CONFIG.vipUpgrade : base;
  }
  const h = Number(dur);
  if (!h || h < 1) return null;
  if (isPool) return CONFIG.poolRate * h;
  const table = CONFIG.pricing[isWeekend(dateStr) ? 'weekend' : 'weekday'];
  if (!table[h]) return null;                                   // only 2..6 for std/vip
  return room.type === 'vip' ? table[h] + CONFIG.vipUpgrade : table[h];
}
const money = n => '$' + Number(n).toFixed(2).replace(/\.00$/, '');

/* ============================================================
   KHQR (scan-to-pay with any Cambodian bank app)
   ============================================================ */
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
const crc16 = s => {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};
function buildKHQRPayload(amount) {
  const k = CONFIG.khqr || {};
  const amt = amount != null ? Number(amount).toFixed(2) : null;
  if (k.payload) {
    const parts = []; let s = k.payload, i = 0;
    while (i + 4 <= s.length) {
      const id = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
      if (i + 4 + len > s.length) break;
      if (id !== '63' && id !== '54') parts.push({ id: id, value: s.substr(i + 4, len) });
      i += 4 + len;
    }
    if (!parts.find(p => p.id === '53')) parts.push({ id: '53', value: '840' });
    parts.forEach(p => { if (p.id === '01') p.value = amt ? '12' : '11'; });
    if (amt) parts.push({ id: '54', value: amt });
    parts.sort((a, b) => (a.id === '54' && b.id === '53') ? 1 : (a.id === '53' && b.id === '54') ? -1 : (a.id < b.id ? -1 : 1));
    const out = parts.map(p => tlv(p.id, p.value)).join('') + '6304';
    return out + crc16(out);
  }
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
function renderKHQR(canvas, amount) {
  if (!canvas) return;
  const qr = qrcode(0, 'M');               // global from qrcode.min.js
  qr.addData(buildKHQRPayload(amount));
  qr.make();
  const cells = qr.getModuleCount(), scale = 4;
  canvas.width = canvas.height = cells * scale + 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#241b3a';
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++)
    if (qr.isDark(r, c)) ctx.fillRect(16 + c * scale, 16 + r * scale, scale, scale);
}

/* ============================================================
   LIVE BACKEND DETECTION
   ============================================================ */
const live = { on: false };
async function detectLive() {
  if (location.protocol === 'file:') { live.on = false; return; }
  const base = CONFIG.api.baseUrl || '';
  try {
    const r = await fetchTimeout(base + '/api/health', { method: 'GET' }, 3500);
    const j = await r.json().catch(() => ({}));
    live.on = !!(j && j.ok);
  } catch (e) { live.on = false; }
}

/* ============================================================
   STATE + WIZARD
   ============================================================ */
const state = {
  step: 1, date: '', dur: '', disabledRooms: [],
  start: '', room: '', name: '', phone: '', agreed: false,
  idCard: '', ref: '', completed: false, avail: ''
};
const D = $('#book');

const durInfo = () => {
  if (state.dur === 'ON8') return { checkIn: '20:00', checkOut: '08:00', hours: 12, overnight: true };
  if (state.dur === 'ON9') return { checkIn: '21:00', checkOut: '09:00', hours: 12, overnight: true };
  const h = Number(state.dur);
  return { checkIn: state.start, checkOut: toHHMM(toMin(state.start) + h * 60), hours: h, overnight: false };
};
const toMin = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
/* Cambodia local time (UTC+7) — the clock the booking rules follow */
const khNow = () => { const d = new Date(Date.now() + 7 * 3600e3); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
const dayIdx = ds => Math.floor(Date.parse(ds + 'T00:00:00Z') / 864e5);
const toHHMM = mins => { mins = ((mins % 1440) + 1440) % 1440; return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); };
const scheduleValid = () => !!state.date && !!state.dur && (state.dur === 'ON8' || state.dur === 'ON9' ? true : !!state.start);

function goStep(n) {
  state.step = n;
  for (let i = 1; i <= 5; i++) { const p = $('#pane' + i); if (p) p.hidden = (i !== n); }
  $$('.step-btn').forEach(b => {
    const s = Number(b.dataset.step);
    b.classList.toggle('active', s === n);
    b.classList.toggle('done', s < n);
  });
  $$('.step-btn').forEach(b => { if (Number(b.dataset.step) === 2) b.style.display = state.roomLocked ? 'none' : ''; });
  if (n === 2) buildRoomGrid();
  if (n === 3) buildGuest();
  if (n === 4) buildReview();
  if (n === 5) buildSuccess();
  if (D) D.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   STEP 1 — SCHEDULE
   ============================================================ */
function initSchedule() {
  const d = $('#bkDate');
  d.min = khNow().date;
  if (!d.dataset.init) {
    d.dataset.init = '1';
    d.addEventListener('change', () => { state.date = d.value; syncSchedule(); });
    $$('#durChips button').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.classList.contains('unavail')) { toast(t('tSlotGone'), ICON.info); return; }
        $$('#durChips button').forEach(c => c.classList.remove('sel'));
        chip.classList.add('sel');
        state.dur = chip.dataset.dur;
        syncSchedule();
      });
    });
    $('#bkIn').addEventListener('change', () => { state.start = $('#bkIn').value; syncSchedule(); });
    $('#actNext1').addEventListener('click', () => {
      if (!scheduleValid()) { toast(t(state.dur ? 'tDur' : 'tDur'), ICON.info); return; }
      goStep(state.roomLocked ? 3 : 2);
    });
  }
  syncSchedule();
}

function syncSchedule() {
  const note = $('#priceNote'), dNote = $('#dateTypeNote');
  if (state.date) dNote.textContent = '📅 ' + (isWeekend(state.date) ? t('weekend') : t('weekday')) + ' pricing applies';
  else dNote.textContent = '';

  const isON = state.dur === 'ON8' || state.dur === 'ON9';
  $('#checkinField').hidden = isON || !state.dur;
  $('#ovField').hidden = !isON;
  if (isON) {
    const info = durInfo();
    $('#ovTimes').innerHTML = '<div>' + esc(t('s1OvLine', { in: info.checkIn, out: info.checkOut })) + '</div>';
  }

  /* room is pre-locked (Book This Room) → show it, load its busy ranges */
  const lockBar = $('#roomLockBar');
  if (lockBar) {
    const r = state.roomLocked ? roomById(state.room) : null;
    lockBar.hidden = !r;
    if (r) lockBar.innerHTML = '🏠 <b>' + esc(t('roomLockLbl')) + ':</b> ' + esc(roomName(r)) + ' ✓';
  }
  if (state.roomLocked && state.room && state.date && live.on) {
    const key = state.room + '@' + state.date;
    if (state.busyKey !== key) loadRoomBusy();
  }

  /* build check-in hour options allowed for this duration */
  if (!isON && state.dur) {
    const h = Number(state.dur);
    const sel = $('#bkIn');
    const cur = state.start;
    const lastStart = 23 - h;                                  // check-out must be ≤ 23:00
    const today = state.date === khNow().date;                 // Cambodia "today"
    const nowMin = khNow().min;
    const dStart = dayIdx(state.date) * 1440;
    const busyHit = (s, e) => (state.busyRanges || []).some(b => b.s < e + 60 && s < b.e + 60);   // 1h cleaning
    let html = '<option value="" disabled selected>' + esc(t('s1In')) + '</option>';
    for (let hr = 8; hr <= lastStart; hr++) {
      const v = String(hr).padStart(2, '0') + ':00';
      const gone = (today && (hr * 60 < nowMin || hr * 60 > 21 * 60))              // passed / after 21:00 today
                || (state.roomLocked && state.busyRanges && busyHit(dStart + hr * 60, dStart + hr * 60 + h * 60));
      html += '<option value="' + v + '"' + (gone ? ' disabled' : '') + '>' + v + (gone ? ' — ' + esc(t('timeNA')) : '') + '</option>';
    }
    sel.innerHTML = html;
    if (cur && toMin(cur) <= lastStart * 60 && !(([].slice.call(sel.options)).some(o => o.value === cur && !o.disabled))) {
      state.start = '';                                        // current pick became unavailable
    }
    if (cur && toMin(cur) <= lastStart * 60) {
      const opt = ([].slice.call(sel.options)).find(o => o.value === cur);
      if (opt && !opt.disabled) sel.value = cur; else state.start = sel.value || '';
    } else state.start = sel.value || '';
  }

  /* same-day notes + overnight chips that are no longer possible */
  const note2 = $('#slotNote');
  if (note2) note2.textContent = state.date === khNow().date ? t('slotNote') : (state.roomLocked ? t('cleanNote') : '');
  const onBlocked = code => {
    const cin = code === 'ON8' ? 20 * 60 : 21 * 60;
    if (state.date === khNow().date && cin < khNow().min) return true;           // tonight's check-in already passed
    if (state.roomLocked && state.busyRanges) {
      const dStart = dayIdx(state.date) * 1440;
      return (state.busyRanges || []).some(b => b.s < dStart + cin + 720 + 60 && dStart + cin < b.e + 60);
    }
    return false;
  };
  const lockRoom = state.roomLocked ? roomById(state.room) : null;
  $$('#durChips button').forEach(chip => {
    const d = chip.dataset.dur;
    if (d === 'ON8' || d === 'ON9') {
      const blocked = onBlocked(d) || (lockRoom && lockRoom.type === 'pool');
      chip.classList.toggle('unavail', blocked);
    }
  });

  /* live price note */
  if (state.date && state.dur) {
    const wk = isWeekend(state.date) ? 'weekend' : 'weekday';
    const parts = [];
    const std = priceFor('vintage', state.date, state.dur);
    const vip = priceFor('veggie', state.date, state.dur);
    const pool = priceFor('pool', state.date, state.dur);
    if (std != null) parts.push(esc(t('lblStd')) + ' ' + money(std));
    if (vip != null) parts.push(esc(t('lblVip')) + ' ' + money(vip));
    if (pool != null) parts.push(esc(t('lblPool')) + ' ' + money(pool));
    note.innerHTML = '💰 ' + esc(t(wk)) + (state.dur === 'ON8' || state.dur === 'ON9' ? ' · ' + esc(t('overnight')) : ' · ' + state.dur + ' ' + esc(t('hoursWord'))) +
      ' → <b>' + parts.join(' · ') + '</b>';
  } else note.textContent = '';

  const b = $('#actNext1');
  if (b) b.disabled = !scheduleValid();
}

/* busy ranges for the pre-locked room (Book This Room flow) */
async function loadRoomBusy() {
  if (!state.roomLocked || !state.room || !state.date || !live.on) { state.busyRanges = []; return; }
  state.busyKey = state.room + '@' + state.date;
  const key = state.busyKey;
  try {
    const base = CONFIG.api.baseUrl || '';
    const r = await fetchTimeout(base + '/api/availability?room=' + encodeURIComponent(state.room) + '&date=' + encodeURIComponent(state.date), { method: 'GET' }, 6000);
    const j = await r.json().catch(() => ({}));
    if (state.busyKey !== key) return;                        // date changed meanwhile
    state.busyRanges = (j.busy || []).map(b => ({
      s: dayIdx(b.date) * 1440 + toMin(b.checkIn),
      e: dayIdx(b.date) * 1440 + toMin(b.checkIn) + b.hours * 60
    }));
  } catch (e) { state.busyRanges = []; }
  syncSchedule();
}

/* ============================================================
   STEP 2 — ROOM PICKER
   ============================================================ */
async function buildRoomGrid() {
  const grid = $('#roomGrid');
  const info = durInfo();
  let busyMap = {};
  if (live.on) {
    try {
      const base = CONFIG.api.baseUrl || '';
      const q = '?date=' + encodeURIComponent(state.date) + '&checkIn=' + encodeURIComponent(info.checkIn) +
                '&checkOut=' + encodeURIComponent(info.checkOut) + '&hours=' + info.hours;
      const r = await fetchTimeout(base + '/api/availability' + q, { method: 'GET' }, 6000);
      const j = await r.json().catch(() => ({}));
      (j.busy || []).forEach(bk => { busyMap[bk.room] = true; });
      if (j.disabled) state.disabledRooms = j.disabled;   // fresh maintenance state
    } catch (e) { /* offline → treat all as available */ }
  }
  const free = ROOMS.filter(r => !busyMap[r.id] && priceFor(r.id, state.date, state.dur) != null);
  const note = $('#roomAvailNote');
  note.textContent = live.on ? t('s2Note', { n: free.length, t: ROOMS.length }) : t('s2NoteDemo');

  grid.innerHTML = ROOMS.map(r => {
    const p = priceFor(r.id, state.date, state.dur);
    const maint = (state.disabledRooms || []).includes(r.id);
    const busy = !!busyMap[r.id];
    const unavail = busy || maint || p == null;
    const flag = r.type === 'vip' ? '<span class="room-flag vip">VIP</span>'
               : r.type === 'pool' ? '<span class="room-flag pool">' + esc(t('flagPool')) + '</span>'
               : '<span class="room-flag">' + esc(t('flagStd')) + '</span>';
    const busyTag = maint ? '<span class="room-flag maint">🔧 ' + esc(t('maintFlag')) + '</span>'
                   : busy ? '<span class="room-flag busy">✕ ' + esc(t('roomTaken')) + '</span>' : '';
    const vipBox = r.type === 'vip' ? '<div class="vip-includes"><b>👑 ' + esc(t('vipIncludesTitle')) + '</b>' +
      VIP_INCLUDES[LANG === 'kh' ? 'kh' : 'en'].map(x => esc(x)).join(' · ') + '</div>' : '';

    return '<div class="room-card' + (state.room === r.id ? ' sel' : '') + (unavail ? ' unavail' : '') + '" data-room="' + r.id + '">' +
      '<div class="room-pic"><img src="' + r.img + '" alt="' + esc(roomName(r)) + '" loading="lazy">' + flag + busyTag + '</div>' +
      '<div class="room-body"><h4>' + esc(roomName(r)) + '</h4><p class="room-blurb">' + esc(roomBlurb(r)) + '</p>' +
      vipBox + '</div></div>';
  }).join('');

  $$('#roomGrid .room-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('unavail')) return;
      $$('#roomGrid .room-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      state.room = card.dataset.room;
      $('#actNext2').disabled = false;
    });
  });
  /* preselected room (from a showcase card click) is only valid if actually available */
  const selOk = state.room && !busyMap[state.room] && priceFor(state.room, state.date, state.dur) != null;
  $('#actNext2').disabled = !selOk;
  $('#actBack2').onclick = () => goStep(1);
  $('#actNext2').onclick = () => goStep(3);
}

/* ============================================================
   STEP 3 — GUEST DETAILS (phone validation + ID upload)
   ============================================================ */
function buildGuest() {
  const nm = $('#bkName'), ph = $('#bkPhone');
  nm.value = state.name; ph.value = state.phone;
  const isON = state.dur === 'ON8' || state.dur === 'ON9';
  $('#idField').hidden = !isON;

  if (!nm.dataset.init) {
    nm.dataset.init = '1';
    nm.addEventListener('input', () => { state.name = nm.value; guestValid(); });
    /* phone: digits only, live-filtered */
    ph.addEventListener('input', () => {
      const clean = ph.value.replace(/\D+/g, '');
      if (clean !== ph.value) ph.value = clean;
      state.phone = clean; guestValid();
    });
    ph.addEventListener('blur', () => {
      if (state.phone && !phoneOk(state.phone)) toast(t('tPhoneLen'), ICON.info);
    });
    $('#idUpload').addEventListener('change', readIdFile);
    $('#idClear').addEventListener('click', () => {
      state.idCard = ''; $('#idUpload').value = ''; $('#idPreview').hidden = true; guestValid();
    });
    $('#actBack3').onclick = () => goStep(state.roomLocked ? 1 : 2);
    $('#actNext3').onclick = () => {
      const onNow = state.dur === 'ON8' || state.dur === 'ON9';   // fresh — never a stale closure
      if (!state.name.trim()) { toast(t('tName'), ICON.info); return; }
      if (!phoneOk(state.phone)) { toast(t('tPhoneLen'), ICON.info); return; }
      if (onNow && !state.idCard) { toast(t('tId'), ICON.info); return; }
      goStep(4);
    };
  }
  guestValid();
}
const phoneOk = p => /^[0-9]{8,15}$/.test(p);
function guestValid() {
  const isON = state.dur === 'ON8' || state.dur === 'ON9';
  const valid = !!(state.name.trim() && phoneOk(state.phone) && (!isON || !!state.idCard));
  $('#actNext3').disabled = !valid;
}

/* read + downscale ID image to a data URL (max 1280px, jpeg) */
function readIdFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast(t('tId'), ICON.info); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      state.idCard = cv.toDataURL('image/jpeg', 0.82);
      $('#idPreviewImg').src = state.idCard;
      $('#idPreview').hidden = false;
      toast(t('s3IdOk'), ICON.ok);
      guestValid();
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
}

/* ============================================================
   STEP 4 — REVIEW + PAY + CONFIRM
   ============================================================ */
function receiptHTML() {
  const r = roomById(state.room), info = durInfo();
  const wk = isWeekend(state.date) ? 'weekend' : 'weekday';
  const isON = info.overnight;
  const total = priceFor(state.room, state.date, state.dur);
  const row = (k, v) => '<div class="rc-row"><span>' + esc(k) + '</span><b>' + v + '</b></div>';
  return row(t('rcDate'), esc(state.date) + ' (' + esc(t(wk)) + ')') +
         row(t('rcRoom'), esc(r ? roomName(r) : '—')) +
         row(t('rcType'), esc(r ? (r.type === 'vip' ? 'VIP' : t(r.type === 'pool' ? 'flagPool' : 'flagStd')) + (r.type === 'vip' ? ' (+' + CONFIG.vipUpgrade + ')' : '') : '—')) +
         row(t('rcIn'), esc(info.checkIn) + (isON ? ' 🌙' : '')) +
         row(t('rcOut'), esc(info.checkOut) + (isON ? ' ☀️' : '')) +
         row(t('rcDur'), isON ? esc(t('overnight')) + ' (12h)' : info.hours + ' ' + esc(t('hoursWord'))) +
         row(t('rcGuest'), esc(state.name)) +
         row(t('rcPhone'), esc(state.phone)) +
         (isON ? row(t('rcId'), state.idCard ? esc(t('rcIdYes')) : '—') : '') +
         '<div class="rc-row rc-total"><span>' + esc(t('total')) + '</span><b>' + money(total) + '</b></div>';
}

function buildReview() {
  $('#reviewReceipt').innerHTML = receiptHTML();
  $('#termsList').innerHTML = t('rules').map(r => '<li>' + r + '</li>').join('');
  const ag = $('#agreedTerms');
  ag.checked = state.agreed;
  $('#paySection').classList.toggle('open', state.agreed);
  $('#payAmount').textContent = money(priceFor(state.room, state.date, state.dur));
  $('#payRef').textContent = '';
  renderKHQR($('#khqrCanvas'), priceFor(state.room, state.date, state.dur));
  if (!ag.dataset.init) {
    ag.dataset.init = '1';
    ag.addEventListener('change', () => {
      state.agreed = ag.checked;
      $('#paySection').classList.toggle('open', state.agreed);
      syncConfirmBtn();
    });
    $('#actBack4').onclick = () => goStep(3);
    $('#actConfirm').addEventListener('click', confirmBooking);
  }
  syncConfirmBtn();
}
function syncConfirmBtn() {
  const info = durInfo(), isON = info.overnight;
  const valid = state.agreed && state.name.trim() && phoneOk(state.phone) && (!isON || !!state.idCard) && state.room;
  $('#actConfirm').disabled = !valid;
}

async function confirmBooking() {
  const btn = $('#actConfirm');
  const r = roomById(state.room), info = durInfo();
  btn.disabled = true; btn.textContent = '…';
  try {
    const base = CONFIG.api.baseUrl || '';
    const resp = await fetchTimeout(base + '/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: state.room, date: state.date,
        checkIn: info.checkIn, checkOut: info.checkOut,
        hours: info.hours, overnight: info.overnight,
        name: state.name.trim(), phone: state.phone.trim(), contact: '',
        idCard: info.overnight ? state.idCard : ''
      })
    }, 12000);
    const j = await resp.json().catch(() => ({}));
    if (resp.status === 409) { toast(t('tBusy'), ICON.cross); state.busyKey = ''; goStep(state.roomLocked ? 1 : 2); return; }
    if (!resp.ok || !j.ok) { toast(j && j.message ? j.message : t('tServer'), ICON.cross); return; }
    state.ref = j.booking ? j.booking.ref : (j.ref || '');
    saveMyBooking({
      ref: state.ref,
      status: j.booking ? j.booking.status : (j.status || 'pending'),
      room: state.room, date: state.date,
      checkIn: info.checkIn, checkOut: info.checkOut,
      hours: info.hours, overnight: !!info.overnight,
      name: state.name.trim(),
      total: (j.booking ? j.booking.total : j.total) || priceFor(state.room, state.date, state.dur)
    });
    toast(t('tDone'), ICON.ok);
    state.completed = true;
    goStep(5);
  } catch (e) {
    toast(t('tServer'), ICON.cross);
  }
  btn.textContent = t('confirmBtn');
  syncConfirmBtn();
}

/* ============================================================
   STEP 5 — SUCCESS (Telegram confirmation hand-off)
   ============================================================ */
function buildSuccess() {
  $('#tgConfirmBtn').href = CONFIG.botUrl + '?start=' + encodeURIComponent(state.ref);
  $('#s5RefNote').textContent = t('s5RefNote', { ref: state.ref });
  $('#successReceipt').innerHTML = receiptHTML();
  const again = $('#actAgain');
  again.onclick = () => {
    resetBooking();
    $$('#durChips button').forEach(c => c.classList.remove('sel'));
    initSchedule();
    goStep(1);
  };
}

/* ============================================================
   HERO SHOWCASE SLIDER (crossfade + Ken Burns, like the classic)
   ============================================================ */
function initShowcase() {
  const frame = $('#showcaseFrame');
  if (!frame) return;
  frame.innerHTML = ROOMS.map(r => '<div class="slide"><img src="' + r.img + '" alt="' + esc(roomName(r)) + '"></div>').join('') +
    '<div class="slide slide-cs"><img src="assets/ez-stay.jpg" alt="EZ Stay — coming soon"></div>' +
    '<div class="showcase-chip" id="showcaseChip"><small>HIDDEN HOMESTAY</small><b id="chipName"></b><span id="chipType"></span></div>';
  const slides = $$('.slide', frame);
  let cur = -1, altZoom = false, timer = null;
  const typeLabel = r => LANG === 'kh'
    ? (r.type === 'vip' ? 'បន្ទប់ VIP' : (r.type === 'pool' ? 'បន្ទប់Pool' : 'បន្ទប់ស្តង់ដារ'))
    : (r.type === 'vip' ? 'VIP ROOM' : (r.type === 'pool' ? 'POOL ROOM' : 'STANDARD ROOM'));
  function show(i) {
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    if (i >= 0) { slides[i].classList.toggle('zoom-out', altZoom); altZoom = !altZoom; }
    const r = ROOMS[i];
    const chip = $('#showcaseChip');
    if (!r) {                                       /* the Coming Soon slide (index === ROOMS.length) */
      chip.classList.add('swap');
      setTimeout(() => {
        const n = $('#chipName'), tp = $('#chipType');
        if (n) n.textContent = t('csTitle');
        if (tp) tp.textContent = t('csTag');
        chip.classList.remove('swap');
      }, 220);
      return;
    }
    chip.classList.add('swap');
    setTimeout(() => {
      const n = $('#chipName'), tp = $('#chipType');
      if (n) n.textContent = roomName(r);
      if (tp) tp.textContent = typeLabel(r);
      chip.classList.remove('swap');
    }, 220);
  }
  function next() {
    if (slides.length < 2) { show(0); return; }
    let i = cur;
    while (i === cur) i = Math.floor(Math.random() * slides.length);
    cur = i;
    show(cur);
  }
  next();
  timer = setInterval(next, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(timer); timer = null; }
    else if (!timer) { next(); timer = setInterval(next, 3000); }
  });
}

/* ============================================================
   BOOKING OVERLAY (opens like the classic pop-up booking screen)
   ============================================================ */
function resetBooking() {
  Object.assign(state, { step: 1, date: '', dur: '', start: '', room: '', roomLocked: false, busyKey: '', busyRanges: null, name: '', phone: '', agreed: false, idCard: '', ref: '', completed: false, avail: '' });
  $('#bkDate').value = ''; $('#bkIn').value = ''; $('#bkPhone').value = ''; $('#bkName').value = '';
  $('#idUpload').value = ''; $('#idPreview').hidden = true;
  const ag = $('#agreedTerms');
  if (ag) { ag.checked = false; $('#paySection').classList.remove('open'); }
}
function openBooking(e) {
  if (e) e.preventDefault();
  const ov = $('#bookingOverlay');
  if (!ov) return;
  if (state.completed) resetBooking();          // fresh start after a finished booking
  if (state.roomLockKeep) state.roomLockKeep = false;             // opened via Book This Room → keep the room
  else if (state.roomLocked) {                                   // plain open after a locked flow → fresh start
    state.room = ''; state.roomLocked = false; state.busyKey = ''; state.busyRanges = null; state.step = 1;
  }
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  document.body.classList.add('booking-open');
  goStep(state.step || 1);
}
function closeBooking() {
  const ov = $('#bookingOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('booking-open');
}
function initBookingOverlay() {
  const ov = $('#bookingOverlay');
  if (!ov) return;
  $$('.js-book-open').forEach(el => el.addEventListener('click', openBooking));
  const x = $('#bookClose');
  if (x) x.addEventListener('click', closeBooking);
  ov.addEventListener('click', e => { if (e.target === ov) closeBooking(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const mb = $('#myBookingsOverlay');
    if (mb && mb.classList.contains('open')) { closeMyBookings(); return; }
    if (ov.classList.contains('open')) closeBooking();
  });
}

/* ============================================================
   MY BOOKINGS (saved on this device, like the classic viewer)
   ============================================================ */
const MY_KEY = 'hh_my_bookings';
function saveMyBooking(bk) {
  const list = store.get(MY_KEY) || [];
  if (!bk.ref || list.some(x => x.ref === bk.ref)) return;
  list.push(bk);
  store.set(MY_KEY, list.slice(-30));
}
function mbStatus(s) {
  return s === 'confirmed' ? t('stConfirmed') : (s === 'cancelled' ? t('stCancelled') : t('stPending'));
}
let mbPollTimer = null;
async function refreshMyStatuses() {
  if (!live.on) return;
  const list = store.get(MY_KEY) || [];
  if (!list.length) return;
  try {
    const base = CONFIG.api.baseUrl || '';
    const r = await fetchTimeout(base + '/api/status?refs=' + encodeURIComponent(list.map(b => b.ref).join(',')), { method: 'GET' }, 6000);
    const j = await r.json().catch(() => ({}));
    if (j && j.statuses) {
      let changed = false;
      const upd = list.map(b => { const st = j.statuses[String(b.ref).toUpperCase()]; if (st && st !== b.status) { changed = true; return Object.assign({}, b, { status: st }); } return b; });
      if (changed) { store.set(MY_KEY, upd); renderMyBookings(); }
    }
  } catch (e) { /* offline → keep local statuses */ }
}
function renderMyBookings() {
  const box = $('#mbList');
  if (!box) return;
  const list = (store.get(MY_KEY) || []).slice().reverse();
  if (!list.length) { box.innerHTML = '<div class="mb-empty">🗓️ ' + esc(t('mbEmpty')) + '</div>'; return; }
  box.innerHTML = list.map(bk => {
    const r = roomById(bk.room);
    const confirmed = bk.status === 'confirmed';
    return '<div class="mb-item">' +
      '<div class="mb-item-top"><b class="mb-ref">' + esc(bk.ref) + '</b><span class="mb-status ' + esc(bk.status || 'pending') + '">' + esc(mbStatus(bk.status)) + '</span></div>' +
      '<div class="mb-rows">' +
        '<div><span>' + esc(t('mbRoom')) + '</span><b>' + esc(r ? roomName(r) : bk.room) + '</b></div>' +
        '<div><span>' + esc(t('mbDate')) + '</span><b>' + esc(bk.date) + '</b></div>' +
        '<div><span>' + esc(t('mbTimes')) + '</span><b>' + esc(bk.checkIn) + ' – ' + esc(bk.checkOut) + (bk.overnight ? ' 🌙' : '') + '</b></div>' +
        '<div><span>' + esc(t('mbGuest')) + '</span><b>' + esc(bk.name) + '</b></div>' +
      '</div>' +
      '<div class="mb-foot"><span class="mb-amt">' + money(bk.total) + '</span>' +
        '<span class="mb-foot-btns">' +
          (confirmed
            ? '<a class="btn btn-tg btn-sm" target="_blank" rel="noopener" href="' + CONFIG.botUrl + '?start=' + encodeURIComponent(bk.ref) + '">📨 ' + esc(t('mbTgBtn')) + '</a>'
            : '<span class="mb-wait">⏳ ' + esc(t('mbWait')) + '</span>') +
          '<button class="btn btn-ghost btn-sm mb-del" type="button" data-ref="' + esc(bk.ref) + '">' + esc(t('mbRemove')) + '</button>' +
        '</span></div>' +
    '</div>';
  }).join('');
  $$('.mb-del', box).forEach(btn => btn.addEventListener('click', () => {
    store.set(MY_KEY, (store.get(MY_KEY) || []).filter(x => x.ref !== btn.dataset.ref));
    renderMyBookings();
    toast(t('mbRemoved'), ICON.ok);
  }));
}
function openMyBookings(e) {
  if (e) e.preventDefault();
  const ov = $('#myBookingsOverlay');
  if (!ov) return;
  renderMyBookings();
  refreshMyStatuses();                                     // instant refresh + auto-poll while open
  if (mbPollTimer) clearInterval(mbPollTimer);
  mbPollTimer = setInterval(refreshMyStatuses, 5000);
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  document.body.classList.add('booking-open');
}
function closeMyBookings() {
  if (mbPollTimer) { clearInterval(mbPollTimer); mbPollTimer = null; }
  const ov = $('#myBookingsOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('booking-open');
}
function initMyBookings() {
  $$('.js-my-bookings').forEach(el => el.addEventListener('click', openMyBookings));
  const x = $('#mbClose');
  if (x) x.addEventListener('click', closeMyBookings);
  const ov = $('#myBookingsOverlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeMyBookings(); });
  const s5 = $('#actMyBookings');
  if (s5) s5.addEventListener('click', openMyBookings);
}

/* ============================================================
   SHOWCASE (rooms section) + static bits
   ============================================================ */
function renderShowcase() {
  const card = r => {
    const flag = r.type === 'vip' ? '<span class="room-flag vip">VIP</span>'
               : r.type === 'pool' ? '<span class="room-flag pool">' + esc(t('flagPool')) + '</span>'
               : '<span class="room-flag">' + esc(t('flagStd')) + '</span>';
    const vipBox = r.type === 'vip' ? '<div class="vip-includes"><b>👑 ' + esc(t('vipIncludesTitle')) + '</b>' + VIP_INCLUDES[LANG === 'kh' ? 'kh' : 'en'].map(esc).join(' · ') + '</div>' : '';
    const maint = (state.disabledRooms || []).includes(r.id);
    const maintTag = maint ? '<span class="room-flag maint">🔧 ' + esc(t('maintFlag')) + '</span>' : '';
    const bookBtn = maint
      ? '<div class="room-unavail-note">🔴 ' + esc(t('maintNote')) + '</div>'
      : '<button class="room-book" type="button">' + esc(t('bookThisRoom')) + ' →</button>';
    return '<div class="room-card' + (maint ? ' maintenance' : '') + '" data-room="' + r.id + '" role="button" tabindex="0" aria-label="' + esc(roomName(r)) + '"><div class="room-pic"><img src="' + r.img + '" alt="' + esc(roomName(r)) + '" loading="lazy">' + flag + maintTag + '</div>' +
      '<div class="room-body"><h4>' + esc(roomName(r)) + '</h4><p class="room-blurb">' + esc(roomBlurb(r)) + '</p>' +
      vipBox +
      bookBtn + '</div></div>';
  };
  $('#showPool').innerHTML = ROOMS.filter(r => r.type === 'pool').map(card).join('');
  $('#showStd').innerHTML  = ROOMS.filter(r => r.type === 'standard').map(card).join('');
  $('#showVip').innerHTML  = ROOMS.filter(r => r.type === 'vip').map(card).join('');

  /* clicking a room card (or its Book button) opens the booking with that room preselected */
  $$('#showPool .room-card, #showStd .room-card, #showVip .room-card').forEach(el => {
    const act = () => bookFromRoom(el.dataset.room);
    el.addEventListener('click', act);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
}

function bookFromRoom(roomId) {
  if (!roomById(roomId)) return;
  if ((state.disabledRooms || []).includes(roomId)) { toast(t('tMaint'), ICON.info); return; }
  state.roomLockKeep = true;                    // openBooking must not wipe the room
  openBooking();
  if (state.completed) resetBooking();          // finished earlier? fresh state, then re-lock
  state.room = roomId;
  state.roomLocked = true;
  state.busyKey = ''; state.busyRanges = null;
  state.step = 1;
  goStep(1);
  syncSchedule();                               // paint the locked-room bar right away
}

function renderStatic() {
  $('#yr').textContent = new Date().getFullYear();
}

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  LANG = store.get('hh_lang') || 'en';
  applyI18n(); renderShowcase(); renderStatic(); initShowcase(); initBookingOverlay(); initMyBookings();
  $('#langEn').addEventListener('click', () => { LANG = 'en'; store.set('hh_lang', 'en'); applyI18n(); renderShowcase(); renderStatic(); syncSchedule(); if (state.step === 2) buildRoomGrid(); if (state.step >= 4) buildReview(); if (state.step === 5) buildSuccess(); });
  $('#langKh').addEventListener('click', () => { LANG = 'kh'; store.set('hh_lang', 'kh'); applyI18n(); renderShowcase(); renderStatic(); syncSchedule(); if (state.step === 2) buildRoomGrid(); if (state.step >= 4) buildReview(); if (state.step === 5) buildSuccess(); });
  initSchedule();
  $$('.step-btn').forEach(b => b.addEventListener('click', () => { const s = Number(b.dataset.step); if (s === 2 && state.roomLocked) return; if (s < state.step && !state.completed) goStep(s); }));
  await detectLive();
  try {
    if (live.on) {
      const base = CONFIG.api.baseUrl || '';
      const r = await fetchTimeout(base + '/api/rooms', { method: 'GET' }, 6000);
      const j = await r.json().catch(() => ({}));
      state.disabledRooms = (j && j.disabled) || [];
      renderShowcase();                                    // repaint cards with 🔧 maintenance flags
    }
  } catch (e) { /* offline → all rooms available */ }
})();
