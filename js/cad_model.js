import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BASE = '3d_view/web_model/';
const VER = '?v=20261023';
const FILES = ['tower', 'nacelle', 'spinner', 'blade', 'cooler', 'staircase'];

export const AY = 139.025;    // rotor spin axis height (frame R)

const BLADE_OFFSET_X = 0;      // left / right
const BLADE_OFFSET_Y = 0;      // up / down
const BLADE_OFFSET_Z = 0;      // forward / backward
// =======================================================

/* ---------- canvas textures: aviation markings ---------- */
function makeTex(w, h, draw, repeatS) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

function towerTexture() {
  return makeTex(32, 2048, (g, W, H) => {
    g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, W, H);
    const TOP = 0.035, BOT = 0.60, N = 7;
    const step = (BOT - TOP) / N;
    g.fillStyle = 'rgb(245,87,82)';
    for (let i = 0; i < N; i++) g.fillRect(0, (TOP + i * step) * H, W, step * 0.52 * H);
  }, true);
}

function bladeTexture() {
  return makeTex(64, 1024, (g, W, H) => {
    g.fillStyle = '#fbfcfe'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgb(207,53,47)';
    const BANDS = [[0.838, 0.874], [0.903, 0.939], [0.972, 1.01]];
    for (const [a, b] of BANDS) {
      const y0 = (1 - Math.min(1, b)) * H, y1 = (1 - a) * H;
      g.fillRect(0, y0, W, y1 - y0);
    }
  });
}

function meshesOf(obj) {
  const out = [];
  obj.traverse(o => { if (o.isMesh) out.push(o); });
  return out;
}

