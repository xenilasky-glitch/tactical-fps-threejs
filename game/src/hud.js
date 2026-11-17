// hud.js — DOM HUD and menus. One job: show state, take menu input.
// All elements are created once; update() only writes text/styles.
import { WEAPONS, ORDER, GRENADES } from './weapons.js';

let els = {};
let buyOpen = false;
let onBuy = null, onStart = null, onRestart = null;

export function initHUD(callbacks) {
  onBuy = callbacks.buy; onStart = callbacks.start; onRestart = callbacks.restart;
  const root = document.getElementById('hud');
  root.innerHTML = `
  <div id="crosshair"><div class="ch-dot"></div><div class="ch-l"></div><div class="ch-r"></div><div class="ch-t"></div><div class="ch-b"></div></div>
  <div id="hitmarker">✕</div>
  <div id="topbar"><span id="score"></span><span id="timer"></span><span id="round"></span></div>
  <div id="feed"></div>
  <div id="banner"><div id="banner-title"></div><div id="banner-sub"></div></div>
  <div id="bl"><div id="hp"></div><div id="money"></div></div>
  <div id="br"><div id="ammo"></div><div id="weapon"></div><div id="gren"></div></div>
  <div id="hint"></div>
  <div id="plantbar"><div id="plantfill"></div><div id="plantlabel"></div></div>
  <div id="dmg"></div><div id="flash"></div>
  <div id="menu"><div class="panel"><h1>NEON YARD</h1><p class="sub">Round-based tactical FPS · plant or defuse the bomb</p>
  <p>WASD move · Mouse aim · Click shoot · R reload · B buy · G grenade · E plant / defuse · Ctrl crouch</p>
  <button id="startBtn">DEPLOY — CLICK TO PLAY</button>
  <p class="tiny">4 attackers vs 4 defenders · first to 5 rounds · $800 start · kills pay $300</p></div></div>
  <div id="buy"><div class="panel"><h2>BUY MENU <span id="buyMoney"></span></h2><div id="buyItems"></div>
  <p class="tiny">Click to buy · B or Esc to close · buy phase only</p></div></div>
  <div id="end"><div class="panel"><h1 id="endTitle"></h1><p id="endSub"></p><button id="againBtn">PLAY AGAIN</button></div></div>`;
  for (const id of ['crosshair','hitmarker','score','timer','round','feed','banner','banner-title','banner-sub','hp','money','ammo','weapon','gren','hint','plantbar','plantfill','plantlabel','dmg','flash','menu','buy','buyMoney','buyItems','end','endTitle','endSub','startBtn','againBtn'])
    els[id] = document.getElementById(id);
  els.startBtn.addEventListener('click', () => onStart && onStart());
  els.againBtn.addEventListener('click', () => onRestart && onRestart());
  const css = document.createElement('style');
  css.textContent = `
  #hud{position:fixed;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#e8f4f4;user-select:none}
  #crosshair{position:absolute;left:50%;top:50%;width:0;height:0}
  .ch-dot{position:absolute;left:-2px;top:-2px;width:4px;height:4px;background:#ff7a1a;border-radius:50%}
  .ch-l,.ch-r{position:absolute;top:-1px;width:9px;height:2px;background:#e8f4f4}
  .ch-l{left:-16px}.ch-r{left:7px}
  .ch-t,.ch-b{position:absolute;left:-1px;width:2px;height:9px;background:#e8f4f4}
  .ch-t{top:-16px}.ch-b{top:7px}
  #hitmarker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ff3b3b;font-size:26px;font-weight:900;opacity:0}
  #topbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:18px;background:rgba(8,16,20,.7);padding:8px 18px;border:1px solid #19c2c2;border-radius:6px;font-size:18px;font-weight:700}
  #timer{color:#ffb347}
  #feed{position:absolute;top:64px;right:16px;text-align:right;font-size:14px;line-height:1.7;color:#ffd9a0;text-shadow:0 1px 2px #000}
  #banner{position:absolute;top:22%;left:0;right:0;text-align:center;display:none}
  #banner-title{font-size:44px;font-weight:900;letter-spacing:4px;color:#ff7a1a;text-shadow:0 0 18px #ff7a1a}
  #banner-sub{font-size:18px;color:#cfe}
  #bl{position:absolute;left:18px;bottom:16px;font-size:20px;font-weight:700}
  #hp{color:#5dff8a}#money{color:#ffd24d;font-size:17px}
  #br{position:absolute;right:18px;bottom:16px;text-align:right;font-size:20px;font-weight:700}
  #ammo{font-size:30px}#weapon{color:#19c2c2;font-size:15px}#gren{font-size:14px;color:#cfe}
  #hint{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);font-size:16px;background:rgba(8,16,20,.75);padding:6px 14px;border-radius:5px}
  #plantbar{position:absolute;left:50%;bottom:160px;transform:translateX(-50%);width:260px;height:14px;background:#123;border:1px solid #19c2c2;display:none}
  #plantfill{height:100%;width:0;background:#ff7a1a}#plantlabel{text-align:center;font-size:13px;margin-top:3px}
  #dmg{position:absolute;inset:0;box-shadow:inset 0 0 90px rgba(255,0,0,.8);opacity:0}
  #flash{position:absolute;inset:0;background:#fff;opacity:0}
  .panel{pointer-events:auto;background:rgba(6,14,18,.92);border:1px solid #ff7a1a;border-radius:10px;padding:26px 34px;text-align:center;max-width:560px;margin:0 auto}
  #menu,#buy,#end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
  #menu h1{font-size:52px;letter-spacing:6px;color:#ff7a1a;margin:0;text-shadow:0 0 24px #ff7a1a}
  .sub{color:#19c2c2;font-weight:700}.tiny{color:#8aa;font-size:13px}
  button{pointer-events:auto;background:#ff7a1a;color:#111;border:0;padding:13px 26px;font-size:18px;font-weight:800;border-radius:6px;cursor:pointer}
  button:hover{background:#ffa04d}
  #buy{display:none}#end{display:none}
  .buyrow{display:flex;justify-content:space-between;gap:20px;padding:9px 12px;margin:5px 0;background:#0d1c22;border:1px solid #1d4a4a;border-radius:6px;cursor:pointer;text-align:left}
  .buyrow:hover{border-color:#ff7a1a}.buyrow b{color:#ffd24d}
  #buyItems{pointer-events:auto}`;
  document.head.appendChild(css);
}

