/* ===== cinematic/scenes/scene1.js — the inciting incident =====
   Three movements: the rocket goes up, something is out there (never
   seen whole), then you see what it came off. */
import { I } from './state.js';
import { VW, VH, T1, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, streakParts, starField, vignette, art } from './engine.js';

/* ================================================================
   SCENE 1 — the inciting incident, in three movements:
     1   0.0 ..  3.2   the rocket goes up.  Nothing else happens.
     2   3.2 ..  7.0   something is out there.  You never see it whole.
     3   8.3 .. 12.8   you see what it came off.
   ================================================================ */
export const IGN = 0.95, LIFT = 1.85;
export const FIRE = 6.58, BOOM = 7.02;
export const HUGE = 8.32;            /* the prow starts crossing the right edge */
export const HUGE_V = 556;           /* px/s of hull dragged past the lens */
export const PAD_Y = 605, GND_Y = 700;
/* where the unseen things are when they discharge.  Never drawn lit. */
export const STRIKE = [[1286, 178], [252, 250], [828, 92]];
export let camAlt = 0, camPrev = 0, rkX = 800, rkY = PAD_Y, rkRot = 0;
/* the exhaust colour ramp — white at the throat, orange down the
   plume.  Five fixed steps, because engine.js's glow() caches one
   sprite per distinct colour and a continuous ramp would leak one
   canvas per frame. */
export const PLUME = [[255, 244, 226], [255, 218, 168], [255, 186, 108],
  [255, 156, 64], [255, 132, 48]];

/* ----------------------------------------------------------------
   coverage, not one static shot.  camFor() returns the zoom for
   whichever cut is live at time u — everything else about the sky,
   ground and rocket is unchanged, only how tight the lens is on it.
   A zoom of 1 is a no-op transform, so it is always safe to apply. */
export const CHASE0 = 1.90, CHASE1 = 3.05;        /* tight ascent push, before the ambush glimpses */
export const STRIKE_PUSH = FIRE + 0.28;           /* close-in push, just clear of the discharge flicker */
export const SHOCK = BOOM + 0.24;                 /* the front reaches the lens; the camera loses the shot */
export const AFT_PEAK = 7.90;                     /* aftermath push holds here, eases to 1 before HUGE */
/* shared rise-then-fall envelope for the aftermath tumble — camFor(),
   camRotFor() and scene1's own shake/streak all key off exactly the
   same curve, so the zoom, the roll and the extra shudder all peak
   and resolve together instead of drifting out of sync.  It starts on
   BOOM itself, not a beat after it: there is no cut away any more, so
   the blast has to be what knocks the camera. */
export function aftEnv(u) {
  return (u >= BOOM && u < HUGE)
    ? ramp(BOOM, SHOCK + 0.11, u) * (1 - ramp(AFT_PEAK, HUGE, u)) : 0;
}
export function camFor(u) {
  if (u >= CHASE0 && u < CHASE1) return 1 + 0.55 * ramp(CHASE0, CHASE0 + 0.55, u);
  if (u >= STRIKE_PUSH && u < BOOM) return 1 + 0.7 * ramp(STRIKE_PUSH, BOOM, u);
  /* continuous across BOOM: the 1.7x close-in push we arrive on hands
     straight over to the tumble push, so nothing snaps at the cut that
     used to be here */
  if (u >= BOOM && u < HUGE)
    return 1 + 0.7 * (1 - ramp(BOOM, SHOCK + 0.11, u)) + 1.1 * aftEnv(u);
  return 1;
}
/* ----------------------------------------------------------------
   camRotFor() — a roll component for the same lens, on top of the
   zoom above.  Two deliberate beats of genuine disorientation, both
   riding the same rise/fall envelope camFor() already uses so the
   tilt always resolves level again before the cut it belongs to
   ends — nothing is left canted when c.restore() hands back to the
   fixed frame.  This is the Interstellar-docking beat: a tumble, not
   just a push, for the couple of seconds it should actually read as
   out of control. */
export function camRotFor(u) {
  if (u >= CHASE0 && u < CHASE1) {
    const env = ramp(CHASE0, CHASE0 + 0.4, u) * (1 - ramp(CHASE1 - 0.3, CHASE1, u));
    return 0.065 * env * Math.sin((u - CHASE0) * 2.3);
  }
  if (u >= BOOM && u < HUGE) {
    const env = aftEnv(u);
    /* a hard bank one way, then a wobble as it settles — not a clean
       oscillation, an actual loss of orientation */
    return env * (0.30 * Math.sin((u - BOOM) * 1.7) + 0.11 * Math.sin((u - BOOM) * 4.4 + 1.1));
  }
  return 0;
}

/* ---------------------------------------------------------------
   The small craft.  A path, and only ever a path: either filled with
   something darker than the sky it is standing in front of, or one
   hairline of its leading edge catching light for a few frames.  It
   is never lit enough to be read as a machine.
   --------------------------------------------------------------- */
export const DART = [0, -30, 4, -11, 15, -6, 33, 12, 24, 16, 8, 9, 5, 20, 11, 27,
  0, 24, -11, 27, -5, 20, -8, 9, -24, 16, -33, 12, -15, -6, -4, -11];
