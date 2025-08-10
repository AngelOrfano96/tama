// === MINI GIOCO CACCIA AL TESORO MULTI-STANZA, MOVIMENTO LIBERO ===

// ----- CONFIG E VARIABILI -----
let DUNGEON_GRID_W = 3;
let DUNGEON_GRID_H = 3;
let ROOM_W = 8;
let ROOM_H = 7;

function isMobileOrTablet() {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
}

if (isMobileOrTablet() || window.innerWidth < 800) {
  DUNGEON_GRID_W = 3;
  DUNGEON_GRID_H = 3;
  ROOM_W = 7;
  ROOM_H = 6;
}

const petSpeedDesktop   = 180;
const petSpeedMobile    = 120;
const enemySpeedDesktop = 100;
const enemySpeedMobile  = 60;

let enemyBaseSpeed = isMobileOrTablet() ? enemySpeedMobile : enemySpeedDesktop;
let baseSpeed      = isMobileOrTablet() ? petSpeedMobile  : petSpeedDesktop;

// SPRITES
let petSprites = null, goblinSprites = null;
let treasureCoinImg, treasureEnemyImg, treasureExitImg, treasureWallImg, treasureBgImg, treasurePowerupImg;

// ----- HUD & CANVAS -----
let hudDirty = true;
const HUD = {
  coins:  document.getElementById('treasure-minigame-coins'),
  score:  document.getElementById('treasure-minigame-score'),
  level:  document.getElementById('treasure-level'),
  timer:  document.getElementById('treasure-timer'),
};
let treasureCanvas = document.getElementById('treasure-canvas');
let treasureCtx    = treasureCanvas.getContext('2d');

// ----- STATO DI GIOCO -----
let dungeonRooms = [];
let dungeonPetRoom = {x: 0, y: 0};
let roomObjects = {};
let roomEnemies = {};
let roomPowerups = {};
let exitRoom = {x: 0, y: 0};
let exitTile = {x: 0, y: 0};

let dungeonSkulls = [];

let treasurePet, treasurePlaying, treasureScore, treasureLevel, treasureTimeLeft, treasureInterval;
let treasureActivePowerup = null;     // "speed" | "slow" | null
let treasurePowerupExpiresAt = 0;     // ms (performance.now())
let slowExpiresAt = 0;                // ms (per lo slow dei nemici)

let petDirection = "down";
let petStepFrame = 0;
let petIsMoving = false;

let keysStack = []; // per diagonali (ultimo premuto ha priorità)

// ----- UTILS -----
function getCurrentBaseSpeed() {
  return isMobileOrTablet() ? petSpeedMobile : petSpeedDesktop;
}
function isPowerupActive(type = treasureActivePowerup) {
  return type && performance.now() < treasurePowerupExpiresAt;
}
function getCurrentPetSpeed() {
  return (treasureActivePowerup === "speed" && isPowerupActive("speed"))
    ? getCurrentBaseSpeed() * 3
    : getCurrentBaseSpeed();
}
function getAnimStep() {
  return (treasureActivePowerup === "speed" && isPowerupActive("speed")) ? 0.12 : 0.18;
}
function distCenter(a, b) {
  const tile = window.treasureTile;
  return Math.hypot(
    ((a.px ?? a.x * tile) + tile/2) / tile - ((b.px ?? b.x * tile) + tile/2) / tile,
    ((a.py ?? a.y * tile) + tile/2) / tile - ((b.py ?? b.y * tile) + tile/2) / tile
  );
}

// best-effort orientamento
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock("landscape").catch(()=>{});
}

// ----- DIMENSIONI -----
function resizeTreasureCanvas() {
  const canvas = treasureCanvas;
  let w = window.innerWidth;
  let h = window.innerHeight - 70;
  if (isMobileOrTablet()) h = Math.floor((window.innerHeight - 70) * 0.7);

  const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
  canvas.width = ROOM_W * tile;
  canvas.height = ROOM_H * tile;
  canvas.style.width = `${ROOM_W * tile}px`;
  canvas.style.height = `${ROOM_H * tile}px`;
  window.treasureTile = tile;

  treasureCtx = canvas.getContext('2d'); // rinnova ctx dopo resize
  hudDirty = true;
}

