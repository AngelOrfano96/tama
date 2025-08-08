// === MINI GIOCO CACCIA AL TESORO MULTI-STANZA ===
let treasurePetImg, treasureCoinImg, treasureEnemyImg, treasureExitImg, treasureWallImg, treasureBgImg, treasurePowerupImg;
const DUNGEON_GRID_W = 3;
const DUNGEON_GRID_H = 3;
const ROOM_W = 8;
const ROOM_H = 7;
let petSprites = null;
let petDirection = "down";
let petStepFrame = 0;
let petIsMoving = false;
let petLastMoveTime = 0;
let treasureKeysDown = {};

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

let goblinSprites = null;

let treasureKeysPressed = {
  up: false,
  down: false,
  left: false,
  right: false
};
let treasureMoveInterval = null;

// Responsive tile size!
function getTreasureDimensions() {
 if (window.innerWidth < 800) {
    const w = Math.floor(window.innerWidth * 0.98);
    const h = Math.floor(window.innerHeight * 0.62);
    const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
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

// Avvia il minigioco (Vera partita nuova: rigenera dungeon)
function startTreasureMinigame() {
  generateDungeon();

  treasureLevel = 1;
  treasureScore = 0;
  treasurePlaying = true;
  treasureActivePowerup = null;

  // CARICA GLI ASSET
  let petSrc = document.getElementById('pet').src;
  let match = petSrc.match(/pet_(\d+)/);
  let petNum = match ? match[1] : "1";

  goblinSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left: [new Image(), new Image()],
    up: [new Image(), new Image()],
    down: [new Image(), new Image()]
  };

  goblinSprites.idle.src = "assets/enemies/goblin.png";
  goblinSprites.right[0].src = "assets/enemies/goblin_right_1.png";
  goblinSprites.right[1].src = "assets/enemies/goblin_right_2.png";
  goblinSprites.left[0].src = "assets/enemies/goblin_left_1.png";
  goblinSprites.left[1].src = "assets/enemies/goblin_left_2.png";
  goblinSprites.up[0].src = "assets/enemies/goblin_up_1.png";
  goblinSprites.up[1].src = "assets/enemies/goblin_up_2.png";
  goblinSprites.down[0].src = "assets/enemies/goblin_down_1.png";
  goblinSprites.down[1].src = "assets/enemies/goblin_down_2.png";

  petSprites = {
    idle: new Image(),
    right: [new Image(), new Image()],
    left: [new Image(), new Image()],
    up: [new Image(), new Image()],
    down: [new Image(), new Image()]
  };
  petSprites.idle.src = `assets/pets/pet_${petNum}.png`;
  petSprites.right[0].src = `assets/pets/pet_${petNum}_right1.png`;
  petSprites.right[1].src = `assets/pets/pet_${petNum}_right2.png`;
  petSprites.left[0].src = `assets/pets/pet_${petNum}_left1.png`;
  petSprites.left[1].src = `assets/pets/pet_${petNum}_left2.png`;
  petSprites.down[0].src = `assets/pets/pet_${petNum}_down1.png`;
  petSprites.down[1].src = `assets/pets/pet_${petNum}_down2.png`;
  petSprites.up[0].src = `assets/pets/pet_${petNum}_up1.png`;
  petSprites.up[1].src = `assets/pets/pet_${petNum}_up2.png`;

  treasureCoinImg = new Image();
  treasureCoinImg.src = "assets/collectibles/coin.png";
  treasureEnemyImg = new Image();
  treasureEnemyImg.src = "assets/enemies/goblin.png";
  treasureExitImg = new Image();
  treasureExitImg.src = "assets/icons/door.png";
  treasureWallImg = new Image();
  treasureWallImg.src = "assets/tiles/wall2.png";
  treasureBgImg = new Image();
  treasureBgImg.src = "assets/backgrounds/dungeon3.png";
  treasurePowerupImg = new Image();
  treasurePowerupImg.src = "assets/bonus/powerup.png";

  dungeonPetRoom = { x: Math.floor(DUNGEON_GRID_W/2), y: Math.floor(DUNGEON_GRID_H/2) };
  treasurePet = { x: 1, y: 1, speed: 1, powered: false, drawX: 1, drawY: 1 };

  startTreasureLevel();
}

function showTreasureFeedbackLabel(amount, color = "#ffe44c") {
  const label = document.getElementById('treasure-feedback-label');
  if (!label) return;
  label.textContent = (amount > 0 ? "+" : "") + amount;
  label.style.color = color;
  label.style.opacity = "1";
  label.style.display = "block";
  label.style.transform = "translateX(-50%) scale(1)";
  setTimeout(() => {
    label.style.transform = "translateX(-50%) scale(1.4)";
    label.style.opacity = "0";
  }, 100);
  setTimeout(() => {
    label.style.display = "none";
    label.style.opacity = "1";
    label.style.transform = "translateX(-50%) scale(1)";
  }, 1000);
}

// === MOVIMENTO FLUIDO NEMICI ===
function moveEnemyTo(enemy, targetX, targetY, duration = 300) {
  enemy.startX = typeof enemy.drawX === 'number' ? enemy.drawX : enemy.x;
  enemy.startY = typeof enemy.drawY === 'number' ? enemy.drawY : enemy.y;
  enemy.targetX = targetX;
  enemy.targetY = targetY;
  enemy.startTime = performance.now();
  enemy.moveDuration = duration;
}

function updateTreasureEnemies() {
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let enemies = roomEnemies[key];
  if (!enemies) return;

  for (const e of enemies) {
    if (typeof e.targetX === 'number' && typeof e.startX === 'number' && typeof e.startTime === 'number') {
      const now = performance.now();
      const t = Math.min(1, (now - e.startTime) / (e.moveDuration || 300));
      e.drawX = e.startX + (e.targetX - e.startX) * t;
      e.drawY = e.startY + (e.targetY - e.startY) * t;
      // Quando arrivi a destinazione, fissa la posizione
      if (t === 1) {
        e.drawX = e.x = e.targetX;
        e.drawY = e.y = e.targetY;
        delete e.targetX; delete e.startX; delete e.targetY; delete e.startY; delete e.startTime;
      }
    } else {
      e.drawX = e.x;
      e.drawY = e.y;
    }
  }
}

// === MOVIMENTO FLUIDO PET ===
function movePetTo(targetX, targetY, duration = 200) {
  const startX = treasurePet.drawX;
  const startY = treasurePet.drawY;
  const endX = targetX;
  const endY = targetY;
  const startTime = performance.now();

  function animate(now) {
    let t = Math.min(1, (now - startTime) / duration);
    treasurePet.drawX = startX + (endX - startX) * t;
    treasurePet.drawY = startY + (endY - startY) * t;
    drawTreasure();
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      treasurePet.drawX = endX;
      treasurePet.drawY = endY;
      drawTreasure();
    }
  }
  requestAnimationFrame(animate);
}

