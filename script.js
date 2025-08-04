const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

// === MINI GIOCO "SALTA GLI OSTACOLI" (DINO STYLE) ===

let jumperActive = false;
let jumperScore = 0;
let jumperTimer = null;
let jumperTimeLeft = 20;
let jumperPetImg = new Image();
let jumperObstacleImg = new Image();
let jumperBgImg = new Image();
let jumperSkyImg = new Image(); // <-- nuovo per lo sfondo cielo
let jumperBonusTimer = null;
let jumperCanvas, jumperCtx;
let jumperPetY, jumperPetVy, jumperIsJumping = false;
let jumperObstacles = [];
let jumperGroundY;
let jumperSpeed;
let jumperInterval;
let jumperDims = null;
let jumperGameOver = false;

let groundOffset = 0; // AGGIUNGI QUESTA in cima al gioco

let jumperPlatforms = [];
let jumperPlatformImg = new Image();
jumperPlatformImg.src = "assets/tiles/platforms.png"; // Usa il tuo asset!


// Adattivo: dimensioni canvas e tile
function getJumperDimensions() {
  if (window.innerWidth < 600) {
    return { width: 320, height: 192, ground: 144, pet: 48, obstacle: 22 };
  } else {
    return { width: 480, height: 288, ground: 216, pet: 72, obstacle: 25 }; //obstacle54
  }
}

// Texture custom: metti i tuoi path!
jumperPetImg.src = document.getElementById('pet').src;
jumperObstacleImg.src = "assets/tiles/obstacle.png";
jumperBgImg.src = "assets/backgrounds/ground.png";
jumperSkyImg.src = "assets/backgrounds/sky.png"; // <-- metti un tuo asset, va bene anche un cielo semplice

function startJumperMinigame() {
  jumperActive = true;
  jumperScore = 0;
  jumperTimeLeft = 20;
  jumperGameOver = false;
  jumperDims = getJumperDimensions();

  jumperCanvas = document.getElementById('jumper-canvas');
  jumperCtx = jumperCanvas.getContext('2d');
  jumperCanvas.width = jumperDims.width;
  jumperCanvas.height = jumperDims.height;
  // groundY è la Y di base del terreno (dal basso verso l'alto)
  jumperGroundY = jumperDims.height - 36; // ground alto 36px

  // Pet physics: la y rappresenta il bordo inferiore del pet (poggia sul ground)
  jumperPetY = jumperGroundY - jumperDims.pet;
  jumperPetVy = 0;
  jumperIsJumping = false;

  jumperObstacles = [];
  jumperPlatforms = [];
  jumperSpeed = 5;

  document.getElementById('jumper-minigame-score').textContent = jumperScore;
  document.getElementById('jumper-minigame-timer').textContent = jumperTimeLeft;
  document.getElementById('jumper-bonus-label').style.display = "none";
  document.getElementById('jumper-minigame-modal').classList.remove('hidden');

  if (jumperInterval) clearInterval(jumperInterval);
  jumperInterval = setInterval(jumperTick, 1000 / 60); // 60 fps
  if (jumperTimer) clearInterval(jumperTimer);
  jumperTimer = setInterval(() => {
    if (!jumperActive) return;
    jumperTimeLeft--;
    document.getElementById('jumper-minigame-timer').textContent = jumperTimeLeft;
    if (jumperTimeLeft <= 0) jumperEndGame();
  }, 1000);

  window.addEventListener('keydown', jumperKeyDown);
  jumperCanvas.addEventListener('touchstart', jumperJump);
  jumperCanvas.addEventListener('mousedown', jumperJump);
}

function jumperKeyDown(e) {
  if (e.code === "Space" || e.key === " ") {
    jumperJump();
  }
}
function jumperJump() {
  if (!jumperActive || jumperGameOver) return;
  if (!jumperIsJumping && jumperPetY + jumperDims.pet >= jumperGroundY) {
    jumperPetVy = -10 * (jumperDims.pet / 48); // Salto adattivo
    jumperIsJumping = true;
  }
}




