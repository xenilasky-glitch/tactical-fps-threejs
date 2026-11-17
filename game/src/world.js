// world.js — NEON YARD map: geometry, AABB collision, line of sight, bot routes.
// One job: describe the arena and answer "can I stand / see here?" queries.
import * as THREE from 'three';

export const MAP = { w: 64, d: 44, wallH: 5 };

// Axis-aligned boxes: {x,z,hx,hz,h} centred at x,z with half extents hx,hz and height h.
export const COLLIDERS = [];
export const SITES = {
  A: { x: -22, z: -15, r: 5, name: 'A' },
  B: { x: 22, z: -15, r: 5, name: 'B' },
};
export const SPAWNS = {
  atk: [[-4, 18], [0, 19], [4, 18], [-8, 16]],
  def: [[-22, -12], [22, -12], [0, -14], [-10, -8]],
};

function box(x, z, hx, hz, h = MAP.wallH) {
  COLLIDERS.push({ x, z, hx, hz, h });
  return { x, z, hx, hz, h };
}

// Perimeter walls.
box(0, -MAP.d / 2, MAP.w / 2, 1);
box(0, MAP.d / 2, MAP.w / 2, 1);
box(-MAP.w / 2, 0, 1, MAP.d / 2);
box(MAP.w / 2, 0, 1, MAP.d / 2);

// Mid divider with gaps = three lanes (long left, mid centre, underpass right).
box(-14, -4, 2, 8); box(-14, 8, 2, 4);            // left block
box(2, -6, 2, 6); box(2, 6, 2, 6);               // centre block
box(16, -2, 2, 10);                               // right block
box(-6, -14, 8, 2); box(10, -14, 8, 2);          // site back walls
box(-24, -6, 4, 2); box(24, -6, 4, 2);           // site front cover
box(-28, 4, 2, 6); box(28, 4, 2, 6);             // flank walls
box(-10, 12, 3, 2); box(10, 12, 3, 2);           // spawn cover

// Crates (low cover, h=1.2 so you can see over them when standing).
export const CRATES = [
  box(-18, -10, 1.5, 1.5, 1.2), box(-12, 0, 1.5, 1.5, 1.2),
  box(8, -2, 1.5, 1.5, 1.2), box(18, -10, 1.5, 1.5, 1.2),
  box(-4, -10, 1.5, 1.5, 1.2), box(14, 8, 1.5, 1.5, 1.2),
  box(-20, 8, 1.5, 1.5, 1.2), box(0, 2, 1.5, 1.5, 1.2),
];

export function collideCircle(x, z, r, y = 1.6) {
  // Returns corrected x,z: push a circle of radius r out of every collider it overlaps.
  let px = x, pz = z;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (y > c.h) continue;
    const dx = px - c.x, dz = pz - c.z;
    const ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) px = c.x + (dx > 0 ? c.hx + r : -(c.hx + r));
      else pz = c.z + (dz > 0 ? c.hz + r : -(c.hz + r));
    }
  }
  return { x: px, z: pz };
}

export function segmentBlocked(ax, ay, az, bx, by, bz) {
  // Slab test: does segment AB cross any collider box? (y in [0,h])
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const mn = [c.x - c.hx, 0, c.z - c.hz], mx = [c.x + c.hx, c.h, c.z + c.hz];
    const o = [ax, ay, az], d = [dx, dy, dz];
    let hit = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) { hit = false; break; } }
      else {
        let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

export function hasLOS(ax, ay, az, bx, by, bz, smokes) {
  if (segmentBlocked(ax, ay, az, bx, by, bz)) return false;
  if (smokes) for (const s of smokes) {
    if (s.t > 0 && segmentHitsSphere(ax, ay, az, bx, by, bz, s.x, 1.2, s.z, 2.6)) return false;
  }
  return true;
}

function segmentHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / (len2 || 1);
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}

export function insideSite(x, z, site) {
  const dx = x - site.x, dz = z - site.z;
  return dx * dx + dz * dz < site.r * site.r;
}

// Bot routes: waypoints per lane from attacker spawn to each site.
export const ROUTES = {
  A_long: [[-4, 16], [-12, 10], [-20, 4], [-24, -4], [-22, -12]],
  A_mid: [[0, 16], [-2, 6], [-6, -2], [-12, -8], [-22, -13]],
  B_mid: [[0, 16], [4, 6], [8, -2], [14, -8], [22, -13]],
  B_under: [[4, 16], [12, 10], [20, 4], [24, -4], [22, -12]],
  holdA: [[-18, -8], [-24, -10]],
  holdB: [[18, -8], [24, -10]],
  holdMid: [[0, -6], [-4, -10]],
};

// Build the three.js scene for the yard. Returns {group, siteMarkers}.
export function buildScene() {
  const g = new THREE.Group();
  const matGround = new THREE.MeshStandardMaterial({ color: 0x1a2027, roughness: 0.9, metalness: 0.1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.d), matGround);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);

  // Lane strips (subtle colour coding: teal mid, orange long, purple underpass).
  const laneCols = [0x0e3a3a, 0x3a240e, 0x2a1a3a];
  const lanes = [[-20, 0, 8, 40], [0, 0, 8, 40], [20, 0, 8, 40]];
  for (let i = 0; i < 3; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(lanes[i][2], lanes[i][3]),
      new THREE.MeshStandardMaterial({ color: laneCols[i], roughness: 1 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(lanes[i][0], 0.02, lanes[i][1]);
    strip.receiveShadow = true; g.add(strip);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, emissive: 0x301500 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a5a1a, roughness: 0.8 });
  const geoWall = new THREE.BoxGeometry(1, 1, 1);
  for (const c of COLLIDERS) {
    const m = new THREE.Mesh(geoWall, c.h <= 1.3 ? crateMat : wallMat);
    m.scale.set(c.hx * 2, c.h, c.hz * 2);
    m.position.set(c.x, c.h / 2, c.z);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (c.h > 2) { // neon trim on tall walls
      const trim = new THREE.Mesh(new THREE.BoxGeometry(c.hx * 2 + 0.06, 0.12, c.hz * 2 + 0.06), accentMat);
      trim.position.set(c.x, c.h - 0.1, c.z); g.add(trim);
    }
  }

  // Bomb sites: glowing floor rings + letter posts.
  const markers = {};
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.4, s.r, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xff7a1a : 0x19c2c2, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.05, s.z); g.add(ring);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x662200 }));
    post.position.set(s.x, 1.5, s.z - s.r - 1); g.add(post);
    markers[key] = ring;
  }

  // Light poles.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x111418 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070 });
  for (const [x, z] of [[-28, -18], [28, -18], [-28, 18], [28, 18], [0, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), poleMat);
    pole.position.set(x, 3, z); g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMat);
    lamp.position.set(x, 6.1, z); g.add(lamp);
  }
  return { group: g, markers };
}
