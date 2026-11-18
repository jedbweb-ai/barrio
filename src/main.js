import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- constantes ---------- */
const CELL = 2, FH = 1.1, MAXH = 16;
// El mapa empieza en 20×20 y crece cuando se construye cerca del borde.
const START = { x0:-10, x1:9, z0:-10, z1:9 };
const EDGE = 3;        // a cuántas celdas del borde se dispara la expansión
const GROW = 6;        // cuántas celdas se agregan de ese lado
const MAXSPAN = 90;    // tamaño máximo por lado
const wx = i => i * CELL + CELL / 2;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const PALETTE = ['#ece6da','#c8553d','#f2b880','#7fa99b','#5b7db1','#3d4250','#e8c547','#d98ba6'];
const AWN = ['#d1495b','#edae49','#00798c','#30638e','#f6f1e7','#7a9e7e'];
const TREEC = ['#6aa84f','#7cb342','#5a9a4a','#8fbf5f'];
const CARC = ['#e63946','#f1faee','#457b9d','#1d3557','#f4a261','#2a9d8f','#ffb703','#8d99ae'];
const hash = (x,z,k=0) => { const s = Math.sin(x*127.1 + z*311.7 + k*74.7) * 43758.5453; return s - Math.floor(s); };

let tool = 'casa', color = PALETTE[0], muted = false;

/* ---------- escena ---------- */
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3f0');
scene.fog = new THREE.Fog('#bfe3f0', 90, 200);

const camera = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, 0.5, 500);
camera.position.set(42, 36, 42);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.32;
controls.minDistance = 10;
controls.maxDistance = 120;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

