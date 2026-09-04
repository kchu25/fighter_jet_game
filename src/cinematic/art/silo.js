/* ===== cinematic/art/silo.js — underground hangar launch door =====
   silo(c, x, y, w, open, glowCol[, tt]): perspective trapezoid in the
   ground plane, wider at the near (bottom) edge, designed at a nominal
   near-width of 200 and scaled by w/200. The upward light bloom reaches
   ~1.6*w above the door.  tt is optional — see clock() below. */
import { rgba, sat, mix, path, fillP, strokeP, seg, disc, hash, lg, rg, blob, CY, AM, WH } from './helpers.js';

/* Scenes call silo() without a clock and the public signature is
   frozen, so the animated details (beacon strobes, steam, strip
   flicker) take an optional trailing tt when a caller someday supplies
   one, and fall back to the wall clock when it does not.  Wall time is
   not replay-deterministic, which is why it only ever drives *phase* —
   every structural choice (streak layout, which lamp runs bright)
   still comes from hash() and holds still frame to frame. */
function clock() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
}
/* aviation red for the perimeter strobes — deliberately NOT glowCol,
   so the warning lights stay red whatever a scene tints the interior */
const RD = [255, 84, 56];

/* ==================================================================
   7. SILO — underground hangar launch door in the ground plane.
   Perspective trapezoid, wider at the near (bottom) edge.
   Designed at a nominal near-width of 200 and scaled by w/200.
   NOTE: the upward light bloom reaches ~1.6*w above the door.
   ================================================================== */
export const SL_NW = 100;   // near half width
export const SL_FW = 62;    // far half width
export const SL_D = 58;     // half depth on screen

/* The open slot is drawn in a normalised space where the near
   half-width is exactly SL_NW — the same squash trick the rocket
   plume uses — so every interior gradient caches once even though the
   physical gap differs for every silo on every frame.  Fixed polys,
   allocated once: scenes draw five of these per frame. */
const SLOTP = [-SL_FW, -SL_D, SL_FW, -SL_D, SL_NW, SL_D, -SL_NW, SL_D];
const SLOT_HOT = [-16, -SL_D, 16, -SL_D, 24, SL_D, -24, SL_D];

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

  /* blast scoring: every launch torches the armour from the seam
     outward, so soot pools against the inner edge and streaks trail
     off with the exhaust wash — over the chevrons, because scorch sits
     on top of paint.  hash() lays them once: each half is stained
     differently but identically on every frame. */
  const sootG = sgn > 0
    ? lg(c, 'sl.sootR', 2, 0, 40, 0, [
      [0, 'rgba(4,5,8,0.5)'], [0.55, 'rgba(7,8,11,0.24)'], [1, 'rgba(7,8,11,0)']])
    : lg(c, 'sl.sootL', -2, 0, -40, 0, [
      [0, 'rgba(4,5,8,0.5)'], [0.55, 'rgba(7,8,11,0.24)'], [1, 'rgba(7,8,11,0)']]);
  c.fillStyle = sootG;
  c.fillRect(sgn > 0 ? 0 : -42, -SL_D, 42, SL_D * 2);
  for (let i = 0; i < 7; i++) {
    const f = 0.06 + 0.88 * hash(i * 5.7 + (sgn > 0 ? 31.0 : 3.0));
    const yy = -SL_D + f * SL_D * 2;
    const x0 = sgn * mix(3, 6, f);
    const len = (12 + 30 * hash(i * 3.3 + sgn)) * (0.55 + 0.8 * f);
    seg(c, x0, yy, x0 + sgn * len, yy + (hash(i * 7.1 + sgn) - 0.5) * 9 * f,
      'rgba(5,6,9,' + (0.25 + 0.3 * hash(i * 9.3)).toFixed(3) + ')', 1.1 + 2.2 * hash(i * 4.9));
  }
  /* bright gouges where debris skipped off the steel */
  for (let i = 0; i < 3; i++) {
    const f = 0.2 + 0.6 * hash(i * 8.9 + sgn * 5);
    const yy = -SL_D + f * SL_D * 2;
    seg(c, sgn * mix(10, 20, f), yy,
      sgn * (mix(10, 20, f) + 9 + 10 * hash(i * 2.7)), yy - 2 + 4 * hash(i * 6.1),
      'rgba(165,190,220,0.14)', 0.7);
  }
  c.restore();

  /* raised edge highlight (the door has thickness) */
  strokeP(c, p, 'rgba(6,9,14,0.75)', 1.4);

  /* inner-edge rim: the escaping interior light.  Scaled by how far
     the door has actually slid — derived from off, so no new args —
     a closed silo shows only a hairline seam, a wide-open one earns a
     halo, a white-hot core, and a wash across the door's inner face. */
  const op = sat(off / (SL_NW * 0.98));
  const ck = '' + (glowCol[0] | 0) + (glowCol[1] | 0) + (glowCol[2] | 0);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const washG = sgn > 0
    ? lg(c, 'sl.washR.' + ck, 0, 0, 15, 0, [[0, rgba(glowCol, 0.5)], [1, rgba(glowCol, 0)]])
    : lg(c, 'sl.washL.' + ck, 0, 0, -15, 0, [[0, rgba(glowCol, 0.5)], [1, rgba(glowCol, 0)]]);
  c.globalAlpha = op;
  c.fillStyle = washG;
  c.fillRect(sgn > 0 ? 0 : -15, -SL_D, 15, SL_D * 2);
  c.globalAlpha = 1;
  seg(c, 0, -SL_D, 0, SL_D, rgba(glowCol, 0.08 + 0.5 * op), 4.5);
  seg(c, 0, -SL_D, 0, SL_D, rgba(glowCol, 0.12 + 0.68 * op), 1.8);
  if (op > 0.25) seg(c, 0, -SL_D, 0, SL_D, rgba(WH, 0.55 * (op - 0.25) / 0.75), 0.8);
  c.restore();
  c.restore();
}

