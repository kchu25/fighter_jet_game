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

  c.restore();

  /* tips in FINAL CALLER COORDINATES (no rotation on this ship) */
  return {
    tips: [
      [x - PTX * s, y + PTY * s],
      [x + PTX * s, y + PTY * s]
    ]
  };
}