export function dartPt(i, x, y, s, co, si) {
  const px = DART[i * 2] * s, py = DART[i * 2 + 1] * s;
  return [x + px * co - py * si, y + px * si + py * co];
}
export function dartDark(x, y, s, rot, a) {
  const co = Math.cos(rot), si = Math.sin(rot);
  I.c.beginPath();
  for (let i = 0; i < 16; i++) {
    const p = dartPt(i, x, y, s, co, si);
    if (i) I.c.lineTo(p[0], p[1]); else I.c.moveTo(p[0], p[1]);
  }
  I.c.closePath();
  I.c.fillStyle = 'rgba(0,0,3,' + (0.92 * a).toFixed(3) + ')';
  I.c.fill();
  I.c.strokeStyle = 'rgba(104,132,180,' + (0.085 * a).toFixed(3) + ')';
  I.c.lineWidth = 1; I.c.stroke();
}
/* a few frames of light down the starboard leading edge, and nothing else */
export function dartEdge(x, y, s, rot, a, col) {
  if (a <= 0.01) return;
  const co = Math.cos(rot), si = Math.sin(rot);
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.lineCap = 'round';
  I.c.strokeStyle = rgba(col || C.ice, sat(a));
  I.c.lineWidth = Math.max(1, 1.5 * s);
  I.c.beginPath();
  for (let i = 0; i < 4; i++) {
    const p = dartPt(i, x, y, s, co, si);
    if (i) I.c.lineTo(p[0], p[1]); else I.c.moveTo(p[0], p[1]);
  }
  I.c.stroke();
  I.c.restore();
}

/* the curve of the world, far below — a scale reference, and something
   for the dark shapes (and later the shadow) to bite into */
export function planetLimb(a) {
  if (a <= 0.004) return;
  const R = 5400, cx = 690, cy = 764 + R;
  const A0 = Math.PI * 1.42, A1 = Math.PI * 1.58;
  I.c.save();
  I.c.globalAlpha = a;
  I.c.fillStyle = '#02030a';
  I.c.beginPath(); I.c.arc(cx, cy, R, A0, A1);
  I.c.lineTo(VW + 220, VH + 220); I.c.lineTo(-220, VH + 220); I.c.closePath(); I.c.fill();
  /* sparse settlement light along the terminator: this is a planet */
  I.c.globalCompositeOperation = 'lighter';
  let s = 7717;
  for (let i = 0; i < 46; i++) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const fx = (s / 0x7fffffff);
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const fy = (s / 0x7fffffff);
    const x = -60 + fx * (VW + 120);
    const yy = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx))) + 6 + fy * 92;
    I.c.globalAlpha = a * (0.10 + 0.32 * fy) * (0.55 + 0.45 * Math.sin(I.t * 1.7 + i));
    I.c.fillStyle = rgba(C.amber, 1);
    I.c.fillRect(x, yy, 1.6, 1.6);
  }
  /* airglow */
  I.c.globalAlpha = a * 0.5;
  I.c.lineWidth = 34; I.c.strokeStyle = 'rgba(46,92,190,0.10)';
  I.c.beginPath(); I.c.arc(cx, cy, R + 22, A0, A1); I.c.stroke();
  I.c.lineWidth = 5; I.c.strokeStyle = 'rgba(150,206,255,0.30)';
  I.c.beginPath(); I.c.arc(cx, cy, R + 3, A0, A1); I.c.stroke();
  I.c.restore();
}

/* ---- MOVEMENT 2 -------------------------------------------------
   Six looks, none of them clean.  Everything here is drawn on top of
   the rocket and its exhaust, because whatever it is, it is between
   the lens and the launch.
   ----------------------------------------------------------------- */
