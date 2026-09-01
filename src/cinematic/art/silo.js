/* ===== cinematic/art/silo.js — underground hangar launch door =====
   silo(c, x, y, w, open, glowCol): perspective trapezoid in the ground
   plane, wider at the near (bottom) edge, designed at a nominal
   near-width of 200 and scaled by w/200. The upward light bloom reaches
   ~1.6*w above the door. */
import { rgba, sat, mix, path, fillP, strokeP, seg, disc, hash, lg, rg, blob, CY, AM } from './helpers.js';

/* ==================================================================
   7. SILO — underground hangar launch door in the ground plane.
   Perspective trapezoid, wider at the near (bottom) edge.
   Designed at a nominal near-width of 200 and scaled by w/200.
   NOTE: the upward light bloom reaches ~1.6*w above the door.
   ================================================================== */
export const SL_NW = 100;   // near half width
export const SL_FW = 62;    // far half width
export const SL_D = 58;     // half depth on screen

export function siloDoor(c, sgn, off, glowCol) {
  /* one armoured half-door, slid outward by `off` */
  c.save();
  c.translate(sgn * off, 0);
  const near = sgn * SL_NW, far = sgn * SL_FW;
  const p = [0, -SL_D, far, -SL_D, near, SL_D, 0, SL_D];

  const dG = lg(c, 'sl.door' + (sgn > 0 ? 'R' : 'L'), 0, -SL_D, 0, SL_D, [
    [0.00, '#1b2029'], [0.35, '#333c49'], [0.72, '#242b36'], [1.00, '#12161d']
  ]);
  fillP(c, p, dG);

  c.save();
  path(c, p); c.clip();

  /* structural ribs running with the perspective */
  for (let i = 1; i < 5; i++) {
    const f = i / 5;
    seg(c, sgn * mix(0, SL_FW, f), -SL_D, sgn * mix(0, SL_NW, f), SL_D, 'rgba(0,0,0,0.45)', 1.2);
    seg(c, sgn * mix(0, SL_FW, f) + sgn * 1.2, -SL_D, sgn * mix(0, SL_NW, f) + sgn * 1.6, SL_D,
      'rgba(190,215,245,0.10)', 0.9);
  }
  /* cross seams */
  for (let i = 1; i < 3; i++) {
    const f = i / 3, yy = -SL_D + f * SL_D * 2;
    const hw = mix(SL_FW, SL_NW, f);
    seg(c, 0, yy, sgn * hw, yy, 'rgba(0,0,0,0.4)', 1.0);
  }

  /* hazard chevrons: a narrow warning band hugging the inner edge */
  c.save();
  c.beginPath();
  c.moveTo(0, -SL_D);
  c.lineTo(sgn * (SL_FW * 0.155), -SL_D);
  c.lineTo(sgn * (SL_NW * 0.155), SL_D);
  c.lineTo(0, SL_D);
  c.closePath();
  c.clip();
  c.fillStyle = '#12151b';
  c.fillRect(-SL_NW, -SL_D * 1.2, SL_NW * 2, SL_D * 2.4);
  c.fillStyle = 'rgba(196,162,44,0.85)';
  for (let i = -1; i < 9; i++) {
    const yy = -SL_D + i * 15;
    c.beginPath();
    c.moveTo(-SL_NW, yy);
    c.lineTo(-SL_NW, yy + 7);
    c.lineTo(SL_NW, yy + 7 + 26);
    c.lineTo(SL_NW, yy + 26);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.restore();

  /* raised edge highlight (the door has thickness) */
  strokeP(c, p, 'rgba(6,9,14,0.75)', 1.4);
  seg(c, 0, -SL_D, sgn * 0, SL_D, 'rgba(0,0,0,0)', 0.1);
  /* inner-edge top light catches the slot glow */
  c.save();
  c.globalCompositeOperation = 'lighter';
  seg(c, 0, -SL_D, 0, SL_D, rgba(glowCol, 0.5), 3.0);
  c.restore();
  c.restore();
}

export function silo(c, x, y, w, open, glowCol) {
  open = sat(open || 0);
  const G = glowCol || CY;
  const k = (w || 200) / (SL_NW * 2);

  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.lineJoin = 'round';

  /* ---------- concrete surround ------------------------------- */
  const sur = [-SL_FW - 26, -SL_D - 14, SL_FW + 26, -SL_D - 14,
    SL_NW + 42, SL_D + 18, -SL_NW - 42, SL_D + 18];
  const surG = lg(c, 'sl.sur', 0, -SL_D - 14, 0, SL_D + 18, [
    [0, '#171a22'], [0.5, '#22262f'], [1, '#101319']
  ]);
  fillP(c, sur, surG);
  strokeP(c, sur, 'rgba(6,8,12,0.8)', 1.4);
  /* deck plate seams on the apron */
  c.save(); path(c, sur); c.clip();
  for (let i = -3; i <= 3; i++) {
    seg(c, i * 34, -SL_D - 14, i * 52, SL_D + 18, 'rgba(0,0,0,0.35)', 1.0);
  }
  c.restore();

  /* ---------- the open slot ----------------------------------- */
  const off = open * (SL_NW * 0.98);
  if (open > 0.004) {
    /* light spilling onto the surrounding ground */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 1;
    const spill = rg(c, 'sl.spill', 0, 0, 1, 0, 0, 200, [
      [0.00, rgba(G, 0.55)], [0.28, rgba(G, 0.22)], [1.00, rgba(G, 0)]
    ]);
    c.save();
    c.scale(1, 0.5);
    c.globalAlpha = open;
    c.fillStyle = spill;
    c.fillRect(-200, -200, 400, 400);
    c.restore();
    c.restore();

    /* the slot itself */
    const slot = [-off * (SL_FW / SL_NW) - 0, -SL_D, off * (SL_FW / SL_NW), -SL_D,
      off, SL_D, -off, SL_D];
    /* keep the slot reading as glowCol; white only in the hot core */
    const slotG = lg(c, 'sl.slot.' + (G[0] | 0) + (G[1] | 0) + (G[2] | 0), 0, -SL_D, 0, SL_D, [
      [0.00, rgba(G, 0.45)], [0.30, rgba(G, 0.95)], [1.00, rgba(G, 0.7)]
    ]);
    fillP(c, slot, '#000');
    c.save();
    c.globalCompositeOperation = 'lighter';
    fillP(c, slot, slotG);
    /* hot centre line: narrow, so the colour survives around it */
    c.globalAlpha = 0.85;
    fillP(c, [-off * 0.16, -SL_D, off * 0.16, -SL_D, off * 0.24, SL_D, -off * 0.24, SL_D],
      'rgba(255,255,255,0.75)');
    c.globalAlpha = 1;

    /* upward light bloom */
    const upG = lg(c, 'sl.up', 0, 0, 0, -300, [
      [0.00, rgba(G, 0.42)], [0.35, rgba(G, 0.16)], [1.00, rgba(G, 0)]
    ]);
    /* Sliced, not one quad.  A single filled trapezoid gives the shaft
       two crisp diagonal edges against the sky and it reads as a piece
       of clip-art laid over the shot.  Building it from vertical slices
       whose alpha follows a cosine across the width gives the beam soft
       sides, so it reads as light in dusty air. */
    c.fillStyle = upG;
    const NS = 17;
    for (let k = 0; k < NS; k++) {
      const t0 = k / NS - 0.5, t1 = (k + 1) / NS - 0.5;
      const tc = (t0 + t1) * 0.5;
      const w = Math.pow(Math.cos(tc * Math.PI), 1.7);
      if (w <= 0.004) continue;
      /* Bleed each slice a hair into its neighbours so the seams do not
         show as antialiasing gaps — but only a hair, and composited
         source-over rather than additively, or the overlaps stack into
         bright stripes and the soft shaft turns into a fan of rays. */
      const a0 = t0 - 0.22 / NS, a1 = t1 + 0.22 / NS;
      c.globalAlpha = open * w * 0.72;
      c.beginPath();
      c.moveTo(a0 * off * 2.10, SL_D);
      c.lineTo(a1 * off * 2.10, SL_D);
      c.lineTo(a1 * off * 4.00, -300);
      c.lineTo(a0 * off * 4.00, -300);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = open;
    blob(c, 0, 0, 90 + 120 * open, G, 0.35 * open);
    c.globalAlpha = 1;
    c.restore();
  }

  /* ---------- the two armoured door halves -------------------- */
  siloDoor(c, -1, off, G);
  siloDoor(c, 1, off, G);

  /* ---------- approach lights around the opening -------------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const hw = mix(SL_FW, SL_NW, f) + mix(26, 42, f) * 0.55;
    const yy = mix(-SL_D - 14, SL_D + 18, f) * 0.92;
    const a = 0.55 + 0.45 * hash(i * 3.7);
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      disc(c, sgn * hw, yy, 1.7, rgba(G, 0.85 * a));
      blob(c, sgn * hw, yy, 9, G, 0.32 * a);
    }
  }
  /* threshold bar of lights across the near edge */
  for (let i = -4; i <= 4; i++) {
    const px = i * 22;
    disc(c, px, SL_D + 14, 1.5, rgba(AM, 0.7));
    blob(c, px, SL_D + 14, 7, AM, 0.22);
  }
  c.restore();

  c.restore();
}
