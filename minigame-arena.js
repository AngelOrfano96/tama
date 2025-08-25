// === MINI GIOCO ARENA — versione “solo arena” (IIFE) ======================
// === Leaderboard Arena =====================================================
async function openArenaLeaderboard(){
  const modal = document.getElementById('arena-leaderboard-modal');
  const body  = document.getElementById('arena-lb-body');
  if (!modal || !body) return;

  body.innerHTML = `<div style="padding:16px">Caricamento…</div>`;
  modal.classList.remove('hidden');

  try {
    const { data, error } = await supabaseClient
      .from('leaderboard_arena') // 👈 usa la tua tabella
      .select('user_id, username_snapshot, best_score, best_wave, best_at')
      .order('best_score', { ascending:false })
      .order('best_wave',  { ascending:false })
      .limit(100);

    if (error) throw error;

    // mappa alle colonne attese dal renderer
    const rows = (data || []).map((r, i) => ({
      rank: i + 1,
      username: r.username_snapshot || 'Player',
      score: r.best_score || 0,
      wave: r.best_wave || 0,
      created_at: r.best_at
    }));

    renderArenaLeaderboard(body, rows);
  } catch (err) {
    console.error('[Arena LB] fetch', err);
    body.innerHTML = `<div style="padding:16px;color:#fca5a5">Errore nel caricamento.</div>`;
  }
}

function renderArenaLeaderboard(container, rows){
  const fmt = (d)=> d ? new Date(d).toLocaleString() : '-';
  const html = `
    <table class="arena-lb-table">
      <thead>
        <tr>
          <th class="rank">#</th>
          <th>Giocatore</th>
          <th>Punti</th>
          <th>Wave</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td class="rank">${r.rank}</td>
            <td>${escapeHtml(r.username)}</td>
            <td>${r.score|0}</td>
            <td>${r.wave|0}</td>
            <td>${fmt(r.created_at)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

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
 atkRange: 0.9,           // entra in windup se entro questo raggio (tile)
  atkCancelRange: 1.05,    // SE durante il windup il pet esce oltre questo → annulla
  atkHitRange: 0.75,       // al momento dell'impatto, il pet deve essere entro questo
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

    // joystick & overlay
  joyBase: document.getElementById('arena-joy-base'),
  joyStick: document.getElementById('arena-joy-stick'),
  joyOverlay: document.getElementById('arena-joystick-overlay'),
  actionsOverlay: document.getElementById('arena-actions-overlay'),
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
      joy: { active:false, vx:0, vy:0 },


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

  // --- SPRITES & CACHE (arena) ---
G.sprites = {
  atlas: null,     // atlas dungeon
  decor: null,     // mapping tile → ritaglio atlas
  pet: null        // frames del pet
};

G.renderCache = {
  arenaLayer: null, // {canvas, tile} per il layer statico (pavimento+muri)
  tile: 0
};

async function enterFullscreen() {
  try {
    const root = DOM.modal || document.documentElement;
    if (!document.fullscreenElement && root?.requestFullscreen) {
      await root.requestFullscreen();
    }
  } catch (e) { console.warn('Fullscreen failed', e); }
}

function drawHUDInCanvas() {
    if (isMobile) return;
  const W = Cfg.roomW * G.tile;

  // pannello compatto a dimensione quasi fissa (leggermente responsive)
  const panelW = Math.round(Math.min(280, Math.max(200, W * 0.32)));
  const panelH = 72;
  const x = Math.round((W - panelW) / 2);
  const y = Math.round(G.tile * 0.30); // stacco dall’alto

  ctx.save();

  // ombra soft
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  roundRect(ctx, x + 3, y + 4, panelW, panelH, 14);
  ctx.fill();

  // pannello
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#0d0f12';
  roundRect(ctx, x, y, panelW, panelH, 14);
  ctx.fill();

  // bordo
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2a2f36';
  roundRect(ctx, x, y, panelW, panelH, 14);
  ctx.stroke();

  // testo
  ctx.fillStyle = '#e5e7eb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const titleY = y + 22;
  ctx.font = '600 18px system-ui,-apple-system,Segoe UI,Roboto,Arial';
  ctx.fillText(`Wave #${G.wave|0}`,  x + panelW * 0.30, titleY);
  ctx.fillText(`Punti ${G.score|0}`, x + panelW * 0.70, titleY);

  // barra HP
  const barW = panelW - 40;
  const barH = 14;
  const barX = x + (panelW - barW) / 2;
  const barY = y + panelH - barH - 10;

  // fondo barra
  ctx.fillStyle = '#1f242b';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  const hpPerc = Math.max(0, Math.min(1, G.hpCur / Math.max(1, G.hpMax)));
  const fillW = Math.round(barW * hpPerc);
  ctx.fillStyle = hpPerc > 0.5 ? '#22c55e' : hpPerc > 0.25 ? '#f59e0b' : '#ef4444';
  roundRect(ctx, barX, barY, fillW, barH, barH / 2);
  ctx.fill();

  // testo HP sopra la barra
  ctx.font = '600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial';
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(`${G.hpCur|0} / ${G.hpMax|0}`, x + panelW / 2, barY - 6);

  ctx.restore();
}


