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
if (mazeLevel === 1) {
  mazeGoblins.push(randomEmptyCell());
} else {
  // Dal livello 2 in poi: 65% due goblin, 35% uno
  let numGoblins = (Math.random() < 0.65) ? 2 : 1;
  for (let i = 0; i < numGoblins; i++) {
    let cell;
    // Assicura che non spawnino sulla stessa casella
    do {
      cell = randomEmptyCell();
    } while (mazeGoblins.some(gob => gob.x === cell.x && gob.y === cell.y));
    mazeGoblins.push(cell);
  }
}


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