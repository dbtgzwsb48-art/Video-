"""9:16-Produktvideo für Calvin Klein Men Trunk 3er-Pack (Angebot).

Aufruf:  python3 make_video_ck.py   ->  out/ck_trunk_3pk.mp4
Die Trunks sind generisch gezeichnet, ohne Markenlogo.
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "ck_trunk_3pk.mp4")

BG_TOP = (245, 245, 243)
BG_BOT = (222, 222, 218)
INK = (20, 20, 22)
MUTED = (100, 100, 105)
RED = (225, 35, 45)
WHITE = (255, 255, 255)
TRUNK_COLS = [(28, 28, 32), (150, 152, 158), (248, 248, 248)]


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    return bg


BG = make_bg()


def trunk(col, w=380):
    """Generischer Herren-Trunk mit breitem Bund (ohne Logo)."""
    h = int(w * 0.78)
    pad = 30
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    x0, y0 = pad, pad
    band = int(h * 0.2)
    body = [(x0 + 6, y0 + band), (x0 + w - 6, y0 + band), (x0 + w, y0 + h), (x0 + w * 0.62, y0 + h),
            (x0 + w * 0.5, y0 + h * 0.72), (x0 + w * 0.38, y0 + h), (x0, y0 + h)]
    sd.polygon([(x + 10, y + 14) for x, y in body], fill=(0, 0, 0, 70))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(im)
    edge = tuple(max(0, c - 30) for c in col) if sum(col) > 300 else tuple(min(255, c + 30) for c in col)
    d.polygon(body, fill=col, outline=edge)
    # Nähte
    d.line([(x0 + w * 0.5, y0 + band), (x0 + w * 0.5, y0 + h * 0.72)], fill=edge, width=3)
    d.arc([x0 + w * 0.3, y0 + band + 10, x0 + w * 0.7, y0 + h * 0.8], 200, 340, fill=edge, width=3)
    # Bund
    bcol = (245, 245, 245) if sum(col) < 300 else (30, 30, 34)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + band], 10, fill=bcol)
    lc = (180, 180, 185) if sum(bcol) > 300 else (90, 90, 95)
    d.line([(x0 + 20, y0 + band * 0.5), (x0 + w - 20, y0 + band * 0.5)], fill=lc, width=4)
    return im


TRUNKS = [trunk(c) for c in TRUNK_COLS]


def sale_tag(img, cx, cy, scale=1.0, rot=0.0, label="ANGEBOT"):
    s = max(0.05, scale)
    tw, th = int(560 * s), int(250 * s)
    im = Image.new("RGBA", (tw + 40, th + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(20, 20 + th / 2), (20 + th * 0.4, 20), (20 + tw, 20), (20 + tw, 20 + th), (20 + th * 0.4, 20 + th)], fill=RED)
    d.ellipse([20 + th * 0.2, 20 + th / 2 - 16 * s, 20 + th * 0.2 + 32 * s, 20 + th / 2 + 16 * s], fill=BG_TOP)
    f = font(max(1, int(84 * s)))
    lw = d.textlength(label, font=f)
    d.text((20 + th * 0.35 + (tw - th * 0.35 - lw) / 2, 20 + th / 2 - 52 * s), label, font=f, fill=WHITE)
    im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 380 - 50 * (1 - k), "Neue Unterwäsche\nfällig?", 86, fill=INK, alpha=255 * k)
    if t > 0.9:
        q = back((t - 0.9) / 0.5)
        sale_tag(img, W / 2, 1050, scale=q * 1.2, rot=8 + math.sin(t * 5) * 3, label="DEAL!")
    if t > 1.5:
        text(img, 1400, "Dann aufgepasst 👀".replace(" 👀", ""), 70, fill=MUTED, alpha=255 * ease((t - 1.5) / 0.4))


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 200, "Calvin Klein\nMen Trunk", 104, fill=INK, alpha=255 * k)
    xs = [W / 2 - 270, W / 2, W / 2 + 270]
    for i in range(3):
        st = 0.3 + i * 0.2
        if t < st:
            continue
        p = back((t - st) / 0.5)
        y = 950 + (1 - min(1, p)) * 700 + i * 60 - 60 + math.sin(t * 2 + i) * 6
        paste(img, TRUNKS[i], xs[i], y, scale=0.72 * max(0.05, min(1.1, p)), rot=(i - 1) * -6)
    if t > 1.3:
        pill(img, W / 2, 1450, "3er-Pack", 72, INK, scale=back((t - 1.3) / 0.4))
    if t > 1.7:
        sale_tag(img, W / 2 + 250, 1680, scale=0.7 * back((t - 1.7) / 0.4), rot=-6)


FEATURES = [
    ("Gerade im Angebot", "jetzt reduziert zuschlagen"),
    ("3 Trunks im Pack", "für mehrere Tage durch die Woche"),
    ("Trunk-Schnitt", "kurzes Bein, sitzt eng am Körper"),
    ("Breiter Bund", "der typische Look mit Markenbund"),
]


def s_features(img, t, dur):
    text(img, 210, "Darum lohnt es sich:", 82, fill=INK)
    per = (dur - 0.6) / len(FEATURES)
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
        hi = i == 0
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45,
                            fill=(RED if hi else WHITE) + (a,))
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=(WHITE if hi else INK) + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=(RED if hi else WHITE) + (a,), width=14)
        d.text((265 + x, y + 50), head, font=font(60), fill=(WHITE if hi else INK) + (a,))
        d.text((265 + x, y + 140), sub, font=font(38, bold=False), fill=((255, 220, 220) if hi else MUTED) + (a,))
        img.alpha_composite(layer)


def s_deal(img, t, dur):
    k = back(t / 0.5)
    sale_tag(img, W / 2, 600, scale=1.4 * max(0.05, k), rot=-5 + math.sin(t * 4) * 2, label="ANGEBOT")
    text(img, 900, "Calvin Klein\nTrunk 3er-Pack", 90, fill=INK, alpha=255 * ease((t - 0.3) / 0.4))
    text(img, 1180, "gerade reduziert", 80, fill=RED, alpha=255 * ease((t - 0.6) / 0.4))
    if t > 1.0:
        a = ease((t - 1.0) / 0.4)
        for i in range(3):
            paste(img, TRUNKS[i], W / 2 + (i - 1) * 290, 1520, scale=0.55, alpha=a)


def s_cta(img, t, dur):
    for i in range(3):
        paste(img, TRUNKS[i], W / 2 + (i - 1) * 290, 560 + math.sin(t * 2.5 + i) * 10, scale=0.6 * max(0.05, back(t / 0.5)))
    k = back((t - 0.2) / 0.5)
    a = 255 * min(1, max(0, k))
    text(img, 900, "Link in den\nKommentaren", 120, fill=RED, alpha=a)
    text(img, 1200, "Schnell sein, solange\nder Deal läuft!", 64, fill=INK, alpha=255 * ease((t - 0.5) / 0.4))
    if t > 0.7:
        al = ease((t - 0.7) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1520 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(RED)))
    if t > 1.0:
        pill(img, W / 2, 1760, "Folgen für mehr Must-haves", 40, INK, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.6, s_hook), (3.0, s_reveal), (5.4, s_features), (3.0, s_deal), (4.0, s_cta)]


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
