const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(process.env.MUSIC_PLAYER_BENCHMARK_ROOT||path.join(__dirname,'..'));
const baseline=!!process.env.MUSIC_PLAYER_BENCHMARK_ROOT;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const server=http.createServer(async(req,res)=>{
    try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
        if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await fs.readFile(target));
    }catch{res.writeHead(404).end();}
});
function wavFixture(){
    const samples=16000*10,bytes=Buffer.alloc(44+samples*2);
    bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
    bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
    for(let i=0;i<samples;i++)bytes.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/16000)*1000),44+i*2);
    return bytes;
}
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
    const browser=await chromium.launch({headless:true});const results=[];
    try{
        const bundled=JSON.parse(await fs.readFile(path.join(root,'songs.json'),'utf8'))[0];
        for(const size of process.env.MUSIC_PLAYER_OFFLINE_ONLY?[]:baseline?[1000]:[1000,10000]){
            const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
            const tracks=Array.from({length:size},(_,i)=>({...bundled,filename:`scale-${i}.mp3`,title:`Scale Track ${String(i).padStart(5,'0')}`,artist:'Synthetic benchmark'}));
            await context.route('**/songs.json',route=>route.fulfill({json:tracks}));
            await context.route('https://*.api.radio-browser.info/**',route=>route.fulfill({json:[]}));
            const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
            const start=Date.now();await page.goto(url);await page.waitForFunction(n=>document.getElementById('libraryCount').textContent===String(n),size);
            const loaded=Date.now();await page.locator('[data-view="library"]').first().click();await page.locator('#libraryDiscRoot .dcc-root').waitFor();
            const row={tracks:size,initial_load_ms:loaded-start,open_library_ms:Date.now()-loaded,
                rendered_tracks:await page.locator('#trackList .track-row').count(),rendered_discs:await page.locator('#libraryDiscRoot .dcc-slide').count(),
                rendered_queue_rows:await page.locator('#queueList .queue-item').count(),dom_elements:await page.locator('*').count()};results.push(row);
            if(!baseline){
                assert(row.rendered_tracks<=100&&row.rendered_discs<=24&&row.rendered_queue_rows<=100);
                await page.locator('#nextTracksBtn').click();assert.match(await page.locator('#trackPageInfo').textContent(),/101–200/);
                await page.locator('#libraryDiscRoot').getByRole('button',{name:'Next records'}).click();
                await page.waitForFunction(()=>document.querySelector('#libraryDiscRoot [role="status"]')?.textContent.startsWith('25–48'));
                await page.locator('#playListBtn').click();assert.match(await page.locator('#queueCount').textContent(),new RegExp(String(size)));
                await page.locator('#openPlayerBtn').click();await page.locator('#playerDialog .dcc-root').waitFor();assert(await page.locator('#playerDialog .dcc-slide').count()<=24);
                await page.keyboard.press('Escape');
                const search=Date.now();await page.locator('#searchInput').fill(`Scale Track ${String(size-1).padStart(5,'0')}`);
                await page.waitForFunction(()=>document.querySelectorAll('#trackList .track-row').length===1);row.search_with_debounce_ms=Date.now()-search;
                await page.locator('#trackList .track-main').click();assert.equal(await page.locator('#nowTitle').textContent(),tracks[size-1].title);
                assert.deepEqual(errors,[]);
            }
            await context.close();
        }
        if(!baseline){
            const context=await browser.newContext();await context.route('https://*.api.radio-browser.info/**',route=>route.fulfill({json:[]}));
            const page=await context.newPage();const offlineErrors=[];page.on('pageerror',e=>offlineErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')offlineErrors.push(m.text());});page.on('requestfailed',r=>offlineErrors.push(r.url()+':'+r.failure()?.errorText));await page.goto(url);await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='4');
            await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
            await page.locator('#fileInput').setInputFiles({name:'Offline device track.wav',mimeType:'audio/wav',buffer:wavFixture()});
            await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='5');
            await context.unroute('https://*.api.radio-browser.info/**');await context.setOffline(true);await page.reload();
            try { await page.waitForFunction(()=>document.getElementById('libraryCount').textContent==='5',null,{timeout:5000}); }
            catch(error) { console.log('Offline debug',offlineErrors,await page.evaluate(async()=>{const c=await caches.open('music-player-shell-v3');return (await c.keys()).map(r=>r.url);}),await page.locator('#libraryCount').textContent(),await page.locator('#libraryStatus').textContent());throw error; }
            await page.locator('[data-view="library"]').first().click();await page.locator('#trackList .track-main').filter({hasText:'Offline device track'}).click();
            await page.waitForFunction(()=>document.getElementById('audioPlayer').currentTime>0.1);
            assert.match(await page.locator('#radioStatus').textContent(),/offline|unavailable/i);await context.close();
            console.log('PASS bounded 1,000/10,000-track library, queue and popup; late-track search/playback; offline reload and imported audio');
        }
        const report={fixture:'synthetic catalog metadata; desktop Chromium; excludes importing 10,000 audio blobs',node:process.version,runs:results};
        if(process.env.MUSIC_PLAYER_BENCHMARK_OUTPUT)await fs.writeFile(process.env.MUSIC_PLAYER_BENCHMARK_OUTPUT,JSON.stringify(report,null,2)+'\n');
        else console.log(JSON.stringify(report,null,2));
    }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
