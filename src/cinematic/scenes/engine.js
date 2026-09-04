/* ===== cinematic/scenes/engine.js — shared plumbing + render loop =====
   Constants, palette, canvas/text/particle helpers, the backdrop
   primitives (starfield/scanlines/vignette/dawn sky/neon ground), the
   requestAnimationFrame loop, the play/skip/finish lifecycle, and the
   window-space presentation stack (matte bars, film grain, lens
   vignette, cut dips) composited over whatever the scenes drew.

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
export const T5 = T4 + 4.4;          // 24.0 .. 28.4  the launch that bleeds
export const T6 = T5 + 7.0;          // 28.4 .. 35.4  encounter — survivors form up, the hive revealed
export const HANDOFF = T6 - 0.62;    // gameplay starts under the fading canvas
const fired = {};                    // one-shot event latches, engine.js-local

/* ---- presentation layer (engine-local, additive) ----
   Everything below is compositing dressing laid over whatever the six
   scenes drew: matte bars, grain, vignette, cut dips.  None of it may
   move a timing boundary or leak into the scene call contract, so it
   all lives in module-locals rather than exports.  CUTS deliberately
   stops at T5: the T6 edge is the HANDOFF fade into live gameplay,
   which is sacred and must not get an extra exposure dip on top. */
const CUTS = [T1, T2, T3, T4, T5];
let pT = 0;                          /* presentation clock: unlike I.t it also runs during
                                        attract (where I.t is held at 0), so the grain
                                        crawl and skip-hint pulse never freeze */
let grainPat = null;                 /* cached noise tile as a repeat pattern.  Built once,
                                        256px square, sparse 1px speckles on transparency;
                                        per-frame "boiling" comes from re-anchoring the
                                        tile at a hashed offset a few times a second, NOT
                                        from regenerating noise -- that is the whole trick
                                        that keeps film grain affordable on a 2D canvas */
let prsKey = '', barH = 0,           /* window-space caches, rebuilt only when the window
                                        actually changes size: the gentle outer vignette
                                        and the matte bars' inner-edge glow gradients */
  vigG = null, barTG = null, barBG = null;
function grain() {
  if (grainPat) return grainPat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  for (let i = 0; i < 3400; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.55 ? 'rgba(255,255,255,' + (0.30 + v * 0.55).toFixed(2) + ')'
      : 'rgba(0,0,0,' + (0.30 + (v - 0.55)).toFixed(2) + ')';
    g.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, 1, 1);
  }
  grainPat = g.createPattern(cv, 'repeat');
  return grainPat;
}
function prsCache() {
  const k = I.W + 'x' + I.H;
  if (prsKey === k) return;
  prsKey = k;
  /* ~5.8% matte per edge: masks 16:9 content to roughly 2:1 -- reads
     as cinema without decapitating compositions built for the full
     900px frame (the scenes are being staged against VH, not the bars) */
  barH = Math.max(14, Math.round(I.H * 0.058));
  vigG = I.c.createRadialGradient(I.W / 2, I.H / 2, Math.min(I.W, I.H) * 0.42,
    I.W / 2, I.H / 2, Math.hypot(I.W, I.H) * 0.58);
  vigG.addColorStop(0, 'rgba(0,0,0,0)');
  vigG.addColorStop(0.6, 'rgba(0,0,0,0.06)');
  vigG.addColorStop(1, 'rgba(0,0,0,0.30)');
  barTG = I.c.createLinearGradient(0, barH - 12, 0, barH);
  barTG.addColorStop(0, 'rgba(150,210,240,0)');
  barTG.addColorStop(1, 'rgba(150,210,240,0.10)');
  barBG = I.c.createLinearGradient(0, I.H - barH + 12, 0, I.H - barH);
  barBG.addColorStop(0, 'rgba(150,210,240,0)');
  barBG.addColorStop(1, 'rgba(150,210,240,0.10)');
}
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
  /* A small hot core with a long soft skirt, not a near-flat disc.
     The old ramp (1.0 held out to 0.32r, then straight to 0) gave every
     particle a hard-edged bright plate, so an exhaust trail laid down
     along a moving emitter read as a string of separate beads instead
     of one continuous plume.  With the falloff below, neighbouring
     particles overlap in their skirts and merge. */
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.00, 'rgba(' + key + ',1)');
  g.addColorStop(0.14, 'rgba(' + key + ',0.72)');
  g.addColorStop(0.34, 'rgba(' + key + ',0.34)');
  g.addColorStop(0.62, 'rgba(' + key + ',0.10)');
  g.addColorStop(1.00, 'rgba(' + key + ',0)');
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
/* Logical start of the live pool.  Slots before it have been dropped
   (oldest-first, when the pool is at capacity) and are reclaimed by
   the next stepParts() compaction.  This replaces a shift() per spawn
   at the cap and a splice() per expiry -- each of those memmoved the
   whole ~1400-entry array, and scene 5's sub-stepped contrails run
   this pool saturated, so it was thousands of element moves a frame. */
