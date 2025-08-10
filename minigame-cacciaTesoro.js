// === MINI GIOCO CACCIA AL TESORO — versione “no-globals” (modulo IIFE) ===
(() => {
  // ---------- CONFIG ----------
  const Cfg = {
    gridW: 3,
    gridH: 3,
    roomW: 8,
    roomH: 7,
    petSpeedDesktop: 180,
    petSpeedMobile: 120,
    enemySpeedDesktop: 100,
    enemySpeedMobile: 60,
    revealMs: 900,
    powerupMs: 3000,
    baseTimerMs: 1000,
  };

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

  // Mobile tweaks
  if (isMobileOrTablet() || window.innerWidth < 800) {
    Cfg.roomW = 7;
    Cfg.roomH = 6;
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
  };
  let ctx = DOM.canvas.getContext('2d');

  // ---------- STATO GIOCO ----------
  const G = {
    // dinamiche
    hudDirty: true,
    playing: false,
    level: 1,
    score: 0,
    timeLeft: 0,
    speedMul: 1,
    timerId: null,

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
   function checkPickup(pet, powerup) {
  const halfTile = G.tile / 2;

  // bounding box del pet
  const petBox = {
    x: pet.x,
    y: pet.y,
    w: G.tile,
    h: G.tile
  };

  // bounding box del power-up
  const powerBox = {
    x: powerup.x,
    y: powerup.y,
    w: G.tile,
    h: G.tile
  };

  return (
    petBox.x < powerBox.x + powerBox.w &&
    petBox.x + petBox.w > powerBox.x &&
    petBox.y < powerBox.y + powerBox.h &&
    petBox.y + petBox.h > powerBox.y
  );
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
    const w = window.innerWidth;
    let h = window.innerHeight - 70;
    if (isMobileOrTablet()) h = Math.floor((window.innerHeight - 70) * 0.7);

    const tile = Math.floor(Math.min(w / Cfg.roomW, h / Cfg.roomH));
    DOM.canvas.width = Cfg.roomW * tile;
    DOM.canvas.height = Cfg.roomH * tile;
    DOM.canvas.style.width = `${Cfg.roomW * tile}px`;
    DOM.canvas.style.height = `${Cfg.roomH * tile}px`;
    window.treasureTile = tile; // lasciamo compatibilità

    ctx = DOM.canvas.getContext('2d');
    G.hudDirty = true;
  }

  // ---------- HUD ----------
  function countCoinsLeft() {
    return Object.values(G.objects).flat().filter(o => o.type === 'coin' && !o.taken).length;
  }
  function syncHud() {
    DOM.coins && (DOM.coins.textContent = String(countCoinsLeft()));
    DOM.score && (DOM.score.textContent = String(G.score));
    DOM.level && (DOM.level.textContent = String(G.level));
    DOM.timer && (DOM.timer.textContent = String(G.timeLeft));
    G.hudDirty = false;
  }

  // ---------- AVVIO ----------
  function startTreasureMinigame() {
    generateDungeon();

    G.level = 1;
    G.score = 0;
    G.playing = true;
    G.activePowerup = null;
    G.powerupExpiresAt = 0;
    G.slowExpiresAt = 0;

    // SPRITES
    const petSrc = DOM.petImg?.src || '';
    const match = petSrc.match(/pet_(\d+)/);
    const petNum = match ? match[1] : '1';
    const assetBase = isMobileOrTablet() ? 'assets/mobile' : 'assets/desktop';

    const goblin = {
      idle: new Image(),
      right: [new Image(), new Image()],
      left:  [new Image(), new Image()],
      up:    [new Image(), new Image()],
      down:  [new Image(), new Image()],
    };
    goblin.idle.src       = `${assetBase}/enemies/goblin.png`;
    goblin.right[0].src   = `${assetBase}/enemies/goblin_right_1.png`;
    goblin.right[1].src   = `${assetBase}/enemies/goblin_right_2.png`;
    goblin.left[0].src    = `${assetBase}/enemies/goblin_left_1.png`;
    goblin.left[1].src    = `${assetBase}/enemies/goblin_left_2.png`;
    goblin.up[0].src      = `${assetBase}/enemies/goblin_up_1.png`;
    goblin.up[1].src      = `${assetBase}/enemies/goblin_up_2.png`;
    goblin.down[0].src    = `${assetBase}/enemies/goblin_down_1.png`;
    goblin.down[1].src    = `${assetBase}/enemies/goblin_down_2.png`;

    const pet = {
      idle: new Image(),
      right: [new Image(), new Image()],
      left:  [new Image(), new Image()],
      up:    [new Image(), new Image()],
      down:  [new Image(), new Image()],
    };
    pet.idle.src       = `${assetBase}/pets/pet_${petNum}.png`;
    pet.right[0].src   = `${assetBase}/pets/pet_${petNum}_right1.png`;
    pet.right[1].src   = `${assetBase}/pets/pet_${petNum}_right2.png`;
    pet.left[0].src    = `${assetBase}/pets/pet_${petNum}_left1.png`;
    pet.left[1].src    = `${assetBase}/pets/pet_${petNum}_left2.png`;
    pet.down[0].src    = `${assetBase}/pets/pet_${petNum}_down1.png`;
    pet.down[1].src    = `${assetBase}/pets/pet_${petNum}_down2.png`;
    pet.up[0].src      = `${assetBase}/pets/pet_${petNum}_up1.png`;
    pet.up[1].src      = `${assetBase}/pets/pet_${petNum}_up2.png`;

    G.sprites.goblin = goblin;
    G.sprites.pet = pet;
    G.sprites.coin = new Image();    G.sprites.coin.src = 'assets/collectibles/coin.png';
    G.sprites.enemy = new Image();   G.sprites.enemy.src = 'assets/enemies/goblin.png';
    G.sprites.exit = new Image();    G.sprites.exit.src = 'assets/icons/door.png';
    G.sprites.wall = new Image();    G.sprites.wall.src = 'assets/tiles/wall2.png';
    G.sprites.bg   = new Image();    G.sprites.bg.src   = `${assetBase}/backgrounds/dungeon3.png`;
    G.sprites.powerup = new Image(); G.sprites.powerup.src = 'assets/bonus/powerup.png';

    const mole = [new Image(), new Image(), new Image()];
mole[0].src = `${assetBase}/enemies/talpa_1.png`;
mole[1].src = `${assetBase}/enemies/talpa_2.png`;
mole[2].src = `${assetBase}/enemies/talpa_3.png`;
G.sprites.mole = mole;

    // PET
    const tile = window.treasureTile || 64;
    G.petRoom = { x: Math.floor(Cfg.gridW/2), y: Math.floor(Cfg.gridH/2) };
    G.pet = {
      x: 1, y: 1,
      px: 1 * tile,
      py: 1 * tile,
      animTime: 0,
      dirX: 0, dirY: 0,
      moving: false,
      direction: 'down',
      stepFrame: 0,
    };

    startLevel();
  }
  // *** NUOVO: scegli griglia e poi genera ***
  setGridForLevel(G.level);
  generateDungeon();

  startLevel();
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

    if (G.playing) {
      update(dt);
      render();
      if (G.hudDirty) syncHud();
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
    G.speedMul = 1; // ritorna alla velocità normale
  }

  // --- input / direzione ---
  let dx = G.pet.dirX, dy = G.pet.dirY;
  if (dx === 0 && dy === 0) { G.pet.moving = false; return; }

  // normalizza la diagonale per avere stessa velocità in tutte le direzioni
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.sqrt(2);
    dx *= inv; dy *= inv;
  }

  // --- movimento con micro-step (evita “tunneling” ai muri) ---
  const speed   = getCurrentPetSpeed();
  const room    = G.rooms[G.petRoom.y][G.petRoom.x];
  const size    = tile - 20;

  const tryMove = (nx, ny) => {
    const minX = Math.floor((nx + 2)        / tile);
    const minY = Math.floor((ny + 2)        / tile);
    const maxX = Math.floor((nx + size - 2) / tile);
    const maxY = Math.floor((ny + size - 2) / tile);
    if (minY < 0 || minY >= Cfg.roomH || maxY < 0 || maxY >= Cfg.roomH ||
        minX < 0 || minX >= Cfg.roomW || maxX < 0 || maxX >= Cfg.roomW) return false;
    return (
      room[minY][minX] === 0 && room[minY][maxX] === 0 &&
      room[maxY][minX] === 0 && room[maxY][maxX] === 0
    );
  };

  const totalDX = dx * speed * dt;
  const totalDY = dy * speed * dt;

  // substep massimo ~ un terzo di tile (min 8px per sicurezza su tile piccoli)
  const maxStep = Math.max(8, tile / 3);
  const steps   = Math.max(1, Math.ceil(Math.hypot(totalDX, totalDY) / maxStep));
  const stepDX  = totalDX / steps;
  const stepDY  = totalDY / steps;

  for (let i = 0; i < steps; i++) {
    const tryPX = G.pet.px + stepDX;
    if (tryMove(tryPX, G.pet.py)) G.pet.px = tryPX;

    const tryPY = G.pet.py + stepDY;
    if (tryMove(G.pet.px, tryPY)) G.pet.py = tryPY;
  }

  // aggiorna cella logica
  G.pet.x = Math.floor((G.pet.px + size/2) / tile);
  G.pet.y = Math.floor((G.pet.py + size/2) / tile);

  // animazione
  G.pet.moving = true;
  G.pet.animTime = (G.pet.animTime || 0) + dt;
  if (G.pet.animTime > getAnimStep()) {
    G.pet.stepFrame = 1 - G.pet.stepFrame;
    G.pet.animTime = 0;
  }

  // --- passaggio stanza (porte) ---
  if (G.pet.px < 0 && G.petRoom.x > 0 && room[G.pet.y][0] === 0) {
    G.petRoom.x -= 1; G.pet.px = (Cfg.roomW - 2) * tile; G.pet.x = Cfg.roomW - 2;
  }
  if (G.pet.px > (Cfg.roomW - 1) * tile && G.petRoom.x < Cfg.gridW - 1 && room[G.pet.y][Cfg.roomW - 1] === 0) {
    G.petRoom.x += 1; G.pet.px = 1 * tile; G.pet.x = 1;
  }
  if (G.pet.py < 0 && G.petRoom.y > 0 && room[0][G.pet.x] === 0) {
    G.petRoom.y -= 1; G.pet.py = (Cfg.roomH - 2) * tile; G.pet.y = Cfg.roomH - 2;
  }
  if (G.pet.py > (Cfg.roomH - 1) * tile && G.petRoom.y < Cfg.gridH - 1 && room[Cfg.roomH - 1][G.pet.x] === 0) {
    G.petRoom.y += 1; G.pet.py = 1 * tile; G.pet.y = 1;
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
      o.taken = true;
      G.score += 1;
      G.hudDirty = true;
    }
  }

  for (const p of powers) {
    if (p.taken) continue;
    const bx = p.x * tile + tile / 4;
    const by = p.y * tile + tile / 4;
    if (overlap(petBox.x, petBox.y, petBox.w, petBox.h, bx, by, tile/2, tile/2)) {
      p.taken = true;
      G.score += 12;
      G.hudDirty = true;

      if (p.type === 'speed') {
        G.activePowerup    = 'speed';
        G.powerupExpiresAt = performance.now() + Cfg.powerupMs;
        G.speedMul         = 3;
        showTreasureBonus('SPEED!', '#22c55e');
      } else {
        for (const list of Object.values(G.enemies)) for (const e of list) e.slow = true;
        G.activePowerup = 'slow';
        G.slowExpiresAt = performance.now() + Cfg.powerupMs;
        showTreasureBonus('SLOW!', '#3b82f6');
      }
      break;
    }
  }

  // --- uscita (tutte le monete prese) ---
  const coinsLeft = countCoinsLeft();
  if (G.petRoom.x === G.exitRoom.x && G.petRoom.y === G.exitRoom.y &&
      Math.abs(G.pet.x - G.exitTile.x) < 1 && Math.abs(G.pet.y - G.exitTile.y) < 1 &&
      coinsLeft === 0) {
    G.level++;
    G.hudDirty = true;
    setGridForLevel(G.level);
    setTimeout(() => { generateDungeon(); startLevel(); }, 550);
    return;
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

    for (const e of enemies) {
      const spd = e.slow ? enemyBaseSpeed * 0.3 : enemyBaseSpeed;
      let dx = G.pet.px - e.px, dy = G.pet.py - e.py;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > 2) {
        dx /= dist; dy /= dist;
        const newPX = e.px + dx * spd * dt;
        const newPY = e.py + dy * spd * dt;
        const size = tile - 14;
        const minX = Math.floor((newPX + 6) / tile);
        const minY = Math.floor((newPY + 6) / tile);
        const maxX = Math.floor((newPX + size - 6) / tile);
        const maxY = Math.floor((newPY + size - 6) / tile);
        if (room[minY][minX] === 0 && room[minY][maxX] === 0 && room[maxY][minX] === 0 && room[maxY][maxX] === 0) {
          e.px = newPX; e.py = newPY;
          e.x = Math.floor((e.px + size/2) / tile);
          e.y = Math.floor((e.py + size/2) / tile);
          e.direction = (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          e.isMoving = true;
          e.animTime = (e.animTime || 0) + dt;
          const ENEMY_ANIM_STEP = 0.22;
          if (e.animTime > ENEMY_ANIM_STEP) { e.stepFrame = 1 - (e.stepFrame || 0); e.animTime = 0; }
        } else {
          e.isMoving = false;
        }
      }
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


  // ---------- RENDER ----------
  function render() {
    const room = G.rooms[G.petRoom.y][G.petRoom.x];
    const tile = window.treasureTile || 64;

    // bg
    ctx.drawImage(G.sprites.bg, 0, 0, Cfg.roomW * tile, Cfg.roomH * tile);

    // walls
    for (let y = 0; y < Cfg.roomH; y++) for (let x = 0; x < Cfg.roomW; x++) {
      if (room[y][x] === 1) {
        if (G.sprites.wall.complete) ctx.drawImage(G.sprites.wall, x*tile, y*tile, tile, tile);
        else { ctx.fillStyle = '#888'; ctx.fillRect(x*tile, y*tile, tile, tile); }
      }
    }

    const key = `${G.petRoom.x},${G.petRoom.y}`;

    // coins
    if (G.objects[key]) {
      for (const obj of G.objects[key]) {
        if (obj.type === 'coin' && !obj.taken) {
          if (G.sprites.coin.complete) ctx.drawImage(G.sprites.coin, obj.x*tile+tile/4, obj.y*tile+tile/4, tile/2, tile/2);
          else {
            ctx.fillStyle = '#FFA500';
            ctx.beginPath(); ctx.arc(obj.x*tile + tile/2, obj.y*tile + tile/2, tile/4, 0, Math.PI*2); ctx.fill();
          }
        }
      }
    }

    // powerups
    if (G.powerups[key]) {
      for (const pow of G.powerups[key]) {
        if (!pow.taken) {
          if (G.sprites.powerup.complete) ctx.drawImage(G.sprites.powerup, pow.x*tile+tile/4, pow.y*tile+tile/4, tile/2, tile/2);
          else {
            ctx.fillStyle = '#0cf';
            ctx.beginPath(); ctx.arc(pow.x*tile + tile/2, pow.y*tile + tile/2, tile/4, 0, Math.PI*2); ctx.fill();
          }
        }
      }
    }


    // skulls
    for (const s of G.skulls) {
      if (s.roomX === G.petRoom.x && s.roomY === G.petRoom.y) {
        ctx.drawImage(s.img, s.x*tile, s.y*tile, tile, tile);
      }
    }
// --- Talpa ---
if (G.mole.enabled && G.petRoom.x === G.mole.roomX && G.petRoom.y === G.mole.roomY) {
  const tile = window.treasureTile || 64;
  const mx = G.mole.x * tile;
  const my = G.mole.y * tile;

  let frame = null;
  switch (G.mole.phase) {
    case 'emerge1':
    case 'retreat1':
      frame = 0; break; // terriccio
    case 'emerge2':
    case 'retreat2':
      frame = 1; break; // testa
    case 'hold':
      frame = 2; break; // tutta
    default:
      frame = null;     // gap: nulla
  }

  if (frame !== null) {
    const img = G.sprites.mole?.[frame];
    if (img && img.complete) {
      ctx.drawImage(img, mx + 6, my + 6, tile - 12, tile - 12);
    } else {
      // fallback debug
      ctx.fillStyle = '#7a4f2b';
      ctx.fillRect(mx + 8, my + 8, tile - 16, tile - 16);
    }
  }
}

    // pet
    const px = G.pet.px, py = G.pet.py;
    const sz = tile - 12;
    let sPet = !G.pet.moving ? G.sprites.pet.idle : G.sprites.pet[G.pet.direction][G.pet.stepFrame];
    if (sPet && sPet.complete) ctx.drawImage(sPet, px + 6, py + 6, sz, sz);
    else { ctx.fillStyle = '#FFD700'; ctx.fillRect(px + 8, py + 8, sz - 4, sz - 4); }

    // enemies
    for (const e of (G.enemies[key] || [])) {
      let sprite = null;
      const frame = e.stepFrame || 0;
      const dir = e.direction || 'down';
      if (G.sprites.goblin && G.sprites.goblin.idle) {
        sprite = e.isMoving ? (G.sprites.goblin[dir] && G.sprites.goblin[dir][frame]) : G.sprites.goblin.idle;
      }
      const ex = e.px, ey = e.py;
      if (sprite && sprite.complete) ctx.drawImage(sprite, ex + 6, ey + 6, tile - 12, tile - 12);
      else if (G.sprites.enemy && G.sprites.enemy.complete) ctx.drawImage(G.sprites.enemy, ex + 6, ey + 6, tile - 12, tile - 12);
      else { ctx.fillStyle = '#e74c3c'; ctx.fillRect(ex + 8, ey + 8, tile - 16, tile - 16); }
    }

    // exit
    if (G.petRoom.x === G.exitRoom.x && G.petRoom.y === G.exitRoom.y) {
      if (G.sprites.exit.complete) ctx.drawImage(G.sprites.exit, G.exitTile.x*tile+10, G.exitTile.y*tile+10, tile-20, tile-20);
      else { ctx.fillStyle = '#43e673'; ctx.fillRect(G.exitTile.x*tile+10, G.exitTile.y*tile+10, tile-20, tile-20); }
    }
  }

  // ---------- GENERAZIONE ----------
  function generateDungeon() {
    G.rooms = [];
    G.objects = {};
    G.enemies = {};
    G.powerups = {};

    // stanze base con muri
    for (let y = 0; y < Cfg.gridH; y++) {
      const row = [];
      for (let x = 0; x < Cfg.gridW; x++) {
        const room = [];
        for (let ty = 0; ty < Cfg.roomH; ty++) {
          const rrow = [];
          for (let tx = 0; tx < Cfg.roomW; tx++) {
            rrow.push((tx === 0 || ty === 0 || tx === Cfg.roomW-1 || ty === Cfg.roomH-1) ? 1 : 0);
          }
          room.push(rrow);
        }
        row.push(room);
      }
      G.rooms.push(row);
    }

    // porte larghe 3
    for (let y = 0; y < Cfg.gridH; y++) {
      for (let x = 0; x < Cfg.gridW; x++) {
        if (x < Cfg.gridW-1) {
          const mid = Math.floor(Cfg.roomH/2);
          for (let dy = -1; dy <= 1; dy++) {
            const r = mid + dy;
            if (r >= 1 && r < Cfg.roomH-1) {
              G.rooms[y][x][r][Cfg.roomW-1] = 0;
              G.rooms[y][x+1][r][0] = 0;
            }
          }
        }
        if (y < Cfg.gridH-1) {
          const mid = Math.floor(Cfg.roomW/2);
          for (let dx = -1; dx <= 1; dx++) {
            const c = mid + dx;
            if (c >= 1 && c < Cfg.roomW-1) {
              G.rooms[y][x][Cfg.roomH-1][c] = 0;
              G.rooms[y+1][x][0][c] = 0;
            }
          }
        }
      }
    }

    // uscita random (non centrale)
    do {
      G.exitRoom.x = Math.floor(Math.random() * Cfg.gridW);
      G.exitRoom.y = Math.floor(Math.random() * Cfg.gridH);
    } while (G.exitRoom.x === Math.floor(Cfg.gridW/2) && G.exitRoom.y === Math.floor(Cfg.gridH/2));
    G.exitTile.x = Cfg.roomW-2; G.exitTile.y = Cfg.roomH-2;

    // popola
    for (let ry = 0; ry < Cfg.gridH; ry++) {
      for (let rx = 0; rx < Cfg.gridW; rx++) {
        const key = `${rx},${ry}`;
        const objects = [];
        const enemies = [];
        const powerups = [];

        const nCoins = (rx === G.exitRoom.x && ry === G.exitRoom.y) ? 1 : (2 + Math.floor(Math.random()*2));
        for (let i = 0; i < nCoins; i++) {
          let px, py;
          do {
            px = 1 + Math.floor(Math.random() * (Cfg.roomW-2));
            py = 1 + Math.floor(Math.random() * (Cfg.roomH-2));
          } while (rx === G.exitRoom.x && ry === G.exitRoom.y && px === G.exitTile.x && py === G.exitTile.y);
          objects.push({ x: px, y: py, type: 'coin', taken: false });
        }

        const doorPositions = [];
        if (rx > 0)               doorPositions.push({x: 0, y: Math.floor(Cfg.roomH/2)});
        if (rx < Cfg.gridW-1)     doorPositions.push({x: Cfg.roomW-1, y: Math.floor(Cfg.roomH/2)});
        if (ry > 0)               doorPositions.push({x: Math.floor(Cfg.roomW/2), y: 0});
        if (ry < Cfg.gridH-1)     doorPositions.push({x: Math.floor(Cfg.roomW/2), y: Cfg.roomH-1});

        const nEnemies = Math.floor(Math.random()*2);
        const tile = window.treasureTile || 64;
        for (let i = 0; i < nEnemies; i++) {
          let ex, ey, isDoor, tries = 0;
          do {
            ex = 1 + Math.floor(Math.random() * (Cfg.roomW-2));
            ey = 1 + Math.floor(Math.random() * (Cfg.roomH-2));
            isDoor = doorPositions.some(p => p.x === ex && p.y === ey);
            tries++;
          } while (isDoor && tries < 30);
          enemies.push({
            x: ex, y: ey,
            px: ex * tile,
            py: ey * tile,
            slow: false,
            direction: 'down',
            stepFrame: 0,
            isMoving: false,
            animTime: 0,
          });
        }

        if (Math.random() < 0.35) {
          let ptx, pty;
          do {
            ptx = 1 + Math.floor(Math.random() * (Cfg.roomW-2));
            pty = 1 + Math.floor(Math.random() * (Cfg.roomH-2));
          } while (objects.some(o => o.x===ptx && o.y===pty));
          powerups.push({ x: ptx, y: pty, type: 'speed', taken: false });
        }

        G.objects[key]  = objects;
        G.enemies[key]  = enemies;
        G.powerups[key] = powerups;
      }
    }

    // skulls
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

  // ---------- START LEVEL ----------
  function startLevel() {
    resizeTreasureCanvas();
    G.timeLeft = 90 + G.level * 3;
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
    G.playing = false;
    if (G.timerId) { clearInterval(G.timerId); G.timerId = null; }
    DOM.modal && DOM.modal.classList.add('hidden');

    const fun = 15 + Math.round(G.score * 0.6);
    const exp = Math.round(G.score * 0.5);
    console.log('[Treasure] endTreasureMinigame:', { reason, score: G.score, fun, exp });

    setTimeout(async () => {
      try {
        if (typeof window.updateFunAndExpFromMiniGame === 'function') {
          await window.updateFunAndExpFromMiniGame(fun, exp);
        } else {
          console.warn('[Treasure] updateFunAndExpFromMiniGame non trovato');
        }
        if (typeof window.showExpGainLabel === 'function' && exp > 0) window.showExpGainLabel(exp);
      } catch (err) {
        console.error('[Treasure] errore award EXP/FUN:', err);
      }
      G.keysStack = [];
      resetJoystick();
    }, 180);
  }

  // ---------- BONUS ----------
  function showTreasureBonus(msg, color = '#e67e22') {
    if (!DOM.bonus) return;
    DOM.bonus.textContent = msg;
    DOM.bonus.style.display = 'block';
    DOM.bonus.style.color = color;
    DOM.bonus.style.opacity = '1';
    setTimeout(()=> DOM.bonus.style.opacity='0', 1600);
    setTimeout(()=> DOM.bonus.style.display='none', 2100);
  }

  // ---------- JOYSTICK ----------
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
    if (DOM.joyStick) DOM.joyStick.style.transform = 'translate(-50%,-50%)';
    updatePetDirFromJoystick(0,0);
    DOM.joyBase?.classList.remove('active');
  }
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

  // ---------- EVENTI ----------
  function showTreasureArrowsIfMobile() {
    const arrows = document.querySelector('.treasure-arrows-container');
    if (!arrows) return;
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) arrows.style.display = '';
    else arrows.style.display = 'none';
  }
  showTreasureArrowsIfMobile();

  window.addEventListener('resize', () => {
    if (G.playing) { resizeTreasureCanvas(); render(); G.hudDirty = true; }
    showTreasureArrowsIfMobile();
  });

  document.addEventListener('keydown', (e) => {
    if (!G.playing) return;
    const dir = dirMap[e.key];
    if (!dir) return;
    if (!G.keysStack.includes(dir)) G.keysStack.push(dir);
    updatePetDirFromKeys();
  });
  document.addEventListener('keyup', (e) => {
    const dir = dirMap[e.key];
    if (!dir) return;
    G.keysStack = G.keysStack.filter(d => d !== dir);
    updatePetDirFromKeys();
  });

  DOM.joyBase?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    DOM.joyBase.classList.add('active');
    const rect = DOM.joyBase.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    if (e.touches[0]) handleJoystickMove(e.touches[0]);
  }, { passive: false });
  DOM.joyBase?.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches[0]) handleJoystickMove(e.touches[0]);
  }, { passive: false });
  DOM.joyBase?.addEventListener('touchend',   (e) => { e.preventDefault(); resetJoystick(); }, { passive: false });
  DOM.joyBase?.addEventListener('touchcancel',(e) => { e.preventDefault(); resetJoystick(); }, { passive: false });

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
