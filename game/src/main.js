// main.js — bootstrap, render loop, fixed-step accumulator, input, ?shot= presets.
// One job: own the renderer and the frame; the sim owns the rules.
import * as THREE from 'three';
import { createState, startMatch, step, buy, STEP } from './sim.js';
import { buildScene, SITES } from './world.js';
import { lookDir } from './player.js';
import { initHUD, update as updateHUD, toggleBuy, isBuyOpen, showHit } from './hud.js';
import { ensureAudio, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

const state = createState(SEED);
const input = { f: false, b: false, l: false, r: false, fire: false, reload: false, use: false, grenade: false };

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d12);
scene.fog = new THREE.Fog(0x070d12, 30, 85);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 200);

scene.add(new THREE.AmbientLight(0x334455, 0.9));
const moon = new THREE.DirectionalLight(0xbfd8ff, 1.1);
moon.position.set(18, 30, 12); moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
scene.add(moon);
const warm = new THREE.PointLight(0xff7a1a, 60, 40);
warm.position.set(0, 7, -10); scene.add(warm);
const cool = new THREE.PointLight(0x19c2c2, 50, 40);
cool.position.set(0, 7, 10); scene.add(cool);

const { group } = buildScene();
scene.add(group);

// Bomb mesh + site beacon.
const bombMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2200 }));
bombMesh.visible = false; scene.add(bombMesh);
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
beacon.visible = false; scene.add(beacon);

// Gun viewmodel.
const gun = new THREE.Group();
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.55),
  new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.4, metalness: 0.7 }));
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
  new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 }));
gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, 0.02, -0.4);
gun.add(gunBody, gunBarrel);
gun.position.set(0.28, -0.24, -0.5);
camera.add(gun); scene.add(camera);

// Bot meshes: one group per bot, reused (no per-frame allocation).
const botMeshes = new Map();
const bodyGeo = new THREE.BoxGeometry(0.7, 1.0, 0.4);
const headGeo = new THREE.SphereGeometry(0.24, 10, 8);
const botMats = {
  atk: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }),
  def: new THREE.MeshStandardMaterial({ color: 0x19c2c2, roughness: 0.7 }),
};
function botMesh(b) {
  let m = botMeshes.get(b);
  if (!m) {
    m = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, botMats[b.team]);
    body.position.y = 0.9; body.castShadow = true;
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xd8b58a }));
    head.position.y = 1.62; head.castShadow = true;
    m.add(body, head); scene.add(m); botMeshes.set(b, m);
  }
  return m;
}

// Tracers + smoke puffs (pooled arrays).
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd24d, transparent: true, opacity: 0.9 });
const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
const tracerPool = [];
function drawTracers() {
  for (const t of tracerPool) t.visible = false;
  state.tracers.forEach((tr, i) => {
    let mesh = tracerPool[i];
    if (!mesh) { mesh = new THREE.Mesh(tracerGeo, tracerMat); scene.add(mesh); tracerPool[i] = mesh; }
    mesh.visible = true;
    mesh.position.set(tr.x + tr.dx * tr.len / 2, tr.y + tr.dy * tr.len / 2, tr.z + tr.dz * tr.len / 2);
    mesh.scale.set(1, 1, tr.len);
    mesh.lookAt(tr.x + tr.dx * tr.len, tr.y + tr.dy * tr.len, tr.z + tr.dz * tr.len);
  });
}
const smokeGeo = new THREE.SphereGeometry(2.6, 12, 10);
const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa5a8, transparent: true, opacity: 0.55 });
const smokePool = [];
function drawSmokes() {
  for (const s of smokePool) s.visible = false;
  state.smokes.forEach((sm, i) => {
    let mesh = smokePool[i];
    if (!mesh) { mesh = new THREE.Mesh(smokeGeo, smokeMat); scene.add(mesh); smokePool[i] = mesh; }
    mesh.visible = true; mesh.position.set(sm.x, 1.2, sm.z);
  });
}

// --- HUD + events ---
initHUD({
  start: () => { ensureAudio(); startMatch(state); lockPointer(); },
  restart: () => { const s = createState(SEED); Object.assign(state, s); state.bots = s.bots; startMatch(state); lockPointer(); },
  buy: (kind, key) => { if (buy(state, kind, key)) sfx.buy(); },
});
function lockPointer() {
  if (!SHOT) renderer.domElement.requestPointerLock?.();
}
function drainEvents() {
  for (const e of state.events) {
    if (e.type === 'shot') sfx.shot(e.kind);
    else if (e.type === 'enemyShot') sfx.enemyShot();
    else if (e.type === 'hit') showHit(e.head), sfx.hit();
    else if (e.type === 'kill') sfx.kill();
    else if (e.type === 'hurt') sfx.hurt();
    else if (e.type === 'reload') sfx.reload();
    else if (e.type === 'step') sfx.step();
    else if (e.type === 'plant' || e.type === 'beep') sfx.beep();
    else if (e.type === 'explosion') sfx.explosion();
    else if (e.type === 'buy') sfx.buy();
    else if (e.type === 'roundWin') sfx.roundWin();
    else if (e.type === 'roundLose') sfx.roundLose();
    else if (e.type === 'flash') sfx.flash();
  }
  state.events.length = 0;
}

