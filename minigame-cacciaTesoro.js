// === MINI GIOCO CACCIA AL TESORO MULTI-STANZA, MOVIMENTO LIBERO ===

// ----- CONFIG E VARIABILI -----
const DUNGEON_GRID_W = 3;
const DUNGEON_GRID_H = 3;
const ROOM_W = 8;
const ROOM_H = 7;
const petSpeed = 180;
const enemySpeed = 100;

let petSprites = null, goblinSprites = null;
let treasureCoinImg, treasureEnemyImg, treasureExitImg, treasureWallImg, treasureBgImg, treasurePowerupImg;

let dungeonRooms = [];
let dungeonPetRoom = {x: 0, y: 0};
let roomObjects = {};
let roomEnemies = {};
let roomPowerups = {};
let exitRoom = {x: 0, y: 0};
let exitTile = {x: 0, y: 0};

let treasurePet, treasurePlaying, treasureScore, treasureLevel, treasureTimeLeft, treasureInterval, treasureCanMove;
let treasureCanvas, treasureCtx, treasureActivePowerup, treasurePowerupTimer;
let treasureNeeded;

let petDirection = "down";
let petStepFrame = 0;
let petIsMoving = false;
let petLastMoveTime = 0;

let treasureKeysPressed = {up: false, down: false, left: false, right: false};

function isMobileOrTablet() {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
}


// ----- DIMENSIONI DINAMICHE -----
function getTreasureDimensions() {
  // Tile size fisso su mobile/tablet per ottimizzare le performance e la resa
  if (isMobileOrTablet() || window.innerWidth < 800) {
    const tile = 32; // oppure 40, scegli tu quanto deve essere piccola su mobile
    const w = tile * ROOM_W;
    const h = tile * ROOM_H;
    return { width: w, height: h, tile };
  } else {
    const w = Math.floor(window.innerWidth * 0.70);
    const h = Math.floor(window.innerHeight * 0.75);
    const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
    return { width: tile * ROOM_W, height: tile * ROOM_H, tile };
  }
}

function resizeTreasureCanvas() {
  const canvas = document.getElementById('treasure-canvas');
  let w = window.innerWidth;
  let h = window.innerHeight - 70;
  const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
  canvas.width = ROOM_W * tile;
  canvas.height = ROOM_H * tile;
  canvas.style.width = `${ROOM_W * tile}px`;
  canvas.style.height = `${ROOM_H * tile}px`;
  window.treasureTile = tile;
}


