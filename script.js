// script.js (updated resume logic)

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
let countdownInterval = null;

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

// Seed tabella custom users
async function seedUserRecord(user) {
  const { error } = await supabaseClient
    .from('users')
    .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
  if (error) console.error('User seed error:', error);
}

// Login/Signup
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

// Flusso principale dopo autenticazione
async function initFlow() {
  hide('login-container');
  // Carica il pet se esiste
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') {
    console.error('Pet fetch error:', petErr);
    return;
  }
  if (!pet) {
    // nessun pet, mostra selezione uovo
    show('egg-selection');
    return;
  }
  // pet esiste, imposta valori
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Verifica stato esistenza per decidere se schiudere o riprendere
  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('*')
    .eq('pet_id', petId)
    .single();
  if (state && !stateErr) {
    // ha già uno stato, riprendi gioco
    hunger = state.hunger;
    fun = state.fun;
    clean = state.clean;
    startGame();
  } else {
    // primo accesso, avvia sequenza di schiusa
    startHatchSequence(eggType);
  }
}

// Selezione Uovo
const eggEls = document.querySelectorAll('.egg.selectable');
eggEls.forEach(img => img.addEventListener('click', () => {
  eggEls.forEach(i => i.classList.remove('selected'));
  img.classList.add('selected');
  eggType = parseInt(img.dataset.egg, 10);
  document.getElementById('confirm-egg-btn').disabled = false;
}));
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
    alert('Errore nella creazione del pet. Riprova.');
  }
});

// Schiusa uovo con countdown
function startHatchSequence(type) {
  document.getElementById('selected-egg').src = `assets/eggs/egg_${type}.png`;
  show('hatch-container');
  let count = 15;
  document.getElementById('countdown').textContent = count;
  countdownInterval = setInterval(() => {
    count--;
    document.getElementById('countdown').textContent = count;
    if (count <= 0) {
      clearInterval(countdownInterval);
      hide('hatch-container');
      // inizializza a 100 tutte le stats
      hunger = fun = clean = 100;
      // salva stato iniziale
      saveState();
      startGame();
    }
  }, 1000);
}

// Avvia il gioco vero e proprio
function startGame() {
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  setInterval(tick, 2000);
}

// Game Loop
function updateBars() {
  document.getElementById('hunger-bar').style.width = hunger + '%';
  document.getElementById('fun-bar').style.width = fun + '%';
  document.getElementById('clean-bar').style.width = clean + '%';
}
async function saveState() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger, fun, clean, updated_at: new Date() });
  if (error) console.error('Save error:', error);
}
function tick() {
  if (!alive) return;
  hunger = Math.max(0, hunger - 1);
  fun = Math.max(0, fun - 0.5);
  clean = Math.max(0, clean - 0.3);
  if (hunger === 0 || fun === 0 || clean === 0) {
    alive = false;
    document.getElementById('game-over').classList.remove('hidden');
  }
  updateBars();
  saveState();
}

// Bottoni interazione
['feed','play','clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', () => {
    if (!alive) return;
    if (action === 'feed') hunger = Math.min(100, hunger + 20);
    if (action === 'play') fun = Math.min(100, fun + 20);
    if (action === 'clean') clean = Math.min(100, clean + 20);
    updateBars();
    saveState();
  });
});

// Auto-login se già loggato
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