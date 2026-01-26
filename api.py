from flask import Flask, jsonify, send_from_directory, abort, render_template
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable CORS for all routes

MUSIC_DIR = os.path.dirname(os.path.abspath(__file__))

def get_media_files():
    files = []
    # Sort files alphabetically
    sorted_files = sorted(os.listdir(MUSIC_DIR))
    for file in sorted_files:
        if file.lower().endswith(('.mp3', '.mp4')):
            files.append(file)
    return files

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/songs', methods=['GET'])
def list_songs():
    files = get_media_files()
    songs = []
    for f in files:
        songs.append({
            "filename": f,
            "title": f.replace('.mp3', '').replace('.mp4', ''),
            "url": f"/api/stream/{f}",
            "type": "video" if f.lower().endswith(".mp4") else "audio"
        })
    return jsonify(songs)

@app.route('/api/stream/<path:filename>')
def stream_music(filename):
    if not filename.lower().endswith(('.mp3', '.mp4')):
        abort(400)
    
    if not os.path.exists(os.path.join(MUSIC_DIR, filename)):
        abort(404)

    return send_from_directory(MUSIC_DIR, filename)

if __name__ == '__main__':
    print(f"Server starting. Serving files from {MUSIC_DIR}")
    print("Open http://localhost:5001 in your browser")
    app.run(debug=True, port=5001)