// Inizia un livello (ma NON ricreare dungeon)
function startTreasureLevel() {
  const canvas = document.getElementById('treasure-canvas');
  resizeTreasureCanvas();

  const tile = window.treasureTile;
  treasurePet.posPX = treasurePet.x * tile;
  treasurePet.posPY = treasurePet.y * tile;
  treasurePet.size  = tile - 12;
  treasurePet.speedPX = tile * 4;

  treasureCtx = canvas.getContext('2d');
  treasureTimeLeft = 90 + treasureLevel * 3;
  treasurePlaying = true;
  treasureCanMove = true;
  treasureActivePowerup = null;
  treasureNeeded = 4 + treasureLevel;

  drawTreasure();
  document.getElementById('treasure-minigame-modal').classList.remove('hidden');
  window.addEventListener('keydown', handleTreasureMove);

  if (treasureInterval) clearInterval(treasureInterval);
  treasureInterval = setInterval(() => {
    if (!treasurePlaying) return;
    treasureTimeLeft--;
    document.getElementById('treasure-timer').textContent = treasureTimeLeft;
    if (treasureTimeLeft <= 0) return endTreasureMinigame();
    moveTreasureEnemies();
    drawTreasure();
  }, 700);
}

// Genera dungeon SOLO una volta!
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

  // Porte tra le stanze
  for (let y = 0; y < DUNGEON_GRID_H; y++) {
    for (let x = 0; x < DUNGEON_GRID_W; x++) {
      if (x < DUNGEON_GRID_W-1) {
        let mid = Math.floor(ROOM_H/2);
        dungeonRooms[y][x][mid][ROOM_W-1] = 0;
        dungeonRooms[y][x+1][mid][0] = 0;
      }
      if (y < DUNGEON_GRID_H-1) {
        let mid = Math.floor(ROOM_W/2);
        dungeonRooms[y][x][ROOM_H-1][mid] = 0;
        dungeonRooms[y+1][x][0][mid] = 0;
      }
    }
  }

  // Stanza uscita NON centrale
  do {
    exitRoom.x = Math.floor(Math.random() * DUNGEON_GRID_W);
    exitRoom.y = Math.floor(Math.random() * DUNGEON_GRID_H);
  } while (exitRoom.x === Math.floor(DUNGEON_GRID_W/2) && exitRoom.y === Math.floor(DUNGEON_GRID_H/2));
  exitTile.x = ROOM_W-2; exitTile.y = ROOM_H-2;

  // Oggetti e nemici
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
      // Nemici NON vicino alle porte
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
          x: ex,
          y: ey,
          drawX: ex,
          drawY: ey,
          slow: false,
          direction: "down",
          stepFrame: 0,
          isMoving: false,
          lastMoveTime: 0
        });
      }

      // Powerup (random)
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