// ----- HUD -----
function countCoinsLeft() {
  return Object.values(roomObjects).flat().filter(o => o.type === "coin" && !o.taken).length;
}
function syncHud() {
  if (HUD.coins) HUD.coins.textContent = String(countCoinsLeft());
  if (HUD.score) HUD.score.textContent = String(treasureScore);
  if (HUD.level) HUD.level.textContent = String(treasureLevel);
  if (HUD.timer) HUD.timer.textContent = String(treasureTimeLeft);
  hudDirty = false;
}

// ----- AVVIO MINIGIOCO -----
function startTreasureMinigame() {
  generateDungeon();

  treasureLevel = 1;
  treasureScore = 0;
  treasurePlaying = true;
  treasureActivePowerup = null;
  treasurePowerupExpiresAt = 0;
  slowExpiresAt = 0;

  // SPRITE LOADING
  const petSrc = document.getElementById('pet').src;
  const match = petSrc.match(/pet_(\d+)/);
  const petNum = match ? match[1] : "1";
  const assetBase = isMobileOrTablet() ? "assets/mobile" : "assets/desktop";

  goblinSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left:  [new Image(), new Image()],
    up:    [new Image(), new Image()],
    down:  [new Image(), new Image()]
  };
  goblinSprites.idle.src       = `${assetBase}/enemies/goblin.png`;
  goblinSprites.right[0].src   = `${assetBase}/enemies/goblin_right_1.png`;
  goblinSprites.right[1].src   = `${assetBase}/enemies/goblin_right_2.png`;
  goblinSprites.left[0].src    = `${assetBase}/enemies/goblin_left_1.png`;
  goblinSprites.left[1].src    = `${assetBase}/enemies/goblin_left_2.png`;
  goblinSprites.up[0].src      = `${assetBase}/enemies/goblin_up_1.png`;
  goblinSprites.up[1].src      = `${assetBase}/enemies/goblin_up_2.png`;
  goblinSprites.down[0].src    = `${assetBase}/enemies/goblin_down_1.png`;
  goblinSprites.down[1].src    = `${assetBase}/enemies/goblin_down_2.png`;

  petSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left:  [new Image(), new Image()],
    up:    [new Image(), new Image()],
    down:  [new Image(), new Image()]
  };
  petSprites.idle.src       = `${assetBase}/pets/pet_${petNum}.png`;
  petSprites.right[0].src   = `${assetBase}/pets/pet_${petNum}_right1.png`;
  petSprites.right[1].src   = `${assetBase}/pets/pet_${petNum}_right2.png`;
  petSprites.left[0].src    = `${assetBase}/pets/pet_${petNum}_left1.png`;
  petSprites.left[1].src    = `${assetBase}/pets/pet_${petNum}_left2.png`;
  petSprites.down[0].src    = `${assetBase}/pets/pet_${petNum}_down1.png`;
  petSprites.down[1].src    = `${assetBase}/pets/pet_${petNum}_down2.png`;
  petSprites.up[0].src      = `${assetBase}/pets/pet_${petNum}_up1.png`;
  petSprites.up[1].src      = `${assetBase}/pets/pet_${petNum}_up2.png`;

  treasureCoinImg    = new Image(); treasureCoinImg.src    = "assets/collectibles/coin.png";
  treasureEnemyImg   = new Image(); treasureEnemyImg.src   = "assets/enemies/goblin.png";
  treasureExitImg    = new Image(); treasureExitImg.src    = "assets/icons/door.png";
  treasureWallImg    = new Image(); treasureWallImg.src    = "assets/tiles/wall2.png";
  treasureBgImg      = new Image(); treasureBgImg.src      = `${assetBase}/backgrounds/dungeon3.png`;
  treasurePowerupImg = new Image(); treasurePowerupImg.src = "assets/bonus/powerup.png";

  // pet
  const tile = window.treasureTile || 64;
  dungeonPetRoom = { x: Math.floor(DUNGEON_GRID_W/2), y: Math.floor(DUNGEON_GRID_H/2) };
  treasurePet = {
    x: 1, y: 1,
    px: 1 * tile,
    py: 1 * tile,
    speed: baseSpeed,
    animTime: 0,
    dirX: 0, dirY: 0
  };

  startTreasureLevel();
}

