
import { MOVES } from './mosse.js';
// --- Mobile error overlay (debug) ---
// Incolla questo blocco in cima al file, fuori dalla tua IIFE
(function mobileErrorOverlay(){
  function install(){
    const box = document.createElement('div');
    box.id = '__errbox';
    box.style.cssText =
      'position:fixed;left:8px;bottom:8px;right:8px;max-height:40vh;overflow:auto;' +
      'background:rgba(0,0,0,.8);color:#fff;font:12px/1.4 monospace;padding:8px;' +
      'z-index:999999;border-radius:8px;display:none';
    box.title = 'Tocca per nascondere';
    box.addEventListener('click', ()=> box.style.display='none');
    document.body.appendChild(box);

    function show(msg){
      box.style.display = 'block';
      box.textContent = String(msg);
    }

    // intercetta errori JS e Promise rifiutate
    window.onerror = (m, s, l, c) => { show(`[ERR] ${m} @ ${s}:${l}:${c}`); };
    window.onunhandledrejection = (ev) => { show(`[Promise] ${ev.reason}`); };

    // opzionale: per mostrare messaggi manualmente da console
    window._showMobileError = show;
  }

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once:true });
})();

const sb = () => window.supabaseClient;
const getPid = () => window.petId;

async function awardMoveToInventory(moveKey){
  const pid = getPid();
  if (!pid || !sb()) { console.warn('[Treasure] missing petId/client'); return; }
  try {
    const { error } = await sb().rpc('award_move_drop', {
      p_pet_id: pid,
      p_move_key: moveKey
    });
    if (error) throw error;
    // aggiorna la UI/Inventario se hai un loader già esposto
    await window.loadMoves?.();
    showTreasureToast?.(`Nuova mossa: ${moveKey}`);
  } catch (e) {
    console.error('[Treasure] award move', e);
    showTreasureToast?.('Errore salvataggio mossa', true);
  }
}

// mini toast (facoltativo)
function showTreasureToast(txt, isErr=false){
  const el = document.createElement('div');
  Object.assign(el.style,{
    position:'fixed', left:'50%', top:'12%', transform:'translateX(-50%)',
    padding:'10px 14px', borderRadius:'10px',
    background: isErr ? '#8b1f1f' : '#0f172a', color:'#fff',
    font:'600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial',
    boxShadow:'0 6px 18px rgba(0,0,0,.22)', zIndex:10050, opacity:'0',
    transition:'opacity .15s ease'
  });
  el.textContent = txt; document.body.appendChild(el);
  requestAnimationFrame(()=> el.style.opacity='1');
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(),180); }, 1300);
}

// === MINI GIOCO CACCIA AL TESORO — versione “no-globals” (modulo IIFE) ===
(() => {
  // ---------- CONFIG ----------
  const Cfg = {
    gridW: 3,
    gridH: 3,
    roomW: 9,
    roomH: 8,
    petSpeedDesktop: 180,
    petSpeedMobile: 95,
    enemySpeedDesktop: 100,
    enemySpeedMobile: 35,
    revealMs: 900,
    powerupMs: 2000,
    baseTimerMs: 1000,
  };
// Tuning collisioni (più permissive)
////////////////////
  const G = {
    // dinamiche
    hudDirty: true,
    playing: false,
    level: 1,
    score: 0,
    timeLeft: 0,
    speedMul: 1,
    exiting: false,
    timerId: null,
    coinsCollected: 0,

    // potenziamenti
    activePowerup: null,     // 'speed' | 'slow' | null
    powerupExpiresAt: 0,
    slowExpiresAt: 0,

    // mondo
    rooms: [],
    petRoom: { x: 0, y: 0 },
    objects: {},
    enemies: {},
    powerups: {},
    exitRoom: { x: 0, y: 0 },
    exitTile: { x: 0, y: 0 },
    skulls: [],

    //talpa
    mole: {
    enabled: false,
    roomX: 0, roomY: 0,
    x: 0, y: 0,            // cella
    phase: 'emerge1',      // 'emerge1'|'emerge2'|'hold'|'retreat2'|'retreat1'|'gap'
    t: 0,                  // timer fase corrente
      },

    // pet
    pet: {
      x: 1, y: 1,
      px: 0, py: 0,
      animTime: 0,
      dirX: 0, dirY: 0,
      moving: false,
      direction: 'down',
      stepFrame: 0,
    },

   

    // input
    keysStack: [],

    // sprites
    sprites: {
      pet: null,
      goblin: null,
      coin: null,
      enemy: null,
      exit: null,
      wall: null,
      bg: null,
      powerup: null,
    },
  };

  G.renderCache = {
  rooms: {},   // { "x,y": { canvas, tile } }
  tile: 0,
};
const roomKey = (x, y) => `${x},${y}`;

const PHYS = {
  bodyShrink: 12, // prima usavi ~20 → più alto = hitbox più piccola = più permissivo
  skin: 2,        // margine anti-incastro (prima 2). Più alto = più permissivo
  maxStepFrac: 1/3,
};
const SHOW_TINY_HUD = false;
// === BAT ATLAS (enemy sprites) ===
const BAT_TILE = 48;

// prima era 6 → con 4 risultano ~+12% più grandi
const ENEMY_INSET = 2;
const ENEMY_SCALE_GOBLIN = 1.40;   // 12% più grandi da subito
const ENEMY_SCALE_BAT    = 1.00;   // i pipistrelli restano “base” (cambia se vuoi)
const ENEMY_CLAMP_TO_TILE = false;  // true = non superare la tile

const BAT_MARGIN_X = 0, BAT_MARGIN_Y = 0;
const BAT_SPACING_X = 0, BAT_SPACING_Y = 0;

const bPick = (c, r, w=1, h=1) => ({
  sx: BAT_MARGIN_X + c * (BAT_TILE + BAT_SPACING_X),
  sy: BAT_MARGIN_Y + r * (BAT_TILE + BAT_SPACING_Y),
  sw: w * BAT_TILE,
  sh: h * BAT_TILE,
});

function buildBatFromAtlas() {
  const cfg = {
    sheetSrc: `${enemyAtlasBase}/chara_bat.png`,
    // stesse righe del goblin, sheet 48×48
    rows: {
      walkDown:  2,
      walkRight: 3,
      walkUp:    4,
      atkDown:   5,
      atkRight:  6,
      atkUp:     7,
    },
    walkCols:   [0,1,2,3],
    attackCols: [0,1,2,3],
    // idle su due righe: 0 e 1 (3+3 frame)
    idleMap: [
      [0,0],[1,0],[2,0],
      [0,1],[1,1],[2,1],
    ],
  };

  if (!G.sprites.batSheet) {
    G.sprites.batSheet = new Image();
    G.sprites.batSheet.onload  = () => console.log('[BAT] atlas ready');
    G.sprites.batSheet.onerror = (e) => console.error('[BAT] atlas load fail', e);
    G.sprites.batSheet.src = cfg.sheetSrc;
  }

  const mkRow   = (row, cols)   => cols.map(c => bPick(c, row));
  const mkPairs = (pairs)       => pairs.map(([c, r]) => bPick(c, r));
  const idle    = mkPairs(cfg.idleMap);

  G.sprites.batFrames = {
    idle: idle.length ? idle : mkRow(cfg.rows.walkDown, [0]),
    walk: {
      down:  mkRow(cfg.rows.walkDown,  cfg.walkCols),
      right: mkRow(cfg.rows.walkRight, cfg.walkCols),
      up:    mkRow(cfg.rows.walkUp,    cfg.walkCols),
    },
    attack: {
      down:  mkRow(cfg.rows.atkDown,   cfg.attackCols),
      right: mkRow(cfg.rows.atkRight,  cfg.attackCols),
      up:    mkRow(cfg.rows.atkUp,     cfg.attackCols),
    },
  };
}
const TILE = () => (window.treasureTile || G.tileSize || 64);
const TREASURE_DROPPABLE_MOVES = ['ball'];
const TREASURE_MOVE_SPAWN_CHANCE = 0.005; // 0.5% a stanza dal livello 3 in su (modifica a piacere)
const TREASURE_MOVE_KEY = 'ball';        // oggi solo 'ball'
function pickRandomMoveKeyForTreasure(){
  // prendi solo chiavi esistenti in MOVES
  const pool = TREASURE_DROPPABLE_MOVES.filter(k => !!MOVES[k]);
  if (!pool.length) return null;
  return pool[(Math.random() * pool.length) | 0];
}

const MOVE_DROP_CFG = {
  tile: 16,
  // stesso tileset che usi in Arena per le icone (o cambia path se diverso)
  src: (isMobileOrTablet() ? 'assets/mobile/atlas' : 'assets/desktop/atlas') + '/LL_fantasy_dungeons.png'
};

// mappa la cella dell’icona della mossa (c,r) sul foglio delle icone
const MOVE_ICON_MAP = { ball: { c:12, r:5, w:1, h:1 } };

function pickMoveRect(k){
  const ic = MOVES?.[k]?.icon; // es. {c,r,w=1,h=1}
  const t  = MOVE_DROP_CFG.tile;
  if (ic) return { sx:(ic.c|0)*t, sy:(ic.r|0)*t, sw:(ic.w||1)*t, sh:(ic.h||1)*t };

  const m = MOVE_ICON_MAP[k];
  if (m)  return { sx:m.c*t, sy:m.r*t, sw:(m.w||1)*t, sh:(m.h||1)*t };
  return null;
}




// stato Treasure
const TreDrop = {
  img: null,              // spritesheet icone
  items: [],              // drop attivi [{key, px, py}]
};
function initTreasureMoveSheet(){
  if (TreDrop.img) return;
  const img = new Image();
  img.onload  = () => console.log('[Treasure MoveSheet] ok');
  img.onerror = (e) => console.warn('[Treasure MoveSheet] fail', e);
  img.src = MOVE_DROP_CFG.src;
  TreDrop.img = img;
}

// === GOBLIN ATLAS (enemy sprites) ===
// Imposta alla cella del tuo foglio (16/24/32...). Se il tuo atlas è 32px, usa 32.
const GOB_TILE = 48;

const GOB_MARGIN_X = 0, GOB_MARGIN_Y = 0;
const GOB_SPACING_X = 0, GOB_SPACING_Y = 0;

// Base path per device (desktop/mobile)
const enemyAtlasBase = isMobileOrTablet()
  ? 'assets/mobile/enemies'
  : 'assets/desktop/enemies';

// pick per il foglio del goblin
const gPick = (c, r, w=1, h=1) => ({
  sx: GOB_MARGIN_X + c * (GOB_TILE + GOB_SPACING_X),
  sy: GOB_MARGIN_Y + r * (GOB_TILE + GOB_SPACING_Y),
  sw: w * GOB_TILE,
  sh: h * GOB_TILE,
});

// draw con flip orizzontale (per "left")
function drawSheetClipMaybeFlip(sheet, clip, dx, dy, dw, dh, flipH=false) {
  if (!sheet || !sheet.complete || !clip) return;
  if (!flipH) {
    ctx.drawImage(sheet, clip.sx, clip.sy, clip.sw, clip.sh, dx, dy, dw, dh);
    return;
  }
  ctx.save();
  ctx.translate(dx + dw, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, clip.sx, clip.sy, clip.sw, clip.sh, 0, 0, dw, dh);
  ctx.restore();
}

/**
 * Costruisce tutti i frame a partire dalla POSIZIONE delle righe/colonne del tuo atlas.
 * Sotto trovi un mapping "tipico":
 *   riga 0: idle (6 col)         riga 3: walk up (4 col)         riga 6: attack up (4 col)
 *   riga 1: walk down (4 col)    riga 4: attack down (4 col)
 *   riga 2: walk right (4 col)   riga 5: attack right (4 col)
 *
 * Se il tuo sheet è diverso, cambia SOLO gli indici riga/colonne nel cfg.
 */
function buildGoblinFromAtlas() {
  const cfg = {
    sheetSrc: `${enemyAtlasBase}/chara_orc.png`,

    // RIGHE (lascia come sono se ti tornano)
    rows: {
      walkDown:  2,
      walkRight: 3,
      walkUp:    4,
      atkDown:   5,
      atkRight:  6,
      atkUp:     7,
    },

    // Colonne standard per walk/attack
    walkCols:   [0,1,2,3],
    attackCols: [0,1,2,3],

    // --- IDLE SU DUE RIGHE ---
    // Metti l’ordine ESATTO dei frame che vuoi ciclare (colonna, riga)
    // Esempio tipico: 3 frame in riga 0 + 3 frame in riga 1
    // Se hai un layout diverso, basta cambiare queste coppie:
    idleMap: [
      [0,0],[1,0],[2,0],  // primi 3 frame in riga 0
      [0,1],[1,1],[2,1],  // altri 3 frame in riga 1
    ],
  };
  if (!G.sprites.goblinSheet) {
    G.sprites.goblinSheet = new Image();
    G.sprites.goblinSheet.onload  = () => console.log('[GOBLIN] atlas ready');
    G.sprites.goblinSheet.onerror = (e) => console.error('[GOBLIN] atlas load fail', e);
    G.sprites.goblinSheet.src = cfg.sheetSrc;
  }

  const mkRow  = (row, cols)  => cols.map(c => gPick(c, row));
  const mkPairs = (pairs)     => pairs.map(([c, r]) => gPick(c, r));

  const idleFrames = mkPairs(cfg.idleMap);
  const safeIdle   = idleFrames.length ? idleFrames : mkRow(cfg.rows.walkDown, [0]);

  G.sprites.goblinFrames = {
    idle: safeIdle,
    walk: {
      down:  mkRow(cfg.rows.walkDown,  cfg.walkCols),
      right: mkRow(cfg.rows.walkRight, cfg.walkCols),
      up:    mkRow(cfg.rows.walkUp,    cfg.walkCols),
      // left = flip orizzontale di right (già gestito nel render)
    },
    attack: {
      down:  mkRow(cfg.rows.atkDown,   cfg.attackCols),
      right: mkRow(cfg.rows.atkRight,  cfg.attackCols),
      up:    mkRow(cfg.rows.atkUp,     cfg.attackCols),
      // left = flip orizzontale di right
    },
  };
}
const GOB_CENTER_RADIUS = 1;  // 1=3x3, 2=5x5, ecc.
const GOB_WALL_MARGIN   = 3;  // celle minime dai muri

// ---- ATLAS ----
const ATLAS_TILE = 16;                     // <— 16 px ciascun tassello (prova 32 se serve)
const atlasBase  = isMobileOrTablet() ? 'assets/mobile/atlas' : 'assets/desktop/atlas';

// helper: seleziona un rettangolo (w,h in celle, default 1×1)
const pick = (c, r, w = 1, h = 1) => ({
  sx: c * ATLAS_TILE,
  sy: r * ATLAS_TILE,
  sw: w * ATLAS_TILE,
  sh: h * ATLAS_TILE,
});

 // --- mappa dei ritagli (coordinate nell’atlas in celle 16x16)
// ESEMPIO: aggiorna con le tue coordinate (colonna, riga) reali!
const DECOR_DESKTOP = {
  // esempio: su mobile usi una riga diversa per il top1/top2
  top_base:  pick(11,1),   // <- PRIMA ERA top1

  // corpo superiore (secondo “blocco”)
  top_upper: pick(12,1),   // <- PRIMA ERA top2 (se non esiste, riusa top_base)

  // tappo/coperchio (bordino alto)
  top_cap:   pick(11,0),   // <- se non esiste, lo lasceremo facoltativo

  bottom:  pick(11,4), bottom2: pick(12,4),
  left1: pick(10,2), left2: pick(10,3), left3: pick(10,2),
  right1: pick(13,2), right2: pick(13,3), right3: pick(13,2),

  corner_tl_base:  pick(10,1),
  corner_tl_upper: pick(9,4), // seconda “fascia” verticale
  corner_tl_cap:   pick(10,0), // bordino/coperchio; opzionale

  corner_tr_base:  pick(13,1),
  corner_tr_upper: pick(8,4),
  corner_tr_cap:   pick(13,0),

  corner_tl_door_inner: pick(9,5),  // scegli il tuo CR, questo è solo un esempio
  corner_tr_door_inner: pick(8,5),
  
  corner_tl_upper_plain: pick(9,4),
  corner_tr_upper_plain: pick(8,4),


  // varianti “porta” (se nel tuo atlas esistono)
  corner_tl_door_base:  pick(9,5),
  corner_tl_door_upper: pick(9,5),
  corner_tl_door_cap:   pick(9,4),

  corner_tr_door_base:  pick(8,5),
  corner_tr_door_upper: pick(8,5),
  corner_tr_door_cap:   pick(8,4),

   // corner porta "singoli" (1 tile), usati per le spallette interne
   corner_tl_door: pick(9,5),
   corner_tr_door: pick(8,5),
   // (sotto li hai già)

  corner_bl: pick(10,4),
  corner_br: pick(13,4),
  corner_bl_door: pick(9,3), 
  corner_br_door: pick(8,3),

  floor: [ pick(11,2), pick(11,3), pick(12,2), pick(12,3) ],
  door_h1: pick(7,7), door_h2: pick(7,6),

};

// se ti serve, copia le stesse tre chiavi anche in DECOR_MOBILE

// --- mappa mobile (metti qui le coordinate alternative)
const DECOR_MOBILE = {
  // esempio: su mobile usi una riga diversa per il top1/top2
   top_base:  pick(11,1),   // <- PRIMA ERA top1

  // corpo superiore (secondo “blocco”)
  top_upper: pick(12,1),   // <- PRIMA ERA top2 (se non esiste, riusa top_base)

  // tappo/coperchio (bordino alto)
  top_cap:   pick(11,0),   // <- se non esiste, lo lasceremo facoltativo

  bottom:  pick(11,4), bottom2: pick(12,4),
  left1: pick(10,2), left2: pick(10,3), left3: pick(10,2),
  right1: pick(13,2), right2: pick(13,3), right3: pick(13,2),

  corner_tl_base:  pick(10,1),
  corner_tl_upper: pick(9,4), // seconda “fascia” verticale
  corner_tl_cap:   pick(10,0), // bordino/coperchio; opzionale

  corner_tr_base:  pick(13,1),
  corner_tr_upper: pick(8,4),
  corner_tr_cap:   pick(13,0),

  corner_tl_door_inner: pick(9,5),  // scegli il tuo CR, questo è solo un esempio
  corner_tr_door_inner: pick(8,5),
  
  corner_tl_upper_plain: pick(9,4),
  corner_tr_upper_plain: pick(8,4),


  // varianti “porta” (se nel tuo atlas esistono)
  corner_tl_door_base:  pick(9,5),
  corner_tl_door_upper: pick(9,5),
  corner_tl_door_cap:   pick(9,4),

  corner_tr_door_base:  pick(8,5),
  corner_tr_door_upper: pick(8,5),
  corner_tr_door_cap:   pick(8,4),

   // corner porta "singoli" (1 tile), usati per le spallette interne
   corner_tl_door: pick(9,5),
   corner_tr_door: pick(8,5),
   // (sotto li hai già)

  corner_bl: pick(10,4),
  corner_br: pick(13,4),
  corner_bl_door: pick(9,3), 
  corner_br_door: pick(8,3),

  floor: [ pick(11,2), pick(11,3), pick(12,2), pick(12,3) ],
  door_h1: pick(7,7), door_h2: pick(7,6),

};
const IS_MOBILE = isMobileOrTablet(); // oppure metti direttamente il regex

// scegli la mappa in base al device
let DECOR = IS_MOBILE ? DECOR_MOBILE : DECOR_DESKTOP;


function variantIndex(x, y, len) {
  // hash veloce e stabile per (x,y)
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % len;
}
// costruisce la tabella usata dal renderer
// vuoi usare:
// corner_tl_base:  pick(10,1)
// corner_tl_upper: pick(9,4)   // il “curvo”
// corner_tl_cap:   pick(10,0)
// (idem per TR)

function buildDecorFromAtlas() {
  const D = DECOR;
  const first = (...xs) => xs.find(Boolean) || null;

  G.sprites.decor = {
    // ── NORD a 2 blocchi + cap ───────────────────────────────────
    top_base:  D.top_base  || D.top1,
    top_upper: D.top_upper || D.top1,
    top_cap:   D.top_cap   || null,

    // Corner TL/TR del muro nord (3 layer)
    corner_tl_base:  D.corner_tl_base  || D.corner_tl || D.top_base  || D.top1,
    corner_tl_upper: D.corner_tl_upper || D.corner_tl || D.top_upper || D.top1,
    corner_tl_cap:   D.corner_tl_cap   || null,

    corner_tr_base:  D.corner_tr_base  || D.corner_tr || D.top_base  || D.top1,
    corner_tr_upper: D.corner_tr_upper || D.corner_tr || D.top_upper || D.top1,
    corner_tr_cap:   D.corner_tr_cap   || null,

    // Varianti "porta" per il muro nord (3 layer) — invariate
    corner_tl_door_base:  D.corner_tl_door_base  || D.corner_tl_base  || D.corner_tl,
    corner_tl_door_upper: D.corner_tl_door_upper || D.corner_tl_upper || D.corner_tl,
    corner_tl_door_cap:   D.corner_tl_door_cap   || D.corner_tl_cap   || null,

    corner_tr_door_base:  D.corner_tr_door_base  || D.corner_tr_base  || D.corner_tr,
    corner_tr_door_upper: D.corner_tr_door_upper || D.corner_tr_upper || D.corner_tr,
    corner_tr_door_cap:   D.corner_tr_door_cap   || D.corner_tr_cap   || null,

    corner_tl_door_inner: D.corner_tl_door_inner || null,
    corner_tr_door_inner: D.corner_tr_door_inner || null,


    // ── Lati e Sud ────────────────────────────────────────────────
    bottom: [D.bottom, D.bottom2].filter(Boolean),
    left:   [D.left1, D.left2, D.left3].filter(Boolean),
    right:  [D.right1, D.right2, D.right3].filter(Boolean),

    // Corner normali (singolo tile)
    corner_tl: D.corner_tl,
    corner_tr: D.corner_tr,
    corner_bl: D.corner_bl,
    corner_br: D.corner_br,

    // Corner "porta" (singolo tile) — orizzontali e basso (come prima)
    corner_tl_door: D.corner_tl_door
                 || D.corner_tl_door_base
                 || D.corner_tl_base
                 || D.corner_tl,
    corner_tr_door: D.corner_tr_door
                 || D.corner_tr_door_base
                 || D.corner_tr_base
                 || D.corner_tr,
    corner_bl_door: D.corner_bl_door
                 || D.corner_bl
                 || D.bottom
                 || D.bottom2,
    corner_br_door: D.corner_br_door
                 || D.corner_br
                 || D.bottom
                 || D.bottom2,

    // ── QUI LA MODIFICA IMPORTANTE ───────────────────────────────
    // Curva del MURO ESTERNO vicino alle PORTE VERTICALI:
    // usa proprio i tuoi corner_tl_upper / corner_tr_upper.
    // (Niente “spallette” interne: niente fallback a right/left e niente x=1/W-2.)
    leftDoorTop:      first(D.corner_tl_upper,  D.left_door_top),
    rightDoorTop:     first(D.corner_tr_upper,  D.right_door_top),
    leftDoorBottom:   first(D.corner_bl_door,   D.left_door_bottom,  D.bottom,  D.bottom2),
    rightDoorBottom:  first(D.corner_br_door,   D.right_door_bottom, D.bottom,  D.bottom2),

    // Varie
    exitClosed: D.door_h1,
    exitOpen:   D.door_h2,
    floor:      D.floor,
  };
}





/*
function debugAtlas(tag = '') {
  const d = G?.sprites?.decor;
  if (!d) { console.warn('[debugAtlas] decor non pronto', tag); return; }

  const toCR = a => Array.isArray(a)
    ? a.map(p => `${p.sx/16},${p.sy/16}`)
    : `${a.sx/16},${a.sy/16}`;

  console.log('--- DECOR', tag, '---');
  console.table({
    left:   toCR(d.left),
    right:  toCR(d.right),
    top:    toCR(d.top),
    bottom: toCR(d.bottom),
  });
}
window.debugAtlas = debugAtlas; // comodo da console */


const DEBUG_SIDES = false; // metti true per provare
function drawDebugSides(tiles, tile) {
  if (!DEBUG_SIDES) return;
  ctx.save(); ctx.globalAlpha = 0.25;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const t = tiles[y][x];
      if      (t === 'left')   ctx.fillStyle = '#00f';
      else if (t === 'right')  ctx.fillStyle = '#f00';
      else if (t === 'top')    ctx.fillStyle = '#0f0';
      else if (t === 'bottom') ctx.fillStyle = '#ff0';
      else continue;
      ctx.fillRect(x*tile, y*tile, tile, tile);
    }
  }
  ctx.restore();
}