// --- Input ---
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyB' && state.phase !== 'menu') toggleBuy(!isBuyOpen(), state);
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'KeyG') input.grenade = true;
  if (e.code === 'KeyE') input.use = true;
  if (e.code === 'Digit1') state.loadout.current = 'pistol';
  if (e.code === 'Digit2' && state.loadout.weapons.smg) state.loadout.current = 'smg';
  if (e.code === 'Digit3' && state.loadout.weapons.rifle) state.loadout.current = 'rifle';
  if (e.code === 'Digit4') state.loadout.selectedGrenade = 'smoke';
  if (e.code === 'Digit5') state.loadout.selectedGrenade = 'flash';
  if (e.code === 'Escape' && isBuyOpen()) toggleBuy(false, state);
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyR') input.reload = false;
  if (e.code === 'KeyE') input.use = false;
});
addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    ensureAudio();
    if (state.phase === 'round' && !isBuyOpen()) input.fire = true;
  }
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  state.player.yaw -= e.movementX * 0.0022;
  state.player.pitch -= e.movementY * 0.0022;
  state.player.pitch = Math.max(-1.45, Math.min(1.45, state.player.pitch));
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function readKeys() {
  input.f = !!keys['KeyW'] || !!keys['ArrowUp'];
  input.b = !!keys['KeyS'] || !!keys['ArrowDown'];
  input.l = !!keys['KeyA'] || !!keys['ArrowLeft'];
  input.r = !!keys['KeyD'] || !!keys['ArrowRight'];
  state.player.crouched = !!keys['ControlLeft'] || !!keys['KeyC'];
}

// --- ?shot= presets (deterministic, no click needed) ---
function applyShotPreset() {
  if (!SHOT) return;
  startMatch(state);
  state.phase = 'round'; state.phaseT = 0;
  const p = state.player;
  if (SHOT === 'start') {
    state.phase = 'menu';
    p.x = -2; p.z = 16; p.yaw = 0.15; p.pitch = -0.02;
  } else if (SHOT === 'play') {
    p.x = -6; p.z = 14; p.yaw = 0.05; p.pitch = 0.01;
    // Bots mid-map, visible down the long lane.
    const defs = state.bots.filter(b => b.team === 'def');
    defs[0].x = -2; defs[0].z = -2; defs[0].yaw = Math.PI;
    defs[1].x = 6; defs[1].z = -6; defs[1].yaw = Math.PI;
    defs[2].x = -8; defs[2].z = 2; defs[2].yaw = Math.PI;
    defs[3].x = 14; defs[3].z = -8; defs[3].yaw = Math.PI;
    const atks = state.bots.filter(b => b.team === 'atk');
    atks[0].x = -3; atks[0].z = 10; atks[1].x = 5; atks[1].z = 8;
    state.money = 2400;
    state.loadout.weapons.rifle = { mag: 25, reserve: 100 };
    state.loadout.current = 'rifle';
    state.loadout.grenades.smoke = 1; state.loadout.grenades.flash = 1;
  } else if (SHOT === 'end') {
    state.phase = 'roundEnd'; state.phaseT = 99;
    state.roundWinner = 'atk'; state.score.atk = 1;
    state.banner = 'ROUND WON'; state.bannerSub = 'All defenders eliminated';
    p.x = -6; p.z = 10; p.yaw = 0.05; p.pitch = -0.05;
    const defs = state.bots.filter(b => b.team === 'def');
    defs.forEach((d, i) => { d.alive = false; });
  }
}
applyShotPreset();

// --- Fixed-step loop ---
let acc = 0, last = performance.now();
const tmpDir = { x: 0, y: 0, z: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  readKeys();
  if (!SHOT || SHOT === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(state, input, STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    input.grenade = false;
    input.reload = false;
  } else if (SHOT === 'start') {
    // Slow cinematic pan over the yard on the start screen.
    state.player.yaw += dt * 0.05;
  }
  drainEvents();

  // Sync meshes from state (render only, no sim mutation).
  const p = state.player;
  camera.position.set(p.x, p.eye, p.z);
  const d = lookDir(p);
  camera.lookAt(p.x + d.x, p.eye + d.y, p.z + d.z);
  gun.position.y = -0.24 + Math.sin(state.time * 8) * 0.004 * (p.speed > 0.5 ? 1 : 0);
  gun.rotation.x = p.recoilPitch * 2;
  for (const m of botMeshes.values()) m.visible = false;
  for (const b of state.bots) {
    const m = botMesh(b);
    m.visible = b.alive;
    if (b.alive) { m.position.set(b.x, 0, b.z); m.rotation.y = b.yaw; }
  }
  bombMesh.visible = state.bomb.planted;
  beacon.visible = state.bomb.planted;
  if (state.bomb.planted) {
    bombMesh.position.set(state.bomb.x, 0.2, state.bomb.z);
    beacon.position.set(state.bomb.x, 3, state.bomb.z);
    beacon.material.opacity = 0.15 + 0.12 * Math.sin(state.time * 6);
  }
  drawTracers(); drawSmokes();
  updateHUD(state);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
