
import { MOVES } from './mosse.js';

// bridge: prendi il client attaccato al window
const sb = () => {
  const c = window.supabaseClient;
  if (!c) throw new Error('[Arena] Supabase client non pronto');
  return c;
};
const getPid = () => window.petId;
if (!window.supabaseClient) console.error('[Arena] window.supabaseClient mancante: carica prima lo script che crea il client!');
// === Leaderboard Arena =====================================================
async function openArenaLeaderboard(){
  const modal = document.getElementById('arena-leaderboard-modal');
  const body  = document.getElementById('arena-lb-body');
  if (!modal || !body) return;

  body.innerHTML = `<div style="padding:16px">Caricamento…</div>`;
  modal.classList.remove('hidden');

  try {
    // utente loggato (per highlight + posizione)
    const { data:auth } = await sb().auth.getUser();
    const meId = auth?.user?.id || null;

    const { data, error } = await sb()
      .from('leaderboard_arena')
      .select('user_id, username_snapshot, best_score, best_wave, best_at')
      .order('best_score', { ascending:false })
      .order('best_wave',  { ascending:false })
      .limit(100);

    if (error) throw error;

    // mappa alle colonne attese dal renderer + tieni userId
    const rows = (data || []).map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username_snapshot || 'Player',
      score: r.best_score || 0,
      wave:  r.best_wave  || 0,
      created_at: r.best_at
    }));

    renderArenaLeaderboard(body, rows, { meId, total: rows.length });
  } catch (err) {
    console.error('[Arena LB] fetch', err);
    body.innerHTML = `<div style="padding:16px;color:#fca5a5">Errore nel caricamento.</div>`;
  }
}

