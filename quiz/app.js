import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const { url, anon } = window.__SUPABASE__
const supabase = createClient(url, anon)

// Stato
let eventId = null
let currentRun = null
let questions = []
let answers = []
let nickname = ''
const clientId = getOrCreateClientId()
let claimToken = null

// UI refs
const nicknameInput = document.getElementById('nicknameInput')
const confirmNickBtn = document.getElementById('confirmNickBtn')
const nickStatus = document.getElementById('nickStatus')
const quizPanel = document.getElementById('quizPanel')
const canvas = document.getElementById('quizCanvas')
const ctx = canvas.getContext('2d')
const verifyBtn = document.getElementById('verifyBtn')
const accessibleToggle = document.getElementById('accessibleToggle')
const accessibleDiv = document.getElementById('accessible')
const resultDiv = document.getElementById('result')
const claimBtn = document.getElementById('claimBtn')
const boardEl = document.getElementById('scoreboard')
const bannerEl = document.getElementById('winnerBanner')

// Anti-copy handlers
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['c','x','s','p'].includes(e.key.toLowerCase())) e.preventDefault()
})

// Bootstrap
init()

async function init() {
  // 1) trova evento (aperto, altrimenti ultimo)
  let { data: ev, error } = await supabase
    .from('events').select('id, title, winner_username, is_claimable')
    .eq('is_open', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!ev) {
    const r = await supabase.from('events').select('id, title, winner_username, is_claimable').order('created_at', { ascending: false }).limit(1).maybeSingle()
    ev = r.data
  }
  if (!ev) { bannerEl.classList.remove('hidden'); bannerEl.textContent = 'Nessun evento disponibile.'; return }
  eventId = ev.id

  // 2) inizializza scoreboard + realtime
  await refreshScoreboard()
  subscribeRealtime()
  updateBanner(ev)
}

function updateBanner(ev) {
  if (!ev) return
  bannerEl.classList.remove('hidden')
  if (ev.winner_username) {
    bannerEl.innerHTML = `Premio assegnato a <b>${escapeHtml(ev.winner_username)}</b> 🏆`
  } else if (ev.is_claimable) {
    bannerEl.textContent = 'Premio disponibile — sii il primo a fare 15/15!'
  } else {
    bannerEl.textContent = 'Premio non claimabile'
  }
}

confirmNickBtn.addEventListener('click', async () => {
  const raw = nicknameInput.value.trim()
  if (!/^@?[A-Za-z0-9_\.]{2,20}$/.test(raw)) {
    nickStatus.textContent = 'Nickname non valido'
    return
  }
  nickname = raw.startsWith('@') ? raw : '@' + raw
  // start_quiz
  const res = await callFn('start_quiz', { event_id: eventId, nickname, client_id: clientId })
  if (!res?.ok) { nickStatus.textContent = res?.error || 'Errore'; return }
  currentRun = res.run_id
  questions = res.questions
  answers = new Array(questions.length).fill(null)
  nickStatus.textContent = `Nickname confermato: ${nickname}`
  quizPanel.classList.remove('hidden')
  drawQuestionCanvas()
  renderAccessible()
})

verifyBtn.addEventListener('click', async () => {
  if (!currentRun) return
  // se qualche risposta è null, chiedi conferma
  const incomplete = answers.some(a => a === null)
  if (incomplete && !confirm('Hai domande senza risposta. Vuoi inviare comunque?')) return
  const res = await callFn('submit_quiz', { run_id: currentRun, answers, client_id: clientId })
  if (!res?.ok) { resultDiv.textContent = res?.error || 'Errore'; return }
  resultDiv.textContent = `Risultato: ${res.score}/15`
  if (res.perfect) {
    claimToken = res.claim_token
    claimBtn.classList.remove('hidden')
  }
  // aggiorna scoreboard dopo submit
  await refreshScoreboard()
})

claimBtn.addEventListener('click', async () => {
  if (!currentRun || !claimToken) return
  const res = await callFn('claim_prize', { run_id: currentRun, claim_token: claimToken, event_id: eventId })
  if (!res?.ok) { alert(res?.error || 'Errore claim'); return }
  if (res.winner_assigned) {
    alert(`Sei il PRIMO! Premio assegnato a ${nickname}`)
  } else {
    alert('Qualcuno ha già reclamato il premio prima di te 😢')
  }
})

