/* ===== cinematic/scenes/scene6.js — the encounter =====
   Hands off to the 3D game underneath as the canvas fades (see
   engine.js's frame(), which drives the HANDOFF timing). */
import { I } from './state.js';
import { VW, VH, T5, C, rgba, rnd, sat, ramp, once, sfx, glow, txt,
  part, stepParts, drawParts, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 6 — the encounter, handing off to the 3D game
   ================================================================ */
export const WING = [];
(function () {
  const lay = [[-1, 0], [1, 0], [-2, 1], [2, 1], [-3, 1.8], [3, 1.8], [-1.6, 2.6], [1.6, 2.6], [0, 3.2]];
  for (let i = 0; i < lay.length; i++)
    WING.push({ x0: 800 + lay[i][0] * 86, y0: 430 + lay[i][1] * 26, s0: 0.16 + lay[i][1] * 0.03, k: 1 + i * 0.06 });
})();
export const ALIENS = [];
(function () {
  for (let i = 0; i < 15; i++)
    ALIENS.push({ x: 90 + i * 100 + rnd(-34, 34), d: 1.1 + i * 0.14, s: rnd(0.4, 0.72), yo: rnd(-46, 26) });
})();

export function scene6(u, dt) {
  const A = art();
  const hz = 470;
  const acc = ramp(0.25, 2.7, u);

  once('c6snd', T5 + 0.05, function () {
    sfx('setIntensity', 0.9);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.8);
  });
  once('c6riser', T5 + 1.75, function () { sfx('riser', 2.7); });

  dawnSky(hz, 0.6);
  if (A) A.cloudBank(I.c, hz - 120, 96, I.t * 0.6, [110, 34, 120], 0.38);
  neonGround(hz, I.t * 2.2 + acc * 6, 0.9);

  /* alien wall on the horizon */
  for (let i = 0; i < ALIENS.length; i++) {
    const al = ALIENS[i], q = sat((u - al.d) / 3.1);
    if (q <= 0) continue;
    const s = al.s * (0.05 + q * q * 0.95);
    const y = hz + al.yo - 8 + q * 44;
    if (A) A.warship(I.c, al.x, y, s, Math.min(1, q * 3), 0, I.t);
    if (q > 0.55 && Math.random() < 0.02) {
      I.c.save(); I.c.globalCompositeOperation = 'lighter';
      I.c.drawImage(glow(C.mag), al.x - 60, y - 60, 120, 120);
      I.c.restore();
    }
  }

  /* what is left of the wing, falling away behind us — stricken,
     trailing smoke, dropping out of the fight one by one.  They are
     not escorts anymore: they are the reason the next line is true. */
  for (let i = 0; i < WING.length; i++) {
    const w = WING[i], q = acc * w.k;
    const s = w.s0 * (1 + q * 5.2);
    const x = 800 + (w.x0 - 800) * (1 + q * 3.4);
    const y = w.y0 + q * 560 + q * q * 220;
    if (y > VH + 240 || x < -400 || x > VW + 400) continue;
    const hurt = i % 3 !== 1;                 // most of them are hit
    if (A) A.jet(I.c, x, y, s,
      (w.x0 - 800) * 0.0012 + (hurt ? q * (i % 2 ? 0.9 : -0.9) : 0),
      hurt ? 0 : 0.85, hurt ? [104, 96, 104] : [124, 150, 186]);
    if (q > 0.1 && i % 2 === 0)
      part(x, y + 30 * s, rnd(-16, 16), 120 + 260 * q, rnd(0.3, 0.6),
        rnd(5, 13) * (s + 0.4), hurt ? (Math.random() < 0.35 ? C.orange : C.smoke) : C.cyan,
        { add: !hurt || Math.random() < 0.35, d: 0.92 });
  }
  once('c6last', T5 + 1.15, function () {
    sfx('boom', 1.0); I.shake = Math.max(I.shake, 10);
    I.flash = Math.max(I.flash, 0.22); I.flashCol = C.orange;
  });

  /* the player's interceptor pulling to the front */
  const pjS = 2.35 - acc * 0.85;
  const pjY = 692 - acc * 92 + Math.sin(u * 1.5) * 6;
  if (A) A.jet(I.c, 800, pjY, pjS, Math.sin(u * 0.9) * 0.05, 1, C.cyan);
  for (let k = 0; k < 2; k++)
    part(800 + rnd(-12, 12) * pjS, pjY + 32 * pjS, rnd(-40, 40), rnd(160, 340),
      rnd(0.3, 0.6), rnd(8, 18) * pjS * 0.6, k ? C.cyan : C.white, { d: 0.9, gr: 22 });

  /* speed streaks */
  const st = ramp(2.8, 4.6, u);
  if (st > 0) {
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    I.c.strokeStyle = rgba(C.ice, 0.5 * st); I.c.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * 6.2832 + I.t * 0.4;
      const r0 = 120 + ((i * 137 + I.t * 900 * st) % 900);
      const len = 60 + 260 * st;
      I.c.globalAlpha = 0.5 * st * (r0 / 1000);
      I.c.beginPath();
      I.c.moveTo(800 + Math.cos(a) * r0, pjY - 120 + Math.sin(a) * r0 * 0.55);
      I.c.lineTo(800 + Math.cos(a) * (r0 + len), pjY - 120 + Math.sin(a) * (r0 + len) * 0.55);
      I.c.stroke();
    }
    I.c.restore();
  }

  stepParts(dt, 0); drawParts(false); drawParts(true);

  if (u > 0.45 && u < 3.0) {
    const a = ramp(0.45, 0.95, u) * (1 - ramp(2.4, 3.0, u));
    txt('INTERCEPTOR 03  —  YOU ARE THE ONLY BIRD IN THE AIR', VW / 2, 820, 26, rgba(C.cyan, a), 8, 'center');
  }
  once('c6flash', T5 + 4.05, function () { I.flash = 0.9; I.flashCol = C.ice; I.shake = 22; });
  vignette(0.55);
}