const hemi = new THREE.HemisphereLight('#dff1ff', '#b9c7a0', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left:-34, right:34, top:34, bottom:-34, near:1, far:160 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

/* ---------- geometrías y materiales compartidos ---------- */
const BOX = new THREE.BoxGeometry(1,1,1);
const CYL = new THREE.CylinderGeometry(1,1,1,8);
const CONE = new THREE.ConeGeometry(1,1,7);
const ICO = new THREE.IcosahedronGeometry(1,0);

const plainCache = {};
function plain(c, opts={}) {
  const k = c + JSON.stringify(opts);
  return plainCache[k] || (plainCache[k] = new THREE.MeshStandardMaterial({ color:c, roughness:.9, ...opts }));
}
const ROOF = plain('#aaa9a3');
const GLASS = new THREE.MeshStandardMaterial({ color:'#cfe8f2', transparent:true, opacity:.45, roughness:.1 });
const BULB = new THREE.MeshStandardMaterial({ color:'#fff6e0', emissive:'#ffcf7a', emissiveIntensity:0 });
const TAIL = new THREE.MeshStandardMaterial({ color:'#8a1c1c', emissive:'#ff3030', emissiveIntensity:0 });
const REDB = new THREE.MeshStandardMaterial({ color:'#b02020', emissive:'#ff2020', emissiveIntensity:.4 });
const WATER = new THREE.MeshStandardMaterial({ color:'#7cc3d4', roughness:.25, metalness:.05 });

/* fachadas dibujadas en canvas (blancas, se tiñen con el color elegido) */
const TEX = {};
function facadeTex(style, v) {
  const key = style + v;
  if (TEX[key]) return TEX[key];
  let seed = 1000 + v*97 + style.length*13;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lit = Array.from({length:8}, R);
  const mk = emis => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 144;
    const g = c.getContext('2d');
    g.fillStyle = emis ? '#000' : (style === 'ofi' ? '#e3e8ec' : '#f6f3ec');
    g.fillRect(0,0,256,144);
    if (style === 'casa') {
      if (!emis) { g.fillStyle = '#e4dfd4'; g.fillRect(0,136,256,8); }
      [[34,30],[162,30]].forEach(([x,y],k) => {
        if (emis) { const l = lit[k]; g.fillStyle = l < .3 ? '#e0a050' : l < .42 ? '#d8b98a' : '#000000'; g.fillRect(x,y,60,80); }
        else {
          g.fillStyle = '#ffffff'; g.fillRect(x-6,y-6,72,92);
          g.fillStyle = '#4d5a6a'; g.fillRect(x,y,60,80);
          g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x+4,y+4,18,72);
          g.fillStyle = '#ffffff'; g.fillRect(x+28,y,4,80);
          g.fillStyle = '#d3cdc0'; g.fillRect(x-10,y+86,80,7);
        }
      });
    } else if (style === 'ofi') {
      for (let k = 0; k < 4; k++) {
        const px = 6 + k*63, py = 8, pw = 56, ph = 118;
        if (emis) { g.fillStyle = lit[k] < .35 ? '#b9c6dc' : '#000000'; g.fillRect(px,py,pw,ph); }
        else {
          const gr = g.createLinearGradient(px,py,px+pw,py+ph);
          gr.addColorStop(0,'#b7c8d6'); gr.addColorStop(1,'#71889c');
          g.fillStyle = gr; g.fillRect(px,py,pw,ph);
          g.fillStyle = 'rgba(255,255,255,.22)';
          g.beginPath(); g.moveTo(px,py+ph*.6); g.lineTo(px+pw*.5,py); g.lineTo(px+pw*.72,py); g.lineTo(px,py+ph*.92); g.fill();
        }
      }
      if (!emis) { g.fillStyle = '#c4ccd3'; g.fillRect(0,130,256,14); }
    } else { // local comercial en planta baja
      if (!emis) {
        g.fillStyle = '#e9e2d3'; g.fillRect(40,6,176,20);
        g.fillStyle = '#2f3238'; g.fillRect(8,32,240,112);
        g.fillStyle = '#5d6f80'; g.fillRect(14,38,150,106);
        g.fillStyle = '#6b7c8c'; g.fillRect(172,38,70,106);
        g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(20,44,30,94);
      } else {
        g.fillStyle = '#d99a52'; g.fillRect(14,38,150,106);
        g.fillStyle = '#c98e4c'; g.fillRect(172,38,70,106);
        g.fillStyle = '#fff3dd'; g.fillRect(40,6,176,20);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  return TEX[key] = { map: mk(false), em: mk(true) };
}
const MATS = {}, facadeMats = [];
function facadeMat(style, c, v) {
  const k = style + c + v;
  if (MATS[k]) return MATS[k];
  const t = facadeTex(style, v);
  const col = new THREE.Color(c);
  if (style === 'ofi') col.lerp(new THREE.Color('#ffffff'), .3);
  const m = new THREE.MeshStandardMaterial({
    map:t.map, color:col, emissive:'#ffffff', emissiveMap:t.em, emissiveIntensity:env.E,
    roughness: style === 'ofi' ? .3 : .9, metalness: style === 'ofi' ? .15 : 0
  });
  facadeMats.push(m);
  return MATS[k] = m;
}

/* ---------- momentos del día ---------- */
const PRESETS = [
  { name:'Día', icon:'☀️', sky:'#bfe3f0', hs:'#dff1ff', hg:'#b9c7a0', hi:1.0, sc:'#fff4e0', si:2.2, sp:[30,45,20], E:0, water:'#7cc3d4' },
  { name:'Atardecer', icon:'🌇', sky:'#f3b9a2', hs:'#ffd9c2', hg:'#9a8a90', hi:.65, sc:'#ffa860', si:1.5, sp:[42,14,8], E:.55, water:'#d29fa6' },
  { name:'Noche', icon:'🌙', sky:'#2a3463', hs:'#5a6aa8', hg:'#2a3048', hi:.7, sc:'#a9bcff', si:.7, sp:[-20,40,-14], E:1.0, water:'#2c3c62' },
];
let skyIdx = 0;
const env = { sky:new THREE.Color(PRESETS[0].sky), hs:new THREE.Color(PRESETS[0].hs), hg:new THREE.Color(PRESETS[0].hg),
  sc:new THREE.Color(PRESETS[0].sc), water:new THREE.Color(PRESETS[0].water), hi:1, si:2.2, E:0, sp:new THREE.Vector3(30,45,20) };
function stepEnv(dt) {
  const p = PRESETS[skyIdx], k = 1 - Math.exp(-dt*1.8);
  env.sky.lerp(new THREE.Color(p.sky), k); env.hs.lerp(new THREE.Color(p.hs), k); env.hg.lerp(new THREE.Color(p.hg), k);
  env.sc.lerp(new THREE.Color(p.sc), k); env.water.lerp(new THREE.Color(p.water), k);
  env.hi += (p.hi - env.hi)*k; env.si += (p.si - env.si)*k; env.E += (p.E - env.E)*k;
  env.sp.lerp(new THREE.Vector3(...p.sp), k);
  scene.background.copy(env.sky); scene.fog.color.copy(env.sky);
  document.body.style.background = '#' + env.sky.getHexString();
  hemi.color.copy(env.hs); hemi.groundColor.copy(env.hg); hemi.intensity = env.hi;
  sun.color.copy(env.sc); sun.intensity = env.si; sun.position.copy(env.sp).add(sun.target.position);
  WATER.color.copy(env.water);
  for (const m of facadeMats) m.emissiveIntensity = env.E;
  BULB.emissiveIntensity = env.E * 2.6;
  TAIL.emissiveIntensity = env.E * 2;
}

/* ---------- terreno ---------- */
const water = new THREE.Mesh(new THREE.PlaneGeometry(2400,2400), WATER);
water.rotation.x = -Math.PI/2; water.position.y = -.4; water.receiveShadow = true;
scene.add(water);
const sand = new THREE.Mesh(BOX, plain('#e9d9b4'));
sand.position.y = -.72; sand.receiveShadow = true;
scene.add(sand);
const island = new THREE.Mesh(BOX, plain('#a6c97f'));
island.position.y = -.6; island.receiveShadow = true;
island.userData.pick = { ground:true };
scene.add(island);

/* ---------- estado de la ciudad (mapa que crece) ---------- */
let B = { ...START };                 // límites actuales, inclusive
let cells = new Map();                // solo celdas con algo construido
const key = (x,z) => (x + 2048) * 4096 + (z + 2048);
const inb = (x,z) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
const EMPTY = Object.freeze({ f:Object.freeze([]), park:false });
const cell = (x,z) => cells.get(key(x,z)) || EMPTY;
function cellW(x,z) { const k = key(x,z); let c = cells.get(k); if (!c) { c = { f:[], park:false }; cells.set(k, c); } return c; }
function tidy(x,z) { const c = cells.get(key(x,z)); if (c && !c.f.length && !c.park) cells.delete(key(x,z)); }
const H = (x,z) => inb(x,z) ? cell(x,z).f.length : 0;
let CL = new Map(), streetList = [];
const cls = (x,z) => inb(x,z) ? (CL.get(key(x,z)) || 'm') : 'v';
const center = () => ({ x:(wx(B.x0) + wx(B.x1))/2, z:(wx(B.z0) + wx(B.z1))/2 });
const span = () => Math.max(B.x1 - B.x0 + 1, B.z1 - B.z0 + 1);

// la isla se agranda con una animación suave
const islandNow = { x:0, z:0, sx:0, sz:0 };
function islandTarget() {
  return { x:center().x, z:center().z, sx:(B.x1-B.x0+1)*CELL + 3, sz:(B.z1-B.z0+1)*CELL + 3 };
}
function applyIsland() {
  island.position.x = sand.position.x = islandNow.x;
  island.position.z = sand.position.z = islandNow.z;
  island.scale.set(islandNow.sx, 1.2, islandNow.sz);
  sand.scale.set(islandNow.sx + 4, 1, islandNow.sz + 4);
}
function snapIsland() { Object.assign(islandNow, islandTarget()); applyIsland(); fitWorld(); }
function stepIsland(dt) {
  const t = islandTarget(), k = 1 - Math.exp(-dt*3);
  for (const p of ['x','z','sx','sz']) islandNow[p] += (t[p] - islandNow[p]) * k;
  applyIsland();
}
// cámara, sombras y niebla acompañan el tamaño del mapa
function fitWorld() {
  const c = center(), half = span()*CELL/2;
  sun.target.position.set(c.x, 0, c.z);
  Object.assign(sun.shadow.camera, { left:-half-6, right:half+6, top:half+6, bottom:-half-6, far:160 + half*2 });
  sun.shadow.camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(120, half*4.2);
  scene.fog.near = Math.max(90, half*3); scene.fog.far = Math.max(200, half*7);
  camera.far = Math.max(500, half*12); camera.updateProjectionMatrix();
}
function computeClasses() {
  CL = new Map(); streetList = [];
  // solo hace falta mirar alrededor de lo construido; el resto es pradera
  const seen = new Set();
  for (const [k0, c0] of cells) {
    const x0 = Math.floor(k0 / 4096) - 2048, z0 = (k0 % 4096) - 2048;
    for (let dz=-1; dz<=1; dz++) for (let dx=-1; dx<=1; dx++) {
      const x = x0+dx, z = z0+dz, kk = key(x,z);
      if (!inb(x,z) || seen.has(kk)) continue;
      seen.add(kk);
      classify(x, z);
    }
  }
}
function classify(x, z) {
  {
    const c = cell(x,z); let k;
    if (c.f.length) k = 'b';
    else if (c.park) k = 'p';
    else if (DIRS.every(([dx,dz]) => H(x+dx,z+dz) > 0)) k = 'y';
    else {
      k = 'm';
      for (let dz=-1; dz<=1 && k==='m'; dz++) for (let dx=-1; dx<=1; dx++) if (H(x+dx,z+dz) > 0) { k = 's'; break; }
    }
    CL.set(key(x,z), k);
    if (k === 's') streetList.push([x,z]);
  }
}

const cityRoot = new THREE.Group(); scene.add(cityRoot);
const groups = new Map();
function groupAt(x,z) {
  const k = key(x,z); let g = groups.get(k);
  if (!g) { g = new THREE.Group(); groups.set(k, g); cityRoot.add(g); }
  return g;
}
const sprouting = new Set();   // celdas nuevas que "brotan" al expandirse el mapa

function mesh(g, geo, mat, sx,sy,sz, px,py,pz, cast=true) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx,sy,sz); m.position.set(px,py,pz);
  m.castShadow = cast; m.receiveShadow = true;
  g.add(m); return m;
}
const box = (g,mat,sx,sy,sz,px,py,pz,cast) => mesh(g,BOX,mat,sx,sy,sz,px,py,pz,cast);

