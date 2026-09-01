/* ===== cinematic/art/atmosphere.js — background set dressing =====
   cloudBank(c, y, h, tt, tint, alpha): stylised vector cloud band, full
   1600 wide.  Lobe layout is generated once into module scope and the
   lobe itself is a cached, feathered, top-lit sprite, so a frame is
   ~50 drawImage blits and one cached gradient — and, critically, no
   hard elliptical edges for the eye to catch on. */
import { sat, hash, lg, TAU, VW } from './helpers.js';

/* ==================================================================
   CLOUD BANK
   The old version filled three passes of opaque ellipses.  At any
   alpha below 1 every lobe boundary showed as a crisp oval seam and
   every overlap double-darkened, which is what made the banks read as
   flat cut-out bubbles pasted over the sky rather than vapour.

   Now each lobe is one blit of a per-tint sprite whose alpha feathers
   to nothing at the rim, so overlaps accumulate as density instead of
   as edges, and whose own vertical gradient runs lit-crest -> body ->
   shadowed base, so a single lobe already reads as a lit volume.
   ================================================================== */
export const CB_N = 46;
export const CB = (function () {
  const a = [];
  for (let i = 0; i < CB_N; i++) {
    const layer = i % 3;                        // 0 back .. 2 front
    a.push({
      x: hash(i * 1.37) * 1.30 - 0.15,          // normalised
      y: (hash(i * 2.71 + 4) - 0.5) * 0.72,     // about the band centre
      r: 0.30 + hash(i * 4.13 + 9) * 0.70,      // vs h
      /* Squash hard.  Round lobes crossing the low sun read as craters
         on a moon, which is exactly what these banks used to look like;
         long flat decks read immediately as sunset stratus and let the
         sun stay a sun.  The variance keeps them from stamping. */
      sq: 0.13 + hash(i * 8.9 + 13) * 0.17,
      wide: 1.35 + hash(i * 5.5 + 17) * 0.95,
      rot: (hash(i * 6.7 + 21) - 0.5) * 0.16,
      l: layer,
      sp: 5 + layer * 9                         // px/sec drift
    });
  }
  a.sort(function (p, q) { return p.l - q.l; }); // back layer first
  return a;
})();

/* ---- the lobe sprite, one per tint (there are three in the whole
   cinematic, so this cache never grows past a handful of entries) ---- */
export const PUFF = {};
export function puffSprite(T) {
  const key = (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0);
  let s = PUFF[key];
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 128;
  const x = s.getContext('2d');

  /* 1. the mass: a handful of feathered discs offset around the centre,
     so the silhouette is lumpy rather than one clean oval, and the rim
     falls off to zero alpha instead of ending on an edge */
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 46);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.46, 'rgba(255,255,255,0.94)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.44)');
  g.addColorStop(0.88, 'rgba(255,255,255,0.13)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    const a = i * 1.13, rr = 0.62 + (i % 3) * 0.16;
    x.save();
    x.translate(64 + Math.cos(a) * 15, 64 + Math.sin(a) * 8);
    x.scale(rr, rr * 0.66);
    x.translate(-64, -64);
    x.fillRect(0, 0, 128, 128);
    x.restore();
  }

  /* 2. shade it: one vertical ramp through the tint, clipped to the
     mass we just built.  Lit crest at the top (the light in every
     scene that uses this is the low sun behind the bank), body in the
     middle, cold shadow underneath. */
  const hi = 'rgb(' + (Math.min(255, T[0] * 1.16 + 52) | 0) + ',' +
    (Math.min(255, T[1] * 1.16 + 40) | 0) + ',' + (Math.min(255, T[2] * 1.12 + 48) | 0) + ')';
  const md = 'rgb(' + (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0) + ')';
  const lo = 'rgb(' + (T[0] * 0.30 | 0) + ',' + (T[1] * 0.26 | 0) + ',' + (T[2] * 0.42 | 0) + ')';
  x.globalCompositeOperation = 'source-atop';
  const vg = x.createLinearGradient(0, 22, 0, 112);
  vg.addColorStop(0.00, hi);
  vg.addColorStop(0.16, md);
  vg.addColorStop(0.60, md);
  vg.addColorStop(1.00, lo);
  x.fillStyle = vg;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'source-over';

  PUFF[key] = s;
  return s;
}

export function cloudBank(c, y, h, tt, tint, alpha) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004) return;
  const T = tint || [150, 170, 220];
  tt = tt || 0;
  const sp = puffSprite(T);

  c.save();

  /* soft haze band underneath ties the lobes into one air mass, and
     stops the bank from reading as objects floating on a clean sky */
  const md = (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0);
  const bg = lg(c, 'cb.' + (y | 0) + '.' + (h | 0) + '.' + md, 0, y - h * 0.9, 0, y + h * 0.9, [
    [0.00, 'rgba(' + md + ',0)'],
    [0.46, 'rgba(' + md + ',0.26)'],
    [1.00, 'rgba(' + (T[0] * 0.34 | 0) + ',' + (T[1] * 0.30 | 0) + ',' + (T[2] * 0.46 | 0) + ',0)']
  ]);
  c.globalAlpha = alpha;
  c.fillStyle = bg;
  c.fillRect(0, y - h * 0.9, VW, h * 1.8);

  const span = VW * 1.3;
  for (let i = 0; i < CB_N; i++) {
    const o = CB[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h * (0.62 + o.l * 0.26);
    const rx = r * o.wide;
    /* back layer sits further off and reads thinner through the air */
    c.globalAlpha = alpha * (0.80 + o.l * 0.10);
    c.save();
    c.translate(px, y + o.y * h);
    if (o.rot) c.rotate(o.rot);
    c.drawImage(sp, -rx * 1.42, -r * o.sq * 1.42, rx * 2.84, r * o.sq * 2.84);
    c.restore();
  }

  c.globalAlpha = 1;
  c.restore();
}
