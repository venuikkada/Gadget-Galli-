#!/usr/bin/env python3
"""Generates the loud new-order alert sound for the Shop Partner app (assets/sounds/new_order.wav).

    python3 scripts/generate-assets.py

Icons, splash and logos come from brand/mark.svg instead: run `pnpm brand:assets`.
"""
import math
import os
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.join(ROOT, "apps", "mobile", "assets")


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
    os.makedirs(os.path.join(MOBILE, "sounds"), exist_ok=True)
    alert_sound(os.path.join(MOBILE, "sounds", "new_order.wav"))
    print("sound written")


if __name__ == "__main__":
    main()
