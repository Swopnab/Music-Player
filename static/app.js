const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const songList = document.getElementById('songList');
const currentTitle = document.getElementById('currentTitle');
const currentTitleLarge = document.getElementById('currentTitleLarge');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const volumeBar = document.getElementById('volumeBar');

let songs = [];
let currentSongIndex = 0;
let isPlaying = false;

// Format time (seconds -> MM:SS)
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

// Fetch Songs
async function fetchSongs() {
    try {
        const response = await fetch('/api/songs');
        songs = await response.json();
        renderSongList();
        if (songs.length > 0) {
            loadSong(0);
        }
    } catch (error) {
        console.error('Error fetching songs:', error);
    }
}

// Render Song List
function renderSongList() {
    songList.innerHTML = '';
    songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.className = 'song-item';
        li.innerHTML = `<i class="fa-solid fa-music"></i> ${song.title}`;
        li.onclick = () => {
            currentSongIndex = index;
            loadSong(currentSongIndex);
            playMusic();
        };
        songList.appendChild(li);
    });
}

// Load Song
function loadSong(index) {
    const song = songs[index];
    currentTitle.textContent = song.title;
    currentTitleLarge.textContent = song.title;
    audioPlayer.src = song.url;

    // Update active state in list
    const items = document.querySelectorAll('.song-item');
    items.forEach(item => item.classList.remove('active'));
    if (items[index]) items[index].classList.add('active');
}

// Play Music
function playMusic() {
    audioPlayer.play();
    isPlaying = true;
    playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
}

// Pause Music
function pauseMusic() {
    audioPlayer.pause();
    isPlaying = false;
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

// Toggle Play/Pause
playBtn.addEventListener('click', () => {
    if (isPlaying) {
        pauseMusic();
    } else {
        playMusic();
    }
});

// Next Song
function nextSong() {
    currentSongIndex++;
    if (currentSongIndex >= songs.length) {
        currentSongIndex = 0;
    }
    loadSong(currentSongIndex);
    playMusic();
}

// Prev Song
function prevSong() {
    currentSongIndex--;
    if (currentSongIndex < 0) {
        currentSongIndex = songs.length - 1;
    }
    loadSong(currentSongIndex);
    playMusic();
}

nextBtn.addEventListener('click', nextSong);
prevBtn.addEventListener('click', prevSong);

// Audio Events
audioPlayer.addEventListener('timeupdate', (e) => {
    const { duration, currentTime } = e.srcElement;
    const progressPercent = (currentTime / duration) * 100;
    progressBar.value = progressPercent;

    currentTimeEl.textContent = formatTime(currentTime);
    if (duration) {
        durationEl.textContent = formatTime(duration);
    }
});

audioPlayer.addEventListener('ended', nextSong);

// Progress Bar Click
progressBar.addEventListener('input', () => {
    const duration = audioPlayer.duration;
    audioPlayer.currentTime = (progressBar.value * duration) / 100;
});

// Volume Control
volumeBar.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value / 100;
});

// Init
fetchSongs();
