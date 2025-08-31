//const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
// usa quello globale creato nell’HTML
const supabaseClient = window.supabaseClient;


// === RESOURCES (Gettoni/Ottoni) =============================================

// Aggiorna il mini-widget in home (vicino al livello)
// === RESOURCES (Gettoni/Ottoni) — Single Source of Truth ===

// Legge il totale dal DB (gestisce anche il caso "nessuna riga")
async function loadResourcesForHome() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return { gettoni: 0, ottoni: 0 };

    const { data, error } = await supabaseClient
      .from('resources')
      .select('gettoni, ottoni')
      .eq('user_id', user.id)
      .maybeSingle(); // evita errore se la riga ancora non esiste

    if (error) {
      console.error('[loadResourcesForHome]', error);
      return { gettoni: 0, ottoni: 0 };
    }
    return data || { gettoni: 0, ottoni: 0 };
  } catch (e) {
    console.error('[loadResourcesForHome]', e);
    return { gettoni: 0, ottoni: 0 };
  }
}

// Aggiorna TUTTI i possibili slot UI
window.refreshResourcesWidget = async function () {
  try {
    const { gettoni, ottoni } = await loadResourcesForHome();

    // pill nuova vicino al livello
    const g1 = document.getElementById('wallet-gettoni');
    const o1 = document.getElementById('wallet-ottoni');
    if (g1) g1.textContent = gettoni;
    if (o1) o1.textContent = ottoni;

    // slot legacy usato in passato
    const g2 = document.getElementById('totale-gettoni');
    if (g2) g2.textContent = gettoni;
  } catch (e) {
    console.error('[refreshResourcesWidget]', e);
  }
};

// Somma gettoni con la RPC giusta e aggiorna la UI
window.addGettoniSupabase = async function (delta) {
  if (!delta || delta <= 0) return;
  try {
    const { error } = await supabaseClient.rpc('increment_resources', {
      p_gettoni_delta: delta,
      p_ottoni_delta: 0
    });
    if (error) throw error;

    await window.refreshResourcesWidget?.();
  } catch (e) {
    console.error('[addGettoniSupabase]', e);
  }
};

// ===== USERNAME (profiles) =======================================

// Assicura che esista la riga del profilo per l’utente corrente
async function ensureProfileRow(userId) {
  // crea la riga se non c'è (senza username)
  await supabaseClient.from('profiles')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });
}

// Aggiorna il badge vicino al livello
async function refreshUsernameBadge() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();

    const el = document.getElementById('username-label');
    if (el) el.textContent = (data && data.username) ? '@' + data.username : '—';
  } catch(e) {
    console.error('[refreshUsernameBadge]', e);
  }
}

// Mostra la modal se manca l'username
async function promptUsernameIfMissing() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  await ensureProfileRow(user.id);

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle();

  // se già presente, solo aggiorna il badge
  if (data && data.username) {
    await refreshUsernameBadge();
    return;
  }

  // altrimenti apri la modal
  const modal = document.getElementById('username-modal');
  const input = document.getElementById('username-input');
  const errEl = document.getElementById('username-error');
  const btnSave = document.getElementById('username-save-btn');
  const btnLogout = document.getElementById('username-logout-btn');

  if (!modal || !input || !btnSave) return;

  errEl.textContent = '';
  input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);

  // handler "Salva"
  const onSave = async () => {
  let v = (input.value || '').trim();
  const rx = /^[a-zA-Z0-9_]{3,20}$/;

  // formato non valido → evidenzia input + piccolo shake
  if (!rx.test(v)) {
    errEl.textContent = 'Formato non valido. Usa 3–20 caratteri: lettere, numeri e underscore.';
    errEl.classList.remove('shake'); void errEl.offsetWidth; errEl.classList.add('shake');
    input.classList.add('is-invalid');
    return;
  }

  btnSave.disabled = true;
  errEl.textContent = '';
  input.classList.remove('is-invalid');

  try {
    const { error: upErr } = await supabaseClient
      .from('profiles')
      .upsert({ user_id: user.id, username: v }, { onConflict: 'user_id' });

    if (upErr) {
      if (upErr.code === '23505') {
        // username già in uso → evidenzia + shake
        errEl.textContent = 'Username già in uso. Riprova con un altro.';
        errEl.classList.remove('shake'); void errEl.offsetWidth; errEl.classList.add('shake');
        input.classList.add('is-invalid');
      } else {
        errEl.textContent = upErr.message || 'Errore imprevisto.';
      }
      return;
    }

    // ok → pulisci stato, chiudi, aggiorna badge
    input.classList.remove('is-invalid');
    errEl.textContent = '';
    await refreshUsernameBadge();
    modal.classList.add('hidden');
  } catch (e) {
    errEl.textContent = 'Errore imprevisto.';
    console.error('[save username]', e);
  } finally {
    btnSave.disabled = false;
  }
};


  // handler "Esci" (logout)
  const onLogout = async () => {
    await supabaseClient.auth.signOut();
    showOnly('login-container');
    modal.classList.add('hidden');
  };

  // bind una sola volta
  if (!btnSave._bound) {
    btnSave.addEventListener('click', onSave);
    btnSave._bound = true;
  }
  if (!btnLogout._bound) {
    btnLogout.addEventListener('click', onLogout);
    btnLogout._bound = true;
  }

  // invio con Enter
  if (!input._bound) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSave();
    });
    input._bound = true;
  }

  if (!input._boundClear) {
  input.addEventListener('input', () => {
    input.classList.remove('is-invalid');
    errEl.textContent = '';
  });
  input._boundClear = true;
}

}

