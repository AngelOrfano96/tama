// script.js (persistenza con valori arrotondati per integer DB)

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
const decayRatesPerSecond = {
  hunger: 0.005, // 1% ogni 200s
  fun:     0.003, // 1% ogni ~333s
  clean:   0.002  // 1% ogni 500s
};

// Utils: mostra/nascondi elementi
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
async function seedUserRecord(u) {
  const { error } = await supabaseClient
    .from('users')
    .upsert({ id: u.id, email: u.email }, { onConflict: 'id' });
  if (error) console.error('User seed error:', error);
}

// --- Form Login / Registrazione ---
const authForm  = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    user = await signIn(
      document.getElementById('email-input').value,
      document.getElementById('password-input').value
    );
    await seedUserRecord(user);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  try {
    user = await signUp(
      document.getElementById('email-input').value,
      document.getElementById('password-input').value
    );
    await seedUserRecord(user);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// --- Flusso Iniziale ---
async function initFlow() {
  hide('login-container');
  // Recupera pet esistente
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') return console.error(petErr);
  if (!pet) {
    show('egg-selection');
    return;
  }
  petId   = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Recupera stato
  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (!stateErr && state) {
    // Degradazione offline
    const last    = new Date(state.updated_at).getTime();
    const now     = Date.now();
    const diffSec = (now - last) / 1000;
    hunger = Math.max(0, state.hunger - decayRatesPerSecond.hunger * diffSec);
    fun    = Math.max(0, state.fun    - decayRatesPerSecond.fun    * diffSec);
    clean  = Math.max(0, state.clean  - decayRatesPerSecond.clean  * diffSec);
    startGame();
  } else {
    startHatchSequence(eggType);
  }
}

// --- Selezione Uovo ---
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = +img.dataset.egg;
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
  document.getElementById('countdown').textContent = count;
  const iv = setInterval(async () => {
    count--;
    document.getElementById('countdown').textContent = count;
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
  document.getElementById('hunger-bar').style.width = hunger.toFixed(0) + '%';
  document.getElementById('fun-bar').style.width    = fun.toFixed(0)    + '%';
  document.getElementById('clean-bar').style.width  = clean.toFixed(0)  + '%';
}

// --- Salvataggio Stato (arrotondato) ---
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
    await seedUserRecord(user);
    initFlow();
  } else {
    show('login-container');
  }
});