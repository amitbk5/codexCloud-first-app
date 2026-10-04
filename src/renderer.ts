import { Game, WIDTH, HEIGHT, type Enemy, type Hero } from './game';

const TAU = Math.PI * 2;
type Context = CanvasRenderingContext2D;

function shape(ctx: Context, path: string, fill: string | CanvasGradient, stroke = '#081718', width = 1.25) {
  const p = new Path2D(path); ctx.fillStyle = fill; ctx.fill(p);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(p); }
}
function line(ctx: Context, path: string, color: string, width = 1.2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(path));
}
function ellipse(ctx: Context, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = color; ctx.fill();
}
function gradient(ctx: Context, x: number, y: number, x2: number, y2: number, colors: [number, string][]) {
  const g = ctx.createLinearGradient(x, y, x2, y2); colors.forEach(([stop, color]) => g.addColorStop(stop, color)); return g;
}

export class Renderer {
  cameraX = 0;
  private ctx: Context;
  private background = new Image();
  private artLoaded = false;
  private dust = Array.from({ length: 38 }, (_, i) => ({ x: (i * 117.3) % WIDTH, y: 100 + (i * 97.1) % 560, size: 0.6 + (i % 3) * 0.45, phase: i * 4.3 }));
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(public canvas: HTMLCanvasElement, public game: Game) {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is not supported by this browser.');
    this.ctx = context;
    this.background.onload = () => { this.artLoaded = true; };
    this.background.src = `${import.meta.env.BASE_URL}art/sanctum.png`;
  }

