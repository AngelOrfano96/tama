const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;


// === COSTANTI LABIRINTO ===
const MAZE_WIDTH = 10, MAZE_HEIGHT = 8, TILE_SIZE = 32;
const MAZE_PET_SIZE = 26, MAZE_GOBLIN_SIZE = 26;

// Immagini
let mazePetImg = new Image();
let mazeKeyImg = new Image();
let mazeExitImg = new Image();
let mazeGoblinImg = new Image();
mazePetImg.src = document.getElementById('pet').src; // aggiorneremo in start
mazeKeyImg.src = "assets/icons/key.png"; // cambia path se necessario
mazeExitImg.src = "assets/icons/door.png";
mazeGoblinImg.src = "assets/enemies/goblin.png";

// Stato
let mazeMatrix, mazePet, mazeKey, mazeExit, mazeGoblin, mazeScore, mazeTimer, mazeInterval, mazeBonusTimer;
let mazeTimeLeft = 30;
let mazePlaying = false;
let mazeCanvas, mazeCtx;
let mazeCanMove = true;

let mazeWallImg = new Image();
let mazeBgImg = new Image();
mazeWallImg.src = "assets/tiles/wall.png";         // Es: 32x32px, muro
mazeBgImg.src = "assets/backgrounds/dungeon2.png";  // Es: 320x256px, oppure tile repeat 32x32



// === AVVIO MINIGIOCO ===

// === GENERA LABIRINTO SEMPLICE (muri random + corridoio) ===
function generateMazeMatrix() {
  let maze, tries = 0;
  do {
    maze = [];
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      let row = [];
      for (let x = 0; x < MAZE_WIDTH; x++) {
        if (x === 0 || y === 0 || x === MAZE_WIDTH-1 || y === MAZE_HEIGHT-1) row.push(1); // bordo
        else row.push(Math.random() < 0.16 ? 1 : 0); // muro random
      }
      maze.push(row);
    }
    maze[1][1] = 0; // inizio
    maze[MAZE_HEIGHT-2][MAZE_WIDTH-2] = 0; // uscita
    tries++;
    // ripeti finché non esiste un percorso
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
  // Setta immagini attuali
  mazePetImg.src = document.getElementById('pet').src;
  // Reset stato
  mazeMatrix = generateMazeMatrix();
  mazeScore = 0;
  mazeTimeLeft = 30;
  mazePlaying = true;
  mazeCanMove = true;
  mazeCanvas = document.getElementById('maze-canvas');
  mazeCtx = mazeCanvas.getContext('2d');
  document.getElementById('maze-minigame-modal').classList.remove('hidden');
  document.getElementById('maze-bonus-label').style.display = "none";
  document.getElementById('maze-minigame-score').textContent = mazeScore;
  document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;

  // Trova inizio/uscita/chiave/goblin
  mazePet = { x: 1, y: 1 };
  mazeExit = { x: MAZE_WIDTH-2, y: MAZE_HEIGHT-2 };
  mazeKey = randomEmptyCell();
  mazeGoblin = randomEmptyCell();

  drawMaze();

  window.addEventListener('keydown', handleMazeMove);

  // Timer countdown
  mazeInterval = setInterval(() => {
    if (!mazePlaying) return;
    mazeTimeLeft--;
    document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;
    if (mazeTimeLeft <= 0) {
      endMazeMinigame(false); // non vinto
    }
    drawMaze();
  }, 1000);
}



// Funzione per verificare se esiste un percorso tra (sx,sy) e (dx,dy)
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


