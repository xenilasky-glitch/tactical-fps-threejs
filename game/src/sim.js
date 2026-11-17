// sim.js — the single game state object and the fixed-step simulation.
// One job: own ALL mutable state and advance it by dt. Rendering never mutates.
import { newPlayer, stepPlayer, lookDir } from './player.js';
import { newBot, stepBot, botShotHits, hearNoise, srand } from './bots.js';
import { WEAPONS, ORDER, newLoadout, buyWeapon, buyGrenade, shotSpread, makeGrenade, stepGrenade } from './weapons.js';
import { SPAWNS, SITES, insideSite, hasLOS } from './world.js';

export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const STEP = 1 / 60;

let seed = 1;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

export function createState(seedValue = 1) {
  seed = seedValue >>> 0 || 1;
  srand(seedValue);
  const st = {
    time: 0, seed: seedValue,
    phase: 'menu', // menu | buy | round | roundEnd | matchEnd
    phaseT: 0, round: 1, score: { atk: 0, def: 0 },
    roundTime: ROUND_TIME, roundWinner: null, roundReason: '',
    matchWinner: null,
    player: newPlayer(SPAWNS.atk[1][0], SPAWNS.atk[1][1]),
    loadout: newLoadout(),
    money: 800, kills: 0, deaths: 0,
    bots: [], // teammates (atk) + enemies (def)
    bomb: { carried: true, planted: false, site: null, x: 0, z: 0, plantT: 0, defuseT: 0, timer: 35 },
    smokes: [], flashes: [], tracers: [], damageFlash: 0,
    feed: [], banner: '', bannerSub: '',
    fireCd: 0, reloadT: 0, heat: 0, reloading: false,
    planting: false, defusing: false,
    events: [], // {type, ...} consumed by main.js for sound/mesh effects
  };
  spawnBots(st);
  return st;
}

function spawnBots(st) {
  st.bots = [];
  const routes = ['A_long', 'A_mid', 'B_under'];
  for (let i = 0; i < 3; i++) st.bots.push(newBot('atk', i, routes[i]));
  const defRoutes = ['holdA', 'holdB', 'holdMid', 'holdA'];
  for (let i = 0; i < 4; i++) st.bots.push(newBot('def', i, defRoutes[i]));
}

export function startMatch(st) {
  st.phase = 'buy'; st.phaseT = 5; st.round = 1;
  st.score = { atk: 0, def: 0 }; st.money = 800; st.kills = 0; st.deaths = 0;
  st.matchWinner = null; st.roundWinner = null;
  resetRound(st);
  st.banner = 'MATCH START'; st.bannerSub = 'First to 5 rounds wins — plant the bomb!';
}

function resetRound(st) {
  const p = st.player;
  p.x = SPAWNS.atk[1][0]; p.z = SPAWNS.atk[1][1]; p.yaw = 0; p.pitch = 0;
  p.hp = 100; p.alive = true; p.vx = 0; p.vz = 0; p.flashT = 0;
  spawnBots(st);
  st.bomb = { carried: true, planted: false, site: null, x: 0, z: 0, plantT: 0, defuseT: 0, timer: 35 };
  st.smokes = []; st.flashes = []; st.tracers = [];
  st.roundTime = ROUND_TIME; st.fireCd = 0; st.reloadT = 0; st.heat = 0;
  st.planting = false; st.defusing = false; st.damageFlash = 0;
}

export function buy(st, kind, key) {
  if (st.phase !== 'buy') return false;
  if (kind === 'weapon') {
    const r = buyWeapon(st.loadout, key, st.money);
    if (r.ok) { st.money = r.money; st.events.push({ type: 'buy' }); return true; }
  } else {
    const r = buyGrenade(st.loadout, key, st.money);
    if (r.ok) { st.money = r.money; st.events.push({ type: 'buy' }); return true; }
  }
  return false;
}

function addFeed(st, text) {
  st.feed.unshift(text);
  if (st.feed.length > 5) st.feed.pop();
}