// ----- INPUT -----
const dirMap = {
  "ArrowUp": "up",    "w": "up",
  "ArrowDown": "down","s": "down",
  "ArrowLeft": "left","a": "left",
  "ArrowRight":"right","d":"right"
};

function updatePetDir() {
  if (!keysStack.length) { treasurePet.dirX = 0; treasurePet.dirY = 0; return; }
  let dir = keysStack[keysStack.length - 1];
  treasurePet.dirX = (dir === "left") ? -1 : (dir === "right" ? 1 : 0);
  treasurePet.dirY = (dir === "up")   ? -1 : (dir === "down"  ? 1 : 0);
  if (treasurePet.dirX > 0) petDirection = "right";
  else if (treasurePet.dirX < 0) petDirection = "left";
  else if (treasurePet.dirY < 0) petDirection = "up";
  else if (treasurePet.dirY > 0) petDirection = "down";
}

// ----- GAME LOOP -----
let lastFrame = performance.now();
function gameLoop() {
  const now = performance.now();
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  if (treasurePlaying) {
    updateTreasure(dt);     // LOGICA
    renderTreasure();       // GRAFICA
    if (hudDirty) syncHud();// HUD
  }
  requestAnimationFrame(gameLoop);
}
gameLoop();

// ----- LOGICA -----
function movePetFree(dt) {
  // scadenza powerup slow (globale)
  if (treasureActivePowerup === "slow" && performance.now() >= slowExpiresAt) {
    for (const list of Object.values(roomEnemies)) {
      for (const e of list) e.slow = false;
    }
    treasureActivePowerup = null;
  }

  // movimento
  let dx = treasurePet.dirX, dy = treasurePet.dirY;
  if (dx === 0 && dy === 0) { petIsMoving = false; return; }
  if (dx !== 0 && dy !== 0) { const inv = 1/Math.sqrt(2); dx *= inv; dy *= inv; }

  const tile = window.treasureTile;
  const speed = getCurrentPetSpeed();
  let newPX = treasurePet.px + dx * speed * dt;
  let newPY = treasurePet.py + dy * speed * dt;

  const room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  const size = tile - 20;

  const tryMove = (nx, ny) => {
    let minX = Math.floor((nx + 2) / tile);
    let minY = Math.floor((ny + 2) / tile);
    let maxX = Math.floor((nx + size - 2) / tile);
    let maxY = Math.floor((ny + size - 2) / tile);
    if (minY < 0 || minY >= ROOM_H || maxY < 0 || maxY >= ROOM_H ||
        minX < 0 || minX >= ROOM_W || maxX < 0 || maxX >= ROOM_W) return false;
    return (
      room[minY][minX] === 0 && room[minY][maxX] === 0 &&
      room[maxY][minX] === 0 && room[maxY][maxX] === 0
    );
  };

  if (tryMove(newPX, treasurePet.py)) treasurePet.px = newPX;
  if (tryMove(treasurePet.px, newPY)) treasurePet.py = newPY;

  treasurePet.x = Math.floor((treasurePet.px + size/2) / tile);
  treasurePet.y = Math.floor((treasurePet.py + size/2) / tile);

  petIsMoving = true;
  treasurePet.animTime = (treasurePet.animTime || 0) + dt;
  if (treasurePet.animTime > getAnimStep()) { petStepFrame = 1 - petStepFrame; treasurePet.animTime = 0; }

  // raccolte
  const key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  const objects = roomObjects[key] || [];

  const coin = objects.find(o => o.type === 'coin' && !o.taken && distCenter(treasurePet, o) < 0.6);
  if (coin) { coin.taken = true; treasureScore += 1; hudDirty = true; }

  const powers = roomPowerups[key] || [];
  const pow = powers.find(p => !p.taken && distCenter(treasurePet, p) < 0.6);
  if (pow) {
    pow.taken = true;
    treasureScore += 12;
    hudDirty = true;
    if (pow.type === 'speed') {
      treasureActivePowerup = 'speed';
      treasurePowerupExpiresAt = performance.now() + 3000; // 3s
    } else {
      // slow su tutti i nemici per 3s (più semplice che “solo stanza corrente”)
      for (const list of Object.values(roomEnemies)) {
        for (const e of list) e.slow = true;
      }
      treasureActivePowerup = 'slow';
      slowExpiresAt = performance.now() + 3000;
    }
  }

  // passaggio stanza
  if (treasurePet.px < 0 && dungeonPetRoom.x > 0 && room[treasurePet.y][0] === 0) {
    dungeonPetRoom.x -= 1; treasurePet.px = (ROOM_W - 2) * tile; treasurePet.x = ROOM_W - 2;
  }
  if (treasurePet.px > (ROOM_W - 1) * tile && dungeonPetRoom.x < DUNGEON_GRID_W - 1 && room[treasurePet.y][ROOM_W - 1] === 0) {
    dungeonPetRoom.x += 1; treasurePet.px = 1 * tile; treasurePet.x = 1;
  }
  if (treasurePet.py < 0 && dungeonPetRoom.y > 0 && room[0][treasurePet.x] === 0) {
    dungeonPetRoom.y -= 1; treasurePet.py = (ROOM_H - 2) * tile; treasurePet.y = ROOM_H - 2;
  }
  if (treasurePet.py > (ROOM_H - 1) * tile && dungeonPetRoom.y < DUNGEON_GRID_H - 1 && room[ROOM_H - 1][treasurePet.x] === 0) {
    dungeonPetRoom.y += 1; treasurePet.py = 1 * tile; treasurePet.y = 1;
  }

  // uscita (se prese tutte le monete globali)
  const coinsLeft = countCoinsLeft();
  if (dungeonPetRoom.x === exitRoom.x && dungeonPetRoom.y === exitRoom.y &&
      Math.abs(treasurePet.x - exitTile.x) < 1 && Math.abs(treasurePet.y - exitTile.y) < 1 &&
      coinsLeft === 0) {
    treasureLevel++;
    hudDirty = true;
    setTimeout(() => { generateDungeon(); startTreasureLevel(); }, 550);
    return;
  }

  // collisione nemici = game over
  const enemies = roomEnemies[key] || [];
  if (enemies.some(e => distCenter(treasurePet, e) < 0.5)) {
    treasurePlaying = false;
    showTreasureBonus("Game Over!", "#e74c3c");
    if (treasureInterval) clearInterval(treasureInterval);
    setTimeout(() => endTreasureMinigame(), 1500);
  }
}