/* ---------- load --------------------------------------------------------- */
export async function loadCADModel({ onProgress, envMap, anisotropy } = {}) {
  const loader = new GLTFLoader();
  const parts = {};
  let done = 0;
  await Promise.all(FILES.map(async name => {
    const gltf = await loader.loadAsync(BASE + name + '.glb' + VER);
    parts[name] = gltf.scene;
    done++;
    if (onProgress) onProgress(done / FILES.length);
  }));

  const towerTex = towerTexture();
  const bladeTex = bladeTexture();
  if (anisotropy) { towerTex.anisotropy = anisotropy; bladeTex.anisotropy = anisotropy; }

  const mats = {
    tower:  new THREE.MeshStandardMaterial({ map: towerTex, color: 0xffffff, roughness: 0.5,  metalness: 0.12 }),
    blade:  new THREE.MeshStandardMaterial({ map: bladeTex, color: 0xffffff, roughness: 0.36, metalness: 0.06 }),
    shell:  new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.4,  metalness: 0.18 }),
    cooler: new THREE.MeshStandardMaterial({ color: 0xb6c0ca, roughness: 0.5,  metalness: 0.55 }),
    steel:  new THREE.MeshStandardMaterial({ color: 0x97a3b0, roughness: 0.58, metalness: 0.62 })
  };
  if (envMap) for (const m of Object.values(mats)) { m.envMap = envMap; m.envMapIntensity = 0.8; }

  const wrap = (partName, mat, partTag) => {
    const grp = new THREE.Group();
    for (const mesh of meshesOf(parts[partName])) {
      mesh.material = mat;
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (partTag) mesh.userData.part = partTag;
      grp.add(mesh);
    }
    if (partTag) grp.userData.part = partTag;
    return grp;
  };

  /* ---------- assemble --------------------------------------------------- */
  const root = new THREE.Group();
  root.name = 'cadTurbine';

  const tower = wrap('tower', mats.tower, 'tower');
  root.add(tower);

  const staircase = wrap('staircase', mats.steel, 'staircase');
  root.add(staircase);

  const yaw = new THREE.Group();
  root.add(yaw);

  /* ---- DETAILED REAL CAD-SCALE DRIVETRAIN ASSEMBLY ---- */
  const cadDt = new THREE.Group();
  cadDt.name = 'cadDrivetrain';
  cadDt.position.set(0, AY - 0.2, 0); // Aligned with the CAD nacelle drive axis
  cadDt.visible = false;              // STRICTLY HIDDEN UNTIL EXPLODED

  const castMetalMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.44, metalness: 0.76, envMap, envMapIntensity: 0.7 });
  const darkCastMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.55, metalness: 0.70, envMap, envMapIntensity: 0.7 });
  const bronzeShaftMat = new THREE.MeshStandardMaterial({ color: 0x937856, roughness: 0.32, metalness: 0.82, envMap, envMapIntensity: 0.8 });
  const machinedSteelMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd6, roughness: 0.24, metalness: 0.92, envMap, envMapIntensity: 0.9 });
  const generatorOrangeMat = new THREE.MeshStandardMaterial({ color: 0xee7203, roughness: 0.36, metalness: 0.20, envMap, envMapIntensity: 0.6 });
  const orangeCollarMat = new THREE.MeshStandardMaterial({ color: 0xdb6500, roughness: 0.40, metalness: 0.24, envMap, envMapIntensity: 0.6 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xa9b4c0, roughness: 0.28, metalness: 0.88, envMap, envMapIntensity: 0.8 });
  const damperMat = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.85, metalness: 0.15 });

  const fitCAD = (mesh, part = 'drivetrain') => {
    mesh.userData.part = part;
    mesh.castShadow = true; mesh.receiveShadow = true;
    cadDt.add(mesh);
    return mesh;
  };

  const addCadBoltRing = (r, count, z, size = 0.05, len = 0.09, mat = machinedSteelMat, part = 'drivetrain') => {
    const geo = new THREE.CylinderGeometry(size, size, len, 8);
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2;
      const b = new THREE.Mesh(geo, mat);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(th) * r, Math.sin(th) * r, z);
      fitCAD(b, part);
    }
  };

  // 1. Rotor Flange & Bronze Forged Shaft (Positioned inside the front nose opening)
  const cadFlange = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 36), darkCastMat);
  cadFlange.rotation.x = Math.PI / 2; cadFlange.position.set(0, 0, -0.1);
  fitCAD(cadFlange, 'drivetrain');
  addCadBoltRing(1.35, 16, 0.06, 0.06, 0.12, darkCastMat, 'drivetrain');

  const cadBronzeFace = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 32), bronzeShaftMat);
  cadBronzeFace.rotation.x = Math.PI / 2; cadBronzeFace.position.set(0, 0, 0.05);
  fitCAD(cadBronzeFace, 'drivetrain');
  addCadBoltRing(0.9, 8, 0.16, 0.05, 0.1, darkCastMat, 'drivetrain');

  const cadMainShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 32), bronzeShaftMat);
  cadMainShaft.rotation.x = Math.PI / 2; cadMainShaft.position.set(0, 0, -0.9);
  fitCAD(cadMainShaft, 'drivetrain');

  // 2. Main Bearing Housing & Torque Arms (Sized within nacelle envelope)
  const cadMbCover = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.8, 36), castMetalMat);
  cadMbCover.rotation.x = Math.PI / 2; cadMbCover.position.set(0, 0, -1.8);
  fitCAD(cadMbCover, 'drivetrain');
  addCadBoltRing(1.2, 20, -1.38, 0.05, 0.08, machinedSteelMat, 'drivetrain');

  const cadTorqueShape = new THREE.Shape();
  cadTorqueShape.moveTo(-1.2, -1.0);
  cadTorqueShape.lineTo(-1.25, 0.9);
  cadTorqueShape.quadraticCurveTo(-1.0, 1.8, -0.45, 1.95);
  cadTorqueShape.lineTo(0.45, 1.95);
  cadTorqueShape.quadraticCurveTo(1.0, 1.8, 1.25, 0.9);
  cadTorqueShape.lineTo(1.2, -1.0);
  cadTorqueShape.quadraticCurveTo(0.8, -1.8, 0, -1.9);
  cadTorqueShape.quadraticCurveTo(-0.8, -1.8, -1.2, -1.0);
  const cadTorqueArm = new THREE.Mesh(
    new THREE.ExtrudeGeometry(cadTorqueShape, { depth: 0.32, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.06, bevelThickness: 0.06 }),
    castMetalMat
  );
  cadTorqueArm.position.set(0, 0, -1.95);
  fitCAD(cadTorqueArm, 'drivetrain');

  // Torque Dampers
  [[-0.8, 1.55, -1.8], [0.8, 1.55, -1.8], [0, -1.5, -1.8]].forEach(([x, y, z]) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.65, 24), darkCastMat);
    pin.rotation.x = Math.PI / 2; pin.position.set(x, y, z);
    fitCAD(pin, 'drivetrain');
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 24), machinedSteelMat);
    cap.rotation.x = Math.PI / 2; cap.position.set(x, y, z + 0.34);
    fitCAD(cap, 'drivetrain');
  });

  // 3. Multi-Stage Planetary Gearbox
  const cadGbStage1 = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.9, 36), castMetalMat);
  cadGbStage1.rotation.x = Math.PI / 2; cadGbStage1.position.set(0, 0, -2.6);
  fitCAD(cadGbStage1, 'gearbox');

  const cadGbStage2 = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 1.0, 32), castMetalMat);
  cadGbStage2.rotation.x = Math.PI / 2; cadGbStage2.position.set(0, 0, -3.55);
  fitCAD(cadGbStage2, 'gearbox');

  const cadJBox = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.72, 0.8, 3, 0.05), castMetalMat);
  cadJBox.position.set(1.15, -0.05, -3.3);
  fitCAD(cadJBox, 'gearbox');

  const cadLubeManifold = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.58, 0.55, 3, 0.05), darkCastMat);
  cadLubeManifold.position.set(1.1, -0.7, -3.4);
  fitCAD(cadLubeManifold, 'gearbox');

  const cadCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.2, -0.6, -3.6),
    new THREE.Vector3(1.3, -0.3, -3.9),
    new THREE.Vector3(1.15, -0.1, -4.1),
    new THREE.Vector3(0.85, 0.2, -4.2),
    new THREE.Vector3(0.6, 0.35, -4.1)
  ]);
  const cadPipe1 = new THREE.Mesh(new THREE.TubeGeometry(cadCurve1, 32, 0.05, 12, false), pipeMat);
  fitCAD(cadPipe1, 'gearbox');

  // 4. High-Speed Shaft, Brake Disc & Caliper
  const cadHss = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 24), machinedSteelMat);
  cadHss.rotation.x = Math.PI / 2; cadHss.position.set(0, 0, -4.3);
  fitCAD(cadHss, 'drivetrain');

  const cadBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 36), machinedSteelMat);
  cadBrake.rotation.x = Math.PI / 2; cadBrake.position.set(0, 0, -4.5);
  fitCAD(cadBrake, 'drivetrain');

  const cadCaliper = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.52, 0.36, 3, 0.04), darkCastMat);
  cadCaliper.position.set(0.78, 0.54, -4.5);
  fitCAD(cadCaliper, 'drivetrain');

  // 5. Orange DFIG Generator (Lowered and sized to stay inside the roofline)
  const cadGenCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.16, 32), orangeCollarMat);
  cadGenCollar.rotation.x = Math.PI / 2; cadGenCollar.position.set(0, 0, -5.1);
  fitCAD(cadGenCollar, 'generator');
  addCadBoltRing(0.88, 12, -5.1, 0.04, 0.12, darkCastMat, 'generator');

  const cadGenBody = new THREE.Mesh(new RoundedBoxGeometry(1.95, 1.85, 2.7, 5, 0.12), generatorOrangeMat);
  cadGenBody.position.set(0, 0.05, -6.6);
  fitCAD(cadGenBody, 'generator');

  // Fins on CAD generator
  for (let k = -7; k <= 7; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 2.5), generatorOrangeMat);
    fin.position.set(k * 0.11, 1.02, -6.6);
    fitCAD(fin, 'generator');
  }

  const cadGenBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.32), machinedSteelMat);
  cadGenBox.position.set(0, 1.12, -5.6);
  fitCAD(cadGenBox, 'generator');

  const cadFanCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.75, 30), generatorOrangeMat);
  cadFanCowl.rotation.x = Math.PI / 2; cadFanCowl.position.set(0, 0.05, -8.2);
  fitCAD(cadFanCowl, 'generator');

  // Generator base feet
  const cadGenFoot = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.32, 1.1, 3, 0.04), generatorOrangeMat);
  cadGenFoot.position.set(0, -0.95, -6.6);
  fitCAD(cadGenFoot, 'generator');

  yaw.add(cadDt);

  /* ---- Nacelle Cover & Auxiliaries ---- */
  const nacelleStatic = new THREE.Group();
  yaw.add(nacelleStatic);
  nacelleStatic.add(wrap('nacelle', mats.shell, 'nacelle'));
  nacelleStatic.add(wrap('cooler', mats.cooler, 'cooler'));

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4d0b0b });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), beaconMat);
  beacon.position.set(0, 145.4, -7.6);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), glowMat);
  beacon.add(glow);
  nacelleStatic.add(beacon);

  const rotor = new THREE.Group();
  rotor.position.set(0, AY, 0);
  yaw.add(rotor);

  const spinner = wrap('spinner', mats.shell, 'hub');
  rotor.add(spinner);

  const blades = [];
  const baseBladeMeshes = meshesOf(parts['blade']);
  
  for (let i = 0; i < 3; i++) {
    const pv = new THREE.Group();
    pv.rotation.z = (i / 3) * Math.PI * 2;
    pv.userData.part = 'blade';
    
    const pn = new THREE.Group();
    pn.position.set(BLADE_OFFSET_X, BLADE_OFFSET_Y, BLADE_OFFSET_Z);
    pv.add(pn);
    
    const bm = new THREE.Group();
    bm.userData.part = 'blade';
    baseBladeMeshes.forEach(srcMesh => {
      const m = new THREE.Mesh(srcMesh.geometry, mats.blade);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.part = 'blade';
      m.position.copy(srcMesh.position);
      m.rotation.copy(srcMesh.rotation);
      m.scale.copy(srcMesh.scale);
      bm.add(m);
    });
    
    pn.add(bm);
    rotor.add(pv);
    blades.push({ pv, pn, bm });
  }

  /* ---------- animation driver ------------------------------------------- */
  function update({ yawDeg = 0, rotorAngle = 0, pitchDeg = 0, explode = 0, t = 0, night = false } = {}) {
    yaw.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    rotor.rotation.z = -rotorAngle;

    const e = explode;

    // Interior drivetrain ONLY becomes visible when exploded > 0.005!
    cadDt.visible = e > 0.005;

    // Explode animations: lifts nacelle away and pushes rotor forward
    rotor.position.set(0, AY + e * 2.5, e * 7);
    spinner.position.z = e * 4;
    nacelleStatic.position.set(0, e * 5, -e * 4);
    staircase.position.set(e * 5, 0, 0);

    const pr = THREE.MathUtils.degToRad(pitchDeg);
    for (const b of blades) {
      b.pn.rotation.y = pr;
      b.bm.position.set(0, 0, e * 5);
    }

    const f = ((t % 1.6) / 1.6) < 0.11 ? 1 : 0;
    const k = night ? 1 : 0.5;
    beaconMat.color.setRGB(0.3 + 0.7 * f * k, 0.04, 0.04);
    glowMat.opacity = f * (night ? 0.55 : 0.22);
    glow.visible = f > 0;
  }

  function dispose() {
    root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(mats)) m.dispose();
    towerTex.dispose(); bladeTex.dispose();
  }

  return { root, yaw, rotor, spinner, nacelleStatic, staircase, blades, mats, update, dispose };
}