document.addEventListener('keydown', (e) => {
  if (e.key === "ArrowUp" || e.key === "w") treasureKeysPressed.up = true;
  if (e.key === "ArrowDown" || e.key === "s") treasureKeysPressed.down = true;
  if (e.key === "ArrowLeft" || e.key === "a") treasureKeysPressed.left = true;
  if (e.key === "ArrowRight" || e.key === "d") treasureKeysPressed.right = true;
});
document.addEventListener('keyup', (e) => {
  if (e.key === "ArrowUp" || e.key === "w") treasureKeysPressed.up = false;
  if (e.key === "ArrowDown" || e.key === "s") treasureKeysPressed.down = false;
  if (e.key === "ArrowLeft" || e.key === "a") treasureKeysPressed.left = false;
  if (e.key === "ArrowRight" || e.key === "d") treasureKeysPressed.right = false;
});

let lastMoveTime = 0;
const moveDelay = 200;

function continuousTreasureMovement() {
  let now = performance.now();
  let dx = 0, dy = 0;
  if (treasureKeysPressed.up) dy = -1;
  else if (treasureKeysPressed.down) dy = 1;
  if (treasureKeysPressed.left) dx = -1;
  else if (treasureKeysPressed.right) dx = 1;

  if ((dx !== 0 || dy !== 0) && (now - lastMoveTime > moveDelay)) {
    handleTreasureMove(dx, dy);
    lastMoveTime = now;
  }

  if (
    !treasureKeysPressed.up && !treasureKeysPressed.down &&
    !treasureKeysPressed.left && !treasureKeysPressed.right
  ) {
    if (petIsMoving && now - petLastMoveTime > 180) {
      petIsMoving = false;
      petStepFrame = 0;
      drawTreasure();
    }
  }

  updateTreasureEnemies(); // <- aggiorna posizione fluida dei nemici
  requestAnimationFrame(continuousTreasureMovement);
}
continuousTreasureMovement();

function handleTreasureMove(dx, dy) {
  if (!treasurePlaying || !treasureCanMove) return;

  if (dx === 1) petDirection = "right";
  else if (dx === -1) petDirection = "left";
  else if (dy === 1) petDirection = "down";
  else if (dy === -1) petDirection = "up";

  let px = treasurePet.x + dx;
  let py = treasurePet.y + dy;
  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];

  let moved = false;

  if (px < 0 && dungeonPetRoom.x > 0 && room[treasurePet.y][0] === 0) {
    dungeonPetRoom.x -= 1; treasurePet.x = ROOM_W - 2; moved = true;
  } else if (px >= ROOM_W && dungeonPetRoom.x < DUNGEON_GRID_W - 1 && room[treasurePet.y][ROOM_W - 1] === 0) {
    dungeonPetRoom.x += 1; treasurePet.x = 1; moved = true;
  } else if (py < 0 && dungeonPetRoom.y > 0 && room[0][treasurePet.x] === 0) {
    dungeonPetRoom.y -= 1; treasurePet.y = ROOM_H - 2; moved = true;
  } else if (py >= ROOM_H && dungeonPetRoom.y < DUNGEON_GRID_H - 1 && room[ROOM_H - 1][treasurePet.x] === 0) {
    dungeonPetRoom.y += 1; treasurePet.y = 1; moved = true;
  } else if (px >= 0 && py >= 0 && px < ROOM_W && py < ROOM_H && room[py][px] === 0) {
    treasurePet.x = px;
    treasurePet.y = py;
    moved = true;
  }

  if (moved) {
    petStepFrame = 1 - petStepFrame;
    petIsMoving = true;
    petLastMoveTime = performance.now();
    movePetTo(treasurePet.x, treasurePet.y);
  } else {
    return;
  }

  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let objects = roomObjects[key];
  let coin = objects.find(o => o.type === 'coin' && o.x === treasurePet.x && o.y === treasurePet.y && !o.taken);
  if (coin) {
    coin.taken = true;
    treasureScore += 1;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
  }
  let powers = roomPowerups[key];
  let pow = powers && powers.find(p => p.x === treasurePet.x && p.y === treasurePet.y && !p.taken);
  if (pow) {
    pow.taken = true;
    treasureScore += 12;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
    if (pow.type === 'speed') { treasurePet.speed = 2; treasureActivePowerup = 'speed'; }
    else {
      let enemies = roomEnemies[key];
      for (const e of enemies) e.slow = true;
      treasureActivePowerup = 'slow';
    }
    if (treasurePowerupTimer) clearTimeout(treasurePowerupTimer);
    treasurePowerupTimer = setTimeout(() => {
      treasurePet.speed = 1;
      let enemies = roomEnemies[key];
      for (const e of enemies) e.slow = false;
      treasureActivePowerup = null;
    }, 3000);
  }
  let coinsLeft = Object.values(roomObjects).flat().filter(o => o.type === "coin" && !o.taken).length;
  document.getElementById('treasure-minigame-coins').textContent = coinsLeft;

  if (
    dungeonPetRoom.x === exitRoom.x && dungeonPetRoom.y === exitRoom.y &&
    treasurePet.x === exitTile.x && treasurePet.y === exitTile.y &&
    Object.values(roomObjects).flat().filter(o => o.type === "coin" && !o.taken).length === 0
  ) {
    treasureLevel++;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
    setTimeout(() => {
      window.removeEventListener('keydown', handleTreasureMove);
      generateDungeon();
      startTreasureLevel();
    }, 550);
    return;
  }

  let enemies = roomEnemies[key];
  if (enemies && enemies.some(e => e.x === treasurePet.x && e.y === treasurePet.y)) {
    treasurePlaying = false;
    showTreasureBonus("Game Over!", "#e74c3c");
    window.removeEventListener('keydown', handleTreasureMove);
    if (treasureInterval) clearInterval(treasureInterval);
    setTimeout(() => {
      endTreasureMinigame();
    }, 1500);
    return;
  }
}

