import {mountDiscUI} from './disc-ui.js';
import {PlaybackQueue, formatTime, matchesTrack, normalizeSong, safeHttpsUrl} from './core.js';
import {searchStations, recordStationClick} from './radio.js';
import {getImportedTracks, saveImportedTrack, deleteImportedTrack} from './library.js';

const $ = id => document.getElementById(id);
const audio = $('audioPlayer');
const queue = new PlaybackQueue();
let discUI;
const knownTracks = new Map();
let radioClickRecorded = false;
let library = [], stations = [], view = 'home', playlistId = '', query = '', radioTag = '', radioOffset = 0;
let radioController, radioLoading = false, currentTrack = null, playRequest = 0, seeking = false, toastTimer, searchTimer, trackForPlaylist = null;
let favorites = new Map(), playlists = [], storageNoticeShown = false;
const STORAGE_KEY = 'music-player-v2';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* Private/restricted browsers still play music. */ }
if (Array.isArray(saved.favorites)) for (const track of saved.favorites) {
    if (track && typeof track.id === 'string' && (track.source === 'catalog' || track.source === 'upload' || (track.source === 'radio' && safeHttpsUrl(track.url)))) favorites.set(track.id, track);
}
if (Array.isArray(saved.radioTracks)) for (const track of saved.radioTracks) {
    if (track?.source === 'radio' && typeof track.id === 'string' && safeHttpsUrl(track.url)) knownTracks.set(track.id, track);
}
if (Array.isArray(saved.playlists)) playlists = saved.playlists.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.trackIds)).map(item => ({...item, trackIds: item.trackIds.filter(id => typeof id === 'string')}));
queue.shuffle = saved.shuffle === true;
queue.repeat = ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off';
audio.volume = Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.8;
let previousVolume = audio.volume || 0.8;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', 'static/icons.svg#' + name);
    svg.append(use);
    return svg;
}
function iconButton(name, label, action) {
    const button = el('button', 'icon-button');
    button.type = 'button'; button.setAttribute('aria-label', label); button.title = label;
    button.append(icon(name)); button.addEventListener('click', action);
    return button;
}
function colorIndex(track) { return [...track.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4; }
function artwork(track, extra = '') {
    const art = el('div', `artwork cover-${colorIndex(track)} ${extra}`);
    art.setAttribute('aria-hidden', 'true');
    art.append(icon(track.source === 'radio' ? 'radio' : 'music'));
    if (track.artwork && safeHttpsUrl(track.artwork)) {
        const image = el('img'); image.src = track.artwork; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), {once: true}); art.append(image);
    }
    return art;
}
function notify(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function playbackStatus(message = '') { $('playerStatus').textContent = message; $('playerStatus').hidden = !message; updateDiscUI(); }
function persist() {
    const durable = track => !(track.source === 'upload' && !track.persistent);
    const compact = track => { const copy = {...track}; if (copy.source === 'upload') delete copy.url; return copy; };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            favorites: [...favorites.values()].filter(durable).map(compact),
            playlists: playlists.map(item => ({...item, trackIds: item.trackIds.filter(id => !knownTracks.has(id) || durable(knownTracks.get(id)))})),
            radioTracks: [...new Set(playlists.flatMap(item => item.trackIds))].map(resolveTrack).filter(track => track?.source === 'radio').map(compact),
            volume: audio.volume, shuffle: queue.shuffle, repeat: queue.repeat
        }));
    } catch {
        if (!storageNoticeShown) { storageNoticeShown = true; notify('This browser cannot save preferences. Favorites and playlists will last for this session.'); }
    }
}
function resolveTrack(id) {
    const track = knownTracks.get(id) || (favorites.get(id)?.source === 'radio' ? favorites.get(id) : null);
    if (track) knownTracks.set(id, track);
    return track;
}
function displayedTracks() {
    let tracks = library;
    if (view === 'favorites') tracks = [...favorites.keys()].map(resolveTrack).filter(Boolean);
    if (view === 'playlist') tracks = (playlists.find(item => item.id === playlistId)?.trackIds || []).map(resolveTrack).filter(Boolean);
    return tracks.filter(track => matchesTrack(track, query));
}
function toggleFavorite(track) {
    if (favorites.has(track.id)) favorites.delete(track.id); else favorites.set(track.id, track);
    persist(); render(); updateNowPlaying();
}
function favoriteButton(track) {
    const liked = favorites.has(track.id);
    const button = iconButton('heart', `${liked ? 'Remove' : 'Add'} ${track.title} ${liked ? 'from' : 'to'} favorites`, () => toggleFavorite(track));
    button.setAttribute('aria-pressed', String(liked)); return button;
}
function trackActions(track, allowRemove = false) {
    const actions = el('div', 'track-actions');
    actions.append(favoriteButton(track), iconButton('plus', `Add ${track.title} to queue`, () => addToQueue(track)), iconButton('list', `Add ${track.title} to playlist`, () => openPlaylistDialog(track)));
    if (allowRemove) actions.append(iconButton('close', `Remove ${track.title} from playlist`, () => {
        const playlist = playlists.find(item => item.id === playlistId);
        playlist.trackIds = playlist.trackIds.filter(id => id !== track.id); persist(); render();
    }));
    else if (view === 'library' && track.source === 'upload') actions.append(iconButton('close', `Remove ${track.title} from your device`, () => removeImportedTrack(track)));
    return actions;
}
function addToQueue(track) {
    queue.add(track);
    if (!currentTrack) loadTrack(queue.current, false);
    renderQueue(); notify(`Added “${track.title}” to the queue.`);
}
function renderCollection() {
    $('collectionCards').replaceChildren();
    for (const track of library.filter(track => matchesTrack(track, query)).slice(0, 3)) {
        const card = el('article', 'collection-card');
        const button = el('button', 'collection-cover-button');
        button.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);
        const cover = artwork(track), play = el('span', 'cover-play'); play.append(icon('play')); cover.append(play); button.append(cover);
        button.addEventListener('click', () => playFrom(library, track.id));
        const title = el('div', 'collection-card-title'); title.append(el('h3', '', track.title));
        const actions = el('div', 'collection-card-actions'); actions.append(favoriteButton(track), iconButton('plus', `Add ${track.title} to queue`, () => addToQueue(track)), iconButton('list', `Add ${track.title} to playlist`, () => openPlaylistDialog(track)));
        card.append(button, title, el('p', '', track.artist), actions); $('collectionCards').append(card);
    }
    $('playCollectionBtn').disabled = !library.length;
}
function renderTrackList() {
    const tracks = displayedTracks();
    const playlist = playlists.find(item => item.id === playlistId);
    $('listHeading').textContent = view === 'favorites' ? 'Your favorites' : view === 'playlist' ? playlist?.name || 'Playlist' : 'Your library';
    $('listDescription').textContent = view === 'favorites' ? 'The songs and stations you keep coming back to.' : view === 'playlist' ? 'A mix that sounds like you.' : 'Your collection, plus the files you add from your device.';
    $('listCount').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    $('playListBtn').disabled = !tracks.length;
    $('deletePlaylistBtn').hidden = view !== 'playlist';
    $('trackList').replaceChildren();
    for (const [index, track] of tracks.entries()) {
        const row = el('div', `track-row${currentTrack?.id === track.id ? ' active' : ''}`);
        const button = el('button', 'track-main'); button.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);
        const text = el('span', 'track-text'); text.append(el('strong', '', track.title), el('small', '', track.artist)); button.append(artwork(track), text);
        button.addEventListener('click', () => playFrom(tracks, track.id));
        const actions = trackActions(track, view === 'playlist');
        const time = el('span', 'track-duration', track.source === 'radio' ? 'LIVE' : track.duration ? formatTime(track.duration) : '—'); actions.prepend(time);
        row.append(el('span', 'track-number', String(index + 1).padStart(2, '0')), button, el('span', 'track-album', track.album), actions);
        $('trackList').append(row);
    }
    $('emptyState').hidden = tracks.length > 0;
    $('emptyTitle').textContent = query ? 'No matching tracks' : view === 'library' ? 'Make room for your music' : 'Nothing here yet';
    $('emptyDescription').textContent = query ? 'Try another title or artist.' : view === 'library' ? 'Use Add your music to choose audio files from this device.' : 'Use the heart to save favorites, or the playlist button to build a mix.';
    // Keep saved playlists reachable on a phone, where the sidebar is compact.
    document.querySelector('.mobile-playlists')?.remove();
    if (view === 'library' && playlists.length) {
        const section = el('section', 'mobile-playlists'); section.append(el('h2', '', 'Your playlists'));
        const list = el('div', 'playlist-grid');
        for (const item of playlists) {
            const button = el('button', 'mobile-playlist'); button.append(icon('list'), el('span', '', item.name));
            button.addEventListener('click', () => changeView('playlist', item.id)); list.append(button);
        }
        section.append(list); $('libraryView').append(section);
    }
}
function renderRadio() {
    $('radioCards').replaceChildren();
    for (const track of stations) {
        const card = el('article', 'radio-card');
        const button = el('button', 'radio-play'); button.setAttribute('aria-label', `Play ${track.title} live radio`);
        const details = el('span', 'radio-details');
        details.append(el('strong', '', track.title), el('small', '', `${countryName(track.artist)} · ${track.tags?.[0] || 'Live radio'}`));
        button.append(artwork(track), details); button.addEventListener('click', () => playFrom(stations, track.id));
        const actions = el('div', 'radio-card-actions'); actions.append(favoriteButton(track), iconButton('plus', `Add ${track.title} to queue`, () => addToQueue(track)));
        card.append(button, actions); $('radioCards').append(card);
    }
}
function countryName(code) { try { return new Intl.DisplayNames(['en'], {type: 'region'}).of(code) || code; } catch { return code; } }
function renderPlaylists() {
    $('playlistNav').replaceChildren();
    for (const item of playlists) {
        const button = el('button', `playlist-link${view === 'playlist' && playlistId === item.id ? ' active' : ''}`);
        button.append(icon('list'), el('span', '', item.name)); button.addEventListener('click', () => changeView('playlist', item.id)); $('playlistNav').append(button);
    }
    $('playlistHint').hidden = playlists.length > 0;
}
function render() {
    $('libraryCount').textContent = library.length; $('favoriteCount').textContent = [...favorites.keys()].filter(resolveTrack).length;
    renderCollection(); renderTrackList(); renderPlaylists(); renderRadio(); renderQueue(); updateDiscUI();
}
function changeView(nextView, id = '') {
    const previousView = view;
    view = nextView; playlistId = id;
    $('homeView').hidden = view !== 'home'; $('libraryView').hidden = view === 'home';
    const title = view === 'home' ? 'Listen' : view === 'library' ? 'Your library' : view === 'favorites' ? 'Favorites' : playlists.find(item => item.id === id)?.name || 'Playlist';
    $('viewBreadcrumb').textContent = title;
    document.querySelectorAll('.nav-item[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); });
    render(); $('main').scrollTop = 0;
    $('searchInput').placeholder = view === 'home' ? 'Search music or radio' : 'Search your collection';
    if (view === 'home' && previousView !== 'home') void loadRadio();
}

function renderQueue() {
    $('queueList').replaceChildren(); $('queueCount').textContent = `${queue.items.length} ${queue.items.length === 1 ? 'track' : 'tracks'}`;
    $('queueEmpty').hidden = queue.items.length > 0;
    queue.items.forEach((track, index) => {
        const row = el('div', `queue-item${index === queue.index ? ' current' : ''}`);
        const button = el('button', 'queue-track'); button.setAttribute('aria-label', `Play ${track.title} from queue`);
        const text = el('span', 'queue-text'); text.append(el('strong', '', track.title), el('small', '', index === queue.index ? 'Now playing' : track.artist));
        button.append(artwork(track), text); button.addEventListener('click', () => { const next = queue.jump(index); if (next) loadTrack(next, true); }); row.append(button);
        if (index !== queue.index) row.append(iconButton('close', `Remove ${track.title} from queue`, () => { queue.remove(index); renderQueue(); }));
        $('queueList').append(row);
    });
}
function updateDiscUI() {
    discUI?.update({
        library: displayedTracks(), queue: queue.items, current: currentTrack,
        libraryVisible: view !== 'home', popupOpen: $('playerDialog').open, paused: audio.paused,
        shuffle: queue.shuffle, repeat: queue.repeat, favorite: !!currentTrack && favorites.has(currentTrack.id),
        position: audio.currentTime, duration: audio.duration, volume: audio.muted ? 0 : Math.round(audio.volume * 100),
        status: $('playerStatus').textContent
    });
}
function updateNowPlaying() {
    if (!currentTrack) return;
    $('nowTitle').textContent = $('playerTitle').textContent = currentTrack.title;
    $('nowArtist').textContent = $('playerArtist').textContent = currentTrack.artist;
    $('nowSource').textContent = currentTrack.source === 'radio' ? `LIVE RADIO${currentTrack.bitrate ? ' · ' + currentTrack.bitrate + ' KBPS' : ''}` : currentTrack.source === 'upload' ? 'ON THIS DEVICE' : 'YOUR COLLECTION';
    const website = $('stationWebsite'); website.hidden = !currentTrack.homepage; if (currentTrack.homepage) website.href = currentTrack.homepage;
    const liked = favorites.has(currentTrack.id);
    for (const id of ['nowFavoriteBtn', 'playerFavoriteBtn']) {
        const button = $(id); button.disabled = false; button.setAttribute('aria-pressed', String(liked)); button.setAttribute('aria-label', `${liked ? 'Remove' : 'Add'} current track ${liked ? 'from' : 'to'} favorites`);
    }
}
function updateTransport() {
    updateDiscUI();
    $('playBtn').replaceChildren(icon(audio.paused ? 'play' : 'pause')); $('playBtn').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    for (const id of ['playBtn', 'prevBtn', 'nextBtn']) $(id).disabled = !currentTrack;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = currentTrack ? audio.paused ? 'paused' : 'playing' : 'none';
}
function loadTrack(track, autoplay) {
    if (!track?.url) return;
    playRequest++; currentTrack = track; seeking = false; playbackStatus();
    audio.pause(); audio.preload = track.source === 'radio' ? 'none' : 'metadata'; audio.src = track.url; audio.load();
    radioClickRecorded = false;
    $('progressBar').value = 0; $('progressBar').disabled = true; $('currentTime').textContent = track.source === 'radio' ? 'LIVE' : '0:00'; $('duration').textContent = track.source === 'radio' ? '∞' : '0:00'; fillSlider($('progressBar'));
    for (const [id, extra] of [['largeArtwork', 'now-art'], ['miniArtwork', 'mini-art']]) { const art = artwork(track, extra); art.id = id; $(id).replaceWith(art); }
    updateNowPlaying(); renderQueue(); renderTrackList(); updateTransport(); updateMediaSession();
    if (autoplay) void play();
}
function playFrom(tracks, id) { const track = queue.start(tracks, id); if (track) loadTrack(track, true); }
async function play() {
    if (!currentTrack) return;
    const request = ++playRequest;
    try {
        await audio.play();
        if (request === playRequest) {
            playbackStatus(); updateTransport();
            if (currentTrack.source === 'radio' && !radioClickRecorded) { radioClickRecorded = true; recordStationClick(currentTrack.stationuuid); }
        }
    } catch (error) {
        if (request !== playRequest || error.name === 'AbortError') return;
        updateTransport();
        playbackStatus(error.name === 'NotAllowedError' ? 'Tap Play to start listening.' : currentTrack.source === 'radio' ? 'This station could not be played. Try another station or your library.' : 'This file could not be played. Try another track or a supported audio file.');
    }
}
function pause() { playRequest++; audio.pause(); playbackStatus(); updateTransport(); }
function next(ended = false) { const track = queue.next({ended}); if (track) loadTrack(track, true); else { audio.pause(); updateTransport(); } }
function previous() {
    if (currentTrack?.source !== 'radio' && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const track = queue.previous(); if (track) loadTrack(track, true);
}
function fillSlider(slider) { slider.style.backgroundSize = `${slider.value}% 100%`; }
function updateProgress() {
    updateDiscUI();
    if (seeking || !currentTrack) return;
    const seekable = currentTrack.source !== 'radio' && Number.isFinite(audio.duration) && audio.duration > 0;
    $('progressBar').disabled = !seekable;
    $('currentTime').textContent = currentTrack.source === 'radio' ? 'LIVE' : formatTime(audio.currentTime);
    $('duration').textContent = currentTrack.source === 'radio' ? '∞' : formatTime(audio.duration);
    $('progressBar').value = seekable ? audio.currentTime / audio.duration * 100 : 0; fillSlider($('progressBar'));
    if (seekable && currentTrack.duration !== audio.duration) { currentTrack.duration = audio.duration; }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        try { navigator.mediaSession.setPositionState(seekable ? {duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate} : undefined); } catch { /* Browser support varies. */ }
    }
}
function updateVolume() {
    updateDiscUI();
    const volume = audio.muted ? 0 : Math.round(audio.volume * 100);
    $('volumeBar').value = volume; $('volumeValue').textContent = `${volume}%`; fillSlider($('volumeBar'));
    $('muteBtn').replaceChildren(icon(volume === 0 ? 'mute' : 'volume')); $('muteBtn').setAttribute('aria-label', volume === 0 ? 'Unmute' : 'Mute'); $('muteBtn').setAttribute('aria-pressed', String(volume === 0));
}
function toggleMute() {
    if (audio.muted || audio.volume === 0) { audio.muted = false; if (audio.volume === 0) audio.volume = previousVolume; }
    else { previousVolume = audio.volume; audio.muted = true; }
    updateVolume(); persist();
}
function updateModes() {
    updateDiscUI();
    $('shuffleBtn').setAttribute('aria-pressed', String(queue.shuffle));
    $('repeatBtn').setAttribute('aria-pressed', String(queue.repeat !== 'off'));
    $('repeatBtn').setAttribute('aria-label', 'Repeat ' + queue.repeat); $('repeatBtn').title = 'Repeat ' + queue.repeat;
    $('repeatBtn').replaceChildren(icon(queue.repeat === 'one' ? 'one' : 'repeat'));
}
function updateMediaSession() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const data = {title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album};
    if (currentTrack.artwork) data.artwork = [{src: currentTrack.artwork}];
    navigator.mediaSession.metadata = new MediaMetadata(data);
}

