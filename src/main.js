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

let tool = 'viv', color = PALETTE[0], muted = false, brush = 1;   // brush: lado del pincel (1, 2 o 3 celdas)

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
let CL = new Map(), streetList = [], parkList = [];
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
  CL = new Map(); streetList = []; parkList = [];
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
    else if (k === 'p') parkList.push([x,z]);
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

const isSt = (x,z) => cls(x,z) === 's';
// celda de calle totalmente rodeada de calle: ahí va una isla (rotonda o cantero de bulevar)
function isIsland(x, z) {
  for (let dz=-1; dz<=1; dz++) for (let dx=-1; dx<=1; dx++) if (!isSt(x+dx, z+dz)) return false;
  return true;
}
// ¿hay un bloque de 2×2 de calle (sin islas) con esta celda en una esquina?
const quadSt = (x,z,qx,qz) => isSt(x,z) && isSt(x+qx,z) && isSt(x,z+qz) && isSt(x+qx,z+qz)
  && !isIsland(x,z) && !isIsland(x+qx,z) && !isIsland(x,z+qz) && !isIsland(x+qx,z+qz);
const isWide = (x,z) => isSt(x,z) && [[1,1],[1,-1],[-1,1],[-1,-1]].some(([qx,qz]) => isSt(x+qx,z) && isSt(x,z+qz) && isSt(x+qx,z+qz));

function buildIsland(g, x, z, cx, cz) {
  const curb = plain('#d2cdc2'), grass = plain('#86bd6a'), r = hash(x, z, 61);
  const W = isIsland(x-1,z), E = isIsland(x+1,z), Nn = isIsland(x,z-1), S = isIsland(x,z+1);
  if (!W && !E && !Nn && !S) {               // rotonda: isla redonda con algo en el centro
    mesh(g, CYL, curb, .96, .16, .96, cx, .1, cz);
    mesh(g, CYL, grass, .84, .05, .84, cx, .19, cz, false);
    if (r < .3) fountain(g, cx, cz, .85);
    else if (r < .55) {                      // monumento
      box(g, curb, .5, .3, .5, cx, .35, cz);
      box(g, plain('#eef1f4'), .2, 1.7, .2, cx, 1.3, cz);
      mesh(g, PYR, plain('#eef1f4'), .15, .3, .15, cx, 2.3, cz);
    } else if (r < .8) {                     // árbol grande
      mesh(g, CYL, plain('#7a5a3c'), .12, 1.0, .12, cx, .7, cz);
      mesh(g, ICO, plain('#5a9a4a',{flatShading:true}), .85, .75, .85, cx, 1.7, cz);
      flowers(g, cx+.3, cz+.3, x+z);
    } else {                                 // cantero con farol
      for (let i=0; i<8; i++) mesh(g, ICO, plain(['#ff7aa2','#ffd166','#ffffff','#c084fc'][i%4],{flatShading:true}), .1,.1,.1, cx+Math.cos(i*.785)*.5, .27, cz+Math.sin(i*.785)*.5, false);
      mesh(g, CYL, plain('#3b3f46'), .05, 1.9, .05, cx, 1.1, cz);
      for (const o of [-.3,.3]) { box(g, plain('#3b3f46'), .34, .04, .05, cx+o/2, 2.02, cz); box(g, BULB, .14, .06, .14, cx+o, 1.97, cz, false); }
    }
    return;
  }
  // bulevar: cantero central que se une con los vecinos
  const x0 = W ? -1 : -.72, x1 = E ? 1 : .72, z0 = Nn ? -1 : -.72, z1 = S ? 1 : .72;
  box(g, curb, x1-x0, .16, z1-z0, cx+(x0+x1)/2, .1, cz+(z0+z1)/2);
  box(g, grass, x1-x0-(W?0:.1)-(E?0:.1), .05, z1-z0-(Nn?0:.1)-(S?0:.1), cx+(x0+x1)/2+((W?0:.05)-(E?0:.05)), .19, cz+(z0+z1)/2+((Nn?0:.05)-(S?0:.05)), false);
  if (r < .55) tree(g, cx+(hash(x,z,62)-.5)*.5, cz+(hash(x,z,63)-.5)*.5, 1+hash(x,z,64)*.4, .2, x+z);
  else if (r < .8) {                         // farol doble
    const alongX = W || E;
    mesh(g, CYL, plain('#3b3f46'), .05, 1.9, .05, cx, 1.1, cz);
    for (const o of [-.4,.4]) { box(g, plain('#3b3f46'), alongX?.05:.4, .04, alongX?.4:.05, cx+(alongX?0:o/2), 2.02, cz+(alongX?o/2:0)); box(g, BULB, .14, .06, .14, cx+(alongX?0:o), 1.97, cz+(alongX?o:0), false); }
  } else flowers(g, cx, cz, x*2+z);
}