// ----- AVVIO MINIGIOCO -----
function startTreasureMinigame() {
  generateDungeon();

  treasureLevel = 1;
  treasureScore = 0;
  treasurePlaying = true;
  treasureActivePowerup = null;

  // SPRITE LOADING
  let petSrc = document.getElementById('pet').src;
  let match = petSrc.match(/pet_(\d+)/);
  let petNum = match ? match[1] : "1";
  let assetBase = isMobileOrTablet() ? "assets/mobile" : "assets/desktop";

  

  goblinSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left: [new Image(), new Image()],
    up: [new Image(), new Image()],
    down: [new Image(), new Image()]
  };
  goblinSprites.idle.src = `${assetBase}/enemies/goblin.png`;
  goblinSprites.right[0].src = `${assetBase}/enemies/goblin_right_1.png`;
  goblinSprites.right[1].src = `${assetBase}/enemies/goblin_right_2.png`;
  goblinSprites.left[0].src = `${assetBase}/enemies/goblin_left_1.png`;
  goblinSprites.left[1].src = `${assetBase}/enemies/goblin_left_2.png`;
  goblinSprites.up[0].src = `${assetBase}/enemies/goblin_up_1.png`;
  goblinSprites.up[1].src = `${assetBase}/enemies/goblin_up_2.png`;
  goblinSprites.down[0].src = `${assetBase}/enemies/goblin_down_1.png`;
  goblinSprites.down[1].src = `${assetBase}/enemies/goblin_down_2.png`;

  

  petSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left: [new Image(), new Image()],
    up: [new Image(), new Image()],
    down: [new Image(), new Image()]
  };
  petSprites.idle.src = `${assetBase}/pets/pet_${petNum}.png`;
  petSprites.right[0].src = `${assetBase}/pets/pet_${petNum}_right1.png`;
  petSprites.right[1].src = `${assetBase}/pets/pet_${petNum}_right2.png`;
  petSprites.left[0].src = `${assetBase}/pets/pet_${petNum}_left1.png`;
  petSprites.left[1].src = `${assetBase}/pets/pet_${petNum}_left2.png`;
  petSprites.down[0].src = `${assetBase}/pets/pet_${petNum}_down1.png`;
  petSprites.down[1].src = `${assetBase}/pets/pet_${petNum}_down2.png`;
  petSprites.up[0].src = `${assetBase}/pets/pet_${petNum}_up1.png`;
  petSprites.up[1].src = `${assetBase}/pets/pet_${petNum}_up2.png`;

  treasureCoinImg = new Image();
  treasureCoinImg.src = "assets/collectibles/coin.png";
  treasureEnemyImg = new Image();
  treasureEnemyImg.src = "assets/enemies/goblin.png";
  treasureExitImg = new Image();
  treasureExitImg.src = "assets/icons/door.png";
  treasureWallImg = new Image();
  treasureWallImg.src = "assets/tiles/wall2.png";
  treasureBgImg = new Image();
  treasureBgImg.src = `${assetBase}/backgrounds/dungeon3.png`;
  treasurePowerupImg = new Image();
  treasurePowerupImg.src = "assets/bonus/powerup.png";

  dungeonPetRoom = { x: Math.floor(DUNGEON_GRID_W/2), y: Math.floor(DUNGEON_GRID_H/2) };
  let tile = window.treasureTile || 64;
  treasurePet = {
    x: 1, y: 1,
    px: 1 * tile,
    py: 1 * tile,
    speed: petSpeed,
    animTime: 0,
    powered: false,
    dirX: 0, dirY: 0
  };
// Se era attivo il powerup speed, mantieni la velocità raddoppiata
if (treasureActivePowerup === 'speed') {
  treasurePet.speed = petSpeed * 2;
}
  startTreasureLevel();
}


// ----- GESTIONE MOVIMENTO CONTINUO -----
const dirMap = {
  "ArrowUp": "up",    "w": "up",
  "ArrowDown": "down", "s": "down",
  "ArrowLeft": "left", "a": "left",
  "ArrowRight": "right", "d": "right"
};
let keysStack = []; // Tiene traccia delle direzioni ancora premute



// Aggiorna la direzione attiva in base ai tasti ancora premuti
function updatePetDir() {
  // Ordine di priorità: l'ultimo premuto in cima alla lista
  let dx = 0, dy = 0;
  // Se vuoi che prevalga sempre l'ultimo tasto premuto, prendi da fine array
  if (keysStack.length) {
    let dir = keysStack[keysStack.length - 1];
    if (dir === "up")      { treasurePet.dirY = -1; petDirection = "up"; }
    else if (dir === "down"){ treasurePet.dirY = 1; petDirection = "down"; }
    else treasurePet.dirY = 0;
    if (dir === "left")    { treasurePet.dirX = -1; petDirection = "left"; }
    else if (dir === "right"){ treasurePet.dirX = 1; petDirection = "right"; }
    else treasurePet.dirX = 0;

    // GESTIONE DIAGONALE: se ci sono due tasti, uno verticale e uno orizzontale
    if (keysStack.length >= 2) {
      let d1 = keysStack[keysStack.length - 1];
      let d2 = keysStack[keysStack.length - 2];
      if (
        (d1 === "up" || d1 === "down") &&
        (d2 === "left" || d2 === "right")
      ) {
        // Muovi diagonale (es: up+left)
        if (d2 === "left") { treasurePet.dirX = -1; }
        if (d2 === "right") { treasurePet.dirX = 1; }
      }
      if (
        (d1 === "left" || d1 === "right") &&
        (d2 === "up" || d2 === "down")
      ) {
        if (d2 === "up") { treasurePet.dirY = -1; }
        if (d2 === "down") { treasurePet.dirY = 1; }
      }
    }
  } else {
    treasurePet.dirX = 0; treasurePet.dirY = 0;
  }
}