function jumperTick() {
  if (!jumperActive) return;

  // --- SFONDO CIELO ---
  if (jumperSkyImg.complete && jumperSkyImg.naturalWidth > 0) {
    jumperCtx.drawImage(jumperSkyImg, 0, 0, jumperDims.width, jumperDims.height);
  } else {
    jumperCtx.fillStyle = "#b3e0ff";
    jumperCtx.fillRect(0, 0, jumperDims.width, jumperDims.height);
  }

  // --- GROUND "SCORREVOLE" ---
  let groundTileW = 48; // oppure jumperBgImg.width se la texture ha dimensione fissa
  groundOffset += (jumperSpeed + Math.floor(jumperScore/10));
  if (groundOffset >= groundTileW) groundOffset -= groundTileW;

  if (jumperBgImg.complete && jumperBgImg.naturalWidth > 0) {
    for (let x = -groundOffset; x < jumperDims.width; x += groundTileW) {
      jumperCtx.drawImage(jumperBgImg, x, jumperGroundY, groundTileW, 36);
    }
  } else {
    jumperCtx.fillStyle = "#2c3e50";
    jumperCtx.fillRect(0, jumperGroundY, jumperDims.width, 36);
  }



  // --- OSTACOLI ---
  // Spawn nuovi ostacoli
  if (Math.random() < Math.min(0.02 + jumperScore/250, 0.14)) {
    jumperObstacles.push({
      x: jumperDims.width + Math.random()*50,
      y: jumperGroundY - jumperDims.obstacle, // allinea la base al ground
      w: jumperDims.obstacle,
      h: jumperDims.obstacle,
      passed: false
    });
  }
  for (let i = 0; i < jumperObstacles.length; i++) {
    let obs = jumperObstacles[i];
    obs.x -= jumperSpeed + Math.floor(jumperScore/10); // velocità crescente!
    if (jumperObstacleImg.complete) {
      jumperCtx.drawImage(jumperObstacleImg, obs.x, obs.y, obs.w, obs.h);
    } else {
      jumperCtx.fillStyle = "#a33";
      jumperCtx.fillRect(obs.x, obs.y, obs.w, obs.h);
    }
    // Collisione: pet a sinistra a X=16
    if (!jumperGameOver &&
      obs.x < 16 + jumperDims.pet &&
      obs.x + obs.w > 16 &&
      jumperPetY + jumperDims.pet > obs.y // la base del pet è sotto il bordo superiore dell'ostacolo
    ) {
      jumperGameOver = true;
      showJumperBonus("Game Over!", "#e74c3c");
      jumperEndGame();
    }
    // Score: ostacolo superato
    if (!obs.passed && obs.x + obs.w < 16) {
      jumperScore++;
      obs.passed = true;
      document.getElementById('jumper-minigame-score').textContent = jumperScore;
      showJumperBonus("+1!", "#f1c40f");
    }
  }
  jumperObstacles = jumperObstacles.filter(obs => obs.x + obs.w > 0);

  // ---- GENERA PIATTAFORME RANDOM ----
if (Math.random() < 0.03 && jumperPlatforms.length < 3) {
  // Altezza random, solo livelli raggiungibili
  let minY = jumperGroundY - jumperDims.pet * 2.5;
  let maxY = jumperGroundY - jumperDims.pet * 1.3;
  let platY = Math.floor(minY + Math.random() * (maxY - minY));
  let platW = 72 * (jumperDims.width / 320); // piattaforme adattive
  let platH = 18 * (jumperDims.height / 192);
  let platX = jumperDims.width + Math.random()*60;

  // Controllo: mai troppo vicino ad altra piattaforma (orizzontale e verticale)
  let tooClose = jumperPlatforms.some(p => Math.abs(p.x - platX) < 96 && Math.abs(p.y - platY) < 42);
  // Controllo: mai troppo vicino a un ostacolo appena generato (±60px)
  let obstacleTooClose = jumperObstacles.some(obs => Math.abs(obs.x - platX) < 60);

  if (!tooClose && !obstacleTooClose) {
    jumperPlatforms.push({
      x: platX,
      y: platY,
      w: platW,
      h: platH
    });
  }
}

// --- MUOVI & DISEGNA PIATTAFORME ---
for (let i = 0; i < jumperPlatforms.length; i++) {
  let plat = jumperPlatforms[i];
  plat.x -= jumperSpeed + Math.floor(jumperScore/10);

  // Disegna piattaforma
  if (jumperPlatformImg.complete) {
    jumperCtx.drawImage(jumperPlatformImg, plat.x, plat.y, plat.w, plat.h);
  } else {
    jumperCtx.fillStyle = "#8ED6FF";
    jumperCtx.fillRect(plat.x, plat.y, plat.w, plat.h);
  }
}
jumperPlatforms = jumperPlatforms.filter(plat => plat.x + plat.w > 0);


  // --- PET ---
  if (jumperPetImg.complete) {
    jumperCtx.drawImage(jumperPetImg, 16, jumperPetY, jumperDims.pet, jumperDims.pet);
  } else {
    jumperCtx.fillStyle = "#fff";
    jumperCtx.fillRect(16, jumperPetY, jumperDims.pet, jumperDims.pet);
  }

  // --- PUNTEGGIO E TIMER ---
  jumperCtx.font = "bold 21px Segoe UI";
  jumperCtx.fillStyle = "#fffc34";
  jumperCtx.textAlign = "left";
  jumperCtx.fillText("Punti: " + jumperScore, 16, 36);

  jumperCtx.font = "bold 17px Segoe UI";
  jumperCtx.fillStyle = "#ff7349";
  jumperCtx.fillText("Tempo: " + jumperTimeLeft + "s", 16, 62);

  // --- Pet physics ---
  jumperPetY += jumperPetVy;
  jumperPetVy += 0.7 * (jumperDims.pet / 48); // gravità adattiva
  // Atterra (base del pet allineata al ground)
  let landedOnPlatform = false;
for (let plat of jumperPlatforms) {
  // Verifica atterraggio SOLO se stai cadendo (velocità > 0)
  if (
    jumperPetVy >= 0 &&
    jumperPetY + jumperDims.pet <= plat.y + 10 && // Non attraversare dal basso
    jumperPetY + jumperDims.pet >= plat.y &&     // In contatto col top
    16 + jumperDims.pet > plat.x && 16 < plat.x + plat.w // orizzontalmente sopra la piattaforma
  ) {
    jumperPetY = plat.y - jumperDims.pet;
    jumperPetVy = 0;
    jumperIsJumping = false;
    landedOnPlatform = true;
    break;
  }
}
if (!landedOnPlatform && jumperPetY >= jumperGroundY) {
  jumperPetY = jumperGroundY;
  jumperPetVy = 0;
  jumperIsJumping = false;
}

}

