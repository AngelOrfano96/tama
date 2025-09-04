/*
  Minigioco: Caccia al Tesoro (from scratch)
  ---------------------------------------------------------
  - Random dungeon (MxN) rooms (2x3, 3x3, 3x4, 4x4, ...)
  - Doors always open; pet moves room→room
  - Enemies: goblin (ground, collides walls), bat (spawns on/top of walls, no wall collisions)
  - Coins & potions in rooms; collect all coins to open a trapdoor to next dungeon
  - Low-chance ground drops for moves/items; award via RPC (server-side) like Arena
  - Responsive canvas; mobile joystick; DOM infobox (timer/coins/level/score)
  - Leaderboard submit via existing RPC: submit_treasure_score
  - Rewards at end via window.updateFunAndExpFromMiniGame + addGettoniSupabase

  NOTE: Graphic picks are placeholders—configure your atlas cells below.
*/
(function TreasureMinigame(){
  'use strict';

  // ────────────────────────────────────────────────────────────────────────────
  // Supabase bridge (single source of truth)
  // ────────────────────────────────────────────────────────────────────────────
  const sb = () => {
    const c = window.supabaseClient;
    if (!c) throw new Error('[Treasure] Supabase client not ready');
    return c;
  };

  // ────────────────────────────────────────────────────────────────────────────
  // DOM wiring
  // ────────────────────────────────────────────────────────────────────────────
  const DOM = {
    modal: null,
    canvas: null,
    ctx: null,
    infoCoins: null,
    infoTimer: null,
    infoLevel: null,
    infoScore: null,
    btnExit: null,
    joyBase: null,
    joyStick: null,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Config
  // ────────────────────────────────────────────────────────────────────────────
  const CFG = {
    // Canvas/grid
    roomTilesW: 13,
    roomTilesH: 10, // visible interior including floor; walls overlayed for depth
    wallDepthTop: 2,   // visual depth in tiles (drawn above the pet)
    wallDepthBottom: 1,
    wallDepthSides: 1,

    // Game
    baseTimePerDungeon: 60, // seconds
    timeBonusPerDungeon: 6, // +sec every next dungeon
    petSpeedDesktop: 150,
    petSpeedMobile: 95,
    touchDeadZone: 0.12,

    // Spawns
    coinsPerRoom: [2,3,4],
    potionChance: 0.18,
    moveDropChance: 0.03,  // low chance static ground drop
    itemDropChance: 0.03,

    // Enemies
    goblinPerRoom: [0,1,2],
    batPerRoom: [0,1],
    goblinSpeedMul: 0.85, // relative to pet desktop speed
    batSpeed: 140,
    avoidDoorRadius: 1.2, // tiles from door center
    avoidPlayerRadius: 2.2, // min distance at spawn

    // Collisions
    petRadius: 0.34,
    enemyRadius: 0.34,
    coinRadius: 0.28,
    potionRadius: 0.32,
    pickupRadius: 0.30,

    // UI / responsiveness
    minTile: 32,
    maxTileDesktop: 384,
    maxTileMobile: 192,

    // Scoring
    scoreCoin: 5,
    scorePotion: 8,
    scoreDungeonClear: 50,

    // Atlases
    ATLAS_TILE: 16,
  };

  const isMobile = (() => (window.matchMedia?.('(pointer:coarse)')?.matches ?? false) || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent))();

  // ────────────────────────────────────────────────────────────────────────────
  // Atlas & pick helpers (configure your cells below)
  // ────────────────────────────────────────────────────────────────────────────
  const assetRoot = isMobile ? 'assets/mobile' : 'assets/desktop';
  const atlasRoot = `${assetRoot}/atlas`;
  const enemyRoot = `${assetRoot}/enemies`;

  const pick = (c, r, w=1, h=1) => ({ sx: c*CFG.ATLAS_TILE, sy: r*CFG.ATLAS_TILE, sw: w*CFG.ATLAS_TILE, sh: h*CFG.ATLAS_TILE });

  const DECOR = {
    // floor variants used inside room interior area
    floor: [ pick(6,0), pick(6,1), pick(7,0), pick(7,1) ],
    // walls body + caps to create depth; tweak to match your Dungeon_2.png
    wallBody: {
      top:    [ pick(1,4), pick(1,7) ],
      bottom: [ pick(7,4) ],
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
    // doors can simply be gaps; optionally draw frames here if desired
  };

  const SPRITES = {
    atlas: null,     // rooms
    goblinSheet: null,
    batSheet: null,
    // animation rows/cols; plug your own if different
    goblin: { walkDown:2, walkRight:3, walkUp:4, idleRow:2, cols:[0,1,2,3], size:48 },
    bat:    { flyDown:2,  flyRight:3,  flyUp:4,  idleRow:2, cols:[0,1,2,3], size:48 },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Game state
  // ────────────────────────────────────────────────────────────────────────────
  const G = {
    running: false,
    tile: 64,
    dpr: 1,
    now: performance.now(),
    last: performance.now(),

    // dungeon
    dungeonIndex: 1,
    gridW: 3,
    gridH: 3,
    rooms: [],       // 2D array of Room objects
    curRX: 0,
    curRY: 0,
    totalCoins: 0,
    collectedCoins: 0,
    trapDoorOpen: false,

    // player
    px: 0, py: 0, vx: 0, vy: 0, facing: 'down',
    speedBonusUntil: 0,

    // enemies & pickups in current room (for perf; rooms also cache their content)
    enemies: [], pickups: [],

    // inputs
    keys: new Set(),
    joy: {active:false, vx:0, vy:0},

    // meta
    timeLeft: CFG.baseTimePerDungeon,
    score: 0,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Utility
  // ────────────────────────────────────────────────────────────────────────────
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const randInt = (a,b) => a + ((Math.random()*(b-a+1))|0);
  const choice = (arr) => arr[(Math.random()*arr.length)|0];
  const dist2 = (ax,ay,bx,by) => (ax-bx)*(ax-bx) + (ay-by)*(ay-by);
  const nowMs = () => performance.now();

  const petSpeed = () => {
    const base = isMobile ? CFG.petSpeedMobile : CFG.petSpeedDesktop;
    const bonus = (nowMs() < G.speedBonusUntil) ? 1.25 : 1.0;
    return base * bonus;
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Styles (lightweight injection, dedicated to this minigame)
  // ────────────────────────────────────────────────────────────────────────────
  function ensureStyles(){
    if (document.getElementById('treasure-css')) return;
    const css = `
    #treasure-minigame-modal{position:fixed;inset:0;background:#0b0e13;display:none;align-items:center;justify-content:center;z-index:10000}
    #treasure-minigame-modal.show{display:flex}
    #treasure-canvas{image-rendering:pixelated;touch-action:none;}
    .treasure-info-bar{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(13,15,18,.92);color:#e5e7eb;border:1px solid #2a2f36;border-radius:12px;padding:8px 12px;display:flex;gap:14px;align-items:center;z-index:10;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial}
    .treasure-joystick-overlay{position:fixed;left:12px;bottom:12px;width:160px;height:160px;z-index:10010;pointer-events:none}
    .treasure-joystick-base{position:absolute;left:0;bottom:0;width:160px;height:160px;border-radius:9999px;background:rgba(31,41,55,.25);backdrop-filter:blur(2px);pointer-events:auto;touch-action:none}
    .treasure-joystick-stick{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:70px;height:70px;border-radius:9999px;background:#1f2937;border:2px solid #374151}
    .treasure-exit-btn{background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:6px 10px;font-weight:700}
    .treasure-float-label{position:absolute;left:50%;top:22%;transform:translateX(-50%);font:700 28px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#ffe44c;text-shadow:2px 2px 6px #000,0 0 24px #fff;pointer-events:none;opacity:0;transition:opacity .2s}
    `;
    const el = document.createElement('style');
    el.id = 'treasure-css'; el.textContent = css;
    document.head.appendChild(el);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Room & dungeon generation
  // ────────────────────────────────────────────────────────────────────────────
  function chooseGridSize(){
    const options = [ [2,3], [3,3], [3,4], [4,4] ];
    return choice(options);
  }

  function makeEmptyRooms(w,h){
    const arr = new Array(h);
    for (let y=0;y<h;y++){ arr[y] = new Array(w).fill(null); }
    return arr;
  }

  function newDungeon(){
    const [gw, gh] = chooseGridSize();
    G.gridW = gw; G.gridH = gh;
    G.rooms = makeEmptyRooms(gw, gh);
    G.curRX = (gw/2)|0; G.curRY = (gh/2)|0; // start from center-ish
    G.totalCoins = 0; G.collectedCoins = 0; G.trapDoorOpen = false;
    G.timeLeft = CFG.baseTimePerDungeon + (G.dungeonIndex-1) * CFG.timeBonusPerDungeon;

    for (let ry=0; ry<gh; ry++){
      for (let rx=0; rx<gw; rx++){
        const room = buildRoom(rx, ry);
        G.rooms[ry][rx] = room;
        G.totalCoins += room.coins.length;
      }
    }

    loadRoom(G.curRX, G.curRY);
    centerPlayerInRoom();
  }

  function buildRoom(rx, ry){
    const room = {
      rx, ry,
      // connectivity (doors) – open if neighbor exists in grid
      doors: { up: ry>0, down: ry< G.gridH-1, left: rx>0, right: rx< G.gridW-1 },
      coins: [],
      potions: [],
      drops: [], // ground move/item drops
      enemies: [],
      baked: null, // pre-rendered static layer
    };

    // coins
    const nCoins = choice(CFG.coinsPerRoom);
    for (let i=0;i<nCoins;i++){
      room.coins.push(randPointInInterior(0.25, room));
    }
    // potion (chance)
    if (Math.random() < CFG.potionChance){
      room.potions.push(randPointInInterior(0.25, room));
    }
    // static move/item ground drops (low chance)
    if (Math.random() < CFG.moveDropChance) room.drops.push({ kind:'move', key: choice(['ball','repulse','basic_attack']), ...randPointInInterior(0.25, room) });
    if (Math.random() < CFG.itemDropChance) room.drops.push({ kind:'item', key: choice(['ring_speed','amulet_power']), ...randPointInInterior(0.25, room) });

    // enemies – avoid doors & center, goblins on floor, bats on walls only
    const nGob = choice(CFG.goblinPerRoom);
    const nBat = choice(CFG.batPerRoom);
    for (let i=0;i<nGob;i++) room.enemies.push(makeEnemy('goblin', room));
    for (let i=0;i<nBat;i++) room.enemies.push(makeEnemy('bat', room));

    return room;
  }

  function randPointInInterior(padTiles=0.2, room){
    const t = G.tile;
    const pad = padTiles * t;
    const minX = 1*t + pad;
    const maxX = (CFG.roomTilesW-2)*t - pad;
    const minY = (1 + CFG.wallDepthTop)*t + pad;
    const maxY = (CFG.roomTilesH-2 - CFG.wallDepthBottom)*t - pad;
    return { x: minX + Math.random()*(maxX-minX), y: minY + Math.random()*(maxY-minY) };
  }
  function tooCloseToPlayer(x, y, minPx = G.tile * 1.5) {
  const px = G?.pet?.px, py = G?.pet?.py;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  const dx = x - px, dy = y - py;
  return (dx * dx + dy * dy) < (minPx * minPx);
}


  function makeEnemy(type, room){
    if (type === 'bat'){
      // spawn on top band (over the walls); y anchored at top cap area
      const t = G.tile;
      const y = (1 + CFG.wallDepthTop - 0.6)*t; // slightly overlapping cap
      const x = (1*t) + t + Math.random()*((CFG.roomTilesW-4)*t);
      return { type:'bat', x, y, hp: 1, speed: CFG.batSpeed, noClip:true };
    }
    // goblin – near center, avoid doors & player spawn
 // goblin – near center, avoid doors & player spawn
for (let k = 0; k < 20; k++) {
  const p = randPointInInterior(1.0, room); // p = { x, y } in pixel
  if (tooCloseToDoors(p.x, p.y, G.tile * 1.5, room)) continue;
  if (tooCloseToPlayer(p.x, p.y, G.tile * 1.6)) continue; // opzionale, vedi helper sotto
  return {
    type: 'goblin',
    x: p.x,
    y: p.y,
    hp: 1,
    speed: CFG.petSpeedDesktop * CFG.goblinSpeedMul,
    noClip: false
  };
}

    const fallback = randPointInInterior(0.5, room);
    return { type:'goblin', x:fallback.x, y:fallback.y, hp: 1, speed: CFG.petSpeedDesktop*CFG.goblinSpeedMul, noClip:false };
  }

// SOSTITUISCI la tua tooCloseToDoors con questa
function tooCloseToDoors(x, y, minPx = G.tile * 1.0, room = curRoom()) {
  const ds = doorCenters(room);               // usa la stanza passata (o quella corrente)
  const r2 = (minPx * minPx) | 0;
  for (const d of ds) {
    const dx = x - d.x, dy = y - d.y;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}


// SOSTITUISCI la tua doorCenters con questa
function doorCenters(room = curRoom()) {
  const t  = G.tile;
  const cx = (CFG.roomTilesW * t) / 2;
  const cy = (CFG.roomTilesH * t) / 2;

  // fallback: se room è null/undefined o non ha doors, ritorna lista vuota
  if (!room || !room.doors) return [];

  const list = [];
  if (room.doors.up)    list.push({ x: cx, y: (1 + CFG.wallDepthTop) * t });
  if (room.doors.down)  list.push({ x: cx, y: (CFG.roomTilesH - 2 - CFG.wallDepthBottom) * t });
  if (room.doors.left)  list.push({ x: 1 * t, y: cy });
  if (room.doors.right) list.push({ x: (CFG.roomTilesW - 2) * t, y: cy });
  return list;
}


  function curRoom(){ return G.rooms[G.curRY][G.curRX]; }

  function loadRoom(rx, ry){
    const room = G.rooms[ry][rx];
    // create deep-ish copies for live entities/pickups per entry
    G.enemies = room.enemies.map(e => ({...e}));
    G.pickups = [
      ...room.coins.map(c => ({kind:'coin', x:c.x, y:c.y})),
      ...room.potions.map(p => ({kind:'potion', x:p.x, y:p.y})),
      ...room.drops.map(d => ({kind:d.kind, key:d.key, x:d.x, y:d.y})),
    ];
  }

  function centerPlayerInRoom(){
    G.px = (CFG.roomTilesW/2)*G.tile; G.py = (CFG.roomTilesH/2)*G.tile;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Rendering (layered: static bake + actors)
  // ────────────────────────────────────────────────────────────────────────────
  function loadSprites(){
    if (!SPRITES.atlas){ SPRITES.atlas = new Image(); SPRITES.atlas.src = `${atlasRoot}/Dungeon_2.png`; }
    if (!SPRITES.goblinSheet){ SPRITES.goblinSheet = new Image(); SPRITES.goblinSheet.src = `${enemyRoot}/chara_orc.png`; }
    if (!SPRITES.batSheet){ SPRITES.batSheet = new Image(); SPRITES.batSheet.src = `${enemyRoot}/chara_bat.png`; }
  }

  function drawStaticLayer(){
    const r = curRoom();
    if (r.baked && r.baked.tile === G.tile) { DOM.ctx.drawImage(r.baked.canvas, 0, 0); return; }

    const wpx = CFG.roomTilesW*G.tile, hpx = CFG.roomTilesH*G.tile;
    const cv = document.createElement('canvas'); cv.width = wpx; cv.height = hpx;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;

    // floor interior only (between walls bands)
    for (let ty=1+CFG.wallDepthTop; ty<CFG.roomTilesH-1-CFG.wallDepthBottom; ty++){
      for (let tx=1; tx<CFG.roomTilesW-1; tx++){
        const d = DECOR.floor[( (tx*73856093 ^ ty*19349663)>>>0 ) % DECOR.floor.length];
        if (SPRITES.atlas?.complete) c.drawImage(SPRITES.atlas, d.sx,d.sy,d.sw,d.sh, tx*G.tile,ty*G.tile, G.tile,G.tile);
      }
    }

    // walls stacks (body + cap) — top
    stackWallBand(c, 'top',    0, 0, CFG.wallDepthTop);
    stackWallBand(c, 'bottom', 0, CFG.roomTilesH-1, CFG.wallDepthBottom);
    stackWallBand(c, 'left',   0, 0, CFG.wallDepthSides);
    stackWallBand(c, 'right',  CFG.roomTilesW-1, 0, CFG.wallDepthSides);

    r.baked = { canvas: cv, tile: G.tile };
    DOM.ctx.drawImage(cv, 0, 0);
  }

  function stackWallBand(c, side, tileX, tileY, depth){
    const body = DECOR.wallBody[side], cap = DECOR.wallCap[side];
    const t = G.tile, W = CFG.roomTilesW, H = CFG.roomTilesH;
    if (!body) return;
    const pickVar = (A, i) => Array.isArray(A) ? A[i%A.length] : A;

    const drawAt = (sx,sy,dx,dy) => {
      if (!SPRITES.atlas?.complete) return;
      c.drawImage(SPRITES.atlas, sx,sy, CFG.ATLAS_TILE,CFG.ATLAS_TILE, dx,dy, t,t);
    };

    if (side==='top' || side==='bottom'){
      const y0 = tileY*t;
      for (let x=1; x<=W-2; x++){
        for (let i=0;i<depth;i++){
          const b = pickVar(body, i); drawAt(b.sx,b.sy, x*t, y0 + (side==='top'? i*t : -i*t));
        }
        const cp = pickVar(cap,0); drawAt(cp.sx,cp.sy, x*t, y0 + (side==='top'? depth*t : -depth*t));
      }
      // corners
      const corners = {
        top:    ['corner_tl','corner_tr'],
        bottom: ['corner_bl','corner_br'],
      }[side];
      const coords = side==='top' ? [[0,0],[W-1,0]] : [[0,(H-1)*t],[ (W-1)*t,(H-1)*t ]];
      ['tl','tr','bl','br'];
      const bodies = [ DECOR.wallBody[corners[0]], DECOR.wallBody[corners[1]] ];
      const caps   = [ DECOR.wallCap[corners[0]],  DECOR.wallCap[corners[1]]  ];
      for (let k=0;k<2;k++){
        const [dx,dy] = coords[k];
        for (let i=0;i<depth;i++){
          const b = pickVar(bodies[k], i); drawAt(b.sx,b.sy, dx, dy + (side==='top'? i*t : -i*t));
        }
        const cp = pickVar(caps[k],0); drawAt(cp.sx,cp.sy, dx, dy + (side==='top'? depth*t : -depth*t));
      }
    } else { // left/right columns
      const x0 = tileX*t;
      for (let y=1; y<=H-2; y++){
        for (let i=0;i<depth;i++){
          const b = pickVar(body, i); drawAt(b.sx,b.sy, x0 + (side==='left'? i*t : -i*t), y*t);
        }
        const cp = pickVar(cap,0); drawAt(cp.sx,cp.sy, x0 + (side==='left'? depth*t : -depth*t), y*t);
      }
    }
  }

  function drawActors(){
    const c = DOM.ctx, t = G.tile;

    // trapdoor if open (center)
    if (G.trapDoorOpen){
      c.save(); c.globalAlpha = 0.9; c.fillStyle = '#0f172a';
      const sz = t*0.9; c.fillRect((CFG.roomTilesW/2)*t - sz/2, (CFG.roomTilesH/2)*t - sz/2, sz, sz);
      c.restore();
    }

    // coins & potions & ground drops
    for (const p of G.pickups){
      const x = p.x, y = p.y;
      if (p.kind==='coin'){
        // simple coin: yellow circle
        c.save(); c.fillStyle='#fbbf24'; c.beginPath(); c.arc(x, y, CFG.coinRadius*t, 0, Math.PI*2); c.fill(); c.restore();
      } else if (p.kind==='potion'){
        c.save(); c.fillStyle='#60a5fa'; c.beginPath(); c.rect(x - 0.22*t, y - 0.28*t, 0.44*t, 0.56*t); c.fill(); c.restore();
      } else if (p.kind==='move' || p.kind==='item'){
        c.save(); c.globalAlpha = 0.9; c.fillStyle = p.kind==='move' ? '#22d3ee' : '#a78bfa';
        c.beginPath(); c.arc(x, y, CFG.pickupRadius*t, 0, Math.PI*2); c.fill(); c.restore();
      }
    }

    // enemies
    for (const e of G.enemies){ drawEnemy(e); }

    // player
    drawPlayer();

    // draw top wall cap overlay (depth)
    drawTopForegroundOverlay();
  }

  function drawEnemy(e){
    const c = DOM.ctx, t = G.tile, sz = t*0.78;
    const dx = e.x - sz/2, dy = e.y - sz/2;
    // sprite support (animated) – placeholder simple anim by time
    const sheet = (e.type==='bat') ? SPRITES.batSheet : SPRITES.goblinSheet;
    const meta  = (e.type==='bat') ? SPRITES.bat : SPRITES.goblin;
    let frame = 0;
    if (sheet?.complete){
      const fps = 6, i = ((performance.now()*0.001*fps)|0) % meta.cols.length;
      frame = meta.cols[i];
      const row = meta.walkDown;
      DOM.ctx.drawImage(sheet, frame*meta.size, row*meta.size, meta.size, meta.size, dx, dy, sz, sz);
    } else {
      // fallback colored block
      c.fillStyle = e.type==='bat' ? '#a78bfa' : '#ef4444';
      c.fillRect(dx, dy, sz, sz);
    }
  }

  function drawPlayer(){
    const c=DOM.ctx,t=G.tile,sz=t*0.8; c.save(); c.fillStyle='#ffd54f'; c.fillRect(G.px - sz/2, G.py - sz/2, sz, sz); c.restore();
  }

  function drawTopForegroundOverlay(){
    const c=DOM.ctx, t=G.tile; c.save(); c.globalAlpha=0.16; c.fillStyle='#000';
    c.fillRect(1*t, (1+CFG.wallDepthTop)*t, (CFG.roomTilesW-2)*t, Math.round(t*0.28));
    c.restore();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Physics & input
  // ────────────────────────────────────────────────────────────────────────────
  function update(dt){
    // input vector
    let ix=0, iy=0;
    if (G.keys.has('left')) ix -= 1;
    if (G.keys.has('right')) ix += 1;
    if (G.keys.has('up')) iy -= 1;
    if (G.keys.has('down')) iy += 1;
    ix += G.joy.vx; iy += G.joy.vy;
    const L = Math.hypot(ix, iy); if (L>1) { ix/=L; iy/=L; }

    const spd = petSpeed();
    const nx = G.px + ix*spd*dt, ny = G.py + iy*spd*dt;

    const after = clampToRoom(nx, ny);
    G.px = after.x; G.py = after.y;

    if (Math.abs(ix)>Math.abs(iy)) G.facing = ix>0?'right':'left'; else if (Math.abs(iy)>0.01) G.facing = iy>0?'down':'up';

    // enemies home-in
    for (const e of G.enemies){
      const dx = G.px - e.x, dy = G.py - e.y; const d = Math.hypot(dx, dy) || 1;
      const vx = (dx/d) * e.speed * dt, vy = (dy/d) * e.speed * dt;
      let ex = e.x + vx, ey = e.y + vy;
      if (!e.noClip){ const p = clampToRoom(ex, ey); ex = p.x; ey = p.y; }
      e.x = ex; e.y = ey;
      // touch kills
      const touchR = (CFG.petRadius + CFG.enemyRadius)*G.tile;
      if (dist2(G.px,G.py,e.x,e.y) < touchR*touchR){ endGame('Sei stato colpito!'); return; }
    }

    // pickups
    for (let i=G.pickups.length-1; i>=0; i--){
      const p = G.pickups[i];
      const R = (p.kind==='coin'?CFG.coinRadius:(p.kind==='potion'?CFG.potionRadius:CFG.pickupRadius))*G.tile;
      if (dist2(G.px,G.py,p.x,p.y) <= R*R){
        if (p.kind==='coin'){ G.collectedCoins++; G.score += CFG.scoreCoin; updateInfo(); checkTrapdoor(); }
        else if (p.kind==='potion'){ G.speedBonusUntil = nowMs() + 6000; G.score += CFG.scorePotion; updateInfo(); showFloatLabel('+Velocità!'); }
        else if (p.kind==='move'){ awardMove(p.key); showFloatLabel('Mossa!'); }
        else if (p.kind==='item'){ awardItem(p.key); showFloatLabel('Oggetto!'); }
        G.pickups.splice(i,1);
      }
    }

    // door transitions
    handleDoors();

    // timer
    G.timeLeft -= dt; if (G.timeLeft <= 0){ endGame('Tempo scaduto'); return; }
  }

  function clampToRoom(x,y){
    const t=G.tile;
    const bMinX = 1*t + CFG.petRadius*t, bMaxX = (CFG.roomTilesW-2)*t - CFG.petRadius*t;
    const bMinY = (1+CFG.wallDepthTop)*t + CFG.petRadius*t, bMaxY = (CFG.roomTilesH-2-CFG.wallDepthBottom)*t - CFG.petRadius*t;
    return { x: clamp(x,bMinX,bMaxX), y: clamp(y,bMinY,bMaxY) };
  }

  function handleDoors(){
    const t=G.tile; const x=G.px, y=G.py; const room=curRoom();
    const centerX = (CFG.roomTilesW/2)*t, centerY = (CFG.roomTilesH/2)*t;
    const doorW = t*2.2, doorH = t*1.6;
    const nearUp = room.doors.up && Math.abs(x-centerX) < doorW/2 && y <= (1+CFG.wallDepthTop)*t + doorH/2;
    const nearDown = room.doors.down && Math.abs(x-centerX) < doorW/2 && y >= (CFG.roomTilesH-2-CFG.wallDepthBottom)*t - doorH/2;
    const nearLeft = room.doors.left && Math.abs(y-centerY) < doorW/2 && x <= 1*t + doorH/2;
    const nearRight= room.doors.right&& Math.abs(y-centerY) < doorW/2 && x >= (CFG.roomTilesW-2)*t - doorH/2;

    if (nearUp){ G.curRY--; loadRoom(G.curRX,G.curRY); G.py = (CFG.roomTilesH-2-CFG.wallDepthBottom-0.6)*t; }
    else if (nearDown){ G.curRY++; loadRoom(G.curRX,G.curRY); G.py = (1+CFG.wallDepthTop+0.6)*t; }
    else if (nearLeft){ G.curRX--; loadRoom(G.curRX,G.curRY); G.px = (CFG.roomTilesW-2-0.6)*t; }
    else if (nearRight){ G.curRX++; loadRoom(G.curRX,G.curRY); G.px = (1+0.6)*t; }
  }

  function checkTrapdoor(){
    if (!G.trapDoorOpen && G.collectedCoins >= G.totalCoins){ G.trapDoorOpen = true; showFloatLabel('Botola Aperta!'); }
    // if player on trapdoor → next dungeon
    if (!G.trapDoorOpen) return;
    const t=G.tile; const cx=(CFG.roomTilesW/2)*t, cy=(CFG.roomTilesH/2)*t; const R=t*0.6;
    if (dist2(G.px,G.py,cx,cy) <= R*R){
      // progress
      G.score += CFG.scoreDungeonClear; G.dungeonIndex++;
      updateInfo();
      newDungeon();
    }
  }

  function showFloatLabel(text){
    let el = document.getElementById('treasure-bonus-label');
    if (!el){
      el = document.createElement('div'); el.id = 'treasure-bonus-label'; el.className='treasure-float-label';
      DOM.modal.appendChild(el);
    }
    el.textContent = text; el.style.opacity='1';
    setTimeout(()=>{ el.style.opacity='0'; }, 900);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RPC helpers (server-side awards)
  // ────────────────────────────────────────────────────────────────────────────
  async function awardMove(moveKey){
    try {
      const pid = window.petId; if (!pid) return;
      const { error } = await sb().rpc('award_move_drop', { p_pet_id: pid, p_move_key: moveKey });
      if (error) throw error;
      await window.loadMoves?.();
      G.score += 10; updateInfo();
    } catch(e){ console.error('[Treasure] awardMove', e); }
  }
  async function awardItem(itemKey){
    try {
      const pid = window.petId; if (!pid) return;
      // Expect an RPC similar to award_move_drop on your DB side
      const { error } = await sb().rpc('award_item_drop', { p_pet_id: pid, p_item_key: itemKey });
      if (error) throw error;
      await window.loadItems?.();
      G.score += 10; updateInfo();
    } catch(e){ console.warn('[Treasure] awardItem (create RPC award_item_drop)', e); }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Loop & UI
  // ────────────────────────────────────────────────────────────────────────────
  function loop(){
    if (!G.running) return;
    const t = performance.now(); const dt = (t - G.last)/1000; G.last=t; G.now=t;

    update(dt);

    // render
    DOM.ctx.clearRect(0,0, DOM.canvas.width, DOM.canvas.height);
    drawStaticLayer();
    drawActors();

    updateInfo();

    requestAnimationFrame(loop);
  }

  function updateInfo(){
    if (DOM.infoCoins) DOM.infoCoins.textContent = `${Math.max(0, G.totalCoins - G.collectedCoins)}`;
    if (DOM.infoTimer) DOM.infoTimer.textContent = `${Math.max(0, Math.ceil(G.timeLeft))}`;
    if (DOM.infoLevel) DOM.infoLevel.textContent = `${G.dungeonIndex}`;
    if (DOM.infoScore) DOM.infoScore.textContent = `${G.score|0}`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sizing & canvas
  // ────────────────────────────────────────────────────────────────────────────
  function resize(){
    const modal = DOM.modal; if (!modal) return;
    let vw = window.innerWidth, vh = window.innerHeight;
    const gutter = isMobile ? 10 : 0; vw = Math.max(200, vw - gutter);
    const raw = Math.min(vw/CFG.roomTilesW, vh/CFG.roomTilesH);
    const maxTile = isMobile ? CFG.maxTileMobile : CFG.maxTileDesktop;
    let tile = Math.floor(raw/32)*32; tile = clamp(tile, CFG.minTile, maxTile);

    const dpr = Math.max(1, Math.round(window.devicePixelRatio||1));
    DOM.canvas.width = Math.round(CFG.roomTilesW*tile*dpr);
    DOM.canvas.height= Math.round(CFG.roomTilesH*tile*dpr);
    DOM.canvas.style.width = `${CFG.roomTilesW*tile}px`;
    DOM.canvas.style.height= `${CFG.roomTilesH*tile}px`;

    G.tile = tile; G.dpr = dpr; DOM.ctx.setTransform(dpr,0,0,dpr,0,0); DOM.ctx.imageSmoothingEnabled=false;
    // Invalidate bakes
    for (const row of G.rooms){ for (const r of row){ if (r) r.baked=null; } }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Input setup (keyboard + joystick)
  // ────────────────────────────────────────────────────────────────────────────
  function setupInput(){
    const keyMap = { ArrowLeft:'left', a:'left', ArrowRight:'right', d:'right', ArrowUp:'up', w:'up', ArrowDown:'down', s:'down' };
    document.addEventListener('keydown', e=>{ const m=keyMap[e.key]; if(!m) return; e.preventDefault(); if(!G.running) return; G.keys.add(m); });
    document.addEventListener('keyup',   e=>{ const m=keyMap[e.key]; if(!m) return; e.preventDefault(); G.keys.delete(m); });

    // joystick
    const base = DOM.joyBase, stick = DOM.joyStick; if (!base || !stick) return;
    base.style.touchAction='none';
    const HAS_POINTER = 'PointerEvent' in window;
    let pid=null;
    const setStick=(dx,dy)=>{ stick.style.left=`${50+dx*36}%`; stick.style.top=`${50+dy*36}%`; };
    const start=(e)=>{ if(pid!=null) return; pid=HAS_POINTER?e.pointerId:'touch'; G.joy.active=true; setStick(0,0); };
    const move=(e)=>{
      if(!G.joy.active) return; if(HAS_POINTER && e.pointerId!==pid) return; if(HAS_POINTER) e.preventDefault();
      const rect=base.getBoundingClientRect(); const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2; const R=rect.width/2;
      const X=HAS_POINTER?e.clientX:e.touches[0].clientX; const Y=HAS_POINTER?e.clientY:e.touches[0].clientY;
      let dx=(X-cx)/R, dy=(Y-cy)/R; const L=Math.hypot(dx,dy); const dead=CFG.touchDeadZone; if(L<dead){dx=0;dy=0;} else {dx/=L;dy/=L;}
      G.joy.vx=dx; G.joy.vy=dy; setStick(dx,dy);
    };
    const end=()=>{ pid=null; G.joy.active=false; G.joy.vx=0; G.joy.vy=0; setStick(0,0); };

    if (HAS_POINTER){ base.addEventListener('pointerdown',start,{passive:false}); base.addEventListener('pointermove',move,{passive:false}); base.addEventListener('pointerup',end,{passive:false}); base.addEventListener('pointercancel',end,{passive:false}); }
    else { base.addEventListener('touchstart',start,{passive:true}); base.addEventListener('touchmove',move,{passive:true}); base.addEventListener('touchend',end,{passive:true}); base.addEventListener('touchcancel',end,{passive:true}); }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Start / End
  // ────────────────────────────────────────────────────────────────────────────
  async function start(){
    ensureStyles();
    // bind DOM (late, in case HTML loads before this)
    DOM.modal = document.getElementById('treasure-minigame-modal');
    DOM.canvas= document.getElementById('treasure-canvas');
    DOM.ctx   = DOM.canvas.getContext('2d');
    DOM.infoCoins = document.getElementById('treasure-minigame-coins');
    DOM.infoTimer = document.getElementById('treasure-timer');
    DOM.infoLevel = document.getElementById('treasure-level');
    DOM.infoScore = document.getElementById('treasure-minigame-score');
    DOM.btnExit   = document.getElementById('treasure-exit-btn');
    DOM.joyBase   = document.getElementById('treasure-joystick-base');
    DOM.joyStick  = document.getElementById('treasure-joystick-stick');

    if (!DOM.modal || !DOM.canvas){ console.error('[Treasure] missing DOM'); return; }
    loadSprites();

    // size & input
    newDungeon();
    resize();
    setupInput();
    window.addEventListener('resize', resize);

    // exit
    DOM.btnExit?.addEventListener('click', ()=> endGame('Uscita'));

    // show modal and run
    DOM.modal.classList.add('show');
    G.running = true; G.last = performance.now();
    loop();
  }

  async function endGame(reason){
    if (!G.running) return; G.running=false;
    try {
      // rewards
      const fun = 6 + Math.round(G.dungeonIndex * 1.4);
      const exp = 12 + Math.round(G.score * 0.35);
      await window.updateFunAndExpFromMiniGame?.(fun, exp);
      await window.submitTreasureScoreSupabase?.(G.score|0, G.dungeonIndex|0);
      const coinsBonus = Math.floor(G.score / 12); if (coinsBonus>0) await window.addGettoniSupabase?.(coinsBonus);
      await window.refreshResourcesWidget?.();
    } catch(e){ console.error('[Treasure] end rewards', e); }

    DOM.modal?.classList.remove('show');
    // clear state minimal
    G.keys.clear(); G.joy.active=false; G.joy.vx=G.joy.vy=0;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API + bootstrapping
  // ────────────────────────────────────────────────────────────────────────────
  window.startTreasureMinigame = start;

  // Start when pressing the selector button as well (defensive binding)
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('btn-minigame-treasure');
    if (btn && !btn._treasureBound){ btn.addEventListener('click', ()=> setTimeout(()=> start(), 50)); btn._treasureBound=true; }
  });

})();
