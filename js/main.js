import { createStackState, dropSlab, stepStack } from './engine.js';
import { WarmStackAudio } from './audio.js';
import { ArchitecturalStackRenderer } from './renderer3d.js';

const BEST_KEY = 'carter_stack_best_v1';

const canvas = document.getElementById('tower');
const hudScore = document.getElementById('hud-score');
const hudSub = document.getElementById('hud-sub');
const muteBtn = document.getElementById('mute-btn');
const iconOn = document.getElementById('icon-on');
const iconOff = document.getElementById('icon-off');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const audio = new WarmStackAudio();
const renderer = new ArchitecturalStackRenderer(canvas);

const state = createStackState();
state.best = Number(localStorage.getItem(BEST_KEY) || 0);

function syncHud() {
  hudScore.textContent = String(state.score);
  if (state.phase === 'ready') {
    hudSub.textContent = 'TAP OR SPACE';
    hudSub.hidden = false;
  } else if (state.phase === 'over') {
    hudSub.textContent = `BEST ${state.best} · TAP TO REBUILD`;
    hudSub.hidden = false;
  } else {
    hudSub.hidden = true;
  }
}

function handleTap() {
  audio.ensure();
  const res = dropSlab(state);
  if (res.started || res.restarted) {
    audio.playStart();
  } else if (res.perfect) {
    audio.playPerfect(res.streak, res.expanded);
    localStorage.setItem(BEST_KEY, String(state.best));
  } else if (res.placed) {
    audio.playSlice(state.score);
    localStorage.setItem(BEST_KEY, String(state.best));
  } else if (res.missed) {
    audio.playMiss();
    localStorage.setItem(BEST_KEY, String(state.best));
  }
  syncHud();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  handleTap();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowDown') {
    if (document.activeElement === muteBtn && (e.code === 'Space' || e.key === 'Enter')) return;
    e.preventDefault();
    handleTap();
  }
});

window.addEventListener('resize', () => renderer.resize());

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  iconOn.hidden = audio.muted;
  iconOff.hidden = !audio.muted;
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
});

syncHud();

let lastTs = performance.now();
function loop(now) {
  const dt = Math.min(0.035, Math.max(0.001, (now - lastTs) / 1000));
  lastTs = now;

  stepStack(state, dt);
  renderer.render(state, dt, reducedMotion.matches);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