function tree(g, px, pz, s=1, y0=0, k=0) {
  const kind = hash(px, pz, k+3);
  mesh(g, CYL, plain('#7a5a3c'), .07*s, .6*s, .07*s, px, y0+.3*s, pz);
  if (kind < .25) mesh(g, CONE, plain('#4f8a4a',{flatShading:true}), .42*s, 1.1*s, .42*s, px, y0+1.0*s, pz);
  else mesh(g, ICO, plain(TREEC[Math.floor(kind*4)%4],{flatShading:true}), .5*s, .45*s, .5*s, px, y0+.95*s, pz);
}
function bench(g, px, pz, along) {
  const w = plain('#9b6b43');
  box(g, w, along?.22:.7, .05, along?.7:.22, px, .22, pz);
  box(g, w, along?.05:.7, .22, along?.7:.05, px + (along?-.1:0), .36, pz + (along?0:-.1));
  box(g, plain('#3b3f46'), along?.2:.62, .2, along?.62:.2, px, .1, pz, false);
}
function flowers(g, px, pz, k) {
  const cols = ['#ff7aa2','#ffd166','#ffffff','#c084fc'];
  for (let i=0; i<5; i++) mesh(g, ICO, plain(cols[(i+k)%4],{flatShading:true}), .07,.07,.07,
    px + (hash(px,pz,i+k)-.5)*.7, .1, pz + (hash(pz,px,i+k)-.5)*.7, false);
}
function lamp(g, px, pz, ax, az) {
  mesh(g, CYL, plain('#3b3f46'), .04, 1.7, .04, px, .85, pz);
  box(g, plain('#3b3f46'), Math.abs(ax)*.4+.05, .04, Math.abs(az)*.4+.05, px+ax*.2, 1.68, pz+az*.2);
  box(g, BULB, .14, .06, .14, px+ax*.38, 1.63, pz+az*.38, false);
}

