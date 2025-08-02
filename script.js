const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

// Utility
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function updateBars(hunger, fun, clean) {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
}

// Aggiorna stato dal DB
async function getStateFromDb() {
  if (!petId) return;
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean')
    .eq('pet_id', petId)
    .single();
  if (state) {
    updateBars(state.hunger, state.fun, state.clean);
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
  hide('login-container');
  // CERCA IL PET DELL'UTENTE
  const { data: pets, error } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .limit(1); // solo il primo per ora

  if (!pets || pets.length === 0) {
    show('egg-selection');
    hide('game');
    return;
  }
  const pet = pets[0];
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  await getStateFromDb();
  startAutoRefresh();
}

// --- BOTTONI GAME ---
['feed', 'play', 'clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    const { data: state } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean')
      .eq('pet_id', petId)
      .single();
    if (!state) return;
    let hunger = state.hunger, fun = state.fun, clean = state.clean;
    if (action === 'feed') hunger = Math.min(100, hunger + 20);
    if (action === 'play') fun = Math.min(100, fun + 20);
    if (action === 'clean') clean = Math.min(100, clean + 20);

    await supabaseClient.from('pet_states').update({
      hunger, fun, clean, updated_at: new Date()
    }).eq('pet_id', petId);

    updateBars(hunger, fun, clean);
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
  if (!eggType || !user) return;
  // Inserisci il nuovo pet
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
  hide('egg-selection');
  await supabaseClient.from('pet_states').insert({
    pet_id: petId, hunger: 100, fun: 100, clean: 100, updated_at: new Date()
  });
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  show('game');
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  updateBars(100, 100, 100);
  startAutoRefresh();
});

// --- LOGOUT ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
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
    user = data.user;
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
    user = data.user;
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  if (!eggType || !user || !user.id) {
    alert("Utente non autenticato!");
    return;
  }
  console.log("Tento insert pet con user_id:", user.id, "eggType:", eggType);
  
  // Fai una query per vedere se l'user_id esiste in auth.users!
  const { data: users, error: userError } = await supabaseClient
    .from('users')
    .select('id')
    .eq('id', user.id);

  if (!users || users.length === 0) {
    alert("User_id non trovato in auth.users! (NON dovresti mai vedere questo messaggio)");
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
  hide('egg-selection');
  await supabaseClient.from('pet_states').insert({
    pet_id: petId, hunger: 100, fun: 100, clean: 100, updated_at: new Date()
  });
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  show('game');
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  updateBars(100, 100, 100);
  startAutoRefresh();
});


// --- AUTO LOGIN SE GIA' LOGGATO ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    show('login-container');
    hide('egg-selection');
    hide('game');
  }
});
