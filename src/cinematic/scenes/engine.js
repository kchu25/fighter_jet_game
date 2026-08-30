/* ===== cinematic/scenes/engine.js — shared plumbing + render loop =====
   Constants, palette, canvas/text/particle helpers, the backdrop
   primitives (starfield/scanlines/vignette/dawn sky/neon ground), the
   requestAnimationFrame loop, and the play/skip/finish lifecycle.

   Deliberate circular import with the six scene modules: frame() below
   calls scene1()..scene6() to render whichever is live, while each scene
   imports its shared helpers back from here. Safe for the same reason as
   game/update.js<->main.js and render/scene-draw.js<->world/scenery.js:
   neither side touches the other's binding until a function is actually
   called, long after both modules finish evaluating. */
import { CINE_ART } from '../art/index.js';
import { AUDIO } from '../../audio/index.js';
import { I } from './state.js';
import { scene1 } from './scene1.js';
import { scene2 } from './scene2.js';
import { scene3 } from './scene3.js';
import { scene4 } from './scene4.js';
import { scene5 } from './scene5.js';
import { scene6 } from './scene6.js';

export const VW = 1600, VH = 900;

/* ---- scene boundaries (absolute seconds) ---- */
export const T1 = 12.8;              // 0    .. 12.8  incident
export const T2 = T1 + 2.5;          // 12.8 .. 15.3  the signal (quiet alert)
export const T3 = T2 + 4.5;          // 15.3 .. 19.8  the pilot
export const T4 = T3 + 4.2;          // 19.8 .. 24.0  scramble launch under fire, first person
export const T5 = T4 + 4.4;          // 24.0 .. 28.4  the launch that fails
export const T6 = T5 + 5.0;          // 28.4 .. 33.4  encounter
export const HANDOFF = T6 - 0.62;    // gameplay starts under the fading canvas
const fired = {};                    // one-shot event latches, engine.js-local
export const C = {
  white: [255, 255, 255], ice: [196, 245, 255], cyan: [58, 224, 255],
  blue: [70, 140, 255], mag: [255, 60, 240], violet: [176, 84, 255],
  red: [255, 44, 72], orange: [255, 150, 52], amber: [255, 214, 128],
  green: [64, 255, 158], smoke: [122, 124, 140], steel: [176, 190, 206],
  /* the desert palette: what the pad sits in, and what the wreck
     feeds forward into once the player is walking the ruins later */
  rust: [200, 104, 52], sand: [224, 178, 118], dust: [150, 118, 84]
};
export function rgba(k, a) { return 'rgba(' + k[0] + ',' + k[1] + ',' + k[2] + ',' + a + ')'; }
export function rnd(a, b) { return a + Math.random() * (b - a); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function sat(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
/* smoothstep ramp between two absolute times */
export function ramp(a, b, x) { const q = sat((x - a) / (b - a || 1e-6)); return q * q * (3 - 2 * q); }
export function pulse(x, hz) { return 0.5 + 0.5 * Math.sin(x * hz * 6.2832); }

export function once(key, when, fn) { if (!fired[key] && I.t >= when) { fired[key] = 1; fn(); } }
export function sfx(name, arg) {
  try {
    const A = AUDIO;
    if (A && typeof A[name] === 'function') return A[name](arg);
  } catch (e) { }
  return null;
}

/* cached radial-glow sprites, keyed by colour (avoids per-particle gradients) */
export const sprites = {};
export function glow(k) {
  const key = k[0] + ',' + k[1] + ',' + k[2];
  let s = sprites[key];
  if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 64;
  const x = s.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(' + key + ',1)');
  g.addColorStop(0.32, 'rgba(' + key + ',0.55)');
  g.addColorStop(1, 'rgba(' + key + ',0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  sprites[key] = s; return s;
}

export function txt(s, x, y, size, col, sp, align, weight) {
  I.c.font = (weight ? weight + ' ' : '') + size + 'px "Courier New",monospace';
  let total = 0, i;
  for (i = 0; i < s.length; i++) total += I.c.measureText(s[i]).width + sp;
  total -= sp;
  let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  I.c.fillStyle = col;
  for (i = 0; i < s.length; i++) { I.c.fillText(s[i], px, y); px += I.c.measureText(s[i]).width + sp; }
  return total;
}

/* ------------------------------------------------------- particles */
export const parts = [];
export function part(x, y, vx, vy, life, r, col, o) {
  if (parts.length > 1400) parts.shift();
  o = o || {};
  parts.push({
    x: x, y: y, vx: vx, vy: vy, l: life, L: life, r: r, c: col,
    g: o.g || 0, d: o.d == null ? 0.9 : o.d, gr: o.gr || 0,
    add: o.add !== false, sq: !!o.sq, rot: o.rot || 0, vr: o.vr || 0, a: o.a == null ? 1 : o.a
  });
}
export function stepParts(dt, dcam) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.l -= dt;
    if (p.l <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt + (dcam || 0);
    p.vy += p.g * dt;
    const dd = Math.pow(p.d, dt * 60);
    p.vx *= dd; p.vy *= dd;
    p.r += p.gr * dt; p.rot += p.vr * dt;
    if (p.r < 0.4) p.r = 0.4;
  }
}
export function drawParts(filterAdd) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (filterAdd !== undefined && p.add !== filterAdd) continue;
    const a = sat(p.l / p.L) * p.a;
    I.c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    I.c.globalAlpha = p.add ? a : a * 0.62;
    if (p.sq) {
      I.c.save(); I.c.translate(p.x, p.y); I.c.rotate(p.rot);
      I.c.fillStyle = rgba(p.c, 1); I.c.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      I.c.restore();
    } else {
      I.c.drawImage(glow(p.c), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  }
  I.c.globalCompositeOperation = 'source-over';
  I.c.globalAlpha = 1;
}
export function burst(x, y, n, spd, col, life, r, o) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.2832), s = rnd(spd * 0.25, spd);
    part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * 0.45, life), rnd(r * 0.5, r), col, o);
  }
}
/* cheap fake motion blur for the fast tumbling debris chunks: a
   trailing smear along each particle's own velocity vector, only
   ever drawn on top of the square "sq" chunks (the hull plates, not
   the soft glow sparks) and only while `amt` is above zero — the
   disorientation beats dial it in, everything else leaves it off */
