// script.js (codice corretto e funzionante)

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
// Rate di decadimento per secondo (non salvati al tick)
const decayRatesPerSecond = {
  hunger: 0.005, // 1% ogni 200s
  fun:     0.003, // 1% ogni ~333s
  clean:   0.002  // 1% ogni 500s
};

// Utils: mostra/nascondi elementi
const show = id => document.getElementById(id).classList.remove('hidden');
const hide = id => document.getElementById(id).classList.add('hidden');

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

// --- Form Login / Registrazione ---
const authForm  = document.getElementById('auth-form');
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

// --- Flusso Iniziale ---
async function initFlow() {
  hide('login-container');
  // Ottieni pet esistente
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') {
    console.error(petErr);
    return;
  }
  if (!pet) {
    show('egg-selection');
    return;
  }

  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Carica stato
  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean')
    .eq('pet_id', petId)
    .single();
  if (!stateErr && state) {
    hunger = state.hunger;
    fun    = state.fun;
    clean  = state.clean;
    startGame();
  } else {
    startHatchSequence(eggType);
  }
}

// --- Selezione Uovo ---
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
    document.getElementById('confirm-egg-btn').disabled = false;
  })
);
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
    console.error('Pet creation error:', err);
    alert('Errore creazione pet');
  }
});

// --- Schiusa Uovo ---
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  const countdownEl = document.getElementById('countdown');
  countdownEl.textContent = count;
  const iv = setInterval(async () => {
    count--;
    countdownEl.textContent = count;
    if (count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      await saveState();
      startGame();
    }
  }, 1000);
}

// --- Avvia Gioco ---
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
}

// --- Aggiorna Barre ---
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${hunger}%`;
  document.getElementById('fun-bar').style.width    = `${fun}%`;
  document.getElementById('clean-bar').style.width  = `${clean}%`;
}

// --- Salvataggio Stato (arrotondando interi) ---
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

// --- Interazioni Utente ---
['feed','play','clean'].forEach(act => {
  document.getElementById(`${act}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    if (act === 'feed') hunger = Math.min(100, hunger + 20);
    if (act === 'play') fun    = Math.min(100, fun    + 20);
    if (act === 'clean') clean  = Math.min(100, clean  + 20);
    updateBars();
    await saveState();
  });
});

// --- Auto-login al Caricamento Pagina ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    show('login-container');
  }
});