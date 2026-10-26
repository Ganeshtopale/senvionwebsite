import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCADModel } from './cad_model.js?v=20261023b';

/* ================= STATE ================= */
const state = {
  wind: 8.5, explode: 0, pitch: 2, yaw: 0,
  model: 'offshore', env: 'day',
  autoRotate: true, particles: 0.7,
  birds: true, farm: true,
  colorBody: '#f4f7fa', colorAccent: '#b9c3cf',
  gust: 0,
  cad: (function () { try { return localStorage.getItem('senvion_cad') !== '0'; } catch (e) { return true; } })()
};
window.TURBINE = state;

const SENV = window.SENVION || {
  CUT_IN: 3.0,
  CUT_OUT: 20.0,
  MODELS: {
    m120: { name: '2.3M120', rated: 2.3, rotorR: 60, scale: 0.88, key: 'm120' },
    m130: { name: '2.7M130', rated: 2.7, rotorR: 65, scale: 1.0, key: 'm130' }
  },
  powerMW: (w, r) => (w < 3 || w >= 20 ? 0 : Math.min(r, Math.pow((w - 3) / 9, 3) * r)),
  capacityFactor: () => 0.38,
  snapshot: (m, wind, rpm, cf) => ({
    outputMW: 2.1, outputKW: 2100, swept: 13273, tip: 72, tsr: 7.2,
    thrust: 320, cf: 0.38, aepGWh: 9.8, homes: 8200
  }),
  fmt: { n: v => Number(v).toLocaleString() }
};
const MODELS = SENV.MODELS;
const CUT_OUT = SENV.CUT_OUT || 20;

const defaultModel = 'm130';
const urlParams = new URLSearchParams(window.location.search);
const urlModel = urlParams.get('model');
if (urlModel && MODELS[urlModel]) {
  state.model = urlModel;
} else {
  state.model = defaultModel;
}

const PART_INFO = {
  blade: { title: 'Rotor Blade — SE 63.7 GFRP', desc: '63.7 m glass-fibre blade on the 130 m rotor (13,273 m² swept). Triple-row roller blade bearings cut friction and carry monsoon loads.', specs: [['Length','63.7 m'],['Rotor Ø','130 m'],['Material','GFRP']] },
  hub: { title: 'Hub & Pitch System', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation. Embedded safety PLC plus hot-weather control strategy.', specs: [['Pitch','DC motors'],['Control','Adaptive + safety PLC'],['Climate','to +49 °C']] },
  nacelle: { title: 'Nacelle — DFIG Drivetrain', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance. Hybrid active+passive liquid cooling.', specs: [['Generator','DFIG · IP54'],['Gearbox','Integral planet carrier'],['Shaft','Forged high-torque']] },
  tower: { title: 'Tubular Steel Tower — to 140 m', desc: 'Tubular steel tower up to 140 m hub height. Nacelle, hub and tower sealing plus ventilation designed for monsoon conditions.', specs: [['Height','to 140 m'],['Type','Tubular steel'],['Class','IEC S']] },
  gearbox: { title: 'Planetary Gearbox', desc: 'Planetary gearbox with an integral planet carrier, mounted low on the nacelle bedplate for a short, stiff load path from the rotor.', specs: [['Type','Planetary'],['Carrier','Integral'],['Lube','Forced oil']] },
  generator: { title: 'DFIG Generator', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance.', specs: [['Type','DFIG · IP54'],['Cooling','Hybrid liquid'],['Control','Separate P / Q']] },
  drivetrain: { title: 'Bedplate, Shaft & Yaw', desc: 'Forged high-torque main shaft and gearbox sit on a fabricated bedplate, with the transformer, control cabinets and yaw drive packed around them.', specs: [['Bedplate','Fabricated steel'],['Main shaft','Forged · high-torque'],['Yaw','Electric drive']] },
  pitch: { title: 'Pitch Drive Unit', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation, running on a three-row roller blade bearing.', specs: [['Motor','DC'],['Bearing','3-row roller'],['Control','Safety PLC']] },
  cooler: { title: 'Passive Cooling Unit', desc: 'Liquid-to-air passive cooler with its support structure on the nacelle roof — hybrid active + passive thermal management tuned for hot-climate operation to +49 °C.', specs: [['Type','Passive air'],['Mount','Nacelle roof'],['Climate','to +49 °C']] },
  staircase: { title: 'Tower Access & Cooler Fan', desc: 'Service entry staircase and platform at the tower base with the cooler fan unit — the ground-level interface for technicians and the tower ventilation path.', specs: [['Location','Tower base'],['Use','Service access'],['Fan','Cooler unit']] }
};

/* ================= RENDERER / SCENE ================= */
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87b5e0');
scene.fog = new THREE.Fog('#a8c6e4', 60, 340);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(44, 23, 55);

function resizeView() {
  const r = renderer.domElement.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width || innerWidth));
  const h = Math.max(1, Math.round(r.height || innerHeight));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 120;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.target.set(0, 18, 0);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3d2a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(40, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -20;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x5eead4, 0.5);
rim.position.set(-30, 20, -30);
scene.add(rim);

let envTex = null;
function getEnvTex() {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return envTex;
}

/* ================= GROUND ================= */
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 1 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 64), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const padMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.9 });
const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.6, 32), padMat);
pad.position.y = 0.3; pad.receiveShadow = true;
scene.add(pad);

const grid = new THREE.GridHelper(200, 40, 0xffffff, 0xffffff);
grid.material.transparent = true; grid.material.opacity = 0.05;
grid.position.y = 0.05;
scene.add(grid);

/* ================= MATERIALS DEFINITIONS ================= */
const bodyMat = new THREE.MeshStandardMaterial({ color: state.colorBody, roughness: 0.35, metalness: 0.15 });
const accentMat = new THREE.MeshStandardMaterial({ color: state.colorAccent, roughness: 0.4, metalness: 0.3 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });

const steelMat = new THREE.MeshStandardMaterial({ color: 0xaab4c0, roughness: 0.32, metalness: 0.8 });
const gearMat = new THREE.MeshStandardMaterial({ color: 0x8792a1, roughness: 0.5, metalness: 0.6 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0x4d5765, roughness: 0.7, metalness: 0.5 });
const cabMat = new THREE.MeshStandardMaterial({ color: 0xdde5ed, roughness: 0.55, metalness: 0.15 });

/* ================= TURBINE BUILD ================= */
const turbine = new THREE.Group();
scene.add(turbine);

function makeTowerTexture() {
  const W = 16, H = 2049;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, W, H);
  const TOP = 0.035, BOT = 0.60, N = 7;
  const step = (BOT - TOP) / N;
  g.fillStyle = 'rgb(245, 87, 82)';
  for (let i = 0; i < N; i++) g.fillRect(0, (TOP + i * step) * H, W, step * 0.52 * H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const towerH = 26;
const towerMat = bodyMat.clone();
towerMat.map = makeTowerTexture();
const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, towerH, 44, 1), towerMat);
tower.position.y = towerH / 2 + 0.6;
tower.castShadow = true; tower.receiveShadow = true;
tower.userData.part = 'tower';
turbine.add(tower);

const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.3), darkMat);
door.position.set(0, 1.8, 1.5); turbine.add(door);

const yawGroup = new THREE.Group();
yawGroup.position.y = towerH + 0.6;
turbine.add(yawGroup);

const brandCanvas = document.createElement('canvas');
brandCanvas.width = 1024; brandCanvas.height = 340;
const brandCtx = brandCanvas.getContext('2d');
const brandTex = new THREE.CanvasTexture(brandCanvas);
brandTex.colorSpace = THREE.SRGBColorSpace;
brandTex.minFilter = THREE.LinearMipmapLinearFilter;
brandTex.magFilter = THREE.LinearFilter;
brandTex.premultiplyAlpha = false;
brandTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

function drawBrand(label) {
  const c = brandCanvas, g = brandCtx;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  try { g.letterSpacing = '12px'; } catch (e) {}
  g.fillStyle = '#ffffff';
  g.font = '700 165px Arial, Helvetica, sans-serif';
  g.fillText('SENVION', c.width / 2, 118);
  try { g.letterSpacing = '7px'; } catch (e) {}
  g.font = '700 60px Arial, Helvetica, sans-serif';
  g.fillText(String(label || '2.7M130').toUpperCase(), c.width / 2 + 165, 244);
  brandTex.needsUpdate = true;
}
const brandMat = new THREE.MeshStandardMaterial({
  map: brandTex,
  transparent: true,
  alphaTest: 0.1,
  color: 0x0f9d58,
  roughness: 0.4,
  metalness: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3
});

const nacelle = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.2, 6.2, 5, 0.34), bodyMat.clone());
nacelle.position.set(0, 1.1, -0.6);
nacelle.castShadow = true;
nacelle.userData.part = 'nacelle';
yawGroup.add(nacelle);

const labelGeo = new THREE.PlaneGeometry(3.0, 0.996);
for (const s of [1, -1]) {
  const lab = new THREE.Mesh(labelGeo, brandMat);
  lab.position.set(s * 1.108, -0.05, -0.4);
  lab.rotation.y = s * Math.PI / 2;
  nacelle.add(lab);
}
const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.45, metalness: 0.55 });
const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.3), railMat);
deck.position.set(0, 1.14, -2.05);
nacelle.add(deck);
const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), railMat);
railBar.position.set(0, 1.5, -2.68);
nacelle.add(railBar);
for (const sx of [-0.71, 0, 0.71]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
  post.position.set(sx, 1.31, -2.68);
  nacelle.add(post);
}
for (const sx of [-0.71, 0.71]) {
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.3), railMat);
  side.position.set(sx, 1.5, -2.05);
  nacelle.add(side);
  const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
  sp1.position.set(sx, 1.31, -1.45);
  nacelle.add(sp1);
}

/* =========================================================================
   DETAILED PHOTO-REALISTIC DRIVETRAIN ASSEMBLY (MATCHING REFERENCE IMAGE)
   ========================================================================= */
export function buildPhotoDrivetrain(scale = 1.0) {
  const dtGroup = new THREE.Group();
  dtGroup.name = 'photoDrivetrain';

  const castMetalMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.44, metalness: 0.76 });
  const darkCastMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.55, metalness: 0.70 });
  const bronzeShaftMat = new THREE.MeshStandardMaterial({ color: 0x937856, roughness: 0.32, metalness: 0.82 });
  const machinedSteelMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd6, roughness: 0.24, metalness: 0.92 });
  const generatorOrangeMat = new THREE.MeshStandardMaterial({ color: 0xee7203, roughness: 0.36, metalness: 0.20 });
  const orangeCollarMat = new THREE.MeshStandardMaterial({ color: 0xdb6500, roughness: 0.40, metalness: 0.24 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xa9b4c0, roughness: 0.28, metalness: 0.88 });
  const damperMat = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.85, metalness: 0.15 });

  const fit = (mesh, part = 'drivetrain') => {
    mesh.userData.part = part;
    mesh.castShadow = true; mesh.receiveShadow = true;
    dtGroup.add(mesh);
    return mesh;
  };

  const addBoltRing = (r, count, z, size = 0.024, len = 0.04, mat = machinedSteelMat, part = 'drivetrain') => {
    const geo = new THREE.CylinderGeometry(size, size, len, 8);
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2;
      const b = new THREE.Mesh(geo, mat);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(th) * r, Math.sin(th) * r, z);
      fit(b, part);
    }
  };

  /* 1. Rotor Main Flange & Bronze Forged Shaft */
  const mainFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 36), darkCastMat);
  mainFlange.rotation.x = Math.PI / 2; mainFlange.position.set(0, 0, 2.22);
  fit(mainFlange, 'drivetrain');
  addBoltRing(0.55, 16, 2.28, 0.028, 0.06, darkCastMat, 'drivetrain');

  const bronzeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 32), bronzeShaftMat);
  bronzeFace.rotation.x = Math.PI / 2; bronzeFace.position.set(0, 0, 2.27);
  fit(bronzeFace, 'drivetrain');
  addBoltRing(0.38, 8, 2.31, 0.022, 0.04, darkCastMat, 'drivetrain');

  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.24, 28), darkCastMat);
  bore.rotation.x = Math.PI / 2; bore.position.set(0, 0, 2.25);
  fit(bore, 'drivetrain');

  const flangeTaper = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 0.22, 32), castMetalMat);
  flangeTaper.rotation.x = Math.PI / 2; flangeTaper.position.set(0, 0, 2.06);
  fit(flangeTaper, 'drivetrain');

  const mainShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.72, 32), bronzeShaftMat);
  mainShaft.rotation.x = Math.PI / 2; mainShaft.position.set(0, 0, 1.62);
  fit(mainShaft, 'drivetrain');

  /* 2. Main Bearing Housing & Heavy Torque Arms */
  const mbCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.35, 36), castMetalMat);
  mbCasing.rotation.x = Math.PI / 2; mbCasing.position.set(0, 0, 1.18);
  fit(mbCasing, 'drivetrain');

  const mbCoverFront = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.58, 0.18, 36), castMetalMat);
  mbCoverFront.rotation.x = Math.PI / 2; mbCoverFront.position.set(0, 0, 1.42);
  fit(mbCoverFront, 'drivetrain');
  addBoltRing(0.51, 20, 1.43, 0.018, 0.03, machinedSteelMat, 'drivetrain');

  const torqueShape = new THREE.Shape();
  torqueShape.moveTo(-0.52, -0.45);
  torqueShape.lineTo(-0.54, 0.45);
  torqueShape.quadraticCurveTo(-0.48, 0.95, -0.22, 0.98);
  torqueShape.lineTo(0.22, 0.98);
  torqueShape.quadraticCurveTo(0.48, 0.95, 0.54, 0.45);
  torqueShape.lineTo(0.52, -0.45);
  torqueShape.quadraticCurveTo(0.38, -0.92, 0, -0.95);
  torqueShape.quadraticCurveTo(-0.38, -0.92, -0.52, -0.45);
  const torqueArmGeo = new THREE.ExtrudeGeometry(torqueShape, { depth: 0.14, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.03, bevelThickness: 0.03 });
  const torqueArm = new THREE.Mesh(torqueArmGeo, castMetalMat);
  torqueArm.position.set(0, 0, 1.15);
  fit(torqueArm, 'drivetrain');

  const damperLocations = [
    [-0.34, 0.76, 1.22],
    [ 0.34, 0.76, 1.22],
    [ 0.00,-0.74, 1.22]
  ];
  damperLocations.forEach(([x, y, z]) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.28, 24), darkCastMat);
    pin.rotation.x = Math.PI / 2; pin.position.set(x, y, z);
    fit(pin, 'drivetrain');

    const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 20), damperMat);
    bush.rotation.x = Math.PI / 2; bush.position.set(x, y, z);
    fit(bush, 'drivetrain');

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.04, 24), machinedSteelMat);
    cap.rotation.x = Math.PI / 2; cap.position.set(x, y, z + 0.15);
    fit(cap, 'drivetrain');

    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 8), darkCastMat);
      b.rotation.x = Math.PI / 2;
      b.position.set(x + Math.cos(ang) * 0.08, y + Math.sin(ang) * 0.08, z + 0.17);
      fit(b, 'drivetrain');
    }
  });

  /* 3. Multi-Stage Planetary Gearbox */
  const gbStage1 = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.38, 36), castMetalMat);
  gbStage1.rotation.x = Math.PI / 2; gbStage1.position.set(0, 0, 0.82);
  fit(gbStage1, 'gearbox');

  const gbFlange1 = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 36), castMetalMat);
  gbFlange1.rotation.x = Math.PI / 2; gbFlange1.position.set(0, 0, 0.64);
  fit(gbFlange1, 'gearbox');
  addBoltRing(0.63, 24, 0.64, 0.016, 0.08, machinedSteelMat, 'gearbox');

  const gbStage2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.44, 32), castMetalMat);
  gbStage2.rotation.x = Math.PI / 2; gbStage2.position.set(0, 0, 0.38);
  fit(gbStage2, 'gearbox');

  const gbRearStage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.28, 30), castMetalMat);
  gbRearStage.rotation.x = Math.PI / 2; gbRearStage.position.set(0, 0, 0.06);
  fit(gbRearStage, 'gearbox');

  const gbLug = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.15), castMetalMat);
  gbLug.position.set(0, 0.62, 0.14);
  fit(gbLug, 'gearbox');
  const gbLugHole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16), darkCastMat);
  gbLugHole.rotation.z = Math.PI / 2; gbLugHole.position.set(0, 0.65, 0.14);
  fit(gbLugHole, 'gearbox');

  const jBox = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.32, 0.36, 3, 0.02), castMetalMat);
  jBox.position.set(0.48, -0.04, 0.42);
  fit(jBox, 'gearbox');

  const jBoxDoor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.32), darkCastMat);
  jBoxDoor.position.set(0.61, -0.04, 0.42);
  fit(jBoxDoor, 'gearbox');

  const lubeManifold = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.26, 0.24, 3, 0.02), darkCastMat);
  lubeManifold.position.set(0.46, -0.32, 0.35);
  fit(lubeManifold, 'gearbox');

  const pipeCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.52, -0.26, 0.25),
    new THREE.Vector3(0.56, -0.15, 0.15),
    new THREE.Vector3(0.52, -0.05, 0.04),
    new THREE.Vector3(0.38,  0.08, 0.00),
    new THREE.Vector3(0.28,  0.15, 0.02)
  ]);
  const lubePipe1 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve1, 32, 0.022, 12, false), pipeMat);
  fit(lubePipe1, 'gearbox');

  const pipeCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.54, -0.36, 0.32),
    new THREE.Vector3(0.58, -0.42, 0.22),
    new THREE.Vector3(0.45, -0.46, 0.10),
    new THREE.Vector3(0.22, -0.45, 0.04)
  ]);
  const lubePipe2 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve2, 28, 0.018, 12, false), pipeMat);
  fit(lubePipe2, 'gearbox');

  /* 4. High-Speed Shaft, Brake Disc & Flexible Coupling */
  const hssShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 24), machinedSteelMat);
  hssShaft.rotation.x = Math.PI / 2; hssShaft.position.set(0, 0, -0.22);
  fit(hssShaft, 'drivetrain');

  const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.045, 36), machinedSteelMat);
  brakeDisc.rotation.x = Math.PI / 2; brakeDisc.position.set(0, 0, -0.32);
  fit(brakeDisc, 'drivetrain');

  const brakeHub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 28), castMetalMat);
  brakeHub.rotation.x = Math.PI / 2; brakeHub.position.set(0, 0, -0.32);
  fit(brakeHub, 'drivetrain');
  addBoltRing(0.18, 8, -0.355, 0.016, 0.03, machinedSteelMat, 'drivetrain');

  const caliper = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.22, 0.16, 3, 0.02), darkCastMat);
  caliper.position.set(0.34, 0.24, -0.32);
  fit(caliper, 'drivetrain');

  const couplingHub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 28), darkCastMat);
  couplingHub.rotation.x = Math.PI / 2; couplingHub.position.set(0, 0, -0.48);
  fit(couplingHub, 'drivetrain');
  addBoltRing(0.20, 10, -0.48, 0.018, 0.04, machinedSteelMat, 'drivetrain');

  /* 5. Industrial Orange DFIG Generator */
  const genDEHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.40, 0.26, 32), orangeCollarMat);
  genDEHousing.rotation.x = Math.PI / 2; genDEHousing.position.set(0, 0, -0.66);
  fit(genDEHousing, 'generator');

  const genCollarFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 32), orangeCollarMat);
  genCollarFlange.rotation.x = Math.PI / 2; genCollarFlange.position.set(0, 0, -0.76);
  fit(genCollarFlange, 'generator');
  addBoltRing(0.40, 12, -0.76, 0.016, 0.05, darkCastMat, 'generator');

  const genBody = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.82, 1.25, 5, 0.05), generatorOrangeMat);
  genBody.position.set(0, 0.04, -1.45);
  fit(genBody, 'generator');

  const finGeo = new THREE.BoxGeometry(0.02, 0.04, 1.16);
  for (let k = -8; k <= 8; k++) {
    const fin = new THREE.Mesh(finGeo, generatorOrangeMat);
    fin.position.set(k * 0.045, 0.47, -1.45);
    fit(fin, 'generator');
  }

  const sideFinGeo = new THREE.BoxGeometry(0.04, 0.02, 1.16);
  for (let k = -5; k <= 5; k++) {
    for (const side of [-1, 1]) {
      const sFin = new THREE.Mesh(sideFinGeo, generatorOrangeMat);
      sFin.position.set(side * 0.45, 0.04 + k * 0.055, -1.45);
      fit(sFin, 'generator');
    }
  }

  const genTermBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.14), machinedSteelMat);
  genTermBox.position.set(0, 0.52, -0.96);
  fit(genTermBox, 'generator');

  const fanCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.34, 30), generatorOrangeMat);
  fanCowl.rotation.x = Math.PI / 2; fanCowl.position.set(0, 0.04, -2.18);
  fit(fanCowl, 'generator');

  for (let i = 0; i < 4; i++) {
    const grille = new THREE.Mesh(new THREE.TorusGeometry(0.12 + i * 0.05, 0.012, 8, 24), darkCastMat);
    grille.position.set(0, 0.04, -2.35);
    fit(grille, 'generator');
  }

  const genFoot = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.14, 0.46, 3, 0.02), generatorOrangeMat);
  genFoot.position.set(0, -0.42, -1.45);
  fit(genFoot, 'generator');

  const isolatorPad = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 0.56), damperMat);
  isolatorPad.position.set(0, -0.51, -1.45);
  fit(isolatorPad, 'drivetrain');

  /* 6. Bedplate & Yaw Ring */
  const bedPlate = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 4.8), darkCastMat);
  bedPlate.position.set(0, -0.62, -0.1);
  fit(bedPlate, 'drivetrain');

  for (const s of [-0.62, 0.62]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 4.8), darkCastMat);
    beam.position.set(s, -0.48, -0.1);
    fit(beam, 'drivetrain');
  }

  const yawRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.09, 12, 48), darkCastMat);
  yawRing.rotation.x = Math.PI / 2; yawRing.position.set(0, -0.72, 0);
  fit(yawRing, 'drivetrain');

  if (scale !== 1.0) {
    dtGroup.scale.setScalar(scale);
  }

  return dtGroup;
}