function drawFloor(room) {
  const tile = window.treasureTile || 64;
  for (let y = 0; y < room.length; y++) {
    for (let x = 0; x < room[0].length; x++) {
      if (room[y][x] === 0) {                 // include anche le celle-bordo delle porte
        drawTileType(x, y, 'floor', tile);
      }
    }
  }
}





function maybeSwapDecorForDevice() {
  const nowMobile = isMobileOrTablet();
  const wanted = nowMobile ? DECOR_MOBILE : DECOR_DESKTOP;
  if (DECOR !== wanted) {
    DECOR = wanted;
    buildDecorFromAtlas();
    G.renderCache.rooms = {}; // cambia l’atlas/DECOR -> invalida i bake

  }
}

function initAtlasSprites() {

 G.sprites.atlas = new Image();
G.sprites.atlas.onload  = () => {
  console.log('[ATLAS] loaded', G.sprites.atlas.naturalWidth, 'x', G.sprites.atlas.naturalHeight);
  G.renderCache.rooms = {}; // invalida i bake statici
  render();                 // ridisegna con le spallette
};
G.sprites.atlas.onerror = (e) => console.error('[ATLAS] failed to load', G.sprites.atlas?.src, e);
G.sprites.atlas.src = `${atlasBase}/LL_fantasy_dungeons.png`;
}



// ---- Door width per device ----
const DOOR_SPAN_DESKTOP = 3;   // desktop: 3 celle
const DOOR_SPAN_MOBILE  = 2;   // mobile: 2 celle (più strette)
const getDoorSpan = () => (isMobileOrTablet() ? DOOR_SPAN_MOBILE : DOOR_SPAN_DESKTOP);