// ===== LEADERBOARD: submit + fetch =====
window.submitTreasureScoreSupabase = async function(score, level) {
  try {
    // la RPC filtra già p_level < 2, qui è solo ulteriore guard
    if (!Number.isFinite(score) || !Number.isFinite(level)) return;
    const { error } = await supabaseClient.rpc('submit_treasure_score', {
      p_score: Math.max(0, score|0),
      p_level: Math.max(0, level|0),
    });
    if (error) console.error('[submitTreasureScoreSupabase]', error);
  } catch (e) {
    console.error('[submitTreasureScoreSupabase]', e);
  }
};

async function loadLeaderboardTop(limit = 20) {
  try {
    const { data, error } = await supabaseClient
      .from('leaderboard_tesoro')
      .select('username_snapshot, best_score, best_level, best_at')
      .order('best_score', { ascending: false })
      .order('best_level', { ascending: false })
      .order('best_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[loadLeaderboardTop]', e);
    return [];
  }
}


const TOP_N = 20;

async function fetchLeaderboardTopN(n = TOP_N) {
  const { data, error } = await supabaseClient
    .from('leaderboard_tesoro')
    // alias: username <- username_snapshot
    .select('user_id, username:username_snapshot, best_score, best_level')
    .order('best_score', { ascending: false })
    .order('best_level', { ascending: false })
    .limit(n);
  if (error) throw error;
  return data || [];
}


async function fetchMyRank() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;

  // usa la RPC creata sopra
  const { data, error } = await supabaseClient.rpc('get_treasure_rank', { p_user: user.id });
  if (error) {
    console.error('[get_treasure_rank]', error);
    return null;
  }
  // supabase per le table-functions restituisce un array
  return Array.isArray(data) ? data[0] || null : data;
}

