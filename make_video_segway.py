"""9:16-Produktvideo für den Segway ZT3 Pro D E-Scooter (Angebot).

Aufruf:  python3 make_video_segway.py   ->  out/segway_zt3_pro_d.mp4
Der Scooter ist generisch gezeichnet (keine Original-Grafik, kein Logo).
Alle Zahlen stammen aus dem Amazon-Produkttitel (Herstellerangaben).
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill
from make_video_ck import sale_tag

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "segway_zt3_pro_d.mp4")

BG_TOP = (24, 26, 32)
BG_BOT = (44, 48, 58)
WHITE = (255, 255, 255)
YEL = (255, 196, 40)
GREEN = (80, 220, 140)
MUTED = (170, 175, 190)
RED = (225, 35, 45)


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-200, 900, 700, 1700], fill=YEL + (35,))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    bg.paste(glow, (0, 0), glow)
    return bg


BG = make_bg()


def make_scooter(scale=1.0, wheel_rot=0.0):
    s = scale
    w, h = int(900 * s), int(820 * s)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    wy = 680 * s
    body = (55, 58, 66)
    # Lenkerstange
    d.line([(690 * s, wy - 40 * s), (610 * s, 90 * s)], fill=body, width=int(34 * s))
    d.line([(520 * s, 90 * s), (700 * s, 90 * s)], fill=(30, 30, 34), width=int(26 * s))
    d.ellipse([590 * s, 110 * s, 640 * s, 160 * s], fill=YEL)  # Display
    # Deck
    d.rounded_rectangle([150 * s, wy - 130 * s, 640 * s, wy - 60 * s], 30 * s, fill=body)
    d.rounded_rectangle([170 * s, wy - 140 * s, 620 * s, wy - 118 * s], 10 * s, fill=(30, 30, 34))
    d.line([(190 * s, wy - 100 * s), (600 * s, wy - 100 * s)], fill=YEL, width=int(8 * s))
    # Federung
    for x in (210 * s, 650 * s):
        for k in range(4):
            yy = wy - 110 * s + k * 18 * s
            d.line([(x - 18 * s, yy), (x + 18 * s, yy + 9 * s)], fill=YEL, width=int(6 * s))
    # Räder (Offroad-Profil)
    for cx in (170 * s, 720 * s):
        r = 130 * s
        d.ellipse([cx - r, wy - r, cx + r, wy + r], fill=(18, 18, 20))
        for k in range(16):
            a = wheel_rot + k * math.pi / 8
            x1, y1 = cx + math.cos(a) * r, wy + math.sin(a) * r
            d.ellipse([x1 - 13 * s, y1 - 13 * s, x1 + 13 * s, y1 + 13 * s], fill=(18, 18, 20))
        d.ellipse([cx - 70 * s, wy - 70 * s, cx + 70 * s, wy + 70 * s], fill=(90, 95, 105))
        for k in range(5):
            a = wheel_rot + k * 2 * math.pi / 5
            d.line([(cx, wy), (cx + math.cos(a) * 65 * s, wy + math.sin(a) * 65 * s)], fill=(50, 52, 58), width=int(10 * s))
        d.ellipse([cx - 20 * s, wy - 20 * s, cx + 20 * s, wy + 20 * s], fill=YEL)
    # Licht
    d.ellipse([650 * s, 170 * s, 690 * s, 210 * s], fill=(255, 250, 220))
    return im


SC_FRAMES = [make_scooter(0.9, k * math.pi / 16) for k in range(8)]


def scooter_at(img, cx, cy, t, moving=True, scale=1.0):
    fr = SC_FRAMES[int(t * 24) % 8] if moving else SC_FRAMES[0]
    paste(img, fr, cx, cy, scale=scale)


def car(d, x, y, col):
    d.rounded_rectangle([x, y, x + 300, y + 110], 30, fill=col)
    d.rounded_rectangle([x + 50, y - 70, x + 230, y + 10], 30, fill=col)
    d.rounded_rectangle([x + 75, y - 55, x + 205, y], 15, fill=(150, 190, 230))
    for wx in (x + 60, x + 240):
        d.ellipse([wx - 35, y + 80, wx + 35, y + 150], fill=(15, 15, 18))
    d.ellipse([x + 5, y + 30, x + 35, y + 60], fill=RED)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 320 - 50 * (1 - k), "Stau. Parkplatzsuche.\nVolle Bahn.", 78, alpha=255 * k)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 1250, W, 1500], fill=(35, 36, 40))
    for i in range(6):
        d.rectangle([60 + i * 180, 1370, 140 + i * 180, 1385], fill=(200, 200, 200))
    for i, col in enumerate([(200, 60, 60), (70, 110, 190), (180, 180, 185)]):
        car(d, -120 + i * 380 + math.sin(t * 3 + i) * 3, 1180, col)
    if t > 1.2:
        text(img, 1600, "Geht auch anders.", 80, fill=YEL, alpha=255 * ease((t - 1.2) / 0.4))


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 200, "Segway ZT3 Pro D", 96, alpha=255 * k)
    x = -500 + (W / 2 + 500) * ease((t - 0.2) / 1.0)
    scooter_at(img, x, 950, t, moving=t < 1.2)
    # Fahrtstreifen
    if t < 1.2:
        d = ImageDraw.Draw(img)
        for i in range(4):
            d.line([(x - 450 - i * 60, 820 + i * 60), (x - 300 - i * 60, 820 + i * 60)], fill=YEL, width=6)
    if t > 1.3:
        pill(img, W / 2, 1420, "E-Scooter mit Straßenzulassung", 46, WHITE, fg=BG_TOP, scale=back((t - 1.3) / 0.4))
    if t > 1.7:
        sale_tag(img, W / 2, 1650, scale=0.9 * back((t - 1.7) / 0.4), rot=-5, label="ANGEBOT")


FEATURES = [
    ("Straßenzulassung", "für deutsche Straßen zugelassen"),
    ("Bis 70 km Reichweite", "im Eco-Modus · 56 km im Sport-Modus"),
    ("Vollfederung", "plus Offroad-Reifen"),
    ("Apple Find My", "Scooter jederzeit wiederfinden"),
]


def s_features(img, t, dur):
    text(img, 180, "Das bekommst du:", 86)
    per = (dur - 0.8) / len(FEATURES)
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 400 + i * 290
        x = (1 - k) * 700
        a = int(255 * k)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 240], 45, fill=(255, 255, 255, int(a * 0.1)),
                            outline=(255, 255, 255, int(a * 0.3)), width=3)
        cx, cy = 175 + x, y + 120
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=YEL + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=BG_TOP + (a,), width=14)
        d.text((265 + x, y + 45), head, font=font(56), fill=WHITE + (a,))
        d.text((265 + x, y + 135), sub, font=font(34, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)
    if t > dur - 1.4:
        a = 255 * ease((t - (dur - 1.4)) / 0.4)
        pill(img, W / 2, 1650, "120 kg Tragkraft · 25 % Steigung", 40, WHITE, fg=BG_TOP, alpha=a)
        pill(img, W / 2, 1770, "wasserfest", 40, WHITE, fg=BG_TOP, alpha=a)


def s_range(img, t, dur):
    text(img, 220, "Reichweite laut Hersteller:", 64)
    for i, (label, km, col) in enumerate([("Eco-Modus", 70, GREEN), ("Sport-Modus", 56, YEL)]):
        y = 600 + i * 420
        p = ease((t - 0.2 - i * 0.3) / 1.4)
        val = int(round(km * p))
        d = ImageDraw.Draw(img)
        d.text((100, y), label, font=font(58), fill=WHITE)
        num = f"bis {val} km"
        f = font(80)
        d.text((W - 100 - d.textlength(num, font=f), y - 12), num, font=f, fill=col)
        d.rounded_rectangle([100, y + 120, W - 100, y + 190], 35, fill=(70, 74, 85))
        if p > 0:
            d.rounded_rectangle([100, y + 120, 100 + (W - 200) * (km / 70) * p, y + 190], 35, fill=col)
    scooter_at(img, 150 + (W - 300) * ease((t - 0.2) / 1.4), 1620, t, scale=0.35)


def s_cta(img, t, dur):
    k = back(t / 0.5)
    sale_tag(img, W / 2, 320, scale=1.1 * max(0.05, k), rot=-5 + math.sin(t * 4) * 2, label="ANGEBOT")
    scooter_at(img, W / 2, 780, t, moving=False, scale=0.75 * max(0.05, k))
    a = 255 * min(1, max(0, back((t - 0.2) / 0.5)))
    text(img, 1110, "Link in den\nKommentaren", 116, fill=YEL, alpha=a)
    text(img, 1400, "Jetzt im Angebot – schnell sein!", 52, alpha=255 * ease((t - 0.5) / 0.4))
    if t > 0.7:
        al = ease((t - 0.7) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1600 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(YEL)))
    if t > 1.0:
        pill(img, W / 2, 1800, "Folgen für mehr Must-haves", 40, WHITE, fg=BG_TOP, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.6, s_hook), (3.2, s_reveal), (6.0, s_features), (3.0, s_range), (4.0, s_cta)]


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
