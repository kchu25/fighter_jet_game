/* ===== cinematic/art/bio.js — the hive: organic attackers =====
   Cinematic-only silhouettes for the living half of the bombardment,
   matching the gameplay bio palette (sickly green [0.55,0.95,0.25],
   dark fleshy bodies).

     waspSwarm(c, x, y, w, h, tt, alpha, dir, scale)
       a band of small green bio-wasps streaming across the sky.
       Layout is precomputed once (like CB/CROWD in atmosphere.js), so
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

/* -------------------------------------------------- the leviathan */
export const LV_TEN = 7;
export const LV = (function () {
  const a = [];
  for (let i = 0; i < LV_TEN; i++) {
    a.push({
      rx: -168 + (i / (LV_TEN - 1)) * 336,     // root along the skirt
      len: 150 + hash(i * 3.3 + 2) * 130,
      ph: hash(i * 5.7 + 4) * TAU,
      sway: 46 + hash(i * 2.1 + 6) * 60
    });
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
  blob(c, 0, -70, 320, BIO, alpha * 0.14);
  c.globalCompositeOperation = 'source-over';

  /* tentacles first, so the crown overlaps their roots.  Each is a
     quadratic curve walked in segments of shrinking width: a taper,
     writhing slowly on two mismatched frequencies. */
  c.lineCap = 'round';
  for (let i = 0; i < LV_TEN; i++) {
    const T = LV[i];
    const w1 = Math.sin(tt * 0.7 + T.ph);
    const w2 = Math.sin(tt * 1.15 + T.ph * 2.3);
    const cx = T.rx + w2 * T.sway * 0.8, cy = T.len * 0.5;
    const ex = T.rx + w1 * T.sway + (T.rx > 0 ? 34 : -34), ey = T.len;
    let lx = T.rx, ly = -8;
    for (let k = 1; k <= 5; k++) {
      const t = k / 5, mt = 1 - t;
      const qx = mt * mt * T.rx + 2 * mt * t * cx + t * t * ex;
      const qy = mt * mt * -8 + 2 * mt * t * cy + t * t * ey;
      c.strokeStyle = 'rgba(24,10,20,' + (alpha * (0.9 - t * 0.25)).toFixed(3) + ')';
      c.lineWidth = 26 * (1 - t * 0.82);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(qx, qy); c.stroke();
      lx = qx; ly = qy;
    }
    /* a dying green tip-light on every other limb */
    if (i % 2 === 0) {
      c.globalCompositeOperation = 'lighter';
      blob(c, lx, ly, 7, BIO, alpha * (0.25 + 0.25 * Math.abs(w1)));
      c.globalCompositeOperation = 'source-over';
    }
  }

  /* the crown: a bulbous fleshy dome, silhouette-dark */
  c.beginPath();
  c.moveTo(-192, 12);
  c.bezierCurveTo(-214, -122, -92, -192, 0, -192);
  c.bezierCurveTo(92, -192, 214, -122, 192, 12);
  c.bezierCurveTo(122, 44, -122, 44, -192, 12);
  c.closePath();
  c.fillStyle = 'rgba(22,10,18,' + (alpha * 0.94).toFixed(3) + ')';
  c.fill();
  c.strokeStyle = rgba(FLESH, alpha * 0.35);
  c.lineWidth = 3; c.stroke();
  /* a breathing seam across the flank */
  c.strokeStyle = 'rgba(10,4,9,' + (alpha * 0.7).toFixed(3) + ')';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(-150, -58);
  c.quadraticCurveTo(0, -96 + Math.sin(tt * 0.9) * 10, 150, -58);
  c.stroke();

  /* pustule lights along the crown, pulsing out of phase — the same
     green as every wasp and every gameplay bio-enemy */
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const px = -128 + i * 64;
    const py = -104 - Math.sin((i / 4) * Math.PI) * 56;
    const pu = 0.35 + 0.65 * Math.max(0, Math.sin(tt * 1.6 + i * 1.9));
    blob(c, px, py, 16, BIO, alpha * 0.35 * pu);
    disc(c, px, py, 3.2, rgba(BIO, alpha * 0.85 * pu));
  }
  /* the eye: one slow hateful coal, dead centre */
  const blink = 0.5 + 0.5 * Math.sin(tt * 0.55);
  blob(c, 0, -66, 34, BIO, alpha * 0.30 * (0.4 + 0.6 * blink));
  disc(c, 0, -66, 6, rgba([210, 255, 150], alpha * 0.9 * (0.3 + 0.7 * blink)));
  c.globalCompositeOperation = 'source-over';
  c.restore();
}