function moveEnemiesFree(dt) {
  const key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  const enemies = roomEnemies[key];
  if (!enemies) return;

  const tile = window.treasureTile;
  const room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];

  for (const e of enemies) {
    const spd = e.slow ? enemyBaseSpeed * 0.3 : enemyBaseSpeed;
    let dx = treasurePet.px - e.px, dy = treasurePet.py - e.py;
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
        e.direction = (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        e.isMoving = true;
        e.animTime = (e.animTime || 0) + dt;
        const ENEMY_ANIM_STEP = 0.22;
        if (e.animTime > ENEMY_ANIM_STEP) { e.stepFrame = 1 - (e.stepFrame || 0); e.animTime = 0; }
      } else {
        e.isMoving = false;
      }
    }
    if (distCenter(e, treasurePet) < 0.5) {
      treasurePlaying = false;
      showTreasureBonus("Game Over!", "#e74c3c");
      setTimeout(() => endTreasureMinigame(), 1500);
      return;
    }
  }
}

function updateTreasure(dt) {
  movePetFree(dt);
  moveEnemiesFree(dt);
}

// ----- RENDER -----
function renderTreasure() {
  const room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  const tile = window.treasureTile || 64;

  // SFONDO
  treasureCtx.drawImage(treasureBgImg, 0, 0, ROOM_W*tile, ROOM_H*tile);

  // MURI
  for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
    if (room[y][x] === 1) {
      if (treasureWallImg.complete) {
        treasureCtx.drawImage(treasureWallImg, x*tile, y*tile, tile, tile);
      } else {
        treasureCtx.fillStyle = "#888";
        treasureCtx.fillRect(x*tile, y*tile, tile, tile);
      }
    }
  }

  // OGGETTI
  const key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  if (roomObjects[key]) {
    for (const obj of roomObjects[key]) {
      if (obj.type === 'coin' && !obj.taken) {
        if (treasureCoinImg.complete) {
          treasureCtx.drawImage(treasureCoinImg, obj.x*tile+tile/4, obj.y*tile+tile/4, tile/2, tile/2);
        } else {
          treasureCtx.fillStyle = "#FFA500";
          treasureCtx.beginPath();
          treasureCtx.arc(obj.x*tile + tile/2, obj.y*tile + tile/2, tile/4, 0, Math.PI*2);
          treasureCtx.fill();
        }
      }
    }
  }

  // POWERUP
  if (roomPowerups[key]) {
    for (const pow of roomPowerups[key]) {
      if (!pow.taken) {
        if (treasurePowerupImg.complete) {
          treasureCtx.drawImage(treasurePowerupImg, pow.x*tile+tile/4, pow.y*tile+tile/4, tile/2, tile/2);
        } else {
          treasureCtx.fillStyle = "#0cf";
          treasureCtx.beginPath();
          treasureCtx.arc(pow.x*tile + tile/2, pow.y*tile + tile/2, tile/4, 0, Math.PI*2);
          treasureCtx.fill();
        }
      }
    }
  }

  // TESCHI DECORATIVI
  for (let skull of dungeonSkulls) {
    if (skull.roomX === dungeonPetRoom.x && skull.roomY === dungeonPetRoom.y) {
      treasureCtx.drawImage(skull.img, skull.x*tile, skull.y*tile, tile, tile);
    }
  }

  // PET
  const px = treasurePet.px, py = treasurePet.py;
  const sz = tile - 12;
  let petSpriteToDraw = !petIsMoving ? petSprites.idle : petSprites[petDirection][petStepFrame];
  if (petSpriteToDraw && petSpriteToDraw.complete) {
    treasureCtx.drawImage(petSpriteToDraw, px + 6, py + 6, sz, sz);
  } else {
    treasureCtx.fillStyle = "#FFD700";
    treasureCtx.fillRect(px + 8, py + 8, sz - 4, sz - 4);
  }

  // NEMICI
  for (const e of roomEnemies[key]) {
    let sprite = null;
    const frame = e.stepFrame || 0;
    const dir = e.direction || "down";
    if (goblinSprites && goblinSprites.idle) {
      sprite = e.isMoving ? (goblinSprites[dir] && goblinSprites[dir][frame]) : goblinSprites.idle;
    }
    const ex = e.px, ey = e.py;
    if (sprite && sprite.complete) {
      treasureCtx.drawImage(sprite, ex + 6, ey + 6, tile - 12, tile - 12);
    } else if (treasureEnemyImg && treasureEnemyImg.complete) {
      treasureCtx.drawImage(treasureEnemyImg, ex + 6, ey + 6, tile - 12, tile - 12);
    } else {
      treasureCtx.fillStyle = "#e74c3c";
      treasureCtx.fillRect(ex + 8, ey + 8, tile - 16, tile - 16);
    }
  }

  // USCITA
  if (dungeonPetRoom.x === exitRoom.x && dungeonPetRoom.y === exitRoom.y) {
    if (treasureExitImg.complete) {
      treasureCtx.drawImage(treasureExitImg, exitTile.x*tile+10, exitTile.y*tile+10, tile-20, tile-20);
    } else {
      treasureCtx.fillStyle = "#43e673";
      treasureCtx.fillRect(exitTile.x*tile+10, exitTile.y*tile+10, tile-20, tile-20);
    }
  }
}