export function streakParts(amt) {
  if (amt <= 0.01) return;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.sq) continue;
    const spd = Math.hypot(p.vx, p.vy);
    if (spd < 60) continue;
    const a = sat(p.l / p.L) * p.a * amt * Math.min(1, spd / 480);
    if (a <= 0.015) continue;
    const ux = p.vx / spd, uy = p.vy / spd;
    const len = Math.min(130, spd * 0.11) * amt;
    I.c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    I.c.globalAlpha = a * 0.45;
    I.c.strokeStyle = rgba(p.c, 1);
    I.c.lineCap = 'round';
    I.c.lineWidth = Math.max(1, p.r * 0.62);
    I.c.beginPath();
    I.c.moveTo(p.x, p.y);
    I.c.lineTo(p.x - ux * len, p.y - uy * len);
    I.c.stroke();
  }
  I.c.globalCompositeOperation = 'source-over';
  I.c.globalAlpha = 1;
}

/* --------------------------------------------------------- backdrop */
export function starField(seed, n, cam, alpha) {
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const x = (s / 0x7fffffff) * VW;
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const y0 = (s / 0x7fffffff) * VH * 1.6 - VH * 0.3;
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const d = 0.3 + (s / 0x7fffffff) * 0.7;
    let y = y0 + cam * d * 0.05;
    y = ((y % (VH * 1.6)) + VH * 1.6) % (VH * 1.6) - VH * 0.3;
    const a = alpha * d * (0.5 + 0.5 * Math.sin(I.t * 2.4 + i));
    if (a <= 0.02) continue;
    I.c.fillStyle = rgba(C.white, a);
    I.c.fillRect(x, y, d > 0.85 ? 2 : 1, d > 0.85 ? 2 : 1);
  }
}

