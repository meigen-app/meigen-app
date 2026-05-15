#!/usr/bin/env python3
"""
燈 Tomoshibi アイコン生成スクリプト
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

FONT_PATH = '/System/Library/Fonts/ヒラギノ明朝 ProN.ttc'
OUTPUT_DIR = '/Users/udagawaharukasei/名称未設定フォルダ/meigen-app/public'
IOS_DIR   = '/Users/udagawaharukasei/名称未設定フォルダ/meigen-app/ios/App/App/Assets.xcassets/AppIcon.appiconset'

BG_COLOR   = (13,  17, 23)      # #0D1117
GLOW_COLOR = (249, 115, 22)     # #F97316 flame orange
CHAR_COLOR = (253, 230, 138)    # #FDE68A warm amber


def make_icon(size):
    img = Image.new('RGBA', (size, size), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)

    # ── 背景グラデーション（中心から放射状の温かい光） ──
    cx, cy = size // 2, size // 2
    glow_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)

    layers = [
        (0.55, (249, 115, 22, 55)),
        (0.40, (249, 115, 22, 45)),
        (0.28, (249, 115, 22, 35)),
        (0.16, (252, 211, 77, 30)),
    ]
    for ratio, color in layers:
        r = int(size * ratio)
        glow_draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)

    glow_blurred = glow_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.09))
    img = Image.alpha_composite(img.convert('RGBA'), glow_blurred)
    draw = ImageDraw.Draw(img)

    # ── 文字 燈 ──
    font_size = int(size * 0.58)
    try:
        font = ImageFont.truetype(FONT_PATH, font_size, index=0)
    except Exception:
        font = ImageFont.load_default()

    char = '燈'
    bbox = draw.textbbox((0, 0), char, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1]

    # グロー（にじみ）効果
    glow_text = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_text)
    for offset, alpha in [(6, 40), (4, 60), (2, 80)]:
        gd.text((tx, ty), char, font=font, fill=GLOW_COLOR + (alpha,))
    blurred_text = glow_text.filter(ImageFilter.GaussianBlur(radius=size * 0.025))
    img = Image.alpha_composite(img, blurred_text)
    draw = ImageDraw.Draw(img)

    # 本文字
    draw.text((tx, ty), char, font=font, fill=CHAR_COLOR)

    return img.convert('RGB')


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    print(f'  ✓ {path}  ({img.size[0]}px)')


# ── PWA用アイコン ──
print('PWAアイコン生成...')
save(make_icon(192), f'{OUTPUT_DIR}/icon-192.png')
save(make_icon(512), f'{OUTPUT_DIR}/icon-512.png')

# ── iOS App Store / Xcodeアイコン ──
print('\niOSアイコン生成...')
ios_sizes = [
    (20,  1, '20x20'),
    (20,  2, '20x20@2x'),
    (20,  3, '20x20@3x'),
    (29,  1, '29x29'),
    (29,  2, '29x29@2x'),
    (29,  3, '29x29@3x'),
    (40,  1, '40x40'),
    (40,  2, '40x40@2x'),
    (40,  3, '40x40@3x'),
    (60,  2, '60x60@2x'),
    (60,  3, '60x60@3x'),
    (76,  1, '76x76'),
    (76,  2, '76x76@2x'),
    (83,  2, '83.5x83.5@2x'),  # iPad Pro
    (1024,1, '1024x1024'),
]

contents = {
    "images": [],
    "info": {"author": "xcode", "version": 1}
}

for base, scale, label in ios_sizes:
    px = base * scale
    filename = f'Icon-{label}.png'
    save(make_icon(px), f'{IOS_DIR}/{filename}')

    # scale表記を決定
    sc_str = f'{scale}x'
    # size表記
    sz_map = {
        20: '20x20', 29: '29x29', 40: '40x40',
        60: '60x60', 76: '76x76', 83: '83.5x83.5', 1024: '1024x1024'
    }
    sz_str = sz_map.get(base, f'{base}x{base}')

    idiom_map = {
        20: ['iphone','ipad'],
        29: ['iphone','ipad'],
        40: ['iphone','ipad'],
        60: ['iphone'],
        76: ['ipad'],
        83: ['ipad'],
        1024: ['ios-marketing']
    }
    idioms = idiom_map.get(base, ['iphone'])

    for idiom in idioms:
        if idiom == 'ipad' and base == 60:
            continue
        if idiom == 'iphone' and base == 76:
            continue
        if idiom == 'iphone' and base == 83:
            continue
        contents['images'].append({
            "filename": filename,
            "idiom": idiom,
            "scale": sc_str,
            "size": sz_str
        })

# Contents.json を書き出し
import json
with open(f'{IOS_DIR}/Contents.json', 'w') as f:
    json.dump(contents, f, indent=2)
print(f'\n  ✓ Contents.json')

print('\n✅ アイコン生成完了！')
