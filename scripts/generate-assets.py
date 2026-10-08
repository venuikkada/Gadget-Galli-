#!/usr/bin/env python3
"""Generates Gadget Galli brand assets for the mobile app and admin panel.

    python3 scripts/generate-assets.py

Outputs app icon, Android adaptive icon layers, splash icon, notification icon, favicon and
the loud new-order alert sound (assets/sounds/new_order.wav).
"""
import math
import os
import struct
import wave

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.join(ROOT, "apps", "mobile", "assets")
ADMIN_PUBLIC = os.path.join(ROOT, "apps", "admin", "public")
POPPINS = os.path.join(ROOT, "node_modules", "@expo-google-fonts", "poppins", "700Bold", "Poppins_700Bold.ttf")

INDIGO = (79, 70, 229)
INDIGO_DARK = (55, 48, 163)
ORANGE = (255, 107, 53)
WHITE = (255, 255, 255)


def font(size):
    try:
        return ImageFont.truetype(POPPINS, size)
    except OSError:
        return ImageFont.load_default(size=size)


def gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return img


def draw_mark(draw, cx, cy, scale, color=WHITE, accent=ORANGE):
    """A shopping bag with a lightning bolt: 'electronics, delivered fast'."""
    w, h = 440 * scale, 340 * scale
    left, top = cx - w / 2, cy - h / 2 + 50 * scale
    stroke = int(32 * scale)
    # handle (wide arc that meets the top edge of the bag)
    hw = 250 * scale
    draw.arc([cx - hw / 2, top - hw / 2 - 10 * scale, cx + hw / 2, top + hw / 2 - 10 * scale], 180, 360, fill=color, width=stroke)
    # bag body
    draw.rounded_rectangle([left, top, left + w, top + h], radius=int(56 * scale), fill=color)
    # lightning bolt cut-out in the accent colour
    bolt = [
        (cx + 28 * scale, top + 45 * scale),
        (cx - 70 * scale, top + 185 * scale),
        (cx - 8 * scale, top + 185 * scale),
        (cx - 38 * scale, top + 300 * scale),
        (cx + 76 * scale, top + 140 * scale),
        (cx + 12 * scale, top + 140 * scale),
    ]
    draw.polygon(bolt, fill=accent)


def app_icon(path, size=1024):
    img = gradient(size, INDIGO, INDIGO_DARK)
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 30, size / 1024 * 1.2)
    img.save(path)


def adaptive_foreground(path, size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 10, size / 1024 * 0.9)
    img.save(path)


def adaptive_background(path, size=1024):
    gradient(size, INDIGO, INDIGO_DARK).save(path)


def monochrome(path, size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 10, size / 1024 * 0.9, color=WHITE, accent=(0, 0, 0, 0))
    img.save(path)


def splash(path, size=600):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 60, size / 1024 * 1.1)
    f = font(int(size * 0.11))
    text = "Gadget Galli"
    tw = draw.textlength(text, font=f)
    draw.text(((size - tw) / 2, size * 0.68), text, font=f, fill=WHITE)
    img.save(path)


def notification_icon(path, size=96):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 2, size / 1024 * 2.1, color=WHITE, accent=(0, 0, 0, 0))
    img.save(path)


def favicon(path, size=192):
    img = gradient(size, INDIGO, INDIGO_DARK).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=size // 4, fill=255)
    img.putalpha(mask)
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size / 2, size / 2 - 4, size / 1024 * 1.25)
    img.save(path)


def alert_sound(path, seconds=3.0, rate=22050):
    """Loud two-tone chime repeated 3 times, easy to hear in a busy shop."""
    frames = []
    pattern = [(988, 0.18), (0, 0.04), (1319, 0.28), (0, 0.5)]  # B5, E6 and a pause
    t_total = 0.0
    while t_total < seconds:
        for freq, dur in pattern:
            n = int(rate * dur)
            for i in range(n):
                t = i / rate
                if freq == 0:
                    sample = 0.0
                else:
                    envelope = min(1.0, t / 0.01) * math.exp(-3.0 * t / max(dur, 0.01))
                    sample = envelope * (0.75 * math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(4 * math.pi * freq * t))
                frames.append(int(max(-1, min(1, sample)) * 32000))
            t_total += dur
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", s) for s in frames))


def main():
    os.makedirs(os.path.join(MOBILE, "images"), exist_ok=True)
    os.makedirs(os.path.join(MOBILE, "sounds"), exist_ok=True)
    os.makedirs(ADMIN_PUBLIC, exist_ok=True)
    app_icon(os.path.join(MOBILE, "images", "icon.png"))
    adaptive_foreground(os.path.join(MOBILE, "images", "android-icon-foreground.png"))
    adaptive_background(os.path.join(MOBILE, "images", "android-icon-background.png"))
    monochrome(os.path.join(MOBILE, "images", "android-icon-monochrome.png"))
    splash(os.path.join(MOBILE, "images", "splash-icon.png"))
    notification_icon(os.path.join(MOBILE, "images", "notification-icon.png"))
    favicon(os.path.join(MOBILE, "images", "favicon.png"), 48)
    favicon(os.path.join(ADMIN_PUBLIC, "favicon.png"), 64)
    favicon(os.path.join(ADMIN_PUBLIC, "logo.png"), 192)
    alert_sound(os.path.join(MOBILE, "sounds", "new_order.wav"))
    print("assets written")


if __name__ == "__main__":
    main()