function treasureTouchMove(dir, pressed) {
  if (!treasurePlaying) return;
  if (!dir) return;
  if (pressed) {
    if (!keysStack.includes(dir)) keysStack.push(dir);
  } else {
    keysStack = keysStack.filter(d => d !== dir);
  }
  updatePetDir();
}


// ----- GAME LOOP -----
let lastFrame = performance.now();
function gameLoop() {
  let now = performance.now();
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (treasurePlaying) {
    movePetFree(dt);
    moveEnemiesFree(dt);
    drawTreasure();
  }
  requestAnimationFrame(gameLoop);
}
gameLoop();


// ----- MOVIMENTO LIBERO PET -----
function movePetFree(dt) {
  let dx = treasurePet.dirX, dy = treasurePet.dirY;
  if (dx === 0 && dy === 0) { petIsMoving = false; return; }

  if (dx !== 0 && dy !== 0) { dx /= Math.sqrt(2); dy /= Math.sqrt(2); }
  let tile = window.treasureTile;
  let oldPX = treasurePet.px, oldPY = treasurePet.py;
  let speed = treasurePet.speed;

  let newPX = oldPX + dx * speed * dt;
  let newPY = oldPY + dy * speed * dt;

  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  let size = tile - 20;
  let tryMove = (nx, ny) => {
    let minX = Math.floor((nx + 2) / tile);
    let minY = Math.floor((ny + 2) / tile);
    let maxX = Math.floor((nx + size - 2) / tile);
    let maxY = Math.floor((ny + size - 2) / tile);
    if (room[minY][minX] === 0 && room[minY][maxX] === 0 && room[maxY][minX] === 0 && room[maxY][maxX] === 0) {
      return true;
    }
    return false;
  };

  if (tryMove(newPX, treasurePet.py)) treasurePet.px = newPX;
  if (tryMove(treasurePet.px, newPY)) treasurePet.py = newPY;

  treasurePet.x = Math.floor((treasurePet.px + size/2) / tile);
  treasurePet.y = Math.floor((treasurePet.py + size/2) / tile);

  petIsMoving = true;
  treasurePet.animTime = (treasurePet.animTime || 0) + dt;
  const ANIM_STEP = 0.18; // Cambia qui la velocità animazione (0.18 = ~5 passi/sec)
  if (treasurePet.animTime > ANIM_STEP) {
    petStepFrame = 1 - petStepFrame;
    treasurePet.animTime = 0;
  }
  petLastMoveTime = performance.now();

  // --- OGGETTI ---
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let objects = roomObjects[key];
  let coin = objects.find(o => o.type === 'coin' && !o.taken && distCenter(treasurePet, o) < 0.6);
  if (coin) {
    coin.taken = true;
    treasureScore += 1;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
  }
  let powers = roomPowerups[key];
  let pow = powers && powers.find(p => !p.taken && distCenter(treasurePet, p) < 0.6);
  if (pow) {
    pow.taken = true;
    treasureScore += 12;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
    if (pow.type === 'speed') { treasurePet.speed = petSpeed * 2; treasureActivePowerup = 'speed'; }
    else {
      let enemies = roomEnemies[key];
      for (const e of enemies) e.slow = true;
      treasureActivePowerup = 'slow';
    }
    if (treasurePowerupTimer) clearTimeout(treasurePowerupTimer);
    treasurePowerupTimer = setTimeout(() => {
      treasurePet.speed = petSpeed;
      let enemies = roomEnemies[key];
      for (const e of enemies) e.slow = false;
      treasureActivePowerup = null;
    }, 3000);
  }
  let coinsLeft = Object.values(roomObjects).flat().filter(o => o.type === "coin" && !o.taken).length;
  document.getElementById('treasure-minigame-coins').textContent = coinsLeft;

  // --- PASSAGGIO STANZA ---
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

  // --- USCITA ---
  if (
    dungeonPetRoom.x === exitRoom.x && dungeonPetRoom.y === exitRoom.y &&
    Math.abs(treasurePet.x - exitTile.x) < 1 && Math.abs(treasurePet.y - exitTile.y) < 1 &&
    coinsLeft === 0
  ) {
    treasureLevel++;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
    setTimeout(() => {
      generateDungeon();
      startTreasureLevel();
    }, 550);
    return;
  }

  // --- NEMICI: collisione = game over ---
  let enemies = roomEnemies[key];
  if (enemies && enemies.some(e => distCenter(treasurePet, e) < 0.5)) {
    treasurePlaying = false;
    showTreasureBonus("Game Over!", "#e74c3c");
    if (treasureInterval) clearInterval(treasureInterval);
    setTimeout(() => {
      endTreasureMinigame();
    }, 1500);
    return;
  }
}


