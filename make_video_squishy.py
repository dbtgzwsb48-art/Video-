"""9:16-Produktvideo für das Squishy Fun Box Set (8 Überraschungsfiguren).

Aufruf:  python3 make_video_squishy.py   ->  out/squishy_funbox.mp4
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "squishy_funbox.mp4")

BG_TOP = (255, 232, 245)
BG_BOT = (215, 235, 255)
INK = (60, 40, 80)
PINK = (255, 120, 180)
PURPLE = (150, 110, 230)
MINT = (90, 210, 170)
MUTED = (120, 100, 140)
SQ_COLS = [(255, 170, 200), (255, 210, 120), (150, 220, 255), (180, 240, 170),
           (210, 180, 255), (255, 190, 150), (255, 240, 150), (160, 230, 220)]


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    for i in range(40):  # Konfetti-Punkte
        x, y = int((math.sin(i * 12.9898) * 43758.5453) % 1 * W), int((math.sin(i * 78.233) * 12345.678) % 1 * H)
        r = 8 + (i % 4) * 4
        dd.ellipse([x, y, x + r, y + r], fill=SQ_COLS[i % 8] + (140,))
    bg.paste(deco, (0, 0), deco)
    return bg


BG = make_bg()


def squishy(col, size=220, squash=0.0, kind=0):
    """Niedliche Figur: Blob mit Gesicht. squash 0..1 = zusammengedrückt."""
    w = size * (1 + 0.45 * squash)
    h = size * (1 - 0.45 * squash)
    pad = 40
    im = Image.new("RGBA", (int(size * 1.6 + 2 * pad), int(size * 1.3 + 2 * pad)), (0, 0, 0, 0))
    cx, by = im.width / 2, im.height - pad
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - w * 0.5, by - 20, cx + w * 0.5, by + 10], fill=(80, 40, 90, 60))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    top = by - h
    dark = tuple(max(0, c - 40) for c in col)
    # Ohren je nach Typ
    if kind % 3 == 0:  # Katze
        for s in (-1, 1):
            d.polygon([(cx + s * w * 0.18, top + h * 0.2), (cx + s * w * 0.42, top - h * 0.12), (cx + s * w * 0.46, top + h * 0.3)], fill=col)
    elif kind % 3 == 1:  # Bär
        for s in (-1, 1):
            d.ellipse([cx + s * w * 0.3 - w * 0.13, top - h * 0.02, cx + s * w * 0.3 + w * 0.13, top + h * 0.24], fill=dark)
    d.ellipse([cx - w / 2, top, cx + w / 2, by], fill=col, outline=dark, width=4)
    # Glanz
    d.ellipse([cx - w * 0.3, top + h * 0.1, cx - w * 0.1, top + h * 0.25], fill=(255, 255, 255, 160))
    # Gesicht
    ey = top + h * 0.5
    eye_h = max(4, 22 * (1 - squash * 0.8))
    for s in (-1, 1):
        ex = cx + s * w * 0.17
        if squash > 0.5:
            d.line([(ex - 14, ey), (ex, ey - 8), (ex + 14, ey)], fill=INK, width=6)
        else:
            d.ellipse([ex - 12, ey - eye_h / 2, ex + 12, ey + eye_h / 2], fill=INK)
            d.ellipse([ex - 5, ey - eye_h / 2 + 3, ex + 1, ey - eye_h / 2 + 9], fill=(255, 255, 255))
        d.ellipse([ex + s * 18 - 16, ey + 18, ex + s * 18 + 16, ey + 32], fill=(255, 130, 160, 170))
    d.arc([cx - 16, ey + 6, cx + 16, ey + 30], 10, 170, fill=INK, width=5)
    return im


SQ = [squishy(SQ_COLS[i], 200, 0, i) for i in range(8)]


def gift_box(img, cx, cy, open_k, alpha=1.0):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    w, h = 520, 360
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 30, fill=PURPLE + (a,))
    d.rectangle([cx - 35, cy - h / 2, cx + 35, cy + h / 2], fill=PINK + (a,))
    # Deckel fliegt hoch und kippt
    lid = Image.new("RGBA", (w + 60, 120), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lid)
    ld.rounded_rectangle([0, 20, w + 60, 120], 28, fill=(170, 135, 245, a))
    ld.rectangle([(w + 60) / 2 - 35, 20, (w + 60) / 2 + 35, 120], fill=PINK + (a,))
    ld.ellipse([(w + 60) / 2 - 80, 0, (w + 60) / 2 - 10, 50], fill=PINK + (a,))
    ld.ellipse([(w + 60) / 2 + 10, 0, (w + 60) / 2 + 80, 50], fill=PINK + (a,))
    lid = lid.rotate(-25 * open_k, expand=True, resample=Image.BICUBIC)
    layer.alpha_composite(lid, (int(cx - lid.width / 2 + 160 * open_k), int(cy - h / 2 - 100 - 260 * open_k)))
    img.alpha_composite(layer)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 330 - 50 * (1 - k), "Stress im Kopf?\nEinfach mal drücken.", 78, fill=INK, alpha=255 * k)
    sq = 0.5 + 0.5 * math.sin(t * 4 - 1.5)
    sq = sq if t > 0.6 else 0
    paste(img, squishy(SQ_COLS[0], 330, sq * 0.9, 0), W / 2, 1100, alpha=k)
    if t > 1.2:
        text(img, 1520, "*squish*", 70, fill=PINK, alpha=255 * ease((t - 1.2) / 0.3))


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 210, "Die Squishy Fun Box:", 84, fill=INK, alpha=255 * k)
    open_k = ease((t - 0.5) / 0.5)
    # Figuren springen aus der Box
    for i in range(8):
        st = 0.9 + i * 0.1
        if t < st:
            continue
        q = ease((t - st) / 0.5)
        col, row = i % 4, i // 4
        tx, ty = 170 + col * 247, 560 + row * 300
        x = W / 2 + (tx - W / 2) * q
        y = 1200 + (ty - 1200) * q - math.sin(q * math.pi) * 250
        paste(img, SQ[i], x, y, scale=0.4 + 0.45 * q)
    gift_box(img, W / 2, 1330, open_k, alpha=k)
    if t > 1.9:
        pill(img, W / 2, 1650, "8 Überraschungsfiguren", 58, PINK, scale=back((t - 1.9) / 0.4))


FEATURES = [
    ("8 Überraschungen", "jede Figur ist eine Überraschung"),
    ("Weiches TPR", "fühlt sich super soft an"),
    ("Slow-Rising", "geht langsam wieder in Form"),
    ("Deko & Geschenk", "für Schreibtisch und Freunde"),
]


def s_features(img, t, dur):
    text(img, 210, "Warum du sie willst:", 82, fill=INK)
    per = (dur - 0.6) / len(FEATURES)
    cols = [PINK, PURPLE, MINT, (255, 170, 70)]
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 470 + i * 300
        x = (1 - k) * -700
        a = int(255 * k)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45, fill=(255, 255, 255, int(a * 0.9)))
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=cols[i] + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=(255, 255, 255, a), width=14)
        d.text((265 + x, y + 50), head, font=font(60), fill=INK + (a,))
        d.text((265 + x, y + 140), sub, font=font(38, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)


def s_demo(img, t, dur):
    text(img, 220, "Drücken …", 100, fill=INK)
    # schnell zusammendrücken, dann langsam zurück (Slow-Rising)
    if t < 0.8:
        sq = ease(t / 0.5) * 0.9
    else:
        sq = 0.9 * (1 - ease((t - 0.8) / (dur - 1.0)))
    # Finger
    paste(img, squishy(SQ_COLS[4], 360, sq, 1), W / 2, 1050)
    fy = 1050 - 330 * (1 - sq * 0.45) - 40
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([W / 2 - 55, fy - 260, W / 2 + 55, fy], 55, fill=(250, 210, 185), outline=(220, 170, 150), width=5)
    d.rounded_rectangle([W / 2 - 35, fy - 90, W / 2 + 35, fy - 20], 25, fill=(255, 235, 225))
    if t > 0.9:
        text(img, 1450, "… und langsam zurück.", 72, fill=PURPLE, alpha=255 * ease((t - 0.9) / 0.4))
        pill(img, W / 2, 1620, "Slow-Rising-Effekt", 48, MINT, alpha=255 * ease((t - 1.2) / 0.4))


def s_cta(img, t, dur):
    for i in range(8):
        ang = t * 0.6 + i * math.pi / 4
        paste(img, SQ[i], W / 2 + math.cos(ang) * 380, 720 + math.sin(ang) * 260, scale=0.55)
    k = back(t / 0.5)
    a = 255 * min(1, max(0, k))
    text(img, 1080, "Link in den\nKommentaren", 120, fill=PINK, alpha=a)
    text(img, 1380, "Squishy Fun Box · 8 Figuren", 54, fill=INK, alpha=255 * ease((t - 0.3) / 0.4))
    if t > 0.6:
        al = ease((t - 0.6) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1590 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(PINK)))
    if t > 1.0:
        pill(img, W / 2, 1800, "Folgen für mehr Must-haves", 40, INK, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.6, s_hook), (3.2, s_reveal), (5.4, s_features), (3.2, s_demo), (3.8, s_cta)]


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
