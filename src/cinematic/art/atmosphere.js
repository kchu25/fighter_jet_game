/* ===== cinematic/art/atmosphere.js — background set dressing =====
   cloudBank(c, y, h, tt, tint, alpha): stylised vector cloud band, full
   1600 wide.  Lobe layout is generated once into module scope and the
   lobe itself is a cached, feathered, top-lit sprite, so a frame is
   ~60 drawImage blits and a couple of cached gradients — and,
   critically, no hard elliptical edges for the eye to catch on. */
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
      /* Drift: the SPREAD between layer speeds is the depth cue.  The
         old 5/14/23 px/s was close enough that the band still slid as
         one sheet; 4/15/26 is far enough apart that the eye locks onto
         three separate planes shearing over each other. */
      sp: 4 + layer * 11,
      ph: hash(i * 3.3 + 40) * TAU              // private bob phase
    });
  }
  a.sort(function (p, q) { return p.l - q.l; }); // back layer first
  return a;
})();

/* Fringe wisps: a second, sparser field of very flat, very faint lobes
   pushed past the band's own vertical extent.  They exist purely so
   the crest and the base dissolve into sky instead of ending — the
   band proper can then stay dense without ever showing a top line.
   Alternating entries go above / below so neither edge gets them all. */
const WSP = (function () {
  const a = [];
  for (let i = 0; i < 14; i++) {
    const top = (i & 1) === 0;
    a.push({
      x: hash(i * 3.91 + 31) * 1.30 - 0.15,
      y: top ? -(0.56 + hash(i * 7.3 + 3) * 0.30)
        : (0.54 + hash(i * 9.1 + 7) * 0.26),
      r: 0.16 + hash(i * 5.77 + 11) * 0.22,
      wide: 2.2 + hash(i * 6.3 + 19) * 1.6,      // extra-long streaks
      sq: 0.05 + hash(i * 4.9 + 23) * 0.05,      // near-flat
      /* crest wisps outrun the deck a little (wind shear at the top of
         the layer), base wisps lag it — free extra parallax */
      sp: top ? 10 + hash(i * 1.7 + 27) * 12 : 6 + hash(i * 2.9 + 35) * 8,
      a: 0.20 + hash(i * 2.3 + 29) * 0.20,
      top: top
    });
  }
  return a;
})();

/* ---- the lobe sprite, one per tint and depth (there are three tints
   in the whole cinematic, so this cache never grows past a handful of
   entries even with the deep variant doubling it) ---- */
export const PUFF = {};
export function puffSprite(T, deep) {
  const key = (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0) + (deep ? ':d' : '');
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
     mass we just built.  Dawn logic: the crest faces the low sun so it
     leans WARM — red climbs while blue is held back — and the belly
     sees only sky, so red collapses while blue survives.  That
     warm-over-cool split is the entire "dawn stratus" read, and both
     ends stay derived from the caller's tint, so a violet bank shades
     violet-rose rather than going generically orange.  The deep
     variant is the same cloud a few kilometres further into the haze:
     darker, bluer, crest nearly extinguished — the back layer uses it
     so depth arrives as COLOUR, not just as alpha. */
  const F = Math.min, m = deep ? 0.68 : 1, w = deep ? 0.30 : 1,
    bb = deep ? 1.14 : 1;
  const hi = 'rgb(' + (F(255, (T[0] * 1.22 + 74 * w) * m) | 0) + ',' +
    (F(255, (T[1] * 1.08 + 42 * w) * m) | 0) + ',' +
    (F(255, (T[2] * 0.90 + 30 * w) * m * bb) | 0) + ')';
  const md = 'rgb(' + (T[0] * m | 0) + ',' + (T[1] * m | 0) + ',' +
    (F(255, T[2] * m * bb) | 0) + ')';
  const lo = 'rgb(' + (T[0] * 0.24 * m | 0) + ',' + (T[1] * 0.26 * m | 0) + ',' +
    (F(255, T[2] * 0.52 * m * bb) | 0) + ')';
  x.globalCompositeOperation = 'source-atop';
  const vg = x.createLinearGradient(0, 22, 0, 112);
  vg.addColorStop(0.00, hi);
  vg.addColorStop(0.16, md);
  vg.addColorStop(0.60, md);
  vg.addColorStop(1.00, lo);
  x.fillStyle = vg;
  x.fillRect(0, 0, 128, 128);
  /* the crest kiss: a near-horizontal sun only grazes the top few
     pixels of the deck, and that one hot thread sells "dawn" harder
     than any amount of body colour.  Still source-atop, so it stays
     inside the vapour mass and feathers out with it. */
  const cg = x.createLinearGradient(0, 18, 0, 54);
  cg.addColorStop(0, 'rgba(' + (F(255, T[0] * 0.50 + 168) | 0) + ',' +
    (F(255, T[1] * 0.44 + 122) | 0) + ',' + (F(255, T[2] * 0.36 + 66) | 0) +
    ',' + (deep ? 0.16 : 0.40) + ')');
  cg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = cg;
  x.fillRect(0, 0, 128, 64);
  x.globalCompositeOperation = 'source-over';

  PUFF[key] = s;
  return s;
}

