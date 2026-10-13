// Imported audio stays in this browser's IndexedDB; no upload endpoint is involved.
let databasePromise;
function openDatabase() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('music-player-library', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('tracks', {keyPath: 'id'});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close other player tabs to access your library.'));
    });
    return databasePromise;
}
async function transaction(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = database.transaction('tracks', mode);
        const request = action(tx.objectStore('tracks'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Library storage was interrupted.'));
    });
}
export async function getImportedTracks() { return transaction('readonly', store => store.getAll()); }
export async function saveImportedTrack(track) { return transaction('readwrite', store => store.put(track)); }
export async function deleteImportedTrack(id) { return transaction('readwrite', store => store.delete(id)); }
