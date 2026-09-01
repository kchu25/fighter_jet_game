/* ===== cinematic/art/bio.js — the hive: organic attackers =====
   Cinematic-only silhouettes for the living half of the bombardment,
   matching the gameplay bio palette (sickly green [0.55,0.95,0.25],
   dark fleshy bodies).

     waspSwarm(c, x, y, w, h, tt, alpha, dir, scale)
       a band of small green bio-wasps streaming across the sky.
       Layout is precomputed once (like CB in atmosphere.js), so
       a frame is ~40 ellipse fills + glow blits.  `dir` is +1/-1
       stream direction, `scale` multiplies the creature size.

     leviathan(c, x, y, s, alpha, tt)
       a colossal tentacled silhouette looming in the smoke — never
       fully lit, read mostly as a dark bulk with pulsing green
       pustules and slowly writhing limbs. */
import { rgba, sat, hash, blob, disc, TAU } from './helpers.js';

/* gameplay LEVIATHAN tint [0.55,0.95,0.25] * 255 */
export const BIO = [140, 242, 64];
export const FLESH = [96, 52, 78];

/* ------------------------------------------------------ the swarm */
export const WA_N = 42;
export const WA = (function () {
  const a = [];
  for (let i = 0; i < WA_N; i++) {
    a.push({
      x: hash(i * 3.7 + 1),                    // normalised along the band
      y: hash(i * 5.1 + 2) - 0.5,              // about the band centre
      s: 0.55 + hash(i * 7.3 + 3) * 0.9,
      ph: hash(i * 2.9 + 4) * TAU,
      wf: 16 + hash(i * 4.3 + 5) * 10,         // wing-beat rad/s
      sp: 0.10 + hash(i * 6.1 + 6) * 0.16      // band-lengths per second
    });
  }
  return a;
})();

export function waspSwarm(c, x, y, w, h, tt, alpha, dir, scale) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004) return;
  dir = dir || 1; tt = tt || 0;
  scale = scale == null ? 1 : scale;
  c.save();
  for (let i = 0; i < WA_N; i++) {
    const o = WA[i];
    let fx = (o.x + dir * tt * o.sp) % 1;
    if (fx < 0) fx += 1;
    const px = x + fx * w;
    const py = y + o.y * h + Math.sin(tt * 1.7 + o.ph) * h * 0.10;
    const s = o.s * scale;
    /* fade toward the band ends so the wrap never pops */
    const a = alpha * (0.30 + 0.70 * Math.sin(fx * Math.PI));
    if (a <= 0.012) continue;
    const flap = Math.sin(tt * o.wf + o.ph);
    /* wings: green membrane, beating hard enough to blur */
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a * (0.28 + 0.38 * Math.abs(flap));
    c.fillStyle = rgba(BIO, 0.55);
    c.beginPath();
    c.ellipse(px - 4.6 * s, py - 1.4 * s, 4.2 * s, (1.0 + 2.6 * Math.abs(flap)) * s, -0.5 * flap, 0, TAU);
    c.ellipse(px + 4.6 * s, py - 1.4 * s, 4.2 * s, (1.0 + 2.6 * Math.abs(flap)) * s, 0.5 * flap, 0, TAU);
    c.fill();
    /* body: a dark fleshy tick, nose into the stream */
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = a;
    c.fillStyle = rgba(FLESH, 0.9);
    c.beginPath();
    c.ellipse(px, py, 5.2 * s, 2.1 * s, dir * 0.16, 0, TAU);
    c.fill();
    /* the sick green coal that reads at any distance */
    c.globalCompositeOperation = 'lighter';
    blob(c, px + dir * 2.4 * s, py, 3.4 * s, BIO, a * 0.5);
  }
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.restore();
}

/* -------------------------------------------------- the leviathan
   Rewritten to stop it reading as a face.  The old version had a
   symmetric curve arcing across the flank (a mouth), a row of five
   evenly-spaced lights arcing above it (eyebrows) and one big coal
   dead centre (a nose): at a glance the hive was a smiley.  It was
   also a single flat fill at 0.94 alpha, so the sun behind it showed
   straight through and the whole thing read as a balloon.

   Now: an asymmetric carapace, lit from the left (the sun in
   dawnSky() sits at x=430, left of where either scene puts this
   thing), with vertical chitin ridges instead of a lateral seam,
   irregularly scattered pustules instead of a symmetric row, and the
   only concentrated light low in the throat under the skirt — a maw,
   not an eye.  Opaque body, translucency supplied by a separate haze
   veil so it occludes what is behind it like a solid mass. */
