/* ===== cinematic/scenes/scene5.js — the mass launch =====
   Four depth planes, each with its own scale, contrast, haze and rate.
   hazeVeil() (the air between the planes) is local to this scene. */
import { I } from './state.js';
import { VW, VH, T4, T5, C, rgba, rnd, sat, ramp, once, sfx, txt,
  part, stepParts, drawParts, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 5 — the mass launch.  Four depth planes, each with its own
   scale, contrast, haze and — the part that actually does the work —
   its own rate.  A near jet crosses the frame in one second; a far
   one covers a twentieth of it in the whole scene.
   ================================================================ */
export const SILOS = [
  { x: 300, w: 210, at: 0.26 }, { x: 690, w: 250, at: 0.38 },
  { x: 1080, w: 230, at: 0.50 }, { x: 1420, w: 180, at: 0.62 },
  { x: 120, w: 150, at: 0.74 }
];
export const L_FAR = [], L_MID = [], L_NEAR = [];
export const FG5 = [
  { at: 1.00, dir: -1, y: 812, s: 4.4, dur: 0.60, rot: 1.02 },
  { at: 3.00, dir: 1, y: 862, s: 5.3, dur: 0.54, rot: -1.16 }
];
(function () {
  /* far: already up, tiny, hazed, drifting on their own headings */
  for (let i = 0; i < 21; i++) {
    L_FAR.push({
      x: -80 + i * 88 + rnd(-38, 38), y: rnd(-266, -18),
      s: rnd(0.11, 0.20), vx: rnd(13, 34) * (i % 3 ? 1 : -1),
      vy: rnd(-14, -4), rot: rnd(0.10, 0.62) * (i % 3 ? 1 : -1), ph: rnd(0, 6.28)
    });
  }
  /* mid: the launch itself, climbing out of the silos */
  for (let i = 0; i < 13; i++) {
    const dx = rnd(-340, 340);
    L_MID.push({
      si: i % SILOS.length, at: 0.62 + i * 0.122,
      dx: dx, s0: rnd(0.28, 0.56), climb: rnd(180, 300),
      /* it banks the way it is actually going: no two headings alike */
      rot: dx / 760 + rnd(-0.12, 0.12)
    });
  }
  /* near: fast diagonal departures right across the frame */
  L_NEAR.push({ at: 0.48, dir: 1, y0: 700, y1: 128, s0: 2.5, s1: 0.72, dur: 1.12 });
  L_NEAR.push({ at: 1.40, dir: -1, y0: 772, y1: 214, s0: 3.0, s1: 0.86, dur: 0.94 });
  L_NEAR.push({ at: 2.36, dir: 1, y0: 730, y1: 86, s0: 2.7, s1: 0.68, dur: 1.04 });
  /* slow enough that it is still mid-frame when the scene cuts: the last
     thing you see is an aircraft close enough to count the panels on. */
  L_NEAR.push({ at: 3.40, dir: -1, y0: 706, y1: 176, s0: 2.7, s1: 0.80, dur: 1.50 });
})();

/* the air between the planes.  Warm and thick at the horizon, gone
   overhead — draw it between layers and distance does the rest. */
export function hazeVeil(hz, a) {
  const g = I.c.createLinearGradient(0, hz - 430, 0, hz + 30);
  g.addColorStop(0, 'rgba(132,54,120,0)');
  g.addColorStop(0.52, 'rgba(150,62,124,' + (a * 0.34).toFixed(3) + ')');
  g.addColorStop(0.88, 'rgba(206,80,108,' + (a * 0.72).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,124,88,' + a.toFixed(3) + ')');
  I.c.fillStyle = g; I.c.fillRect(0, hz - 430, VW, 480);
}

export function scene5(u, dt) {
  const A = art();
  const tilt = ramp(0.3, 4.0, u) * 215;
  const hz = 646 + tilt;
  const pan = ramp(0, 4.4, u) * 250;      /* the camera slews; parallax by z */

  once('c5snd', T4 + 0.05, function () {
    sfx('setIntensity', 0.72);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.55);
  });
  once('c5pass1', T4 + 0.94, function () { sfx('jetPass', -1); });
  once('c5pass2', T4 + 1.78, function () { sfx('jetPass', 1); });
  once('c5pass3', T4 + 3.30, function () { sfx('jetPass', 1); });

  stepParts(dt, 0);
  dawnSky(hz, 0);

  /* ---- PLANE 1 (z~0.08): specks.  Low contrast, washed out, slow. ---- */
  if (A) for (let i = 0; i < L_FAR.length; i++) {
    const f = L_FAR[i];
    const x = f.x + f.vx * u - pan * 0.05;
    const y = hz + f.y + f.vy * u + Math.sin(u * 0.7 + f.ph) * 3;
    I.c.save();
    I.c.globalAlpha = 0.40 + 0.16 * Math.sin(f.ph);
    A.jet(I.c, x, y, f.s, f.rot, 0.45, [188, 128, 168]);
    I.c.restore();
  }
  hazeVeil(hz, 0.40);

  /* a cloud deck between the far and middle distance, so aircraft
     genuinely pass behind something */
  if (A) A.cloudBank(I.c, hz - 244, 98, I.t * 0.55, [120, 40, 130], 0.44);
  hazeVeil(hz, 0.15);

  /* ---- the ground plane ---- */
  neonGround(hz, I.t * 0.5, 0.85);
  for (let i = 0; i < SILOS.length; i++) {
    const s = SILOS[i];
    const open = ramp(s.at, s.at + 0.55, u);
    if (A) A.silo(I.c, s.x - pan * 0.16, hz + 66, s.w, open, C.cyan);
    if (open > 0.4 && Math.random() < 0.4)
      part(s.x - pan * 0.16 + rnd(-s.w / 2, s.w / 2), hz + 60, rnd(-30, 30), rnd(-40, -8),
        rnd(1.2, 2.4), rnd(22, 50), C.smoke, { add: false, d: 0.96, gr: 26 });
  }

  /* ---- PLANE 2 (z~0.4): the launch.  Mid scale, mid rate. ---- */
  for (let i = 0; i < L_MID.length; i++) {
    const m = L_MID[i], q = u - m.at;
    if (q < 0) continue;
    const sl = SILOS[m.si];
    const climb = m.climb * q + 122 * q * q;
    const x = sl.x + m.dx * sat(q / 2.4) - pan * 0.30;
    const y = hz + 46 - climb;
    const sc = Math.max(0.05, m.s0 * (1 - sat(q / 3.2) * 0.70));
    if (y < -220) continue;
    I.c.save();
    I.c.globalAlpha = 0.90;
    if (A) A.jet(I.c, x, y, sc, m.rot * sat(q / 1.5), 1, [116, 148, 196]);
    I.c.restore();
    if (i % 2 === 0)
      part(x, y + 30 * sc, rnd(-20, 20), 185 + 150 * q, rnd(0.4, 0.9),
        rnd(5, 13) * (sc + 0.30), i % 4 ? C.cyan : C.white, { d: 0.93, gr: 12 });
  }

  drawParts(false); drawParts(true);
  hazeVeil(hz, 0.07);

  /* ---- PLANE 3 (z~0.8): near.  Dark, saturated, and gone in a
     second — they overtake and cross in front of everything. ---- */
  for (let i = 0; i < L_NEAR.length; i++) {
    const n = L_NEAR[i], k = (u - n.at) / n.dur;
    if (k <= 0 || k >= 1) continue;
    function px(kk) { return 800 + n.dir * (kk - 0.5) * 2300 - pan * 0.55; }
    function py(kk) { return n.y0 + (n.y1 - n.y0) * (kk * kk * 0.7 + kk * 0.3); }
    const x = px(k), y = py(k), sc = n.s0 + (n.s1 - n.s0) * k;
    const kp = Math.max(0, k - 0.10), xp = px(kp), yp = py(kp);
    /* the trail lies along the actual heading, so the bank reads right */
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    const cg = I.c.createLinearGradient(x, y, xp, yp);
    cg.addColorStop(0, rgba(C.ice, 0.42));
    cg.addColorStop(0.28, rgba(C.cyan, 0.18));
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    I.c.strokeStyle = cg; I.c.lineCap = 'round'; I.c.lineWidth = 9 * sc;
    I.c.beginPath();
    I.c.moveTo(x - (x - xp) * 0.07, y - (y - yp) * 0.07);
    I.c.lineTo(xp, yp); I.c.stroke();
    I.c.restore();
    const rot = n.dir * (0.66 - 0.34 * k);
    if (A) {
      I.c.save(); I.c.globalAlpha = 0.30;
      A.jet(I.c, x - (x - xp) * 0.22, y - (y - yp) * 0.22, sc, rot, 1, [70, 96, 140]);
      I.c.restore();
      A.jet(I.c, x, y, sc, rot, 1, [82, 112, 158]);
    }
    I.shake = Math.max(I.shake, 6 * Math.sin(sat(k) * Math.PI));
  }

  /* ---- PLANE 4 (z~1): one aircraft close enough that the frame
     cannot hold it.  This is what everything else is measured by. ---- */
  for (let i = 0; i < FG5.length; i++) {
    const f = FG5[i], k = (u - f.at) / f.dur;
    if (k <= 0 || k >= 1) continue;
    const yb = f.y + tilt * 0.16;
    for (let g = 3; g >= 0; g--) {
      const kk = k - g * 0.030;
      if (kk < 0) continue;
      I.c.save();
      I.c.globalAlpha = g === 0 ? 1 : 0.20 / g;
      if (A) A.jet(I.c, 800 + f.dir * (kk - 0.5) * 3500,
        yb - Math.sin(kk * Math.PI) * 56, f.s, f.rot, 1, [46, 62, 92]);
      I.c.restore();
    }
    for (let q2 = 0; q2 < 5; q2++)
      part(800 + f.dir * (k - 0.62) * 3500, yb - 70 + rnd(-46, 46),
        -f.dir * rnd(320, 940), rnd(-140, 70), rnd(0.2, 0.46), rnd(14, 34),
        q2 ? C.cyan : C.white, { d: 0.90, gr: 42, a: 0.7 });
    I.shake = Math.max(I.shake, 17 * Math.sin(k * Math.PI));
  }

  if (u > 0.45 && u < 3.2) {
    const a = ramp(0.45, 0.95, u) * (1 - ramp(2.6, 3.2, u));
    txt('SILO CLUSTER 7  —  SCRAMBLE ORDER EXECUTED', VW / 2, 118, 24,
      rgba(C.cyan, a * 0.9), 7, 'center');
  }
  vignette(0.62);
  const fo = ramp(T5 - 0.45, T5, u + T4);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo * 0.85 + ')'; I.c.fillRect(0, 0, VW, VH); }
}