export function movement2(u) {
  let q;

  /* 3.22 — a shape crosses the top of frame.  Small, high, almost unlit:
     one flicker off a wing and then nothing. */
  q = (u - 3.22) / 0.66;
  if (q > 0 && q < 1) {
    const a = Math.min(1, Math.sin(q * Math.PI) * 2.6);
    const x = 1512 - q * 430, y = 150 + q * 52;
    dartDark(x, y, 0.78, 2.05, a);
    if (q > 0.30 && q < 0.42)
      dartEdge(x, y, 0.78, 2.05, (1 - Math.abs(q - 0.36) / 0.06) * 0.55);
  }

  /* 4.00 — a wing edge takes the sun.  Two frames.  Gone. */
  q = (u - 4.00) / 0.34;
  if (q > 0 && q < 1) {
    const x = 388 + q * 104, y = 306 - q * 40;
    const a = Math.pow(1 - q, 2.4);
    dartDark(x, y, 0.94, -1.12, Math.min(1, Math.sin(q * Math.PI) * 2.2) * 0.7);
    dartEdge(x, y, 0.94, -1.12, a * 0.95);
  }

  /* 4.50 — a shadow crosses the stack.  There is nothing above it. */
  q = (u - 4.50) / 0.94;
  if (q > 0 && q < 1) {
    const sx = 1460 - q * 1560, sy = 232 + q * 130;
    const a = Math.sin(q * Math.PI);
    I.c.save();
    I.c.globalAlpha = a * 0.92;
    I.c.drawImage(glow([0, 0, 3]), sx - 600, sy - 220, 1200, 440);
    I.c.restore();
  }

  /* 5.02 — something far larger passes the bottom corner, three
     quarters of it outside the frame. */
  q = (u - 5.02) / 0.78;
  if (q > 0 && q < 1) {
    const a = Math.min(1, Math.sin(q * Math.PI) * 2.1);
    const bx = -300 + q * 760, by = 828 - q * 104;
    dartDark(bx, by, 4.7, 1.44 - q * 0.12, a);
    if (q > 0.40 && q < 0.62)
      dartEdge(bx, by, 4.7, 1.44 - q * 0.12, (1 - Math.abs(q - 0.51) / 0.11) * 0.42);
  }

  /* 5.50 — three of them, echelon, across the top.  One glints. */
  q = (u - 5.50) / 0.80;
  if (q > 0 && q < 1) {
    const a = Math.min(1, Math.sin(q * Math.PI) * 2.4);
    for (let i = 0; i < 3; i++) {
      const p = q - i * 0.12; if (p < 0) continue;
      const x = 1700 - p * 1220 - i * 128, y = 146 + i * 64 + p * 50;
      const s = 0.74 + i * 0.07;
      dartDark(x, y, s, 1.98, a);
      /* the sky is at its blackest up here: an occluder alone reads as
         nothing, so each one takes the sun briefly, in turn. */
      const gq = 0.30 + i * 0.17;
      if (q > gq - 0.07 && q < gq + 0.07)
        dartEdge(x, y, s, 1.98, (1 - Math.abs(q - gq) / 0.07) * (0.88 - i * 0.14));
    }
  }

  /* 6.06 — they are around the stack now.  Three lights, one blink
     each, at ranges you have no way of judging. */
  for (let i = 0; i < STRIKE.length; i++) {
    const p = (u - (6.04 + i * 0.14)) / 0.32;
    if (p <= 0 || p >= 1) continue;
    const a = Math.sin(p * Math.PI);
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = a * 0.5;
    I.c.drawImage(glow(C.violet), STRIKE[i][0] - 56, STRIKE[i][1] - 56, 112, 112);
    I.c.globalAlpha = a;
    I.c.fillStyle = rgba(C.mag, 1);
    I.c.fillRect(STRIKE[i][0] - 1.5, STRIKE[i][1] - 1.5, 3, 3);
    I.c.restore();
  }

  /* the discharge lights them, badly, for a fifth of a second */
  if (u >= FIRE && u < FIRE + 0.22) {
    const a = 1 - (u - FIRE) / 0.22;
    const rots = [2.34, 0.84, 1.62];
    for (let i = 0; i < STRIKE.length; i++) {
      dartDark(STRIKE[i][0], STRIKE[i][1], 0.92, rots[i], 1);
      dartEdge(STRIKE[i][0], STRIKE[i][1], 0.92, rots[i], a * 0.85, C.mag);
    }
  }
}

/* ---- MOVEMENT 3 -------------------------------------------------
   The belly of something that does not fit in the frame.  The whole
   effect is occlusion and duration: an edge arrives and simply keeps
   arriving, and the sky goes out behind it.
   ----------------------------------------------------------------- */
