# Music Player

**Your music, your mix.** A responsive music player with a file library, playlists, a playback queue, and live internet radio. It runs directly on GitHub Pages—no account, backend, API key, or paid service is required.

[Open the player](https://swopnab.github.io/Music-Player/)

## Listen

- Play the bundled collection or choose **Add your music** to import audio from your device. Drag and drop works on desktop.
- Imported files are saved in this browser's IndexedDB. They are never uploaded to a server. Clearing site data removes them; another browser/device has its own library. If storage is unavailable/full, imports still play for the current session.
- Use the heart to save favorites, **+** to add a track/station to the queue, or the playlist icon to create a mix.
- Browse popular music radio stations, choose a genre or country, or search for a station by name. Favorites can include both songs and stations.
- Playback continues when changing views or searching. The queue has its own order, separate from search results.
- Use shuffle, repeat all, repeat one, seeking, mute, and volume controls. Repeat off stops at the end of a song list; manually skipping next wraps to the first track.
- Open **Your library** to browse the supplied disc carousel. Drag/swipe horizontally, use the arrows or **Tracks** menu, then click the selected disc or **Play selected track**. Browsing does not interrupt the current song; the regular track list stays below the carousel. Favorites and playlists use the same record view.
- Click/tap the artwork or title in the bottom player bar to open the expanded player. Its carousel browses the current queue, and its transport, favorites, seeking, and volume share the existing audio player. Opening/closing it keeps the song playing; close with **×**, **Escape**, or a click outside the popup.
- On phones/tablets the player controls stay visible and the queue opens in a drawer. Saved playlists are also available from **Your library**.
- Keyboard: **Space** plays/pauses, **Left/Right** changes tracks, **M** mutes. Shortcuts leave text inputs, sliders, and buttons alone. Supported browsers also expose playback through the operating system's Media Session controls.

Live radio is a broadcast, so it has no song-level seeking, track titles, or on-demand song selection. Stations control their own availability and may be blocked by a region, browser codec support, or the station server. The app filters out insecure HTTP streams and HLS playlists for broader native browser compatibility, reports playback failures, and keeps your local library usable if radio discovery is offline. It does not provide an unrestricted commercial music catalog.

Volume is controlled by the device on some mobile browsers. Use your device's volume buttons when a browser does not honor the software slider.

## Free API integration

This project uses **Radio Browser**, selected from [Swopnab/public-apis → Music](https://github.com/Swopnab/public-apis#music).

- [API overview](https://api.radio-browser.info/) and [API reference](https://docs.radio-browser.info/)
- Discovers available mirrors using `/json/servers`, randomizes them, and retries a different host on failure.
- Searches `/json/stations/search` with music/genre, country, name, pagination, HTTPS, and healthy-station filters.
- Records station plays using the directory's `/json/url/{stationuuid}` endpoint after playback starts. A counting failure never blocks playback.
- No API key or streaming subscription is required. Third-party station names, artwork, and streams remain supplied by their owners.

Favorites, playlists, volume, and playback modes use local browser storage. The app never uploads imported music. Radio searches and listens connect to the directory/station servers; station artwork may load from a third-party site.

## Run locally

From this repository, start a static server:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Opening the HTML directly as a `file://` URL cannot load the catalog and JavaScript modules reliably.

To add bundled music for everyone using the site, place supported files in the repository root and regenerate the catalog:

```sh
python3 generate_songs.py
```

The generator runs relative to its own location, encodes filenames safely, supplies readable NCS metadata, and retains curated artist/album/duration/credit fields. Browser imports support MP3, M4A/AAC, WAV, OGG/Opus, FLAC, and audio from MP4/WebM when supported by the browser.

## Check the player

Pure playback/normalization checks need only Node.js:

```sh
npm test
```

Browser regression checks use free, development-only Playwright:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

The browser suite also checks carousel browsing/playback, popup audio continuity, synchronized transport/favorites/seeking, modal dismissal and focus restoration at seven viewport sizes. It plays real bundled audio and an imported WAV fixture. It checks seeking, volume/mute, stored favorites/playlists/imports, radio search/genres/country/pagination, queue isolation, mobile touch controls, mirror failover, blocked storage, and rejected playback. API responses are deterministic fixtures; test live station availability separately. Set `MUSIC_PLAYER_SCREENSHOTS` to a directory outside the repo to save screenshots.

The optional Python server can also be checked using the existing requirements:

```sh
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Deploy

Push changes to `main`. GitHub Actions installs the locked free build dependencies, checks TypeScript and the queue tests, bundles the UI, and publishes only the player assets and catalog media to GitHub Pages. No Python service or paid hosting is needed.

The supplied React component lives at `components/ui/disc-cascade-carousel.tsx`; `components/music-discs.tsx` connects it to the existing player. Its own scoped CSS means Tailwind/shadcn are not required by this component. TypeScript is configured in `tsconfig.json`. React is bundled locally into `static/disc-ui.js`, so visitors do not depend on a React/font/image CDN. Disc labels use generated SVG artwork and real track metadata rather than demo records.

After editing the TSX sources:

```sh
npm ci
npm run typecheck
npm run build
```

The generated bundle and license notice are committed so the existing static-server and Flask workflows keep working. `npm run build:site` produces the same `dist-site/` output used by Pages.

## Project layout

- `index.html`, `static/style.css` — responsive interface and controls
- `static/app.js` — library, playback, queue, favorites, playlists, and importing
- `components/ui/disc-cascade-carousel.tsx`, `components/music-discs.tsx` — supplied record UI and player integration
- `scripts/` — local UI build and static publishing preparation
- `static/core.js` — tested queue rules, time formatting, and source normalization
- `static/radio.js` — Radio Browser discovery/search and retries
- `static/library.js` — browser-local file storage
- `songs.json`, `generate_songs.py` — bundled file catalog
- `tests/` — Node and browser regression checks
- `api.py`, `ui.py`, `index.py` — earlier Python server/desktop implementations, retained separately from the GitHub Pages player

## Credits

The bundled collection was provided by the original repository:

- NoCopyrightSounds — **Sky High** by Elektronomia
- NoCopyrightSounds — **High** by JPB
- NoCopyrightSounds — **Dreams pt. II (feat. Sara Skinner)** by Lost Sky

Keep the artists' required attribution and verify permission before adding or distributing more music. Imported files stay on the importing device and are not added to the public repository.

## Large-library rendering and offline playback

The library and queue render 100 rows per page; each disc carousel renders 24 records per page. Paging and searching still reach the full collection, and playback retains the full queue. Metadata remains in memory; this bounds rendering, not total storage or import memory.

After an online visit installs the service worker, the app shell can reload offline. Imported audio stored in IndexedDB plays offline. Live radio and uncached bundled audio require a connection. Clearing site data removes imports and the shell cache; browser quotas and private-mode restrictions still apply. The cache is network-first and handles versioned asset URLs; external API requests and audio streams are excluded.

```sh
npm ci
npx playwright install chromium --only-shell
npm run typecheck
npm test
npm run build:site
npm run test:browser
npm run test:scale
```

`evaluation/large-library-before.json` and `evaluation/large-library.json` record one local Chromium comparison. At 1,000 synthetic tracks, rendered DOM elements dropped from 132,217 to 5,900, and opening the library took 1,169 ms before versus 148 ms after. At 10,000 tracks, the updated fixture rendered the same 5,900 elements, searched and played the last track, and kept all records reachable. These are illustrative local measurements, not device-wide guarantees or a 10,000-file import benchmark. Search timings include the input debounce.

`tests/large-library.cjs` also checks an offline reload and actual playback of an imported WAV fixture. Set `MUSIC_PLAYER_BENCHMARK_OUTPUT` to save a new JSON result. `MUSIC_PLAYER_BENCHMARK_ROOT` can compare a saved previous version. The free Playwright dependency is development-only. CI runs the type checks, build, playback/layout suite, and scale/offline checks on pushes and pull requests.
