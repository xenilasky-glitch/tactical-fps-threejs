// weapons.js — weapon definitions, firing, reload, recoil/spread, grenades.
// One job: know every weapon's numbers and what a shot does.
export const WEAPONS = {
  pistol: { name: 'P-9 Sidearm', price: 0, auto: false, damage: 26, headMul: 3.5, rpm: 320, mag: 12, reserve: 48, reload: 1.4, spread: 0.012, moveSpread: 0.03, recoil: 0.011, range: 60 },
  smg: { name: 'VK-9 Ripper', price: 1200, auto: true, damage: 22, headMul: 3, rpm: 750, mag: 28, reserve: 112, reload: 1.9, spread: 0.02, moveSpread: 0.045, recoil: 0.009, range: 45 },
  rifle: { name: 'AR-77 Longshot', price: 2700, auto: true, damage: 34, headMul: 4, rpm: 600, mag: 25, reserve: 100, reload: 2.4, spread: 0.006, moveSpread: 0.05, recoil: 0.016, range: 80 },
};
export const ORDER = ['pistol', 'smg', 'rifle'];
export const GRENADES = {
  smoke: { name: 'Smoke', price: 300 },
  flash: { name: 'Flash', price: 250 },
};

export function newLoadout() {
  return {
    weapons: { pistol: { mag: 12, reserve: 48 } },
    current: 'pistol',
    grenades: { smoke: 0, flash: 0 },
    selectedGrenade: 'smoke',
  };
}

export function buyWeapon(loadout, key, money) {
  const w = WEAPONS[key];
  if (!w || loadout.weapons[key]) return { ok: false, money };
  if (money < w.price) return { ok: false, money };
  loadout.weapons[key] = { mag: w.mag, reserve: w.reserve };
  loadout.current = key;
  return { ok: true, money: money - w.price };
}

export function buyGrenade(loadout, key, money) {
  const g = GRENADES[key];
  if (!g || money < g.price) return { ok: false, money };
  loadout.grenades[key] = (loadout.grenades[key] || 0) + 1;
  return { ok: true, money: money - g.price };
}

// Spread grows with movement and with sustained fire; standing still and
// tapping pays off. Returns radians of angular error for this shot.
export function shotSpread(def, speed, crouched, heat) {
  let s = def.spread + heat * 0.03;
  if (speed > 0.5) s += def.moveSpread * Math.min(1, speed / 6);
  if (crouched) s *= 0.6;
  return s;
}

export function makeGrenade(kind, x, y, z, dx, dy, dz) {
  return { kind, x, y, z, vx: dx * 14, vy: dy * 14 + 4, vz: dz * 14, t: 0, landed: false };
}

export function stepGrenade(g, dt) {
  if (g.landed) { g.t += dt; return; }
  g.vy -= 18 * dt;
  g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
  if (g.y <= 0.25) { g.y = 0.25; g.landed = true; g.t = 0; }
}
