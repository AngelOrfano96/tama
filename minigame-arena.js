// === MINI GIOCO ARENA — versione “solo arena” (IIFE) ======================
(() => {
  const Cfg = {
    roomW: 10,       // stanza unica
    roomH: 8,
    baseTimerMs: 1000,
    waveTimeCap: 60, // secondi hard-cap per wave (puoi ignorarlo all’inizio)
    petBaseSpeedDesktop: 150,
    petBaseSpeedMobile: 90,
    attackCd: 0.35,  // mossa base
    chargeCd: 1.2,   // colpo caricato
    dashCd: 2.5,
    dashIFrame: 0.20,
    baseMoveTile: 64
  };

  const EnemyTuning = {
  // velocità (più lenti del pet)
  spdMul: 0.65,                    // 65% della tua velocità base

  // attacco melee
  atkRange: 0.9,                   // distanza (in “tile” logici) per iniziare windup
  windupMs: 350,                   // “carica” prima del colpo
  swingMs: 120,                    // finestra in cui il colpo può fare danno
  recoverMs: 300,                  // recovery dopo il colpo
  cooldownMs: 700,                 // tempo minimo tra un attacco e il successivo

  // danno
  dmg: 10,                         // danno per colpo
  iframesMs: 350,                  // invulnerabilità breve per il pet dopo un colpo

  // separazione
  sepRadius: 0.55,                 // raggio sotto cui si respingono
  sepStrength: 380,                // forza “repulsione” (pixel/s)
};


  const DOM = {
    modal:  document.getElementById('arena-minigame-modal'),
    canvas: document.getElementById('arena-canvas'),
    hudBox: document.getElementById('arena-hud'),
    btnAtk: document.getElementById('arena-attack-btn'),
    btnChg: document.getElementById('arena-charge-btn'),
    btnDash:document.getElementById('arena-dash-btn'),
  };
  let ctx = DOM.canvas.getContext('2d');

  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

  // Stato principale
  const G = {
    playing: false,
    wave: 1,
    score: 0,
    timeLeft: 0,
    timerId: null,
    tile: Cfg.baseMoveTile,

    // stat pet
    atkP: 50,
    defP: 50,
    spdP: 50,
    hpMax: 100,
    hpCur: 100,

    // pet
    pet: { x: 5, y: 4, px: 0, py: 0, dirX: 0, dirY: 0, moving: false, iFrameUntil: 0,
      cdAtk: 0, cdChg: 0, cdDash: 0, facing: 'down' },

    // nemici
    enemies: [],

    // input
    keys: new Set(),
    lastT: performance.now(),
  };

  function resizeCanvas() {
    const W = Math.min(window.innerWidth, 1100);
    const H = Math.min(window.innerHeight, 700);
    // calcolo tile in modo simile al Treasure
    const raw = Math.min(W / Cfg.roomW, H / Cfg.roomH);
    const base = 16;
    let tile = Math.max(32, Math.min(128, Math.round(raw / base) * base));
    const dpr = Math.max(1, Math.round(devicePixelRatio || 1));

    DOM.canvas.width = Cfg.roomW * tile * dpr;
    DOM.canvas.height = Cfg.roomH * tile * dpr;
    DOM.canvas.style.width = `${Cfg.roomW * tile}px`;
    DOM.canvas.style.height = `${Cfg.roomH * tile}px`;

    ctx = DOM.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    G.tile = tile;
    // riallinea pet al centro stanza
    G.pet.px = G.pet.x * tile;
    G.pet.py = G.pet.y * tile;
  }

  // HUD compatto
  function syncHUD() {
    if (!DOM.hudBox) return;
    DOM.hudBox.innerHTML = `
      <div class="row"><span>Wave</span><b>#${G.wave}</b></div>
      <div class="row"><span>Punteggio</span><b>${G.score}</b></div>
      <div class="row"><span>HP</span><b>${G.hpCur} / ${G.hpMax}</b></div>
    `;
  }

  function petSpeed() {
    const base = isMobile ? Cfg.petBaseSpeedMobile : Cfg.petBaseSpeedDesktop;
    // piccola scaletta con speed_power (50 base = 1.0x; 100 = 1.25x)
    const mul = 1 + Math.max(0, (G.spdP - 50)) / 200;
    return base * mul;
  }

  // ---------- Enemy archetypes ----------
  function makeGoblin(scale = 1) {
    const hp = Math.round(60 * scale);
    return {
      type: 'goblin',
      hp, hpMax: hp,
      atkP: Math.round(55 * scale),
      defP: Math.round(45 * scale),
      spdMul: 0.9 * scale,
      x: 0, y: 0, px: 0, py: 0, cd: 0, touching: false
    };
  }
  function makeBat(scale = 1) {
    const hp = Math.round(40 * scale);
    return {
      type: 'bat',
      hp, hpMax: hp,
      atkP: Math.round(50 * scale),
      defP: Math.round(40 * scale),
      spdMul: 1.15 * scale,
      x: 0, y: 0, px: 0, py: 0, cd: 0, t: Math.random() * Math.PI * 2
    };
  }

  function randSpawn(edgeOnly = true) {
    const w = Cfg.roomW, h = Cfg.roomH;
    if (!edgeOnly) return { x: 1 + (Math.random() * (w - 2))|0, y: 1 + (Math.random() * (h - 2))|0 };
    const sides = [
      { x: 1 + (Math.random() * (w - 2))|0, y: 1 },              // top
      { x: 1 + (Math.random() * (w - 2))|0, y: h - 2 },          // bottom
      { x: 1, y: 1 + (Math.random() * (h - 2))|0 },              // left
      { x: w - 2, y: 1 + (Math.random() * (h - 2))|0 },          // right
    ];
    return sides[(Math.random() * sides.length)|0];
  }

  // ---------- Danno (formula consigliata) ----------
  function computeDamage(power, atkEff, defEff) {
    const ratio = atkEff / Math.max(1, (atkEff + defEff));
    const base = power * ratio;
    const variance = 0.9 + Math.random() * 0.2;
    const crit = (Math.random() < 0.05) ? 1.5 : 1.0;
    return Math.max(1, Math.round(base * variance * crit));
  }

  // ---------- Attacchi ----------
  function tryAttackBasic() {
    if (G.pet.cdAtk > 0) return;
    G.pet.cdAtk = Cfg.attackCd;

    // hitbox frontale di 1 tile circa
    const r = G.tile * 0.8;
    let hx = G.pet.px, hy = G.pet.py;
    if (G.pet.facing === 'right') hx += G.tile;
    if (G.pet.facing === 'left')  hx -= r;
    if (G.pet.facing === 'down')  hy += G.tile;
    if (G.pet.facing === 'up')    hy -= r;

    const power = 10; // Mossa Base
    for (const e of G.enemies) {
      if (rectOverlap(hx, hy, r, r, e.px, e.py, G.tile, G.tile)) {
        const dmg = computeDamage(power, G.atkP, e.defP);
        e.hp -= dmg;
        G.score += 1 + Math.floor(dmg / 5);
        syncHUD();
      }
    }
  }

  function tryAttackCharged() {
    if (G.pet.cdChg > 0) return;
    G.pet.cdChg = Cfg.chargeCd;

    const r = G.tile * 1.1;
    let hx = G.pet.px, hy = G.pet.py;
    if (G.pet.facing === 'right') hx += G.tile;
    if (G.pet.facing === 'left')  hx -= r;
    if (G.pet.facing === 'down')  hy += G.tile;
    if (G.pet.facing === 'up')    hy -= r;

    const power = 20;
    for (const e of G.enemies) {
      if (rectOverlap(hx, hy, r, r, e.px, e.py, G.tile, G.tile)) {
        const dmg = computeDamage(power, G.atkP, e.defP);
        e.hp -= dmg;
        // piccolo knockback
        const k = 10;
        const nx = Math.sign(e.px - G.pet.px), ny = Math.sign(e.py - G.pet.py);
        e.px += nx * k; e.py += ny * k;
        G.score += 3 + Math.floor(dmg / 4);
        syncHUD();
      }
    }
  }

  function tryDash() {
    if (G.pet.cdDash > 0) return;
    G.pet.cdDash = Cfg.dashCd;
    G.pet.iFrameUntil = performance.now() + Cfg.dashIFrame * 1000;
    // spostino un pochino il pet nella direzione
    const dist = G.tile * 0.9;
    const nx = (G.pet.facing === 'right') ? 1 : (G.pet.facing === 'left') ? -1 : 0;
    const ny = (G.pet.facing === 'down')  ? 1 : (G.pet.facing === 'up')   ? -1 : 0;
    G.pet.px += nx * dist;
    G.pet.py += ny * dist;
    // clamp ai confini dell’arena
G.pet.px = Math.max(G.tile, Math.min((Cfg.roomW-2)*G.tile, G.pet.px));
G.pet.py = Math.max(G.tile, Math.min((Cfg.roomH-2)*G.tile, G.pet.py));

  }

  // ---------- Overlap helper ----------
  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ---------- Loop ----------
  function update(dt) {
    // tick cooldowns
    G.pet.cdAtk = Math.max(0, G.pet.cdAtk - dt);
    G.pet.cdChg = Math.max(0, G.pet.cdChg - dt);
    G.pet.cdDash= Math.max(0, G.pet.cdDash - dt);

    // input → movimento
    let dx = 0, dy = 0;
    if (G.keys.has('left'))  dx -= 1;
    if (G.keys.has('right')) dx += 1;
    if (G.keys.has('up'))    dy -= 1;
    if (G.keys.has('down'))  dy += 1;
    if (dx && dy) { const inv = 1 / Math.sqrt(2); dx *= inv; dy *= inv; }
    G.pet.moving = !!(dx || dy);
    if (dx > 0) G.pet.facing = 'right';
    else if (dx < 0) G.pet.facing = 'left';
    else if (dy > 0) G.pet.facing = 'down';
    else if (dy < 0) G.pet.facing = 'up';

    const spd = petSpeed();
    G.pet.px = Math.max(G.tile, Math.min((Cfg.roomW-2)*G.tile, G.pet.px + dx * spd * dt));
    G.pet.py = Math.max(G.tile, Math.min((Cfg.roomH-2)*G.tile, G.pet.py + dy * spd * dt));

    // nemici: muoviti verso il pet + attaccare se vicini
// ---------- ENEMIES: separation + FSM attack ----------
const now = performance.now();

// 2.1) SEPARAZIONE (repulsione morbida tra nemici)
for (let i = 0; i < G.enemies.length; i++) {
  for (let j = i + 1; j < G.enemies.length; j++) {
    const a = G.enemies[i], b = G.enemies[j];
    const dx = b.px - a.px, dy = b.py - a.py;
    const dist = Math.hypot(dx, dy) || 1;
    const desired = EnemyTuning.sepRadius * G.tile; // raggio in pixel
    if (dist < desired) {
      const push = (desired - dist) / desired;      // 0..1
      const nx = dx / dist, ny = dy / dist;
      const strength = EnemyTuning.sepStrength * dt * push; // pixel
      // spingi in direzioni opposte (mezzo a testa)
      a.px -= nx * strength * 0.5;
      a.py -= ny * strength * 0.5;
      b.px += nx * strength * 0.5;
      b.py += ny * strength * 0.5;
    }
  }
}

// 2.2) AI per singolo nemico
for (const e of G.enemies) {
  // velocità: più lenti del pet
  const basePet = isMobile ? Cfg.petBaseSpeedMobile : Cfg.petBaseSpeedDesktop;
  const enemySpd = basePet * (EnemyTuning.spdMul || 0.65) * (e.spdMul || 1);

  // vettore verso il pet
  const vx = G.pet.px - e.px, vy = G.pet.py - e.py;
  const d = Math.hypot(vx, vy) || 1;
  const nx = vx / d, ny = vy / d;

  // distanza in “tile” logici (comodo per le soglie)
  const dTiles = d / G.tile;

  // clampa ai confini dell’arena (lascia un margine)
  const clampToArena = () => {
    const minX = 1 * G.tile, maxX = (Cfg.roomW - 2) * G.tile;
    const minY = 1 * G.tile, maxY = (Cfg.roomH - 2) * G.tile;
    e.px = Math.max(minX, Math.min(maxX, e.px));
    e.py = Math.max(minY, Math.min(maxY, e.py));
  };

  // helper per danno nello swing: piccola hitbox frontale rispetto al nemico
  const tryHitPetDuringSwing = () => {
    // skip se in i-frames (dash)
    if (now <= G.pet.iFrameUntil) return;

    // hitbox “fronte” nemico (mezzo tile davanti)
    const hw = G.tile * 0.7, hh = G.tile * 0.7;
    let hx = e.px, hy = e.py;
    // scegli una direzione “grossolana” dal vettore verso il pet
    const ax = Math.abs(nx), ay = Math.abs(ny);
    if (ax > ay) { // orizzontale
      if (nx > 0) hx += G.tile * 0.6; else hx -= hw;
    } else {       // verticale
      if (ny > 0) hy += G.tile * 0.6; else hy -= hh;
    }

    const hit = (
      hx < G.pet.px + (G.tile - 12) &&
      hx + hw > G.pet.px + 6 &&
      hy < G.pet.py + (G.tile - 12) &&
      hy + hh > G.pet.py + 6
    );
    if (!hit) return;

    // anti-doppio-hit nello stesso swing
    if (now - e.lastHitTs < EnemyTuning.swingMs) return;
    e.lastHitTs = now;

    const dmg = computeDamage(EnemyTuning.dmg, e.atkP || 50, G.defP || 50);
    G.hpCur = Math.max(0, G.hpCur - dmg);
    if (G.hpCur <= 0) { gameOver(); return; }
    // i-frames per il pet dopo il colpo
    G.pet.iFrameUntil = now + EnemyTuning.iframesMs;
    syncHUD();
  };

  // FSM
  switch (e.state) {
    case 'chase': {
      // muovi verso il pet, ma senza “incollarti” (fermati poco prima)
      if (dTiles > EnemyTuning.atkRange * 0.85) {
        e.px += nx * enemySpd * dt;
        e.py += ny * enemySpd * dt;
        clampToArena();
      }
      // entra in windup solo se vicino e cooldown ok
      if (dTiles <= EnemyTuning.atkRange && now >= e.nextAtkReadyTs) {
        e.state = 'windup';
        e.tState = 0;
      }
      break;
    }

    case 'windup': {
      e.tState += dt * 1000;
      // rimani fermo a “caricare”
      if (e.tState >= EnemyTuning.windupMs) {
        e.state = 'attack';
        e.tState = 0;
        // micro-impulso verso il pet per “affondare” il colpo
        e.px += nx * (G.tile * 0.25);
        e.py += ny * (G.tile * 0.25);
        clampToArena();
      }
      break;
    }

    case 'attack': {
      e.tState += dt * 1000;

      // solo durante la finestra di swing fai danno
      if (e.tState <= EnemyTuning.swingMs) {
        tryHitPetDuringSwing();
      }

      // fine attacco → recovery
      if (e.tState >= EnemyTuning.swingMs + EnemyTuning.recoverMs) {
        e.state = 'recover';
        e.tState = 0;
        e.nextAtkReadyTs = now + EnemyTuning.cooldownMs; // cooldown prima del prossimo windup
      }
      break;
    }

    case 'recover': {
      e.tState += dt * 1000;
      // piccola “indietreggiata” (facoltativa)
      e.px -= nx * enemySpd * 0.25 * dt;
      e.py -= ny * enemySpd * 0.25 * dt;
      clampToArena();

      // finita la recovery, torna a inseguire
      if (e.tState >= EnemyTuning.recoverMs * 0.6) {
        e.state = 'chase';
        e.tState = 0;
      }
      break;
    }
  }
}
for (const e of G.enemies) {
  e.px = Math.max(G.tile, Math.min((Cfg.roomW - 2) * G.tile, e.px));
  e.py = Math.max(G.tile, Math.min((Cfg.roomH - 2) * G.tile, e.py));
}

    // rimuovi morti
    G.enemies = G.enemies.filter(e => e.hp > 0);

    // wave clear?
    if (!G.enemies.length) {
      // breve interludio + wave up
      G.wave++;
      G.hpCur = Math.min(G.hpMax, Math.round(G.hpCur + G.hpMax * 0.07)); // piccola cura
      spawnWave(G.wave);
      syncHUD();
    }
  }

function render() {
  // meglio usare dimensioni visive del canvas; con la transform DPR va bene così:
  ctx.clearRect(0, 0, Cfg.roomW * G.tile, Cfg.roomH * G.tile);

  // pavimento
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, Cfg.roomW * G.tile, Cfg.roomH * G.tile);
  ctx.fillStyle = '#222';
  ctx.fillRect(G.tile, G.tile, (Cfg.roomW - 2) * G.tile, (Cfg.roomH - 2) * G.tile);

  // NEMICI
  for (const e of G.enemies) {
    // telegraph sotto al corpo
    if (e.state === 'windup') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ff4d4f';
      ctx.beginPath();
      ctx.arc(e.px + G.tile / 2, e.py + G.tile / 2, G.tile * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // corpo
    ctx.fillStyle = (e.type === 'bat') ? '#a78bfa' : '#e74c3c';
    ctx.fillRect(e.px + 8, e.py + 8, G.tile - 16, G.tile - 16);

    // barra HP
    const w = G.tile - 16;
    const hpw = Math.max(0, Math.round(w * (e.hp / e.hpMax)));
    ctx.fillStyle = '#000';
    ctx.fillRect(e.px + 8, e.py + 4, w, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(e.px + 8, e.py + 4, hpw, 3);
  }

  // PET (disegnato sopra i nemici)
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(G.pet.px + 6, G.pet.py + 6, G.tile - 12, G.tile - 12);
}



  function loop() {
    if (!G.playing) return;
    const now = performance.now();
    const dt = (now - G.lastT) / 1000;
    G.lastT = now;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Wave spawning ----------

function spawnWave(n) {
  // safety cap: evita ondate troppo dense
  const MAX_ENEMIES = 20;
  if (G.enemies.length >= MAX_ENEMIES) return;

  // scala lieve
  const scale = 1 + (n - 1) * 0.06;
  const count = 2 + Math.floor(n * 0.8);
  const bats = (n % 3 === 0) ? 1 : 0;

  // blueprint dell’ondata
  const blueprints = [];
  for (let i = 0; i < count; i++) blueprints.push(makeGoblin(scale));
  for (let i = 0; i < bats; i++)  blueprints.push(makeBat(Math.max(1, scale * 0.95)));

  const spawned = [];
  const minDist = 2.0 * G.tile;

  for (const e of blueprints) {
    // non superare il cap totale
    if (G.enemies.length + spawned.length >= MAX_ENEMIES) break;

    // prova qualche volta a trovare uno spawn lontano dal pet
    let ok = false;
    for (let tries = 0; tries < 8; tries++) {
      const s = randSpawn(true);
      const px = s.x * G.tile;
      const py = s.y * G.tile;
      if (Math.hypot(px - G.pet.px, py - G.pet.py) >= minDist) {
        e.x = s.x; e.y = s.y;
        e.px = px;  e.py = py;

        // --- campi per la FSM di combattimento ---
        e.state = 'chase';         // 'chase' | 'windup' | 'attack' | 'recover'
        e.tState = 0;              // timer stato corrente (ms)
        e.nextAtkReadyTs = 0;      // cooldown tra attacchi
        e.lastHitTs = 0;           // anti multi-hit nello stesso swing

        spawned.push(e);
        ok = true;
        break;
      }
    }
    // se dopo i tentativi non trovi un punto valido, semplicemente salta questo nemico
    if (!ok) { /* skipped spawn */ }
  }

  if (spawned.length) G.enemies.push(...spawned);
}


  // ---------- Start / End ----------
  async function startArenaMinigame() {

    // carica le stat effettive dal DB
    try {
      const { data } = await supabaseClient
        .from('pet_states')
        .select('hp_current, hp_max, attack_power, defense_power, speed_power')
        .eq('pet_id', petId)
        .single();
      if (data) {
        G.hpCur = Math.max(1, data.hp_current ?? 100);
        G.hpMax = Math.max(G.hpCur, data.hp_max ?? 100);
        G.atkP = data.attack_power ?? 50;
        G.defP = data.defense_power ?? 50;
        G.spdP = data.speed_power ?? 50;
      }
    } catch (e) { console.error('[Arena] load stats', e); }

    G.wave = 1;
    G.score = 0;
    G.enemies = []; // ✅ reset
    G.pet = { x: (Cfg.roomW/2)|0, y: (Cfg.roomH/2)|0, px:0, py:0, dirX:0, dirY:0, moving:false, iFrameUntil:0, cdAtk:0, cdChg:0, cdDash:0, facing:'down' };
    resizeCanvas();
    syncHUD();
    spawnWave(G.wave);

    DOM.modal?.classList.remove('hidden');
    G.lastT = performance.now();
    G.playing = true;
    loop();
  }

  async function gameOver() {
    G.playing = false;
    DOM.modal?.classList.add('hidden');

    // assegna reward base (tuning semplice): EXP/FUN/Gettoni
    const fun = 10 + Math.round(G.wave * 1.2);
    const exp = 10 + Math.round(G.score * 0.4);

    try {
      if (typeof window.updateFunAndExpFromMiniGame === 'function') {
        await window.updateFunAndExpFromMiniGame(fun, exp);
      }
      // leaderboard
      await supabaseClient.rpc('submit_arena_score', { p_wave: G.wave|0, p_score: G.score|0 });
      // gettoni bonus (facoltativo): 1 ogni 10 punti
      const coins = Math.floor(G.score / 10);
      if (coins > 0) await window.addGettoniSupabase?.(coins);
      await window.refreshResourcesWidget?.();
    } catch (e) {
      console.error('[Arena] end rewards', e);
    }
  }

  // Expose
  window.startArenaMinigame = startArenaMinigame;

  // ---------- Input ----------
  const keyMap = {
    ArrowLeft: 'left', a: 'left',
    ArrowRight:'right', d: 'right',
    ArrowUp:   'up',    w: 'up',
    ArrowDown: 'down',  s: 'down',
    j: 'atk', k: 'chg', ' ': 'dash'
  };
  document.addEventListener('keydown', (e) => {
    const m = keyMap[e.key];
    if (!m) return;
    e.preventDefault();
    if (!G.playing) return;
    if (m === 'atk') return tryAttackBasic();
    if (m === 'chg') return tryAttackCharged();
    if (m === 'dash') return tryDash();
    G.keys.add(m);
  });
  document.addEventListener('keyup', (e) => {
    const m = keyMap[e.key];
    if (!m) return;
    e.preventDefault();
    G.keys.delete(m);
  });

  // Mobile buttons (se li hai messi)
  DOM.btnAtk?.addEventListener('click', () => { if (G.playing) tryAttackBasic(); });
  DOM.btnChg?.addEventListener('click', () => { if (G.playing) tryAttackCharged(); });
  DOM.btnDash?.addEventListener('click', () => { if (G.playing) tryDash(); });

  window.addEventListener('resize', () => { if (G.playing) { resizeCanvas(); syncHUD(); } });
})();