// ----- GENERAZIONE DUNGEON -----
function generateDungeon() {
  dungeonRooms = [];
  roomObjects = {};
  roomEnemies = {};
  roomPowerups = {};

  // stanze base con muri
  for (let y = 0; y < DUNGEON_GRID_H; y++) {
    let row = [];
    for (let x = 0; x < DUNGEON_GRID_W; x++) {
      let room = [];
      for (let ty = 0; ty < ROOM_H; ty++) {
        let rrow = [];
        for (let tx = 0; tx < ROOM_W; tx++) {
          rrow.push((tx === 0 || ty === 0 || tx === ROOM_W-1 || ty === ROOM_H-1) ? 1 : 0);
        }
        room.push(rrow);
      }
      row.push(room);
    }
    dungeonRooms.push(row);
  }

  // porte larghe 3
  for (let y = 0; y < DUNGEON_GRID_H; y++) {
    for (let x = 0; x < DUNGEON_GRID_W; x++) {
      if (x < DUNGEON_GRID_W-1) {
        let mid = Math.floor(ROOM_H/2);
        for (let dy = -1; dy <= 1; dy++) {
          let r = mid + dy;
          if (r >= 1 && r < ROOM_H-1) {
            dungeonRooms[y][x][r][ROOM_W-1] = 0;
            dungeonRooms[y][x+1][r][0] = 0;
          }
        }
      }
      if (y < DUNGEON_GRID_H-1) {
        let mid = Math.floor(ROOM_W/2);
        for (let dx = -1; dx <= 1; dx++) {
          let c = mid + dx;
          if (c >= 1 && c < ROOM_W-1) {
            dungeonRooms[y][x][ROOM_H-1][c] = 0;
            dungeonRooms[y+1][x][0][c] = 0;
          }
        }
      }
    }
  }

  // uscita in stanza casuale (non la centrale)
  do {
    exitRoom.x = Math.floor(Math.random() * DUNGEON_GRID_W);
    exitRoom.y = Math.floor(Math.random() * DUNGEON_GRID_H);
  } while (exitRoom.x === Math.floor(DUNGEON_GRID_W/2) && exitRoom.y === Math.floor(DUNGEON_GRID_H/2));
  exitTile.x = ROOM_W-2; exitTile.y = ROOM_H-2;

  // popola stanze
  for (let ry = 0; ry < DUNGEON_GRID_H; ry++) {
    for (let rx = 0; rx < DUNGEON_GRID_W; rx++) {
      const key = `${rx},${ry}`;
      const objects = [];
      const enemies = [];
      const powerups = [];

      const nCoins = (rx === exitRoom.x && ry === exitRoom.y) ? 1 : (2 + Math.floor(Math.random()*2));
      for (let i = 0; i < nCoins; i++) {
        let px, py;
        do {
          px = 1 + Math.floor(Math.random() * (ROOM_W-2));
          py = 1 + Math.floor(Math.random() * (ROOM_H-2));
        } while (rx === exitRoom.x && ry === exitRoom.y && px === exitTile.x && py === exitTile.y);
        objects.push({ x: px, y: py, type: 'coin', taken: false });
      }

      const doorPositions = [];
      if (rx > 0)                doorPositions.push({x: 0,         y: Math.floor(ROOM_H/2)});
      if (rx < DUNGEON_GRID_W-1) doorPositions.push({x: ROOM_W-1, y: Math.floor(ROOM_H/2)});
      if (ry > 0)                doorPositions.push({x: Math.floor(ROOM_W/2), y: 0});
      if (ry < DUNGEON_GRID_H-1) doorPositions.push({x: Math.floor(ROOM_W/2), y: ROOM_H-1});

      const nEnemies = Math.floor(Math.random()*2);
      const tile = window.treasureTile || 64;
      for (let i = 0; i < nEnemies; i++) {
        let ex, ey, isDoor, tries = 0;
        do {
          ex = 1 + Math.floor(Math.random() * (ROOM_W-2));
          ey = 1 + Math.floor(Math.random() * (ROOM_H-2));
          isDoor = doorPositions.some(p => p.x === ex && p.y === ey);
          tries++;
        } while (isDoor && tries < 30);
        enemies.push({
          x: ex, y: ey,
          px: ex * tile,
          py: ey * tile,
          slow: false,
          direction: "down",
          stepFrame: 0,
          isMoving: false,
          animTime: 0
        });
      }

      if (Math.random() < 0.35) {
        let ptx, pty;
        do {
          ptx = 1 + Math.floor(Math.random() * (ROOM_W-2));
          pty = 1 + Math.floor(Math.random() * (ROOM_H-2));
        } while (objects.some(o => o.x===ptx && o.y===pty));
        powerups.push({ x: ptx, y: pty, type: (Math.random()<0.5 ? 'speed' : 'slow'), taken: false });
      }

      roomObjects[key]  = objects;
      roomEnemies[key]  = enemies;
      roomPowerups[key] = powerups;
    }
  }

  // TESCHI DECORATIVI
  dungeonSkulls = [];
  const assetBase = isMobileOrTablet() ? "assets/mobile" : "assets/desktop";
  const skullSources = [
    `${assetBase}/backgrounds/teschio_1.png`,
    `${assetBase}/backgrounds/teschio_2.png`,
    `${assetBase}/backgrounds/teschio_3.png`
  ];
  for (let src of skullSources) {
    let placed = false, attempts = 0;
    const img = new Image(); img.src = src;
    while (!placed && attempts < 100) {
      attempts++;
      const roomX = Math.floor(Math.random() * DUNGEON_GRID_W);
      const roomY = Math.floor(Math.random() * DUNGEON_GRID_H);
      const room = dungeonRooms[roomY][roomX];
      const cellX = Math.floor(Math.random() * ROOM_W);
      const cellY = Math.floor(Math.random() * ROOM_H);
      if (room[cellY][cellX] === 0) {
        dungeonSkulls.push({ img, roomX, roomY, x: cellX, y: cellY });
        placed = true;
      }
    }
  }

  hudDirty = true;
}