function renderArenaLeaderboard(container, rows, opts = {}){
  const fmtDate = (d)=> d ? new Date(d).toLocaleString() : '-';
  const { meId = null, total = rows.length } = opts;

  const meIndex = rows.findIndex(r => r.userId && r.userId === meId);
  const meRank  = meIndex >= 0 ? (meIndex + 1) : null;

  const selfPill = `
    <div class="arena-lb-self">
      <span class="arena-lb-chip ${meRank ? '' : 'muted'}">
        ${meRank ? `La tua posizione: #${meRank} su ${total}` : 'Non in classifica'}
      </span>
    </div>`;

  const table = `
    <table class="arena-lb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Giocatore</th>
          <th>Punti</th>
          <th>Wave</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${r.userId === meId ? 'is-me' : ''}">
            <td>${r.rank}</td>
            <td>${escapeHtml(r.username)}</td>
            <td>${r.score|0}</td>
            <td>${r.wave|0}</td>
            <td>${fmtDate(r.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  container.innerHTML = selfPill + table;
}




// wiring UI leaderboard (al load del DOM)
document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('btn-open-leaderboard-arena');
  const modal = document.getElementById('arena-leaderboard-modal');
  const close = document.getElementById('arena-lb-close');

  if (!btn || !modal || !close) return;

  btn.addEventListener('click', () => openArenaLeaderboard());
  close.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

(() => {
  const Cfg = {
    roomW: 13,       // stanza unica
    roomH: 10,
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

  // in alto
const DOM = {};  // ← non più valorizzato subito
let ctx = null;

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
/*

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
  let ctx = DOM.canvas.getContext('2d'); */

  const isMobile = (window.matchMedia?.('(pointer:coarse)')?.matches ?? false) || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

  if (isMobile) {
  Cfg.roomH += 3;         // +3 file solo mobile
}

const PET_SCALE_MOBILE   = 1.70; // +10% pet
const ENEMY_SCALE_MOBILE = 2.80; // +6% nemici

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


    projectiles: [],
  };

  // --- SPRITES & CACHE (arena) ---
G.sprites = {
  atlas: null,     // atlas dungeon
  decor: null,     // mapping tile → ritaglio atlas
  pet: null        // frames del pet
};

G.renderCache = {
  arenaLayer: null, // {canvas, tile} per il layer statico (pavimento+muri)
  arenaForeLayer: null,
  tile: 0
};
// --- Profondità di rendering (solo grafica) e limiti di movimento ---
const RENDER_DEPTH = { top: 2, bottom: 1, sides: 1 }; // quanti "blocchi" disegniamo
const WALK_BOUNDS  = { top: 2, bottom: 0, sides: 0 }; // dove può camminare il pet
const PAD_X = 2;                                      // margine laterale visivo (px)
// due cancelli 2×2 nel muro top (x,y = angolo in alto-sx in tile)







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
  if (!DOM.canvas) return;

  // --- viewport disponibile
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  const gutter = isMobile ? 16 : 0;     // piccolo margine su mobile
  vw = Math.max(200, vw - gutter);

  // --- calcolo tile "grande quanto possibile", arrotondato a multipli di 32
  const rawTile = Math.min(vw / Cfg.roomW, vh / Cfg.roomH);
  const MIN_TILE = 32;
  const MAX_TILE = isMobile ? 192 : 384; // evita tile esagerati su desktop giganti

  let tile = Math.floor(rawTile / 32) * 32; // multiplo di 32
  if (tile < MIN_TILE) tile = MIN_TILE;
  if (tile > MAX_TILE) tile = Math.floor(MAX_TILE / 32) * 32;

  // --- dimensioni canvas
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const widthCss  = Cfg.roomW * tile;
  const heightCss = Cfg.roomH * tile;

  DOM.canvas.width  = Math.max(1, Math.round(widthCss  * dpr));
  DOM.canvas.height = Math.max(1, Math.round(heightCss * dpr));
  DOM.canvas.style.width  = `${widthCss}px`;
  DOM.canvas.style.height = `${heightCss}px`;

  // --- context
  ctx = DOM.canvas.getContext('2d', { alpha: true, desynchronized: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 1 unità canvas = 1 px CSS
  ctx.imageSmoothingEnabled = false;        // pixel art nitida

  // --- aggiorna stato/tile e cache rendering
  const tileChanged = (G.tile !== tile);
  G.tile = tile;
  if (tileChanged) {
    G.renderCache.arenaLayer = null;
    G.renderCache.arenaForeLayer = null;
    G.renderCache.tile = tile;
  }

  // --- riposiziona il pet in pixel
  G.pet.px = G.pet.x * tile;
  G.pet.py = G.pet.y * tile;

  // utile per il picker (CSS->canvas)
  G._cssToCanvas = DOM.canvas.width / widthCss;
}






  function isMobileOrTablet() { return isMobile; }




/*
// === ATLAS base ===
const ATLAS_TILE = 16;
const atlasBase  = isMobileOrTablet() ? 'assets/mobile/atlas' : 'assets/desktop/atlas';

// ritaglio generico da atlas 16×16
const pick = (c, r, w=1, h=1) => ({
  sx: c * ATLAS_TILE, sy: r * ATLAS_TILE, sw: w * ATLAS_TILE, sh: h * ATLAS_TILE,
});

// ⛏️ Sostituisci qui con le celle di Dungeon_2.png
const DECOR_DESKTOP = {
  floor: [ pick(0,6), pick(0,7), pick(1,6), pick(1,7) ],

  // MURI — corpo (tile “base” del muro)
  wallBody: {
    top:    [ pick(1,7) ],
    bottom: [ pick(7,2) ],
    left:   [ pick(6,1) ],
    right:  [ pick(8,1) ],
    corner_tl: pick(0,7),
    corner_tr: pick(2,6),
    corner_bl: pick(0,10),
    corner_br: pick(2,7),
  },

  // MURI — “cap” (il tassello che fa il secondo blocco)
  // Se il tuo atlas non ha un cap diverso, rimetti GLI STESSI tile del body.
  wallCap: {
    top:    [ pick(1,6) ],
    bottom: [ pick(1,11) ],
    left:   [ pick(0,10) ],
    right:  [ pick(2,10) ],
    corner_tl: pick(0 ?? 9, 0 ?? 9),
    corner_tr: pick(2 ?? 9, 2 ?? 9),
    corner_bl: pick(0 ?? 11, 0 ?? 11),
    corner_br: pick(2 ?? 11, 2 ?? 11),
  },
};
const DECOR_MOBILE = DECOR_DESKTOP;
let DECOR = isMobileOrTablet() ? DECOR_MOBILE : DECOR_DESKTOP; 


*/



// === ATLAS base (atlas 16×32) =========================
const ATLAS_TILE = 16;                        // <-- 16 (il tuo Dungeon_2.png è 192×144 = 12×9 tile)
const atlasBase  = isMobileOrTablet()
  ? 'assets/mobile/atlas'
  : 'assets/desktop/atlas';

// ritaglio generico
const pick = (c, r, w = 1, h = 1) => ({
  sx: c * ATLAS_TILE,
  sy: r * ATLAS_TILE,
  sw: w * ATLAS_TILE,
  sh: h * ATLAS_TILE,
});

// ⚠️ Questi indici sono un preset “buono” per l’anteprima.
// Se vuoi perfezionarli, premi “P”, clicca il tile, e metti i pick(c,r) giusti.
const DECOR_DESKTOP = {
  floor: [ pick(6,0), pick(6,1), pick(7,0), pick(7,1) ],
  wallBody: {
    top: [
      pick(1,4), // FILA 1 (esterna, quella che tocca il bordo)
      pick(1,7)  // FILA 2 (subito sotto la 1)
    ],
    bottom: [
      pick(7,4) // FILA 1 dal basso verso l’alto
      //pick(1,6)  // FILA 2
    ],
    left:   [ pick(4,2), pick(4,1) ],
    right:  [ pick(4,2), pick(4,1) ],
    corner_tl: pick(0,0),
    corner_tr: pick(2,0),
    corner_bl: pick(7,4),
    corner_br: pick(6,4),
  },
  wallCap: {
    top:    [ pick(1,7) ],
    bottom: [ pick(1,4) ],
    left:   [ pick(3,0) ],
    right:  [ pick(3,0) ],
    corner_tl: pick(0,0),
    corner_tr: pick(2,0),
    corner_bl: pick(0,2),
    corner_br: pick(2,2),
  },
  ceiling: [ pick(8,6) ],
};


const DECOR_MOBILE = DECOR_DESKTOP;
let DECOR = isMobileOrTablet() ? DECOR_MOBILE : DECOR_DESKTOP;

const GATE_CFG = {
  fw: 2 * ATLAS_TILE,
  fh: 2 * ATLAS_TILE,
  frames: 26,         // valore atteso (verrà clampato su cols*rows)
  fps: 18,
  src: `${atlasBase}/Dungeon_2_Gate_anim.png`,
  snake: true         // ← ordine a serpentina: L→R poi R→L
};


const GATE_Y = Math.max(0, (1 + RENDER_DEPTH.top) - 2);

const ARENA_GATES = [
  { x: 2,                 y: GATE_Y },            // left gate
  { x: Cfg.roomW - 4,     y: GATE_Y },            // right gate (2 tiles wide)
];
// Se cambi roomW, questi restano centrati ai lati.
// stato runtime cancelli
const Gates = {
  sheet: null,
  state: 'idleUp',
  frame: 0,
  t: 0,
  pendingIngress: 0,
  spawnedThisWave: false,
  queue: [0, 0],           // ← contatori di coda per i due cancelli
};
// Area camminabile in pixel
function getPlayBounds(){
  const t = G.tile;
  return {
    // laterali: può toccare quasi i muri (con 2px di aria)
    minX: 1 * t + PAD_X,
    maxX: (Cfg.roomW - 2) * t - PAD_X,
    // top: fermati dopo 2 file di muro
    minY: (1 + WALK_BOUNDS.top) * t,
    // bottom: nessun rientro
    maxY: (Cfg.roomH - 2 - WALK_BOUNDS.bottom) * t
  };
}
function gateIngressY() {
  // prima riga utile dentro l’area di gioco
  return (1 + WALK_BOUNDS.top) * G.tile;
}

// Clampa un oggetto {px,py} ai bounds
function clampToBounds(obj){
  const b = getPlayBounds();
  obj.px = Math.max(b.minX, Math.min(b.maxX, obj.px));
  obj.py = Math.max(b.minY, Math.min(b.maxY, obj.py));
}
// carica l’atlas dungeon
function initAtlasSprites() {
  if (G.sprites.atlas) return;
  G.sprites.atlas = new Image();
  G.sprites.atlas.onload  = () => {
    console.log('[ARENA ATLAS] ok', G.sprites.atlas.naturalWidth, 'x', G.sprites.atlas.naturalHeight);
    G.renderCache.arenaLayer = null;
    bakeArenaLayer();
  };
  G.sprites.atlas.onerror = (e) => console.error('[ARENA ATLAS] fail', e);
  G.sprites.atlas.src = `${atlasBase}/Dungeon_2.png`;  // lascia questo path
}

function initGateSprite(){
  if (Gates.sheet) return;
  Gates.sheet = new Image();
  Gates.sheet.onload  = () => {
    console.log('[GATE] sprite ready', Gates.sheet.naturalWidth, 'x', Gates.sheet.naturalHeight);
    // calcola colonne/righe del foglio
    GATE_CFG.cols = Math.max(1, (Gates.sheet.naturalWidth  / GATE_CFG.fw) | 0);
    GATE_CFG.rows = Math.max(1, (Gates.sheet.naturalHeight / GATE_CFG.fh) | 0);
    GATE_CFG.total = GATE_CFG.cols * GATE_CFG.rows;
    // Se il PNG ha più/meno frame del previsto, clampa
    GATE_CFG.frames = Math.min(GATE_CFG.frames, GATE_CFG.total);
  };
  Gates.sheet.onerror = (e) => console.error('[GATE] sprite fail', e);
  Gates.sheet.src = GATE_CFG.src;
}

// === DROP CONFIG ===
const DROP_CHANCE   = 0.004;   // 2%
const DROP_TTL_MS   = 15000;  // scade dopo 15s
const DROP_RADIUS   = 0.36;   // collisione in tile
const DROP_DRAW_SZ  = 0.55;   // grandezza grafica (tile)
G.drops = [];                   // array dei drop attivi

const MOVE_DROP_CFG = {
  tile: 16,
  // cambia il nome file se diverso (stessa cartella di Dungeon_2.png)
  src: `${atlasBase}/LL_fantasy_dungeons.png`
};
G.sprites.moveSheet = null;

// mapping: move_key -> ritaglio sull’atlas delle droppabili
// METTI qui le celle giuste; fallback: lettera "M" se manca la mappa.
const MOVE_ICON_MAP = {
  basic_attack: { c:0, r:0, w:1, h:1 },
  repulse:      { c:1, r:0, w:1, h:1 },
  ball:         { c:12, r:5, w:1, h:1 },
  // ... aggiungi le altre mosse che possono droppare
};
// helper pick per l’atlas mosse (usa la stessa unità dell’altro atlas)
const pickMove = (c, r, w=1, h=1) => ({
  sx: c * MOVE_DROP_CFG.tile,
  sy: r * MOVE_DROP_CFG.tile,
  sw: w * MOVE_DROP_CFG.tile,
  sh: h * MOVE_DROP_CFG.tile,
});

// opzionale: registrare al volo una nuova icona
function registerMoveIcon(moveKey, c, r, w=1, h=1){
  MOVE_ICON_MAP[moveKey] = { c, r, w, h };
}

function getMoveIconRect(moveKey){
  const m = MOVE_ICON_MAP[moveKey];
  if (!m) return null;
  return pickMove(m.c, m.r, m.w, m.h);
}

function initMoveDropSprite(){
  if (G.sprites.moveSheet) return;
  const img = new Image();
  img.onload  = () => console.log('[MoveDrop] sheet ok', img.naturalWidth, 'x', img.naturalHeight);
  img.onerror = (e) => console.warn('[MoveDrop] sheet fail', e);
  img.src = MOVE_DROP_CFG.src;
  G.sprites.moveSheet = img;
}

function getDroppableMoves(){
  return ['ball']; // oggi solo Ball
}


function spawnMoveDropAt(px, py){
  const pool = getDroppableMoves();
  if (!pool.length) return;
  const moveKey = pool[(Math.random()*pool.length)|0];
  G.drops.push({ kind:'move', moveKey, px, py, bornAt: performance.now(), ttl: DROP_TTL_MS });
}

// RPC → inserisce in pet_moves (duplicati consentiti)
async function awardMoveToInventory(moveKey){
  const pid = window.petId;
  if (!pid) { console.warn('[award_move_drop] missing petId'); return; }

  try {
    const { error } = await sb().rpc('award_move_drop', {
      p_pet_id: pid,
      p_move_key: moveKey
    });
    if (error) throw error;

    console.log('[DROP] awarded', moveKey);
    await window.loadMoves?.(); // ricarica l’inventario
    showArenaToast(`Nuova mossa: ${moveKey}`);
  } catch (e) {
    console.error('[award_move_drop]', e);
    showArenaToast('Errore salvataggio mossa', true);
  }
}




function showArenaToast(text, isErr=false){
  const el = document.createElement('div');
  el.className = 'arena-toast';
  Object.assign(el.style, {
    position:'fixed', left:'50%', top:'12%', transform:'translateX(-50%)',
    padding:'10px 14px', borderRadius:'10px',
    background: isErr ? '#8b1f1f' : '#0f172a', color:'#fff',
    font:'600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial',
    boxShadow:'0 6px 18px rgba(0,0,0,.22)', zIndex:10050,
    opacity:'0', transition:'opacity .15s ease'
  });
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.style.opacity='1');
  setTimeout(()=> { el.style.opacity='0'; setTimeout(()=> el.remove(), 180); }, 1300);
}

// chiamata quando un nemico muore: rolla il drop
function onEnemyKilled(e){
  if (Math.random() < DROP_CHANCE){
    // centra il drop nel tile del nemico
    spawnMoveDropAt(e.px + G.tile/2, e.py + G.tile/2);
  }
}


// ===== DEV: Atlas Inspector =====
let INSPECT = { on:false };
function toggleInspector(){ INSPECT.on = !INSPECT.on; }
document.addEventListener('keydown', (e)=>{
  if (e.key === '`') {   // backtick per attivare/disattivare
    toggleInspector();
  }
});

DOM.canvas?.addEventListener('click', (e)=>{
  if (!INSPECT.on) return;
  const rect = DOM.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  const tile = G.tile;
  // proietto le coordinate del canvas sul tileset (stessa scala)
  const c = Math.floor(x / tile);
  const r = Math.floor(y / tile);
  console.log('pick(', c, ',', r, ')');
});

// Disegna griglia e indici sopra al rendering
function drawInspectorGrid(ctx){
  if (!INSPECT.on) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#00ffc3';
  for (let x=0; x<=Cfg.roomW; x++){
    ctx.beginPath();
    ctx.moveTo(x*G.tile, 0);
    ctx.lineTo(x*G.tile, Cfg.roomH*G.tile);
    ctx.stroke();
  }
  for (let y=0; y<=Cfg.roomH; y++){
    ctx.beginPath();
    ctx.moveTo(0, y*G.tile);
    ctx.lineTo(Cfg.roomW*G.tile, y*G.tile);
    ctx.stroke();
  }
  // numeri
  ctx.fillStyle = '#00ffc3';
  ctx.font = '600 10px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  for (let y=0; y<Cfg.roomH; y++){
    for (let x=0; x<Cfg.roomW; x++){
      ctx.fillText(`${x},${y}`, x*G.tile + 4, y*G.tile + 12);
    }
  }
  ctx.restore();
}



function variantIndex(x, y, len) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % len;
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
  // normalizza qualunque DECOR in { floor, wallBody:{...}, wallCap:{...} }
  G.sprites.decor = normalizeDecor(DECOR);
}

/** Accetta sia lo schema vecchio (top/bottom/...) che quello nuovo.
 *  Restituisce sempre { floor, wallBody:{...}, wallCap:{...} } */
function normalizeDecor(S) {
  const out = { floor: S?.floor || [], wallBody: {}, wallCap: {} };

  // Se è già nello schema nuovo, usa quello
  if (S?.wallBody) {
    out.wallBody = S.wallBody;
    out.wallCap  = S.wallCap || S.wallBody;   // fallback: cap = body
    // assicurati di avere i corner
    for (const k of ['corner_tl','corner_tr','corner_bl','corner_br']) {
      out.wallCap[k]  = out.wallCap[k]  || out.wallBody[k];
    }
    return out;
  }

  // --- Schema vecchio -> mappa in quello nuovo ---
  const sides = ['top','bottom','left','right'];
  for (const side of sides) {
    const arr = S?.[side] || [];
    out.wallBody[side] = arr;
    out.wallCap[side]  = (S?.cap?.[side]) || arr;  // se non hai cap separati, usa body
  }
  // corner
  out.wallBody.corner_tl = S?.corner_tl;
  out.wallBody.corner_tr = S?.corner_tr;
  out.wallBody.corner_bl = S?.corner_bl;
  out.wallBody.corner_br = S?.corner_br;

  out.wallCap.corner_tl = (S?.cap?.corner_tl) || out.wallBody.corner_tl;
  out.wallCap.corner_tr = (S?.cap?.corner_tr) || out.wallBody.corner_tr;
  out.wallCap.corner_bl = (S?.cap?.corner_bl) || out.wallBody.corner_bl;
  out.wallCap.corner_br = (S?.cap?.corner_br) || out.wallBody.corner_br;

  return out;
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

  const wpx = Cfg.roomW * tile, hpx = Cfg.roomH * tile;

  // --- canvas base (pavimento + corpi muro)
  const cvBase = document.createElement('canvas');
  cvBase.width = wpx; cvBase.height = hpx;
  const bctx = cvBase.getContext('2d');
  bctx.imageSmoothingEnabled = false;

  // --- canvas front (coperchi che stanno sopra a pet/nemici)
  const cvFront = document.createElement('canvas');
  cvFront.width = wpx; cvFront.height = hpx;
  const fctx = cvFront.getContext('2d');
  fctx.imageSmoothingEnabled = false;

  const D = G.sprites.decor;
  const left = 0, right = Cfg.roomW - 1, top = 0, bottom = Cfg.roomH - 1;

  // profondità: le legge DAL GLOBALE RENDER_DEPTH
  const DEPTH_TOP    = (RENDER_DEPTH.top    | 0);
  const DEPTH_BOTTOM = (RENDER_DEPTH.bottom | 0);
  const DEPTH_SIDES  = (RENDER_DEPTH.sides  | 0);

  // dove disegnare i "cap"
  const CAP_IN_FRONT = {
    top:    false,  // top nel base (non occlude il personaggio)
    bottom: true,   // bottom nel front (occlude un po' i piedi)
    left:   false,
    right:  false
  };

  const pickVar = (entry, i) => Array.isArray(entry) ? entry[i % entry.length] : entry;

  // --- floor (riempi solo tra banda top e banda bottom)
  const entryFloor = D?.floor || [];
  for (let y = 1 + DEPTH_TOP; y < Cfg.roomH - 1 - DEPTH_BOTTOM; y++) {
    for (let x = 1; x < Cfg.roomW - 1; x++) {
      if (!entryFloor.length) continue;
      const d = Array.isArray(entryFloor)
        ? entryFloor[variantIndex(x, y, entryFloor.length)]
        : entryFloor;
      bctx.drawImage(G.sprites.atlas, d.sx, d.sy, d.sw, d.sh, x*tile, y*tile, tile, tile);
    }
  }

  // --- helper: pila di N corpi + 1 cap
  function drawWallStack(edge, bodyEntry, capEntry, xTile, yTile, depth, capInFront) {
    if (!bodyEntry) return;

    const body = (i)=> pickVar(bodyEntry, i);
    const cap  = pickVar(capEntry || bodyEntry, 0);

    // direzione verso l'interno
    const sgn = (edge === 'top') ? +1 :
                (edge === 'bottom') ? -1 :
                (edge === 'left') ? +1 : -1;

    // corpi nel BASE
    for (let i = 0; i < depth; i++) {
      const d = body(i);
      const ox = (edge === 'left'  || edge === 'right') ? sgn * i * tile : 0;
      const oy = (edge === 'top'   || edge === 'bottom') ? sgn * i * tile : 0;
      bctx.drawImage(G.sprites.atlas, d.sx, d.sy, d.sw, d.sh, xTile + ox, yTile + oy, tile, tile);
    }

    // cap: un passo oltre i corpi
    const capOff = depth * tile;
    const offX = (edge === 'left'  || edge === 'right') ? sgn * capOff : 0;
    const offY = (edge === 'top'   || edge === 'bottom') ? sgn * capOff : 0;
    const ctxCap = capInFront ? fctx : bctx;
    ctxCap.drawImage(G.sprites.atlas, cap.sx, cap.sy, cap.sw, cap.sh, xTile + offX, yTile + offY, tile, tile);
  }

  // --- angoli
  drawWallStack('top',    D.wallBody.corner_tl, D.wallCap.corner_tl, left*tile,  top*tile,    DEPTH_TOP,    CAP_IN_FRONT.top);
  drawWallStack('top',    D.wallBody.corner_tr, D.wallCap.corner_tr, right*tile, top*tile,    DEPTH_TOP,    CAP_IN_FRONT.top);
  drawWallStack('bottom', D.wallBody.corner_bl, D.wallCap.corner_bl, left*tile,  bottom*tile, DEPTH_BOTTOM, CAP_IN_FRONT.bottom);
  drawWallStack('bottom', D.wallBody.corner_br, D.wallCap.corner_br, right*tile, bottom*tile, DEPTH_BOTTOM, CAP_IN_FRONT.bottom);

  // --- lati orizzontali
  for (let x = 1; x <= Cfg.roomW - 2; x++) {
    drawWallStack('top',    D.wallBody.top,    D.wallCap.top,    x*tile, top*tile,    DEPTH_TOP,    CAP_IN_FRONT.top);
    drawWallStack('bottom', D.wallBody.bottom, D.wallCap.bottom, x*tile, bottom*tile, DEPTH_BOTTOM, CAP_IN_FRONT.bottom);
  }

  // --- lati verticali
  for (let y = 1; y <= Cfg.roomH - 2; y++) {
    drawWallStack('left',  D.wallBody.left,  D.wallCap.left,  left*tile,  y*tile, DEPTH_SIDES, CAP_IN_FRONT.left);
    drawWallStack('right', D.wallBody.right, D.wallCap.right, right*tile, y*tile, DEPTH_SIDES, CAP_IN_FRONT.right);
  }

  // ombra morbida sotto alla banda top
  if (DEPTH_TOP > 0) {
    bctx.save();
    bctx.globalAlpha = 0.18;
    bctx.fillStyle = '#000';
    bctx.fillRect(1*tile, (1 + DEPTH_TOP)*tile, (Cfg.roomW-2)*tile, Math.round(tile*0.32));
    bctx.restore();
  }

  G.renderCache.arenaLayer     = { canvas: cvBase,  tile };
  G.renderCache.arenaForeLayer = { canvas: cvFront, tile };
  G.renderCache.tile = tile;
  return G.renderCache.arenaLayer;
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

// === LOADER OVERLAY (Arena) ===================================
function ensureArenaLoaderDOM(){
  if (DOM.loader) return DOM.loader;
  const el = document.createElement('div');
  el.id = 'arena-loading';
  el.className = 'arena-loading hidden';
  el.innerHTML = `
    <div class="card">
      <div class="title">Caricamento Arena</div>
      <div id="arena-load-msg" class="msg">Preparazione…</div>
      <div class="progress"><div id="arena-load-bar"></div></div>
    </div>`;
  document.body.appendChild(el);
  DOM.loader = el;
  return el;
}
function showArenaLoader(){ ensureArenaLoaderDOM().classList.remove('hidden'); }
function hideArenaLoader(){ DOM.loader?.classList.add('hidden'); }
function setArenaLoader(p, msg){
  ensureArenaLoaderDOM();
  const bar = document.getElementById('arena-load-bar');
  const m   = document.getElementById('arena-load-msg');
  if (bar) bar.style.width = `${Math.max(0, Math.min(1, p))*100}%`;
  if (m && msg) m.textContent = msg;
}

// Promessa immagine
function loadImg(src){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({img, ok:true});
    img.onerror = () => resolve({img, ok:false});
    img.src = src;
  });
}

// === PRELOAD risorse Arena con progress ========================
async function preloadArenaResources(update){
  update(0, 'Preparazione…');

  const imgBase = (window.matchMedia?.('(pointer:coarse)')?.matches ?? false) ||
                  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)
                  ? 'assets/mobile' : 'assets/desktop';
  const petNum  = detectPetNumFromDom();

  const petPaths = [
    {k:'idle',  p:`${imgBase}/pets/pet_${petNum}.png`},
    {k:'r1',    p:`${imgBase}/pets/pet_${petNum}_right1.png`},
    {k:'r2',    p:`${imgBase}/pets/pet_${petNum}_right2.png`},
    {k:'l1',    p:`${imgBase}/pets/pet_${petNum}_left1.png`},
    {k:'l2',    p:`${imgBase}/pets/pet_${petNum}_left2.png`},
    {k:'d1',    p:`${imgBase}/pets/pet_${petNum}_down1.png`},
    {k:'d2',    p:`${imgBase}/pets/pet_${petNum}_down2.png`},
    {k:'u1',    p:`${imgBase}/pets/pet_${petNum}_up1.png`},
    {k:'u2',    p:`${imgBase}/pets/pet_${petNum}_up2.png`},
  ];

  const steps = [
    { label:'Statistiche pet', kind:'db', run: async () => {
        const pid = getPid();
        if (!pid) throw new Error('Pet non trovato');
        const { data } = await sb()
          .from('pet_states')
          .select('hp_max, attack_power, defense_power, speed_power')
          .eq('pet_id', pid)
          .single();
        return data;
      }},
    { label:'Mosse equipaggiate', kind:'db', run: async () => {
        const [A,B,C] = await window.getEquippedMovesForArena();
        const atkBonus = await window.getArenaPlayerAttackStat?.();
        return { A, B, C, atkBonus: atkBonus || 0 };
      }},
    { label:'Atlas dungeon', kind:'img', src:`${atlasBase}/Dungeon_2.png`,
      apply: ({img}) => { G.sprites.atlas = img; } },
    { label:'Sprite cancello', kind:'img', src:GATE_CFG.src,
      apply: ({img}) => {
        Gates.sheet = img;
        GATE_CFG.cols = Math.max(1, (img.naturalWidth  / GATE_CFG.fw) | 0);
        GATE_CFG.rows = Math.max(1, (img.naturalHeight / GATE_CFG.fh) | 0);
        GATE_CFG.total = GATE_CFG.cols * GATE_CFG.rows;
        GATE_CFG.frames = Math.min(GATE_CFG.frames, GATE_CFG.total);
      }},
    { label:'Sprite drop mosse', kind:'img', src:MOVE_DROP_CFG.src,
      apply: ({img}) => { G.sprites.moveSheet = img; } },
    { label:'Nemico goblin', kind:'img', src:`${enemyAtlasBase}/chara_orc.png`,
      apply: ({img}) => { G.sprites.goblinSheet = img; buildGoblinFromAtlas?.(); } },
    { label:'Nemico pipistrello', kind:'img', src:`${enemyAtlasBase}/chara_bat.png`,
      apply: ({img}) => { G.sprites.batSheet = img; buildBatFromAtlas?.(); } },
    // Pet frames (9)
    ...petPaths.map(({k,p}) => ({ label:`Sprite pet: ${k}`, kind:'img', src:p, petKey:k })),
  ];

  const total = steps.length;
  const out   = { stats:null, moves:null };
  const petImgs = {};

  for (let i=0; i<steps.length; i++){
    const s = steps[i];
    update(i/total, s.label + '…');

    if (s.kind === 'img'){
      const res = await loadImg(s.src);
      if (s.petKey) petImgs[s.petKey] = res.img;
      s.apply?.(res);
    } else {
      const r = await s.run();
      if (s.label.startsWith('Statistiche')) out.stats = r;
      if (s.label.startsWith('Mosse'))       out.moves = r;
    }
  }

  // Costruisci sprite pet con le immagini caricate
  G.sprites.pet = {
    idle:  petImgs.idle,
    right: [petImgs.r1, petImgs.r2],
    left:  [petImgs.l1, petImgs.l2],
    down:  [petImgs.d1, petImgs.d2],
    up:    [petImgs.u1, petImgs.u2],
  };

  // Decor già definito in alto → normalizza e bake layer statici
  buildDecorFromAtlas?.();
  bakeArenaLayer?.();

  update(1, 'Pronto!');
  return out;
}



  // ---------- Danno (formula consigliata) ----------
  function computeDamage(power, atkEff, defEff) {
    const ratio = atkEff / Math.max(1, (atkEff + defEff));
    const base = power * ratio;
    const variance = 0.9 + Math.random() * 0.2;
    const crit = (Math.random() < 0.05) ? 1.5 : 1.0;
    return Math.max(1, Math.round(base * variance * crit));
  }



  function tryDash() {
    if (G.pet.cdDash > 0) return;
    G.pet.cdDash = Cfg.dashCd;
    startCooldownUIByKey('dash', CD_MS.dash); // se mappi anche 'dash' in ACTION_BTN_ID
    G.pet.iFrameUntil = performance.now() + Cfg.dashIFrame * 1000;
    // spostino un pochino il pet nella direzione
    const dist = G.tile * 0.9;
    const nx = (G.pet.facing === 'right') ? 1 : (G.pet.facing === 'left') ? -1 : 0;
    const ny = (G.pet.facing === 'down')  ? 1 : (G.pet.facing === 'up')   ? -1 : 0;
    G.pet.px += nx * dist;
    G.pet.py += ny * dist;
    // clamp ai confini dell’arena
clampToBounds(G.pet);

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
G.pet.px += dx * spd * dt;
G.pet.py += dy * spd * dt;
clampToBounds(G.pet);        // ⬅️ nuovo clamp sui bounds camminabili


// --- PICKUP drop ---
{
  const PCX = G.pet.px + G.tile/2, PCY = G.pet.py + G.tile/2;
  const R = DROP_RADIUS * G.tile;
  const now = performance.now();

  for (let i = G.drops.length - 1; i >= 0; i--){
    const d = G.drops[i];

    // scadenza
    if (now - d.bornAt > d.ttl) { G.drops.splice(i,1); continue; }

    // raggio su raggio
    const dx = d.px - PCX, dy = d.py - PCY;
    if (dx*dx + dy*dy <= R*R){
      const moveKey = d.moveKey;
      G.drops.splice(i,1);
      awardMoveToInventory(moveKey); // RPC
      G.score += 5;                  // bonus opzionale
      syncHUD?.();
    }
  }
}


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

// applica velocità residuali/knockback con attrito
for (const e of G.enemies) {
  e.vx = (e.vx || 0) * 0.90;
  e.vy = (e.vy || 0) * 0.90;
  e.px += (e.vx || 0) * dt;
  e.py += (e.vy || 0) * dt;
  clampToBounds(e);
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
 // al posto di: const clampToArena = () => clampToBounds(e);
const clampToArena = () => clampToBounds(e);

if (e.stunUntil && now < e.stunUntil) {
    continue; // resterà spinto solo dal knockback + attrito
  }
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
// --- FASE INGRESS: scendi dritto dal cancello ---
if (e.enteringViaGate || e.state === 'ingress') {
  const ingressSpeed = enemySpd;   // o basePet * 0.9 se vuoi più rapido
  e.px = (e.spawnPx ?? e.px);      // blocca la X al varco
  e.py += ingressSpeed * dt;       // solo in giù

  // quando supera la soglia d'ingresso, entra in arena e passa alla chase
  if (e.py >= gateIngressY() + G.tile * 0.2) {
    e.enteringViaGate = false;
    e.state = 'chase';
    if (Gates.pendingIngress > 0) Gates.pendingIngress--;
  }

  clampToArena();
  continue; // salta il resto dell'AI in questo tick
}



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
//for (const e of G.enemies) clampToBounds(e);


    // rimuovi morti
    G.enemies = G.enemies.filter(e => e.hp > 0);

    // 2) projectiles (FUORI dal loop dei nemici)
{
  const t = G.tile;
  const bounds = getPlayBounds();
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    const dx = p.vx * dt, dy = p.vy * dt;
    p.x += dx; p.y += dy;
    p.leftPx -= Math.hypot(dx, dy);

    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY || p.leftPx <= 0) {
      G.projectiles.splice(i,1);
      continue;
    }
    for (const e of G.enemies) {
      if (!e || e.hp <= 0 || p.hitSet.has(e)) continue;
      const ex = e.px + t/2, ey = e.py + t/2;
      const er = t * 0.35;
      if (Math.hypot(p.x - ex, p.y - ey) <= (p.r + er)) {
        const dmg = arenaAPI.computeDamage(p.base, arenaAPI.getAtk(), arenaAPI.getDef(e));
        const dealt = arenaAPI.applyDamage(e, dmg);
        if (dealt > 0) { G.score += 1 + Math.floor(dealt/5); syncHUD?.(); }
        p.hitSet.add(e);
        if (!p.pierce) { G.projectiles.splice(i,1); break; }
      }
    }
  }
}
// 3) AI per singolo nemico
for (const e of G.enemies) {
  // FSM ...
}

    // wave clear?
   /* if (!G.enemies.length) {
      // breve interludio + wave up
      G.wave++;
      G.hpCur = Math.min(G.hpMax, Math.round(G.hpCur + G.hpMax * 0.07)); // piccola cura
      spawnWave(G.wave);
      syncHUD();
    }*/