function resizeCanvas() {
  let vw = window.innerWidth;
  let vh = window.innerHeight;

  const gutter = isMobile ? 16 : 0;                // 👈 margine laterale
  vw = Math.max(200, vw - gutter);

  const tileFloat = Math.min(vw / Cfg.roomW, vh / Cfg.roomH);
  const base = 16;
  const minTile = isMobile ? 56 : 32;
  const maxTile = isMobile ? 192 : 384;
  let tile = Math.round(tileFloat / base) * base;
  if (tile < minTile) tile = minTile;
  if (tile > maxTile) tile = maxTile;

  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const widthCss  = Cfg.roomW * tile;
  const heightCss = Cfg.roomH * tile;

  DOM.canvas.width  = widthCss * dpr;
  DOM.canvas.height = heightCss * dpr;
  DOM.canvas.style.width  = `${widthCss}px`;
  DOM.canvas.style.height = `${heightCss}px`;

  ctx = DOM.canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const tileChanged = (G.tile !== tile);
  G.tile = tile;
  if (tileChanged) {
    G.renderCache.arenaLayer = null;
    G.renderCache.tile = tile;
  }
  G.pet.px = G.pet.x * tile;
  G.pet.py = G.pet.y * tile;
}




  function isMobileOrTablet() { return isMobile; }

// === ATLAS base ===
const ATLAS_TILE = 16;
const atlasBase  = isMobileOrTablet() ? 'assets/mobile/atlas' : 'assets/desktop/atlas';

// ritaglio generico da atlas 16×16
const pick = (c, r, w=1, h=1) => ({
  sx: c * ATLAS_TILE, sy: r * ATLAS_TILE, sw: w * ATLAS_TILE, sh: h * ATLAS_TILE,
});

// decor desktop/mobile (stesse celle del tuo altro minigioco)
const DECOR_DESKTOP = {
  floor: [ pick(11,2), pick(11,3), pick(12,2), pick(12,3) ],
  top:    [ pick(11,1), pick(12,1) ],
  bottom: [ pick(11,4), pick(12,4) ],
  left:   [ pick(10,2), pick(10,3) ],
  right:  [ pick(13,2), pick(13,3) ],
  corner_tl: pick(10,1), corner_tr: pick(13,1),
  corner_bl: pick(10,4), corner_br: pick(13,4),
};
const DECOR_MOBILE = DECOR_DESKTOP; // se vuoi, puoi differenziare

let DECOR = isMobileOrTablet() ? DECOR_MOBILE : DECOR_DESKTOP;

function variantIndex(x, y, len) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % len;
}

function initAtlasSprites() {
  if (G.sprites.atlas) return;
  G.sprites.atlas = new Image();
  G.sprites.atlas.onload  = () => {
    console.log('[ARENA ATLAS] ok');
    G.renderCache.arenaLayer = null;  // invalida
    bakeArenaLayer();                 // bake subito
  };
  G.sprites.atlas.onerror = (e) => console.error('[ARENA ATLAS] fail', e);
  G.sprites.atlas.src = `${atlasBase}/LL_fantasy_dungeons.png`;
}
function detectPetNumFromDom() {
  const src = document.getElementById('pet')?.src || '';
  const m = src.match(/pet_(\d+)/);
  return m ? m[1] : '1';
}

// === ENEMY ATLAS (come Treasure) ===========================================
const ENEMY_FRAME = 48; // <-- cambia a 48 se i tuoi chara sono 48x48
const enemyAtlasBase = isMobileOrTablet() ? 'assets/mobile/enemies' : 'assets/desktop/enemies';

