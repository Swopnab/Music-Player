import os
import json

MUSIC_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = 'songs.json'

def generate_songs_json():
    files = []
    # Sort files alphabetically
    sorted_files = sorted(os.listdir(MUSIC_DIR))
    
    for file in sorted_files:
        if file.lower().endswith(('.mp3', '.mp4')):
            files.append({
                "filename": file,
                "title": file.replace('.mp3', '').replace('.mp4', ''),
                # For GitHub Pages, files are relative to root or in same dir
                "url": file, 
                "type": "video" if file.lower().endswith(".mp4") else "audio"
            })
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(files, f, indent=4)
    
    print(f"Successfully generated {OUTPUT_FILE} with {len(files)} songs.")

if __name__ == '__main__':
    generate_songs_json()