window.openLeaderboardModal = async function () {
  const modal = document.getElementById('leaderboard-modal');
  const tbody = document.getElementById('leaderboard-body');
  const chip  = document.getElementById('leaderboard-self-rank');

  if (!modal || !tbody || !chip) return;

  modal.classList.remove('hidden');
  // stato "caricamento"
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Caricamento…</td></tr>`;

  try {
    // 1) carica top N
    const top = await fetchLeaderboardTopN(TOP_N);
    tbody.innerHTML = ''; // pulisci

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!top.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Ancora nessun punteggio.</td></tr>`;
    } else {
      top.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.dataset.user = row.user_id;

        // usa alias (username) se presente, altrimenti la colonna originale (username_snapshot)
        const unameRaw = (row.username ?? row.username_snapshot ?? '').trim();
        const unameCell = unameRaw ? '@' + unameRaw : '—';

        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${unameCell}</td>
          <td>${row.best_score ?? 0}</td>
          <td>${row.best_level ?? 1}</td>
        `;
        if (user && row.user_id === user.id) tr.classList.add('is-me');
        tbody.appendChild(tr);
      });
    }

    // 2) rank personale
    const me = await fetchMyRank();
    if (!me || me.rank == null) {
      chip.textContent = 'Nessun punteggio registrato';
      chip.classList.add('muted');
    } else {
      chip.classList.remove('muted');
      chip.textContent = `La tua posizione: #${me.rank} su ${me.total}`;

      // se sei in top N, evidenzia la tua riga (se non già fatto)
      if (me.rank <= TOP_N && user) {
        tbody.querySelector(`tr[data-user="${user.id}"]`)?.classList.add('is-me');
      }
    }
  } catch (err) {
    console.error('[openLeaderboardModal]', err);
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Errore nel caricamento.</td></tr>`;
    chip.textContent = 'Impossibile caricare la classifica';
    chip.classList.add('muted');
  }
};


window.closeLeaderboardModal = function () {
  document.getElementById('leaderboard-modal')?.classList.add('hidden');
};

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

// ========== FUNZIONI PRINCIPALI (NON TOCCARE QUESTE PARTI SE NON NECESSARIO) ==========

// Mostra/hide
function show(id) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[show] missing #' + id); return; }
  el.classList.remove('hidden');
}
function hide(id) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[hide] missing #' + id); return; }
  el.classList.add('hidden');
}
function showOnly(id) {
  ['login-container', 'egg-selection', 'game'].forEach(section => {
    const el = document.getElementById(section);
    if (!el) { console.warn('[showOnly] missing #' + section); return; }
    el.classList.toggle('hidden', section !== id);
  });
}

// Rende disponibile al minigioco l'aggiornamento di FUN + EXP
window.updateFunAndExpFromMiniGame = async function(funDelta = 0, expDelta = 0) {
  try {
    const { data: state } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean, level, exp')
      .eq('pet_id', petId)
      .single();

    if (!state) return;

    const newFun = Math.max(0, Math.min(100, (state.fun ?? 0) + funDelta));

    await addExpAndMaybeLevelUp(state, expDelta);

    await supabaseClient.from('pet_states')
      .update({ fun: newFun, updated_at: new Date() })
      .eq('pet_id', petId);

    const { data: updated } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean, level, exp')
      .eq('pet_id', petId)
      .single();

    if (updated) {
      const l = Number.isFinite(updated.level) ? updated.level : 1;
      const e = Number.isFinite(updated.exp)   ? updated.exp   : 0;
      updateBars(updated.hunger, updated.fun, updated.clean, l, e);
    }

    // Mostra l'etichetta dopo che il modal è stato nascosto (endTreasureMinigame usa 1000ms)
    if (typeof window.showExpGainLabel === 'function' && expDelta > 0) {
      setTimeout(() => window.showExpGainLabel(expDelta), 1100);
    }
  } catch (err) {
    console.error('[Treasure] errore updateFunAndExpFromMiniGame:', err);
  }
};

// Aggiorna le barre
function updateBars(hunger, fun, clean, level, exp) {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
  if (typeof level !== "undefined" && typeof exp !== "undefined") {
    document.getElementById('level-label').textContent = "Livello " + level;
    const expMax = expForNextLevel(level);
    const perc = Math.min(100, Math.round((exp / expMax) * 100));
    document.getElementById('exp-bar').style.width = `${perc}%`;
  }
}

// ---------- CONFIG STATS ----------
const STAT_FIELDS = ['hp','attack','defense','speed'];
const STAT_MAX = 669; // tienilo allineato al CHECK del DB

function updateCombatBars(stats) {
  STAT_FIELDS.forEach(k => {
    const v = Math.max(0, Math.min(STAT_MAX, Number(stats[k] ?? 0)));
    const bar = document.getElementById(`bar-${k}`);
    const lab = document.getElementById(`val-${k}`);

    if (bar) bar.style.width = `${Math.round((v / STAT_MAX) * 100)}%`;
    if (lab) lab.textContent = v;
  });

  // Punti disponibili
  const sp = document.getElementById('stat-points');
  if (sp) sp.textContent = stats.stat_points ?? 0;

  // HP Max accanto all’etichetta
  const hpLabel = document.querySelector('.inv-stat-row[data-stat="hp"] .inv-stat-name');
  if (hpLabel) {
    const max = stats.hp_max ?? 100;
    hpLabel.textContent = `HP (${max})`;
  }

  // Attacco Power accanto ad Attacco
  const atkLabel = document.querySelector('.inv-stat-row[data-stat="attack"] .inv-stat-name');
  if (atkLabel) {
    atkLabel.textContent = `Attacco (${stats.attack_power ?? 50})`;
  }

  // Difesa Power
  const defLabel = document.querySelector('.inv-stat-row[data-stat="defense"] .inv-stat-name');
  if (defLabel) {
    defLabel.textContent = `Difesa (${stats.defense_power ?? 50})`;
  }

  // Velocità Power
  const spdLabel = document.querySelector('.inv-stat-row[data-stat="speed"] .inv-stat-name');
  if (spdLabel) {
    spdLabel.textContent = `Velocità (${stats.speed_power ?? 50})`;
  }
}





async function loadCombatStats(){
  if (!petId) return;
  const { data, error } = await supabaseClient
    .from('pet_states')
    .select('hp, attack, defense, speed, stat_points, hp_max, attack_power, defense_power, speed_power')
    .eq('pet_id', petId)
    .single();
  if (error) { 
    console.error('[loadCombatStats]', error); 
    return; 
  }

  updateCombatBars(data || {});
  updateStatPointsBadge(data?.stat_points ?? 0);
  togglePlusButtons((data?.stat_points ?? 0) <= 0);
}





// un solo listener delegato per tutti i bottoni ±
function bindStatButtonsOnce(){
  if (document.body._statsBound) return;
  document.body._statsBound = true;

document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('.stat-btn');
  if (!btn) return;

  const row = btn.closest('.inv-stat-row');
  const stat = row?.dataset?.stat;
  const delta = parseInt(btn.dataset.delta, 10) || 0;
  if (!STAT_FIELDS.includes(stat) || !petId) return;

  // blocca i decrementi
  if (delta < 0) return;

  try {
    const { data, error } = await supabaseClient.rpc('allocate_stat_point', {
      p_pet_id: petId,
      p_field: stat
    });
    if (error) throw error;

    if (data && data[0]) {
      updateCombatBars(data[0]);
      updateStatPointsBadge(data[0].stat_points ?? 0);
      togglePlusButtons((data[0].stat_points ?? 0) <= 0);
    }
  } catch (err) {
    console.error('[allocate_stat_point]', err);
  }
});


}

function updateStatPointsBadge(n){
  const el = document.getElementById('stat-points');
  if (el) el.textContent = n;
}

function togglePlusButtons(disable){
  document.querySelectorAll('.inv-stat-row .stat-btn[data-delta="1"]')
    .forEach(b => b.disabled = !!disable);
  // i "-" li teniamo sempre disabilitati lato UI
  document.querySelectorAll('.inv-stat-row .stat-btn[data-delta="-1"]')
    .forEach(b => b.disabled = true);
}


// ---------- MOSSE ----------
async function loadMoves(){
  if (!petId) return;
  const { data, error } = await supabaseClient
    .from('pet_moves')
    .select('id, move_key, equipped, slot')
    .eq('pet_id', petId);
  if (error) { console.error('[loadMoves]', error); return; }

  const eq = (data || []).filter(m => m.equipped).sort((a,b)=> (a.slot||0)-(b.slot||0));
  const un = (data || []).filter(m => !m.equipped);

  const eqWrap = document.getElementById('moves-equipped');
  const unWrap = document.getElementById('moves-unlocked');
  if (eqWrap) {
    eqWrap.innerHTML = '';
    for (let i=1;i<=3;i++){
      const m = eq.find(x => x.slot === i);
      const div = document.createElement('div');
      div.className = 'move-slot';
      div.dataset.slot = String(i);
      div.innerHTML = m ? `<span class="move-chip" data-move="${m.id}">${m.move_key}</span>`
                        : `<span class="slot-plus">+</span>`;
      eqWrap.appendChild(div);
    }
  }
  if (unWrap) {
    unWrap.innerHTML = '';
    un.forEach(m => {
      const d = document.createElement('div');
      d.className = 'move-chip unlocked';
      d.dataset.move = m.id;
      d.textContent = m.move_key;
      unWrap.appendChild(d);
    });
  }
}

async function equipMove(moveId, slot){
  if (!petId) return;

  try {
    // chiave della mossa scelta
    const { data: row, error: e0 } = await supabaseClient
      .from('pet_moves')
      .select('move_key')
      .eq('id', moveId)
      .single();
    if (e0 || !row) { console.error('[equipMove get key]', e0); return; }
    const key = row.move_key;

    // già equipaggiata altrove?
    const { data: clash, error: eC } = await supabaseClient
      .from('pet_moves')
      .select('id, slot')
      .eq('pet_id', petId)
      .eq('equipped', true)
      .eq('move_key', key)
      .neq('id', moveId);
    if (eC) console.error('[equipMove clash]', eC);

    if (Array.isArray(clash) && clash.length){
      alert('Questa mossa è già equipaggiata in un altro slot.');
      return;
    }

    // libera lo slot target
    await supabaseClient
      .from('pet_moves').update({ equipped:false, slot:null })
      .eq('pet_id', petId).eq('slot', slot);

    // equipaggia questa
    await supabaseClient
      .from('pet_moves').update({ equipped:true, slot })
      .eq('id', moveId).eq('pet_id', petId);

    await loadMoves();
  } catch (err) {
    console.error('[equipMove guarded]', err);
  }
  const { error: e2 } = await supabaseClient
  .from('pet_moves').update({ equipped:true, slot })
  .eq('id', itemId).eq('pet_id', petId);
if (e2) {
  if (e2.code === '23505') showArenaToast('Questa mossa è già equipaggiata', true);
  else console.error('[equipMove-set]', e2);
}

}



function bindMoveUIOnce(){
  if (document.body._movesBound) return;
  document.body._movesBound = true;

  document.body.addEventListener('click', (e) => {
    const slotEl = e.target.closest('#moves-equipped .move-slot');
    if (slotEl){
      const slot = parseInt(slotEl.dataset.slot, 10);
      // se clicchi su un "+" apri un mini-picker costruito dai "unlocked"
      const list = [...document.querySelectorAll('#moves-unlocked .move-chip.unlocked')];
      if (!list.length) return;
      // semplice: assegna la prima disponibile (oppure costruisci un menu tuo)
      const first = list[0].dataset.move;
      equipMove(first, slot);
      return;
    }

    // clic su mossa non equipaggiata → scegli tu lo slot (primo libero)
    const chip = e.target.closest('#moves-unlocked .move-chip.unlocked');
    if (chip){
      const moveId = chip.dataset.move;
      const used = new Set([...document.querySelectorAll('#moves-equipped .move-chip')]
        .map(el => el.parentElement?.dataset.slot));
      let slot = [1,2,3].find(s => !used.has(String(s)));
      if (!slot) slot = 1; // se pieni, rimpiazza slot 1
      equipMove(moveId, slot);
    }
  });
}

// ---------- INVENTARIO ----------
async function loadItems(){
  if (!petId) return;
  const { data, error } = await supabaseClient
    .from('pet_items')
    .select('id, item_key, equipped, slot')
    .eq('pet_id', petId);
  if (error) { console.error('[loadItems]', error); return; }

  const eq = (data || []).filter(m => m.equipped).sort((a,b)=> (a.slot||0)-(b.slot||0));
  const un = (data || []).filter(m => !m.equipped);

  const eqWrap = document.getElementById('items-equipped');
  const unWrap = document.getElementById('items-unlocked');
  if (eqWrap) {
    eqWrap.innerHTML = '';
    for (let i=1;i<=4;i++){
      const it = eq.find(x => x.slot === i);
      const div = document.createElement('div');
      div.className = 'item-slot';
      div.dataset.slot = String(i);
      div.innerHTML = it ? `<span class="item-chip" data-item="${it.id}">${it.item_key}</span>`
                         : `<span class="slot-plus">+</span>`;
      eqWrap.appendChild(div);
    }
  }
  if (unWrap) {
    unWrap.innerHTML = '';
    un.forEach(it => {
      const d = document.createElement('div');
      d.className = 'item-chip unlocked';
      d.dataset.item = it.id;
      d.textContent = it.item_key;
      unWrap.appendChild(d);
    });
  }
}

async function equipItem(itemId, slot){
  const { error: e1 } = await supabaseClient
    .from('pet_items').update({ equipped:false, slot:null })
    .eq('pet_id', petId).eq('slot', slot);
  if (e1) { console.error('[equipItem-clear]', e1); }

  const { error: e2 } = await supabaseClient
    .from('pet_items').update({ equipped:true, slot })
    .eq('id', itemId).eq('pet_id', petId);
  if (e2) { console.error('[equipItem-set]', e2); }
  await loadItems();
}

function bindItemUIOnce(){
  if (document.body._itemsBound) return;
  document.body._itemsBound = true;

  document.body.addEventListener('click', (e) => {
    const slotEl = e.target.closest('#items-equipped .item-slot');
    if (slotEl){
      const slot = parseInt(slotEl.dataset.slot, 10);
      const list = [...document.querySelectorAll('#items-unlocked .item-chip.unlocked')];
      if (!list.length) return;
      const first = list[0].dataset.item;
      equipItem(first, slot);
      return;
    }
    const chip = e.target.closest('#items-unlocked .item-chip.unlocked');
    if (chip){
      const itemId = chip.dataset.item;
      const used = new Set([...document.querySelectorAll('#items-equipped .item-chip')]
        .map(el => el.parentElement?.dataset.slot));
      let slot = [1,2,3,4].find(s => !used.has(String(s)));
      if (!slot) slot = 1;
      equipItem(itemId, slot);
    }
  });
}


function expForNextLevel(level) {
  return Math.round(100 * Math.pow(1.2, level - 1));
}

async function getStateFromDb() {
  if (!petId) return;
  const { data: state } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  if (state) {
    let level = (typeof state.level === 'number' && !isNaN(state.level)) ? state.level : 1;
    let exp   = (typeof state.exp === 'number' && !isNaN(state.exp)) ? state.exp : 0;
    updateBars(state.hunger, state.fun, state.clean, level, exp);
    if (state.hunger === 0 || state.fun === 0 || state.clean === 0) {
      alive = false;
      document.getElementById('game-over').classList.remove('hidden');
      clearInterval(autoRefresh);
    }
  }
}

function startAutoRefresh() {
  if (autoRefresh) clearInterval(autoRefresh);
  autoRefresh = setInterval(getStateFromDb, 2000);
}

async function initFlow() {
  const { data: sessionData } = await supabaseClient.auth.getUser();
  user = sessionData.user;
  if (!user) {
    showOnly('login-container');
    return;
  }
  const { data: pet } = await supabaseClient
    .from('pets')
    .select('id, egg_type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pet) {
    showOnly('egg-selection');
    return;
  }
  petId = pet.id;
  window.petId = petId;
  eggType = pet.egg_type;
  bindStatButtonsOnce();
bindMoveUIOnce();
bindItemUIOnce();

showOnly('game');
document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
await refreshUsernameBadge();
await promptUsernameIfMissing();

// dentro initFlow(), dopo aver mostrato il gioco
if (!window._statsModalBound) {
  window._statsModalBound = true;

  // Apri il modal
  document.getElementById('stats-btn')?.addEventListener('click', async () => {
    const modal = document.getElementById('stats-modal');
    modal?.classList.remove('hidden');
    await loadCombatStats();
    await loadMoves();
    await loadItems();
  });

  // Chiudi con la X
  document.getElementById('stats-close')?.addEventListener('click', () => {
    document.getElementById('stats-modal')?.classList.add('hidden');
  });

  // Chiudi cliccando fuori
  document.getElementById('stats-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'stats-modal') e.currentTarget.classList.add('hidden');
  });
}


// questa basta
await refreshResourcesWidget();

alive = true;
document.getElementById('game-over').classList.add('hidden');
await getStateFromDb();
startAutoRefresh();


}

// ---- EXP + LEVELUP
async function addExpAndMaybeLevelUp(state, inc = 0) {
  let level = (typeof state.level === 'number' && !isNaN(state.level)) ? state.level : 1;
  let exp   = (typeof state.exp === 'number' && !isNaN(state.exp)) ? state.exp : 0;
  let leveledUp = false;
  exp += inc;
  let expNext = expForNextLevel(level);

  while (exp >= expNext) {
    exp -= expNext;
    level++;
    await supabaseClient.rpc('increment_stat_points', { p_pet_id: petId, p_amount: 1 });
    leveledUp = true;
    expNext = expForNextLevel(level);
  }
  await supabaseClient.from('pet_states').update({
    level, exp, updated_at: new Date()
  }).eq('pet_id', petId);

  // Aggiorna UI
  const { data: updatedState } = await supabaseClient
    .from('pet_states')
    .select('hunger, fun, clean, level, exp')
    .eq('pet_id', petId)
    .single();
  let l = (typeof updatedState.level === 'number' && !isNaN(updatedState.level)) ? updatedState.level : 1;
  let e = (typeof updatedState.exp === 'number' && !isNaN(updatedState.exp)) ? updatedState.exp : 0;
  updateBars(updatedState.hunger, updatedState.fun, updatedState.clean, l, e);

  if (leveledUp) showLevelUpMessage();
}

// ---- MESSAGGIO LEVEL UP
function showLevelUpMessage() {
  const msg = document.createElement('div');
  msg.className = "levelup-msg";
  msg.innerHTML = "🎉 <b>Complimenti!</b> Il tuo pet è salito di livello!";
  document.querySelector(".form-box").appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}

// ---- BOTTONI GAME ----
['feed', 'play', 'clean'].forEach(action => {
  document.getElementById(`${action}-btn`).addEventListener('click', async () => {
    if (!alive) return;
    const { data: state } = await supabaseClient
      .from('pet_states')
      .select('hunger, fun, clean, level, exp')
      .eq('pet_id', petId)
      .single();
    if (!state) return;

    let hunger = state.hunger, fun = state.fun, clean = state.clean;
    let expInc = 0;

    if (action === 'feed') {
      if (hunger < 98) {
        hunger = Math.min(100, hunger + 20);
        expInc = 15;
      } else {
        hunger = Math.min(100, hunger + 20);
      }
    }
    if (action === 'play') {
      if (fun < 98) {
        fun = Math.min(100, fun + 20);
      } else {
        fun = Math.min(100, fun + 20);
      }
      // niente exp per play (escluso minigioco)
    }
    if (action === 'clean') {
      if (clean < 98) {
        clean = Math.min(100, clean + 20);
        expInc = 15;
      } else {
        clean = Math.min(100, clean + 20);
      }
    }
    await supabaseClient.from('pet_states').update({
      hunger, fun, clean, updated_at: new Date()
    }).eq('pet_id', petId);

    if (expInc > 0) {
      await addExpAndMaybeLevelUp(state, expInc);
      showExpGainLabel(expInc);
    } else {
      const { data: updatedState } = await supabaseClient
        .from('pet_states')
        .select('hunger, fun, clean, level, exp')
        .eq('pet_id', petId)
        .single();
      let l = (typeof updatedState.level === 'number' && !isNaN(updatedState.level)) ? updatedState.level : 1;
      let e = (typeof updatedState.exp === 'number' && !isNaN(updatedState.exp)) ? updatedState.exp : 0;
      updateBars(updatedState.hunger, updatedState.fun, updatedState.clean, l, e);
    }
  });
});
// Etichetta "+EXP" sopra la barra
window.showExpGainLabel = function(expAmount) {
  const el = document.getElementById('exp-gain-label');
  if (!el) {
    console.warn('[UI] exp-gain-label non trovato');
    return;
  }

  // testo
  el.textContent = `+${expAmount} exp`;

  // mostra
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.transform = 'translateY(-50%) scale(1)';
  el.style.zIndex = '9999';     // assicura che stia sopra al resto

  // fade-out
  setTimeout(() => {
    el.style.opacity = '0';
  }, 1000);

  // nascondi dopo il fade
  setTimeout(() => {
    el.style.display = 'none';
  }, 1700);
};

// --- SELEZIONE UOVO ---
document.querySelectorAll('.egg.selectable').forEach(img =>
  img.addEventListener('click', () => {
    document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    eggType = Number(img.dataset.egg);
    document.getElementById('confirm-egg-btn').disabled = false;
  })
);

document.getElementById('confirm-egg-btn').addEventListener('click', async () => {
  const { data: sessionData } = await supabaseClient.auth.getUser();
  user = sessionData.user;
  if (!eggType || !user || !user.id) {
    alert("Utente non autenticato!");
    return;
  }
  const { data, error } = await supabaseClient
    .from('pets')
    .insert({ user_id: user.id, egg_type: eggType })
    .select('id')
    .single();
  if (error) {
    alert('Errore creazione pet: ' + error.message);
    return;
  }
  petId = data.id;
  window.petId = petId;
   await supabaseClient.from('pet_states').insert({
    pet_id: petId, hunger: 100, fun: 100, clean: 100, level: 1, exp: 0, updated_at: new Date()
  });

    // ✅ MOSSE DI DEFAULT (slot 1 e 2 già equipaggiate)
  try {
    await supabaseClient.from('pet_moves').insert([
      { pet_id: petId, move_key: 'basic_attack', equipped: true, slot: 1 },
      { pet_id: petId, move_key: 'repulse',      equipped: true, slot: 2 },
    ]);
  } catch (e) {
    console.error('[default moves insert]', e);
  }

  showOnly('game');
 
  document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;
  alive = true;
  document.getElementById('game-over').classList.add('hidden');
  await getStateFromDb();
  startAutoRefresh();

  await refreshUsernameBadge();
  await promptUsernameIfMissing();
});



// --- LOGOUT ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
const u = document.getElementById('username-label');
if (u) u.textContent = '—';
  setText('wallet-gettoni', '0');
  setText('wallet-ottoni', '0');
  setText('totale-gettoni', '0');

  showOnly('login-container');
});

}
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('auth-form');
  document.getElementById('login-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    form?.requestSubmit();
  });
});

// --- LOGIN/SIGNUP ---
const authForm = document.getElementById('auth-form');
const signupBtn = document.getElementById('signup-btn');
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: sessionData } = await supabaseClient.auth.getUser();
    user = sessionData.user;
    //showOnly('egg-selection');
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
    const { data: sessionData } = await supabaseClient.auth.getUser();
    user = sessionData.user;
    showOnly('egg-selection');
    await initFlow();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

// --- AUTO LOGIN SE GIA' LOGGATO ---
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
  if (currentUser) {
    user = currentUser;
    await initFlow();
  } else {
    showOnly('login-container');
  }
   const selectModal   = document.getElementById('minigame-select-modal');
  const treasureModal = document.getElementById('treasure-minigame-modal');
  const playBtn       = document.getElementById('play-btn');
  const startTreasure = document.getElementById('btn-minigame-treasure');
  const cancelBtn     = document.getElementById('btn-minigame-cancel');
  //await requestLandscape();
const openArena = document.getElementById('btn-minigame-arena');
openArena?.addEventListener('click', () => {
  document.getElementById('minigame-select-modal')?.classList.add('hidden');
  if (typeof window.startArenaMinigame === 'function') {
    window.startArenaMinigame();
  }
});

  // --- CLASSIFICA: bind bottoni/apertura/chiusura ---
const lbOpenBtn  = document.getElementById('btn-open-leaderboard');
const lbCloseBtn = document.getElementById('leaderboard-close');
const lbModal    = document.getElementById('leaderboard-modal');

lbOpenBtn?.addEventListener('click', () => {
  // window.openLeaderboardModal è definita sopra in script.js
  window.openLeaderboardModal();
});

lbCloseBtn?.addEventListener('click', () => {
  window.closeLeaderboardModal();
});

// chiusura cliccando fuori dal pannello
lbModal?.addEventListener('click', (e) => {
  if (e.target === lbModal) window.closeLeaderboardModal();
});

// chiusura con ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lbModal.classList.contains('hidden')) {
    window.closeLeaderboardModal();
  }
});


  // Apri selettore
  playBtn?.addEventListener('click', () => {
    treasureModal?.classList.add('hidden');     // nascondi il dungeon se fosse aperto
    selectModal?.classList.remove('hidden');    // mostra il selettore
  });

  // Avvia “Caccia al Tesoro”
  startTreasure?.addEventListener('click', () => {
    selectModal?.classList.add('hidden');
    treasureModal?.classList.remove('hidden');
    //resizeTreasureCanvas();
    //startTreasureMinigame();
  });

  // CHIUDI selettore
  cancelBtn?.addEventListener('click', () => {
    selectModal?.classList.add('hidden');
  });

  // Chiudi anche cliccando fuori dalla card
  selectModal?.addEventListener('click', (e) => {
    if (e.target === selectModal) selectModal.classList.add('hidden');
  });

});



// --- SCEGLI NUOVO UOVO / LOGOUT PERSONALIZZATO ---
document.getElementById('choose-egg-btn').addEventListener('click', () => {
  petId = null;
  window.petId = null;
  eggType = null;
  alive = true;
  showOnly('egg-selection');
  
  document.querySelectorAll('.egg.selectable').forEach(i => i.classList.remove('selected'));
  document.getElementById('confirm-egg-btn').disabled = true;
});
document.getElementById('exit-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showOnly('login-container');
});

document.addEventListener('gesturestart', function (e) {
  e.preventDefault();
});
document.addEventListener('dblclick', function (e) {
  e.preventDefault();
});







// Assumo che tu abbia già creato il client altrove come:
// const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Se non esiste, scommenta questa riga:
// const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

(function setupForgotPasswordUI(){
  const link   = document.getElementById('forgot-link');
  const modal  = document.getElementById('forgot-modal');
  const form   = document.getElementById('forgot-form');
  const emailI = document.getElementById('forgot-email');
  const cancel = document.getElementById('forgot-cancel');
  const msg    = document.getElementById('forgot-msg');

  if (!link || !modal || !form) return;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    msg.textContent = '';
    emailI.value = document.getElementById('email-input')?.value || '';
    modal.classList.remove('hidden');
  });

  cancel.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailI.value.trim();
    if (!email) return;

    // pagina di reset ospitata sullo stesso dominio
    const redirectTo = `${location.origin}/reset-password.html`;

    // messaggio neutro (privacy)
    msg.style.color = ''; // reset
    msg.textContent = 'Se esiste un account con questa email, riceverai un link di reset.';

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) console.error('[resetPasswordForEmail]', error);
      setTimeout(()=> modal.classList.add('hidden'), 1000);
    } catch (err) {
      console.error('[forgot submit]', err);
      // manteniamo il messaggio neutro
    }
  });
})();

// Ritorna le prime 2 mosse equipaggiate in ordine di slot (1..3)
window.getEquippedMovesForArena = async function () {
  if (!window.petId) return ['basic_attack', 'repulse']; // fallback
  try {
    const { data, error } = await supabaseClient
      .from('pet_moves')
      .select('move_key, slot, equipped')
      .eq('pet_id', petId)
      .eq('equipped', true)
      .order('slot', { ascending: true })
      .limit(2);
    if (error) throw error;

    const keys = (data || []).map(r => r.move_key);
    // fallback intelligenti
    if (keys.length === 0) return ['basic_attack', 'repulse'];
    if (keys.length === 1) return [keys[0], 'repulse'];
    return keys;
  } catch (e) {
    console.error('[getEquippedMovesForArena]', e);
    return ['basic_attack', 'repulse'];
  }
};

// (opzionale) Stat d’attacco per scalare il danno
window.getArenaPlayerAttackStat = async function () {
  if (!window.petId) return 0;
  try {
    const { data, error } = await supabaseClient
      .from('pet_states')
      .select('attack, attack_power')
      .eq('pet_id', petId)
      .single();
    if (error) throw error;

    // scegli tu la formula, questa è semplice e non esplosiva
    const atk = Number(data?.attack) || 0;
    const pow = Number(data?.attack_power) || 0;
    return Math.round(atk * 0.15 + pow * 0.10);
  } catch (e) {
    console.error('[getArenaPlayerAttackStat]', e);
    return 0;
  }
};
