# Hidden Homestay — Setup Guide (Step by Step)

This guide takes you from zero to a live website that:
- **stores every booking** in one place,
- **alerts you on Telegram** when a guest books, with ✅ Confirm / ❌ Cancel buttons,
- lets **you take bookings on Telegram** while chatting with a customer — the website
  automatically shows those hours as *not available*,
- shows each guest a **KHQR code with the exact amount** to pay.

You do **not** need to know programming. If you can copy-paste and click buttons, you can do this.

---

## How it fits together (1 minute read)

```
   Guest on the website                    You on Telegram
   ┌──────────────────┐                    ┌──────────────────┐
   │  hidden-homestay │   booking sent →   │  your bot chat   │
   │     website      │←──────────────────→│  (alerts, /book) │
   └────────┬─────────┘                    └────────┬─────────┘
            │            one small server           │
            └────────────┬──────────────────────────┘
                         ▼
              ┌─────────────────────┐
              │  the booking server │  ← this is the "brain"
              │  (runs in the cloud)│     (Render.com, free)
              │  stores all data    │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  the database       │  ← where data lives
              │  (Supabase, free)   │     (safe & permanent)
              └─────────────────────┘
```

- The **server** is a small computer program (already written for you, in the `server/` folder).
  It runs 24/7 on a free website called **Render**.
- The **database** is where bookings are stored so nothing is ever lost. We use **Supabase**
  (free, made for exactly this).
- The **bot** is your helper on Telegram. It talks to the server, so Telegram and the website
  always see the same information.

Total cost: **$0**. Total time: about 30 minutes.

---

## STEP 1 — Create your Telegram bot (5 min, on your phone)

1. Open Telegram and search for **@BotFather** (the one with a blue check).
2. Send the message: `/newbot`
3. It asks for a name for your bot. Reply: `Hidden Homestay Booking`
4. It asks for a username. Reply something ending in `bot`, for example:
   `hidden_homestay_booking_bot`
5. BotFather replies with a **token** that looks like this:
   `7123456789:AAH8skxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   **Copy it and keep it secret** — this is your bot's key. You'll paste it in Step 2.

> ⚠️ Don't share the token with anyone. Anyone who has it can control your bot.

## STEP 2 — Put the website + server online (10 min, on a computer)

We use **GitHub** (stores your files) + **Render** (runs the server), both free.

1. Create a free account at **github.com**.
2. Click **+** (top right) → **New repository** → name it `hidden-homestay` → **Create repository**.
3. Click **uploading an existing file** (link in the middle of the page).
4. Drag the **entire contents of your `hidden-homestay` folder** into the browser window
   (index.html, package.json, server/, dev/, assets/… — everything except `server/data`).
   Then click **Commit changes**. Your files now live on GitHub.
5. Create a free account at **render.com** (choose “Sign up with GitHub” and allow it).
6. On your Render dashboard click **New +** → **Web Service** → select your `hidden-homestay`
   repository.
7. Fill in:
   - **Name**: `hidden-homestay`
   - **Region**: Singapore (closest to Cambodia)
   - **Runtime**: Node (Render usually detects it from `package.json`)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
8. Click **Add Environment Variable** and add **both**:
   - Key: `BOT_TOKEN`  → Value: *(paste your token from Step 1)*
   - Key: `ADMIN_KEY`  → Value: *(a password of your choice for the owner dashboard, e.g. `my-secret-2026`)*
9. Click **Create Web Service** and wait 2–3 minutes.

When it finishes, your website is live at something like
`https://hidden-homestay.onrender.com` — open it! In the booking flow, the summary panel now
shows a green **LIVE** badge.

10. Final touch: open Telegram, find your bot (`t.me/hidden_homestay_booking_bot`),
    press **START** and send `/start`. It replies:
    *"This chat is now linked as the owner."*
    From now on, every website booking arrives here with **✅ Confirm / ❌ Cancel** buttons.

> 💡 Test it: make a booking on the website with any name/number. Within seconds the request
> should appear in your Telegram chat.

## STEP 3 — Make the storage permanent (10 min)

By default the server keeps bookings in a small file. On the **free** Render plan that file is
wiped whenever the service restarts. To make bookings safe forever, connect a free database
(**Supabase**):

1. Create a free account at **supabase.com** (you can sign in with GitHub).
2. Click **New project**:
   - Name: `hidden-homestay`
   - Database password: choose one and save it somewhere
   - Region: Southeast Asia (Singapore)
   - Click **Create new project** and wait ~2 minutes.