// indice dell’apertura centrata (supporta span pari e dispari)
function doorIndices(mid, span, min, max) {
  const k = Math.floor(span / 2);
  let start, end;
  if (span % 2) {           // dispari: es. 3 → mid-1..mid+1
    start = mid - k; end = mid + k;
  } else {                  // pari: es. 2 → mid..mid+1
    start = mid - (k - 1); end = mid + k;
  }
  start = Math.max(min, start);
  end   = Math.min(max, end);
  const arr = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

const MoleCfg = {
  emerge1: 0.5,   // terriccio
  emerge2: 1.0,   // testa
  hold:   0.8,    // tutta su (finestra di hit)
  retreat1: 0.25, // torna testa -> terriccio
  retreat2: 0.40, // terriccio -> sotto
  gap: 0.30,      // pausa prima del prossimo spot
};
  function isMobileOrTablet() {
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
  }
/*
  // Mobile tweaks
  if (isMobileOrTablet() || window.innerWidth < 800) {
    Cfg.roomW = 7;
    Cfg.roomH = 6;
  } */

      // Mobile tweaks
  if (isMobileOrTablet() || window.innerWidth < 800) {
    Cfg.roomW = 7;
    Cfg.roomH = 8;
  }

  const GRID_POOL_DESKTOP = [[2,2],[3,2],[2,3],[3,3],[4,3],[3,4]];
const GRID_POOL_MOBILE  = [[2,2],[3,2],[2,3],[3,3]];

function pickGridForLevel(level) {
  const pool = isMobileOrTablet() ? GRID_POOL_MOBILE : GRID_POOL_DESKTOP;
  // bias semplice: ogni 3 livelli “sblocca” una taglia più grande
  const band = Math.min(pool.length - 1, Math.floor((level - 1) / 3));
  // tieni un po’ di varietà
  const j = Math.max(0, band - 1);
  const k = Math.min(pool.length - 1, band + 1);
  const choice = pool[Math.floor(Math.random() * (k - j + 1)) + j];
  return { w: choice[0], h: choice[1] };
}

function setGridForLevel(level) {
  const { w, h } = pickGridForLevel(level);
  Cfg.gridW = w;
  Cfg.gridH = h;
}


  // ---------- DOM / HUD ----------
  const DOM = {
    coins: document.getElementById('treasure-minigame-coins'),
    score: document.getElementById('treasure-minigame-score'),
    level: document.getElementById('treasure-level'),
    timer: document.getElementById('treasure-timer'),
    modal: document.getElementById('treasure-minigame-modal'),
    canvas: document.getElementById('treasure-canvas'),
    bonus: document.getElementById('treasure-bonus-label'),
    petImg: document.getElementById('pet'),
    joyBase: document.getElementById('treasure-joystick-base'),
    joyStick: document.getElementById('treasure-joystick-stick'),
    exitBtn: document.getElementById('treasure-exit-btn'), 
  };
  let ctx = DOM.canvas.getContext('2d');
  const isTouch = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
  // ---------- STATO GIOCO ----------

// --- HUD compatto in alto a sinistra ---
function ensureTinyHud() {
  // 🔇 Disattiva del tutto l'HUD "tiny" in alto a sinistra
  const old = document.getElementById('treasure-hud');
  if (old) old.remove();

  // azzera i riferimenti così syncHud() lo ignora
  DOM.hudBox   = null;
  DOM.hudScore = null;
  DOM.hudLvl   = null;
  DOM.hudTime  = null;
  DOM.hudCoins = null;

  // assicura che la barra centrale sia visibile
  document.querySelector('.treasure-info-bar')?.classList.remove('hidden');

  // nient'altro da fare: usiamo solo la barra centrale
  return;
}

/*
function ensureTinyHud() {
  if (DOM.hudBox) return;

  const box = document.createElement('div');
  box.id = 'treasure-hud';
  box.style.cssText = [
    'position:absolute',
    'top:10px',
    'left:10px',
    'z-index:50',
    'min-width:160px',
    'padding:10px 12px',
    'color:#fff',
    'background:rgba(0,0,0,.55)',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
    'border-radius:12px',
    'box-shadow:0 6px 20px rgba(0,0,0,.25)',
    'font:600 12px/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'letter-spacing:.2px',
    'user-select:none',
    'pointer-events:none' // non blocca tocchi/click sul gioco
  ].join(';');

  box.innerHTML = `
    <div class="row"><span class="lab">Punteggio</span><span id="hud-score" class="val">0</span></div>
    <div class="row"><span class="lab">Livello</span><span id="hud-level" class="val">1</span></div>
    <div class="row"><span class="lab">Tempo Rimanente</span><span id="hud-time" class="val">0:00</span></div>
    <div class="row"><span class="lab">Monete da trovare</span><span id="hud-coins" class="val">0</span></div>
  `;

  // stile righe
  [...box.querySelectorAll('.row')].forEach(r => {
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:2px 0;gap:12px';
  });
  // stile label e value (piccolo tocco estetico)
  [...box.querySelectorAll('.lab')].forEach(l => l.style.cssText = 'opacity:.9');
  [...box.querySelectorAll('.val')].forEach(v => v.style.cssText = 'font-weight:800');

  // su mobile più compatto
  if (isMobileOrTablet()) {
    box.style.fontSize = '11px';
    box.style.padding = '8px 10px';
    box.style.borderRadius = '10px';
  }

  // monta dentro il modal del minigioco (così sta sopra al canvas)
  (DOM.modal || document.body).appendChild(box);

  // salva riferimenti
  DOM.hudBox   = box;
  DOM.hudScore = box.querySelector('#hud-score');
  DOM.hudLvl   = box.querySelector('#hud-level');
  DOM.hudTime  = box.querySelector('#hud-time');
  DOM.hudCoins = box.querySelector('#hud-coins');
} */

// utilità: formatta secondi in mm:ss
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Carica tutti i frame del PET (idle + 2 frame per direzione)
function buildPetSprites(petNum, assetBase) {
  const base = `${assetBase}/pets`;
  const CB = 'v=7'; // cache buster per forzare il refresh dei PNG

  const mk = (path) => {
    const img = new Image();
    img.onload  = () => console.log('[PET] ok:', path);
    img.onerror = (e) => console.error('[PET] fail:', path, e);
    img.src = `${base}/${path}?${CB}`;
    return img;
  };

  return {
    idle: mk(`pet_${petNum}.png`),
    right: [ mk(`pet_${petNum}_right1.png`), mk(`pet_${petNum}_right2.png`) ],
    left:  [ mk(`pet_${petNum}_left1.png`),  mk(`pet_${petNum}_left2.png`)  ],
    down:  [ mk(`pet_${petNum}_down1.png`),  mk(`pet_${petNum}_down2.png`)  ],
    up:    [ mk(`pet_${petNum}_up1.png`),    mk(`pet_${petNum}_up2.png`)    ],
  };
}

/////MUSICA
// --- AUDIO BGM ---
G.bgm = null;

function ensureBgm() {
  if (!G.bgm) {
    G.bgm = new Audio('assets/audio/treasure_theme.ogg'); // <-- tuo path .ogg
    G.bgm.loop = true;
    G.bgm.volume = 0.35;
    G.bgm.preload = 'auto';
  }
}
function playBgm() {
  ensureBgm();
  try { G.bgm.currentTime = 0; G.bgm.play(); } catch (_) {}
}
function stopBgm() {
  if (G.bgm) G.bgm.pause();
}


  // velocità base
  const enemyBaseSpeed = isMobileOrTablet() ? Cfg.enemySpeedMobile : Cfg.enemySpeedDesktop;
  const basePetSpeed   = isMobileOrTablet() ? Cfg.petSpeedMobile   : Cfg.petSpeedDesktop;

  // ---------- UTILS ----------
  function getCurrentBaseSpeed() {
    return isMobileOrTablet() ? Cfg.petSpeedMobile : Cfg.petSpeedDesktop;
  }
 function isPowerupActive(type = G.activePowerup) {
  return G.activePowerup === type && performance.now() < G.powerupExpiresAt;
}

function getCurrentPetSpeed() {
  return getCurrentBaseSpeed() * (G.speedMul || 1);
}

  function getAnimStep() {
    return (G.activePowerup === 'speed' && isPowerupActive('speed')) ? 0.12 : 0.18;
  }
  function distCenter(a, b) {
    const tile = window.treasureTile || 64;
    return Math.hypot(
      ((a.px ?? a.x * tile) + tile/2) / tile - ((b.px ?? b.x * tile) + tile/2) / tile,
      ((a.py ?? a.y * tile) + tile/2) / tile - ((b.py ?? b.y * tile) + tile/2) / tile
    );
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}


  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(()=>{});
  }

  // ---------- CANVAS SIZE ----------
function resizeTreasureCanvas() {

  //debugAtlas('resize'); 
  maybeSwapDecorForDevice();
  const wWin = window.innerWidth;
  const hWin = window.innerHeight;



  // spazio effettivo: tolgo HUD ecc.
  const hudH  = 70;
  const safeB = (window.visualViewport ? (window.visualViewport.height - hWin) : 0) || 0;
  let w = wWin;
  let h = hWin - hudH - safeB;

  // base tile calcolata sul room size logico (snap a multipli di 16)
  let raw = Math.min(w / Cfg.roomW, h / Cfg.roomH);
  if (isMobileOrTablet()) raw *= 0.82;

  // usa min/max che siano multipli di 16 per non perdere nitidezza
  const TILE_MIN = 32;   // 2×16
  const TILE_MAX = 128;  // 8×16

  // usa la costante globale ATLAS_TILE (definita in alto) oppure fallback a 16
  const step = (typeof ATLAS_TILE !== 'undefined') ? ATLAS_TILE : 16;
  let tile = Math.round(raw / step) * step; // snap a multipli di 16
  tile = Math.max(TILE_MIN, Math.min(TILE_MAX, tile));

  // retina: backing store ad alta risoluzione
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const padX = Math.max(0, Math.floor((w - Cfg.roomW * tile) / 2));
  const padY = Math.max(0, Math.floor((h - Cfg.roomH * tile) / 2));

  const canvas = DOM.canvas;
  canvas.width  = Cfg.roomW * tile * dpr;
  canvas.height = Cfg.roomH * tile * dpr;

  canvas.style.width  = `${Cfg.roomW * tile}px`;
  canvas.style.height = `${Cfg.roomH * tile}px`;
  canvas.style.marginLeft = `${padX}px`;
  canvas.style.marginRight = `${padX}px`;
  canvas.style.marginTop = `${padY}px`;
  canvas.style.marginBottom = `${padY}px`;

  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  window.treasureTile = tile;
  G.renderCache.rooms = {};
G.renderCache.tile = window.treasureTile || 64;
  G.tileSize = tile;
  G.roomWidth = Cfg.roomW;
  G.roomHeight = Cfg.roomH;

  const hudWrap = document.getElementById('treasure-hud') || DOM.modal;
  if (hudWrap) {
    if (isMobileOrTablet()) hudWrap.classList.add('hud-compact');
    else hudWrap.classList.remove('hud-compact');
  }

  if (G?.pet) resyncPetToGrid();
  resyncEnemiesToGrid();
  repositionExitBtn();       // <— così non si “taglia” mai

}
function setLoadingBackground(src){
  ensureLoadingOverlay();
  if (!_loadCard) return;
  // immagine + velo scuro per leggibilità dei testi
  _loadCard.style.background =
    `linear-gradient(rgba(2,6,23,.74), rgba(2,6,23,.74)), url('${src}') center/cover no-repeat`;
}

// ===== Overlay di caricamento + preloader immagini =====
let _loadBox, _loadCard,_loadBar, _loadTxt,_loadImg, _loadShownAt = 0;
const LOAD_MIN_SHOW_MS = 400;   // evita “flicker” se tutto carica istantaneo
const LOAD_TIMEOUT_MS  = 8000;  // per singola immagine

function ensureLoadingOverlay(){
  if (_loadBox) return;
  _loadBox = document.createElement('div');
  Object.assign(_loadBox.style,{
    position:'absolute', inset:0, display:'grid', placeItems:'center',
    background:'rgba(2,6,23,.92)', color:'#e5e7eb',
    zIndex: 100000, font:'600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial'
  });
 // prima: const card = document.createElement('div');
// ora:
const card = (_loadCard = document.createElement('div'));
Object.assign(card.style, {
  position:'relative',
  width:'min(92vw,420px)',
  padding:'16px',
  borderRadius:'14px',
  // niente background fisso qui: lo impostiamo con l'immagine
  border:'1px solid rgba(255,255,255,.08)',
  boxShadow:'0 10px 30px rgba(0,0,0,.4)',
  overflow:'hidden',             // così lo sfondo rispetta il border-radius
  backdropFilter:'blur(6px)',
  WebkitBackdropFilter:'blur(6px)'
});

  const title = document.createElement('div');
  title.textContent = 'Caricamento risorse…';
  Object.assign(title.style, { fontSize:'16px', marginBottom:'10px' });

  const barWrap = document.createElement('div');
  Object.assign(barWrap.style,{
    width:'100%', height:'10px', background:'rgba(255,255,255,.08)',
    borderRadius:'999px', overflow:'hidden'
  });
  _loadBar = document.createElement('div');
  Object.assign(_loadBar.style,{ height:'100%', width:'0%', background:'#60a5fa' });
  barWrap.appendChild(_loadBar);

  _loadTxt = document.createElement('div');
  Object.assign(_loadTxt.style,{ marginTop:'8px', opacity:.85 });
  _loadTxt.textContent = '0%';

  _loadImg = document.createElement('img');
_loadImg.alt = '';
Object.assign(_loadImg.style, {
  display:'none',          // si mostra quando ha caricato
  width:'100%',
  maxHeight:'180px',
  objectFit:'contain',     // non deforma
  marginTop:'12px',
  borderRadius:'12px',
  background:'rgba(255,255,255,.04)',
  border:'1px solid rgba(255,255,255,.06)'
});

  card.appendChild(title);
  card.appendChild(barWrap);
  card.appendChild(_loadTxt);
  card.appendChild(_loadImg);
  _loadBox.appendChild(card);

  // monta dentro il modal del minigioco se c’è, altrimenti sul body
  (DOM?.modal || document.body).appendChild(_loadBox);
}

function showLoadingOverlay(){
  ensureLoadingOverlay();
  _loadBar.style.width = '0%';
  _loadTxt.textContent = '0%';
  _loadBox.style.display = 'grid';
  _loadShownAt = performance.now();
}

function setLoadingProgress(p){ // p: 0..1
  const pct = Math.max(0, Math.min(1, p));
  const str = Math.round(pct * 100) + '%';
  _loadBar.style.width = str;
  _loadTxt.textContent = str;
}

function hideLoadingOverlay(){
  const wait = Math.max(0, LOAD_MIN_SHOW_MS - (performance.now() - _loadShownAt));
  setTimeout(()=>{ if (_loadBox) _loadBox.style.display = 'none'; }, wait);
}

// Recursivo: raccoglie tutte le Image presenti in un oggetto (array/oggetto annidati)
function collectImagesDeep(obj, out){
  if (!obj) return;
  if (obj instanceof Image) { out.push(obj); return; }
  if (Array.isArray(obj)) { for (const v of obj) collectImagesDeep(v, out); return; }
  if (typeof obj === 'object') { for (const k in obj) collectImagesDeep(obj[k], out); }
}

// Attende che una lista di Image sia caricata (o in errore / timeout)
function preloadImages(imgs, onProgress){
  let done = 0, total = imgs.length || 1;
  const tick = () => onProgress?.(++done / total);

  const one = (img) => new Promise((resolve) => {
    // già pronta?
    if (!img || (img.complete && img.naturalWidth > 0)) { tick(); return resolve(); }

    // se completa ma 0x0 → errore precedente: consideriamo “fatto” (fallbacks gestiscono)
    if (img.complete && img.naturalWidth === 0) { tick(); return resolve(); }

    const to = setTimeout(() => { img.onload = img.onerror = null; tick(); resolve(); }, LOAD_TIMEOUT_MS);
    img.onload = () => { clearTimeout(to); tick(); resolve(); };
    img.onerror = () => { clearTimeout(to); tick(); resolve(); };
  });

  return Promise.all(imgs.map(one));
}

// Crea la lista di immagini da attendere
function collectAllSpritesToPreload(){
  const imgs = [];

  // 1) atlas muri/decor (obbligatorio)
  if (G.sprites?.atlas) imgs.push(G.sprites.atlas);

  // 2) nemici: preferisci l’atlas del goblin; se non carica, fallback singolo
  if (G.sprites?.goblinSheet) imgs.push(G.sprites.goblinSheet);
  else if (G.sprites?.enemy)  imgs.push(G.sprites.enemy);

  // 3) bat atlas (facoltativo: se non carica, fai fallback color block)
  if (G.sprites?.batSheet) imgs.push(G.sprites.batSheet);

  // 4) sprite vari (coin/exit/powerup/bg)
  ['coin','exit','powerup','bg','wall'].forEach(k=>{
    if (G.sprites?.[k]) imgs.push(G.sprites[k]);
  });

  // 5) talpa frames
  if (G.sprites?.mole) collectImagesDeep(G.sprites.mole, imgs);

  // 6) pet frames (idle + direzioni)
  if (G.sprites?.pet) collectImagesDeep(G.sprites.pet, imgs);

  // 7) fallback goblin singolo se non incluso sopra
  if (G.sprites?.enemy && !imgs.includes(G.sprites.enemy)) imgs.push(G.sprites.enemy);

  // 8) icone mosse (drop)
  if (TreDrop?.img) imgs.push(TreDrop.img);

  // filtra duplicati
  return imgs.filter((v, i, a) => a.indexOf(v) === i);
}



  // ---------- HUD ----------
  function countCoinsLeft() {
    return Object.values(G.objects).flat().filter(o => o.type === 'coin' && !o.taken).length;
  }
function syncHud() {
  // assicura l'HUD creato
  //ensureTinyHud();

  // calcola monete rimaste
  const coinsLeft = Object.values(G.objects)
    .flat()
    .filter(o => o.type === 'coin' && !o.taken).length;

  // aggiorna il vecchio HUD se presente
  DOM.coins && (DOM.coins.textContent = String(coinsLeft));
  DOM.score && (DOM.score.textContent = String(G.score));
  DOM.level && (DOM.level.textContent = String(G.level));
  DOM.timer && (DOM.timer.textContent = String(G.timeLeft));

  // aggiorna il nuovo HUD compatto
  if (DOM.hudBox) {
    if (DOM.hudScore) DOM.hudScore.textContent = String(G.score);
    if (DOM.hudLvl)   DOM.hudLvl.textContent   = String(G.level);
    if (DOM.hudTime)  DOM.hudTime.textContent  = fmtTime(G.timeLeft);
    if (DOM.hudCoins) DOM.hudCoins.textContent = String(coinsLeft);
  }

  G.hudDirty = false;
}


  // ---------- AVVIO ----------
