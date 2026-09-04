/* ===== cinematic/art/warship.js — alien capital ship =====
   warship(c, x, y, s, alpha, charge, tt) -> { tips:[[x,y],[x,y]] }
   ~300 wide, ~90 tall, centred on the origin, prong tips (local) at
   (-118, 38) and (118, 38). */
import { rgba, sat, path, fillP, strokeP, seg, disc, hash, noise, lg, blob, TAU, CY, WH, MG, VI } from './helpers.js';

/* ==================================================================
   2. WARSHIP — alien capital ship, from slightly above and in front
   ~300 wide, ~90 tall, centred on the origin.
   Prong tips (local) at (-118, 38) and (118, 38).
   ================================================================== */
export const PTX = 118, PTY = 38;

/* main manta hull silhouette, forward-swept, prongs reaching at us */
export const WS_HULL = [
  -150, 4, -74, -22, 0, -34, 74, -22, 150, 4,
  PTX, PTY, 46, 15, 0, 25, -46, 15, -PTX, PTY
];

/* bioluminescent hull seams: three per side, riding the same parametric
   flow as the plate ribs so they sit *in* the plating rather than on
   top of it.  Layout is fixed at module load; per frame each seam only
   needs its pulse phase and one point-on-quadratic for the travelling
   node, so fifteen ships on the horizon stay cheap. */
export const WS_SEAM = (function () {
  const a = [], fs = [0.24, 0.50, 0.78];
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    a.push({
      ax: -150 + f * 132, ay: 4 - f * 18,        // outboard root
      cx: -110 + f * 90, cy: 24 - f * 6,         // control (same family as ribs)
      bx: -PTX + f * 74, by: PTY - f * 12,       // inboard end
      ph: hash(i * 7.7 + 2) * TAU,               // breath phase — never in sync
      sp: 0.35 + hash(i * 3.1 + 5) * 0.4         // circulation speed
    });
  }
  return a;
})();

/* charge motes: sparks the orb drinks out of the air.  Each entry is a
   fixed spiral track (start radius, inward speed, size, launch angle);
   per frame the orb only evaluates where along its track each mote is,
   so nothing is allocated and nothing is random. */
export const WS_MOTE = (function () {
  const a = [];
  for (let i = 0; i < 14; i++) {
    a.push({
      u0: hash(i * 5.3 + 3),                     // stagger along the track
      sp: 0.55 + hash(i * 2.9 + 7) * 0.75,       // inward speed, cycles/s
      r0: 46 + hash(i * 8.1 + 1) * 64,           // capture radius
      sz: 0.8 + hash(i * 4.7 + 2) * 1.3,         // spark size
      a0: hash(i * 6.7 + 9) * TAU                // launch bearing
    });
  }
  return a;
})();

export function warshipChargeOrb(c, tx, ty, charge, tt, side) {
  if (charge <= 0.001) return;
  const k = charge * charge;
  /* pre-fire flicker gets faster and deeper as it tops out */
  const fl = 0.78 + 0.22 * noise(tt * (6 + 26 * charge) + side * 11.7)
    + 0.14 * charge * Math.sin(tt * 55 + side * 2.1);
  const r = (7 + 40 * k) * fl;

  c.save();
  c.globalCompositeOperation = 'lighter';

  /* radiating spikes */
  const n = 9;
  const spin = tt * (0.5 + 2.2 * charge) * (side ? 1 : -1);
  c.fillStyle = rgba(MG, 0.5 * charge);
  for (let i = 0; i < n; i++) {
    const a = spin + i * TAU / n;
    const len = r * (1.6 + 1.9 * noise(i * 3.3 + tt * 5 + side));
    const w = r * 0.16;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.beginPath();
    c.moveTo(tx + ca * len, ty + sa * len);
    c.lineTo(tx - sa * w, ty + ca * w);
    c.lineTo(tx + sa * w, ty - ca * w);
    c.closePath();
    c.fill();
  }

  /* gathering motes: energy pulled off the air, spiralling down the
     last stretch into the orb.  The population grows with charge, so
     the first tell of a shot is two or three stray sparks bending
     inward — long before the orb itself is bright enough to read. */
  const mn = WS_MOTE.length;
  for (let i = 0; i < mn; i++) {
    if (i / mn > charge * 1.25) break;
    const M = WS_MOTE[i];
    let u = tt * M.sp * (0.6 + 0.9 * charge) + M.u0;
    u -= Math.floor(u);                               // 0 = far, 1 = swallowed
    const rr = M.r0 * (1 - u) * (0.5 + 0.5 * charge) + r * 0.4;
    const an = M.a0 + tt * (0.4 + 1.6 * charge) * (side ? 1 : -1) + u * 3.8;
    const mx = tx + Math.cos(an) * rr;
    const my = ty + Math.sin(an) * rr * 0.62;         // flattened orbital plane
    const ma = charge * u * u;                        // brightens as it closes
    disc(c, mx, my, M.sz * (0.6 + u), rgba(WH, 0.5 * ma));
    blob(c, mx, my, 5 * M.sz, MG, 0.4 * ma);
  }

  blob(c, tx, ty, r * 3.4, MG, 0.42 * charge);
  blob(c, tx, ty, r * 1.7, VI, 0.55 * charge);
  blob(c, tx, ty, r * 1.05, MG, 0.85 * charge);
  blob(c, tx, ty, r * 0.55, WH, 0.5 + 0.5 * k);
  disc(c, tx, ty, r * 0.30 * fl, rgba(WH, 0.35 + 0.65 * k));
  c.restore();
}