export function isBuyOpen() { return buyOpen; }

export function toggleBuy(show, st) {
  buyOpen = show;
  els.buy.style.display = show ? 'flex' : 'none';
  if (show) renderBuy(st);
}

function renderBuy(st) {
  els.buyMoney.textContent = '· $' + st.money;
  let html = '';
  for (const k of ORDER) {
    const w = WEAPONS[k];
    const owned = !!st.loadout.weapons[k];
    html += `<div class="buyrow" data-kind="weapon" data-key="${k}"><span>${owned ? '✓ ' : ''}${w.name} — ${k === st.loadout.current ? '[equipped]' : ''}</span><b>${owned ? 'OWNED' : '$' + w.price}</b></div>`;
  }
  for (const k of Object.keys(GRENADES)) {
    const g = GRENADES[k];
    html += `<div class="buyrow" data-kind="grenade" data-key="${k}"><span>${g.name} (x${st.loadout.grenades[k] || 0}) — press G to throw ${k}</span><b>$${g.price}</b></div>`;
  }
  html += `<div class="buyrow" data-kind="select" data-key="smoke"><span>Select grenade: Smoke / Flash (click toggles)</span><b>${st.loadout.selectedGrenade.toUpperCase()}</b></div>`;
  els.buyItems.innerHTML = html;
  els.buyItems.querySelectorAll('.buyrow').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.kind === 'select') {
        st.loadout.selectedGrenade = st.loadout.selectedGrenade === 'smoke' ? 'flash' : 'smoke';
      } else onBuy && onBuy(el.dataset.kind, el.dataset.key);
      renderBuy(st);
    });
  });
}