// BONUS LABEL
function showJumperBonus(msg, color="#e67e22") {
  const lab = document.getElementById('jumper-bonus-label');
  lab.textContent = msg;
  lab.style.display = "block";
  lab.style.color = color;
  lab.style.opacity = "1";
  if (jumperBonusTimer) clearTimeout(jumperBonusTimer);
  jumperBonusTimer = setTimeout(()=>{lab.style.opacity="0";}, 1400);
  setTimeout(()=>{lab.style.display="none";}, 1900);
}

function jumperEndGame() {
  jumperActive = false;
  if (jumperInterval) clearInterval(jumperInterval);
  if (jumperTimer) clearInterval(jumperTimer);

  setTimeout(() => {
    document.getElementById('jumper-minigame-modal').classList.add('hidden');
    let fun = Math.min(100, jumperScore * 5);
    let exp = Math.max(0, Math.round(jumperScore * 2.4));
    updateFunAndExpFromMiniGame(fun, exp);
    showExpGainLabel(exp);
    window.removeEventListener('keydown', jumperKeyDown);
    jumperCanvas.removeEventListener('touchstart', jumperJump);
    jumperCanvas.removeEventListener('mousedown', jumperJump);
  }, 1100);
}

// Esci
document.getElementById('jumper-exit-btn').addEventListener('click', () => {
  jumperActive = false;
  jumperGameOver = true;
  if (jumperInterval) clearInterval(jumperInterval);
  if (jumperTimer) clearInterval(jumperTimer);
  document.getElementById('jumper-minigame-modal').classList.add('hidden');
  window.removeEventListener('keydown', jumperKeyDown);
  if (jumperCanvas) {
    jumperCanvas.removeEventListener('touchstart', jumperJump);
    jumperCanvas.removeEventListener('mousedown', jumperJump);
  }
});

// Bottone nella modale di selezione
document.getElementById('btn-minigame-jumper').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('jumper-minigame-modal').classList.remove('hidden');
  jumperPetImg.src = document.getElementById('pet').src;
  startJumperMinigame();
});





// === COSTANTI LABIRINTO ===
let MAZE_WIDTH = 10, MAZE_HEIGHT = 8, TILE_SIZE = 32;
const MAZE_PET_SIZE = 26, MAZE_GOBLIN_SIZE = 26;

// Immagini Labirinto
let mazePetImg = null; // creato in startMazeMinigame
let mazeKeyImg = new Image();
let mazeExitImg = new Image();
let mazeGoblinImg = new Image();
mazeKeyImg.src = "assets/icons/key.png";
mazeExitImg.src = "assets/icons/door.png";
mazeGoblinImg.src = "assets/enemies/goblin.png";

// Stato Labirinto
let mazeMatrix, mazePet, mazeKey, mazeExit, mazeGoblin, mazeScore, mazeTimer, mazeInterval, mazeBonusTimer;
let mazeTimeLeft = 30;
let mazePlaying = false;
let mazeCanvas, mazeCtx;
let mazeCanMove = true;
let petMovedLastTurn = false;

let mazeWallImg = new Image();
let mazeBgImg = new Image();
mazeWallImg.src = "assets/tiles/wall2.png";
mazeBgImg.src = "assets/backgrounds/dungeon3.png";
let mazeLevel = 1;
let mazeGoblins = [];

function isMobile() {
  return window.innerWidth < 600;
}

function getMazeDimensions() {
  if (isMobile()) {
    return { width: 320, height: 256, tile: 32 };
  } else {
    return { width: 480, height: 384, tile: 48 };
  }
}
function getMinigameDimensions() {
  if (window.innerWidth < 600) {
    return { width: 320, height: 320 };
  } else {
    return { width: 480, height: 480 }; // Puoi mettere anche 640x640 se vuoi ancora più grande
  }
}

// === GENERA LABIRINTO SEMPLICE (muri random + corridoio) ===
function generateMazeMatrix() {
  let maze, tries = 0;
  do {
    maze = [];
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      let row = [];
      for (let x = 0; x < MAZE_WIDTH; x++) {
        if (x === 0 || y === 0 || x === MAZE_WIDTH-1 || y === MAZE_HEIGHT-1) row.push(1);
        else row.push(Math.random() < 0.16 ? 1 : 0);
      }
      maze.push(row);
    }
    maze[1][1] = 0;
    maze[MAZE_HEIGHT-2][MAZE_WIDTH-2] = 0;
    tries++;
  } while (!mazeHasPath(maze, 1, 1, MAZE_WIDTH-2, MAZE_HEIGHT-2) && tries < 20);
  return maze;
}

function randomEmptyCell() {
  let x, y;
  do {
    x = 1 + Math.floor(Math.random() * (MAZE_WIDTH-2));
    y = 1 + Math.floor(Math.random() * (MAZE_HEIGHT-2));
  } while (
    mazeMatrix[y][x] !== 0 ||
    (x === 1 && y === 1) ||
    (x === MAZE_WIDTH-2 && y === MAZE_HEIGHT-2)
  );
  return { x, y };
}

function startMazeMinigame() {
  mazeLevel = 1;
  mazeScore = 0;
  mazePetImg = new Image();
  mazePetImg.src = document.getElementById('pet').src;
  startMazeLevel();
}