//// --------------------------- before nacell exploded upodate code ------------------

// import * as THREE from 'three';
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// const BASE = '3d_view/web_model/';
// const VER = '?v=20261023';
// const FILES = ['tower', 'nacelle', 'spinner', 'blade', 'cooler', 'staircase'];

// export const AY = 139.025;    // rotor spin axis height (frame R)


// const BLADE_OFFSET_X = 0;      // left / right - keep 0
// const BLADE_OFFSET_Y = 0;      // up / down - try -0.2 to 0.5 if top gap
// const BLADE_OFFSET_Z = 0;    // forward / backward - MAIN FIX, was 4.65. Try 0.0 to 0.8
// // =======================================================

// /* ---------- canvas textures: aviation markings (shared look with classic) */
// function makeTex(w, h, draw, repeatS) {
//   const c = document.createElement('canvas');
//   c.width = w; c.height = h;
//   draw(c.getContext('2d'), w, h);
//   const t = new THREE.CanvasTexture(c);
//   t.colorSpace = THREE.SRGBColorSpace;
//   t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
//   t.anisotropy = 8;
//   return t;
// }

// function towerTexture() {
//   return makeTex(32, 2048, (g, W, H) => {
//     g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, W, H);
//     const TOP = 0.035, BOT = 0.60, N = 7;
//     const step = (BOT - TOP) / N;
//     g.fillStyle = 'rgb(245,87,82)';
//     for (let i = 0; i < N; i++) g.fillRect(0, (TOP + i * step) * H, W, step * 0.52 * H);
//   }, true);
// }