export const LV_TEN = 9;
export const LV = (function () {
  const a = [];
  for (let i = 0; i < LV_TEN; i++) {
    const f = i / (LV_TEN - 1);
    a.push({
      rx: -176 + f * 352 + (hash(i * 9.1 + 7) - 0.5) * 26,   // root along the skirt
      len: 140 + hash(i * 3.3 + 2) * 160,
      ph: hash(i * 5.7 + 4) * TAU,
      w: 15 + hash(i * 8.3 + 11) * 13,
      sway: 40 + hash(i * 2.1 + 6) * 62
    });
  }
  return a;
})();
/* chitin ridges down the crown — irregular spacing, deliberately not
   mirrored about the centre line */
export const LV_RIB = (function () {
  const a = [];
  for (let i = 0; i < 9; i++) a.push(-0.88 + (i / 8) * 1.76 + (hash(i * 4.9 + 3) - 0.5) * 0.16);
  return a;
})();
/* pustules: scattered over the whole carapace by hash, no symmetry */
export const LV_PUS = (function () {
  const a = [];
  for (let i = 0; i < 11; i++) {
    const u = hash(i * 2.7 + 1), v = hash(i * 6.1 + 5);
    a.push({ x: (u - 0.5) * 330, y: -186 + v * 176, r: 7 + hash(i * 3.9 + 9) * 12, ph: hash(i * 7.1 + 2) * TAU });
  }
  return a;
})();