export function bellyY(d) {
  if (d <= 0) return -560;
  return -330 + 1220 * (1 - Math.exp(-d / 660));
}
export function colossus(u) {
  const q = u - HUGE;
  if (q <= 0) return;
  const px = VW + 210 - q * HUGE_V;      /* the prow */

  /* its shadow runs ahead of the hull and never comes back */
  const sg = I.c.createLinearGradient(px - 520, 0, px + 660, 0);
  sg.addColorStop(0, 'rgba(0,0,2,0)');
  sg.addColorStop(1, 'rgba(0,0,2,0.64)');
  I.c.fillStyle = sg; I.c.fillRect(0, 0, VW, VH);
  /* stars die just ahead of the edge, before the edge itself shows */
  I.c.save(); I.c.globalAlpha = 0.5;
  I.c.drawImage(glow([0, 0, 3]), px - 700, -640, 1400, 1400);
  I.c.restore();

  /* ---- the hull ---- */
  I.c.beginPath();
  I.c.moveTo(-140, -560);
  for (let x = -140; x <= VW + 140; x += 14) I.c.lineTo(x, Math.max(-560, bellyY(x - px)));
  I.c.lineTo(VW + 140, -560);
  I.c.closePath();
  /* the hull is not black — it is a dark surface, and it has to read as
     one or the size of it means nothing */
  const hg = I.c.createLinearGradient(0, -340, 0, 960);
  hg.addColorStop(0, '#191d2a');
  hg.addColorStop(0.46, '#141824');
  hg.addColorStop(1, '#0e111b');
  I.c.fillStyle = hg;
  I.c.save();
  I.c.fill();
  I.c.clip();
  /* structure, kept coarse — ribs 430px apart, so the eye has something
     to measure the length against */
  I.c.strokeStyle = 'rgba(112,146,200,0.10)'; I.c.lineWidth = 3;
  for (let k = 1; k < 11; k++) {
    const rx = px + k * 430;
    I.c.beginPath(); I.c.moveTo(rx, -560); I.c.lineTo(rx - 190, 1020); I.c.stroke();
  }
  /* three trenches running back down the belly, parallel to the edge */
  for (let k = 0; k < 3; k++) {
    I.c.beginPath();
    for (let x = -140; x <= VW + 140; x += 22) {
      const y = bellyY(x - px) - (74 + k * 168);
      if (x === -140) I.c.moveTo(x, y); else I.c.lineTo(x, y);
    }
    I.c.strokeStyle = 'rgba(122,156,215,' + (0.16 - k * 0.045) + ')';
    I.c.lineWidth = 30 - k * 9; I.c.stroke();
    I.c.strokeStyle = 'rgba(0,0,4,0.5)'; I.c.lineWidth = 2; I.c.stroke();
  }
  I.c.restore();

  /* ---- the light on it: one bloomed hairline down the leading edge ---- */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.lineCap = 'round';
  I.c.beginPath();
  let started = false;
  for (let x = Math.max(-140, px); x <= VW + 140; x += 10) {
    const y = bellyY(x - px);
    if (y < -560) continue;
    if (!started) { I.c.moveTo(x, y); started = true; } else I.c.lineTo(x, y);
  }
  if (started) {
    const mk = function (a0, a1, a2) {
      const rg = I.c.createLinearGradient(px, 0, px + 1250, 0);
      rg.addColorStop(0, 'rgba(206,228,255,' + a0 + ')');
      rg.addColorStop(0.26, 'rgba(158,188,246,' + a1 + ')');
      rg.addColorStop(0.66, 'rgba(126,158,228,' + a2 + ')');
      rg.addColorStop(1, 'rgba(120,150,220,0)');
      return rg;
    };
    I.c.strokeStyle = mk(0.20, 0.11, 0.05); I.c.lineWidth = 22; I.c.stroke();
    I.c.strokeStyle = mk(0.55, 0.28, 0.13); I.c.lineWidth = 6; I.c.stroke();
    I.c.strokeStyle = mk(0.95, 0.52, 0.24); I.c.lineWidth = 2.2; I.c.stroke();
  }
  /* running lights, 470px apart, slow */
  for (let k = 0; k < 12; k++) {
    const lx = px + 250 + k * 470;
    if (lx < -160 || lx > VW + 160) continue;
    const ly = bellyY(lx - px) - 24;
    if (ly < -180) continue;
    const bl = 0.42 + 0.36 * Math.sin(I.t * 0.85 + k * 1.7);
    const col = k % 3 ? C.amber : C.violet;
    I.c.globalAlpha = bl * 0.7;
    I.c.drawImage(glow(col), lx - 70, ly - 70, 140, 140);
    I.c.globalAlpha = bl;
    I.c.fillStyle = rgba(col, 1);
    I.c.fillRect(lx - 2.5, ly - 2.5, 5, 5);
  }
  I.c.globalAlpha = 1;
  I.c.restore();

  /* ---- things that came off it, for scale ---- */
  for (let k = 0; k < 4; k++) {
    const ex = px + 470 + k * 300 - q * 132;
    if (ex < -60 || ex > VW + 60) continue;
    const ey = bellyY(ex - px) + 96 + k * 52;
    if (ey > VH + 40 || ey < -40) continue;
    dartDark(ex, ey, 0.28, 1.92, 0.85);
    if ((k + Math.floor(I.t * 1.7)) % 5 === 0) dartEdge(ex, ey, 0.28, 1.92, 0.55);
  }
}

/* ------------------------------------------------------------------
   THE HULK — one piece of the ship, torn clean off, that we actually
   track instead of letting it dissolve into the particle system.  It
   tumbles straight through the tumble-camera beat, cooling from a
   lit ember seam to dead rust, and is finally swallowed by its own
   trailing dust rather than just fading out — the same silhouette
   language (rust/ochre, half-lost in blown dust) as the wrecks the
   player will later fly over on the ground.  Purely cosmetic: no
   collision, no state, a closed-form function of absolute time. */
export const HULK_T0 = SHOCK + 0.03, HULK_T1 = HUGE - 0.20;
export function hulkShard(u) {
  if (u < HULK_T0 || u > HULK_T1) return;
  const q = sat((u - HULK_T0) / (HULK_T1 - HULK_T0));
  const a = sat((u - HULK_T0) / 0.22) * (1 - ramp(HULK_T1 - 0.34, HULK_T1, u));
  if (a <= 0.01) return;
  const x = rkX + 34 + q * 300, y = rkY - 40 + q * q * 560;
  const rot = 0.5 + q * 4.6;
  const cool = 1 - ramp(0, 0.75, q);            /* the ember seam dies as it falls */
  I.c.save();
  I.c.translate(x, y); I.c.rotate(rot);
  I.c.beginPath();
  I.c.moveTo(-48, -15); I.c.lineTo(18, -24); I.c.lineTo(40, 3);
  I.c.lineTo(9, 27); I.c.lineTo(-28, 21); I.c.lineTo(-52, 2);
  I.c.closePath();
  const hg = I.c.createLinearGradient(-48, -20, 40, 22);
  hg.addColorStop(0, 'rgba(26,14,10,' + a + ')');
  hg.addColorStop(0.5, 'rgba(' + C.rust[0] + ',' + C.rust[1] + ',' + C.rust[2] + ',' + (0.88 * a).toFixed(3) + ')');
  hg.addColorStop(1, 'rgba(18,10,8,' + a + ')');
  I.c.fillStyle = hg; I.c.fill();
  I.c.strokeStyle = 'rgba(8,4,3,' + (0.8 * a).toFixed(3) + ')'; I.c.lineWidth = 2; I.c.stroke();
  if (cool > 0.02) {
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = a * cool * (0.55 + 0.45 * Math.sin(u * 13));
    I.c.strokeStyle = rgba(C.amber, 1); I.c.lineWidth = 2.4;
    I.c.beginPath(); I.c.moveTo(-28, 21); I.c.lineTo(-52, 2); I.c.stroke();
    I.c.restore();
  }
  I.c.restore();
  /* it goes under, not just out: a bloom of dust it drags down with it */
  once('hulkdust', HULK_T1 - 0.30, function () {
    burst(x, y, 22, 85, C.dust, 1.7, 32, { add: false, g: -8, d: 0.965, gr: 20, a: 0.42 });
  });
}

