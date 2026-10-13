import {normalizeStation} from './core.js';
const BOOTSTRAP = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info'];
let mirrors = [...BOOTSTRAP];
let discovery;
async function getJSON(base, path, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 6000);
    try {
        const response = await fetch(base + path, {signal: controller.signal});
        if (!response.ok) throw new Error(`Radio Browser returned ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}
async function discoverServers() {
    if (!discovery) discovery = (async () => {
        for (const base of BOOTSTRAP) {
            try {
                const servers = await getJSON(base, '/json/servers');
                const names = [...new Set(servers.map(server => server.name).filter(name => /^[a-z0-9-]+\.api\.radio-browser\.info$/i.test(name)))];
                if (names.length) mirrors = names.map(name => 'https://' + name).sort(() => Math.random() - 0.5);
                return;
            } catch { /* Try the next bootstrap host. */ }
        }
    })().catch(error => { discovery = null; throw error; });
    return discovery;
}
export async function radioRequest(path, signal) {
    await discoverServers();
    if (signal?.aborted) throw signal.reason;
    let lastError;
    // Discovered mirrors first, then bootstrap hosts if a mirror is unavailable.
    for (const base of [...new Set([...mirrors, ...BOOTSTRAP])]) {
        try { return await getJSON(base, path, signal); }
        catch (error) { lastError = error; if (signal?.aborted) throw error; }
    }
    throw lastError || new Error('Radio Browser is temporarily unavailable.');
}
export async function searchStations({query = '', tag = '', country = '', offset = 0, signal}) {
    const params = new URLSearchParams({hidebroken: 'true', is_https: 'true', order: 'clickcount', reverse: 'true', limit: '36', offset: String(offset)});
    if (query) params.set('name', query);
    params.set('tag', tag || 'music');
    if (country) params.set('countrycode', country);
    const results = await radioRequest('/json/stations/search?' + params, signal);
    if (!Array.isArray(results)) throw new Error('Radio Browser returned an unexpected response.');
    return {tracks: results.map(normalizeStation).filter(Boolean), hasMore: results.length === 36};
}
export function recordStationClick(stationuuid) {
    // Required by the directory to count station listens. Never block playback on this request.
    void radioRequest('/json/url/' + encodeURIComponent(stationuuid)).catch(() => {});
}
