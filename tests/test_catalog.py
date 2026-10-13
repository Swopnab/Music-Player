import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import generate_songs


class CatalogTests(unittest.TestCase):
    def test_ncs_metadata_preserves_featured_artist_title(self):
        song = generate_songs.metadata_for_file(Path('NCS - Copyright Free Music Lost Sky - Dreams pt. II (feat. Sara Skinner)  Trap.mp3'))
        self.assertEqual(song['artist'], 'Lost Sky')
        self.assertEqual(song['title'], 'Dreams pt. II (feat. Sara Skinner)')
        self.assertEqual(song['album'], 'NCS collection')

    def test_url_encodes_reserved_filename_characters(self):
        song = generate_songs.metadata_for_file(Path('A song #1?.MP3'))
        self.assertEqual(song['url'], 'A%20song%20%231%3F.MP3')
        self.assertEqual(song['title'], 'A song #1?')

    def test_output_location_and_curated_metadata_survive_regeneration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'track.WAV').write_bytes(b'fixture')
            (root / 'ignored.txt').write_text('not music')
            output = root / 'songs.json'
            output.write_text(json.dumps([{'filename': 'track.WAV', 'artist': 'Custom artist', 'duration': 120}]))
            with patch.object(generate_songs, 'MUSIC_DIR', root), patch.object(generate_songs, 'OUTPUT_FILE', output):
                generate_songs.generate_songs_json()
            songs = json.loads(output.read_text())
            self.assertEqual(len(songs), 1)
            self.assertEqual(songs[0]['artist'], 'Custom artist')
            self.assertEqual(songs[0]['duration'], 120)


if __name__ == '__main__':
    unittest.main()