// ----- INIZIO LIVELLO -----
function startTreasureLevel() {
  resizeTreasureCanvas();
  treasureTimeLeft = 90 + treasureLevel * 3;
  treasurePlaying = false;

  // reveal + start
  animateRevealCircle(() => {
    treasurePlaying = true;
    treasureActivePowerup = null;
    renderTreasure();
    document.getElementById('treasure-minigame-modal').classList.remove('hidden');

    if (treasureInterval) clearInterval(treasureInterval);
    treasureInterval = setInterval(() => {
      if (!treasurePlaying) return;
      treasureTimeLeft--;
      hudDirty = true; // aggiorno HUD solo quando serve
      if (treasureTimeLeft <= 0) endTreasureMinigame();
    }, 1000); // 1s fisso
  });
}

// ----- FINE MINIGIOCO -----
function endTreasureMinigame(reason = "end") {
  treasurePlaying = false;
  if (treasureInterval) { clearInterval(treasureInterval); treasureInterval = null; }

  const modal = document.getElementById('treasure-minigame-modal');
  if (modal) modal.classList.add('hidden');

  const fun = 15 + Math.round(treasureScore * 0.6);
  const exp = Math.round(treasureScore * 0.5);
  console.log("[Treasure] endTreasureMinigame:", { reason, treasureScore, fun, exp });

  setTimeout(async () => {
    try {
      if (typeof window.updateFunAndExpFromMiniGame === "function") {
        await window.updateFunAndExpFromMiniGame(fun, exp);
      } else {
        console.warn("[Treasure] updateFunAndExpFromMiniGame non trovato");
      }
      if (typeof window.showExpGainLabel === "function" && exp > 0) window.showExpGainLabel(exp);
    } catch (err) {
      console.error("[Treasure] errore award EXP/FUN:", err);
    }
    keysStack = [];
    if (typeof resetJoystick === "function") resetJoystick();
  }, 180);
}