/* ---------- construcción procedural de cada celda ---------- */
function buildCell(x, z) {
  const g = groupAt(x,z); g.clear();
  const k = cls(x,z), cx = wx(x), cz = wx(z);
  if (k === 'b') buildBuilding(g, x, z, cx, cz);
  else if (k === 'p') buildPark(g, x, z, cx, cz);
  else if (k === 'y') buildYard(g, x, z, cx, cz);
  else if (k === 's') buildStreet(g, x, z, cx, cz);
  else buildMeadow(g, x, z, cx, cz);
}

function buildBuilding(g, x, z, cx, cz) {
  const c = cell(x,z), h = c.f.length;
  const nbs = DIRS.map(([dx,dz]) => ({ dx, dz, k:cls(x+dx,z+dz), h:H(x+dx,z+dz) }));
  const onStreet = nbs.some(n => n.k === 's');
  for (let i=0; i<h; i++) {
    const fl = c.f[i];
    const st = (i === 0 && onStreet) ? 'local' : fl.s;
    const side = facadeMat(st, fl.c, Math.floor(hash(x,z,i)*4));
    const m = new THREE.Mesh(BOX, [side, side, i === h-1 ? ROOF : side, ROOF, side, side]);
    m.scale.set(CELL, FH, CELL); m.position.set(cx, i*FH + FH/2, cz);
    m.castShadow = m.receiveShadow = true;
    m.userData.pick = { x, z, floor:i };
    g.add(m);
    for (const n of nbs) {
      if (n.k === 'b' && n.h > i) continue; // cara tapada por el vecino
      const along = n.dx !== 0;
      // balcones en viviendas
      if (st === 'casa' && i > 0 && hash(x, z, 20 + i*5 + (n.dx+2)*7 + (n.dz+2)*3) < .5) {
        const by = i*FH + .04;
        box(g, plain(fl.c), along?.4:1.3, .08, along?1.3:.4, cx+n.dx*(CELL/2+.2), by, cz+n.dz*(CELL/2+.2));
        box(g, GLASS, along?.03:1.3, .32, along?1.3:.03, cx+n.dx*(CELL/2+.39), by+.2, cz+n.dz*(CELL/2+.39), false);
      }
      // toldos en locales que dan a la calle
      if (st === 'local' && n.k === 's') {
        const ac = AWN[Math.floor(hash(x, z, 40 + n.dx*3 + n.dz)*AWN.length)];
        box(g, plain(ac), along?.55:1.7, .07, along?1.7:.55, cx+n.dx*(CELL/2+.27), FH*.82, cz+n.dz*(CELL/2+.27));
      }
      // franjas horizontales en oficinas
      if (st === 'ofi' && i > 0) {
        box(g, plain('#d9dee2'), along?.08:CELL, .07, along?CELL:.08, cx+n.dx*(CELL/2+.03), i*FH, cz+n.dz*(CELL/2+.03), false);
      }
    }
  }
  // terraza: pretiles y objetos
  const top = c.f[h-1], y = h*FH;
  for (const n of nbs) {
    if (n.k === 'b' && n.h >= h) continue;
    const along = n.dx !== 0;
    box(g, plain(top.c), along?.12:CELL, .26, along?CELL:.12, cx+n.dx*(CELL/2-.06), y+.13, cz+n.dz*(CELL/2-.06));
  }
  const r = hash(x, z, 99);
  if (h >= 9) {
    box(g, plain('#8c8f96'), .8, .5, .8, cx, y+.25, cz);
    mesh(g, CYL, plain('#6b6f78'), .04, 2.6, .04, cx+.2, y+1.8, cz+.2);
    box(g, REDB, .12, .12, .12, cx+.2, y+3.1, cz+.2, false);
  } else if (top.s === 'ofi' && h >= 4) {
    box(g, plain('#9aa0a8'), 1.0, .55, .9, cx-.2, y+.28, cz);
    box(g, plain('#7d838c'), .35, .25, .35, cx+.6, y+.13, cz+.5);
  } else if (r < .3) {
    box(g, plain('#5a4634'), .7, .3, .7, cx+.3, y+.15, cz-.3);
    mesh(g, CYL, plain('#8a6a4a'), .35, .7, .35, cx+.3, y+.65, cz-.3);
    mesh(g, CONE, plain('#6e533a'), .4, .3, .4, cx+.3, y+1.15, cz-.3);
  } else if (r < .55) {
    box(g, plain('#7da35d'), 1.5, .1, 1.5, cx, y+.05, cz);
    mesh(g, ICO, plain('#5f9a4a',{flatShading:true}), .3,.28,.3, cx-.45, y+.3, cz-.4);
    mesh(g, ICO, plain('#86b95b',{flatShading:true}), .25,.22,.25, cx+.4, y+.25, cz+.35);
    box(g, plain('#f2efe8'), .5, .06, .25, cx+.3, y+.2, cz-.4);
  } else if (r < .8) {
    box(g, plain('#c9ccd1'), .45, .35, .45, cx-.4, y+.18, cz+.3);
    box(g, plain('#c9ccd1'), .45, .35, .45, cx+.3, y+.18, cz+.3);
    box(g, plain('#8c8f96'), .3, .7, .3, cx+.4, y+.35, cz-.5);
  } else {
    const p = box(g, plain('#2f4a7a',{roughness:.3,metalness:.3}), 1.4, .05, .8, cx, y+.35, cz);
    p.rotation.x = -.45;
    box(g, plain('#8c8f96'), .05, .3, .05, cx-.6, y+.15, cz+.2);
    box(g, plain('#8c8f96'), .05, .3, .05, cx+.6, y+.15, cz+.2);
  }
  // pasarelas aéreas entre torres separadas por una calle
  for (const [dx,dz] of [[1,0],[0,1]]) {
    if (cls(x+dx, z+dz) !== 's' || cls(x+2*dx, z+2*dz) !== 'b') continue;
    const lvl = Math.min(h, H(x+2*dx, z+2*dz)) - 2;
    if (lvl < 2 || hash(x, z, 60+dx) > .7) continue;
    const bx = wx(x+dx), bz = wx(z+dz), by = lvl*FH + FH/2;
    box(g, facadeMat('ofi', '#bcd3e0', 1), dx?CELL+.1:.9, FH*.75, dx?.9:CELL+.1, bx, by, bz);
    box(g, plain('#d9dee2'), dx?CELL+.1:1.0, .1, dx?1.0:CELL+.1, bx, by - FH*.4, bz);
  }
}