export function warship(c, x, y, s, alpha, charge, tt) {
  alpha = alpha == null ? 1 : sat(alpha);
  charge = sat(charge || 0);
  tt = tt || 0;

  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.globalAlpha = alpha;
  c.lineJoin = 'round';

  /* ---------- faint outer bloom so it sits in the scene -------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  blob(c, 0, 0, 240, VI, 0.10 * alpha);
  blob(c, 0, 6, 150, MG, 0.07 * alpha);
  c.restore();

  /* ---------- hull underside: a thick dark slab under everything,
     offset down so the ship reads as a solid with depth ---------- */
  const bellyG = lg(c, 'ws.belly', 0, -20, 0, 36, [
    [0.00, '#0a0110'], [0.55, '#170a2e'], [1.00, '#2a1550']
  ]);
  fillP(c, [-150, 10, -74, -14, 0, -26, 74, -14, 150, 10,
    PTX, PTY + 9, 46, 22, 0, 33, -46, 22, -PTX, PTY + 9], bellyG);

  /* ---------- underside glow wash: the core light leaks out beneath
     the hull, so the ship floats on a bed of its own sick light — and
     the leak swells while the weapon drinks --------------------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  const uw = (0.55 + 0.25 * Math.sin(tt * 1.3 + 0.7) + 0.9 * charge) * alpha;
  blob(c, 0, 30, 150, VI, 0.10 * uw);
  blob(c, -62, 24, 74, MG, 0.055 * uw);
  blob(c, 62, 24, 74, MG, 0.055 * uw);
  c.restore();

  /* ---------- main hull top surface ---------------------------- */
  const hullG = lg(c, 'ws.hull', 0, -40, 0, 44, [
    [0.00, '#5a1c80'], [0.20, '#3a1052'], [0.55, '#240833'], [1.00, '#160421']
  ]);
  fillP(c, WS_HULL, hullG);

  /* ---------- upper wing facets (the form turns across them) --- */
  /* left wing faces the key light, right wing falls into shadow */
  const wingL = lg(c, 'ws.wingL', -150, 0, -30, 0, [
    [0, '#3a1152'], [0.42, '#642a8c'], [0.78, '#421660'], [1, '#26093a']
  ]);
  const wingR = lg(c, 'ws.wingR', 30, 0, 150, 0, [
    [0, '#210832'], [0.45, '#421660'], [0.8, '#2a0b3e'], [1, '#170526']
  ]);
  fillP(c, [-150, 4, -74, -22, -34, -14, -46, 15], wingL);
  fillP(c, [150, 4, 74, -22, 34, -14, 46, 15], wingR);
  /* outboard shadow wedge so the wings are not one flat value */
  fillP(c, [-150, 4, -112, -9, -104, 4, -132, 12], 'rgba(8,1,14,0.55)');
  fillP(c, [150, 4, 112, -9, 104, 4, 132, 12], 'rgba(8,1,14,0.7)');
  /* inboard lit panel */
  fillP(c, [-74, -22, -34, -14, -40, 2, -84, -4], 'rgba(120,44,164,0.30)');
  fillP(c, [74, -22, 34, -14, 40, 2, 84, -4], 'rgba(90,32,126,0.16)');

  /* leading-edge chamfer: a bright band where the top meets the
     swept edge — this is what makes the silhouette feel machined */
  fillP(c, [-150, 4, -74, -22, -72, -14, -145, 10], 'rgba(150,58,205,0.75)');
  fillP(c, [150, 4, 74, -22, 72, -14, 145, 10], 'rgba(112,40,158,0.55)');
  fillP(c, [-74, -22, 0, -34, 0, -26, -72, -14], 'rgba(176,72,232,0.7)');
  fillP(c, [74, -22, 0, -34, 0, -26, 72, -14], 'rgba(132,50,182,0.5)');

  /* ---------- ribbed plating ----------------------------------- */
  c.save();
  path(c, WS_HULL);
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.42)';
  c.lineWidth = 1.1;
  for (let i = 1; i < 9; i++) {
    const f = i / 9;
    c.beginPath();
    c.moveTo(-150 + f * 132, 4 - f * 18);
    c.quadraticCurveTo(-110 + f * 90, 24 - f * 6, -PTX + f * 74, PTY - f * 12);
    c.stroke();
    c.beginPath();
    c.moveTo(150 - f * 132, 4 - f * 18);
    c.quadraticCurveTo(110 - f * 90, 24 - f * 6, PTX - f * 74, PTY - f * 12);
    c.stroke();
  }
  /* a couple of brighter plate highlights */
  c.strokeStyle = 'rgba(150,70,200,0.20)';
  c.lineWidth = 0.9;
  for (let i = 2; i < 8; i += 2) {
    const f = i / 9;
    c.beginPath();
    c.moveTo(-150 + f * 132, 5.4 - f * 18);
    c.quadraticCurveTo(-110 + f * 90, 25.4 - f * 6, -PTX + f * 74, PTY + 1.4 - f * 12);
    c.stroke();
  }
  /* bioluminescent seams, still clipped to the hull: each breathes on
     its own phase and carries one slow bright node down its length —
     the hull is machined, but something *circulates* under the plate.
     Charging pushes them all brighter together, so the whole ship
     visibly feeds the prongs. */
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 1;             // blob() stomps it anyway; alpha rides the colours
  for (let sd = 0; sd < 2; sd++) {
    const sg = sd ? 1 : -1;
    for (let i = 0; i < WS_SEAM.length; i++) {
      const S = WS_SEAM[i];
      const pw = (0.45 + 0.35 * Math.sin(tt * S.sp * 2.6 + S.ph + sd * 2.4) + 0.5 * charge) * alpha;
      if (pw <= 0.05) continue;
      c.beginPath();
      c.moveTo(sg * S.ax, S.ay);
      c.quadraticCurveTo(sg * S.cx, S.cy, sg * S.bx, S.by);
      c.strokeStyle = rgba(VI, 0.09 * pw);
      c.lineWidth = 3.0; c.stroke();                 // soft halo pass
      c.strokeStyle = rgba(MG, 0.17 * pw);
      c.lineWidth = 1.1; c.stroke();                 // filament core
      /* travelling node: one point-on-quadratic per seam per frame */
      let u = tt * S.sp * 0.5 + S.ph; u -= Math.floor(u);
      const mu = 1 - u;
      const nx = mu * mu * S.ax + 2 * mu * u * S.cx + u * u * S.bx;
      const ny = mu * mu * S.ay + 2 * mu * u * S.cy + u * u * S.by;
      blob(c, sg * nx, ny, 6, MG, 0.22 * pw);
      disc(c, sg * nx, ny, 0.9, rgba(WH, 0.45 * pw));
    }
  }
  c.restore();
  c.restore();

  /* ---------- recessed underbelly trench ----------------------- */
  const trG = lg(c, 'ws.trench', 0, -12, 0, 28, [
    [0, '#08000f'], [0.5, '#12031d'], [1, '#05000a']
  ]);
  fillP(c, [-52, -14, 52, -14, 34, 30, -34, 30], trG);
  /* trench walls: a lit inner face on one side, black on the other,
     so the recess actually reads as a recess */
  fillP(c, [-52, -14, -40, -14, -26, 30, -34, 30], 'rgba(96,34,138,0.42)');
  fillP(c, [52, -14, 40, -14, 26, 30, 34, 30], 'rgba(4,0,8,0.8)');
  strokeP(c, [-52, -14, 52, -14, 34, 30, -34, 30], 'rgba(0,0,0,0.9)', 1.6);
  /* trench ribs */
  for (let i = 0; i < 7; i++) {
    const f = i / 6, yy = -11 + f * 38;
    const hw = 48 - f * 15;
    seg(c, -hw, yy, hw, yy, 'rgba(0,0,0,0.6)', 1.0);
    seg(c, -hw, yy + 1.3, hw, yy + 1.3, 'rgba(140,58,190,0.18)', 0.8);
  }
  /* glowing magenta core slit */
  const pulseK = 0.62 + 0.2 * Math.sin(tt * 1.7) + 0.18 * charge + 0.1 * noise(tt * 9);
  c.save();
  c.globalCompositeOperation = 'lighter';
  blob(c, 0, 8, 86, MG, 0.34 * pulseK);
  blob(c, 0, 8, 40, VI, 0.30 * pulseK);
  c.globalAlpha = pulseK;
  fillP(c, [-7.5, -11, 7.5, -11, 5.0, 27, -5.0, 27], rgba(MG, 0.9));
  fillP(c, [-3.2, -9, 3.2, -9, 2.0, 25, -2.0, 25], rgba(WH, 0.95));
  c.globalAlpha = 1;
  c.restore();

  /* ---------- raised armoured spine / bridge ------------------- */
  const spineG = lg(c, 'ws.spine', 0, -52, 0, -4, [
    [0, '#7a2ba6'], [0.35, '#4a1668'], [1, '#1c0729']
  ]);
  const SP = [-38, -24, -22, -50, 22, -50, 38, -24, 26, -8, -26, -8];
  /* cast shadow onto the hull so the spine sits proud of it */
  fillP(c, [-38, -22, 38, -22, 40, -4, -40, -4], 'rgba(4,0,9,0.6)');
  fillP(c, SP, spineG);
  /* left facet catches the key light, right facet falls off hard */
  fillP(c, [-38, -24, -22, -50, 0, -50, 0, -8, -26, -8], 'rgba(140,52,190,0.42)');
  fillP(c, [38, -24, 22, -50, 0, -50, 0, -8, 26, -8], 'rgba(6,1,12,0.55)');
  /* top deck plate — a flat, brighter facet reading as the roof */
  fillP(c, [-22, -50, 22, -50, 26, -42, -26, -42], 'rgba(178,80,232,0.34)');
  strokeP(c, SP, 'rgba(0,0,0,0.7)', 1.3);
  /* armour ribs down the spine flanks */
  for (let i = 0; i < 4; i++) {
    const yy = -44 + i * 9;
    seg(c, -36 + i * 1.6, yy, -24 + i * 1.0, yy, 'rgba(0,0,0,0.45)', 0.9);
    seg(c, 36 - i * 1.6, yy, 24 - i * 1.0, yy, 'rgba(0,0,0,0.45)', 0.9);
  }
  /* bridge blister with a glowing viewport band */
  fillP(c, [-16, -46, 16, -46, 12, -35, -12, -35], '#0b0212');
  strokeP(c, [-16, -46, 16, -46, 12, -35, -12, -35], 'rgba(0,0,0,0.8)', 1.1);
  c.save();
  c.globalCompositeOperation = 'lighter';
  fillP(c, [-13.6, -44, 13.6, -44, 10.4, -39, -10.4, -39], rgba(MG, 0.6 + 0.3 * charge));
  blob(c, 0, -41, 36, MG, 0.24 + 0.2 * charge);
  c.restore();
  /* spine antennae greebles */
  seg(c, -8, -44, -11, -58, 'rgba(150,70,200,0.55)', 1.2);
  seg(c, 6, -44, 8, -54, 'rgba(150,70,200,0.4)', 1.0);
  disc(c, -11, -58, 1.6, rgba(MG, 0.8));

  /* ---------- the two forward prongs --------------------------- */
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1;
    c.save();
    c.scale(sg, 1);
    const prG = lg(c, 'ws.prong', -152, 0, -100, 0, [
      [0, '#3a1052'], [0.38, '#5a1e80'], [0.72, '#280a39'], [1, '#10031a']
    ]);
    /* shadowed under-face first, offset down: gives the prong girth */
    fillP(c, [-148, 10, -136, 8, -PTX - 1, PTY + 6, -PTX + 14, PTY + 4, -130, 18], '#0a0110');
    fillP(c, [-150, 4, -138, 2, -PTX - 3, PTY - 2, -PTX, PTY + 3, -PTX + 14, PTY - 1, -132, 12], prG);
    /* top chamfer catches magenta */
    fillP(c, [-150, 4, -138, 2, -PTX - 3, PTY - 2, -PTX - 8, PTY + 2], 'rgba(160,58,215,0.62)');
    /* inner shadow face so the prong is not one flat value */
    fillP(c, [-132, 12, -PTX + 14, PTY - 1, -PTX + 10, PTY + 2, -128, 15], 'rgba(6,1,12,0.7)');
    /* emitter housing near the tip */
    fillP(c, [-PTX - 12, PTY - 12, -PTX + 2, PTY - 8, -PTX + 4, PTY + 2, -PTX - 10, PTY - 1], '#20072e');
    strokeP(c, [-PTX - 12, PTY - 12, -PTX + 2, PTY - 8, -PTX + 4, PTY + 2, -PTX - 10, PTY - 1], 'rgba(0,0,0,0.6)', 1);
    seg(c, -PTX - 9, PTY - 9, -PTX + 1, PTY - 5, 'rgba(150,70,200,0.35)', 0.9);
    /* articulation: two knuckle seams across the prong, each a dark
       break with a lit chamfer just behind it, so the reach reads as
       jointed segments rather than one casting.  Prong axis runs
       (-144,5)->(-120,37); the seams cross it perpendicular. */
    for (let k = 0; k < 2; k++) {
      const t = 0.36 + k * 0.28;
      const jx = -144 + 24 * t, jy = 5 + 32 * t;
      const hw = 7.5 - t * 2.5;
      seg(c, jx - 0.8 * hw, jy + 0.6 * hw, jx + 0.8 * hw, jy - 0.6 * hw, 'rgba(4,0,9,0.75)', 1.5);
      seg(c, jx - 0.8 * hw + 1.0, jy + 0.6 * hw + 1.3, jx + 0.8 * hw + 1.0, jy - 0.6 * hw + 1.3, 'rgba(150,62,205,0.28)', 0.9);
    }
    /* charge conduit: a filament down the top chamfer that lights up
       as the orb drinks, with pulses running root -> tip.  Costs
       nothing on the horizon wall, where charge is zero. */
    if (charge > 0.01) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1;
      c.strokeStyle = rgba(MG, (0.10 + 0.45 * charge) * alpha);
      c.lineWidth = 1.0 + charge;
      c.beginPath(); c.moveTo(-146, 4); c.lineTo(-PTX - 2, PTY - 1); c.stroke();
      for (let k = 0; k < 3; k++) {
        let u = tt * (0.9 + 2.6 * charge) + k / 3 + i * 0.5;
        u -= Math.floor(u);
        const px2 = -146 + 26 * u, py2 = 4 + 32 * u;
        disc(c, px2, py2, 1.1, rgba(WH, 0.55 * charge * u * alpha));
        blob(c, px2, py2, 6, MG, 0.35 * charge * u * alpha);
      }
      c.restore();
    }
    c.restore();
  }

  /* ---------- wing greebles: turret blisters, vents, pods ------
     these give the hull a sense of scale; without them a 300-unit
     ship just reads as a big flat shape */
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1;
    const lit = sg < 0;                        // left side faces the key
    c.save();
    c.scale(sg, 1);
    /* dorsal turret blister */
    fillP(c, [-104, -3, -86, -9, -78, -1, -96, 5], lit ? '#5e2486' : '#2c0d40');
    fillP(c, [-104, -3, -86, -9, -87, -6, -103, -0.5], 'rgba(190,88,244,0.45)');
    strokeP(c, [-104, -3, -86, -9, -78, -1, -96, 5], 'rgba(0,0,0,0.65)', 1.0);
    seg(c, -99, -1.5, -84, -6.5, 'rgba(0,0,0,0.4)', 0.9);
    /* recessed vent bank */
    fillP(c, [-72, 2, -56, -3, -53, 3, -69, 8], '#100320');
    for (let k = 0; k < 4; k++) {
      seg(c, -70 + k * 4.4, 3.4, -67 + k * 4.4, -2.6, 'rgba(150,62,205,0.35)', 0.9);
    }
    /* outboard sensor pod on a short pylon */
    fillP(c, [-132, 6, -124, 3, -122, 8, -130, 11], lit ? '#4a1a6a' : '#230a34');
    disc(c, -127, 7, 1.8, rgba(CY, 0.7));
    c.restore();
  }

  /* ---------- hull light pinpricks ----------------------------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const h1 = hash(i * 2.7), h2 = hash(i * 5.1 + 9);
    const lx = (h1 * 2 - 1) * 138;
    const ly = -18 + h2 * 44 + Math.abs(lx) * 0.12;
    const tw = 0.45 + 0.55 * noise(tt * 2.4 + i * 3.1);
    const col = (i % 5 === 0) ? CY : MG;
    disc(c, lx, ly, 1.0, rgba(col, 0.85 * tw));
    blob(c, lx, ly, 6, col, 0.30 * tw);
  }
  c.restore();

  /* ---------- hot magenta rim light along the top edges -------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-150, 4); c.lineTo(-74, -22); c.lineTo(0, -34); c.lineTo(74, -22); c.lineTo(150, 4);
  c.strokeStyle = rgba(MG, 0.34); c.lineWidth = 2.4; c.stroke();
  c.strokeStyle = rgba(WH, 0.30); c.lineWidth = 0.9; c.stroke();
  /* prong top edges */
  c.beginPath();
  c.moveTo(-150, 4); c.lineTo(-PTX - 3, PTY - 2);
  c.moveTo(150, 4); c.lineTo(PTX + 3, PTY - 2);
  c.strokeStyle = rgba(MG, 0.22); c.lineWidth = 1.8; c.stroke();
  c.restore();

  /* ---------- cold violet bounce underneath -------------------- */
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.beginPath();
  c.moveTo(-PTX, PTY); c.lineTo(-46, 15); c.lineTo(0, 25); c.lineTo(46, 15); c.lineTo(PTX, PTY);
  c.strokeStyle = 'rgba(110,70,220,0.34)'; c.lineWidth = 2.6; c.stroke();
  c.restore();

  /* ---------- charging weapon orbs at the prong tips ----------- */
  warshipChargeOrb(c, -PTX, PTY, charge, tt, 0);
  warshipChargeOrb(c, PTX, PTY, charge, tt, 1);

  /* ---------- near full charge the field between the prongs
     destabilises: a jagged arc snaps across the gap in short bursts,
     sagging under the belly, never twice the same shape.  Gated on a
     noise threshold so it stutters — menace is in the flicker. ---- */
  if (charge > 0.7) {
    const az = (charge - 0.7) / 0.3;
    const gate = noise(tt * 16 + 3.1);
    const thr = 0.8 - az * 0.45;
    if (gate > thr) {
      const ga = Math.min(1, (gate - thr) / 0.35) * alpha;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(-PTX, PTY);
      for (let k = 1; k < 9; k++) {
        const f = k / 9;
        c.lineTo(-PTX + f * 2 * PTX,
          PTY + Math.sin(f * Math.PI) * 9 + (noise(k * 4.1 + tt * 27) - 0.5) * 30 * az);
      }
      c.lineTo(PTX, PTY);
      c.strokeStyle = rgba(VI, (0.20 + 0.35 * az) * ga);
      c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = rgba(WH, 0.5 * ga);
      c.lineWidth = 0.9; c.stroke();
      blob(c, 0, PTY + 8, 60, VI, 0.18 * ga * az);
      c.restore();
    }
  }

  c.restore();

  /* tips in FINAL CALLER COORDINATES (no rotation on this ship) */
  return {
    tips: [
      [x - PTX * s, y + PTY * s],
      [x + PTX * s, y + PTY * s]
    ]
  };
}
