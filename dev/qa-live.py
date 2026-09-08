#!/usr/bin/env python3
"""Live-mode E2E: site served by the booking server, real availability checks, Telegram-sync test."""
import datetime
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8147
BASE = f'http://127.0.0.1:{PORT}'

passed, failed = [], []
def check(name, cond, extra=''):
    (passed if cond else failed).append(name)
    print(('  PASS  ' if cond else '  FAIL  ') + name + (f'   -> {extra}' if extra and not cond else ''))

def api(path, method='GET', body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def main():
    data_dir = tempfile.mkdtemp(prefix='hh-live-')
    env = dict(os.environ, PORT=str(PORT), DATA_DIR=data_dir, BOT_TOKEN='test-off')
    server = subprocess.Popen(['node', 'server/server.js'], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                h = api('/api/health')
                if h.get('ok'):
                    break
            except Exception:
                time.sleep(0.25)
        else:
            raise SystemExit('server did not start')

        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 960})
            errors = []
            page.on('console', lambda m: errors.append(m.text) if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
            page.on('pageerror', lambda e: errors.append(str(e)))

            print('== LIVE MODE DETECTED ==')
            page.goto(BASE + '/', wait_until='load')
            page.wait_for_timeout(1200)
            check('no console errors', not errors, '; '.join(errors[:3]))

            # open booking, pick branch 2 + burger
            page.locator('#navLinks [data-book]').click()
            page.wait_for_timeout(400)
            page.locator('#pickBranches .pick-card').nth(1).click()
            page.locator('#actNext').click(); page.wait_for_timeout(300)
            page.locator('#pickRooms .pick-card[data-room-id="burger"]').click()
            page.locator('#actNext').click(); page.wait_for_timeout(400)

            check('mode badge shows LIVE', page.locator('#modeBadge').inner_text().lower() == 'live',
                  page.locator('#modeBadge').inner_text())
            page.fill('#bkDate', tomorrow)
            page.fill('#bkIn', '14:00')
            page.locator('#hourChips button[data-hours="3"]').click()
            page.wait_for_timeout(900)
            status_html = page.locator('#availStatus').inner_html()
            check('status: Available — real time', 'Available' in status_html and 'real time' in status_html, status_html[:120])
            check('review enabled when free', not page.locator('#actNext').is_disabled())
            page.screenshot(path='/home/user/qa-shots/13-live-step3.png')

            print('== CONFIRM BOOKING (POST to server) ==')
            page.locator('#actNext').click(); page.wait_for_timeout(400)
            page.fill('#bkName', 'Live Guest')
            page.fill('#bkPhone', '011 222 333')
            page.locator('.agree').click()
            page.wait_for_timeout(600)
            check('KHQR opens with $18.00 (burger 3h)', page.locator('#payAmount').inner_text() == '$18.00',
                  page.locator('#payAmount').inner_text())
            page.locator('#actConfirm').click()
            page.wait_for_timeout(900)
            check('success pane reached', page.locator('.pane[data-pane="5"]').evaluate("el=>el.classList.contains('active')"))
            server_list = api('/api/bookings')['bookings']
            ours = [b for b in server_list if b['name'] == 'Live Guest']
            check('booking stored on server, pending, ref assigned', len(ours) == 1 and ours[0]['status'] == 'pending' and ours[0]['source'] == 'website' and ours[0]['total'] == 18.0, ours)
            site_ref = ours[0]['ref'] if ours else None
            check('success slip shows server ref', site_ref and site_ref in page.locator('#successReceipt').inner_text())
            check('success note says team notified', 'Telegram' in page.locator('#successModeNote').inner_text())

            print('== TELEGRAM-BOOKED SLOT BLOCKS WEBSITE ==')
            # simulate an owner booking taken on Telegram: 18:00-20:00 same room/branch/date
            api('/api/bookings', 'POST', {
                'branch': 'penghout', 'room': 'burger', 'date': tomorrow,
                'checkIn': '18:00', 'checkOut': '20:00', 'name': 'Telegram Walk-in', 'phone': '099'
            })
            page.locator('#actReset').click()  # book another stay
            page.wait_for_timeout(400)
            page.locator('#pickBranches .pick-card').nth(1).click()
            page.locator('#actNext').click(); page.wait_for_timeout(300)
            page.locator('#pickRooms .pick-card[data-room-id="burger"]').click()
            page.locator('#actNext').click(); page.wait_for_timeout(400)
            page.fill('#bkDate', tomorrow)
            page.fill('#bkIn', '19:00')
            page.locator('#hourChips button[data-hours="2"]').click()  # 19:00-21:00 overlaps 18-20
            page.wait_for_timeout(900)
            busy_html = page.locator('#availStatus').inner_html()
            check('overlapping hours blocked', 'Not available' in busy_html and '6:00 PM' in busy_html, busy_html[:160])
            check('review disabled while busy', page.locator('#actNext').is_disabled())
            page.screenshot(path='/home/user/qa-shots/14-live-conflict.png')
            # adjacent slot 20:00-22:00 should be free (18-20 ends exactly at 20:00)
            page.fill('#bkIn', '20:00')
            page.locator('#hourChips button[data-hours="2"]').click()
            page.wait_for_timeout(900)
            free_html = page.locator('#availStatus').inner_html()
            check('adjacent slot available again', 'Available' in free_html, free_html[:160])
            check('review re-enabled', not page.locator('#actNext').is_disabled())

            print('== 409 RACE PROTECTION ==')
            # occupy the slot via API while the guest sits on step 4
            page.locator('#actNext').click(); page.wait_for_timeout(400)
            api('/api/bookings', 'POST', {
                'branch': 'penghout', 'room': 'burger', 'date': tomorrow,
                'checkIn': '20:00', 'checkOut': '22:00', 'name': 'Faster Person', 'phone': '088'
            })
            page.fill('#bkName', 'Slow Guest')
            page.fill('#bkPhone', '077')
            page.locator('.agree').click()
            page.wait_for_timeout(600)
            page.locator('#actConfirm').click()
            page.wait_for_timeout(900)
            check('409 sends guest back to schedule with warning',
                  page.locator('.pane[data-pane="3"]').evaluate("el=>el.classList.contains('active')") and
                  'Not available' in page.locator('#availStatus').inner_html())
            server_list = api('/api/bookings')['bookings']
            check('slow guest NOT stored', not any(b['name'] == 'Slow Guest' for b in server_list))

            check('no console errors at end', not errors, '; '.join(errors[:3]))
            browser.close()
    finally:
        server.terminate()
        shutil.rmtree(data_dir, ignore_errors=True)

    print('\n===========================')
    print(f'RESULT: {len(passed)} passed, {len(failed)} failed')
    if failed:
        print('FAILED:')
        for f in failed:
            print('  - ' + f)
        sys.exit(1)

if __name__ == '__main__':
    main()