function buildStreet(g, x, z, cx, cz) {
  const s = box(g, plain('#4a4e57',{roughness:.95}), CELL, .04, CELL, cx, .02, cz, false);
  s.userData.pick = { ground:true };
  const isS = (a,b) => cls(a,b) === 's';
  const sw = plain('#d2cdc2');
  const walkSides = [];
  for (const [dx,dz] of DIRS) {
    if (isS(x+dx, z+dz)) continue;
    walkSides.push([dx,dz]);
    const along = dx !== 0;
    const w = box(g, sw, along?.45:CELL, .12, along?CELL:.45, cx+dx*(CELL/2-.225), .06, cz+dz*(CELL/2-.225), false);
    w.userData.pick = { ground:true };
  }
  for (const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    if (isS(x+dx,z) && isS(x,z+dz) && !isS(x+dx,z+dz))
      box(g, sw, .45, .12, .45, cx+dx*(CELL/2-.225), .06, cz+dz*(CELL/2-.225), false);
  }
  const sd = DIRS.filter(([dx,dz]) => isS(x+dx, z+dz));
  const hor = isS(x+1,z) && isS(x-1,z), ver = isS(x,z+1) && isS(x,z-1);
  const paint = plain('#f4f1e8');
  if (sd.length === 2 && (hor || ver)) {
    for (const o of [-.5, .5]) box(g, paint, hor?.5:.08, .01, hor?.08:.5, cx+(hor?o:0), .045, cz+(ver?o:0), false);
  } else if (sd.length >= 3) {
    for (const [dx,dz] of sd) for (let i=-2; i<=2; i++) {
      const along = dx !== 0;
      box(g, paint, along?.32:.12, .01, along?.12:.32, cx+dx*.72+(along?0:i*.26), .045, cz+dz*.72+(along?i*.26:0), false);
    }
  }
  if (walkSides.length) {
    const [dx,dz] = walkSides[Math.floor(hash(x,z,4)*walkSides.length)];
    const px = cx+dx*(CELL/2-.22), pz = cz+dz*(CELL/2-.22);
    const r = hash(x,z,5);
    if (r < .32) lamp(g, px + dz*.6, pz + dx*.6, -dx, -dz);
    else if (r < .5) { tree(g, px - dz*.5, pz - dx*.5, .7, .12, x+z); }
  }
}

function buildPark(g, x, z, cx, cz) {
  const s = box(g, plain('#86bd6a'), CELL, .1, CELL, cx, .05, cz, false);
  s.userData.pick = { x, z, park:true };
  const r = hash(x,z,7);
  if (r < .18) {
    mesh(g, CYL, plain('#cfc8bb'), .7, .25, .7, cx, .22, cz);
    mesh(g, CYL, plain('#7cc7e0',{roughness:.15}), .58, .05, .58, cx, .36, cz, false);
    mesh(g, CYL, plain('#cfc8bb'), .08, .5, .08, cx, .55, cz);
    mesh(g, ICO, plain('#bfe9f5',{transparent:true,opacity:.7}), .16,.22,.16, cx, .85, cz, false);
  } else {
    const nt = 1 + Math.floor(hash(x,z,8)*3);
    for (let i=0; i<nt; i++) tree(g, cx+(hash(x,z,11+i)-.5)*1.3, cz+(hash(x,z,21+i)-.5)*1.3, .8+hash(x,z,31+i)*.5, .1, i);
    if (r > .65) bench(g, cx+.55, cz-.2, true);
    if (r > .4 && r < .7) flowers(g, cx-.3, cz+.4, x+z);
  }
}

function buildYard(g, x, z, cx, cz) {
  const s = box(g, plain('#93c27a'), CELL, .06, CELL, cx, .03, cz, false);
  s.userData.pick = { ground:true };
  tree(g, cx+.3, cz+.2, 1.1, .06, x*z);
  if (hash(x,z,3) < .5) {
    const p = plain('#7a7f88');
    mesh(g, CYL, p, .03,.8,.03, cx-.7, .4, cz-.5); mesh(g, CYL, p, .03,.8,.03, cx+.7, .4, cz-.5);
    box(g, p, 1.4, .015, .015, cx, .78, cz-.5, false);
    ['#ffffff','#e76f51','#8ecae6','#ffd166'].forEach((col,i) => box(g, plain(col), .2, .26, .02, cx-.5+i*.33, .64, cz-.5));
  } else bench(g, cx-.4, cz-.4, false);
  flowers(g, cx-.4, cz+.5, x+z);
}