const interior = new THREE.Group();
interior.position.copy(nacelle.position);
interior.visible = false;
yawGroup.add(interior);

const nacelleDrivetrain = buildPhotoDrivetrain(1.0);
interior.add(nacelleDrivetrain);

/* ================= ROTOR & BLADES ================= */
const rotor = new THREE.Group();
rotor.position.set(0, 1.1, 2.8);
yawGroup.add(rotor);
const accentParts = [];

const hubProfile = [
  [0.62, -0.95], [0.86, -0.80], [1.00, -0.60], [1.06, -0.35],
  [1.07, -0.05], [1.03, 0.25], [0.94, 0.52], [0.82, 0.75],
  [0.70, 0.92], [0.63, 1.02], [0.60, 1.07]
];
const hubMat = bodyMat.clone();
hubMat.side = THREE.DoubleSide;
const hub = new THREE.Mesh(
  new THREE.LatheGeometry(hubProfile.map(p => new THREE.Vector2(p[0], p[1])), 56),
  hubMat
);
hub.rotation.x = Math.PI / 2;
hub.castShadow = true;
hub.userData.part = 'hub';
rotor.add(hub);

const hubCap = new THREE.Group();
hubCap.position.z = 1.07;
rotor.add(hubCap);

const noseProfile = [
  [0.60, 0.00],
  [0.58, 0.06],
  [0.50, 0.15],
  [0.32, 0.26],
  [0.10, 0.33],
  [0.00, 0.35]
];
const noseGeo = new THREE.LatheGeometry(
  noseProfile.map(p => new THREE.Vector2(p[0], p[1])),
  64
);
const hubNose = new THREE.Mesh(noseGeo, hubMat);
hubNose.rotation.x = Math.PI / 2;
hubNose.position.z = -0.08;
hubNose.castShadow = true;
hubNose.receiveShadow = true;
hubNose.userData.part = 'hub';
hubCap.add(hubNose);

const hubCapRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.60, 0.028, 12, 64),
  hubMat
);
hubCapRim.position.z = 0.0;
hubCapRim.userData.part = 'hub';
hubCap.add(hubCapRim);

const hubFaceRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.44, 0.032, 10, 48),
  accentMat.clone()
);
hubFaceRing.position.z = 0.005;
hubCap.add(hubFaceRing);
accentParts.push(hubFaceRing);

function makeBlade(len = 13, rootR = 0.34) {
  const NS = 96;
  const NR = 26;
  const pos = [], idx = [], col = [];
  const white = new THREE.Color(0xffffff);
  const red = new THREE.Color(0xcf352f);
  const BANDS = [[0.838, 0.874], [0.903, 0.939], [0.972, 1.01]];
  const isRed = t => BANDS.some(b => t >= b[0] && t < b[1]);
  const tmp = new THREE.Color();
  const K = {
    chord: [[0, 0.95], [0.10, 1.34], [0.32, 1.20], [0.66, 0.74], [0.88, 0.38], [1, 0.16]],
    thick: [[0, 0.46], [0.10, 0.44], [0.32, 0.32], [0.66, 0.19], [0.88, 0.12], [1, 0.085]],
    twist: [[0, 16], [0.06, 12], [0.25, 6], [0.60, 2.4], [1, 0.5]],
    sweep: [[0, 0], [1, 0.055]]
  };
  const at = (kf, t) => {
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 0; i < kf.length - 1; i++) {
      const [a, va] = kf[i], [b, vb] = kf[i + 1];
      if (t <= b) { const u = (t - a) / (b - a); return va + (vb - va) * (u * u * (3 - 2 * u)); }
    }
    return kf[kf.length - 1][1];
  };
  const yt = (x, tr) => 5 * tr * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
  for (let s = 0; s <= NS; s++) {
    const t = s / NS;
    const c = at(K.chord, t), tr = at(K.thick, t);
    const tw = THREE.MathUtils.degToRad(at(K.twist, t));
    const sw = at(K.sweep, t) * len;
    const ct = Math.cos(tw), st = Math.sin(tw);
    const a = THREE.MathUtils.smoothstep(t, 0, 0.05);
    for (let k = 0; k < NR; k++) {
      const th = (k / NR) * Math.PI * 2;
      const xN = (1 - Math.cos(th)) / 2;
      const sg = th < Math.PI? 1 : -1;
      const ax = (0.5 - xN) * c;
      const ay = sg * yt(xN, tr) * c + 0.20 * c * xN * (1 - xN);
      const rx = rootR * Math.cos(th), rz = rootR * Math.sin(th);
      const ux = ax + (rx - ax) * (1 - a);
      const uy = ay + (rz - ay) * (1 - a);
      pos.push(ux * ct - uy * st - sw, t * len, ux * st + uy * ct);
      tmp.copy(isRed(t)? red : white);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const vi = (s, k) => s * NR + (k % NR);
  for (let s = 0; s < NS; s++) {
    for (let k = 0; k < NR; k++) {
      const a = vi(s, k), b = vi(s, k + 1), cc = vi(s + 1, k), d = vi(s + 1, k + 1);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const rootC = pos.length / 3;
  pos.push(0, 0, 0); col.push(white.r, white.g, white.b);
  for (let k = 0; k < NR; k++) idx.push(rootC, k, (k + 1) % NR);
  const tipO = pos.length / 3;
  let mx = 0, mz = 0;
  for (let k = 0; k < NR; k++) { mx += pos[vi(NS, k) * 3]; mz += pos[vi(NS, k) * 3 + 2]; }
  pos.push(mx / NR, len, mz / NR); col.push(red.r, red.g, red.b);
  for (let k = 0; k < NR; k++) idx.push(tipO, vi(NS, k + 1), vi(NS, k));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = bodyMat.clone();
  m.vertexColors = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.userData.part = 'blade';
  return mesh;
}
const blades = [];
const bossGeo = new THREE.CylinderGeometry(0.40, 0.50, 0.55, 30);
const ringGeo = new THREE.TorusGeometry(0.46, 0.05, 10, 44);

const masterBlade = makeBlade(13);
const sharedBladeGeo = masterBlade.geometry;

for (let i = 0; i < 3; i++) {
  const pivot = new THREE.Group();
  const boss = new THREE.Mesh(bossGeo, bodyMat.clone());
  boss.position.y = 0.875; boss.castShadow = true; boss.userData.part = 'hub';
  pivot.add(boss);
  const brg = new THREE.Mesh(ringGeo, accentMat.clone());
  brg.rotation.x = Math.PI / 2;
  brg.position.y = 1.15;
  pivot.add(brg); accentParts.push(brg);
  const pitchRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 44), gearMat);
  pitchRing.rotation.x = Math.PI / 2;
  pitchRing.position.y = 0.6;
  pitchRing.userData.part = 'pitch';
  pivot.add(pitchRing);
  const pitchDrive = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.28, 0.32, 3, 0.06), gearMat);
  pitchDrive.position.set(0.3, 0.4, 0.08);
  pitchDrive.userData.part = 'pitch';
  pivot.add(pitchDrive);
  const b = (i === 0) ? masterBlade : makeBlade(13);
  b.position.y = 0.85;
  b.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4;
  pivot.add(b);
  pivot.rotation.z = (i / 3) * Math.PI * 2;
  pivot.userData.part = 'blade';
  b.userData.part = 'blade';
  rotor.add(pivot);
  blades.push(pivot);
}

/* ================= BACKGROUND WIND FARM ================= */
const farmGroup = new THREE.Group();
scene.add(farmGroup);

const farmTowerGeo = new THREE.CylinderGeometry(0.9, 1.6, towerH, 32, 1);
const farmNacelleGeo = new RoundedBoxGeometry(2.2, 2.2, 6.2, 3, 0.3);
const farmHubGeo = new THREE.LatheGeometry(hubProfile.map(p => new THREE.Vector2(p[0], p[1])), 32);
const farmNoseGeo = new THREE.LatheGeometry(noseProfile.map(p => new THREE.Vector2(p[0], p[1])), 32);
const farmBladeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.35,
  metalness: 0.15,
  vertexColors: true
});

function miniTurbine(x, z, s) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(farmTowerGeo, towerMat);
  t.position.y = towerH / 2 + 0.6;
  t.castShadow = true;
  g.add(t);

  const n = new THREE.Mesh(farmNacelleGeo, bodyMat);
  n.position.set(0, towerH + 0.6 + 1.1, -0.6);
  n.castShadow = true;
  g.add(n);

  for (const side of [1, -1]) {
    const lab = new THREE.Mesh(labelGeo, brandMat);
    lab.position.set(side * 1.108, -0.05, -0.4);
    lab.rotation.y = side * Math.PI / 2;
    n.add(lab);
  }

  const d = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.3), railMat);
  d.position.set(0, 1.14, -2.05);
  n.add(d);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), railMat);
  rb.position.set(0, 1.5, -2.68);
  n.add(rb);

  const r = new THREE.Group();
  r.position.set(0, towerH + 0.6 + 1.1, 2.8);

  const hb = new THREE.Mesh(farmHubGeo, hubMat);
  hb.rotation.x = Math.PI / 2;
  r.add(hb);

  const hCap = new THREE.Group();
  hCap.position.z = 1.07;
  const hn = new THREE.Mesh(farmNoseGeo, hubMat);
  hn.rotation.x = Math.PI / 2;
  hn.position.z = -0.08;
  hCap.add(hn);
  const hRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.032, 8, 32), accentMat);
  hRing.position.z = 0.005;
  hCap.add(hRing);
  r.add(hCap);

  for (let i = 0; i < 3; i++) {
    const pv = new THREE.Group();
    const bl = new THREE.Mesh(sharedBladeGeo, farmBladeMat);
    bl.position.y = 0.85;
    bl.rotation.x = 0.02;
    bl.castShadow = true;
    pv.add(bl);
    pv.rotation.z = (i / 3) * Math.PI * 2;
    r.add(pv);
  }

  g.add(r);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.userData.rotor = r;
  return g;
}

const minis = [
  miniTurbine(-55, -60, 0.85),
  miniTurbine(-85, -30, 0.70),
  miniTurbine(60, -70, 0.90),
  miniTurbine(90, -35, 0.75),
  miniTurbine(-40, -110, 0.95),
  miniTurbine(30, -120, 0.85)
];
minis.forEach(m => farmGroup.add(m));

const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
function makeCloud(x, y, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 12, 10), cloudMat);
    b.position.set(i * 2.4 - 4 + Math.random(), Math.random() * 1.2, Math.random() * 2 - 1);
    b.scale.y = 0.55; g.add(b);
  }
  g.position.set(x, y, z); g.scale.setScalar(s);
  return g;
}
const clouds = [];
for (let i = 0; i < 8; i++) clouds.push(makeCloud((Math.random() -.5) * 260, 38 + Math.random() * 25, -60 - Math.random() * 140, 1 + Math.random()));
clouds.forEach(c => cloudGroup.add(c));

const birdGroup = new THREE.Group(); scene.add(birdGroup);
const birdMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
const birds = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(1, 0, 0)]);
  const l = new THREE.Line(g, birdMat);
  l.position.set((Math.random() -.5) * 80, 22 + Math.random() * 14, -20 - Math.random() * 40);
  l.userData = { ph: Math.random() * 9, sp: 0.4 + Math.random() * 0.5 };
  birdGroup.add(l); birds.push(l);
}

const P_COUNT = 900;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_COUNT * 3);
const pSpd = new Float32Array(P_COUNT);
function resetP(i, randomX = false) {
  pPos[i * 3] = randomX? (Math.random() -.5) * 160 : -80 - Math.random() * 20;
  pPos[i * 3 + 1] = 1 + Math.random() * 34;
  pPos[i * 3 + 2] = (Math.random() -.5) * 120;
  pSpd[i] = 0.6 + Math.random() * 0.9;
}
for (let i = 0; i < P_COUNT; i++) resetP(i, true);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xbef3ff, size: 0.35, transparent: true, opacity: 0.8 });
const windPts = new THREE.Points(pGeo, pMat);
scene.add(windPts);

const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) {
  const r = 380, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
  starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
  starPos[i * 3 + 1] = r * Math.cos(ph) + 10;
  starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0 }));
scene.add(stars);

const ENVS = {
  day: { sky: '#cfe4f6', fog: '#e4eefa', sun: 2.4, hemi: 1.05, expo: 1.08, stars: 0, cloud: 0.9, ground: 0x4f8a4a },
  sunset: { sky: '#e8805a', fog: '#e8a06a', sun: 1.6, hemi: 0.55, expo: 1.0, stars: 0.15, cloud: 0.9, ground: 0x5a5a35 },
  night: { sky: '#040918', fog: '#0a1528', sun: 0.25,hemi: 0.25, expo: 0.85, stars: 1, cloud: 0.25, ground: 0x14241a },
  storm: { sky: '#3a4552', fog: '#4a5563', sun: 0.7, hemi: 0.4, expo: 0.9, stars: 0, cloud: 0.95, ground: 0x2c3a2c }
};
let envCur = {...ENVS.day };
function applyEnv(name) {
  state.env = name;
  const t = ENVS[name];
  envTarget = {...t };
}
let envTarget = {...ENVS.day };

const FOCUS_SCALE = 0.85;
const FOCUS = {
  overview: { pos: [44, 23, 55], tgt: [0, 18, 0] },
  blades: { pos: [7, 27, 15], tgt: [0, 23, 2] },
  nacelle: { pos: [10, 26, 11], tgt: [0, 23.5, -1] },
  tower: { pos: [11, 8, 18], tgt: [0, 11, 0] }
};
let camGoal = null;
let focusName = 'overview';
function focus(name) {
  if (!FOCUS[name]) name = 'overview';
  focusName = name;
  const k = name === 'overview'? 1 :
    ((MODELS[state.model] || MODELS.m130).scale || FOCUS_SCALE) / FOCUS_SCALE;
  camGoal = {
    pos: FOCUS[name].pos.map(v => +(v * k).toFixed(3)),
    tgt: FOCUS[name].tgt.map(v => +(v * k).toFixed(3))
  };
}

function powerMW(wind, rated) {
  return SENV.powerMW(wind, typeof rated === 'number'? rated : rated.rated);
}
let _cfKey = '', _cfVal = 0;
function cfOf(m) {
  if (_cfKey!== m.key) { _cfKey = m.key; _cfVal = SENV.capacityFactor(m); }
  return _cfVal;
}

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = 0;
renderer.domElement.addEventListener('pointerdown', e => downAt = performance.now());
renderer.domElement.addEventListener('pointerup', e => {
  if (performance.now() - downAt > 250) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(activeRoot().children, true);
  for (const h of hits) {
    let o = h.object;
    while (o &&!o.userData.part) o = o.parent;
    if (o && o.userData.part) { showPart(o.userData.part); break; }
  }
});
function showPart(key) {
  const info = PART_INFO[key]; if (!info) return;
  document.getElementById('partTitle').textContent = info.title;
  document.getElementById('partDesc').textContent = info.desc;
  document.getElementById('partSpecs').innerHTML = info.specs.map(s => `<div><span>${s[0]}</span><b>${s[1]}</b></div>`).join('');
  document.getElementById('partCard').classList.add('show');
}
document.getElementById('partClose')?.addEventListener('click', () => document.getElementById('partCard').classList.remove('show'));

/* ================= REAL 4XM CAD MODEL ================= */
const CAD_BASE_SCALE = 27.7 / 139.025;
let cadApi = null, cadLoading = false, cadFailed = false;
const cadStatus = { settled: !state.cad, ok: false, p: 0 };

function cadVisible() { return !!(state.cad && cadApi); }
function activeRoot() { return cadVisible() ? cadApi.root : turbine; }

function applyModelVisibility() {
  const v = cadVisible();
  if (cadApi) cadApi.root.visible = v;
  turbine.visible = !v;
}

