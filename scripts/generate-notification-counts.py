from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BADGE_PATH = ROOT / "assets" / "notification-badge.png"
OUTPUT_PATH = ROOT / "assets" / "notification-counts.png"
CELL_SIZE = 64
RENDER_SIZE = 256


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


def render_badge(source: Image.Image, label: str) -> Image.Image:
    canvas = source.resize((RENDER_SIZE, RENDER_SIZE), Image.Resampling.LANCZOS)
    font_size = 146 if len(label) == 1 else 104 if len(label) == 2 else 72
    font = load_font(font_size)
    draw = ImageDraw.Draw(canvas)
    bounds = draw.textbbox((0, 0), label, font=font, stroke_width=2)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    x = (RENDER_SIZE - width) / 2 - bounds[0]
    y = (RENDER_SIZE - height) / 2 - bounds[1] - 4
    draw.text(
        (x, y),
        label,
        font=font,
        fill=(255, 255, 255, 255),
        stroke_width=2,
        stroke_fill=(151, 27, 68, 210),
    )
    return canvas.resize((CELL_SIZE, CELL_SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    source = Image.open(BADGE_PATH).convert("RGBA")
    sheet = Image.new("RGBA", (CELL_SIZE * 10, CELL_SIZE * 10), (0, 0, 0, 0))
    labels = [str(count) for count in range(1, 100)] + ["99+"]
    for index, label in enumerate(labels):
        x = (index % 10) * CELL_SIZE
        y = (index // 10) * CELL_SIZE
        sheet.alpha_composite(render_badge(source, label), (x, y))
    sheet.save(OUTPUT_PATH, optimize=True)
    print(f"Contadores gravados em {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
