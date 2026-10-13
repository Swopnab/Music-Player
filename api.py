from flask import Flask, jsonify, send_from_directory, abort, render_template, url_for
from flask_cors import CORS
import os
from pathlib import Path
from generate_songs import metadata_for_file, EXTENSIONS

app = Flask(__name__, static_folder='static', template_folder='.')
CORS(app)  # Enable CORS for all routes

MUSIC_DIR = os.path.dirname(os.path.abspath(__file__))

def get_media_files():
    files = []
    # Sort files alphabetically
    sorted_files = sorted(os.listdir(MUSIC_DIR))
    for file in sorted_files:
        if Path(file).suffix.lower() in EXTENSIONS:
            files.append(file)
    return files

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/songs.json', methods=['GET'])
@app.route('/api/songs', methods=['GET'])
def list_songs():
    songs = []
    for filename in get_media_files():
        song = metadata_for_file(Path(filename))
        song['url'] = url_for('stream_music', filename=filename)
        songs.append(song)
    return jsonify(songs)

@app.route('/api/stream/<path:filename>')
def stream_music(filename):
    if Path(filename).suffix.lower() not in EXTENSIONS:
        abort(400)
    
    if not os.path.exists(os.path.join(MUSIC_DIR, filename)):
        abort(404)

    return send_from_directory(MUSIC_DIR, filename)

if __name__ == '__main__':
    print(f"Server starting. Serving files from {MUSIC_DIR}")
    print("Open http://localhost:5001 in your browser")
    app.run(debug=True, port=5001)