// Movimento goblin (AI + pathfinding + chiamata al movimento fluido)
function moveTreasureEnemies() {
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let enemies = roomEnemies[key];
  if (!enemies) return;
  const ENEMY_MOVE_DELAY = 350;

  for (const e of enemies) {
    let now = performance.now();
    if (!e.lastMoveTime) e.lastMoveTime = 0;
    if (now - e.lastMoveTime < ENEMY_MOVE_DELAY) {
      if (now - e.lastMoveTime > ENEMY_MOVE_DELAY + 60) {
        e.isMoving = false;
        e.stepFrame = 0;
      }
      continue;
    }
    let matrix = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
    let path = findPath(matrix, e, treasurePet);

    if (path && path.length > 1) {
      let next = path[1];
      if (next.x > e.x) e.direction = "right";
      else if (next.x < e.x) e.direction = "left";
      else if (next.y > e.y) e.direction = "down";
      else if (next.y < e.y) e.direction = "up";
      e.stepFrame = 1 - (e.stepFrame || 0);
      e.isMoving = true;
      e.lastMoveTime = now;
      moveEnemyTo(e, next.x, next.y, ENEMY_MOVE_DELAY - 30);
      e.x = next.x;
      e.y = next.y;
    } else {
      e.isMoving = false;
      e.stepFrame = 0;
    }
    if (e.x === treasurePet.x && e.y === treasurePet.y) {
      treasurePlaying = false;
      showTreasureBonus("Game Over!", "#e74c3c");
      window.removeEventListener('keydown', handleTreasureMove);
      if (treasureInterval) clearInterval(treasureInterval);
      setTimeout(() => {
        endTreasureMinigame();
      }, 1500);
      return;
    }
  }
}

// --- Utility BFS
function findPath(matrix, start, end) {
  let W = matrix[0].length, H = matrix.length;
  let queue = [];
  let visited = Array.from({length: H}, () => Array(W).fill(false));
  let prev = Array.from({length: H}, () => Array(W).fill(null));
  queue.push({x: start.x, y: start.y});
  visited[start.y][start.x] = true;
  let found = false;
  while (queue.length && !found) {
    let {x, y} = queue.shift();
    let dirs = [
      {dx:1, dy:0},{dx:-1, dy:0},{dx:0, dy:1},{dx:0, dy:-1}
    ];
    for (let {dx, dy} of dirs) {
      let nx = x + dx, ny = y + dy;
      if (
        nx >= 0 && nx < W && ny >= 0 && ny < H &&
        matrix[ny][nx] === 0 && !visited[ny][nx]
      ) {
        queue.push({x: nx, y: ny});
        visited[ny][nx] = true;
        prev[ny][nx] = {x, y};
        if (nx === end.x && ny === end.y) { found = true; break; }
      }
    }
  }
  if (!visited[end.y][end.x]) return null;
  let path = [], curr = {x: end.x, y: end.y};
  while (curr) { path.unshift(curr); curr = prev[curr.y][curr.x]; }
  return path;
}

