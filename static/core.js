export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function safeHttpsUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
}

export function normalizeSong(song) {
    if (!song || typeof song.url !== 'string' || !song.url.trim()) return null;
    // The bundled catalog references files on this site, not arbitrary protocols.
    if (/^(?:[a-z]+:|\/\/)/i.test(song.url)) return null;
    const filename = song.filename || song.url;
    const rawTitle = song.title || filename.replace(/\.[^.]+$/, '');
    const clean = rawTitle.replace(/^NCS - Copyright Free Music\s+/i, '');
    const match = clean.match(/^(Elektronomia|JPB|Lost Sky) - (.+?)(?:\s{2,}.+)?$/);
    return {
        id: `catalog:${filename}`, url: song.url, title: match ? match[2] : clean,
        artist: song.artist || (match ? match[1] : 'Local collection'),
        album: song.album || 'Your collection', type: song.type === 'video' ? 'video' : 'audio',
        source: 'catalog', artwork: '', duration: Number(song.duration) || 0,
        credit: song.credit || '', homepage: safeHttpsUrl(song.homepage)
    };
}

export function normalizeStation(station) {
    const url = safeHttpsUrl(station?.url_resolved || station?.url);
    // Avoid insecure streams and HLS playlists (not supported by every browser natively).
    if (!url || !station.stationuuid || Number(station.hls) !== 0 || Number(station.lastcheckok) !== 1) return null;
    if (!/^(MP3|AAC\+?|OGG|OPUS|FLAC)$/i.test(station.codec || '')) return null;
    return {
        id: `radio:${station.stationuuid}`, stationuuid: station.stationuuid,
        title: String(station.name || 'Radio station').trim(),
        artist: station.countrycode || 'Worldwide', album: 'Live radio', source: 'radio', type: 'audio',
        url, artwork: safeHttpsUrl(station.favicon), homepage: safeHttpsUrl(station.homepage),
        tags: String(station.tags || '').split(',').filter(Boolean).slice(0, 3), bitrate: Number(station.bitrate) || 0
    };
}

export function matchesTrack(track, query) {
    return `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.trim().toLowerCase());
}

// A queue keeps its own order, so changing tabs or search results never changes playback.
export class PlaybackQueue {
    constructor() { this.items = []; this.index = -1; this.shuffle = false; this.repeat = 'off'; this.history = []; }
    get current() { return this.items[this.index] || null; }
    start(items, id) {
        this.items = [...items];
        this.index = this.items.findIndex(item => item.id === id);
        if (this.index < 0) this.index = this.items.length ? 0 : -1;
        this.history = [];
        return this.current;
    }
    add(track) { this.items.push(track); if (this.index < 0) this.index = 0; }
    jump(index) {
        if (index < 0 || index >= this.items.length) return null;
        if (this.index !== index) this.history.push(this.index);
        this.index = index;
        return this.current;
    }
    remove(index) {
        if (index === this.index || index < 0 || index >= this.items.length) return false;
        this.items.splice(index, 1);
        if (index < this.index) this.index--;
        this.history = this.history.filter(i => i !== index).map(i => i > index ? i - 1 : i);
        return true;
    }
    next({ ended = false, random = Math.random } = {}) {
        if (!this.current) return null;
        if (ended && this.repeat === 'one' && this.current.source !== 'radio') return this.current;
        if (this.shuffle && this.items.length > 1) {
            const other = this.items.map((_, i) => i).filter(i => i !== this.index);
            return this.jump(other[Math.min(other.length - 1, Math.floor(random() * other.length))]);
        }
        if (this.index + 1 < this.items.length) return this.jump(this.index + 1);
        if (this.repeat === 'all' || !ended) return this.jump(0);
        return null;
    }
    previous() {
        if (!this.current) return null;
        if (this.shuffle && this.history.length) { this.index = this.history.pop(); return this.current; }
        this.index = (this.index - 1 + this.items.length) % this.items.length;
        return this.current;
    }
}