let hitT = 0;
export function showHit(head) {
  els.hitmarker.style.opacity = 1;
  els.hitmarker.style.color = head ? '#ff3b3b' : '#fff';
  hitT = 0.12;
}

export function update(st, fps) {
  if (hitT > 0) { hitT -= 1 / 60; if (hitT <= 0) els.hitmarker.style.opacity = 0; }
  const p = st.player;
  els.score.textContent = `ATK ${st.score.atk} — ${st.score.def} DEF`;
  els.timer.textContent = st.phase === 'round' ? Math.max(0, Math.ceil(st.roundTime)) + 's' : st.phase === 'buy' ? 'BUY ' + Math.ceil(st.phaseT) + 's' : st.phase.toUpperCase();
  els.round.textContent = 'ROUND ' + st.round;
  els.hp.textContent = 'HP ' + Math.max(0, p.hp);
  els.hp.style.color = p.hp > 50 ? '#5dff8a' : p.hp > 25 ? '#ffb347' : '#ff3b3b';
  els.money.textContent = '$' + st.money + '  ·  KILLS ' + st.kills;
  const def = WEAPONS[st.loadout.current];
  const a = st.loadout.weapons[st.loadout.current];
  els.ammo.textContent = a ? (st.reloading ? 'RELOADING…' : a.mag + ' / ' + a.reserve) : '—';
  els.weapon.textContent = def.name + '  [1/2/3 switch]';
  els.gren.textContent = `Grenade: ${st.loadout.selectedGrenade} (Smoke x${st.loadout.grenades.smoke || 0} · Flash x${st.loadout.grenades.flash || 0}) — G to throw`;
  els.feed.innerHTML = st.feed.map(f => `<div>${f}</div>`).join('');
  els.dmg.style.opacity = Math.min(1, st.damageFlash || 0);
  els.flash.style.opacity = p.flashT > 0 ? Math.min(1, p.flashT) : 0;
  // Banner: show during buy / round end / match end.
  const showBanner = st.phase === 'buy' || st.phase === 'roundEnd' || st.phase === 'matchEnd';
  els.banner.style.display = showBanner ? 'block' : 'none';
  if (showBanner) { els['banner-title'].textContent = st.banner; els['banner-sub'].textContent = st.bannerSub; }
  // Context hint.
  let hint = '';
  if (st.phase === 'round' && p.alive) {
    if (st.bomb.planted) hint = '💣 Bomb planted — defend it! (' + Math.ceil(st.bomb.timer) + 's)';
    else if (st.bomb.carried) hint = 'Carry the bomb to site A or B — hold E to plant';
    else hint = 'Bomb is with a teammate — cover them';
  } else if (!p.alive && st.phase === 'round') hint = 'You are down — spectating the round';
  els.hint.textContent = hint;
  // Plant/defuse progress.
  const prog = st.planting ? st.bomb.plantT / 4 : st.defusing ? st.bomb.defuseT / 5 : 0;
  els.plantbar.style.display = prog > 0 ? 'block' : 'none';
  els.plantfill.style.width = Math.round(prog * 100) + '%';
  els.plantlabel.textContent = st.planting ? 'PLANTING…' : st.defusing ? 'DEFUSING…' : '';
  // Screens.
  els.menu.style.display = st.phase === 'menu' ? 'flex' : 'none';
  els.end.style.display = st.phase === 'matchEnd' ? 'flex' : 'none';
  if (st.phase === 'matchEnd') {
    els.endTitle.textContent = st.banner;
    els.endSub.textContent = st.bannerSub + ` · Kills ${st.kills}`;
  }
  els.crosshair.style.display = (st.phase === 'round' && p.alive) ? 'block' : 'none';
}
