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
  await supabaseClient.from('pet_states').upsert({
    pet_id: petId,
    hunger: Math.round(hunger),
    fun: Math.round(fun),
    clean: Math.round(clean),
    updated_at: new Date()
  });
}

function startLiveTick() {
  if (tickInterval) clearInterval(tickInterval);
  if (saveInterval) clearInterval(saveInterval);

  tickInterval = setInterval(() => {
    if (!alive) return;
    hunger = Math.max(0, hunger - decayRates.hunger);
    fun    = Math.max(0, fun    - decayRates.fun);
    clean  = Math.max(0, clean  - decayRates.clean);
    updateBars();
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

async function initFlow() {
  hide('login-container');
  const { data: pet } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .single();
  if (!pet) { show('egg-selection'); return; }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  // Carica stato e applica degradazione offline
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
  } else {
    hunger = fun = clean = 100;
  }
  show('game');
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  updateBars();
  startLiveTick();
}

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