updateGates(dt);

  }

function updateGates(dt){
  Gates.t += dt;
  const step = 1 / GATE_CFG.fps;
  const last = (GATE_CFG.frames ?? GATE_CFG.total ?? 26) - 1;

  // --- avanzamento animazione ---
  while (Gates.t >= step){
    Gates.t -= step;
    if (Gates.state === 'lowering') {
      Gates.frame++;
      if (Gates.frame >= last) {
        Gates.frame = last;
        Gates.state = 'open';
      }
    } else if (Gates.state === 'raising') {
      Gates.frame--;
      if (Gates.frame <= 0) {
        Gates.frame = 0;
        Gates.state = 'idleUp';
        // reset sicuri a cancelli chiusi
        Gates.spawnedThisWave   = false;
        Gates._spawnedThisOpen  = false;
        Gates.pendingIngress    = 0;
      }
    }
  }

  // --- apri nuova wave solo quando: chiusi, nessun nemico vivo, e non già aperta questa wave ---
  if (Gates.state === 'idleUp' && G.enemies.length === 0 && !Gates.spawnedThisWave) {
    Gates.state = 'lowering';
    Gates.spawnedThisWave = true;   // evita ri-trigger finché non si richiudono
    G.wave++;
    syncHUD?.();
  }

  // --- spawna UNA SOLA volta quando i cancelli sono aperti ---
  if (Gates.state === 'open' && Gates.pendingIngress === 0 && !Gates._spawnedThisOpen) {
    Gates.queue = [0, 0];                          // (se usi la coda per la "fila indiana")
    Gates.pendingIngress = spawnWaveViaGates(G.wave);
    Gates._spawnedThisOpen = true;                 // blocca doppi spawn nella stessa apertura
    if (Gates.pendingIngress === 0) {
      Gates.state = 'raising';                     // niente da far entrare → richiudi
    }
  }

  // --- richiudi appena tutti quelli “throughGate” hanno varcato e c’è almeno 1 nemico in arena ---
  if (Gates.state === 'open' && Gates.pendingIngress === 0 && G.enemies.length > 0) {
    Gates.state = 'raising';
  }
}


