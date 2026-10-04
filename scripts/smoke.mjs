import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true,
  args: ['--no-sandbox'],
});
const baseUrl = process.env.GAME_URL || 'http://127.0.0.1:5173';
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => window.__ember.snapshot());
const wait = ms => page.waitForTimeout(ms);
let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }

try {
  await mkdir('.playwright', { recursive: true });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__ember);
  await page.evaluate(() => document.fonts.ready);
  await wait(250);
  await page.screenshot({ path: '.playwright/title.png', fullPage: true });
  check((await state()).mode === 'title', 'Title screen is displayed');

  // Real input only: the telemetry API returns a copy and cannot alter the game.
  await page.locator('#start-button').click();
  await wait(1700);
  let snapshot = await state();
  check(snapshot.mode === 'playing' && snapshot.wave === 1 && snapshot.enemies.length === 3, 'First wave actually spawns');
  const oldX = snapshot.hero.x;
  await page.keyboard.down('d'); await wait(200); await page.keyboard.up('d');
  check((await state()).hero.x > oldX + 25, 'Movement responds to keyboard');
  await page.keyboard.press('Escape'); const paused = await state(); await wait(350);
  snapshot = await state();
  check(snapshot.mode === 'paused' && snapshot.time === paused.time, 'Pause freezes the simulation');
  await page.locator('#resume-button').click();
  check((await state()).mode === 'playing', 'Resume returns to battle');

  // Both bindings can be held; releasing one leaves the other active.
  await page.keyboard.down('d'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
  const dualX = (await state()).hero.x; await wait(150); await page.keyboard.up('d');
  check((await state()).hero.x > dualX + 15, 'Alternate movement bindings do not cancel each other');
  await page.keyboard.press('Space'); await wait(50); snapshot = await state();
  check(snapshot.hero.dodge > 0 && snapshot.hero.invincible > 0, 'Dodge grants invulnerability');
  await wait(400); const mana = (await state()).hero.mana;
  await page.keyboard.press('k'); await wait(100);
  check((await state()).hero.mana < mana - 20, 'Magic consumes a charge');
  await page.locator('#sound-button').click();
  check(await page.locator('#sound-button').getAttribute('aria-pressed') === 'true', 'Sound can be enabled');
  await page.locator('#sound-button').click();
  check(await page.locator('#sound-button').getAttribute('aria-pressed') === 'false', 'Sound can be muted');

  // Restart cleanly, then play all three waves through the real keyboard controls.
  await page.keyboard.press('Escape'); await page.locator('#quit-button').click();
  await page.locator('#start-button').click(); await wait(1700);
  const held = new Set();
  async function key(key, pressed) {
    if (pressed && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
    if (!pressed && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
  }
  const startTime = Date.now(); let hitObserved = false; let comboObserved = false;
  const wavesObserved = new Set(); let lastMagic = 0; let lastDodge = 0;
  while (Date.now() - startTime < 150_000) {
    snapshot = await state();
    if (snapshot.mode !== 'playing') break;
    wavesObserved.add(snapshot.wave);
    hitObserved ||= snapshot.enemies.some(e => e.hp < e.maxHp) || snapshot.kills > 0;
    comboObserved ||= snapshot.bestCombo >= 3;
    const h = snapshot.hero;
    const enemies = snapshot.enemies.filter(e => e.hp > 0 && e.spawn <= 0);
    const nearest = enemies.sort((a, b) => Math.hypot(a.x - h.x, (a.y - h.y) * 1.55) - Math.hypot(b.x - h.x, (b.y - h.y) * 1.55))[0];
    if (nearest) {
      const dx = nearest.x - h.x; const dy = nearest.y - h.y; const dist = Math.hypot(dx, dy * 1.55);
      await key('a', dx < -62); await key('d', dx > 62);
      await key('w', dy < -10); await key('s', dy > 10);
      await key('j', dist < 140);
      if (dist < 235 && h.mana >= 33.3 && h.magic <= 0 && Date.now() - lastMagic > 1300) {
        await page.keyboard.press('k'); lastMagic = Date.now();
      }
      if (nearest.kind === 'boss' && nearest.windup > 0 && nearest.windup < 0.34 && dist < 160 && Date.now() - lastDodge > 900) {
        await page.keyboard.press('Space'); lastDodge = Date.now();
      }
    } else { for (const k of [...held]) await key(k, false); }
    await wait(65);
  }
  for (const k of [...held]) await key(k, false);
  snapshot = await state();
  check(hitObserved, 'Sword strikes damage enemies');
  check(comboObserved, 'Repeated strikes build a combo');
  check(wavesObserved.size === 3, 'All three waves are playable');
  check(snapshot.mode === 'victory' && snapshot.kills === 10, `Full run wins against all 10 foes: ${JSON.stringify(snapshot)}`);
  check(await page.locator('#result-title').textContent() === 'And still, she stands.', 'Victory screen presents the outcome');
  await page.screenshot({ path: '.playwright/victory.png', fullPage: true });
  await page.locator('#restart-button').click(); await wait(100);
  snapshot = await state();
  check(snapshot.mode === 'playing' && snapshot.kills === 0 && snapshot.hero.hp === 100, 'Replay resets health and run stats');
  // Stop desktop before testing another tab, because background blur intentionally pauses it.
  await page.keyboard.press('Escape');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(baseUrl); await mobile.locator('#start-button').tap(); await wait(1800);
  check(await mobile.locator('#touch-controls').isVisible(), 'Touch controls appear on mobile');
  const mobileBefore = await mobile.evaluate(() => window.__ember.snapshot());
  // Actual browser touch input generates trusted pointer events and pointer capture.
  const right = mobile.locator('[data-control="right"]');
  const box = await right.boundingBox();
  assert.ok(box);
  const session = await mobile.context().newCDPSession(mobile);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 5 }] });
  await wait(200);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mobileAfter = await mobile.evaluate(() => window.__ember.snapshot());
  check(mobileAfter.hero.x > mobileBefore.hero.x + 20, 'Mobile movement responds to touch');
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout fits the screen');
  await mobile.screenshot({ path: '.playwright/mobile.png', fullPage: true });
  check(errors.length === 0, `No browser errors: ${errors.join(', ')}`);
  console.log(`PASS: ${assertions} browser checks. All 3 waves completed; ${snapshot.kills} kills after reset. Original winning run had 10 kills.`);
} finally { await browser.close(); }