// ----- BONUS/FEEDBACK -----
function showTreasureBonus(msg, color="#e67e22") {
  const lab = document.getElementById('treasure-bonus-label');
  if (!lab) return;
  lab.textContent = msg;
  lab.style.display = "block";
  lab.style.color = color;
  lab.style.opacity = "1";
  setTimeout(()=>lab.style.opacity="0", 1600);
  setTimeout(()=>lab.style.display="none", 2100);
}

// ----- JOYSTICK -----
const joystickBase = document.getElementById('treasure-joystick-base');
const joystickStick = document.getElementById('treasure-joystick-stick');

let joyCenter = { x: 0, y: 0 };
let stickRadius = 32;

function updatePetDirFromJoystick(dx, dy) {
  treasurePet.dirX = dx; treasurePet.dirY = dy;
  if (dx > 0.2) petDirection = "right";
  else if (dx < -0.2) petDirection = "left";
  else if (dy < -0.2) petDirection = "up";
  else if (dy > 0.2) petDirection = "down";
}
function resetJoystick() {
  joystickStick.style.transform = "translate(-50%,-50%)";
  updatePetDirFromJoystick(0,0);
  joystickBase.classList.remove('active');
}
function handleJoystickMove(touch) {
  const x = touch.clientX - joyCenter.x;
  const y = touch.clientY - joyCenter.y;
  const dist = Math.sqrt(x*x + y*y);
  let normX = x, normY = y;
  if (dist > stickRadius) { normX = x * stickRadius / dist; normY = y * stickRadius / dist; }
  joystickStick.style.transform = `translate(-50%,-50%) translate(${normX}px,${normY}px)`;
  let dx = normX / stickRadius, dy = normY / stickRadius;
  const dead = 0.18;
  if (Math.abs(dx) < dead) dx = 0;
  if (Math.abs(dy) < dead) dy = 0;
  updatePetDirFromJoystick(dx, dy);
}

