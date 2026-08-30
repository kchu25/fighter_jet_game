/* ===== cinematic/art/helpers.js — shared canvas drawing primitives =====
   Small stateless-ish 2D canvas helpers (path building, radial/linear
   gradient caching, additive glow sprites) plus the named colour palette
   shared by every art module below. */

export const TAU = Math.PI * 2;
export const VW = 1600;

/* ------------------------------------------------------------ util */
export function rgba(k, a) {
  return 'rgba(' + (k[0] | 0) + ',' + (k[1] | 0) + ',' + (k[2] | 0) + ',' + a + ')';
}
export function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function mix(a, b, t) { return a + (b - a) * t; }

/* Build a closed path from a flat [x0,y0,x1,y1,...] array. */
export function path(c, p) {
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.closePath();
}
export function fillP(c, p, st) { path(c, p); c.fillStyle = st; c.fill(); }
export function strokeP(c, p, st, w) { path(c, p); c.strokeStyle = st; c.lineWidth = w; c.stroke(); }
export function seg(c, x0, y0, x1, y1, st, w) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
  c.strokeStyle = st; c.lineWidth = w == null ? 1 : w; c.stroke();
}
export function disc(c, x, y, r, st) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = st; c.fill();
}
export function ring(c, x, y, r, st, w) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = st; c.lineWidth = w; c.stroke();
}
export function ell(c, x, y, rx, ry, st) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = st; c.fill();
}

/* Deterministic hash noise — no Math.random anywhere, so every frame
   is reproducible from tt alone. */
export function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
/* smooth 1-D value noise */
export function noise(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return mix(hash(i), hash(i + 1), u);
}

/* --------------------------------------------------- gradient cache
   CanvasGradient coordinates are resolved in the user space that is
   current when the gradient is *painted*, not when it is created.
   Because every routine draws in a fixed local coordinate frame we
   can build each gradient once and reuse it forever. Keyed per
   context so multiple canvases never collide. */
export const gcache = typeof WeakMap === 'function' ? new WeakMap() : null;
export const gfallback = {};
export function bucket(c) {
  if (!gcache) return gfallback;
  let m = gcache.get(c);
  if (!m) { m = {}; gcache.set(c, m); }
  return m;
}
export function lg(c, key, x0, y0, x1, y1, stops) {
  const m = bucket(c);
  let g = m[key];
  if (g) return g;
  g = c.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  m[key] = g;
  return g;
}
export function rg(c, key, x0, y0, r0, x1, y1, r1, stops) {
  const m = bucket(c);
  let g = m[key];
  if (g) return g;
  g = c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  m[key] = g;
  return g;
}

/* ------------------------------------------------- glow sprites
   One 96px radial sprite per colour, built lazily on first use and
   then reused for the life of the page. Never allocated per frame. */
export const sprites = {};
export function glowSprite(k) {
  const key = (k[0] | 0) + ',' + (k[1] | 0) + ',' + (k[2] | 0);
  let s = sprites[key];
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 96;
  const x = s.getContext('2d');
  const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
  g.addColorStop(0.00, 'rgba(' + key + ',1)');
  g.addColorStop(0.18, 'rgba(' + key + ',0.72)');
  g.addColorStop(0.45, 'rgba(' + key + ',0.26)');
  g.addColorStop(1.00, 'rgba(' + key + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 96, 96);
  sprites[key] = s;
  return s;
}
/* additive soft blob; caller is responsible for composite mode */
export function blob(c, x, y, r, col, a) {
  if (a <= 0.004 || r <= 0) return;
  c.globalAlpha = a > 1 ? 1 : a;
  c.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

/* palette */
export const CY = [58, 224, 255], WH = [255, 255, 255], MG = [255, 60, 240],
  VI = [176, 84, 255], AM = [255, 186, 96], OR = [255, 122, 40];