// donde se juntan cuatro celdas de calle: separador de avenida o mini rotonda
function streetQuad(g, x, z, cx, cz) {
  if (!quadSt(x, z, 1, 1)) return;
  const px = cx + CELL/2, pz = cz + CELL/2, curb = plain('#d2cdc2');
  const two = (a,b,c,d) => isSt(a,b) && isSt(c,d) && !isIsland(a,b) && !isIsland(c,d);
  const contX = two(x+2,z, x+2,z+1) || two(x-1,z, x-1,z+1);
  const contZ = two(x,z+2, x+1,z+2) || two(x,z-1, x+1,z-1);
  const r = hash(x, z, 66);
  if (contX === contZ) {                     // cruce o plazoleta: mini rotonda
    mesh(g, CYL, curb, .46, .16, .46, px, .1, pz);
    mesh(g, CYL, plain('#86bd6a'), .36, .05, .36, px, .19, pz, false);
    if (r < .5) mesh(g, ICO, plain('#5f9a4a',{flatShading:true}), .26, .3, .26, px, .42, pz);
    else { mesh(g, CYL, plain('#3b3f46'), .04, 1.5, .04, px, .9, pz); box(g, BULB, .16, .08, .16, px, 1.68, pz, false); }
  } else {                                   // avenida: separador central
    box(g, curb, contX?CELL:.24, .14, contX?.24:CELL, px, .09, pz);
    if (r < .3) mesh(g, ICO, plain('#5f9a4a',{flatShading:true}), .2, .22, .2, px, .3, pz);
    else if (r < .45) {
      mesh(g, CYL, plain('#3b3f46'), .04, 1.7, .04, px, 1.0, pz);
      for (const o of [-.3,.3]) box(g, BULB, .14, .06, .14, px+(contX?0:o), 1.82, pz+(contX?o:0), false);
      box(g, plain('#3b3f46'), contX?.05:.7, .04, contX?.7:.05, px, 1.87, pz);
    }
  }
}

function buildStreet(g, x, z, cx, cz) {
  const s = box(g, plain('#4a4e57',{roughness:.95}), CELL, .04, CELL, cx, .02, cz, false);
  s.userData.pick = { x, z, street:true };
  const isRoad = cell(x,z).road;
  const isS = (a,b) => cls(a,b) === 's';
  if (isIsland(x, z)) { buildIsland(g, x, z, cx, cz); return; }
  const wide = isWide(x, z);
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
  if (wide) {                                // calle ancha: sin sendas en cada celda
    streetQuad(g, x, z, cx, cz);
  } else if ((sd.length === 2 && (hor || ver)) || sd.length === 1) {
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
// entrada al parque desde la calle: la celda de parque (x,z) mirando hacia (dx,dz)
const isGate = (x,z,dx,dz) => cls(x+dx, z+dz) === 's' && hash(x, z, 80 + dx*3 + dz) < .4;
// plazoleta suelta: una sola celda de parque, sin cerco
const isPlaza = (x,z) => isPark(x,z) && !DIRS.some(([dx,dz]) => isPark(x+dx, z+dz));
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
    const gate = isGate(x, z, dx, dz);
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
const streetNbs = (x,z) => DIRS.map(([dx,dz]) => [x+dx, z+dz]).filter(([a,b]) => cls(a,b) === 's' && !isIsland(a,b));
// Elige la próxima celda: en rotondas y bulevares la isla queda a la izquierda;
// en avenidas, cada carril tiene su sentido (el otro carril queda a la izquierda).
function pickNext(P, pool) {
  const [px,pz] = P;
  let refs = [];
  for (let dz=-1; dz<=1; dz++) for (let dx=-1; dx<=1; dx++) if ((dx || dz) && isIsland(px+dx, pz+dz)) refs.push([dx,dz]);
  if (!refs.length && isWide(px,pz)) refs = DIRS.filter(([dx,dz]) => isWide(px+dx, pz+dz));
  if (!refs.length) return pool[Math.floor(Math.random()*pool.length)];
  const scored = pool.map(q => {
    const vx = q[0]-px, vz = q[1]-pz; let s = 0;
    for (const [rx,rz] of refs) s += rx*vz - rz*vx;
    return [q, s];
  });
  const ok = scored.filter(([,s]) => s >= 0), list = ok.length ? ok : scored;
  let tot = 0; for (const [,s] of list) tot += s > 0 ? 4 : 1;
  let pick = Math.random()*tot;
  for (const [q,s] of list) { pick -= s > 0 ? 4 : 1; if (pick <= 0) return q; }
  return list[0][0];
}
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
    if (nb.length && !isIsland(...s)) {
      const c = { mesh:makeCar(), from:s, to:nb[Math.floor(Math.random()*nb.length)], t:Math.random(), sp:1.6+Math.random()*1.2 };
      carRoot.add(c.mesh); placeCar(c, true); cars.push(c);
    }
  }
  for (let i=cars.length-1; i>=0; i--) {
    const c = cars[i];
    if (cls(...c.from) !== 's' || cls(...c.to) !== 's' || isIsland(...c.to) || cars.length > want+3) { carRoot.remove(c.mesh); cars.splice(i,1); continue; }
    c.t += c.sp*dt/CELL;
    if (c.t >= 1) {
      c.t -= 1;
      const nb = streetNbs(...c.to);
      const opts = nb.filter(([a,b]) => !(a === c.from[0] && b === c.from[1]));
      const pool = opts.length ? opts : nb;
      if (!pool.length) { carRoot.remove(c.mesh); cars.splice(i,1); continue; }
      c.from = c.to; c.to = pickNext(c.from, pool);
    }
    placeCar(c, false);
  }
}