// ----- FRECCE TOUCH OPZIONALI -----
function showTreasureArrowsIfMobile() {
  const arrows = document.querySelector('.treasure-arrows-container');
  if (!arrows) return;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    arrows.style.display = "";
  } else {
    arrows.style.display = "none";
  }
}
showTreasureArrowsIfMobile();

// ----- EVENTI -----
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-minigame-treasure')?.addEventListener('click', () => {
    document.getElementById('minigame-select-modal')?.classList.add('hidden');
    document.getElementById('treasure-minigame-modal')?.classList.remove('hidden');
    resizeTreasureCanvas();
    startTreasureMinigame();
  });
  document.getElementById('treasure-exit-btn')?.addEventListener('click', () => endTreasureMinigame());

  window.addEventListener('resize', () => {
    if (treasurePlaying) { resizeTreasureCanvas(); renderTreasure(); hudDirty = true; }
    showTreasureArrowsIfMobile();
  });

  document.addEventListener('keydown', (e) => {
    if (!treasurePlaying) return;
    const dir = dirMap[e.key];
    if (!dir) return;
    if (!keysStack.includes(dir)) keysStack.push(dir);
    updatePetDir();
  });
  document.addEventListener('keyup', (e) => {
    const dir = dirMap[e.key];
    if (!dir) return;
    keysStack = keysStack.filter(d => d !== dir);
    updatePetDir();
  });

  // Touch joystick
  joystickBase?.addEventListener('touchstart', (e) => {
    e.preventDefault(); joystickBase.classList.add('active');
    const rect = joystickBase.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    if (e.touches[0]) handleJoystickMove(e.touches[0]);
  }, { passive: false });

  joystickBase?.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches[0]) handleJoystickMove(e.touches[0]);
  }, { passive: false });

  joystickBase?.addEventListener('touchend',   (e) => { e.preventDefault(); resetJoystick(); }, { passive: false });
  joystickBase?.addEventListener('touchcancel',(e) => { e.preventDefault(); resetJoystick(); }, { passive: false });
});

// ----- REVEAL -----
function animateRevealCircle(callback) {
  const canvas = treasureCanvas;
  const ctx = treasureCtx;
  const W = canvas.width, H = canvas.height;
  let centerX = W/2, centerY = H/2;
  const maxRadius = Math.sqrt(W*W + H*H) / 2;
  let start = null;

  function drawFrame(now) {
    if (!start) start = now;
    const progress = Math.min(1, (now - start) / 900);
    const radius = 20 + progress * maxRadius;

    renderTreasure();

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#000";
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2*Math.PI);
    ctx.fill();
    ctx.restore();

    if (progress < 1) requestAnimationFrame(drawFrame);
    else if (typeof callback === "function") callback();
  }
  requestAnimationFrame(drawFrame);
}