// ----- MOVIMENTO LIBERO NEMICI -----
function moveEnemiesFree(dt) {
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let enemies = roomEnemies[key];
  if (!enemies) return;
  let tile = window.treasureTile;
  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  for (const e of enemies) {
    let spd = e.slow ? enemySpeed * 0.3 : enemySpeed;
    let dx = treasurePet.px - e.px, dy = treasurePet.py - e.py;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 2) {
      dx /= dist; dy /= dist;
      let newPX = e.px + dx * spd * dt;
      let newPY = e.py + dy * spd * dt;
      let size = tile - 14;
      let minX = Math.floor((newPX + 6) / tile);
      let minY = Math.floor((newPY + 6) / tile);
      let maxX = Math.floor((newPX + size - 6) / tile);
      let maxY = Math.floor((newPY + size - 6) / tile);

      if (room[minY][minX] === 0 && room[minY][maxX] === 0 && room[maxY][minX] === 0 && room[maxY][maxX] === 0) {
        e.px = newPX;
        e.py = newPY;
        e.x = Math.floor((e.px + size/2) / tile);
        e.y = Math.floor((e.py + size/2) / tile);
        if (Math.abs(dx) > Math.abs(dy)) e.direction = dx > 0 ? "right" : "left";
        else e.direction = dy > 0 ? "down" : "up";
        e.isMoving = true;
            e.animTime = (e.animTime || 0) + dt;
    const ENEMY_ANIM_STEP = 0.22; // Nemici un filo più lenti nei passi
    if (e.animTime > ENEMY_ANIM_STEP) {
      e.stepFrame = 1 - (e.stepFrame || 0);
      e.animTime = 0;
    }

      } else {
        e.isMoving = false;
      }
    }
    if (distCenter(e, treasurePet) < 0.5) {
      treasurePlaying = false;
      showTreasureBonus("Game Over!", "#e74c3c");
      setTimeout(() => {
        endTreasureMinigame();
      }, 1500);
      return;
    }
  }
}


// ----- UTILITY: DISTANZA -----
function distCenter(a, b) {
  let tile = window.treasureTile;
  return Math.hypot(
    ((a.px ?? a.x * tile) + tile/2) / tile - ((b.px ?? b.x * tile) + tile/2) / tile,
    ((a.py ?? a.y * tile) + tile/2) / tile - ((b.py ?? b.y * tile) + tile/2) / tile
  );
}