export function leviathan(c, x, y, s, alpha, tt) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004 || s <= 0) return;
  tt = tt || 0;
  c.save();
  c.translate(x, y);
  c.scale(s, s);

  /* the smoke it stands in, lit sickly green from inside */
  c.globalCompositeOperation = 'lighter';
  blob(c, -20, -60, 340, BIO, alpha * 0.10);
  blob(c, 30, 40, 260, FLESH, alpha * 0.16);
  c.globalCompositeOperation = 'source-over';

  /* limbs first, so the carapace overlaps their roots.  Each is a
     quadratic walked in segments of shrinking width, and each segment
     is shaded darker toward the tip so the limb tapers in value as
     well as in width instead of reading as a flat black leg. */
  c.lineCap = 'round';
  for (let i = 0; i < LV_TEN; i++) {
    const T = LV[i];
    const w1 = Math.sin(tt * 0.7 + T.ph);
    const w2 = Math.sin(tt * 1.15 + T.ph * 2.3);
    const cx = T.rx + w2 * T.sway * 0.8, cy = T.len * 0.5;
    const ex = T.rx + w1 * T.sway + (T.rx > 0 ? 34 : -34), ey = T.len;
    let lx = T.rx, ly = -8;
    for (let k = 1; k <= 7; k++) {
      const t = k / 7, mt = 1 - t;
      const qx = mt * mt * T.rx + 2 * mt * t * cx + t * t * ex;
      const qy = mt * mt * -8 + 2 * mt * t * cy + t * t * ey;
      const v = 1 - t * 0.72;                       // value falls off down the limb
      c.strokeStyle = 'rgba(' + (34 * v + 6 | 0) + ',' + (15 * v + 3 | 0) + ',' +
        (30 * v + 6 | 0) + ',' + (alpha * (0.94 - t * 0.30)).toFixed(3) + ')';
      c.lineWidth = T.w * 2 * (1 - t * 0.84);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(qx, qy); c.stroke();
      /* the sun is off to the left: one hairline on that side of each
         limb, so they belong to the same lighting as the sky */
      c.strokeStyle = rgba(FLESH, alpha * 0.22 * v);
      c.lineWidth = Math.max(0.8, T.w * 0.30 * (1 - t * 0.84));
      c.beginPath();
      c.moveTo(lx - T.w * 0.62 * (1 - (k - 1) / 7 * 0.84), ly);
      c.lineTo(qx - T.w * 0.62 * (1 - t * 0.84), qy);
      c.stroke();
      lx = qx; ly = qy;
    }
    if (i % 3 === 0) {
      c.globalCompositeOperation = 'lighter';
      blob(c, lx, ly, 8, BIO, alpha * (0.20 + 0.22 * Math.abs(w1)));
      c.globalCompositeOperation = 'source-over';
    }
  }

  /* ---- the carapace: one asymmetric mass, apex left of centre ---- */
  /* Deliberately not a dome.  A clean semicircle reads as an igloo or a
     balloon at any size; this is squatter than it is tall, the apex is
     well left of centre, the left shoulder drops away in a step and the
     right side runs out into a long low spur — so the silhouette alone
     says "creature", before any of the surface detail lands. */
  const crown = function () {
    c.beginPath();
    c.moveTo(-262, 34);
    c.bezierCurveTo(-268, -46, -232, -128, -150, -160);
    c.bezierCurveTo(-118, -173, -104, -196, -66, -202);
    c.bezierCurveTo(-6, -211, 62, -184, 96, -142);
    c.bezierCurveTo(120, -113, 168, -108, 206, -80);
    c.bezierCurveTo(250, -48, 262, -8, 252, 30);
    c.bezierCurveTo(150, 66, -160, 70, -262, 34);
    c.closePath();
  };
  crown();
  const bg = c.createLinearGradient(-140, -200, 90, 50);
  bg.addColorStop(0.00, 'rgba(86,46,74,' + (alpha * 0.97).toFixed(3) + ')');
  bg.addColorStop(0.30, 'rgba(46,22,40,' + (alpha * 0.97).toFixed(3) + ')');
  bg.addColorStop(0.72, 'rgba(23,10,20,' + (alpha * 0.98).toFixed(3) + ')');
  bg.addColorStop(1.00, 'rgba(9,4,9,' + (alpha * 0.98).toFixed(3) + ')');
  c.fillStyle = bg;
  c.fill();

  /* ridges: clipped to the carapace so nothing spills past the
     silhouette, each with a lit left face and a dark right face */
  c.save();
  crown(); c.clip();
  /* segment seams, not stripes: two horizontal plate joins and a
     handful of soft vertical ribs, all low contrast — the old evenly
     spaced high-contrast version turned it into a beach ball */
  for (let k = 0; k < 2; k++) {
    const sy = -104 + k * 76;
    c.strokeStyle = 'rgba(8,3,8,' + (alpha * 0.34).toFixed(3) + ')';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(-260, sy + 40);
    c.bezierCurveTo(-120, sy - 16, 110, sy - 10, 254, sy + 44);
    c.stroke();
    c.strokeStyle = rgba(FLESH, alpha * 0.12);
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-260, sy + 35);
    c.bezierCurveTo(-120, sy - 21, 110, sy - 15, 254, sy + 39);
    c.stroke();
  }
  for (let i = 0; i < LV_RIB.length; i++) {
    const f = LV_RIB[i];
    const bx = f * 250, ax = f * 110 - 34;
    c.strokeStyle = 'rgba(10,4,10,' + (alpha * 0.20).toFixed(3) + ')';
    c.lineWidth = 15;
    c.beginPath();
    c.moveTo(ax, -212); c.quadraticCurveTo(bx * 0.9 - 18, -80, bx, 70);
    c.stroke();
    c.strokeStyle = rgba(FLESH, alpha * 0.09);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ax - 8, -212); c.quadraticCurveTo(bx * 0.9 - 26, -80, bx - 8, 70);
    c.stroke();
  }
  /* the underside is in its own shadow */
  const ug = c.createLinearGradient(0, -44, 0, 64);
  ug.addColorStop(0, 'rgba(0,0,0,0)');
  ug.addColorStop(1, 'rgba(0,0,0,' + (alpha * 0.74).toFixed(3) + ')');
  c.fillStyle = ug; c.fillRect(-280, -50, 560, 124);
  c.restore();

  /* rim light: the sky behind catches the left shoulder and the crest */
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = rgba([158, 96, 150], alpha * 0.34);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-262, 34);
  c.bezierCurveTo(-268, -46, -232, -128, -150, -160);
  c.bezierCurveTo(-118, -173, -104, -196, -66, -202);
  c.bezierCurveTo(-6, -211, 62, -184, 96, -142);
  c.stroke();
  c.strokeStyle = rgba([220, 168, 206], alpha * 0.20);
  c.lineWidth = 1.2;
  c.stroke();
  c.restore();

  /* pustules, scattered — dimmer and smaller than before so they read
     as vents in a hull, not as features on a face */
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < LV_PUS.length; i++) {
    const p = LV_PUS[i];
    const pu = 0.22 + 0.78 * Math.max(0, Math.sin(tt * 1.35 + p.ph));
    blob(c, p.x, p.y, p.r, BIO, alpha * 0.22 * pu);
    disc(c, p.x, p.y, p.r * 0.16 + 1.1, rgba(BIO, alpha * 0.62 * pu));
  }
  /* the maw: everything bright is low, inside the skirt, and mostly
     occluded by the limbs hanging in front of it */
  const breathe = 0.45 + 0.55 * Math.max(0, Math.sin(tt * 0.65));
  blob(c, -14, 34, 92, BIO, alpha * 0.20 * breathe);
  blob(c, -14, 34, 40, [200, 255, 150], alpha * 0.14 * breathe);
  for (let i = 0; i < 4; i++) {
    const px = -74 + i * 46 + Math.sin(tt * 0.5 + i) * 5;
    blob(c, px, 30 + (i % 2) * 12, 13, BIO, alpha * 0.34 * breathe);
  }
  c.globalCompositeOperation = 'source-over';

  /* a veil of the horizon smoke back across the base, so it is rising
     out of the murk rather than standing on top of it */
  const vg = c.createLinearGradient(0, 10, 0, 118);
  vg.addColorStop(0, 'rgba(52,18,48,0)');
  vg.addColorStop(1, 'rgba(52,18,48,' + (alpha * 0.42).toFixed(3) + ')');
  c.fillStyle = vg; c.fillRect(-360, 10, 720, 112);

  c.restore();
}
