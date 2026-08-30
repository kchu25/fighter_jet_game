/* ===== cinematic/scenes/scene5.js — the mass launch =====
   Four depth planes, each with its own scale, contrast, haze and rate.
   hazeVeil() (the air between the planes) is local to this scene. */
import { I } from './state.js';
import { VW, VH, T4, T5, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 5 — the launch that fails.  Four depth planes, each with its
   own scale, contrast, haze and rate — but this is not a triumphant
   mass launch anymore.  The strike that chased us out of the tunnel
   is cutting the rest of the wing down as fast as the silos can
   throw them up.  By the cut, one bird is still climbing.  Ours.
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
  /* mid: the launch itself, climbing out of the silos — and, for most
     of them, dying on the way up.  `die` is seconds after their own
     launch when the incoming fire finds them; 0 means they make it
     off-frame (they do not make it far, but not on camera). */
  for (let i = 0; i < 13; i++) {
    const dx = rnd(-340, 340);
    L_MID.push({
      si: i % SILOS.length, at: 0.62 + i * 0.122,
      dx: dx, s0: rnd(0.28, 0.56), climb: rnd(180, 300),
      /* it banks the way it is actually going: no two headings alike */
      rot: dx / 760 + rnd(-0.12, 0.12),
      die: (i % 2 === 0) ? 0.9 + i * 0.17 : 0
    });
  }
  /* near: fast diagonal departures right across the frame.  hitK marks
     where along its run the incoming fire clips it. */
  L_NEAR.push({ at: 0.48, dir: 1, y0: 700, y1: 128, s0: 2.5, s1: 0.72, dur: 1.12 });
  L_NEAR.push({ at: 1.40, dir: -1, y0: 772, y1: 214, s0: 3.0, s1: 0.86, dur: 0.94 });
  L_NEAR.push({ at: 2.36, dir: 1, y0: 730, y1: 86, s0: 2.7, s1: 0.68, dur: 1.30, hitK: 0.48 });
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

  /* ---- PLANE 2 (z~0.4): the launch.  Mid scale, mid rate — and the
     incoming fire finding them one by one as they climb. ---- */
  let lost = 0;
  for (let i = 0; i < L_MID.length; i++) {
    const m = L_MID[i], q = u - m.at;
    if (q < 0) continue;
    const dying = m.die > 0 && q >= m.die;
    const qc = dying ? m.die : q;            // position freezes at the hit…
    const qd = dying ? q - m.die : 0;        // …then it falls
    if (dying) lost++;
    const sl = SILOS[m.si];
    const climb = m.climb * qc + 122 * qc * qc;
    const x = sl.x + m.dx * sat(qc / 2.4) - pan * 0.30 + m.dx * 0.06 * qd;
    const y = hz + 46 - climb + 240 * qd + 380 * qd * qd;
    const sc = Math.max(0.05, m.s0 * (1 - sat(qc / 3.2) * 0.70));
    if (y < -220 || y > VH + 120) continue;
    /* the bolt that is about to take it: a hard magenta lance from
       above, drawn for the last fraction of a second of its life */
    if (m.die > 0 && q > m.die - 0.16 && q < m.die + 0.05) {
      const bk = sat((q - (m.die - 0.16)) / 0.16);
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.strokeStyle = rgba(C.mag, 0.85 * bk);
      I.c.lineWidth = 2.5 + 2 * sc; I.c.lineCap = 'round';
      I.c.beginPath();
      I.c.moveTo(x + 170, y - 640 + 640 * bk);
      I.c.lineTo(x + 170 * (1 - bk), y - 640 * (1 - bk));
      I.c.stroke();
      I.c.restore();
    }
    /* the hit itself — burst + audio latched via once() so replays
       of the cinematic re-arm cleanly */
    if (m.die > 0) {
      once('c5b' + i, T4 + m.at + m.die - 0.16, function () { sfx('plasma'); });
      once('c5k' + i, T4 + m.at + m.die, function () {
        sfx(i % 4 ? 'boom' : 'explode', 1.1);
        I.shake = Math.max(I.shake, 8);
        burst(x, y, 12 + 8 * sc, 260 + 220 * sc, C.orange, 0.7, 5 + 6 * sc, { d: 0.95 });
        burst(x, y, 6, 200, C.mag, 0.4, 4 + 4 * sc, { d: 0.95 });
      });
    }
    if (dying && qd < 0.28) {
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = (1 - qd / 0.28) * 0.9;
      const fr = (40 + 90 * sc) * (0.5 + qd * 3);
      I.c.drawImage(glow(C.orange), x - fr, y - fr, fr * 2, fr * 2);
      I.c.restore();
    }
    I.c.save();
    I.c.globalAlpha = 0.90 * (dying ? Math.max(0.25, 1 - qd * 0.5) : 1);
    if (A) A.jet(I.c, x, y, sc,
      m.rot * sat(qc / 1.5) + (dying ? qd * (i % 4 - 1.5) * 2.2 : 0),
      dying ? 0 : 1, dying ? [96, 84, 92] : [116, 148, 196]);
    I.c.restore();
    if (dying) {
      /* burning, trailing smoke all the way down */
      if (Math.random() < 0.8)
        part(x, y, rnd(-30, 30), rnd(-60, 20), rnd(0.7, 1.4),
          rnd(8, 18) * (sc + 0.3), Math.random() < 0.35 ? C.orange : C.smoke,
          { add: Math.random() < 0.35, d: 0.97, gr: 18 });
    } else if (i % 2 === 0)
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
    function py(kk) {
      let yy = n.y0 + (n.y1 - n.y0) * (kk * kk * 0.7 + kk * 0.3);
      /* clipped mid-run: the climb-out breaks and it falls away */
      if (n.hitK && kk > n.hitK) { const dk = kk - n.hitK; yy += 1500 * dk * dk; }
      return yy;
    }
    const x = px(k), y = py(k), sc = n.s0 + (n.s1 - n.s0) * k;
    const struck = n.hitK && k > n.hitK;
    if (n.hitK) once('c5nearhit', T4 + n.at + n.hitK * n.dur, function () {
      sfx('explode', 1.4);
      I.shake = Math.max(I.shake, 18);
      I.flash = Math.max(I.flash, 0.3); I.flashCol = C.orange;
      burst(x, y, 22, 700, C.orange, 0.7, 10, { d: 0.96 });
      burst(x, y, 10, 500, C.mag, 0.45, 8, { d: 0.96 });
    });
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
    const rot = n.dir * (0.66 - 0.34 * k) + (struck ? (k - n.hitK) * 3.4 * n.dir : 0);
    if (A) {
      I.c.save(); I.c.globalAlpha = 0.30;
      A.jet(I.c, x - (x - xp) * 0.22, y - (y - yp) * 0.22, sc, rot, struck ? 0 : 1, [70, 96, 140]);
      I.c.restore();
      A.jet(I.c, x, y, sc, rot, struck ? 0 : 1, struck ? [96, 84, 92] : [82, 112, 158]);
    }
    if (struck && Math.random() < 0.85)
      part(x, y, rnd(-60, 60), rnd(-80, 40), rnd(0.5, 1.1), rnd(10, 24) * sc * 0.5,
        Math.random() < 0.4 ? C.orange : C.smoke, { add: Math.random() < 0.4, d: 0.96, gr: 26 });
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

  if (u > 0.45 && u < 2.2) {
    const a = ramp(0.45, 0.95, u) * (1 - ramp(1.7, 2.2, u));
    txt('SILO CLUSTER 7  —  EMERGENCY SCRAMBLE UNDER FIRE', VW / 2, 118, 24,
      rgba(C.cyan, a * 0.9), 7, 'center');
  }
  /* the tally that sets up the whole game: everyone else is dying on
     the way up.  By the cut it reads like what it is — you are next,
     or you are alone. */
  if (lost > 0) {
    const a = 0.55 + 0.45 * pulse(u, 2.6);
    txt('⚠ INTERCEPTORS LOST: 0' + lost, VW / 2, u < 2.2 ? 162 : 118, 26,
      rgba(C.red, a), 8, 'center', 'bold');
  }
  if (u > 3.55) {
    const a = ramp(3.55, 3.95, u);
    txt('INTERCEPTOR 03 — STILL CLIMBING', VW / 2, 806, 22,
      rgba(C.cyan, a * 0.85), 7, 'center');
  }
  vignette(0.62);
  const fo = ramp(T5 - 0.45, T5, u + T4);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo * 0.85 + ')'; I.c.fillRect(0, 0, VW, VH); }
}