/* ---------- peatones ---------- */
// Caminan por las veredas, cruzan la calle, entran y salen de los edificios y pasean por los parques.
// No se guarda ningún grafo: cada peatón pregunta a dónde puede ir cuando llega a un punto.
const PED_MAX = 90, SW = CELL/2 - .225;      // SW: distancia del centro de la celda al medio de la vereda
const OPP = [1,0,3,2];
const toCols = a => a.map(c => new THREE.Color(c));
const SHIRTC = toCols(['#e76f51','#f4a261','#e9c46a','#2a9d8f','#457b9d','#f1faee','#d98ba6','#8ecae6','#b5838d','#6d597a','#c8553d','#7a9e7e']);
const PANTC = toCols(['#2f3542','#3d4a6b','#5c4a3d','#6b7280','#274060','#8a8577']);
const SKINC = toCols(['#f3d2b3','#e0ac69','#c68642','#8d5524','#ffdbac']);
const pedMat = plain('#ffffff', { roughness:.8 });
function pedInst(geo, n) {
  const m = new THREE.InstancedMesh(geo, pedMat, n);
  m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0;
  m.setColorAt(0, SKINC[0]);
  scene.add(m); return m;
}
const pedLegs = pedInst(BOX, PED_MAX*2), pedBody = pedInst(BOX, PED_MAX), pedHead = pedInst(ICO, PED_MAX);
const peds = [], pedDummy = new THREE.Object3D();

// ¿la celda de calle (x,z) tiene vereda del lado di?
function hasWalk(x, z, di) {
  if (!isSt(x,z)) return false;
  const nk = cls(x + DIRS[di][0], z + DIRS[di][1]);
  if (nk === 's') return false;
  return !(cell(x,z).road && (nk === 'm' || nk === 'v'));
}
// celda de parque por la que se puede caminar (no lago, no la plazoleta con fuente en el medio)
const parkOk = (x,z) => isLawn(x,z) && !(isPlaza(x,z) && hash(x,z,7) < .18);
const nodeOk = n => n.p ? parkOk(n.x, n.z) : hasWalk(n.x, n.z, n.d);
const nodePos = n => n.p ? [wx(n.x), wx(n.z)] : [wx(n.x) + DIRS[n.d][0]*SW, wx(n.z) + DIRS[n.d][1]*SW];
const sameNode = (a,b) => a && b && a.x === b.x && a.z === b.z && !a.p === !b.p && (a.p || a.d === b.d);
const W = (x,z,d) => ({ x, z, d }), P = (x,z) => ({ x, z, p:true });

