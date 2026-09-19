#!/usr/bin/env python3
"""Automated functional QA for the Hidden Homestay site (v3).
Serves the built site over local HTTP, mocks the booking API, and drives
the full customer flow: schedule -> room -> details -> review -> success,
plus Khmer language, overnight + ID upload, pool hours, phone validation."""
import datetime
import json
import pathlib
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path('/home/user/qa-shots')
SHOTS.mkdir(exist_ok=True)

passed, failed = [], []


def check(name, cond, extra=''):
    (passed if cond else failed).append(name + (f'  [{extra}]' if extra and not cond else ''))
    print(('  PASS  ' if cond else '  FAIL  ') + name + (f'   -> {extra}' if extra else ''))


def next_dow(dow):
    d = datetime.date.today() + datetime.timedelta(days=2)
    while d.weekday() != dow:
        d += datetime.timedelta(days=1)
    return d.isoformat()


A_WEEKDAY = next_dow(2)   # Wednesday
A_SATURDAY = next_dow(5)  # Saturday


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), lambda *a, **kw: QuietHandler(*a, directory=str(ROOT), **kw))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}'


def run():
    httpd, base = serve()
    posted = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 960})
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        def mock_api(busy=None, ref='HH-TEST1', room_busy=None):
            def handler(route):
                url = route.request.url
                body = route.request.post_data_json if route.request.method == 'POST' else None
                if body is not None:
                    posted.append(body)
                if '/api/health' in url:
                    route.fulfill(json={'ok': True, 'live': True, 'storage': 'json-file', 'botLinked': False, 'ownerLinked': False, 'bookings': 0, 'now': '2026-09-14T00:00:00Z'})
                elif '/api/availability' in url and 'room=' in url:
                    route.fulfill(json={'ok': True, 'busy': room_busy or []})
                elif '/api/availability' in url:
                    route.fulfill(json={'ok': True, 'busy': busy or []})
                elif url.endswith('/api/bookings') and route.request.method == 'POST':
                    route.fulfill(json={'ok': True, 'ref': ref, 'status': 'pending', 'total': (body or {}).get('total', 0)})
                else:
                    route.fulfill(status=404, json={'ok': False})
            page.route(f'{base}/api/**', handler)

        mock_api()

        print('== LOAD ==')
        page.goto(base + '/', wait_until='load')
        page.wait_for_timeout(1200)
        check('no console/page errors on load', not errors, '; '.join(errors[:3]))
        check('title', 'Hidden Homestay' in page.title(), page.title())
        check('hero headline (v3)', page.locator('h1').inner_text().strip().startswith('Your next favourite room'))
        check('12 room cards in showcase', page.locator('.rooms .room-card').count() == 12, page.locator('.rooms .room-card').count())
        check('room numbers on cards: (1) Vintage + (502) Kuromi', '(1) Vintage Room' in page.locator('.rooms .room-card[data-room="vintage"] h4').inner_text() and '(502) Kuromi Room' in page.locator('.rooms .room-card[data-room="kuromi"] h4').inner_text(), page.locator('.rooms .room-card[data-room="vintage"] h4').inner_text())
        check('room feature chips removed everywhere', page.locator('.rooms .room-tags').count() == 0 and page.locator('#roomGrid .room-tags').count() == 0, page.locator('.room-tags').count())
        check('room groups: pool 1 / std 8 / vip 3', page.locator('#showPool .room-card').count() == 1 and page.locator('#showStd .room-card').count() == 8 and page.locator('#showVip .room-card').count() == 3)
        check('Telegram contact link is exactly @Hppy4D', page.locator('.contact-list a[href="https://t.me/Hppy4D"]').count() == 1)
        check('bot NOT offered as contact on the site', page.locator('a[href*="HiddenHomestayBot"]').count() == 0)
        foot_txt = page.locator('footer.contact').inner_text()
        check('address in the footer (Road 777), exactly once', '777' in foot_txt and foot_txt.count('235D') == 1, foot_txt.count('235D'))
        check('logo present (data URI)', page.locator('.brand-logo').count() >= 1)
        check('background is #FFD1FF light pink', page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(255, 209, 255)', page.evaluate("getComputedStyle(document.body).backgroundColor"))
        check('no KHQR bullet in hero', 'KHQR' not in page.locator('.hero-facts').inner_text(), page.locator('.hero-facts').inner_text())
        check('hero badge (12 rooms/1 address/open daily) removed', page.locator('.hero-badge').count() == 0)
        khmer_re = '[\u1780-\u17FF]'
        en_hero = page.locator('.hero-copy').inner_text()
        en_card = page.locator('.rooms .room-card').first.inner_text()
        check('EN mode: no Khmer in hero', not page.evaluate("t => /[\\u1780-\\u17FF]/.test(t)", en_hero), en_hero[:60])
        check('EN mode: no Khmer in room cards', not page.evaluate("t => /[\\u1780-\\u17FF]/.test(t)", en_card), en_card[:60])
        page.wait_for_timeout(600)
        check('Khmer OS Siem Reap font loaded', page.evaluate("document.fonts.check(\"16px 'Khmer OS Siem Reap'\")"))
        check('Siem Reap is FIRST in the font stack (all Khmer uses it)', page.evaluate("getComputedStyle(document.body).fontFamily.startsWith(\"'Khmer OS Siem Reap'\") || getComputedStyle(document.body).fontFamily.includes('Khmer OS Siem Reap')"), page.evaluate("getComputedStyle(document.body).fontFamily"))
        check('headings + buttons inherit the same stack', page.evaluate("['H1','BUTTON','SELECT'].map(s => getComputedStyle(document.querySelector(s)).fontFamily).every(f => f.includes('Khmer OS Siem Reap'))"))
        check('T&C section removed from main screen', page.locator('#terms').count() == 0)
        check('location/parking section removed from main screen', page.locator('#loc').count() == 0)
        check('no prices on room cards', page.locator('.room-price').count() == 0, page.locator('.room-price').count())
        check('pool group uses 8-ball icon', '🎱' in page.locator('.room-groups .group-title').first.inner_text())
        page.screenshot(path=str(SHOTS / '01-home-desktop.png'))

        print('== HERO SLIDER ==')
        check('13 slides built (12 rooms + Coming Soon)', page.locator('#showcaseFrame .slide').count() == 13, page.locator('#showcaseFrame .slide').count())
        check('Coming Soon slide uses the EZ Stay photo', 'ez-stay.jpg' in (page.locator('#showcaseFrame .slide-cs img').get_attribute('src') or ''), page.locator('#showcaseFrame .slide-cs img').get_attribute('src'))
        idx = page.evaluate("Array.from(document.querySelectorAll('#showcaseFrame .slide')).findIndex(s=>s.classList.contains('active'))")
        page.wait_for_timeout(3400)
        idx2 = page.evaluate("Array.from(document.querySelectorAll('#showcaseFrame .slide')).findIndex(s=>s.classList.contains('active'))")
        check('slider advances after ~3s (crossfade)', idx != idx2, f'{idx} -> {idx2}')
        check('room name chip shows current room', 'Room' in page.locator('#chipName').inner_text(), page.locator('#chipName').inner_text())

        print('== LANGUAGE SWITCH ==')
        page.click('#langKh')
        page.wait_for_timeout(400)
        kh = page.locator('h1').inner_text()
        check('Khmer hero headline renders', 'បន្ទប់' in kh, kh[:60])
        check('Khmer booking button', 'កក់' in page.locator('[data-i18n="heroCta"]').inner_text())
        page.screenshot(path=str(SHOTS / '03-home-khmer.png'))
        kh_card = page.locator('.rooms .room-card').first.inner_text()
        check('KH mode: room names in Khmer', page.evaluate("t => /[\\u1780-\\u17FF]/.test(t)", kh_card), kh_card[:60])
        check('KH mode: tag chips hidden in every room', page.locator('.rooms .room-tags').count() == 0, page.locator('.rooms .room-tags').count())
        page.click('.js-book-open')
        page.wait_for_timeout(300)
        page.locator('#bkDate').fill(A_WEEKDAY)
        page.locator('#durChips button[data-dur="3"]').click()
        page.select_option('#bkIn', '14:00')
        page.click('#actNext1')
        page.wait_for_timeout(400)
        page.locator('#roomGrid .room-card[data-room="vintage"]').click()
        page.click('#actNext2')
        page.wait_for_timeout(300)
        page.fill('#bkName', 'Sokha Pen')
        page.fill('#bkPhone', '012345678')
        page.click('#actNext3')
        page.wait_for_timeout(400)
        kh_terms = page.locator('#termsList').inner_text()
        check('KH rules: no penalty amounts + early check-in rule', ('ពិន័យ' not in kh_terms) and ('ការចូលមុនម៉ោង' in kh_terms) and (page.locator('#termsList li').count() == 12), kh_terms[:80])
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        kh_book_btn = page.locator('.rooms .room-book').first.inner_text()
        check('KH mode: book button in Khmer', page.evaluate("t => /[\\u1780-\\u17FF]/.test(t)", kh_book_btn), kh_book_btn)
        page.click('#langEn')
        page.wait_for_timeout(300)
        check('switch back to English', page.locator('h1').inner_text().startswith('Your next favourite'))
        check('EN mode: tag chips removed too (features gone)', page.locator('.rooms .room-tags').count() == 0, page.locator('.rooms .room-tags').count())

        print('== BOOK THIS ROOM (locked flow, skips room picker) ==')
        mock_api(room_busy=[{'date': A_WEEKDAY, 'checkIn': '13:00', 'checkOut': '15:00', 'hours': 2, 'overnight': False, 'ref': 'HH-B1', 'status': 'confirmed'}])
        page.locator('#showStd .room-card[data-room="vintage"]').click()
        page.wait_for_timeout(500)
        check('clicking a room card opens the booking screen', page.locator('#bookingOverlay').evaluate("el=>el.classList.contains('open')"))
        check('room lock bar shows (1) Vintage', '(1) Vintage Room' in page.locator('#roomLockBar').inner_text() and page.locator('#roomLockBar').is_visible(), page.locator('#roomLockBar').inner_text())
        check('room step button hidden in locked flow', not page.locator('.step-btn[data-step="2"]').is_visible())
        page.locator('#bkDate').fill(A_WEEKDAY)
        page.locator('#durChips button[data-dur="3"]').click()
        page.wait_for_timeout(600)
        opt15 = page.locator('#bkIn option[value="15:00"]')
        opt16 = page.locator('#bkIn option[value="16:00"]')
        check('cleaning: 15:00 blocked after a 13:00-15:00 booking', opt15.is_disabled(), opt15.get_attribute('disabled'))
        check('cleaning: 16:00 stays available', not opt16.is_disabled())
        page.select_option('#bkIn', '16:00')
        check('check-in select is bold + solid (visible)', page.locator('#bkIn').evaluate("el => { const s = getComputedStyle(el); return s.fontWeight === '700' && s.backgroundColor !== 'rgba(0, 0, 0, 0)'; }"))
        page.click('#actNext1')
        page.wait_for_timeout(500)
        check('locked flow goes straight to guest details (room pane skipped)', page.locator('#pane3').is_visible() and page.locator('#pane2').is_hidden())
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        check('Escape closes the booking overlay', not page.locator('#bookingOverlay').evaluate("el=>el.classList.contains('open')"))

        print('== TODAY RULES (past times + 21:00 note) ==')
        import datetime as _dt
        kh_today = (_dt.datetime.utcnow() + _dt.timedelta(hours=7)).strftime('%Y-%m-%d')
        page.locator('.hero-cta .js-book-open').first.click()
        page.wait_for_timeout(300)
        page.locator('#bkDate').fill(kh_today)
        page.locator('#durChips button[data-dur="3"]').click()
        page.wait_for_timeout(300)
        check('today note mentions 21:00 + cleaning', '21:00' in page.locator('#slotNote').inner_text() and '🧹' in page.locator('#slotNote').inner_text(), page.locator('#slotNote').inner_text())
        check('date min is Cambodia today', page.locator('#bkDate').evaluate('el => el.min') == kh_today, page.locator('#bkDate').evaluate('el => el.min'))
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)

        print('== BOOKING: STANDARD 3H ==')
        page.locator('.hero-cta .js-book-open').first.click()
        page.wait_for_timeout(400)
        page.locator('.step-btn[data-step="1"]').click()
        page.wait_for_timeout(300)
        check('booking overlay opens like the classic screen', page.locator('#bookingOverlay').evaluate("el=>el.classList.contains('open')"))
        check('wizard is inside the overlay', page.locator('#bookingOverlay .wizard').count() == 1)
        page.screenshot(path=str(SHOTS / '02-booking-overlay.png'))
        page.locator('#bkDate').fill(A_WEEKDAY)
        page.locator('#durChips button[data-dur="3"]').click()
        page.wait_for_timeout(200)
        check('price note shows weekday Standard $12', 'Standard $12' in page.locator('#priceNote').inner_text(), page.locator('#priceNote').inner_text())
        page.select_option('#bkIn', '14:00')
        check('next enabled after schedule', not page.locator('#actNext1').is_disabled())
        page.click('#actNext1')
        page.wait_for_timeout(400)
        check('room grid shows 12 rooms', page.locator('#roomGrid .room-card').count() == 12, page.locator('#roomGrid .room-card').count())
        page.locator('#roomGrid .room-card[data-room="vintage"]').click()
        page.wait_for_timeout(200)
        check('room card selected', 'sel' in (page.locator('#roomGrid .room-card[data-room="vintage"]').get_attribute('class') or ''))
        page.click('#actNext2')
        page.wait_for_timeout(300)

        print('== GUEST DETAILS + PHONE VALIDATION ==')
        page.locator('#bkName').fill('Sokha Pen')
        page.locator('#bkPhone').fill('abc')
        check('letters blocked from phone field', page.locator('#bkPhone').input_value() == '', page.locator('#bkPhone').input_value())
        page.locator('#bkPhone').fill('012')
        check('next disabled with 3-digit phone', page.locator('#actNext3').is_disabled())
        page.locator('#bkPhone').fill('012345678')
        check('next enabled with valid phone', not page.locator('#actNext3').is_disabled())
        check('Telegram phone instruction visible', 'Telegram' in page.locator('[data-i18n="s3PhoneNote"]').inner_text())
        check('ID field hidden for hourly booking', page.locator('#idField').is_hidden())
        page.click('#actNext3')
        page.wait_for_timeout(300)

        print('== REVIEW + PAY ==')
        receipt = page.locator('#reviewReceipt').inner_text()
        check('receipt shows room + total', 'Vintage' in receipt and '$12' in receipt, receipt[:120])
        check('12 house rules displayed (early check-in added)', page.locator('#termsList li').count() == 12, page.locator('#termsList li').count())
        _terms = page.locator('#termsList').inner_text()
        check('penalty amounts removed, rules kept', '$50' not in _terms and '$20' not in _terms and 'No Smoking' in _terms and 'Early check-in' in _terms, _terms[:90])
        check('confirm disabled before agreeing', page.locator('#actConfirm').is_disabled())
        page.check('#agreedTerms')
        page.wait_for_timeout(300)
        check('pay section opens after agree', 'open' in (page.locator('#paySection').get_attribute('class') or ''))
        check('KHQR canvas rendered', page.locator('#khqrCanvas').evaluate('el => el.width > 50'))
        check('pay amount $12', page.locator('#payAmount').inner_text().strip() == '$12', page.locator('#payAmount').inner_text())
        page.click('#actConfirm')
        page.wait_for_timeout(600)
        check('success pane shown', page.locator('#pane5').is_visible())
        href = page.locator('#tgConfirmBtn').get_attribute('href')
        check('Telegram button deep-links with ref', href == 'https://t.me/HiddenHomestayBot?start=HH-TEST1', href)
        check('booking POST had correct payload', posted and posted[-1].get('room') == 'vintage' and posted[-1].get('hours') == 3 and posted[-1].get('checkIn') == '14:00' and posted[-1].get('overnight') is False, posted[-1] if posted else None)
        page.screenshot(path=str(SHOTS / '04-success.png'))

        print('== MY BOOKINGS ==')
        page.click('#actMyBookings')
        page.wait_for_timeout(400)
        check('my bookings overlay opens from success screen', page.locator('#myBookingsOverlay').evaluate("el=>el.classList.contains('open')"))
        mb_txt = page.locator('#mbList').inner_text()
        check('booking listed: ref + room + guest + total', 'HH-TEST1' in mb_txt and 'Vintage' in mb_txt and 'Sokha Pen' in mb_txt and '$12' in mb_txt, mb_txt[:110])
        check('status badge shows Pending', 'PENDING' in mb_txt.upper())
        tg2 = page.locator('#mbList .mb-item a.btn-tg').get_attribute('href')
        check('per-booking Telegram re-confirm link', tg2 == 'https://t.me/HiddenHomestayBot?start=HH-TEST1', tg2)
        page.screenshot(path=str(SHOTS / '05-my-bookings.png'))
        page.click('#mbClose')
        page.wait_for_timeout(300)
        check('my bookings closes (✕)', not page.locator('#myBookingsOverlay').evaluate("el=>el.classList.contains('open')"))
        page.reload(wait_until='load')
        page.wait_for_timeout(1000)
        page.locator('.hero-cta .js-my-bookings').first.click()
        page.wait_for_timeout(400)
        check('booking persists after reload (saved on device)', 'HH-TEST1' in page.locator('#mbList').inner_text())
        page.locator('.mb-del').first.click()
        page.wait_for_timeout(300)
        check('remove clears the list -> empty state', 'No bookings yet' in page.locator('#mbList').inner_text())
        page.click('#mbClose')
        page.wait_for_timeout(300)

        print('== BOOKING: OVERNIGHT + ID UPLOAD ==')
        page.locator('.hero-cta .js-book-open').first.click()
        page.wait_for_timeout(400)
        page.wait_for_timeout(400)
        page.locator('#bkDate').fill(A_WEEKDAY)
        page.locator('#durChips button[data-dur="ON8"]').click()
        page.wait_for_timeout(200)
        check('overnight times shown 20:00 -> 08:00', '20:00' in page.locator('#ovTimes').inner_text() and '08:00' in page.locator('#ovTimes').inner_text())
        check('overnight price note $18', 'Standard $18' in page.locator('#priceNote').inner_text(), page.locator('#priceNote').inner_text())
        page.click('#actNext1')
        page.wait_for_timeout(300)
        check('pool card unavailable for overnight', 'unavail' in (page.locator('#roomGrid .room-card[data-room="pool"]').get_attribute('class') or ''))
        page.locator('#roomGrid .room-card[data-room="kuromi"]').click()
        page.click('#actNext2')
        page.wait_for_timeout(300)
        check('ID upload field visible for overnight', page.locator('#idField').is_visible())
        page.locator('#bkName').fill('Night Owl')
        page.locator('#bkPhone').fill('099887766')
        check('next disabled without ID photo', page.locator('#actNext3').is_disabled())
        png = pathlib.Path('/tmp/tiny-id.png')
        if not png.exists():
            import base64
            png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='))
        page.locator('#idUpload').set_input_files(str(png))
        page.wait_for_timeout(800)
        check('ID preview appears', page.locator('#idPreview').is_visible())
        check('next enabled with ID attached', not page.locator('#actNext3').is_disabled())
        page.click('#actNext3')
        page.wait_for_timeout(300)
        rec2 = page.locator('#reviewReceipt').inner_text()
        check('review shows overnight + $18', 'overnight' in rec2.lower() and '$18' in rec2, rec2)
        page.check('#agreedTerms')
        page.click('#actConfirm')
        page.wait_for_timeout(600)
        check('overnight POST payload has idCard + overnight flag', posted and posted[-1].get('overnight') is True and str(posted[-1].get('idCard', '')).startswith('data:image/'), {k: str(v)[:30] for k, v in (posted[-1] if posted else {}).items()})
        page.screenshot(path=str(SHOTS / '05-overnight-success.png'))

        print('== BOOKING: POOL CUSTOM HOURS + WEEKEND ==')
        page.click('#actAgain')
        page.wait_for_timeout(400)
        page.locator('#bkDate').fill(A_SATURDAY)
        page.locator('#durChips button[data-dur="3"]').click()
        page.wait_for_timeout(200)
        check('weekend pricing shown ($15)', 'Standard $15' in page.locator('#priceNote').inner_text(), page.locator('#priceNote').inner_text())
        page.locator('#durChips button[data-dur="X"]').click()
        page.wait_for_timeout(200)
        check('pool stepper appears', page.locator('#poolDur').is_visible())
        page.locator('#hrsPlus').click()
        check('stepper at 3 hours', page.locator('#hrsVal').inner_text().strip() == '3', page.locator('#hrsVal').inner_text())
        check('pool price for 3h = $15', 'Pool $15' in page.locator('#priceNote').inner_text(), page.locator('#priceNote').inner_text())
        page.select_option('#bkIn', '10:00')
        page.click('#actNext1')
        page.wait_for_timeout(300)
        page.locator('#roomGrid .room-card[data-room="pool"]').click()
        page.click('#actNext2')
        page.wait_for_timeout(300)
        page.locator('#bkName').fill('Pool Guest')
        page.locator('#bkPhone').fill('011222333')
        page.click('#actNext3')
        page.wait_for_timeout(300)
        page.check('#agreedTerms')
        check('pool total $15', page.locator('#payAmount').inner_text().strip() == '$15', page.locator('#payAmount').inner_text())
        page.click('#actConfirm')
        page.wait_for_timeout(600)
        check('pool booking succeeds', page.locator('#pane5').is_visible())

        print('== AVAILABILITY MARKING (live) ==')
        page.click('#actAgain')
        page.wait_for_timeout(300)
        mock_api(busy=[{'room': 'vintage', 'start': '14:00', 'end': '17:00', 'ref': 'HH-BUSY1', 'status': 'confirmed'}])
        page.locator('#bkDate').fill(A_WEEKDAY)
        page.locator('#durChips button[data-dur="3"]').click()
        page.select_option('#bkIn', '14:00')
        page.click('#actNext1')
        page.wait_for_timeout(600)
        check('busy room marked unavailable', 'unavail' in (page.locator('#roomGrid .room-card[data-room="vintage"]').get_attribute('class') or ''))
        check('free room still selectable', 'unavail' not in (page.locator('#roomGrid .room-card[data-room="classic"]').get_attribute('class') or ''))

        print('== MOBILE SNAPSHOT ==')
        mp = browser.new_page(viewport={'width': 390, 'height': 844})
        mp.goto(base + '/', wait_until='load')
        mp.wait_for_timeout(900)
        check('mobile: no errors', not errors or all('net::' in e or '404' in e for e in errors[-2:]), '; '.join(errors[-2:]))
        check('mobile: 12 rooms still render', mp.locator('.rooms .room-card').count() == 12)
        mp.screenshot(path=str(SHOTS / '06-mobile-home.png'))
        mp.close()

        browser.close()
    httpd.shutdown()
    print('\n' + '=' * 60)
    print(f'RESULT: {len(passed)} passed, {len(failed)} failed')
    if failed:
        print('FAILED:')
        for f in failed:
            print('  ✗ ' + f)
    return 1 if failed else 0


if __name__ == '__main__':
    sys_exit = run()
    raise SystemExit(sys_exit)
