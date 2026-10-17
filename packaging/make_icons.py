"""Generates the app icon (holodeck.png/.ico/.icns) in the HUD's neon style."""
import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
S = 1024


def gradient(size, c1, c2):
    """Diagonal gradient, c1 at the top-right fading to c2 at the bottom-left."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = ((w - xx) + yy) / float(w + h)
    rgb = np.stack([c1[i] + (c2[i] - c1[i]) * t for i in range(3)], axis=-1)
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Rounded tile with a deep navy radial glow.
    tile_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle((40, 40, S - 40, S - 40), radius=210, fill=255)
    bg = Image.radial_gradient("L").resize((S, S))
    tile = Image.merge("RGB", (bg.point(lambda v: 3 + (255 - v) // 28),
                               bg.point(lambda v: 6 + (255 - v) // 14),
                               bg.point(lambda v: 14 + (255 - v) // 7)))
    img.paste(tile, (0, 0), tile_mask)

    # Neon frame + "H" glyph, drawn as a mask and filled with the gradient.
    mark = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mark)
    d.rounded_rectangle((120, 120, S - 120, S - 120), radius=150, outline=255, width=26)
    d.rounded_rectangle((300, 270, 400, 754), radius=24, fill=255)
    d.rounded_rectangle((624, 270, 724, 754), radius=24, fill=255)
    d.rounded_rectangle((300, 462, 724, 562), radius=24, fill=255)
    for y in range(282, 754, 18):  # hologram scanlines through the glyph only
        d.line((300, y, 724, y), fill=0, width=3)
    neon = gradient((S, S), (0, 240, 255), (255, 47, 208))

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow.paste(neon, (0, 0), mark.filter(ImageFilter.GaussianBlur(28)))
    img = Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", (S, S)), tile_mask))
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    core.paste(neon, (0, 0), mark)
    img = Image.alpha_composite(img, core)
    hot = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    hot.putalpha(ImageChops.multiply(mark.filter(ImageFilter.GaussianBlur(2)), Image.new("L", (S, S), 90)))
    img = Image.alpha_composite(img, hot)

    img.save(os.path.join(OUT, "holodeck.png"))
    img.resize((256, 256), Image.LANCZOS).save(
        os.path.join(OUT, "holodeck.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    img.save(os.path.join(OUT, "holodeck.icns"))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