// pick frame da spritesheet nemici
function gPick(c, r) {
  return { sx: c * ENEMY_FRAME, sy: r * ENEMY_FRAME, sw: ENEMY_FRAME, sh: ENEMY_FRAME };
}

// draw con flip orizzontale opzionale (per “left”)
function drawEnemyFrame(sheet, frame, dx, dy, dw, dh, flip = false) {
  if (!sheet || !frame) return false;
  ctx.save();
  if (flip) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(sheet, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  }
  ctx.restore();
  return true;
}

function buildGoblinFromAtlas() {
  const cfg = {
    sheetSrc: `${enemyAtlasBase}/chara_orc.png`,
    rows: { walkDown:2, walkRight:3, walkUp:4, atkDown:5, atkRight:6, atkUp:7 },
    walkCols: [0,1,2,3],
    attackCols: [0,1,2,3],
    idleMap: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
  };

  if (!G.sprites.goblinSheet) {
    G.sprites.goblinSheet = new Image();
    G.sprites.goblinSheet.onload  = () => console.log('[GOBLIN] atlas ready');
    G.sprites.goblinSheet.onerror = (e) => console.error('[GOBLIN] atlas fail', e);
    G.sprites.goblinSheet.src = cfg.sheetSrc;
  }

  const mkRow = (row, cols) => cols.map(c => gPick(c, row));
  const mkPairs = (pairs)     => pairs.map(([c,r]) => gPick(c, r));
  const idleFrames = mkPairs(cfg.idleMap);
  const safeIdle   = idleFrames.length ? idleFrames : mkRow(cfg.rows.walkDown, [0]);

  G.sprites.goblinFrames = {
    idle: safeIdle,
    walk: {
      down:  mkRow(cfg.rows.walkDown,  cfg.walkCols),
      right: mkRow(cfg.rows.walkRight, cfg.walkCols),
      up:    mkRow(cfg.rows.walkUp,    cfg.walkCols),
      // left = flip di right
    },
    attack: {
      down:  mkRow(cfg.rows.atkDown,   cfg.attackCols),
      right: mkRow(cfg.rows.atkRight,  cfg.attackCols),
      up:    mkRow(cfg.rows.atkUp,     cfg.attackCols),
      // left = flip di right
    },
  };
}

function buildBatFromAtlas() {
  const cfg = {
    sheetSrc: `${enemyAtlasBase}/chara_bat.png`,
    rows: { flyDown:2, flyRight:3, flyUp:4, atkDown:5, atkRight:6, atkUp:7 },
    flyCols: [0,1,2,3],
    attackCols: [0,1,2,3],
    idleMap: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
  };

  if (!G.sprites.batSheet) {
    G.sprites.batSheet = new Image();
    G.sprites.batSheet.onload  = () => console.log('[BAT] atlas ready');
    G.sprites.batSheet.onerror = (e) => console.error('[BAT] atlas fail', e);
    G.sprites.batSheet.src = cfg.sheetSrc;
  }

  const mkRow = (row, cols) => cols.map(c => gPick(c, row));
  const mkPairs = (pairs)     => pairs.map(([c,r]) => gPick(c, r));
  const idleFrames = mkPairs(cfg.idleMap);
  const safeIdle   = idleFrames.length ? idleFrames : mkRow(cfg.rows.flyDown, [0]);

  G.sprites.batFrames = {
    idle: safeIdle,
    walk: {         // chiamiamolo "walk" per compatibilità, ma è volo
      down:  mkRow(cfg.rows.flyDown,  cfg.flyCols),
      right: mkRow(cfg.rows.flyRight, cfg.flyCols),
      up:    mkRow(cfg.rows.flyUp,    cfg.flyCols),
      // left = flip di right
    },
    attack: {
      down:  mkRow(cfg.rows.atkDown,   cfg.attackCols),
      right: mkRow(cfg.rows.atkRight,  cfg.attackCols),
      up:    mkRow(cfg.rows.atkUp,     cfg.attackCols),
      // left = flip di right
    },
  };
}