function startTreasureMinigame() {
  playBgm();
  generateDungeon();
  requestLandscape();
  initAtlasSprites();       // crea G.sprites.atlas e ne setta la src

  // atlas (muri/decor) + bat + reset HUD mini
  maybeSwapDecorForDevice();
  buildDecorFromAtlas();
  buildBatFromAtlas();
  document.getElementById('treasure-hud')?.remove();
  DOM.hudBox = null;

  // stato base
  G.level = 1;
  G.score = 0;
  G.coinsCollected = 0;
  G.playing = false;           // 🔴 resta fermo finché non finiamo il preload
  G.activePowerup = null;
  G.powerupExpiresAt = 0;
  G.slowExpiresAt = 0;

  // loader helper con cache-buster
  const CB = 'v=7';
  const mkImg = (src) => {
    const img = new Image();
    img.onload  = () => {/* ok */};
    img.onerror = (e) => console.error('[IMG fail]', src, e);
    img.src = src + (src.includes('?') ? '&' : '?') + CB;
    return img;
  };

  const assetBase = isMobileOrTablet() ? 'assets/mobile' : 'assets/desktop';

  // Nemico: atlas goblin + fallback singolo
  buildGoblinFromAtlas(); // setta G.sprites.goblinSheet src
  G.sprites.enemy = mkImg(`${assetBase}/enemies/goblin.png`);

  // Sprite comuni
  G.sprites.coin    = mkImg('assets/collectibles/coin.png');
  G.sprites.exit    = mkImg('assets/icons/door.png');
  G.sprites.wall    = mkImg('assets/tiles/wall2.png');
  G.sprites.bg      = mkImg(`${assetBase}/backgrounds/dungeon3.png`);
  G.sprites.powerup = mkImg('assets/bonus/powerup.png');

  // Talpa
  G.sprites.mole = [
    mkImg(`${assetBase}/enemies/talpa_1.png`),
    mkImg(`${assetBase}/enemies/talpa_2.png`),
    mkImg(`${assetBase}/enemies/talpa_3.png`),
  ];

  // Pet
  const petSrc = DOM.petImg?.src || '';
  const m = petSrc.match(/pet_(\d+)/);
  const petNum = m ? m[1] : '1';
  const mkPet = (file) => mkImg(`${assetBase}/pets/${file}`);
  G.sprites.pet = {
    idle:  mkPet(`pet_${petNum}.png`),
    right: [ mkPet(`pet_${petNum}_right1.png`), mkPet(`pet_${petNum}_right2.png`) ],
    left:  [ mkPet(`pet_${petNum}_left1.png`),  mkPet(`pet_${petNum}_left2.png`)  ],
    down:  [ mkPet(`pet_${petNum}_down1.png`),  mkPet(`pet_${petNum}_down2.png`)  ],
    up:    [ mkPet(`pet_${petNum}_up1.png`),    mkPet(`pet_${petNum}_up2.png`)    ],
  };

  // UI iniziale
  const tile = window.treasureTile || 64;
  G.petRoom = { x: Math.floor(Cfg.gridW/2), y: Math.floor(Cfg.gridH/2) };
  G.pet = { x:1, y:1, px:0, py:0, animTime:0, dirX:0, dirY:0, moving:false, direction:'down', stepFrame:0 };

  // evita spawn nemico sulla cella del pet nella stanza iniziale
  (function ensureSafeSpawn() {
    const key = `${G.petRoom.x},${G.petRoom.y}`;
    const list = G.enemies[key] || [];
    G.enemies[key] = list.filter(e => !(e.x === G.pet.x && e.y === G.pet.y));
  })();


  ensureLoadingOverlay();

  const loadingCover = isMobileOrTablet()
  ? 'assets/mobile/ui/treasure_loading.png'
  : 'assets/desktop/ui/treasure_loading.png';

  _loadBox.style.background =
  `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url('${cover}') center/cover no-repeat`;


//setLoadingBackground(loadingCover);
//setLoadingImage(loadingCover);
showLoadingOverlay();

  // === NUOVO: mostra overlay, pre-carica, poi avvia il livello ===
  showLoadingOverlay();

  // prepara anche il foglio delle icone delle mosse (così lo attendiamo)
  initTreasureMoveSheet();

  // raccogli tutte le immagini che hanno già la .src impostata
  const imgs = collectAllSpritesToPreload();

  preloadImages(imgs, setLoadingProgress).then(() => {
    // ora che gli asset sono pronti possiamo andare
    // (il reveal metterà G.playing=true da solo)
    startLevel();
    hideLoadingOverlay();
  }).catch(() => {
    // in caso di errore generico, prova comunque a partire (hai i fallback)
    startLevel();
    hideLoadingOverlay();
  });
}


function maybeSpawnMoveInRoom(level){
  if (level < 3) return;
  if (Math.random() >= TREASURE_MOVE_SPAWN_CHANCE) return;

  const key = pickRandomMoveKeyForTreasure();
  if (!key) return;

  const roomX = G.petRoom.x;
  const roomY = G.petRoom.y;

  // cella casuale interna alla stanza
  const tx = 1 + ((Math.random() * (Cfg.roomW - 2)) | 0);
  const ty = 1 + ((Math.random() * (Cfg.roomH - 2)) | 0);

  TreDrop.items.push({ key, roomX, roomY, tx, ty });
}




  // *** NUOVO: scegli griglia e poi genera ***
  //setGridForLevel(G.level);
  //generateDungeon();

  //startLevel();
  // ---------- INPUT ----------
  const dirMap = {
    ArrowUp: 'up',    w: 'up',
    ArrowDown: 'down', s: 'down',
    ArrowLeft: 'left', a: 'left',
    ArrowRight: 'right', d: 'right',
  };

function updatePetDirFromKeys() {
  // calcolo assi in base ai tasti ancora premuti
  const pressed = new Set(G.keysStack);

  let dx = 0, dy = 0;
  if (pressed.has('left'))  dx -= 1;
  if (pressed.has('right')) dx += 1;
  if (pressed.has('up'))    dy -= 1;
  if (pressed.has('down'))  dy += 1;

  // applica ai controlli del pet
  G.pet.dirX = dx;
  G.pet.dirY = dy;

  // direzione “di faccia” (solo estetica): usa l’ultimo tasto premuto
  if (G.keysStack.length) {
    const last = G.keysStack[G.keysStack.length - 1];
    if (last === 'left')  G.pet.direction = 'left';
    if (last === 'right') G.pet.direction = 'right';
    if (last === 'up')    G.pet.direction = 'up';
    if (last === 'down')  G.pet.direction = 'down';
  }
}


  // ---------- GAME LOOP ----------
let lastT = performance.now();
function gameLoop() {
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;

  try {
    if (G.playing) {
      update(dt);
      render();
      if (G.hudDirty) syncHud();
    }
  } catch (err) {
    console.error('[loop]', err);
  }

  requestAnimationFrame(gameLoop);
}
gameLoop();




  // ---------- LOGICA ----------
function movePet(dt) {
  const tile = window.treasureTile || 64;

  // --- scadenze powerup ---
  if (G.activePowerup === 'slow'  && performance.now() >= G.slowExpiresAt) {
    for (const list of Object.values(G.enemies)) for (const e of list) e.slow = false;
    G.activePowerup = null;
  }
  if (G.activePowerup === 'speed' && performance.now() >= G.powerupExpiresAt) {
    G.activePowerup = null;
    G.speedMul = 1;
  }

  // --- input / direzione ---
  let dx = G.pet.dirX, dy = G.pet.dirY;
  if (dx === 0 && dy === 0) { G.pet.moving = false; return; }
  if (dx !== 0 && dy !== 0) { const inv = 1/Math.sqrt(2); dx *= inv; dy *= inv; }

  // --- stanza corrente (SAFE) ---
  const room = G.rooms?.[G.petRoom.y]?.[G.petRoom.x];
  if (!room) { G.pet.moving = false; return; }

  // --- movimento con micro-step ---
  const speed = getCurrentPetSpeed();

  // hitbox (originale)
  const size = Math.max(12, tile - 20);

  // margini asimmetrici (originali)
  const HIT_BASE = { top: 3, right: 1, bottom: 1, left: 1 };

  const tryMove = (nx, ny, dirX = 0, dirY = 0) => {
    // piccolo bias verso la direzione di marcia
    const mL = Math.max(0, HIT_BASE.left   - (dirX < 0 ? 1 : 0));
    const mR = Math.max(0, HIT_BASE.right  - (dirX > 0 ? 1 : 0));
    const mT = Math.max(0, HIT_BASE.top    - (dirY < 0 ? 1 : 0));   // ← riduco se salgo
    const mB = Math.max(0, HIT_BASE.bottom - (dirY > 0 ? 1 : 0));

    const minX = Math.floor((nx + mL)        / tile);
    const maxX = Math.floor((nx + size - mR) / tile);
    const minY = Math.floor((ny + mT)        / tile);
    const maxY = Math.floor((ny + size - mB) / tile);

    if (minY < 0 || maxY >= Cfg.roomH || minX < 0 || maxX >= Cfg.roomW) return false;

    return (
      room[minY][minX] === 0 && room[minY][maxX] === 0 &&
      room[maxY][minX] === 0 && room[maxY][maxX] === 0
    );
  };

  const totalDX = dx * speed * dt;
  const totalDY = dy * speed * dt;
  const maxStep = Math.max(8, tile * (PHYS?.maxStepFrac ?? 1/3));
  const steps   = Math.max(1, Math.ceil(Math.hypot(totalDX, totalDY) / maxStep));
  const stepDX  = totalDX / steps;
  const stepDY  = totalDY / steps;

  for (let i = 0; i < steps; i++) {
    const tryPX = G.pet.px + stepDX;
    if (tryMove(tryPX, G.pet.py, Math.sign(stepDX), 0)) G.pet.px = tryPX;

    const tryPY = G.pet.py + stepDY;
    if (tryMove(G.pet.px, tryPY, 0, Math.sign(stepDY))) G.pet.py = tryPY;
  }

  // aggiorna cella logica usando il centro dell'hitbox
  G.pet.x = Math.floor((G.pet.px + size / 2) / tile);
  G.pet.y = Math.floor((G.pet.py + size / 2) / tile);
// --- PICKUP mosse (Treasure) ---
(function handleTreasureMovePickup(){
  if (!TreDrop.items.length) return;

  const t = TILE();
  const PCX = G.pet.px + t/2;
  const PCY = G.pet.py + t/2;
  const R   = t * 0.36;  // raggio pickup

  for (let i = TreDrop.items.length - 1; i >= 0; i--){
    const d = TreDrop.items[i];
    if (d.roomX !== G.petRoom.x || d.roomY !== G.petRoom.y) continue;

    const dpx = d.tx * t + t/2, dpy = d.ty * t + t/2;
    const dx = dpx - PCX, dy = dpy - PCY;
    if (dx*dx + dy*dy <= R*R){
      TreDrop.items.splice(i,1);               // togli il drop dalla stanza

      // premio inventario (Supabase)
      awardMoveToInventory(d.key);

      // Nome per il toast, se definito in MOVES
      const nice = MOVES?.[d.key]?.label || MOVES?.[d.key]?.name || d.key;

      showTreasureToast?.(`Nuova mossa: ${nice}`);

      G.score = (G.score|0) + 5;
      DOM.hudScore && (DOM.hudScore.textContent = G.score|0);
    }
  }
})();


  // animazione
  G.pet.moving = true;
  G.pet.animTime = (G.pet.animTime || 0) + dt;
  if (G.pet.animTime > getAnimStep()) {
    G.pet.stepFrame = 1 - G.pet.stepFrame;
    G.pet.animTime = 0;
  }

  // --- passaggio stanza (porte) con soglia sul BORDO dell'hitbox
  const ENTER_GAP = 8; // originale

  // a Ovest
  if (G.pet.px <= ENTER_GAP && G.petRoom.x > 0 && room[G.pet.y]?.[0] === 0) {
    G.petRoom.x -= 1; G.pet.px = (Cfg.roomW - 2) * tile; G.pet.x = Cfg.roomW - 2;
    const newKey = `${G.petRoom.x},${G.petRoom.y}`; (G.enemies[newKey] || []).forEach(e => e.reactDelay = 2);
  }
  // a Est
  else if (G.pet.px + size >= (Cfg.roomW - 1) * tile - ENTER_GAP &&
           G.petRoom.x < Cfg.gridW - 1 && room[G.pet.y]?.[Cfg.roomW - 1] === 0) {
    G.petRoom.x += 1; G.pet.px = 1 * tile; G.pet.x = 1;
    const newKey = `${G.petRoom.x},${G.petRoom.y}`; (G.enemies[newKey] || []).forEach(e => e.reactDelay = 2);
  }
  // a Nord
  else if (G.pet.py <= ENTER_GAP && G.petRoom.y > 0 && room[0]?.[G.pet.x] === 0) {
    G.petRoom.y -= 1; G.pet.py = (Cfg.roomH - 2) * tile; G.pet.y = Cfg.roomH - 2;
    const newKey = `${G.petRoom.x},${G.petRoom.y}`; (G.enemies[newKey] || []).forEach(e => e.reactDelay = 2);
  }
  // a Sud
  else if (G.pet.py + size >= (Cfg.roomH - 1) * tile - ENTER_GAP &&
           G.petRoom.y < Cfg.gridH - 1 && room[Cfg.roomH - 1]?.[G.pet.x] === 0) {
    G.petRoom.y += 1; G.pet.py = 1 * tile; G.pet.y = 1;
    const newKey = `${G.petRoom.x},${G.petRoom.y}`; (G.enemies[newKey] || []).forEach(e => e.reactDelay = 2);
  }

  // --- pickup (AABB in pixel) ---
  const key     = `${G.petRoom.x},${G.petRoom.y}`;
  const objects = G.objects[key]  || [];
  const powers  = G.powerups[key] || [];

  const petBox = { x: G.pet.px + 6, y: G.pet.py + 6, w: tile - 12, h: tile - 12 };
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  for (const o of objects) {
    if (o.type !== 'coin' || o.taken) continue;
    const bx = o.x * tile + tile / 4;
    const by = o.y * tile + tile / 4;
    if (overlap(petBox.x, petBox.y, petBox.w, petBox.h, bx, by, tile/2, tile/2)) {
      o.taken = true; G.score += 1; G.coinsCollected += 1; G.hudDirty = true;
    }
  }

  for (const p of powers) {
    if (p.taken) continue;
    const bx = p.x * tile + tile / 4;
    const by = p.y * tile + tile / 4;
    if (overlap(petBox.x, petBox.y, petBox.w, petBox.h, bx, by, tile/2, tile/2)) {
      p.taken = true; G.score += 12; G.hudDirty = true;
      if (p.type === 'speed') {
        G.activePowerup = 'speed'; G.powerupExpiresAt = performance.now() + Cfg.powerupMs; G.speedMul = 3;
        showTreasureBonus('SPEED!', '#22c55e');
      } else {
        for (const list of Object.values(G.enemies)) for (const e of list) e.slow = true;
        G.activePowerup = 'slow'; G.slowExpiresAt = performance.now() + Cfg.powerupMs;
        showTreasureBonus('SLOW!', '#3b82f6');
      }
      break;
    }
  }

  // --- uscita (tutte le monete prese) ---
  const coinsLeft = countCoinsLeft();
  const onExitTile =
    G.petRoom.x === G.exitRoom.x && G.petRoom.y === G.exitRoom.y &&
    Math.abs(G.pet.x - G.exitTile.x) < 1 && Math.abs(G.pet.y - G.exitTile.y) < 1;

  if (!G.exiting && onExitTile && coinsLeft === 0) {
    G.exiting = true;         // blocca trig multipli
    G.playing = false;        // ferma subito l’update
    G.level += 1;
    G.hudDirty = true;
    setGridForLevel(G.level);

    setTimeout(() => {
      generateDungeon();
      startLevel();
    }, 50);

    return; // importantissimo
  }

  // --- collisione con nemici ---
  const enemies = G.enemies[key] || [];
  if (enemies.some(e => distCenter(G.pet, e) < 0.5)) {
    G.playing = false;
    showTreasureBonus('Game Over!', '#e74c3c');
    if (G.timerId) clearInterval(G.timerId);
    setTimeout(() => endTreasureMinigame(), 1500);
  }
}




