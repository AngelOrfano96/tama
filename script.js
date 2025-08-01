// script.js (versione finale: degradazione live e fetch iniziale)

// Inizializza Supabase
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Stato globale\ let user = null;
let petId = null;
let eggType = null;
let hunger = 100;
let fun = 100;
let clean = 100;
let alive = true;

// Rate di decadimento per secondo
const decayRates = {
  hunger: 0.005,  // 1% ogni ~200s
  fun:     0.003,  // 1% ogni ~333s
  clean:   0.002   // 1% ogni ~500s
};

// Utils: mostra/nascondi elementi
function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hide(id) {
  document.getElementById(id).classList.add('hidden');
}

// --- AUTH FUNCTIONS ---
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

// --- LOGIN / SIGNUP HANDLERS ---
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

// --- INITIAL FLOW AFTER AUTH ---
async function initFlow() {
  hide('login-container');

  // Recupera o crea il pet
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') return console.error(petErr);
  if (!pet) {
    show('egg-selection');
    return;
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Carica stato dal DB
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (state) {
    // Degrado offline
    const elapsed = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
    fun    = Math.max(0, state.fun    - decayRates.fun    * elapsed);
    clean  = Math.max(0, state.clean  - decayRates.clean  * elapsed);
  }

  // Avvia il gioco
  startGame();
}

// --- START GAME ---
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();

  // Tick live: valore cambia ogni secondo
  setInterval(() => {
    if (!alive) return;
    hunger = Math.max(0, hunger - decayRates.hunger);
    fun    = Math.max(0, fun    - decayRates.fun);
    clean  = Math.max(0, clean  - decayRates.clean);
    updateBars();
  }, 1000);

  // Salvataggio periodico ogni 5 secondi
  setInterval(saveState, 5000);
}

// --- UPDATE BARS ---
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width    = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width  = `${Math.round(clean)}%`;
}

// --- SAVE STATE ---
async function saveState() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({
      pet_id:     petId,
      hunger:     Math.round(hunger),
      fun:        Math.round(fun),
      clean:      Math.round(clean),
      updated_at: new Date()
    });
  if (error) console.error('Save error:', error);
}

// --- INTERAZIONI UTENTE ---
['feed','play','clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    if (action === 'feed')  hunger = Math.min(100, hunger + 20);
    if (action === 'play')  fun    = Math.min(100, fun    + 20);
    if (action === 'clean') clean  = Math.min(100, clean  + 20);
    updateBars();
    await saveState();
  });
});

// --- SELEZIONE UOVO & SCHIUSA ---
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
    .from('pets')
    .insert({ user_id: user.id, egg_type: eggType })
    .select('id')
    .single();
  if (error) console.error(error);
  else {
    petId = data.id;
    hide('egg-selection');
    hunger = fun = clean = 100;
    await saveState();
    startGame();
  }
});

// --- SCHIUSA CON COUNTDOWN ---
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  const cd = document.getElementById('countdown');
  cd.textContent = count;
  const iv = setInterval(() => {
    count--; cd.textContent = count;
    if (count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      saveState();
      startGame();
    }
  }, 1000);
}

// --- AUTO-LOGIN ALL'AVVIO PAGINA ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    show('login-container');
  }
});