function buildDecorFromAtlas() {
  G.sprites.decor = {
    floor: DECOR.floor,
    top: DECOR.top, bottom: DECOR.bottom, left: DECOR.left, right: DECOR.right,
    corner_tl: DECOR.corner_tl, corner_tr: DECOR.corner_tr,
    corner_bl: DECOR.corner_bl, corner_br: DECOR.corner_br
  };
}

function drawTileType(x, y, type, tile) {
  const entry = G.sprites.decor?.[type];
  if (!entry || !G.sprites.atlas?.complete) return;
  let d = entry;
  if (Array.isArray(entry)) {
    const idx = (type === 'floor') ? variantIndex(x, y, entry.length) : (x + y) % entry.length;
    d = entry[idx];
  }
  const { sx, sy, sw, sh } = d;
  ctx.drawImage(G.sprites.atlas, sx, sy, sw, sh, x*tile, y*tile, tile, tile);
}

function bakeArenaLayer() {
  const tile = G.tile;
  if (!G.sprites?.atlas?.complete || !G.sprites?.decor) return null;

  const wpx = Cfg.roomW * tile;
  const hpx = Cfg.roomH * tile;

  const cv = document.createElement('canvas');
  cv.width = wpx; cv.height = hpx;
  const bctx = cv.getContext('2d');
  bctx.imageSmoothingEnabled = false;

  // floor dentro il bordo (1..W-2, 1..H-2)
  for (let y = 1; y < Cfg.roomH-1; y++) {
    for (let x = 1; x < Cfg.roomW-1; x++) {
      const entry = G.sprites.decor?.floor;
      if (!entry) continue;
      let d = entry[(x + y) % entry.length];
      if (Array.isArray(entry)) {
        const idx = variantIndex(x, y, entry.length);
        d = entry[idx];
      }
      bctx.drawImage(G.sprites.atlas, d.sx, d.sy, d.sw, d.sh, x*tile, y*tile, tile, tile);
    }
  }

  // muri anello esterno
  const left = 0, right = Cfg.roomW-1, top = 0, bottom = Cfg.roomH-1;
  // angoli
  const C = G.sprites.decor;
  if (C?.corner_tl) bctx.drawImage(G.sprites.atlas, C.corner_tl.sx, C.corner_tl.sy, C.corner_tl.sw, C.corner_tl.sh, left*tile, top*tile, tile, tile);
  if (C?.corner_tr) bctx.drawImage(G.sprites.atlas, C.corner_tr.sx, C.corner_tr.sy, C.corner_tr.sw, C.corner_tr.sh, right*tile, top*tile, tile, tile);
  if (C?.corner_bl) bctx.drawImage(G.sprites.atlas, C.corner_bl.sx, C.corner_bl.sy, C.corner_bl.sw, C.corner_bl.sh, left*tile, bottom*tile, tile, tile);
  if (C?.corner_br) bctx.drawImage(G.sprites.atlas, C.corner_br.sx, C.corner_br.sy, C.corner_br.sw, C.corner_br.sh, right*tile, bottom*tile, tile, tile);

  // lati orizzontali
  for (let x = 1; x <= Cfg.roomW-2; x++) {
    const t = C.top[(x)%C.top.length], b = C.bottom[(x)%C.bottom.length];
    bctx.drawImage(G.sprites.atlas, t.sx, t.sy, t.sw, t.sh, x*tile, top*tile, tile, tile);
    bctx.drawImage(G.sprites.atlas, b.sx, b.sy, b.sw, b.sh, x*tile, bottom*tile, tile, tile);
  }
  // lati verticali
  for (let y = 1; y <= Cfg.roomH-2; y++) {
    const l = C.left[(y)%C.left.length], r = C.right[(y)%C.right.length];
    bctx.drawImage(G.sprites.atlas, l.sx, l.sy, l.sw, l.sh, left*tile, y*tile, tile, tile);
    bctx.drawImage(G.sprites.atlas, r.sx, r.sy, r.sw, r.sh, right*tile, y*tile, tile, tile);
  }

  G.renderCache.arenaLayer = { canvas: cv, tile };
  G.renderCache.tile = tile;
  return G.renderCache.arenaLayer;
}

function loadEnemySprites() {
  const assetBase = isMobileOrTablet() ? 'assets/mobile' : 'assets/desktop';
  G.sprites.enemies = {
    goblin: {
      idle: new Image(),
    },
    bat: {
      idle: new Image(),
    }
  };
  G.sprites.enemies.goblin.idle.src = `${assetBase}/enemies/goblin.png`;
  G.sprites.enemies.bat.idle.src = `${assetBase}/enemies/bat.png`;
}


