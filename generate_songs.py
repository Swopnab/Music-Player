"""Regenerate the bundled catalog. The browser also supports importing device files."""
import json
import re
from pathlib import Path
from urllib.parse import quote

MUSIC_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = MUSIC_DIR / 'songs.json'
EXTENSIONS = {'.mp3', '.mp4', '.m4a', '.wav', '.ogg', '.opus', '.flac', '.aac'}


def metadata_for_file(file):
    title = file.stem
    artist = 'Local collection'
    album = 'Your collection'
    credit = ''
    if title.startswith('NCS - Copyright Free Music '):
        title = title.removeprefix('NCS - Copyright Free Music ')
        parts = title.split(' - ', 1)
        if len(parts) == 2:
            artist, title = parts
        title = re.sub(r'\s{2,}(?:Trap|Progressive House)$', '', title)
        album = 'NCS collection'
        credit = 'Music provided by NoCopyrightSounds. See README for artist credits.'
    return {'filename': file.name, 'title': title, 'artist': artist, 'album': album,
            'url': quote(file.name), 'type': 'video' if file.suffix.lower() == '.mp4' else 'audio',
            'credit': credit}


def generate_songs_json():
    previous = {}
    if OUTPUT_FILE.exists():
        try:
            previous = {item['filename']: item for item in json.loads(OUTPUT_FILE.read_text())}
        except (ValueError, KeyError, TypeError):
            pass
    songs = []
    for file in sorted(MUSIC_DIR.iterdir(), key=lambda item: item.name.lower()):
        if file.is_file() and file.suffix.lower() in EXTENSIONS:
            song = metadata_for_file(file)
            # Retain deliberately curated metadata on later regeneration.
            for key in ('artist', 'album', 'duration', 'homepage', 'credit'):
                if previous.get(file.name, {}).get(key):
                    song[key] = previous[file.name][key]
            songs.append(song)
    OUTPUT_FILE.write_text(json.dumps(songs, indent=2, ensure_ascii=False) + '\n')
    print(f'Wrote {len(songs)} tracks to {OUTPUT_FILE.name}')


if __name__ == '__main__':
    generate_songs_json()