function endRound(st, winner, reason) {
  if (st.phase !== 'round') return;
  st.phase = 'roundEnd'; st.phaseT = 4;
  st.roundWinner = winner; st.roundReason = reason;
  st.score[winner]++;
  const won = winner === 'atk';
  if (won) { st.money += 1000; st.banner = 'ROUND WON'; }
  else { st.money += 300; st.banner = 'ROUND LOST'; }
  st.bannerSub = reason;
  st.events.push({ type: won ? 'roundWin' : 'roundLose' });
  if (st.score[winner] >= WIN_ROUNDS) {
    st.matchWinner = winner;
    st.phase = 'matchEnd';
    st.banner = won ? 'MATCH WON — NEON YARD IS YOURS' : 'MATCH LOST';
    st.bannerSub = `Final score ${st.score.atk} — ${st.score.def}`;
  }
}

// Hitscan shot from a position along a direction. Returns hit info or null.
export function rayHit(st, ox, oy, oz, dx, dy, dz, shooterTeam, range) {
  let best = null, bestT = range;
  const targets = [];
  if (shooterTeam !== 'atk') targets.push(st.player);
  for (const b of st.bots) if (b.alive && b.team !== shooterTeam) targets.push(b);
  for (const t of targets) {
    // Body box: centre y 0.9, half-height 0.8; head sphere at y 1.55, r 0.28.
    const ex = t.x, ez = t.z;
    const relX = ex - ox, relZ = ez - oz;
    const along = relX * dx + relZ * dz;
    if (along < 0 || along > range) continue;
    const perp = Math.abs(relX * dz - relZ * dx);
    if (perp > 0.55) continue;
    const yAt = oy + dy * along;
    if (yAt < 0.1 || yAt > 1.85) continue;
    // Wall between shooter and target?
    if (!hasLOS(ox, oy, oz, ex, yAt, ez, st.smokes)) continue;
    if (along < bestT) {
      bestT = along;
      best = { target: t, head: yAt > 1.35, dist: along };
    }
  }
  return best;
}

function playerShoot(st) {
  const def = WEAPONS[st.loadout.current];
  const ammo = st.loadout.weapons[st.loadout.current];
  if (!ammo || ammo.mag <= 0) { st.events.push({ type: 'dryfire' }); st.fireCd = 0.25; return; }
  ammo.mag--;
  st.fireCd = 60 / def.rpm;
  st.heat = Math.min(1, st.heat + 0.12);
  const p = st.player;
  const spread = shotSpread(def, p.speed, p.crouched, st.heat);
  const dir = lookDir(p);
  const a = (rnd() - 0.5) * 2 * spread, b = (rnd() - 0.5) * 2 * spread;
  const dx = dir.x + a, dy = dir.y + b, dz = dir.z;
  const len = Math.hypot(dx, dy, dz);
  const hit = rayHit(st, p.x, p.eye, p.z, dx / len, dy / len, dz / len, 'atk', def.range);
  st.tracers.push({ x: p.x, y: p.eye, z: p.z, dx: dx / len, dy: dy / len, dz: dz / len, len: hit ? hit.dist : def.range, t: 0.06 });
  hearNoise(st.bots, p.x, p.z, 26);
  st.events.push({ type: 'shot', kind: st.loadout.current });
  p.recoilPitch += def.recoil * (p.crouched ? 0.7 : 1);
  if (hit) {
    const dmg = Math.round(def.damage * (hit.head ? def.headMul : 1));
    hit.target.hp -= dmg;
    st.events.push({ type: 'hit', head: hit.head });
    if (hit.target.hp <= 0) {
      hit.target.hp = 0; hit.target.alive = false;
      const name = hit.target.name || 'BOT';
      addFeed(st, `YOU ✕ ${name}${hit.head ? ' (HEADSHOT)' : ''}`);
      st.kills++; st.money += 300;
      st.events.push({ type: 'kill' });
    }
  }
}

function botShoot(st, b, target, dist) {
  const def = WEAPONS[b.weapon];
  if (b.ammo <= 0) { b.reloadT = def.reload; return; }
  b.ammo--; b.shootCd = 60 / def.rpm * 1.4;
  const r = botShotHits(b, target, dist, target.speed || 0);
  const fromY = 1.5;
  st.tracers.push({ x: b.x, y: fromY, z: b.z, dx: (target.x - b.x) / (dist || 1), dy: (1.2 - fromY) / (dist || 1), dz: (target.z - b.z) / (dist || 1), len: dist, t: 0.06 });
  hearNoise(st.bots, b.x, b.z, 20);
  st.events.push({ type: 'enemyShot' });
  if (!r.hit) return;
  target.hp -= r.damage;
  if (target === st.player) {
    st.damageFlash = 0.6;
    st.events.push({ type: 'hurt' });
    if (st.player.hp <= 0) {
      st.player.hp = 0; st.player.alive = false; st.deaths++;
      addFeed(st, `${b.name} ✕ YOU`);
    }
  } else if (target.hp <= 0) {
    target.hp = 0; target.alive = false;
    addFeed(st, `${b.name} ✕ ${target.name || 'BOT'}`);
  }
}