function moveEnemies(dt) {
  const key = `${G.petRoom.x},${G.petRoom.y}`;
  const enemies = G.enemies[key];
  if (!enemies) return;

  const tile = window.treasureTile || 64;
  const room = G.rooms[G.petRoom.y][G.petRoom.x];

  // tempi animazioni
  const ENEMY_ANIM_STEP_IDLE   = 0.20;
  const ENEMY_ANIM_STEP_WALK   = 0.14;
  const ENEMY_ANIM_STEP_ATTACK = 0.10;
  const BAT_STEP_IDLE          = 0.18;
  const BAT_STEP_WALK          = 0.10;
  const BAT_STEP_ATTACK        = 0.09;

  for (const e of enemies) {
    if (e.reactDelay === undefined) e.reactDelay = 2;
    if (e.attacking  === undefined) e.attacking  = false;
    if (e.stepFrame  === undefined) e.stepFrame  = 0;
    if (e.animTime   === undefined) e.animTime   = 0;

    // pausa iniziale
    if (e.reactDelay > 0) {
      e.reactDelay -= dt;
      e.isMoving = false;

      // scrolla l'idle
      const idleLen =
        (e.type === 'bat' ? (G.sprites.batFrames?.idle?.length)
                          : (G.sprites.goblinFrames?.idle?.length)) || 2;
      e.animTime += dt;
      const step = (e.type === 'bat') ? BAT_STEP_IDLE : ENEMY_ANIM_STEP_IDLE;
      if (e.animTime > step) {
        e.stepFrame = (e.stepFrame + 1) % idleLen;
        e.animTime = 0;
      }
      continue;
    }

    // vettore verso il pet
    let vx = G.pet.px - e.px, vy = G.pet.py - e.py;
    const dist = Math.hypot(vx, vy) || 1;
    vx /= dist; vy /= dist;

    if (e.type === 'bat') {
      // --- BAT: niente collisioni; movimento a spirale verso il pet
      const base = (e.slow ? enemyBaseSpeed * 0.6 : enemyBaseSpeed * 1.2);
      e.waveT = (e.waveT || 0) + dt * (e.waveFreq || 6.0);
      const sideSpeed = base * 0.45 * Math.sin(e.waveT); // componente laterale

      // perpendicolare (ruotato +90°): (-vy, vx)
      const pxv = -vy, pyv = vx;

      e.px += (vx * base + pxv * sideSpeed) * dt;
      e.py += (vy * base + pyv * sideSpeed) * dt;

      // aggiorna cella/direzione
      const size = tile - 18;
      e.x = Math.floor((e.px + size/2) / tile);
      e.y = Math.floor((e.py + size/2) / tile);
      e.direction = (Math.abs(vx) > Math.abs(vy)) ? (vx > 0 ? 'right' : 'left')
                                                  : (vy > 0 ? 'down' : 'up');
      e.isMoving = true;

      // stato “attacco” se molto vicino
      e.attacking = (distCenter(e, G.pet) < 1.1);

      // animazione bat
      const bf = G.sprites.batFrames;
      let framesLen = 2;
      if (bf) {
        if (e.attacking) {
          const dirAlias = (e.direction === 'left') ? 'right' : (e.direction || 'down');
          framesLen = (bf.attack?.[dirAlias]?.length) || (bf.walk?.right?.length) || (bf.idle?.length) || 2;
        } else if (e.isMoving) {
          const dirAlias = (e.direction === 'left') ? 'right' : (e.direction || 'down');
          framesLen = (bf.walk?.[dirAlias]?.length) || (bf.walk?.right?.length) || (bf.idle?.length) || 2;
        } else {
          framesLen = (bf.idle?.length) || 2;
        }
      }
      const stepDur = e.attacking ? BAT_STEP_ATTACK : (e.isMoving ? BAT_STEP_WALK : BAT_STEP_IDLE);
      e.animTime += dt;
      if (e.animTime > stepDur) { e.stepFrame = (e.stepFrame + 1) % framesLen; e.animTime = 0; }
    } else {
     // --- GOBLIN: come prima, ma con indici CLAMP per evitare out-of-bounds
const spd = e.slow ? enemyBaseSpeed * 0.3 : enemyBaseSpeed;
if (dist > 2) {
  const tryPX = e.px + vx * spd * dt;
  const tryPY = e.py + vy * spd * dt;

  const size = tile - 18;

  const idxFor = (nx, ny) => {
    // calcola gli indici e li clampa ai limiti validi
    let minX = Math.floor((nx + 6) / tile);
    let minY = Math.floor((ny + 6) / tile);
    let maxX = Math.floor((nx + size - 6) / tile);
    let maxY = Math.floor((ny + size - 6) / tile);

    // se uno qualunque esce, lo segniamo come out-of-bounds
    const oob =
      minX < 0 || minY < 0 ||
      maxX >= Cfg.roomW || maxY >= Cfg.roomH;

    // clamp per evitare accessi undefined
    minX = Math.max(0, Math.min(Cfg.roomW - 1, minX));
    maxX = Math.max(0, Math.min(Cfg.roomW - 1, maxX));
    minY = Math.max(0, Math.min(Cfg.roomH - 1, minY));
    maxY = Math.max(0, Math.min(Cfg.roomH - 1, maxY));

    return { minX, minY, maxX, maxY, oob };
  };

  const ix = idxFor(tryPX, tryPY);

  let canWalk = false;
  if (!ix.oob) {
    canWalk =
      room[ix.minY][ix.minX] === 0 &&
      room[ix.minY][ix.maxX] === 0 &&
      room[ix.maxY][ix.minX] === 0 &&
      room[ix.maxY][ix.maxX] === 0;
  }

  if (canWalk) {
    e.px = tryPX; e.py = tryPY;
    const cx = Math.floor((e.px + size/2) / tile);
    const cy = Math.floor((e.py + size/2) / tile);
    e.x = cx; e.y = cy;
    e.direction = (Math.abs(vx) > Math.abs(vy)) ? (vx > 0 ? 'right' : 'left')
                                                : (vy > 0 ? 'down' : 'up');
    e.isMoving = true;
  } else {
    e.isMoving = false;
  }
} else {
  e.isMoving = false;
}


      e.attacking = (distCenter(e, G.pet) < 1.1);

      const gf = G.sprites.goblinFrames;
      let framesLen = 2;
      if (gf) {
        if (e.attacking) {
          const dirAlias = (e.direction === 'left') ? 'right' : (e.direction || 'down');
          framesLen = (gf.attack?.[dirAlias]?.length) || (gf.walk?.right?.length) || (gf.idle?.length) || 2;
        } else if (e.isMoving) {
          const dirAlias = (e.direction === 'left') ? 'right' : (e.direction || 'down');
          framesLen = (gf.walk?.[dirAlias]?.length) || (gf.walk?.right?.length) || (gf.idle?.length) || 2;
        } else {
          framesLen = (gf.idle?.length) || 2;
        }
      }
      const stepDur = e.attacking ? ENEMY_ANIM_STEP_ATTACK
                    : e.isMoving  ? ENEMY_ANIM_STEP_WALK
                                  : ENEMY_ANIM_STEP_IDLE;
      e.animTime += dt;
      if (e.animTime > stepDur) { e.stepFrame = (e.stepFrame + 1) % framesLen; e.animTime = 0; }
    }

    // hit col pet = game over
    if (distCenter(e, G.pet) < 0.5) {
      G.playing = false;
      showTreasureBonus('Game Over!', '#e74c3c');
      setTimeout(() => endTreasureMinigame(), 1500);
      return;
    }
  }
}



function placeMoleAtRandomSpot() {
  const room = G.rooms[G.mole.roomY][G.mole.roomX];
  let tries = 0;
  do {
    G.mole.x = 1 + Math.floor(Math.random() * (Cfg.roomW - 2));
    G.mole.y = 1 + Math.floor(Math.random() * (Cfg.roomH - 2));
    tries++;
  } while ((room[G.mole.y][G.mole.x] !== 0) && tries < 200);
}

  function update(dt) {
    movePet(dt);
    moveEnemies(dt);
    updateMole(dt);
  }

  function updateMole(dt) {
  if (!G.mole.enabled) return;

  // la talpa progredisce anche se non sei in quella stanza,
  // ma il game over si controlla solo quando è visibile e sei nella stanza
  G.mole.t += dt;

  switch (G.mole.phase) {
    case 'emerge1': // terriccio
      if (G.mole.t >= MoleCfg.emerge1) { G.mole.phase = 'emerge2'; G.mole.t = 0; }
      break;

    case 'emerge2': // testa
      if (G.mole.t >= MoleCfg.emerge2) { G.mole.phase = 'hold'; G.mole.t = 0; }
      break;

    case 'hold': {  // tutta su (hit window)
      // Se sei nella stessa stanza, controlla collisione
      if (G.petRoom.x === G.mole.roomX && G.petRoom.y === G.mole.roomY) {
        const tile = window.treasureTile || 64;
        const petBox = { x: G.pet.px + 6, y: G.pet.py + 6, w: tile - 12, h: tile - 12 };
        const molePx = G.mole.x * tile;  // disegno centrato nella tile come i nemici
        const molePy = G.mole.y * tile;
        const moleBox = { x: molePx + 6, y: molePy + 6, w: tile - 12, h: tile - 12 };
        const hit = (petBox.x < moleBox.x + moleBox.w && petBox.x + petBox.w > moleBox.x &&
                     petBox.y < moleBox.y + moleBox.h && petBox.y + petBox.h > moleBox.y);
        if (hit) {
          G.playing = false;
          showTreasureBonus('Game Over!', '#e74c3c');
          if (G.timerId) clearInterval(G.timerId);
          setTimeout(() => endTreasureMinigame(), 1500);
          return;
        }
      }
      if (G.mole.t >= MoleCfg.hold) { G.mole.phase = 'retreat2'; G.mole.t = 0; }
      break;
    }

    case 'retreat2': // torna da full -> testa
      if (G.mole.t >= MoleCfg.retreat2) { G.mole.phase = 'retreat1'; G.mole.t = 0; }
      break;

    case 'retreat1': // torna da testa -> terriccio
      if (G.mole.t >= MoleCfg.retreat1) { G.mole.phase = 'gap'; G.mole.t = 0; }
      break;

    case 'gap': // pausa e poi teleporta in un altro spot della stessa stanza
      if (G.mole.t >= MoleCfg.gap) {
        placeMoleAtRandomSpot();
        G.mole.phase = 'emerge1';
        G.mole.t = 0;
      }
      break;
  }
}
// --- helpers per disegnare i muri ---

function resyncPetToGrid() {
  const tile = window.treasureTile || 64;
  // se per qualche motivo è su una cella muro, spostalo in (1,1)
  const room = G.rooms?.[G.petRoom.y]?.[G.petRoom.x];
  if (room && room[G.pet.y]?.[G.pet.x] !== 0) {
    G.pet.x = 1; 
    G.pet.y = 1;
  }
  G.pet.px = G.pet.x * tile;
  G.pet.py = G.pet.y * tile;
}


// ---- DRAW HELPERS (safe) ----
function canUse(img) {
  return !!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}
function drawImg(img, dx, dy, dw, dh) {
  if (canUse(img)) ctx.drawImage(img, dx, dy, dw, dh);
}

function drawAtlasClip(clip, x, y, tile) {
  const atlas = G.sprites.atlas;
  if (!atlas || !atlas.complete || !clip) return;
  ctx.drawImage(atlas, clip.sx, clip.sy, clip.sw, clip.sh, x * tile, y * tile, tile, tile);
}


function drawTileType(x, y, type, tile) {
  const entry = G.sprites.decor?.[type];
  if (!entry) return;

  let d = entry;
  if (Array.isArray(entry)) {
    // usa hash pseudo-random per il pavimento, alternanza semplice per i muri
    const idx = (type === 'floor')
      ? variantIndex(x, y, entry.length)
      : (x + y) % entry.length;
    d = entry[idx];
  }

  const atlas = G.sprites.atlas;
  if (d && typeof d === 'object' && 'sx' in d) {
    if (!atlas || !atlas.complete) return;
    ctx.drawImage(atlas, d.sx, d.sy, d.sw, d.sh, x * tile, y * tile, tile, tile);
  }
}

function drawTileTypeOn(ctx2, x, y, type, tile) {
  const entry = G.sprites.decor?.[type];
  if (!entry) return;

  let d = entry;
  if (Array.isArray(entry)) {
    const idx = (type === 'floor')
      ? variantIndex(x, y, entry.length)
      : (x + y) % entry.length;
    d = entry[idx];
  }

  const atlas = G.sprites.atlas;
  if (d && typeof d === 'object' && 'sx' in d) {
    if (!atlas || !atlas.complete) return;
    ctx2.drawImage(atlas, d.sx, d.sy, d.sw, d.sh, x * tile, y * tile, tile, tile);
  }
}



