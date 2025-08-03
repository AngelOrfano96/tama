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
let minigameGoblinImg = new Image();
let minigameDungeonImg = new Image();
let isGoblin = false; // true se sta mostrando un goblin
let goblinTimeout = null;

minigameGoblinImg.src = "assets/enemies/goblin.png"; // aggiorna se usi un path diverso
minigameDungeonImg.src = "assets/backgrounds/dungeon.png"; // aggiorna se usi un path diverso

function startMiniGame() {
  minigameActive = false;
  minigameScore = 0;
  let totalTime = 20; // secondi
  let countdown = 5;
  let petX = 150, petY = 150;

  // Carica il pet scelto
  minigamePetImg.src = document.getElementById('pet').src;

  // Elementi UI
  const canvas = document.getElementById('minigame-canvas');
  const ctx = canvas.getContext('2d');
  const timerLabel = document.getElementById('minigame-timer');
  const titleLabel = document.getElementById('minigame-title');
  titleLabel.textContent = "";
  timerLabel.textContent = "";

  // Disegna lo sfondo, pet/goblin, punteggio
  function drawAll() {
    // Sfondo dungeon
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minigameDungeonImg.complete) ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);

    // Pet/goblin
    if (isGoblin) {
      if (minigameGoblinImg.complete) ctx.drawImage(minigameGoblinImg, petX, petY, 50, 50);
    } else {
      if (minigamePetImg.complete) ctx.drawImage(minigamePetImg, petX, petY, 50, 50);
    }
    // Scritte sopra
    ctx.font = "bold 18px Segoe UI";
    ctx.fillStyle = "#111";
    ctx.fillText("Punteggio: " + minigameScore, 15, 32);
    if (minigameActive) {
      ctx.fillText("Tempo: " + totalTime + "s", 220, 32);
    }
  }

  // 5 secondi di countdown all’inizio
  minigameActive = false;
  isGoblin = false;
  drawAll();
  titleLabel.textContent = "Acchiappa il tuo pet!";
  timerLabel.textContent = "";
  ctx.font = "bold 44px Segoe UI";
  ctx.fillStyle = "#e67e22";
  ctx.fillText("5", 160, 180);

  let currCount = 5;
  minigameCountdown = setInterval(() => {
    currCount--;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minigameDungeonImg.complete) ctx.drawImage(minigameDungeonImg, 0, 0, canvas.width, canvas.height);
    ctx.font = "bold 44px Segoe UI";
    ctx.fillStyle = "#e67e22";
    ctx.fillText(currCount > 0 ? currCount : "VIA!", 135, 180);
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

    // Timer countdown
    minigameTimer = setInterval(() => {
      if (!minigameActive) return;
      totalTime--;
      timerLabel.textContent = "Tempo: " + totalTime + "s";
      drawAll();
      if (totalTime <= 0) {
        clearInterval(minigameTimer);
        minigameActive = false;
        titleLabel.textContent = "";
        timerLabel.textContent = "";
        endMiniGame();
      }
    }, 1000);

    // Prima appari il pet
    nextPetOrGoblin();
  }

  // Goblin logic random
  function nextPetOrGoblin() {
    // Dopo ogni click (o tempo scaduto per il goblin) decidi chi appare
    isGoblin = Math.random() < 0.33; // 33% chance di goblin

    // Nuova posizione random
    petX = Math.random() * (canvas.width - 50);
    petY = Math.random() * (canvas.height - 50);

    drawAll();

    // Se goblin: sparisce da solo dopo 2 secondi
    if (isGoblin) {
      goblinTimeout = setTimeout(() => {
        if (isGoblin && minigameActive) {
          isGoblin = false;
          petX = Math.random() * (canvas.width - 50);
          petY = Math.random() * (canvas.height - 50);
          drawAll();
        }
      }, 2000);
    } else {
      if (goblinTimeout) clearTimeout(goblinTimeout);
    }
  }

  // Gestisci click
  canvas.onclick = function(e) {
    if (!minigameActive) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
    if (
      clickX >= petX && clickX <= petX + 50 &&
      clickY >= petY && clickY <= petY + 50
    ) {
      if (isGoblin) {
        minigameScore = Math.max(0, minigameScore - 3); // Perdi punti se tocchi goblin
        isGoblin = false;
      } else {
        minigameScore++;
      }
      nextPetOrGoblin();
      drawAll();
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
  let funPoints = Math.min(100, minigameScore * 5); // 5 punti divertimento per click
  let expPoints = Math.max(0, Math.floor(minigameScore * 2.5));  // exp per click (non negativa)
  updateFunAndExpFromMiniGame(funPoints, expPoints);
  stopMiniGame();
}

async function updateFunAndExpFromMiniGame(funPoints, expPoints) {
  // Prendi stato attuale
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  if (!state) return;

  // Aggiorna divertimento e exp
  const newFun = Math.min(100, state.fun + funPoints);
  await supabaseClient.from('pet_states').update({
    fun: newFun,
    updated_at: new Date()
  }).eq('pet_id', petId);

  await addExpAndMaybeLevelUp(state, expPoints);

  showExpGainLabel(expPoints);
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





