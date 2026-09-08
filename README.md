# Hidden Homestay — Website + Booking Server + Telegram Bot

**stay cosy. stay HIDDEN** · A luxury-themed private room booking experience for Phnom Penh.

The website is a single self-contained file that works in two modes:

- **Demo mode** (opening `index.html` directly): everything runs locally, bookings are kept
  in the browser's localStorage. No server needed.
- **Live mode** (when served by the included server): bookings are stored centrally, you get
  Telegram alerts with ✅/❌ buttons, you can take bookings from Telegram that instantly show
  as "not available" on the website, and availability is checked in real time.

👉 **New to this? Read [`DEPLOYMENT.md`](DEPLOYMENT.md) — a step-by-step guide (no programming
needed) to go live with Telegram + storage + KHQR in about 30 minutes, for free.**

## ▶ Quick view (demo)

Open **`index.html`** in any browser. It works offline — you can send it as one file, or host
it on any static host.

## ✨ What's inside

| Area | Details |
|---|---|
| Hero | "Stay Somewhere Unforgettable" + slider of the supplied room photos — random order, every 3 s, fade + subtle zoom |
| Rooms | Burger Room $6.00/h · Vintage Room $7.00/h · Fishing Room $7.50/h — rounded cards, hover effects, price chips |
| Branches | Borey Vimean Phnom Penh (Cheasophara) and Peng Hout (Boeung Snor) |
| Booking | Full-screen 4 steps: branch → room → schedule → review |
| Schedule | **Check-in / Check-out** times, **whole hours only** (1, 2, 3 hrs… no 2h05m), quick 1–6 hr chips, live duration + price |
| Availability | Demo mode: basic validation. Live mode: real-time clash checking against all bookings (website **and** Telegram) |
| Payment | **KHQR** — a QR code generated for each booking containing the exact amount; scannable by ABA, ACLEDA, Wing, Bakong and every Cambodian banking app |
| Terms | 8 policy sections; accepting them unlocks the payment section |
| Confirmation | Receipt-style slip + success page, booking reference (e.g. `HH-K3P9XR`) |
| Extras | "My Bookings" viewer, toasts, fully responsive, touch-friendly |

## 📁 Files

```
hidden-homestay/
├── index.html            ← THE WEBSITE (self-contained; share this one file)
├── DEPLOYMENT.md         ← ★ step-by-step guide: storage + Telegram + KHQR setup
├── package.json          ← lets the server run ("npm start")
├── server/
│   └── server.js         ← booking API + Telegram bot (zero dependencies, Node 18+)
├── assets/               ← images (logo & ABA originals kept untouched; AI-generated
│                            branch placeholder photos — replace with real ones anytime)
└── dev/                  ← sources + tools (only needed to make changes)
    ├── template.html · styles.css · app.js   ← editable sources
    ├── qrcode.min.js     ← QR generator (MIT, Kazuhiko Arase) — bundled into index.html
    ├── build.py          ← python3 dev/build.py → rebuilds index.html
    ├── qa.py             ← 59 automated demo-mode tests (Playwright)
    ├── qa-live.py        ← 16 live-mode end-to-end tests against the real server
    └── test-server.js    ← 24 automated server + bot tests
```

## 🔌 The server (live mode)

```bash
npm start        # http://localhost:8080 — serves the site + API
```

Environment variables: `BOT_TOKEN` (from @BotFather), `OWNER_CHAT_ID` (optional — otherwise
the first person to `/start` the bot becomes the owner), `SUPABASE_URL` + `SUPABASE_KEY`
(optional permanent database), `ADMIN_KEY` (password for the owner dashboard, booking list
API and status changes — always set it in production), `PORT`.

API: `GET /api/health` · `GET /api/availability?branch=&room=&date=` ·
`POST /api/bookings` (409 on conflict) · `GET /api/bookings?date=&key=` ·
`PATCH /api/bookings?key=&ref=HH-…` body `{"status":"confirmed|cancelled|pending"}`

**Owner dashboard:** `/admin` — password-gated page (uses `ADMIN_KEY`) showing all website +
Telegram bookings, stats, filters, confirm/cancel buttons, CSV export, 15 s auto-refresh.

**Payments:** KHQR with the exact booking total — scannable QR (any Cambodian bank app)
**plus a “Pay Now” button** that opens the guest's banking app with the amount pre-filled
(Bakong official deeplink — cinema-style checkout).

Telegram bot: `/start` `/help` `/template` `/list` `/busy` `/book` `/confirm` `/cancel` —
`/book` with no arguments opens a guided **button flow** (branch → room → date → time →
hours → phone → name → review → confirm), exactly like booking on the website.
See DEPLOYMENT.md for the full cheat sheet.

## ✏️ Editing content

Prices, room names, copy, contacts and KHQR settings live in the `CONFIG` object at the top of
the script — edit `index.html` directly (search for `const CONFIG`), or edit `dev/app.js` and
run `python3 dev/build.py`.

**KHQR setup (important):** the QR is already configured for ABA account **000 523 457**
(Bakong ID `000523457@ABA`) in `CONFIG.khqr.payload` — each booking builds a fresh QR with
its exact total. **Scan-test it once with the ABA app before going public** (the recipient
must show as HIDDEN HOMESTAY / your account). If the app can't find the account, open
ABA → My QR → copy the QR text (starts with `000201…`) and paste it into `CONFIG.khqr.payload`
(or edit `dev/app.js` and run `python3 dev/build.py`).

Placeholder contact details to replace before going public: `+855 12 345 678`,
Telegram `@Hppy4D` (config only).

## 🔒 Modes & data

- **Demo mode:** bookings saved in the browser only (localStorage key `hiddenHomestayBookings`,
  with in-memory fallback where storage is blocked).
- **Live mode:** bookings stored by the server — JSON file by default, or your free Supabase
  database (recommended; see DEPLOYMENT.md Step 3). Nothing is sent anywhere else.
- No payment is processed by the site — KHQR is displayed for the guest to scan in their
  banking app.

## 🎨 Brand palette (from the supplied logo)

`#1d0239` eggplant · `#6d2596` purple · `#7c63a5` lilac · `#c63ee9` magenta ·
`#d65bd5` pink · `#61e5e1` cyan · `#5fa7e8` blue