function startMazeLevel() {
  const dims = getMazeDimensions();
  MAZE_WIDTH = Math.floor(dims.width / dims.tile);
  MAZE_HEIGHT = Math.floor(dims.height / dims.tile);
  TILE_SIZE = dims.tile;

  mazeCanvas = document.getElementById('maze-canvas');
  mazeCanvas.width = dims.width;
  mazeCanvas.height = dims.height;
  mazeCtx = mazeCanvas.getContext('2d');

  mazeMatrix = generateMazeMatrix();
  mazeTimeLeft = 30 + (mazeLevel-1)*3;
  mazePlaying = true;
  mazeCanMove = true;
  document.getElementById('maze-minigame-modal').classList.remove('hidden');
  document.getElementById('maze-bonus-label').style.display = "none";
  document.getElementById('maze-minigame-score').textContent = mazeScore;
  document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;

  mazePet = { x: 1, y: 1 };
  mazeExit = { x: MAZE_WIDTH-2, y: MAZE_HEIGHT-2 };
  mazeKey = randomEmptyCell();

  mazeGoblins = [];
  mazeGoblins.push(randomEmptyCell());
  if (mazeLevel >= 2) mazeGoblins.push(randomEmptyCell());

  drawMaze();

  window.addEventListener('keydown', handleMazeMove);

  if (mazeInterval) clearInterval(mazeInterval);
  mazeInterval = setInterval(() => {
    if (!mazePlaying) return;
    mazeTimeLeft--;
    document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;
    if (mazeTimeLeft <= 0) {
      endMazeMinigame(false);
    }
    drawMaze();
  }, 1000);
}