3. In the left menu open **SQL Editor** → **New query**, paste the text below, click **Run**
   (it creates the two tables where bookings are kept):

```sql
create table bookings (
  ref        text primary key,
  source     text,
  branch     text,
  room       text,
  date       text,
  check_in   text,
  check_out  text,
  hours      numeric,
  rate       numeric,
  total      numeric,
  name       text,
  phone      text,
  contact    text,
  status     text default 'pending',
  created_at timestamptz default now()
);

create table kv (
  key   text primary key,
  value text
);

alter table bookings enable row level security;
alter table kv enable row level security;
```

4. Now copy your two keys: go to **Project Settings** (gear icon) → **API**:
   - **Project URL** — looks like `https://xxxxx.supabase.co` → this is `SUPABASE_URL`
   - **service_role** key (the long one, click to reveal) → this is `SUPABASE_KEY`
     (keep this one secret too)
5. Go back to **Render** → your service → **Environment** → **Add Environment Variable**, twice:
   - Key: `SUPABASE_URL` → Value: *(your Project URL)*
   - Key: `SUPABASE_KEY` → Value: *(your service_role key)*
   - **Save changes** (Render restarts the service automatically).
6. Check it worked: open `https://your-site.onrender.com/api/health` — it should say
   `"storage":"supabase"`.

Done — bookings are now stored in a real database and survive restarts. You can even see them
in Supabase → **Table Editor** → `bookings` (like an Excel sheet).

> 📊 **So, "where is my data stored?"** — In your own Supabase database (a free, professional
> cloud database). You can view or export it anytime, and you can connect it to Excel, Google
> Sheets or reporting tools later if you like.

## STEP 4 — Connect your KHQR payment (5 min)

The site already generates a KHQR with the **exact amount** of each booking (e.g. a 3-hour
booking = a QR for exactly that total). The receiving account is **already configured** for
ABA account **000 523 457** (Bakong ID `000523457@ABA`), so money goes straight there.

**One check before you go live (important):**

1. Scan the test QR (`khqr-scan-test.png`) — or any booking's QR on the site — with your
   own **ABA app** (or ACLEDA/Wing/any bank app).
2. The app must show the recipient as **HIDDEN HOMESTAY / your account** and the **exact
   amount**. You don't need to complete the payment — you're just checking the recipient.
3. ✅ If it matches: done, payments are live.
   ❌ If the app says *account not found* (or shows a different name): your bank uses a
   different Bakong ID for you. Open **ABA Mobile → My QR → Share/Copy** (a long text
   starting with `000201…`) and paste it into `index.html`:
   - On GitHub: open the file → click the ✏️ pencil → find `khqr: {` (the word `payload`)
     → paste your string between the two quotes → **Commit changes**. Render redeploys.
   - On your computer: open `index.html` with Notepad, search for `payload:` and paste
     between the quotes. Save, then upload to GitHub again.