function drawQuestionCanvas() {
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0,0,W,H)
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,W,H)
  ctx.fillStyle = '#111'; ctx.font = '20px system-ui'

  const pad = 20
  const lineH = 26

  questions.forEach((q, qi) => {
    const y = pad + qi * 38
    // domanda (numero + testo, tronca)
    const qText = `${qi+1}. ${q.question}`
    drawText(ctx, qText, pad, y)

    // opzioni come pill a destra (A,B,C,D)
    const baseX = 460
    q.options.forEach((opt, oi) => {
      const label = ['A','B','C','D'][oi]
      const chosen = answers[qi] === oi
      const txt = `${label}) ${opt}`
      const w = Math.min(400, measureText(ctx, txt) + 18)
      const x = baseX
      const oy = y - 18 + oi * 22
      roundedRect(ctx, x, oy, w, 22, 8, chosen ? '#1a73e8' : '#e5e7eb')
      ctx.fillStyle = chosen ? '#fff' : '#111'
      drawText(ctx, truncate(txt, 64), x + 9, oy + 16)
    })
  })
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  // hit test sulle opzioni (area 460..860, righe 22px)
  questions.forEach((q, qi) => {
    const baseX = 460
    const baseY = 20 + qi * 38 - 18
    q.options.forEach((opt, oi) => {
      const txt = `${['A','B','C','D'][oi]}) ${opt}`
      const w = Math.min(400, measureText(ctx, txt) + 18)
      const rx = baseX, ry = baseY + oi * 22, rw = w, rh = 22
      if (x >= rx && x <= rx+rw && y >= ry && y <= ry+rh) {
        answers[qi] = oi
        drawQuestionCanvas()
      }
    })
  })
})

accessibleToggle.addEventListener('click', () => {
  accessibleDiv.classList.toggle('hidden')
})

function renderAccessible() {
  const form = document.createElement('div')
  form.innerHTML = ''
  questions.forEach((q, qi) => {
    const f = document.createElement('fieldset')
    const lg = document.createElement('legend')
    lg.textContent = `${qi+1}. ${q.question}`
    f.appendChild(lg)
    q.options.forEach((opt, oi) => {
      const id = `q${qi}_o${oi}`
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'radio'; input.name = `q${qi}`; input.id = id; input.value = String(oi)
      input.addEventListener('change', () => { answers[qi] = oi; drawQuestionCanvas() })
      label.setAttribute('for', id)
      label.textContent = `${['A','B','C','D'][oi]}) ${opt}`
      const row = document.createElement('div')
      row.appendChild(input); row.appendChild(label)
      f.appendChild(row)
    })
    form.appendChild(f)
  })
  accessibleDiv.replaceChildren(form)
}

async function refreshScoreboard() {
  if (!eventId) return
  const { data } = await supabase
    .from('scoreboard')
    .select('nickname,best_score,is_winner,submitted_at,perfect_at')
    .eq('event_id', eventId)
    .order('is_winner', { ascending: false })
    .order('best_score', { ascending: false })
    .order('submitted_at', { ascending: true })
    .limit(50)
  renderBoard(data || [])
}

function renderBoard(rows) {
  boardEl.innerHTML = ''
  rows.forEach(r => {
    const li = document.createElement('li')
    const left = document.createElement('span')
    left.textContent = `${r.nickname} — ${r.best_score}/15${r.best_score===15 ? ' (perfetto!)' : r.best_score>=12 ? ' (c\'era quasi!)' : ''}`
    const right = document.createElement('span')
    right.className = 'badge' + (r.is_winner ? ' win' : '')
    right.textContent = r.is_winner ? 'WINNER' : ' '
    li.appendChild(left); li.appendChild(right)
    boardEl.appendChild(li)
  })
}

function subscribeRealtime() {
  const ch = supabase
    .channel('live-'+eventId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scoreboard', filter: `event_id=eq.${eventId}` }, async (payload) => {
      await refreshScoreboard()
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, (payload) => {
      updateBanner(payload.new)
    })
    .subscribe()
}

async function callFn(name, body) {
  try {
    const resp = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${anon}` },
      body: JSON.stringify(body)
    })
    return await resp.json()
  } catch (e) {
    console.error(e); return { ok:false, error: 'network error' }
  }
}

function getOrCreateClientId() {
  let v = localStorage.getItem('client_id')
  if (!v) { v = crypto.randomUUID(); localStorage.setItem('client_id', v) }
  return v
}

// Canvas helpers
function drawText(ctx, text, x, y) {
  ctx.fillStyle = '#111';
  ctx.fillText(text, x, y)
}
function measureText(ctx, text) { return ctx.measureText(text).width }
function truncate(s, n) { return s.length>n ? s.slice(0,n-1)+'…' : s }
function roundedRect(ctx, x,y,w,h,r, fill='#e5e7eb') {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function escapeHtml(str) { return str.replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])) }