/* ===== cinematic/art/rocket.js — "SPEACE-X" launch vehicle =====
   rocket(c, x, y, s, rot, thrust, tt): nose tip y=-120, engine bells
   y=+95, body half-width 17. */
import { rgba, sat, hash, path, fillP, strokeP, seg, disc, ell, lg, blob, TAU, CY, WH, AM, OR } from './helpers.js';

/* Engine-bell heat is a chase toward current thrust rather than thrust
   itself: a bell that has burned for seconds keeps glowing through a
   throttle dip, and a fresh ignition starts cold.  tt is scene time,
   so a scene restart shows up as tt jumping backwards — the dt clamp
   freezes the integrator for that one frame instead of blowing it up.
   Module scope is safe: only one vehicle is ever in frame. */
let heat = 0, heatT = -1;
/* plume flicker, published by rocketPlume() so the hull under-lighting
   in rocket() breathes in exact sync with the exhaust causing it */
let flickS = 1;
/* RCS ports as [x, y, jet direction]: fixed hardware, allocated once
   so the per-frame cost is a couple of reads, not an array build */
const RCSP = [[-15.2, -72, -1], [15.2, -72, 1], [-16.8, -12, -1], [16.8, -12, 1]];

/* ==================================================================
   1. ROCKET — "SPEACE-X" two-stage orbital launch vehicle
   nose tip y=-120, engine bells y=+95, body half-width 17
   ================================================================== */

/* Plume is drawn in a normalised 0..150 vertical space and squashed
   with a transform, so its gradients can be cached even though its
   length changes every frame. */