let partsHead = 0;
export function part(x, y, vx, vy, life, r, col, o) {
  if (parts.length - partsHead > 1400) partsHead++;   /* drop the oldest, O(1) */
  o = o || {};
  parts.push({
    x: x, y: y, vx: vx, vy: vy, l: life, L: life, r: r, c: col,
    g: o.g || 0, d: o.d == null ? 0.9 : o.d, gr: o.gr || 0,
    add: o.add !== false, sq: !!o.sq, rot: o.rot || 0, vr: o.vr || 0, a: o.a == null ? 1 : o.a
  });
}
export function stepParts(dt, dcam) {
  /* one forward compaction pass: survivors slide down over the expired
     and over anything part() dropped off the head since the last step.
     Relative order is preserved, so the source-over smoke layering and
     draw order are exactly what splice()/shift() produced. */
  let w = 0;
  for (let i = partsHead; i < parts.length; i++) {
    const p = parts[i];
    p.l -= dt;
    if (p.l <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt + (dcam || 0);
    p.vy += p.g * dt;
    const dd = Math.pow(p.d, dt * 60);
    p.vx *= dd; p.vy *= dd;
    p.r += p.gr * dt; p.rot += p.vr * dt;
    if (p.r < 0.4) p.r = 0.4;
    parts[w++] = p;
  }
  parts.length = w;
  partsHead = 0;
}
export function drawParts(filterAdd) {
  for (let i = partsHead; i < parts.length; i++) {
    const p = parts[i];
    if (filterAdd !== undefined && p.add !== filterAdd) continue;
    const a = sat(p.l / p.L) * p.a;
    I.c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    I.c.globalAlpha = p.add ? a : (p.sq ? a * 0.95 : a * 0.62);
    if (p.sq) {
      /* A tumbling hull plate, not a scrap of paper.  These used to be
         one flat fill of the full-brightness palette colour, which is
         exactly why the aftermath read as confetti: identical pastel
         rectangles, evenly lit, no volume.  Now the broad face sits in
         shadow and only rolls into the light as the chunk turns, with
         one bright edge on the lit side — so the debris field strobes
         and varies the way real spinning wreckage does. */
      const k = p.c, lit = Math.abs(Math.cos(p.rot));
      const dk = 0.10 + 0.22 * lit;
      I.c.save(); I.c.translate(p.x, p.y); I.c.rotate(p.rot);
      I.c.fillStyle = 'rgb(' + (k[0] * dk | 0) + ',' + (k[1] * dk | 0) + ',' + (k[2] * dk | 0) + ')';
      I.c.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      if (lit > 0.12) {
        const br = 0.26 + 0.44 * lit;
        I.c.fillStyle = 'rgb(' + (Math.min(255, k[0] * br) | 0) + ',' + (Math.min(255, k[1] * br) | 0) +
          ',' + (Math.min(255, k[2] * br) | 0) + ')';
        I.c.fillRect(-p.r, -p.r * 0.45, p.r * 2, Math.max(0.8, p.r * 0.30 * lit));
      }
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
  for (let i = partsHead; i < parts.length; i++) {
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
  /* sun.  The disc used to terminate on a razor-sharp clipped circle
     against the sky, which is the single thing that made it read as a
     sticker; a low sun seen through this much atmosphere blooms into
     the air around it and its lower limb is eaten by horizon haze.
     So: a wide corona under it, the clipped disc on top, then a haze
     wash that dissolves the bottom of the limb back into the band. */
  I.c.save(); I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.30;
  I.c.drawImage(glow([255, 132, 84]), 430 - 330, hz - 20 - 330, 660, 660);
  I.c.globalAlpha = 0.22;
  I.c.drawImage(glow([255, 190, 110]), 430 - 178, hz - 20 - 178, 356, 356);
  I.c.globalAlpha = 1;
  const sg = I.c.createLinearGradient(0, hz - 250, 0, hz + 30);
  sg.addColorStop(0, rgba([255, 220, 90], 0.95));
  sg.addColorStop(0.55, rgba([255, 110, 60], 0.9));
  sg.addColorStop(1, rgba([255, 40, 120], 0.85));
  I.c.save();
  I.c.beginPath(); I.c.arc(430, hz - 20, 230, 0, 6.2832); I.c.clip();
  I.c.fillStyle = sg; I.c.fillRect(190, hz - 260, 480, 300);
  I.c.fillStyle = 'rgba(10,2,20,0.85)';
  for (let i = 0; i < 9; i++) I.c.fillRect(190, hz - 190 + i * 26, 480, 4 + i * 1.6);
  /* feather only the last few pixels of the limb — enough that the
     edge is not a razor-cut arc, not so much that the disc turns into
     a soft ball and starts reading as a moon */
  I.c.globalCompositeOperation = 'destination-out';
  const fr = I.c.createRadialGradient(430, hz - 20, 214, 430, hz - 20, 232);
  fr.addColorStop(0, 'rgba(0,0,0,0)');
  fr.addColorStop(1, 'rgba(0,0,0,0.88)');
  I.c.fillStyle = fr; I.c.fillRect(190, hz - 260, 480, 300);
  I.c.restore();
  I.c.globalAlpha = 0.4;
  I.c.drawImage(glow([255, 90, 120]), 430 - 420, hz - 20 - 420, 840, 840);
  I.c.restore();
  /* horizon band: a real depth of haze rather than one bright hairline,
     so everything standing on the horizon is standing *in* something */
  I.c.save(); I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.30; I.c.drawImage(glow([255, 96, 110]), -200, hz - 210, VW + 400, 300);
  I.c.globalAlpha = 0.35; I.c.drawImage(glow(C.mag), 0, hz - 90, VW, 180);
  I.c.globalAlpha = 1;
  I.c.fillStyle = rgba(C.mag, 0.5); I.c.fillRect(0, hz - 3, VW, 5);
  I.c.restore();
  /* and a thin cool scatter layer sitting just above the line, which
     the hive and the alien wall then rise through */
  const hzg = I.c.createLinearGradient(0, hz - 118, 0, hz + 2);
  hzg.addColorStop(0, 'rgba(84,26,72,0)');
  hzg.addColorStop(1, 'rgba(96,30,80,0.34)');
  I.c.fillStyle = hzg; I.c.fillRect(0, hz - 118, VW, 120);
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
  /* ground fog against the horizon.  Without this the sky meets the
     ground on one perfectly hard black line and everything standing on
     it — the hive, the alien wall, the silos — reads as pasted onto a
     backdrop rather than standing in the same air. */
  I.c.save();
  const fg = I.c.createLinearGradient(0, hz - 4, 0, hz + 96);
  fg.addColorStop(0.00, 'rgba(158,52,116,0.46)');
  fg.addColorStop(0.34, 'rgba(96,28,80,0.24)');
  fg.addColorStop(1.00, 'rgba(52,14,52,0)');
  I.c.fillStyle = fg; I.c.fillRect(0, hz - 4, VW, 100);
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
  /* Skip affordance, re-set into the bottom matte bar.  Same gate and
     same frame it always appeared on -- only the dressing changed: the
     matte itself is now the backing plate (no more floating smoked
     rect over the picture), the type sits optically centred in the
     bar, and the pulse is a soft additive breath over a steady base
     instead of one label strobing its whole alpha.  Drawn in window
     space, which also rescues the progress track: at VH-4 in virtual
     coordinates the cover-scale crop used to push it off the bottom
     of most windows entirely. */
  const fs = Math.max(11, Math.min(19, Math.round(barH * 0.40)));
  const ty = Math.round(I.H - barH * 0.5 + fs * 0.36);
  const rx = I.W - Math.max(24, Math.round(barH * 0.6));
  const a = 0.24 + 0.30 * pulse(pT, 0.55);
  I.c.save();
  txt('PRESS ANY KEY OR CLICK TO SKIP  ▸', rx, ty, fs, 'rgba(214,232,244,0.34)', 5, 'right');
  I.c.globalCompositeOperation = 'lighter';
  txt('PRESS ANY KEY OR CLICK TO SKIP  ▸', rx, ty, fs, rgba(C.ice, a * 0.55), 5, 'right');
  I.c.globalCompositeOperation = 'source-over';
  /* progress track along the very bottom of the matte */
  const pw = I.W * sat(I.t / T6);
  I.c.fillStyle = 'rgba(255,255,255,0.08)'; I.c.fillRect(0, I.H - 3, I.W, 2);
  I.c.fillStyle = rgba(C.cyan, 0.55); I.c.fillRect(0, I.H - 3, pw, 2);
  I.c.globalCompositeOperation = 'lighter'; I.c.globalAlpha = 0.40;
  I.c.drawImage(glow(C.cyan), pw - 7, I.H - 9, 14, 14);   /* playhead ember */
  I.c.globalAlpha = 1; I.c.globalCompositeOperation = 'source-over';
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
  pT += dt;                          /* presentation clock never pauses */

  if (I.cv.width !== Math.round(I.W * I.dpr) || I.W !== window.innerWidth || I.H !== window.innerHeight) fit();

  I.shake *= Math.pow(0.02, dt);
  I.flash = Math.max(0, I.flash - dt * 2.6);

  I.c.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
  I.c.clearRect(0, 0, I.W, I.H);
  I.c.fillStyle = '#000'; I.c.fillRect(0, 0, I.W, I.H);
  I.c.save();
  /* Overscan with the shake.  The shake is a translation of the whole
     frame, so on the big hits (shake 46 at the rocket kill) it used to
     slide the picture off its own edge and expose bands of the black
     backing — which reads instantly as "a picture being wobbled about
     inside a box" rather than as a camera being hit.  Scaling up by
     just over the shake amplitude keeps the frame full at all times. */
  const sh = I.shake;
  /* Rotational component on top of the translation: a real camera hit
     never displaces the sensor on a pure x/y slide, the mount twists.
     A few milliradians at the biggest hit (shake 46 -> ~5.5mrad), off
     the same decay envelope because it is derived from I.shake itself.
     The overscan grows by ~2.1*|rot| so the swung corners of the
     rotated frame can never expose the black backing. */
  const rot = sh > 0.02 ? sh * 1.2e-4 * rnd(-1, 1) : 0;
  const os = Math.min(1.26, 1 + 2.2 * sh / (VH * I.sc) + 2.1 * Math.abs(rot));
  const s2 = I.dpr * I.sc * os;
  I.c.setTransform(s2, 0, 0, s2,
    I.dpr * (I.ox - VW * I.sc * (os - 1) * 0.5 + (sh ? rnd(-sh, sh) : 0)),
    I.dpr * (I.oy - VH * I.sc * (os - 1) * 0.5 + (sh ? rnd(-sh, sh) : 0)));
  if (rot) { I.c.translate(VW / 2, VH / 2); I.c.rotate(rot); I.c.translate(-VW / 2, -VH / 2); }
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

  /* rising-edge detect AFTER dispatch (scenes write I.flash in there):
     decay only ever shrinks the value, so a jump over last frame's
     level is a fresh detonation -- latch two frames of fringe echo */
  if (I.flash > I.flashPrev + 0.04) I.flashEcho = 2;
  if (I.flash > 0.002) {
    /* A blast flash blooms out from where it went off; filling the
       whole viewport with one flat value instead washed every frame to
       an even, papery grey and killed the shape of the explosion
       underneath.  Hot in the middle, falling away to a low ambient
       lift at the corners. */
    const f = I.flash * I.flash;
    const fg = I.c.createRadialGradient(VW / 2, VH * 0.46, 0, VW / 2, VH * 0.46, VH * 1.05);
    fg.addColorStop(0, rgba(I.flashCol, f));
    fg.addColorStop(0.42, rgba(I.flashCol, f * 0.62));
    fg.addColorStop(1, rgba(I.flashCol, f * 0.18));
    I.c.globalCompositeOperation = 'lighter';
    I.c.fillStyle = fg;
    I.c.fillRect(0, 0, VW, VH);
    if (I.flashEcho > 0) {
      /* chromatic fringe on the strike frame only: the bloom split
         into a red ghost left and a cyan ghost right, the way a hard
         overexposure smears across a cheap lens.  Two stretched draws
         of the cached glow sprites -- no filters, no new gradients,
         gone within two frames. */
      const dx = 10 + 34 * f, r = VH * 1.15;
      I.c.globalAlpha = f * 0.20;
      I.c.drawImage(glow([255, 64, 64]), VW / 2 - dx - r, VH * 0.46 - r, r * 2, r * 2);
      I.c.drawImage(glow([64, 220, 255]), VW / 2 + dx - r, VH * 0.46 - r, r * 2, r * 2);
      I.c.globalAlpha = 1;
    }
    I.c.globalCompositeOperation = 'source-over';
  }
  if (I.flashEcho > 0) I.flashEcho--;
  I.flashPrev = I.flash;
  I.c.restore();

  /* ---- presentation stack, window space (the "print", not the
     camera): none of this may inherit the shake/rotation transform.
     Order is deliberate: exposure dip on the picture and flash, grain
     on top of everything photographed, vignette as the lens, matte
     bars as the projection gate, skip chrome over the matte. ---- */
  prsCache();
  if (I.phase !== 'attract') {
    /* micro dip at each interior cut so the edit reads as a CUT, a
       0.17s dip to ~60% black centred exactly on the boundary frame.
       CUTS ends at T5 -- nothing may shade the HANDOFF fade. */
    let dip = 0;
    for (let i = 0; i < CUTS.length; i++) {
      const d = Math.abs(I.t - CUTS[i]);
      if (d < 0.085) { const q = 1 - d / 0.085; if (q * q > dip) dip = q * q; }
    }
    if (dip > 0.01) {
      I.c.fillStyle = 'rgba(0,0,0,' + (dip * 0.62).toFixed(3) + ')';
      I.c.fillRect(0, 0, I.W, I.H);
    }
  }
  /* film grain: one pattern fill of the cached tile, re-anchored at a
     hashed offset ~12x a second so it boils instead of sitting still */
  const gi = (pT * 12) | 0, gx = (gi * 97) % 256, gy = (gi * 53) % 256;
  I.c.save();
  I.c.globalAlpha = 0.05;
  I.c.translate(-gx, -gy);
  I.c.fillStyle = grain();
  I.c.fillRect(gx, gy, I.W, I.H);
  I.c.restore();
  I.c.fillStyle = vigG; I.c.fillRect(0, 0, I.W, I.H);
  /* matte bars, over the vignette so the black stays true black, with
     a breath of cool light along each inner edge so the gate reads as
     an object in front of the picture rather than dead crop */
  I.c.fillStyle = '#000';
  I.c.fillRect(0, 0, I.W, barH);
  I.c.fillRect(0, I.H - barH, I.W, barH);
  I.c.fillStyle = barTG; I.c.fillRect(0, barH - 12, I.W, 12);
  I.c.fillStyle = barBG; I.c.fillRect(0, I.H - barH, I.W, 12);
  I.c.fillStyle = 'rgba(190,225,255,0.09)';
  I.c.fillRect(0, barH - 1, I.W, 1);
  I.c.fillRect(0, I.H - barH, I.W, 1);
  if (I.phase === 'play') chrome();

  /* hand the frame over to the live game underneath, then fade out */
  if (I.phase === 'play' && I.t >= HANDOFF) {
    if (!I.ended) { I.ended = true; I.done = true; if (I.cbEnd) { try { I.cbEnd(); } catch (e) { } } }
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
  /* Late skip: past the HANDOFF the phase is still 'play' while the
     tail fades, but cbEnd has already fired and the game is live under
     the canvas.  A skip here must be a no-op -- routing it through
     finish('skip') would fire cbSkip and slam the intro menu on top of
     the running game.  Let the tail finish fading on its own. */
  if (I.done) return;
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
  parts.length = 0; partsHead = 0;
  if (I.cv) { I.cv.style.display = 'none'; I.cv.style.opacity = '1'; }
  /* terminal-callback latch: whichever of cbSkip/cbEnd fires first
     wins, in either order; every later finish() is cleanup-only.  (The
     natural end after the HANDOFF already fired cbEnd arrives here as
     mode 'end' with I.ended set -- guarded twice below.) */
  if (I.done) return;
  if (mode === 'skip' && I.cbSkip) { I.done = true; try { I.cbSkip(); } catch (e) { } }
  if (mode === 'end' && !I.ended && I.cbEnd) { I.done = true; I.ended = true; try { I.cbEnd(); } catch (e) { } }
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
  parts.length = 0; partsHead = 0;
  I.t = 0; I.last = performance.now(); I.shake = 0; I.flash = 0; I.ended = false; I.done = false;
  I.flashPrev = 0; I.flashEcho = 0;
  I.phase = 'attract';
  listen(true);
  I.raf = requestAnimationFrame(frame);
  return true;
}
export function stop() { finish(''); }