function mazeHasPath(maze, sx, sy, dx, dy) {
  let visited = Array.from({length: MAZE_HEIGHT}, () => Array(MAZE_WIDTH).fill(false));
  let queue = [{ x: sx, y: sy }];
  visited[sy][sx] = true;
  while (queue.length) {
    let {x, y} = queue.shift();
    if (x === dx && y === dy) return true;
    for (let [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      if (
        nx >= 0 && nx < MAZE_WIDTH &&
        ny >= 0 && ny < MAZE_HEIGHT &&
        maze[ny][nx] === 0 &&
        !visited[ny][nx]
      ) {
        visited[ny][nx] = true;
        queue.push({x: nx, y: ny});
      }
    }
  }
  return false;
}

function drawMaze() {
  if (mazeBgImg.complete) {
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      for (let x = 0; x < MAZE_WIDTH; x++) {
        mazeCtx.drawImage(mazeBgImg, x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  } else {
    mazeCtx.fillStyle = "#17181a";
    mazeCtx.fillRect(0,0,MAZE_WIDTH*TILE_SIZE,MAZE_HEIGHT*TILE_SIZE);
  }

  for (let y = 0; y < MAZE_HEIGHT; y++) {
    for (let x = 0; x < MAZE_WIDTH; x++) {
      if (mazeMatrix[y][x] === 1) {
        if (mazeWallImg.complete) {
          mazeCtx.drawImage(mazeWallImg, x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          mazeCtx.fillStyle = "#444";
          mazeCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }
  mazeCtx.globalAlpha = 1;
  if (mazeKey) mazeCtx.drawImage(mazeKeyImg, mazeKey.x*TILE_SIZE+4, mazeKey.y*TILE_SIZE+4, 24, 24);
  mazeCtx.drawImage(mazeExitImg, mazeExit.x*TILE_SIZE+4, mazeExit.y*TILE_SIZE+4, 24, 24);
  for (const goblin of mazeGoblins) {
    mazeCtx.drawImage(mazeGoblinImg, goblin.x*TILE_SIZE+3, goblin.y*TILE_SIZE+3, 26, 26);
  }
  mazeCtx.drawImage(mazePetImg, mazePet.x*TILE_SIZE+3, mazePet.y*TILE_SIZE+3, MAZE_PET_SIZE, MAZE_PET_SIZE);

  if (!mazePlaying) {
    mazeCtx.font = "bold 22px Segoe UI";
    mazeCtx.fillStyle = "#e67e22";
    mazeCtx.textAlign = "center";
    mazeCtx.fillText("Premi ESC o 'Esci' per tornare", (MAZE_WIDTH*TILE_SIZE)/2, (MAZE_HEIGHT*TILE_SIZE)/2 + 20);
  }
}

function handleMazeMove(e) {
  if (!mazePlaying || !mazeCanMove) return;
  let dx=0, dy=0;
  if (e.key === "ArrowUp" || e.key==="w") dy=-1;
  else if (e.key === "ArrowDown" || e.key==="s") dy=1;
  else if (e.key === "ArrowLeft" || e.key==="a") dx=-1;
  else if (e.key === "ArrowRight" || e.key==="d") dx=1;
  else if (e.key === "Escape") { endMazeMinigame(false); return; }
  else return;

  let nx = mazePet.x + dx, ny = mazePet.y + dy;
  if (nx < 0 || ny < 0 || nx >= MAZE_WIDTH || ny >= MAZE_HEIGHT) return;
  petMovedLastTurn = false;

  if (mazeMatrix[ny][nx] === 1) {
    mazeTimeLeft = Math.max(1, mazeTimeLeft - 3);
    showMazeBonus("-3s!", "#e74c3c");
    petMovedLastTurn = false;
  } else {
    let willBeCaught = mazeGoblins.some(gob => gob.x === nx && gob.y === ny);
    mazePet.x = nx; mazePet.y = ny;
    petMovedLastTurn = true;

    if (mazeKey && nx === mazeKey.x && ny === mazeKey.y) {
      mazeKey = null;
      mazeScore += 20;
      mazeTimeLeft = Math.min(90, mazeTimeLeft + 7);
      showMazeBonus("+20pt +7s!", "#27ae60");
    }
    if (nx === mazeExit.x && ny === mazeExit.y) {
      mazeLevel++;
      mazeScore++;
      document.getElementById('maze-minigame-score').textContent = mazeScore;
      showMazeBonus(`Livello ${mazeLevel}!`, "#3498db");
      setTimeout(() => {
        window.removeEventListener('keydown', handleMazeMove);
        startMazeLevel();
      }, 600);
      return;
    }
    if (willBeCaught) {
      showMazeBonus("Il goblin ti ha preso! GAME OVER", "#d7263d");
      mazePlaying = false;
      window.removeEventListener('keydown', handleMazeMove);
      if (mazeInterval) clearInterval(mazeInterval);
      setTimeout(() => {
        document.getElementById('maze-minigame-modal').classList.add('hidden');
        document.getElementById('maze-touch-controls').style.display = 'none';
        let fun = 15 + Math.round(mazeScore * 0.6);
        let exp = Math.round(mazeScore * 0.5);
        updateFunAndExpFromMiniGame(fun, exp);
        showExpGainLabel(exp);
      }, 1200);
      return;
    }
  }
  moveGoblinsTowardsPet();

  let lose = mazeGoblins.some(gob => gob.x === mazePet.x && gob.y === mazePet.y);
  if (lose) {
    showMazeBonus("Il goblin ti ha preso! GAME OVER", "#d7263d");
    mazePlaying = false;
    window.removeEventListener('keydown', handleMazeMove);
    if (mazeInterval) clearInterval(mazeInterval);
    setTimeout(() => {
      document.getElementById('maze-minigame-modal').classList.add('hidden');
      document.getElementById('maze-touch-controls').style.display = 'none';
      let fun = 15 + Math.round(mazeScore * 0.6);
      let exp = Math.round(mazeScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }, 1200);
    return;
  }

  if (!petMovedLastTurn) {
    let adjacent = mazeGoblins.some(gob => (
      Math.abs(gob.x - mazePet.x) + Math.abs(gob.y - mazePet.y) === 1
    ));
    if (adjacent) {
      showMazeBonus("Il goblin ti ha preso! GAME OVER", "#d7263d");
      mazePlaying = false;
      window.removeEventListener('keydown', handleMazeMove);
      if (mazeInterval) clearInterval(mazeInterval);
      setTimeout(() => {
        document.getElementById('maze-minigame-modal').classList.add('hidden');
        document.getElementById('maze-touch-controls').style.display = 'none';
        let fun = 15 + Math.round(mazeScore * 0.6);
        let exp = Math.round(mazeScore * 0.5);
        updateFunAndExpFromMiniGame(fun, exp);
        showExpGainLabel(exp);
      }, 1200);
      return;
    }
  }
  drawMaze();
  document.getElementById('maze-minigame-score').textContent = mazeScore;
  document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;
}

function moveGoblinsTowardsPet() {
  for (let i = 0; i < mazeGoblins.length; i++) {
    let gob = mazeGoblins[i];
    if (Math.abs(gob.x - mazePet.x) + Math.abs(gob.y - mazePet.y) === 1) {
      continue;
    }
    let path = findPath(mazeMatrix, gob, mazePet);
    let randomFail = Math.random() < 0.20;
    if (path && path.length > 1 && !randomFail) {
      gob.x = path[1].x;
      gob.y = path[1].y;
    } else {
      let dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
      dirs = dirs.sort(() => Math.random() - 0.5);
      for (let dir of dirs) {
        let nx = gob.x + dir.dx, ny = gob.y + dir.dy;
        if (
          nx > 0 && ny > 0 && nx < MAZE_WIDTH-1 && ny < MAZE_HEIGHT-1 &&
          mazeMatrix[ny][nx] === 0 &&
          !(nx === mazePet.x && ny === mazePet.y)
        ) {
          gob.x = nx;
          gob.y = ny;
          break;
        }
      }
    }
  }
}

// Funzione BFS per trovare il percorso più breve dal goblin al pet
function findPath(matrix, start, end) {
  let queue = [];
  let visited = Array.from({length: MAZE_HEIGHT}, () => Array(MAZE_WIDTH).fill(false));
  let prev = Array.from({length: MAZE_HEIGHT}, () => Array(MAZE_WIDTH).fill(null));
  queue.push({x: start.x, y: start.y});
  visited[start.y][start.x] = true;
  let found = false;
  while (queue.length && !found) {
    let {x, y} = queue.shift();
    let dirs = [
      {dx:1, dy:0},
      {dx:-1, dy:0},
      {dx:0, dy:1},
      {dx:0, dy:-1}
    ];
    for (let {dx, dy} of dirs) {
      let nx = x + dx, ny = y + dy;
      if (
        nx >= 0 && nx < MAZE_WIDTH &&
        ny >= 0 && ny < MAZE_HEIGHT &&
        matrix[ny][nx] === 0 &&
        !visited[ny][nx]
      ) {
        queue.push({x: nx, y: ny});
        visited[ny][nx] = true;
        prev[ny][nx] = {x, y};
        if (nx === end.x && ny === end.y) {
          found = true;
          break;
        }
      }
    }
  }
  if (!visited[end.y][end.x]) return null;
  let path = [];
  let curr = {x: end.x, y: end.y};
  while (curr) {
    path.unshift(curr);
    curr = prev[curr.y][curr.x];
  }
  return path;
}

function showMazeBonus(msg, color="#e67e22") {
  const lab = document.getElementById('maze-bonus-label');
  lab.textContent = msg;
  lab.style.display = "block";
  lab.style.color = color;
  lab.style.opacity = "1";
  setTimeout(()=>lab.style.opacity="0", 1600);
  setTimeout(()=>lab.style.display="none", 2100);
}

function endMazeMinigame(vittoria) {
  mazePlaying = false;
  window.removeEventListener('keydown', handleMazeMove);
  if (mazeInterval) clearInterval(mazeInterval);
  setTimeout(() => {
    document.getElementById('maze-minigame-modal').classList.add('hidden');
    document.getElementById('maze-touch-controls').style.display = 'none';
    if (vittoria) {
      let fun = 60 + mazeScore;
      let exp = Math.round(mazeScore * 1.25) + 30;
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    } else {
      let fun = 15 + Math.round(mazeScore * 0.6);
      let exp = Math.round(mazeScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }
  }, 1000);
}

document.getElementById('maze-exit-btn').addEventListener('click', () => {
  endMazeMinigame(false);
  document.getElementById('maze-minigame-modal').classList.add('hidden');
});

// ----- MINI GIOCO PRENDIMI ----- 
let minigameActive = false;
let minigameScore = 0;
let minigameTimer = null;
let minigameCountdown = null;
let minigamePetImg = new Image();
let minigameGoblinImg = new Image();
let minigameDungeonImg = new Image();
let isGoblin = false;
let goblinTimeout = null;
let minigameCanClick = true;
let bonusTimeActive = false;
let bonusTimeTextTimer = null;
let totalTime = 20;
// QUI: posizioni globali!
let petX = 0, petY = 0;

minigameGoblinImg.src = "assets/enemies/goblin.png";
minigameDungeonImg.src = "assets/backgrounds/dungeon.png";

function startMiniGame() {
  minigameActive = false;
  minigameScore = 0;
  totalTime = 20;
  let countdown = 5;
  minigamePetImg.src = document.getElementById('pet').src;

  // --- ADATTIVO ---
  const dims = getMinigameDimensions();
  const canvas = document.getElementById('minigame-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = dims.width;
  canvas.height = dims.height;

  // *** USO GLOBALI, non dichiaro let ***
  petX = dims.width/2 - 28;
  petY = dims.height/2 - 28;

  const timerLabel = document.getElementById('minigame-timer');
  const titleLabel = document.getElementById('minigame-title');

  function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minigameDungeonImg.complete) ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);

    ctx.font = "bold 19px Segoe UI";
    ctx.fillStyle = "#fffc34ff";
    ctx.textAlign = "center";
    ctx.fillText("Punteggio: " + minigameScore, canvas.width / 2, 32);
    if (minigameActive) {
      ctx.font = "bold 17px Segoe UI";
      ctx.fillStyle = "#ff7349ff";
      ctx.fillText("Tempo: " + totalTime + "s", canvas.width / 2, 55);
    }
    if (bonusTimeActive) {
      ctx.font = "bold 24px Segoe UI";
      ctx.fillStyle = "#e67e22";
      ctx.textAlign = "center";
      ctx.fillText("+5s Tempo Bonus!", canvas.width / 2, 85);
    }
    ctx.textAlign = "left";
    if (isGoblin) {
      if (minigameGoblinImg.complete) ctx.drawImage(minigameGoblinImg, petX, petY, 56, 56);
    } else {
      if (minigamePetImg.complete) ctx.drawImage(minigamePetImg, petX, petY, 56, 56);
    }
  }

  minigameActive = false;
  isGoblin = false;
  drawAll();
  titleLabel.textContent = "Acchiappa il tuo pet!";
  timerLabel.textContent = "";
  ctx.font = "bold 46px Segoe UI";
  ctx.fillStyle = "#e67e22";
  ctx.textAlign = "center";
  ctx.fillText("5", canvas.width / 2, canvas.height / 2);

  let currCount = 5;
  minigameCountdown = setInterval(() => {
    currCount--;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minigameDungeonImg.complete) ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);
    ctx.font = "bold 46px Segoe UI";
    ctx.fillStyle = "#e67e22";
    ctx.textAlign = "center";
    ctx.fillText(currCount > 0 ? currCount : "VIA!", canvas.width / 2, canvas.height / 2);
    titleLabel.textContent = "Acchiappa il tuo pet!";
    timerLabel.textContent = "";
    if (currCount === 0) {
      clearInterval(minigameCountdown);
      setTimeout(runMainMinigame, 700);
    }
  }, 1000);

  function runMainMinigame() {
    minigameActive = true;
    totalTime = 20;
    minigameScore = 0;
    timerLabel.textContent = "Tempo: 20s";
    titleLabel.textContent = "Acchiappa il tuo pet!";
    drawAll();
    minigameMove();

    minigameTimer = setInterval(() => {
      if (!minigameActive) return;
      totalTime--;
      if (totalTime < 0) totalTime = 0;
      timerLabel.textContent = "Tempo: " + totalTime + "s";
      drawAll();
      if (totalTime <= 0) {
        clearInterval(minigameTimer);
        minigameActive = false;
        titleLabel.textContent = "";
        timerLabel.textContent = "";
        endMiniGame();
      } else {
        if (isGoblin) return;
        minigameMove();
      }
    }, 1000);
  }

  function minigameMove() {
    minigameCanClick = true;
    isGoblin = Math.random() < 0.22;
    let margin = 32;
    // *** USO GLOBALI, non dichiaro let ***
    petX = margin + Math.random() * (canvas.width - 56 - margin*2);
    petY = margin + Math.random() * (canvas.height - 56 - margin*2);

    drawAll();

    if (isGoblin) {
      goblinTimeout = setTimeout(() => {
        if (isGoblin && minigameActive) {
          isGoblin = false;
          minigameCanClick = false;
          setTimeout(() => {
            minigameMove();
          }, 300);
        }
      }, 1800);
    } else {
      if (goblinTimeout) clearTimeout(goblinTimeout);
    }
  }

  canvas.onclick = function(e) {
  if (!minigameActive || !minigameCanClick) return;
  minigameCanClick = false;
  const rect = canvas.getBoundingClientRect();

  // SCALING!
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;

  if (
    clickX >= petX && clickX <= petX + 56 &&
    clickY >= petY && clickY <= petY + 56
  ) {
    if (isGoblin) {
      minigameScore = Math.max(0, minigameScore - 2);
      isGoblin = false;
    } else {
      minigameScore++;
      if (Math.random() < 0.2) {
        totalTime += 5;
        bonusTimeActive = true;
        if (bonusTimeTextTimer) clearTimeout(bonusTimeTextTimer);
        drawAll();
        bonusTimeTextTimer = setTimeout(() => {
          bonusTimeActive = false;
          drawAll();
        }, 1000);
      }
    }
    setTimeout(() => {
      minigameMove();
    }, 390);
  } else {
    minigameCanClick = true;
  }
};

}



function stopMiniGame() {
  minigameActive = false;
  if (minigameTimer) clearInterval(minigameTimer);
  if (minigameCountdown) clearInterval(minigameCountdown);
  if (goblinTimeout) clearTimeout(goblinTimeout);
}

function endMiniGame() {
  document.getElementById('minigame-modal').classList.add('hidden');
  let funPoints = Math.min(100, minigameScore * 6);
  let expPoints = Math.max(0, Math.round(minigameScore * 2.6));
  updateFunAndExpFromMiniGame(funPoints, expPoints);
  stopMiniGame();
}

async function updateFunAndExpFromMiniGame(funPoints, expPoints) {
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  if (!state) return;
  let newFun = Math.min(100, state.fun + funPoints);
  await supabaseClient.from('pet_states').update({
    fun: newFun,
    updated_at: new Date()
  }).eq('pet_id', petId);
  await addExpAndMaybeLevelUp(state, expPoints);
  showExpGainLabel(expPoints);
}

function showExpGainLabel(points) {
  const label = document.getElementById('exp-gain-label');
  if (!label) return;
  label.textContent = points > 0 ? `+${points} exp` : '';
  label.style.display = points > 0 ? "inline-block" : "none";
  label.style.opacity = "1";
  setTimeout(() => label.style.opacity = "0", 1800);
  setTimeout(() => label.style.display = "none", 2200);
}

// Al click su "Play" si apre la modale di selezione minigiochi
document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.remove('hidden');
});

document.getElementById('btn-minigame-catch').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('minigame-modal').classList.remove('hidden');
  startMiniGame();
});

document.getElementById('btn-minigame-maze').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('maze-minigame-modal').classList.remove('hidden');
  if (window.innerWidth < 800) {
    document.getElementById('maze-touch-controls').style.display = 'flex';
  }
  startMazeMinigame();
});