export function cloudBank(c, y, h, tt, tint, alpha) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004) return;
  const T = tint || [150, 170, 220];
  tt = tt || 0;
  const sp = puffSprite(T), spd = puffSprite(T, 1);

  c.save();

  /* soft haze band underneath ties the lobes into one air mass, and
     stops the bank from reading as objects floating on a clean sky */
  const md = (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0);
  /* Paint the haze band through a translate/scale so its gradient
     lives in a normalised space and is cached ONCE per tint.  Linear
     gradients resolve in paint-time user space, so this is exact —
     whereas keying on (y|0)/(h|0) minted a fresh CanvasGradient
     nearly every frame while scene4/scene5 pan the horizon, and every
     one of them stayed in the per-context cache forever. */
  const bg = lg(c, 'cb.' + md, 0, -0.9, 0, 0.9, [
    [0.00, 'rgba(' + md + ',0)'],
    [0.46, 'rgba(' + md + ',0.26)'],
    [1.00, 'rgba(' + (T[0] * 0.34 | 0) + ',' + (T[1] * 0.30 | 0) + ',' + (T[2] * 0.46 | 0) + ',0)']
  ]);
  c.globalAlpha = alpha;
  c.save();
  c.translate(0, y);
  c.scale(1, h);
  c.fillStyle = bg;
  c.fillRect(0, -0.9, VW, 1.8);
  c.restore();

  const span = VW * 1.3;

  /* fringe wisps go down FIRST: the dense lobes then overpaint their
     roots and only the escaping tails survive, which is exactly the
     "vapour bleeding off the deck" silhouette we want.  Crest wisps
     use the lit sprite (they are the top of the cloud catching sun),
     base wisps the deep one (they hang in the band's own shadow). */
  for (let i = 0; i < WSP.length; i++) {
    const o = WSP[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h, rx = r * o.wide;
    c.globalAlpha = alpha * o.a;
    c.save();
    c.translate(px, y + o.y * h);
    c.drawImage(o.top ? sp : spd, -rx * 1.42, -r * o.sq * 1.42, rx * 2.84, r * o.sq * 2.84);
    c.restore();
  }

  for (let i = 0; i < CB_N; i++) {
    const o = CB[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h * (0.62 + o.l * 0.26);
    const rx = r * o.wide;
    /* each lobe also bobs a couple of px on a private clock, faster
       and larger toward the front, so the three planes shear against
       each other vertically even when a scene passes a very slow tt */
    const by = Math.sin(tt * (0.22 + o.l * 0.11) + o.ph) * h * (0.016 + o.l * 0.008);
    /* back layer sits further off and reads thinner through the air —
       and swaps to the deep sprite, so it recedes in hue as well */
    c.globalAlpha = alpha * (0.80 + o.l * 0.10);
    c.save();
    c.translate(px, y + o.y * h + by);
    if (o.rot) c.rotate(o.rot);
    c.drawImage(o.l === 0 ? spd : sp, -rx * 1.42, -r * o.sq * 1.42, rx * 2.84, r * o.sq * 2.84);
    c.restore();
  }

  /* ---- god rays.  The sun in every scene that stacks these banks
     sits a few degrees behind the crest, so any notch in the deck
     leaks a shaft.  Three long soft wedges, additive, sliding at the
     FRONT layer's drift rate so each leak stays glued to the gap that
     casts it, fanning away from screen centre for cheap perspective,
     and each breathing on its own slow clock so they read as weather
     rather than as a fixed transparency stamped over the sky. */
  const wr = (Math.min(255, T[0] * 0.55 + 150) | 0) + ',' +
    (Math.min(255, T[1] * 0.48 + 118) | 0) + ',' +
    (Math.min(255, T[2] * 0.40 + 72) | 0);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    let px = (hash(k * 9.7 + 51) * span + tt * 26) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const br = 0.5 + 0.5 * Math.sin(tt * 0.21 + k * 2.61);
    const ra = alpha * (0.04 + 0.10 * br);
    if (ra <= 0.006) continue;
    const w0 = h * (0.42 + hash(k * 3.1 + 57) * 0.42);
    const ln = h * (2.5 + hash(k * 7.7 + 61) * 1.4);
    /* skew the far end away from centre; clamped so an edge-of-frame
       shaft slants instead of smearing horizontal */
    let sk = (px - 800) * 0.24;
    if (sk > h * 1.5) sk = h * 1.5; else if (sk < -h * 1.5) sk = -h * 1.5;
    sk /= w0;
    c.globalAlpha = ra;
    c.save();
    /* same normalised-space trick as the haze band: one cached
       gradient per tint serves every shaft at every size forever */
    c.translate(px, y + h * 0.12);
    c.scale(w0, ln);
    c.fillStyle = lg(c, 'cb.ray.' + md, 0, 0, 0, 1, [
      [0.00, 'rgba(' + wr + ',0.9)'],
      [0.55, 'rgba(' + wr + ',0.32)'],
      [1.00, 'rgba(' + wr + ',0)']
    ]);
    c.beginPath();
    c.moveTo(-0.5, 0); c.lineTo(0.5, 0);
    c.lineTo(1.30 + sk, 1); c.lineTo(-1.30 + sk, 1);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.restore();

  c.globalAlpha = 1;
  c.restore();
}