export function rocketPlume(c, thrust, tt) {
  if (thrust <= 0.001) return;
  const flick = 1 + 0.12 * Math.sin(tt * 41.3) * (0.5 + 0.5 * Math.sin(tt * 17.7 + 1.3));
  flickS = flick;
  const L = (40 + 150 * thrust) * flick;
  const y0 = 93;
  const N = 150;                       // normalised plume height

  c.save();
  c.globalCompositeOperation = 'lighter';

  /* nozzle-plane bloom sits in unscaled space */
  blob(c, 0, y0 + 2, 34 + 26 * thrust, AM, 0.5 * thrust);
  blob(c, 0, y0 + 2, 18 + 12 * thrust, WH, 0.55 * thrust);
  /* recirculation: exhaust curling back around the bells — a wide dim
     orange pillow that flickers with the plume.  The matching wash on
     the hull side lives in rocket(), because the plume is drawn behind
     the vehicle and could never light metal from here. */
  blob(c, 0, y0 + 7, 30 + 24 * thrust, OR, 0.32 * thrust * flick);

  c.save();
  c.translate(0, y0);
  /* underexpansion: as chamber pressure rises the plume balloons past
     the bell lip, so width rides thrust while length rides L */
  c.scale(1 + 0.30 * thrust, L / N);

  /* --- outer amber cone ------------------------------------- */
  const go = lg(c, 'rk.plume.out', 0, 0, 0, N, [
    [0.00, 'rgba(255,214,150,0.85)'],
    [0.18, 'rgba(255,150,54,0.62)'],
    [0.55, 'rgba(255,96,30,0.30)'],
    [1.00, 'rgba(200,40,10,0)']
  ]);
  c.beginPath();
  c.moveTo(-20, 0);
  c.quadraticCurveTo(-27, N * 0.42, -2, N);
  c.lineTo(2, N);
  c.quadraticCurveTo(27, N * 0.42, 20, 0);
  c.closePath();
  c.fillStyle = go;
  c.globalAlpha = 0.5 + 0.5 * thrust;
  c.fill();

  /* --- mid orange sheath ------------------------------------ */
  const gm = lg(c, 'rk.plume.mid', 0, 0, 0, N, [
    [0.00, 'rgba(255,236,196,0.9)'],
    [0.30, 'rgba(255,178,70,0.55)'],
    [1.00, 'rgba(255,110,30,0)']
  ]);
  c.beginPath();
  c.moveTo(-12, 0);
  c.quadraticCurveTo(-15, N * 0.4, -1, N * 0.9);
  c.lineTo(1, N * 0.9);
  c.quadraticCurveTo(15, N * 0.4, 12, 0);
  c.closePath();
  c.fillStyle = gm;
  c.fill();

  /* --- white-hot core --------------------------------------- */
  const gc = lg(c, 'rk.plume.core', 0, 0, 0, N, [
    [0.00, 'rgba(255,255,255,0.98)'],
    [0.22, 'rgba(255,248,225,0.8)'],
    [0.62, 'rgba(255,206,140,0.28)'],
    [1.00, 'rgba(255,170,90,0)']
  ]);
  c.beginPath();
  c.moveTo(-4.6, 0);
  c.quadraticCurveTo(-5.4, N * 0.34, 0, N * 0.72);
  c.quadraticCurveTo(5.4, N * 0.34, 4.6, 0);
  c.closePath();
  c.fillStyle = gc;
  c.fill();
  c.restore();

  /* --- shock diamonds: brighter than the core so they read ---- */
  const dn = 5;
  for (let i = 0; i < dn; i++) {
    const f = (i + 0.4) / dn;
    /* cell spacing stretches with chamber pressure, so throttling up
       visibly pushes the diamonds apart instead of just lengthening
       the sheath around them; the slow sine bob keeps the train from
       looking pinned to the airframe */
    const dy = y0 + L * f * (0.54 + 0.16 * thrust) + Math.sin(tt * 9.1 + i * 2.3) * 1.6;
    const rx = (8.4 - i * 1.15) * (0.82 + 0.18 * Math.sin(tt * 24 + i * 1.7))
      * (0.78 + 0.42 * thrust);
    const ry = rx * 1.8;
    const a = (1 - f * 0.8) * 0.95 * thrust;
    if (rx <= 0.5) continue;
    blob(c, 0, dy, rx * 3.6, AM, a * 0.5);
    /* the mach disc proper: a luminous plate at the cell boundary,
       breathing on its own slower rhythm than the frame-rate flicker
       so the pulse is readable rather than noise */
    c.globalAlpha = a * (0.5 + 0.35 * Math.sin(tt * 12.7 + i * 2.1));
    ell(c, 0, dy, rx * 1.55, rx * 0.34, 'rgba(255,255,255,0.9)');
    c.globalAlpha = a;
    c.fillStyle = 'rgba(255,255,255,1)';
    c.beginPath();
    c.moveTo(0, dy - ry); c.lineTo(rx, dy); c.lineTo(0, dy + ry); c.lineTo(-rx, dy);
    c.closePath(); c.fill();
    /* thin waist between diamonds */
    c.fillStyle = 'rgba(255,236,190,0.8)';
    c.beginPath();
    c.moveTo(0, dy + ry); c.lineTo(rx * 0.3, dy + ry * 1.5);
    c.lineTo(0, dy + ry * 2); c.lineTo(-rx * 0.3, dy + ry * 1.5);
    c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
}

export function rocket(c, x, y, s, rot, thrust, tt) {
  thrust = thrust || 0; tt = tt || 0;
  /* integrate bell heat: roughly five seconds of full burn to soak to
     a visible glow, slower still to cool, so a shutdown leaves the
     bells smouldering instead of snapping back to cold steel */
  const dtH = heatT < 0 ? 0 : Math.min(0.1, Math.max(0, tt - heatT));
  heatT = tt;
  heat = sat(heat + (thrust - heat) * Math.min(1, dtH * (thrust > heat ? 0.5 : 0.22)));
  c.save();
  c.translate(x, y);
  c.rotate(rot || 0);
  c.scale(s, s);
  c.lineJoin = 'round';
  c.lineCap = 'round';

  /* ---------- plume goes BEHIND the vehicle ---------- */
  rocketPlume(c, thrust, tt);

  const HW = 17;                     // body half width
  const BT = -62, BB = 62;           // body top / bottom
  const NT = -120;                   // nose tip

  /* ---------- aft fins: foreshortened pair first (far side) ---- */
  const finFar = lg(c, 'rk.finFar', -12, 0, 12, 0, [
    [0, '#161b26'], [0.5, '#39424f'], [1, '#10141c']
  ]);
  fillP(c, [-11, 52, -5, 52, -8, 96, -15, 96], finFar);
  fillP(c, [11, 52, 5, 52, 8, 96, 15, 96], finFar);

  /* ---------- big silhouette fins (left / right) --------------- */
  const finL = lg(c, 'rk.finL', -38, 0, -15, 0, [
    [0, '#0e1119'], [0.55, '#2b3340'], [1, '#59647a']
  ]);
  fillP(c, [-16, 46, -16, 97, -38, 99, -30, 62], finL);
  strokeP(c, [-16, 46, -16, 97, -38, 99, -30, 62], 'rgba(120,150,185,0.35)', 0.9);
  seg(c, -18, 58, -30, 68, 'rgba(0,0,0,0.5)', 1.2);

  const finR = lg(c, 'rk.finR', 15, 0, 38, 0, [
    [0, '#4a5566'], [0.5, '#232a36'], [1, '#0c0f16']
  ]);
  fillP(c, [16, 46, 16, 97, 38, 99, 30, 62], finR);
  strokeP(c, [16, 46, 16, 97, 38, 99, 30, 62], 'rgba(90,110,140,0.3)', 0.9);
  seg(c, 18, 58, 30, 68, 'rgba(0,0,0,0.5)', 1.2);

  /* ---------- engine skirt ------------------------------------ */
  const skirt = lg(c, 'rk.skirt', -21, 0, 21, 0, [
    [0.00, '#191d27'], [0.16, '#40495a'], [0.36, '#78859a'],
    [0.60, '#4a5466'], [0.85, '#1d222d'], [1.00, '#0d1017']
  ]);
  fillP(c, [-HW, BB, HW, BB, 21, 84, -21, 84], skirt);
  seg(c, -19.5, 72, 19.5, 72, 'rgba(0,0,0,0.55)', 1.1);
  seg(c, -19.3, 73.4, 19.3, 73.4, 'rgba(190,210,235,0.16)', 0.8);

  /* ---------- bell nozzles ------------------------------------ */
  const bellG = lg(c, 'rk.bell', -7, 0, 7, 0, [
    [0, '#0a0c11'], [0.42, '#4c5464'], [0.62, '#6f7a8c'], [1, '#0e1117']
  ]);
  const bx = [-11.5, 0, 11.5];
  for (let i = 0; i < 3; i++) {
    c.save();
    c.translate(bx[i], 0);
    fillP(c, [-4.6, 83, 4.6, 83, 6.8, 95, -6.8, 95], bellG);
    /* mouth */
    ell(c, 0, 95, 6.8, 2.3, '#06070b');
    c.beginPath();
    c.ellipse(0, 95, 6.8, 2.3, 0, 0, TAU);
    c.strokeStyle = 'rgba(160,180,205,0.4)'; c.lineWidth = 0.8; c.stroke();
    /* sustained-burn heat soak: two cached gradients layered so the
       bell shifts dull red -> orange-white as `heat` climbs, without
       ever rebuilding a gradient.  Runs off heat, not thrust, so it
       lingers after a cut. */
    if (heat > 0.03) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const hg1 = lg(c, 'rk.heat1', 0, 83, 0, 95, [
        [0.00, 'rgba(150,22,8,0)'], [0.50, 'rgba(210,48,14,0.30)'], [1.00, 'rgba(255,92,30,0.55)']
      ]);
      c.globalAlpha = heat;
      fillP(c, [-4.6, 83, 4.6, 83, 6.8, 95, -6.8, 95], hg1);
      const hg2 = lg(c, 'rk.heat2', 0, 83, 0, 95, [
        [0.00, 'rgba(255,120,40,0)'], [0.60, 'rgba(255,164,72,0.26)'], [1.00, 'rgba(255,224,158,0.6)']
      ]);
      c.globalAlpha = heat * heat;
      fillP(c, [-4.6, 83, 4.6, 83, 6.8, 95, -6.8, 95], hg2);
      c.globalAlpha = 1;
      c.restore();
    }
    if (thrust > 0.02) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      ell(c, 0, 95, 5.4, 1.7, rgba(AM, 0.55 * thrust * flickS));
      ell(c, 0, 95, 3.0, 1.0, rgba(WH, 0.8 * thrust));
      c.restore();
    }
    /* cooling channel ribs */
    for (let k = -2; k <= 2; k++) {
      seg(c, k * 1.9, 84, k * 2.7, 94, 'rgba(0,0,0,0.35)', 0.55);
    }
    c.restore();
  }

  /* ---------- base recirculation wash ------------------------- */
  /* the plume's back-flow lights the skirt and bells from below; it
     must be drawn here, over the metal, because the plume itself sits
     behind the vehicle.  Breathes with flickS so hull and exhaust can
     never get out of step. */
  if (thrust > 0.02) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    blob(c, 0, 90, 30 + 16 * thrust, OR, (0.10 + 0.28 * thrust) * flickS);
    blob(c, 0, 86, 15, AM, 0.20 * thrust * flickS);
    c.restore();
  }

  /* ---------- main body: cylindrical shading ------------------ */
  const bodyG = lg(c, 'rk.body', -HW, 0, HW, 0, [
    [0.00, '#2f3644'], [0.08, '#5d6779'], [0.22, '#a8b3c4'],
    [0.36, '#eef3fa'], [0.46, '#d3dbe7'], [0.66, '#8d99ab'],
    [0.86, '#414a5b'], [1.00, '#1c212c']
  ]);
  c.fillStyle = bodyG;
  c.fillRect(-HW, BT, HW * 2, BB - BT);

  /* ---------- ogive nose cone --------------------------------- */
  const noseG = lg(c, 'rk.nose', -HW, 0, HW, 0, [
    [0.00, '#39414f'], [0.10, '#707b8d'], [0.34, '#f2f6fc'],
    [0.52, '#c3ccda'], [0.78, '#5d6779'], [1.00, '#242a36']
  ]);
  c.beginPath();
  c.moveTo(0, NT);
  c.quadraticCurveTo(-10.5, -100, -15.0, -80);
  c.quadraticCurveTo(-17.0, -70, -HW, BT);
  c.lineTo(HW, BT);
  c.quadraticCurveTo(17.0, -70, 15.0, -80);
  c.quadraticCurveTo(10.5, -100, 0, NT);
  c.closePath();
  c.fillStyle = noseG;
  c.fill();
  /* nose tip cap + seam */
  seg(c, -15.6, -76, 15.6, -76, 'rgba(0,0,0,0.4)', 0.8);
  seg(c, -15.4, -74.8, 15.4, -74.8, 'rgba(230,240,255,0.22)', 0.7);
  disc(c, 0, NT + 2.5, 2.0, '#c9d4e2');

  /* ---------- grid fins near the top -------------------------- */
  const gfG = lg(c, 'rk.gf', 16, 0, 33, 0, [[0, '#525c6e'], [1, '#191e28']]);
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    c.save();
    c.scale(sgn, 1);
    fillP(c, [16, -66, 31, -62, 31, -44, 16, -47], gfG);
    c.save();
    path(c, [16, -66, 31, -62, 31, -44, 16, -47]);
    c.clip();
    c.strokeStyle = 'rgba(10,13,19,0.75)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) seg(c, 16 + i * 3.8, -68, 16 + i * 3.8, -42, 'rgba(10,13,19,0.75)', 0.8);
    for (let i = 0; i < 4; i++) seg(c, 14, -64 + i * 5.4, 33, -62 + i * 5.4, 'rgba(10,13,19,0.6)', 0.8);
    c.restore();
    strokeP(c, [16, -66, 31, -62, 31, -44, 16, -47], 'rgba(150,175,205,0.4)', 0.9);
    c.restore();
  }
  /* foreshortened grid fins (front/back) — thin slivers on the body */
  fillP(c, [-6, -66, 6, -66, 6, -47, -6, -47], 'rgba(24,29,38,0.85)');
  for (let i = 0; i < 4; i++) seg(c, -6, -64 + i * 5, 6, -64 + i * 5, 'rgba(120,140,168,0.25)', 0.6);

  /* ---------- interstage band + seams ------------------------- */
  const isG = lg(c, 'rk.is', -HW, 0, HW, 0, [
    [0.00, '#12151d'], [0.20, '#333a48'], [0.38, '#5d6779'],
    [0.62, '#3b4351'], [1.00, '#0b0d13']
  ]);
  c.fillStyle = isG;
  c.fillRect(-HW, -8, HW * 2, 16);
  seg(c, -HW, -8, HW, -8, 'rgba(0,0,0,0.7)', 1.1);
  seg(c, -HW, 8, HW, 8, 'rgba(0,0,0,0.7)', 1.1);
  seg(c, -HW, -6.6, HW, -6.6, 'rgba(200,220,245,0.2)', 0.7);
  seg(c, -HW, 9.3, HW, 9.3, 'rgba(200,220,245,0.16)', 0.7);
  for (let i = 0; i < 7; i++) {
    const px = -14 + i * 4.7;
    seg(c, px, -7, px, 7, 'rgba(0,0,0,0.35)', 0.6);
  }
  /* flange bolts, two staggered rows: a paired dark/bright dot reads
     as a fastener at any zoom without needing a modelled circle */
  for (let i = 0; i < 8; i++) {
    const px = -15.1 + i * 4.3;
    disc(c, px, -4.4, 0.55, 'rgba(8,10,15,0.8)');
    disc(c, px - 0.2, -4.7, 0.25, 'rgba(205,220,240,0.4)');
    disc(c, px + 2.1, 5.2, 0.5, 'rgba(8,10,15,0.7)');
  }

  /* ---------- horizontal panel seams -------------------------- */
  const seams = [-52, -40, 18, 30, 54];
  for (let i = 0; i < seams.length; i++) {
    seg(c, -HW, seams[i], HW, seams[i], 'rgba(0,0,0,0.42)', 0.75);
    seg(c, -HW, seams[i] + 1.1, HW, seams[i] + 1.1, 'rgba(255,255,255,0.16)', 0.6);
  }
  /* vertical stringer seams */
  seg(c, -8.5, BT, -8.5, 62, 'rgba(0,0,0,0.18)', 0.6);
  seg(c, 7.5, BT, 7.5, 62, 'rgba(0,0,0,0.22)', 0.6);

  /* ---------- roll-alignment black & white pattern ------------ */
  for (let i = 0; i < 6; i++) {
    c.fillStyle = (i & 1) ? '#e9eef6' : '#0d1016';
    c.fillRect(-HW + i * (HW * 2 / 6), 34, HW * 2 / 6, 11);
  }
  seg(c, -HW, 34, HW, 34, 'rgba(0,0,0,0.5)', 0.7);
  seg(c, -HW, 45, HW, 45, 'rgba(0,0,0,0.5)', 0.7);
  /* long vertical roll stripe on the shaded side */
  c.fillStyle = 'rgba(12,15,21,0.85)';
  c.fillRect(11.5, -52, 3.2, 34);

  /* ---------- greebles: conduit, vents, sensor pods ----------- */
  c.fillStyle = '#2b323e';
  c.fillRect(-15.2, -34, 3.0, 40);          // raceway conduit
  seg(c, -13.7, -34, -13.7, 6, 'rgba(190,210,235,0.28)', 0.6);
  /* clamp blocks pinning the raceway at a regular station: the
     repeating dark/bright pair is what sells it as bolted-on pipe
     rather than a painted stripe */
  for (let yy = -30; yy <= 2; yy += 8) {
    seg(c, -15.6, yy, -11.9, yy, 'rgba(10,13,19,0.7)', 1.2);
    seg(c, -15.6, yy + 1.1, -11.9, yy + 1.1, 'rgba(195,215,238,0.2)', 0.6);
  }
  /* second raceway down the first stage, opposite side, crossing the
     checker band — plumbing runs over paint, never under it */
  c.fillStyle = '#272e3a';
  c.fillRect(12.6, 12, 2.2, 46);
  seg(c, 13.6, 12, 13.6, 58, 'rgba(185,205,230,0.22)', 0.55);
  for (let yy = 16; yy <= 54; yy += 10) seg(c, 12.2, yy, 15.2, yy, 'rgba(10,13,19,0.65)', 1.0);
  /* COPV pressed against the interstage: one sphere, one specular dot */
  disc(c, -5, 16, 2.3, '#333b48');
  disc(c, -5.8, 15.2, 0.8, 'rgba(210,225,245,0.5)');
  c.fillStyle = '#1a1f29';
  c.fillRect(9.5, 14, 6.0, 4.5);            // vent
  c.fillRect(9.5, 20, 6.0, 2.2);
  disc(c, -12, 20, 2.0, '#39424f');         // sensor pod
  disc(c, -12, 20, 0.9, '#8ea3bd');
  /* umbilical fairing */
  fillP(c, [-17, 46, -22, 50, -22, 58, -17, 60], '#232a35');

  /* ---------- cryo frost at the tank shoulder ----------------- */
  /* the LOX dome sits just under the -40 seam, so a frost band rides
     there from the moment the vehicle is loaded — visible on the pad,
     not only in flight.  Static and hash-placed: costs nothing and
     never crawls. */
  const frG = lg(c, 'rk.frost', 0, -40, 0, -30, [
    [0.00, 'rgba(228,242,255,0.30)'], [0.40, 'rgba(218,236,255,0.14)'], [1.00, 'rgba(212,232,255,0)']
  ]);
  c.fillStyle = frG;
  c.fillRect(-HW, -40, HW * 2, 10);
  seg(c, -HW, -39.3, HW, -39.3, 'rgba(238,250,255,0.35)', 0.8);
  for (let i = 0; i < 6; i++) {
    const fx = -HW + 2 + hash(i * 11.3) * (HW * 2 - 6);
    c.fillStyle = 'rgba(222,240,255,' + (0.08 + 0.12 * hash(i * 5.1)).toFixed(3) + ')';
    c.fillRect(fx, -40, 2 + 3 * hash(i * 7.9), 9 + 6 * hash(i * 3.7));
  }
  /* under real thrust the vibration sheds that frost as flakes that
     fall aft along the hull.  Phase comes from tt, placement from the
     cycle index through hash(), so the shower is irregular but fully
     replayable; ph*ph makes each flake accelerate like a dropped
     object seen from an accelerating frame. */
  const shed = sat((thrust - 0.25) * 2);
  if (shed > 0) {
    c.fillStyle = 'rgba(235,246,255,0.9)';
    for (let i = 0; i < 7; i++) {
      const cyc = tt * (1.7 + hash(i * 3.1) * 1.5) + i * 1.31;
      const ph = cyc - Math.floor(cyc);
      const fx = -HW + 1.5 + hash(i * 9.7 + Math.floor(cyc)) * (HW * 2 - 3);
      c.globalAlpha = shed * (1 - ph) * 0.7;
      c.fillRect(fx, -38 + ph * ph * 128, 1.2, 2.4 + ph * 3);
    }
    c.globalAlpha = 1;
  }

  /* ---------- RCS puff glints --------------------------------- */
  /* cold-gas jets pop in short hash-gated windows so the vehicle
     reads as actively steering, with an irregular but replayable
     rhythm.  Silent on the pad: nobody fires RCS with the hold-downs
     still on. */
  if (thrust > 0.02) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const cyc = tt * (0.9 + 0.13 * i) + i * 3.7;
      const ci = Math.floor(cyc), ph = cyc - ci;
      if (hash(ci * 7.7 + i * 13.1) < 0.6 || ph > 0.3) continue;
      const f = 1 - ph / 0.3, p = RCSP[i];
      c.fillStyle = 'rgba(235,246,255,' + (0.5 * f).toFixed(3) + ')';
      c.beginPath();
      c.moveTo(p[0], p[1] - 1.1);
      c.lineTo(p[0] + p[2] * (6 + 6 * (1 - f)), p[1] - 3.2 - 2 * (1 - f));
      c.lineTo(p[0] + p[2] * (7 + 7 * (1 - f)), p[1] + 2.6 + 2 * (1 - f));
      c.lineTo(p[0], p[1] + 1.1);
      c.closePath();
      c.fill();
      blob(c, p[0], p[1], 4.5 + 4 * f, WH, 0.45 * f);
    }
    c.restore();
  }

  /* ---------- rim light / bounce ------------------------------ */
  c.save();
  c.globalCompositeOperation = 'lighter';
  const rimG = lg(c, 'rk.rim', -HW, 0, -HW + 5, 0, [
    [0, 'rgba(58,224,255,0.55)'], [1, 'rgba(58,224,255,0)']
  ]);
  c.fillStyle = rimG;
  c.fillRect(-HW, BT, 5, BB - BT);      // body only: never spills past the silhouette
  /* matching rim along the tapering nose edge */
  c.beginPath();
  c.moveTo(-15.0, -80);
  c.quadraticCurveTo(-17.0, -70, -HW, BT);
  c.lineTo(-HW + 4, BT);
  c.quadraticCurveTo(-13.4, -70, -11.6, -79);
  c.closePath();
  c.fillStyle = rgba(CY, 0.30);
  c.fill();
  /* amber bounce from the plume up the lower right */
  const bnc = lg(c, 'rk.bnc', 0, 96, 0, 30, [
    [0, 'rgba(255,150,60,0.5)'], [1, 'rgba(255,150,60,0)']
  ]);
  /* flickS ties the bounce brightness to the plume's own flicker, so
     the hull visibly breathes with the exhaust lighting it */
  c.globalAlpha = (0.25 + 0.6 * thrust) * flickS;
  c.fillStyle = bnc;
  c.fillRect(-HW, 30, HW * 2, 66);
  c.globalAlpha = 1;
  c.restore();

  /* ---------- "SPEACE-X" lettering, vertical down the body ---- */
  c.save();
  c.translate(-2.5, -30);
  c.rotate(Math.PI / 2);
  c.font = 'bold 9px "Courier New",monospace';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(16,20,28,0.9)';
  c.fillText('SPEACE-X', 0, 0);
  c.restore();
  /* second, smaller mark on the first stage, clear of the checkers */
  c.save();
  c.translate(-2.0, 48);
  c.rotate(Math.PI / 2);
  c.font = 'bold 5px "Courier New",monospace';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(20,25,34,0.7)';
  c.fillText('SPEACE-X', 0, 0);
  c.restore();

  /* ---------- outline to seat it against the sky -------------- */
  c.beginPath();
  c.moveTo(0, NT);
  c.quadraticCurveTo(-10.5, -100, -15.0, -80);
  c.quadraticCurveTo(-17.0, -70, -HW, BT);
  c.lineTo(-HW, BB);
  c.lineTo(HW, BB);
  c.lineTo(HW, BT);
  c.quadraticCurveTo(17.0, -70, 15.0, -80);
  c.quadraticCurveTo(10.5, -100, 0, NT);
  c.closePath();
  c.strokeStyle = 'rgba(6,8,13,0.55)';
  c.lineWidth = 1.0;
  c.stroke();

  c.restore();
}