// function bladeTexture() {
//   return makeTex(64, 1024, (g, W, H) => {
//     g.fillStyle = '#fbfcfe'; g.fillRect(0, 0, W, H);
//     g.fillStyle = 'rgb(207,53,47)';
//     const BANDS = [[0.838, 0.874], [0.903, 0.939], [0.972, 1.01]];
//     for (const [a, b] of BANDS) {
//       const y0 = (1 - Math.min(1, b)) * H, y1 = (1 - a) * H;
//       g.fillRect(0, y0, W, y1 - y0);
//     }
//   });
// }

// function meshesOf(obj) {
//   const out = [];
//   obj.traverse(o => { if (o.isMesh) out.push(o); });
//   return out;
// }

// /* ---------- load --------------------------------------------------------- */
// export async function loadCADModel({ onProgress, envMap, anisotropy } = {}) {
//   const loader = new GLTFLoader();
//   const parts = {};
//   let done = 0;
//   await Promise.all(FILES.map(async name => {
//     const gltf = await loader.loadAsync(BASE + name + '.glb' + VER);
//     parts[name] = gltf.scene;
//     done++;
//     if (onProgress) onProgress(done / FILES.length);
//   }));

//   const towerTex = towerTexture();
//   const bladeTex = bladeTexture();
//   if (anisotropy) { towerTex.anisotropy = anisotropy; bladeTex.anisotropy = anisotropy; }

