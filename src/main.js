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

let tool = 'viv', color = PALETTE[0], muted = false;

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
const PYR = new THREE.ConeGeometry(1,1,4); PYR.rotateY(Math.PI/4);   // techo a cuatro aguas
const GABLE = (() => {                                                // techo a dos aguas (cumbrera en z)
  const s = new THREE.Shape(); s.moveTo(-.5,0); s.lineTo(.5,0); s.lineTo(0,1); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth:1, bevelEnabled:false }); g.translate(0,0,-.5); return g;
})();
const ROOFC = ['#b5533c','#8a4a3a','#5a6470','#a8643f','#6f4a3e'];

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
    if (style === 'neg') {
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
    } else if (style === 'viv') { // vivienda: ventanas con postigos y maceteros
      if (!emis) { g.fillStyle = '#e9e4d8'; g.fillRect(0,138,256,6); }
      [[42,36],[166,36]].forEach(([x,y],k) => {
        if (emis) { const l = lit[k]; g.fillStyle = l < .38 ? '#e8a858' : l < .5 ? '#d9c08f' : '#000000'; g.fillRect(x,y,48,66); }
        else {
          g.fillStyle = '#8f9488'; g.fillRect(x-20,y-2,14,70); g.fillRect(x+54,y-2,14,70);          // postigos
          g.fillStyle = 'rgba(0,0,0,.12)'; for (let s=0; s<6; s++) { g.fillRect(x-20,y+4+s*11,14,2); g.fillRect(x+54,y+4+s*11,14,2); }
          g.fillStyle = '#ffffff'; g.fillRect(x-5,y-5,58,76);
          g.fillStyle = '#4d5a6a'; g.fillRect(x,y,48,66);
          g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x+3,y+3,14,60);
          g.fillStyle = '#ffffff'; g.fillRect(x+22,y,4,66); g.fillRect(x,y+30,48,4);
          g.fillStyle = '#8a5a3a'; g.fillRect(x-8,y+72,64,10);                                       // macetero
          g.fillStyle = '#5f9a4a'; g.fillRect(x-6,y+66,60,7);
          ['#e2556b','#ffd166','#ffffff','#e2556b','#c084fc'].forEach((c,i) => { g.fillStyle = c; g.fillRect(x-2+i*12,y+64,6,6); });
        }
      });
    } else if (style === 'vivpb') { // planta baja de vivienda: puerta y ventanas
      if (emis) {
        g.fillStyle = lit[0] < .6 ? '#e8a858' : '#000000'; g.fillRect(22,44,50,60);
        g.fillStyle = lit[1] < .5 ? '#d9c08f' : '#000000'; g.fillRect(184,44,50,60);
        g.fillStyle = '#ffe2b0'; g.fillRect(120,20,16,12);
      } else {
        g.fillStyle = '#d9d2c4'; g.fillRect(0,128,256,16);                                           // zócalo
        [22,184].forEach(x => {
          g.fillStyle = '#ffffff'; g.fillRect(x-5,39,60,70);
          g.fillStyle = '#4d5a6a'; g.fillRect(x,44,50,60);
          g.fillStyle = '#ffffff'; g.fillRect(x+23,44,4,60);
          g.fillStyle = '#d3cdc0'; g.fillRect(x-8,108,66,6);
        });
        g.fillStyle = '#ffffff'; g.fillRect(98,36,60,108);
        g.fillStyle = '#7a4f34'; g.fillRect(104,42,48,102);                                          // puerta
        g.fillStyle = '#69422b'; g.fillRect(110,50,36,36); g.fillRect(110,94,36,42);
        g.fillStyle = '#e8c547'; g.fillRect(142,96,5,5);
        g.fillStyle = '#3b3f46'; g.fillRect(118,18,20,16); g.fillStyle = '#fff6e0'; g.fillRect(121,21,14,10);
      }
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
function cellW(x,z) { const k = key(x,z); let c = cells.get(k); if (!c) { c = { f:[], park:false, road:false }; cells.set(k, c); } return c; }
function tidy(x,z) { const c = cells.get(key(x,z)); if (c && !c.f.length && !c.park && !c.road) cells.delete(key(x,z)); }
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
  computeClusters();
}
// Edificios vecinos del mismo tipo forman un conjunto; su tamaño cambia el diseño.
let CLU = new Map();
function computeClusters() {
  CLU = new Map();
  for (const [k0, c0] of cells) {
    if (!c0.f.length || CLU.has(k0)) continue;
    const type = c0.f[0].s, members = [], stack = [k0];
    const cl = { type, members, size:0, tier:1, maxH:0, anchor:k0, seed:0 };
    CLU.set(k0, cl);
    while (stack.length) {
      const k = stack.pop(); members.push(k);
      const x = Math.floor(k / 4096) - 2048, z = (k % 4096) - 2048, c = cells.get(k);
      if (c.f.length > cl.maxH || (c.f.length === cl.maxH && k < cl.anchor)) { cl.maxH = c.f.length; cl.anchor = k; }
      for (const [dx,dz] of DIRS) {
        const nk = key(x+dx, z+dz), n = cells.get(nk);
        if (n && n.f.length && n.f[0].s === type && !CLU.has(nk) && inb(x+dx, z+dz)) { CLU.set(nk, cl); stack.push(nk); }
      }
    }
    cl.size = members.length;
    cl.tier = cl.size >= 8 ? 4 : cl.size >= 4 ? 3 : cl.size >= 2 ? 2 : 1;
    cl.seed = hash(Math.floor(cl.anchor / 4096) - 2048, (cl.anchor % 4096) - 2048, 7);
  }
}
function clusterKeysNear(x, z) {
  const s = new Set();
  for (const [dx,dz] of [[0,0], ...DIRS]) { const cl = CLU.get(key(x+dx, z+dz)); if (cl) for (const k of cl.members) s.add(k); }
  return s;
}
function classify(x, z) {
  {
    const c = cell(x,z); let k;
    if (c.f.length) k = 'b';
    else if (c.park) k = 'p';
    else if (c.road) k = 's';
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
  const cl = CLU.get(key(x,z)), T = cl.tier, isAnchor = cl.anchor === key(x,z);
  const clColor = AWN[Math.floor(cl.seed * AWN.length) % AWN.length];
  for (let i=0; i<h; i++) {
    const fl = c.f[i];
    const st = fl.s === 'viv' ? (i === 0 ? 'vivpb' : 'viv') : (i === 0 && onStreet) ? 'local' : fl.s;
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
      if (st === 'neg' && i > 0 && hash(x, z, 20 + i*5 + (n.dx+2)*7 + (n.dz+2)*3) < .5) {
        const by = i*FH + .04;
        box(g, plain(fl.c), along?.4:1.3, .08, along?1.3:.4, cx+n.dx*(CELL/2+.2), by, cz+n.dz*(CELL/2+.2));
        box(g, GLASS, along?.03:1.3, .32, along?1.3:.03, cx+n.dx*(CELL/2+.39), by+.2, cz+n.dz*(CELL/2+.39), false);
      }
      // viviendas: balcones con baranda en edificios altos, y entrada con plantas en planta baja
      if (st === 'viv' && h >= 4 && hash(x, z, 24 + i*5 + (n.dx+2)*7 + (n.dz+2)*3) < .45) {
        const by = i*FH + .04, wh = plain('#f4f1ea');
        box(g, wh, along?.42:1.5, .08, along?1.5:.42, cx+n.dx*(CELL/2+.21), by, cz+n.dz*(CELL/2+.21));
        box(g, wh, along?.05:1.5, .3, along?1.5:.05, cx+n.dx*(CELL/2+.4), by+.19, cz+n.dz*(CELL/2+.4));
        mesh(g, ICO, plain('#5f9a4a',{flatShading:true}), .12,.14,.12, cx+n.dx*(CELL/2+.22)+(along?0:.5), by+.2, cz+n.dz*(CELL/2+.22)+(along?.5:0), false);
      }
      if (st === 'vivpb' && n.k !== 'b') {
        const fx = cx+n.dx*(CELL/2+.1), fz = cz+n.dz*(CELL/2+.1);
        box(g, plain('#cfc8bb'), along?.22:.5, .1, along?.5:.22, fx, .1, fz, false);                  // escalón
        if (T >= 3) {                                   // conjunto de viviendas: cerco verde al frente
          for (const o of [-.66,.66]) box(g, plain('#4f8a4a'), along?.2:.62, .28, along?.62:.2, fx+(along?n.dx*.1:o), .2, fz+(along?o:n.dz*.1));
        } else for (const o of [-.72,.72]) {
          box(g, plain('#8a5a3a'), .2, .18, .2, fx+(along?0:o), .2, fz+(along?o:0), false);
          mesh(g, ICO, plain(TREEC[Math.floor(hash(x,z,o+n.dx)*4)],{flatShading:true}), .17,.2,.17, fx+(along?0:o), .42, fz+(along?o:0), false);
        }
      }
      // toldos en locales que dan a la calle
      if (st === 'local' && n.k === 's') {
        const w = T > 1 ? CELL : 1.7;                   // en conjunto, el toldo es continuo y de un solo color
        if (cl.type === 'ofi') {                        // oficinas: marquesina plana
          box(g, plain('#d9dee2'), along?.5:w, .06, along?w:.5, cx+n.dx*(CELL/2+.25), FH*.9, cz+n.dz*(CELL/2+.25));
        } else {
          const ac = T > 1 ? clColor : AWN[Math.floor(hash(x, z, 40 + n.dx*3 + n.dz)*AWN.length)];
          box(g, plain(ac), along?.55:w, .07, along?w:.55, cx+n.dx*(CELL/2+.27), FH*.82, cz+n.dz*(CELL/2+.27));
        }
      }
      // galería comercial: cornisa continua sobre la planta baja
      if (i === 0 && cl.type === 'neg' && T >= 3) {
        box(g, plain('#f4f1e8'), along?.12:CELL, .18, along?CELL:.12, cx+n.dx*(CELL/2+.05), FH, cz+n.dz*(CELL/2+.05), false);
      }
      // franjas horizontales en oficinas
      if (st === 'ofi' && i > 0) {
        box(g, plain('#d9dee2'), along?.08:CELL, .07, along?CELL:.08, cx+n.dx*(CELL/2+.03), i*FH, cz+n.dz*(CELL/2+.03), false);
      }
    }
  }
  // complejo de oficinas: columnas en las esquinas libres
  if (cl.type === 'ofi' && T >= 3) {
    for (const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      if (cls(x+dx, z) === 'b' || cls(x, z+dz) === 'b') continue;
      box(g, plain('#eef1f4'), .18, h*FH + .3, .18, cx+dx*CELL/2, (h*FH + .3)/2, cz+dz*CELL/2);
    }
  }
  // techo: depende del tipo de edificio y de los vecinos iguales pegados
  const top = c.f[h-1], y = h*FH;
  const same = n => n.k === 'b' && n.h === h && cell(x+n.dx, z+n.dz).f[h-1].s === top.s;
  const sE = same(nbs[0]), sW = same(nbs[1]), sS = same(nbs[2]), sN = same(nbs[3]);
  const ax = sE || sW, az = sS || sN, block = ax && az;
  const pitched = top.s === 'viv' && h <= 3 && !block;
  if (!pitched) for (const n of nbs) {
    if (n.k === 'b' && n.h >= h) continue;
    const along = n.dx !== 0;
    box(g, plain(top.c), along?.12:CELL, .26, along?CELL:.12, cx+n.dx*(CELL/2-.06), y+.13, cz+n.dz*(CELL/2-.06));
  }
  const r = hash(x, z, 99);
  if (pitched) {
    // en un conjunto de viviendas todos los techos son del mismo color
    const rm = plain(T >= 3 ? ROOFC[Math.floor(cl.seed * ROOFC.length) % ROOFC.length] : ROOFC[(PALETTE.indexOf(top.c) + ROOFC.length) % ROOFC.length], { flatShading:true });
    if (!ax && !az) {                      // casa suelta: techo a cuatro aguas
      const rr = (CELL + .3) / Math.SQRT2;
      mesh(g, PYR, rm, rr, .95, rr, cx, y + .475, cz);
    } else {                               // casas en hilera: techo a dos aguas continuo
      const e1 = (ax ? sE : sS) ? 0 : .15, e0 = (ax ? sW : sN) ? 0 : .15;
      const rf = mesh(g, GABLE, rm, CELL + .3, .9, CELL + e0 + e1, cx + (ax ? (e1-e0)/2 : 0), y, cz + (ax ? 0 : (e1-e0)/2));
      if (ax) rf.rotation.y = Math.PI/2;
      if (r > .55) {                       // buhardilla
        const dx = ax ? 0 : .55, dz = ax ? .55 : 0;
        box(g, plain(top.c), .5, .4, .5, cx+dx, y+.35, cz+dz);
        box(g, plain('#4d5a6a'), ax?.3:.06, .22, ax?.06:.3, cx+dx*1.45, y+.36, cz+dz*1.45, false);
        box(g, rm, ax?.6:.62, .08, ax?.62:.6, cx+dx, y+.58, cz+dz);
      }
    }
    if (r < .6) { box(g, plain('#9a5f4a'), .24, .75, .24, cx-.42, y+.5, cz-.42); box(g, plain('#6b6f78'), .3, .06, .3, cx-.42, y+.9, cz-.42); }
    if (isAnchor && T >= 3) {              // torrecita del conjunto
      box(g, plain('#f4f1ea'), .5, 1.5, .5, cx+.45, y+.75, cz+.45);
      box(g, plain('#4d5a6a'), .52, .22, .2, cx+.45, y+1.15, cz+.45, false);
      box(g, plain('#4d5a6a'), .2, .22, .52, cx+.45, y+1.15, cz+.45, false);
      mesh(g, PYR, rm, .46, .55, .46, cx+.45, y+1.77, cz+.45);
    }
  } else if (isAnchor && T >= 3 && cl.type === 'ofi') {   // complejo de oficinas: corona en la torre más alta
    box(g, facadeMat('ofi', top.c, 0), 1.5, .7, 1.5, cx, y+.35, cz);
    box(g, plain('#d9dee2'), 1.62, .08, 1.62, cx, y+.72, cz);
    box(g, facadeMat('ofi', top.c, 1), 1.0, .6, 1.0, cx, y+1.05, cz);
    box(g, plain('#d9dee2'), 1.1, .06, 1.1, cx, y+1.37, cz);
    mesh(g, CYL, plain('#6b6f78'), .04, 2.2, .04, cx, y+2.5, cz);
    box(g, REDB, .12, .12, .12, cx, y+3.6, cz, false);
  } else if (isAnchor && T >= 3 && cl.type === 'neg') {   // centro comercial: cartel en alto
    box(g, plain('#6b6f78'), .16, 1.6, .16, cx, y+.8, cz);
    box(g, plain(clColor), 1.4, .85, .24, cx, y+1.95, cz);
    box(g, BULB, 1.05, .16, .28, cx, y+2.08, cz, false);
    box(g, plain('#f4f1e8'), .7, .1, .28, cx, y+1.75, cz, false);
  } else if (isAnchor && T >= 3 && cl.type === 'viv') {   // complejo de viviendas: último piso con pileta
    box(g, plain('#f4f1ea'), .9, .6, .8, cx-.4, y+.3, cz-.4);
    box(g, plain('#b08a5e'), 1.05, .06, .95, cx-.4, y+.63, cz-.4);
    box(g, plain('#eef3f5'), .8, .14, .6, cx+.45, y+.08, cz+.5);
    box(g, plain('#6fc3dc',{roughness:.15}), .65, .04, .45, cx+.45, y+.16, cz+.5, false);
  } else if (T === 4 && cl.type === 'neg' && r < .45) {   // gran centro comercial: café con sombrillas
    box(g, plain('#b08a5e'), 1.7, .05, 1.7, cx, y+.03, cz, false);
    [[-.45,-.4],[.45,.35]].forEach(([ox,oz], i) => {
      mesh(g, CYL, plain('#f4f1ea'), .2, .04, .2, cx+ox, y+.32, cz+oz);
      mesh(g, CYL, plain('#6b6f78'), .025, .8, .025, cx+ox, y+.4, cz+oz);
      mesh(g, CONE, plain(i ? clColor : '#f4f1e8', {flatShading:true}), .45, .2, .45, cx+ox, y+.88, cz+oz);
    });
  } else if (T === 4 && cl.type === 'ofi' && r < .35) {   // gran complejo: jardín en altura
    box(g, plain('#7da35d'), 1.6, .1, 1.6, cx, y+.05, cz);
    tree(g, cx-.4, cz-.35, .7, y+.1, x);
    tree(g, cx+.45, cz+.3, .6, y+.1, z);
    box(g, plain('#9b6b43'), .5, .08, .18, cx+.3, y+.22, cz-.5);
  } else if (block && top.s === 'viv') {   // manzana de viviendas: terraza compartida
    box(g, plain('#b08a5e'), 1.7, .06, 1.7, cx, y+.03, cz, false);
    if (r < .4) {
      const p = plain('#f4f1ea');
      for (const [ox,oz] of [[-.6,-.6],[.6,-.6],[-.6,.6],[.6,.6]]) box(g, p, .07, .8, .07, cx+ox, y+.4, cz+oz);
      for (let i=-2; i<=2; i++) box(g, p, 1.4, .05, .08, cx, y+.82, cz+i*.3);
      box(g, plain('#9b6b43'), .7, .1, .4, cx, y+.3, cz);
    } else if (r < .65) {
      box(g, plain('#eef3f5'), 1.2, .16, .8, cx, y+.1, cz);
      box(g, plain('#6fc3dc',{roughness:.15}), 1.0, .04, .6, cx, y+.19, cz, false);
      box(g, plain('#e76f51'), .4, .05, .2, cx-.55, y+.1, cz+.65);
    } else {
      for (const [ox,oz] of [[-.5,-.5],[.5,.4],[-.4,.5]]) { box(g, plain('#8a5a3a'), .3,.22,.3, cx+ox, y+.14, cz+oz); mesh(g, ICO, plain('#5f9a4a',{flatShading:true}), .26,.3,.26, cx+ox, y+.45, cz+oz); }
      box(g, plain('#f2efe8'), .5, .06, .25, cx+.3, y+.2, cz-.5);
    }
  } else if (block && top.s === 'neg') {   // manzana de negocios: galería con lucernario
    box(g, plain('#d9dee2'), 1.5, .14, 1.5, cx, y+.07, cz);
    mesh(g, PYR, GLASS, 1.0, .55, 1.0, cx, y+.42, cz, false);
  } else if (block && top.s === 'ofi' && h >= 3 && r < .4) {   // manzana de oficinas: helipuerto
    mesh(g, CYL, plain('#5a5f69'), .85, .1, .85, cx, y+.05, cz);
    const w = plain('#f4f1e8');
    box(g, w, .1, .02, .7, cx-.25, y+.11, cz, false); box(g, w, .1, .02, .7, cx+.25, y+.11, cz, false); box(g, w, .5, .02, .1, cx, y+.11, cz, false);
  } else if (!block && (ax || az) && top.s === 'neg' && r < .5) {   // negocios en hilera: cartel en la terraza
    const sc = AWN[Math.floor(hash(x,z,71)*AWN.length)];
    for (const o of [-.6,.6]) box(g, plain('#6b6f78'), .06, .5, .06, cx+(ax?o:0), y+.25, cz+(ax?0:o));
    box(g, plain(sc), ax?1.7:.1, .55, ax?.1:1.7, cx, y+.72, cz);
    box(g, plain('#fff6e0'), ax?1.2:.12, .12, ax?.12:1.2, cx, y+.72, cz, false);
  } else if (h >= 9) {
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
  s.userData.pick = { x, z, street:true };
  const isRoad = cell(x,z).road;
  const isS = (a,b) => cls(a,b) === 's';
  const sw = plain('#d2cdc2');
  const walkSides = [];
  for (const [dx,dz] of DIRS) {
    if (isS(x+dx, z+dz)) continue;
    const along = dx !== 0, nk = cls(x+dx, z+dz);
    if (isRoad && (nk === 'm' || nk === 'v')) {         // camino por el campo: banquina, sin vereda
      box(g, plain('#f4f1e8'), along?.06:CELL, .01, along?CELL:.06, cx+dx*(CELL/2-.1), .045, cz+dz*(CELL/2-.1), false);
      continue;
    }
    walkSides.push([dx,dz]);
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
  const lineX = hor || (sd.length === 1 && sd[0][0] !== 0);
  if ((sd.length === 2 && (hor || ver)) || sd.length === 1) {
    for (const o of [-.5, .5]) box(g, paint, lineX?.5:.08, .01, lineX?.08:.5, cx+(lineX?o:0), .045, cz+(lineX?0:o), false);
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

const isPark = (x,z) => cls(x,z) === 'p';
// un parque grande forma un lago en las celdas totalmente rodeadas de parque
function isLake(x,z) {
  for (let dz=-1; dz<=1; dz++) for (let dx=-1; dx<=1; dx++) if (!isPark(x+dx, z+dz)) return false;
  return true;
}
const isLawn = (x,z) => isPark(x,z) && !isLake(x,z);
// ¿las cuatro celdas que comparten esta esquina son césped de parque? (ahí va un elemento central)
const quadFull = (x,z,qx,qz) => isLawn(x,z) && isLawn(x+qx,z) && isLawn(x,z+qz) && isLawn(x+qx,z+qz);
function fountain(g, px, pz, s=1) {
  mesh(g, CYL, plain('#cfc8bb'), .7*s, .25, .7*s, px, .22, pz);
  mesh(g, CYL, plain('#7cc7e0',{roughness:.15}), .58*s, .05, .58*s, px, .36, pz, false);
  mesh(g, CYL, plain('#cfc8bb'), .08*s, .5, .08*s, px, .55, pz);
  mesh(g, ICO, plain('#bfe9f5',{transparent:true,opacity:.7}), .16*s,.22,.16*s, px, .85, pz, false);
}
function parkFeature(g, px, pz, r) {
  if (r < .28) fountain(g, px, pz, 1.15);
  else if (r < .46) {                        // cantero redondo de flores
    mesh(g, CYL, plain('#cfc8bb'), .75, .16, .75, px, .16, pz);
    mesh(g, CYL, plain('#6b4a34'), .65, .04, .65, px, .25, pz, false);
    const cols = ['#ff7aa2','#ffd166','#ffffff','#c084fc','#ff9f5a'];
    for (let i=0; i<10; i++) { const a = i*.628, d = i%2 ? .45 : .22; mesh(g, ICO, plain(cols[i%5],{flatShading:true}), .09,.09,.09, px+Math.cos(a)*d, .32, pz+Math.sin(a)*d, false); }
  } else if (r < .64) {                      // juegos: hamaca y tobogán
    mesh(g, CYL, plain('#e9d9b4'), .85, .04, .85, px, .12, pz, false);
    const red = plain('#e15b4f'), blue = plain('#3f7fbf');
    for (const o of [-.4,.4]) { const l1 = box(g, red, .05, .8, .05, px-.35, .5, pz+o); l1.rotation.x = o > 0 ? -.25 : .25; }
    box(g, red, .05, .05, .9, px-.35, .88, pz);
    for (const o of [-.18,.18]) { box(g, plain('#3b3f46'), .015, .5, .015, px-.35, .62, pz+o, false); box(g, blue, .16, .03, .1, px-.35, .36, pz+o); }
    box(g, blue, .3, .5, .3, px+.4, .37, pz-.25);
    const sl = box(g, plain('#ffd166'), .26, .04, .8, px+.4, .36, pz+.25); sl.rotation.x = .55;
  } else if (r < .82) {                      // glorieta
    mesh(g, CYL, plain('#cfc8bb'), .8, .12, .8, px, .16, pz);
    for (let i=0; i<6; i++) { const a = i*1.047; mesh(g, CYL, plain('#f4f1ea'), .035, .9, .035, px+Math.cos(a)*.66, .66, pz+Math.sin(a)*.66); }
    mesh(g, CONE, plain('#7a9e7e',{flatShading:true}), .92, .5, .92, px, 1.36, pz);
  } else {                                   // árbol grande con banco circular
    mesh(g, CYL, plain('#7a5a3c'), .13, 1.1, .13, px, .65, pz);
    mesh(g, ICO, plain('#5a9a4a',{flatShading:true}), 1.0, .85, 1.0, px, 1.75, pz);
    mesh(g, ICO, plain('#7cb342',{flatShading:true}), .6, .5, .6, px+.5, 1.4, pz+.3);
    mesh(g, CYL, plain('#9b6b43'), .45, .08, .45, px, .3, pz);
  }
}

function buildPark(g, x, z, cx, cz) {
  if (isLake(x,z)) {
    const s = box(g, plain('#6fbfd8',{roughness:.15}), CELL, .06, CELL, cx, .04, cz, false);
    s.userData.pick = { x, z, park:true };
    let inner = true;
    for (const [dx,dz] of DIRS) {
      if (isLake(x+dx, z+dz)) continue;
      inner = false;
      const along = dx !== 0;                // orilla de piedra
      box(g, plain('#cfc8bb'), along?.2:CELL, .12, along?CELL:.2, cx+dx*(CELL/2-.1), .06, cz+dz*(CELL/2-.1), false);
    }
    for (const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) if (!isLake(x+dx, z+dz)) { inner = false; box(g, plain('#cfc8bb'), .2, .12, .2, cx+dx*(CELL/2-.1), .06, cz+dz*(CELL/2-.1), false); }
    const r = hash(x,z,7);
    if (inner && r < .45) {                  // islote
      mesh(g, CYL, plain('#86bd6a'), .6, .16, .6, cx, .12, cz);
      tree(g, cx+.05, cz, 1.1, .18, x+z);
    } else if (r < .35) {                    // nenúfares
      for (let i=0; i<4; i++) {
        const px = cx+(hash(x,z,40+i)-.5)*1.3, pz = cz+(hash(x,z,50+i)-.5)*1.3;
        mesh(g, CYL, plain('#5f9a4a'), .14, .02, .14, px, .08, pz, false);
        if (i%2) mesh(g, ICO, plain('#ff9ec0',{flatShading:true}), .05,.05,.05, px, .12, pz, false);
      }
    } else if (r < .6) {                     // patos
      for (let i=0; i<2; i++) {
        const px = cx+(hash(x,z,60+i)-.5)*1.1, pz = cz+(hash(x,z,70+i)-.5)*1.1;
        mesh(g, ICO, plain('#ffffff',{flatShading:true}), .11,.08,.15, px, .12, pz, false);
        mesh(g, ICO, plain('#ffffff',{flatShading:true}), .06,.06,.06, px, .22, pz+.1, false);
        box(g, plain('#f4a261'), .03,.02,.05, px, .21, pz+.17, false);
      }
    } else if (r < .7) {                     // botecito
      box(g, plain('#9b6b43'), .3, .1, .7, cx+.2, .12, cz-.1);
      box(g, plain('#f2efe8'), .26, .03, .12, cx+.2, .18, cz-.1, false);
    }
    return;
  }
  const s = box(g, plain('#86bd6a'), CELL, .1, CELL, cx, .05, cz, false);
  s.userData.pick = { x, z, park:true };
  const r = hash(x,z,7);
  const conn = DIRS.filter(([dx,dz]) => isLawn(x+dx, z+dz));
  if (!conn.length && !DIRS.some(([dx,dz]) => isPark(x+dx, z+dz))) {   // plazoleta suelta
    if (r < .18) fountain(g, cx, cz);
    else {
      const nt = 1 + Math.floor(hash(x,z,8)*3);
      for (let i=0; i<nt; i++) tree(g, cx+(hash(x,z,11+i)-.5)*1.3, cz+(hash(x,z,21+i)-.5)*1.3, .8+hash(x,z,31+i)*.5, .1, i);
      if (r > .65) bench(g, cx+.55, cz-.2, true);
      if (r > .4 && r < .7) flowers(g, cx-.3, cz+.4, x+z);
    }
    return;
  }
  // senderos que se conectan con las celdas vecinas del parque
  const path = plain('#e6dbbd');
  const arms = [...conn];
  for (const [dx,dz] of DIRS) {
    if (isPark(x+dx, z+dz)) continue;
    const along = dx !== 0;
    const gate = cls(x+dx, z+dz) === 's' && hash(x, z, 80 + dx*3 + dz) < .4;
    if (gate) {                              // entrada desde la calle, con pilares
      arms.push([dx,dz]);
      for (const o of [-.38,.38]) box(g, plain('#cfc8bb'), .16, .5, .16, cx+dx*(CELL/2-.08)+(along?0:o), .3, cz+dz*(CELL/2-.08)+(along?o:0));
      for (const o of [-.7,.7]) box(g, plain('#4f8a4a'), along?.16:.5, .3, along?.5:.16, cx+dx*(CELL/2-.08)+(along?0:o), .22, cz+dz*(CELL/2-.08)+(along?o:0));
    } else {                                 // cerco verde en el borde del parque
      box(g, plain('#4f8a4a'), along?.16:CELL, .3, along?CELL:.16, cx+dx*(CELL/2-.08), .22, cz+dz*(CELL/2-.08));
    }
  }
  if (arms.length) box(g, path, .5, .02, .5, cx, .11, cz, false);
  for (const [dx,dz] of arms) {
    const along = dx !== 0;
    box(g, path, along?CELL/2-.25:.5, .02, along?.5:CELL/2-.25, cx+dx*(CELL/4+.125), .11, cz+dz*(CELL/4+.125), false);
  }
  // elemento central donde se juntan cuatro celdas de césped (lo dibuja una sola de ellas)
  if (quadFull(x, z, 1, 1)) parkFeature(g, cx + CELL/2, cz + CELL/2, hash(x, z, 50));
  // árboles, bancos, faroles y flores en los rincones libres
  let qi = 0;
  for (const [qx,qz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    qi++;
    if (quadFull(x, z, qx, qz)) continue;
    const px = cx + qx*.62, pz = cz + qz*.62, q = hash(x, z, 90 + qi);
    if (q < .5) tree(g, px, pz, .75 + hash(x,z,30+qi)*.45, .1, qi + x);
    else if (q < .62) bench(g, cx + qx*.48, cz + qz*.5, arms.some(([dx]) => dx === 0));
    else if (q < .72) lamp(g, px, pz, -qx, 0);
    else if (q < .86) flowers(g, px, pz, x + z + qi);
  }
  // junto al lago: juncos en la orilla
  for (const [dx,dz] of DIRS) if (isLake(x+dx, z+dz) && hash(x, z, 95+dx+dz*2) < .5) {
    for (let i=0; i<3; i++) mesh(g, CYL, plain('#6f9a4a'), .025, .4+i*.08, .025, cx+dx*.8+(dx?0:(i-1)*.14-.5), .3, cz+dz*.8+(dz?0:(i-1)*.14-.5), false);
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
  for (const [k, v] of cells) if (v.f.length || v.park || v.road)
    c.push([Math.floor(k / 4096) - 2048, (k % 4096) - 2048, v.f.map(f => [f.c, f.s]), v.park ? 1 : v.road ? 2 : 0]);
  return JSON.stringify({ v:2, b:[B.x0, B.x1, B.z0, B.z1], c });
}
function deserialize(s) {
  const d = JSON.parse(s);
  cells = new Map();
  if (Array.isArray(d)) { // formato v1: grilla fija de 20×20
    B = { ...START };
    d.forEach(([f,p], i) => { if (f.length || p) cells.set(key(i % 20 - 10, Math.floor(i / 20) - 10), { f:f.map(([c,st]) => ({ c, s: st === 'casa' ? 'neg' : st })), park:p === 1, road:p === 2 }); });
    return;
  }
  B = { x0:d.b[0], x1:d.b[1], z0:d.b[2], z1:d.b[3] };
  for (const [x, z, f, p] of d.c) cells.set(key(x,z), { f:f.map(([c,st]) => ({ c, s: st === 'casa' ? 'neg' : st })), park:p === 1, road:p === 2 });
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
    if (u.street && cell(u.x, u.z).road) return { op:'unroad', x:u.x, z:u.z };
    return null;
  }
  if (tool === 'pincel') return u.floor !== undefined ? { op:'paint', x:u.x, z:u.z, i:u.floor } : null;
  let x, z;
  if (u.floor !== undefined) {
    const n = hit.face.normal;
    if (n.y > .5) { x = u.x; z = u.z; }
    else if (n.y < -.5) return null;
    else { x = u.x + Math.round(n.x); z = u.z + Math.round(n.z); }
  } else if (u.park || u.street) { x = u.x; z = u.z; }
  else { x = Math.floor(hit.point.x / CELL); z = Math.floor(hit.point.z / CELL); }
  if (!inb(x,z)) return null;
  const c = cell(x,z);
  if (tool === 'parque') return (c.f.length || c.park) ? null : { op:'park', x, z };
  if (tool === 'camino') return (c.f.length || c.park || c.road) ? null : { op:'road', x, z };
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
  else if (op.op === 'unpark' || op.op === 'unroad') { ghost.scale.set(CELL*1.03, .2, CELL*1.03); ghost.position.set(cx, .1, cz); m.color.set('#ff5a5a'); }
  else if (op.op === 'road') { ghost.scale.set(CELL, .14, CELL); ghost.position.set(cx, .07, cz); m.color.set('#4a4e57'); }
  else { ghost.scale.set(CELL*1.06, FH*1.06, CELL*1.06); ghost.position.set(cx, op.i*FH + FH/2, cz); m.color.set(op.op === 'del' ? '#ff5a5a' : color); }
}

const hint = document.getElementById('hint');
function apply(op) {
  if (!op) return;
  hist.push(serialize()); if (hist.length > 80) hist.shift();
  const before = clusterKeysNear(op.x, op.z);
  const c = cellW(op.x, op.z);
  if (op.op === 'add') { c.park = false; c.road = false; c.f.push({ c:color, s: tool }); note(c.f.length-1); }
  else if (op.op === 'park') { c.park = true; c.road = false; note(4, true); }
  else if (op.op === 'road') { c.road = true; note(2, true); }
  else if (op.op === 'unroad') { c.road = false; note(0, true); }
  else if (op.op === 'del') { c.f.splice(op.i, 1); note(0, true); }
  else if (op.op === 'unpark') { c.park = false; note(0, true); }
  else if (op.op === 'paint') { c.f[op.i].c = color; note(op.i+2); }
  tidy(op.x, op.z);
  rebuildAround(op.x, op.z);
  // si cambió un conjunto de edificios, se redibuja entero
  for (const k of new Set([...before, ...clusterKeysNear(op.x, op.z)])) {
    const kx = Math.floor(k / 4096) - 2048, kz = (k % 4096) - 2048;
    if (inb(kx, kz) && (Math.abs(kx - op.x) > 3 || Math.abs(kz - op.z) > 3)) buildCell(kx, kz);
  }
  if (op.op === 'add' || op.op === 'park' || op.op === 'road') maybeExpand(op.x, op.z);
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
  b.addEventListener('click', () => { color = c; [...colorsEl.children].forEach(x => x.classList.toggle('on', x === b)); if (tool === 'parque' || tool === 'camino' || tool === 'borrar') setTool('viv'); });
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
  const t = { '1':'viv', '2':'neg', '3':'ofi', '4':'parque', '5':'camino', '6':'pincel', '7':'borrar' }[e.key];
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
