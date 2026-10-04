import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import './style.css';
import { Game, type Mode, type Action } from './game';
import { Renderer } from './renderer';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
};

const canvas = $<HTMLCanvasElement>('game');
const frame = $('game-frame');
const overlay = $('overlay');
let bannerTimer: ReturnType<typeof setTimeout>;

function updateHud() {
  const health = Math.max(0, game.hero.hp);
  $('health-fill').style.width = `${health}%`;
  document.querySelector('.health-track')?.setAttribute('aria-valuenow', String(Math.round(health)));
  for (let i = 1; i <= 3; i++) $(`ember-${i}`).classList.toggle('charged', game.hero.mana >= i * 33.3 - 0.1);
  const count = game.enemies.filter(e => e.hp > 0).length;
  $('wave-label').textContent = game.mode === 'title' ? 'THE HOLLOW SANCTUM' : game.wave === 3 ? 'THE FINAL STAND' : 'THE HOLLOW SANCTUM';
  $('wave-value').textContent = game.mode === 'title' ? 'AWAITING A HERO' : `WAVE ${Math.max(1, game.wave)} / 3`;
  $('enemies-left').textContent = game.mode === 'title' ? '' : count > 0 ? `${count} ${count === 1 ? 'FOE REMAINS' : 'FOES REMAIN'}` : 'THE SANCTUM FALLS SILENT';
  $('combo-count').textContent = String(game.combo);
  $('combo-display').classList.toggle('visible', game.mode === 'playing' && game.combo >= 2);
}

