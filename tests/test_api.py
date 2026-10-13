import unittest
from api import app


class ServerCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_both_catalog_routes_return_browser_playable_urls(self):
        catalog = self.client.get('/songs.json')
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(catalog.json, self.client.get('/api/songs').json)
        self.assertEqual(len(catalog.json), 4)
        self.assertEqual(catalog.json[0]['title'], 'Sky High')
        response = self.client.get(catalog.json[0]['url'], headers={'Range': 'bytes=0-31'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(len(response.data), 32)
        response.close()

    def test_page_and_javascript_modules_are_served(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Your daily', response.data)
        for filename in ['app.js', 'core.js', 'radio.js', 'library.js']:
            response = self.client.get('/static/' + filename)
            self.assertEqual(response.status_code, 200)
            response.close()

    def test_streams_reject_non_media_and_missing_files(self):
        self.assertEqual(self.client.get('/api/stream/README.md').status_code, 400)
        self.assertEqual(self.client.get('/api/stream/missing.mp3').status_code, 404)
        self.assertNotEqual(self.client.get('/api/stream/../README.md').status_code, 200)


if __name__ == '__main__':
    unittest.main()