document.querySelectorAll('.maze-arrow-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    if (!mazePlaying) return;
    let dir = this.dataset.dir;
    let e = { key: '' };
    if (dir === 'up') e.key = "ArrowUp";
    else if (dir === 'down') e.key = "ArrowDown";
    else if (dir === 'left') e.key = "ArrowLeft";
    else if (dir === 'right') e.key = "ArrowRight";
    handleMazeMove(e);
  });
});

document.getElementById('btn-minigame-cancel').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
});



// ========== FUNZIONI PRINCIPALI (NON TOCCARE QUESTE PARTI SE NON NECESSARIO) ==========

// Mostra/hide
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showOnly(id) {
  ['login-container', 'egg-selection', 'game'].forEach(section => {
    if (section === id) show(section); else hide(section);
  });
}

// Aggiorna le barre
function updateBars(hunger, fun, clean, level, exp) {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
  if (typeof level !== "undefined" && typeof exp !== "undefined") {
    document.getElementById('level-label').textContent = "Livello " + level;
    const expMax = expForNextLevel(level);
    const perc = Math.min(100, Math.round((exp / expMax) * 100));
    document.getElementById('exp-bar').style.width = `${perc}%`;
  }
}

function expForNextLevel(level) {
  return Math.round(100 * Math.pow(1.2, level - 1));
}