function ensureCAD() {
  if (cadApi || cadFailed) return;
  if (cadLoading) return;
  cadLoading = true;
  cadStatus.settled = false;
  updatePill();
  loadCADModel({
    envMap: getEnvTex(),
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    onProgress: p => { cadStatus.p = p; updatePill(); }
  }).then(api => {
    cadApi = api;
    const m = MODELS[state.model] || MODELS.m130;
    cadApi.root.scale.setScalar(m.scale * CAD_BASE_SCALE);
    scene.add(cadApi.root);
    applyModelVisibility();
    cadLoading = false;
    cadStatus.settled = true; cadStatus.ok = true;
    updatePill(); syncSwitch();
    window.dispatchEvent(new Event('senvion:cad'));
  }).catch(err => {
    cadLoading = false;
    cadFailed = true;
    cadStatus.settled = true; cadStatus.ok = false;
    console.warn('[CAD] load failed:', err);
    applyModelVisibility();
    updatePill(); syncSwitch();
    toast('Real 4XM CAD unavailable — classic model stays.');
  });
}

window.__scene = {
  focus, applyEnv,
  setModel(name) {
    if (!MODELS[name]) name = 'm130';
    state.model = name;
    const m = MODELS[name];
    turbine.scale.setScalar(m.scale);
    if (cadApi) cadApi.root.scale.setScalar(m.scale * CAD_BASE_SCALE);
    drawBrand(m.name);
    if (camGoal) focus(focusName);
    document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('featured', c.dataset.model === name));
    const hm = document.getElementById('hudModel'); if (hm) hm.textContent = m.name;
    const sr = document.getElementById('specRated'); if (sr) sr.textContent = m.rated.toFixed(1) + ' MW';
    const sro = document.getElementById('specRotor'); if (sro) sro.textContent = (m.rotorR * 2) + ' m';
    const pl = document.querySelector('.power-label span'); if (pl) pl.textContent = 'Live output (' + m.name + ')';
    window.dispatchEvent(new CustomEvent('senvion:model', { detail: { key: name, model: m } }));
  },
  paint(c1, c2) {
    state.colorBody = c1; state.colorAccent = c2;
    turbine.traverse(o => {
      if (o.isMesh && o.material && o.material.color) {
        const p = o.userData.part;
        if (p === 'tower' || p === 'nacelle' || p === 'blade' || p === 'hub') o.material.color.set(c1);
      }
    });
    accentParts.forEach(o => o.material.color.set(c2));
    if (cadApi) {
      cadApi.mats.tower.color.set(c1);
      cadApi.mats.blade.color.set(c1);
      cadApi.mats.shell.color.set(c1);
      cadApi.mats.cooler.color.set(c2);
      cadApi.mats.steel.color.set(c2);
    }
    const lum = new THREE.Color(c1);
    const L = 0.2126 * lum.r + 0.7152 * lum.g + 0.0722 * lum.b;
    brandMat.color.set(L > 0.25? '#0f9d58' : '#7dffb8');
  },
  setCAD(on) {
    on = !!on;
    state.cad = on;
    try { localStorage.setItem('senvion_cad', on ? '1' : '0'); } catch (e) { /* private mode */ }
    if (on) ensureCAD();
    applyModelVisibility();
    syncSwitch();
  },
  gust() { state.gust = 9; }
};

const $ = id => document.getElementById(id);
$('windSlider')?.addEventListener('input', e => state.wind = +e.target.value);
$('explodeSlider')?.addEventListener('input', e => state.explode = +e.target.value / 100);
$('pitchSlider')?.addEventListener('input', e => state.pitch = +e.target.value);
$('yawSlider')?.addEventListener('input', e => state.yaw = +e.target.value);
$('partSlider')?.addEventListener('input', e => { state.particles = +e.target.value / 100; $('partOut').textContent = e.target.value + '%'; });
$('birdsToggle')?.addEventListener('change', e => state.birds = e.target.checked);
$('farmToggle')?.addEventListener('change', e => { state.farm = e.target.checked; farmGroup.visible = state.farm; });
document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => focus(b.dataset.focus)));
document.querySelectorAll('.modelchip').forEach(b => b.addEventListener('click', () => {
  window.__scene.setModel(b.dataset.model);
  document.querySelectorAll('.modelchip').forEach(x => x.classList.toggle('active', x === b));
}));
document.querySelectorAll('.view3d').forEach(b => b.addEventListener('click', () => {
  if (document.body.dataset.page === 'products') {
    location.href = 'lab.html?model=' + b.dataset.model;
    return;
  }
  window.__scene.setModel(b.dataset.model);
  document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
  focus('overview');
}));
document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.sw').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  window.__scene.paint(b.dataset.c1, b.dataset.c2);
}));
document.querySelectorAll('.env').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.env').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  applyEnv(b.dataset.env);
  const dn = $('dayNightBtn'); if (dn) dn.textContent = b.dataset.env === 'night'? '☀ Day mode' : '🌙 Night mode';
}));

(function syncEnvUI() {
  applyEnv(state.env);
  envCur = {...ENVS[state.env] };
  document.querySelectorAll('.env').forEach(x => x.classList.toggle('active', x.dataset.env === state.env));
  const dn = $('dayNightBtn');
  if (dn) dn.textContent = state.env === 'night'? '☀ Day mode' : '🌙 Night mode';
})();

const clock = new THREE.Clock();
let rotorAngle = 0;
const hudWind = $('hudWind'), hudRpm = $('hudRpm'), hudPower = $('hudPower');
const windOut = $('windOut'), powerFill = $('powerFill'), powerLabel = $('powerLabel');
const rTip = $('rTip'), rThrust = $('rThrust'), rCf = $('rCf'), rCo2 = $('rCo2');
const rOut = $('rOut'), rSwept = $('rSwept'), rTsr = $('rTsr'), rAep = $('rAep'), rHomes = $('rHomes');

function lerp(a, b, t) { return a + (b - a) * t; }

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state.gust > 0) state.gust = Math.max(0, state.gust - dt * 3);
  const wind = Math.min(CUT_OUT, state.wind + state.gust + Math.sin(t * 0.7) * 0.3);

  const m = MODELS[state.model] || MODELS.m130;
  const eff = Math.max(0, (wind - 3) / 9);
  const rpmTarget = wind < 3 || wind >= CUT_OUT? 0 : 4 + Math.min(1, eff) * 9;
  const omega = rpmTarget * (Math.PI * 2 / 60);
  rotorAngle += omega * dt;
  rotor.rotation.z = -rotorAngle;
  blades.forEach(p => p.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4);
  yawGroup.rotation.y = THREE.MathUtils.degToRad(state.yaw);

  const e = state.explode;
  if (cadVisible()) {
    cadApi.update({
      yawDeg: state.yaw, rotorAngle, pitchDeg: state.pitch,
      explode: e, t, night: state.env === 'night'
    });
  } else {
    rotor.position.z = 2.8 + e * 6;
    rotor.position.y = 1.1 + e * 2;
    nacelle.position.z = -0.6 - e * 3;
    nacelle.position.y = 1.1 + e * 3.6;
    door.position.z = 1.5 + e * 2;
    hubCap.position.z = 1.07 + e * 3.2;
    interior.visible = e > 0.005;
  }

  minis.forEach((mm, i) => {
    if (mm.userData.rotor) {
      mm.userData.rotor.rotation.z -= omega * dt * (0.95 + (i % 3) * 0.05);
    }
  });

  clouds.forEach((c, i) => {
    c.position.x += dt * (0.5 + wind * 0.25);
    if (c.position.x > 150) c.position.x = -150;
  });
  cloudGroup.visible = state.birds;

  birdGroup.visible = state.birds;
  birds.forEach(b => {
    b.position.x += dt * b.userData.sp * (2 + wind * 0.4);
    b.position.y += Math.sin(t * 3 + b.userData.ph) * dt * 1.5;
    if (b.position.x > 60) b.position.x = -60;
    b.scale.y = 1 + Math.sin(t * 10 + b.userData.ph) * 0.4;
  });

  const pVisible = state.particles;
  windPts.visible = pVisible > 0.02;
  pMat.opacity = 0.15 + pVisible * 0.7;
  if (windPts.visible) {
    const arr = pGeo.attributes.position.array;
    const v = (2 + wind * 2.2) * (0.3 + pVisible);
    for (let i = 0; i < P_COUNT; i++) {
      arr[i * 3] += v * dt * pSpd[i];
      arr[i * 3 + 1] += Math.sin(t * 2 + i) * dt * 0.6;
      if (arr[i * 3] > 85) resetP(i);
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  for (const k of ['sun', 'hemi', 'expo', 'stars', 'cloud']) envCur[k] = lerp(envCur[k], envTarget[k], dt * 2);
  scene.background.lerp(new THREE.Color(envTarget.sky), dt * 2);
  scene.fog.color.lerp(new THREE.Color(envTarget.fog), dt * 2);
  sun.intensity = envCur.sun; hemi.intensity = envCur.hemi;
  renderer.toneMappingExposure = envCur.expo;
  stars.material.opacity = envCur.stars;
  cloudMat.opacity = envCur.cloud;
  groundMat.color.lerp(new THREE.Color(envTarget.ground), dt * 2);
  sun.color.lerp(new THREE.Color(state.env === 'sunset'? '#ffb37a' : state.env === 'night'? '#8aa4ff' : '#fff2dd'), dt * 2);

  if (state.env === 'storm') {
    camera.position.x += (Math.random() -.5) * 0.02;
    rotorAngle += dt * 0.8;
  }

  if (camGoal) {
    camera.position.lerp(new THREE.Vector3(...camGoal.pos), dt * 2.2);
    controls.target.lerp(new THREE.Vector3(...camGoal.tgt), dt * 2.2);
    if (camera.position.distanceTo(new THREE.Vector3(...camGoal.pos)) < 0.3) camGoal = null;
  }
  controls.autoRotate = state.autoRotate &&!camGoal;
  controls.update();

  const rpm = wind < SENV.CUT_IN || wind >= CUT_OUT? 0 : rpmTarget;
  const snap = SENV.snapshot(m, wind, rpm, cfOf(m));
  if (hudWind) hudWind.textContent = wind.toFixed(1);
  if (hudRpm) hudRpm.textContent = rpm.toFixed(1);
  if (hudPower) hudPower.textContent = snap.outputMW.toFixed(2);
  if (windOut) windOut.textContent = wind.toFixed(1) + ' m/s';
  if ($('explodeOut')) $('explodeOut').textContent = Math.round(state.explode * 100) + '%';
  if ($('pitchOut')) $('pitchOut').textContent = state.pitch + '°';
  if ($('yawOut')) $('yawOut').textContent = state.yaw + '°';
  if (powerFill) powerFill.style.width = (snap.outputMW / m.rated * 100) + '%';
  if (powerLabel) powerLabel.textContent = `${snap.outputMW.toFixed(2)} MW / ${snap.aepGWh.toFixed(1)} GWh·yr`;
  if (rOut) rOut.textContent = Math.round(snap.outputKW) + ' kW';
  if (rSwept) rSwept.textContent = SENV.fmt.n(snap.swept) + ' m²';
  if (rTip) rTip.textContent = snap.tip.toFixed(0) + ' m/s';
  if (rTsr) rTsr.textContent = snap.tsr.toFixed(1);
  if (rThrust) rThrust.textContent = snap.thrust.toFixed(0) + ' kN';
  if (rCf) rCf.textContent = (snap.cf * 100).toFixed(1) + ' %';
  if (rAep) rAep.textContent = snap.aepGWh.toFixed(2) + ' GWh';
  if (rHomes) rHomes.textContent = SENV.fmt.n(Math.round(snap.homes));

  drawChart(wind, m.rated);
  renderer.render(scene, camera);
}

const chart = document.getElementById('powerChart');
function drawChart(wind, rated) {
  if (!chart) return;
  const ctx = chart.getContext('2d');
  const W = chart.width, H = chart.height;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(14,47,76,.16)';
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.beginPath();
  for (let x = 0; x <= 20; x += 0.25) {
    const px = (x / 20) * W;
    const py = H - 8 - (powerMW(x, rated) / rated) * (H - 20);
    x === 0? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#00874a'; ctx.lineWidth = 2; ctx.stroke();
  const dx = (Math.min(20, wind) / 20) * W;
  const dy = H - 8 - (powerMW(wind, rated) / rated) * (H - 20);
  ctx.fillStyle = '#0b6fb4';
  ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#e11d48';
  ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, 7); ctx.fill();
}

addEventListener('resize', resizeView);
resizeView();

const stageSec = document.getElementById('lab');
const stageMQ = matchMedia('(max-width:1500px)');
const STAGE_NAV = 63;
const STAGE_H = 0.48;
let stageOn = false;
function setStage(on) {
  on =!!on;
  if (on === stageOn) return;
  stageOn = on;
  document.body.classList.toggle('lab-view', on);
  dispatchEvent(new Event('resize'));
}
function measureStage() {
  if (!stageSec ||!stageMQ.matches) return setStage(false);
  const r = stageSec.getBoundingClientRect();
  setStage(r.top <= STAGE_NAV * 0.5 && r.bottom >= STAGE_NAV + STAGE_H * innerHeight - 8);
}
if (stageSec) {
  addEventListener('scroll', measureStage, { passive: true });
  addEventListener('resize', measureStage);
  if (stageMQ.addEventListener) stageMQ.addEventListener('change', measureStage);
  else if (stageMQ.addListener) stageMQ.addListener(measureStage);
  measureStage();
}
addEventListener('wheel', e => {
  if (stageOn && e.target === renderer.domElement) e.stopImmediatePropagation();
}, { capture: true, passive: true });

const flight = [
  { y: 0, pos: [26, 14, 34] }, { y: 1, pos: [-30, 18, 20] },
  { y: 2, pos: [8, 30, 26] }, { y: 3, pos: [-18, 10, 34] },
  { y: 4, pos: [30, 22, -10] }, { y: 5, pos: [20, 12, 30] }
];
addEventListener('scroll', () => {
  const idx = Math.min(flight.length - 1, Math.floor(scrollY / innerHeight + 0.5));
  const f = flight[idx];
  if (f &&!camGoal && Math.abs(scrollY / innerHeight - idx) < 0.6) {}
}, { passive: true });

window.__scene.setModel(new URLSearchParams(location.search).get('model') in MODELS? new URLSearchParams(location.search).get('model') : 'm130');
animate();

/* ---- model switch UI ---- */
const cadSwitch = document.createElement('div');
cadSwitch.className = 'cad-switch';
cadSwitch.innerHTML = '<span class="cad-switch-tag">MACHINE</span>' +
  '<button type="button" class="cad-opt" data-cad="1">Real 4XM CAD</button>' +
  '<button type="button" class="cad-opt" data-cad="0">Classic</button>';
document.body.appendChild(cadSwitch);
const cadPill = document.createElement('div');
cadPill.className = 'cad-pill';
document.body.appendChild(cadPill);

function syncSwitch() {
  cadSwitch.querySelectorAll('.cad-opt').forEach(b =>
    b.classList.toggle('active', (b.dataset.cad === '1') === !!state.cad));
}
cadSwitch.addEventListener('click', ev => {
  const b = ev.target.closest('.cad-opt');
  if (b) window.__scene.setCAD(b.dataset.cad === '1');
});
syncSwitch();

function updatePill() {
  if (cadLoading && !cadApi) {
    cadPill.classList.remove('is-warn');
    cadPill.classList.add('show');
    cadPill.textContent = 'Loading real 4XM CAD · ' + Math.round(cadStatus.p * 100) + '%';
  } else if (cadFailed && state.cad) {
    cadPill.classList.add('show', 'is-warn');
    cadPill.textContent = 'CAD unavailable — classic model';
    clearTimeout(updatePill._t);
    updatePill._t = setTimeout(() => cadPill.classList.remove('show'), 4000);
  } else if (cadApi && state.cad) {
    cadPill.classList.remove('is-warn');
    cadPill.classList.add('show');
    cadPill.textContent = 'Real 4XM CAD active';
    clearTimeout(updatePill._t);
    updatePill._t = setTimeout(() => cadPill.classList.remove('show'), 2600);
  } else {
    cadPill.classList.remove('show');
  }
}

function toast(msg) {
  cadPill.classList.add('show', 'is-warn');
  cadPill.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => cadPill.classList.remove('show'), 4200);
}

/* ---- preloader ---- */
const bootT = performance.now();
let preloaded = 0;
const li = setInterval(() => {
  preloaded = Math.min(100, preloaded + 25);
  const waiting = state.cad && !cadStatus.settled && !cadFailed && (performance.now() - bootT < 5000);
  const f = document.getElementById('loaderFill');
  if (f) {
    f.style.width = waiting
      ? Math.min(99, Math.round(preloaded * 0.35 + cadStatus.p * 65)) + '%'
      : preloaded + '%';
  }
  if (preloaded >= 100 && !waiting) {
    clearInterval(li);
    if (f) f.style.width = '100%';
    setTimeout(() => document.getElementById('preloader')?.classList.add('done'), 300);
  }
}, 120);

// Global fail-safe: dismiss the preloader overlay within 2.5 seconds regardless of network latency
setTimeout(() => {
  document.getElementById('preloader')?.classList.add('done');
}, 2500);

if (state.cad) ensureCAD();



//// --------------------------- before nacell exploded upodate code ------------------

// import * as THREE from 'three';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// import { loadCADModel } from './cad_model.js?v=20261023b';

// /* ================= STATE ================= */
// const state = {
//   wind: 8.5, explode: 0, pitch: 2, yaw: 0,
//   model: 'offshore', env: 'day',
//   autoRotate: true, particles: 0.7,
//   birds: true, farm: true,
//   colorBody: '#f4f7fa', colorAccent: '#b9c3cf',
//   gust: 0,
//   cad: (function () { try { return localStorage.getItem('senvion_cad') !== '0'; } catch (e) { return true; } })()
// };
// window.TURBINE = state;

// const SENV = window.SENVION;
// const MODELS = SENV.MODELS;
// const CUT_OUT = SENV.CUT_OUT;

// const defaultModel = 'm130';
// const urlParams = new URLSearchParams(window.location.search);
// const urlModel = urlParams.get('model');
// if (urlModel && MODELS[urlModel]) {
//   state.model = urlModel;
// } else {
//   state.model = defaultModel;
// }

