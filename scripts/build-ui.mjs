import {build} from 'esbuild';
await build({
    entryPoints: ['components/music-discs.tsx'],
    outfile: 'static/disc-ui.js',
    bundle: true,
    format: 'esm',
    minify: true,
    jsx: 'automatic',
    target: ['es2022'],
    define: {'process.env.NODE_ENV': '"production"'},
    legalComments: 'linked'
});
