"""Erzeugt ein 9:16-Produktvideo (TikTok/Reels) für das uandu Glasbehälter 10er-Set.

Aufruf:  python3 make_video.py   ->  out/uandu_glasbehaelter.mp4
Benötigt Pillow und ffmpeg.
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "uandu_glasbehaelter.mp4")

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size, bold=True):
    return ImageFont.truetype(BOLD if bold else REG, size)


# Farben
BG_TOP = (255, 244, 230)
BG_BOT = (255, 214, 190)
INK = (40, 32, 30)
ACCENT = (232, 93, 63)
GREEN = (60, 160, 110)
LID = [(70, 140, 200), (232, 93, 63), (60, 160, 110), (245, 180, 60)]
FOOD = [
    [(250, 220, 120), (120, 190, 90), (200, 90, 60)],   # Reis, Brokkoli, Hähnchen
    [(230, 120, 70), (250, 240, 220), (110, 170, 80)],  # Süßkartoffel, Quark, Salat
    [(170, 110, 70), (240, 200, 90), (90, 150, 70)],
    [(240, 150, 160), (255, 245, 230), (150, 90, 170)],  # Overnight Oats mit Beeren
]


def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def back(t):
    t = max(0.0, min(1.0, t))
    c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    # weiche Kreise als Deko
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    for cx, cy, r, a in [(150, 300, 260, 50), (950, 700, 320, 40), (200, 1650, 300, 45), (900, 1800, 200, 50)]:
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))
    deco = deco.filter(ImageFilter.GaussianBlur(30))
    bg.paste(deco, (0, 0), deco)
    return bg


BG = make_bg()


def container(w, h, idx):
    """Zeichnet eine Glasdose mit Deckel und Essen (RGBA)."""
    pad = 30
    img = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0 = pad, pad
    lid_h = int(h * 0.16)
    body = [x0 + 8, y0 + lid_h - 4, x0 + w - 8, y0 + h]
    # Schatten
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([body[0] + 10, body[1] + 20, body[2] + 10, body[3] + 18], 40, fill=(80, 40, 20, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(sh)
    # Essen in Fächern
    foods = FOOD[idx % len(FOOD)]
    inner = [body[0] + 18, body[1] + int(h * 0.18), body[2] - 18, body[3] - 18]
    fw = (inner[2] - inner[0]) / 3
    for i, c in enumerate(foods):
        fx0 = inner[0] + i * fw
        d.rounded_rectangle([fx0 + 3, inner[1], fx0 + fw - 3, inner[3]], 22, fill=c + (255,))
        # kleine Struktur
        for k in range(5):
            px = fx0 + 15 + (k * 37) % max(1, int(fw - 30))
            py = inner[1] + 20 + (k * 53) % max(1, inner[3] - inner[1] - 40)
            d.ellipse([px, py, px + 16, py + 16], fill=tuple(max(0, v - 35) for v in c) + (255,))
    # Glas
    glass = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    gd.rounded_rectangle(body, 40, fill=(210, 235, 245, 70), outline=(255, 255, 255, 230), width=7)
    gd.rounded_rectangle([body[0] + 22, body[1] + 25, body[0] + 40, body[3] - 40], 9, fill=(255, 255, 255, 150))
    img.alpha_composite(glass)
    # Deckel
    lc = LID[idx % len(LID)]
    d.rounded_rectangle([x0, y0, x0 + w, y0 + lid_h], 26, fill=lc + (255,))
    d.rounded_rectangle([x0 + 14, y0 + 8, x0 + w - 14, y0 + 20], 6, fill=(255, 255, 255, 90))
    for cx in (x0 + 4, x0 + w - 4):  # Verschlussclips
        d.rounded_rectangle([cx - 14, y0 + lid_h - 18, cx + 14, y0 + lid_h + 26], 8, fill=tuple(int(v * 0.8) for v in lc) + (255,))
    return img


CONTAINERS = [container(420, 280, i) for i in range(4)]
SMALL = [c.resize((c.width * 2 // 3, c.height * 2 // 3), Image.LANCZOS) for c in CONTAINERS]


def text_center(img, y, text, size, fill=INK, bold=True, alpha=255, stroke=0, stroke_fill=None):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(size, bold)
    lines = text.split("\n")
    lh = int(size * 1.18)
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=f)
        d.text(((W - tw) / 2, y + i * lh), line, font=f, fill=fill + (alpha,),
               stroke_width=stroke, stroke_fill=(stroke_fill or (255, 255, 255)) + (alpha,))
    img.alpha_composite(layer)


def pill(img, cx, cy, text, size, bg, fg=(255, 255, 255), alpha=255, scale=1.0):
    f = font(int(size * scale))
    d0 = ImageDraw.Draw(img)
    tw = d0.textlength(text, font=f)
    pw, ph = tw + 80 * scale, size * scale * 1.7
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2], ph / 2, fill=bg + (alpha,))
    d.text((cx - tw / 2, cy - size * scale * 0.62), text, font=f, fill=fg + (alpha,))
    img.alpha_composite(layer)


def paste(img, sprite, cx, cy, alpha=1.0, scale=1.0, rot=0.0):
    s = sprite
    if scale != 1.0:
        s = s.resize((max(1, int(s.width * scale)), max(1, int(s.height * scale))), Image.BILINEAR)
    if rot:
        s = s.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 1.0:
        a = s.getchannel("A").point(lambda v: int(v * alpha))
        s = s.copy()
        s.putalpha(a)
    img.alpha_composite(s, (int(cx - s.width / 2), int(cy - s.height / 2)))


def badge(img, alpha=255):
    """Kleiner Hinweis oben: Produktname bleibt dauerhaft sichtbar."""
    pill(img, W / 2, 120, "uandu Glasbehälter · 10er Set", 34, (255, 255, 255), fg=INK, alpha=int(alpha * 0.9))


# ---------------- Szenen ----------------
# (Dauer in Sekunden, Renderfunktion(img, t_lokal, dauer))

def scene_hook(img, t, dur):
    s = ease(t / 0.5)
    text_center(img, 330 - 60 * (1 - s), "Immer noch\nPlastikdosen?", 110, alpha=int(255 * s))
    # wackelnde, ausgegraute Plastikdose mit X
    pl = Image.new("RGBA", (460, 340), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pl)
    pd.rounded_rectangle([20, 60, 440, 320], 30, fill=(225, 220, 205, 255), outline=(190, 180, 160, 255), width=6)
    pd.rounded_rectangle([0, 20, 460, 80], 25, fill=(200, 195, 180, 255))
    for i in range(6):
        pd.ellipse([60 + i * 60, 160 + (i % 2) * 50, 95 + i * 60, 195 + (i % 2) * 50], fill=(215, 170, 120, 200))
    wob = math.sin(t * 14) * 4 * ease(t / 0.4)
    paste(img, pl, W / 2, 1050, alpha=s, rot=wob)
    if t > 1.0:
        k = ease((t - 1.0) / 0.35)
        d = ImageDraw.Draw(img)
        L = 230 * k
        d.line([(W / 2 - L, 1050 - L), (W / 2 + L, 1050 + L)], fill=ACCENT, width=34)
        d.line([(W / 2 + L, 1050 - L), (W / 2 - L, 1050 + L)], fill=ACCENT, width=34)
    if t > 1.4:
        k = ease((t - 1.4) / 0.4)
        text_center(img, 1450, "Verfärbt. Riecht. Nervt.", 64, fill=ACCENT, alpha=int(255 * k))


def scene_reveal(img, t, dur):
    badge(img, int(255 * ease(t / 0.4)))
    k = ease(t / 0.5)
    text_center(img, 260 + 40 * (1 - k), "Mein Meal-Prep-\nGamechanger:", 92, alpha=int(255 * k))
    # Stapel aus 4 Dosen fällt von oben herein
    base_y = 1380
    for i in range(4):
        st = 0.25 + i * 0.22
        p = back((t - st) / 0.45)
        if t < st:
            continue
        y = base_y - i * 235
        y_now = -300 + (y + 300) * p
        float_off = math.sin(t * 2.2 + i) * 6
        paste(img, CONTAINERS[i], W / 2 + (i % 2) * 30 - 15, y_now + float_off)
    if t > 1.6:
        k2 = back((t - 1.6) / 0.4)
        pill(img, W / 2, 1650, "10 Boxen aus Glas", 64, ACCENT, scale=max(0.01, k2))


FEATURES = [
    ("Glas statt Plastik", "nimmt keine Gerüche & Farben an"),
    ("Mit Deckel", "einfach zuklipsen & mitnehmen"),
    ("Durchsichtig", "du siehst sofort, was drin ist"),
    ("10er Set", "Mittagessen für die ganze Woche"),
]


def scene_features(img, t, dur):
    badge(img)
    text_center(img, 230, "Warum ich sie liebe:", 80)
    per = (dur - 0.6) / len(FEATURES)
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 470 + i * 300
        x_off = (1 - k) * 700
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        a = int(255 * k)
        d.rounded_rectangle([70 + x_off, y, W - 70 + x_off, y + 250], 45, fill=(255, 255, 255, int(a * 0.92)))
        # Häkchen
        cx, cy = 175 + x_off, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=GREEN + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=(255, 255, 255, a), width=14)
        d.text((265 + x_off, y + 50), head, font=font(62), fill=INK + (a,))
        d.text((265 + x_off, y + 140), sub, font=font(40, bold=False), fill=(90, 80, 75, a))
        img.alpha_composite(layer)


def scene_usage(img, t, dur):
    badge(img)
    k = ease(t / 0.5)
    text_center(img, 260, "Sonntag vorkochen.\nDie Woche genießen.", 80, alpha=int(255 * k))
    days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"]
    for i, dname in enumerate(days):
        st = 0.3 + i * 0.25
        if t < st:
            continue
        p = back((t - st) / 0.4)
        col, row = i % 2, i // 2
        cx = 300 + col * 480
        cy = 800 + row * 360
        paste(img, SMALL[i % 4], cx, cy, scale=max(0.05, p))
        pill(img, cx, cy + 150, dname, 40, INK, alpha=int(255 * min(1, p)))


def scene_cta(img, t, dur):
    badge(img)
    k = back(t / 0.5)
    paste(img, CONTAINERS[1], W / 2, 760 + math.sin(t * 2.5) * 10, scale=1.25 * max(0.05, k))
    text_center(img, 1080, "Link in Bio", 140, fill=ACCENT, alpha=int(255 * min(1, max(0, k))))
    text_center(img, 1260, "uandu Glasbehälter\n10er Set", 64, alpha=int(255 * ease((t - 0.3) / 0.4)))
    # pulsierender Pfeil nach oben (zum Profil/Bio)
    if t > 0.6:
        a = int(255 * ease((t - 0.6) / 0.3))
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1610 + bounce
        d.polygon([(cx, cy - 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy + 80), (cx + 25, cy + 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=ACCENT)
    if t > 1.0:
        pill(img, W / 2, 1810, "Folgen für mehr Must-haves", 40, INK, alpha=int(255 * ease((t - 1.0) / 0.4)))


SCENES = [
    (2.6, scene_hook),
    (3.0, scene_reveal),
    (5.4, scene_features),
    (3.2, scene_usage),
    (3.8, scene_cta),
]


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
        n = int(dur * FPS)
        for f in range(n):
            t = f / FPS
            img = BG.convert("RGBA")
            fn(img, t, dur)
            frame = img.convert("RGB")
            # kurze Blende zwischen Szenen
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