// const PART_INFO = {
//   blade: { title: 'Rotor Blade — SE 63.7 GFRP', desc: '63.7 m glass-fibre blade on the 130 m rotor (13,273 m² swept). Triple-row roller blade bearings cut friction and carry monsoon loads.', specs: [['Length','63.7 m'],['Rotor Ø','130 m'],['Material','GFRP']] },
//   hub: { title: 'Hub & Pitch System', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation. Embedded safety PLC plus hot-weather control strategy.', specs: [['Pitch','DC motors'],['Control','Adaptive + safety PLC'],['Climate','to +49 °C']] },
//   nacelle: { title: 'Nacelle — DFIG Drivetrain', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance. Hybrid active+passive liquid cooling.', specs: [['Generator','DFIG · IP54'],['Gearbox','Integral planet carrier'],['Shaft','Forged high-torque']] },
//   tower: { title: 'Tubular Steel Tower — to 140 m', desc: 'Tubular steel tower up to 140 m hub height. Nacelle, hub and tower sealing plus ventilation designed for monsoon conditions.', specs: [['Height','to 140 m'],['Type','Tubular steel'],['Class','IEC S']] },
//   gearbox: { title: 'Planetary Gearbox', desc: 'Planetary gearbox with an integral planet carrier, mounted low on the nacelle bedplate for a short, stiff load path from the rotor.', specs: [['Type','Planetary'],['Carrier','Integral'],['Lube','Forced oil']] },
//   generator: { title: 'DFIG Generator', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance.', specs: [['Type','DFIG · IP54'],['Cooling','Hybrid liquid'],['Control','Separate P / Q']] },
//   drivetrain: { title: 'Bedplate, Shaft & Yaw', desc: 'Forged high-torque main shaft and gearbox sit on a fabricated bedplate, with the transformer, control cabinets and yaw drive packed around them.', specs: [['Bedplate','Fabricated steel'],['Main shaft','Forged · high-torque'],['Yaw','Electric drive']] },
//   pitch: { title: 'Pitch Drive Unit', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation, running on a three-row roller blade bearing.', specs: [['Motor','DC'],['Bearing','3-row roller'],['Control','Safety PLC']] },
//   cooler: { title: 'Passive Cooling Unit', desc: 'Liquid-to-air passive cooler with its support structure on the nacelle roof — hybrid active + passive thermal management tuned for hot-climate operation to +49 °C.', specs: [['Type','Passive air'],['Mount','Nacelle roof'],['Climate','to +49 °C']] },
//   staircase: { title: 'Tower Access & Cooler Fan', desc: 'Service entry staircase and platform at the tower base with the cooler fan unit — the ground-level interface for technicians and the tower ventilation path.', specs: [['Location','Tower base'],['Use','Service access'],['Fan','Cooler unit']] }
// };

// /* ================= RENDERER / SCENE ================= */
// const canvas = document.getElementById('webgl');
// const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
// renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// renderer.setSize(innerWidth, innerHeight, false);
// renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
// renderer.toneMappingExposure = 1.05;

// const scene = new THREE.Scene();
// scene.background = new THREE.Color('#87b5e0');
// scene.fog = new THREE.Fog('#a8c6e4', 60, 340);

// const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
// camera.position.set(44, 23, 55);

// function resizeView() {
//   const r = renderer.domElement.getBoundingClientRect();
//   const w = Math.max(1, Math.round(r.width || innerWidth));
//   const h = Math.max(1, Math.round(r.height || innerHeight));
//   renderer.setSize(w, h, false);
//   camera.aspect = w / h;
//   camera.updateProjectionMatrix();
// }

// const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping = true;
// controls.dampingFactor = 0.06;
// controls.maxPolarAngle = Math.PI * 0.495;
// controls.minDistance = 8;
// controls.maxDistance = 120;
// controls.autoRotate = true;
// controls.autoRotateSpeed = 0.6;
// controls.target.set(0, 18, 0);

// const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3d2a, 0.9);
// scene.add(hemi);
// const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
// sun.position.set(40, 60, 25);
// sun.castShadow = true;
// sun.shadow.mapSize.set(2048, 2048);
// sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
// sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -20;
// scene.add(sun);
// const rim = new THREE.DirectionalLight(0x5eead4, 0.5);
// rim.position.set(-30, 20, -30);
// scene.add(rim);

// /* studio-grade reflections, applied ONLY to the CAD materials so the
//    classic model keeps its original look */
// let envTex = null;
// function getEnvTex() {
//   if (!envTex) {
//     const pm = new THREE.PMREMGenerator(renderer);
//     envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
//     pm.dispose();
//   }
//   return envTex;
// }

// /* ================= GROUND ================= */
// const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 1 });
// const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 64), groundMat);
// ground.rotation.x = -Math.PI / 2;
// ground.receiveShadow = true;
// scene.add(ground);

// const padMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.9 });
// const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.6, 32), padMat);
// pad.position.y = 0.3; pad.receiveShadow = true;
// scene.add(pad);

// const grid = new THREE.GridHelper(200, 40, 0xffffff, 0xffffff);
// grid.material.transparent = true; grid.material.opacity = 0.05;
// grid.position.y = 0.05;
// scene.add(grid);

// /* ================= TURBINE BUILD ================= */
// const turbine = new THREE.Group();
// scene.add(turbine);

// const bodyMat = new THREE.MeshStandardMaterial({ color: state.colorBody, roughness: 0.35, metalness: 0.15 });
// const accentMat = new THREE.MeshStandardMaterial({ color: state.colorAccent, roughness: 0.4, metalness: 0.3 });
// const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });

// const steelMat = new THREE.MeshStandardMaterial({ color: 0xaab4c0, roughness: 0.32, metalness: 0.8 });
// const gearMat = new THREE.MeshStandardMaterial({ color: 0x8792a1, roughness: 0.5, metalness: 0.6 });
// const plateMat = new THREE.MeshStandardMaterial({ color: 0x4d5765, roughness: 0.7, metalness: 0.5 });
// const cabMat = new THREE.MeshStandardMaterial({ color: 0xdde5ed, roughness: 0.55, metalness: 0.15 });

// function makeTowerTexture() {
//   const W = 16, H = 2049;
//   const c = document.createElement('canvas'); c.width = W; c.height = H;
//   const g = c.getContext('2d');
//   g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, W, H);
//   const TOP = 0.035, BOT = 0.60, N = 7;
//   const step = (BOT - TOP) / N;
//   g.fillStyle = 'rgb(245, 87, 82)';
//   for (let i = 0; i < N; i++) g.fillRect(0, (TOP + i * step) * H, W, step * 0.52 * H);
//   const t = new THREE.CanvasTexture(c);
//   t.colorSpace = THREE.SRGBColorSpace;
//   t.anisotropy = renderer.capabilities.getMaxAnisotropy();
//   return t;
// }
// const towerH = 26;
// const towerMat = bodyMat.clone();
// towerMat.map = makeTowerTexture();
// const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, towerH, 44, 1), towerMat);
// tower.position.y = towerH / 2 + 0.6;
// tower.castShadow = true; tower.receiveShadow = true;
// tower.userData.part = 'tower';
// turbine.add(tower);

// const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.3), darkMat);
// door.position.set(0, 1.8, 1.5); turbine.add(door);

// const yawGroup = new THREE.Group();
// yawGroup.position.y = towerH + 0.6;
// turbine.add(yawGroup);

// const brandCanvas = document.createElement('canvas');
// brandCanvas.width = 1024; brandCanvas.height = 340;
// const brandCtx = brandCanvas.getContext('2d');
// const brandTex = new THREE.CanvasTexture(brandCanvas);
// brandTex.colorSpace = THREE.SRGBColorSpace;
// brandTex.minFilter = THREE.LinearMipmapLinearFilter;
// brandTex.magFilter = THREE.LinearFilter;
// brandTex.premultiplyAlpha = false;
// brandTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// function drawBrand(label) {
//   const c = brandCanvas, g = brandCtx;
//   g.clearRect(0, 0, c.width, c.height);
//   g.textAlign = 'center';
//   g.textBaseline = 'middle';
//   try { g.letterSpacing = '12px'; } catch (e) {}
//   g.fillStyle = '#ffffff';
//   g.font = '700 165px Arial, Helvetica, sans-serif';
//   g.fillText('SENVION', c.width / 2, 118);
//   try { g.letterSpacing = '7px'; } catch (e) {}
//   g.font = '700 60px Arial, Helvetica, sans-serif';
//   g.fillText(String(label || '2.7M130').toUpperCase(), c.width / 2 + 165, 244);
//   brandTex.needsUpdate = true;
// }
// const brandMat = new THREE.MeshStandardMaterial({
//   map: brandTex,
//   transparent: true,
//   alphaTest: 0.1,
//   color: 0x0f9d58,
//   roughness: 0.4,
//   metalness: 0,
//   depthWrite: false,
//   side: THREE.DoubleSide,
//   polygonOffset: true,
//   polygonOffsetFactor: -3,
//   polygonOffsetUnits: -3
// });

// const nacelle = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.2, 6.2, 5, 0.34), bodyMat.clone());
// nacelle.position.set(0, 1.1, -0.6);
// nacelle.castShadow = true;
// nacelle.userData.part = 'nacelle';
// yawGroup.add(nacelle);

// const labelGeo = new THREE.PlaneGeometry(3.0, 0.996);
// for (const s of [1, -1]) {
//   const lab = new THREE.Mesh(labelGeo, brandMat);
//   lab.position.set(s * 1.108, -0.05, -0.4);
//   lab.rotation.y = s * Math.PI / 2;
//   nacelle.add(lab);
// }
// const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.45, metalness: 0.55 });
// const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.3), railMat);
// deck.position.set(0, 1.14, -2.05);
// nacelle.add(deck);
// const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), railMat);
// railBar.position.set(0, 1.5, -2.68);
// nacelle.add(railBar);
// for (const sx of [-0.71, 0, 0.71]) {
//   const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
//   post.position.set(sx, 1.31, -2.68);
//   nacelle.add(post);
// }
// for (const sx of [-0.71, 0.71]) {
//   const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.3), railMat);
//   side.position.set(sx, 1.5, -2.05);
//   nacelle.add(side);
//   const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
//   sp1.position.set(sx, 1.31, -1.45);
//   nacelle.add(sp1);
// }

// const interior = new THREE.Group();
// interior.position.copy(nacelle.position);
// interior.visible = false;
// yawGroup.add(interior);

// const fit = (mesh, part) => {
//   mesh.userData.part = part;
//   mesh.castShadow = true; mesh.receiveShadow = true;
//   interior.add(mesh);
//   return mesh;
// };
// const ibox = (w, h, d, mat, x, y, z, part) => {
//   const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
//   m.position.set(x, y, z);
//   return fit(m, part);
// };
// const itube = (r, len, mat, x, y, z, part, seg = 24) => {
//   const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
//   m.rotation.x = Math.PI / 2;
//   m.position.set(x, y, z);
//   return fit(m, part);
// };

// const yawRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.1, 10, 48), plateMat);
// yawRing.rotation.x = Math.PI / 2; yawRing.position.y = -1.14;
// fit(yawRing, 'drivetrain');

// ibox(1.9, 0.14, 5.4, plateMat, 0, -1.0, -0.15, 'drivetrain');
// ibox(0.16, 0.16, 5.4, plateMat, 0.6, -0.85, -0.15, 'drivetrain');
// ibox(0.16, 0.16, 5.4, plateMat, -0.6, -0.85, -0.15, 'drivetrain');

// itube(0.44, 0.4, gearMat, 0, 0, 1.95, 'drivetrain', 26);
// itube(0.17, 2.8, steelMat, 0, 0, 1.2, 'drivetrain');

// const gearbox = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.9, 1.3, 4, 0.1), gearMat);
// gearbox.position.set(0, -0.02, -0.85);
// fit(gearbox, 'gearbox');
// itube(0.5, 0.1, gearMat, 0, -0.02, -0.18, 'gearbox', 26);
// ibox(0.7, 0.52, 0.9, plateMat, 0, -0.67, -0.85, 'drivetrain');
// ibox(0.5, 0.2, 0.55, cabMat, 0, 0.53, -0.7, 'gearbox');

// itube(0.09, 0.5, steelMat, 0, -0.02, -1.75, 'drivetrain', 18);
// itube(0.17, 0.14, gearMat, 0, -0.02, -1.52, 'drivetrain', 20);
// const generator = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 30), gearMat);
// generator.rotation.x = Math.PI / 2; generator.position.set(0, -0.02, -2.25);
// fit(generator, 'generator');
// for (const gz of [-2.6, -2.35, -2.1, -1.85]) itube(0.42, 0.05, gearMat, 0, -0.02, gz, 'generator', 30);
// ibox(0.6, 0.54, 0.7, plateMat, 0, -0.66, -2.25, 'drivetrain');

// ibox(0.34, 0.62, 1.0, cabMat, 0.72, -0.6, -2.3, 'drivetrain');
// ibox(0.32, 0.6, 0.9, cabMat, 0.74, -0.61, 0.4, 'drivetrain');
// ibox(0.3, 0.55, 1.2, cabMat, -0.76, -0.635, -1.6, 'drivetrain');
// ibox(0.3, 0.6, 1.0, cabMat, -0.76, -0.61, 0.6, 'drivetrain');
// ibox(1.7, 0.5, 0.22, gearMat, 0, 0.45, -2.95, 'drivetrain');

// // hub + rotor
// const rotor = new THREE.Group();
// rotor.position.set(0, 1.1, 2.8);
// yawGroup.add(rotor);
// const accentParts = [];

// const hubProfile = [
//   [0.62, -0.95], [0.86, -0.80], [1.00, -0.60], [1.06, -0.35],
//   [1.07, -0.05], [1.03, 0.25], [0.94, 0.52], [0.82, 0.75],
//   [0.70, 0.92], [0.63, 1.02], [0.60, 1.07]
// ];
// const hubMat = bodyMat.clone();
// hubMat.side = THREE.DoubleSide;
// const hub = new THREE.Mesh(
//   new THREE.LatheGeometry(hubProfile.map(p => new THREE.Vector2(p[0], p[1])), 56),
//   hubMat
// );
// hub.rotation.x = Math.PI / 2;
// hub.castShadow = true;
// hub.userData.part = 'hub';
// rotor.add(hub);

// // ========== PHOTO-EXACT HUB NOSE - EXACT MATCH TO YOUR REFERENCE ==========

// const hubCap = new THREE.Group();
// hubCap.position.z = 1.07;
// rotor.add(hubCap);

// const noseProfile = [
//   [0.60, 0.00],
//   [0.58, 0.06],
//   [0.50, 0.15],
//   [0.32, 0.26],
//   [0.10, 0.33],
//   [0.00, 0.35]
// ];
// const noseGeo = new THREE.LatheGeometry(
//   noseProfile.map(p => new THREE.Vector2(p[0], p[1])),
//   64
// );
// const hubNose = new THREE.Mesh(noseGeo, hubMat);
// hubNose.rotation.x = Math.PI / 2;
// hubNose.position.z = -0.08; // <-- move dome 8cm inside hub
// hubNose.castShadow = true;
// hubNose.receiveShadow = true;
// hubNose.userData.part = 'hub';
// hubCap.add(hubNose);

// const hubCapRim = new THREE.Mesh(
//   new THREE.TorusGeometry(0.60, 0.028, 12, 64),
//   hubMat
// );
// hubCapRim.position.z = 0.0;
// hubCapRim.userData.part = 'hub';
// hubCap.add(hubCapRim);

// const hubFaceRing = new THREE.Mesh(
//   new THREE.TorusGeometry(0.44, 0.032, 10, 48),
//   accentMat.clone()
// );
// hubFaceRing.position.z = 0.005;
// hubCap.add(hubFaceRing);
// accentParts.push(hubFaceRing);
// // ========== END NOSE ==========

// const hubInside = new THREE.Group();
// rotor.add(hubInside);
// const hubBack = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), plateMat);
// hubBack.rotation.x = Math.PI / 2; hubBack.position.z = -0.95;
// hubBack.userData.part = 'drivetrain';
// hubInside.add(hubBack);
// const hubShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 2.0, 24), steelMat);
// hubShaft.rotation.x = Math.PI / 2; hubShaft.position.z = 0.05;
// hubShaft.userData.part = 'drivetrain';
// hubInside.add(hubShaft);
// const hubCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 26), gearMat);
// hubCollar.rotation.x = Math.PI / 2; hubCollar.position.z = -1.0;
// hubCollar.userData.part = 'drivetrain';
// hubInside.add(hubCollar);

// function makeBlade(len = 13, rootR = 0.34) {
//   const NS = 96;
//   const NR = 26;
//   const pos = [], idx = [], col = [];
//   const white = new THREE.Color(0xffffff);
//   const red = new THREE.Color(0xcf352f);
//   const BANDS = [[0.838, 0.874], [0.903, 0.939], [0.972, 1.01]];
//   const isRed = t => BANDS.some(b => t >= b[0] && t < b[1]);
//   const tmp = new THREE.Color();
//   const K = {
//     chord: [[0, 0.95], [0.10, 1.34], [0.32, 1.20], [0.66, 0.74], [0.88, 0.38], [1, 0.16]],
//     thick: [[0, 0.46], [0.10, 0.44], [0.32, 0.32], [0.66, 0.19], [0.88, 0.12], [1, 0.085]],
//     twist: [[0, 16], [0.06, 12], [0.25, 6], [0.60, 2.4], [1, 0.5]],
//     sweep: [[0, 0], [1, 0.055]]
//   };
//   const at = (kf, t) => {
//     if (t <= kf[0][0]) return kf[0][1];
//     for (let i = 0; i < kf.length - 1; i++) {
//       const [a, va] = kf[i], [b, vb] = kf[i + 1];
//       if (t <= b) { const u = (t - a) / (b - a); return va + (vb - va) * (u * u * (3 - 2 * u)); }
//     }
//     return kf[kf.length - 1][1];
//   };
//   const yt = (x, tr) => 5 * tr * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
//   for (let s = 0; s <= NS; s++) {
//     const t = s / NS;
//     const c = at(K.chord, t), tr = at(K.thick, t);
//     const tw = THREE.MathUtils.degToRad(at(K.twist, t));
//     const sw = at(K.sweep, t) * len;
//     const ct = Math.cos(tw), st = Math.sin(tw);
//     const a = THREE.MathUtils.smoothstep(t, 0, 0.05);
//     for (let k = 0; k < NR; k++) {
//       const th = (k / NR) * Math.PI * 2;
//       const xN = (1 - Math.cos(th)) / 2;
//       const sg = th < Math.PI? 1 : -1;
//       const ax = (0.5 - xN) * c;
//       const ay = sg * yt(xN, tr) * c + 0.20 * c * xN * (1 - xN);
//       const rx = rootR * Math.cos(th), rz = rootR * Math.sin(th);
//       const ux = ax + (rx - ax) * (1 - a);
//       const uy = ay + (rz - ay) * (1 - a);
//       pos.push(ux * ct - uy * st - sw, t * len, ux * st + uy * ct);
//       tmp.copy(isRed(t)? red : white);
//       col.push(tmp.r, tmp.g, tmp.b);
//     }
//   }
//   const vi = (s, k) => s * NR + (k % NR);
//   for (let s = 0; s < NS; s++) {
//     for (let k = 0; k < NR; k++) {
//       const a = vi(s, k), b = vi(s, k + 1), cc = vi(s + 1, k), d = vi(s + 1, k + 1);
//       idx.push(a, cc, b, b, cc, d);
//     }
//   }
//   const rootC = pos.length / 3;
//   pos.push(0, 0, 0); col.push(white.r, white.g, white.b);
//   for (let k = 0; k < NR; k++) idx.push(rootC, k, (k + 1) % NR);
//   const tipO = pos.length / 3;
//   let mx = 0, mz = 0;
//   for (let k = 0; k < NR; k++) { mx += pos[vi(NS, k) * 3]; mz += pos[vi(NS, k) * 3 + 2]; }
//   pos.push(mx / NR, len, mz / NR); col.push(red.r, red.g, red.b);
//   for (let k = 0; k < NR; k++) idx.push(tipO, vi(NS, k + 1), vi(NS, k));
//   const geo = new THREE.BufferGeometry();
//   geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
//   geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
//   geo.setIndex(idx);
//   geo.computeVertexNormals();
//   const m = bodyMat.clone();
//   m.vertexColors = true;
//   const mesh = new THREE.Mesh(geo, m);
//   mesh.castShadow = true;
//   mesh.userData.part = 'blade';
//   return mesh;
// }
// const blades = [];
// const bossGeo = new THREE.CylinderGeometry(0.40, 0.50, 0.55, 30);
// const ringGeo = new THREE.TorusGeometry(0.46, 0.05, 10, 44);

