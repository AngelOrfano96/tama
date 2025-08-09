const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

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
document.getElementById('play-btn')?.addEventListener('click', () => {
  document.getElementById('minigame-select-modal')?.classList.remove('hidden');
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

document.addEventListener('gesturestart', function (e) {
  e.preventDefault();
});
document.addEventListener('dblclick', function (e) {
  e.preventDefault();
});