// === DISEGNA ===
function drawMaze() {
  // Sfondo (se hai una tile 32x32, riempi a ripetizione, se hai 1 sola immagine la usi come bg grande)
  if (mazeBgImg.complete) {
    // Tile lo sfondo con l'immagine se è piccola, oppure una sola draw se l'immagine è grande
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      for (let x = 0; x < MAZE_WIDTH; x++) {
        mazeCtx.drawImage(mazeBgImg, x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  } else {
    mazeCtx.fillStyle = "#17181a";
    mazeCtx.fillRect(0,0,MAZE_WIDTH*TILE_SIZE,MAZE_HEIGHT*TILE_SIZE);
  }

  // Celle (muri)
  for (let y = 0; y < MAZE_HEIGHT; y++) {
    for (let x = 0; x < MAZE_WIDTH; x++) {
      if (mazeMatrix[y][x] === 1) {
        // Usa la texture muro
        if (mazeWallImg.complete) {
          mazeCtx.drawImage(mazeWallImg, x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          mazeCtx.fillStyle = "#444";
          mazeCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }
  // Chiave
  mazeCtx.globalAlpha = 1;
  if (mazeKey) mazeCtx.drawImage(mazeKeyImg, mazeKey.x*TILE_SIZE+4, mazeKey.y*TILE_SIZE+4, 24, 24);
  // Uscita
  mazeCtx.drawImage(mazeExitImg, mazeExit.x*TILE_SIZE+4, mazeExit.y*TILE_SIZE+4, 24, 24);
  // Goblin
  if (mazeGoblin) mazeCtx.drawImage(mazeGoblinImg, mazeGoblin.x*TILE_SIZE+3, mazeGoblin.y*TILE_SIZE+3, 26, 26);
  // Pet
  mazeCtx.drawImage(mazePetImg, mazePet.x*TILE_SIZE+3, mazePet.y*TILE_SIZE+3, MAZE_PET_SIZE, MAZE_PET_SIZE);

  // Bonus anim
  if (!mazePlaying) {
    mazeCtx.font = "bold 22px Segoe UI";
    mazeCtx.fillStyle = "#e67e22";
    mazeCtx.textAlign = "center";
    mazeCtx.fillText("Premi ESC o 'Esci' per tornare", (MAZE_WIDTH*TILE_SIZE)/2, (MAZE_HEIGHT*TILE_SIZE)/2 + 20);
  }
}




// === GESTIONE TASTI ===
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

  if (mazeMatrix[ny][nx] === 1) {
    // Tocca muro: perdi 3s!
    mazeTimeLeft = Math.max(1, mazeTimeLeft - 3);
    showMazeBonus("-3s!", "#e74c3c");
  } else {
    mazePet.x = nx; mazePet.y = ny;
    // Prendi chiave
    if (mazeKey && nx === mazeKey.x && ny === mazeKey.y) {
      mazeKey = null;
      mazeScore += 20;
      mazeTimeLeft = Math.min(60, mazeTimeLeft + 5);
      showMazeBonus("+20pt +5s!", "#27ae60");
    }
    // Muovi il goblin verso il pet (con alternativa!)
    if (mazeGoblin) moveGoblinTowardsPet();

    // Collisione goblin
    if (mazeGoblin && mazePet.x === mazeGoblin.x && mazePet.y === mazeGoblin.y) {
      mazeTimeLeft = Math.max(1, mazeTimeLeft - 6);
      mazeScore = Math.max(0, mazeScore - 10);
      mazeGoblin = randomEmptyCell();
      showMazeBonus("-10pt -6s!", "#f1c40f");
    }

    // Esci!
    if (nx === mazeExit.x && ny === mazeExit.y) {
      endMazeMinigame(true);
      return;
    }
  }
  drawMaze();
  document.getElementById('maze-minigame-score').textContent = mazeScore;
  document.getElementById('maze-minigame-timer').textContent = mazeTimeLeft;
}

function moveGoblinTowardsPet() {
  // Calcola differenze
  const dx = mazePet.x - mazeGoblin.x;
  const dy = mazePet.y - mazeGoblin.y;

  // Crea lista delle possibili mosse (X, Y)
  let moves = [];
  if (dx !== 0) moves.push({ x: mazeGoblin.x + Math.sign(dx), y: mazeGoblin.y });
  if (dy !== 0) moves.push({ x: mazeGoblin.x, y: mazeGoblin.y + Math.sign(dy) });

  // Mescola per scegliere a caso la priorità (X o Y)
  if (moves.length === 2) moves.sort(() => Math.random() - 0.5);

  // Prova le mosse nell’ordine deciso
  for (let move of moves) {
    if (mazeMatrix[move.y][move.x] === 0 &&
        !(move.x === mazePet.x && move.y === mazePet.y)) {
      mazeGoblin.x = move.x;
      mazeGoblin.y = move.y;
      return;
    }
  }
  // Se non può muoversi, resta fermo
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

// === FINE MINIGIOCO ===
function endMazeMinigame(vittoria) {
  mazePlaying = false;
  window.removeEventListener('keydown', handleMazeMove);
  if (mazeInterval) clearInterval(mazeInterval);

  // Chiudi il modale dopo 1s e assegna punti
  setTimeout(() => {
    document.getElementById('maze-minigame-modal').classList.add('hidden');
    document.getElementById('maze-touch-controls').style.display = 'none';
    if (vittoria) {
      let fun = 60 + mazeScore;
      let exp = Math.round(mazeScore * 1.25) + 30;
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    } else {
      // Consolazione minima
      let fun = 15 + Math.round(mazeScore * 0.6);
      let exp = Math.round(mazeScore * 0.5);
      updateFunAndExpFromMiniGame(fun, exp);
      showExpGainLabel(exp);
    }
  }, 1000);
}

// === ESCI BUTTON ===
document.getElementById('maze-exit-btn').addEventListener('click', () => {
  endMazeMinigame(false);
  document.getElementById('maze-minigame-modal').classList.add('hidden');
});



// ----- MINI GIOCO PRENDIMI-----
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
let totalTime = 20; // globale per accedere in drawAll

minigameGoblinImg.src = "assets/enemies/goblin.png";
minigameDungeonImg.src = "assets/backgrounds/dungeon.png";

function startMiniGame() {
  minigameActive = false;
  minigameScore = 0;
  totalTime = 20; // reset
  let countdown = 5;
  let petX = 180, petY = 180;

  minigamePetImg.src = document.getElementById('pet').src;
  const canvas = document.getElementById('minigame-canvas');
  const ctx = canvas.getContext('2d');
  const timerLabel = document.getElementById('minigame-timer');
  const titleLabel = document.getElementById('minigame-title');

  // --- DISEGNA TUTTO ---
  function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minigameDungeonImg.complete) ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);

    // Score & Timer centrati in alto
    ctx.font = "bold 19px Segoe UI";
    ctx.fillStyle = "#fffc34ff";
    ctx.textAlign = "center";
    ctx.fillText("Punteggio: " + minigameScore, canvas.width / 2, 32);
    if (minigameActive) {
      ctx.font = "bold 17px Segoe UI";
      ctx.fillStyle = "#ff7349ff";
      ctx.fillText("Tempo: " + totalTime + "s", canvas.width / 2, 55);
    }

    // Messaggio bonus tempo centrato sopra
    if (bonusTimeActive) {
      ctx.font = "bold 24px Segoe UI";
      ctx.fillStyle = "#e67e22";
      ctx.textAlign = "center";
      ctx.fillText("+5s Tempo Bonus!", canvas.width / 2, 85);
    }

    // Pet/goblin
    ctx.textAlign = "left";
    if (isGoblin) {
      if (minigameGoblinImg.complete) ctx.drawImage(minigameGoblinImg, petX, petY, 56, 56);
    } else {
      if (minigamePetImg.complete) ctx.drawImage(minigamePetImg, petX, petY, 56, 56);
    }
  }

  // ----- COUNTDOWN -----
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

  // ---- PARTE LA PARTITA ----
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
        if (isGoblin) return; // il goblin non si muove
        minigameMove();
      }
    }, 1000);
  }

  // ---- PET o GOBLIN LOGICA ----
  function minigameMove() {
    minigameCanClick = true;
    isGoblin = Math.random() < 0.22;
    petX = 32 + Math.random() * (canvas.width - 84);
    petY = 58 + Math.random() * (canvas.height - 110);
    drawAll();

    if (isGoblin) {
      goblinTimeout = setTimeout(() => {
        if (isGoblin && minigameActive) {
          isGoblin = false;
          minigameCanClick = false;
          setTimeout(() => {
            minigameMove();
          }, 300); // leggera attesa per evitare flicker rapido
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
    const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
    if (
      clickX >= petX && clickX <= petX + 56 &&
      clickY >= petY && clickY <= petY + 56
    ) {
      if (isGoblin) {
        minigameScore = Math.max(0, minigameScore - 2);
        isGoblin = false;
      } else {
        minigameScore++;
        // BONUS TIME: 20% chance
        if (Math.random() < 0.2) {
          totalTime += 5;
          bonusTimeActive = true;
          if (bonusTimeTextTimer) clearTimeout(bonusTimeTextTimer);
          drawAll(); // aggiorna subito!
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

// ---- FINE MINIGIOCO ----
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

// ---- ANIM LABEL EXP
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

// Tasto "Prendimi!" (il tuo minigioco attuale)
document.getElementById('btn-minigame-catch').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('minigame-modal').classList.remove('hidden');
  startMiniGame();
});

// Tasto "Fuga dal Dungeon"
document.getElementById('btn-minigame-maze').addEventListener('click', () => {
  document.getElementById('minigame-select-modal').classList.add('hidden');
  document.getElementById('maze-minigame-modal').classList.remove('hidden');
  // Mostra i controlli touch su mobile
if (window.innerWidth < 800) {
  document.getElementById('maze-touch-controls').style.display = 'flex';
}
  startMazeMinigame();
});

// Gestione tasti touch per il labirinto
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


// Tasto Annulla
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