// // Create the reference blade so the shared aerodynamic geometry can also be used by background turbines
// const masterBlade = makeBlade(13);
// const sharedBladeGeo = masterBlade.geometry;

// for (let i = 0; i < 3; i++) {
//   const pivot = new THREE.Group();
//   const boss = new THREE.Mesh(bossGeo, bodyMat.clone());
//   boss.position.y = 0.875; boss.castShadow = true; boss.userData.part = 'hub';
//   pivot.add(boss);
//   const brg = new THREE.Mesh(ringGeo, accentMat.clone());
//   brg.rotation.x = Math.PI / 2;
//   brg.position.y = 1.15;
//   pivot.add(brg); accentParts.push(brg);
//   const pitchRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 44), gearMat);
//   pitchRing.rotation.x = Math.PI / 2;
//   pitchRing.position.y = 0.6;
//   pitchRing.userData.part = 'pitch';
//   pivot.add(pitchRing);
//   const pitchDrive = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.28, 0.32, 3, 0.06), gearMat);
//   pitchDrive.position.set(0.3, 0.4, 0.08);
//   pitchDrive.userData.part = 'pitch';
//   pivot.add(pitchDrive);
//   const b = (i === 0) ? masterBlade : makeBlade(13);
//   b.position.y = 0.85;
//   b.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4;
//   pivot.add(b);
//   pivot.rotation.z = (i / 3) * Math.PI * 2;
//   pivot.userData.part = 'blade';
//   b.userData.part = 'blade';
//   rotor.add(pivot);
//   blades.push(pivot);
// }

// /* ================= BACKGROUND WIND FARM (FULL SENVION MODEL REPLICAS) ================= */
// const farmGroup = new THREE.Group();
// scene.add(farmGroup);

// // Shared geometries for high performance across all background wind farm turbines
// const farmTowerGeo = new THREE.CylinderGeometry(0.9, 1.6, towerH, 32, 1);
// const farmNacelleGeo = new RoundedBoxGeometry(2.2, 2.2, 6.2, 3, 0.3);
// const farmHubGeo = new THREE.LatheGeometry(hubProfile.map(p => new THREE.Vector2(p[0], p[1])), 32);
// const farmNoseGeo = new THREE.LatheGeometry(noseProfile.map(p => new THREE.Vector2(p[0], p[1])), 32);
// const farmBladeMat = new THREE.MeshStandardMaterial({
//   color: 0xffffff,
//   roughness: 0.35,
//   metalness: 0.15,
//   vertexColors: true
// });

// function miniTurbine(x, z, s) {
//   const g = new THREE.Group();

//   // 1. Tapered Tower with the signature Senvion red & white aviation stripes
//   const t = new THREE.Mesh(farmTowerGeo, towerMat);
//   t.position.y = towerH / 2 + 0.6;
//   t.castShadow = true;
//   g.add(t);

//   // 2. Nacelle with roof railings and Senvion logo
//   const n = new THREE.Mesh(farmNacelleGeo, bodyMat);
//   n.position.set(0, towerH + 0.6 + 1.1, -0.6);
//   n.castShadow = true;
//   g.add(n);

//   for (const side of [1, -1]) {
//     const lab = new THREE.Mesh(labelGeo, brandMat);
//     lab.position.set(side * 1.108, -0.05, -0.4);
//     lab.rotation.y = side * Math.PI / 2;
//     n.add(lab);
//   }

//   const d = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.3), railMat);
//   d.position.set(0, 1.14, -2.05);
//   n.add(d);
//   const rb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), railMat);
//   rb.position.set(0, 1.5, -2.68);
//   n.add(rb);

//   // 3. Realistic Rotor Hub with Nose Cone
//   const r = new THREE.Group();
//   r.position.set(0, towerH + 0.6 + 1.1, 2.8);

//   const hb = new THREE.Mesh(farmHubGeo, hubMat);
//   hb.rotation.x = Math.PI / 2;
//   r.add(hb);

//   const hCap = new THREE.Group();
//   hCap.position.z = 1.07;
//   const hn = new THREE.Mesh(farmNoseGeo, hubMat);
//   hn.rotation.x = Math.PI / 2;
//   hn.position.z = -0.08;
//   hCap.add(hn);
//   const hRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.032, 8, 32), accentMat);
//   hRing.position.z = 0.005;
//   hCap.add(hRing);
//   r.add(hCap);

//   // 4. Three aerodynamic GFRP blades with the 3 red stripes at the tips
//   for (let i = 0; i < 3; i++) {
//     const pv = new THREE.Group();
//     const bl = new THREE.Mesh(sharedBladeGeo, farmBladeMat);
//     bl.position.y = 0.85;
//     bl.rotation.x = 0.02;
//     bl.castShadow = true;
//     pv.add(bl);
//     pv.rotation.z = (i / 3) * Math.PI * 2;
//     r.add(pv);
//   }

//   g.add(r);
//   g.position.set(x, 0, z);
//   g.scale.setScalar(s);
//   g.userData.rotor = r;
//   return g;
// }

// const minis = [
//   miniTurbine(-55, -60, 0.85),
//   miniTurbine(-85, -30, 0.70),
//   miniTurbine(60, -70, 0.90),
//   miniTurbine(90, -35, 0.75),
//   miniTurbine(-40, -110, 0.95),
//   miniTurbine(30, -120, 0.85)
// ];
// minis.forEach(m => farmGroup.add(m));

// const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
// const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
// function makeCloud(x, y, z, s) {
//   const g = new THREE.Group();
//   for (let i = 0; i < 5; i++) {
//     const b = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 12, 10), cloudMat);
//     b.position.set(i * 2.4 - 4 + Math.random(), Math.random() * 1.2, Math.random() * 2 - 1);
//     b.scale.y = 0.55; g.add(b);
//   }
//   g.position.set(x, y, z); g.scale.setScalar(s);
//   return g;
// }
// const clouds = [];
// for (let i = 0; i < 8; i++) clouds.push(makeCloud((Math.random() -.5) * 260, 38 + Math.random() * 25, -60 - Math.random() * 140, 1 + Math.random()));
// clouds.forEach(c => cloudGroup.add(c));

// const birdGroup = new THREE.Group(); scene.add(birdGroup);
// const birdMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
// const birds = [];
// for (let i = 0; i < 7; i++) {
//   const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(1, 0, 0)]);
//   const l = new THREE.Line(g, birdMat);
//   l.position.set((Math.random() -.5) * 80, 22 + Math.random() * 14, -20 - Math.random() * 40);
//   l.userData = { ph: Math.random() * 9, sp: 0.4 + Math.random() * 0.5 };
//   birdGroup.add(l); birds.push(l);
// }

// const P_COUNT = 900;
// const pGeo = new THREE.BufferGeometry();
// const pPos = new Float32Array(P_COUNT * 3);
// const pSpd = new Float32Array(P_COUNT);
// function resetP(i, randomX = false) {
//   pPos[i * 3] = randomX? (Math.random() -.5) * 160 : -80 - Math.random() * 20;
//   pPos[i * 3 + 1] = 1 + Math.random() * 34;
//   pPos[i * 3 + 2] = (Math.random() -.5) * 120;
//   pSpd[i] = 0.6 + Math.random() * 0.9;
// }
// for (let i = 0; i < P_COUNT; i++) resetP(i, true);
// pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
// const pMat = new THREE.PointsMaterial({ color: 0xbef3ff, size: 0.35, transparent: true, opacity: 0.8 });
// const windPts = new THREE.Points(pGeo, pMat);
// scene.add(windPts);

// const starGeo = new THREE.BufferGeometry();
// const starPos = new Float32Array(600 * 3);
// for (let i = 0; i < 600; i++) {
//   const r = 380, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
//   starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
//   starPos[i * 3 + 1] = r * Math.cos(ph) + 10;
//   starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
// }
// starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
// const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0 }));
// scene.add(stars);

// const ENVS = {
//   day: { sky: '#cfe4f6', fog: '#e4eefa', sun: 2.4, hemi: 1.05, expo: 1.08, stars: 0, cloud: 0.9, ground: 0x4f8a4a },
//   sunset: { sky: '#e8805a', fog: '#e8a06a', sun: 1.6, hemi: 0.55, expo: 1.0, stars: 0.15, cloud: 0.9, ground: 0x5a5a35 },
//   night: { sky: '#040918', fog: '#0a1528', sun: 0.25,hemi: 0.25, expo: 0.85, stars: 1, cloud: 0.25, ground: 0x14241a },
//   storm: { sky: '#3a4552', fog: '#4a5563', sun: 0.7, hemi: 0.4, expo: 0.9, stars: 0, cloud: 0.95, ground: 0x2c3a2c }
// };
// let envCur = {...ENVS.day };
// function applyEnv(name) {
//   state.env = name;
//   const t = ENVS[name];
//   envTarget = {...t };
// }
// let envTarget = {...ENVS.day };

// const FOCUS_SCALE = 0.85;
// const FOCUS = {
//   overview: { pos: [44, 23, 55], tgt: [0, 18, 0] },
//   blades: { pos: [7, 27, 15], tgt: [0, 23, 2] },
//   nacelle: { pos: [10, 26, 11], tgt: [0, 23.5, -1] },
//   tower: { pos: [11, 8, 18], tgt: [0, 11, 0] }
// };
// let camGoal = null;
// let focusName = 'overview';
// function focus(name) {
//   if (!FOCUS[name]) name = 'overview';
//   focusName = name;
//   const k = name === 'overview'? 1 :
//     ((MODELS[state.model] || MODELS.m130).scale || FOCUS_SCALE) / FOCUS_SCALE;
//   camGoal = {
//     pos: FOCUS[name].pos.map(v => +(v * k).toFixed(3)),
//     tgt: FOCUS[name].tgt.map(v => +(v * k).toFixed(3))
//   };
// }

// function powerMW(wind, rated) {
//   return SENV.powerMW(wind, typeof rated === 'number'? rated : rated.rated);
// }
// let _cfKey = '', _cfVal = 0;
// function cfOf(m) {
//   if (_cfKey!== m.key) { _cfKey = m.key; _cfVal = SENV.capacityFactor(m); }
//   return _cfVal;
// }

// const ray = new THREE.Raycaster();
// const ptr = new THREE.Vector2();
// let downAt = 0;
// renderer.domElement.addEventListener('pointerdown', e => downAt = performance.now());
// renderer.domElement.addEventListener('pointerup', e => {
//   if (performance.now() - downAt > 250) return;
//   const r = renderer.domElement.getBoundingClientRect();
//   ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
//   ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
//   ray.setFromCamera(ptr, camera);
//   const hits = ray.intersectObjects(activeRoot().children, true);
//   for (const h of hits) {
//     let o = h.object;
//     while (o &&!o.userData.part) o = o.parent;
//     if (o && o.userData.part) { showPart(o.userData.part); break; }
//   }
// });
// function showPart(key) {
//   const info = PART_INFO[key]; if (!info) return;
//   document.getElementById('partTitle').textContent = info.title;
//   document.getElementById('partDesc').textContent = info.desc;
//   document.getElementById('partSpecs').innerHTML = info.specs.map(s => `<div><span>${s[0]}</span><b>${s[1]}</b></div>`).join('');
//   document.getElementById('partCard').classList.add('show');
// }
// document.getElementById('partClose')?.addEventListener('click', () => document.getElementById('partCard').classList.remove('show'));

// /* ================= REAL 4XM CAD MODEL (STL → GLB) ================= */
// const CAD_BASE_SCALE = 27.7 / 139.025;   // shrink real CAD to the classic scene envelope
// let cadApi = null, cadLoading = false, cadFailed = false;
// const cadStatus = { settled: !state.cad, ok: false, p: 0 };

// function cadVisible() { return !!(state.cad && cadApi); }
// function activeRoot() { return cadVisible() ? cadApi.root : turbine; }

// function applyModelVisibility() {
//   const v = cadVisible();
//   if (cadApi) cadApi.root.visible = v;
//   turbine.visible = !v;
// }

// function ensureCAD() {
//   if (cadApi || cadFailed) return;
//   if (cadLoading) return;
//   cadLoading = true;
//   cadStatus.settled = false;
//   updatePill();
//   loadCADModel({
//     envMap: getEnvTex(),
//     anisotropy: renderer.capabilities.getMaxAnisotropy(),
//     onProgress: p => { cadStatus.p = p; updatePill(); }
//   }).then(api => {
//     cadApi = api;
//     const m = MODELS[state.model] || MODELS.m130;
//     cadApi.root.scale.setScalar(m.scale * CAD_BASE_SCALE);
//     scene.add(cadApi.root);
//     applyModelVisibility();
//     cadLoading = false;
//     cadStatus.settled = true; cadStatus.ok = true;
//     updatePill(); syncSwitch();
//     window.dispatchEvent(new Event('senvion:cad'));
//   }).catch(err => {
//     cadLoading = false;
//     cadFailed = true;
//     cadStatus.settled = true; cadStatus.ok = false;
//     console.warn('[CAD] load failed:', err);
//     applyModelVisibility();
//     updatePill(); syncSwitch();
//     toast('Real 4XM CAD unavailable — classic model stays.');
//   });
// }

// window.__scene = {
//   focus, applyEnv,
//   setModel(name) {
//     if (!MODELS[name]) name = 'm130';
//     state.model = name;
//     const m = MODELS[name];
//     turbine.scale.setScalar(m.scale);
//     if (cadApi) cadApi.root.scale.setScalar(m.scale * CAD_BASE_SCALE);
//     drawBrand(m.name);
//     if (camGoal) focus(focusName);
//     document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('featured', c.dataset.model === name));
//     const hm = document.getElementById('hudModel'); if (hm) hm.textContent = m.name;
//     const sr = document.getElementById('specRated'); if (sr) sr.textContent = m.rated.toFixed(1) + ' MW';
//     const sro = document.getElementById('specRotor'); if (sro) sro.textContent = (m.rotorR * 2) + ' m';
//     const pl = document.querySelector('.power-label span'); if (pl) pl.textContent = 'Live output (' + m.name + ')';
//     window.dispatchEvent(new CustomEvent('senvion:model', { detail: { key: name, model: m } }));
//   },
//   paint(c1, c2) {
//     state.colorBody = c1; state.colorAccent = c2;
//     turbine.traverse(o => {
//       if (o.isMesh && o.material && o.material.color) {
//         const p = o.userData.part;
//         if (p === 'tower' || p === 'nacelle' || p === 'blade' || p === 'hub') o.material.color.set(c1);
//       }
//     });
//     accentParts.forEach(o => o.material.color.set(c2));
//     if (cadApi) {
//       cadApi.mats.tower.color.set(c1);
//       cadApi.mats.blade.color.set(c1);
//       cadApi.mats.shell.color.set(c1);
//       cadApi.mats.cooler.color.set(c2);
//       cadApi.mats.steel.color.set(c2);
//     }
//     const lum = new THREE.Color(c1);
//     const L = 0.2126 * lum.r + 0.7152 * lum.g + 0.0722 * lum.b;
//     brandMat.color.set(L > 0.25? '#0f9d58' : '#7dffb8');
//   },
//   setCAD(on) {
//     on = !!on;
//     state.cad = on;
//     try { localStorage.setItem('senvion_cad', on ? '1' : '0'); } catch (e) { /* private mode */ }
//     if (on) ensureCAD();
//     applyModelVisibility();
//     syncSwitch();
//   },
//   gust() { state.gust = 9; }
// };

// const $ = id => document.getElementById(id);
// $('windSlider')?.addEventListener('input', e => state.wind = +e.target.value);
// $('explodeSlider')?.addEventListener('input', e => state.explode = +e.target.value / 100);
// $('pitchSlider')?.addEventListener('input', e => state.pitch = +e.target.value);
// $('yawSlider')?.addEventListener('input', e => state.yaw = +e.target.value);
// $('partSlider')?.addEventListener('input', e => { state.particles = +e.target.value / 100; $('partOut').textContent = e.target.value + '%'; });
// $('birdsToggle')?.addEventListener('change', e => state.birds = e.target.checked);
// $('farmToggle')?.addEventListener('change', e => { state.farm = e.target.checked; farmGroup.visible = state.farm; });
// document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => focus(b.dataset.focus)));
// document.querySelectorAll('.modelchip').forEach(b => b.addEventListener('click', () => {
//   window.__scene.setModel(b.dataset.model);
//   document.querySelectorAll('.modelchip').forEach(x => x.classList.toggle('active', x === b));
// }));
// document.querySelectorAll('.view3d').forEach(b => b.addEventListener('click', () => {
//   if (document.body.dataset.page === 'products') {
//     location.href = 'lab.html?model=' + b.dataset.model;
//     return;
//   }
//   window.__scene.setModel(b.dataset.model);
//   document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
//   focus('overview');
// }));
// document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => {
//   document.querySelectorAll('.sw').forEach(x => x.classList.remove('active'));
//   b.classList.add('active');
//   window.__scene.paint(b.dataset.c1, b.dataset.c2);
// }));
// document.querySelectorAll('.env').forEach(b => b.addEventListener('click', () => {
//   document.querySelectorAll('.env').forEach(x => x.classList.remove('active'));
//   b.classList.add('active');
//   applyEnv(b.dataset.env);
//   const dn = $('dayNightBtn'); if (dn) dn.textContent = b.dataset.env === 'night'? '☀ Day mode' : '🌙 Night mode';
// }));

// (function syncEnvUI() {
//   applyEnv(state.env);
//   envCur = {...ENVS[state.env] };
//   document.querySelectorAll('.env').forEach(x => x.classList.toggle('active', x.dataset.env === state.env));
//   const dn = $('dayNightBtn');
//   if (dn) dn.textContent = state.env === 'night'? '☀ Day mode' : '🌙 Night mode';
// })();

// const clock = new THREE.Clock();
// let rotorAngle = 0;
// const hudWind = $('hudWind'), hudRpm = $('hudRpm'), hudPower = $('hudPower');
// const windOut = $('windOut'), powerFill = $('powerFill'), powerLabel = $('powerLabel');
// const rTip = $('rTip'), rThrust = $('rThrust'), rCf = $('rCf'), rCo2 = $('rCo2');
// const rOut = $('rOut'), rSwept = $('rSwept'), rTsr = $('rTsr'), rAep = $('rAep'), rHomes = $('rHomes');

// function lerp(a, b, t) { return a + (b - a) * t; }

// function animate() {
//   requestAnimationFrame(animate);
//   const dt = Math.min(clock.getDelta(), 0.05);
//   const t = clock.elapsedTime;

//   if (state.gust > 0) state.gust = Math.max(0, state.gust - dt * 3);
//   const wind = Math.min(CUT_OUT, state.wind + state.gust + Math.sin(t * 0.7) * 0.3);

//   const m = MODELS[state.model];
//   const eff = Math.max(0, (wind - 3) / 9);
//   const rpmTarget = wind < 3 || wind >= CUT_OUT? 0 : 4 + Math.min(1, eff) * 9;
//   const omega = rpmTarget * (Math.PI * 2 / 60);
//   rotorAngle += omega * dt;
//   rotor.rotation.z = -rotorAngle;
//   blades.forEach(p => p.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4);
//   yawGroup.rotation.y = THREE.MathUtils.degToRad(state.yaw);

