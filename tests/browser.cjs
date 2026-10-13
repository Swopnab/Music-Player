// Browser checks use development-only Playwright; the carousel runtime is bundled locally.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const screenshots = process.env.MUSIC_PLAYER_SCREENSHOTS;
const station = (index, changes = {}) => ({stationuuid: `station-${index}`, name: `Night Radio ${index}`, url_resolved: 'https://streams.example.test/music.mp3', countrycode:'US', tags:'jazz,music', bitrate:128, codec:'MP3', hls:0, lastcheckok:1, favicon:'', ...changes});
let testAudio;
async function eventually(condition) {
    const deadline = Date.now() + 3000;
    while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert(condition(), 'Expected asynchronous request to arrive');
}
const server = http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const bytes = await fs.readFile(target);
        const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg','.mp4':'video/mp4'};
        response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); response.setHeader('Accept-Ranges','bytes');
        const match = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
        if (match) {
            const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
            if (start >= bytes.length || end < start) { response.writeHead(416).end(); return; }
            response.writeHead(206, {'Content-Range':`bytes ${start}-${end}/${bytes.length}`, 'Content-Length':end-start+1}); response.end(bytes.subarray(start,end+1));
        } else response.end(bytes);
    } catch { response.writeHead(404).end(); }
});
async function ready(page, url) {
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('libraryCount').textContent === '4');
    await page.locator('.radio-card').first().waitFor();
}
async function apiRoutes(context, requests, options = {}) {
    await context.route('https://*.api.radio-browser.info/**', async route => {
        const url = new URL(route.request().url()); requests.push(url);
        if (options.fail) { await route.fulfill({status:503,body:'Offline'}); return; }
        if (url.pathname === '/json/servers') { await route.fulfill({json:[{name:'de1.api.radio-browser.info'}, {name:'de2.api.radio-browser.info'}]}); return; }
        if (url.pathname.startsWith('/json/url/')) { await route.fulfill({json:{ok:true}}); return; }
        if (options.mirrorFail && url.hostname === 'de1.api.radio-browser.info') { await route.fulfill({status:503,body:'Offline mirror'}); return; }
        const offset = Number(url.searchParams.get('offset') || 0);
        const name = url.searchParams.get('name');
        let list = name ? [station(42,{name:`${name} radio`})] : Array.from({length:36},(_,i)=>station(offset+i));
        if (options.broken) list = [station(1,{url_resolved:'https://streams.example.test/broken.mp3'})];
        if (options.malicious) list[0] = station(0,{name:'<img src=x onerror="window.injected=true">',favicon:'javascript:alert(1)'});
        await route.fulfill({json:list});
    });
    await context.route('https://streams.example.test/**', async route => {
        if (route.request().url().includes('broken')) { await route.fulfill({status:404,body:'Unavailable'}); return; }
        await route.fulfill({body:testAudio,contentType:'audio/mpeg'});
    });
}
async function snapshot(page, name) { if (screenshots) { await fs.mkdir(screenshots,{recursive:true}); await page.screenshot({path:path.join(screenshots,name+'.png')}); } }
async function fits(page, selector, width, height) {
    const box = await page.locator(selector).boundingBox();
    assert(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width+1 && box.y + box.height <= height+1, `${selector} must fit ${width}x${height}: ${JSON.stringify(box)}`);
}
function wavFixture() {
    const samples=16000*10, bytes=Buffer.alloc(44+samples*2);
    bytes.write('RIFF',0); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(16000,24); bytes.writeUInt32LE(32000,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34); bytes.write('data',36); bytes.writeUInt32LE(samples*2,40);
    for(let i=0;i<samples;i++) bytes.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/16000)*1000),44+i*2);
    return bytes;
}
(async () => {
    testAudio = await fs.readFile(path.join(root,'NCS - Copyright Free Music Elektronomia - Sky High  Progressive House.mp3'));
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({headless:true});
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}});
        const requests=[]; await apiRoutes(context,requests);
        const page=await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message));
        await ready(page,url);
        await page.locator('#playBtn').click();
        await page.waitForFunction(()=>document.getElementById('audioPlayer').currentTime > 0.1);
        assert.equal(await page.locator('#playBtn').getAttribute('aria-label'),'Pause');
        await page.locator('#playBtn').click();
        assert(await page.locator('#audioPlayer').evaluate(audio=>audio.paused));
        await page.locator('#progressBar').evaluate(slider=>{slider.value='50';slider.dispatchEvent(new Event('input'));slider.dispatchEvent(new Event('change'));});
        const seek=await page.locator('#audioPlayer').evaluate(audio=>({time:audio.currentTime,duration:audio.duration}));
        assert(Math.abs(seek.time-seek.duration/2)<1,'Seeking commits to the requested position');
        await page.locator('#volumeBar').evaluate(slider=>{slider.value='35';slider.dispatchEvent(new Event('input'));});
        assert.equal(await page.locator('#audioPlayer').evaluate(audio=>audio.volume),0.35);
        await page.locator('#muteBtn').click(); assert(await page.locator('#audioPlayer').evaluate(audio=>audio.muted));
        await page.locator('#muteBtn').click(); assert.equal(await page.locator('#audioPlayer').evaluate(audio=>audio.volume),0.35);
        await page.locator('#nowFavoriteBtn').click();
        await page.locator('.nav-item[data-view="favorites"]').click(); assert.equal(await page.locator('.track-row').count(),1);
        // A view change and search do not change the original playback queue.
        assert.equal(await page.locator('.queue-item').count(),4);
        await page.locator('#searchInput').fill('no matching title'); await page.locator('#searchForm').evaluate(form=>form.requestSubmit());
        assert.equal(await page.locator('.track-row').count(),0); assert.equal(await page.locator('.queue-item').count(),4);
        await page.locator('#searchInput').fill(''); await page.locator('#searchForm').evaluate(form=>form.requestSubmit());
        await page.locator('#trackList button[aria-label="Add Sky High to playlist"]').click();
        await page.locator('#playlistName').fill('Night drive'); await page.locator('#playlistForm button[type="submit"]').click();
        await page.locator('.playlist-link').filter({hasText:'Night drive'}).click(); assert.equal(await page.locator('.track-row').count(),1);
        await page.locator('#shuffleBtn').click(); await page.locator('#repeatBtn').click();
        await page.reload(); await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
        assert.equal(await page.locator('#shuffleBtn').getAttribute('aria-pressed'),'true'); assert.equal(await page.locator('#repeatBtn').getAttribute('aria-label'),'Repeat all');
        assert.equal(await page.locator('#audioPlayer').evaluate(audio=>audio.volume),0.35);
        assert.equal(await page.locator('#favoriteCount').textContent(),'1'); assert.equal(await page.locator('.playlist-link').count(),1);
        // Browser-local imports persist as actual audio blobs, not dead object URLs.
        await page.locator('#fileInput').setInputFiles({name:'Device track.wav',mimeType:'audio/wav',buffer:wavFixture()});
        await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='5');
        await page.reload(); await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='5');
        await page.locator('.nav-item[data-view="library"]').click(); await page.locator('button[aria-label="Play Device track by On this device"]').click();
        await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused && document.getElementById('audioPlayer').duration===10);
        await page.locator('#playBtn').click();
        await snapshot(page,'desktop-library');
        await page.locator('button[aria-label="Remove Device track from your device"]').click();
        await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
        await page.reload(); await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
        await page.locator('.radio-card').first().waitFor();
        await page.locator('#moreRadioBtn').click(); await page.waitForFunction(()=>document.querySelectorAll('.radio-card').length===72);
        await page.locator('#genreFilters [data-tag="jazz"]').click();
        await page.waitForFunction(()=>document.getElementById('radioCards').getAttribute('aria-busy')==='false');
        assert(requests.some(url=>url.searchParams.get('tag')==='jazz'));
        await page.locator('#countryFilter').selectOption('NP'); await page.waitForFunction(()=>document.getElementById('radioCards').getAttribute('aria-busy')==='false');
        assert(requests.some(url=>url.searchParams.get('countrycode')==='NP'));
        await page.locator('#searchInput').fill('Focus'); await page.locator('#searchForm').evaluate(form=>form.requestSubmit());
        await page.locator('.radio-card').filter({hasText:'Focus radio'}).waitFor();
        await page.locator('.radio-play').first().click(); await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);
        assert(await page.locator('#progressBar').isDisabled()); assert.equal(await page.locator('#duration').textContent(),'∞');
        await eventually(()=>requests.some(url=>url.pathname.startsWith('/json/url/')));
        await page.locator('.radio-card button[aria-label*="to favorites"]').first().click();
        await page.reload(); await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
        await page.locator('.nav-item[data-view="favorites"]').click(); assert.equal(await page.locator('.track-row').count(),2);
        await page.locator('.track-main').filter({hasText:'Focus radio'}).click(); await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);
        await page.locator('#playBtn').click();
        assert.deepEqual(errors,[]);
        console.log('PASS actual audio, seek, volume/mute, favorites, playlists, import persistence/removal, radio search/genres/country/pagination, queue isolation');
        // A saved station remains in a playlist even when it is no longer a favorite.
        await page.locator('#trackList button[aria-label="Add Focus radio to playlist"]').click();
        await page.locator('#playlistSelect').selectOption({label:'Night drive'});await page.locator('#playlistForm button[type="submit"]').click();
        await page.locator('#trackList button[aria-label="Remove Focus radio from favorites"]').click();
        await page.reload();await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
        await page.locator('.playlist-link').filter({hasText:'Night drive'}).click();
        assert.equal(await page.locator('.track-row').count(),2);await page.locator('.track-main').filter({hasText:'Focus radio'}).click();
        await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);await page.locator('#playBtn').click();
        console.log('PASS playlist stations survive removing a favorite and reloading');
        // Verify the native ended event advances the real audio queue.
        await page.locator('.nav-item[data-view="home"]').click();
        if (await page.locator('#shuffleBtn').getAttribute('aria-pressed')==='true') await page.locator('#shuffleBtn').click();
        while(await page.locator('#repeatBtn').getAttribute('aria-label')!=='Repeat off') await page.locator('#repeatBtn').click();
        await page.locator('#playCollectionBtn').click();
        await page.waitForFunction(()=>Number.isFinite(document.getElementById('audioPlayer').duration));
        await page.locator('#audioPlayer').evaluate(audio=>{audio.currentTime=audio.duration-0.1;});
        await page.waitForFunction(()=>document.getElementById('playerTitle').textContent==='High');
        assert.deepEqual(errors,[]);
        console.log('PASS real audio completion advances to the next track');
        await context.close();
        // Layout and touch checks on representative phone, landscape, tablet and desktop sizes.
        for(const [width,height] of [[320,568],[390,844],[568,320],[844,390],[768,1024],[1024,768],[1440,900]]) {
            const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<700}); await apiRoutes(context,[]);
            const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,url);
            await fits(page,'.player-bar',width,height); for(const id of ['playBtn','prevBtn','nextBtn','shuffleBtn','repeatBtn','queueBtn']) await fits(page,'#'+id,width,height);
            await page.locator('#playBtn').tap(); await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);
            await page.locator('#nextBtn').tap(); await page.waitForFunction(()=>document.getElementById('playerTitle').textContent==='High');
            await page.locator('#queueBtn').tap(); await page.locator('.queue-track').filter({hasText:'Sky High'}).tap();
            await page.waitForFunction(()=>document.getElementById('playerTitle').textContent==='Sky High');
            if(width<=1250) {await page.locator('#closeQueueBtn').tap();assert(!await page.locator('#nowPlayingPanel').isVisible());}
            await page.locator('.nav-item[data-view="library"]').tap();assert.equal(await page.locator('.track-row').count(),4);
            const libraryCarousel = page.locator('#libraryDiscRoot .dcc-root');
            await libraryCarousel.waitFor();
            if(width===1440) {
                await libraryCarousel.focus();await libraryCarousel.press('ArrowRight');
                await page.waitForFunction(()=>document.querySelector('.disc-selection strong')?.textContent==='High');
                assert.equal(await page.locator('#playerTitle').textContent(),'Sky High');
                await libraryCarousel.press('ArrowLeft');
                await page.waitForFunction(()=>document.querySelector('.disc-selection strong')?.textContent==='Sky High');
                const box=await libraryCarousel.boundingBox();
                const x=box.x+box.width/2,y=box.y+box.height*0.6;
                await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-220,y,{steps:15});await page.mouse.up();
                await page.waitForFunction(()=>document.querySelector('.disc-selection strong')?.textContent!=='Sky High');
                assert.equal(await page.locator('#playerTitle').textContent(),'Sky High');
                await libraryCarousel.locator('.dcc-menubtn').click();
                await libraryCarousel.locator('.dcc-opt').filter({hasText:'Sky High'}).click();
                await page.waitForFunction(()=>document.querySelector('.disc-selection strong')?.textContent==='Sky High');
            }
            // Carousel navigation changes the preview, not the current playback track.
            await libraryCarousel.locator('button[aria-label="Next track"]').tap();
            await page.waitForFunction(()=>document.querySelector('.disc-selection strong')?.textContent==='High');
            assert.equal(await page.locator('#playerTitle').textContent(),'Sky High');
            await page.locator('.disc-selection button').tap();
            await page.waitForFunction(()=>document.getElementById('playerTitle').textContent==='High' && document.getElementById('audioPlayer').currentTime>0.1);
            await snapshot(page,`${width}x${height}-library-discs`);
            // Opening and closing the expanded player must never reload its shared audio.
            await page.evaluate(()=>{window.popupAudioLoads=0;document.getElementById('audioPlayer').addEventListener('loadstart',()=>window.popupAudioLoads++);});
            await page.locator('#openPlayerBtn').tap();
            await page.locator('#playerDialog .dcc-root').waitFor();
            await fits(page,'#playerDialog',width,height);
            assert.equal(await page.locator('audio').count(),1);
            assert.equal(await page.evaluate(()=>window.popupAudioLoads),0);
            if(width===390) {
                await page.setViewportSize({width:844,height:390});await fits(page,'#playerDialog',844,390);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
                assert.equal(await page.evaluate(()=>window.popupAudioLoads),0);
                await page.setViewportSize({width,height});await fits(page,'#playerDialog',width,height);
            }
            if(width===1440) {
                for(let i=0;i<16;i++) {await page.keyboard.press('Tab');assert(await page.locator('#playerDialog').evaluate(dialog=>dialog.contains(document.activeElement)));}
            }
            await snapshot(page,`${width}x${height}-player-popup`);
            await page.locator('button[aria-label="Popup pause"]').tap();
            assert(await page.locator('#audioPlayer').evaluate(audio=>audio.paused));
            await page.locator('button[aria-label="Popup play"]').tap();
            await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);
            await page.locator('button[aria-label="Popup next track"]').tap();
            await page.waitForFunction(()=>document.getElementById('playerTitle').textContent==='Dreams pt. II (feat. Sara Skinner)');
            await page.waitForFunction(()=>document.querySelector('#playerDialog .dcc-slide[data-active]')?.getAttribute('aria-label')?.includes('Dreams pt. II'));
            await page.locator('button[aria-label="Popup shuffle"]').tap();assert.equal(await page.locator('#shuffleBtn').getAttribute('aria-pressed'),'true');
            await page.locator('button[aria-label="Popup shuffle"]').tap();
            await page.locator('button[aria-label="Favorite current track"]').tap();assert.equal(await page.locator('#playerFavoriteBtn').getAttribute('aria-pressed'),'true');
            const popupSeek=page.locator('input[aria-label="Popup seek in track"]');
            await popupSeek.focus();await popupSeek.press('Home');await popupSeek.press('ArrowRight');
            const popupPosition=await page.locator('#audioPlayer').evaluate(audio=>audio.currentTime/audio.duration*100);
            assert(popupPosition>=0.08 && popupPosition<1, 'Popup keyboard seeking commits to the shared audio');
            // The index menu consumes its first Escape; a second Escape closes the modal.
            if(await page.locator('#playerDialog .dcc-menubtn').isVisible()) {
                await page.locator('#playerDialog .dcc-menubtn').tap();await page.keyboard.press('Escape');
                assert(await page.locator('#playerDialog').evaluate(dialog=>dialog.open));
            }
            await page.keyboard.press('Escape');assert(!await page.locator('#playerDialog').evaluate(dialog=>dialog.open));
            if(width===1440) {
                await page.locator('#openPlayerBtn').click();await page.locator('#playerDialog .dcc-root').waitFor();
                await page.mouse.click(2,2);assert(!await page.locator('#playerDialog').evaluate(dialog=>dialog.open));
            }
            assert.equal(await page.evaluate(()=>document.activeElement.id),'openPlayerBtn');
            await page.locator('.nav-item[data-view="home"]').tap(); await snapshot(page,`${width}x${height}-home`);
            await page.locator('#browseRadioBtn').tap(); await snapshot(page,`${width}x${height}-radio`);
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
            await context.close();console.log(`PASS touch playback/navigation/queue and layout: ${width}x${height}`);
        }
        // Offline API, failed media, malicious names, blocked storage and play permission rejection.
        {
            const context=await browser.newContext();await apiRoutes(context,[],{fail:true});const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
            await page.goto(url); await page.locator('#retryRadioBtn').waitFor({state:'visible'}); await page.locator('#playBtn').click();await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);assert.deepEqual(errors,[]);await context.close();console.log('PASS radio API outage leaves local music playable');
        }
        {
            const context=await browser.newContext();const requests=[];await apiRoutes(context,requests,{mirrorFail:true,malicious:true});const page=await context.newPage();await ready(page,url);
            assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.locator('.radio-details img').count(),0);
            assert(requests.some(url=>url.hostname==='de2.api.radio-browser.info'&&url.pathname.includes('search')));await context.close();console.log('PASS API mirror failover and safe rendering of external metadata');
        }
        {
            const context=await browser.newContext();await apiRoutes(context,[]);await context.addInitScript(()=>{
                Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked');}}); Object.defineProperty(window,'indexedDB',{get(){throw new Error('Blocked');}});
            });
            const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,url);await page.locator('#fileInput').setInputFiles({name:'Session.wav',mimeType:'audio/wav',buffer:wavFixture()});await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='5');
            await page.locator('.nav-item[data-view="library"]').click();await page.locator('button[aria-label="Play Session by On this device"]').click();await page.waitForFunction(()=>!document.getElementById('audioPlayer').paused);await page.locator('button[aria-label="Remove Session from your device"]').click();assert.deepEqual(errors,[]);await context.close();console.log('PASS blocked storage: session imports and playback still work');
        }
        {
            const context=await browser.newContext();await apiRoutes(context,[],{broken:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,url);
            await page.locator('.radio-play').first().click();await page.locator('#playerStatus').filter({hasText:/station/i}).waitFor();assert.equal(await page.locator('#playBtn').getAttribute('aria-label'),'Play');
            await page.locator('#playCollectionBtn').click();await page.waitForFunction(()=>document.getElementById('audioPlayer').currentTime>0.1);assert.deepEqual(errors,[]);await context.close();console.log('PASS failed station stream, with recovery to local music');
        }
        {
            const context=await browser.newContext();await apiRoutes(context,[]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,url);
            await page.evaluate(()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Gesture required','NotAllowedError'));});await page.locator('#playBtn').click();await page.locator('#playerStatus').filter({hasText:'Tap Play'}).waitFor();assert.equal(await page.locator('#playBtn').getAttribute('aria-label'),'Play');assert.deepEqual(errors,[]);await context.close();console.log('PASS rejected play promise never shows a false playing state');
        }
    } finally { await browser.close();server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