// --- UI Responsive ---
window.addEventListener('resize', () => {
  if (treasurePlaying) drawTreasure();
});

// --- TOUCH CONTROLS LOGICA ---
function setupTreasureTouchControls() {
  const btns = document.querySelectorAll('.treasure-arrow-btn');
  btns.forEach(btn => {
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      treasureTouchMove(btn.dataset.dir);
    });
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      treasureTouchMove(btn.dataset.dir);
    });
  });
}
function treasureTouchMove(dir) {
  if (!treasurePlaying || !treasureCanMove) return;
  let e = { key: "" };
  if (dir === "up") e.key = "ArrowUp";
  else if (dir === "down") e.key = "ArrowDown";
  else if (dir === "left") e.key = "ArrowLeft";
  else if (dir === "right") e.key = "ArrowRight";
  handleTreasureMove(e);
}
setupTreasureTouchControls();

function drawTreasure() {
  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
  const tile = window.treasureTile || 64;

  treasureCtx.drawImage(treasureBgImg, 0, 0, ROOM_W*tile, ROOM_H*tile);

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

  // --- PET ANIMATO ---
  let petSpriteToDraw;
  if (!petIsMoving) {
    petSpriteToDraw = petSprites.idle;
  } else {
    petSpriteToDraw = petSprites[petDirection][petStepFrame];
  }
  const px = (typeof treasurePet.drawX === 'number' ? treasurePet.drawX : treasurePet.x) * tile;
  const py = (typeof treasurePet.drawY === 'number' ? treasurePet.drawY : treasurePet.y) * tile;
  const sz = treasurePet.size ?? (tile - 12);

  if (petSpriteToDraw && petSpriteToDraw.complete) {
    treasureCtx.drawImage(petSpriteToDraw, px + 6, py + 6, sz, sz);
  } else {
    treasureCtx.fillStyle = "#FFD700";
    treasureCtx.fillRect(px + 8, py + 8, sz - 4, sz - 4);
  }

  // --- NEMICI ANIMATI ---
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
    if (sprite && sprite.complete) {
      treasureCtx.drawImage(sprite, e.drawX*tile+6, e.drawY*tile+6, tile-12, tile-12);
    } else if (treasureEnemyImg && treasureEnemyImg.complete) {
      treasureCtx.drawImage(treasureEnemyImg, e.drawX*tile+6, e.drawY*tile+6, tile-12, tile-12);
    } else {
      treasureCtx.fillStyle = "#e74c3c";
      treasureCtx.fillRect(e.drawX*tile+8, e.drawY*tile+8, tile-16, tile-16);
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

function endTreasureMinigame() {
  treasurePlaying = false;
  window.removeEventListener('keydown', handleTreasureMove);
  if (treasureInterval) clearInterval(treasureInterval);

  setTimeout(() => {
    document.getElementById('treasure-minigame-modal').classList.add('hidden');
    if (typeof updateFunAndExpFromMiniGame === "function") {
      let fun, exp;
      fun = 15 + Math.round(treasureScore * 0.6);
      exp = Math.round(treasureScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }
  }, 1000);
}

function showTreasureArrowsIfMobile() {
  const arrows = document.querySelector('.treasure-arrows-container');
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    arrows.style.display = "";
  } else {
    arrows.style.display = "none";
  }
}
showTreasureArrowsIfMobile();
window.addEventListener('resize', showTreasureArrowsIfMobile);

window.addEventListener('resize', () => {
  if (treasurePlaying) {
    resizeTreasureCanvas();
    drawTreasure();
  }
});

function showTreasureBonus(msg, color="#e67e22") {
  const lab = document.getElementById('treasure-bonus-label');
  if (!lab) { 
    console.warn("Non trovo treasure-bonus-label!");
    return; 
  }
  lab.textContent = msg;
  lab.style.display = "block";
  lab.style.color = color;
  lab.style.opacity = "1";
  setTimeout(()=>lab.style.opacity="0", 1600);
  setTimeout(()=>lab.style.display="none", 2100);
}

// Avvio dal bottone minigioco
document.getElementById('btn-minigame-treasure').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('treasure-minigame-modal').classList.remove('hidden');
  resizeTreasureCanvas();
  startTreasureMinigame();
});

// Bottone Esci dal minigioco
document.getElementById('treasure-exit-btn').addEventListener('click', () => {
  endTreasureMinigame();
});
