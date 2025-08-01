// script.js (con pulsante "Sveglia" per avvio) 

// Rate di decadimento per secondo
const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let hunger = 100, fun = 100, clean = 100;
let alive = true;
let tickInterval = null;
let saveInterval = null;

const decayRates = { hunger: 0.005, fun: 0.003, clean: 0.002 };

// Mostra/nasconde elementi
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// Aggiorna barre grafiche
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
}

// Salva stato su DB
async function saveState() {
  await supabaseClient.from('pet_states').upsert({
    pet_id: petId,
    hunger: Math.round(hunger),
    fun: Math.round(fun),
    clean: Math.round(clean),
    updated_at: new Date()
  });
}

// Live: degrade e aggiorna barre OGNI SECONDO
function startLiveTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!alive) return;
    hunger = Math.max(0, hunger - decayRates.hunger);
    fun    = Math.max(0, fun    - decayRates.fun);
    clean  = Math.max(0, clean  - decayRates.clean);
    updateBars();
  }, 1000);
  // salva ogni 5s
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(saveState, 5000);
}

// Risveglio pet: carica valori dal DB e avvia ciclo live
async function wakePet() {
  hide('wake-btn');
  show('pet'); show('hunger-bar'); show('fun-bar'); show('clean-bar');
  show('feed-btn'); show('play-btn'); show('clean-btn');
  // Prende stato attuale dal DB per sicurezza!
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (state) {
    // Degradazione offline all'avvio
    const elapsed = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
    fun    = Math.max(0, state.fun    - decayRates.fun * elapsed);
    clean  = Math.max(0, state.clean  - decayRates.clean * elapsed);
  }
  updateBars();
  startLiveTick();
}

// Handler login/signup
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { user: u } = await supabaseClient.auth.signInWithPassword({ email, password });
    user = u;
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});
signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { user: u } = await supabaseClient.auth.signUp({ email, password });
    user = u;
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// Flusso principale post-login
async function initFlow() {
  hide('login-container');
  // Prendi pet esistente o chiedi di sceglierlo
  const { data: pet } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .single();
  if (!pet) { show('egg-selection'); return; }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');
  // Mostra solo “sveglia il pet”
  show('game'); show('wake-btn');
  hide('pet'); hide('hunger-bar'); hide('fun-bar'); hide('clean-bar');
  hide('feed-btn'); hide('play-btn'); hide('clean-btn');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
}

// Bottone “sveglia”
document.getElementById('wake-btn').addEventListener('click', wakePet);

// Interazioni utente
['feed','play','clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    if (action === 'feed') hunger = Math.min(100, hunger + 20);
    if (action === 'play') fun    = Math.min(100, fun    + 20);
    if (action === 'clean') clean  = Math.min(100, clean + 20);
    updateBars();
    await saveState();
  });
});

// Selezione uovo e schiusa
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
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
  hunger = fun = clean = 100;
  await saveState();
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  show('game'); show('wake-btn');
  hide('pet'); hide('hunger-bar'); hide('fun-bar'); hide('clean-bar');
  hide('feed-btn'); hide('play-btn'); hide('clean-btn');
});

// Schiusa (se serve)
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
      show('game'); show('wake-btn');
      hide('pet'); hide('hunger-bar'); hide('fun-bar'); hide('clean-bar');
      hide('feed-btn'); hide('play-btn'); hide('clean-btn');
      document.getElementById('pet').src = `assets/pets/pet_${type}.png`;
    }
  }, 1000);
}

// Auto-login all'avvio pagina
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    show('login-container');
  }
});
