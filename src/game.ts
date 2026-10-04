import { AudioEngine } from './audio';

export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR = { left: 85, right: 1195, top: 440, bottom: 653 };
export type Mode = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';
export type EnemyKind = 'sentinel' | 'wraith' | 'boss';
export type Action = 'up' | 'down' | 'left' | 'right' | 'attack' | 'dodge' | 'magic';
export interface Hero {
  x: number; y: number; face: number; hp: number; mana: number; step: number;
  moving: boolean; attack: number; attackDuration: number; attackHit: boolean;
  comboStage: number; comboWindow: number; invincible: number; dodge: number;
  dodgeCooldown: number; dodgeX: number; dodgeY: number; flash: number; magic: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; face: number; hp: number; maxHp: number;
  step: number; moving: boolean; windup: number; windupMax: number; cooldown: number;
  flash: number; stun: number; knockX: number; knockY: number; death: number;
  spawn: number; attack: number; targetX: number; targetY: number;
}
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; gravity: number; }
export interface Ring { x: number; y: number; radius: number; life: number; max: number; color: string; kind: 'magic' | 'slash' | 'slam'; face: number; }
export interface FloatText { x: number; y: number; text: string; color: string; life: number; }
export interface Projectile { x: number; y: number; vx: number; vy: number; life: number; }
export interface Afterimage { x: number; y: number; face: number; life: number; }
export interface GameEvents { mode: (mode: Mode) => void; hud: () => void; banner: (kicker: string, title: string) => void; }

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (x: number, y: number, x2: number, y2: number) => Math.hypot(x - x2, (y - y2) * 1.55);
const random = (min: number, max: number) => min + Math.random() * (max - min);