export function silo(c, x, y, w, open, glowCol, tt) {
  open = sat(open || 0);
  const G = glowCol || CY;
  const T = tt == null ? clock() : tt;
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
    const spill = rg(c, 'sl.spill.' + (G[0] | 0) + (G[1] | 0) + (G[2] | 0), 0, 0, 1, 0, 0, 200, [
      [0.00, rgba(G, 0.55)], [0.28, rgba(G, 0.22)], [1.00, rgba(G, 0)]
    ]);
    c.save();
    c.scale(1, 0.5);
    c.globalAlpha = open;
    c.fillStyle = spill;
    c.fillRect(-200, -200, 400, 400);
    c.restore();
    c.restore();

    /* the slot itself, in normalised space (see SLOTP above) */
    const ck = '' + (G[0] | 0) + (G[1] | 0) + (G[2] | 0);
    c.save();
    c.scale(off / SL_NW, 1);
    fillP(c, SLOTP, '#000');
    c.save();
    path(c, SLOTP);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    /* layer 1 — vertical wash: keep the slot reading as glowCol; white
       only ever appears in the hot core.  Rides `open` a little so a
       cracked door leaks a dim interior rather than a full-power one. */
    const slotG = lg(c, 'sl.slot.' + ck, 0, -SL_D, 0, SL_D, [
      [0.00, rgba(G, 0.45)], [0.30, rgba(G, 0.95)], [1.00, rgba(G, 0.7)]
    ]);
    c.globalAlpha = 0.35 + 0.65 * open;
    c.fillStyle = slotG;
    c.fillRect(-SL_NW, -SL_D, SL_NW * 2, SL_D * 2);
    /* layer 2 — additive cannot darken, so depth is faked by shaping
       the light instead: a horizontal falloff pools it mid-shaft and
       lets it die against the walls, which reads as a rounded bore */
    const colG = lg(c, 'sl.bore.' + ck, -SL_NW, 0, SL_NW, 0, [
      [0, rgba(G, 0)], [0.5, rgba(G, 0.5)], [1, rgba(G, 0)]
    ]);
    c.fillStyle = colG;
    c.fillRect(-SL_NW, -SL_D, SL_NW * 2, SL_D * 2);
    /* layer 3 — the bay floor: a pool of light well below the doors,
       so the shaft has a bottom instead of being a flat lit sticker */
    const floorG = rg(c, 'sl.floor.' + ck, 0, SL_D * 0.55, 0, 0, SL_D * 0.55, 95, [
      [0, rgba(G, 0.55)], [0.5, rgba(G, 0.2)], [1, rgba(G, 0)]
    ]);
    c.fillStyle = floorG;
    c.fillRect(-SL_NW, -SL_D, SL_NW * 2, SL_D * 2);
    /* hazard light strips at three depths, flickering slightly out of
       phase so the machinery reads as live; they too ride `open` */
    for (let i = 0; i < 3; i++) {
      const f = 0.22 + i * 0.3;
      const yy = -SL_D + f * SL_D * 2;
      const hw = mix(SL_FW, SL_NW, f) * 0.9;
      const fl = 0.6 + 0.4 * Math.sin(T * (5.1 + i * 1.7) + i * 2.6);
      c.globalAlpha = open * fl;
      seg(c, -hw, yy, hw, yy, 'rgba(255,255,255,0.6)', 1.4);
      c.globalAlpha = open * fl * 0.5;
      seg(c, -hw, yy + 2.2, hw, yy + 2.2, rgba(AM, 0.8), 1.0);
    }
    /* elevator guide rails converging down the shaft walls */
    c.globalAlpha = open * 0.8;
    seg(c, -SL_FW * 0.84, -SL_D, -SL_NW * 0.84, SL_D, rgba(G, 0.3), 1.2);
    seg(c, SL_FW * 0.84, -SL_D, SL_NW * 0.84, SL_D, rgba(G, 0.3), 1.2);
    c.globalAlpha = 1;
    /* hot centre line: narrow, so the colour survives around it */
    c.globalAlpha = 0.85;
    fillP(c, SLOT_HOT, 'rgba(255,255,255,0.75)');
    c.globalAlpha = 1;
    c.restore();
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';

    /* upward light bloom */
    const upG = lg(c, 'sl.up.' + (G[0] | 0) + (G[1] | 0) + (G[2] | 0), 0, 0, 0, -300, [
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

  /* ---------- steam venting from the seam --------------------- */
  /* bay atmosphere dumping through the gap: three jets per side, each
     a short chain of additive puffs that climbs, curls outward, and
     waxes/wanes on its own rhythm.  Additive because the steam is
     backlit by the shaft — it should glow, not shadow.  Everything
     scales with `open`: a cracked door hisses, a full one billows. */
  if (open > 0.03) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let sd = -1; sd <= 1; sd += 2) {
      for (let j = 0; j < 3; j++) {
        const f = 0.16 + j * 0.36;
        const ph = j * 2.13 + (sd > 0 ? 3.7 : 0.6);
        const bx = sd * off * mix(SL_FW / SL_NW, 1, f);
        const by = mix(-SL_D, SL_D, f);
        const vig = 0.5 + 0.5 * Math.sin(T * (0.9 + j * 0.23) + ph);
        for (let q = 0; q < 4; q++) {
          const px = bx + sd * q * q * 0.55 + Math.sin(T * 1.4 + ph + q * 1.05) * (1.5 + q * 1.6);
          const py = by - q * (5 + 6 * open) - Math.sin(T * 0.8 + ph) * 2;
          blob(c, px, py, (4.5 + q * 3.4) * (0.7 + 0.5 * open), G, open * vig * 0.10 * (1 - q * 0.18));
        }
        /* the hot root where the jet exits the gap reads white */
        blob(c, bx, by - 2, 3.5 + 3 * open, WH, open * vig * 0.16);
      }
    }
    c.restore();
  }

  /* ---------- approach lights around the opening -------------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const hw = mix(SL_FW, SL_NW, f) + mix(26, 42, f) * 0.55;
    const yy = mix(-SL_D - 14, SL_D + 18, f) * 0.92;
    /* hash decides which lamps run bright; the slow sine only makes
       them shimmer — structure stays put, phase alone is alive */
    const a = (0.55 + 0.45 * hash(i * 3.7)) * (0.78 + 0.22 * Math.sin(T * 2.4 + i * 2.0));
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      disc(c, sgn * hw, yy, 1.7, rgba(G, 0.85 * a));
      blob(c, sgn * hw, yy, 9, G, 0.32 * a);
    }
  }
  /* threshold bar: a chase converging on the centreline, pulling the
     eye to the door the way runway lead-in strobes pull it to the
     threshold */
  for (let i = -4; i <= 4; i++) {
    const px = i * 22;
    const chs = 0.5 + 0.5 * Math.sin(T * 3.2 - Math.abs(i) * 1.05);
    disc(c, px, SL_D + 14, 1.5, rgba(AM, 0.35 + 0.45 * chs));
    blob(c, px, SL_D + 14, 7, AM, 0.1 + 0.2 * chs);
  }
  c.restore();

  /* ---------- perimeter strobes ------------------------------- */
  /* four red aircraft-warning beacons on the surround corners, each on
     the classic double-flash cadence with its own phase offset so a
     field of silos never strobes in unison.  Dark housings go down
     first in source-over (additive cannot draw dark), lamps on top. */
  for (let i = 0; i < 4; i++) {
    const bx = ((i & 1) ? 1 : -1) * ((i >> 1) ? SL_NW + 34 : SL_FW + 22);
    const by = (i >> 1) ? SL_D + 13 : -SL_D - 11;
    seg(c, bx, by, bx, by + 3, '#0c0f15', 1.2);
    disc(c, bx, by, 1.9, '#141922');
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const bx = ((i & 1) ? 1 : -1) * ((i >> 1) ? SL_NW + 34 : SL_FW + 22);
    const by = (i >> 1) ? SL_D + 13 : -SL_D - 11;
    const cyc = (T * 0.85 + i * 0.31) % 1;
    const bl = Math.max(0, 1 - Math.abs(cyc - 0.05) / 0.06, 1 - Math.abs(cyc - 0.19) / 0.06);
    disc(c, bx, by - 1, 1.4, rgba(RD, 0.25 + 0.75 * bl));
    if (bl > 0.02) {
      blob(c, bx, by - 1, 9 + 8 * bl, RD, 0.5 * bl);
      blob(c, bx, by + 2, 6, RD, 0.14 * bl);   // kiss of red on the deck
    }
  }
  c.restore();

  c.restore();
}
