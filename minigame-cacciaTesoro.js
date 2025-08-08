// === MINI GIOCO CACCIA AL TESORO MULTI-STANZA ===
let treasurePetImg, treasureCoinImg, treasureEnemyImg, treasureExitImg, treasureWallImg, treasureBgImg, treasurePowerupImg;
const DUNGEON_GRID_W = 3;
const DUNGEON_GRID_H = 3;
const ROOM_W = 8;
const ROOM_H = 7;
let petSprites = null;  // sarà popolata ogni volta che parte il minigioco
let petDirection = "down";     // "right", "left", "up", "down"
let petStepFrame = 0;          // 0 o 1, alterna a ogni passo
let petIsMoving = false;       // Serve per animazione fluida
let petLastMoveTime = 0;       // Per controllo animazione idle



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

let treasureKeysPressed = {
  up: false,
  down: false,
  left: false,
  right: false
};
let treasureMoveInterval = null; // timer loop


// Responsive tile size!
function getTreasureDimensions() {
 if (window.innerWidth < 800) {
    // MOBILE: canvas quasi tutto schermo
    const w = Math.floor(window.innerWidth * 0.98);
    const h = Math.floor(window.innerHeight * 0.62); // più alto
    const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
    return { width: w, height: h, tile };
} else {
    // DESKTOP: canvas ENORME!
    const w = Math.floor(window.innerWidth * 0.70); // prendi il 70% della larghezza disponibile
    const h = Math.floor(window.innerHeight * 0.75); // prendi il 75% dell'altezza disponibile
    const tile = Math.floor(Math.min(w / ROOM_W, h / ROOM_H));
    return { width: tile * ROOM_W, height: tile * ROOM_H, tile };
}
}


function resizeTreasureCanvas() {
  const canvas = document.getElementById('treasure-canvas');
  // Togli 70px dall’altezza per la barra info
  let w = window.innerWidth;
  let h = window.innerHeight - 70; // <-- CAMBIA QUESTO NUMERO SE SERVE!
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
  // Ottieni il numero/id del pet attuale (tipo 4, 5, ecc)
let petSrc = document.getElementById('pet').src; // tipo 'assets/pets/pet_4.png'
let match = petSrc.match(/pet_(\d+)/); // estrae il numero
let petNum = match ? match[1] : "1"; // fallback su 1

// Crea e carica tutti gli sprite per questo pet
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
  treasurePet = { x: 1, y: 1, speed: 1, powered: false };
  treasurePet.drawX = treasurePet.x;
  treasurePet.drawY = treasurePet.y;


  startTreasureLevel();
}
function showTreasureFeedbackLabel(amount, color = "#ffe44c") {
  const label = document.getElementById('treasure-feedback-label');
  if (!label) return;
  label.textContent = (amount > 0 ? "+" : "") + amount;
  label.style.color = color;
  label.style.opacity = "1";
  label.style.display = "block";
  // reset possible previous animation
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
function moveEnemyTo(enemy, targetX, targetY, duration = 120) {
  const startX = enemy.drawX;
  const startY = enemy.drawY;
  const endX = targetX;
  const endY = targetY;
  const startTime = performance.now();

  function animate(now) {
    let t = Math.min(1, (now - startTime) / duration);
    enemy.drawX = startX + (endX - startX) * t;
    enemy.drawY = startY + (endY - startY) * t;
    drawTreasure();
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      enemy.drawX = endX;
      enemy.drawY = endY;
      drawTreasure();
    }
  }
  requestAnimationFrame(animate);
}