async function getStateFromDb() {
  if (!petId) return;
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  if (state) {
    let level = (typeof state.level === 'number' && !isNaN(state.level)) ? state.level : 1;
    let exp   = (typeof state.exp === 'number' && !isNaN(state.exp)) ? state.exp : 0;
    updateBars(state.hunger, state.fun, state.clean, level, exp);
    if (state.hunger === 0 || state.fun === 0 || state.clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      clearInterval(autoRefresh);
    }
  }
}

function startAutoRefresh() {
  if (autoRefresh) clearInterval(autoRefresh);
  autoRefresh = setInterval(getStateFromDb, 2000);
}

async function initFlow() {
  const { data: sessionData } = await supabaseClient.auth.getUser();
  user = sessionData.user;
  if (!user) {
    showOnly('login-container');
    return;
  }
  const { data: pet } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pet) {
    showOnly('egg-selection');
    return;
  }
  petId = pet.id;
  eggType = pet.egg_type;
  showOnly('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  await getStateFromDb();
  startAutoRefresh();
}

// ---- EXP + LEVELUP
async function addExpAndMaybeLevelUp(state, inc = 0) {
  let level = (typeof state.level === 'number' && !isNaN(state.level)) ? state.level : 1;
  let exp   = (typeof state.exp === 'number' && !isNaN(state.exp)) ? state.exp : 0;
  let leveledUp = false;
  exp += inc;
  let expNext = expForNextLevel(level);

  while (exp >= expNext) {
    exp -= expNext;
    level++;
    leveledUp = true;
    expNext = expForNextLevel(level);
  }
  await supabaseClient.from('pet_states').update({
    level, exp, updated_at: new Date()
  }).eq('pet_id', petId);

  // Aggiorna UI
  const { data: updatedState } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  let l = (typeof updatedState.level === 'number' && !isNaN(updatedState.level)) ? updatedState.level : 1;
  let e = (typeof updatedState.exp === 'number' && !isNaN(updatedState.exp)) ? updatedState.exp : 0;
  updateBars(updatedState.hunger, updatedState.fun, updatedState.clean, l, e);

  if (leveledUp) showLevelUpMessage();
}