async function loadRadio(append = false) {
    radioController?.abort(); radioController = new AbortController();
    const controller = radioController;
    radioLoading = true; $('radioCards').setAttribute('aria-busy', 'true');
    $('radioStatus').classList.remove('error'); $('radioStatus').textContent = append ? 'Finding more stations…' : 'Finding your next favorite station…';
    $('retryRadioBtn').hidden = true; $('moreRadioBtn').disabled = true;
    if (!append) { radioOffset = 0; stations = []; renderRadio(); }
    try {
        const result = await searchStations({query, tag: radioTag, country: $('countryFilter').value, offset: radioOffset, signal: controller.signal});
        if (controller !== radioController) return;
        for (const track of result.tracks) knownTracks.set(track.id, track);
        stations = [...new Map([...stations, ...result.tracks].map(track => [track.id, track])).values()];
        radioOffset += 36; $('moreRadioBtn').hidden = !result.hasMore;
        $('radioStatus').textContent = stations.length ? '' : 'No playable stations found. Try another search, genre, or country.';
        renderRadio();
    } catch (error) {
        if (controller.signal.aborted) return;
        $('radioStatus').textContent = 'Radio is temporarily unavailable. Your library still works. Try again in a moment.';
        $('radioStatus').classList.add('error'); $('retryRadioBtn').hidden = false; $('moreRadioBtn').hidden = true;
    } finally {
        if (controller === radioController) { radioLoading = false; $('radioCards').setAttribute('aria-busy', 'false'); $('moreRadioBtn').disabled = false; }
    }
}
function openPlaylistDialog(track = null) {
    trackForPlaylist = track;
    $('playlistDialogTitle').textContent = track ? 'Add to a playlist' : 'Create a playlist';
    $('playlistSelect').replaceChildren(new Option('Create new playlist', 'new'));
    if (track) for (const playlist of playlists) $('playlistSelect').append(new Option(playlist.name, playlist.id));
    $('playlistSelectLabel').hidden = !track || !playlists.length;
    $('playlistNameLabel').hidden = false; $('playlistName').value = ''; $('playlistName').required = true; $('playlistDialogStatus').textContent = '';
    $('playlistDialog').showModal();
    $('playlistName').focus();
}
function setQueueOpen(open) {
    document.body.classList.toggle('queue-open', open);
    $('queueBtn').setAttribute('aria-expanded', String(open)); $('queueNav').setAttribute('aria-expanded', String(open));
    if (open && matchMedia('(max-width: 1250px)').matches) $('closeQueueBtn').focus();
}
function importedRecordToTrack(record) {
    return {...record, blob: undefined, url: URL.createObjectURL(record.blob), persistent: true};
}
async function importFiles(files) {
    const supported = [...files].filter(file => /\.(mp3|mp4|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(file.name));
    if (!supported.length) { notify('Choose an MP3, M4A, WAV, OGG, FLAC, or MP4 file.'); return; }
    let added = 0, sessionOnly = 0;
    for (const file of supported) {
        const duplicate = library.some(track => track.source === 'upload' && track.filename === file.name && track.size === file.size && track.lastModified === file.lastModified);
        if (duplicate) continue;
        const record = {id: 'upload:' + crypto.randomUUID(), source: 'upload', title: file.name.replace(/\.[^.]+$/, ''), artist: 'On this device', album: 'Imported music', filename: file.name, size: file.size, lastModified: file.lastModified, type: /\.(mp4|webm)$/i.test(file.name) ? 'video' : 'audio', blob: file, artwork: '', duration: 0};
        let persistent = true;
        try { await saveImportedTrack(record); } catch { persistent = false; sessionOnly++; }
        const track = {...record, blob: undefined, url: URL.createObjectURL(file), persistent};
        library.push(track); knownTracks.set(track.id, track); added++;
    }
    render();
    if (!currentTrack && library.length) { queue.start(library, library[0].id); loadTrack(queue.current, false); }
    notify(added ? `Added ${added} ${added === 1 ? 'track' : 'tracks'}.${sessionOnly ? ' Browser storage is full or unavailable; new files will last for this session.' : ' Saved on this device.'}` : 'Those files are already in your library.');
    $('fileInput').value = '';
}
async function removeImportedTrack(track) {
    try { if (track.persistent) await deleteImportedTrack(track.id); } catch { notify('Could not remove this file from browser storage. Please try again.'); return; }
    if (currentTrack?.id === track.id) { pause(); audio.removeAttribute('src'); audio.load(); currentTrack = null; queue.start([], ''); }
    else {
        for (let i = queue.items.length - 1; i >= 0; i--) if (queue.items[i].id === track.id) queue.remove(i);
    }
    URL.revokeObjectURL(track.url); knownTracks.delete(track.id); favorites.delete(track.id);
    library = library.filter(item => item.id !== track.id);
    for (const playlist of playlists) playlist.trackIds = playlist.trackIds.filter(id => id !== track.id);
    persist(); render(); updateTransport();
    if (!currentTrack && library.length) { queue.start(library, library[0].id); loadTrack(queue.current, false); }
    if (!currentTrack) {
        $('nowTitle').textContent = 'Pick your first track'; $('playerTitle').textContent = 'Nothing playing yet'; $('playerArtist').textContent = ''; $('nowArtist').textContent = 'Add music to start listening.';
        $('nowFavoriteBtn').disabled = $('playerFavoriteBtn').disabled = true; $('progressBar').disabled = true;
    }
    notify('Removed from this device.');
}
async function initializeLibrary() {
    const messages = [];
    try {
        const response = await fetch('songs.json');
        if (!response.ok) throw new Error('Catalog unavailable');
        const catalog = await response.json();
        if (!Array.isArray(catalog)) throw new Error('Invalid catalog');
        library = [...new Map([...catalog.map(normalizeSong).filter(Boolean), ...library].map(track => [track.id, track])).values()];
        for (const track of library) knownTracks.set(track.id, track);
    } catch { messages.push('The bundled collection could not load. You can still add files or explore radio.'); }
    render();
    if (library.length) { queue.start(library, library[0].id); loadTrack(queue.current, false); }
    try {
        const imports = await getImportedTracks();
        for (const record of imports) if (record.blob instanceof Blob && typeof record.id === 'string') {
            const track = importedRecordToTrack(record); library.push(track); knownTracks.set(track.id, track);
        }
        if (!currentTrack && library.length) { queue.start(library, library[0].id); loadTrack(queue.current, false); }
    } catch { messages.push('Browser storage is unavailable. Added files will play for this session.'); }
    $('libraryStatus').textContent = messages.join(' '); render();
}

$('playBtn').addEventListener('click', () => audio.paused ? void play() : pause());
$('nextBtn').addEventListener('click', () => next()); $('prevBtn').addEventListener('click', previous);
$('shuffleBtn').addEventListener('click', () => { queue.shuffle = !queue.shuffle; updateModes(); persist(); notify(queue.shuffle ? 'Shuffle is on.' : 'Shuffle is off.'); });
$('repeatBtn').addEventListener('click', () => { queue.repeat = {off: 'all', all: 'one', one: 'off'}[queue.repeat]; updateModes(); persist(); notify('Repeat ' + queue.repeat + '.'); });
$('volumeBar').addEventListener('input', () => { audio.muted = false; audio.volume = Number($('volumeBar').value) / 100; if (audio.volume) previousVolume = audio.volume; updateVolume(); persist(); });
$('muteBtn').addEventListener('click', toggleMute);
$('nowFavoriteBtn').addEventListener('click', () => { if (currentTrack) toggleFavorite(currentTrack); });
$('playerFavoriteBtn').addEventListener('click', () => { if (currentTrack) toggleFavorite(currentTrack); });
$('progressBar').addEventListener('pointerdown', () => { seeking = true; });
$('progressBar').addEventListener('input', () => { seeking = true; $('currentTime').textContent = formatTime(Number($('progressBar').value) / 100 * audio.duration); fillSlider($('progressBar')); });
$('progressBar').addEventListener('change', () => {
    if (currentTrack?.source !== 'radio' && Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number($('progressBar').value) / 100 * audio.duration;
    seeking = false; updateProgress();
});
window.addEventListener('pointerup', () => { seeking = false; });
window.addEventListener('pointercancel', () => { seeking = false; updateProgress(); });
$('progressBar').addEventListener('blur', () => { seeking = false; updateProgress(); });
for (const event of ['timeupdate', 'loadedmetadata', 'durationchange']) audio.addEventListener(event, updateProgress);
for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, updateTransport);
audio.addEventListener('ended', () => next(true));
audio.addEventListener('playing', () => playbackStatus());
audio.addEventListener('waiting', () => { if (!audio.paused) playbackStatus('Buffering…'); });
audio.addEventListener('error', () => { if (currentTrack) playbackStatus(currentTrack.source === 'radio' ? 'This station is unavailable or unsupported in this browser. Try another station.' : 'This file is unavailable or unsupported. Choose another track.'); updateTransport(); });
audio.addEventListener('volumechange', updateVolume);
$('playCollectionBtn').addEventListener('click', () => { if (library.length) playFrom(library, library[0].id); });
$('playListBtn').addEventListener('click', () => { const tracks = displayedTracks(); if (tracks.length) playFrom(tracks, tracks[0].id); });
$('browseRadioBtn').addEventListener('click', () => $('radioSection').scrollIntoView({behavior: 'smooth', block: 'start'}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
$('queueBtn').addEventListener('click', () => setQueueOpen(!document.body.classList.contains('queue-open')));
$('queueNav').addEventListener('click', () => setQueueOpen(true)); $('closeQueueBtn').addEventListener('click', () => { setQueueOpen(false); $('queueBtn').focus(); });
$('genreFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-tag]'); if (!button) return;
    radioTag = button.dataset.tag;
    $('genreFilters').querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    void loadRadio();
});
$('countryFilter').addEventListener('change', () => void loadRadio());
$('retryRadioBtn').addEventListener('click', () => void loadRadio());
$('moreRadioBtn').addEventListener('click', () => { if (!radioLoading) void loadRadio(true); });
function applySearch() { query = $('searchInput').value.trim(); renderCollection(); renderTrackList(); updateDiscUI(); if (view === 'home') void loadRadio(); }
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applySearch, 350); });
$('searchForm').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); applySearch(); });
$('createPlaylistBtn').addEventListener('click', () => openPlaylistDialog());
$('closePlaylistDialog').addEventListener('click', () => $('playlistDialog').close());
$('playlistSelect').addEventListener('change', () => { const isNew = $('playlistSelect').value === 'new'; $('playlistNameLabel').hidden = !isNew; $('playlistName').required = isNew; });
$('playlistForm').addEventListener('submit', event => {
    event.preventDefault();
    let playlist = playlists.find(item => item.id === $('playlistSelect').value);
    if (!playlist) {
        const name = $('playlistName').value.trim();
        if (!name) { $('playlistDialogStatus').textContent = 'Give your playlist a name.'; return; }
        playlist = {id: crypto.randomUUID(), name, trackIds: []}; playlists.push(playlist);
    }
    if (trackForPlaylist && !playlist.trackIds.includes(trackForPlaylist.id)) playlist.trackIds.push(trackForPlaylist.id);
    persist(); render(); $('playlistDialog').close(); notify(trackForPlaylist ? `Added to “${playlist.name}”.` : `Created “${playlist.name}”.`);
});
$('deletePlaylistBtn').addEventListener('click', () => {
    const playlist = playlists.find(item => item.id === playlistId); if (!playlist) return;
    playlists = playlists.filter(item => item.id !== playlistId); persist(); changeView('library'); notify(`Deleted “${playlist.name}”. Your music is still in the library.`);
});
for (const id of ['importBtn', 'mobileImportBtn']) $(id).addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', () => void importFiles($('fileInput').files));
let dragDepth = 0;
window.addEventListener('dragenter', event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files); });
window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !$('playlistDialog').open) { setQueueOpen(false); return; }
    if (event.defaultPrevented || event.target.closest('input, textarea, select, button, a, .dcc-root') || $('playlistDialog').open || $('playerDialog').open) return;
    if (event.code === 'Space' && currentTrack) { event.preventDefault(); audio.paused ? void play() : pause(); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); next(); }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); previous(); }
    else if (event.code === 'KeyM') toggleMute();
});
if ('mediaSession' in navigator) {
    const handlers = {play, pause, nexttrack: () => next(), previoustrack: previous,
        seekto: details => { if (currentTrack?.source !== 'radio' && Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, Math.max(0, details.seekTime)); },
        seekbackward: details => { if (currentTrack?.source !== 'radio') audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); },
        seekforward: details => { if (currentTrack?.source !== 'radio' && Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + (details.seekOffset || 10)); }};
    for (const [action, handler] of Object.entries(handlers)) try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported actions are optional. */ }
}
discUI = mountDiscUI($('libraryDiscRoot'), $('popupDiscRoot'), {
    playLibrary: id => playFrom(displayedTracks(), id),
    playQueue: id => { const index = queue.items.findIndex(track => track.id === id); if (index >= 0) loadTrack(queue.jump(index), true); },
    togglePlay: () => audio.paused ? void play() : pause(), previous, next: () => next(),
    shuffle: () => $('shuffleBtn').click(), repeat: () => $('repeatBtn').click(),
    favorite: () => { if (currentTrack) toggleFavorite(currentTrack); },
    seek: percent => { if (currentTrack?.source !== 'radio' && Number.isFinite(audio.duration) && audio.duration > 0) { audio.currentTime = Math.min(100, Math.max(0, percent)) / 100 * audio.duration; updateProgress(); } },
    volume: percent => { audio.muted = false; audio.volume = percent / 100; if (audio.volume) previousVolume = audio.volume; updateVolume(); persist(); }
});
$('openPlayerBtn').addEventListener('click', () => { setQueueOpen(false); $('playerDialog').showModal(); updateDiscUI(); });
$('closePlayerBtn').addEventListener('click', () => $('playerDialog').close());
$('playerDialog').addEventListener('close', () => { updateDiscUI(); $('openPlayerBtn').focus(); });
$('playerDialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...$('playerDialog').querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]')]
        .filter(control => control.tabIndex >= 0 && control.getClientRects().length && getComputedStyle(control).visibility !== 'hidden');
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
$('playerDialog').addEventListener('click', event => { if (event.target !== $('playerDialog')) return; const bounds = $('playerDialog').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('playerDialog').close(); });
updateVolume(); updateModes(); updateTransport();
void initializeLibrary();
void loadRadio();