//   const mats = {
//     tower:  new THREE.MeshStandardMaterial({ map: towerTex, color: 0xffffff, roughness: 0.5,  metalness: 0.12 }),
//     blade:  new THREE.MeshStandardMaterial({ map: bladeTex, color: 0xffffff, roughness: 0.36, metalness: 0.06 }),
//     shell:  new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.4,  metalness: 0.18 }),
//     cooler: new THREE.MeshStandardMaterial({ color: 0xb6c0ca, roughness: 0.5,  metalness: 0.55 }),
//     steel:  new THREE.MeshStandardMaterial({ color: 0x97a3b0, roughness: 0.58, metalness: 0.62 })
//   };
//   if (envMap) for (const m of Object.values(mats)) { m.envMap = envMap; m.envMapIntensity = 0.8; }

//   const wrap = (partName, mat, partTag) => {
//     const grp = new THREE.Group();
//     for (const mesh of meshesOf(parts[partName])) {
//       mesh.material = mat;
//       mesh.castShadow = true; mesh.receiveShadow = true;
//       if (partTag) mesh.userData.part = partTag;
//       grp.add(mesh);
//     }
//     if (partTag) grp.userData.part = partTag;
//     return grp;
//   };

//   /* ---------- assemble --------------------------------------------------- */
//   const root = new THREE.Group();
//   root.name = 'cadTurbine';