// Opciones desde un punto: { node, via, w (peso), cross, door }
function pedOptions(n) {
  const out = [], cx = wx(n.x), cz = wx(n.z);
  if (n.p) {
    for (let di=0; di<4; di++) {
      const [dx,dz] = DIRS[di], ax = n.x+dx, az = n.z+dz;
      if (parkOk(ax,az)) out.push({ node:P(ax,az), w:3 });
      else if (hasWalk(ax,az,OPP[di]) && (isPlaza(n.x,n.z) || isGate(n.x,n.z,dx,dz))) out.push({ node:W(ax,az,OPP[di]), w:1.5 });
    }
    return out;
  }
  const [dx,dz] = DIRS[n.d];
  for (const pi of (n.d < 2 ? [2,3] : [0,1])) {
    const [px,pz] = DIRS[pi], ax = n.x+px, az = n.z+pz;
    if (hasWalk(n.x,n.z,pi)) out.push({ node:W(n.x,n.z,pi), via:[cx+(dx+px)*SW, cz+(dz+pz)*SW], w:4 });   // esquina de la misma celda
    else if (isSt(ax,az)) {
      if (hasWalk(ax,az,n.d)) out.push({ node:W(ax,az,n.d), w:4 });                                      // sigue derecho
      else if (hasWalk(ax+dx,az+dz,OPP[pi]))                                                             // dobla la esquina de la manzana
        out.push({ node:W(ax+dx,az+dz,OPP[pi]), via:[cx+px*(CELL-SW)+dx*SW, cz+pz*(CELL-SW)+dz*SW], w:4 });
    }
  }
  let qx = n.x, qz = n.z;                    // cruzar a la vereda de enfrente (hasta 3 carriles)
  for (let i=0; i<3; i++) {
    if (hasWalk(qx,qz,OPP[n.d])) { out.push({ node:W(qx,qz,OPP[n.d]), w:.5, cross:true }); break; }
    qx -= dx; qz -= dz;
    if (!isSt(qx,qz) || isIsland(qx,qz)) break;
  }
  const bx = n.x+dx, bz = n.z+dz, nk = cls(bx,bz);
  if (nk === 'b') out.push({ door:[cx+dx*(SW+.32), cz+dz*(SW+.32)], w:.45 });
  else if (nk === 'p' && parkOk(bx,bz) && (isPlaza(bx,bz) || isGate(bx,bz,-dx,-dz))) out.push({ node:P(bx,bz), w:2.5 });
  return out;
}
function pedChoose(p) {
  let opts = pedOptions(p.node);
  if (p.steps < 3) opts = opts.filter(o => !o.door);
  const fwd = opts.filter(o => o.door || !sameNode(o.node, p.prev));
  const list = fwd.length ? fwd : opts;
  if (!list.length) return null;
  let tot = 0; for (const o of list) tot += o.w;
  let r = Math.random()*tot;
  for (const o of list) { r -= o.w; if (r <= 0) return o; }
  return list[0];
}
function spawnPed(fromDoor) {
  let node = null;
  const parkShare = parkList.length*1.5 / (parkList.length*1.5 + streetList.length + .001);
  for (let tries=0; tries<8 && !node; tries++) {
    if (Math.random() < parkShare) {
      const [x,z] = parkList[Math.floor(Math.random()*parkList.length)];
      if (parkOk(x,z)) node = P(x,z);
    } else if (streetList.length) {
      const [x,z] = streetList[Math.floor(Math.random()*streetList.length)], d = Math.floor(Math.random()*4);
      if (hasWalk(x,z,d) && (!fromDoor || tries > 5 || cls(x+DIRS[d][0], z+DIRS[d][1]) === 'b')) node = W(x,z,d);
    }
  }
  if (!node) return;
  const [nx,nz] = nodePos(node);
  const p = { x:nx, z:nz, node, prev:null, path:[], s:0, gy:.12, low:false, ang:Math.random()*6.28, wait:0, steps:0, leaving:false, moving:false,
    sp:.45+Math.random()*.35, ph:Math.random()*6.28, tall:.88+Math.random()*.26,
    shirt:SHIRTC[Math.floor(Math.random()*SHIRTC.length)], pant:PANTC[Math.floor(Math.random()*PANTC.length)], skin:SKINC[Math.floor(Math.random()*SKINC.length)] };
  if (!node.p && cls(node.x+DIRS[node.d][0], node.z+DIRS[node.d][1]) === 'b' && fromDoor) {   // sale por la puerta
    p.x = nx + DIRS[node.d][0]*.32; p.z = nz + DIRS[node.d][1]*.32; p.path = [[nx,nz]];
  } else p.wait = Math.random()*1.5;
  peds.push(p);
}
function updatePeds(dt, t) {
  const want = Math.min(PED_MAX-10, Math.floor(streetList.length*.45 + parkList.length*.8));
  if (peds.length < want) spawnPed(peds.length > want*.6);
  else if (peds.length > want+4) peds[Math.floor(Math.random()*peds.length)].leaving = true;
  for (let i=peds.length-1; i>=0; i--) {
    const p = peds[i];
    if (!p.leaving && !nodeOk(p.node)) p.leaving = true, p.path = [];     // le cambiaron el lugar: se va
    p.moving = false;
    if (p.path.length) {
      const [tx,tz] = p.path[0], ex = tx-p.x, ez = tz-p.z, d = Math.hypot(ex,ez), stepLen = p.sp*dt;
      if (d <= stepLen) { p.x = tx; p.z = tz; p.path.shift(); if (!p.path.length) p.low = false; }
      else { p.x += ex/d*stepLen; p.z += ez/d*stepLen; let a = Math.atan2(ex,ez) - p.ang; a = Math.atan2(Math.sin(a), Math.cos(a)); p.ang += a*Math.min(1, dt*10); }
      p.moving = true;
    } else if (p.leaving) {
      p.s -= dt*4;
      if (p.s <= 0) { peds.splice(i,1); continue; }
    } else if (p.wait > 0) p.wait -= dt;
    else {
      p.steps++;
      if (p.node.p && p.strolled !== p.steps-1 && Math.random() < .4) {   // en el parque: se aparta del sendero y se queda un rato
        p.strolled = p.steps; p.wait = 3 + Math.random()*6;
        p.path = [[wx(p.node.x)+(Math.random()-.5)*1.0, wx(p.node.z)+(Math.random()-.5)*1.0]];
      } else {
        const o = pedChoose(p);
        if (!o) { p.wait = 2 + Math.random()*4; if (p.node.p) p.path = [[wx(p.node.x)+(Math.random()-.5)*1.0, wx(p.node.z)+(Math.random()-.5)*1.0]]; }
        else if (o.door) { p.path = [o.door]; p.leaving = true; }
        else {
          p.prev = p.node; p.node = o.node; p.low = !!o.cross;
          p.path = o.via ? [o.via, nodePos(o.node)] : [nodePos(o.node)];
          if (!o.node.p && Math.random() < .05) p.wait = 1 + Math.random()*2.5;   // cada tanto frena a mirar
        }
      }
    }
    if (!p.leaving) p.s = Math.min(1, p.s + dt*3);
    p.gy += ((p.low ? .045 : .12) - p.gy) * Math.min(1, dt*8);
  }
  // dibujar: dos piernas, cuerpo y cabeza por persona (todo instanciado)
  const D = pedDummy, n = peds.length;
  for (let i=0; i<n; i++) {
    const p = peds[i], s = p.s * p.tall, sw = p.moving ? Math.sin(t*p.sp*17 + p.ph) : 0, bob = Math.abs(sw)*.02*s;
    const fx = Math.sin(p.ang), fz = Math.cos(p.ang);
    D.rotation.set(0, p.ang, 0);
    for (let j=0; j<2; j++) {
      const side = j ? .034 : -.034, f = (j ? sw : -sw)*.05*s;
      D.position.set(p.x + fz*side*s + fx*f, p.gy + .065*s + Math.max(0, j ? sw : -sw)*.02*s, p.z - fx*side*s + fz*f);
      D.scale.set(.055*s, .13*s, .06*s); D.updateMatrix();
      pedLegs.setMatrixAt(i*2+j, D.matrix); pedLegs.setColorAt(i*2+j, p.pant);
    }
    D.position.set(p.x, p.gy + .215*s + bob, p.z); D.scale.set(.15*s, .18*s, .085*s); D.updateMatrix();
    pedBody.setMatrixAt(i, D.matrix); pedBody.setColorAt(i, p.shirt);
    D.position.set(p.x, p.gy + .365*s + bob, p.z); D.scale.setScalar(.062*s); D.updateMatrix();
    pedHead.setMatrixAt(i, D.matrix); pedHead.setColorAt(i, p.skin);
  }
  pedLegs.count = n*2; pedBody.count = pedHead.count = n;
  for (const m of [pedLegs, pedBody, pedHead]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
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
// Todo suena en La menor pentatónica (La, Do, Re, Mi, Sol).
// De fondo, una guitarra acústica arpegia Am – F – C – G: las cinco notas de la escala
// son parte de esos acordes o los adornan bien, así que cualquier nota que toque el jugador suena afinada.
// Cada tipo de bloque tiene su instrumento; en los edificios, cuanto más alto el piso, más aguda la nota.
let AC = null, master, musicBus, sfxBus;
let audioMode = 0;                       // 0 música y sonidos · 1 solo sonidos · 2 silencio
try { audioMode = +(localStorage.getItem('barrio-audio') || 0) % 3; } catch(e) {}
const PENTA = [0,3,5,7,10];
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);
const pentaMidi = (base, step) => base + PENTA[((step % 5) + 5) % 5] + 12 * Math.max(0, Math.min(2, Math.floor(step / 5)));

function initAudio() {
  if (AC) return true;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return false; }
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master = AC.createGain(); master.gain.value = .9; master.connect(comp); comp.connect(AC.destination);
  // reverberación suave, generada (sala chica)
  const len = Math.floor(AC.sampleRate * 2.2), ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch=0; ch<2; ch++) { const d = ir.getChannelData(ch); for (let i=0; i<len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.6); }
  const rev = AC.createConvolver(); rev.buffer = ir;
  const wet = AC.createGain(); wet.gain.value = .2; rev.connect(wet); wet.connect(master);
  sfxBus = AC.createGain(); sfxBus.gain.value = .55; sfxBus.connect(master); sfxBus.connect(rev);
  // la guitarra pasa por un "cuerpo": realce de graves y recorte de agudos
  musicBus = AC.createGain(); musicBus.gain.value = audioMode === 0 ? .5 : 0;
  const body = AC.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 190; body.Q.value = 1.1; body.gain.value = 4;
  const air = AC.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 5200;
  musicBus.connect(body); body.connect(air); air.connect(master); air.connect(rev);
  nextBeat = AC.currentTime + .5;
  setInterval(scheduler, 90);
  return true;
}