function loadPetSprites(petNum = '1') {
  const assetBase = isMobileOrTablet() ? 'assets/mobile' : 'assets/desktop';
  const mkImg = (path) => { const i = new Image(); i.src = `${assetBase}/pets/${path}?v=7`; return i; };
  G.sprites.pet = {
    idle:  mkImg(`pet_${petNum}.png`),
    right: [ mkImg(`pet_${petNum}_right1.png`), mkImg(`pet_${petNum}_right2.png`) ],
    left:  [ mkImg(`pet_${petNum}_left1.png`),  mkImg(`pet_${petNum}_left2.png`)  ],
    down:  [ mkImg(`pet_${petNum}_down1.png`),  mkImg(`pet_${petNum}_down2.png`)  ],
    up:    [ mkImg(`pet_${petNum}_up1.png`),    mkImg(`pet_${petNum}_up2.png`)    ],
  };
}

  // HUD compatto
  function syncHUD() {

  }

function syncHUD(){
  if (!isMobile) return;
  // crea una volta l’HUD
  if (!DOM._hudInit){
    DOM.hudBox.innerHTML = `
      <div class="row">
        <span>Wave #<span id="hud-wave">1</span></span>
        <span>Punti <span id="hud-score">0</span></span>
      </div>
      <div class="hpbar"><div id="hud-hp" class="hpfill"></div></div>
      <div id="hud-hp-text" style="font-weight:700">${G.hpCur} / ${G.hpMax}</div>
    `;
    DOM.hudBox.classList.add('show');
    DOM._hudInit = true;
  }
  const hpPct = Math.max(0, Math.min(1, G.hpCur / Math.max(1, G.hpMax)));
  const waveEl  = document.getElementById('hud-wave');
  const scoreEl = document.getElementById('hud-score');
  const hpTxt   = document.getElementById('hud-hp-text');
  const hpFill  = document.getElementById('hud-hp');
  if (waveEl)  waveEl.textContent  = (G.wave|0);
  if (scoreEl) scoreEl.textContent = (G.score|0);
  if (hpTxt)   hpTxt.textContent   = `${G.hpCur|0} / ${G.hpMax|0}`;
  if (hpFill){
    hpFill.style.width = `${Math.round(hpPct*100)}%`;
    hpFill.style.background = hpPct>0.5 ? '#22c55e' : hpPct>0.25 ? '#f59e0b' : '#ef4444';
  }
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
// input → movimento (tastiera + joystick)
let dx = 0, dy = 0;
// tastiera
if (G.keys.has('left'))  dx -= 1;
if (G.keys.has('right')) dx += 1;
if (G.keys.has('up'))    dy -= 1;
if (G.keys.has('down'))  dy += 1;

// joystick (mobile): somma vettori e normalizza
dx += G.joy.vx;
dy += G.joy.vy;

if (dx || dy) {
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; } // normalizza
}
G.pet.moving = !!(Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01);

// facing
if (Math.abs(dx) > Math.abs(dy)) {
  if (dx > 0) G.pet.facing = 'right';
  else if (dx < 0) G.pet.facing = 'left';
} else if (Math.abs(dy) > 0.01) {
  if (dy > 0) G.pet.facing = 'down';
  else if (dy < 0) G.pet.facing = 'up';
}

    const spd = petSpeed();
    G.pet.px = Math.max(G.tile, Math.min((Cfg.roomW-2)*G.tile, G.pet.px + dx * spd * dt));
    G.pet.py = Math.max(G.tile, Math.min((Cfg.roomH-2)*G.tile, G.pet.py + dy * spd * dt));

    // --- animazione pet (walk 2-frame) ---