export function scanlines(a) {
  I.c.globalAlpha = a; I.c.fillStyle = '#000';
  for (let y = 0; y < VH; y += 3) I.c.fillRect(0, y, VW, 1);
  I.c.globalAlpha = 1;
}
export function vignette(a) {
  const g = I.c.createRadialGradient(VW / 2, VH / 2, VH * 0.28, VW / 2, VH / 2, VH * 0.92);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
  I.c.fillStyle = g; I.c.fillRect(0, 0, VW, VH);
}
export function art() { return CINE_ART || null; }

/* ================================================================
   shared sky for scenes 5 + 6
   ================================================================ */
export function dawnSky(hz, dark) {
  const g = I.c.createLinearGradient(0, -160, 0, hz);
  g.addColorStop(0, dark > 0.5 ? '#01020a' : '#06071c');
  g.addColorStop(0.44, '#150a34');
  g.addColorStop(0.73, '#3e0d52');
  g.addColorStop(0.90, '#8f1355');
  g.addColorStop(1, '#ff5f3e');
  I.c.fillStyle = g; I.c.fillRect(0, -200, VW, hz + 200);
  /* sun */
  I.c.save(); I.c.globalCompositeOperation = 'lighter';
  const sg = I.c.createLinearGradient(0, hz - 250, 0, hz + 30);
  sg.addColorStop(0, rgba([255, 220, 90], 0.95));
  sg.addColorStop(0.55, rgba([255, 110, 60], 0.9));
  sg.addColorStop(1, rgba([255, 40, 120], 0.85));
  I.c.save();
  I.c.beginPath(); I.c.arc(430, hz - 20, 230, 0, 6.2832); I.c.clip();
  I.c.fillStyle = sg; I.c.fillRect(190, hz - 260, 480, 300);
  I.c.fillStyle = 'rgba(10,2,20,0.85)';
  for (let i = 0; i < 9; i++) I.c.fillRect(190, hz - 190 + i * 26, 480, 4 + i * 1.6);
  I.c.restore();
  I.c.globalAlpha = 0.4;
  I.c.drawImage(glow([255, 90, 120]), 430 - 420, hz - 20 - 420, 840, 840);
  I.c.restore();
  /* horizon band */
  I.c.save(); I.c.globalCompositeOperation = 'lighter';
  I.c.fillStyle = rgba(C.mag, 0.5); I.c.fillRect(0, hz - 3, VW, 5);
  I.c.globalAlpha = 0.35; I.c.drawImage(glow(C.mag), 0, hz - 90, VW, 180);
  I.c.restore();
}
export function neonGround(hz, scroll, alpha) {
  I.c.fillStyle = '#08030f'; I.c.fillRect(0, hz, VW, VH - hz + 200);
  I.c.save(); I.c.globalCompositeOperation = 'lighter'; I.c.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    const f = (i + (scroll % 1)) / 22;
    const y = hz + Math.pow(f, 2.5) * (VH - hz) * 2.6;
    if (y > VH + 60) break;
    I.c.strokeStyle = rgba(C.cyan, alpha * (0.08 + 0.5 * f));
    I.c.beginPath(); I.c.moveTo(0, y); I.c.lineTo(VW, y); I.c.stroke();
  }
  I.c.strokeStyle = rgba(C.cyan, alpha * 0.22);
  for (let i = -13; i <= 13; i++) {
    I.c.beginPath(); I.c.moveTo(800 + i * 24, hz); I.c.lineTo(800 + i * 430, VH + 90); I.c.stroke();
  }
  I.c.restore();
}
export function attract(dt) {
  I.c.fillStyle = '#04050c'; I.c.fillRect(0, 0, VW, VH);
  starField(4471, 130, 0, 0.5);
  const g = I.c.createRadialGradient(VW / 2, 400, 40, VW / 2, 400, 780);
  g.addColorStop(0, 'rgba(40,10,60,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  I.c.fillStyle = g; I.c.fillRect(0, 0, VW, VH);

  txt('SKYFALL', VW / 2, 396, 108, rgba(C.white, 0.96), 22, 'center', 'bold');
  I.c.save(); I.c.globalCompositeOperation = 'lighter'; I.c.globalAlpha = 0.5;
  txt('SKYFALL', VW / 2, 396, 108, rgba(C.cyan, 0.8), 22, 'center', 'bold');
  I.c.restore();
  txt('I N T E R C E P T O R', VW / 2, 448, 24, rgba(C.cyan, 0.85), 12, 'center');
  txt('⚠  ALIEN INCURSION — SECTOR 7  ⚠', VW / 2, 300, 22, rgba(C.red, 0.55 + 0.45 * pulse(I.t, 1.3)), 9, 'center');

  const a = 0.4 + 0.6 * pulse(I.t, 0.7);
  txt('CLICK OR PRESS ANY KEY TO BEGIN', VW / 2, 604, 28, rgba(C.white, a), 11, 'center');
  txt('AUDIO ON — HEADPHONES RECOMMENDED', VW / 2, 654, 17, rgba(C.green, 0.45), 6, 'center');
  stepParts(dt, 0); drawParts();
  scanlines(0.22); vignette(0.72);
}
export function chrome() {
  const a = 0.35 + 0.5 * pulse(I.t, 0.8);
  I.c.save();
  I.c.fillStyle = 'rgba(0,0,0,0.35)';
  I.c.fillRect(VW - 452, VH - 78, 420, 40);
  txt('▸ PRESS ANY KEY OR CLICK TO SKIP', VW - 42, VH - 51, 19, rgba(C.white, a), 4, 'right');
  I.c.fillStyle = 'rgba(255,255,255,0.10)'; I.c.fillRect(0, VH - 4, VW, 4);
  I.c.fillStyle = rgba(C.cyan, 0.55); I.c.fillRect(0, VH - 4, VW * sat(I.t / T6), 4);
  I.c.restore();
}
export function fit() {
  I.dpr = Math.min(2, window.devicePixelRatio || 1);
  I.W = window.innerWidth; I.H = window.innerHeight;
  I.cv.width = Math.max(1, Math.round(I.W * I.dpr));
  I.cv.height = Math.max(1, Math.round(I.H * I.dpr));
  I.sc = Math.max(I.W / VW, I.H / VH);
  I.ox = (I.W - VW * I.sc) / 2; I.oy = (I.H - VH * I.sc) / 2;
}
export function frame(ms) {
  if (I.phase === 'idle') return;
  I.raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ms - I.last) / 1000 || 0.016);
  I.last = ms;
  if (I.phase !== 'attract') I.t += dt;

  if (I.cv.width !== Math.round(I.W * I.dpr) || I.W !== window.innerWidth || I.H !== window.innerHeight) fit();

  I.shake *= Math.pow(0.02, dt);
  I.flash = Math.max(0, I.flash - dt * 2.6);

  I.c.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
  I.c.clearRect(0, 0, I.W, I.H);
  I.c.fillStyle = '#000'; I.c.fillRect(0, 0, I.W, I.H);
  I.c.save();
  I.c.setTransform(I.dpr * I.sc, 0, 0, I.dpr * I.sc, I.dpr * (I.ox + (I.shake ? rnd(-I.shake, I.shake) : 0)),
    I.dpr * (I.oy + (I.shake ? rnd(-I.shake, I.shake) : 0)));
  I.c.beginPath(); I.c.rect(0, 0, VW, VH); I.c.clip();

  try {
    if (I.phase === 'attract') attract(dt);
    else if (I.t < T1) scene1(I.t, dt);
    else if (I.t < T2) scene2(I.t - T1, dt);
    else if (I.t < T3) scene3(I.t - T2, dt);
    else if (I.t < T4) scene4(I.t - T3, dt);
    else if (I.t < T5) scene5(I.t - T4, dt);
    else scene6(I.t - T5, dt);
  } catch (e) {
    I.c.restore(); finish('skip'); return;
  }

  if (I.flash > 0.002) {
    I.c.globalCompositeOperation = 'lighter';
    I.c.fillStyle = rgba(I.flashCol, I.flash * I.flash);
    I.c.fillRect(0, 0, VW, VH);
    I.c.globalCompositeOperation = 'source-over';
  }
  if (I.phase === 'play') chrome();
  I.c.restore();

  /* hand the frame over to the live game underneath, then fade out */
  if (I.phase === 'play' && I.t >= HANDOFF) {
    if (!I.ended) { I.ended = true; if (I.cbEnd) { try { I.cbEnd(); } catch (e) { } } }
    const k = sat((I.t - HANDOFF) / (T6 - HANDOFF));
    I.cv.style.opacity = String(1 - k);
    if (k >= 1) finish('end');
  }
  if (I.phase === 'out') {
    I.outT += dt;
    I.cv.style.opacity = String(Math.max(0, 1 - I.outT / 0.28));
    if (I.outT > 0.3) finish(I.outMode);
  }
}
export function onKey(e) {
  if (I.phase === 'attract') { e.preventDefault(); begin(); return; }
  if (I.phase === 'play' && I.t > 0.35) skip();
}
export function onPtr() {
  if (I.phase === 'attract') { begin(); return; }
  if (I.phase === 'play' && I.t > 0.35) skip();
}
export function listen(on) {
  const f = on ? window.addEventListener : window.removeEventListener;
  f('keydown', onKey, true);
  f('mousedown', onPtr, true);
  f('touchstart', onPtr, true);
}
export function begin() {
  if (I.phase !== 'attract') return;
  sfx('init');
  sfx('setIntensity', 0.2);
  I.phase = 'play'; I.t = 0;
}

