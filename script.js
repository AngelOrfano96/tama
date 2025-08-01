// script.js (persistenza solo su interazioni manuali, tick visuale)

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
  hunger: 0.005,
  fun:     0.003,
  clean:   0.002
};

// Utils
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// Auth
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

// Form handlers
const authForm = document.getElementById('auth-form');
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

// Flusso iniziale
async function initFlow() {
  hide('login-container');

  // Recupera pet
  const { data: pet } = await supabaseClient
    .from('pets')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!pet) {
    show('egg-selection');
    return;
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Recupera stato
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean')
    .eq('pet_id', petId)
    .single();

  if (state) {
    // Applica degradazione per visualizzazione, ma non salva
    hunger = Math.max(0, state.hunger - decayRatesPerSecond.hunger * (Date.now() - new Date(state.updated_at)) / 1000);
    fun    = Math.max(0, state.fun    - decayRatesPerSecond.fun    * (Date.now() - new Date(state.updated_at)) / 1000);
    clean  = Math.max(0, state.clean  - decayRatesPerSecond.clean  * (Date.now() - new Date(state.updated_at)) / 1000);
    startGame();
  } else {
    startHatchSequence(eggType);
  }
}

// Selezione uovo
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = +img.dataset.egg;
    document.getElementById('confirm-egg-btn').disabled = false;
  })
);
document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  const { data } = await supabaseClient
    .from('pets')
    .insert({ user_id: user.id, egg_type: eggType })
    .select('id')
    .single();
  petId = data.id;
  hide('egg-selection');
  startHatchSequence(eggType);
});

// Sequenza schiusa
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  document.getElementById('countdown').textContent = count;

  const iv = setInterval(async () => {
    if (--count <= 0) {
      clearInterval(iv);
      hide('hatch-container');
      hunger = fun = clean = 100;
      await saveState();
      startGame();
    } else {
      document.getElementById('countdown').textContent = count;
    }
  }, 1000);
}

// Avvio gioco
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  setInterval(tick, 1000);
}

// Aggiorna barre
function updateBars() {
  document.getElementById('hunger-bar').style.width = hunger.toFixed(1) + '%';
  document.getElementById('fun-bar').style.width    = fun.toFixed(1)    + '%';
  document.getElementById('clean-bar').style.width  = clean.toFixed(1)  + '%';
}

// Salvataggio stato
async function saveState() {
  await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger, fun, clean, updated_at: new Date() });
}

// Tick (solo visuale)
function tick() {
  if (!alive) return;
  hunger = Math.max(0, hunger - decayRatesPerSecond.hunger);
  fun    = Math.max(0, fun    - decayRatesPerSecond.fun);
  clean  = Math.max(0, clean  - decayRatesPerSecond.clean);
  updateBars();
}

// Interazioni manuali (persistenza)
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

// Auto-login
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await seedUserRecord(user);
    initFlow();
  } else show('login-container');
});