// ----- DISEGNO -----
function drawTreasure() {
  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  const tile = window.treasureTile || 64;
  treasureCtx = document.getElementById('treasure-canvas').getContext('2d');

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
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
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

  // PET
  let petSpriteToDraw;
  if (!petIsMoving) {
    petSpriteToDraw = petSprites.idle;
  } else {
    petSpriteToDraw = petSprites[petDirection][petStepFrame];
  }
  const px = treasurePet.px ?? treasurePet.x * tile;
  const py = treasurePet.py ?? treasurePet.y * tile;
  const sz = tile - 12;
  if (petSpriteToDraw && petSpriteToDraw.complete) {
    treasureCtx.drawImage(petSpriteToDraw, px + 6, py + 6, sz, sz);
  } else {
    treasureCtx.fillStyle = "#FFD700";
    treasureCtx.fillRect(px + 8, py + 8, sz - 4, sz - 4);
  }

  // NEMICI
  for (const e of roomEnemies[key]) {
    let sprite = null;
    let frame = e.stepFrame || 0;
    let dir = e.direction || "down";
    if (typeof goblinSprites !== "undefined" && goblinSprites && goblinSprites.idle) {
      if (!e.isMoving) {
        sprite = goblinSprites.idle;
      } else if (goblinSprites[dir] && goblinSprites[dir][frame]) {
        sprite = goblinSprites[dir][frame];
      }
    }
    let ex = e.px ?? e.x * tile;
    let ey = e.py ?? e.y * tile;
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


// ----- GENERA DUNGEON E OGGETTI -----
function generateDungeon() {
  dungeonRooms = [];
  roomObjects = {};
  roomEnemies = {};
  roomPowerups = {};

  for (let y = 0; y < DUNGEON_GRID_H; y++) {
    let row = [];
    for (let x = 0; x < DUNGEON_GRID_W; x++) {
      let room = [];
      for (let ty = 0; ty < ROOM_H; ty++) {
        let rrow = [];
        for (let tx = 0; tx < ROOM_W; tx++) {
          let isWall = (tx === 0 || ty === 0 || tx === ROOM_W-1 || ty === ROOM_H-1);
          rrow.push(isWall ? 1 : 0);
        }
        room.push(rrow);
      }
      row.push(room);
    }
    dungeonRooms.push(row);
  }

  // PORTE ALLARGATE (3 tile di larghezza/altezza)
  for (let y = 0; y < DUNGEON_GRID_H; y++) {
    for (let x = 0; x < DUNGEON_GRID_W; x++) {
      // Porta destra/sinistra
      if (x < DUNGEON_GRID_W-1) {
        let mid = Math.floor(ROOM_H/2);
        for (let dy = -1; dy <= 1; dy++) {
          let rowIdx = mid + dy;
          if (rowIdx >= 1 && rowIdx < ROOM_H-1) {
            dungeonRooms[y][x][rowIdx][ROOM_W-1] = 0;
            dungeonRooms[y][x+1][rowIdx][0] = 0;
          }
        }
      }
      // Porta sotto/sopra
      if (y < DUNGEON_GRID_H-1) {
        let mid = Math.floor(ROOM_W/2);
        for (let dx = -1; dx <= 1; dx++) {
          let colIdx = mid + dx;
          if (colIdx >= 1 && colIdx < ROOM_W-1) {
            dungeonRooms[y][x][ROOM_H-1][colIdx] = 0;
            dungeonRooms[y+1][x][0][colIdx] = 0;
          }
        }
      }
    }
  }

  do {
    exitRoom.x = Math.floor(Math.random() * DUNGEON_GRID_W);
    exitRoom.y = Math.floor(Math.random() * DUNGEON_GRID_H);
  } while (exitRoom.x === Math.floor(DUNGEON_GRID_W/2) && exitRoom.y === Math.floor(DUNGEON_GRID_H/2));
  exitTile.x = ROOM_W-2; exitTile.y = ROOM_H-2;

  for (let ry = 0; ry < DUNGEON_GRID_H; ry++) {
    for (let rx = 0; rx < DUNGEON_GRID_W; rx++) {
      let key = `${rx},${ry}`;
      let objects = [];
      let enemies = [];
      let powerups = [];
      let nCoins = (rx === exitRoom.x && ry === exitRoom.y) ? 1 : (2 + Math.floor(Math.random()*2));
      for (let i = 0; i < nCoins; i++) {
        let px, py;
        do {
          px = 1 + Math.floor(Math.random() * (ROOM_W-2));
          py = 1 + Math.floor(Math.random() * (ROOM_H-2));
        } while ((rx === exitRoom.x && ry === exitRoom.y && px === exitTile.x && py === exitTile.y));
        objects.push({ x: px, y: py, type: 'coin', taken: false });
      }
      let doorPositions = [];
      if (rx > 0) doorPositions.push({x: 0, y: Math.floor(ROOM_H/2)});
      if (rx < DUNGEON_GRID_W-1) doorPositions.push({x: ROOM_W-1, y: Math.floor(ROOM_H/2)});
      if (ry > 0) doorPositions.push({x: Math.floor(ROOM_W/2), y: 0});
      if (ry < DUNGEON_GRID_H-1) doorPositions.push({x: Math.floor(ROOM_W/2), y: ROOM_H-1});
      let nEnemies = Math.floor(Math.random()*2);
      for (let i = 0; i < nEnemies; i++) {
        let ex, ey, isDoor;
        let tentativi = 0;
        do {
          ex = 1 + Math.floor(Math.random() * (ROOM_W-2));
          ey = 1 + Math.floor(Math.random() * (ROOM_H-2));
          isDoor = doorPositions.some(p => p.x === ex && p.y === ey);
          tentativi++;
        } while (isDoor && tentativi < 30);
        enemies.push({
          x: ex, y: ey,
          px: ex * (window.treasureTile || 64),
          py: ey * (window.treasureTile || 64),
          slow: false,
          direction: "down",
          stepFrame: 0,
          isMoving: false,
          lastMoveTime: 0,
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
      roomObjects[key] = objects;
      roomEnemies[key] = enemies;
      roomPowerups[key] = powerups;
    }
   }
  }



// ----- INIZIO LIVELLO -----
function startTreasureLevel() {
  const canvas = document.getElementById('treasure-canvas');
  resizeTreasureCanvas();
  treasureCtx = canvas.getContext('2d');
  treasureTimeLeft = 90 + treasureLevel * 3;
  treasurePlaying = true;
  treasureCanMove = true;
  treasureActivePowerup = null;
  treasureNeeded = 4 + treasureLevel;
  drawTreasure();
  document.getElementById('treasure-minigame-modal').classList.remove('hidden');
  if (treasureInterval) clearInterval(treasureInterval);
  treasureInterval = setInterval(() => {
    if (!treasurePlaying) return;
    treasureTimeLeft--;
    document.getElementById('treasure-timer').textContent = treasureTimeLeft;
    if (treasureTimeLeft <= 0) return endTreasureMinigame();
    drawTreasure();
  }, 700);
}


// ----- FINE MINIGIOCO -----
function endTreasureMinigame() {
  treasurePlaying = false;
  if (treasureInterval) clearInterval(treasureInterval);

  setTimeout(() => {
    document.getElementById('treasure-minigame-modal').classList.add('hidden');
    if (typeof updateFunAndExpFromMiniGame === "function") {
      let fun = 15 + Math.round(treasureScore * 0.6);
      let exp = Math.round(treasureScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }
  }, 1000);
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



function showTreasureArrowsIfMobile() {
  const arrows = document.querySelector('.treasure-arrows-container');
  if (!arrows) return; // <-- Evita di accedere a .style se non esiste!
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    arrows.style.display = "";
  } else {
    arrows.style.display = "none";
  }
}

showTreasureArrowsIfMobile();





// Joystick analogico virtuale per mobile
const joystickBase = document.getElementById('treasure-joystick-base');
const joystickStick = document.getElementById('treasure-joystick-stick');

let joyActive = false;
let joyCenter = { x: 0, y: 0 };
let joyRadius = 50; // raggio base (half width of base)
let stickRadius = 32; // max spostamento in pixel dal centro

let joyDirX = 0;
let joyDirY = 0;

function updatePetDirFromJoystick(dx, dy) {
  // Questo aggiorna direttamente la direzione globale di movimento!
  // Se usi una logica tipo: treasurePet.dirX/dirY, oppure una variabile petDirX/petDirY
  treasurePet.dirX = dx;
  treasurePet.dirY = dy;

  if (dx > 0.2) petDirection = "right";
  else if (dx < -0.2) petDirection = "left";
  else if (dy < -0.2) petDirection = "up";
  else if (dy > 0.2) petDirection = "down";
}

// Funzione di reset
function resetJoystick() {
  joyDirX = 0;
  joyDirY = 0;
  joystickStick.style.transform = "translate(-50%,-50%)";
  updatePetDirFromJoystick(0,0);
  joystickBase.classList.remove('active');
}



function handleJoystickMove(touch) {
  const x = touch.clientX - joyCenter.x;
  const y = touch.clientY - joyCenter.y;

  // Distanza dal centro
  const dist = Math.sqrt(x * x + y * y);
  let normX = x, normY = y;
  if (dist > stickRadius) {
    // Limita lo spostamento massimo
    normX = x * stickRadius / dist;
    normY = y * stickRadius / dist;
  }

  // Muovi graficamente la levetta
  joystickStick.style.transform = `translate(-50%,-50%) translate(${normX}px,${normY}px)`;

  // Calcola direzione normalizzata (valori tra -1 e 1)
  let dx = normX / stickRadius;
  let dy = normY / stickRadius;

  // Soglia minima (zona morta centrale)
  const deadZone = 0.18; // regola quanto è "morta" la zona centrale
  if (Math.abs(dx) < deadZone) dx = 0;
  if (Math.abs(dy) < deadZone) dy = 0;

  // Arrotonda a due decimali
  dx = Math.abs(dx) < 0.01 ? 0 : Math.max(-1, Math.min(1, dx));
  dy = Math.abs(dy) < 0.01 ? 0 : Math.max(-1, Math.min(1, dy));

  joyDirX = dx;
  joyDirY = dy;

  // Chiama la funzione che aggiorna il movimento reale del pet!
  updatePetDirFromJoystick(dx, dy);
}

// Se vuoi testarlo anche col mouse su desktop:
/*
joystickBase.addEventListener('mousedown', function(e) {
  joyActive = true;
  joystickBase.classList.add('active');
  const rect = joystickBase.getBoundingClientRect();
  joyCenter = {
    x: rect.left + rect.width/2,
    y: rect.top + rect.height/2
  };
  handleJoystickMove(e);
});
document.addEventListener('mousemove', function(e) {
  if (!joyActive) return;
  handleJoystickMove(e);
});
document.addEventListener('mouseup', function(e) {
  if (!joyActive) return;
  joyActive = false;
  resetJoystick();
});
*/

// *** DISATTIVA TASTI FRECCIA SU MOBILE SE JOYSTICK È ATTIVO ***
function hideTouchArrowsIfJoystick() {
  // Se usi ancora le frecce, nascondile qui:
  const arrows = document.querySelector('.treasure-arrows-container');
  if (arrows) arrows.style.display = 'none';
}
hideTouchArrowsIfJoystick();

window.addEventListener('DOMContentLoaded', function() {
  // qui metti
  console.log('SCRIPT CARICATO!');
  console.log('btn-minigame-treasure:', document.getElementById('btn-minigame-treasure'));

  document.getElementById('btn-minigame-treasure').addEventListener('click', () => {
    document.getElementById('minigame-select-modal').classList.add('hidden');
    document.getElementById('treasure-minigame-modal').classList.remove('hidden');
    resizeTreasureCanvas();
    startTreasureMinigame();
  });
  document.getElementById('treasure-exit-btn').addEventListener('click', () => {
    endTreasureMinigame();
  });

  // ----- RESPONSIVE & UI -----
window.addEventListener('resize', () => {
  if (treasurePlaying) {
    resizeTreasureCanvas();
    drawTreasure();
  }
});
  document.addEventListener('keydown', (e) => {
  if (!treasurePlaying) return;
  let dir = dirMap[e.key];
  if (!dir) return;
  if (!keysStack.includes(dir)) keysStack.push(dir);
  updatePetDir();
});
document.addEventListener('keyup', (e) => {
  let dir = dirMap[e.key];
  if (!dir) return;
  keysStack = keysStack.filter(d => d !== dir);
  updatePetDir();
});

// Touch start
joystickBase.addEventListener('touchstart', function(e) {
  e.preventDefault();
  joyActive = true;
  joystickBase.classList.add('active');
  // Centro relativo all’elemento
  const rect = joystickBase.getBoundingClientRect();
  joyCenter = {
    x: rect.left + rect.width/2,
    y: rect.top + rect.height/2
  };
  if (e.touches[0]) handleJoystickMove(e.touches[0]);
}, { passive: false });

// Touch move
joystickBase.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (!joyActive) return;
  if (e.touches[0]) handleJoystickMove(e.touches[0]);
}, { passive: false });

// Touch end/cancel
joystickBase.addEventListener('touchend', function(e) {
  e.preventDefault();
  resetJoystick();
});
joystickBase.addEventListener('touchcancel', function(e) {
  e.preventDefault();
  resetJoystick();
});

window.addEventListener('resize', showTreasureArrowsIfMobile);

});