// Cuerda pulsada (Karplus-Strong): una ráfaga de ruido que recircula y se va apagando, como una cuerda real.
const pluckCache = new Map();
function pluckBuf(midi) {
  let p = pluckCache.get(midi);
  if (p) return p;
  const sr = AC.sampleRate, f = midiHz(midi), N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 3.2);
  const out = new Float32Array(len), raw = new Float32Array(N), line = new Float32Array(N);
  let prev = 0;
  for (let i=0; i<N; i++) { prev = prev*.55 + (Math.random()*2-1)*.45; raw[i] = prev; }       // ataque suave, de yema
  const pp = Math.max(1, Math.floor(N * .18));                                                 // punto donde se pulsa la cuerda
  for (let i=0; i<N; i++) line[i] = raw[i] - .6 * raw[(i + N - pp) % N];
  let idx = 0, peak = 0;
  for (let i=0; i<len; i++) {
    const nx = (idx + 1) % N, y = line[idx];
    out[i] = y; if (Math.abs(y) > peak) peak = Math.abs(y);
    line[idx] = .9975 * .5 * (y + line[nx]);
    idx = nx;
  }
  const fade = Math.floor(sr * .25), k = .9 / (peak || 1);
  for (let i=0; i<len; i++) out[i] *= k * (i > len - fade ? (len - i) / fade : 1);
  const buf = AC.createBuffer(1, len, sr); buf.getChannelData(0).set(out);
  p = { buf, rate: f * (N - .5) / sr };                                                        // corrige la afinación
  pluckCache.set(midi, p);
  return p;
}
function playPluck(midi, t, vel, bus, ring) {
  const p = pluckBuf(midi), src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = p.buf; src.playbackRate.value = p.rate;
  g.gain.setValueAtTime(vel, t);
  g.gain.setTargetAtTime(0, t + ring, .12);                                                    // se apaga al cambiar de acorde
  src.connect(g); g.connect(bus);
  src.start(t); src.stop(t + ring + .8);
}