  render() {
    const ctx = this.ctx; const g = this.game; const t = g.ambientTime;
    ctx.save(); ctx.clearRect(0, 0, WIDTH, HEIGHT);
    // Narrow screens use a camera that follows Lyra instead of squeezing the art.
    const bounds = this.canvas.getBoundingClientRect();
    const visibleWidth = Math.min(WIDTH, bounds.width / Math.max(bounds.width / WIDTH, bounds.height / HEIGHT));
    const limit = (WIDTH - visibleWidth) / 2;
    const targetCamera = g.mode === 'title' ? Math.min(limit, 100) : Math.max(-limit, Math.min(limit, g.hero.x - WIDTH / 2));
    this.cameraX += (targetCamera - this.cameraX) * 0.13;
    ctx.translate(-this.cameraX, 0);
    if (!this.reducedMotion && g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake * 0.6);
    if (this.artLoaded) ctx.drawImage(this.background, -5, -4, WIDTH + 10, HEIGHT + 8);
    else this.fallbackBackground(ctx);
    ctx.fillStyle = '#0820241a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const portal = ctx.createRadialGradient(640, 225, 20, 640, 225, 180);
    portal.addColorStop(0, `rgba(92,198,185,${0.035 + Math.sin(t * 0.7) * 0.014})`); portal.addColorStop(1, 'rgba(59,177,166,0)');
    ctx.fillStyle = portal; ctx.fillRect(440, 30, 410, 380);
    this.ambient(ctx, t);

    // Telegraph danger on the ground before an enemy attack lands.
    for (const e of g.enemies) {
      if (e.windup <= 0 || e.hp <= 0) continue;
      const progress = 1 - e.windup / e.windupMax;
      ctx.save(); ctx.globalAlpha = 0.2 + progress * 0.4;
      ctx.strokeStyle = e.kind === 'wraith' ? '#8cdfcc' : '#e5a47d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.kind === 'boss' ? 151 : 56, e.kind === 'boss' ? 76 : 26, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha *= 0.3; ctx.fillStyle = e.kind === 'wraith' ? '#8cdfcc' : '#e5a47d'; ctx.fill();
      ctx.globalAlpha = 0.65; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.kind === 'boss' ? 151 : 56, e.kind === 'boss' ? 76 : 26, 0, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.stroke();
      ctx.restore();
    }

    for (const r of g.rings.filter(r => r.kind !== 'slash')) {
      const progress = 1 - r.life / r.max; const radius = r.radius * (0.2 + progress * 0.85);
      ctx.save(); ctx.translate(r.x, r.y); ctx.scale(1, 0.53); ctx.globalAlpha = Math.min(1, r.life / r.max * 1.5);
      const glow = ctx.createRadialGradient(0, 0, Math.max(1, radius - 30), 0, 0, radius + 5);
      glow.addColorStop(0, '#ffc47700'); glow.addColorStop(0.7, r.kind === 'magic' ? '#ffc47750' : '#d9806620'); glow.addColorStop(1, '#ffc47700');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius + 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = r.color; ctx.lineWidth = r.kind === 'magic' ? 3 : 2; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
      if (r.kind === 'magic') { ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, radius * 0.8, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }

    for (const afterimage of g.afterimages) {
      ctx.save(); ctx.globalAlpha = afterimage.life / 0.23 * 0.25;
      this.hero(ctx, { ...g.hero, x: afterimage.x, y: afterimage.y, face: afterimage.face }, t, true); ctx.restore();
    }
    const entities = [{ y: g.hero.y, hero: true, enemy: null as Enemy | null }, ...g.enemies.map(enemy => ({ y: enemy.y, hero: false, enemy }))].sort((a, b) => a.y - b.y);
    for (const entity of entities) {
      if (entity.hero) this.hero(ctx, g.hero, t);
      else if (entity.enemy) this.enemy(ctx, entity.enemy, t);
    }

    for (const r of g.rings.filter(r => r.kind === 'slash')) {
      ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.face, 0.75); ctx.globalAlpha = r.life / r.max;
      ctx.beginPath(); ctx.arc(0, 0, r.radius, -0.83, 0.85); ctx.arc(0, 0, r.radius - 16, 0.85, -0.83, true); ctx.closePath();
      const slash = gradient(ctx, 25, -50, r.radius, 15, [[0, '#ffffff00'], [0.5, '#e9f3d740'], [1, '#f9e9bd']]);
      ctx.fillStyle = slash; ctx.fill();
      ctx.strokeStyle = '#fff5d7'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r.radius, -0.68, 0.8); ctx.stroke(); ctx.restore();
    }
    for (const p of g.projectiles) {
      ctx.save(); ctx.shadowColor = '#86eac7'; ctx.shadowBlur = 19;
      ellipse(ctx, p.x, p.y, 7, 5, '#b4f4d8'); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#70c7b580'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.065, p.y - p.vy * 0.065); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const p of g.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life / p.max * 0.5), 0, TAU); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024); ctx.stroke();
    }
    ctx.restore();
    for (const text of g.texts) {
      ctx.save(); ctx.globalAlpha = Math.min(1, text.life * 3); ctx.fillStyle = text.color; ctx.shadowColor = '#03141b'; ctx.shadowBlur = 5;
      ctx.font = text.text.length > 5 ? '600 11px "DM Sans", sans-serif' : '600 23px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center'; ctx.fillText(text.text, text.x, text.y); ctx.restore();
    }
    if (g.magicFlash > 0 && !this.reducedMotion) { ctx.globalAlpha = g.magicFlash * 0.18; ctx.fillStyle = '#ffe3b9'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.globalAlpha = 1; }
    if (g.hero.flash > 0 && !this.reducedMotion) {
      const danger = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.5, WIDTH / 2, HEIGHT / 2, WIDTH * 0.6);
      danger.addColorStop(0, '#aa342800'); danger.addColorStop(1, '#bc433840'); ctx.fillStyle = danger; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.restore();
  }

  private ambient(ctx: Context, time: number) {
    ctx.save();
    for (const mote of this.dust) {
      const x = (mote.x + Math.sin(time * 0.23 + mote.phase) * 20 + WIDTH) % WIDTH;
      const y = (mote.y - time * 5 + HEIGHT * 1000) % HEIGHT;
      ctx.globalAlpha = (0.25 + Math.sin(time + mote.phase) * 0.15) * (y > 390 ? 1 : 0.5);
      ellipse(ctx, x, y, mote.size, mote.size, mote.phase % 3 > 1 ? '#ddba7d' : '#a7cdc3');
    }
    ctx.globalAlpha = 1;
    const fog = gradient(ctx, 0, 570, 0, 720, [[0, '#adc9c000'], [0.4, '#acc8c208'], [1, '#8dadab00']]);
    ctx.fillStyle = fog; ctx.fillRect(0, 560 + Math.sin(time * 0.3) * 10, WIDTH, 160);
    ctx.restore();
  }

  private hero(ctx: Context, h: Hero, time: number, ghost = false) {
    const scale = 1.03 + (h.y - 440) / 1250;
    const walk = h.moving && h.dodge <= 0 ? Math.sin(h.step) : 0;
    const bob = h.dodge > 0 ? 7 : h.moving ? Math.abs(Math.sin(h.step)) * 2 : Math.sin(time * 2) * 0.7;
    ctx.save();
    if (!ghost) {
      ellipse(ctx, h.x, h.y + 1, 31 * scale, 10 * scale, '#020c1499');
      if (this.game.mode === 'title' || h.magic > 0) {
        const glow = ctx.createRadialGradient(h.x, h.y, 3, h.x, h.y, 65);
        glow.addColorStop(0, '#d5b97116'); glow.addColorStop(1, '#d5b97100'); ctx.fillStyle = glow; ctx.fillRect(h.x - 65, h.y - 65, 130, 130);
      }
    }
    ctx.translate(h.x, h.y - bob); ctx.scale(scale * h.face, scale);
    if (h.dodge > 0) ctx.rotate(-0.2);
    if (h.invincible > 0 && h.flash <= 0 && Math.floor(time * 22) % 2 === 0 && !ghost) ctx.globalAlpha *= 0.65;
    if (h.flash > 0) { ctx.shadowColor = '#ffefdc'; ctx.shadowBlur = 9; }

    const capeShift = h.moving ? 7 : Math.sin(time * 2.2) * 4;
    const cape = gradient(ctx, -36, -88, 1, -6, [[0, '#b35a57'], [0.35, '#8d343e'], [1, '#3d2437']]);
    shape(ctx, `M-10-86 C-32-78 ${-36 - capeShift}-52 ${-40 - capeShift}-13 Q-24-21-17-8 Q-7-18 1-7 L10-52 5-79Z`, cape);
    line(ctx, `M-13-76 Q${-23 - capeShift}-43-28-19 M-7-77Q-18-41-17-16`, '#d36e643a', 2);
    line(ctx, `M${-40 - capeShift}-13Q-24-21-17-8Q-7-18 1-7`, '#c79c72aa', 1.2);
    // Back arm and buckler.
    shape(ctx, 'M-15-76Q-28-72-29-49L-19-42-13-60Z', '#334a43');
    shape(ctx, 'M-25-50Q-34-49-32-41L-22-33-16-42Z', '#deb29a');
    ctx.save(); ctx.translate(-25, -45); ctx.rotate(-0.12);
    shape(ctx, 'M0-17Q-17-15-16 0Q-15 15 0 22Q15 15 16 0Q17-15 0-17Z', gradient(ctx, -17, -10, 16, 17, [[0, '#87917a'], [0.4, '#384e44'], [1, '#203b37']]), '#d8b97b', 1.8);
    line(ctx, 'M0-12 0 15M-10-3 10-3', '#a0b39b', 1); shape(ctx, 'M0-6 5 0 0 7-5 0Z', '#d9b97d', '#617164'); ctx.restore();

    // Articulated legs, leather boots, and gold greaves.
    const backLeg = walk * 10; const frontLeg = -walk * 10;
    shape(ctx, `M-8-39-17-22 ${-18 + backLeg}-9 ${-9 + backLeg}-8 3-27 5-40Z`, '#344641');
    shape(ctx, `M${-18 + backLeg}-18L${-21 + backLeg}-3Q${-26 + backLeg} 0 ${-23 + backLeg} 4L${-6 + backLeg} 3 ${-8 + backLeg}-17Z`, gradient(ctx, -20, -20, -5, 2, [[0, '#526458'], [1, '#172d2d']]));
    line(ctx, `M${-18 + backLeg}-17 ${-9 + backLeg}-16M${-19 + backLeg}-6 ${-10 + backLeg}-6`, '#baa475', 2);
    shape(ctx, `M2-39 17-34 19-19 ${16 + frontLeg}-6 ${5 + frontLeg}-7 5-22-5-27Z`, '#3e534a');
    shape(ctx, `M${6 + frontLeg}-21 ${19 + frontLeg}-19 ${18 + frontLeg}-4Q${29 + frontLeg} 0 ${27 + frontLeg} 3L${7 + frontLeg} 4 ${4 + frontLeg}-5Z`, gradient(ctx, 4, -19, 21, 4, [[0, '#66715a'], [0.5, '#31483f'], [1, '#1b302d']]));
    shape(ctx, `M${7 + frontLeg}-19 ${17 + frontLeg}-17 ${14 + frontLeg}-6 ${8 + frontLeg}-7Z`, '#af9c6c', '#d3bb85', 0.7);
    line(ctx, `M${8 + frontLeg}-16 ${14 + frontLeg}-14`, '#e0c799', 1);

    // Sculpted green armor with a warm brass trim, short split skirt.
    shape(ctx, 'M-13-79Q-3-86 11-78L16-61 10-46 16-34Q5-27-12-32L-17-45-11-61Z', gradient(ctx, -15, -78, 16, -33, [[0, '#91a58a'], [0.23, '#546f5b'], [0.7, '#2a4940'], [1, '#182f2d']]));
    shape(ctx, 'M-10-75Q1-67 12-75L10-58Q1-51-11-60Z', gradient(ctx, -8, -78, 9, -56, [[0, '#d8be85'], [0.45, '#ac925e'], [1, '#756e4e']]), '#efd7a4', 0.7);
    shape(ctx, 'M1-70 7-64 1-55-5-64Z', '#506957', '#eed9ac', 1);
    line(ctx, 'M-10-50Q1-46 11-50M-11-47Q1-43 11-47', '#d3b67c', 2);
    shape(ctx, 'M-12-44-18-25-7-20 1-41Z', '#526956', '#c9b37b');
    shape(ctx, 'M3-43 19-28 10-22-2-40Z', '#3d594c', '#c9b37b');
    ellipse(ctx, 0, -45, 3, 3, '#e0bd7f');
    shape(ctx, 'M-14-80Q-20-82-25-74L-17-68-10-74Z', '#ae956c', '#e2c48d');
    shape(ctx, 'M11-81Q20-80 24-72L15-67 7-76Z', '#c6ad79', '#f0d49b');
    line(ctx, 'M-21-75-17-72M15-76 20-73', '#f8ddb0', 1);

    // Neck, three-quarter face, swept hair, and the ember circlet.
    shape(ctx, 'M-6-91 6-91 7-78Q0-72-7-79Z', '#c89b82');
    shape(ctx, `M-11-109Q-28-109-25-91Q-30-76 ${-30 - capeShift * 0.6}-59Q-14-65-13-86L-6-102Z`, '#172b29', '#081c20');
    line(ctx, 'M-19-96Q-24-75-25-66', '#49604b', 2);
    shape(ctx, 'M-9-111Q4-119 13-108Q17-103 14-97L17-91 12-88Q12-78 4-79Q-5-79-10-91Z', gradient(ctx, -9, -110, 15, -84, [[0, '#f3ceb0'], [1, '#d49f85']]), '#172727', 1.2);
    shape(ctx, 'M-13-98Q-15-114-2-117Q14-119 17-106Q5-110-1-104L-7-89-12-87Z', gradient(ctx, -10, -117, 7, -98, [[0, '#41594b'], [1, '#122d2d']]));
    line(ctx, 'M-9-106Q2-115 12-110', '#667661', 1.1);
    line(ctx, 'M-9-100Q2-104 14-99', '#e5c181', 2);
    shape(ctx, 'M2-104 5-99 2-94-1-99Z', '#e7c893', '#a88d5e', 0.7);
    line(ctx, 'M5-95 11-94', '#293a33', 1.4); ellipse(ctx, 9, -94, 0.9, 0.9, '#234d46');
    line(ctx, 'M8-85 12-85', '#975d57', 1); ellipse(ctx, -6, -88, 1.2, 1.2, '#e5c483');

    // Front arm and sword follow the swing rather than snapping between poses.
    let swordAngle = 0.77; let handX = 25; let handY = -50;
    if (h.attack > 0) {
      const progress = 1 - h.attack / h.attackDuration;
      swordAngle = h.comboStage === 1 ? 1.35 - progress * 3.1 : -1.9 + progress * 3.3;
      handX = 21 + Math.sin(progress * Math.PI) * 13;
      handY = -63 + Math.sin(swordAngle) * 11;
    } else if (h.magic > 0) { swordAngle = -1.4; handX = 27; handY = -77; }
    shape(ctx, `M17-73Q23-74 25-66L${handX}-56 ${handX - 9}-52 12-64Z`, '#465f4e');
    shape(ctx, `M${handX - 10}-59 ${handX + 1}-62 ${handX + 4} ${handY} ${handX - 5} ${handY + 6}Z`, '#3a5045', '#d6b77e');
    ellipse(ctx, handX, handY, 5, 4, '#e2b294');
    ctx.save(); ctx.translate(handX + 3, handY); ctx.rotate(swordAngle);
    shape(ctx, 'M-11-3 9-3 9 3-11 3Z', '#6c493e', '#c3a375');
    shape(ctx, 'M6-12 12-10 12 10 6 12 8 1Z', '#d8bd80', '#f2d8a2', 0.8);
    const blade = gradient(ctx, 10, -7, 10, 8, [[0, '#bed4cb'], [0.45, '#f4f0d2'], [0.5, '#809e9e'], [1, '#b5c5b3']]);
    shape(ctx, 'M12-5 68-4 85 0 67 5 12 5Z', blade, '#e4d8ab', 0.8);
    line(ctx, 'M17 0 76 0', '#fbefd5', 0.7);
    if (h.attack > 0 || h.magic > 0) {
      ctx.shadowColor = '#ffd18b'; ctx.shadowBlur = 11; line(ctx, 'M17-4 67-4 85 0', '#ffdba0', 2); ctx.shadowBlur = 0;
    }
    shape(ctx, 'M-13-4-17 0-13 4-9 0Z', '#dabd82', '#edce9b', 0.8); ctx.restore();
    if (h.magic > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.shadowBlur = 17; ctx.shadowColor = '#f8c582';
      for (let i = 0; i < 6; i++) { const a = time * 5 + i * TAU / 6; ellipse(ctx, Math.cos(a) * 38, -57 + Math.sin(a) * 25, 2.5, 2.5, '#ffdfac'); }
      ctx.restore();
    }
    ctx.restore();
  }

  private enemy(ctx: Context, e: Enemy, time: number) {
    const scale = (1 + (e.y - 440) / 1300) * (e.kind === 'boss' ? 1.52 : 1);
    ctx.save();
    if (e.hp <= 0) ctx.globalAlpha = Math.max(0, e.death / 0.8);
    else if (e.spawn > 0) ctx.globalAlpha = Math.max(0, 1 - e.spawn / 0.8);
    ellipse(ctx, e.x, e.y + 1, e.kind === 'boss' ? 47 : 28, e.kind === 'boss' ? 13 : 9, '#040e1599');
    ctx.translate(e.x, e.y); ctx.scale(e.face * scale, scale);
    const walk = e.moving ? Math.sin(e.step) * 7 : 0;
    if (e.hp <= 0) { ctx.translate(0, 9); ctx.rotate(-0.28); }
    if (e.flash > 0) { ctx.shadowColor = '#fff1d8'; ctx.shadowBlur = 14; }
    if (e.kind === 'wraith') this.wraith(ctx, e, time);
    else this.sentinel(ctx, e, walk);
    ctx.restore();
    if (e.hp > 0 && e.spawn <= 0 && (e.hp < e.maxHp || e.kind === 'boss')) {
      const w = e.kind === 'boss' ? 94 : 42; const y = e.y - (e.kind === 'boss' ? 185 : 119) * (1 + (e.y - 440) / 1300);
      ctx.save(); ctx.fillStyle = '#08151be0'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.kind === 'boss' ? '#d1a477' : '#9fb7a1'; ctx.fillRect(e.x - w / 2, y, w * e.hp / e.maxHp, 3);
      if (e.kind === 'boss') { ctx.font = '500 8px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e4cda9'; ctx.fillText('THE HOLLOW WARDEN', e.x, y - 8); } ctx.restore();
    }
    if (e.spawn > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(0.5, e.spawn); ctx.strokeStyle = '#9fcebe'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 40, 18, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }

  private sentinel(ctx: Context, e: Enemy, walk: number) {
    const boss = e.kind === 'boss';
    const armor = gradient(ctx, -27, -83, 26, -32, [[0, boss ? '#6e786b' : '#68767a'], [0.45, '#344b4e'], [1, '#192f36']]);
    const trim = boss ? '#c5ab79' : '#92a1a0';
    const cloth = boss ? '#615044' : '#423748';
    shape(ctx, 'M-19-76Q-31-59-28-19L-7-12 18-22 21-69Z', cloth);
    shape(ctx, `M-17-38-22-18 ${-21 + walk}-4 ${-6 + walk}-3-3-34Z`, '#25383e');
    shape(ctx, `M2-37 20-35 ${23 - walk}-5 ${8 - walk}-4Z`, '#30454a');
    shape(ctx, `M${-22 + walk}-15 ${-9 + walk}-17 ${-7 + walk}-3 ${-3 + walk} 2 ${-23 + walk} 3Z`, '#26383e', trim);
    shape(ctx, `M${9 - walk}-16 ${22 - walk}-16 ${22 - walk}-4 ${30 - walk} 1 ${9 - walk} 3Z`, '#34464a', trim);
    shape(ctx, 'M-21-77Q-3-85 20-76L26-56 16-36-17-35-26-58Z', armor, '#142b31');
    shape(ctx, 'M-19-69 0-76 20-68 15-47 0-39-17-47Z', gradient(ctx, -15, -72, 20, -42, [[0, '#8d9990'], [0.4, '#4a5d5c'], [1, '#243e43']]), trim, 1);
    line(ctx, 'M0-75 0-42M-16-64 0-58 16-64', '#b5c0a86b', 1.3);
    shape(ctx, 'M-18-41 17-41 20-33-19-33Z', '#796c52', trim);
    shape(ctx, 'M-22-80-34-75-31-63-19-66-12-75Z', armor, trim);
    shape(ctx, 'M17-81 31-76 34-65 21-63 12-76Z', armor, trim);
    if (boss) {
      shape(ctx, 'M-31-76-37-88-25-82Z', '#b0a07a', trim);
      shape(ctx, 'M28-78 37-91 34-71Z', '#b0a07a', trim);
    }
    shape(ctx, 'M-8-88 9-88 10-76-9-76Z', '#304349');
    shape(ctx, 'M-12-110Q0-119 14-109L18-87 9-77-8-81-17-94Z', gradient(ctx, -15, -112, 17, -80, [[0, '#80918d'], [0.5, '#41595b'], [1, '#203a42']]), trim, 1);
    shape(ctx, 'M-12-99 15-101 13-91-5-91Z', '#092329', '#536f6f');
    ctx.save(); ctx.shadowColor = boss ? '#efc291' : '#b6e8cd'; ctx.shadowBlur = 6;
    line(ctx, 'M-7-96-1-95M6-96 12-97', boss ? '#f2c799' : '#b4e4cd', 1.7); ctx.restore();
    shape(ctx, 'M-1-113 4-115 7-84 2-78-1-92Z', '#afafa0', trim, 0.7);
    if (boss) {
      shape(ctx, 'M-9-108Q-25-118-23-129Q-16-117-8-117Z', '#c1aa82', '#e2c38d');
      shape(ctx, 'M10-110Q25-120 23-129Q17-118 8-117Z', '#c1aa82', '#e2c38d');
    }
    // Guard arm, attacking arm, and weapon.
    shape(ctx, 'M-27-68-31-45-23-38-17-53Z', '#3e5458', trim);
    shape(ctx, 'M22-68 29-52 35-43 24-36 16-55Z', '#4b5b58', trim);
    const attackProgress = e.windup > 0 ? 1 - e.windup / e.windupMax : 0;
    const angle = e.attack > 0 ? 0.8 : e.windup > 0 ? -0.8 - attackProgress * 1.05 : 0.55;
    ctx.save(); ctx.translate(29, -44); ctx.rotate(angle);
    if (boss) {
      shape(ctx, 'M-28-3 69-3 72 1 68 3-28 3Z', '#766047', '#a5916b');
      shape(ctx, 'M46-5Q43-29 62-35L65-13 72-5 65 7 62 27Q42 24 46 5Z', gradient(ctx, 43, -25, 66, 22, [[0, '#e3d4ac'], [0.45, '#82958a'], [1, '#405758']]), '#d8bf89', 1.3);
      line(ctx, 'M48-5 60-23M48 5 60 17', '#d6cfae', 1);
    } else {
      shape(ctx, 'M-10-3 12-3 12 3-10 3Z', '#51443f', '#b2a080');
      shape(ctx, 'M8-10 13-10 13 10 8 10Z', '#aeaa89');
      shape(ctx, 'M14-5 65-4 77 0 65 4 14 5Z', gradient(ctx, 15, -5, 15, 5, [[0, '#d2d8c6'], [0.5, '#788f8e'], [1, '#354f59']]), '#adbdac', 0.7);
      line(ctx, 'M18 0 68 0', '#d6d4bb', 0.7);
    }
    ctx.restore();
    if (e.windup > 0) {
      ctx.save(); ctx.globalAlpha = 0.5 + attackProgress * 0.5; ctx.font = '600 17px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = '#efbd87'; ctx.fillText('!', 0, boss ? -142 : -125); ctx.restore();
    }
  }

  private wraith(ctx: Context, e: Enemy, time: number) {
    const bob = Math.sin(time * 2.5 + e.id) * 3; ctx.translate(0, bob - 2);
    const robe = gradient(ctx, -29, -97, 25, 0, [[0, '#728e82'], [0.25, '#41675e'], [0.7, '#203f3d'], [1, '#173337']]);
    shape(ctx, 'M-15-82Q-33-59-30-9L-15-3-5-8 1 2 9-7 23-3 28-17Q14-55 14-81Z', robe, '#0b282c');
    line(ctx, 'M-10-70-18-12M2-68 1-9M12-64 18-14', '#8ab2a344', 1.5);
    shape(ctx, 'M-17-87Q-20-114-2-119Q20-112 20-90L12-73-15-73Z', gradient(ctx, -20, -115, 20, -78, [[0, '#94a796'], [0.4, '#3e6459'], [1, '#23423d']]), '#5b8070');
    shape(ctx, 'M-11-93Q-10-108 1-107Q12-105 14-92L5-79-5-82Z', '#091f25');
    ctx.save(); ctx.shadowColor = '#ade8ce'; ctx.shadowBlur = 10;
    line(ctx, 'M-6-94-1-93M6-94 11-95', '#a4e4cd', 2); ctx.restore();
    line(ctx, 'M-16-85Q0-79 16-86', '#bcb786', 2);
    shape(ctx, 'M-21-72-34-50-19-42-11-65Z', '#3d655c');
    shape(ctx, 'M13-75Q28-69 28-56L19-48 9-62Z', '#4c7262');
    shape(ctx, 'M21-57 33-56 35-47 25-46Z', '#b3c5ad');
    ctx.save(); ctx.translate(33, -48); ctx.rotate(-0.12);
    shape(ctx, 'M-3 49-2-57 3-57 3 49Z', '#9a8966', '#4b634e', 0.8);
    shape(ctx, 'M0-47Q-16-52-12-68L-4-79-7-66 0-57 9-66 6-79 13-70Q16-51 0-47Z', '#b3ad80', '#d2c692', 0.8);
    ctx.shadowColor = '#94dfbc'; ctx.shadowBlur = e.windup > 0 ? 24 : 13;
    ellipse(ctx, 0, -65, e.windup > 0 ? 8 : 5.5, e.windup > 0 ? 9 : 6.5, '#b2e4bf');
    ctx.restore();
    shape(ctx, 'M-5-75 0-68 5-75 0-59Z', '#c6bc87', '#d8d0a2', 0.8);
  }

  private fallbackBackground(ctx: Context) {
    ctx.fillStyle = gradient(ctx, 0, 0, 0, HEIGHT, [[0, '#0a1c27'], [0.55, '#284744'], [1, '#132529']]); ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ellipse(ctx, 640, 210, 91, 120, '#477d7940');
    for (const x of [80, 210, 1010, 1130]) { ctx.fillStyle = '#243a3a'; ctx.fillRect(x, 90, 45, 330); ctx.fillRect(x - 12, 79, 69, 23); ctx.fillRect(x - 12, 414, 69, 22); }
    ctx.strokeStyle = '#9cb5a020'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const y = 450 + i * i * 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
  }
}
