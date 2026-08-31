/* ===== cinematic/scenes/scene6.js — the encounter =====
   Hands off to the 3D game underneath as the canvas fades (see
   engine.js's frame(), which drives the HANDOFF timing).

   Not everyone died on the way up.  Most of the wing falls away
   stricken — but two VIPERs punch through the swarm, catch our wing,
   and hold it: the same VIPER flight that joins the player in
   gameplay.  Ahead, the hive itself rises out of the horizon smoke.
   Scene runs u = 0 .. 7.0 (T5 .. T6); handoff fade starts at
   u = 6.38 (HANDOFF = T6 - 0.62). */
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
/* the two that made it: WING indices -> slot offset from the player.
   These are VIPER 2 and VIPER 4 — the flight that rejoins in-game. */
export const SURV = { 1: [-172, 30], 4: [178, 50] };
export const ALIENS = [];
(function () {
  for (let i = 0; i < 15; i++)
    ALIENS.push({ x: 90 + i * 100 + rnd(-34, 34), d: 1.1 + i * 0.14, s: rnd(0.4, 0.72), yo: rnd(-46, 26) });
})();
/* the survivors' side of the net, typed out radio-style */
export const RD6_X = 96, RD6_Y = 138;
export const RADIO6 = [
  { s: '» VIPER 2: AIRBORNE — FORMING ON YOU', at: 0.95, cps: 58, u: 0.5 },
  { s: '» VIPER 4: STILL WITH YOU, 03', at: 2.05, cps: 58, u: 0.45 }
];

export function scene6(u, dt) {
  const A = art();
  const hz = 470;
  const acc = ramp(0.25, 3.4, u);

  once('c6snd', T5 + 0.05, function () {
    sfx('setIntensity', 0.9);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.8);
  });
  once('c6riser', T5 + 3.90, function () { sfx('riser', 2.7); });

  dawnSky(hz, 0.6);
  if (A) A.cloudBank(I.c, hz - 120, 96, I.t * 0.6, [110, 34, 120], 0.38);
  neonGround(hz, I.t * 2.2 + acc * 6, 0.9);

  /* alien wall on the horizon */
  for (let i = 0; i < ALIENS.length; i++) {
    const al = ALIENS[i], q = sat((u - al.d) / 4.4);
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
  /* and, dead centre, the thing that owns them: the hive leviathan
     rising out of the horizon smoke, growing the whole scene */
  const lq = ramp(1.5, 5.4, u);
  if (A && A.leviathan && lq > 0.01)
    A.leviathan(I.c, 800, hz + 58 - lq * 76, 0.42 + lq * 1.05, Math.min(1, lq * 2.4) * 0.85, I.t);
  /* the swarm streaming off it, over our heads */
  if (A && A.waspSwarm) {
    const swa = ramp(1.9, 3.4, u);
    A.waspSwarm(I.c, -120, 210, VW + 240, 130, I.t * 1.3, 0.40 * swa, -1, 1.1);
    A.waspSwarm(I.c, -120, 356, VW + 240, 90, I.t, 0.28 * swa, 1, 0.8);
  }

  /* the player's interceptor: position first, drawn after the wing so
     the survivors tuck in behind and beside it */
  const pjS = 2.35 - acc * 0.85;
  const pjY = 692 - acc * 92 + Math.sin(u * 1.5) * 6;

  /* most of the wing, falling away behind us — stricken, trailing
     smoke, dropping out of the fight one by one.  But not all of it:
     the two SURV slots punch through, arrest the fall, and slide up
     into formation on our wing instead. */
  for (let i = 0; i < WING.length; i++) {
    const w = WING[i];
    const sv = SURV[i];
    if (sv) {
      /* survivor: same fall-toward-camera start, caught mid-arc and
         eased into the slot beside the player */
      const q = Math.min(0.32, acc * w.k);          // the fall it recovers from
      const form = ramp(0.85, 2.70, u);             // the recovery + join
      const fx = 800 + (w.x0 - 800) * (1 + q * 3.4);
      const fy = w.y0 + q * 560 + q * q * 220;
      const fs = w.s0 * (1 + q * 5.2);
      const tx = 800 + sv[0] + Math.sin(u * 1.1 + i) * 7;
      const ty = pjY + sv[1] + Math.sin(u * 1.6 + i * 2.1) * 9;
      const x = fx + (tx - fx) * form;
      const y = fy + (ty - fy) * form;
      const s = fs + (1.30 - fs) * form;
      /* banks hard out of the dive, then settles level with us */
      const rot = (1 - form) * (w.x0 - 800) * 0.004 + Math.sin(u * 0.9 + i) * 0.05;
      if (A) A.jet(I.c, x, y, s, rot, 0.92, [128, 186, 214]);
      for (let k = 0; k < 2; k++)
        part(x + rnd(-8, 8) * s, y + 30 * s, rnd(-24, 24), 140 + 240 * acc,
          rnd(0.25, 0.55), rnd(5, 11) * (s * 0.5 + 0.3), k ? C.cyan : C.white, { d: 0.9, gr: 16 });
      continue;
    }
    const q = acc * w.k;
    const s = w.s0 * (1 + q * 5.2);
    const x = 800 + (w.x0 - 800) * (1 + q * 3.4);
    const y = w.y0 + q * 560 + q * q * 220;
    if (y > VH + 240 || x < -400 || x > VW + 400) continue;
    const hurt = i !== 7;                     // one more limps clear off-frame
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
  if (A) A.jet(I.c, 800, pjY, pjS, Math.sin(u * 0.9) * 0.05, 1, C.cyan);
  for (let k = 0; k < 2; k++)
    part(800 + rnd(-12, 12) * pjS, pjY + 32 * pjS, rnd(-40, 40), rnd(160, 340),
      rnd(0.3, 0.6), rnd(8, 18) * pjS * 0.6, k ? C.cyan : C.white, { d: 0.9, gr: 22 });

  /* speed streaks — the three of them banking away together */
  const st = ramp(4.5, 6.3, u);
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

  /* ---- radio: the survivors checking in as they slot in beside us.
     Typed out like scene 3's party line, faded before the handoff. ---- */
  const rdFade = 1 - ramp(4.9, 5.5, u);
  if (rdFade > 0.01) {
    for (let i = 0; i < RADIO6.length; i++) {
      const L = RADIO6[i], q = u - L.at;
      if (q < 0) continue;
      once('c6rd' + i, T5 + L.at, function () { sfx('radio', L.u); sfx('beep', 0.10 + i * 0.06); });
      const n = Math.min(L.s.length, Math.floor(q * L.cps));
      txt(L.s.slice(0, n), RD6_X, RD6_Y + i * 32, 19, rgba(C.ice, 0.78 * rdFade), 2);
    }
  }

  /* the mission, in one line — no longer alone up here */
  if (u > 3.7 && u < 6.3) {
    const a = ramp(3.7, 4.2, u) * (1 - ramp(5.8, 6.3, u));
    txt('INTERCEPTOR 03 — LEAD THE SURVIVORS. HUNT THE HIVE.', VW / 2, 820, 26, rgba(C.cyan, a), 8, 'center');
  }
  once('c6flash', T5 + 6.05, function () { I.flash = 0.9; I.flashCol = C.ice; I.shake = 22; });
  vignette(0.55);
}