function waveEnemyTotal(n){
  if (n <= 1) return 3;
  if (n === 2) return 6;
  const base = 6 + Math.round((n - 2) * 2.5);
  const jitter = (Math.random() < 0.5 ? 0 : 1);
  return Math.min(base + jitter, 20);
}
function waveBatCount(n, total){
  // Pipistrelli solo ogni 3 wave a partire dalla 3, max ~20% del totale
  if (n < 3) return 0;
  if (n % 3 !== 0) return 0;
  return Math.min( Math.max(1, Math.round(total * 0.2)), 4 );
}

function spawnWaveViaGates(n){
  const MAX_ENEMIES = 20;
  if (G.enemies.length >= MAX_ENEMIES) return 0;

  // quantità per wave
  const count = waveEnemyTotal(n);
  const bats  = waveBatCount(n, count);
  const scale = 1 + (n - 1) * 0.06;

  const blue = [];
  for (let i = 0; i < count; i++) blue.push(makeGoblin(scale));
  for (let i = 0; i < bats;  i++) blue.push(makeBat(Math.max(1, scale * 0.95)));

  let spawned = 0, gateIdx = 0;
  const SPACING_TILES = 0.90;              // distanza verticale tra due ingressi

  for (const e of blue) {
    if (G.enemies.length >= MAX_ENEMIES) break;

    // cancello alternato
    const gIndex = gateIdx % ARENA_GATES.length;
    const g = ARENA_GATES[gIndex];
    gateIdx++;

    // posizione nella coda di QUEL cancello
    const q = (Gates.queue?.[gIndex] || 0);

    // colonna dentro al 2×2: sx/dx alternati per varietà
    const gx = g.x + (q % 2);

    // nascita SOPRA il varco, scalata in alto in base alla coda
    const startX = gx * G.tile;
    const startY = (g.y - 1 - q * SPACING_TILES) * G.tile;

    e.x  = gx;
    e.y  = g.y - 1 - q * SPACING_TILES;
    e.px = startX;
    e.py = startY;

    // ingresso “a canna”: X bloccata, solo discesa fino alla soglia
    e.spawnPx = startX;
    e.enteringViaGate = true;
    e.state = 'ingress';
    e.tState = 0;
    e.nextAtkReadyTs = 0;
    e.lastHitTs = 0;

    G.enemies.push(e);
    Gates.queue[gIndex] = q + 1;           // avanza la coda per quel cancello
    spawned++;
  }
  return spawned;
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

function spawnShockwave(x, y, R) {
  const tStart = performance.now();
  const D = 220; // durata ms
  const anim = () => {
    const t = performance.now() - tStart;
    if (t > D) return;
    const k = t / D;
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - k);
    ctx.lineWidth = 2 + 2*k;
    ctx.strokeStyle = '#8ecae6';
    ctx.beginPath();
    ctx.arc(x + G.tile/2, y + G.tile/2, R * (0.4 + 0.6*k), 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
    requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);
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

    // sprite (atlas) o fallback rect — con scala mobile
    const basePad = 8;
    const escale  = isMobile ? ENEMY_SCALE_MOBILE : 1;

    const esz  = (G.tile - basePad * 2) * escale;
    const eoff = (G.tile - esz) / 2;
    const ex   = e.px + eoff;
    const ey   = e.py + eoff;

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

    // barra HP (posizionamento invariato)
    const w = G.tile - 16;
    const hpw = Math.max(0, Math.round(w * (e.hp / e.hpMax)));
    ctx.fillStyle = '#000';
    ctx.fillRect(e.px + 8, e.py + 4, w, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(e.px + 8, e.py + 4, hpw, 3);
  }
// --- DROPS ---
for (const d of G.drops){
  const size = DROP_DRAW_SZ * G.tile;
  const x = d.px - size/2;
  const y = d.py - size/2;

  // glow a terra
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.ellipse(d.px, d.py + size*0.18, size*0.52, size*0.22, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // bobbing
  ctx.save();
  const t = (performance.now() - d.bornAt) / 1000;
  const bob = Math.sin(t * 4) * (G.tile * 0.03);
  ctx.translate(0, -bob);

  const icon = getMoveIconRect(d.moveKey);
  const sheet = G.sprites.moveSheet;
  if (icon && sheet && sheet.complete){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, icon.sx, icon.sy, icon.sw, icon.sh, x, y, size, size);
    // piccolo contorno
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, size, size, size*0.22); ctx.stroke();
  } else {
    // fallback “cartuccia” blu con lettera M
    ctx.beginPath();
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, size, size, size*0.25);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#e5e7eb';
    ctx.font = `700 ${Math.round(size*0.42)}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', d.px, d.py);
  }
  ctx.restore();
}
// --- PROJECTILES ---
for (const p of G.projectiles) {
  // scia semplice
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = '#93c5fd';
  ctx.fill();
  ctx.restore();

  // palla
  ctx.save();
  const grad = ctx.createRadialGradient(p.x, p.y, p.r*0.1, p.x, p.y, p.r);
  grad.addColorStop(0, '#f8fafc');
  grad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


  // --- PET (con texture) ---
  {
    const tile = G.tile;
    const basePad = 6; // era 6
    const scale   = isMobile ? PET_SCALE_MOBILE : 1;

    const sz  = (tile - basePad * 2) * scale;
    const off = (tile - sz) / 2;

    const px = G.pet.px + off;
    const py = G.pet.py + off;

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

  if (G.renderCache.arenaForeLayer) {
    ctx.drawImage(G.renderCache.arenaForeLayer.canvas, 0, 0);
  }
renderGates();


}

function renderGates(){
  const img = Gates.sheet;
  if (!img || !img.complete) {
    // piccolo placeholder visivo per capire dove sarebbero i cancelli
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ff99aa';
    for (const g of ARENA_GATES) {
      ctx.fillRect(g.x * G.tile, g.y * G.tile, 2 * G.tile, 2 * G.tile);
    }
    ctx.restore();
    return;
  }

  const fw = GATE_CFG.fw, fh = GATE_CFG.fh;
  const cols = GATE_CFG.cols || Math.max(1, (img.naturalWidth  / fw) | 0);
  const rows = GATE_CFG.rows || Math.max(1, (img.naturalHeight / fh) | 0);
  const total = cols * rows;

  // frame corrente clampato
  const f = Math.max(0, Math.min((GATE_CFG.frames ?? total) - 1, Gates.frame | 0));

  // mappa indice → (c,r) con serpentina opzionale
  let r = Math.floor(f / cols);
  let c = f % cols;
  if (GATE_CFG.snake && (r % 2 === 1)) c = cols - 1 - c;

  const sx = c * fw;
  const sy = r * fh;

  for (const g of ARENA_GATES){
    const dx = g.x * G.tile;
    const dy = g.y * G.tile;
    ctx.drawImage(img, sx, sy, fw, fh, dx, dy, 2 * G.tile, 2 * G.tile);
  }
}



  function loop() {
    if (!G.playing) return;
    const now = performance.now();
    const dt = (now - G.lastT) / 1000;
    G.lastT = now;

    update(dt);
    render();
    if (isMobile) updateCooldownUI();
    requestAnimationFrame(loop);
  }

function setupMobileControlsArena(){
  const base  = DOM.joyBase;
  const stick = DOM.joyStick;
  if (!base || !stick) return;

  const HAS_POINTER = 'PointerEvent' in window;

  let joyPointerId = null;
  const setStick = (dx, dy) => {
    stick.style.left = `${50 + dx*100}%`;
    stick.style.top  = `${50 + dy*100}%`;
    stick.style.transform = `translate(-50%, -50%)`;
  };

  // Blocca gesture/scroll nel joystick
  base.style.touchAction = 'none';

  const start = (e) => {
    if (joyPointerId !== null) return;
    if (HAS_POINTER) e.preventDefault();
    joyPointerId = HAS_POINTER ? e.pointerId : 'touch';
    G.joy.active = true;
    setStick(0,0);
  };

  const move = (e) => {
    if (!G.joy.active) return;
    if (HAS_POINTER) {
      if (e.pointerId !== joyPointerId) return;
      if (HAS_POINTER) e.preventDefault();
    }
    const rect = base.getBoundingClientRect();
    const radius = Math.max(1, rect.width * 0.5);
    const cx = rect.left + rect.width/2;
    const cy = rect.top  + rect.height/2;
    const x = HAS_POINTER ? e.clientX : e.touches[0].clientX;
    const y = HAS_POINTER ? e.clientY : e.touches[0].clientY;

    const dx = (x - cx) / radius;
    const dy = (y - cy) / radius;

    const len = Math.hypot(dx, dy);
    const k = len > 0.12 ? Math.min(1, len) : 0;
    const vx = k ? (dx/len)*k : 0;
    const vy = k ? (dy/len)*k : 0;

    G.joy.vx = Number.isFinite(vx) ? vx : 0;
    G.joy.vy = Number.isFinite(vy) ? vy : 0;
    setStick(G.joy.vx * 0.35, G.joy.vy * 0.35);
  };

  const end = (e) => {
    if (HAS_POINTER && e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    G.joy.active = false;
    G.joy.vx = 0; G.joy.vy = 0;
    setStick(0,0);
    // niente releasePointerCapture: non stiamo più catturando
  };

  if (HAS_POINTER) {
    base.addEventListener('pointerdown',  start, { passive:false });
    base.addEventListener('pointermove',  move,  { passive:false });
    base.addEventListener('pointerup',    end,   { passive:false });
    base.addEventListener('pointercancel',end,   { passive:false });
    // opzionale: se esce dall’area col dito
    base.addEventListener('pointerleave', end,   { passive:false });
  } else {
    // Con touch, lasciamo passive:true (il touch-action:none fa il blocco gesture)
    base.addEventListener('touchstart',  start, { passive:true });
    base.addEventListener('touchmove',   move,  { passive:true });
    base.addEventListener('touchend',    end,   { passive:true });
    base.addEventListener('touchcancel', end,   { passive:true });
  }
}




let arenaStyleEl = null;
function loadArenaCSS() {
  if (arenaStyleEl) return;
  arenaStyleEl = document.createElement('link');
  arenaStyleEl.rel = 'stylesheet';
  arenaStyleEl.href = 'arena.css'; // <--- percorso: metti quello giusto
  arenaStyleEl.onload  = () => console.log('[Arena CSS] loaded:', arenaStyleEl.href);
  arenaStyleEl.onerror = () => console.warn('[Arena CSS] FAILED:', arenaStyleEl.href);
  document.head.appendChild(arenaStyleEl);
}
function unloadArenaCSS() {
  if (!arenaStyleEl) return;
  arenaStyleEl.remove();
  arenaStyleEl = null;
}

function prettifyName(key) {
  return ({
    basic_attack: 'Attacco',
   repulse: 'Repulsione',
    ball: 'Ball'
   })[key] || key.replace(/_/g, ' ');
  }
// sostituisci la tua setBtnCooldownUI con questa
function setBtnCooldownUI(btn, remainingMs, totalMs){
  if (!btn) return;
  const ov  = btn.querySelector('.cd')      || btn.querySelector('.arena-cd');
  const txt = btn.querySelector('.cd-txt')  || btn.querySelector('.arena-cd-txt');
  if (!ov || !txt) return;

  const r = Math.max(0, remainingMs);
  if (r <= 0) {
    btn.classList.remove('on-cd');
    ov.style.height = '0%';
    txt.textContent = '';
    return;
  }

  btn.classList.add('on-cd');
  const k = Math.max(0, Math.min(1, r / Math.max(1, totalMs)));
  ov.style.height = `${k * 100}%`;

  const secs = r / 1000;
  txt.textContent = secs >= 10 ? String(Math.ceil(secs))
                               : secs.toFixed(1);
}


function getMoveCDMs(key){
  return (MOVES[key]?.cooldownMs) ?? 400;
}

function updateCooldownUI(){
  const now = performance.now();
const keyC   = G?.playerMoves?.C || null;
const untilC = keyC ? (G.pet._cooldowns?.[keyC] || 0) : 0;
setBtnCooldownUI(DOM.btnSkill, Math.max(0, untilC - now), keyC ? getMoveCDMs(keyC) : 0);
  const keyA   = G?.playerMoves?.A || 'basic_attack';
  const untilA = G.pet._cooldowns?.[keyA] || 0;
  setBtnCooldownUI(DOM.btnAtk, Math.max(0, untilA - now), getMoveCDMs(keyA));

  const keyB   = G?.playerMoves?.B || 'repulse';
  const untilB = G.pet._cooldowns?.[keyB] || 0;
  setBtnCooldownUI(DOM.btnChg, Math.max(0, untilB - now), getMoveCDMs(keyB));

  const dashMs = Math.max(0, (G.pet.cdDash || 0) * 1000);
  setBtnCooldownUI(DOM.btnDash, dashMs, (Cfg.dashCd || 2.5) * 1000);
}

function hydrateActionButtons(){
  const ids = ['arena-attack-btn','arena-charge-btn','arena-dash-btn','arena-skill-btn'];
  for (const id of ids){
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.add('action-btn');
    if (!el.querySelector('.cd')) el.insertAdjacentHTML('beforeend','<div class="cd"></div><div class="cd-txt"></div>');
  }
}

// Forza layout a croce in basso-destra anche se altri stili JS li spostano
function forceArenaActionCrossLayout() {
  const ov = document.getElementById('arena-actions-overlay');
  if (!ov) return;

  // Contenitore in basso-destra
  ov.style.setProperty('position','fixed','important');
  ov.style.setProperty('right','calc(env(safe-area-inset-right,0px) + 12px)','important');
  ov.style.setProperty('bottom','calc(env(safe-area-inset-bottom,0px) + 12px)','important');
  ov.style.setProperty('width','200px','important');
  ov.style.setProperty('height','200px','important');
  ov.style.setProperty('pointer-events','none','important');
  ov.style.setProperty('z-index','10030','important');

  const place = (id, rules) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('position','absolute','important');
    el.style.setProperty('width','66px','important');
    el.style.setProperty('height','66px','important');
    el.style.setProperty('border-radius','9999px','important');
    el.style.setProperty('left','auto','important');
    el.style.setProperty('right','auto','important');
    el.style.setProperty('top','auto','important');
    el.style.setProperty('bottom','auto','important');
    el.style.setProperty('transform','none','important');
    for (const [k,v] of Object.entries(rules)) el.style.setProperty(k, v, 'important');
  };

  // → destra (Attacco)
  place('arena-attack-btn', { right:'0', top:'50%', transform:'translate(0,-50%)' });
  // ↑ su (Repulsione)
  place('arena-charge-btn', { right:'50%', top:'0', transform:'translate(50%,0)' });
  // ↓ giù (Dash)
  place('arena-dash-btn',   { right:'50%', bottom:'0', transform:'translate(50%,0)' });
  // ← sinistra (Skill)
  place('arena-skill-btn',  { left:'0', top:'50%', transform:'translate(0,-50%)' });
}


  // ---------- Start / End ----------
async function startArenaMinigame() {
  // reset cancelli
  Gates.state = 'idleUp';
  Gates.frame = 0;
  Gates.t = 0;
  Gates.pendingIngress = 0;
  Gates.spawnedThisWave = false;

  // hook DOM
  DOM.modal   = document.getElementById('arena-minigame-modal');
  DOM.canvas  = document.getElementById('arena-canvas');
  DOM.hudBox  = document.getElementById('arena-hud');
  DOM.btnAtk  = document.getElementById('arena-attack-btn');
  DOM.btnChg  = document.getElementById('arena-charge-btn');
  DOM.btnDash = document.getElementById('arena-dash-btn');
  DOM.btnSkill= document.getElementById('arena-skill-btn');
  DOM.joyBase = document.getElementById('arena-joy-base');
  DOM.joyStick= document.getElementById('arena-joy-stick');
  DOM.joyOverlay     = document.getElementById('arena-joystick-overlay');
  DOM.actionsOverlay = document.getElementById('arena-actions-overlay');

  if (!DOM.canvas) { console.error('[Arena] canvas mancante'); return; }
  ctx = DOM.canvas.getContext('2d');

  loadArenaCSS();
  forceArenaActionCrossLayout();
  hydrateActionButtons();

  // assicurati che i bottoni abbiano overlay di cooldown
  function ensureCooldownOverlay(btn){
    if (!btn) return;
    if (btn.querySelector('.cd, .arena-cd')) return;
    btn.insertAdjacentHTML('beforeend','<div class="cd"></div><div class="cd-txt"></div>');
  }
  [DOM.btnAtk, DOM.btnChg, DOM.btnDash, DOM.btnSkill].forEach(ensureCooldownOverlay);

  // === 1) PRELOAD con barra ===================================
  showArenaLoader();
  setArenaLoader(0, 'Preparazione…');

  let preload;
  try {
    // pet obbligatorio
    const pid = getPid();
    if (!pid) { showArenaToast('Crea il pet prima di entrare nell\'arena', true); hideArenaLoader(); return; }

    preload = await preloadArenaResources((p,msg)=>setArenaLoader(p,msg));
  } catch (e) {
    console.error('[Arena] preload failed', e);
    setArenaLoader(1, 'Errore nel caricamento');
    showArenaToast('Errore durante il caricamento dell’Arena', true);
    hideArenaLoader();
    return;
  }
  hideArenaLoader();

  // Applica stats + mosse equipaggiate
  const { stats, moves } = preload;

  // HP & stats
  G.hpMax = Math.max(1, Math.round(Number(stats?.hp_max ?? 100)));
  G.hpCur = G.hpMax;
  G.atkP  = Math.max(1, Math.round(Number(stats?.attack_power  ?? 50)));
  G.defP  = Math.max(1, Math.round(Number(stats?.defense_power ?? 50)));
  G.spdP  = Math.max(1, Math.round(Number(stats?.speed_power   ?? 50)));

  // Mosse/bonus
  G.playerMoves = { A: moves.A, B: moves.B, C: moves.C };
  G.playerAtkBonus = moves.atkBonus || 0;

  // label pulsanti
  const setBtnLabel = (btn, txt) => {
    if (!btn) return;
    let span = btn.querySelector('.lbl');
    if (!span) { span = document.createElement('span'); span.className = 'lbl'; btn.insertBefore(span, btn.firstChild); }
    span.textContent = txt;
  };
  setBtnLabel(DOM.btnAtk,   prettifyName(moves.A));
  setBtnLabel(DOM.btnChg,   prettifyName(moves.B));
  setBtnLabel(DOM.btnSkill, moves.C ? prettifyName(moves.C) : '—');

  // bind azioni (una sola volta)
  if (!DOM._abBound) {
    const bindAction = (el, handler) => {
      if (!el) return;
      const fire = (e)=>{ e.preventDefault(); e.stopPropagation(); if (G.playing) handler(); };
      el.addEventListener('pointerdown', fire, { passive:false });
      el.addEventListener('touchstart',  fire, { passive:false });
    };
    bindAction(DOM.btnAtk,   () => useArenaMove(G.pet, G.playerMoves.A));
    bindAction(DOM.btnChg,   () => useArenaMove(G.pet, G.playerMoves.B));
    bindAction(DOM.btnSkill, () => { if (G.playerMoves.C) useArenaMove(G.pet, G.playerMoves.C); });
    bindAction(DOM.btnDash,  () => tryDash());

    // tastiera
    window.addEventListener('keydown', (e) => {
      if (!G.playing || e.repeat) return;
      if (e.key === 'z' || e.key === 'Z') useArenaMove(G.pet, G.playerMoves.A);
      if (e.key === 'x' || e.key === 'X') useArenaMove(G.pet, G.playerMoves.B);
      if (e.key === 'c' && G.playerMoves.C) useArenaMove(G.pet, G.playerMoves.C);
    }, { passive: true });

    DOM._abBound = true;
  }

  // === 2) HUD mobile/desktop ==================================
  if (isMobile) {
    DOM.joyOverlay?.classList.remove('hidden');
    DOM.actionsOverlay?.classList.remove('hidden');
    if (DOM.hudBox) {
      DOM.hudBox.classList.remove('hidden');
      DOM.hudBox.style.display = '';
      DOM.hudBox.classList.add('show');
    }
    DOM.btnAtk  && (DOM.btnAtk.style.display  = '');
    DOM.btnChg  && (DOM.btnChg.style.display  = '');
    DOM.btnDash && (DOM.btnDash.style.display = '');
  } else {
    DOM.joyOverlay?.classList.add('hidden');
    DOM.actionsOverlay?.classList.add('hidden');
    if (DOM.hudBox) {
      DOM.hudBox.classList.remove('show');
      DOM.hudBox.style.display = 'none';
    }
    DOM.btnAtk  && (DOM.btnAtk.style.display  = 'none');
    DOM.btnChg  && (DOM.btnChg.style.display  = 'none');
    DOM.btnDash && (DOM.btnDash.style.display = 'none');
  }
  setupMobileControlsArena();

  // === 3) Reset partita =======================================
  G.wave = 0;
  G.score = 0;
  G.enemies = [];
  G.projectiles = G.projectiles || [];

  G.pet = {
    x: (Cfg.roomW/2)|0, y: (Cfg.roomH/2)|0,
    px: 0, py: 0, dirX: 0, dirY: 0,
    moving: false, iFrameUntil: 0,
    cdAtk: 0, cdChg: 0, cdDash: 0,
    facing: 'down',
    animTime: 0,
    stepFrame: 0
  };

  // gli sprite sono già in G.sprites.* dal preload
  await enterFullscreen?.();
  resizeCanvas();
  syncHUD();

  // === 4) Avvio loop ==========================================
  DOM.modal?.classList.remove('hidden');
  DOM.modal?.classList.add('show');

  if (!DOM._arenaBound) {
    const bindTap = (el, handler) => {
      if (!el) return;
      const doIt = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        e.stopPropagation();
        if (G.playing) handler();
      };
      ['pointerdown','touchstart','click'].forEach(t =>
        el.addEventListener(t, doIt, { passive:false })
      );
    };
    DOM._arenaBound = true;
  }

  G.lastT = performance.now();
  G.playing = true;
  loop();
}




  /*async function gameOver() {
    G.playing = false;
    DOM.modal?.classList.add('hidden');
    DOM.hudBox?.classList.remove('show');
    DOM.hudBox.classList.add('hidden');
  unloadArenaCSS(); // ← via lo stile

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
*/

async function gameOver() {
  G.playing = false;

  // UI off
  DOM.modal?.classList.add('hidden');
  DOM.hudBox?.classList.remove('show');
  DOM.hudBox?.classList.add('hidden');
  unloadArenaCSS(); // ← via lo stile

  // ⬅️ Esci dallo schermo intero se attivo (try/catch per sicurezza)
  try {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement) {
      if (doc.exitFullscreen)       await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      else if (doc.msExitFullscreen)     await doc.msExitFullscreen();
    }
  } catch (err) {
    console.warn('[Arena] exit fullscreen failed', err);
  }

  // ricompense
  const fun = 10 + Math.round(G.wave * 1.2);
  const exp = 10 + Math.round(G.score * 0.4);

  try {
    if (typeof window.updateFunAndExpFromMiniGame === 'function') {
      await window.updateFunAndExpFromMiniGame(fun, exp);
    }
    await sb().rpc('submit_arena_score', { p_wave: G.wave|0, p_score: G.score|0 });

    const coins = Math.floor(G.score / 10);
    if (coins > 0) await window.addGettoniSupabase?.(coins);
    await window.refreshResourcesWidget?.();
  } catch (e) {
    console.error('[Arena] end rewards', e);
  }

  G.keys.clear();
}
//////////////////////MOSSE//////////////////////////

// tienilo in uno scope accessibile sia a useArenaMove che qui
const arenaAPI = {
  tileSize: () => G.tile,
  getAtk: () => G.atkP,
  getDef: (e) => e.defP ?? 50,
  computeDamage, // tua funzione

  targetsInCone(self, reachTiles, coneDeg){
    const R = reachTiles * G.tile;
    const half = (coneDeg * Math.PI / 180) / 2;

    const dirAngle =
      self.facing === 'right' ? 0 :
      self.facing === 'down'  ?  Math.PI/2 :
      self.facing === 'left'  ?  Math.PI   :
                                -Math.PI/2;

    const out = [];
    for (const e of G.enemies){
      if (!e || e.hp <= 0) continue;
      const dx = e.px - self.px, dy = e.py - self.py;
      const d  = Math.hypot(dx, dy);
      if (d > R) continue;
      let a = Math.atan2(dy, dx) - dirAngle;
      while (a >  Math.PI) a -= 2*Math.PI;
      while (a < -Math.PI) a += 2*Math.PI;
      if (Math.abs(a) <= half) out.push(e);
    }
    return out;
  },

  targetsInRadius(self, radiusTiles){
    const R = radiusTiles * G.tile;
    const out = [];
    for (const e of G.enemies){
      if (!e || e.hp <= 0) continue;
      const dx = e.px - self.px, dy = e.py - self.py;
      if (dx*dx + dy*dy <= R*R) out.push(e);
    }
    return out;
  },

  dirFromTo(a,b){
    const dx = b.px - a.px, dy = b.py - a.py;
    const d  = Math.hypot(dx, dy) || 1;
    return { x: dx/d, y: dy/d };
  },

  addVelocity(e, dir, k){
    e.vx = (e.vx || 0) + dir.x * k;
    e.vy = (e.vy || 0) + dir.y * k;
  },

  falloff(self, t, Rtiles, min=0.5, max=1){
    const R = Rtiles * G.tile;
    const dx = t.px - self.px, dy = t.py - self.py;
    const d  = Math.hypot(dx, dy);
    const k  = Math.max(0, Math.min(1, 1 - d / R)); // 0..1 (vicino=1)
    return min + (max - min) * k;
  },

applyDamage(target, dmg){
  const before = target.hp|0;
  target.hp = Math.max(0, before - (dmg|0));

  // se è un nemico ed è appena morto → 2% drop
  if (before > 0 && target.hp <= 0 && target.type) {
    if (Math.random() < DROP_CHANCE) {
      // centra nel tile del nemico
      spawnMoveDropAt(target.px + G.tile/2, target.py + G.tile/2);
    }
  }
  return before - target.hp;
},


  playFX(key, self){
    if (key === 'shockwave') spawnShockwave(self.px, self.py, 2.2 * G.tile);
  },
};
// direzione -> vettore normalizzato
function facingToVec(face){
  return face === 'right' ? {x: 1, y: 0}
       : face === 'left'  ? {x:-1, y: 0}
       : face === 'down'  ? {x: 0, y: 1}
       :                     {x: 0, y:-1};
}

arenaAPI.spawnProjectile = function(spec){
  const dir = facingToVec(spec.facing || 'right');
  G.projectiles.push({
    x: spec.x, y: spec.y,
    vx: dir.x * (spec.speed || 500),
    vy: dir.y * (spec.speed || 500),
    leftPx: Math.max(1, spec.maxDistPx || (6 * G.tile)),
    r: Math.max(2, spec.radiusPx || (0.25 * G.tile)),
    base: Math.max(1, spec.basePower || 50),
    pierce: !!spec.pierce,
    hitSet: new WeakSet(),       // per non colpire lo stesso nemico 2 volte
  });
};


// 3) uso: le chiavi arrivano dalla home (equip A/B)
function useArenaMove(p, moveKey){
  if (!p || !G.playing) return;
  const def = MOVES[moveKey] || MOVES.basic_attack;

  const now = performance.now();
  const cd  = (p._cooldowns ??= {});
  const ms  = def.cooldownMs ?? 400;

  if ((cd[moveKey] || 0) > now) return; // ancora in CD
  cd[moveKey] = now + ms;
  startCooldownUIByKey(moveKey, ms);

  const res = def.run(arenaAPI, p) || { damageDealt: 0 };
  if (res.damageDealt > 0) {
    G.score += 1 + Math.floor(res.damageDealt/5);
    syncHUD?.();
  }
}


// *** Cooldown config (ms) – tienilo in scope globale ***
const CD_MS = {
  dash: Math.round((Cfg?.dashCd ?? 2.5) * 1000) // se vuoi usarlo in tryDash
};

// mappa mossa → id bottone
const ACTION_BTN_ID = {
  basic_attack: 'arena-attack-btn',
  repulse: 'arena-charge-btn',
  dash: 'arena-dash-btn'
};

// UI cooldown helper
function startCooldownUIByKey(moveKey, ms){
  // risolvi bottone per slot A/B/C o dash
  let id = null;
  if (G.playerMoves?.A === moveKey) id = 'arena-attack-btn';
  else if (G.playerMoves?.B === moveKey) id = 'arena-charge-btn';
  else if (G.playerMoves?.C === moveKey) id = 'arena-skill-btn';
  else if (moveKey === 'dash') id = 'arena-dash-btn';
  if (!id) return;

  const el  = document.getElementById(id);
  if (!el) return;
  const bar = el.querySelector('.cd') || el.querySelector('.arena-cd');
  const txt = el.querySelector('.cd-txt') || el.querySelector('.arena-cd-txt');
  if (!bar || !txt) return;

  el.classList.add('on-cd');
  const t0 = performance.now();
  function tick(){
    if (!el.isConnected) return;
    const elapsed = performance.now() - t0;
    const k = Math.min(1, elapsed / ms);
    bar.style.height = Math.round(k * 100) + '%';
    const left = Math.max(0, ms - elapsed);
    txt.textContent = left >= 10000 ? String(Math.ceil(left/1000)) : (left/1000).toFixed(1);
    if (k < 1) requestAnimationFrame(tick);
    else { el.classList.remove('on-cd'); bar.style.height = '0%'; txt.textContent = ''; }
  }
  tick();
}



// Utility angolo
function normalizeAngle(a) {
  while (a >  Math.PI) a -= 2*Math.PI;
  while (a < -Math.PI) a += 2*Math.PI;
  return a;
}
  // Expose
  window.startArenaMinigame = startArenaMinigame;

  // ---------- Input ----------
  const keyMap = {
    ArrowLeft: 'left', a: 'left',
    ArrowRight:'right', d: 'right',
    ArrowUp:   'up',    w: 'up',
    ArrowDown: 'down',  s: 'down',
    ' ': 'dash'
  };

  const isFormish = (el) =>
  el && (el.closest('form, input, textarea, select, button, a, .form-box, .modal'));
  
  const isTyping = (e) =>
  e.target && (e.target.matches('input, textarea, [contenteditable="true"]') ||
               e.target.closest('input, textarea, [contenteditable="true"]'));



  document.addEventListener('keydown', (e) => {
    const m = keyMap[e.key];
    if (!m) return;
    e.preventDefault();
    if (!G.playing) return;
    //if (m === 'atk') return tryAttackBasic();
    //if (m === 'chg') return tryAttackCharged();
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