// Guitarra de fondo: arpegio en corcheas, un compás por acorde.
const STEP = 60 / 72 / 2;
const CHORDS = [
  { bass:45, alt:52, up:[57,60,64] },   // La menor: La2 (Mi3) · La3 Do4 Mi4
  { bass:41, alt:48, up:[57,60,65] },   // Fa:       Fa2 (Do3) · La3 Do4 Fa4
  { bass:48, alt:55, up:[55,60,64] },   // Do:       Do3 (Sol3) · Sol3 Do4 Mi4
  { bass:43, alt:50, up:[55,59,62] },   // Sol:      Sol2 (Re3) · Sol3 Si3 Re4
];
const PATS = [[-1,0,1,2,1,0,1,0], [-1,1,2,1,-2,1,2,1]];   // -1 bajo · -2 bajo alterno · 0-2 cuerdas agudas
let nextBeat = 0, stepN = 0;
function scheduler() {
  if (!AC || AC.state !== 'running' || audioMode !== 0) return;
  if (nextBeat < AC.currentTime) nextBeat = AC.currentTime + .08;
  while (nextBeat < AC.currentTime + .35) {
    const bar = Math.floor(stepN / 8), s = stepN % 8, ch = CHORDS[bar % 4], pat = PATS[Math.floor(bar / 4) % 2];
    const p = pat[s], midi = p === -1 ? ch.bass : p === -2 ? ch.alt : ch.up[p];
    const t = nextBeat + (Math.random() - .5) * .016 + (s % 2 ? .018 : 0);                     // toque humano
    const vel = (p < 0 ? .9 : .55) * (s % 2 ? .8 : 1) * (.85 + Math.random() * .3);
    playPluck(midi, Math.max(t, AC.currentTime), vel, musicBus, STEP * 9);
    if (s === 0 && bar % 4 === 0 && bar > 0)                                                   // rasgueo suave al volver a La menor
      ch.up.forEach((n, i) => playPluck(n, nextBeat + .03 + i * .028, .28, musicBus, STEP * 8));
    stepN++; nextBeat += STEP;
  }
}