// ---- MESSAGGIO LEVEL UP
function showLevelUpMessage() {
  const msg = document.createElement('div');
  msg.className = "levelup-msg";
  msg.innerHTML = "🎉 <b>Complimenti!</b> Il tuo pet è salito di livello!";
  document.querySelector(".form-box").appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}

// ---- BOTTONI GAME ----
['feed', 'play', 'clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    const { data: state } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean, level, exp')
      .eq('pet_id', petId)
      .single();
    if (!state) return;

    let hunger = state.hunger, fun = state.fun, clean = state.clean;
    let expInc = 0;

    if (action === 'feed') {
      if (hunger < 98) {
        hunger = Math.min(100, hunger + 20);
        expInc = 15;
      } else {
        hunger = Math.min(100, hunger + 20);
      }
    }
    if (action === 'play') {
      if (fun < 98) {
        fun = Math.min(100, fun + 20);
      } else {
        fun = Math.min(100, fun + 20);
      }
      // niente exp per play (escluso minigioco)
    }
    if (action === 'clean') {
      if (clean < 98) {
        clean = Math.min(100, clean + 20);
        expInc = 15;
      } else {
        clean = Math.min(100, clean + 20);
      }
    }
    await supabaseClient.from('pet_states').update({
      hunger, fun, clean, updated_at: new Date()
    }).eq('pet_id', petId);

    if (expInc > 0) {
      await addExpAndMaybeLevelUp(state, expInc);
      showExpGainLabel(expInc);
    } else {
      const { data: updatedState } = await supabaseClient
        .from('pet_states')
        .select('hunger, fun, clean, level, exp')
        .eq('pet_id', petId)
        .single();
      let l = (typeof updatedState.level === 'number' && !isNaN(updatedState.level)) ? updatedState.level : 1;
      let e = (typeof updatedState.exp === 'number' && !isNaN(updatedState.exp)) ? updatedState.exp : 0;
      updateBars(updatedState.hunger, updatedState.fun, updatedState.clean, l, e);
    }
  });
});

// --- SELEZIONE UOVO ---
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
    document.getElementById('confirm-egg-btn').disabled = false;
  })
);

document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  const { data: sessionData } = await supabaseClient.auth.getUser();
  user = sessionData.user;
  if (!eggType || !user || !user.id) {
    alert("Utente non autenticato!");
    return;
  }
  const { data, error } = await supabaseClient
    .from('pets')
    .insert({ user_id: user.id, egg_type: eggType })
    .select('id')
    .single();
  if (error) {
    alert('Errore creazione pet: ' + error.message);
    return;
  }
  petId = data.id;
  showOnly('game');
  await supabaseClient.from('pet_states').insert({
    pet_id: petId, hunger: 100, fun: 100, clean: 100, level: 1, exp: 0, updated_at: new Date()
  });
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  await getStateFromDb();
  startAutoRefresh();
});

// --- LOGOUT ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showOnly('login-container');
  });
}

// --- LOGIN/SIGNUP ---
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: sessionData } = await supabaseClient.auth.getUser();
    user = sessionData.user;
    showOnly('egg-selection');
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    const { data: sessionData } = await supabaseClient.auth.getUser();
    user = sessionData.user;
    showOnly('egg-selection');
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// --- AUTO LOGIN SE GIA' LOGGATO ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    showOnly('login-container');
  }
});

// --- SCEGLI NUOVO UOVO / LOGOUT PERSONALIZZATO ---
document.getElementById('choose-egg-btn').addEventListener('click', () => {
  petId = null;
  eggType = null;
  alive = true;
  showOnly('egg-selection');
  document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
  document.getElementById('confirm-egg-btn').disabled = true;
});
document.getElementById('exit-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showOnly('login-container');
});


