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

let lastObstacleTime = 0;
let lastPlatformTime = 0;
const minObstacleDist = 90; // distanza minima px tra ostacoli
const platformSpawnInterval = 1200; // ms
const obstacleSpawnInterval = 900; // ms

let jumperBonuses = []; // array dei bonus attivi
let jumperBonusImg = new Image();
jumperBonusImg.src = "assets/bonus/clock.png"; // metti il tuo asset!


let groundOffset = 0; // AGGIUNGI QUESTA in cima al gioco

let jumperPlatforms = [];
let jumperPlatformImg = new Image();
jumperPlatformImg.src = "assets/tiles/platforms.png"; // Usa il tuo asset!


// Adattivo: dimensioni canvas e tile
function getJumperDimensions() {
  if (window.innerWidth < 600) {
    return { width: 370, height: 230, ground: 178, pet: 54, obstacle: 22 };
  } else {
    return { width: 480, height: 288, ground: 216, pet: 72, obstacle: 25 };
  }
}

// Texture custom: metti i tuoi path!
jumperPetImg.src = document.getElementById('pet').src;
jumperObstacleImg.src = "assets/tiles/obstacle.png";
jumperBgImg.src = "assets/backgrounds/ground.png";
jumperSkyImg.src = "assets/backgrounds/sky.png"; // <-- metti un tuo asset, va bene anche un cielo semplice

const mobileJumpBtn = document.getElementById('jumper-mobile-jump-btn');


function triggerJumpOnce(e) {
  jumperJump();
  // Disabilita il tasto fino al prossimo rilascio per evitare multi-jump
  mobileJumpBtn.disabled = true;
}

function enableJumpBtn() {
  mobileJumpBtn.disabled = false;
}

function setupMobileJumpBtn() {
  // Eventi reattivi: salta subito su pressione!
  mobileJumpBtn.addEventListener('touchstart', triggerJumpOnce);
  mobileJumpBtn.addEventListener('mousedown', triggerJumpOnce);

  // Riabilita il tasto al rilascio (necessario per permettere un nuovo salto)
  mobileJumpBtn.addEventListener('touchend', enableJumpBtn);
  mobileJumpBtn.addEventListener('mouseup', enableJumpBtn);
  mobileJumpBtn.addEventListener('mouseleave', enableJumpBtn); // extra sicurezza
}

// Chiamala una sola volta all’inizio della pagina/script!
setupMobileJumpBtn();