function buildMeadow(g, x, z, cx, cz) {
  const r = hash(x,z,1);
  if (r < .09) tree(g, cx+(hash(x,z,2)-.5), cz+(hash(x,z,3)-.5), .8+hash(x,z,4)*.6, 0, x+z);
  else if (r < .15) flowers(g, cx, cz, x*3+z);
}

function rebuildAll() {
  computeClasses();
  for (const [k, g] of groups) {   // quitar lo que quedó fuera del mapa (p. ej. al deshacer)
    const x = Math.floor(k / 4096) - 2048, z = (k % 4096) - 2048;
    if (!inb(x,z)) { cityRoot.remove(g); groups.delete(k); }
  }
  for (let z=B.z0; z<=B.z1; z++) for (let x=B.x0; x<=B.x1; x++) buildCell(x,z);
}
function rebuildAround(x0, z0) {
  computeClasses();
  for (let z=z0-3; z<=z0+3; z++) for (let x=x0-3; x<=x0+3; x++) if (inb(x,z)) buildCell(x,z);
}

// Si se construye cerca del borde, el mapa crece hacia ese lado.
function maybeExpand(x, z) {
  const old = { ...B };
  const sx = () => B.x1 - B.x0 + 1, sz = () => B.z1 - B.z0 + 1;
  if (x - B.x0 < EDGE && sx() < MAXSPAN) B.x0 -= GROW;
  if (B.x1 - x < EDGE && sx() < MAXSPAN) B.x1 += GROW;
  if (z - B.z0 < EDGE && sz() < MAXSPAN) B.z0 -= GROW;
  if (B.z1 - z < EDGE && sz() < MAXSPAN) B.z1 += GROW;
  if (old.x0 === B.x0 && old.x1 === B.x1 && old.z0 === B.z0 && old.z1 === B.z1) return false;
  computeClasses();
  for (let zz=B.z0; zz<=B.z1; zz++) for (let xx=B.x0; xx<=B.x1; xx++) {
    const isNew = xx < old.x0 || xx > old.x1 || zz < old.z0 || zz > old.z1;
    if (!isNew) continue;
    buildCell(xx, zz);
    const g = groupAt(xx, zz);
    g.scale.set(1, .01, 1);
    g.userData.delay = Math.hypot(xx - x, zz - z) * .04;
    sprouting.add(g);
  }
  fitWorld();
  setTimeout(() => note(7, true), 120);
  setTimeout(() => note(9, true), 260);
  return true;
}
function stepSprouts(dt) {
  for (const g of sprouting) {
    if (g.userData.delay > 0) { g.userData.delay -= dt; continue; }
    g.scale.y = Math.min(1, g.scale.y + dt*2.5);
    if (g.scale.y >= 1) sprouting.delete(g);
  }
}

/* ---------- autos, pájaros, nubes ---------- */
const carRoot = new THREE.Group(); scene.add(carRoot);
const cars = [];
const streetNbs = (x,z) => DIRS.map(([dx,dz]) => [x+dx, z+dz]).filter(([a,b]) => cls(a,b) === 's');
function makeCar() {
  const g = new THREE.Group();
  const col = CARC[Math.floor(Math.random()*CARC.length)];
  box(g, plain(col,{roughness:.45}), .5, .22, .95, 0, .2, 0);
  box(g, plain('#cfe3ee',{roughness:.2}), .44, .18, .5, 0, .38, -.05);
  for (const sx of [-.15,.15]) { box(g, BULB, .1,.06,.03, sx,.22,.48, false); box(g, TAIL, .1,.06,.03, sx,.22,-.48, false); }
  return g;
}
function placeCar(c, snap) {
  const ax = wx(c.from[0]), az = wx(c.from[1]), bx = wx(c.to[0]), bz = wx(c.to[1]);
  const vx = Math.sign(bx-ax), vz = Math.sign(bz-az);
  const tx = ax + (bx-ax)*c.t - vz*.42, tz = az + (bz-az)*c.t + vx*.42;
  const ang = Math.atan2(vx, vz);
  if (snap) { c.mesh.position.set(tx,.04,tz); c.mesh.rotation.y = ang; return; }
  c.mesh.position.x += (tx - c.mesh.position.x)*.25;
  c.mesh.position.z += (tz - c.mesh.position.z)*.25;
  let d = ang - c.mesh.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  c.mesh.rotation.y += d*.2;
}
function updateCars(dt) {
  const want = Math.min(40, Math.floor(streetList.length/5));
  if (cars.length < want && streetList.length) {
    const s = streetList[Math.floor(Math.random()*streetList.length)];
    const nb = streetNbs(...s);
    if (nb.length) {
      const c = { mesh:makeCar(), from:s, to:nb[Math.floor(Math.random()*nb.length)], t:Math.random(), sp:1.6+Math.random()*1.2 };
      carRoot.add(c.mesh); placeCar(c, true); cars.push(c);
    }
  }
  for (let i=cars.length-1; i>=0; i--) {
    const c = cars[i];
    if (cls(...c.from) !== 's' || cls(...c.to) !== 's' || cars.length > want+3) { carRoot.remove(c.mesh); cars.splice(i,1); continue; }
    c.t += c.sp*dt/CELL;
    if (c.t >= 1) {
      c.t -= 1;
      const nb = streetNbs(...c.to);
      const opts = nb.filter(([a,b]) => !(a === c.from[0] && b === c.from[1]));
      const pool = opts.length ? opts : nb;
      if (!pool.length) { carRoot.remove(c.mesh); cars.splice(i,1); continue; }
      c.from = c.to; c.to = pool[Math.floor(Math.random()*pool.length)];
    }
    placeCar(c, false);
  }
}