> ℹ️ Guests can pay with **any** Cambodian bank app — KHQR is the national standard
> (ABA, ACLEDA, Wing, Bakong, TrueMoney…). Money always lands in your ABA account.
> On a phone, guests can also tap the big **Pay Now** button under the QR — it opens
> their banking app directly with the exact amount already filled in (same
> cinema-style checkout, powered by Bakong's official payment link).

## STEP 5 — Daily use (your cheat sheet)

The bot can do everything from your Telegram chat:

| You send | What happens |
|---|---|
| *(new website booking)* | You get an alert + ✅ Confirm / ❌ Cancel buttons |
| *(12:30 PM daily)* | **Today's guests in one text** — every day at 12:30 (Phnom Penh) the bot sends all of today's bookings in a single forwardable message for your staff. Same-day bookings still alert instantly. |
| `/list` | All bookings for today |
| `/list 2026-09-15` | All bookings for that date |
| `/busy` | Today's busy hours for every room |
| `/template` | 📋 Get the **copy-paste booking form** — fill it in (you or the guest) and paste it back; the booking is saved instantly and the website blocks those hours |
| `/book` | **Guided booking with buttons** — the bot asks branch → room → date → time → hours → phone → name, then shows a review with ✅ Confirm / ❌ Cancel. Works just like booking on the website. |
| `/book 1 2 2026-09-15 14:00 3 012345678 Sokha Pen` | Same, but all in one message — branch **1**=Cheasophara **2**=Peng Hout · room **1**=Burger **2**=Vintage **3**=Fishing · 2 PM · 3 hours |
| `/cancel` *(no code)* | Throw away a guided booking you started |
| `/confirm HH-ABC123` | Confirm a pending booking |
| `/cancel HH-ABC123` | Cancel — those hours become bookable again |
| `/help` | Show all commands |

**The sync you asked for:** the moment you `/book` something on Telegram, the server stores
it, so any guest checking those same hours on the website sees *"Not available"* instantly —
and the other way around. One shared calendar, two doors.

## The owner dashboard (see everything in one screen)

Next to Telegram, there's a **dashboard** — a private web page only you can open:

1. Go to `https://your-site.onrender.com/admin`
2. Type your `ADMIN_KEY` password (the one you set in Step 2).
3. There is also a **➕ New Booking** button — for bookings you take yourself in direct chat:
   pick branch, room, date, time, hours, guest name and phone, and it is saved instantly —
   the website blocks those hours immediately (no Telegram needed).
4. You see **every booking — website and Telegram together**, with stats on top
   (revenue, confirmed, pending), filters (date, branch, room, status, source),
   ✅ Confirm / ❌ Cancel buttons, a **Download CSV** button (opens in Excel), and the
   page refreshes itself every 15 seconds.

This is the easiest answer to *"how do I see all my data?"* — one page, both doors,
always up to date.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot never replies | Check `BOT_TOKEN` in Render → Environment (no spaces, full token). Then open the bot chat and send `/start` again. |
| No alerts when guests book | You must send `/start` to the bot **once** after deploying (that's how it links your chat). Check `/api/health` → `"ownerLinked": true`. |
| Website shows “Demo” badge | The site is in demo mode — it can't reach the server. Open the site using your Render URL (not a local file). |
| First page load is slow (~30–60 s) | Normal on Render's free plan (it sleeps when idle). A paid plan or any small VPS removes this. |
| KHQR scan shows wrong person | The `payload` in `index.html` isn't yours — re-copy your QR text from your bank app (must start with `000201`). |
| `"storage":"json-file"` in /api/health | Supabase not connected yet — redo Step 3.5 (URL + key in Render). |

## Local testing (optional, for developers)

```bash
npm start                 # site + API at http://localhost:8080 (demo storage)
BOT_TOKEN=xxx npm start   # with the real Telegram bot connected
node dev/test-server.js   # run the automated server/bot tests
python3 dev/build.py      # rebuild index.html after editing dev/ sources
```

## Custom domain — hidden-homestay.com (no "onrender.com" in the name)

The domain `hidden-homestay.com` is currently **unregistered** — anyone can buy it (~$10-12/year).

1. **Buy the domain** (Namecheap, Cloudflare, GoDaddy…). Example at Namecheap: search `hidden-homestay.com` → add to cart → checkout.
2. **Render Dashboard** → your `hidden-homestay` service → **Settings** → **Custom Domains** → **Add Custom Domain** → type `hidden-homestay.com`.
3. Render shows you DNS records (an **A record** for the root + a **CNAME** for `www`). Copy the exact values it shows.
4. In your domain registrar → **DNS / Advanced DNS** → add those records exactly as Render displays them.
5. Wait (5-30 min). Render issues a **free HTTPS certificate** automatically — no action needed.
6. On Render → **Environment** → change `PUBLIC_URL` to `https://hidden-homestay.com` and save. (This makes the Telegram confirmation photos use the new name.)
7. Open `https://hidden-homestay.com` — done. Custom domains + TLS are free on Render's free plan.

## Keep the site awake 24/7 (no sleeping)

Render's free plan sleeps a service after **15 minutes** with no visitors, and waking up takes ~1 minute.
This server now keeps itself awake automatically:

- Since **v2.7.1**, on Render it pings its own `/api/health` every 10 minutes (check the logs for `[keep-awake]` lines). No setup needed — just deploy this build.
- 24/7 uptime uses ~720-744 of the 750 free monthly hours, so it fits the free plan.
- Optional extra safety: create a free monitor at uptimerobot.com that pings `https://hidden-homestay.com/api/health` every 5 minutes — you also get an email if the site ever goes down.
- The never-sleeps alternative: Render **Starter** plan ($7/month) — no pinger needed at all.

> ⚠️ Storage warning: if the Render log line says `storage: JSON file`, bookings are stored inside the container and Render free restarts wipe them. Ask me and I'll switch you to the built-in Supabase cloud-storage mode (also free).

## v3.20 — owner-first: forward room info + food menu to the customer (NO new SQL)

Nothing to do in Supabase. Push the new code, done.

The final flow, for bookings from the **website and Telegram**:

1. Guest books → the booking alert arrives in **your** bot chat first (unchanged).
2. You confirm (✅ button, dashboard, `/confirm`, `/book`) → **you receive ONE package** in your bot chat:
   - the booking details text, ending with **how to send the information to the customer**,
   - **one picture album** with everything: room photo + entry guideline + parking guide + **the 5 food menu pictures**.
3. Send it to the customer your way — either:
   - **forward the album + text** to them directly (one forward = room info + food menu), or
   - **send them the customer link** (it is printed in the package text and also available via `/link HH-XXXXXX`) — they tap it and the bot shows them the full confirmation with the same pictures.
4. The customer can also open that link themselves from the website success screen (**Open Telegram** button) — same full information.

The owner package always lands in **your** chat first — nothing goes to the customer unless you forward it or they open the link.

After pushing, check the Render log for: `BUILD v2.12.0 (12 updates)`.

## v3.19 — customer receives the room info + food menu pictures after confirmation (NO new SQL)

Nothing to do in Supabase. Push the new code, done.

- When the owner **confirms** a booking (from Telegram ✅ button, the dashboard, `/confirm` or `/book`), the **customer** now receives in Telegram:
  1. The confirmation text (ref, room, date, time, total, address) — now also pointing to the pictures below,
  2. **Room information pictures** — room photo, entry guideline (room number on it), parking guide,
  3. **Food menu pictures** — all 5 menu photos.
- Works the same for website bookings and Telegram bookings.
- Pending bookings still get text only — everything unlocks when the owner confirms.
- The owner still receives their own alert + full package, unchanged.

After pushing, check the Render log for: `BUILD v2.11.0 (11 updates)`.

## v3.18 — food menu pictures in the bot + 3-step booking (NO new SQL)

Nothing to do in Supabase — the columns from v3.17 already cover everything. Deploy = push the new code, that's all.

What changed:

1. **After the owner confirms a booking, the customer gets the full information in Telegram** — the confirmation text plus:
   - **Room information pictures**: the room photo, the entry guideline (with the room number) and the parking guide.
   - **Food menu pictures**: all 5 menu photos with prices.
   - This works for every confirm path (website bookings, Telegram template bookings, the owner's ✅ button, the dashboard, `/confirm`, `/book`).
   - Pending bookings still get text only — the pictures unlock when the owner confirms. The owner still gets their own copy of everything.
2. **Food menu in the bot (public)**:
   - `/menu` in the bot → the 5 menu photos with prices.
   - The bot welcome message has a **🍜 Food menu** button.
   - `t.me/HiddenHomestayBot?start=menu` opens the menu directly.
3. **The website food-order form is gone.** Instead, the room step of the booking wizard has a small **Food menu** card that links to the bot (`t.me/HiddenHomestayBot?start=menu`). Food orders happen by phone / Telegram, not on the website.
4. **The booking wizard is 3 steps now** (was 4): Schedule → Room → **Your details & confirm**. The old "Next" button between the details form and the review is removed — the guest fills in name/email/phone, sees the receipt + house rules on the same screen, ticks the agree box and taps **Submit Booking Request**. Overnight bookings still need the ID photo on this screen.
5. Dashboard, Telegram messages and old bookings with food orders are unchanged — the owner's own alerts and confirmation flow are exactly the same.

After pushing, check the Render log for: `BUILD v2.11.0 (11 updates)`.

## v3.17 — owner-confirmed bookings + food menu: ONE required SQL step

Customers submit a booking request (name + **email** + phone + optional **food order**), the owner confirms it from the dashboard or Telegram, and the bot sends the room access information **to the owner only**.

Before deploying, run this **once** in Supabase so the new columns exist:

1. Go to `https://supabase.com` → your project → **SQL Editor** → **New query**.
2. Paste exactly this and click **Run**:

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS food jsonb DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS food_notes text DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS food_subtotal numeric DEFAULT 0;
```

3. You should see `Success. No rows returned`.

If you skip this step the site still works (the server detects missing columns and saves the booking without email/food details), but customer emails and food orders will not be stored in the cloud — so run it.

## v3.17 — Telegram room information + food menu (what changed)

- Every confirmed booking now sends the owner a **room information package** in Telegram (customer + phone + email, room + number, date, check-in/out, duration, price, food order, address, entry guideline + parking guide pictures). The owner forwards it to the customer manually.
- This happens for **all** confirm paths: the owner's ✅ Confirm Booking button, the dashboard, `/confirm`, `/book`, the guided button flow and owner template pastes.
- `/resend HH-XXXXXX` re-sends the package if a message or picture failed to arrive.
- The website booking form has a **Food Order** section (menu read from the homestay's menu photos). Food subtotal is added to the final total; the dashboard and all Telegram messages show the food details.
