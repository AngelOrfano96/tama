const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

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

window.openLeaderboardModal = async function() {
  const modal = document.getElementById('leaderboard-modal');
  const body  = document.getElementById('leaderboard-body');
  if (!modal || !body) return;

  modal.classList.remove('hidden');
  body.innerHTML = '<li class="lb-item">Caricamento…</li>';

  const rows = await loadLeaderboardTop(20);
  if (!rows.length) {
    body.innerHTML = '<li class="lb-item">Ancora nessun punteggio.</li>';
    return;
  }

  body.innerHTML = rows.map((r, i) => {
    const rank = i + 1;
    const name = r.username_snapshot || 'Anon';
    return `
      <li class="lb-item ${rank<=3 ? 'top'+rank : ''}">
        <span class="rank">${rank}</span>
        <span class="name">@${name}</span>
        <span class="score">${r.best_score}</span>
        <span class="level">L${r.best_level}</span>
      </li>`;
  }).join('');
};

window.closeLeaderboardModal = function() {
  document.getElementById('leaderboard-modal')?.classList.add('hidden');
};

let user = null;
let petId = null;
let eggType = null;
let alive = true;
let autoRefresh = null;

// ========== FUNZIONI PRINCIPALI (NON TOCCARE QUESTE PARTI SE NON NECESSARIO) ==========

// Mostra/hide
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showOnly(id) {
  ['login-container', 'egg-selection', 'game'].forEach(section => {
    if (section === id) show(section); else hide(section);
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
  eggType = pet.egg_type;
showOnly('game');
document.getElementById('pet').src = `assets/pets/pet_${eggType}.png`;

// questa basta
await refreshResourcesWidget();

alive = true;
document.getElementById('game-over').classList.add('hidden');
await getStateFromDb();
startAutoRefresh();

// niente optional-chaining in call:
await refreshUsernameBadge();      // mostra il badge se c'è
await promptUsernameIfMissing();   // se manca, mostra la modal


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
  showOnly('game');
  await supabaseClient.from('pet_states').insert({
    pet_id: petId, hunger: 100, fun: 100, clean: 100, level: 1, exp: 0, updated_at: new Date()
  });
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

  setText('wallet-gettoni', '0');
  setText('wallet-ottoni', '0');
  setText('totale-gettoni', '0');

  showOnly('login-container');
});

}

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
    showOnly('egg-selection');
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
/*function requestLandscape() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(err => {
      console.warn('Impossibile forzare landscape:', err);
    });
  } else {
    console.log('Blocco orientamento non supportato dal browser');
  }
}*/

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


