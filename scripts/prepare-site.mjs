import {cp, copyFile, mkdir, readFile, rm} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist-site');
await rm(output, {recursive: true, force: true});
await mkdir(output);
for (const name of ['index.html', 'songs.json']) await copyFile(name, path.join(output, name));
await cp('static', path.join(output, 'static'), {recursive: true});
const catalog = JSON.parse(await readFile('songs.json', 'utf8'));
for (const track of catalog) {
    // Catalog URLs can contain spaces and nested paths; remote sources stay remote.
    if (typeof track.url !== 'string' || /^[a-z][a-z\d+.-]*:/i.test(track.url)) continue;
    const relative = decodeURIComponent(track.url.split(/[?#]/)[0]);
    const source = path.resolve(root, relative), destination = path.resolve(output, relative);
    if (!source.startsWith(root + path.sep) || !destination.startsWith(output + path.sep)) throw new Error('Catalog media must stay inside the project');
    await mkdir(path.dirname(destination), {recursive: true});
    await copyFile(source, destination);
}
