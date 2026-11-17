// bots.js — bot AI: patrol routes, hold positions, engage, plant/defuse, hear noise.
// One job: decide what each bot does this tick, given what it can see and hear.
import { hasLOS, segmentBlocked, ROUTES, SPAWNS } from './world.js';
import { shotSpread, WEAPONS } from './weapons.js';

const EYE = 1.5;
let seed = 1;
export function srand(s) { seed = s >>> 0 || 1; }
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

export function newBot(team, idx, routeName) {
  const sp = SPAWNS[team][idx % SPAWNS[team].length];
  return {
    team, idx, x: sp[0], z: sp[1], vx: 0, vz: 0, yaw: team === 'atk' ? Math.PI : 0,
    hp: 100, alive: true, route: ROUTES[routeName] || ROUTES.A_mid, wp: 0,
    state: 'route', target: null, shootCd: 0, burst: 0, burstCd: 0,
    weapon: team === 'atk' ? (idx % 2 ? 'smg' : 'rifle') : (idx % 3 ? 'rifle' : 'smg'),
    ammo: 25, reloadT: 0, hearX: 0, hearZ: 0, hearT: 0, holdT: 0, plantT: 0,
    speed: 0, flashT: 0, name: (team === 'atk' ? 'VIPER-' : 'SENTRY-') + (idx + 1),
  };
}

// Vision: range + cone + line of sight (+ smoke). Returns the enemy or null.
function canSee(b, e, smokes) {
  if (!e.alive) return false;
  const dx = e.x - b.x, dz = e.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d > 30) return false;
  const ang = Math.atan2(-dx, -dz) - b.yaw;
  let a = Math.atan2(Math.sin(ang), Math.cos(ang));
  if (Math.abs(a) > 1.15 && d > 4) return false;
  return hasLOS(b.x, EYE, b.z, e.x, EYE, e.z, smokes);
}

export function hearNoise(bots, x, z, radius) {
  for (const b of bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < radius) { b.hearX = x; b.hearZ = z; b.hearT = 2.5; }
  }
}

// Step one bot. ctx: {player, enemies, smokes, bomb, site, dt, fireBotShot, isDefusePhase}
export function stepBot(b, ctx) {
  const dt = ctx.dt;
  if (!b.alive) return;
  if (b.flashT > 0) { b.flashT -= dt; b.shootCd = Math.max(b.shootCd, 0.2); }
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = WEAPONS[b.weapon].mag; }
  if (b.shootCd > 0) b.shootCd -= dt;
  if (b.burstCd > 0) b.burstCd -= dt;
  if (b.hearT > 0) b.hearT -= dt;

  // Pick the nearest visible enemy (player counts for defenders, player+teammates for bots).
  let vis = null, visD = 1e9;
  for (const e of ctx.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < visD && canSee(b, e, ctx.smokes)) { vis = e; visD = d; }
  }
  b.target = vis;

  let tx = b.x, tz = b.z, wantMove = false, speed = 3.2;
  if (vis) {
    b.state = 'engage';
    b.yaw = Math.atan2(-(vis.x - b.x), -(vis.z - b.z));
    // Strafe a little while fighting; hold ground if very close.
    if (visD > 14) { tx = vis.x; tz = vis.z; wantMove = true; speed = 2.6; }
    else if (visD < 5) { tx = b.x - (vis.x - b.x); tz = b.z - (vis.z - b.z); wantMove = true; speed = 2.0; }
    if (b.flashT <= 0 && b.reloadT <= 0 && b.shootCd <= 0 && b.burstCd <= 0) {
      if (b.ammo <= 0) { b.reloadT = WEAPONS[b.weapon].reload; }
      else {
        b.burst = 3 + Math.floor(rnd() * 3);
        b.burstCd = 0.55 + rnd() * 0.5;
        ctx.fireBotShot(b, vis, visD);
      }
    }
  } else if (b.hearT > 0) {
    b.state = 'investigate';
    tx = b.hearX; tz = b.hearZ; wantMove = true; speed = 4.0;
    b.yaw = Math.atan2(-(tx - b.x), -(tz - b.z));
    if (Math.hypot(tx - b.x, tz - b.z) < 1.5) b.hearT = 0;
  } else if (ctx.bomb.planted && b.team === 'def') {
    b.state = 'retake';
    tx = ctx.bomb.site.x; tz = ctx.bomb.site.z; wantMove = true; speed = 4.2;
    b.yaw = Math.atan2(-(tx - b.x), -(tz - b.z));
  } else if (ctx.bomb.planted && b.team === 'atk') {
    b.state = 'guard';
    b.holdT += dt;
    if (b.holdT > 6) { // rotate to a guard spot near the site
      tx = ctx.bomb.site.x + (rnd() - 0.5) * 8; tz = ctx.bomb.site.z + (rnd() - 0.5) * 8;
      wantMove = true; speed = 3.0; b.holdT = 0;
    }
  } else if (b.team === 'def') {
    b.state = 'hold';
    const hold = b.route[b.wp % b.route.length];
    const d = Math.hypot(hold[0] - b.x, hold[1] - b.z);
    if (d > 1.2) { tx = hold[0]; tz = hold[1]; wantMove = true; speed = 2.8; }
    else { b.yaw += Math.sin(ctx.time * 0.3 + b.idx) * 0.004; b.wp = (b.wp + 1) % b.route.length; b.holdT += dt; }
  } else {
    b.state = 'route';
    const wp = b.route[b.wp % b.route.length];
    const d = Math.hypot(wp[0] - b.x, wp[1] - b.z);
    if (d < 1.5) b.wp++;
    else { tx = wp[0]; tz = wp[1]; wantMove = true; }
    b.yaw = Math.atan2(-(tx - b.x), -(tz - b.z));
  }

  if (wantMove) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
    const step = Math.min(speed * dt, d);
    let nx = b.x + (dx / d) * step, nz = b.z + (dz / d) * step;
    // Cheap collision: don't walk through walls — slide along by axis.
    if (!segmentBlocked(b.x, EYE, b.z, nx, EYE, b.z)) b.x = nx;
    if (!segmentBlocked(b.x, EYE, b.z, b.x, EYE, nz)) b.z = nz;
    b.speed = speed;
  } else b.speed = 0;
}

// Bot shooting: inaccuracy grows with distance and target movement.
export function botShotHits(b, target, dist, targetSpeed) {
  const def = WEAPONS[b.weapon];
  const spread = shotSpread(def, targetSpeed, false, 0) + dist * 0.004 + (b.flashT > 0 ? 0.2 : 0);
  const roll = rnd();
  const hitP = Math.max(0.12, 0.62 - spread * 6 - dist * 0.008);
  if (roll > hitP) return { hit: false };
  const head = rnd() < 0.18;
  return { hit: true, damage: Math.round(def.damage * (head ? def.headMul : 1) * (dist > 25 ? 0.7 : 1)), head };
}