function generateRoomTiles(room) {
  const H = room.length, W = room[0].length;
  const tiles = Array.from({ length: H }, () => Array(W).fill(null));

  // aperture sui bordi
  const openL=[], openR=[], openT=[], openB=[];
  for (let y = 1; y <= H-2; y++) {
    if (room[y][0]   === 0) openL.push(y);
    if (room[y][W-1] === 0) openR.push(y);
  }
  for (let x = 1; x <= W-2; x++) {
    if (room[0][x]   === 0) openT.push(x);
    if (room[H-1][x] === 0) openB.push(x);
  }

  // celle adiacenti alle aperture
  const yTL = openL.length ? Math.max(1, openL[0]                - 1) : null; // sopra porta sx
  const yBL = openL.length ? Math.min(H-2, openL[openL.length-1] + 1) : null; // sotto porta sx
  const yTR = openR.length ? Math.max(1, openR[0]                - 1) : null; // sopra porta dx
  const yBR = openR.length ? Math.min(H-2, openR[openR.length-1] + 1) : null; // sotto porta dx

  const xLT = openT.length ? Math.max(1, openT[0]                - 1) : null;
  const xRT = openT.length ? Math.min(W-2, openT[openT.length-1] + 1) : null;
  const xLB = openB.length ? Math.max(1, openB[0]                - 1) : null;
  const xRB = openB.length ? Math.min(W-2, openB[openB.length-1] + 1) : null;

  const isDoorCell = (x, y) =>
    (openL.length && x === 0     && openL.includes(y)) ||
    (openR.length && x === W-1   && openR.includes(y)) ||
    (openT.length && y === 0     && openT.includes(x)) ||
    (openB.length && y === H-1   && openB.includes(x));

  const isSolid = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (room[y][x] === 0) return false;   // interno
    if (isDoorCell(x, y)) return false;   // apertura porta
    return true;                           // muro
  };

  // pass principale
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isSolid(x, y)) { tiles[y][x] = null; continue; }

      // --- verticali vicino a porte (SOLO bordo esterno) ---
      if (openL.length && x === 0) {
        if (y === yTL) { tiles[y][x] = 'leftDoorTop';   continue; }  // tassello curvo in alto
        if (y === yBL) { tiles[y][x] = 'corner_bl_door'; continue; } // base vicino porta
      }
      if (openR.length && x === W-1) {
        if (y === yTR) { tiles[y][x] = 'rightDoorTop';  continue; }
        if (y === yBR) { tiles[y][x] = 'corner_br_door'; continue; }
      }

      // --- orizzontali vicino a porte (invariati) ---
      if (openT.length && y === 0) {
        if (x === xLT) { tiles[y][x] = 'corner_tl_door'; continue; }
        if (x === xRT) { tiles[y][x] = 'corner_tr_door'; continue; }
      }
      if (openB.length && y === H-1) {
        if (x === xLB) { tiles[y][x] = 'corner_bl_door'; continue; }
        if (x === xRB) { tiles[y][x] = 'corner_br_door'; continue; }
      }

      // --- angoli normali ---
      if (x === 0     && y === 0)     { tiles[y][x] = 'corner_tl'; continue; }
      if (x === W - 1 && y === 0)     { tiles[y][x] = 'corner_tr'; continue; }
      if (x === 0     && y === H - 1) { tiles[y][x] = 'corner_bl'; continue; }
      if (x === W - 1 && y === H - 1) { tiles[y][x] = 'corner_br'; continue; }

      // --- lati normali ---
      if (y === 0)        { tiles[y][x] = 'top';    continue; }
      if (y === H - 1)    { tiles[y][x] = 'bottom'; continue; }
      if (x === 0)        { tiles[y][x] = 'left';   continue; }
      if (x === W - 1)    { tiles[y][x] = 'right';  continue; }

      tiles[y][x] = 'center';
    }
  }

  // --- HARD CLEANUP: elimina qualsiasi spalletta interna residua ---
  if (openL.length) {
    const yTop = Math.max(1, openL[0] - 1);
    for (let yy = 1; yy < yTop; yy++) tiles[yy][1] = null;      // x=1 pulito
  }
  if (openR.length) {
    const yTop = Math.max(1, openR[0] - 1);
    for (let yy = 1; yy < yTop; yy++) tiles[yy][W-2] = null;    // x=W-2 pulito
  }

  return tiles;
}











// Celle apertura porta per una stanza (tutte le celle realmente aperte sul bordo)
function listDoorCells(room){
  const H = room.length, W = room[0].length;
  const cells = [];
  for (let y=0;y<H;y++){
    if (room[y][0]   === 0) cells.push({x:0,   y});
    if (room[y][W-1] === 0) cells.push({x:W-1, y});
  }
  for (let x=0;x<W;x++){
    if (room[0][x]   === 0) cells.push({x, y:0});
    if (room[H-1][x] === 0) cells.push({x, y:H-1});
  }
  return cells;
}
function isNearAnyDoor(rx, ry, tx, ty, dist=2){
  const room = G.rooms[ry][rx];
  const opens = listDoorCells(room);
  return opens.some(p => (Math.abs(p.x - tx) + Math.abs(p.y - ty)) <= dist);
}
function distTiles(ax,ay,bx,by){ return Math.abs(ax-bx)+Math.abs(ay-by); }
function isNearWalls(tx,ty,margin=2){
  return (tx < margin || ty < margin || tx > Cfg.roomW-1-margin || ty > Cfg.roomH-1-margin);
}
function isNearCenter(tx,ty,rad=Math.floor(Math.min(Cfg.roomW, Cfg.roomH)/3)){
  const cx = Math.floor(Cfg.roomW/2), cy = Math.floor(Cfg.roomH/2);
  return (Math.abs(tx-cx) <= rad && Math.abs(ty-cy) <= rad);
}



function drawRoom(room) {
  const tile = window.treasureTile || 64;

  // 1) calcola la mappa dei tipi (prima di usarla!)
  const tiles = generateRoomTiles(room);

  // 2) pavimento (prima dei muri, così i muri coprono il bordo)
  drawFloor(room);

  // 3) overlay debug opzionale
  drawDebugSides(tiles, tile);   // <-- ora è DOPO la definizione di tiles

  // 4) disegna i muri/angoli dall’atlas
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const type = tiles[y][x];
      if (!type || type === 'center') continue;
      drawTileType(x, y, type, tile);
    }
  }
}

function bakeRoomLayer(key, room) {
  const tile = window.treasureTile || 64;
  if (!G.sprites?.atlas?.complete || !G.sprites?.decor) return null;

  // 🔴 DEVONO stare qui, prima di usarli
  const W = Cfg.roomW, H = Cfg.roomH;

  const wpx = W * tile, hpx = H * tile;

  const cv = document.createElement('canvas');
  cv.width = wpx;
  cv.height = hpx;
  const bctx = cv.getContext('2d');
  bctx.imageSmoothingEnabled = false;

  // 0) mappa tipi
  const tiles = generateRoomTiles(room);

  // 1) PAVIMENTO
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (room[y][x] === 0) drawTileTypeOn(bctx, x, y, 'floor', tile);
    }
  }

  // 2) MURI STANDARD (salta la riga nord e i corner-nord)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y][x];
      if (!t || t === 'center') continue;

      if (y === 0 && (
          t === 'top' ||
          t === 'corner_tl' || t === 'corner_tr' ||
          t === 'corner_tl_door' || t === 'corner_tr_door'
        )) {
        continue;
      }
      drawTileTypeOn(bctx, x, y, t, tile);
    }
  }

  // ➜ prima cella aperta sui lati SX/DX
  const openL = [], openR = [];
  for (let yy = 1; yy <= H - 2; yy++) {
    if (room[yy][0]     === 0) openL.push(yy);
    if (room[yy][W - 1] === 0) openR.push(yy);
  }
  // distanza dalla cella (0,1)/(W-1,1) all’inizio della porta; 99 = nessuna porta
  const gapFromTopLeft  = openL.length ? (openL[0] - 1) : 99;
  const gapFromTopRight = openR.length ? (openR[0] - 1) : 99;

  // 3) NORD in 3 layer: base (riga 0), upper (riga 1), cap (overlay)
  for (let x = 0; x < W; x++) {
    const t0 = tiles[0][x];
    if (!t0) continue;

    const drawCapFallback = () => {
      bctx.save();
      bctx.globalAlpha = 0.18;
      bctx.fillStyle = '#000';
      const h = Math.max(3, Math.round(tile * 0.05));
      bctx.fillRect(x * tile, 2 * tile - h, tile, h);
      bctx.restore();
    };

    // tassello "dritto" sotto al cap quando c'è spazio prima della porta
    const tlStraight = G.sprites.decor.corner_tl_upper_plain ? 'corner_tl_upper_plain' : 'corner_tl_base';
    const trStraight = G.sprites.decor.corner_tr_upper_plain ? 'corner_tr_upper_plain' : 'corner_tr_base';

    // ---- TOP-LEFT CORNER
    if (t0 === 'corner_tl' || t0 === 'corner_tl_door') {
      const baseK  = (t0 === 'corner_tl_door') ? 'corner_tl_door_base'  : 'corner_tl_base';
      const upperK = (t0 === 'corner_tl_door')
        ? 'corner_tl_door_upper'
        : (gapFromTopLeft >= 1 ? tlStraight : 'corner_tl_upper'); // spazio→dritto, attaccata→curvo

      const capK   = (t0 === 'corner_tl_door') ? 'corner_tl_door_cap' : 'corner_tl_cap';

      drawTileTypeOn(bctx, x, 0, baseK,  tile);
      drawTileTypeOn(bctx, x, 1, upperK, tile);
      if (G.sprites.decor[capK]) drawTileTypeOn(bctx, x, 0, capK, tile);
      else drawCapFallback();
      continue;
    }

    // ---- TOP-RIGHT CORNER
    if (t0 === 'corner_tr' || t0 === 'corner_tr_door') {
      const baseK  = (t0 === 'corner_tr_door') ? 'corner_tr_door_base'  : 'corner_tr_base';
      const upperK = (t0 === 'corner_tr_door')
        ? 'corner_tr_door_upper'
        : (gapFromTopRight >= 1 ? trStraight : 'corner_tr_upper');

      const capK   = (t0 === 'corner_tr_door') ? 'corner_tr_door_cap' : 'corner_tr_cap';

      drawTileTypeOn(bctx, x, 0, baseK,  tile);
      drawTileTypeOn(bctx, x, 1, upperK, tile);
      if (G.sprites.decor[capK]) drawTileTypeOn(bctx, x, 0, capK, tile);
      else drawCapFallback();
      continue;
    }

    // segmento piatto del muro nord
    if (t0 === 'top') {
      drawTileTypeOn(bctx, x, 0, 'top_base',  tile);
      drawTileTypeOn(bctx, x, 1, 'top_upper', tile);
      if (G.sprites.decor.top_cap) drawTileTypeOn(bctx, x, 0, 'top_cap', tile);
      else drawCapFallback();
      continue;
    }
  }

  const baked = { canvas: cv, tile };
  G.renderCache.rooms[key] = baked;
  return baked;
}





function drawTile(sprite, tileX, tileY) {
  const tileSize = G.tileSize;
  ctx.drawImage(sprite, tileX * tileSize, tileY * tileSize, tileSize, tileSize);
}

const ix = v => Math.round(v); // intero “pixel-perfect”

  // ---------- RENDER ----------