function updateMode(mode: Mode) {
  frame.dataset.mode = mode;
  frame.classList.toggle('playing', mode === 'playing');
  overlay.hidden = mode === 'playing';
  overlay.classList.toggle('centered', mode !== 'title');
  $('start-card').hidden = mode !== 'title';
  $('pause-card').hidden = mode !== 'paused';
  $('result-card').hidden = mode !== 'victory' && mode !== 'defeat';
  $('arena-caption').style.opacity = mode === 'title' || mode === 'playing' ? '1' : '0';
  $('status-label').textContent = { title: 'READY WHEN YOU ARE', playing: 'THE EMBERS ARE ALIVE', paused: 'A MOMENT OF STILLNESS', victory: 'THE LIGHT RETURNS', defeat: 'EVERY LEGEND GETS ANOTHER TRY' }[mode];
  $('pause-button').setAttribute('aria-label', mode === 'paused' ? 'Resume game' : 'Pause game');
  if (mode !== 'playing') { clearTimeout(bannerTimer); $('wave-banner').classList.remove('visible'); }
  if (mode === 'victory' || mode === 'defeat') {
    const victory = mode === 'victory';
    $('result-kicker').textContent = victory ? 'THE SANCTUM IS YOURS' : 'THE FIRE IS NEVER TRULY GONE';
    $('result-title').textContent = victory ? 'And still, she stands.' : 'Even embers rise again.';
    $('result-description').textContent = victory ? 'The Warden has fallen. Dawn finds its way through the ruins.' : 'Watch for the golden warning. Dodge the blow. Come back stronger.';
    $('stat-defeated').textContent = String(game.kills);
    $('stat-combo').textContent = String(game.bestCombo);
    $('stat-time').textContent = `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
    requestAnimationFrame(() => $('restart-button').focus({ preventScroll: true }));
  } else if (mode === 'paused') requestAnimationFrame(() => $('resume-button').focus({ preventScroll: true }));
  else if (mode === 'playing') canvas.focus({ preventScroll: true });
  else requestAnimationFrame(() => $('start-button').focus({ preventScroll: true }));
  document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed'));
  updateHud();
}

const game = new Game({
  mode: updateMode,
  hud: updateHud,
  banner(kicker, title) {
    clearTimeout(bannerTimer);
    $('banner-kicker').textContent = kicker; $('banner-title').textContent = title;
    $('wave-banner').classList.add('visible');
    bannerTimer = setTimeout(() => $('wave-banner').classList.remove('visible'), 2300);
  }
});
const renderer = new Renderer(canvas, game);
updateMode('title');

const start = () => { void game.audio.unlock().catch(() => {}); game.start(); };
$('start-button').addEventListener('click', start);
$('restart-button').addEventListener('click', start);
$('resume-button').addEventListener('click', () => { if (game.mode === 'paused') game.pause(); });
$('quit-button').addEventListener('click', () => game.title());
$('pause-button').addEventListener('click', () => game.pause());

const keyMap: Record<string, Action> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'attack', Space: 'dodge', KeyK: 'magic',
};
// Track each input source separately. Releasing ArrowRight must not cancel a held D.
const activeKeys = new Map<string, Action>();
const touchInputs = new Map<number, Action>();
let mouseAttack = false;
function syncRelease(action: Action) {
  if (![...activeKeys.values(), ...touchInputs.values()].includes(action) && !(action === 'attack' && mouseAttack)) game.release(action);
}
function clearControls() { activeKeys.clear(); touchInputs.clear(); mouseAttack = false; game.clearInput(); document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed')); }

window.addEventListener('keydown', event => {
  if (event.code === 'Escape') { if (game.mode === 'playing' || game.mode === 'paused') { event.preventDefault(); clearControls(); game.pause(); } return; }
  const action = keyMap[event.code];
  // Preserve native Space/Enter activation of buttons on menu screens.
  if (!action || game.mode !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (!event.repeat) { activeKeys.set(event.code, action); game.press(action); }
});
window.addEventListener('keyup', event => { const action = activeKeys.get(event.code); if (action) { activeKeys.delete(event.code); syncRelease(action); } });
window.addEventListener('blur', () => { clearControls(); if (game.mode === 'playing') game.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearControls(); if (game.mode === 'playing') game.pause(); } });

canvas.addEventListener('pointerdown', event => {
  if (game.mode !== 'playing' || event.pointerType === 'touch') return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  if (event.button === 0) {
    const rect = canvas.getBoundingClientRect(); const scale = Math.max(rect.width / 1280, rect.height / 720);
    const worldX = (event.clientX - rect.left - rect.width / 2) / scale + 640 + renderer.cameraX;
    game.hero.face = worldX >= game.hero.x ? 1 : -1;
    mouseAttack = true; game.press('attack'); canvas.setPointerCapture(event.pointerId);
  } else if (event.button === 2) game.press('magic');
});
canvas.addEventListener('pointerup', event => { if (event.button === 0) { mouseAttack = false; syncRelease('attack'); } if (event.button === 2) game.release('magic'); });
canvas.addEventListener('pointercancel', () => { mouseAttack = false; syncRelease('attack'); });
canvas.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const action = button.dataset.control as Action;
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); if (game.mode !== 'playing') return;
    button.setPointerCapture(event.pointerId); touchInputs.set(event.pointerId, action);
    button.classList.add('pressed'); game.press(action);
  });
  const release = (event: PointerEvent) => {
    touchInputs.delete(event.pointerId); syncRelease(action);
    if (![...touchInputs.values()].includes(action)) button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});

$('sound-button').addEventListener('click', () => {
  const enabled = game.audio.toggle();
  $('sound-button').setAttribute('aria-pressed', String(enabled));
  $('sound-button').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
  document.getElementById('sound-waves')?.setAttribute('d', enabled ? 'M15 8q5 4 0 8m3-11q8 7 0 14' : 'm16 9 6 6m0-6-6 6');
  if (enabled) setTimeout(() => game.audio.play('wave'), 80);
});
$('fullscreen-button').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.requestFullscreen(); }
  catch { $('fullscreen-button').title = 'Fullscreen is unavailable in this browser'; }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});

let lastTime = performance.now();
function tick(now: number) {
  const dt = Math.min(0.033, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  game.update(dt); renderer.render(); requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Read-only development telemetry used by the browser smoke test.
if (import.meta.env.DEV) Object.defineProperty(window, '__ember', { value: Object.freeze({ snapshot: () => game.snapshot() }), configurable: false });