// Un sonido sintetizado: nota principal + armónicos, con su forma de ataque y caída.
function tone(o) {
  const g = AC.createGain(), hold = o.hold || 0, end = o.t + o.a + hold + o.d;
  g.gain.setValueAtTime(.0001, o.t);
  g.gain.linearRampToValueAtTime(o.g, o.t + o.a);
  if (hold) g.gain.setValueAtTime(o.g, o.t + o.a + hold);
  g.gain.exponentialRampToValueAtTime(.0001, end);
  g.connect(sfxBus);
  const mk = (f, type, lvl, dec) => {
    const os = AC.createOscillator(); os.type = type; os.frequency.setValueAtTime(f, o.t);
    let dest = g;
    if (lvl !== 1) { const pg = AC.createGain(); pg.gain.setValueAtTime(lvl, o.t); if (dec) pg.gain.exponentialRampToValueAtTime(.0001, o.t + dec); pg.connect(g); dest = pg; }
    os.connect(dest); os.start(o.t); os.stop(end + .05);
    return os;
  };
  const main = mk(o.f, o.type || 'sine', 1);
  for (const [r, l, dec] of o.over || []) mk(o.f * r, 'sine', l, dec);
  if (o.glide) main.frequency.exponentialRampToValueAtTime(o.f * o.glide, end);
  if (o.vib) { const l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 5.2; lg.gain.value = o.f * .006; l.connect(lg); lg.connect(main.frequency); l.start(o.t + .08); l.stop(end); }
  if (o.fm) { const mo = AC.createOscillator(), mg = AC.createGain(); mo.frequency.value = o.f * o.fm[0]; mg.gain.setValueAtTime(o.f * o.fm[1], o.t); mg.gain.exponentialRampToValueAtTime(o.f * .05, o.t + .5); mo.connect(mg); mg.connect(main.frequency); mo.start(o.t); mo.stop(end + .05); }
}
// Un instrumento por tipo de bloque, todos en La menor pentatónica.
function voice(kind, step, t, vel) {
  if (kind === 'viv')         tone({ t, f:midiHz(pentaMidi(57, step)), a:.004, d:1.2, g:.45*vel, over:[[2,.25,.5],[5.4,.1,.07]] });                    // kalimba
  else if (kind === 'neg')    tone({ t, f:midiHz(pentaMidi(69, step)), a:.002, d:1.4, g:.28*vel, over:[[2.76,.3,.6],[5.4,.15,.2],[8.9,.06,.08]] });    // campanita
  else if (kind === 'ofi')    tone({ t, f:midiHz(pentaMidi(57, step)), a:.005, d:1.5, g:.38*vel, fm:[1,1.6], over:[[14,.04,.06]] });                   // piano eléctrico
  else if (kind === 'parque') tone({ t, f:midiHz(pentaMidi(69, step)), a:.07, hold:.22, d:.5, g:.26*vel, over:[[2,.12],[3,.04]], vib:true });          // flauta
  else if (kind === 'camino') playPluck(pentaMidi(45, step), t, .8*vel, sfxBus, .45);                                                                  // cuerda grave apagada
  else if (kind === 'pincel') tone({ t, f:midiHz(pentaMidi(81, step)), a:.002, d:.18, g:.16*vel });                                                    // toque agudo
  else if (kind === 'borrar') tone({ t, f:midiHz(pentaMidi(57, 2)), type:'triangle', a:.004, d:.28, g:.2*vel, glide:.66 });                            // nota que cae
  else                        tone({ t, f:midiHz(pentaMidi(57, step)), a:.004, d:1.0, g:.22*vel, over:[[2,.2,.4]] });                                  // kalimba suave
}
// parque y camino no tienen altura: su melodía va paseando por la escala
const walk = { parque:5, camino:2 };
function stepWalk(kind) {
  const moves = [-2,-1,1,2];
  walk[kind] = Math.max(0, Math.min(9, walk[kind] + moves[Math.floor(Math.random()*4)]));
  return walk[kind];
}
// n > 1 (pincel grande): pequeño arpegio ascendente
function sfx(kind, step = 0, n = 1) {
  if (audioMode === 2 || !initAudio()) return;
  if (AC.state === 'suspended') AC.resume();
  const t0 = AC.currentTime + .005, count = Math.min(3, n);
  for (let k=0; k<count; k++) voice(kind, step + k*2, t0 + k*.085, k ? .75 : 1);
}
function note(i, soft) { sfx(soft ? 'soft' : 'viv', i); }
function setAudioMode(mode) {
  audioMode = mode;
  try { localStorage.setItem('barrio-audio', mode); } catch(e) {}
  if (mode !== 2 && initAudio() && AC.state === 'suspended') AC.resume();
  if (AC) musicBus.gain.setTargetAtTime(mode === 0 ? .5 : 0, AC.currentTime, .25);
}
// el navegador solo deja sonar después del primer toque
const kickAudio = () => { if (audioMode !== 2 && initAudio() && AC.state === 'suspended') AC.resume(); };
addEventListener('pointerdown', kickAudio, { once:true });
addEventListener('keydown', kickAudio, { once:true });
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : (audioMode !== 2 && AC.resume()); });
window.__barrioAudio = () => ({ state: AC && AC.state, stepN, mode: audioMode });

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
    if (brush > 1) {
      const x = u.x !== undefined ? u.x : Math.floor(hit.point.x / CELL), z = u.z !== undefined ? u.z : Math.floor(hit.point.z / CELL);
      if (brushCells(x, z).some(([a,b]) => { const c = cell(a,b); return c.f.length || c.park || c.road; })) return { op:'sweep', x, z };
    }
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
  else if (op.op === 'unpark' || op.op === 'unroad' || op.op === 'sweep') { ghost.scale.set(CELL*1.03, .2, CELL*1.03); ghost.position.set(cx, .1, cz); m.color.set('#ff5a5a'); }
  else if (op.op === 'road') { ghost.scale.set(CELL, .14, CELL); ghost.position.set(cx, .07, cz); m.color.set('#4a4e57'); }
  else { ghost.scale.set(CELL*1.06, FH*1.06, CELL*1.06); ghost.position.set(cx, op.i*FH + FH/2, cz); m.color.set(op.op === 'del' ? '#ff5a5a' : color); }
  // el fantasma muestra toda la superficie del pincel
  ghost.scale.x *= brush; ghost.scale.z *= brush;
  if (brush === 2) { ghost.position.x += CELL/2; ghost.position.z += CELL/2; }
}