const birds = [];
for (let i=0; i<9; i++) {
  const g = new THREE.Group(), m = plain('#4a4f5a');
  const l = box(g, m, .4,.03,.14, -.2,0,0, false), r = box(g, m, .4,.03,.14, .2,0,0, false);
  g.userData = { l, r, a:Math.random()*6.28, rad:14+Math.random()*16, y:16+Math.random()*8, sp:(.12+Math.random()*.12)*(i%2?1:-1), ph:Math.random()*6 };
  scene.add(g); birds.push(g);
}
const clouds = [];
for (let i=0; i<7; i++) {
  const g = new THREE.Group(), m = plain('#ffffff',{flatShading:true, transparent:true, opacity:.92});
  for (let j=0; j<4; j++) mesh(g, ICO, m, 2+Math.random()*2, 1.2+Math.random(), 2+Math.random()*2, j*2.4-3.6, Math.random(), Math.random()*2-1, false);
  g.position.set(Math.random()*140-70, 30+Math.random()*8, Math.random()*100-50);
  scene.add(g); clouds.push(g);
}

/* ---------- guardar / deshacer ---------- */
// formato v2: { v:2, b:[x0,x1,z0,z1], c:[[x, z, [[color, estilo]...], parque]...] } — solo celdas con algo
function serialize() {
  const c = [];
  for (const [k, v] of cells) if (v.f.length || v.park)
    c.push([Math.floor(k / 4096) - 2048, (k % 4096) - 2048, v.f.map(f => [f.c, f.s]), v.park ? 1 : 0]);
  return JSON.stringify({ v:2, b:[B.x0, B.x1, B.z0, B.z1], c });
}
function deserialize(s) {
  const d = JSON.parse(s);
  cells = new Map();
  if (Array.isArray(d)) { // formato v1: grilla fija de 20×20
    B = { ...START };
    d.forEach(([f,p], i) => { if (f.length || p) cells.set(key(i % 20 - 10, Math.floor(i / 20) - 10), { f:f.map(([c,st]) => ({ c, s:st })), park:!!p }); });
    return;
  }
  B = { x0:d.b[0], x1:d.b[1], z0:d.b[2], z1:d.b[3] };
  for (const [x, z, f, p] of d.c) cells.set(key(x,z), { f:f.map(([c,st]) => ({ c, s:st })), park:!!p });
}
const hist = [];
function save() { try { localStorage.setItem('barrio-v2', serialize()); } catch(e) {} }
function load() {
  try {
    const s = localStorage.getItem('barrio-v2') || localStorage.getItem('barrio-v1');
    if (s) { deserialize(s); return; }
  } catch(e) {}
  cells = new Map(); B = { ...START };
}

/* ---------- sonido ---------- */
let AC = null;
function note(i, soft) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const sc = [0,2,4,7,9], semi = sc[i%5] + 12*Math.floor(i/5);
    const f = (soft ? 196 : 294) * Math.pow(2, Math.min(semi, 26)/12), t = AC.currentTime;
    const o = AC.createOscillator(), o2 = AC.createOscillator(), gn = AC.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f*2;
    gn.gain.setValueAtTime(.0001, t);
    gn.gain.exponentialRampToValueAtTime(soft ? .05 : .1, t+.01);
    gn.gain.exponentialRampToValueAtTime(.0001, t+.9);
    o.connect(gn); o2.connect(gn); gn.connect(AC.destination);
    o.start(t); o2.start(t); o.stop(t+1); o2.stop(t+1);
  } catch(e) {}
}

