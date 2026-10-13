import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionPage} from '../static/pagination.js';
test('all 10,000 tracks remain reachable through bounded pages',()=>{
    const tracks=Array.from({length:10000},(_,id)=>({id}));let collected=[];
    for(let page=0;page<100;page++){
        const result=collectionPage(tracks,page);assert.equal(result.items.length,100);
        collected.push(...result.items.map(track=>track.id));
    }
    assert.deepEqual(collected,tracks.map(track=>track.id));assert.equal(tracks.length,10000);
});
test('removed tracks, filtered collections and empty pages clamp safely',()=>{
    assert.deepEqual(collectionPage([],20).items,[]);
    const page=collectionPage(['first','second','third'],99,2);
    assert.equal(page.page,1);assert.equal(page.start,2);assert.deepEqual(page.items,['third']);
    assert.equal(collectionPage([1,2],-4).page,0);
});
