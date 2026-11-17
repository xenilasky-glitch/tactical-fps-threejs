// player.js — first-person movement: acceleration, crouch, collision, mouse look.
// One job: turn input into a position and a view direction, honestly colliding.
import { collideCircle } from './world.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;
export const RADIUS = 0.45;

export function newPlayer(x, z) {
  return {
    x, z, vx: 0, vz: 0, yaw: 0, pitch: 0, crouched: false,
    hp: 100, alive: true, eye: EYE_STAND, speed: 0,
    recoilPitch: 0, flashT: 0, stepT: 0,
  };
}

// dt in seconds. input: {f,b,l,r,crouch}. Returns horizontal speed for spread.
export function stepPlayer(p, input, dt) {
  const accel = 42, maxSpeed = p.crouched ? 2.4 : 5.6, friction = 10;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  let ax = 0, az = 0;
  if (input.f) { ax += -sy; az += -cy; }
  if (input.b) { ax += sy; az += cy; }
  if (input.l) { ax += -cy; az += sy; }
  if (input.r) { ax += cy; az += -sy; }
  const al = Math.hypot(ax, az);
  if (al > 0) { ax /= al; az /= al; p.vx += ax * accel * dt; p.vz += az * accel * dt; }
  else {
    const dec = Math.max(0, 1 - friction * dt);
    p.vx *= dec; p.vz *= dec;
    if (Math.abs(p.vx) < 0.01) p.vx = 0;
    if (Math.abs(p.vz) < 0.01) p.vz = 0;
  }
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > maxSpeed) { p.vx *= maxSpeed / sp; p.vz *= maxSpeed / sp; }
  p.speed = Math.hypot(p.vx, p.vz);
  const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
  const fixed = collideCircle(nx, nz, RADIUS, 1.6);
  p.x = fixed.x; p.z = fixed.z;
  const targetEye = p.crouched ? EYE_CROUCH : EYE_STAND;
  p.eye += (targetEye - p.eye) * Math.min(1, dt * 12);
  if (p.recoilPitch > 0) p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.25);
  if (p.flashT > 0) p.flashT -= dt;
  // Footstep timer for audio.
  p.stepT -= dt * p.speed;
  return p.speed;
}

export function lookDir(p) {
  const cp = Math.cos(p.pitch + p.recoilPitch), sp = Math.sin(p.pitch + p.recoilPitch);
  return { x: -Math.sin(p.yaw) * cp, y: sp, z: -Math.cos(p.yaw) * cp };
}