export class Game {
  mode: Mode = 'title';
  hero: Hero = this.makeHero();
  enemies: Enemy[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  texts: FloatText[] = [];
  projectiles: Projectile[] = [];
  afterimages: Afterimage[] = [];
  held = new Set<Action>();
  audio = new AudioEngine();
  wave = 0;
  kills = 0;
  combo = 0;
  bestCombo = 0;
  comboTimeout = 0;
  time = 0;
  ambientTime = 0;
  shake = 0;
  hitStop = 0;
  nextWave = 0;
  introDelay = 0;
  magicFlash = 0;
  private nextId = 0;
  private hudTimer = 0;
  private attackQueued = false;
  private afterimageTimer = 0;

  constructor(public events: GameEvents) {}

  private makeHero(): Hero {
    return { x: 685, y: 556, face: 1, hp: 100, mana: 100, step: 0, moving: false,
      attack: 0, attackDuration: 0.35, attackHit: false, comboStage: 0, comboWindow: 0,
      invincible: 0, dodge: 0, dodgeCooldown: 0, dodgeX: 1, dodgeY: 0, flash: 0, magic: 0 };
  }

  start() {
    this.hero = this.makeHero(); this.hero.x = 520;
    this.enemies = []; this.particles = []; this.rings = []; this.texts = []; this.projectiles = []; this.afterimages = [];
    this.wave = 0; this.kills = 0; this.combo = 0; this.bestCombo = 0; this.comboTimeout = 0;
    this.time = 0; this.shake = 0; this.hitStop = 0; this.magicFlash = 0;
    this.nextWave = 0; this.introDelay = 0.8; this.attackQueued = false; this.clearInput();
    this.setMode('playing'); this.events.hud();
  }

  title() { this.hero = this.makeHero(); this.enemies = []; this.projectiles = []; this.clearInput(); this.setMode('title'); }
  setMode(mode: Mode) { this.mode = mode; this.clearInput(); this.events.mode(mode); }
  pause() { if (this.mode === 'playing') this.setMode('paused'); else if (this.mode === 'paused') this.setMode('playing'); }
  clearInput() { this.held.clear(); this.attackQueued = false; this.hero.moving = false; }
  press(action: Action) {
    if (this.mode !== 'playing') return;
    this.held.add(action);
    if (action === 'attack') { if (this.hero.attack > 0) this.attackQueued = true; else this.strike(); }
    if (action === 'dodge') this.dodge();
    if (action === 'magic') this.magic();
  }
  release(action: Action) { this.held.delete(action); }

  strike() {
    const h = this.hero;
    if (this.mode !== 'playing' || h.attack > 0 || h.dodge > 0 || h.magic > 0.2) return;
    h.comboStage = h.comboWindow > 0 ? (h.comboStage + 1) % 3 : 0;
    h.attackDuration = h.comboStage === 2 ? 0.46 : 0.31;
    h.attack = h.attackDuration; h.attackHit = false; h.comboWindow = 0.85;
    // Aim at a nearby foe when standing still, so tight groups feel good to fight.
    if (!this.held.has('left') && !this.held.has('right')) {
      const target = this.enemies.filter(e => e.hp > 0 && distance(h.x, h.y, e.x, e.y) < 150)
        .sort((a, b) => distance(h.x, h.y, a.x, a.y) - distance(h.x, h.y, b.x, b.y))[0];
      if (target) h.face = target.x >= h.x ? 1 : -1;
    }
    this.audio.play('slash');
  }

  private strikeHit() {
    const h = this.hero;
    const finisher = h.comboStage === 2;
    const reach = finisher ? 148 : 122;
    const damage = [22, 28, 42][h.comboStage];
    this.rings.push({ x: h.x, y: h.y - 43, radius: reach, life: 0.19, max: 0.19, color: finisher ? '#fbd092' : '#d8eedf', kind: 'slash', face: h.face });
    let hit = false;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.spawn > 0.35) continue;
      const dx = enemy.x - h.x;
      if (distance(h.x, h.y, enemy.x, enemy.y) < reach && (dx * h.face > -24 || finisher)) {
        this.damageEnemy(enemy, damage, h.face * (finisher ? 310 : 150), 0, '#ffdfac'); hit = true;
      }
    }
    if (hit) { this.hitStop = finisher ? 0.065 : 0.035; this.shake = finisher ? 5 : 2.5; this.audio.play('hit'); }
  }

  dodge() {
    const h = this.hero;
    if (h.dodgeCooldown > 0 || h.dodge > 0 || this.mode !== 'playing') return;
    let dx = Number(this.held.has('right')) - Number(this.held.has('left'));
    let dy = Number(this.held.has('down')) - Number(this.held.has('up'));
    if (!dx && !dy) dx = h.face;
    const length = Math.hypot(dx, dy);
    h.dodgeX = dx / length; h.dodgeY = dy / length;
    h.dodge = 0.32; h.dodgeCooldown = 0.85; h.invincible = 0.4;
    h.attack = 0; this.attackQueued = false; this.audio.play('dodge');
  }

  magic() {
    const h = this.hero;
    if (this.mode !== 'playing' || h.mana < 33.3 || h.magic > 0 || h.dodge > 0) {
      if (this.mode === 'playing' && h.mana < 33.3) this.floatText(h.x, h.y - 115, 'EMBERS RECHARGING', '#b6cdc5');
      return;
    }
    h.mana -= 33.3; h.magic = 0.65; h.attack = 0; h.invincible = 0.7; this.attackQueued = false;
    this.magicFlash = 0.35; this.shake = 8;
    this.rings.push({ x: h.x, y: h.y - 12, radius: 265, life: 0.8, max: 0.8, color: '#ffc67f', kind: 'magic', face: 1 });
    this.burst(h.x, h.y - 45, 65, '#ffc983', 280);
    for (const enemy of this.enemies) {
      if (enemy.hp > 0 && distance(h.x, h.y, enemy.x, enemy.y) < 265) {
        const angle = Math.atan2(enemy.y - h.y, enemy.x - h.x);
        this.damageEnemy(enemy, 65, Math.cos(angle) * 390, Math.sin(angle) * 120, '#ffcf8d');
      }
    }
    this.projectiles = this.projectiles.filter(p => distance(h.x, h.y, p.x, p.y) > 280);
    this.audio.play('magic'); this.events.hud();
  }

  private spawnWave() {
    this.wave++; this.nextWave = 0; this.comboTimeout = 0;
    const kinds: EnemyKind[][] = [['sentinel', 'sentinel', 'sentinel'], ['sentinel', 'wraith', 'sentinel', 'wraith'], ['boss', 'sentinel', 'sentinel']];
    const positions = [[1080, 505], [205, 555], [1050, 620], [210, 470]];
    this.enemies = kinds[this.wave - 1].map((kind, index) => {
      const [x, y] = positions[index]; const maxHp = kind === 'boss' ? 330 : kind === 'wraith' ? 65 : 78;
      return { id: ++this.nextId, kind, x, y, face: x > this.hero.x ? -1 : 1, hp: maxHp, maxHp,
        step: Math.random() * 6, moving: false, windup: 0, windupMax: 0.7, cooldown: 1 + index * 0.4,
        flash: 0, stun: 0, knockX: 0, knockY: 0, death: 0, spawn: 0.7 + index * 0.15, attack: 0, targetX: 0, targetY: 0 };
    });
    this.events.banner(`WAVE ${this.wave} OF 3`, ['The hollow awakens', 'Shadows gather', 'The Warden arrives'][this.wave - 1]);
    this.audio.play('wave'); this.events.hud();
  }

  private damageEnemy(e: Enemy, amount: number, knockX: number, knockY: number, color: string) {
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - amount); e.flash = 0.17; e.stun = e.kind === 'boss' ? 0.13 : 0.32;
    e.knockX = knockX * (e.kind === 'boss' ? 0.35 : 1); e.knockY = knockY;
    if (e.kind !== 'boss') e.windup = 0;
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.comboTimeout = 2.7;
    this.hero.mana = Math.min(100, this.hero.mana + 3.5);
    this.floatText(e.x + random(-10, 10), e.y - (e.kind === 'boss' ? 137 : 95), String(amount), color);
    this.burst(e.x, e.y - 50, 11, color, 150);
    if (e.hp <= 0) {
      this.kills++; e.death = 0.8; e.windup = 0;
      this.burst(e.x, e.y - 38, 20, e.kind === 'wraith' ? '#9adbd0' : '#d7b182', 120);
      this.hero.mana = Math.min(100, this.hero.mana + 7);
    }
    this.events.hud();
  }

  private damageHero(amount: number, sourceX: number) {
    const h = this.hero;
    if (h.invincible > 0 || this.mode !== 'playing') return;
    h.hp = Math.max(0, h.hp - amount); h.invincible = 0.8; h.flash = 0.25;
    h.x = clamp(h.x + (h.x > sourceX ? 20 : -20), FLOOR.left, FLOOR.right);
    this.combo = 0; this.comboTimeout = 0; this.shake = 6;
    this.burst(h.x, h.y - 47, 12, '#d88476', 140); this.floatText(h.x, h.y - 106, `−${amount}`, '#ffa49b');
    this.audio.play('hurt'); this.events.hud();
    if (h.hp <= 0) this.setMode('defeat');
  }

  burst(x: number, y: number, count: number, color: string, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2; const v = random(speed * 0.3, speed); const life = random(0.22, 0.65);
      this.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life, max: life, size: random(1, 3.3), color, gravity: 140 });
    }
  }
  floatText(x: number, y: number, text: string, color: string) { this.texts.push({ x, y, text, color, life: 0.85 }); }

  update(dt: number) {
    this.ambientTime += dt;
    if (this.mode !== 'playing') return;
    this.time += dt; this.shake = Math.max(0, this.shake - dt * 25); this.magicFlash = Math.max(0, this.magicFlash - dt);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    const h = this.hero;
    h.invincible = Math.max(0, h.invincible - dt); h.flash = Math.max(0, h.flash - dt);
    h.magic = Math.max(0, h.magic - dt); h.dodgeCooldown = Math.max(0, h.dodgeCooldown - dt);
    h.comboWindow = Math.max(0, h.comboWindow - dt); h.mana = Math.min(100, h.mana + dt * 2.25);
    if (this.comboTimeout > 0) { this.comboTimeout -= dt; if (this.comboTimeout <= 0) { this.combo = 0; this.events.hud(); } }
    if (this.introDelay > 0) { this.introDelay -= dt; if (this.introDelay <= 0) this.spawnWave(); }

    let dx = Number(this.held.has('right')) - Number(this.held.has('left'));
    let dy = Number(this.held.has('down')) - Number(this.held.has('up'));
    h.moving = Boolean(dx || dy);
    if (h.dodge > 0) {
      h.dodge -= dt; h.x += h.dodgeX * 610 * dt; h.y += h.dodgeY * 350 * dt;
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) { this.afterimageTimer = 0.045; this.afterimages.push({ x: h.x, y: h.y, face: h.face, life: 0.23 }); }
    } else if (h.moving) {
      const length = Math.hypot(dx, dy); dx /= length; dy /= length;
      const speed = h.attack > 0 ? 105 : h.magic > 0 ? 70 : 235;
      h.x += dx * speed * dt; h.y += dy * speed * 0.66 * dt;
      if (dx && h.attack <= 0) h.face = dx > 0 ? 1 : -1;
      h.step += dt * 11;
    } else h.step += dt * 2;
    h.x = clamp(h.x, FLOOR.left, FLOOR.right); h.y = clamp(h.y, FLOOR.top, FLOOR.bottom);
    if (h.attack > 0) {
      h.attack = Math.max(0, h.attack - dt);
      if (!h.attackHit && h.attack < h.attackDuration * 0.52) { h.attackHit = true; this.strikeHit(); }
      if (h.attack <= 0 && (this.attackQueued || this.held.has('attack'))) { this.attackQueued = false; this.strike(); }
    } else if (this.held.has('attack')) this.strike();

    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.enemies = this.enemies.filter(e => e.hp > 0 || e.death > 0);
    if (this.wave > 0 && this.enemies.every(e => e.hp <= 0) && this.nextWave <= 0) {
      this.nextWave = 2.3;
      if (this.wave < 3) {
        h.hp = Math.min(100, h.hp + 20); h.mana = Math.min(100, h.mana + 20);
        this.events.banner('A MOMENT TO BREATHE', 'Health & embers restored'); this.events.hud();
      }
    }
    if (this.nextWave > 0) {
      this.nextWave -= dt;
      if (this.nextWave <= 0) {
        if (this.wave >= 3) { this.audio.play('victory'); this.setMode('victory'); }
        else this.spawnWave();
      }
    }

    for (const p of this.projectiles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (distance(p.x, p.y, h.x, h.y - 25) < 28) { if (h.invincible <= 0) { this.damageHero(11, p.x); p.life = 0; } }
      if (p.x < 0 || p.x > WIDTH || p.y < 300 || p.y > HEIGHT) p.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.vx *= Math.exp(-2 * dt); }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const ring of this.rings) ring.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const text of this.texts) { text.life -= dt; text.y -= dt * 43; }
    this.texts = this.texts.filter(t => t.life > 0);
    for (const image of this.afterimages) image.life -= dt;
    this.afterimages = this.afterimages.filter(i => i.life > 0);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.15; this.events.hud(); }
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.flash = Math.max(0, e.flash - dt); e.attack = Math.max(0, e.attack - dt); e.moving = false;
    if (e.hp <= 0) { e.death -= dt; e.x += e.knockX * dt; e.knockX *= Math.exp(-6 * dt); return; }
    if (e.spawn > 0) { e.spawn -= dt; return; }
    e.x = clamp(e.x + e.knockX * dt, FLOOR.left - 10, FLOOR.right + 10);
    e.y = clamp(e.y + e.knockY * dt, FLOOR.top, FLOOR.bottom);
    e.knockX *= Math.exp(-9 * dt); e.knockY *= Math.exp(-9 * dt);
    e.step += dt * 7;
    if (e.stun > 0) { e.stun -= dt; return; }
    e.cooldown -= dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) this.enemyAttack(e);
      return;
    }
    const h = this.hero; const dx = h.x - e.x; const dy = h.y - e.y;
    const dist = distance(h.x, h.y, e.x, e.y); e.face = dx >= 0 ? 1 : -1;
    const ranged = e.kind === 'wraith'; const desired = ranged ? 270 : e.kind === 'boss' ? 100 : 70;
    if (dist > desired + 8 || (Math.abs(dy) > 30 && !ranged)) {
      const length = Math.hypot(dx, dy) || 1;
      const speed = e.kind === 'boss' ? 65 : ranged ? 58 : 88 + this.wave * 7;
      e.x += dx / length * speed * dt; e.y += dy / length * speed * dt * 0.65; e.moving = true;
    } else if (ranged && dist < 170) {
      e.x -= Math.sign(dx) * 65 * dt; e.moving = true;
    }
    // Keep enemy silhouettes apart without blocking the player's movement.
    for (const other of this.enemies) {
      if (other.id === e.id || other.hp <= 0) continue;
      const d = Math.hypot(e.x - other.x, e.y - other.y);
      if (d > 0 && d < 43) { e.x += (e.x - other.x) / d * dt * 36; e.y += (e.y - other.y) / d * dt * 24; }
    }
    e.x = clamp(e.x, FLOOR.left, FLOOR.right); e.y = clamp(e.y, FLOOR.top, FLOOR.bottom);
    if (e.cooldown <= 0 && (ranged ? dist < 430 : dist < desired + 30 && Math.abs(dy) < 45)) {
      e.windupMax = e.kind === 'boss' ? 0.95 : ranged ? 0.95 : 0.7;
      e.windup = e.windupMax; e.targetX = h.x; e.targetY = h.y;
    }
  }

  private enemyAttack(e: Enemy) {
    e.attack = 0.3; e.cooldown = e.kind === 'boss' ? 1.8 : e.kind === 'wraith' ? 2.3 : 1.25;
    const h = this.hero;
    if (e.kind === 'wraith') {
      const angle = Math.atan2(e.targetY - 25 - (e.y - 50), e.targetX - e.x);
      this.projectiles.push({ x: e.x, y: e.y - 50, vx: Math.cos(angle) * 240, vy: Math.sin(angle) * 240, life: 4 });
      this.burst(e.x, e.y - 55, 8, '#9bddce', 70);
    } else if (e.kind === 'boss') {
      this.rings.push({ x: e.x, y: e.y - 4, radius: 160, life: 0.5, max: 0.5, color: '#e27b66', kind: 'slam', face: e.face });
      this.burst(e.x, e.y - 6, 25, '#edb281', 190); this.shake = Math.max(3, this.shake);
      if (distance(h.x, h.y, e.x, e.y) < 157) this.damageHero(21, e.x);
    } else if (distance(h.x, h.y, e.x, e.y) < 108 && (h.x - e.x) * e.face > -20) {
      this.damageHero(10, e.x);
    }
  }

  snapshot() {
    return { mode: this.mode, wave: this.wave, kills: this.kills, combo: this.combo, bestCombo: this.bestCombo,
      time: this.time, hero: { ...this.hero }, enemies: this.enemies.map(e => ({ ...e })), projectiles: this.projectiles.length };
  }
}
