// Network-first app shell: preserve fresh releases and allow offline device imports.
// Audio streams and third-party requests are deliberately outside this cache.
const CACHE = 'music-player-shell-v3';
const SHELL = ['index.html','songs.json','static/app.js','static/core.js','static/pagination.js','static/radio.js',
    'static/library.js','static/disc-ui.js','static/style.css','static/icons.svg','static/artwork/mark.svg'];
const urls = SHELL.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('music-player-shell-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const canonical = new URL(url);
    canonical.search = '';
    canonical.hash = '';
    if (url.origin !== self.location.origin || (!urls.includes(canonical.href) && request.mode !== 'navigate')) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = request.mode === 'navigate' ? urls[0] : canonical.href;
        try {
            const response = await fetch(request);
            if (response.ok && response.status === 200 && (request.mode !== 'navigate' || url.pathname === new URL(urls[0]).pathname || url.pathname === new URL(self.registration.scope).pathname)) {
                await cache.put(key, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await cache.match(key);
            if (cached) return cached;
            throw error;
        }
    })());
});
