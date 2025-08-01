// script.js (with offline degradation and proper resume)

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
const decayRatesPerSecond = {
  hunger: 0.005, // 0.005 units per sec (~1 unit per 200s)
  fun:     0.003, // ~1 unit per 333s
  clean:   0.002  // ~1 unit per 500s
};

// Utils
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// Autenticazione
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
async function seedUserRecord(user) {
  const { error } = await supabaseClient
    .from('users')
    .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
  if (error) console.error('User seed error:', error);
}

// Eventi login/signup
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('password-input').value;
  try {
    user = await signIn(email, password);
    await seedUserRecord(user);
    initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('password-input').value;
  try {
    user = await signUp(email, password);
    await seedUserRecord(user);
    initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// Inizializza flusso
async function initFlow() {
  hide('login-container');
  // Recupera pet esistente
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') { console.error(petErr); return; }
  if (!pet) {
    show('egg-selection');
    return;
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Recupera stato
  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (!stateErr && state) {
    // Calcola degradazione offline
    const last = new Date(state.updated_at).getTime();
    const now = Date.now();
    const diffSec = (now - last) / 1000;
    hunger = Math.max(0, state.hunger - decayRatesPerSecond.hunger * diffSec);
    fun    = Math.max(0, state.fun    - decayRatesPerSecond.fun    * diffSec);
    clean  = Math.max(0, state.clean  - decayRatesPerSecond.clean  * diffSec);
    // Avvia gioco
    startGame();
  } else {
    // Primo accesso: schiusa
    startHatchSequence(eggType);
  }
}

// Selezione uovo
document.querySelectorAll('.egg.selectable').forEach(img => img.addEventListener('click', () => {
  document.querySelectorAll('.egg').forEach(i => i.classList.remove('selected'));
  img.classList.add('selected');
  eggType = +img.dataset.egg;
  document.getElementById('confirm-egg-btn').disabled = false;
}));

// Conferma uovo
document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  try {
    const { data, error } = await supabaseClient
      .from('pets')
      .insert({ user_id: user.id, egg_type: eggType })
      .select('id')
      .single();
    if (error) throw error;
    petId = data.id;
    hide('egg-selection');
    startHatchSequence(eggType);
  } catch (err) {
    console.error(err);
    alert('Errore creazione pet');
  }
});

// Sequenza di schiusa
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  document.getElementById('countdown').textContent = count;
  const iv = setInterval(() => {
    if (--count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      saveState();
      startGame();
    } else document.getElementById('countdown').textContent = count;
  }, 1000);
}

// Avvia il gioco
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  setInterval(tick, 1000); // ogni secondo calcola degradazione
}

// Game loo
 function updateBars() {
  document.getElementById('hunger-bar').style.width = hunger.toFixed(1) + '%';
  document.getElementById('fun-bar').style.width    = fun.toFixed(1)    + '%';
  document.getElementById('clean-bar').style.width  = clean.toFixed(1)  + '%';
}
async function saveState() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger, fun, clean, updated_at: new Date() });
  if (error) console.error('Save error:', error);
}
function tick() {
  if (!alive) return;
  hunger = Math.max(0, hunger - decayRatesPerSecond.hunger);
  fun    = Math.max(0, fun    - decayRatesPerSecond.fun);
  clean  = Math.max(0, clean  - decayRatesPerSecond.clean);
  if (hunger === 0 || fun === 0 || clean === 0) {
    alive = false;
    document.getElementById('game-over').classList.remove('hidden');
  }
  updateBars();
  saveState();
}

// Interazioni
['feed','play','clean'].forEach(act => {
  document.getElementById(`${act}-btn`).addEventListener('click', () => {
    if (!alive) return;
    if (act==='feed') hunger = Math.min(100, hunger + 20);
    if (act==='play') fun    = Math.min(100, fun    + 20);
    if (act==='clean') clean  = Math.min(100, clean  + 20);
    updateBars();
    saveState();
  });
});

// Auto-login
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await seedUserRecord(user);
    initFlow();
  } else show('login-container');
});