const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let user = null;
let petId = null;
let eggType = null;
let hunger = 100, fun = 100, clean = 100;
let alive = true;
let tickInterval = null;
let saveInterval = null;
const decayRates = { hunger: 0.02, fun: 0.01, clean: 0.01 }; // cambia a piacere!


function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
/*
function updateBars() {
  console.log('updateBars:', { hunger, fun, clean });
  document.getElementById('hunger-bar').style.width = ${Math.round(hunger)}%;
  document.getElementById('fun-bar').style.width = ${Math.round(fun)}%;
  document.getElementById('clean-bar').style.width = ${Math.round(clean)}%;
} */

const now = Date.now();
const lastUpdate = new Date(state.updated_at).getTime();
const elapsed = (now - lastUpdate) / 1000;

if (elapsed > 2 * saveIntervalInSeconds) {
    // Applica degradazione "offline" (es: sei stato via per ore)
    hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
    fun    = Math.max(0, state.fun    - decayRates.fun * elapsed);
    clean  = Math.max(0, state.clean  - decayRates.clean * elapsed);
} else {
    // Sei sincronizzato, usa i valori del DB "così come sono"
    hunger = state.hunger;
    fun = state.fun;
    clean = state.clean;
}


function updateBars() {
  document.getElementById('hunger-bar').style.width = ${Math.round(hunger)}%;
  document.getElementById('fun-bar').style.width = ${Math.round(fun)}%;
  document.getElementById('clean-bar').style.width = ${Math.round(clean)}%;
  console.log('updateBars:', { hunger, fun, clean });
}
setInterval(() => {
  hunger = Math.max(0, hunger - 0.5);
  fun = Math.max(0, fun - 0.3);
  clean = Math.max(0, clean - 0.2);
  updateBars();
}, 1000);


async function saveState() {
  if (!petId) return;
  console.log('Salvataggio stato nel DB:', { hunger, fun, clean });
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
    console.log('Cancellazione pet nel DB:', petId);
    await supabaseClient.from('pet_states').delete().eq('pet_id', petId);
    await supabaseClient.from('pets').delete().eq('id', petId);
    petId = null; eggType = null;
  }
  hunger = fun = clean = 100;
  alive = true;
  hide('game');
  show('egg-selection');
}

function startLiveTick() {
  console.log('startLiveTick chiamata');
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

const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  console.log('Tentativo login', email);
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
    console.log('Login riuscito, user:', user);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
    console.error('Login errore:', err);
  }
});
signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  console.log('Tentativo signup', email);
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    user = data.user;
    console.log('Signup riuscita, user:', user);
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
    console.error('Signup errore:', err);
  }
});

async function initFlow() {
  hide('login-container');
  console.log('initFlow chiamata');
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
    console.log('Nessun pet trovato, vado su selezione uovo');
    show('egg-selection'); hide('game'); return; 
  }
  petId = pet.id;
  eggType = pet.egg_type;
  hide('egg-selection');

  const { data: state, error: stateErr } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, updated_at')
    .eq('pet_id', petId)
    .single();
  if (stateErr) console.error('Errore nel recupero stato:', stateErr);

  if (state) {
    const elapsed = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    hunger = Math.max(0, state.hunger - decayRates.hunger * elapsed);
    fun    = Math.max(0, state.fun    - decayRates.fun * elapsed);
    clean  = Math.max(0, state.clean  - decayRates.clean * elapsed);
    console.log('Stato recuperato dal DB:', { hunger, fun, clean, elapsed });
    if (hunger === 0 || fun === 0 || clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      show('game'); updateBars();
      setTimeout(resetPet, 1200);
      return;
    }
  } else {
    hunger = fun = clean = 100;
    console.log('Nuovo stato inizializzato:', { hunger, fun, clean });
  }
  show('game');
  document.getElementById('pet').src = assets/pets/pet_${eggType}.png;
  updateBars();
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  startLiveTick();
}

['feed','play','clean'].forEach(action => {
  document.getElementById(${action}-btn).addEventListener('click', async () => {
    if (!alive) return;
    if (action === 'feed') hunger = Math.min(100, hunger + 20);
    if (action === 'play') fun    = Math.min(100, fun    + 20);
    if (action === 'clean') clean = Math.min(100, clean  + 20);
    updateBars();
    await saveState();
    console.log('Pulsante premuto:', action, { hunger, fun, clean });
  });
});

document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
    document.getElementById('confirm-egg-btn').disabled = false;
    console.log('Uovo selezionato:', eggType);
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
  document.getElementById('pet').src = assets/pets/pet_${eggType}.png;
  show('game');
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  updateBars();
  startLiveTick();
  console.log('Pet creato, startLiveTick chiamata dopo creazione');
});

window.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded!');
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    console.log('Utente già loggato:', user);
    await initFlow();
  } else {
    show('login-container');
    console.log('Mostro login-container');
  }
});