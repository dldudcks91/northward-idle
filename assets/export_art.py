"""Export v2 and permanent-village art; preserve unchanged files and all v1 art."""

from pathlib import Path
import argparse
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'python'))
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--partial', action='store_true', help='Export available art without replacing the live manifest.')
args = parser.parse_args()
PORTRAITS = ['hero', 'bear', 'wolf', 'boar', 'stag', 'guardian']
REGIONS = ['rime-shore', 'pinewood', 'frozen-lake', 'black-bog', 'knife-mountains', 'aurora-ruins']
TOWNSHIP = ['town-village']
expected = set(PORTRAITS + ['region-' + region for region in REGIONS] + TOWNSHIP)
source_records = []
for filename in ['assets/generated-portraits-v2.json', 'assets/generated-environments-v2.json', 'assets/generated-township.json']:
    record_file = ROOT / filename
    if record_file.exists():
        loaded = json.loads(record_file.read_text(encoding='utf-8-sig'))
        source_records.extend(loaded if isinstance(loaded, list) else loaded['assets'])
actual_ids = [entry['id'] for entry in source_records]
if len(actual_ids) != len(set(actual_ids)):
    raise ValueError('Duplicate logical IDs in v2 generation records')
if not args.partial and set(actual_ids) != expected:
    raise ValueError('Full art set is incomplete: ' + ', '.join(sorted(expected - set(actual_ids))))
if set(actual_ids) - expected:
    raise ValueError('Unexpected logical v2 art IDs')

raw_dir = ROOT / 'assets/source/v2'
display_dir = ROOT / 'assets/images/v2'
raw_dir.mkdir(parents=True, exist_ok=True)
display_dir.mkdir(parents=True, exist_ok=True)
records = []
labels = {'hero': 'EXPLORER', 'bear': 'BROWN BEAR', 'wolf': 'GRAY WOLF', 'boar': 'WILD BOAR', 'stag': 'RED DEER', 'guardian': 'STONE GUARDIAN'}
reference_catalog = json.loads((ROOT / 'artifacts/reference/wos/sources.json').read_text(encoding='utf-8-sig'))
manifest_path = ROOT / 'assets/manifest.json'
previous_manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig')) if manifest_path.exists() else {}
previous_records = {row['id']: row for row in previous_manifest.get('assets', [])}


def normalize_reference(value):
    reference = dict(value) if isinstance(value, dict) else {'path': value, 'role': 'style only; not shipped or copied'}
    reference_path = Path(reference['path'])
    if reference_path.is_absolute():
        try:
            reference['path'] = reference_path.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            pass
    source_url = reference_catalog['images'].get(reference_path.name)
    if source_url:
        reference['url'] = source_url
    if reference.get('lineageAssetId') and (ROOT / reference['path']).exists():
        reference['sha256'] = hashlib.sha256((ROOT / reference['path']).read_bytes()).hexdigest()
    return reference

for entry in source_records:
    asset_id = entry['id']
    township = asset_id in TOWNSHIP
    asset_raw_dir = ROOT / 'assets/source/township' if township else raw_dir
    asset_display_dir = ROOT / 'assets/images/township' if township else display_dir
    asset_raw_dir.mkdir(parents=True, exist_ok=True)
    asset_display_dir.mkdir(parents=True, exist_ok=True)
    raw = asset_raw_dir / f'{asset_id}.png'
    if not raw.exists():
        shutil.copyfile(entry['source'], raw)
    display = asset_display_dir / f'{asset_id}.webp'
    previous = previous_records.get(asset_id)
    # Do not rewrite existing art when neither its original nor prompt changed.
    if (previous and display.exists()
            and previous['path'] == display.relative_to(ROOT).as_posix()
            and previous['sourcePath'] == raw.relative_to(ROOT).as_posix()
            and previous['sourceSha256'] == hashlib.sha256(raw.read_bytes()).hexdigest()
            and previous['sha256'] == hashlib.sha256(display.read_bytes()).hexdigest()
            and previous['generation']['prompt'] == entry['prompt']):
        records.append(previous)
        continue
    with Image.open(raw) as source_image:
        source_image.load()
        source_size = source_image.size
        portrait = asset_id in PORTRAITS
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
            raise ValueError(f'{asset_id}: portrait must have genuine partial transparency')
    image.thumbnail((512, 512) if portrait else (1600, 900), Image.Resampling.LANCZOS)
    image.save(display, 'WEBP', quality=96 if portrait else 89, method=6)
    with Image.open(display) as reopened:
        if reopened.size != image.size:
            raise ValueError(f'{asset_id}: export dimensions do not match')
        if portrait:
            if reopened.mode != 'RGBA' or reopened.getchannel('A').getextrema() != (0, 255):
                raise ValueError(f'{asset_id}: alpha was lost in export')
            if reopened.getchannel('A').tobytes() != image.getchannel('A').tobytes():
                raise ValueError(f'{asset_id}: export changed alpha values')
    records.append({
        'id': asset_id,
        'version': 2,
        'role': 'town-background' if township else ('region-background' if not portrait else ('hero-portrait' if asset_id == 'hero' else 'monster-portrait')),
        'regionId': asset_id.removeprefix('region-') if asset_id.startswith('region-') else None,
        'path': display.relative_to(ROOT).as_posix(),
        'sourcePath': raw.relative_to(ROOT).as_posix(),
        'dimensions': {'width': image.width, 'height': image.height},
        'sourceDimensions': {'width': source_size[0], 'height': source_size[1]},
        'format': 'webp',
        'bytes': display.stat().st_size,
        'sha256': hashlib.sha256(display.read_bytes()).hexdigest(),
        'sourceSha256': hashlib.sha256(raw.read_bytes()).hexdigest(),
        'transparent': portrait,
        'alphaRange': alpha_range,
        'sourceTransparentFraction': transparent_fraction,
        'sourceContentBounds': alpha_bounds,
        'generation': {
            'tool': 'built-in image_gen.imagegen',
            'date': entry.get('date', '2026-10-04'),
            'prompt': entry['prompt'],
            'referencedImages': [normalize_reference(reference) for reference in entry.get('refs', [])],
            'referenceSources': [normalize_reference(reference) for reference in entry.get('referenceSources', [])],
            'defaultToolSource': entry.get('generatedSource', entry['source']),
            'identityPolicy': 'Reference style only. New original subjects and scenes; no copied WOS characters, logos, screenshot UI or art files.',
        },
        'export': {'method': 'Pillow LANCZOS downscale; exact alpha retained; WebP RGB quality 96 portraits/89 landscapes', 'script': 'assets/export_art.py'},
    })

