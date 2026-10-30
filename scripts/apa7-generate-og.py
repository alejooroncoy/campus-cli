#!/usr/bin/env python3
"""Genera las imágenes Open Graph (1200x630) de las páginas de APA 7 con el mismo estilo que og-default.jpg.

Uso: python3 scripts/apa7-generate-og.py   (escribe en site/public/assets/)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parents[1] / 'site' / 'public' / 'assets'
FONTS = ASSETS / 'fonts'
W, H = 1200, 630

PAGES = {
    'og-formato-apa-7.jpg': dict(
        title='Formato APA 7.ª edición',
        sub='En Word: interlineado, sangrías, márgenes, citas y referencias, revisados antes de entregar.',
        chips=['Gratis', 'Sin registro', 'Beta'],
    ),
    'og-normas-apa-7.jpg': dict(
        title='Normas APA 7.ª edición',
        sub='Lo esencial: citas, referencias y formato, y qué cambió desde la 6.ª.',
        chips=['Citas', 'Referencias', 'De la 6.ª a la 7.ª'],
    ),
}


def background():
    """Degradado oscuro azulado con el ruido del OG por defecto."""
    base = Image.new('RGB', (W, H))
    px = base.load()
    top, bottom, glow = (15, 36, 48), (14, 30, 40), (26, 70, 92)
    for y in range(H):
        for x in range(W):
            t = y / H
            r, g, b = (int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
            k = max(0.0, 1 - ((x - W * 0.85) ** 2 + (y - H * 0.1) ** 2) ** 0.5 / 700)
            px[x, y] = tuple(min(255, int(c + (glow[i] - c) * k * 0.55)) for i, c in enumerate((r, g, b)))
    noise = ASSETS / 'noise.png'
    if noise.exists():  # grano muy suave, como el del OG por defecto
        base = Image.blend(base, Image.open(noise).convert('RGB').resize((W, H)), 0.045)
    return base


def wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def build(name, spec):
    img = background()
    d = ImageDraw.Draw(img)
    semibold = lambda s: ImageFont.truetype(str(FONTS / 'GoogleSansFlex-SemiBold.ttf'), s)
    regular = lambda s: ImageFont.truetype(str(FONTS / 'GoogleSansFlex-Regular.ttf'), s)

    # logo recortado del OG por defecto + nombre
    default = Image.open(ASSETS / 'og-default.jpg').convert('RGB')
    logo = default.crop((84, 76, 172, 164))
    mask = Image.new('L', logo.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 87, 87), radius=20, fill=255)
    img.paste(logo, (84, 76), mask)
    d.text((194, 120), 'Campus', font=semibold(36), fill=(255, 255, 255), anchor='lm')

    y = 222
    for line in wrap(d, spec['title'], semibold(66), W - 168):
        d.text((84, y), line, font=semibold(66), fill=(255, 255, 255))
        y += 80
    y += 20
    for line in wrap(d, spec['sub'], regular(30), W - 220):
        d.text((84, y), line, font=regular(30), fill=(176, 205, 214))
        y += 40

    x = 84
    for chip in spec['chips']:
        f = semibold(24)
        w = int(d.textlength(chip, font=f)) + 44
        d.rounded_rectangle((x, 520, x + w, 568), radius=24, fill=(30, 54, 66), outline=(70, 96, 108), width=2)
        d.text((x + 22, 544), chip, font=f, fill=(228, 240, 244), anchor='lm')
        x += w + 16
    d.text((W - 84, 544), 'campuscli.com', font=semibold(28), fill=(112, 214, 196), anchor='rm')
    img.save(ASSETS / name, quality=88, optimize=True)
    print('Escrito', ASSETS / name)


if __name__ == '__main__':
    for name, spec in PAGES.items():
        build(name, spec)