function throwGrenade(st, kind) {
  const n = st.loadout.grenades[kind] || 0;
  if (n <= 0) return;
  st.loadout.grenades[kind] = n - 1;
  const p = st.player;
  const dir = lookDir(p);
  st.flashes.push(kind === 'smoke'
    ? { ...makeGrenade('smoke', p.x, p.eye, p.z, dir.x, dir.y, dir.z), t: 0 }
    : { ...makeGrenade('flash', p.x, p.eye, p.z, dir.x, dir.y, dir.z), t: 0 });
  st.events.push({ type: 'throw' });
}

export function step(st, input, dt) {
  st.time += dt;
  // Decay tracers / damage flash always.
  for (const t of st.tracers) t.t -= dt;
  st.tracers = st.tracers.filter(t => t.t > 0);
  if (st.damageFlash > 0) st.damageFlash -= dt;

  if (st.phase === 'buy') {
    st.phaseT -= dt;
    if (st.phaseT <= 0) { st.phase = 'round'; st.banner = `ROUND ${st.round}`; st.bannerSub = 'Plant the bomb at A or B'; }
    return;
  }
  if (st.phase === 'roundEnd') {
    st.phaseT -= dt;
    if (st.phaseT <= 0) {
      if (st.matchWinner) { st.phase = 'matchEnd'; return; }
      st.round++; resetRound(st); st.phase = 'buy'; st.phaseT = 5;
      st.banner = 'BUY PHASE'; st.bannerSub = 'Press B to buy — round starts soon';
    }
    return;
  }
  if (st.phase !== 'round') return;

  st.roundTime -= dt;
  if (st.roundTime <= 0) {
    endRound(st, st.bomb.planted ? 'def' : 'def', st.bomb.planted ? 'Time expired — bomb did not explode' : 'Time expired — bomb never planted');
    return;
  }
  if (st.bomb.planted) {
    st.bomb.timer -= dt;
    if (Math.floor(st.bomb.timer) !== Math.floor(st.bomb.timer + dt)) st.events.push({ type: 'beep' });
    if (st.bomb.timer <= 0) {
      st.events.push({ type: 'explosion' });
      endRound(st, 'atk', 'Bomb detonated at site ' + st.bomb.site.name);
      return;
    }
  }

  // --- Player ---
  const p = st.player;
  if (p.alive) {
    stepPlayer(p, input, dt);
    if (p.stepT <= 0 && p.speed > 1) { p.stepT = 0.45; st.events.push({ type: 'step' }); }
    st.heat = Math.max(0, st.heat - dt * 0.8);
    if (st.fireCd > 0) st.fireCd -= dt;
    if (st.reloadT > 0) {
      st.reloadT -= dt;
      if (st.reloadT <= 0) {
        const def = WEAPONS[st.loadout.current];
        const a = st.loadout.weapons[st.loadout.current];
        const need = def.mag - a.mag, take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take; st.reloading = false;
      }
    }
    if (input.fire && st.fireCd <= 0 && st.reloadT <= 0) playerShoot(st);
    if (input.reload && st.reloadT <= 0) {
      const def = WEAPONS[st.loadout.current];
      const a = st.loadout.weapons[st.loadout.current];
      if (a.mag < def.mag && a.reserve > 0) { st.reloadT = def.reload; st.reloading = true; st.events.push({ type: 'reload' }); }
    }
    if (input.grenade) {
      throwGrenade(st, st.loadout.selectedGrenade);
      input.grenade = false;
    }
    // Plant / defuse (hold E).
    const site = insideSite(p.x, p.z, SITES.A) ? SITES.A : insideSite(p.x, p.z, SITES.B) ? SITES.B : null;
    if (input.use && site && st.bomb.carried && !st.bomb.planted) {
      st.planting = true; st.bomb.plantT += dt;
      if (Math.floor(st.bomb.plantT * 2) !== Math.floor((st.bomb.plantT - dt) * 2)) st.events.push({ type: 'plant' });
      if (st.bomb.plantT >= 4) {
        st.bomb.planted = true; st.bomb.site = site; st.bomb.x = p.x; st.bomb.z = p.z;
        st.bomb.carried = false; st.planting = false; st.bomb.plantT = 0;
        addFeed(st, 'BOMB PLANTED at site ' + site.name);
        st.events.push({ type: 'plant' });
      }
    } else if (input.use && st.bomb.planted && site === st.bomb.site) {
      st.defusing = true; st.bomb.defuseT += dt;
      if (st.bomb.defuseT >= 5) {
        st.bomb.planted = false; st.bomb.defuseT = 0; st.defusing = false;
        addFeed(st, 'BOMB DEFUSED');
        endRound(st, 'def', 'Bomb defused');
        return;
      }
    } else { st.planting = false; st.defusing = false; if (!st.bomb.planted) st.bomb.plantT = 0; st.bomb.defuseT = 0; }
  }

  // --- Grenades ---
  for (const g of st.flashes) {
    stepGrenade(g, dt);
    if (g.landed && g.t > 0.3 && !g.done) {
      g.done = true;
      if (g.kind === 'smoke') st.smokes.push({ x: g.x, z: g.z, t: 12 });
      else {
        st.events.push({ type: 'flash' });
        const all = [st.player, ...st.bots];
        for (const e of all) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - g.x, e.z - g.z);
          if (d < 18 && hasLOS(g.x, 1, g.z, e.x, 1.5, e.z, null)) e.flashT = Math.max(0.4, 2.5 - d * 0.1);
        }
      }
    }
  }
  st.flashes = st.flashes.filter(g => !(g.done && g.kind === 'flash'));
  for (const s of st.smokes) s.t -= dt;
  st.smokes = st.smokes.filter(s => s.t > 0);

  // --- Bots ---
  const enemiesOf = (b) => b.team === 'atk'
    ? [...st.bots.filter(o => o.team === 'def'), st.player]
    : [...st.bots.filter(o => o.team === 'atk')];
  // Teammate bots plant the bomb if the player is dead or slow: first alive
  // attacker bot at a site plants after reaching it.
  for (const b of st.bots) {
    if (!b.alive) continue;
    const ctx = {
      dt, time: st.time, smokes: st.smokes, bomb: st.bomb,
      enemies: enemiesOf(b).filter(e => e.alive),
      fireBotShot: (bot, tgt, d) => botShoot(st, bot, tgt, d),
    };
    stepBot(b, ctx);
  }
  // Bot plant: attacker bot standing in a site for a while plants.
  if (st.bomb.carried && !st.bomb.planted) {
    for (const b of st.bots) {
      if (!b.alive || b.team !== 'atk') continue;
      const site = insideSite(b.x, b.z, SITES.A) ? SITES.A : insideSite(b.x, b.z, SITES.B) ? SITES.B : null;
      if (site) {
        b.plantT += dt;
        if (b.plantT >= 4) {
          st.bomb.planted = true; st.bomb.site = site; st.bomb.x = b.x; st.bomb.z = b.z;
          st.bomb.carried = false;
          addFeed(st, `${b.name} planted the bomb at ${site.name}`);
          break;
        }
      } else b.plantT = 0;
    }
  }
  // Bot defuse: defender bot at planted site defuses.
  if (st.bomb.planted) {
    for (const b of st.bots) {
      if (!b.alive || b.team !== 'def') continue;
      if (Math.hypot(b.x - st.bomb.x, b.z - st.bomb.z) < 2) {
        b.plantT += dt;
        if (b.plantT >= 5) {
          st.bomb.planted = false; addFeed(st, `${b.name} defused the bomb`);
          endRound(st, 'def', 'Bomb defused by defenders');
          return;
        }
      } else b.plantT = 0;
    }
  }

  // Round end by elimination.
  const atkAlive = st.bots.filter(b => b.team === 'atk' && b.alive).length + (p.alive ? 1 : 0);
  const defAlive = st.bots.filter(b => b.team === 'def' && b.alive).length;
  if (defAlive === 0 && !st.bomb.planted) endRound(st, 'atk', 'All defenders eliminated');
  else if (atkAlive === 0) endRound(st, 'def', st.bomb.planted ? 'All attackers eliminated' : 'All attackers eliminated');
}

export { ORDER, WEAPONS };
