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
    const now = performance.now();
    for (const e of G.enemies) {
      const vx = G.pet.px - e.px, vy = G.pet.py - e.py;
      const d = Math.hypot(vx, vy) || 1;
      const nx = vx / d, ny = vy / d;

      const enemySpd = (isMobile ? Cfg.petBaseSpeedMobile : Cfg.petBaseSpeedDesktop) * (e.spdMul || 1);
      e.px += nx * enemySpd * dt;
      e.py += ny * enemySpd * dt;

      // attacco nemico se a contatto
      const touching = rectOverlap(G.pet.px+6, G.pet.py+6, G.tile-12, G.tile-12, e.px+6, e.py+6, G.tile-12, G.tile-12);
      if (touching && e.cd <= 0) {
        e.cd = 0.8; // cadenza
        // se non siamo in iframe
        if (now > G.pet.iFrameUntil) {
          const dmg = computeDamage(10, e.atkP, G.defP);
          G.hpCur = Math.max(0, G.hpCur - dmg);
          if (G.hpCur <= 0) { gameOver(); return; }
        }
      }
      e.cd = Math.max(0, e.cd - dt);
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
    ctx.clearRect(0,0,DOM.canvas.width, DOM.canvas.height);

    // pavimento semplice
    ctx.fillStyle = '#111';
    ctx.fillRect(0,0,Cfg.roomW*G.tile, Cfg.roomH*G.tile);
    ctx.fillStyle = '#222';
    ctx.fillRect(G.tile, G.tile, (Cfg.roomW-2)*G.tile, (Cfg.roomH-2)*G.tile);

    // pet
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(G.pet.px+6, G.pet.py+6, G.tile-12, G.tile-12);

    // nemici
    for (const e of G.enemies) {
      ctx.fillStyle = (e.type === 'bat') ? '#a78bfa' : '#e74c3c';
      ctx.fillRect(e.px+8, e.py+8, G.tile-16, G.tile-16);
      // barra HP
      const w = G.tile-16, hpw = Math.max(0, Math.round(w * (e.hp / e.hpMax)));
      ctx.fillStyle = '#000'; ctx.fillRect(e.px+8, e.py+4, w, 3);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(e.px+8, e.py+4, hpw, 3);
    }
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
    // scala lieve
    const scale = 1 + (n - 1) * 0.06;
    const count = 2 + Math.floor(n * 0.8);
    const bats = (n % 3 === 0) ? 1 : 0;

    const arr = [];
    for (let i = 0; i < count; i++) arr.push(makeGoblin(scale));
    for (let i = 0; i < bats; i++) arr.push(makeBat(Math.max(1, scale * 0.95)));

    for (const e of arr) {
      const s = randSpawn(true);
      e.x = s.x; e.y = s.y;
      e.px = e.x * G.tile;
      e.py = e.y * G.tile;
    }
    G.enemies.push(...arr);
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
