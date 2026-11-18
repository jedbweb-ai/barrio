// Compila Barrio a un único HTML autónomo (sin internet) + archivos de la app instalable.
// Uso: npm run build  →  genera la carpeta dist/
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1) Código del juego + Three.js en un solo script
const res = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', target: 'es2020', write: false,
  alias: { 'three/addons': './node_modules/three/examples/jsm' }, legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 2) Tipografía Nunito embebida
const font = w => fs.readFileSync(`node_modules/@fontsource/nunito/files/nunito-latin-${w}-normal.woff2`).toString('base64');
const fonts = [600, 800].map(w =>
  `@font-face{font-family:Nunito;font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${font(w)}) format('woff2')}`).join('\n');

const head = [
  '<meta name="theme-color" content="#bfe3f0">',
  '<meta name="description" content="Juego cozy para construir una ciudad moderna que se arma sola.">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
].join('\n');

const html = fs.readFileSync('src/index.html', 'utf8')
  .replace('<!--HEAD-->', () => head)
  .replace('<!--FONTS-->', () => fonts)
  .replace('<!--GAME-->', () => `<script type="module">${js}</script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);

// 3) Íconos y manifiesto
for (const f of fs.readdirSync('public')) fs.copyFileSync(path.join('public', f), path.join(out, f));
const svg = fs.readFileSync('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile(path.join(out, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
await sharp(svg).resize(180, 180).png().toFile(path.join(out, 'apple-touch-icon.png'));
await sharp(svg).resize(410, 410).extend({ top:51, bottom:51, left:51, right:51, background:'#bfe3f0' }).png()
  .toFile(path.join(out, 'icon-maskable-512.png'));

// 4) Service worker: guarda todo en el teléfono para jugar sin conexión
const files = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const version = 'barrio-' + Date.now();
fs.writeFileSync(path.join(out, 'sw.js'), `const CACHE=${JSON.stringify(version)};
const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return r;}).catch(()=>hit);
    return hit||net;
  }));
});
`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Listo: dist/index.html', (html.length/1024).toFixed(0) + ' KB');
