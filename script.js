// script.js (aggiornato: fetch iniziale e salvataggi periodici dopo 5s)

// Inizializza Supabase
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Stato globale
let user = null;
let petId = null;
let eggType = null;
let hunger = 100, fun = 100, clean = 100;
let alive = true;
// Decadimento per secondo
const decayRatesPerSecond = { hunger: 0.005, fun: 0.003, clean: 0.002 };

// Utils mostra/nascondi
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// --- Autenticazione ---
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// --- Login/Signup ---
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    user = await signIn(email, password);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    user = await signUp(email, password);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// --- Flusso iniziale ---
async function initFlow() {
  hide('login-container');
  // Ottieni pet
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets').select('*').eq('user_id', user.id).single();
  if (petErr && petErr.code !== 'PGRST116') return console.error(petErr);
  if (!pet) { show('egg-selection'); return; }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');
  // Carica stato dal DB
  const { data: state } = await supabaseClient
    .from('pet_states').select('hunger, fun, clean, updated_at').eq('pet_id', petId).single();
  if (state) {
    hunger = state.hunger;
    fun = state.fun;
    clean = state.clean;
    // calcola degrad offline per visuale
    const diffSec = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, hunger - decayRatesPerSecond.hunger * diffSec);
    fun = Math.max(0, fun - decayRatesPerSecond.fun * diffSec);
    clean = Math.max(0, clean - decayRatesPerSecond.clean * diffSec);
    startGame();
  } else {
    startHatchSequence(eggType);
  }
}

// --- Selezione uovo ---
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
    document.getElementById('confirm-egg-btn').disabled = false;
  })
);
document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  const { data, error } = await supabaseClient
    .from('pets').insert({ user_id: user.id, egg_type: eggType }).select('id').single();
  if (error) return console.error(error);
  petId = data.id;
  hide('egg-selection');
  startHatchSequence(eggType);
});

// --- Schiusa ---
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  const cd = document.getElementById('countdown');
  cd.textContent = count;
  const iv = setInterval(() => {
    if (--count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      saveState();
      startGame();
    } else cd.textContent = count;
  }, 1000);
}

// --- Avvia gioco ---
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  // inizia salvataggi periodici dopo 5s
  setTimeout(() => setInterval(saveState, 5000), 5000);
}

// --- Aggiorna barre ---
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width    = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width  = `${Math.round(clean)}%`;
}

// --- Tick locale ---
setInterval(() => {
  if (!alive) return;
  hunger = Math.max(0, hunger - decayRatesPerSecond.hunger);
  fun = Math.max(0, fun - decayRatesPerSecond.fun);
  clean = Math.max(0, clean - decayRatesPerSecond.clean);
  updateBars();
}, 1000);

// --- Salvataggio stato ---
async function saveState() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger: Math.round(hunger), fun: Math.round(fun), clean: Math.round(clean), updated_at: new Date() });
  if (error) console.error('Save error:', error);
}

// --- Interazioni utente (persistenza immediata) ---
['feed','play','clean'].forEach(act => {
  document.getElementById(`${act}-btn`).addEventListener('click', () => {
    if (!alive) return;
    if (act === 'feed') hunger = Math.min(100, hunger + 20);
    if (act === 'play') fun = Math.min(100, fun + 20);
    if (act === 'clean') clean = Math.min(100, clean + 20);
    updateBars();
    saveState();
  });
});

// --- Auto-login ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) { user = currentUser; initFlow(); }
  else show('login-container');
});