function render() {
  // stanza corrente (safe guards)
  const row = G.rooms?.[G.petRoom.y];
  if (!row) return;
  const room = row?.[G.petRoom.x];
  if (!room) return;

  const tile = window.treasureTile || 64;
  const rk = roomKey(G.petRoom.x, G.petRoom.y);

  // --- layer statico (baked) ---
  let baked = G.renderCache.rooms[rk];
  if (!baked || baked.tile !== tile) baked = bakeRoomLayer(rk, room);
  if (baked) ctx.drawImage(baked.canvas, 0, 0);
  else drawRoom(room); // fallback (atlas non pronto)

  // --- COINS ---
  if (G.objects[rk]) {
    for (const obj of G.objects[rk]) {
      if (obj.type === 'coin' && !obj.taken) {
        if (G.sprites.coin?.complete) {
          ctx.drawImage(G.sprites.coin, obj.x*tile + tile/4, obj.y*tile + tile/4, tile/2, tile/2);
        } else {
          ctx.fillStyle = '#FFA500';
          ctx.beginPath();
          ctx.arc(obj.x*tile + tile/2, obj.y*tile + tile/2, tile/4, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }

  // --- POWERUPS ---
  if (G.powerups[rk]) {
    for (const pow of G.powerups[rk]) {
      if (!pow.taken) {
        if (G.sprites.powerup?.complete) {
          ctx.drawImage(G.sprites.powerup, pow.x*tile + tile/4, pow.y*tile + tile/4, tile/2, tile/2);
        } else {
          ctx.fillStyle = '#0cf';
          ctx.beginPath();
          ctx.arc(pow.x*tile + tile/2, pow.y*tile + tile/2, tile/4, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }

  // --- SKULLS ---
  for (const s of (G.skulls || [])) {
    if (s.roomX === G.petRoom.x && s.roomY === G.petRoom.y) {
      if (s.img?.complete) ctx.drawImage(s.img, s.x*tile, s.y*tile, tile, tile);
    }
  }

  // --- TALPA ---
  if (G.mole.enabled && G.petRoom.x === G.mole.roomX && G.petRoom.y === G.mole.roomY) {
    const mx = G.mole.x * tile, my = G.mole.y * tile;
    let frame = null;
    switch (G.mole.phase) {
      case 'emerge1':
      case 'retreat1': frame = 0; break;
      case 'emerge2':
      case 'retreat2': frame = 1; break;
      case 'hold':     frame = 2; break;
    }
    if (frame !== null) {
      const img = G.sprites.mole?.[frame];
      if (img && img.complete) ctx.drawImage(img, mx + 6, my + 6, tile - 12, tile - 12);
      else { ctx.fillStyle = '#7a4f2b'; ctx.fillRect(mx + 8, my + 8, tile - 16, tile - 16); }
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

  // --- USCITA (botola) ---
  if (G.petRoom.x === G.exitRoom.x && G.petRoom.y === G.exitRoom.y) {
    const coinsLeft = countCoinsLeft();
    const type = (coinsLeft === 0) ? 'exitOpen' : 'exitClosed';
    if (G.sprites.decor?.[type]) {
      drawTileType(G.exitTile.x, G.exitTile.y, type, tile);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = (coinsLeft === 0) ? '#22c55e' : '#6b7280';
      ctx.fillRect(G.exitTile.x * tile + 6, G.exitTile.y * tile + 6, tile - 12, tile - 12);
      ctx.restore();
    }
  }
  // --- Render drop mossa (Treasure) ---
(function drawTreasureDrops(){
  if (!TreDrop.items.length) return;

  for (const d of TreDrop.items){
    if (d.roomX !== G.petRoom.x || d.roomY !== G.petRoom.y) continue;

    const t = TILE();
    const px = d.tx * t + t/2;
    const py = d.ty * t + t/2;
    const size = 0.55 * t;
    const x = px - size/2, y = py - size/2;

    // glow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.ellipse(px, py + size*0.18, size*0.52, size*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // bobbing
    const bob = Math.sin(performance.now()/250) * (t*0.03);
    const icon = pickMoveRect(d.key);

    const sheet = TreDrop.img; // stesso sheet del MOVE_DROP_CFG
    if (sheet && sheet.complete && icon){
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, icon.sx, icon.sy, icon.sw, icon.sh, x, y - bob, size, size);
      ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2;
      roundRect(ctx, x, y - bob, size, size, size*0.22); ctx.stroke?.();
    } else {
      // fallback
      ctx.save();
      ctx.fillStyle = '#2563eb';
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y - bob, size, size, size*0.25); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e5e7eb';
      ctx.font = `700 ${Math.round(size*0.42)}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('M', px, py - bob);
      ctx.restore();
    }
  }
})();



  // --- PET (SAFE PICK) ---
  {
    const px = G.pet.px, py = G.pet.py, sz = tile - 12;
    const PET = G.sprites.pet;
    let sPet = null;

    if (PET) {
      if (!G.pet.moving) {
        sPet = PET.idle || null;
      } else {
        const dirArr = PET[G.pet.direction];
        if (Array.isArray(dirArr) && dirArr.length) {
          const idx = Math.abs(G.pet.stepFrame | 0) % dirArr.length;
          sPet = dirArr[idx] || dirArr[0] || PET.idle || null;
        } else {
          sPet = PET.idle || null;
        }
      }
    }

    if (sPet && sPet.complete) {
      ctx.drawImage(sPet, px + 6, py + 6, sz, sz);
    } else {
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(px + 8, py + 8, sz - 4, sz - 4);
    }
  }

  // --- ENEMIES (goblin + bat, con mirroring per 'left') ---
  {
    const gf = G.sprites.goblinFrames;
    const gsheet = G.sprites.goblinSheet;

    const bf = G.sprites.batFrames;     // <- serve buildBatFromAtlas()
    const bsheet = G.sprites.batSheet;

    for (const e of (G.enemies[rk] || [])) {
   const ex = e.px, ey = e.py;

// base “utile” dentro la tile
const base = tile; // scala dalla cella piena


// scala costante (per tipo)
const s = (e.type === 'bat' ? ENEMY_SCALE_BAT : ENEMY_SCALE_GOBLIN);
let drawW = Math.round(base * s);
let drawH = Math.round(base * s);

// opzionale: tienili dentro la tile
if (ENEMY_CLAMP_TO_TILE) {
  drawW = Math.min(tile, drawW);
  drawH = Math.min(tile, drawH);
}

// centra lo sprite nella cella anche se è più piccolo/più grande
const dx = ex + (tile - drawW) / 2;
const dy = ey + (tile - drawH) / 2;



      // seleziona atlas/frames in base al tipo
      const type = e.type || 'goblin';
      let framesRoot = null;
      let sheet = null;

      if (type === 'bat') {
        framesRoot = bf;
        sheet = bsheet;
      } else {
        framesRoot = gf;
        sheet = gsheet;
      }

      // se abbiamo un atlas valido, scegli frames + flip
      if (framesRoot && sheet && sheet.complete) {
        const mode = e.attacking ? 'attack' : (e.isMoving ? 'walk' : 'idle');
        const dir  = e.direction || 'down';

        let frames = null;
        let flip = false;

        if (mode === 'idle' || !framesRoot[mode]) {
          // per il bat, se non hai definito idle/attack, cadrà qui e userà idle se presente
          frames = framesRoot.idle || null;
        } else {
          if (dir === 'left') {
            frames = framesRoot[mode]?.right || null; // usa right e flippa
            flip = true;
          } else {
            frames = framesRoot[mode]?.[dir] || null; // down/right/up
          }
        }

        // fallback: se ancora nulla, prova idle ⇒ walk.right ⇒ qualunque
        let arr =
          (frames && frames.length) ? frames :
          (framesRoot.idle && framesRoot.idle.length ? framesRoot.idle : null);

        if (!arr) {
          const wr = framesRoot.walk;
          if (wr) {
            arr = wr.right || wr.down || wr.up || null;
          }
        }

        if (arr && arr.length) {
          const len = Math.max(1, arr.length);
          const idx = Math.abs((e.stepFrame | 0) % len);
          const clip = arr[idx];

          if (clip) {
            drawSheetClipMaybeFlip(sheet, clip, dx, dy, drawW, drawH, flip);
            continue; // disegnato con atlas
          }
        }
      }

      // --- fallback se atlas non pronto ---
      if (type === 'bat') {
        ctx.fillStyle = '#a78bfa'; // lilla
        ctx.fillRect(dx + 2, dy + 2, drawW - 4, drawH - 4);
      } else {
  if (G.sprites.enemy?.complete) {
    ctx.drawImage(G.sprites.enemy, dx, dy, drawW, drawH); // <-- usa dx,dy
  } else {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(dx + 2, dy + 2, drawW - 4, drawH - 4);
  }
}
    }
  }
  // --- overlay "lip" sud (opzionale, effetto profondità)
{
  const room = G.rooms[G.petRoom.y][G.petRoom.x];
  const tiles = generateRoomTiles(room);
  for (let x = 0; x < tiles[0].length; x++) {
    if (tiles[Cfg.roomH - 1][x] === 'bottom') {
      // ridisegno SOLO il bordo inferiore davanti agli sprite
      drawTileType(x, Cfg.roomH - 1, 'bottom', tile);
    }
  }
}

}


const isTyping = (e) =>
  e.target && (e.target.matches('input, textarea, [contenteditable="true"]') ||
               e.target.closest('input, textarea, [contenteditable="true"]'));

const isFormish = (el) =>
  el && (el.closest('form, input, textarea, select, button, a, .form-box, .modal'));

document.addEventListener('keydown', (e) => {
  if (!G.playing) return;
  if (isTyping(e)) return;    //IMPORTANTE
  const dir = dirMap[e.key];
  if (!dir) return;
  e.preventDefault();               // <-- aggiungi questo
  if (!G.keysStack.includes(dir)) G.keysStack.push(dir);
  updatePetDirFromKeys();
});
document.addEventListener('keyup', (e) => {
  if (!G.playing) return;
  if (isTyping(e)) return;
  const dir = dirMap[e.key];
  if (!dir) return;
  e.preventDefault();               // <-- e qui
  G.keysStack = G.keysStack.filter(d => d !== dir);
  updatePetDirFromKeys();
});

function isOpening(room, tx, ty) {
  // ritorna true se la cella è vuota e non è muro
  return room[ty] && room[ty][tx] === 0;
}

function resyncEnemiesToGrid() {
  const t = window.treasureTile || 64;
  for (const list of Object.values(G.enemies)) {
    for (const e of list) {
      e.px = e.x * t;
      e.py = e.y * t;
    }
  }
}

function pickRandomWallCellNoDoor(room) {
  const H = room.length, W = room[0].length;
  const spots = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // deve stare sul bordo
      const onEdge = (x === 0 || x === W-1 || y === 0 || y === H-1);
      if (!onEdge) continue;

      // deve essere muro pieno
      if (room[y][x] === 0) continue;

      // escludi le celle muro ADIACENTI a un'apertura sullo stesso bordo
      // (quindi non spawna sulle "spallette" della porta)
      const isLeftOrRight = (x === 0 || x === W-1);
      const isTopOrBottom = (y === 0 || y === H-1);

      // se siamo sul bordo verticale, guardo su/giù lungo lo stesso bordo
      if (isLeftOrRight) {
        const upIsDoor   = (y > 0     && room[y-1][x] === 0);
        const downIsDoor = (y < H - 1 && room[y+1][x] === 0);
        if (upIsDoor || downIsDoor) continue;
      }

      // se siamo sul bordo orizzontale, guardo sin/dx lungo lo stesso bordo
      if (isTopOrBottom) {
        const leftIsDoor  = (x > 0     && room[y][x-1] === 0);
        const rightIsDoor = (x < W - 1 && room[y][x+1] === 0);
        if (leftIsDoor || rightIsDoor) continue;
      }

      spots.push({ x, y });
    }
  }

  if (!spots.length) return null;
  return spots[Math.floor(Math.random() * spots.length)];
}


  // ---------- GENERAZIONE ----------
function generateDungeon() {
  G.rooms = [];
  G.objects = {};
  G.enemies = {};
  G.powerups = {};

  // --- stanze base con muri ---
  for (let y = 0; y < Cfg.gridH; y++) {
    const row = [];
    for (let x = 0; x < Cfg.gridW; x++) {
      const room = [];
      for (let ty = 0; ty < Cfg.roomH; ty++) {
        const rrow = [];
        for (let tx = 0; tx < Cfg.roomW; tx++) {
          rrow.push((tx === 0 || ty === 0 || tx === Cfg.roomW - 1 || ty === Cfg.roomH - 1) ? 1 : 0);
        }
        room.push(rrow);
      }
      row.push(room);
    }
    G.rooms.push(row);
  }

  // --- porte (larghezza variabile per device) ---
  for (let y = 0; y < Cfg.gridH; y++) {
    for (let x = 0; x < Cfg.gridW; x++) {
      const span   = getDoorSpan();
      const midRow = Math.floor(Cfg.roomH / 2);
      const midCol = Math.floor(Cfg.roomW / 2);
      const ys = doorIndices(midRow, span, 1, Cfg.roomH - 2);
      const xs = doorIndices(midCol, span, 1, Cfg.roomW - 2);

      if (x < Cfg.gridW - 1) {
        for (const r of ys) {
          G.rooms[y][x][r][Cfg.roomW - 1] = 0;
          G.rooms[y][x + 1][r][0] = 0;
        }
      }
      if (y < Cfg.gridH - 1) {
        for (const c of xs) {
          G.rooms[y][x][Cfg.roomH - 1][c] = 0;
          G.rooms[y + 1][x][0][c] = 0;
        }
      }
    }
  }

  // --- uscita random (non centrale) ---
  do {
    G.exitRoom.x = Math.floor(Math.random() * Cfg.gridW);
    G.exitRoom.y = Math.floor(Math.random() * Cfg.gridH);
  } while (G.exitRoom.x === Math.floor(Cfg.gridW/2) && G.exitRoom.y === Math.floor(Cfg.gridH/2));
  G.exitTile.x = Cfg.roomW - 2;
  G.exitTile.y = Cfg.roomH - 2;

  // --- popola stanze ---
  for (let ry = 0; ry < Cfg.gridH; ry++) {
    for (let rx = 0; rx < Cfg.gridW; rx++) {
      const key = `${rx},${ry}`;
      const objects  = [];
      const enemies  = [];
      const powerups = [];
      const roomRef  = G.rooms[ry][rx];

      // monete
      const nCoins = (rx === G.exitRoom.x && ry === G.exitRoom.y) ? 1 : (2 + Math.floor(Math.random() * 2));
      for (let i = 0; i < nCoins; i++) {
        let px, py;
        do {
          px = 1 + Math.floor(Math.random() * (Cfg.roomW - 2));
          py = 1 + Math.floor(Math.random() * (Cfg.roomH - 2));
        } while (rx === G.exitRoom.x && ry === G.exitRoom.y && px === G.exitTile.x && py === G.exitTile.y);
        objects.push({ x: px, y: py, type: 'coin', taken: false });
      }

      // --- NEMICI BASE (GOBLIN) ---
      {
        const nEnemies = Math.random() < 0.7 ? 1 : 0; // 0 o 1 goblin (70%:1)
        const tile = window.treasureTile || 64;

        const centerRoomX = Math.floor(Cfg.gridW / 2);
        const centerRoomY = Math.floor(Cfg.gridH / 2);
        const spawnCellX = 1, spawnCellY = 1; // spawn player

        for (let i = 0; i < nEnemies; i++) {
          let ex, ey, tries = 0;
          while (tries++ < 80) {
            // vincolo: vicino al centro, non vicino ai muri
            ex = 1 + Math.floor(Math.random() * (Cfg.roomW - 2));
            ey = 1 + Math.floor(Math.random() * (Cfg.roomH - 2));
          // dopo: SOLO 3×3 centrale e almeno 3 celle dai muri
if (!isNearCenter(ex, ey, GOB_CENTER_RADIUS)) continue;
if (isNearWalls(ex, ey, GOB_WALL_MARGIN)) continue;



            // evita porte e spallette
            if (isNearAnyDoor(rx, ry, ex, ey, 2)) continue;

            // evita spawn del player (solo per la stanza centrale)
            if (rx === centerRoomX && ry === centerRoomY && distTiles(ex, ey, spawnCellX, spawnCellY) < 3) continue;

            // evita la botola (stanza di uscita)
            if (rx === G.exitRoom.x && ry === G.exitRoom.y && distTiles(ex, ey, G.exitTile.x, G.exitTile.y) < 3) continue;

            // evita sovrapposizioni con altri nemici
            if (enemies.some(en => en.x === ex && en.y === ey)) continue;

            // ok
            enemies.push({
              type: 'goblin',
              x: ex, y: ey,
              px: ex * tile, py: ey * tile,
              slow: false, direction: 'down', stepFrame: 0,
              isMoving: false, animTime: 0, reactDelay: 2, attacking: false
            });
            break;
          }
        }
      }

      // --- BAT: 40% solo se la stanza NON ha altri nemici ---
      // spawn su muro pieno, mai su porte né spallette vicino alla porta
      if (enemies.length === 0 && Math.random() < 0.40) {
        const spot = pickRandomWallCellNoDoor(roomRef);
        if (spot) {
          const tile = window.treasureTile || 64;
          enemies.push({
            type: 'bat',
            x: spot.x,
            y: spot.y,
            px: spot.x * tile,
            py: spot.y * tile,
            direction: 'down',
            stepFrame: 0,
            animTime: 0,
            isMoving: true,
            attacking: false,
            reactDelay: 0,
            slow: false,
            sPhase: Math.random() * Math.PI * 2
          });
        }
      }

      // powerup (speed)
      if (Math.random() < 0.35) {
        let ptx, pty;
        let tries = 0;
        do {
          ptx = 1 + Math.floor(Math.random() * (Cfg.roomW - 2));
          pty = 1 + Math.floor(Math.random() * (Cfg.roomH - 2));
          tries++;
        } while (tries < 50 && objects.some(o => !o.taken && o.x === ptx && o.y === pty));
        powerups.push({ x: ptx, y: pty, type: 'speed', taken: false });
      }

      // salva per stanza
      G.objects[key]  = objects;
      G.enemies[key]  = enemies;
      G.powerups[key] = powerups;
    }
  }

  // --- skulls decorativi ---
  G.skulls = [];
  const assetBase = isMobileOrTablet() ? 'assets/mobile' : 'assets/desktop';
  const skullSources = [
    `${assetBase}/backgrounds/teschio_1.png`,
    `${assetBase}/backgrounds/teschio_2.png`,
    `${assetBase}/backgrounds/teschio_3.png`,
  ];
  for (const src of skullSources) {
    let placed = false, attempts = 0;
    const img = new Image(); img.src = src;
    while (!placed && attempts < 100) {
      attempts++;
      const roomX = Math.floor(Math.random() * Cfg.gridW);
      const roomY = Math.floor(Math.random() * Cfg.gridH);
      const room = G.rooms[roomY][roomX];
      const cellX = Math.floor(Math.random() * Cfg.roomW);
      const cellY = Math.floor(Math.random() * Cfg.roomH);
      if (room[cellY][cellX] === 0) {
        G.skulls.push({ img, roomX, roomY, x: cellX, y: cellY });
        placed = true;
      }
    }
  }

  G.hudDirty = true;
}


  async function requestLandscape() {
  const el = document.documentElement; // o DOM.canvas

  // prova full screen (richiede gesto utente)
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen(); // iOS vecchi
  } catch (_) {}

  // prova lock orientamento (funziona quasi solo su Android)
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (_) {
    // ignoriamo: iOS non lo consente
  }
}


  // ---------- START LEVEL ----------
  function startLevel() {
    G.exiting = false;
    initTreasureMoveSheet();
    TreDrop.items.length = 0;

   // ensureMobileExitBtn();   // <— crea/posiziona il bottone su mobile
  resetJoystick(); 

  
    if (isTouch) DOM.joyBase.style.opacity = '0.45';
     G.petRoom = { x: Math.floor(Cfg.gridW/2), y: Math.floor(Cfg.gridH/2) };
  G.pet.x = 1; G.pet.y = 1;
  G.pet.px = 0; G.pet.py = 0;
   resizeTreasureCanvas();
   resyncPetToGrid();
repositionExitBtn();
   maybeSpawnMoveInRoom(G.level);
   // Pre-bake del layer statico della stanza corrente (facoltativo)
{
  const key = roomKey(G.petRoom.x, G.petRoom.y);
  bakeRoomLayer(key, G.rooms[G.petRoom.y][G.petRoom.x]);
}


    G.timeLeft = 90 + G.level * 2;
    G.playing = false;

    animateRevealCircle(() => {
      G.playing = true;
      // Talpa: attiva solo dal livello 2 in poi
G.mole.enabled = (G.level >= 2);
if (G.mole.enabled) {
  // scegli una stanza a caso
  G.mole.roomX = Math.floor(Math.random() * Cfg.gridW);
  G.mole.roomY = Math.floor(Math.random() * Cfg.gridH);

  // scegli una cella libera dentro quella stanza
  placeMoleAtRandomSpot();

  // fase iniziale
  G.mole.phase = 'emerge1';
  G.mole.t = 0;
}

      G.activePowerup = null;
      G.speedMul = 1;
      render();
      DOM.modal?.classList.remove('hidden');

      if (G.timerId) clearInterval(G.timerId);
      G.timerId = setInterval(() => {
        if (!G.playing) return;
        G.timeLeft--;
        G.hudDirty = true;
        if (G.timeLeft <= 0) endTreasureMinigame();
      }, Cfg.baseTimerMs);
    });
  }


  // ---------- END ----------
function endTreasureMinigame(reason = 'end') {
  G.exiting = false;
  stopBgm();
  G.playing = false;
  if (G.timerId) { clearInterval(G.timerId); G.timerId = null; }
  DOM.modal && DOM.modal.classList.add('hidden');
   //hideExitBtn();
  const fun = 15 + Math.round(G.score * 0.6);
  const exp = Math.round(G.score * 0.5);

  // salva quante monete hai preso in questa run prima di resettare
  const coinsThisRun = (G.coinsCollected | 0);

  setTimeout(async () => {
    try {
      // FUN/EXP al pet
      if (typeof window.updateFunAndExpFromMiniGame === 'function') {
        await window.updateFunAndExpFromMiniGame(fun, exp);
      }

      // Leaderboard: salva best score/level (la RPC ignora se level < 2)
if (typeof window.submitTreasureScoreSupabase === 'function') {
  await window.submitTreasureScoreSupabase(G.score|0, G.level|0);
}


      // GETTONI: prova vari helper globali (definiti in script.js)
// GETTONI: usa la RPC corretta esposta da script.js
if (coinsThisRun > 0) {
  await window.addGettoniSupabase?.(coinsThisRun);
  await window.refreshResourcesWidget?.();
}


      // feedback exp (opzionale)
      if (typeof window.showExpGainLabel === 'function' && exp > 0) {
        window.showExpGainLabel(exp);
      }
    } catch (err) {
      console.error('[Treasure] errore award EXP/FUN/coins:', err);
    } finally {
      // reset per la prossima partita
      G.coinsCollected = 0;
      G.keysStack = [];
      resetJoystick();
    }
  }, 180);
}


function showTreasureBonus(_msg, color = '#e67e22') {
  // Nasconde per sicurezza l'elemento del vecchio banner
  if (DOM.bonus) {
    DOM.bonus.style.display = 'none';
    DOM.bonus.textContent = '';
  }
  // (opzionale) un flash leggero sul canvas al posto del testo
  const cv = DOM.canvas;
  if (cv && cv.animate) {
    cv.animate(
      [{ filter: 'none' }, { filter: 'brightness(1.25)' }, { filter: 'none' }],
      { duration: 280, easing: 'ease-out' }
    );
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !DOM.modal.classList.contains('hidden')) {
    openExitConfirm();
  }
});
DOM.exitBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  // apri solo se il minigioco è visibile
  if (!DOM.modal?.classList.contains('hidden')) {
    openExitConfirm();
  }
});

// ===== Conferma Uscita =====
let _exitOverlay, _exitYes, _exitNo;

function ensureExitConfirmModal(){
  if (_exitOverlay) return;
  _exitOverlay = document.createElement('div');
  _exitOverlay.id = 'treasure-exit-confirm';
  _exitOverlay.innerHTML = `
    <div class="card" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <h3 id="exit-title" style="margin:0 0 6px;">Sei sicuro di voler uscire?</h3>
      <p class="muted" style="margin:0 0 10px;">La partita in corso verrà terminata.</p>
      <div class="actions">
        <button id="treasure-exit-yes" class="ui-btn">Sì</button>
        <button id="treasure-exit-no"  class="ui-btn secondary">No</button>
      </div>
    </div>`;

  // stile overlay (alto z-index e niente residui di pointer-events)
  Object.assign(_exitOverlay.style, {
    position:'fixed', inset:'0', display:'none', placeItems:'center',
    background:'rgba(0,0,0,.45)', zIndex: '100090'
  });

  const card = _exitOverlay.querySelector('.card');
  Object.assign(card.style, {
    width:'min(92vw, 360px)', background:'rgba(2,6,23,.92)', color:'#fff',
    border:'1px solid rgba(255,255,255,.08)', borderRadius:'14px',
    padding:'14px 16px', WebkitBackdropFilter:'blur(6px)', backdropFilter:'blur(6px)'
  });

  const acts = _exitOverlay.querySelector('.actions');
  Object.assign(acts.style, { display:'flex', gap:'8px', justifyContent:'flex-end' });

  document.body.appendChild(_exitOverlay);
  _exitYes = _exitOverlay.querySelector('#treasure-exit-yes');
  _exitNo  = _exitOverlay.querySelector('#treasure-exit-no');

  _exitYes.addEventListener('click', () => {
    _exitOverlay.style.display = 'none';
    endTreasureMinigame('quit');
  });

  _exitNo.addEventListener('click', () => {
    _exitOverlay.style.display = 'none';
    // 🔧 riprendi SEMPRE il gioco
    G.playing = true;
    // sblocca eventuali direzioni rimaste appiccicate / joystick centrato
    updatePetDirFromJoystick?.(0,0);
    resetJoystick?.();
    // ridisegna e riposiziona il bottone (se il layout è cambiato)
    render?.(); repositionExitBtn?.();
  });

  // click fuori card = annulla
  _exitOverlay.addEventListener('click', (e) => {
    if (e.target === _exitOverlay) _exitNo.click();
  });
}

function openExitConfirm(){
  ensureExitConfirmModal();
  G.playing = false;                 // pausa
  _exitOverlay.style.display = 'grid';
}


 
// ---------- JOYSTICK (bind una sola volta) ----------
let joyCenter = { x: 0, y: 0 };
const stickRadius = 32;

function updatePetDirFromJoystick(dx, dy) {
  G.pet.dirX = dx; G.pet.dirY = dy;
  if (dx > 0.2) G.pet.direction = 'right';
  else if (dx < -0.2) G.pet.direction = 'left';
  else if (dy < -0.2) G.pet.direction = 'up';
  else if (dy > 0.2) G.pet.direction = 'down';
}
function resetJoystick() {
  if (DOM.joyStick) {
    // hard reset: niente residui di scale/rotate
    DOM.joyStick.style.transform = 'translate3d(-50%,-50%,0)';
    // forziamo un reflow, poi riaffermiamo (alcuni browser “saltano” il primo set)
    DOM.joyStick.getBoundingClientRect();
    DOM.joyStick.style.transform = 'translate3d(-50%,-50%,0)';
  }
  updatePetDirFromJoystick(0,0);
  DOM.joyBase?.classList.remove('active');
}



/*
function ensureMobileExitBtn(){
  let btn = document.getElementById('treasure-exit-btn');
  if (!btn){
    btn = document.createElement('button');
    btn.id = 'treasure-exit-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label','Esci');
    btn.innerHTML = '⎋'; // puoi sostituire con un’icona svg
    btn.onclick = (e)=>{ e.preventDefault(); openExitConfirm(); };
    document.body.appendChild(btn);
  }
  btn.hidden = false;
  repositionExitBtn();  // posiziona subito
}
*/
function repositionExitBtn(){ /* noop: gestito dal layout della barra */ }
function ensureMobileExitBtn(){ /* noop: bottone già in HTML */ }
function hideExitBtn(){ /* opzionale: se vuoi nasconderlo via JS */ }
/*
function repositionExitBtn(){
  const btn = document.getElementById('treasure-exit-btn');
  if (!btn) return;

  // 1) prova ad ancorare alla barra info in alto
  const bar = document.querySelector('.treasure-info-bar'); // <-- cambia selettore se diverso
  const cv  = document.getElementById('treasure-canvas');

  const margin = 8;
  const vv = window.visualViewport;
  const safeTop = vv ? vv.offsetTop : 0; // notch/safe-area

  let top  = margin + safeTop;
  let left = window.innerWidth - btn.offsetWidth - margin;

  if (bar && bar.offsetParent !== null) {
    const r = bar.getBoundingClientRect();
    // allinea verticalmente al centro della barra e a destra, dentro la barra
    top  = r.top  + (r.height - btn.offsetHeight) / 2;
    left = r.right - btn.offsetWidth - margin;
  } else if (cv) {
    // 2) fallback: ancoralo al canvas (in alto a destra)
    const r = cv.getBoundingClientRect();
    top  = r.top  + margin;
    left = r.right - btn.offsetWidth - margin;
  }

  // mantieni sempre dentro lo schermo
  top  = Math.max(margin + safeTop, Math.min(top,  window.innerHeight - btn.offsetHeight - margin));
  left = Math.max(margin,            Math.min(left, window.innerWidth  - btn.offsetWidth  - margin));

  btn.style.top  = `${Math.round(top)}px`;
  btn.style.left = `${Math.round(left)}px`;
} */





function handleJoystickMove(touch) {
  const x = touch.clientX - joyCenter.x;
  const y = touch.clientY - joyCenter.y;
  const dist = Math.sqrt(x*x + y*y);
  let nx = x, ny = y;
  if (dist > stickRadius) { nx = x * stickRadius / dist; ny = y * stickRadius / dist; }
  if (DOM.joyStick) DOM.joyStick.style.transform = `translate(-50%,-50%) translate(${nx}px,${ny}px)`;
  let dx = nx / stickRadius, dy = ny / stickRadius;
  const dead = 0.18; if (Math.abs(dx) < dead) dx = 0; if (Math.abs(dy) < dead) dy = 0;
  updatePetDirFromJoystick(dx, dy);
}

// Handlers bindati UNA volta sola
function onJoyStart(e){
  e.preventDefault();
  DOM.joyBase.classList.add('active');
  DOM.joyBase.style.opacity = '0.9';
  DOM.joyBase.style.bottom = `calc(16px + env(safe-area-inset-bottom, 0px))`;
  const rect = DOM.joyBase.getBoundingClientRect();
  joyCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
  if (e.touches[0]) handleJoystickMove(e.touches[0]);
}
function onJoyMove(e){
  e.preventDefault();
  if (e.touches[0]) handleJoystickMove(e.touches[0]);
}
function onJoyEnd(e){
  e.preventDefault();
  DOM.joyBase.style.opacity = '0.45';
  resetJoystick();
}

DOM.joyBase?.addEventListener('touchstart',  onJoyStart, { passive:false });
DOM.joyBase?.addEventListener('touchmove',   onJoyMove,  { passive:false });
DOM.joyBase?.addEventListener('touchend',    onJoyEnd,   { passive:false });
DOM.joyBase?.addEventListener('touchcancel', onJoyEnd,   { passive:false });


  // ---------- EVENTI ----------
  function showTreasureArrowsIfMobile() {
    const arrows = document.querySelector('.treasure-arrows-container');
    if (!arrows) return;
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) arrows.style.display = '';
    else arrows.style.display = 'none';
  }
  showTreasureArrowsIfMobile();


let _rszT;
window.addEventListener('resize', () => {
  clearTimeout(_rszT);
  _rszT = setTimeout(() => {
    if (G.playing) {
      resizeTreasureCanvas();
      render();
      resyncPetToGrid();
      resetJoystick();
      G.hudDirty = true;
    }
    showTreasureArrowsIfMobile();
  }, 60);
}, { passive:true });




  // ---------- REVEAL ----------
  function animateRevealCircle(callback) {
    const W = DOM.canvas.width, H = DOM.canvas.height;
    let start = null;
    function drawFrame(now) {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / Cfg.revealMs);
      const radius = 20 + progress * (Math.sqrt(W*W + H*H) / 2);

      render();

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,W,H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(W/2, H/2, radius, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      if (progress < 1) requestAnimationFrame(drawFrame);
      else if (typeof callback === 'function') callback();
    }
    requestAnimationFrame(drawFrame);
  }

  // ---------- API PUBBLICA ----------
  window.startTreasureMinigame = startTreasureMinigame;
  window.endTreasureMinigame = endTreasureMinigame;
  window.resizeTreasureCanvas = resizeTreasureCanvas;
  window.resetJoystick = resetJoystick; // se serve fuori

})();
// RIMUOVI/COMMENTA tutti gli altri listener a treasure-exit-btn
// e qualsiasi ensureMobileExitBtn/repositionExitBtn vecchio.

// HUD mobile: wrapper + compact + padding per "Esci" (senza ResizeObserver)
(function setupTreasureHud(){
  const bar = document.querySelector('#treasure-minigame-modal .treasure-info-bar');
  if (!bar) return;

  // crea .wrap se manca
  let wrap = bar.querySelector('.wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.className = 'wrap';
    while (bar.firstChild) wrap.appendChild(bar.firstChild);
    bar.appendChild(wrap);
  }

  const exitBtn = wrap.querySelector('#treasure-exit-btn, .treasure-exit-btn');

  let scheduled = false;
  function measureAndApply(){
    scheduled = false;

    // padding a destra per non far coprire le pill dai "Esci"
    const pad = ((exitBtn?.offsetWidth || 68) + 12) + 'px';
    if (wrap.style.paddingRight !== pad) {
      wrap.style.setProperty('--exit-pad', pad);
      wrap.style.paddingRight = pad;
    }

    // modalità compatta solo se SERVE e solo se cambia
    const needCompact = wrap.scrollWidth > wrap.clientWidth;
    if (wrap.classList.contains('compact') !== needCompact) {
      wrap.classList.toggle('compact', needCompact);
    }
  }

  function schedule(){ if (!scheduled){ scheduled = true; requestAnimationFrame(measureAndApply); } }

  window.addEventListener('resize', schedule, {passive:true});
  schedule(); // prima misura
})();

document.addEventListener('DOMContentLoaded', () => {
  const playBtn = document.getElementById('play-btn');
  const modal = document.getElementById('minigame-select-modal');
  const openTreasure = document.getElementById('btn-minigame-treasure');
  const closeModal = document.getElementById('btn-minigame-cancel');

  if (playBtn && modal) {
    playBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
  }

  if (openTreasure) {
    openTreasure.addEventListener('click', () => {
      modal.classList.add('hidden');

      //playBgm();  


      if (typeof window.startTreasureMinigame === 'function') {
        window.startTreasureMinigame();
      } else {
        //console.warn('startTreasureMinigame non trovato');
      }
    });
  }

  if (closeModal) {
    closeModal.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
});