//   const e = state.explode;
//   if (cadVisible()) {
//     // real 4XM CAD: yaw, rotor spin, blade pitch, explode + beacon in one call
//     cadApi.update({
//       yawDeg: state.yaw, rotorAngle, pitchDeg: state.pitch,
//       explode: e, t, night: state.env === 'night'
//     });
//   } else {
//     rotor.position.z = 2.8 + e * 6;
//     rotor.position.y = 1.1 + e * 2;
//     nacelle.position.z = -0.6 - e * 3;
//     nacelle.position.y = 1.1 + e * 3.6;
//     door.position.z = 1.5 + e * 2;
//     hubCap.position.z = 1.07 + e * 3.2;
//     interior.visible = e > 0.015;
//   }

//   // Background wind farm turbines animate dynamically with the wind
//   minis.forEach((mm, i) => {
//     if (mm.userData.rotor) {
//       mm.userData.rotor.rotation.z -= omega * dt * (0.95 + (i % 3) * 0.05);
//     }
//   });

//   clouds.forEach((c, i) => {
//     c.position.x += dt * (0.5 + wind * 0.25);
//     if (c.position.x > 150) c.position.x = -150;
//   });
//   cloudGroup.visible = state.birds;

//   birdGroup.visible = state.birds;
//   birds.forEach(b => {
//     b.position.x += dt * b.userData.sp * (2 + wind * 0.4);
//     b.position.y += Math.sin(t * 3 + b.userData.ph) * dt * 1.5;
//     if (b.position.x > 60) b.position.x = -60;
//     b.scale.y = 1 + Math.sin(t * 10 + b.userData.ph) * 0.4;
//   });

//   const pVisible = state.particles;
//   windPts.visible = pVisible > 0.02;
//   pMat.opacity = 0.15 + pVisible * 0.7;
//   if (windPts.visible) {
//     const arr = pGeo.attributes.position.array;
//     const v = (2 + wind * 2.2) * (0.3 + pVisible);
//     for (let i = 0; i < P_COUNT; i++) {
//       arr[i * 3] += v * dt * pSpd[i];
//       arr[i * 3 + 1] += Math.sin(t * 2 + i) * dt * 0.6;
//       if (arr[i * 3] > 85) resetP(i);
//     }
//     pGeo.attributes.position.needsUpdate = true;
//   }

//   for (const k of ['sun', 'hemi', 'expo', 'stars', 'cloud']) envCur[k] = lerp(envCur[k], envTarget[k], dt * 2);
//   scene.background.lerp(new THREE.Color(envTarget.sky), dt * 2);
//   scene.fog.color.lerp(new THREE.Color(envTarget.fog), dt * 2);
//   sun.intensity = envCur.sun; hemi.intensity = envCur.hemi;
//   renderer.toneMappingExposure = envCur.expo;
//   stars.material.opacity = envCur.stars;
//   cloudMat.opacity = envCur.cloud;
//   groundMat.color.lerp(new THREE.Color(envTarget.ground), dt * 2);
//   sun.color.lerp(new THREE.Color(state.env === 'sunset'? '#ffb37a' : state.env === 'night'? '#8aa4ff' : '#fff2dd'), dt * 2);

//   if (state.env === 'storm') {
//     camera.position.x += (Math.random() -.5) * 0.02;
//     rotorAngle += dt * 0.8;
//   }

//   if (camGoal) {
//     camera.position.lerp(new THREE.Vector3(...camGoal.pos), dt * 2.2);
//     controls.target.lerp(new THREE.Vector3(...camGoal.tgt), dt * 2.2);
//     if (camera.position.distanceTo(new THREE.Vector3(...camGoal.pos)) < 0.3) camGoal = null;
//   }
//   controls.autoRotate = state.autoRotate &&!camGoal;
//   controls.update();

//   const rpm = wind < SENV.CUT_IN || wind >= CUT_OUT? 0 : rpmTarget;
//   const snap = SENV.snapshot(m, wind, rpm, cfOf(m));
//   if (hudWind) hudWind.textContent = wind.toFixed(1);
//   if (hudRpm) hudRpm.textContent = rpm.toFixed(1);
//   if (hudPower) hudPower.textContent = snap.outputMW.toFixed(2);
//   if (windOut) windOut.textContent = wind.toFixed(1) + ' m/s';
//   if ($('explodeOut')) $('explodeOut').textContent = Math.round(state.explode * 100) + '%';
//   if ($('pitchOut')) $('pitchOut').textContent = state.pitch + '°';
//   if ($('yawOut')) $('yawOut').textContent = state.yaw + '°';
//   if (powerFill) powerFill.style.width = (snap.outputMW / m.rated * 100) + '%';
//   if (powerLabel) powerLabel.textContent = `${snap.outputMW.toFixed(2)} MW / ${snap.aepGWh.toFixed(1)} GWh·yr`;
//   if (rOut) rOut.textContent = Math.round(snap.outputKW) + ' kW';
//   if (rSwept) rSwept.textContent = SENV.fmt.n(snap.swept) + ' m²';
//   if (rTip) rTip.textContent = snap.tip.toFixed(0) + ' m/s';
//   if (rTsr) rTsr.textContent = snap.tsr.toFixed(1);
//   if (rThrust) rThrust.textContent = snap.thrust.toFixed(0) + ' kN';
//   if (rCf) rCf.textContent = (snap.cf * 100).toFixed(1) + ' %';
//   if (rAep) rAep.textContent = snap.aepGWh.toFixed(2) + ' GWh';
//   if (rHomes) rHomes.textContent = SENV.fmt.n(Math.round(snap.homes));

//   drawChart(wind, m.rated);
//   renderer.render(scene, camera);
// }

// const chart = document.getElementById('powerChart');
// function drawChart(wind, rated) {
//   if (!chart) return;
//   const ctx = chart.getContext('2d');
//   const W = chart.width, H = chart.height;
//   ctx.clearRect(0, 0, W, H);
//   ctx.strokeStyle = 'rgba(14,47,76,.16)';
//   ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
//   ctx.beginPath();
//   for (let x = 0; x <= 20; x += 0.25) {
//     const px = (x / 20) * W;
//     const py = H - 8 - (powerMW(x, rated) / rated) * (H - 20);
//     x === 0? ctx.moveTo(px, py) : ctx.lineTo(px, py);
//   }
//   ctx.strokeStyle = '#00874a'; ctx.lineWidth = 2; ctx.stroke();
//   const dx = (Math.min(20, wind) / 20) * W;
//   const dy = H - 8 - (powerMW(wind, rated) / rated) * (H - 20);
//   ctx.fillStyle = '#0b6fb4';
//   ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fill();
//   ctx.fillStyle = '#e11d48';
//   ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, 7); ctx.fill();
// }

// addEventListener('resize', resizeView);
// resizeView();

// const stageSec = document.getElementById('lab');
// const stageMQ = matchMedia('(max-width:1500px)');
// const STAGE_NAV = 63;
// const STAGE_H = 0.48;
// let stageOn = false;
// function setStage(on) {
//   on =!!on;
//   if (on === stageOn) return;
//   stageOn = on;
//   document.body.classList.toggle('lab-view', on);
//   dispatchEvent(new Event('resize'));
// }
// function measureStage() {
//   if (!stageSec ||!stageMQ.matches) return setStage(false);
//   const r = stageSec.getBoundingClientRect();
//   setStage(r.top <= STAGE_NAV * 0.5 && r.bottom >= STAGE_NAV + STAGE_H * innerHeight - 8);
// }
// if (stageSec) {
//   addEventListener('scroll', measureStage, { passive: true });
//   addEventListener('resize', measureStage);
//   if (stageMQ.addEventListener) stageMQ.addEventListener('change', measureStage);
//   else if (stageMQ.addListener) stageMQ.addListener(measureStage);
//   measureStage();
// }
// addEventListener('wheel', e => {
//   if (stageOn && e.target === renderer.domElement) e.stopImmediatePropagation();
// }, { capture: true, passive: true });

// const flight = [
//   { y: 0, pos: [26, 14, 34] }, { y: 1, pos: [-30, 18, 20] },
//   { y: 2, pos: [8, 30, 26] }, { y: 3, pos: [-18, 10, 34] },
//   { y: 4, pos: [30, 22, -10] }, { y: 5, pos: [20, 12, 30] }
// ];
// addEventListener('scroll', () => {
//   const idx = Math.min(flight.length - 1, Math.floor(scrollY / innerHeight + 0.5));
//   const f = flight[idx];
//   if (f &&!camGoal && Math.abs(scrollY / innerHeight - idx) < 0.6) {}
// }, { passive: true });

// window.__scene.setModel(new URLSearchParams(location.search).get('model') in MODELS? new URLSearchParams(location.search).get('model') : 'm130');
// animate();

// /* ---- model switch UI (injected on every page with the 3D view) ---- */
// const cadSwitch = document.createElement('div');
// cadSwitch.className = 'cad-switch';
// cadSwitch.innerHTML = '<span class="cad-switch-tag">MACHINE</span>' +
//   '<button type="button" class="cad-opt" data-cad="1">Real 4XM CAD</button>' +
//   '<button type="button" class="cad-opt" data-cad="0">Classic</button>';
// document.body.appendChild(cadSwitch);
// const cadPill = document.createElement('div');
// cadPill.className = 'cad-pill';
// document.body.appendChild(cadPill);

// function syncSwitch() {
//   cadSwitch.querySelectorAll('.cad-opt').forEach(b =>
//     b.classList.toggle('active', (b.dataset.cad === '1') === !!state.cad));
// }
// cadSwitch.addEventListener('click', ev => {
//   const b = ev.target.closest('.cad-opt');
//   if (b) window.__scene.setCAD(b.dataset.cad === '1');
// });
// syncSwitch();

// function updatePill() {
//   if (cadLoading && !cadApi) {
//     cadPill.classList.remove('is-warn');
//     cadPill.classList.add('show');
//     cadPill.textContent = 'Loading real 4XM CAD · ' + Math.round(cadStatus.p * 100) + '%';
//   } else if (cadFailed && state.cad) {
//     cadPill.classList.add('show', 'is-warn');
//     cadPill.textContent = 'CAD unavailable — classic model';
//     clearTimeout(updatePill._t);
//     updatePill._t = setTimeout(() => cadPill.classList.remove('show'), 4000);
//   } else if (cadApi && state.cad) {
//     cadPill.classList.remove('is-warn');
//     cadPill.classList.add('show');
//     cadPill.textContent = 'Real 4XM CAD active';
//     clearTimeout(updatePill._t);
//     updatePill._t = setTimeout(() => cadPill.classList.remove('show'), 2600);
//   } else {
//     cadPill.classList.remove('show');
//   }
// }

// function toast(msg) {
//   cadPill.classList.add('show', 'is-warn');
//   cadPill.textContent = msg;
//   clearTimeout(toast._t);
//   toast._t = setTimeout(() => cadPill.classList.remove('show'), 4200);
// }

// /* ---- preloader: hold until the real CAD is ready (max ~10 s), then reveal ---- */
// const bootT = performance.now();
// let preloaded = 0;
// const li = setInterval(() => {
//   preloaded = Math.min(100, preloaded + 25);
//   const waiting = state.cad && !cadStatus.settled && !cadFailed && (performance.now() - bootT < 10000);
//   const f = document.getElementById('loaderFill');
//   if (f) {
//     f.style.width = waiting
//       ? Math.min(99, Math.round(preloaded * 0.35 + cadStatus.p * 65)) + '%'
//       : preloaded + '%';
//   }
//   if (preloaded >= 100 && !waiting) {
//     clearInterval(li);
//     if (f) f.style.width = '100%';
//     setTimeout(() => document.getElementById('preloader')?.classList.add('done'), 350);
//   }
// }, 180);

// if (state.cad) ensureCAD();





// //// ----------- FINAL UPDATED CODE - WITOUHT ALL TURBINE COME AS SENVION Turbine  ------------

// // import * as THREE from 'three';
// // import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// // import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// // /* ================= STATE ================= */
// // const state = {
// //   wind: 8.5, explode: 0, pitch: 2, yaw: 0,
// //   model: 'offshore', env: 'day',
// //   autoRotate: true, particles: 0.7,
// //   birds: true, farm: true,
// //   colorBody: '#f4f7fa', colorAccent: '#b9c3cf',
// //   gust: 0
// // };
// // window.TURBINE = state;

// // const SENV = window.SENVION;
// // const MODELS = SENV.MODELS;
// // const CUT_OUT = SENV.CUT_OUT;

// // const defaultModel = 'm130';
// // const urlParams = new URLSearchParams(window.location.search);
// // const urlModel = urlParams.get('model');
// // if (urlModel && MODELS[urlModel]) {
// //   state.model = urlModel;
// // } else {
// //   state.model = defaultModel;
// // }

// // const PART_INFO = {
// //   blade: { title: 'Rotor Blade — SE 63.7 GFRP', desc: '63.7 m glass-fibre blade on the 130 m rotor (13,273 m² swept). Triple-row roller blade bearings cut friction and carry monsoon loads.', specs: [['Length','63.7 m'],['Rotor Ø','130 m'],['Material','GFRP']] },
// //   hub: { title: 'Hub & Pitch System', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation. Embedded safety PLC plus hot-weather control strategy.', specs: [['Pitch','DC motors'],['Control','Adaptive + safety PLC'],['Climate','to +49 °C']] },
// //   nacelle: { title: 'Nacelle — DFIG Drivetrain', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance. Hybrid active+passive liquid cooling.', specs: [['Generator','DFIG · IP54'],['Gearbox','Integral planet carrier'],['Shaft','Forged high-torque']] },
// //   tower: { title: 'Tubular Steel Tower — to 140 m', desc: 'Tubular steel tower up to 140 m hub height. Nacelle, hub and tower sealing plus ventilation designed for monsoon conditions.', specs: [['Height','to 140 m'],['Type','Tubular steel'],['Class','IEC S']] },
// //   gearbox: { title: 'Planetary Gearbox', desc: 'Planetary gearbox with an integral planet carrier, mounted low on the nacelle bedplate for a short, stiff load path from the rotor.', specs: [['Type','Planetary'],['Carrier','Integral'],['Lube','Forced oil']] },
// //   generator: { title: 'DFIG Generator', desc: 'Double-fed induction generator with frequency-converter DC link: wide speed range, separate P/Q control, tightest grid-code compliance.', specs: [['Type','DFIG · IP54'],['Cooling','Hybrid liquid'],['Control','Separate P / Q']] },
// //   drivetrain: { title: 'Bedplate, Shaft & Yaw', desc: 'Forged high-torque main shaft and gearbox sit on a fabricated bedplate, with the transformer, control cabinets and yaw drive packed around them.', specs: [['Bedplate','Fabricated steel'],['Main shaft','Forged · high-torque'],['Yaw','Electric drive']] },
// //   pitch: { title: 'Pitch Drive Unit', desc: 'DC-motor pitch with fast response and high cycle counts for load mitigation, running on a three-row roller blade bearing.', specs: [['Motor','DC'],['Bearing','3-row roller'],['Control','Safety PLC']] }
// // };

// // /* ================= RENDERER / SCENE ================= */
// // const canvas = document.getElementById('webgl');
// // const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
// // renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// // renderer.setSize(innerWidth, innerHeight, false);
// // renderer.shadowMap.enabled = true;
// // renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// // renderer.toneMapping = THREE.ACESFilmicToneMapping;
// // renderer.toneMappingExposure = 1.05;

// // const scene = new THREE.Scene();
// // scene.background = new THREE.Color('#87b5e0');
// // scene.fog = new THREE.Fog('#a8c6e4', 60, 340);

// // const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
// // camera.position.set(44, 23, 55);

// // function resizeView() {
// //   const r = renderer.domElement.getBoundingClientRect();
// //   const w = Math.max(1, Math.round(r.width || innerWidth));
// //   const h = Math.max(1, Math.round(r.height || innerHeight));
// //   renderer.setSize(w, h, false);
// //   camera.aspect = w / h;
// //   camera.updateProjectionMatrix();
// // }

// // const controls = new OrbitControls(camera, renderer.domElement);
// // controls.enableDamping = true;
// // controls.dampingFactor = 0.06;
// // controls.maxPolarAngle = Math.PI * 0.495;
// // controls.minDistance = 8;
// // controls.maxDistance = 120;
// // controls.autoRotate = true;
// // controls.autoRotateSpeed = 0.6;
// // controls.target.set(0, 18, 0);

// // const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3d2a, 0.9);
// // scene.add(hemi);
// // const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
// // sun.position.set(40, 60, 25);
// // sun.castShadow = true;
// // sun.shadow.mapSize.set(2048, 2048);
// // sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
// // sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -20;
// // scene.add(sun);
// // const rim = new THREE.DirectionalLight(0x5eead4, 0.5);
// // rim.position.set(-30, 20, -30);
// // scene.add(rim);

// // /* ================= GROUND ================= */
// // const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 1 });
// // const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 64), groundMat);
// // ground.rotation.x = -Math.PI / 2;
// // ground.receiveShadow = true;
// // scene.add(ground);

// // const padMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.9 });
// // const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.6, 32), padMat);
// // pad.position.y = 0.3; pad.receiveShadow = true;
// // scene.add(pad);

// // const grid = new THREE.GridHelper(200, 40, 0xffffff, 0xffffff);
// // grid.material.transparent = true; grid.material.opacity = 0.05;
// // grid.position.y = 0.05;
// // scene.add(grid);

// // /* ================= TURBINE BUILD ================= */
// // const turbine = new THREE.Group();
// // scene.add(turbine);

// // const bodyMat = new THREE.MeshStandardMaterial({ color: state.colorBody, roughness: 0.35, metalness: 0.15 });
// // const accentMat = new THREE.MeshStandardMaterial({ color: state.colorAccent, roughness: 0.4, metalness: 0.3 });
// // const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });

// // const steelMat = new THREE.MeshStandardMaterial({ color: 0xaab4c0, roughness: 0.32, metalness: 0.8 });
// // const gearMat = new THREE.MeshStandardMaterial({ color: 0x8792a1, roughness: 0.5, metalness: 0.6 });
// // const plateMat = new THREE.MeshStandardMaterial({ color: 0x4d5765, roughness: 0.7, metalness: 0.5 });
// // const cabMat = new THREE.MeshStandardMaterial({ color: 0xdde5ed, roughness: 0.55, metalness: 0.15 });

// // function makeTowerTexture() {
// //   const W = 16, H = 2049;
// //   const c = document.createElement('canvas'); c.width = W; c.height = H;
// //   const g = c.getContext('2d');
// //   g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, W, H);
// //   const TOP = 0.035, BOT = 0.60, N = 7;
// //   const step = (BOT - TOP) / N;
// //   g.fillStyle = 'rgb(245, 87, 82)';
// //   for (let i = 0; i < N; i++) g.fillRect(0, (TOP + i * step) * H, W, step * 0.52 * H);
// //   const t = new THREE.CanvasTexture(c);
// //   t.colorSpace = THREE.SRGBColorSpace;
// //   t.anisotropy = renderer.capabilities.getMaxAnisotropy();
// //   return t;
// // }
// // const towerH = 26;
// // const towerMat = bodyMat.clone();
// // towerMat.map = makeTowerTexture();
// // const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, towerH, 44, 1), towerMat);
// // tower.position.y = towerH / 2 + 0.6;
// // tower.castShadow = true; tower.receiveShadow = true;
// // tower.userData.part = 'tower';
// // turbine.add(tower);

