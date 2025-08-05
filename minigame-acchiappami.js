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
  let marginX = 32;
let marginTop = Math.floor(canvas.height * 0.52); // inizio parte centrale
let marginBottom = 24; // più basso: distanza dal bordo inferiore
let minY = marginTop;
let maxY = canvas.height - 56 - marginBottom;

petX = marginX + Math.random() * (canvas.width - 56 - marginX*2);
petY = minY + Math.random() * (maxY - minY);


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
  }, 900);
} else {
  if (petTimeout) clearTimeout(petTimeout);
  petTimeout = setTimeout(() => {
    if (!isGoblin && minigameActive) {
      minigameCanClick = false;
      setTimeout(() => {
        minigameMove();
      }, 400);
    }
  }, 400); // <-- pet resta per 0.5s
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
