"""9:16-Produktvideo für die Emwwat Hoodie-Decke (extra lang, Sherpa).

Aufruf:  python3 make_video_hoodie.py   ->  out/emwwat_hoodie_decke.mp4
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "emwwat_hoodie_decke.mp4")

BG_TOP = (250, 240, 228)
BG_BOT = (232, 212, 190)
INK = (70, 45, 30)
MUTED = (130, 105, 85)
TERRA = (205, 110, 70)
SAGE = (120, 150, 120)
ICE = (120, 180, 230)
HOOD = (150, 120, 190)      # Außenstoff
SHERPA = (250, 245, 235)    # Sherpa-Innenfutter


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for cx, cy, r in [(150, 350, 280), (950, 1300, 340)]:
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 210, 160, 70))
    bg.paste(glow.filter(ImageFilter.GaussianBlur(60)), (0, 0), glow.filter(ImageFilter.GaussianBlur(60)))
    return bg


BG = make_bg()


def make_hoodie(scale=1.0):
    s = scale
    w, h = int(760 * s), int(1000 * s)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([170 * s, 260 * s, 610 * s, 980 * s], 80 * s, fill=(60, 30, 10, 80))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(25 * s)))
    d = ImageDraw.Draw(im)
    dark = tuple(int(c * 0.82) for c in HOOD)
    # Ärmel
    d.polygon([(190 * s, 300 * s), (40 * s, 560 * s), (60 * s, 720 * s), (160 * s, 700 * s), (230 * s, 470 * s)], fill=dark)
    d.polygon([(570 * s, 300 * s), (720 * s, 560 * s), (700 * s, 720 * s), (600 * s, 700 * s), (530 * s, 470 * s)], fill=dark)
    for cx in (110 * s, 650 * s):  # Sherpa-Bündchen
        d.ellipse([cx - 60 * s, 650 * s, cx + 60 * s, 740 * s], fill=SHERPA)
    # Körper (extra lang)
    d.rounded_rectangle([160 * s, 250 * s, 600 * s, 960 * s], 90 * s, fill=HOOD)
    d.rounded_rectangle([160 * s, 900 * s, 600 * s, 960 * s], 30 * s, fill=dark)
    # Riesentasche
    d.rounded_rectangle([220 * s, 560 * s, 540 * s, 760 * s], 40 * s, fill=dark)
    d.line([(240 * s, 590 * s), (520 * s, 590 * s)], fill=HOOD, width=max(1, int(6 * s)))
    # Kapuze mit Sherpa
    d.ellipse([230 * s, 40 * s, 530 * s, 330 * s], fill=HOOD)
    d.ellipse([270 * s, 90 * s, 490 * s, 320 * s], fill=SHERPA)
    for i in range(30):  # Sherpa-Struktur
        x = 290 * s + (i * 53) % int(180 * s)
        y = 120 * s + (i * 37) % int(170 * s)
        d.ellipse([x, y, x + 14 * s, y + 14 * s], fill=(235, 225, 210))
    d.ellipse([310 * s, 160 * s, 450 * s, 310 * s], fill=(60, 45, 40))  # Öffnung (Schatten)
    return im


HOODIE = make_hoodie()
HOODIE_S = make_hoodie(0.6)


def person_cold(img, cx, cy, t, alpha=1.0):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    shake = math.sin(t * 40) * 6
    x = cx + shake
    # Sofa
    d.rounded_rectangle([cx - 380, cy + 40, cx + 380, cy + 280], 60, fill=(170, 120, 90, a))
    d.rounded_rectangle([cx - 380, cy - 140, cx + 380, cy + 80], 60, fill=(190, 140, 105, a))
    # Person
    d.ellipse([x - 80, cy - 300, x + 80, cy - 140], fill=(240, 205, 180, a))
    d.rounded_rectangle([x - 110, cy - 150, x + 110, cy + 120], 60, fill=(210, 210, 215, a))
    # Bibbern: Zähne/Augen
    d.line([(x - 40, cy - 240), (x - 15, cy - 230)], fill=INK + (a,), width=6)
    d.line([(x + 40, cy - 240), (x + 15, cy - 230)], fill=INK + (a,), width=6)
    d.rectangle([x - 30, cy - 195, x + 30, cy - 175], fill=(255, 255, 255, a), outline=INK + (a,), width=3)
    img.alpha_composite(layer)


def snowflake(d, cx, cy, r, col):
    for k in range(3):
        ang = math.radians(k * 60)
        dx, dy = math.cos(ang) * r, math.sin(ang) * r
        d.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill=col, width=6)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 300 - 50 * (1 - k), "Frierst du auch\nständig auf dem Sofa?", 70, fill=INK, alpha=255 * k)
    person_cold(img, W / 2, 1150, t, alpha=k)
    d = ImageDraw.Draw(img)
    for i in range(6):
        y = (600 + i * 150 + t * 220) % 1200 + 500
        x = 120 + (i * 173) % 840
        snowflake(d, x, y, 22, ICE)


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 180, "Die Lösung:\nDecke + Hoodie\nin einem", 80, fill=INK, alpha=255 * k)
    p = back((t - 0.3) / 0.6)
    if t > 0.3:
        paste(img, HOODIE, W / 2, 980 + math.sin(t * 2) * 8, scale=0.85 * max(0.05, min(1.1, p)))
    if t > 1.6:
        pill(img, W / 2, 1640, "Emwwat Hoodie-Decke", 62, TERRA, scale=back((t - 1.6) / 0.4))


FEATURES = [
    ("Extra lang", "richtig schön einkuscheln"),
    ("Sherpa", "kuscheliges Sherpa-Material"),
    ("Mit Ärmeln", "Hände frei für Handy, Tee & Snacks"),
    ("Riesentasche", "Platz für alles, was du brauchst"),
]


def s_features(img, t, dur):
    text(img, 210, "Was sie besonders macht:", 64, fill=INK)
    per = (dur - 0.6) / len(FEATURES)
    cols = [TERRA, SAGE, TERRA, SAGE]
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 470 + i * 300
        x = (1 - k) * 700
        a = int(255 * k)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45, fill=(255, 252, 247, int(a * 0.95)))
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=cols[i] + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=(255, 255, 255, a), width=14)
        d.text((265 + x, y + 50), head, font=font(60), fill=INK + (a,))
        d.text((265 + x, y + 140), sub, font=font(34, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)


USES = ["Sofa-Abend", "Homeoffice", "Serien-\nmarathon", "Für sie\n& ihn"]


def s_uses(img, t, dur):
    k = ease(t / 0.4)
    text(img, 220, "Perfekt für:", 96, fill=INK, alpha=255 * k)
    for i, name in enumerate(USES):
        st = 0.3 + i * 0.3
        if t < st:
            continue
        p = back((t - st) / 0.4)
        col, row = i % 2, i // 2
        cx, cy = 300 + col * 480, 760 + row * 520
        s = max(0.05, p)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([cx - 200 * s, cy - 210 * s, cx + 200 * s, cy + 210 * s], 50 * s,
                            fill=(TERRA if i in (0, 3) else SAGE) + (235,))
        if p > 0.6:
            f = font(56)
            lines = name.split("\n")
            for j, ln in enumerate(lines):
                tw = d.textlength(ln, font=f)
                d.text((cx - tw / 2, cy - len(lines) * 34 + j * 68), ln, font=f, fill=(255, 255, 255, 255))
        img.alpha_composite(layer)


def s_cta(img, t, dur):
    k = back(t / 0.5)
    paste(img, HOODIE_S, W / 2, 600 + math.sin(t * 2.5) * 10, scale=max(0.05, k))
    a = 255 * min(1, max(0, k))
    text(img, 1040, "Link in den\nKommentaren", 120, fill=TERRA, alpha=a)
    text(img, 1340, "Emwwat Hoodie-Decke · extra lang", 44, fill=INK, alpha=255 * ease((t - 0.3) / 0.4))
    if t > 0.6:
        al = ease((t - 0.6) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1560 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(TERRA)))
    if t > 1.0:
        pill(img, W / 2, 1790, "Folgen für mehr Must-haves", 40, INK, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.6, s_hook), (3.2, s_reveal), (5.4, s_features), (3.0, s_uses), (3.8, s_cta)]


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-movflags", "+faststart", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    fade = 0.25
    for si, (dur, fn) in enumerate(SCENES):
        for f in range(int(dur * FPS)):
            t = f / FPS
            img = BG.convert("RGBA")
            fn(img, t, dur)
            frame = img.convert("RGB")
            if si > 0 and t < fade:
                frame = Image.blend(BG, frame, t / fade)
            if si < len(SCENES) - 1 and t > dur - fade:
                frame = Image.blend(frame, BG, (t - (dur - fade)) / fade)
            proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    print("fertig:", OUT)


if __name__ == "__main__":
    main()
