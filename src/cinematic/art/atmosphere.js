/* ===== cinematic/art/atmosphere.js — background set dressing =====
   cloudBank(c, y, h, tt, tint, alpha): cheap stylised vector cloud
   band, full 1600 wide, lobe layout generated once into module scope.
   crowd(c, cx, y, w, scale, tt, alpha): distant skyline of
   heads-and-shoulders silhouettes, layout precomputed once. */
import { rgba, sat, path, hash, lg, TAU, VW } from './helpers.js';

/* ==================================================================
   8. CLOUD BANK — cheap stylised vector cloud band, full 1600 wide.
   Lobe layout is generated once into module scope and reused, so a
   frame is just ~90 ellipse fills and one cached gradient.
   ================================================================== */
export const CB_N = 30;
export const CB = (function () {
  const a = [];
  for (let i = 0; i < CB_N; i++) {
    const layer = i % 3;                        // 0 back .. 2 front
    a.push({
      x: hash(i * 1.37) * 1.30 - 0.15,          // normalised
      y: (hash(i * 2.71 + 4) - 0.5) * 0.60,     // about the band centre
      r: 0.30 + hash(i * 4.13 + 9) * 0.52,      // vs h
      l: layer,
      sp: 5 + layer * 9                         // px/sec drift
    });
  }
  a.sort(function (p, q) { return p.l - q.l; }); // back layer first
  return a;
})();

export function cloudBank(c, y, h, tt, tint, alpha) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004) return;
  const T = tint || [150, 170, 220];
  tt = tt || 0;

  /* three tonal values from the tint: lit crest, body, shadowed base */
  const hi = 'rgb(' + Math.min(255, T[0] * 1.35 + 42 | 0) + ',' +
    Math.min(255, T[1] * 1.35 + 42 | 0) + ',' + Math.min(255, T[2] * 1.30 + 46 | 0) + ')';
  const md = 'rgb(' + (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0) + ')';
  const lo = 'rgb(' + (T[0] * 0.44 | 0) + ',' + (T[1] * 0.42 | 0) + ',' + (T[2] * 0.55 | 0) + ')';

  c.save();
  c.globalAlpha = alpha;

  /* soft haze band underneath ties the lobes together */
  const bg = lg(c, 'cb.' + (y | 0) + '.' + (h | 0) + '.' + md, 0, y - h * 0.5, 0, y + h * 0.5, [
    [0.00, 'rgba(' + (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0) + ',0)'],
    [0.42, 'rgba(' + (T[0] | 0) + ',' + (T[1] | 0) + ',' + (T[2] | 0) + ',0.30)'],
    [1.00, 'rgba(' + (T[0] * 0.44 | 0) + ',' + (T[1] * 0.42 | 0) + ',' + (T[2] * 0.55 | 0) + ',0.12)']
  ]);
  c.fillStyle = bg;
  c.fillRect(0, y - h * 0.5, VW, h);

  const span = VW * 1.3;
  /* pass 1: shadowed undersides */
  c.fillStyle = lo;
  for (let i = 0; i < CB_N; i++) {
    const o = CB[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h * (0.55 + o.l * 0.24);
    c.beginPath();
    c.ellipse(px, y + o.y * h + r * 0.30, r * 1.32, r * 0.72, 0, 0, TAU);
    c.fill();
  }
  /* pass 2: bodies */
  c.fillStyle = md;
  for (let i = 0; i < CB_N; i++) {
    const o = CB[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h * (0.55 + o.l * 0.24);
    c.beginPath();
    c.ellipse(px, y + o.y * h, r * 1.30, r * 0.68, 0, 0, TAU);
    c.fill();
  }
  /* pass 3: lit upper edges + hot crest */
  c.fillStyle = hi;
  for (let i = 0; i < CB_N; i++) {
    const o = CB[i];
    let px = (o.x * span + tt * o.sp) % span;
    if (px < 0) px += span;
    px -= VW * 0.15;
    const r = o.r * h * (0.55 + o.l * 0.24);
    c.beginPath();
    c.ellipse(px - r * 0.14, y + o.y * h - r * 0.30, r * 1.02, r * 0.44, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(px - r * 0.30, y + o.y * h - r * 0.44, r * 0.52, r * 0.20, -0.18, 0, TAU);
    c.fill();
  }

  c.restore();
}

/* ==================================================================
   CROWD — a distant skyline of heads-and-shoulders, for the "audience"
   angle on the launch: cheap flat dark silhouettes, never more than a
   fill + a couple of curves each.  Layout is precomputed once (like
   the cloud bank above) so a frame is just N path fills.
   ================================================================== */
export const CR_N = 26;
export const CROWD = (function () {
  const a = [];
  for (let i = 0; i < CR_N; i++) {
    a.push({
      x: hash(i * 3.1 + 1) - 0.5,               // normalised -0.5..0.5
      hgt: 0.62 + hash(i * 5.3 + 2) * 0.55,      // vs row scale
      hw: 0.42 + hash(i * 7.7 + 3) * 0.30,
      row: i % 3,                                // 0 back .. 2 front (bigger, lower)
      ph: hash(i * 2.3 + 4) * TAU                // a little head-bob variance
    });
  }
  return a;
})();
export function crowd(c, cx, y, w, scale, tt, alpha) {
  alpha = alpha == null ? 1 : sat(alpha);
  if (alpha <= 0.004) return;
  c.save();
  for (let i = 0; i < CR_N; i++) {
    const p = CROWD[i];
    const rowY = y + p.row * scale * 0.34;
    const rowS = scale * (0.78 + p.row * 0.20);
    const bob = tt ? Math.sin(tt * 0.6 + p.ph) * scale * 0.02 : 0;
    const x = cx + p.x * w;
    const hw = p.hw * rowS, hgt = p.hgt * rowS;
    c.globalAlpha = alpha * (0.72 + p.row * 0.14);
    c.fillStyle = '#04050a';
    c.beginPath();
    c.moveTo(x - hw, rowY + bob);
    c.quadraticCurveTo(x - hw * 1.1, rowY - hgt * 0.58 + bob, x - hw * 0.46, rowY - hgt * 0.66 + bob);
    c.lineTo(x + hw * 0.46, rowY - hgt * 0.66 + bob);
    c.quadraticCurveTo(x + hw * 1.1, rowY - hgt * 0.58 + bob, x + hw, rowY + bob);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(x, rowY - hgt * 0.66 - hw * 0.58 + bob, hw * 0.58, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
}
