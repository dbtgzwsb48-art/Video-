"""9:16-Produktvideo für W1NNAS Performance Pouches (Blueberry Strong).

Aufruf:  python3 make_video_w1nnas.py   ->  out/w1nnas_pouches.mp4
Nutzt die Zeichen-Helfer aus make_video.py.
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "w1nnas_pouches.mp4")

BG_TOP = (18, 16, 48)
BG_BOT = (58, 28, 96)
WHITE = (255, 255, 255)
BLUE = (90, 120, 255)
BERRY = (150, 90, 230)
NEON = (120, 255, 210)
MUTED = (190, 185, 225)


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for cx, cy, r, c in [(180, 380, 300, BLUE + (70,)), (930, 1000, 360, BERRY + (70,)), (250, 1700, 280, NEON + (35,))]:
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    bg.paste(glow, (0, 0), glow)
    return bg


BG = make_bg()


def text(img, y, s, size, fill=WHITE, alpha=255, bold=True):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(size, bold)
    for i, line in enumerate(s.split("\n")):
        tw = d.textlength(line, font=f)
        d.text(((W - tw) / 2, y + i * int(size * 1.18)), line, font=f, fill=fill + (int(alpha),))
    img.alpha_composite(layer)


def pill(img, cx, cy, s, size, bg, fg=WHITE, alpha=255, scale=1.0):
    scale = max(0.01, scale)
    f = font(max(1, int(size * scale)))
    d0 = ImageDraw.Draw(img)
    tw = d0.textlength(s, font=f)
    pw, ph = tw + 80 * scale, size * scale * 1.7
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2], ph / 2, fill=bg + (int(alpha),))
    d.text((cx - tw / 2, cy - size * scale * 0.62), s, font=f, fill=fg + (int(alpha),))
    img.alpha_composite(layer)


def make_can(d_px=560):
    """Runde Dose von oben/schräg, im Blueberry-Look (keine Original-Grafik)."""
    pad = 60
    h_side = int(d_px * 0.22)
    im = Image.new("RGBA", (d_px + 2 * pad, d_px + h_side + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([pad + 20, pad + h_side + 40, pad + d_px + 20, pad + d_px + h_side + 40], fill=(0, 0, 0, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(25)))
    d = ImageDraw.Draw(im)
    # Seitenwand
    d.ellipse([pad, pad + h_side, pad + d_px, pad + d_px + h_side], fill=(40, 30, 110))
    d.rectangle([pad, pad + d_px / 2, pad + d_px, pad + d_px / 2 + h_side], fill=(40, 30, 110))
    # Deckel mit Verlauf
    lid = Image.new("RGBA", (d_px, d_px), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lid)
    for r in range(d_px // 2, 0, -2):
        k = r / (d_px / 2)
        c = tuple(int(BERRY[i] * k + BLUE[i] * (1 - k)) for i in range(3))
        ld.ellipse([d_px / 2 - r, d_px / 2 - r, d_px / 2 + r, d_px / 2 + r], fill=c + (255,))
    ld.ellipse([18, 18, d_px - 18, d_px - 18], outline=(255, 255, 255, 120), width=6)
    # Beeren
    for bx, by, br in [(0.36, 0.84, 0.06), (0.50, 0.87, 0.05), (0.42, 0.18, 0.05), (0.58, 0.16, 0.06)]:
        x, y, r = bx * d_px, by * d_px, br * d_px
        ld.ellipse([x - r, y - r, x + r, y + r], fill=(55, 45, 150, 255), outline=(170, 160, 255, 255), width=3)
        ld.ellipse([x - r * 0.3, y - r * 0.5, x + r * 0.1, y - r * 0.15], fill=(200, 200, 255, 200))
    f1, f2 = font(int(d_px * 0.16)), font(int(d_px * 0.065))
    for s, f, y, c in [("W1NNAS", f1, 0.36, WHITE), ("PERFORMANCE POUCHES", f2, 0.55, NEON), ("BLUEBERRY STRONG", f2, 0.64, WHITE)]:
        tw = ld.textlength(s, font=f)
        ld.text(((d_px - tw) / 2, y * d_px), s, font=f, fill=c + (255,))
    im.alpha_composite(lid, (pad, pad))
    # Glanz
    gl = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([pad + 60, pad + 30, pad + d_px * 0.55, pad + d_px * 0.25], fill=(255, 255, 255, 50))
    im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(12)))
    return im


def make_pouch(w=150, h=90):
    im = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, w + 10, h + 10], 30, fill=(235, 232, 250, 255), outline=(200, 195, 235, 255), width=3)
    for i in range(10):
        x, y = 25 + (i * 41) % (w - 30), 22 + (i * 29) % (h - 30)
        d.point([(x, y), (x + 1, y)], fill=(200, 190, 230, 255))
    return im


CAN = make_can()
POUCH = make_pouch()


def battery(img, cx, cy, level, alpha=1.0):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    w, h = 420, 220
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 36, outline=WHITE + (a,), width=14)
    d.rounded_rectangle([cx + w / 2 + 6, cy - 45, cx + w / 2 + 40, cy + 45], 10, fill=WHITE + (a,))
    col = (255, 80, 80) if level < 0.25 else NEON
    inner = (w - 56) * max(0.04, level)
    d.rounded_rectangle([cx - w / 2 + 28, cy - h / 2 + 28, cx - w / 2 + 28 + inner, cy + h / 2 - 28], 16, fill=col + (a,))
    img.alpha_composite(layer)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 330 - 50 * (1 - k), "15 Uhr.\nAkku leer?", 120, alpha=255 * k)
    level = max(0.05, 0.8 - 0.75 * ease((t - 0.3) / 1.2))
    battery(img, W / 2, 1030, level, alpha=k)
    if t > 1.5:
        k2 = ease((t - 1.5) / 0.4)
        text(img, 1350, "Kein Bock auf den\n5. Kaffee?", 70, fill=MUTED, alpha=255 * k2)


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 220, "Ich hab was\nBesseres gefunden:", 84, alpha=255 * k)
    p = back((t - 0.3) / 0.6)
    if t > 0.3:
        paste(img, CAN, W / 2, 920 + math.sin(t * 2.4) * 10, scale=max(0.05, p), rot=(1 - min(1, p)) * 25)
    # Pouches fliegen raus
    for i in range(4):
        st = 1.0 + i * 0.15
        if t < st:
            continue
        q = ease((t - st) / 0.5)
        ang = math.radians(-150 + i * 40)
        r = 420 * q
        paste(img, POUCH, W / 2 + math.cos(ang) * r, 920 + math.sin(ang) * r * 0.9, rot=i * 25 - 30)
    if t > 1.6:
        pill(img, W / 2, 1500, "W1NNAS Performance Pouches", 52, BERRY, scale=back((t - 1.6) / 0.4))
        pill(img, W / 2, 1640, "Blueberry Strong", 44, NEON, fg=BG_TOP, alpha=255 * ease((t - 1.8) / 0.3))


FEATURES = [
    ("Mit Koffein", "Energy-Kick im Pouch"),
    ("Nikotinfrei", "kein Nikotin drin"),
    ("Ohne Tabak", "kein Tabak, kein Rauch"),
    ("13 Pouches", "pro Dose – passt in jede Tasche"),
]


def s_features(img, t, dur):
    text(img, 200, "Was drin ist –\nund was nicht:", 78)
    per = (dur - 0.6) / len(FEATURES)
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 520 + i * 300
        x = (1 - k) * -700
        a = int(255 * k)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45, fill=(255, 255, 255, int(a * 0.12)),
                            outline=(255, 255, 255, int(a * 0.35)), width=3)
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=NEON + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=BG_TOP + (a,), width=14)
        d.text((265 + x, y + 50), head, font=font(62), fill=WHITE + (a,))
        d.text((265 + x, y + 140), sub, font=font(38, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)
    # Hinweis wegen „Snus“: Inhalt ist Koffein, kein Nikotin/Tabak
    if t > 0.6:
        pill(img, W / 2, 1780, "Enthält Koffein", 34, (255, 255, 255), fg=BG_TOP, alpha=200 * ease((t - 0.6) / 0.4))


USES = [("Sport", "🏋"), ("Arbeit", "💻"), ("Gaming", "🎮"), ("Autofahren", "🚗")]


def icon(d, kind, cx, cy, a):
    c = WHITE + (a,)
    if kind == "Sport":  # Hantel
        d.rounded_rectangle([cx - 70, cy - 8, cx + 70, cy + 8], 6, fill=c)
        for s in (-1, 1):
            d.rounded_rectangle([cx + s * 70 - 14, cy - 45, cx + s * 70 + 14, cy + 45], 8, fill=c)
            d.rounded_rectangle([cx + s * 45 - 10, cy - 32, cx + s * 45 + 10, cy + 32], 6, fill=c)
    elif kind == "Arbeit":  # Laptop
        d.rounded_rectangle([cx - 60, cy - 50, cx + 60, cy + 25], 8, outline=c, width=9)
        d.rounded_rectangle([cx - 80, cy + 28, cx + 80, cy + 42], 6, fill=c)
    elif kind == "Gaming":  # Controller
        d.rounded_rectangle([cx - 80, cy - 35, cx + 80, cy + 35], 35, outline=c, width=9)
        d.line([(cx - 50, cy), (cx - 20, cy)], fill=c, width=9)
        d.line([(cx - 35, cy - 15), (cx - 35, cy + 15)], fill=c, width=9)
        d.ellipse([cx + 25, cy - 18, cx + 41, cy - 2], fill=c)
        d.ellipse([cx + 45, cy + 2, cx + 61, cy + 18], fill=c)
    else:  # Lenkrad
        d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], outline=c, width=10)
        d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=c)
        for ang in (180, 0, 90):
            r = math.radians(ang)
            d.line([(cx, cy), (cx + math.cos(r) * 55, cy + math.sin(r) * 55)], fill=c, width=9)


def s_uses(img, t, dur):
    k = ease(t / 0.4)
    text(img, 230, "Perfekt für:", 96, alpha=255 * k)
    for i, (name, _) in enumerate(USES):
        st = 0.3 + i * 0.3
        if t < st:
            continue
        p = back((t - st) / 0.4)
        col, row = i % 2, i // 2
        cx, cy = 300 + col * 480, 760 + row * 520
        s = max(0.05, p)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        w2, h2 = 200 * s, 210 * s
        d.rounded_rectangle([cx - w2, cy - h2, cx + w2, cy + h2], 50 * s,
                            fill=(BERRY if i % 2 == 0 else BLUE) + (230,))
        if p > 0.6:
            icon(d, name, cx, cy - 50, 255)
            f = font(54)
            tw = d.textlength(name, font=f)
            d.text((cx - tw / 2, cy + 70), name, font=f, fill=WHITE + (255,))
        img.alpha_composite(layer)


def s_cta(img, t, dur):
    k = back(t / 0.5)
    paste(img, CAN, W / 2, 640 + math.sin(t * 2.5) * 10, scale=0.85 * max(0.05, k))
    a = 255 * min(1, max(0, k))
    text(img, 1060, "Link in den\nKommentaren", 120, fill=NEON, alpha=a)
    text(img, 1360, "W1NNAS · Blueberry Strong", 54, alpha=255 * ease((t - 0.3) / 0.4))
    if t > 0.6:
        al = ease((t - 0.6) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1560 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(NEON)))
    if t > 0.9:
        text(img, 1740, "Enthält Koffein. Nicht für Kinder,\nSchwangere und Stillende.", 32, fill=MUTED,
             alpha=255 * ease((t - 0.9) / 0.4), bold=False)


SCENES = [(2.6, s_hook), (3.2, s_reveal), (5.4, s_features), (3.0, s_uses), (4.0, s_cta)]


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
