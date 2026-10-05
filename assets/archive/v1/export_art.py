"""Export original generated raster art without changing its subject or alpha."""

from pathlib import Path
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'python'))
from PIL import Image, ImageDraw

source_records = json.loads((ROOT / 'assets/generated-sources.json').read_text(encoding='utf-8'))
raw_dir = ROOT / 'assets/source'
display_dir = ROOT / 'assets/images'
raw_dir.mkdir(parents=True, exist_ok=True)
display_dir.mkdir(parents=True, exist_ok=True)
records = []
labels = {'hero': 'LONE TRAVELER', 'bear': 'BROWN BEAR', 'wolf': 'GRAY WOLF', 'boar': 'WILD BOAR', 'stag': 'RED DEER', 'guardian': 'STONE GUARDIAN', 'landscape': 'NORTHERN VALLEY'}

for entry in source_records:
    asset_id = entry['id']
    raw = raw_dir / f'{asset_id}.png'
    if not raw.exists():
        shutil.copyfile(entry['source'], raw)
    source_image = Image.open(raw)
    source_image.load()
    portrait = asset_id != 'landscape'
    image = source_image.convert('RGBA' if portrait else 'RGB')
    alpha_bounds = None
    alpha_range = None
    transparent_fraction = 0
    if portrait:
        alpha = image.getchannel('A')
        alpha_range = list(alpha.getextrema())
        transparent_fraction = round(alpha.histogram()[0] / (image.width * image.height), 5)
        alpha_bounds = list(alpha.getbbox())
        if alpha_range != [0, 255] or not (0.05 < transparent_fraction < 0.9):
            raise ValueError(f'{asset_id}: generated portrait must have genuine partial transparency')
    image.thumbnail((512, 512) if portrait else (1600, 900), Image.Resampling.LANCZOS)
    display = display_dir / f'{asset_id}.webp'
    image.save(display, 'WEBP', lossless=portrait, quality=100 if portrait else 88, method=6)
    with Image.open(display) as reopened:
        if reopened.size != image.size:
            raise ValueError(f'{asset_id}: export dimensions do not match')
        if portrait and reopened.getchannel('A').getextrema() != (0, 255):
            raise ValueError(f'{asset_id}: alpha was lost in export')
    records.append({
        'id': asset_id,
        'role': 'background' if not portrait else ('hero-portrait' if asset_id == 'hero' else 'monster-portrait'),
        'path': display.relative_to(ROOT).as_posix(),
        'sourcePath': raw.relative_to(ROOT).as_posix(),
        'dimensions': {'width': image.width, 'height': image.height},
        'sourceDimensions': {'width': source_image.width, 'height': source_image.height},
        'format': 'webp',
        'bytes': display.stat().st_size,
        'sha256': hashlib.sha256(display.read_bytes()).hexdigest(),
        'transparent': portrait,
        'alphaRange': alpha_range,
        'sourceTransparentFraction': transparent_fraction,
        'sourceContentBounds': alpha_bounds,
        'generation': {'tool': 'built-in image_gen.imagegen', 'date': '2026-10-04', 'prompt': entry['prompt'], 'referencedImages': [{'path': '../thesevensimulationrpg/src/assets/art/faces/gpt/hero/archer_1.webp', 'role': 'style only; identity and artwork not copied'}]},
        'export': {'method': 'Pillow LANCZOS downscale; alpha preserved; portrait lossless WebP; landscape WebP quality 88', 'script': 'assets/export_art.py'},
    })

manifest = {
    'version': 1,
    'updatedAt': '2026-10-04',
    'style': 'Dark fantasy cartoon busts; broad dark outlines, angular flat shading and muted colors; natural animal anatomy.',
    'referenceProject': 'TheSevenSimulationRPG, read-only style reference requested by the user',
    'assets': records,
}
(ROOT / 'assets/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Inspection only: transparent art is shown on the actual blue game background,
# at a generous preview size and at the smallest intended icon size.
sheet = Image.new('RGB', (960, 680), '#10283c')
draw = ImageDraw.Draw(sheet)
for index, record in enumerate(records[:6]):
    x = (index % 3) * 320
    y = (index // 3) * 340
    draw.text((x + 14, y + 14), labels[record['id']], fill='#cee5ee')
    with Image.open(ROOT / record['path']) as art:
        preview = art.convert('RGBA')
        preview.thumbnail((260, 260), Image.Resampling.LANCZOS)
        sheet.paste(preview, (x + 30, y + 42), preview)
        tiny = art.convert('RGBA')
        tiny.thumbnail((48, 48), Image.Resampling.LANCZOS)
        sheet.paste(tiny, (x + 253, y + 279), tiny)
    draw.text((x + 14, y + 309), '260px + 48px on blue', fill='#8fb0c1')
sheet.save(ROOT / 'assets/preview-on-blue.png')
print(json.dumps({'assets': [{'id': row['id'], 'path': row['path'], 'dimensions': row['dimensions'], 'bytes': row['bytes'], 'transparentFraction': row['sourceTransparentFraction']} for row in records], 'totalBytes': sum(row['bytes'] for row in records)}, indent=2))