function updateJumpBtnVisibility() {
  if (window.innerWidth < 600 && jumperActive) {
    mobileJumpBtn.style.display = 'block';
    mobileJumpBtn.disabled = false;
  } else {
    mobileJumpBtn.style.display = 'none';
    mobileJumpBtn.disabled = true;
  }
}
window.addEventListener('resize', updateJumpBtnVisibility);

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

  updateJumpBtnVisibility();
  mobileJumpBtn.onclick = jumperJump;

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
  let groundTileW = 48;
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

    // --- OSTACOLI & PIATTAFORME (ALGORITMO AVANZATO) ---
  const now = Date.now();
  if (typeof jumperLastObstacle === 'undefined') jumperLastObstacle = 0;
  if (typeof jumperLastPlatform === 'undefined') jumperLastPlatform = 0;
  const obstacleInterval = 850;
  const platformInterval = 1200;

  // === OSTACOLI: pattern e variazione ===
  if (
    now - jumperLastObstacle > obstacleInterval &&
    (jumperObstacles.length === 0 || jumperObstacles[jumperObstacles.length - 1].x < jumperDims.width - 90)
  ) {
    // Difficoltà in base ai punti
    let diff = Math.min(1, jumperScore / 60); // 0 → 1

    // Random tipologia ostacolo
    let pattern = Math.random();
    let spawnX = jumperDims.width + Math.random() * 40;

    // SINGOLO, DOPPIO, o PICCOLO+GRANDE, o salto ostacolo
    if (pattern < 0.65 - diff * 0.3) {
      // Ostacolo singolo, dimensione random
      let sizeRand = Math.random();
      let obsW = jumperDims.obstacle * (sizeRand > 0.7 ? 1.6 : sizeRand > 0.35 ? 1.15 : 0.95);
      let obsH = obsW;
      jumperObstacles.push({
        x: spawnX,
        y: jumperGroundY - obsH,
        w: obsW,
        h: obsH,
        passed: false
      });
      jumperLastObstacle = now;
    } else if (pattern < 0.92) {
      // Ostacolo doppio (due piccoli ravvicinati, solo se c’è spazio)
      let obsW = jumperDims.obstacle * 0.9;
      let obsH = obsW;
      jumperObstacles.push({
        x: spawnX,
        y: jumperGroundY - obsH,
        w: obsW,
        h: obsH,
        passed: false
      });
      jumperObstacles.push({
        x: spawnX + obsW + 12 + Math.random() * 10,
        y: jumperGroundY - obsH,
        w: obsW,
        h: obsH,
        passed: false
      });
      jumperLastObstacle = now + 150; // delay per non farli spawnare subito dopo
    } else {
      // Speciale: ostacolo + piattaforma (solo se score alto)
      if (jumperScore > 10 && jumperPlatforms.length < 3) {
        let platW = 72 * (jumperDims.width / 320);
        let platH = 18 * (jumperDims.height / 192);
        let platY = jumperGroundY - jumperDims.pet * (1.5 + Math.random() * 0.5);
        let platX = spawnX + jumperDims.obstacle * 1.5 + 8;
        jumperPlatforms.push({
          x: platX,
          y: platY,
          w: platW,
          h: platH
        });
      }
      // Ostacolo singolo "medio"
      let obsW = jumperDims.obstacle * 1.15;
      let obsH = obsW;
      jumperObstacles.push({
        x: spawnX,
        y: jumperGroundY - obsH,
        w: obsW,
        h: obsH,
        passed: false
      });
      jumperLastObstacle = now + 200;
    }
  }

  // Piattaforme (regolate)
  if (
    now - jumperLastPlatform > platformInterval &&
    jumperPlatforms.length < 3
  ) {
    let minY = jumperGroundY - jumperDims.pet * 2.1;
    let maxY = jumperGroundY - jumperDims.pet * 1.1;
    let platY = Math.floor(minY + Math.random() * (maxY - minY));
    let platW = 72 * (jumperDims.width / 320);
    let platH = 18 * (jumperDims.height / 192);
    let platX = jumperDims.width + Math.random()*60;
    let tooClose = jumperPlatforms.some(p => Math.abs(p.x - platX) < 100);
    let obstacleTooClose = jumperObstacles.some(obs => Math.abs(obs.x - platX) < 80);
    if (!tooClose && !obstacleTooClose) {
      jumperPlatforms.push({
        x: platX,
        y: platY,
        w: platW,
        h: platH
      });
      jumperLastPlatform = now;
    }
  }

  // === GENERA BONUS SOLO IN POSIZIONE VALIDA ===
  if (Math.random() < 0.007 && jumperBonuses.length < 1) {
    let bonusW = 32 * (jumperDims.width/320);
    let bonusH = 32 * (jumperDims.height/192);
    let bonusX = jumperDims.width + 16 + Math.random()*60; // sempre subito fuori a destra!
    let placed = false;

    // Prova piattaforma libera (come prima)
    if (Math.random() < 0.45 && jumperPlatforms.length > 0) {
      let possiblePlats = jumperPlatforms.filter(p =>
        p.w > bonusW + 8 &&
        !jumperObstacles.some(obs =>
          obs.x < p.x + p.w && obs.x + obs.w > p.x &&
          Math.abs(obs.y - p.y) < jumperDims.pet
        )
      );
      if (possiblePlats.length > 0) {
        let plat = possiblePlats[Math.floor(Math.random() * possiblePlats.length)];
        bonusX = Math.max(plat.x + plat.w/2 - bonusW/2, jumperDims.width); // MAI a sinistra!
        let bonusY = plat.y - bonusH;
        if (bonusY < 24) bonusY = 24;
        if (!jumperBonuses.some(b => Math.abs(b.x - bonusX) < bonusW + 10)) {
          jumperBonuses.push({
            x: bonusX,
            y: bonusY,
            w: bonusW,
            h: bonusH,
            taken: false
          });
          placed = true;
        }
      }
    }
    // Se non su piattaforma, prova solo a terra (sempre da destra)
    if (!placed) {
      let bonusY = jumperGroundY - bonusH;
      let tooCloseToObstacle = jumperObstacles.some(obs =>
        Math.abs((obs.x + obs.w/2) - (bonusX + bonusW/2)) < bonusW + 8 &&
        Math.abs((obs.y + obs.h) - (jumperGroundY)) < 3
      );
      let tooCloseToPlatform = jumperPlatforms.some(p =>
        bonusX + bonusW > p.x && bonusX < p.x + p.w &&
        Math.abs(bonusY + bonusH - p.y) < 4
      );
      if (!tooCloseToObstacle && !tooCloseToPlatform) {
        jumperBonuses.push({
          x: bonusX,
          y: bonusY,
          w: bonusW,
          h: bonusH,
          taken: false
        });
      }
    }
  }

  // --- MUOVI E DISEGNA BONUS ---
  for (let i = 0; i < jumperBonuses.length; i++) {
    let bon = jumperBonuses[i];
    bon.x -= jumperSpeed + Math.floor(jumperScore/10);

    // Disegna bonus
    if (jumperBonusImg.complete) {
      jumperCtx.drawImage(jumperBonusImg, bon.x, bon.y, bon.w, bon.h);
    } else {
      jumperCtx.fillStyle = "#48e";
      jumperCtx.fillRect(bon.x, bon.y, bon.w, bon.h);
    }

    // Raccogli bonus: hitbox generosa
    if (!bon.taken &&
        16 + jumperDims.pet > bon.x &&
        16 < bon.x + bon.w &&
        jumperPetY - jumperDims.pet/2 < bon.y + bon.h &&
        jumperPetY > bon.y
    ) {
      bon.taken = true;
      jumperTimeLeft = Math.min(jumperTimeLeft + 7, 99);
      document.getElementById('jumper-minigame-timer').textContent = jumperTimeLeft;
      showJumperBonus("+7s!", "#27ae60");
    }
  }
  jumperBonuses = jumperBonuses.filter(bon => bon.x + bon.w > 0 && !bon.taken);

  // --- MUOVI E DISEGNA OSTACOLI ---
  for (let i = 0; i < jumperObstacles.length; i++) {
    let obs = jumperObstacles[i];
    obs.x -= jumperSpeed + Math.floor(jumperScore/10);
    if (jumperObstacleImg.complete) {
      jumperCtx.drawImage(jumperObstacleImg, obs.x, obs.y, obs.w, obs.h);
    } else {
      jumperCtx.fillStyle = "#a33";
      jumperCtx.fillRect(obs.x, obs.y, obs.w, obs.h);
    }
    // --- COLLISIONE CON OSTACOLO: Hitbox "amichevole" ---
    const PET_X = 16;
    const PET_W = jumperDims.pet;
    const PET_Y_TOP = jumperPetY - jumperDims.pet;
    const PET_Y_BOT = jumperPetY;

    // Margini (tolleranza)
    const petPaddingX = PET_W * 0.18;
    const petPaddingY = jumperDims.pet * 0.18;
    const obstaclePaddingX = obs.w * 0.18;
    const obstaclePaddingY = obs.h * 0.10;

    let petHit = {
      left: PET_X + petPaddingX,
      right: PET_X + PET_W - petPaddingX,
      top: PET_Y_TOP + petPaddingY,
      bottom: PET_Y_BOT - petPaddingY
    };
    let obsHit = {
      left: obs.x + obstaclePaddingX,
      right: obs.x + obs.w - obstaclePaddingX,
      top: obs.y + obstaclePaddingY,
      bottom: obs.y + obs.h - obstaclePaddingY
    };

    if (
      !jumperGameOver &&
      petHit.right > obsHit.left &&
      petHit.left < obsHit.right &&
      petHit.bottom > obsHit.top &&
      petHit.top < obsHit.bottom
    ) {
      jumperGameOver = true;
      showJumperBonus("Game Over!", "#e74c3c");
      jumperEndGame();
    }
    if (!obs.passed && obs.x + obs.w < 16) {
      jumperScore++;
      obs.passed = true;
      document.getElementById('jumper-minigame-score').textContent = jumperScore;
      showJumperBonus("+1!", "#f1c40f");
    }
  }
  jumperObstacles = jumperObstacles.filter(obs => obs.x + obs.w > 0);

  // --- MUOVI & DISEGNA PIATTAFORME ---
  for (let i = 0; i < jumperPlatforms.length; i++) {
    let plat = jumperPlatforms[i];
    plat.x -= jumperSpeed + Math.floor(jumperScore/10);
    if (jumperPlatformImg.complete) {
      jumperCtx.drawImage(jumperPlatformImg, plat.x, plat.y, plat.w, plat.h);
    } else {
      jumperCtx.fillStyle = "#8ED6FF";
      jumperCtx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }
  }
  jumperPlatforms = jumperPlatforms.filter(plat => plat.x + plat.w > 0);

  // --- PET PHYSICS ---
  jumperPetY += jumperPetVy;
  jumperPetVy += 0.7 * (jumperDims.pet / 48);

  // COLLISIONE CON PIATTAFORMA: solo atterraggio dall'alto!
  let landedOnPlatform = false;
  for (let plat of jumperPlatforms) {
    let prevFeet = jumperPetY - jumperPetVy; // posizione dei piedi nel frame precedente
    if (
      jumperPetVy >= 0 && // solo se cade
      prevFeet <= plat.y &&
      jumperPetY >= plat.y &&
      16 + jumperDims.pet > plat.x &&
      16 < plat.x + plat.w
    ) {
      jumperPetY = plat.y;
      jumperPetVy = 0;
      jumperIsJumping = false;
      landedOnPlatform = true;
      break;
    }
  }
  // Se non atterra su una piattaforma, controlla il terreno
  if (!landedOnPlatform && jumperPetY >= jumperGroundY) {
    jumperPetY = jumperGroundY;
    jumperPetVy = 0;
    jumperIsJumping = false;
  }

  // --- DISEGNA PET (allinea i piedi) ---
  if (jumperPetImg.complete) {
    jumperCtx.drawImage(
      jumperPetImg,
      16,
      jumperPetY - jumperDims.pet,
      jumperDims.pet,
      jumperDims.pet
    );
  } else {
    jumperCtx.fillStyle = "#fff";
    jumperCtx.fillRect(16, jumperPetY - jumperDims.pet, jumperDims.pet, jumperDims.pet);
  }

  // --- PUNTEGGIO E TIMER ---
  jumperCtx.font = "bold 21px Segoe UI";
  jumperCtx.fillStyle = "#fffc34";
  jumperCtx.textAlign = "left";
  jumperCtx.fillText("Punti: " + jumperScore, 16, 36);

  jumperCtx.font = "bold 17px Segoe UI";
  jumperCtx.fillStyle = "#ff7349";
  jumperCtx.fillText("Tempo: " + jumperTimeLeft + "s", 16, 62);

  // --- SALTO CONSENTITO SOLO SE I PIEDI SONO SUL GROUND O SU UNA PIATTAFORMA ---
  jumperCanJump = (
    jumperPetY === jumperGroundY ||
    jumperPlatforms.some(plat =>
      jumperPetY === plat.y &&
      16 + jumperDims.pet > plat.x && 16 < plat.x + plat.w
    )
  );
}



// --- AGGIUNGI QUESTO GLOBALE ---
let jumperCanJump = false;

// --- E MODIFICA jumperJump IN QUESTO MODO ---
function jumperJump() {
  if (!jumperActive || jumperGameOver) return;
  if (jumperCanJump) {
    jumperPetVy = -10 * (jumperDims.pet / 48);
    jumperIsJumping = true;
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
  mobileJumpBtn.style.display = 'none';
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