export function skip() {
  if (I.phase !== 'play') return;
  I.phase = 'out'; I.outMode = 'skip'; I.outT = 0;
  sfx('stopCine'); I.rumbleH = null; I.sirenH = null;
  sfx('setIntensity', 0.15);
}

export function finish(mode) {
  if (I.phase === 'idle') return;
  I.phase = 'idle';
  if (I.raf) { cancelAnimationFrame(I.raf); I.raf = 0; }
  listen(false);
  sfx('stopCine'); I.rumbleH = null; I.sirenH = null;
  parts.length = 0;
  if (I.cv) { I.cv.style.display = 'none'; I.cv.style.opacity = '1'; }
  if (mode === 'skip' && I.cbSkip) { try { I.cbSkip(); } catch (e) { } }
  if (mode === 'end' && !I.ended && I.cbEnd) { I.ended = true; try { I.cbEnd(); } catch (e) { } }
}

export function play(opts) {
  opts = opts || {};
  I.cbEnd = opts.onEnd || null; I.cbSkip = opts.onSkip || null;
  I.cv = document.getElementById('cine');
  if (!I.cv || !I.cv.getContext) { if (I.cbSkip) I.cbSkip(); return false; }
  I.c = I.cv.getContext('2d');
  if (!I.c) { if (I.cbSkip) I.cbSkip(); return false; }
  I.cv.style.display = 'block'; I.cv.style.opacity = '1';
  fit();
  for (const k in fired) delete fired[k];
  parts.length = 0;
  I.t = 0; I.last = performance.now(); I.shake = 0; I.flash = 0; I.ended = false;
  I.phase = 'attract';
  listen(true);
  I.raf = requestAnimationFrame(frame);
  return true;
}
export function stop() { finish(''); }