// // const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.3), darkMat);
// // door.position.set(0, 1.8, 1.5); turbine.add(door);

// // const yawGroup = new THREE.Group();
// // yawGroup.position.y = towerH + 0.6;
// // turbine.add(yawGroup);

// // const brandCanvas = document.createElement('canvas');
// // brandCanvas.width = 1024; brandCanvas.height = 340;
// // const brandCtx = brandCanvas.getContext('2d');
// // const brandTex = new THREE.CanvasTexture(brandCanvas);
// // brandTex.colorSpace = THREE.SRGBColorSpace;
// // brandTex.minFilter = THREE.LinearMipmapLinearFilter;
// // brandTex.magFilter = THREE.LinearFilter;
// // brandTex.premultiplyAlpha = false;
// // brandTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// // function drawBrand(label) {
// //   const c = brandCanvas, g = brandCtx;
// //   g.clearRect(0, 0, c.width, c.height);
// //   g.textAlign = 'center';
// //   g.textBaseline = 'middle';
// //   try { g.letterSpacing = '12px'; } catch (e) {}
// //   g.fillStyle = '#ffffff';
// //   g.font = '700 165px Arial, Helvetica, sans-serif';
// //   g.fillText('SENVION', c.width / 2, 118);
// //   try { g.letterSpacing = '7px'; } catch (e) {}
// //   g.font = '700 60px Arial, Helvetica, sans-serif';
// //   g.fillText(String(label || '2.7M130').toUpperCase(), c.width / 2 + 165, 244);
// //   brandTex.needsUpdate = true;
// // }
// // const brandMat = new THREE.MeshStandardMaterial({
// //   map: brandTex,
// //   transparent: true,
// //   alphaTest: 0.1,
// //   color: 0x0f9d58,
// //   roughness: 0.4,
// //   metalness: 0,
// //   depthWrite: false,
// //   side: THREE.DoubleSide,
// //   polygonOffset: true,
// //   polygonOffsetFactor: -3,
// //   polygonOffsetUnits: -3
// // });

// // const nacelle = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.2, 6.2, 5, 0.34), bodyMat.clone());
// // nacelle.position.set(0, 1.1, -0.6);
// // nacelle.castShadow = true;
// // nacelle.userData.part = 'nacelle';
// // yawGroup.add(nacelle);

// // const labelGeo = new THREE.PlaneGeometry(3.0, 0.996);
// // for (const s of [1, -1]) {
// //   const lab = new THREE.Mesh(labelGeo, brandMat);
// //   lab.position.set(s * 1.108, -0.05, -0.4);
// //   lab.rotation.y = s * Math.PI / 2;
// //   nacelle.add(lab);
// // }
// // const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.45, metalness: 0.55 });
// // const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.3), railMat);
// // deck.position.set(0, 1.14, -2.05);
// // nacelle.add(deck);
// // const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), railMat);
// // railBar.position.set(0, 1.5, -2.68);
// // nacelle.add(railBar);
// // for (const sx of [-0.71, 0, 0.71]) {
// //   const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
// //   post.position.set(sx, 1.31, -2.68);
// //   nacelle.add(post);
// // }
// // for (const sx of [-0.71, 0.71]) {
// //   const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.3), railMat);
// //   side.position.set(sx, 1.5, -2.05);
// //   nacelle.add(side);
// //   const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), railMat);
// //   sp1.position.set(sx, 1.31, -1.45);
// //   nacelle.add(sp1);
// // }

// // const interior = new THREE.Group();
// // interior.position.copy(nacelle.position);
// // interior.visible = false;
// // yawGroup.add(interior);

// // const fit = (mesh, part) => {
// //   mesh.userData.part = part;
// //   mesh.castShadow = true; mesh.receiveShadow = true;
// //   interior.add(mesh);
// //   return mesh;
// // };
// // const ibox = (w, h, d, mat, x, y, z, part) => {
// //   const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
// //   m.position.set(x, y, z);
// //   return fit(m, part);
// // };
// // const itube = (r, len, mat, x, y, z, part, seg = 24) => {
// //   const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
// //   m.rotation.x = Math.PI / 2;
// //   m.position.set(x, y, z);
// //   return fit(m, part);
// // };

// // const yawRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.1, 10, 48), plateMat);
// // yawRing.rotation.x = Math.PI / 2; yawRing.position.y = -1.14;
// // fit(yawRing, 'drivetrain');

// // ibox(1.9, 0.14, 5.4, plateMat, 0, -1.0, -0.15, 'drivetrain');
// // ibox(0.16, 0.16, 5.4, plateMat, 0.6, -0.85, -0.15, 'drivetrain');
// // ibox(0.16, 0.16, 5.4, plateMat, -0.6, -0.85, -0.15, 'drivetrain');

// // itube(0.44, 0.4, gearMat, 0, 0, 1.95, 'drivetrain', 26);
// // itube(0.17, 2.8, steelMat, 0, 0, 1.2, 'drivetrain');

// // const gearbox = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.9, 1.3, 4, 0.1), gearMat);
// // gearbox.position.set(0, -0.02, -0.85);
// // fit(gearbox, 'gearbox');
// // itube(0.5, 0.1, gearMat, 0, -0.02, -0.18, 'gearbox', 26);
// // ibox(0.7, 0.52, 0.9, plateMat, 0, -0.67, -0.85, 'drivetrain');
// // ibox(0.5, 0.2, 0.55, cabMat, 0, 0.53, -0.7, 'gearbox');

// // itube(0.09, 0.5, steelMat, 0, -0.02, -1.75, 'drivetrain', 18);
// // itube(0.17, 0.14, gearMat, 0, -0.02, -1.52, 'drivetrain', 20);
// // const generator = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 30), gearMat);
// // generator.rotation.x = Math.PI / 2; generator.position.set(0, -0.02, -2.25);
// // fit(generator, 'generator');
// // for (const gz of [-2.6, -2.35, -2.1, -1.85]) itube(0.42, 0.05, gearMat, 0, -0.02, gz, 'generator', 30);
// // ibox(0.6, 0.54, 0.7, plateMat, 0, -0.66, -2.25, 'drivetrain');

// // ibox(0.34, 0.62, 1.0, cabMat, 0.72, -0.6, -2.3, 'drivetrain');
// // ibox(0.32, 0.6, 0.9, cabMat, 0.74, -0.61, 0.4, 'drivetrain');
// // ibox(0.3, 0.55, 1.2, cabMat, -0.76, -0.635, -1.6, 'drivetrain');
// // ibox(0.3, 0.6, 1.0, cabMat, -0.76, -0.61, 0.6, 'drivetrain');
// // ibox(1.7, 0.5, 0.22, gearMat, 0, 0.45, -2.95, 'drivetrain');

// // // hub + rotor
// // const rotor = new THREE.Group();
// // rotor.position.set(0, 1.1, 2.8);
// // yawGroup.add(rotor);
// // const accentParts = [];

// // const hubProfile = [
// //   [0.62, -0.95], [0.86, -0.80], [1.00, -0.60], [1.06, -0.35],
// //   [1.07, -0.05], [1.03, 0.25], [0.94, 0.52], [0.82, 0.75],
// //   [0.70, 0.92], [0.63, 1.02], [0.60, 1.07]
// // ];
// // const hubMat = bodyMat.clone();
// // hubMat.side = THREE.DoubleSide;
// // const hub = new THREE.Mesh(
// //   new THREE.LatheGeometry(hubProfile.map(p => new THREE.Vector2(p[0], p[1])), 56),
// //   hubMat
// // );
// // hub.rotation.x = Math.PI / 2;
// // hub.castShadow = true;
// // hub.userData.part = 'hub';
// // rotor.add(hub);

// // // ========== PHOTO-EXACT HUB NOSE - EXACT MATCH TO YOUR REFERENCE ==========

// // const hubCap = new THREE.Group();
// // hubCap.position.z = 1.07;
// // rotor.add(hubCap);

// // const noseProfile = [
// //   [0.60, 0.00],
// //   [0.58, 0.06],
// //   [0.50, 0.15],
// //   [0.32, 0.26],
// //   [0.10, 0.33],
// //   [0.00, 0.35]
// // ];
// // const noseGeo = new THREE.LatheGeometry(
// //   noseProfile.map(p => new THREE.Vector2(p[0], p[1])),
// //   64
// // );
// // const hubNose = new THREE.Mesh(noseGeo, hubMat);
// // hubNose.rotation.x = Math.PI / 2;
// // hubNose.position.z = -0.08; // <-- move dome 8cm inside hub
// // hubNose.castShadow = true;
// // hubNose.receiveShadow = true;
// // hubNose.userData.part = 'hub';
// // hubCap.add(hubNose);

// // const hubCapRim = new THREE.Mesh(
// //   new THREE.TorusGeometry(0.60, 0.028, 12, 64),
// //   hubMat
// // );
// // hubCapRim.position.z = 0.0;
// // hubCapRim.userData.part = 'hub';
// // hubCap.add(hubCapRim);


// // ///----------------------------------------------------------

// // const hubFaceRing = new THREE.Mesh(
// //   new THREE.TorusGeometry(0.44, 0.032, 10, 48),
// //   accentMat.clone()
// // );
// // hubFaceRing.position.z = 0.005;
// // hubCap.add(hubFaceRing);
// // accentParts.push(hubFaceRing);
// // // ========== END NOSE ==========

// // const hubInside = new THREE.Group();
// // rotor.add(hubInside);
// // const hubBack = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), plateMat);
// // hubBack.rotation.x = Math.PI / 2; hubBack.position.z = -0.95;
// // hubBack.userData.part = 'drivetrain';
// // hubInside.add(hubBack);
// // const hubShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 2.0, 24), steelMat);
// // hubShaft.rotation.x = Math.PI / 2; hubShaft.position.z = 0.05;
// // hubShaft.userData.part = 'drivetrain';
// // hubInside.add(hubShaft);
// // const hubCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 26), gearMat);
// // hubCollar.rotation.x = Math.PI / 2; hubCollar.position.z = -1.0;
// // hubCollar.userData.part = 'drivetrain';
// // hubInside.add(hubCollar);

// // function makeBlade(len = 13, rootR = 0.34) {
// //   const NS = 96;
// //   const NR = 26;
// //   const pos = [], idx = [], col = [];
// //   const white = new THREE.Color(0xffffff);
// //   const red = new THREE.Color(0xcf352f);
// //   const BANDS = [[0.838, 0.874], [0.903, 0.939], [0.972, 1.01]];
// //   const isRed = t => BANDS.some(b => t >= b[0] && t < b[1]);
// //   const tmp = new THREE.Color();
// //   const K = {
// //     chord: [[0, 0.95], [0.10, 1.34], [0.32, 1.20], [0.66, 0.74], [0.88, 0.38], [1, 0.16]],
// //     thick: [[0, 0.46], [0.10, 0.44], [0.32, 0.32], [0.66, 0.19], [0.88, 0.12], [1, 0.085]],
// //     twist: [[0, 16], [0.06, 12], [0.25, 6], [0.60, 2.4], [1, 0.5]],
// //     sweep: [[0, 0], [1, 0.055]]
// //   };
// //   const at = (kf, t) => {
// //     if (t <= kf[0][0]) return kf[0][1];
// //     for (let i = 0; i < kf.length - 1; i++) {
// //       const [a, va] = kf[i], [b, vb] = kf[i + 1];
// //       if (t <= b) { const u = (t - a) / (b - a); return va + (vb - va) * (u * u * (3 - 2 * u)); }
// //     }
// //     return kf[kf.length - 1][1];
// //   };
// //   const yt = (x, tr) => 5 * tr * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
// //   for (let s = 0; s <= NS; s++) {
// //     const t = s / NS;
// //     const c = at(K.chord, t), tr = at(K.thick, t);
// //     const tw = THREE.MathUtils.degToRad(at(K.twist, t));
// //     const sw = at(K.sweep, t) * len;
// //     const ct = Math.cos(tw), st = Math.sin(tw);
// //     const a = THREE.MathUtils.smoothstep(t, 0, 0.05);
// //     for (let k = 0; k < NR; k++) {
// //       const th = (k / NR) * Math.PI * 2;
// //       const xN = (1 - Math.cos(th)) / 2;
// //       const sg = th < Math.PI? 1 : -1;
// //       const ax = (0.5 - xN) * c;
// //       const ay = sg * yt(xN, tr) * c + 0.20 * c * xN * (1 - xN);
// //       const rx = rootR * Math.cos(th), rz = rootR * Math.sin(th);
// //       const ux = ax + (rx - ax) * (1 - a);
// //       const uy = ay + (rz - ay) * (1 - a);
// //       pos.push(ux * ct - uy * st - sw, t * len, ux * st + uy * ct);
// //       tmp.copy(isRed(t)? red : white);
// //       col.push(tmp.r, tmp.g, tmp.b);
// //     }
// //   }
// //   const vi = (s, k) => s * NR + (k % NR);
// //   for (let s = 0; s < NS; s++) {
// //     for (let k = 0; k < NR; k++) {
// //       const a = vi(s, k), b = vi(s, k + 1), cc = vi(s + 1, k), d = vi(s + 1, k + 1);
// //       idx.push(a, cc, b, b, cc, d);
// //     }
// //   }
// //   const rootC = pos.length / 3;
// //   pos.push(0, 0, 0); col.push(white.r, white.g, white.b);
// //   for (let k = 0; k < NR; k++) idx.push(rootC, k, (k + 1) % NR);
// //   const tipO = pos.length / 3;
// //   let mx = 0, mz = 0;
// //   for (let k = 0; k < NR; k++) { mx += pos[vi(NS, k) * 3]; mz += pos[vi(NS, k) * 3 + 2]; }
// //   pos.push(mx / NR, len, mz / NR); col.push(red.r, red.g, red.b);
// //   for (let k = 0; k < NR; k++) idx.push(tipO, vi(NS, k + 1), vi(NS, k));
// //   const geo = new THREE.BufferGeometry();
// //   geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
// //   geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
// //   geo.setIndex(idx);
// //   geo.computeVertexNormals();
// //   const m = bodyMat.clone();
// //   m.vertexColors = true;
// //   const mesh = new THREE.Mesh(geo, m);
// //   mesh.castShadow = true;
// //   mesh.userData.part = 'blade';
// //   return mesh;
// // }
// // const blades = [];
// // const bossGeo = new THREE.CylinderGeometry(0.40, 0.50, 0.55, 30);
// // const ringGeo = new THREE.TorusGeometry(0.46, 0.05, 10, 44);
// // for (let i = 0; i < 3; i++) {
// //   const pivot = new THREE.Group();
// //   const boss = new THREE.Mesh(bossGeo, bodyMat.clone());
// //   boss.position.y = 0.875; boss.castShadow = true; boss.userData.part = 'hub';
// //   pivot.add(boss);
// //   const brg = new THREE.Mesh(ringGeo, accentMat.clone());
// //   brg.rotation.x = Math.PI / 2;
// //   brg.position.y = 1.15;
// //   pivot.add(brg); accentParts.push(brg);
// //   const pitchRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 44), gearMat);
// //   pitchRing.rotation.x = Math.PI / 2;
// //   pitchRing.position.y = 0.6;
// //   pitchRing.userData.part = 'pitch';
// //   pivot.add(pitchRing);
// //   const pitchDrive = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.28, 0.32, 3, 0.06), gearMat);
// //   pitchDrive.position.set(0.3, 0.4, 0.08);
// //   pitchDrive.userData.part = 'pitch';
// //   pivot.add(pitchDrive);
// //   const b = makeBlade(13);
// //   b.position.y = 0.85;
// //   b.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4;
// //   pivot.add(b);
// //   pivot.rotation.z = (i / 3) * Math.PI * 2;
// //   pivot.userData.part = 'blade';
// //   b.userData.part = 'blade';
// //   rotor.add(pivot);
// //   blades.push(pivot);
// // }

// // const farmGroup = new THREE.Group();
// // scene.add(farmGroup);
// // function miniTurbine(x, z, s) {
// //   const g = new THREE.Group();
// //   const tm = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.5 });
// //   const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 20, 8), tm);
// //   t.position.y = 10; g.add(t);
// //   const n = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 3), tm);
// //   n.position.set(0, 20, 0); g.add(n);
// //   const r = new THREE.Group(); r.position.set(0, 20, 1.6);
// //   for (let i = 0; i < 3; i++) {
// //     const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.15), tm);
// //     bl.position.y = 4.5;
// //     const pv = new THREE.Group(); pv.add(bl); pv.rotation.z = i * 2.094;
// //     r.add(pv);
// //   }
// //   g.add(r); g.position.set(x, 0, z); g.scale.setScalar(s);
// //   g.userData.rotor = r;
// //   return g;
// // }
// // const minis = [
// //   miniTurbine(-55, -60, 1.1), miniTurbine(-85, -30, 0.9), miniTurbine(60, -70, 1.2),
// //   miniTurbine(90, -35, 0.95), miniTurbine(-40, -110, 1.3), miniTurbine(30, -120, 1.15)
// // ];
// // minis.forEach(m => farmGroup.add(m));

// // const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
// // const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
// // function makeCloud(x, y, z, s) {
// //   const g = new THREE.Group();
// //   for (let i = 0; i < 5; i++) {
// //     const b = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 12, 10), cloudMat);
// //     b.position.set(i * 2.4 - 4 + Math.random(), Math.random() * 1.2, Math.random() * 2 - 1);
// //     b.scale.y = 0.55; g.add(b);
// //   }
// //   g.position.set(x, y, z); g.scale.setScalar(s);
// //   return g;
// // }
// // const clouds = [];
// // for (let i = 0; i < 8; i++) clouds.push(makeCloud((Math.random() -.5) * 260, 38 + Math.random() * 25, -60 - Math.random() * 140, 1 + Math.random()));
// // clouds.forEach(c => cloudGroup.add(c));

// // const birdGroup = new THREE.Group(); scene.add(birdGroup);
// // const birdMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
// // const birds = [];
// // for (let i = 0; i < 7; i++) {
// //   const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(1, 0, 0)]);
// //   const l = new THREE.Line(g, birdMat);
// //   l.position.set((Math.random() -.5) * 80, 22 + Math.random() * 14, -20 - Math.random() * 40);
// //   l.userData = { ph: Math.random() * 9, sp: 0.4 + Math.random() * 0.5 };
// //   birdGroup.add(l); birds.push(l);
// // }

