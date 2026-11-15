"""9:16-Produktvideo für die PULLUP & DIP Klimmzugstange für den Türrahmen (Angebot).

Aufruf:  python3 make_video_pullup.py   ->  out/pullup_dip_tuerreck.mp4
Die Stange ist generisch gezeichnet (keine Original-Grafik, kein Logo).
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

from make_video import W, H, FPS, font, ease, back, paste
from make_video_w1nnas import text, pill
from make_video_ck import sale_tag

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pullup_dip_tuerreck.mp4")

BG_TOP = (16, 22, 30)
BG_BOT = (30, 44, 58)
WHITE = (255, 255, 255)
ORANGE = (255, 120, 40)
TEAL = (40, 210, 190)
MUTED = (165, 180, 195)
WOOD = (190, 150, 110)
WALL = (60, 72, 88)


def make_bg():
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([500, 300, 1300, 1100], fill=ORANGE + (40,))
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    bg.paste(glow, (0, 0), glow)
    return bg


BG = make_bg()


def door_frame(d, cx, top, w=620, h=1150):
    d.rectangle([cx - w / 2 - 50, top - 50, cx + w / 2 + 50, top + h], fill=WOOD)
    d.rectangle([cx - w / 2, top, cx + w / 2, top + h], fill=(28, 34, 44))


def bar(d, cx, y, w=760):
    """Türreck: Stange mit gepolsterten Griffen und Bügeln."""
    # Bügel zum Einhängen
    for s in (-1, 1):
        x = cx + s * 250
        d.line([(x, y), (x + s * 30, y - 120)], fill=(70, 75, 85), width=22)
        d.line([(x + s * 30, y - 120), (x - s * 10, y - 150)], fill=(70, 75, 85), width=22)
    d.rounded_rectangle([cx - w / 2, y - 18, cx + w / 2, y + 18], 18, fill=(150, 155, 165))
    # gepolsterte Griffe
    for s in (-1, 1):
        d.rounded_rectangle([cx + s * 290 - 70, y - 28, cx + s * 290 + 70, y + 28], 28, fill=(25, 25, 28))
        for k in range(6):
            gx = cx + s * 290 - 55 + k * 22
            d.line([(gx, y - 24), (gx, y + 24)], fill=(55, 55, 60), width=3)
    d.rounded_rectangle([cx - 80, y - 26, cx + 80, y + 26], 26, fill=(25, 25, 28))


def athlete(d, cx, bar_y, lift):
    """Strichfigur am Reck. lift 0 = hängt, 1 = Kinn über Stange."""
    hang = 300
    shoulder_y = bar_y + hang - 230 * lift
    head_y = shoulder_y - 70
    hands = [(cx - 160, bar_y), (cx + 160, bar_y)]
    col = TEAL
    for hx, hy in hands:
        elbow = ((hx + cx) / 2 + (hx - cx) * 0.35 * lift, (hy + shoulder_y) / 2 + 40 * lift)
        d.line([(hx, hy), elbow], fill=col, width=22)
        d.line([elbow, (cx + (hx - cx) * 0.35, shoulder_y)], fill=col, width=22)
    d.ellipse([cx - 55, head_y - 55, cx + 55, head_y + 55], fill=col)
    d.line([(cx, shoulder_y), (cx, shoulder_y + 260)], fill=col, width=30)
    hip = shoulder_y + 260
    d.line([(cx, hip), (cx - 40, hip + 140), (cx - 10, hip + 260)], fill=col, width=24)
    d.line([(cx, hip), (cx + 40, hip + 140), (cx + 60, hip + 250)], fill=col, width=24)


# ---------------- Szenen ----------------

def s_hook(img, t, dur):
    k = ease(t / 0.5)
    text(img, 330 - 50 * (1 - k), "Kein Gym\nin der Nähe?", 108, alpha=255 * k)
    if t > 1.0:
        text(img, 800, "Dein Türrahmen\nreicht.", 96, fill=ORANGE, alpha=255 * ease((t - 1.0) / 0.4))
    if t > 0.5:
        d = ImageDraw.Draw(img)
        a = ease((t - 0.5) / 0.6)
        x0 = W / 2 - 150
        d.rectangle([x0 - 30, 1150, x0 + 330, 1750], fill=tuple(int(c * a + BG_BOT[i] * (1 - a)) for i, c in enumerate(WOOD)))
        d.rectangle([x0, 1180, x0 + 300, 1750], fill=BG_BOT)


def s_reveal(img, t, dur):
    k = ease(t / 0.4)
    text(img, 160, "PULLUP & DIP\nKlimmzugstange", 88, alpha=255 * k)
    d = ImageDraw.Draw(img)
    door_frame(d, W / 2, 620)
    y = 640 - 400 * (1 - ease((t - 0.3) / 0.8))
    bar(d, W / 2, y)
    if t > 1.1:
        q = ease((t - 1.1) / 0.3)
        d.text((W / 2 + 330, 520), "klick!", font=font(56), fill=TEAL + (int(255 * q),))
    if t > 1.4:
        pill(img, W / 2, 1450, "Einhängen – ohne Schrauben", 50, WHITE, fg=BG_TOP, scale=back((t - 1.4) / 0.4))
    if t > 1.8:
        sale_tag(img, W / 2, 1680, scale=0.9 * back((t - 1.8) / 0.4), rot=-5, label="ANGEBOT")


FEATURES = [
    ("Ohne Schrauben", "einfach in den Türrahmen einhängen"),
    ("Kein Abrutschen", "sitzt laut Hersteller sicher im Rahmen"),
    ("Gepolsterte Griffe", "angenehm für die Hände"),
    ("Pull-ups & mehr", "Profi-Türreck für Zuhause"),
]


def s_features(img, t, dur):
    text(img, 200, "Das kann sie:", 92)
    per = (dur - 0.6) / len(FEATURES)
    for i, (head, sub) in enumerate(FEATURES):
        st = 0.2 + i * per
        if t < st:
            continue
        k = ease((t - st) / 0.45)
        y = 460 + i * 300
        x = (1 - k) * -700
        a = int(255 * k)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([70 + x, y, W - 70 + x, y + 250], 45, fill=(255, 255, 255, int(a * 0.1)),
                            outline=(255, 255, 255, int(a * 0.3)), width=3)
        cx, cy = 175 + x, y + 125
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], fill=(ORANGE if i % 2 == 0 else TEAL) + (a,))
        d.line([(cx - 25, cy + 2), (cx - 5, cy + 24), (cx + 28, cy - 22)], fill=BG_TOP + (a,), width=14)
        d.text((265 + x, y + 50), head, font=font(58), fill=WHITE + (a,))
        d.text((265 + x, y + 140), sub, font=font(34, bold=False), fill=MUTED + (a,))
        img.alpha_composite(layer)


def s_demo(img, t, dur):
    d = ImageDraw.Draw(img)
    door_frame(d, W / 2, 520, h=1300)
    bar_y = 560
    period = 1.0
    ph = (t % period) / period
    lift = 0.5 - 0.5 * math.cos(ph * 2 * math.pi)
    athlete(d, W / 2, bar_y, lift)
    bar(d, W / 2, bar_y)
    reps = int(t / period) + (1 if ph > 0.5 else 0)
    text(img, 150, f"Wdh. {reps}", 110, fill=ORANGE)
    pill(img, W / 2, 1750, "Zuhause trainieren – jederzeit.", 46, ORANGE)


def s_cta(img, t, dur):
    k = back(t / 0.5)
    sale_tag(img, W / 2, 320, scale=1.1 * max(0.05, k), rot=-5 + math.sin(t * 4) * 2, label="ANGEBOT")
    if k > 0.1:
        d = ImageDraw.Draw(img)
        bar(d, W / 2, 720 + math.sin(t * 2.5) * 8)
    a = 255 * min(1, max(0, back((t - 0.2) / 0.5)))
    text(img, 960, "Link in den\nKommentaren", 116, fill=ORANGE, alpha=a)
    text(img, 1250, "Jetzt im Angebot – schnell sein!", 52, alpha=255 * ease((t - 0.5) / 0.4))
    if t > 0.7:
        al = ease((t - 0.7) / 0.3)
        bounce = math.sin(t * 7) * 18
        d = ImageDraw.Draw(img)
        cx, cy = W / 2, 1480 + bounce
        d.polygon([(cx, cy + 70), (cx - 70, cy), (cx - 25, cy), (cx - 25, cy - 80), (cx + 25, cy - 80), (cx + 25, cy), (cx + 70, cy)],
                  fill=tuple(int(v * al + BG_BOT[i] * (1 - al)) for i, v in enumerate(ORANGE)))
    if t > 1.0:
        pill(img, W / 2, 1720, "Folgen für mehr Must-haves", 40, WHITE, fg=BG_TOP, alpha=255 * ease((t - 1.0) / 0.4))


SCENES = [(2.6, s_hook), (3.2, s_reveal), (5.4, s_features), (3.2, s_demo), (4.0, s_cta)]


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
