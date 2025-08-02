const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let hunger = 100, fun = 100, clean = 100;
let alive = true;
let tickInterval = null;
let saveInterval = null;
const decayRates = { hunger: 0.02, fun: 0.01, clean: 0.01 };

// --- UTILS
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
}

// --- TICK LIVE (solo client)
function startLiveTick() {
  if (tickInterval) clearInterval(tickInterval);
  if (saveInterval) clearInterval(saveInterval);

  tickInterval = setInterval(() => {
    if (!alive) return;
    hunger = Math.max(0, hunger - decayRates.hunger);
    fun    = Math.max(0, fun    - decayRates.fun);
    clean  = Math.max(0, clean  - decayRates.clean);
    updateBars();

    if (hunger === 0 || fun === 0 || clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      clearInterval(tickInterval);
      clearInterval(saveInterval);
      setTimeout(resetPet, 1200);
    }
  }, 1000);

  saveInterval = setInterval(saveState, 5000);
}

// --- SALVATAGGIO
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

// --- RESET
async function resetPet() {
  if (tickInterval) clearInterval(tickInterval);
  if (saveInterval) clearInterval(saveInterval);
  if (petId) {
    await supabaseClient.from('pet_states').delete().eq('pet_id', petId);
    await supabaseClient.from('pets').delete().eq('id', petId);
    petId = null; eggType = null;
  }
  hunger = fun = clean = 100;
  alive = true;
  hide('game');
  show('egg-selection');
}

// --- FLOW PRINCIPALE
async function initFlow() {
  hide('login-container');
  const { data: pet, error: petErr } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .single();

  if (petErr && petErr.code !== 'PGRST116') {
    console.error('Errore nel recupero pet:', petErr);
    return;
  }
  if (!pet) { 
    show('egg-selection'); hide('game'); return; 
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Stato
  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();

  if (stateErr) console.error('Errore nel recupero stato:', stateErr);

  if (state) {
    const now = Date.now();
    const lastUpdate = new Date(state.updated_at).getTime();
    const elapsed = (now - lastUpdate) / 1000;

    // --- Se refresh super recente, usa valore puro, altrimenti degrada
    if (elapsed < 10) {
      hunger = state.hunger;
      fun = state.fun;
      clean = state.clean;
    } else {
      hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
      fun    = Math.max(0, state.fun    - decayRates.fun * elapsed);
      clean  = Math.max(0, state.clean  - decayRates.clean * elapsed);
    }
    if (hunger === 0 || fun === 0 || clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      show('game'); updateBars();
      setTimeout(resetPet, 1200);
      return;
    }
  } else {
    hunger = fun = clean = 100;
  }
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  startLiveTick();
}

// --- EVENTI
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
