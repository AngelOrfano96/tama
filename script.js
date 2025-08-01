
// script.js
// Inizializza il client Supabase (il tag CDN va incluso nel tuo index.html prima di questo script)
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Variabili di stato del pet
let hunger = 100;
let fun = 100;
let clean = 100;
let alive = true;
let petId = null;

// Funzione per aggiornare le barre sul DOM
function updateBars() {
  document.getElementById('hunger-bar').style.width = hunger + '%';
  document.getElementById('fun-bar').style.width = fun + '%';
  document.getElementById('clean-bar').style.width = clean + '%';
}

// Carica lo stato dal database
async function loadStateFromDB() {
  const { data, error } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean')
    .eq('pet_id', petId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('Load error:', error);
  return data;
}

// Salva lo stato nel database
async function saveStateToDB() {
  const { error } = await supabaseClient
    .from('pet_states')
    .upsert({ pet_id: petId, hunger, fun, clean, updated_at: new Date() });
  if (error) console.error('Save error:', error);
}

// Inizializzazione del pet (crea record se non esiste e carica lo stato)
async function initPet() {
  // Prova a leggere un petId salvato in locale
  petId = localStorage.getItem('petId');
  if (!petId) {
    // Crea un nuovo pet
    const { data, error } = await supabaseClient
      .from('pets')
      .insert({ egg_type: 1 })
      .select('id')
      .single();
    if (error) return console.error('Pet creation error:', error);
    petId = data.id;
    localStorage.setItem('petId', petId);
  }
  // Carica lo stato (se esiste)
  const saved = await loadStateFromDB();
  if (saved) {
    hunger = saved.hunger;
    fun = saved.fun;
    clean = saved.clean;
  }
  updateBars();
}

// Gestione tick di gioco
function tick() {
  if (!alive) return;
  hunger -= 1;
  fun    -= 0.5;
  clean  -= 0.3;
  if (hunger <= 0 || fun <= 0 || clean <= 0) {
    alive = false;
    document.getElementById('game-over').classList.remove('hidden');
  }
  updateBars();
  saveStateToDB();
}

// Event listeners sui pulsanti
document.getElementById('feed-btn').addEventListener('click', () => {
  if (!alive) return;
  hunger = Math.min(100, hunger + 20);
  updateBars();
  saveStateToDB();
});
document.getElementById('play-btn').addEventListener('click', () => {
  if (!alive) return;
  fun = Math.min(100, fun + 20);
  updateBars();
  saveStateToDB();
});
document.getElementById('clean-btn').addEventListener('click', () => {
  if (!alive) return;
  clean = Math.min(100, clean + 20);
  updateBars();
  saveStateToDB();
});

// Avvia tutto dopo il caricamento del DOM
window.addEventListener('DOMContentLoaded', async () => {
  await initPet();
  setInterval(tick, 2000); // ogni 2s cala lo stato
});

