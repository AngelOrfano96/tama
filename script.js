let hunger = 100, fun = 100, clean = 100;
let alive = true;

function updateBars() {
  document.getElementById('hunger-bar').style.width = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').style.width = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').style.width = `${Math.round(clean)}%`;
  document.getElementById('hunger-bar').textContent = `${Math.round(hunger)}%`;
  document.getElementById('fun-bar').textContent = `${Math.round(fun)}%`;
  document.getElementById('clean-bar').textContent = `${Math.round(clean)}%`;
}

function resetBars() {
  hunger = fun = clean = 100;
  alive = true;
  updateBars();
}

document.getElementById('feed-btn').onclick = () => { if(alive) hunger = Math.min(100, hunger + 20); updateBars(); }
document.getElementById('play-btn').onclick = () => { if(alive) fun = Math.min(100, fun + 20); updateBars(); }
document.getElementById('clean-btn').onclick = () => { if(alive) clean = Math.min(100, clean + 20); updateBars(); }

setInterval(() => {
  if (!alive) return;
  hunger = Math.max(0, hunger - 0.2);
  fun = Math.max(0, fun - 0.15);
  clean = Math.max(0, clean - 0.12);
  updateBars();
  if (hunger === 0 || fun === 0 || clean === 0) {
    alive = false;
    document.getElementById('game-over').classList.remove('hidden');
  }
}, 1000);

updateBars();