if not args.partial:
    first_region = next(row for row in records if row['id'] == 'region-rime-shore')
    alias = dict(first_region)
    alias.update({'id': 'landscape', 'role': 'background-alias', 'aliasOf': 'region-rime-shore'})
    manifest = {
        'version': 2,
        'updatedAt': '2026-10-05',
        'style': 'Cute rounded polished 3D winter-survival illustration; expressive large eyes, blue and cream snow palette, warm orange details.',
        'referenceGame': 'Whiteout Survival official hero and game imagery, rendering/composition reference only',
        'referenceSourcesPath': 'artifacts/reference/wos/sources.json',
        'previousVersionManifest': 'assets/archive/v1/manifest.json',
        'preTownshipManifest': 'assets/archive/v2-before-township/manifest.json',
        'uniqueAssetCount': len(records),
        'uniqueDisplayBytes': sum(row['bytes'] for row in records),
        'assets': records + [alias],
    }
    (ROOT / 'assets/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Inspection artifacts only; generated subjects/backgrounds are not edited.
portrait_sheet = Image.new('RGB', (1680, 700), '#e7f4fd')
draw = ImageDraw.Draw(portrait_sheet)
for index, asset_id in enumerate(PORTRAITS):
    display = display_dir / f'{asset_id}.webp'
    if not display.exists():
        continue
    x = (index % 3) * 560
    y = (index // 3) * 350
    draw.rounded_rectangle((x + 8, y + 8, x + 551, y + 341), radius=18, fill='#d1e9f7')
    draw.text((x + 20, y + 18), labels[asset_id], fill='#274866')
    with Image.open(display) as art:
        for size, offset in [(320, (18, 28)), (160, (356, 86)), (48, (412, 280))]:
            preview = art.convert('RGBA')
            preview.thumbnail((size, size), Image.Resampling.LANCZOS)
            portrait_sheet.paste(preview, (x + offset[0], y + offset[1]), preview)
    draw.text((x + 354, y + 255), '160px', fill='#426580')
    draw.text((x + 465, y + 292), '48px', fill='#426580')
portrait_sheet.save(ROOT / 'assets/preview-v2-portraits.png')

environment_sheet = Image.new('RGB', (1200, 738), '#e7f4fd')
draw = ImageDraw.Draw(environment_sheet)
for index, region_id in enumerate(REGIONS):
    display = display_dir / ('region-' + region_id + '.webp')
    if not display.exists():
        continue
    x = (index % 2) * 600
    y = (index // 2) * 246
    draw.text((x + 12, y + 10), region_id.upper(), fill='#274866')
    with Image.open(display) as art:
        preview = art.convert('RGB')
        preview.thumbnail((580, 214), Image.Resampling.LANCZOS)
        environment_sheet.paste(preview, (x + 10, y + 28))
environment_sheet.save(ROOT / 'assets/preview-v2-environments.png')

town_display = ROOT / 'assets/images/township/town-village.webp'
if town_display.exists():
    town_sheet = Image.new('RGB', (1200, 530), '#e7f4fd')
    draw = ImageDraw.Draw(town_sheet)
    draw.text((12, 10), 'PERMANENT BEACON VILLAGE - 800px / 384px', fill='#274866')
    with Image.open(town_display) as art:
        for size, position in [((800, 450), (10, 35)), ((384, 216), (808, 35))]:
            preview = art.convert('RGB')
            preview.thumbnail(size, Image.Resampling.LANCZOS)
            town_sheet.paste(preview, position)
    draw.text((812, 264), 'Mobile-scale facility silhouettes', fill='#426580')
    draw.text((12, 500), 'Inspection only: original/export unchanged; real controls belong to game code.', fill='#426580')
    town_sheet.save(ROOT / 'assets/preview-township.png')

print(json.dumps({'partial': args.partial, 'assets': [{'id': row['id'], 'path': row['path'], 'dimensions': row['dimensions'], 'bytes': row['bytes'], 'transparentFraction': row['sourceTransparentFraction']} for row in records], 'totalBytes': sum(row['bytes'] for row in records)}, indent=2))