const hint = document.getElementById('hint');
// celdas que cubre el pincel: 1×1, 2×2 (4 lugares) o 3×3 (9 lugares)
function brushCells(x, z) {
  const o = brush === 1 ? [0] : brush === 2 ? [0,1] : [-1,0,1], out = [];
  for (const dz of o) for (const dx of o) if (inb(x+dx, z+dz)) out.push([x+dx, z+dz]);
  return out;
}
// convierte una acción en una acción por cada celda del pincel
function expandOp(op) {
  const out = [];
  for (const [x,z] of brushCells(op.x, op.z)) {
    const c = cell(x,z);
    if (x === op.x && z === op.z && op.op !== 'sweep') { out.push(op); continue; }
    if (op.op === 'add') { if (c.f.length < MAXH) out.push({ op:'add', x, z }); }
    else if (op.op === 'park') { if (!c.f.length && !c.park) out.push({ op:'park', x, z }); }
    else if (op.op === 'road') { if (!c.f.length && !c.park && !c.road) out.push({ op:'road', x, z }); }
    else if (op.op === 'paint') { if (c.f.length > op.i) out.push({ op:'paint', x, z, i:op.i }); }
    else if (c.f.length) out.push({ op:'del', x, z, i:c.f.length-1 });
    else if (c.park) out.push({ op:'unpark', x, z });
    else if (c.road) out.push({ op:'unroad', x, z });
  }
  return out;
}
function apply(op) {
  if (!op) return;
  const ops = expandOp(op);
  if (!ops.length) return;
  hist.push(serialize()); if (hist.length > 80) hist.shift();
  const touched = new Set();
  for (const o of ops) for (const k of clusterKeysNear(o.x, o.z)) touched.add(k);
  let top = 0;
  for (const o of ops) {
    const c = cellW(o.x, o.z);
    if (o.op === 'add') { c.park = false; c.road = false; c.f.push({ c:color, s: tool }); top = Math.max(top, c.f.length-1); }
    else if (o.op === 'park') { c.park = true; c.road = false; }
    else if (o.op === 'road') c.road = true;
    else if (o.op === 'unroad') c.road = false;
    else if (o.op === 'del') c.f.splice(o.i, 1);
    else if (o.op === 'unpark') c.park = false;
    else if (o.op === 'paint') c.f[o.i].c = color;
    tidy(o.x, o.z);
  }
  const kind = ops[0].op;
  if (kind === 'add') sfx(tool, top, ops.length);
  else if (kind === 'park') sfx('parque', stepWalk('parque'), ops.length);
  else if (kind === 'road') sfx('camino', stepWalk('camino'), ops.length);
  else if (kind === 'paint') sfx('pincel', op.i, ops.length);
  else sfx('borrar');
  // se redibuja la zona tocada y, enteros, los conjuntos de edificios que cambiaron
  computeClasses();
  const xs = ops.map(o => o.x), zs = ops.map(o => o.z);
  const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, z0 = Math.min(...zs) - 3, z1 = Math.max(...zs) + 3;
  for (let z=z0; z<=z1; z++) for (let x=x0; x<=x1; x++) if (inb(x,z)) buildCell(x,z);
  for (const o of ops) for (const k of clusterKeysNear(o.x, o.z)) touched.add(k);
  for (const k of touched) {
    const kx = Math.floor(k / 4096) - 2048, kz = (k % 4096) - 2048;
    if (inb(kx, kz) && (kx < x0 || kx > x1 || kz < z0 || kz > z1)) buildCell(kx, kz);
  }
  if (kind === 'add' || kind === 'park' || kind === 'road') for (const o of ops) maybeExpand(o.x, o.z);
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
const brushBtn = document.getElementById('brush');
function cycleBrush() {
  brush = brush % 3 + 1; ghost.visible = false;
  brushBtn.innerHTML = ['▫️','◽','⬜'][brush-1] + '<span>' + brush + '×' + brush + '</span>';
  brushBtn.classList.toggle('on', brush > 1);
}
brushBtn.addEventListener('click', cycleBrush);
const skyBtn = document.getElementById('sky');
function cycleSky() { skyIdx = (skyIdx+1) % PRESETS.length; const p = PRESETS[skyIdx]; skyBtn.innerHTML = `${p.icon}<span>${p.name}</span>`; }
skyBtn.addEventListener('click', cycleSky);
function undo() { if (!hist.length) return; deserialize(hist.pop()); save(); rebuildAll(); fitWorld(); note(1, true); }
document.getElementById('undo').addEventListener('click', undo);
const muteBtn = document.getElementById('mute');
const AUDIO_UI = [['🎵','Música y sonidos'], ['🔈','Solo sonidos'], ['🔇','Silencio']];
function showAudioMode() { muteBtn.textContent = AUDIO_UI[audioMode][0]; muteBtn.title = 'Sonido: ' + AUDIO_UI[audioMode][1]; }
muteBtn.addEventListener('click', () => { setAudioMode((audioMode + 1) % 3); showAudioMode(); });
showAudioMode();
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
  if (e.key.toLowerCase() === 'b') cycleBrush();
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
  updatePeds(dt, t);
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
