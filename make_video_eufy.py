"""9:16-Produktvideo für die eufyCam C37 (Außenkamera, Solar, ohne Abo).

Aufruf:  python3 make_video_eufy.py   ->  out/eufycam_c37.mp4
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "eufycam_c37.mp4")

NIGHT_TOP = (8, 14, 38)
NIGHT_BOT = (22, 40, 78)
WHITE = (255, 255, 255)
CYAN = (70, 200, 255)
YELLOW = (255, 205, 70)
RED = (255, 85, 85)
MUTED = (175, 190, 220)


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(NIGHT_TOP[i] + (NIGHT_BOT[i] - NIGHT_TOP[i]) * k) for i in range(3)))
    for i in range(70):  # Sterne
        x, y = (i * 397) % W, (i * 233) % 900
        r = 2 + (i % 3)
        d.ellipse([x, y, x + r, y + r], fill=(200, 210, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([880, -40, 1080, 160], fill=(255, 250, 220, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    bg.paste(glow, (0, 0), glow)
    ImageDraw.Draw(bg).ellipse([945, 25, 1015, 95], fill=(245, 240, 215))  # Mond
    return bg


BG = make_bg()


def make_cam(scale=1.0):
    """Generische weiße Außenkamera mit Solarpanel (keine Original-Grafik)."""
    w, h = int(520 * scale), int(620 * scale)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = scale
    # Halterung
    d.rounded_rectangle([w / 2 - 30 * s, 430 * s, w / 2 + 30 * s, 600 * s], 14 * s, fill=(210, 215, 225))
    d.rounded_rectangle([w / 2 - 110 * s, 570 * s, w / 2 + 110 * s, 610 * s], 16 * s, fill=(190, 195, 205))
    # Solarpanel oben
    d.rounded_rectangle([60 * s, 20 * s, w - 60 * s, 110 * s], 18 * s, fill=(25, 35, 60), outline=(150, 160, 180), width=int(5 * s))
    for i in range(1, 6):
        x = 60 * s + i * (w - 120 * s) / 6
        d.line([(x, 25 * s), (x, 105 * s)], fill=(70, 90, 140), width=max(1, int(3 * s)))
    d.line([(65 * s, 65 * s), (w - 65 * s, 65 * s)], fill=(70, 90, 140), width=max(1, int(3 * s)))
    # Gehäuse
    d.rounded_rectangle([40 * s, 120 * s, w - 40 * s, 450 * s], 70 * s, fill=(245, 247, 250), outline=(205, 210, 220), width=int(5 * s))
    # Frontglas
    d.rounded_rectangle([80 * s, 160 * s, w - 80 * s, 410 * s], 55 * s, fill=(18, 20, 28))
    # Linse
    cx, cy = w / 2, 285 * s
    for r, c in [(95, (40, 45, 60)), (70, (15, 18, 30)), (42, (35, 60, 120)), (18, (120, 170, 255))]:
        d.ellipse([cx - r * s, cy - r * s, cx + r * s, cy + r * s], fill=c)
    d.ellipse([cx - 28 * s, cy - 40 * s, cx - 8 * s, cy - 20 * s], fill=(220, 230, 255))
    # Spotlight-LEDs
    for sx in (-170, 170):
        d.ellipse([cx + sx * s - 22 * s, cy - 22 * s, cx + sx * s + 22 * s, cy + 22 * s], fill=(255, 240, 200))
    # Status-LED
    d.ellipse([cx - 8 * s, 380 * s, cx + 8 * s, 396 * s], fill=CYAN)
    return im


CAM = make_cam()
CAM_S = make_cam(0.55)


def house(img, cx, base, alpha=1.0, lit=False):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    c = (12, 18, 35, a)
    d.polygon([(cx - 330, base - 420), (cx, base - 680), (cx + 330, base - 420)], fill=c)
    d.rectangle([cx - 280, base - 420, cx + 280, base], fill=c)
    win = (255, 210, 120, a) if lit else (35, 45, 70, a)
    d.rectangle([cx - 200, base - 330, cx - 90, base - 220], fill=win)
    d.rectangle([cx + 90, base - 330, cx + 200, base - 220], fill=win)
    d.rectangle([cx - 60, base - 200, cx + 60, base], fill=(30, 38, 60, a))
    d.rectangle([0, base, W, base + 40], fill=(10, 16, 30, a))
    img.alpha_composite(layer)


def figure(img, cx, base, alpha=1.0, color=(5, 8, 18)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    d.ellipse([cx - 45, base - 330, cx + 45, base - 240], fill=color + (a,))
    d.rounded_rectangle([cx - 75, base - 240, cx + 75, base - 60], 40, fill=color + (a,))
    d.rounded_rectangle([cx - 60, base - 80, cx - 15, base], 15, fill=color + (a,))
    d.rounded_rectangle([cx + 15, base - 80, cx + 60, base], 15, fill=color + (a,))
    img.alpha_composite(layer)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 380 - 50 * (1 - k), "Wer schleicht da\nnachts ums Haus?", 96, alpha=255 * k)
    house(img, W / 2 - 120, 1520, alpha=k)
    if t > 0.8:
        q = ease((t - 0.8) / 1.0)
        figure(img, 1000 - 180 * q, 1520, alpha=q * 0.95)
        f = font(150)
        ImageDraw.Draw(img).text((900 - 180 * q, 1050), "?", font=f, fill=RED)


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 200, "Mit der hier\nweißt du es sofort:", 84, alpha=255 * k)
    p = back((t - 0.3) / 0.6)
    if t > 0.3:
        paste(img, CAM, W / 2, 880 + (1 - min(1, p)) * -600 + math.sin(t * 2.4) * 8)
    if t > 1.4:
        # Lichtkegel
        a = ease((t - 1.4) / 0.4)
        cone = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(cone).polygon([(W / 2 - 200, 1100), (W / 2 + 200, 1100), (W + 100, 1900), (-100, 1900)],
                                     fill=(255, 240, 190, int(60 * a)))
        img.alpha_composite(cone.filter(ImageFilter.GaussianBlur(25)))
    if t > 1.6:
        pill(img, W / 2, 1450, "eufyCam C37", 70, CYAN, fg=NIGHT_TOP, scale=back((t - 1.6) / 0.4))
        pill(img, W / 2, 1600, "Überwachungskamera für außen", 42, WHITE, fg=NIGHT_TOP, alpha=255 * ease((t - 1.9) / 0.3))


FEATURES = [
    ("Farbnachtsicht", "auch nachts Bilder in Farbe"),
    ("Ohne Abo", "keine monatlichen Kosten"),
    ("Solar", "Solarpanel für die Stromversorgung"),
    ("Gesichtserkennung", "erkennt Gesichter automatisch"),
]


def s_features(img, t, dur):
    text(img, 210, "Das kann sie:", 92)
    per = (dur - 0.6) / len(FEATURES)
    cols = [YELLOW, (110, 230, 150), YELLOW, CYAN]
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
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45, fill=(255, 255, 255, int(a * 0.1)),
                            outline=(255, 255, 255, int(a * 0.3)), width=3)
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=cols[i] + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=NIGHT_TOP + (a,), width=14)
        d.text((265 + x, y + 50), head, font=font(60), fill=WHITE + (a,))
        d.text((265 + x, y + 140), sub, font=font(38, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)


def s_demo(img, t, dur):
    k = ease(t / 0.4)
    text(img, 170, "Nachts. In Farbe.\nDirekt aufs Handy.", 78, alpha=255 * k)
    # Handy
    px0, py0, px1, py1 = 230, 460, 850, 1760
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([px0, py0, px1, py1], 80, fill=(15, 15, 20, 255), outline=(90, 95, 110, 255), width=8)
    img.alpha_composite(layer)
    # Kamerabild: farbige Nachtszene
    sx0, sy0, sx1, sy1 = px0 + 30, py0 + 140, px1 - 30, py0 + 900
    scr = Image.new("RGB", (sx1 - sx0, sy1 - sy0))
    sd = ImageDraw.Draw(scr)
    for y in range(scr.height):
        q = y / scr.height
        sd.line([(0, y), (scr.width, y)], fill=(int(40 + 40 * q), int(60 + 70 * q), int(90 + 30 * q)))
    sd.rectangle([0, int(scr.height * 0.72), scr.width, scr.height], fill=(70, 120, 60))  # Rasen
    sd.rectangle([40, 120, 260, int(scr.height * 0.72)], fill=(170, 110, 80))  # Hauswand
    sd.rectangle([90, 280, 210, int(scr.height * 0.72)], fill=(110, 70, 50))  # Tür
    # Person in Farbe
    walk = 380 - 60 * ease(t / 1.5)
    base = int(scr.height * 0.86)
    sd.ellipse([walk - 40, base - 330, walk + 40, base - 250], fill=(225, 180, 150))
    sd.rounded_rectangle([walk - 65, base - 250, walk + 65, base - 70], 35, fill=(200, 60, 60))
    sd.rounded_rectangle([walk - 55, base - 80, walk + 55, base], 20, fill=(50, 60, 110))
    img.paste(scr.convert("RGB"), (sx0, sy0))
    d = ImageDraw.Draw(img)
    d.text((sx0 + 20, sy0 + 15), "● LIVE  Garten", font=font(30), fill=RED)
    if t > 0.9:
        q = ease((t - 0.9) / 0.3)
        fx, fy = sx0 + walk, sy0 + base - 290
        r = 70 + 30 * (1 - q)
        d.rectangle([fx - r, fy - r, fx + r, fy + r], outline=YELLOW, width=6)
        d.text((fx - r, fy - r - 42), "Gesicht erkannt", font=font(30), fill=YELLOW)
    # Push-Benachrichtigung
    if t > 1.5:
        q = back((t - 1.5) / 0.4)
        ny = py0 + 940 + (1 - q) * 200
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        a = int(255 * min(1, q))
        ld.rounded_rectangle([px0 + 40, ny, px1 - 40, ny + 200], 40, fill=(245, 247, 252, a))
        ld.ellipse([px0 + 70, ny + 55, px0 + 160, ny + 145], fill=CYAN + (a,))
        ld.text((px0 + 185, ny + 45), "Person erkannt", font=font(42), fill=NIGHT_TOP + (a,))
        ld.text((px0 + 185, ny + 110), "Garten · gerade eben", font=font(32, bold=False), fill=(90, 100, 120, a))
        img.alpha_composite(layer)


def s_cta(img, t, dur):
    k = back(t / 0.5)
    paste(img, CAM, W / 2, 620 + math.sin(t * 2.5) * 8, scale=0.85 * max(0.05, k))
    a = 255 * min(1, max(0, k))
    text(img, 1060, "Link in den\nKommentaren", 120, fill=CYAN, alpha=a)
    text(img, 1360, "eufyCam C37 · Solar · ohne Abo", 50, alpha=255 * ease((t - 0.3) / 0.4))
    if t > 0.6:
        al = ease((t - 0.6) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1580 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + NIGHT_BOT[i] * (1 - al)) for i, v in enumerate(CYAN)))
    if t > 1.0:
        pill(img, W / 2, 1800, "Folgen für mehr Must-haves", 40, WHITE, fg=NIGHT_TOP, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.8, s_hook), (3.2, s_reveal), (5.4, s_features), (3.4, s_demo), (3.8, s_cta)]


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