export function scene1(u, dt) {
  /* --- flight profile --- */
  let alt = 0;
  if (u > LIFT) { const q = u - LIFT; alt = 26 * q * q * q + 42 * q * q; }
  if (u > BOOM) alt = 26 * Math.pow(BOOM - LIFT, 3) + 42 * Math.pow(BOOM - LIFT, 2);
  camPrev = camAlt;
  camAlt = Math.max(0, alt - 300);
  const dcam = camAlt - camPrev;
  const space = sat(camAlt / 1500);
  const dead = u > BOOM;

  rkX = 800 + ramp(2.9, BOOM, u) * 96;
  rkY = PAD_Y - Math.min(alt, 300);
  rkRot = ramp(2.5, BOOM, u) * 0.26;

  /* ---- hard cut to whichever angle covers this moment: everything
     from the sky to the lances below is drawn through this one lens.
     Zoom is anchored on the rocket's own screen position, so z=1 is
     an exact no-op (the original wide framing) no matter where it
     is — only z>1 pushes in on it. ---- */
  const camZ = camFor(u), camR = camRotFor(u), camFX = rkX, camFY = rkY - 10;
  I.c.save();
  I.c.translate(camFX, camFY);
  if (camR) I.c.rotate(camR);
  I.c.scale(camZ, camZ);
  I.c.translate(-camFX, -camFY);

  /* --- sky --- */
  const g = I.c.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#01020a');
  g.addColorStop(0.55, space > 0.5 ? '#02030c' : '#0c0c1a');
  /* warmed toward the desert it launches from: dusk-ember brown-rust
     low on the horizon instead of a cold sci-fi violet, so the pad
     already rhymes with the sand the wreck is going to fall into */
  g.addColorStop(1, space > 0.8 ? '#03040e' : ('rgb(' + Math.round(30 + 46 * (1 - space)) + ',' +
    Math.round(17 + 26 * (1 - space)) + ',' + Math.round(20 + 15 * (1 - space)) + ')'));
  I.c.fillStyle = g; I.c.fillRect(0, 0, VW, VH);
  starField(9173, 300, camAlt, 0.25 + 0.65 * space);
  planetLimb(ramp(0.30, 0.72, space));

  /* --- ground complex (only while it is on screen) --- */
  const gy = GND_Y + camAlt;
  if (gy < VH + 260) {
    const hz = I.c.createLinearGradient(0, gy - 200, 0, gy);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(1, rgba(C.rust, 0.42));
    I.c.fillStyle = hz; I.c.fillRect(0, gy - 200, VW, 200);
    I.c.fillStyle = '#0b0704'; I.c.fillRect(0, gy, VW, VH);
    I.c.strokeStyle = rgba(C.rust, 0.34); I.c.lineWidth = 2;
    I.c.beginPath(); I.c.moveTo(0, gy); I.c.lineTo(VW, gy); I.c.stroke();
    /* gantry + service towers — steel hardware, kept neutral against
       the warm sand it stands in */
    I.c.fillStyle = '#0d0f16';
    I.c.fillRect(rkX + 46, gy - 250, 26, 250);
    I.c.fillRect(rkX - 96, gy - 190, 18, 190);
    for (let i = 0; i < 6; i++) I.c.fillRect(rkX + 30, gy - 236 + i * 40, 46, 7);
    I.c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const lx = 120 + i * 220;
      I.c.drawImage(glow(C.amber), lx - 26, gy - 34, 52, 52);
    }
    I.c.globalCompositeOperation = 'source-over';
    /* pad hardware — scorched concrete and blown sand, not tarmac */
    I.c.fillStyle = '#171009'; I.c.fillRect(rkX - 74, gy - 26, 148, 26);
  }

  /* --- ignition --- */
  once('ign', IGN, function () {
    I.shake = 9; I.rumbleH = sfx('rumble', 0.35);
    sfx('setIntensity', 0.28);
  });
  const thr = u < IGN ? 0 : sat((u - IGN) / 0.75);
  if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(dead ? 0 : 0.35 + 0.65 * thr);
  if (u > IGN && !dead) {
    I.shake = Math.max(I.shake, u < LIFT ? 5 + 6 * Math.sin(u * 42) : 3.2);
    /* Exhaust.  One particle a frame used to leave a visible gap of
       `dcam` between each puff, and alternating white/orange made every
       gap read as a join: the plume came out as a string of beads.
       Emit a short sub-frame sweep instead, back-filling the distance
       the trail scrolls in one frame, and roll the colour continuously
       from white at the throat to orange down the plume rather than
       flipping between two of them.  Radius also tapers off with range
       so the far shot gets a thin bright pencil, not fat blobs. */
    const nz = rkY + 96;
    const rng = 1 - 0.52 * space;
    for (let k = 0; k < 3; k++) {
      const f = k / 3;
      /* quantised to five steps: glow() caches one sprite per colour,
         so the ramp has to be a small fixed set, not a continuum */
      const col = PLUME[(Math.random() * PLUME.length) | 0];
      part(rkX + rnd(-6, 6) * rng, nz + rnd(0, 14) * rng + dcam * f, rnd(-24, 24) * rng,
        rnd(150, 320), rnd(0.34, 0.62), rnd(5, 11) * rng, col, { gr: 15, d: 0.93, a: 0.62 });
    }
    /* the pad billow only exists while the stack is still near the tower */
    if (gy < VH + 200 && u < LIFT + 1.6)
      part(rkX + rnd(-52, 52), gy - rnd(0, 24), rnd(-330, 330), rnd(-50, 20),
        rnd(1.0, 1.9), rnd(14, 32), C.smoke, { add: false, gr: 30, d: 0.955, a: 0.5 });
  }

  /* smoke sits behind the vehicle; the additive fire goes in front later */
  stepParts(dt, dcam);
  drawParts(false);

  /* --- the rocket: a full vector ship close in, or, once it is far
     enough out, nothing but a point of light climbing ---
     There used to be a hard cut away from the explosion here, to a
     ground-level "audience" angle.  It is gone: it cut away at exactly
     the moment the audience most wants to be looking, it washed the
     frame to flat grey for a quarter of a second, and the ground
     lighting it drew was pinned to a horizon that had long since
     scrolled off the bottom of the shot.  The camera now stays on the
     vehicle and simply gets hit — see aftEnv()/camRotFor(). */
  const A = art();
  const farShot = u >= CHASE1 && u < FIRE;
  if (!dead && A) {
    if (farShot) {
      /* too far to read as a machine — a coal of light, and a trail */
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.drawImage(glow(C.amber), rkX - 26, rkY - 26, 52, 52);
      I.c.fillStyle = '#fff';
      I.c.beginPath(); I.c.arc(rkX, rkY, 1.7, 0, 6.2832); I.c.fill();
      I.c.restore();
    } else {
      A.rocket(I.c, rkX, rkY, 0.95, rkRot, thr, I.t);
    }
  }

  /* --- the strike (drawn later, over the exhaust) --- */
  once('sight', 3.22, function () { sfx('setIntensity', 0.34); });
  once('fire', FIRE, function () {
    sfx('plasma'); I.shake = Math.max(I.shake, 13); I.flash = 0.24; I.flashCol = C.violet;
  });
  if (u > FIRE && u < BOOM + 0.14 && Math.random() < 0.6)
    burst(rkX, rkY - 20, 3, 420, C.amber, 0.45, 13, { g: 200 });

  /* --- destruction: one big kill and two secondary fuel-cookoff pops,
     half a second and eight-tenths of a second later — a real ship
     coming apart costs the audience something, it doesn't pop like a
     firework and go quiet --- */
  const SEC1 = BOOM + 0.46, SEC2 = BOOM + 0.85;
  const SEC1_OFF = [58, -30], SEC2_OFF = [-64, 18];
  once('boom', BOOM, function () {
    sfx('explode', 2.5); I.shake = 46; I.flash = 1; I.flashCol = C.white;
    sfx('setIntensity', 0.5);
    if (I.rumbleH && I.rumbleH.stop) { I.rumbleH.stop(0.35); I.rumbleH = null; }
    burst(rkX, rkY - 10, 110, 940, C.white, 0.75, 44, { g: 90, d: 0.9 });
    /* short lives, and enough speed that they disperse instead of piling
       into one bright ball: the sky has to be black again by 8.0 */
    burst(rkX, rkY - 10, 150, 720, C.orange, 0.85, 50, { g: 130, d: 0.93, gr: 20 });
    burst(rkX, rkY - 10, 84, 540, C.amber, 1.10, 48, { g: 60, d: 0.95, gr: 24 });
    burst(rkX, rkY - 10, 60, 320, C.smoke, 2.9, 76, { add: false, g: -20, d: 0.96, gr: 46, a: 0.55 });
    /* heavier hull plates — big, slow, tumbling — for scale */
    for (let i = 0; i < 16; i++) {
      const a2 = rnd(0, 6.2832), sp = rnd(140, 360);
      part(rkX, rkY - 10, Math.cos(a2) * sp, Math.sin(a2) * sp, rnd(2.0, 3.3),
        rnd(10, 26), i % 3 === 0 ? C.rust : (i % 3 === 1 ? C.steel : C.sand),
        { sq: true, g: 170, d: 0.992, gr: -1.4, vr: rnd(-4, 4) });
    }
    /* fast shrapnel — small, quick, bright */
    for (let i = 0; i < 48; i++) {
      const a2 = rnd(0, 6.2832), sp = rnd(360, 980);
      part(rkX, rkY - 10, Math.cos(a2) * sp, Math.sin(a2) * sp, rnd(1.0, 2.0),
        rnd(2, 9), i % 2 ? C.amber : C.steel, { sq: true, g: 340, d: 0.996, vr: rnd(-14, 14) });
    }
  });
  /* fuel cooking off in stages: smaller, off-centre, but still real
     detonations — each with its own sfx / shake / flash and its own
     little scatter of debris */
  once('boom2', SEC1, function () {
    sfx('explode', 1.3); I.shake = Math.max(I.shake, 24); I.flash = Math.max(I.flash, 0.55);
    I.flashCol = C.orange;
    const ox = rkX + SEC1_OFF[0], oy = rkY - 10 + SEC1_OFF[1];
    burst(ox, oy, 40, 560, C.orange, 0.6, 32, { g: 110, d: 0.93, gr: 16 });
    burst(ox, oy, 26, 340, C.amber, 0.8, 30, { g: 60, d: 0.95, gr: 18 });
    burst(ox, oy, 18, 220, C.smoke, 2.0, 50, { add: false, g: -14, d: 0.96, gr: 34, a: 0.48 });
    for (let i = 0; i < 14; i++) {
      const a2 = rnd(0, 6.2832), sp = rnd(200, 560);
      part(ox, oy, Math.cos(a2) * sp, Math.sin(a2) * sp, rnd(1.2, 2.2),
        rnd(3, 12), i % 2 ? C.rust : C.amber, { sq: true, g: 260, d: 0.994, vr: rnd(-10, 10) });
    }
  });
  once('boom3', SEC2, function () {
    sfx('explode', 1.0); I.shake = Math.max(I.shake, 16); I.flash = Math.max(I.flash, 0.4);
    I.flashCol = C.amber;
    const ox = rkX + SEC2_OFF[0], oy = rkY - 10 + SEC2_OFF[1];
    burst(ox, oy, 28, 440, C.orange, 0.5, 26, { g: 100, d: 0.93, gr: 14 });
    burst(ox, oy, 16, 260, C.amber, 0.65, 24, { g: 50, d: 0.95, gr: 16 });
    burst(ox, oy, 14, 180, C.dust, 1.7, 42, { add: false, g: -10, d: 0.965, gr: 28, a: 0.42 });
    for (let i = 0; i < 10; i++) {
      const a2 = rnd(0, 6.2832), sp = rnd(160, 440);
      part(ox, oy, Math.cos(a2) * sp, Math.sin(a2) * sp, rnd(1.0, 1.9),
        rnd(2, 9), i % 2 ? C.rust : C.steel, { sq: true, g: 230, d: 0.994, vr: rnd(-9, 9) });
    }
  });
  if (dead) {
    const q = u - BOOM;
    /* fireball + double shockwave */
    I.c.globalCompositeOperation = 'lighter';
    /* it has to be gone before the silence: the reveal needs a dark sky */
    const fb = 300 * Math.exp(-q * 1.9) + 32;
    const fbA = sat(1.12 - q * 1.12) * sat(1.12 - q * 1.12);
    I.c.globalAlpha = fbA;
    I.c.drawImage(glow(C.amber), rkX - fb * 1.2, rkY - 10 - fb * 1.2, fb * 2.4, fb * 2.4);
    I.c.drawImage(glow(C.orange), rkX - fb, rkY - 10 - fb, fb * 2, fb * 2);
    I.c.drawImage(glow(C.white), rkX - fb * 0.42, rkY - 10 - fb * 0.42, fb * 0.84, fb * 0.84);
    I.c.globalAlpha = 1;
    /* fast, bright inner ring */
    if (q < 0.62) {
      const rq = q / 0.62;
      I.c.strokeStyle = rgba(C.white, (1 - rq) * (1 - rq) * 0.6); I.c.lineWidth = 14 * (1 - rq) + 1;
      I.c.beginPath(); I.c.arc(rkX, rkY - 10, 50 + 980 * rq, 0, 6.2832); I.c.stroke();
      I.c.strokeStyle = rgba(C.amber, (1 - rq) * (1 - rq) * 0.5); I.c.lineWidth = 20 * (1 - rq) + 2;
      I.c.beginPath(); I.c.arc(rkX, rkY - 10, 46 + 940 * rq, 0, 6.2832); I.c.stroke();
    }
    /* slower, duller outer ring — the shock pushing further than the light does */
    if (q < 1.15) {
      const rq2 = q / 1.15;
      I.c.strokeStyle = rgba(C.rust, (1 - rq2) * (1 - rq2) * 0.34); I.c.lineWidth = 26 * (1 - rq2) + 1;
      I.c.beginPath(); I.c.arc(rkX, rkY - 10, 70 + 1480 * rq2, 0, 6.2832); I.c.stroke();
    }
    /* secondary fuel-cookoff blooms, each a smaller echo of the same shape */
    if (u >= SEC1) {
      const q2 = u - SEC1;
      if (q2 < 0.6) {
        const fb2 = 150 * Math.exp(-q2 * 2.6) + 14;
        const a2 = sat(1.05 - q2 * 1.75) * sat(1.05 - q2 * 1.75);
        const ox = rkX + SEC1_OFF[0], oy = rkY - 10 + SEC1_OFF[1];
        I.c.globalAlpha = a2;
        I.c.drawImage(glow(C.orange), ox - fb2, oy - fb2, fb2 * 2, fb2 * 2);
        I.c.drawImage(glow(C.white), ox - fb2 * 0.4, oy - fb2 * 0.4, fb2 * 0.8, fb2 * 0.8);
        I.c.globalAlpha = 1;
        if (q2 < 0.4) {
          const rq3 = q2 / 0.4;
          I.c.strokeStyle = rgba(C.amber, (1 - rq3) * 0.45); I.c.lineWidth = 10 * (1 - rq3) + 1;
          I.c.beginPath(); I.c.arc(ox, oy, 30 + 320 * rq3, 0, 6.2832); I.c.stroke();
        }
      }
    }
    if (u >= SEC2) {
      const q3 = u - SEC2;
      if (q3 < 0.55) {
        const fb3 = 118 * Math.exp(-q3 * 2.8) + 12;
        const a3 = sat(1.05 - q3 * 1.9) * sat(1.05 - q3 * 1.9);
        const ox = rkX + SEC2_OFF[0], oy = rkY - 10 + SEC2_OFF[1];
        I.c.globalAlpha = a3;
        I.c.drawImage(glow(C.amber), ox - fb3, oy - fb3, fb3 * 2, fb3 * 2);
        I.c.drawImage(glow(C.white), ox - fb3 * 0.4, oy - fb3 * 0.4, fb3 * 0.8, fb3 * 0.8);
        I.c.globalAlpha = 1;
        if (q3 < 0.35) {
          const rq4 = q3 / 0.35;
          I.c.strokeStyle = rgba(C.rust, (1 - rq4) * 0.4); I.c.lineWidth = 8 * (1 - rq4) + 1;
          I.c.beginPath(); I.c.arc(ox, oy, 24 + 260 * rq4, 0, 6.2832); I.c.stroke();
        }
      }
    }
    I.c.globalCompositeOperation = 'source-over';
  }

  /* the aftermath tumble: debris smearing toward the lens, and the
     camera shudder to match the roll/zoom already applied above */
  const tumbleEnv = aftEnv(u);
  if (tumbleEnv > 0.01) {
    I.shake = Math.max(I.shake, 9 + 24 * tumbleEnv);
    streakParts(tumbleEnv * 0.95);
  }
  drawParts(true);
  hulkShard(u);

  /* ---- MOVEMENT 2: whatever it is, it is in front of all of that ---- */
  if (u > 3.1 && u < FIRE + 0.24) movement2(u);

  /* the lances, over everything, including the exhaust they cut through */
  if (u > FIRE && u < BOOM + 0.14) {
    const life = sat((u - FIRE) / 0.07) * (1 - ramp(BOOM, BOOM + 0.14, u));
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    const passes = [[28, C.violet, 0.20], [11, C.mag, 0.5], [3.2, C.white, 1]];
    for (let i = 0; i < STRIKE.length; i++) {
      const jitter = Math.sin(I.t * 88 + i * 2.1) * 2.6;
      for (let p = 0; p < 3; p++) {
        I.c.strokeStyle = rgba(passes[p][1], passes[p][2] * life);
        I.c.lineWidth = passes[p][0] * (0.85 + 0.15 * Math.sin(I.t * 60 + p));
        I.c.beginPath(); I.c.moveTo(STRIKE[i][0], STRIKE[i][1]);
        I.c.lineTo(rkX + jitter, rkY - 20 + jitter); I.c.stroke();
      }
      I.c.globalAlpha = life * 0.7;
      I.c.drawImage(glow(C.mag), STRIKE[i][0] - 66, STRIKE[i][1] - 66, 132, 132);
      I.c.globalAlpha = 1;
    }
    const bl = 100 + 34 * Math.sin(I.t * 40);
    I.c.drawImage(glow(C.white), rkX - bl / 2, rkY - 20 - bl / 2, bl, bl);
    I.c.restore();
  }

  /* ---- close the shot lens: everything from here (the reveal, the
     slate text, the vignette) is back in the fixed, un-zoomed frame ---- */
  I.c.restore();

  /* ---- MOVEMENT 3: the stillness, then the thing itself ---- */
  once('quiet', BOOM + 0.30, function () { sfx('setIntensity', 0.16); });
  once('huge', HUGE - 0.85, function () {
    I.rumbleH = sfx('rumble', 0.10); sfx('setIntensity', 0.30);
  });
  once('hugeon', HUGE + 1.30, function () {
    sfx('thud'); I.shake = Math.max(I.shake, 8); sfx('setIntensity', 0.46);
  });
  once('hugeoff', T1 - 0.40, function () {
    if (I.rumbleH && I.rumbleH.stop) { I.rumbleH.stop(0.4); I.rumbleH = null; }
  });
  if (u > HUGE - 0.85) {
    const adv = ramp(HUGE - 0.85, HUGE + 3.2, u);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.10 + 0.85 * adv);
    I.shake = Math.max(I.shake, 1.2 + 3.4 * adv * (0.6 + 0.4 * Math.sin(I.t * 7.3)));
  }
  colossus(u);

  /* slate */
  if (u < 3.0) {
    const a = ramp(0.3, 0.8, u) * (1 - ramp(2.3, 3.0, u));
    txt('CAPE ORION  //  04:17 LOCAL', 96, 108, 22, rgba(C.green, a * 0.9), 5);
    txt('MERIDIAN  HEAVY  —  ORBITAL DEFENCE PAYLOAD', 96, 144, 17, rgba(C.green, a * 0.6), 4);
  }
  /* the report of the loss, alone in the frame — and swallowed by what
     arrives next */
  if (u > BOOM + 0.55 && u < HUGE + 0.9) {
    const a = ramp(BOOM + 0.55, BOOM + 1.0, u) * (1 - ramp(HUGE + 0.15, HUGE + 0.9, u));
    txt('TELEMETRY LOST', VW / 2, 806, 30, rgba(C.red, a * (0.5 + 0.5 * pulse(I.t, 2.4))), 12, 'center');
  }
  vignette(0.52 + 0.16 * space - 0.30 * ramp(HUGE, HUGE + 1.4, u));
  /* fade to black into the alert */
  const fo = ramp(T1 - 0.58, T1, u);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo + ')'; I.c.fillRect(0, 0, VW, VH); }
}
