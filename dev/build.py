#!/usr/bin/env python3
"""
Hidden Homestay — single-file site builder.

Reads dev/template.html, dev/styles.css, dev/app.js and the images in
assets/, then produces a fully self-contained index.html (all images
inlined as data URIs). No server, no external requests needed.

Usage:  python3 dev/build.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent   # hidden-homestay/
ASSETS = ROOT / 'assets'
DEV = ROOT / 'dev'


def duri(path: pathlib.Path, mime: str = 'image/jpeg') -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def main() -> None:
    template = (DEV / 'template.html').read_text(encoding='utf-8')
    css = (DEV / 'styles.css').read_text(encoding='utf-8')
    js = (DEV / 'app.js').read_text(encoding='utf-8')
    qrlib = (DEV / 'qrcode.min.js').read_text(encoding='utf-8')

    html = (template
            .replace('{{STYLES}}', css)
            .replace('{{QRLIB}}', qrlib)
            .replace('{{SCRIPT}}', js))

    tokens = {
        '{{LOGO}}':          duri(ASSETS / 'logo.jpg'),                    # owner's logo — original bytes
        '{{IMG_BURGER}}':    duri(ASSETS / 'burger.jpg'),
        '{{IMG_VINTAGE}}':   duri(ASSETS / 'vintage.jpg'),
        '{{IMG_FISHING}}':   duri(ASSETS / 'fishing.jpg'),
        '{{IMG_BRANCH_A}}':  duri(ASSETS / 'branch-cheasophara.jpg'),
        '{{IMG_BRANCH_B}}':  duri(ASSETS / 'branch-penghout.jpg'),
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
    print(f'Built {out}  ({out.stat().st_size / 1024 / 1024:.2f} MB)')


if __name__ == '__main__':
    main()