/* ---------- interacción ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pickAt(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ptr, camera);
  for (const h of ray.intersectObjects([cityRoot, island], true)) if (h.object.userData.pick) return h;
  return null;
}
function plan(hit, erase) {
  if (!hit) return null;
  const u = hit.object.userData.pick;
  if (erase || tool === 'borrar') {
    if (u.floor !== undefined) return { op:'del', x:u.x, z:u.z, i:u.floor };
    if (u.park) return { op:'unpark', x:u.x, z:u.z };
    return null;
  }
  if (tool === 'pincel') return u.floor !== undefined ? { op:'paint', x:u.x, z:u.z, i:u.floor } : null;
  let x, z;
  if (u.floor !== undefined) {
    const n = hit.face.normal;
    if (n.y > .5) { x = u.x; z = u.z; }
    else if (n.y < -.5) return null;
    else { x = u.x + Math.round(n.x); z = u.z + Math.round(n.z); }
  } else if (u.park) { x = u.x; z = u.z; }
  else { x = Math.floor(hit.point.x / CELL); z = Math.floor(hit.point.z / CELL); }
  if (!inb(x,z)) return null;
  const c = cell(x,z);
  if (tool === 'parque') return (c.f.length || c.park) ? null : { op:'park', x, z };
  if (c.f.length >= MAXH) return null;
  return { op:'add', x, z };
}

const ghost = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:.38, depthWrite:false }));
ghost.visible = false; scene.add(ghost);
function showGhost(op) {
  if (!op) { ghost.visible = false; return; }
  ghost.visible = true;
  const cx = wx(op.x), cz = wx(op.z), m = ghost.material;
  if (op.op === 'add') { ghost.scale.set(CELL*1.02, FH*1.02, CELL*1.02); ghost.position.set(cx, H(op.x,op.z)*FH + FH/2, cz); m.color.set(color); }
  else if (op.op === 'park') { ghost.scale.set(CELL, .16, CELL); ghost.position.set(cx, .08, cz); m.color.set('#7cc06a'); }
  else if (op.op === 'unpark') { ghost.scale.set(CELL*1.03, .2, CELL*1.03); ghost.position.set(cx, .1, cz); m.color.set('#ff5a5a'); }
  else { ghost.scale.set(CELL*1.06, FH*1.06, CELL*1.06); ghost.position.set(cx, op.i*FH + FH/2, cz); m.color.set(op.op === 'del' ? '#ff5a5a' : color); }
}

const hint = document.getElementById('hint');
function apply(op) {
  if (!op) return;
  hist.push(serialize()); if (hist.length > 80) hist.shift();
  const c = cellW(op.x, op.z);
  if (op.op === 'add') { c.park = false; c.f.push({ c:color, s: tool === 'ofi' ? 'ofi' : 'casa' }); note(c.f.length-1); }
  else if (op.op === 'park') { c.park = true; note(4, true); }
  else if (op.op === 'del') { c.f.splice(op.i, 1); note(0, true); }
  else if (op.op === 'unpark') { c.park = false; note(0, true); }
  else if (op.op === 'paint') { c.f[op.i].c = color; note(op.i+2); }
  tidy(op.x, op.z);
  rebuildAround(op.x, op.z);
  if (op.op === 'add' || op.op === 'park') maybeExpand(op.x, op.z);
  save();
  hint.classList.add('gone');
}

let down = null;
const el = renderer.domElement;
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => { down = { x:e.clientX, y:e.clientY, b:e.button }; });
el.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX-down.x, e.clientY-down.y);
  if (moved < 6 && (down.b === 0 || down.b === 2)) { apply(plan(pickAt(e), down.b === 2)); showGhost(plan(pickAt(e), false)); }
  down = null;
});
el.addEventListener('pointermove', e => { if (e.buttons) { ghost.visible = false; return; } showGhost(plan(pickAt(e), false)); });
el.addEventListener('pointerleave', () => { ghost.visible = false; });

/* ---------- interfaz ---------- */
const toolBtns = [...document.querySelectorAll('#tools button')];
function setTool(t) { tool = t; toolBtns.forEach(b => b.classList.toggle('on', b.dataset.tool === t)); ghost.visible = false; }
toolBtns.forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
const colorsEl = document.getElementById('colors');
PALETTE.forEach((c,i) => {
  const b = document.createElement('button'); b.className = 'sw' + (i ? '' : ' on'); b.style.background = c; b.title = 'Color';
  b.addEventListener('click', () => { color = c; [...colorsEl.children].forEach(x => x.classList.toggle('on', x === b)); if (tool === 'parque' || tool === 'borrar') setTool('casa'); });
  colorsEl.appendChild(b);
});
const skyBtn = document.getElementById('sky');
function cycleSky() { skyIdx = (skyIdx+1) % PRESETS.length; const p = PRESETS[skyIdx]; skyBtn.innerHTML = `${p.icon}<span>${p.name}</span>`; }
skyBtn.addEventListener('click', cycleSky);
function undo() { if (!hist.length) return; deserialize(hist.pop()); save(); rebuildAll(); fitWorld(); note(1, true); }
document.getElementById('undo').addEventListener('click', undo);
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔈'; });
document.getElementById('photo').addEventListener('click', async () => {
  ghost.visible = false; renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const downloadsApi = (window.claude && window.claude.use) ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloadsApi) {
    try {
      const blob = await (await fetch(url)).blob();
      await downloadsApi.save({ filename:'mi-barrio.png', data:blob });
    } catch(e) {}
    return;
  }
  const a = document.createElement('a'); a.href = url; a.download = 'mi-barrio.png'; a.click();
});
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('¿Empezar una ciudad nueva? (podés deshacer)')) return;
  hist.push(serialize()); cells = new Map(); B = { ...START }; save(); rebuildAll(); fitWorld();
  const c = center(); controls.target.set(c.x, 2, c.z);
});
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  const t = { '1':'casa', '2':'ofi', '3':'parque', '4':'pincel', '5':'borrar' }[e.key];
  if (t) setTool(t);
  if (e.key.toLowerCase() === 'n') cycleSky();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

/* ---------- arranque y bucle ---------- */
load();
rebuildAll();
snapIsland();
{ const c = center(); controls.target.set(c.x, 2, c.z); camera.position.set(c.x + 42, 36, c.z + 42); }
if (cells.size) hint.classList.add('gone');

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  stepEnv(dt);
  stepIsland(dt);
  stepSprouts(dt);
  updateCars(dt);
  const ctr = center(), grow = Math.max(1, span() / 20);
  for (const b of birds) {
    const u = b.userData; u.a += u.sp*dt;
    b.position.set(ctr.x + Math.cos(u.a)*u.rad*grow, u.y + Math.sin(u.a*3)*.8, ctr.z + Math.sin(u.a)*u.rad*grow);
    b.rotation.y = -u.a + (u.sp > 0 ? 0 : Math.PI);
    const f = Math.sin(t*9 + u.ph)*.5; u.l.rotation.z = f; u.r.rotation.z = -f;
  }
  const cr = 80 * grow;
  for (const c of clouds) { c.position.x += dt*.8; if (c.position.x > ctr.x + cr) c.position.x = ctr.x - cr; }
  water.position.y = -.4 + Math.sin(t*.6)*.03;
  controls.update();
  renderer.render(scene, camera);
});

/* ---------- app instalable: funciona sin internet una vez abierta ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
