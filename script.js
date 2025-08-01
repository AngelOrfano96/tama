// script.js (finale: tick decrement locale, salvataggio solo su interazioni e al tick ogni minuto)

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
// Rate di decadimento per secondo
const decayRatesPerSecond = { hunger: 0.005, fun: 0.003, clean: 0.002 };

// Utils
const show = id => document.getElementById(id).classList.remove('hidden');
const hide = id => document.getElementById(id).classList.add('hidden');

// --- Auth ---
async function signUp(email, pwd) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password: pwd });
  if (error) throw error;
  return data.user;
}
async function signIn(email, pwd) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pwd });
  if (error) throw error;
  return data.user;
}

// --- Login/Signup handlers ---
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    user = await signIn(
      document.getElementById('email-input').value.trim(),
      document.getElementById('password-input').value
    );
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  try {
    user = await signUp(
      document.getElementById('email-input').value.trim(),
      document.getElementById('password-input').value
    );
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// --- Flusso Iniziale ---
async function initFlow() {
  hide('login-container');

  // Carica pet
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets').select('*').eq('user_id', user.id).single();
  if (petErr && petErr.code !== 'PGRST116') return console.error(petErr);
  if (!pet) {
    show('egg-selection');
    return;
  }

  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Carica stato
  const { data: state } = await supabaseClient
    .from('pet_states').select('hunger, fun, clean, updated_at').eq('pet_id', petId).single();
  if (state) {
    // degrado offline
    const diffSec = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, state.hunger - decayRatesPerSecond.hunger * diffSec);
    fun    = Math.max(0, state.fun    - decayRatesPerSecond.fun    * diffSec);
    clean  = Math.max(0, state.clean  - decayRatesPerSecond.clean  * diffSec);
    startGame();
  } else {
    startHatchSequence(eggType);
  }
}

// --- Selezione Uovo ---
document.querySelectorAll('.egg.selectable').forEach(el => el.addEventListener('click', () => {
  document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  eggType = +el.dataset.egg;
  document.getElementById('confirm-egg-btn').disabled = false;
}));
document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  const { data, error } = await supabaseClient
    .from('pets').insert({ user_id: user.id, egg_type: eggType }).select('id').single();
  if (error) return console.error(error);
  petId = data.id;
  hide('egg-selection');
  startHatchSequence(eggType);
});

// --- Schiusa Uovo ---
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  const cd = document.getElementById('countdown');
  cd.textContent = count;
  const iv = setInterval(async () => {
    if (--count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      await saveState();
      startGame();
    } else {
      cd.textContent = count;
    }
  }, 1000);
}

// --- Avvia Gioco ---
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  // tick ogni secondo
  setInterval(tick, 1000);
}

// --- Aggiorna Barre ---
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width    = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width  = `${Math.round(clean)}%`;
}

// --- Tick di gioco (decrement locale e persistenza) ---
async function tick() {
  if (!alive) return;
  hunger = Math.max(0, hunger - decayRatesPerSecond.hunger);
  fun    = Math.max(0, fun    - decayRatesPerSecond.fun);
  clean  = Math.max(0, clean  - decayRatesPerSecond.clean);
  updateBars();
  // salva ogni minuto, non ogni tick
  // accumula un timer semplificato:
  if (tick.counter === undefined) tick.counter = 0;
  if (++tick.counter >= 60) {
    tick.counter = 0;
    await saveState();
  }
}

// --- Salvataggio Stato ---
async function saveState() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger: Math.round(hunger), fun: Math.round(fun), clean: Math.round(clean), updated_at: new Date() });
  if (error) console.error('Save error:', error);
}

// --- Interazioni Utente (persistenza immediata) ---
['feed','play','clean'].forEach(act => {
  document.getElementById(`${act}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    if (act==='feed') hunger = Math.min(100, hunger + 20);
    if (act==='play') fun    = Math.min(100, fun    + 20);
    if (act==='clean') clean  = Math.min(100, clean  + 20);
    updateBars();
    await saveState();
  });
});

// --- Auto-login ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) { user = currentUser; initFlow(); }
  else show('login-container');
});