//   const tower = wrap('tower', mats.tower, 'tower');
//   root.add(tower);

//   const staircase = wrap('staircase', mats.steel, 'staircase');
//   root.add(staircase);

//   const yaw = new THREE.Group();
//   root.add(yaw);

//   const nacelleStatic = new THREE.Group();
//   yaw.add(nacelleStatic);
//   nacelleStatic.add(wrap('nacelle', mats.shell, 'nacelle'));
//   nacelleStatic.add(wrap('cooler', mats.cooler, 'cooler'));

//   const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4d0b0b });
//   const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), beaconMat);
//   beacon.position.set(0, 145.4, -7.6);
//   const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false });
//   const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), glowMat);
//   beacon.add(glow);
//   nacelleStatic.add(beacon);

//   const rotor = new THREE.Group();
//   rotor.position.set(0, AY, 0);
//   yaw.add(rotor);

//   const spinner = wrap('spinner', mats.shell, 'hub');
//   rotor.add(spinner);

//   const blades = [];
//   const baseBladeMeshes = meshesOf(parts['blade']);
  
//   for (let i = 0; i < 3; i++) {
//     const pv = new THREE.Group();
//     pv.rotation.z = (i / 3) * Math.PI * 2;
//     pv.userData.part = 'blade';
    
//     const pn = new THREE.Group();
//     // FIXED POSITION - THIS IS WHERE BLADE CONNECTS TO HUB
//     pn.position.set(BLADE_OFFSET_X, BLADE_OFFSET_Y, BLADE_OFFSET_Z);
//     pv.add(pn);
    
//     const bm = new THREE.Group();
//     bm.userData.part = 'blade';
//     baseBladeMeshes.forEach(srcMesh => {
//       const m = new THREE.Mesh(srcMesh.geometry, mats.blade);
//       m.castShadow = true;
//       m.receiveShadow = true;
//       m.userData.part = 'blade';
//       m.position.copy(srcMesh.position);
//       m.rotation.copy(srcMesh.rotation);
//       m.scale.copy(srcMesh.scale);
//       bm.add(m);
//     });
    
//     pn.add(bm);
//     rotor.add(pv);
//     blades.push({ pv, pn, bm });
//   }

//   /* ---------- animation driver ------------------------------------------- */
//   function update({ yawDeg = 0, rotorAngle = 0, pitchDeg = 0, explode = 0, t = 0, night = false } = {}) {
//     yaw.rotation.y = THREE.MathUtils.degToRad(yawDeg);
//     rotor.rotation.z = -rotorAngle;

//     const e = explode;
//     rotor.position.set(0, AY + e * 2.5, e * 7);
//     spinner.position.z = e * 4;
//     nacelleStatic.position.set(0, e * 5, -e * 4);
//     staircase.position.set(e * 5, 0, 0);

//     const pr = THREE.MathUtils.degToRad(pitchDeg);
//     for (const b of blades) {
//       b.pn.rotation.y = pr;
//       // FIXED: no -ROOT_Y offset, only explode on Z
//       b.bm.position.set(0, 0, e * 5);
//     }

//     const f = ((t % 1.6) / 1.6) < 0.11 ? 1 : 0;
//     const k = night ? 1 : 0.5;
//     beaconMat.color.setRGB(0.3 + 0.7 * f * k, 0.04, 0.04);
//     glowMat.opacity = f * (night ? 0.55 : 0.22);
//     glow.visible = f > 0;
//   }

//   function dispose() {
//     root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
//     for (const m of Object.values(mats)) m.dispose();
//     towerTex.dispose(); bladeTex.dispose();
//   }

//   return { root, yaw, rotor, spinner, nacelleStatic, staircase, blades, mats, update, dispose };
// }

