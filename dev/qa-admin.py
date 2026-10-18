#!/usr/bin/env python3
"""Local E2E: admin dashboard Confirm Booking button (owner-confirmed bookings)."""
import datetime, json, os, subprocess, sys, time, urllib.request, shutil
from playwright.sync_api import sync_playwright

ROOT = '/home/user/hidden-homestay'
PORT = 8123
BASE = f'http://127.0.0.1:{PORT}'
KEY = 'test-key-123'
DATA = '/tmp/adm-e2e'

def next_dow(dow):
    d = datetime.date.today() + datetime.timedelta(days=3)
    while d.weekday() != dow: d += datetime.timedelta(days=1)
    return d.isoformat()
A_WEEKDAY = next_dow(2)

def req(method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method,
        headers={'Content-Type': 'application/json'} if body else {},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())

passed, failed = [], []
def check(name, cond, extra=''):
    (passed if cond else failed).append(name)
    print(('  PASS  ' if cond else '  FAIL  ') + name + (f'   -> {extra}' if extra and not cond else ''))

shutil.rmtree(DATA, ignore_errors=True)
env = dict(os.environ, PORT=str(PORT), DATA_DIR=DATA, BOT_TOKEN='test-disabled', ADMIN_KEY=KEY)
srv = subprocess.Popen(['node', 'server/server.js'], cwd=ROOT, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        try:
            s, j = req('GET', '/api/health')
            if s == 200: break
        except Exception: time.sleep(0.3)
    # 1. customer submits a booking request (pending)
    s, p1 = req('POST', '/api/bookings', {'room': 'vintage', 'date': A_WEEKDAY, 'checkIn': '14:00', 'hours': 3, 'name': 'Dash E2E', 'phone': '012345678', 'email': 'dash.e2e@example.com',
                                           'foodOrder': {'items': [{'id': 'gyoza', 'qty': 2}, {'id': 'water', 'qty': 1}], 'notes': 'extra spicy'}})
    check('customer request saved as pending', s == 200 and p1.get('status') == 'pending', p1)
    got = [b for b in req('GET', f'/api/bookings?key={KEY}')[1].get('bookings', []) if b['ref'] == p1['ref']][0]
    check('food order stored with server prices (2x gyoza + 1x water = $7.50)', got.get('foodSubtotal') == 7.5 and len(got.get('food', [])) == 2 and got.get('foodNotes') == 'extra spicy', got)
    # second pending (for the stale-tab conflict test)
    s, p2 = req('POST', '/api/bookings', {'room': 'classic', 'date': A_WEEKDAY, 'checkIn': '10:00', 'hours': 2, 'name': 'Stale Tab', 'phone': '099887766', 'email': 'stale@example.com'})
    ref2 = p2['ref']

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        page.goto(BASE + '/admin')
        page.wait_for_timeout(600)
        # key gate
        page.fill('#keyInput', KEY)
        page.click('#unlockBtn')
        page.wait_for_timeout(900)
        row = page.locator(f'#rows tr:has-text("{p1["ref"]}")')
        check('dashboard lists the booking', row.count() == 1, row.count())
        check('status pill shows Pending Confirmation', 'PENDING CONFIRMATION' in row.inner_text().upper(), row.inner_text()[:120])
        check('email column shows the customer email', 'dash.e2e@example.com' in row.inner_text(), row.inner_text()[:160])
        food_cell = row.locator('td').nth(6)
        check('food column shows $7.50 + item count', '$7.50' in food_cell.inner_text() and '2' in food_cell.inner_text(), food_cell.inner_text())
        tip = food_cell.locator('.food-n').get_attribute('title') or ''
        check('food tooltip lists items + notes + combined total', 'Fried Gyoza' in tip and 'extra spicy' in tip and 'Total (room + food): $19.50' in tip, tip)
        btn = row.locator('button[data-act="confirmed"]')
        check('button reads "✓ Confirm Booking"', 'Confirm Booking' in btn.inner_text(), btn.inner_text())
        # 2. owner confirms from the dashboard
        btn.click()
        page.wait_for_timeout(1200)
        row = page.locator(f'#rows tr:has-text("{p1["ref"]}")')
        check('pill flips to Confirmed immediately', 'CONFIRMED' in row.inner_text().upper() and 'PENDING CONFIRMATION' not in row.inner_text().upper(), row.inner_text()[:120])
        check('confirm button gone after confirming', row.locator('button[data-act="confirmed"]').count() == 0)
        check('toast shows ✓ Confirmed', 'Confirmed' in (page.locator('#toast').inner_text() if page.locator('#toast').count() else ''), '')
        # 3. stale tab: P2 gets confirmed elsewhere, then the stale dashboard button is clicked -> 409 surfaces
        row2 = page.locator(f'#rows tr:has-text("{ref2}")')
        stale_btn = row2.locator('button[data-act="confirmed"]')
        s, _ = req('PATCH', f'/api/bookings?key={KEY}&ref={ref2}', {'status': 'confirmed'})   # confirmed from Telegram/other device
        check('other device confirmed P2 first', s == 200, s)
        stale_btn.click()                                                                     # stale tab still shows the button
        page.wait_for_timeout(1200)
        toast = page.locator('#toast').inner_text() if page.locator('#toast').count() else ''
        check('stale confirm -> server warning toast (already confirmed)', 'already confirmed' in toast, toast)
        # 4. cancel via UI still works
        row2 = page.locator(f'#rows tr:has-text("{ref2}")')
        row2.locator('button[data-act="cancelled"]').click()
        page.wait_for_timeout(1200)
        row2 = page.locator(f'#rows tr:has-text("{ref2}")')
        check('cancel via dashboard works', 'CANCELLED' in row2.inner_text().upper(), row2.inner_text()[:120])
        page.screenshot(path='/home/user/qa-shots/06-admin-confirm.png')
        b.close()

    # 5. after dashboard confirm, the booking blocks the slot on the website (1h cleaning)
    s, j = req('GET', f'/api/availability?date={A_WEEKDAY}&checkIn=17:00&hours=2')
    check('confirmed booking blocks overlapping website slots', any(b['room'] == 'vintage' for b in j.get('busy', [])), j)
    s, j = req('GET', f'/api/availability?date={A_WEEKDAY}&checkIn=18:00&hours=2')
    check('cleaning gap respected after confirm (18:00 free of vintage)', not any(b['room'] == 'vintage' for b in j.get('busy', [])), j)
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()

print(f'\nRESULT: {len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
