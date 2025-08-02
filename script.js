const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let hunger = 100, fun = 100, clean = 100;
let alive = true;
let tickInterval = null;
let saveInterval = null;

const decayRates = { hunger: 0.005, fun: 0.003, clean: 0.002 };

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
}

async function saveState() {
  if (!petId) return;
  await supabaseClient.from('pet_states').upsert({
    pet_id: petId,
    hunger: Math.round(hunger),
    fun: Math.round(fun),
    clean: Math.round(clean),
    updated_at: new Date()
  });
}

async function resetPet() {
  if (tickInterval) clearInterval(tickInterval);
  if (saveInterval) clearInterval(saveInterval);

  if (petId) {
    // Cancella pet_states prima (dipendenza FK), poi pets
    await supabaseClient.from('pet_states').delete().eq('pet_id', petId);
    await supabaseClient.from('pets').delete().eq('id', petId);
    petId = null;
    eggType = null;
  }
  // Reset variabili locali
  hunger = fun = clean = 100;
  alive = true;
  // Torna alla selezione uovo
  hide('game');
  show('egg-selection');
}

function startLiveTick() {
  if (tickInterval) clearInterval(tickInterval);
  if (saveInterval) clearInterval(saveInterval);

  tickInterval = setInterval(async () => {
    if (!alive) return;
    hunger = Math.max(0, hunger - decayRates.hunger);
    fun    = Math.max(0, fun    - decayRates.fun);
    clean  = Math.max(0, clean  - decayRates.clean);
    updateBars();

    if (hunger === 0 || fun === 0 || clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      await resetPet();
      // Non restartare qui i tick, tornerai alla scelta uovo!
    }
  }, 1000);

  saveInterval = setInterval(saveState, 5000);
}

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

async function initFlow() {
  hide('login-container');
  // Controlla se hai già un pet
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .single();
  if (petErr && petErr.code !== 'PGRST116') return console.error(petErr);

  if (!pet) { 
    // Nessun pet: vai a selezione uovo
    show('egg-selection');
    hide('game');
    return; 
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Stato + degradazione offline
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (state) {
    const elapsed = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
    fun    = Math.max(0, state.fun    - decayRates.fun * elapsed);
    clean  = Math.max(0, state.clean  - decayRates.clean * elapsed);
    // Se appena rientri è morto, reset subito
    if (hunger === 0 || fun === 0 || clean === 0) {
      await resetPet();
      return;
    }
  } else {
    hunger = fun = clean = 100;
  }
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  alive = true; // reset se rientri!
  document.getElementById('game-over').classList.add('hidden');
  startLiveTick();
}

// Bottoni gioco
['feed','play','clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    if (action === 'feed') hunger = Math.min(100, hunger + 20);
    if (action === 'play') fun    = Math.min(100, fun    + 20);
    if (action === 'clean') clean = Math.min(100, clean  + 20);
    updateBars();
    await saveState();
  });
});

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
  show('game');
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  updateBars();
  startLiveTick();
});

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    show('login-container');
  }
});