// // const P_COUNT = 900;
// // const pGeo = new THREE.BufferGeometry();
// // const pPos = new Float32Array(P_COUNT * 3);
// // const pSpd = new Float32Array(P_COUNT);
// // function resetP(i, randomX = false) {
// //   pPos[i * 3] = randomX? (Math.random() -.5) * 160 : -80 - Math.random() * 20;
// //   pPos[i * 3 + 1] = 1 + Math.random() * 34;
// //   pPos[i * 3 + 2] = (Math.random() -.5) * 120;
// //   pSpd[i] = 0.6 + Math.random() * 0.9;
// // }
// // for (let i = 0; i < P_COUNT; i++) resetP(i, true);
// // pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
// // const pMat = new THREE.PointsMaterial({ color: 0xbef3ff, size: 0.35, transparent: true, opacity: 0.8 });
// // const windPts = new THREE.Points(pGeo, pMat);
// // scene.add(windPts);

// // const starGeo = new THREE.BufferGeometry();
// // const starPos = new Float32Array(600 * 3);
// // for (let i = 0; i < 600; i++) {
// //   const r = 380, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
// //   starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
// //   starPos[i * 3 + 1] = r * Math.cos(ph) + 10;
// //   starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
// // }
// // starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
// // const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0 }));
// // scene.add(stars);

// // const ENVS = {
// //   day: { sky: '#cfe4f6', fog: '#e4eefa', sun: 2.4, hemi: 1.05, expo: 1.08, stars: 0, cloud: 0.9, ground: 0x4f8a4a },
// //   sunset: { sky: '#e8805a', fog: '#e8a06a', sun: 1.6, hemi: 0.55, expo: 1.0, stars: 0.15, cloud: 0.9, ground: 0x5a5a35 },
// //   night: { sky: '#040918', fog: '#0a1528', sun: 0.25,hemi: 0.25, expo: 0.85, stars: 1, cloud: 0.25, ground: 0x14241a },
// //   storm: { sky: '#3a4552', fog: '#4a5563', sun: 0.7, hemi: 0.4, expo: 0.9, stars: 0, cloud: 0.95, ground: 0x2c3a2c }
// // };
// // let envCur = {...ENVS.day };
// // function applyEnv(name) {
// //   state.env = name;
// //   const t = ENVS[name];
// //   envTarget = {...t };
// // }
// // let envTarget = {...ENVS.day };

// // const FOCUS_SCALE = 0.85;
// // const FOCUS = {
// //   overview: { pos: [44, 23, 55], tgt: [0, 18, 0] },
// //   blades: { pos: [7, 27, 15], tgt: [0, 23, 2] },
// //   nacelle: { pos: [10, 26, 11], tgt: [0, 23.5, -1] },
// //   tower: { pos: [11, 8, 18], tgt: [0, 11, 0] }
// // };
// // let camGoal = null;
// // let focusName = 'overview';
// // function focus(name) {
// //   if (!FOCUS[name]) name = 'overview';
// //   focusName = name;
// //   const k = name === 'overview'? 1 :
// //     ((MODELS[state.model] || MODELS.m130).scale || FOCUS_SCALE) / FOCUS_SCALE;
// //   camGoal = {
// //     pos: FOCUS[name].pos.map(v => +(v * k).toFixed(3)),
// //     tgt: FOCUS[name].tgt.map(v => +(v * k).toFixed(3))
// //   };
// // }

// // function powerMW(wind, rated) {
// //   return SENV.powerMW(wind, typeof rated === 'number'? rated : rated.rated);
// // }
// // let _cfKey = '', _cfVal = 0;
// // function cfOf(m) {
// //   if (_cfKey!== m.key) { _cfKey = m.key; _cfVal = SENV.capacityFactor(m); }
// //   return _cfVal;
// // }

// // const ray = new THREE.Raycaster();
// // const ptr = new THREE.Vector2();
// // let downAt = 0;
// // renderer.domElement.addEventListener('pointerdown', e => downAt = performance.now());
// // renderer.domElement.addEventListener('pointerup', e => {
// //   if (performance.now() - downAt > 250) return;
// //   const r = renderer.domElement.getBoundingClientRect();
// //   ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
// //   ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
// //   ray.setFromCamera(ptr, camera);
// //   const hits = ray.intersectObjects(turbine.children, true);
// //   for (const h of hits) {
// //     let o = h.object;
// //     while (o &&!o.userData.part) o = o.parent;
// //     if (o && o.userData.part) { showPart(o.userData.part); break; }
// //   }
// // });
// // function showPart(key) {
// //   const info = PART_INFO[key]; if (!info) return;
// //   document.getElementById('partTitle').textContent = info.title;
// //   document.getElementById('partDesc').textContent = info.desc;
// //   document.getElementById('partSpecs').innerHTML = info.specs.map(s => `<div><span>${s[0]}</span><b>${s[1]}</b></div>`).join('');
// //   document.getElementById('partCard').classList.add('show');
// // }
// // document.getElementById('partClose')?.addEventListener('click', () => document.getElementById('partCard').classList.remove('show'));

// // window.__scene = {
// //   focus, applyEnv,
// //   setModel(name) {
// //     if (!MODELS[name]) name = 'm130';
// //     state.model = name;
// //     const m = MODELS[name];
// //     turbine.scale.setScalar(m.scale);
// //     drawBrand(m.name);
// //     if (camGoal) focus(focusName);
// //     document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('featured', c.dataset.model === name));
// //     const hm = document.getElementById('hudModel'); if (hm) hm.textContent = m.name;
// //     const sr = document.getElementById('specRated'); if (sr) sr.textContent = m.rated.toFixed(1) + ' MW';
// //     const sro = document.getElementById('specRotor'); if (sro) sro.textContent = (m.rotorR * 2) + ' m';
// //     const pl = document.querySelector('.power-label span'); if (pl) pl.textContent = 'Live output (' + m.name + ')';
// //     window.dispatchEvent(new CustomEvent('senvion:model', { detail: { key: name, model: m } }));
// //   },
// //   paint(c1, c2) {
// //     state.colorBody = c1; state.colorAccent = c2;
// //     turbine.traverse(o => {
// //       if (o.isMesh && o.material && o.material.color) {
// //         const p = o.userData.part;
// //         if (p === 'tower' || p === 'nacelle' || p === 'blade' || p === 'hub') o.material.color.set(c1);
// //       }
// //     });
// //     accentParts.forEach(o => o.material.color.set(c2));
// //     const lum = new THREE.Color(c1);
// //     const L = 0.2126 * lum.r + 0.7152 * lum.g + 0.0722 * lum.b;
// //     brandMat.color.set(L > 0.25? '#0f9d58' : '#7dffb8');
// //   },
// //   gust() { state.gust = 9; }
// // };

// // const $ = id => document.getElementById(id);
// // $('windSlider')?.addEventListener('input', e => state.wind = +e.target.value);
// // $('explodeSlider')?.addEventListener('input', e => state.explode = +e.target.value / 100);
// // $('pitchSlider')?.addEventListener('input', e => state.pitch = +e.target.value);
// // $('yawSlider')?.addEventListener('input', e => state.yaw = +e.target.value);
// // $('partSlider')?.addEventListener('input', e => { state.particles = +e.target.value / 100; $('partOut').textContent = e.target.value + '%'; });
// // $('birdsToggle')?.addEventListener('change', e => state.birds = e.target.checked);
// // $('farmToggle')?.addEventListener('change', e => { state.farm = e.target.checked; farmGroup.visible = state.farm; });
// // document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => focus(b.dataset.focus)));
// // document.querySelectorAll('.modelchip').forEach(b => b.addEventListener('click', () => {
// //   window.__scene.setModel(b.dataset.model);
// //   document.querySelectorAll('.modelchip').forEach(x => x.classList.toggle('active', x === b));
// // }));
// // document.querySelectorAll('.view3d').forEach(b => b.addEventListener('click', () => {
// //   if (document.body.dataset.page === 'products') {
// //     location.href = 'lab.html?model=' + b.dataset.model;
// //     return;
// //   }
// //   window.__scene.setModel(b.dataset.model);
// //   document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
// //   focus('overview');
// // }));
// // document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => {
// //   document.querySelectorAll('.sw').forEach(x => x.classList.remove('active'));
// //   b.classList.add('active');
// //   window.__scene.paint(b.dataset.c1, b.dataset.c2);
// // }));
// // document.querySelectorAll('.env').forEach(b => b.addEventListener('click', () => {
// //   document.querySelectorAll('.env').forEach(x => x.classList.remove('active'));
// //   b.classList.add('active');
// //   applyEnv(b.dataset.env);
// //   const dn = $('dayNightBtn'); if (dn) dn.textContent = b.dataset.env === 'night'? '☀ Day mode' : '🌙 Night mode';
// // }));

// // (function syncEnvUI() {
// //   applyEnv(state.env);
// //   envCur = {...ENVS[state.env] };
// //   document.querySelectorAll('.env').forEach(x => x.classList.toggle('active', x.dataset.env === state.env));
// //   const dn = $('dayNightBtn');
// //   if (dn) dn.textContent = state.env === 'night'? '☀ Day mode' : '🌙 Night mode';
// // })();

// // const clock = new THREE.Clock();
// // let rotorAngle = 0;
// // const hudWind = $('hudWind'), hudRpm = $('hudRpm'), hudPower = $('hudPower');
// // const windOut = $('windOut'), powerFill = $('powerFill'), powerLabel = $('powerLabel');
// // const rTip = $('rTip'), rThrust = $('rThrust'), rCf = $('rCf'), rCo2 = $('rCo2');
// // const rOut = $('rOut'), rSwept = $('rSwept'), rTsr = $('rTsr'), rAep = $('rAep'), rHomes = $('rHomes');

// // function lerp(a, b, t) { return a + (b - a) * t; }

// // function animate() {
// //   requestAnimationFrame(animate);
// //   const dt = Math.min(clock.getDelta(), 0.05);
// //   const t = clock.elapsedTime;

// //   if (state.gust > 0) state.gust = Math.max(0, state.gust - dt * 3);
// //   const wind = Math.min(CUT_OUT, state.wind + state.gust + Math.sin(t * 0.7) * 0.3);

// //   const m = MODELS[state.model];
// //   const eff = Math.max(0, (wind - 3) / 9);
// //   const rpmTarget = wind < 3 || wind >= CUT_OUT? 0 : 4 + Math.min(1, eff) * 9;
// //   const omega = rpmTarget * (Math.PI * 2 / 60);
// //   rotorAngle += omega * dt;
// //   rotor.rotation.z = rotorAngle;
// //   blades.forEach(p => p.rotation.x = THREE.MathUtils.degToRad(state.pitch) * 0.4);
// //   yawGroup.rotation.y = THREE.MathUtils.degToRad(state.yaw);

// //   const e = state.explode;
// //   rotor.position.z = 2.8 + e * 6;
// //   rotor.position.y = 1.1 + e * 2;
// //   nacelle.position.z = -0.6 - e * 3;
// //   nacelle.position.y = 1.1 + e * 3.6;
// //   door.position.z = 1.5 + e * 2;
// //   hubCap.position.z = 1.07 + e * 3.2;
// //   interior.visible = e > 0.015;

// //   minis.forEach((mm, i) => { if (mm.userData.rotor) mm.userData.rotor.rotation.z += dt * (1 + eff * 3 + i * 0.1); });

// //   clouds.forEach((c, i) => {
// //     c.position.x += dt * (0.5 + wind * 0.25);
// //     if (c.position.x > 150) c.position.x = -150;
// //   });
// //   cloudGroup.visible = state.birds;

// //   birdGroup.visible = state.birds;
// //   birds.forEach(b => {
// //     b.position.x += dt * b.userData.sp * (2 + wind * 0.4);
// //     b.position.y += Math.sin(t * 3 + b.userData.ph) * dt * 1.5;
// //     if (b.position.x > 60) b.position.x = -60;
// //     b.scale.y = 1 + Math.sin(t * 10 + b.userData.ph) * 0.4;
// //   });

// //   const pVisible = state.particles;
// //   windPts.visible = pVisible > 0.02;
// //   pMat.opacity = 0.15 + pVisible * 0.7;
// //   if (windPts.visible) {
// //     const arr = pGeo.attributes.position.array;
// //     const v = (2 + wind * 2.2) * (0.3 + pVisible);
// //     for (let i = 0; i < P_COUNT; i++) {
// //       arr[i * 3] += v * dt * pSpd[i];
// //       arr[i * 3 + 1] += Math.sin(t * 2 + i) * dt * 0.6;
// //       if (arr[i * 3] > 85) resetP(i);
// //     }
// //     pGeo.attributes.position.needsUpdate = true;
// //   }

// //   for (const k of ['sun', 'hemi', 'expo', 'stars', 'cloud']) envCur[k] = lerp(envCur[k], envTarget[k], dt * 2);
// //   scene.background.lerp(new THREE.Color(envTarget.sky), dt * 2);
// //   scene.fog.color.lerp(new THREE.Color(envTarget.fog), dt * 2);
// //   sun.intensity = envCur.sun; hemi.intensity = envCur.hemi;
// //   renderer.toneMappingExposure = envCur.expo;
// //   stars.material.opacity = envCur.stars;
// //   cloudMat.opacity = envCur.cloud;
// //   groundMat.color.lerp(new THREE.Color(envTarget.ground), dt * 2);
// //   sun.color.lerp(new THREE.Color(state.env === 'sunset'? '#ffb37a' : state.env === 'night'? '#8aa4ff' : '#fff2dd'), dt * 2);

// //   if (state.env === 'storm') {
// //     camera.position.x += (Math.random() -.5) * 0.02;
// //     rotorAngle += dt * 0.8;
// //   }

// //   if (camGoal) {
// //     camera.position.lerp(new THREE.Vector3(...camGoal.pos), dt * 2.2);
// //     controls.target.lerp(new THREE.Vector3(...camGoal.tgt), dt * 2.2);
// //     if (camera.position.distanceTo(new THREE.Vector3(...camGoal.pos)) < 0.3) camGoal = null;
// //   }
// //   controls.autoRotate = state.autoRotate &&!camGoal;
// //   controls.update();

// //   const rpm = wind < SENV.CUT_IN || wind >= CUT_OUT? 0 : rpmTarget;
// //   const snap = SENV.snapshot(m, wind, rpm, cfOf(m));
// //   if (hudWind) hudWind.textContent = wind.toFixed(1);
// //   if (hudRpm) hudRpm.textContent = rpm.toFixed(1);
// //   if (hudPower) hudPower.textContent = snap.outputMW.toFixed(2);
// //   if (windOut) windOut.textContent = wind.toFixed(1) + ' m/s';
// //   if ($('explodeOut')) $('explodeOut').textContent = Math.round(state.explode * 100) + '%';
// //   if ($('pitchOut')) $('pitchOut').textContent = state.pitch + '°';
// //   if ($('yawOut')) $('yawOut').textContent = state.yaw + '°';
// //   if (powerFill) powerFill.style.width = (snap.outputMW / m.rated * 100) + '%';
// //   if (powerLabel) powerLabel.textContent = `${snap.outputMW.toFixed(2)} MW / ${snap.aepGWh.toFixed(1)} GWh·yr`;
// //   if (rOut) rOut.textContent = Math.round(snap.outputKW) + ' kW';
// //   if (rSwept) rSwept.textContent = SENV.fmt.n(snap.swept) + ' m²';
// //   if (rTip) rTip.textContent = snap.tip.toFixed(0) + ' m/s';
// //   if (rTsr) rTsr.textContent = snap.tsr.toFixed(1);
// //   if (rThrust) rThrust.textContent = snap.thrust.toFixed(0) + ' kN';
// //   if (rCf) rCf.textContent = (snap.cf * 100).toFixed(1) + ' %';
// //   if (rAep) rAep.textContent = snap.aepGWh.toFixed(2) + ' GWh';
// //   if (rHomes) rHomes.textContent = SENV.fmt.n(Math.round(snap.homes));

// //   drawChart(wind, m.rated);
// //   renderer.render(scene, camera);
// // }

// // const chart = document.getElementById('powerChart');
// // function drawChart(wind, rated) {
// //   if (!chart) return;
// //   const ctx = chart.getContext('2d');
// //   const W = chart.width, H = chart.height;
// //   ctx.clearRect(0, 0, W, H);
// //   ctx.strokeStyle = 'rgba(14,47,76,.16)';
// //   ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
// //   ctx.beginPath();
// //   for (let x = 0; x <= 20; x += 0.25) {
// //     const px = (x / 20) * W;
// //     const py = H - 8 - (powerMW(x, rated) / rated) * (H - 20);
// //     x === 0? ctx.moveTo(px, py) : ctx.lineTo(px, py);
// //   }
// //   ctx.strokeStyle = '#00874a'; ctx.lineWidth = 2; ctx.stroke();
// //   const dx = (Math.min(20, wind) / 20) * W;
// //   const dy = H - 8 - (powerMW(wind, rated) / rated) * (H - 20);
// //   ctx.fillStyle = '#0b6fb4';
// //   ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fill();
// //   ctx.fillStyle = '#e11d48';
// //   ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, 7); ctx.fill();
// // }

// // addEventListener('resize', resizeView);
// // resizeView();

// // const stageSec = document.getElementById('lab');
// // const stageMQ = matchMedia('(max-width:1500px)');
// // const STAGE_NAV = 63;
// // const STAGE_H = 0.48;
// // let stageOn = false;
// // function setStage(on) {
// //   on =!!on;
// //   if (on === stageOn) return;
// //   stageOn = on;
// //   document.body.classList.toggle('lab-view', on);
// //   dispatchEvent(new Event('resize'));
// // }
// // function measureStage() {
// //   if (!stageSec ||!stageMQ.matches) return setStage(false);
// //   const r = stageSec.getBoundingClientRect();
// //   setStage(r.top <= STAGE_NAV * 0.5 && r.bottom >= STAGE_NAV + STAGE_H * innerHeight - 8);
// // }
// // if (stageSec) {
// //   addEventListener('scroll', measureStage, { passive: true });
// //   addEventListener('resize', measureStage);
// //   if (stageMQ.addEventListener) stageMQ.addEventListener('change', measureStage);
// //   else if (stageMQ.addListener) stageMQ.addListener(measureStage);
// //   measureStage();
// // }
// // addEventListener('wheel', e => {
// //   if (stageOn && e.target === renderer.domElement) e.stopImmediatePropagation();
// // }, { capture: true, passive: true });

// // const flight = [
// //   { y: 0, pos: [26, 14, 34] }, { y: 1, pos: [-30, 18, 20] },
// //   { y: 2, pos: [8, 30, 26] }, { y: 3, pos: [-18, 10, 34] },
// //   { y: 4, pos: [30, 22, -10] }, { y: 5, pos: [20, 12, 30] }
// // ];
// // addEventListener('scroll', () => {
// //   const idx = Math.min(flight.length - 1, Math.floor(scrollY / innerHeight + 0.5));
// //   const f = flight[idx];
// //   if (f &&!camGoal && Math.abs(scrollY / innerHeight - idx) < 0.6) {}
// // }, { passive: true });

// // window.__scene.setModel(new URLSearchParams(location.search).get('model') in MODELS? new URLSearchParams(location.search).get('model') : 'm130');
// // animate();

// // let loaded = 0;
// // const li = setInterval(() => {
// //   loaded = Math.min(100, loaded + 25);
// //   const f = document.getElementById('loaderFill');
// //   if (f) f.style.width = loaded + '%';
// //   if (loaded >= 100) {
// //     clearInterval(li);
// //     setTimeout(() => document.getElementById('preloader')?.classList.add('done'), 350);
// //   }
// // }, 180);