if (G.pet.moving) {
  G.pet.animTime += dt;
  const STEP = 0.16;                 // velocità switch frame
  if (G.pet.animTime >= STEP) {
    G.pet.stepFrame = 1 - (G.pet.stepFrame|0);
    G.pet.animTime = 0;
  }
} else {
  G.pet.animTime = 0;
  G.pet.stepFrame = 0;
}


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

  // ❗ Serve anche che al momento del colpo il pet sia DAVVERO vicino
  const distNow = Math.hypot(G.pet.px - e.px, G.pet.py - e.py) / G.tile;
  if (distNow > EnemyTuning.atkHitRange) return;

  // hitbox piccola davanti al nemico
  const hw = G.tile * 0.5, hh = G.tile * 0.5;   // più stretta di prima
  let hx = e.px, hy = e.py;

  // direzione “grossolana” verso il pet calcolata sul frame corrente
  const ax = Math.abs(nx), ay = Math.abs(ny);
  if (ax > ay) { // orizzontale
    if (nx > 0) hx += G.tile * 0.5; else hx -= hw;
  } else {       // verticale
    if (ny > 0) hy += G.tile * 0.5; else hy -= hh;
  }

  const inset = 8; // riduce un filo la hitbox del pet
  const hit =
    hx < G.pet.px + (G.tile - inset) &&
    hx + hw > G.pet.px + inset &&
    hy < G.pet.py + (G.tile - inset) &&
    hy + hh > G.pet.py + inset;

  if (!hit) return;

  // anti-doppio-hit nello stesso swing
  if (now - e.lastHitTs < EnemyTuning.swingMs) return;
  e.lastHitTs = now;

  const dmg = computeDamage(EnemyTuning.dmg, e.atkP || 50, G.defP || 50);
  G.hpCur = Math.max(0, G.hpCur - dmg);
  if (G.hpCur <= 0) { gameOver(); return; }
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

  // ❗ Se il pet si allontana troppo durante il windup, annulla l'attacco
  if (dTiles > EnemyTuning.atkCancelRange) {
    e.state = 'chase';
    e.tState = 0;
    // piccola penalità prima di poter riattaccare
    e.nextAtkReadyTs = now + EnemyTuning.cooldownMs * 0.6;
    break;
  }

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


function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}


