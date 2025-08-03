const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

let minigameActive = false;
let minigameScore = 0;
let minigameTimer = null;
let minigameCountdown = null;
let minigamePetImg = new Image();
let isGoblin = false; // true se sta mostrando un goblin
let goblinTimeout = null;

// IMMAGINI minigioco
const minigameDungeonImg = new Image();
minigameDungeonImg.src = "assets/backgrounds/dungeon.png";
const minigameGoblinImg = new Image();
minigameGoblinImg.src = "assets/enemies/goblin.png";

// Quando apri il minigioco (da play-btn)
window.startMiniGame = function() {
  const modal = document.getElementById('minigame-modal');
  const canvas = document.getElementById('minigame-canvas');
  const ctx = canvas.getContext('2d');
  const title = document.getElementById('minigame-title');
  const timerLabel = document.getElementById('minigame-timer');
  let timeLeft = 15;      // durata del minigioco in secondi
  let countdown = 5;      // conto alla rovescia iniziale
  let score = 0;
  let gameInterval, countdownInterval, petAppearTimeout, goblinTimeout;
  let playing = false;
  let currentObj = "pet"; // "pet" oppure "goblin"
  let petX = 100, petY = 100;
  let goblinX = 100, goblinY = 100;
  let canClick = false;

  // Pet scelto
  let petImg = new Image();
  petImg.src = `assets/pets/pet_${eggType}.png`;

  function drawBg() {
    if (minigameDungeonImg.complete) {
      ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawPet() {
    ctx.save();
    ctx.shadowColor = "#ff0";
    ctx.shadowBlur = 16;
    ctx.drawImage(petImg, petX, petY, 64, 64);
    ctx.restore();
  }

  function drawGoblin() {
    ctx.save();
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = 14;
    ctx.drawImage(minigameGoblinImg, goblinX, goblinY, 56, 56);
    ctx.restore();
  }

  function drawHUD() {
    ctx.font = "bold 1.15em Segoe UI, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText("Punti: " + score, 16, 32);
    ctx.textAlign = "right";
    ctx.fillText("Tempo: " + timeLeft + "s", canvas.width - 16, 32);
  }

  function placeRandomPet() {
    petX = 20 + Math.random() * (canvas.width - 84);
    petY = 60 + Math.random() * (canvas.height - 84);
  }

  function placeRandomGoblin() {
    goblinX = 20 + Math.random() * (canvas.width - 76);
    goblinY = 60 + Math.random() * (canvas.height - 76);
  }

  function showPetOrGoblin() {
    // 20% probabilità di goblin
    if (Math.random() < 0.20) {
      currentObj = "goblin";
      placeRandomGoblin();
      canClick = true;
      // Il goblin sparisce dopo 2 secondi, poi torna il pet
      goblinTimeout = setTimeout(() => {
        canClick = false;
        currentObj = "pet";
        placeRandomPet();
        drawFrame();
      }, 2000);
    } else {
      currentObj = "pet";
      placeRandomPet();
      canClick = true;
    }
  }

  function drawFrame() {
    drawBg();
    if (currentObj === "pet") drawPet();
    else if (currentObj === "goblin") drawGoblin();
    drawHUD();
  }

  function startGame() {
    score = 0;
    timeLeft = 15;
    canClick = true;
    title.textContent = "Acchiappa il tuo pet!";
    timerLabel.textContent = timeLeft + "s";
    showPetOrGoblin();
    drawFrame();

    gameInterval = setInterval(() => {
      timeLeft--;
      timerLabel.textContent = timeLeft + "s";
      if (timeLeft <= 0) {
        endGame();
      } else {
        // Cambia posizione pet/goblin ogni secondo
        if (currentObj === "pet") {
          placeRandomPet();
        } else if (currentObj === "goblin") {
          // Il goblin ha già un timeout per sparire, non lo muoviamo
        }
        drawFrame();
      }
    }, 1000);
    playing = true;
  }

  function endGame() {
    playing = false;
    clearInterval(gameInterval);
    clearTimeout(goblinTimeout);
    canClick = false;
    title.textContent = "FINE!";
    timerLabel.textContent = "";
    // Calcola ricompense
    let baseFun = Math.min(100, score * 6);   // Es: ogni click pet +6%
    let expGained = Math.max(0, Math.round(score * 3));
    ctx.save();
    ctx.fillStyle = "#ff0";
    ctx.font = "bold 1.2em Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+${baseFun}% Divertimento  +${expGained} Exp`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.restore();
    // Aggiorna DB e barra principale:
    updateGameFromMiniGame(baseFun, expGained);
    // Chiudi modale dopo 2 secondi
    setTimeout(() => {
      document.getElementById('minigame-modal').classList.add('hidden');
    }, 2000);
  }

  canvas.onclick = function(e) {
    if (!playing || !canClick) return;
    // Coordinate click relative al canvas
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (currentObj === "pet") {
      if (
        mx >= petX && mx <= petX + 64 &&
        my >= petY && my <= petY + 64
      ) {
        score++;
        canClick = false;
        // Nuovo pet o goblin dopo breve delay
        setTimeout(() => {
          showPetOrGoblin();
          drawFrame();
        }, 260);
      }
    } else if (currentObj === "goblin") {
      if (
        mx >= goblinX && mx <= goblinX + 56 &&
        my >= goblinY && my <= goblinY + 56
      ) {
        score = Math.max(0, score - 2); // Penalità
        canClick = false;
        // Scompare goblin subito, poi torna pet
        currentObj = "pet";
        placeRandomPet();
        drawFrame();
      }
    }
    drawFrame();
  };

  // --- Countdown iniziale ---
  let count = countdown;
  title.textContent = "Acchiappa il tuo pet!";
  timerLabel.textContent = "";
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBg();
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 2.6em Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Inizio in...", canvas.width/2, canvas.height/2-28);
  ctx.fillStyle = "#e67e22";
  ctx.font = "bold 4.2em Segoe UI, sans-serif";
  ctx.fillText(count, canvas.width/2, canvas.height/2+40);
  ctx.restore();
  canClick = false;

  countdownInterval = setInterval(() => {
    count--;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBg();
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 2.6em Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Inizio in...", canvas.width/2, canvas.height/2-28);
    ctx.fillStyle = "#e67e22";
    ctx.font = "bold 4.2em Segoe UI, sans-serif";
    ctx.fillText(count, canvas.width/2, canvas.height/2+40);
    ctx.restore();
    if (count === 0) {
      clearInterval(countdownInterval);
      startGame();
    }
  }, 1000);

  // Chiudi con bottone
  document.getElementById('minigame-exit-btn').onclick = function() {
    stopMiniGame();
    document.getElementById('minigame-modal').classList.add('hidden');
  };

  // Permette chiusura sicura (reset intervalli)
  window.stopMiniGame = function() {
    playing = false;
    clearInterval(gameInterval);
    clearInterval(countdownInterval);
    clearTimeout(goblinTimeout);
    canClick = false;
    // Pulizia canvas se vuoi
    ctx.clearRect(0,0,canvas.width,canvas.height);
  };

  // Funzione da definire nel tuo main script!
  // Deve aggiornare barra del divertimento e exp
  window.updateGameFromMiniGame = async function(funValue, expValue) {
    // Leggi stato attuale
    const { data: state } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean, level, exp')
      .eq('pet_id', petId)
      .single();
    if (!state) return;
    // Aggiorna divertimento e exp
    let fun = Math.min(100, state.fun + funValue);
    let { level, exp } = state;
    exp += expValue;
    // Level up se necessario (uguale alla tua logica)
    let expNext = expForNextLevel(level);
    let leveledUp = false;
    while (exp >= expNext) {
      exp -= expNext;
      level++;
      leveledUp = true;
      expNext = expForNextLevel(level);
    }
    await supabaseClient.from('pet_states').update({
      fun, level, exp, updated_at: new Date()
    }).eq('pet_id', petId);

    // Aggiorna barre UI principali (rileggi db)
    await getStateFromDb();
    if (leveledUp) showLevelUpMessage();
    // Mostra label exp gain
    showExpGainLabel(expValue);
  };
};

// Animazione +X exp label (se vuoi, sennò togli)
function showExpGainLabel(val) {
  const lbl = document.getElementById('exp-gain-label');
  if (!lbl) return;
  lbl.textContent = `+${val}exp`;
  lbl.style.display = "inline";
  lbl.style.opacity = "1";
  lbl.style.transition = "opacity 0.6s";
  setTimeout(() => { lbl.style.opacity = "0"; }, 1200);
  setTimeout(() => { lbl.style.display = "none"; }, 1800);
}


// Mostra exp a destra della barra (già fatto nelle tue migliorie)
function showExpGainLabel(points) {
  const label = document.getElementById('exp-gain-label');
  if (!label) return;
  label.textContent = points > 0 ? `+${points} exp` : '';
  label.style.display = points > 0 ? "inline-block" : "none";
  setTimeout(() => label.style.display = "none", 2500);
}


// Utility
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

// Calcolo exp per prossimo livello
function expForNextLevel(level) {
  return Math.round(100 * Math.pow(1.2, level - 1));
}

// Aggiorna stato dal DB
async function getStateFromDb() {
  if (!petId) return;
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  if (state) {
    // fallback se valori null o undefined
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

// Aggiorna le barre ogni 2s leggendo il DB
function startAutoRefresh() {
  if (autoRefresh) clearInterval(autoRefresh);
  autoRefresh = setInterval(getStateFromDb, 2000);
}

// Flusso principale: login → selezione uovo → gioco
async function initFlow() {
  // Prendi l'utente aggiornato
  const { data: sessionData } = await supabaseClient.auth.getUser();
  user = sessionData.user;
  if (!user) {
    showOnly('login-container');
    return;
  }
  // Carica il primo pet non schiuso (modificabile in futuro)
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

// Funzione exp + level up
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

  // Aggiorna UI con dati reali dal DB dopo update
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

// Mostra messaggio di level up
function showLevelUpMessage() {
  const msg = document.createElement('div');
  msg.className = "levelup-msg";
  msg.innerHTML = "🎉 <b>Complimenti!</b> Il tuo pet è salito di livello!";
  document.querySelector(".form-box").appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}

// --- BOTTONI GAME ---
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
      if (hunger < 98) {   // SOLO se la barra non è quasi piena!
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
      // NIENTE exp per "play"
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
      showExpGainLabel(expInc); // Mostra label exp!
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
  await getStateFromDb(); // Sempre aggiorna dopo DB!
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

function showExpGainLabel(exp) {
  const gainLabel = document.getElementById('exp-gain-label');
  gainLabel.textContent = `+${exp} exp`;
  gainLabel.style.display = 'inline-block';
  gainLabel.style.opacity = "1";
  setTimeout(() => {
    gainLabel.style.opacity = "0";
    setTimeout(() => gainLabel.style.display = "none", 800);
  }, 1700);
}

document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('minigame-modal').classList.remove('hidden');
  startMiniGame();
});
document.getElementById('minigame-exit-btn').addEventListener('click', () => {
  stopMiniGame();
  document.getElementById('minigame-modal').classList.add('hidden');
});





