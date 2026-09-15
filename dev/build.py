#!/usr/bin/env python3
"""
Hidden Homestay — single-file site builder (v3).

Reads dev/template.html, dev/styles.css, dev/app.js and the bundled QR
library, then produces a self-contained index.html (logo + Khmer font
inlined as data URIs). Room photos / guidelines / menus live in assets/
and are served by the booking server as normal files.

Usage:  python3 dev/build.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent   # hidden-homestay/
ASSETS = ROOT / 'assets'
DEV = ROOT / 'dev'


def duri(path: pathlib.Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def main() -> None:
    template = (DEV / 'template.html').read_text(encoding='utf-8')
    css = (DEV / 'styles.css').read_text(encoding='utf-8')
    js = (DEV / 'app.js').read_text(encoding='utf-8')
    qrlib = (DEV / 'qrcode.min.js').read_text(encoding='utf-8')

    # Khmer font lives next to the dev files (downloaded from Google Fonts)
    font_path = DEV / 'siemreap.woff2'
    if not font_path.exists():
        sys.exit('ERROR: dev/khmer.woff2 missing (Khmer font)')
    css = css.replace('{{KHMER_FONT}}',
                      base64.b64encode(font_path.read_bytes()).decode())

    html = (template
            .replace('{{STYLES}}', css)
            .replace('{{QRLIB}}', qrlib)
            .replace('{{SCRIPT}}', js))

    tokens = {
        '{{LOGO}}': duri(ASSETS / 'logo.jpg', 'image/jpeg'),   # owner's logo — original bytes
    }
    for token, value in tokens.items():
        if token not in html:
            sys.exit(f'ERROR: token {token} not found in template')
        html = html.replace(token, value)

    leftover = re.findall(r'\{\{[A-Z_]+\}\}', html)
    if leftover:
        sys.exit(f'ERROR: unresolved tokens: {sorted(set(leftover))}')

    out = ROOT / 'index.html'
    out.write_text(html, encoding='utf-8')
    print(f'Built {out}  ({out.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