function render() {
  // pulizia
  ctx.clearRect(0, 0, Cfg.roomW * G.tile, Cfg.roomH * G.tile);

  // layer statico (atlas): bake una volta e riusa
  if (!G.renderCache.arenaLayer || G.renderCache.tile !== G.tile) {
    bakeArenaLayer();
  }
  if (G.renderCache.arenaLayer) {
    ctx.drawImage(G.renderCache.arenaLayer.canvas, 0, 0);
  } else {
    // fallback (se atlas non pronto): rettangoli come prima
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, Cfg.roomW * G.tile, Cfg.roomH * G.tile);
    ctx.fillStyle = '#222';
    ctx.fillRect(G.tile, G.tile, (Cfg.roomW - 2) * G.tile, (Cfg.roomH - 2) * G.tile);
  }

  // --- NEMICI (sprite atlas + telegrafo + shadow + HP) ---
  for (const e of G.enemies) {
    // telegrafo sotto al corpo
    if (e.state === 'windup') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ff4d50';
      ctx.beginPath();
      ctx.arc(e.px + G.tile / 2, e.py + G.tile / 2, G.tile * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ombra ellittica
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(
      e.px + G.tile / 2,
      e.py + G.tile * 0.82,
      G.tile * 0.28,
      G.tile * 0.16,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    // sprite (atlas) o fallback rect
    const pad = 8;
    const ex = e.px + pad, ey = e.py + pad, esz = G.tile - pad * 2;

    // selezione sheet + frames in stile Treasure
    let sheet = null, FR = null;
    if (e.type === 'goblin') { sheet = G.sprites.goblinSheet; FR = G.sprites.goblinFrames; }
    else if (e.type === 'bat') { sheet = G.sprites.batSheet; FR = G.sprites.batFrames; }

    let drawn = false;
    if (sheet && sheet.complete && FR) {
      // facing “grossolano” verso il pet
      let face = 'down';
      const dx = G.pet.px - e.px, dy = G.pet.py - e.py;
      if (Math.abs(dx) > Math.abs(dy)) face = dx >= 0 ? 'right' : 'left';
      else                             face = dy >= 0 ? 'down'  : 'up';

      // scegli set in base allo stato
      let set;
      if (e.state === 'attack')      set = FR.attack;
      else if (e.state === 'windup') set = FR.idle;   // fermo mentre carica
      else                           set = FR.walk;

      // left = usa frames "right" + flip
      const isLeft = (face === 'left');
      const dirKey = isLeft ? 'right' : face;
      let frames = (set && set[dirKey]) ? set[dirKey] : FR.idle;

      if (frames && frames.length) {
        const t = performance.now() * 0.001;
        const fps = (e.state === 'attack') ? 10 : 6;
        const idx = ((t * fps) | 0) % frames.length;
        const frame = frames[idx];

        drawn = drawEnemyFrame(sheet, frame, ex, ey, esz, esz, isLeft);
      }
    }

    if (!drawn) {
      // fallback color block
      ctx.fillStyle = (e.type === 'bat') ? '#a78bfa' : '#e74c3c';
      ctx.fillRect(ex, ey, esz, esz);
    }

    // barra HP
    const w = G.tile - 16;
    const hpw = Math.max(0, Math.round(w * (e.hp / e.hpMax)));
    ctx.fillStyle = '#000';
    ctx.fillRect(e.px + 8, e.py + 4, w, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(e.px + 8, e.py + 4, hpw, 3);
  }

  // --- PET (con texture) ---
  {
    const tile = G.tile;
    const px = G.pet.px + 6, py = G.pet.py + 6, sz = tile - 12;
    const PET = G.sprites.pet;
    let img = null;

    if (PET) {
      if (!G.pet.moving) {
        img = PET.idle;
      } else {
        const dirArr = PET[G.pet.facing]; // 'up'|'down'|'left'|'right'
        if (Array.isArray(dirArr) && dirArr.length) {
          img = dirArr[Math.abs(G.pet.stepFrame | 0) % dirArr.length] || dirArr[0];
        } else {
          img = PET.idle;
        }
      }
    }

    // HUD in-canvas (centrato in alto)
drawHUDInCanvas();


    if (img && img.complete) ctx.drawImage(img, px, py, sz, sz);
    else { ctx.fillStyle = '#ffd54f'; ctx.fillRect(px, py, sz, sz); }
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

function setupMobileControlsArena(){
  const base  = DOM.joyBase;
  const stick = DOM.joyStick;
  if (!base || !stick) return;

  const setStick = (dx, dy) => {
    stick.style.left = `${50 + dx*100}%`;
    stick.style.top  = `${50 + dy*100}%`;
    stick.style.transform = `translate(-50%, -50%)`;
  };

  const start = (ev) => {
    ev.preventDefault();
    G.joy.active = true;
    setStick(0,0);
  };

  const move = (ev) => {
    if (!G.joy.active) return;
    ev.preventDefault();

    // misura SEMPRE ora (evita radius 0)
    const rect = base.getBoundingClientRect();
    const radius = Math.max(1, rect.width * 0.5);  // guardia
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    const t = (ev.touches ? ev.touches[0] : ev);
    const dx = (t.clientX - cx) / radius;
    const dy = (t.clientY - cy) / radius;

    let len = Math.hypot(dx, dy);
    let vx = 0, vy = 0;
    if (len > 0.12) {              // deadzone
      const k = Math.min(1, len);
      vx = (dx / len) * k;
      vy = (dy / len) * k;         // y+ = giù
    }

    // se per qualche motivo sono NaN, azzera
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;

    G.joy.vx = vx;
    G.joy.vy = vy;

    setStick(vx * 0.35, vy * 0.35);
  };

  const end = (ev) => {
    ev && ev.preventDefault();
    G.joy.active = false;
    G.joy.vx = 0; G.joy.vy = 0;
    setStick(0,0);
  };

  // touch
  base.addEventListener('touchstart',  start, { passive:false });
  base.addEventListener('touchmove',   move,  { passive:false });
  base.addEventListener('touchend',    end,   { passive:false });
  base.addEventListener('touchcancel', end,   { passive:false });

  // pointer (Android Chrome a volte preferisce questi)
  base.addEventListener('pointerdown', start, { passive:false });
  base.addEventListener('pointermove', move,  { passive:false });
  base.addEventListener('pointerup',   end,   { passive:false });

  // Bottoni azione – tap immediato
const fire = (fn) => (e) => { e.preventDefault(); if (G.playing) fn(); };
['touchstart','pointerdown'].forEach(evName => {
  DOM.btnAtk?.addEventListener(evName,  fire(tryAttackBasic),   { passive:false });
  DOM.btnChg?.addEventListener(evName,  fire(tryAttackCharged), { passive:false });
  DOM.btnDash?.addEventListener(evName, fire(tryDash),          { passive:false });
});

}




  // ---------- Start / End ----------
async function startArenaMinigame() {
  // 1) Leggi le stat dal DB
  try {
    const { data, error } = await supabaseClient
      .from('pet_states')
      .select('hp_max, attack_power, defense_power, speed_power')
      .eq('pet_id', petId)
      .single();

    if (error) throw error;

    // HP: usa hp_max come "massimo" e anche come "current" a inizio arena
    const hpMax = Math.max(1, Math.round(Number(data?.hp_max ?? 100)));
    G.hpMax = hpMax;
    G.hpCur = hpMax; // <-- ignoriamo hp_current: si parte full HP in arena

    // Altre stats direttamente dal DB
    G.atkP = Math.max(1, Math.round(Number(data?.attack_power  ?? 50)));
    G.defP = Math.max(1, Math.round(Number(data?.defense_power ?? 50)));
    G.spdP = Math.max(1, Math.round(Number(data?.speed_power  ?? 50)));
  } catch (e) {
    console.error('[Arena] load stats', e);
    // fallback robusto
    G.hpMax = 100;
    G.hpCur = 100;
    G.atkP = 50;
    G.defP = 50;
    G.spdP = 50;
  }
// HUD DOM fuori dal canvas: lo vogliamo SOLO su mobile
// e i bottoni azione devono essere visibili su mobile.
if (isMobile) {
  DOM.joyOverlay?.classList.remove('hidden');
  DOM.actionsOverlay?.classList.remove('hidden');

  // mostra HUD DOM (verrà popolato da syncHUD)
  if (DOM.hudBox) {
    DOM.hudBox.style.display = '';      // assicurati che non sia display:none
    DOM.hudBox.classList.add('show');   // se nel CSS usi .show per lo stile mobile
  }

  // assicurati che i tre bottoni non siano nascosti
  if (DOM.btnAtk)  DOM.btnAtk.style.display  = '';
  if (DOM.btnChg)  DOM.btnChg.style.display  = '';
  if (DOM.btnDash) DOM.btnDash.style.display = '';
} else {
  // Desktop: niente overlay mobile e HUD nel canvas
  DOM.joyOverlay?.classList.add('hidden');
  DOM.actionsOverlay?.classList.add('hidden');

  if (DOM.hudBox) {
    DOM.hudBox.classList.remove('show');
    DOM.hudBox.style.display = 'none';
  }
  if (DOM.btnAtk)  DOM.btnAtk.style.display  = 'none';
  if (DOM.btnChg)  DOM.btnChg.style.display  = 'none';
  if (DOM.btnDash) DOM.btnDash.style.display = 'none';
}

setupMobileControlsArena();

  // 2) Reset partita
  G.wave = 1;
  G.score = 0;
  G.enemies = [];

  // nascondi HUD DOM e bottoni (usiamo HUD in-canvas)
  //if (DOM.hudBox)  DOM.hudBox.style.display = 'none';
  //if (DOM.btnAtk)  DOM.btnAtk.style.display = 'none';
  //if (DOM.btnChg)  DOM.btnChg.style.display = 'none';
  //if (DOM.btnDash) DOM.btnDash.style.display = 'none';

  G.pet = {
    x: (Cfg.roomW/2)|0, y: (Cfg.roomH/2)|0,
    px: 0, py: 0, dirX: 0, dirY: 0,
    moving: false, iFrameUntil: 0,
    cdAtk: 0, cdChg: 0, cdDash: 0,
    facing: 'down',
    animTime: 0,
    stepFrame: 0
  };

  // 3) Asset & rendering
  initAtlasSprites();
  buildDecorFromAtlas();
  buildGoblinFromAtlas?.();
  buildBatFromAtlas?.();

  const petNum = detectPetNumFromDom();
  loadPetSprites(petNum);

  await enterFullscreen?.(); // opzionale
  resizeCanvas();
  syncHUD();
  spawnWave(G.wave);

  // 4) Avvio loop
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
    G.keys.clear();
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
  //DOM.btnAtk?.addEventListener('click', () => { if (G.playing) tryAttackBasic(); });
//  DOM.btnChg?.addEventListener('click', () => { if (G.playing) tryAttackCharged(); });
//  DOM.btnDash?.addEventListener('click', () => { if (G.playing) tryDash(); });

  window.addEventListener('resize', () => { if (G.playing) { resizeCanvas(); syncHUD(); } });
})();
