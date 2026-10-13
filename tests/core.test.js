import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackQueue, formatTime, normalizeSong, normalizeStation, safeHttpsUrl, matchesTrack} from '../static/core.js';
const tracks = ['a', 'b', 'c'].map(id => ({id, title: id, source: 'catalog'}));

test('formatTime handles unknown/infinite duration without NaN', () => {
    assert.equal(formatTime(NaN), '0:00'); assert.equal(formatTime(Infinity), '0:00'); assert.equal(formatTime(-5), '0:00');
    assert.equal(formatTime(238.95), '3:58'); assert.equal(formatTime(3600), '60:00');
});
test('catalog filenames become readable titles and stable identities', () => {
    const song = normalizeSong({filename: 'NCS - Copyright Free Music Lost Sky - Dreams pt. II (feat. Sara Skinner)  Trap.mp3', title: 'NCS - Copyright Free Music Lost Sky - Dreams pt. II (feat. Sara Skinner)  Trap', url: 'song.mp3'});
    assert.equal(song.title, 'Dreams pt. II (feat. Sara Skinner)'); assert.equal(song.artist, 'Lost Sky');
    assert.equal(normalizeSong({url: 'javascript:alert(1)'}), null); assert.equal(normalizeSong({url: '//example.com/a'}), null);
    assert.equal(normalizeSong({url: 'custom.mp3', artist: 'An artist', title: 'A title'}).artist, 'An artist');
});
test('URL checks reject executable, insecure and credentialed external links', () => {
    assert.equal(safeHttpsUrl('javascript:alert(1)'), ''); assert.equal(safeHttpsUrl('http://stream.example/a.mp3'), '');
    assert.equal(safeHttpsUrl('https://user:pass@example.com/'), ''); assert.equal(safeHttpsUrl('https://stream.example/a.mp3'), 'https://stream.example/a.mp3');
});
test('radio normalization filters broken, insecure and non-native playlist streams', () => {
    const station = {stationuuid: 'uuid', name: 'A station', url_resolved: 'https://example.com/radio.mp3', lastcheckok: 1, hls: 0, codec: 'MP3', countrycode: 'US'};
    assert.equal(normalizeStation(station).id, 'radio:uuid');
    for (const invalid of [{hls: 1}, {lastcheckok: 0}, {url_resolved: 'http://example.com/'}, {codec: 'UNKNOWN'}, {stationuuid: ''}]) assert.equal(normalizeStation({...station, ...invalid}), null);
});
test('search finds artist, title and album and ignores surrounding spaces', () => {
    const track = {title: 'Sky High', artist: 'Elektronomia', album: 'NCS collection'};
    assert(matchesTrack(track, ' sky ')); assert(matchesTrack(track, 'ELEKTRONOMIA')); assert(matchesTrack(track, 'ncs')); assert(!matchesTrack(track, 'not there'));
});
test('empty queues are safe for every navigation action', () => {
    const queue = new PlaybackQueue(); assert.equal(queue.current, null); assert.equal(queue.next(), null); assert.equal(queue.previous(), null); assert.equal(queue.jump(1), null); assert.equal(queue.remove(0), false);
});
test('starting a queue copies the collection and selects the requested track', () => {
    const queue = new PlaybackQueue(); const source = [...tracks]; queue.start(source, 'b'); source.pop();
    assert.equal(queue.current.id, 'b'); assert.equal(queue.items.length, 3);
});
test('natural playback stops at the end with repeat off', () => {
    const queue = new PlaybackQueue(); queue.start(tracks, 'c'); assert.equal(queue.next({ended: true}), null); assert.equal(queue.current.id, 'c');
});
test('manual next wraps; repeat all wraps natural completion', () => {
    const queue = new PlaybackQueue(); queue.start(tracks, 'c'); assert.equal(queue.next().id, 'a');
    queue.repeat = 'all'; queue.jump(2); assert.equal(queue.next({ended: true}).id, 'a');
});
test('repeat one applies to song completion but manual skip still moves', () => {
    const queue = new PlaybackQueue(); queue.start(tracks, 'a'); queue.repeat = 'one';
    assert.equal(queue.next({ended: true}).id, 'a'); assert.equal(queue.next().id, 'b');
});
test('repeat one does not loop a live stream when it ends', () => {
    const queue = new PlaybackQueue(); queue.start([{id:'radio',source:'radio'}, ...tracks], 'radio'); queue.repeat = 'one'; assert.equal(queue.next({ended:true}).id, 'a');
});
test('shuffle avoids immediate duplicates and previous returns to played history', () => {
    const queue = new PlaybackQueue(); queue.start(tracks, 'a'); queue.shuffle = true;
    assert.equal(queue.next({random:()=>0.99}).id, 'c'); assert.equal(queue.previous().id, 'a');
});
test('removing tracks preserves the current item and shuffled history indices', () => {
    const queue = new PlaybackQueue(); queue.start(tracks, 'a'); queue.jump(2); queue.shuffle = true;
    assert(queue.remove(1)); assert.equal(queue.current.id, 'c'); assert.equal(queue.previous().id, 'a'); assert.equal(queue.remove(queue.index), false);
});
test('adding to an empty queue selects a track; duplicates remain explicit queue entries', () => {
    const queue = new PlaybackQueue(); queue.add(tracks[0]); assert.equal(queue.current.id, 'a'); queue.add(tracks[0]); assert.equal(queue.items.length, 2);
});