function movePetTo(targetX, targetY, duration = 120) {
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
  // Usa le stesse dimensioni del CSS!
  const ROOM_W = 8;
  const ROOM_H = 6;

  resizeTreasureCanvas();


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
      // Monete
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
      // 1. Calcola le posizioni delle porte di questa stanza
let doorPositions = [];
if (rx > 0) doorPositions.push({x: 0, y: Math.floor(ROOM_H/2)}); // porta a sinistra
if (rx < DUNGEON_GRID_W-1) doorPositions.push({x: ROOM_W-1, y: Math.floor(ROOM_H/2)}); // destra
if (ry > 0) doorPositions.push({x: Math.floor(ROOM_W/2), y: 0}); // sopra
if (ry < DUNGEON_GRID_H-1) doorPositions.push({x: Math.floor(ROOM_W/2), y: ROOM_H-1}); // sotto

let nEnemies = Math.floor(Math.random()*2);
for (let i = 0; i < nEnemies; i++) {
  let ex, ey, isDoor;
  let tentativi = 0;
  do {
    ex = 1 + Math.floor(Math.random() * (ROOM_W-2));
    ey = 1 + Math.floor(Math.random() * (ROOM_H-2));
    isDoor = doorPositions.some(p => p.x === ex && p.y === ey);
    tentativi++;
  } while (isDoor && tentativi < 30); // Massimo 30 tentativi, poi accetta dov'è
  enemies.push({ x: ex, y: ey, drawX: ex, drawY: ey, slow: false });
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

// Il ciclo continuo:
function continuousTreasureMovement() {
  let dx = 0, dy = 0;
  if (treasureKeysPressed.up) dy = -1;
  else if (treasureKeysPressed.down) dy = 1;
  if (treasureKeysPressed.left) dx = -1;
  else if (treasureKeysPressed.right) dx = 1;
  if (dx !== 0 || dy !== 0) {
    handleTreasureMove(dx, dy);
  } else {
    petIsMoving = false;
  }
  requestAnimationFrame(continuousTreasureMovement);
}
continuousTreasureMovement();



let lastMoveTime = 0;
const moveDelay = 130; // ms tra un movimento e l'altro, puoi regolare

function handleTreasureMove(dx, dy) {
  if (!treasurePlaying || !treasureCanMove) return;

  // Timer per evitare ripetizione troppo veloce
  let now = performance.now();
  if (now - lastMoveTime < moveDelay) return;
  lastMoveTime = now;

  // --- AGGIORNA DIREZIONE E ANIMAZIONE ---
  if (dx === 1) petDirection = "right";
  else if (dx === -1) petDirection = "left";
  else if (dy === 1) petDirection = "down";
  else if (dy === -1) petDirection = "up";

  if (dx !== 0 || dy !== 0) {
    petStepFrame = 1 - petStepFrame; // alterna tra 0 e 1
    petIsMoving = true;
    petLastMoveTime = now;
  } else {
    petIsMoving = false;
  }

  let px = treasurePet.x + dx;
  let py = treasurePet.y + dy;
  let room = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];

  // Passaggio stanza
  if (px < 0 && dungeonPetRoom.x > 0 && room[treasurePet.y][0] === 0) {
    dungeonPetRoom.x -= 1; treasurePet.x = ROOM_W - 2;
  } else if (px >= ROOM_W && dungeonPetRoom.x < DUNGEON_GRID_W - 1 && room[treasurePet.y][ROOM_W - 1] === 0) {
    dungeonPetRoom.x += 1; treasurePet.x = 1;
  } else if (py < 0 && dungeonPetRoom.y > 0 && room[0][treasurePet.x] === 0) {
    dungeonPetRoom.y -= 1; treasurePet.y = ROOM_H - 2;
  } else if (py >= ROOM_H && dungeonPetRoom.y < DUNGEON_GRID_H - 1 && room[ROOM_H - 1][treasurePet.x] === 0) {
    dungeonPetRoom.y += 1; treasurePet.y = 1;
  } else if (px >= 0 && py >= 0 && px < ROOM_W && py < ROOM_H && room[py][px] === 0) {
    treasurePet.x = px;
    treasurePet.y = py;
  } else {
    petIsMoving = false;
    return;
  }

  movePetTo(treasurePet.x, treasurePet.y);

  // --- OGGETTI --- (rimane invariato)
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let objects = roomObjects[key];
  let coin = objects.find(o => o.type === 'coin' && o.x === treasurePet.x && o.y === treasurePet.y && !o.taken);
  if (coin) {
    coin.taken = true;
    treasureScore += 1;
    document.getElementById('treasure-minigame-score').textContent = treasureScore;
  }
  // Powerup
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

  // Uscita (rimane invariato)
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

  // Nemici: perdita (rimane invariato)
  let enemies = roomEnemies[key];
  if (enemies && enemies.some(e => e.x === treasurePet.x && e.y === treasurePet.y)) {
    treasurePlaying = false;
    showTreasureBonus("Game Over!", "#e74c3c");
    window.removeEventListener('keydown', handleTreasureMove);
    if (treasureInterval) clearInterval(treasureInterval);
    setTimeout(() => {
      endTreasureMinigame(); // <<<< ECCO L’EXP!
    }, 1500);
    return;
  }
}




// Movimento goblin
function moveTreasureEnemies() {
  let key = `${dungeonPetRoom.x},${dungeonPetRoom.y}`;
  let enemies = roomEnemies[key];
  if (!enemies) return;
  for (const e of enemies) {
    let matrix = dungeonRooms[dungeonPetRoom.y][dungeonPetRoom.x];
    let path = findPath(matrix, e, treasurePet);
    if (path && path.length > 1) {
      let step = e.slow ? 1 : treasurePet.speed;
      let next = path[Math.min(1, path.length-1)];
      moveEnemyTo(e, next.x, next.y);
      e.x = next.x;
      e.y = next.y;
    }

    // Se goblin raggiunge il pet
    if (e.x === treasurePet.x && e.y === treasurePet.y) {
      treasurePlaying = false;
      showTreasureBonus("Game Over!", "#e74c3c");
      window.removeEventListener('keydown', handleTreasureMove);
      if (treasureInterval) clearInterval(treasureInterval);
      setTimeout(() => {
        endTreasureMinigame(); // <--- ASSEGNA L'EXP E CHIUDE
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
    const tile = window.treasureTile || 64; // fallback default


  // SFONDO: viola per debug
  //treasureCtx.fillStyle = "#663399";
  //treasureCtx.fillRect(0,0,ROOM_W*tile,ROOM_H*tile);
  treasureCtx.drawImage(treasureBgImg, 0, 0, ROOM_W*tile, ROOM_H*tile);

  // MURI: grigio
  for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
    if (room[y][x] === 1) {
      // Usa l’asset del muro oppure colore
      if (treasureWallImg.complete) {
        treasureCtx.drawImage(treasureWallImg, x*tile, y*tile, tile, tile);
      } else {
        treasureCtx.fillStyle = "#888";
        treasureCtx.fillRect(x*tile, y*tile, tile, tile);
      }
    }
  }

  // OGGETTI (Monete)
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

// --- PET ANIMATO ---

let petSpriteToDraw;
if (!petIsMoving) {
  petSpriteToDraw = petSprites.idle;
} else {
  // In movimento: prendi frame della direzione attuale
  petSpriteToDraw = petSprites[petDirection][petStepFrame];
}

if (petSpriteToDraw && petSpriteToDraw.complete) {
  treasureCtx.drawImage(
    petSpriteToDraw,
    treasurePet.drawX * tile + 6,
    treasurePet.drawY * tile + 6,
    tile - 12,
    tile - 12
  );
} else {
  // fallback in caso di errore
  treasureCtx.fillStyle = "#FFD700";
  treasureCtx.fillRect(
    treasurePet.drawX * tile + 8,
    treasurePet.drawY * tile + 8,
    tile - 16,
    tile - 16
  );
}


// Dopo circa 180ms senza nuovi movimenti: torna a idle
if (petIsMoving && performance.now() - petLastMoveTime > 180) {
  petIsMoving = false;
  petStepFrame = 0;
}



  // Nemici
  for (const e of roomEnemies[key]) {
  if (treasureEnemyImg.complete) {
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
   /*
  // Testo UI (in alto a sinistra)
  treasureCtx.font = "bold 18px Segoe UI";
  treasureCtx.fillStyle = "#fff";
  let moneteRimaste = Object.values(roomObjects).flat().filter(o => o.type==="coin" && !o.taken).length;
  treasureCtx.fillText(`Monete rimaste: ${moneteRimaste}`, 18, 22);
  treasureCtx.fillText(`Tempo: ${treasureTimeLeft}s`, 180, 22);
  treasureCtx.fillText(`Livello: ${treasureLevel}`, 320, 22); */
}

function endTreasureMinigame() {
  treasurePlaying = false;
  window.removeEventListener('keydown', handleTreasureMove);
  if (treasureInterval) clearInterval(treasureInterval);

  setTimeout(() => {
    document.getElementById('treasure-minigame-modal').classList.add('hidden');
    // Ricompensa exp e fun SOLO se il gioco è finito (sconfitta)
    if (typeof updateFunAndExpFromMiniGame === "function") {
      let fun, exp;
      // Puoi considerare sempre vittoria = false perché non c'è "vittoria vera"
      fun = 15 + Math.round(treasureScore * 0.6);
      exp = Math.round(treasureScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }
  }, 1000);
}

function showTreasureArrowsIfMobile() {
  const arrows = document.querySelector('.treasure-arrows-container');
  // Mostra SOLO se touch screen
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
  resizeTreasureCanvas(); // <- qui!
  startTreasureMinigame();
});


// Bottone Esci dal minigioco
document.getElementById('treasure-exit-btn').addEventListener('click', () => {
  endTreasureMinigame();
});