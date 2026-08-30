/* ===== world/scenery.js — desert scenery module =====
   Streaming ground: dunes, mesas, a meandering dry wash, and scattered ruins
   that recycle on a fixed world period so the world runs forever.

   Frame matches the rest of the game: +X right, +Y up, +Z forward.
   Every mesh is non-indexed triangles, 9 floats/vertex (pos, normal, colour),
   built to sit on y = 0 and translated down to GROUND_Y at draw time.

   Deliberate circular import with render/scene-draw.js (which imports
   SCENERY back): safe for the same reason as main.js/update.js — draw()
   only reaches litBegin/litDraw/sprPointers/vp from inside its own body,
   at call time, long after both modules have finished evaluating. */
import { mesh, upload, gl, Plit, Pspr, attribs } from '../render/gl.js';
import { litBegin, litDraw, sprPointers, vp } from '../render/scene-draw.js';
import { M4, compose } from '../core/mat4.js';
import { S, GROUND_Y, FOG_NEAR, FOG_FAR } from '../game/state.js';

"use strict";

var TAU = Math.PI * 2;
var abs = Math.abs, sin = Math.sin, cos = Math.cos, exp = Math.exp,
    flr = Math.floor, pow = Math.pow, sqrt = Math.sqrt;

/* ---------------------------------------------------------------- tuning */
var L      = 16000;  // world period: terrain AND ruins repeat every L units
var BAND   = 800;    // z-length of one terrain band mesh
var NB     = L / BAND;
var ZSTEP  = 100;    // terrain z resolution
var BASE   = 40;     // nominal desert floor, above GROUND_Y
var FLOORY = 6;      // hard floor: never dip below GROUND_Y+6 (buries the old grid)
var ZNEAR  = -700;   // draw window
var ZFAR   = 3600;   // (FOG_FAR is 3300, so anything past here is pure fog)
var XMAX   = 4800;   // terrain half-width
var DP     = 1400;   // dust recycle period

export function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lp(a, b, t) { return a + (b - a) * t; }
export function ss(a, b, x) { var t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function sh(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

/* -------------------------------------------------------- hash / noise */
export function ih(a, b, s) {
  var n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}
/* value noise, exactly periodic in z with period L (cell must divide L) */
export function vn(x, z, cell, s) {
  var nz = L / cell;
  var fx = x / cell, fz = z / cell;
  var ix = flr(fx), iz = flr(fz);
  var tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  var z0 = ((iz % nz) + nz) % nz, z1 = ((iz + 1) % nz + nz) % nz;
  return lp(lp(ih(ix, z0, s), ih(ix + 1, z0, s), tx),
            lp(ih(ix, z1, s), ih(ix + 1, z1, s), tx), tz);
}
/* z frequencies must be integer multiples of TAU/L or the wrap pops */
export function zk(approx) { return Math.round(L * approx / TAU) * TAU / L; }
var RIP_Z = zk(0.034);      // fine corrugation
var DUNE_Z = zk(0.0126);    // transverse dune crests, ~500u apart
var DUNE_Z2 = zk(0.0062);   // long swells, ~1000u apart
/* tone-drift frequencies: exact integer multiples of TAU/L, so the palette
   bands wrap seamlessly at the world period like everything else */
var TONE1 = TAU / L, TONE2 = 2 * TAU / L;

/* -------------------------------------------------------------- terrain */
/* height above GROUND_Y at a world (x, z). z is taken modulo L implicitly. */
export function terr(x, z) {
  /* the flight corridor stays low — the player owns |x| < 190 and can dive
     to GROUND_Y+120, so relief ramps in fast just outside the lane */
  var corr = ss(190, 520, abs(x));
  var corr2 = ss(320, 1100, abs(x));

  var big = vn(x, z, 2000, 11);
  var mid = vn(x, z,  800, 23);
  var fin = vn(x, z,  400, 37);
  var mic = vn(x, z,  200, 53);
  var dune = big * 0.50 + mid * 0.30 + fin * 0.14 + mic * 0.06;

  /* rolling dunes */
  var h = (dune - 0.30) * 340 * corr;

  /* mesas: a hard terrace on the low band gives flat tops + steep risers */
  var m = ss(0.52, 0.62, big * 0.70 + mid * 0.30);
  h += m * (230 + 300 * vn(x + 930, z + 410, 2000, 5)) * corr2;

  /* ridged erosion gullies cut into the flanks */
  var rg = 1 - abs(2 * fin - 1);
  h += rg * rg * 70 * corr2;

  /* transverse dune crests. These run across the flight path and are the
     single biggest speed cue: at FLOW they sweep under you ~2/sec. Kept
     inside the player's dive envelope so the lane is always flyable. */
  h += sin(z * DUNE_Z + x * 0.0016 + big * 5) * 20;
  h += sin(z * DUNE_Z2 - x * 0.0009 + mid * 4) * (14 + 30 * corr);

  /* wind ripple — the fine corrugation on top */
  h += (sin(x * 0.031 + big * 13) + sin(x * 0.017 - mid * 9)) * 5.0 * (0.35 + 0.65 * corr);
  h += sin(z * RIP_Z + mid * 9) * 4.0;

  /* a dry wash meandering across the whole corridor */
  var rx = 980 * sin(z / L * TAU * 3)
         + 430 * sin(z / L * TAU * 7 + 1.3)
         + 250 * sin(z / L * TAU * 11 + 2.7);
  var d = (x - rx) / 230, ad = abs(d);
  h -= 70 * exp(-d * d);
  h += 30 * exp(-(ad - 1.5) * (ad - 1.5) * 2.6) * (0.35 + 0.65 * corr);

  return h;
}
/* clamped surface height above GROUND_Y */
export function gy(x, z) { var h = BASE + terr(x, z); return h < FLOORY ? FLOORY : h; }

/* non-uniform x columns: dense down the middle, coarse toward the horizon */
var XS = (function () {
  var a = [], n = 12, i, t;
  for (i = n; i > 0; i--) { t = i / n; a.push(-XMAX * pow(t, 1.9)); }
  a.push(0);
  for (i = 1; i <= n; i++) { t = i / n; a.push(XMAX * pow(t, 1.9)); }
  return a;
})();

export function sandCol(h, slope, x, z) {
  var t = cl(h / 300, 0, 1);
  var r = lp(0.62, 0.78, t), g = lp(0.34, 0.49, t), b = lp(0.20, 0.30, t);

  /* patchy ground cover: gravel fields, blown sand, scorched rock. Without
     this the whole desert reads as one flat mass no matter how it is lit. */
  var p1 = vn(x, z, 1600, 71), p2 = vn(x, z, 400, 73);
  var gv = ss(0.42, 0.72, p1 * 0.72 + p2 * 0.28);
  r = lp(r, 0.35, gv * 0.7); g = lp(g, 0.21, gv * 0.7); b = lp(b, 0.17, gv * 0.7);
  var pale = ss(0.40, 0.16, p1 * 0.55 + p2 * 0.45);
  r = lp(r, 0.80, pale * 0.5); g = lp(g, 0.58, pale * 0.5); b = lp(b, 0.40, pale * 0.5);

  /* steep faces: dark wind-scoured rock */
  var s = cl(slope, 0, 1) * 0.85;
  r = lp(r, 0.29, s); g = lp(g, 0.145, s); b = lp(b, 0.125, s);
  /* sedimentary strata, only where there is a riser to show them on */
  if (slope > 0.30) { var bd = (flr(h / 30) & 1) ? 0.84 : 1.12; r *= bd; g *= bd; b *= bd; }

  /* bleached pan / dry wash floor — a pale ribbon snaking past */
  var w = ss(30, 6, h);
  r = lp(r, 0.80, w); g = lp(g, 0.66, w); b = lp(b, 0.55, w);

  /* long-wavelength tone drift: whole stretches of the run lean rusty-warm,
     then ashen-cool, then back, on the full world period. Multiplicative and
     centred on 1 so nothing brightens — it only tilts the existing palette. */
  var b1 = sin(z * TONE1 + 1.7), b2 = sin(z * TONE2 + 4.2);
  var wv = 0.06 * b1;
  r *= 1 + wv; g *= 1 + wv * 0.25; b *= 1 - wv;
  var ash = ss(0.55, 0.95, 0.5 + 0.5 * b2) * 0.32;
  var mn = (r + g + b) * 0.31;
  r = lp(r, mn, ash); g = lp(g, mn, ash); b = lp(b, mn * 1.12, ash);

  var j = 0.94 + 0.12 * ih(flr(x / 37), flr(z / 41), 91);
  return [r * j, g * j, b * j];
}

/* --------------------------------------------------------- mesh builder */
export function MB() {
  var d = [], m = {};
  m.d = d;
  m.tri = function (a, b, c, col) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var l = sqrt(nx * nx + ny * ny + nz * nz);
    if (!(l > 1e-7)) return m;
    nx /= l; ny /= l; nz /= l;
    d.push(a[0], a[1], a[2], nx, ny, nz, col[0], col[1], col[2]);
    d.push(b[0], b[1], b[2], nx, ny, nz, col[0], col[1], col[2]);
    d.push(c[0], c[1], c[2], nx, ny, nz, col[0], col[1], col[2]);
    return m;
  };
  m.quad = function (a, b, c, e, col) { m.tri(a, b, c, col); m.tri(a, c, e, col); return m; };
  /* loft two closed loops, alternating value so facets read individually */
  m.skin = function (A, B, col, k) {
    var alt = sh(col, k === undefined ? 0.80 : k);
    for (var i = 0; i < A.length; i++) {
      var j = (i + 1) % A.length;
      m.quad(A[i], A[j], B[j], B[i], (i & 1) ? alt : col);
    }
    return m;
  };
  m.cap = function (loop, col, lift) {
    var cx = 0, cy = 0, cz = 0, n = loop.length, i;
    for (i = 0; i < n; i++) { cx += loop[i][0]; cy += loop[i][1]; cz += loop[i][2]; }
    var c = [cx / n, cy / n + (lift || 0), cz / n];
    for (i = 0; i < n; i++) m.tri(loop[i], loop[(i + 1) % n], c, col);
    return m;
  };
  /* box with yaw (ry) then roll (rz), centred at c */
  m.box = function (cx, cy, cz, hx, hy, hz, ry, rz, col) {
    var cy2 = cos(ry), sy2 = sin(ry), cz2 = cos(rz), sz2 = sin(rz);
    var S = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
             [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    var P = [], i;
    for (i = 0; i < 8; i++) {
      var x = S[i][0] * hx, y = S[i][1] * hy, z = S[i][2] * hz;
      var x1 = x * cz2 - y * sz2, y1 = x * sz2 + y * cz2;
      P.push([cx + x1 * cy2 + z * sy2, cy + y1, cz - x1 * sy2 + z * cy2]);
    }
    var lo = sh(col, 0.52), sd = sh(col, 0.78), tp = sh(col, 1.16);
    m.quad(P[4], P[5], P[6], P[7], sd);
    m.quad(P[1], P[0], P[3], P[2], sd);
    m.quad(P[5], P[1], P[2], P[6], col);
    m.quad(P[0], P[4], P[7], P[3], col);
    m.quad(P[7], P[6], P[2], P[3], tp);
    m.quad(P[0], P[1], P[5], P[4], lo);
    return m;
  };
  return m;
}
export function ringN(n, r, y, jit, sd, sq) {
  var o = [], i, a, rr;
  for (i = 0; i < n; i++) {
    a = i / n * TAU;
    rr = r * (1 + (jit || 0) * (ih(i, 3, sd) - 0.5) / 50);
    o.push([cos(a) * rr, y + (sq ? (ih(i, 7, sd) - 0.5) * jit * 2 : 0), sin(a) * rr]);
  }
  return o;
}

/* ------------------------------------------------------------- palettes */
var STONE = [0.47, 0.43, 0.39], STONE2 = [0.37, 0.33, 0.30], STONE3 = [0.57, 0.52, 0.46];
var DARKS = [0.17, 0.15, 0.15], RUST = [0.44, 0.22, 0.13];
var METAL = [0.30, 0.31, 0.36], METAL2 = [0.19, 0.20, 0.25];
var NEON = [0.10, 0.80, 0.98], NEONM = [0.82, 0.14, 0.60];
var ROCK = [0.44, 0.27, 0.18], ROCK2 = [0.33, 0.19, 0.14], ROCK3 = [0.55, 0.36, 0.24];

/* ------------------------------------------------------------ ruin protos
   Each returns {d:floats, rad:footprint radius, h:height}. Base sits on y=0. */

export function pTower() {                 /* broken masonry tower */
  var M = MB(), n = 8, sd = 7, i, s;
  var rings = [], y = 0, r = 54;
  for (s = 0; s < 6; s++) { rings.push(ringN(n, r, y, s ? 9 : 0, sd * 13 + s)); y += 46 + 5 * s; r *= 0.905; }
  for (s = 0; s < rings.length - 1; s++) M.skin(rings[s], rings[s + 1], s & 1 ? STONE : STONE2, 0.82);
  var top = rings[rings.length - 1], jag = [];
  for (i = 0; i < n; i++) {
    var q = ih(i, 4, sd); q = q * q * 2.4;
    jag.push([top[i][0] * 0.93, top[i][1] + 6 + 42 * q, top[i][2] * 0.93]);
  }
  M.skin(top, jag, STONE3, 0.75);
  M.cap(jag, DARKS, -14);
  /* collapsed slabs heaped round the foot */
  for (i = 0; i < 5; i++) {
    var a = ih(i, 21, sd) * TAU, rr = 58 + 44 * ih(i, 22, sd);
    M.box(cos(a) * rr, 8 + 10 * ih(i, 23, sd), sin(a) * rr,
          22 + 16 * ih(i, 24, sd), 9, 14 + 12 * ih(i, 25, sd),
          a, (ih(i, 26, sd) - 0.5) * 0.9, i & 1 ? STONE2 : STONE);
  }
  /* one surviving light strip — the only neon on the thing */
  M.box(0, 150, 50, 3, 96, 3, 0, 0, NEON);
  return { d: M.d, rad: 104, h: 320 };
}

export function pArch() {                  /* half-collapsed arch */
  var M = MB(), i;
  M.box(-76, 100, 0, 20, 100, 26, 0, 0.05, STONE);
  M.box(76, 96, 0, 20, 96, 26, 0, -0.04, STONE2);
  /* span, broken away on one side */
  var seg = [[-64, 196, 0.28], [-34, 224, 0.5], [4, 234, 0.05], [40, 222, -0.42]];
  for (i = 0; i < seg.length; i++)
    M.box(seg[i][0], seg[i][1], 0, 24, 15, 24, 0, seg[i][2], i & 1 ? STONE3 : STONE);
  /* the fallen keystone, half in the sand */
  M.box(128, 12, 42, 30, 16, 22, 0.7, 0.3, STONE2);
  M.box(-118, 9, -36, 24, 12, 20, -0.4, 0.18, STONE2);
  return { d: M.d, rad: 150, h: 250 };
}

export function pWall() {                  /* shattered curtain wall, runs along z */
  var M = MB(), i;
  var hgt = [120, 96, 0, 78, 132, 110, 0, 64, 88, 118];
  for (i = 0; i < hgt.length; i++) {
    if (!hgt[i]) continue;
    var h = hgt[i] * (0.8 + 0.4 * ih(i, 5, 3));
    M.box(0, h * 0.5, -270 + i * 60, 15, h * 0.5, 29,
          0, (ih(i, 6, 3) - 0.5) * 0.10, i & 1 ? STONE : STONE2);
    if (i % 3 === 0) M.box(26, 26, -270 + i * 60, 14, 26, 18, 0, 0.12, STONE2);
  }
  for (i = 0; i < 6; i++)
    M.box(30 + 40 * ih(i, 8, 3), 7, -240 + 100 * i, 16, 7, 12,
          ih(i, 9, 3) * 3, 0.2, STONE3);
  return { d: M.d, rad: 320, h: 140 };
}

export function pPylon() {                 /* alien lattice mast */
  var M = MB(), i, j;
  var b = 46, t = 13, H = 320;
  var base = [[b, 0, b], [-b, 0, b], [-b, 0, -b], [b, 0, -b]];
  var tip = [[t, H, t], [-t, H, t], [-t, H, -t], [t, H, -t]];
  for (i = 0; i < 4; i++) {
    var p0 = base[i], p1 = tip[i];
    var w0 = 7, w1 = 4;
    M.box((p0[0] + p1[0]) / 2, H / 2, (p0[2] + p1[2]) / 2, w0, H / 2, w0, 0, 0, METAL);
    /* lean the leg outward at the foot */
    M.box(p0[0] * 1.06, 12, p0[2] * 1.06, 12, 12, 12, 0, 0, METAL2);
  }
  for (j = 1; j <= 4; j++) {
    var y = H * j / 5, k = lp(b, t, j / 5);
    M.box(0, y, k, k, 4, 4, 0, 0, METAL2);
    M.box(0, y, -k, k, 4, 4, 0, 0, METAL2);
    M.box(k, y, 0, 4, 4, k, 0, 0, METAL2);
    M.box(-k, y, 0, 4, 4, k, 0, 0, METAL2);
  }
  /* snapped cross-arm + a live beacon */
  M.box(46, H - 22, 0, 52, 5, 7, 0, -0.22, RUST);
  M.box(-24, H - 40, 0, 30, 5, 7, 0, 0.5, RUST);
  M.box(0, H + 12, 0, 8, 12, 8, 0, 0, NEONM);
  return { d: M.d, rad: 96, h: 340 };
}

export function pHulk() {                  /* wrecked transport, nose buried in sand */
  var M = MB(), i, sd = 19;
  var secs = [[-190, 16, 12], [-120, 30, 22], [-40, 42, 32], [50, 40, 30], [130, 28, 20]];
  var loops = [];
  for (i = 0; i < secs.length; i++) {
    var z = secs[i][0], w = secs[i][1], hh = secs[i][2];
    var yy = 26 + i * 13;   /* tail rides up out of the sand */
    loops.push([[w, yy - hh, z], [w * 0.62, yy + hh * 0.9, z], [-w * 0.62, yy + hh * 0.9, z],
                [-w, yy - hh, z], [-w * 0.55, yy - hh * 1.25, z], [w * 0.55, yy - hh * 1.25, z]]);
  }
  for (i = 0; i < loops.length - 1; i++) M.skin(loops[i], loops[i + 1], i & 1 ? METAL : RUST, 0.72);
  M.cap(loops[0], METAL2, -8);
  /* torn-open tail: exposed ribs sticking out of the break */
  var last = loops[loops.length - 1];
  for (i = 0; i < 3; i++) {
    var s = 1 - i * 0.22, zz = 150 + i * 34;
    M.box(0, 78 + i * 10, zz, 30 * s, 3, 4, 0, i * 0.16, METAL2);
    M.box(26 * s, 66 + i * 8, zz, 4, 22 * s, 4, 0, -0.2 - i * 0.1, METAL2);
    M.box(-26 * s, 66 + i * 8, zz, 4, 22 * s, 4, 0, 0.2 + i * 0.1, METAL2);
  }
  /* a strip of hull lights still burning */
  M.box(0, 44, -70, 26, 3, 60, 0, 0, NEON);
  /* sheared-off wing planted in the ground */
  M.box(-96, 44, -30, 8, 62, 46, 0.3, 0.34, RUST);
  return { d: M.d, rad: 230, h: 130 };
}

export function pDish() {                  /* collapsed listening dish */
  var M = MB(), i, n = 12;
  M.box(0, 34, 0, 26, 34, 26, 0, 0, STONE2);
  M.box(0, 76, 0, 12, 24, 12, 0, 0, METAL2);
  /* annulus, tipped over onto its rim */
  var tilt = 1.05, ct = cos(tilt), st = sin(tilt);
  var outer = [], inner = [];
  for (i = 0; i < n; i++) {
    var a = i / n * TAU, ro = 108, ri = 34;
    var x1 = cos(a) * ro, y1 = sin(a) * ro;
    outer.push([x1, 106 + y1 * ct, y1 * st]);
    x1 = cos(a) * ri; y1 = sin(a) * ri;
    inner.push([x1, 106 + y1 * ct, y1 * st - 16]);
  }
  M.skin(outer, inner, METAL, 0.7);
  for (i = 0; i < 4; i++) {
    var a2 = i / 4 * TAU + 0.4;
    M.box(cos(a2) * 60, 106 + sin(a2) * 60 * ct, sin(a2) * 60 * st, 52, 3, 3, 0, a2, METAL2);
  }
  /* a snapped section lying in the dirt */
  M.box(120, 10, 60, 44, 8, 12, 0.9, 0.2, METAL2);
  return { d: M.d, rad: 150, h: 210 };
}

export function pMonolith() {              /* slabs stabbing out of the sand */
  var M = MB(), i, sd = 31;
  var cfg = [[0, 0, 150, 0.10, 0.0], [-58, 30, 96, -0.22, 0.7], [52, -34, 118, 0.30, -0.5],
             [8, 66, 62, 0.12, 2.1]];
  for (i = 0; i < cfg.length; i++)
    M.box(cfg[i][0], cfg[i][2] * 0.46, cfg[i][1], 26 + 10 * ih(i, 1, sd), cfg[i][2] * 0.5, 11,
          cfg[i][4], cfg[i][3], i & 1 ? STONE : STONE3);
  for (i = 0; i < 4; i++)
    M.box(-70 + 50 * i, 6, -60 + 40 * ih(i, 2, sd), 16, 6, 12, ih(i, 3, sd) * 3, 0.1, STONE2);
  return { d: M.d, rad: 110, h: 160 };
}

export function pRubble() {                /* low scatter of blocks */
  var M = MB(), i, sd = 41;
  for (i = 0; i < 8; i++) {
    var a = ih(i, 1, sd) * TAU, r = 20 + 70 * ih(i, 2, sd);
    M.box(cos(a) * r, 6 + 14 * ih(i, 3, sd), sin(a) * r,
          12 + 16 * ih(i, 4, sd), 6 + 12 * ih(i, 5, sd), 10 + 14 * ih(i, 6, sd),
          a * 1.7, (ih(i, 7, sd) - 0.5) * 0.8, i & 1 ? STONE2 : STONE);
  }
  return { d: M.d, rad: 96, h: 30 };
}

export function blob(sd, r, h, n, col, col2, taper) {
  var M = MB(), i, a, rr, o = [], t = [];
  for (i = 0; i < n; i++) {
    a = i / n * TAU;
    rr = r * (0.66 + 0.60 * ih(i, 1, sd));
    o.push([cos(a) * rr, 0, sin(a) * rr]);
    var rt = rr * taper * (0.8 + 0.4 * ih(i, 2, sd));
    t.push([cos(a) * rt, h * (0.72 + 0.5 * ih(i, 3, sd)), sin(a) * rt]);
  }
  M.skin(o, t, col, 0.74);
  M.cap(t, col2, h * 0.1);
  return M;
}
export function pRockA() { var M = blob(51, 46, 40, 6, ROCK, ROCK3, 0.55); return { d: M.d, rad: 70, h: 46 }; }
export function pRockB() { var M = blob(67, 70, 96, 7, ROCK2, ROCK, 0.42); return { d: M.d, rad: 106, h: 106 }; }

export function pSpire() {                 /* wind-carved hoodoo — cheap silhouette */
  var M = MB(), i, n = 6, sd = 73;
  var ys = [0, 60, 130, 205, 280, 350], rs = [46, 30, 40, 22, 30, 12];
  var rings = [];
  for (i = 0; i < ys.length; i++) rings.push(ringN(n, rs[i], ys[i], 14, sd + i, true));
  for (i = 0; i < rings.length - 1; i++) M.skin(rings[i], rings[i + 1], i & 1 ? ROCK : ROCK2, 0.72);
  M.cap(rings[rings.length - 1], ROCK3, 22);
  return { d: M.d, rad: 60, h: 380 };
}

export function pButte() {                 /* big flat-topped mesa for the far field */
  var M = MB(), i, n = 7, sd = 89;
  var skirt = ringN(n, 330, 0, 40, sd, true);
  var mid = ringN(n, 262, 62, 30, sd + 1, true);
  var rimA = ringN(n, 250, 250, 24, sd + 2, true);
  var rimB = ringN(n, 232, 292, 18, sd + 3, true);
  M.skin(skirt, mid, ROCK2, 0.8);
  M.skin(mid, rimA, ROCK, 0.7);
  M.skin(rimA, rimB, ROCK3, 0.8);
  M.cap(rimB, sh(ROCK3, 1.15), 14);
  /* a detached butte-let alongside, for depth */
  var s2 = ringN(6, 120, 0, 30, sd + 9, true), t2 = ringN(6, 96, 170, 20, sd + 10, true);
  for (i = 0; i < 6; i++) { s2[i][0] += 430; s2[i][2] += 210; t2[i][0] += 430; t2[i][2] += 210; }
  M.skin(s2, t2, ROCK2, 0.76);
  M.cap(t2, ROCK, 10);
  return { d: M.d, rad: 560, h: 300 };
}

export function pRockArch() {              /* wind-carved natural rock arch */
  var M = MB(), i, n = 9, sd = 97;
  /* boxes marched along a semicircular arc, rolled to follow the tangent —
     same trick as pArch's span, but rock-hued and left whole */
  for (i = 0; i < n; i++) {
    var t = (i + 0.5) / n, a = t * Math.PI;
    var x = -cos(a) * 168, y = sin(a) * 208;
    var phi = Math.atan2(cos(a) * 208, sin(a) * 168);
    var th = 30 + 28 * (1 - sin(a)) + 8 * (ih(i, 1, sd) - 0.5);
    M.box(x, y, (ih(i, 2, sd) - 0.5) * 16, 44, th, 24 + 14 * (1 - sin(a)),
          0, phi + (ih(i, 3, sd) - 0.5) * 0.14, i & 1 ? ROCK : ROCK2);
  }
  /* buttressed feet + a chunk that already let go */
  var f1 = blob(sd + 1, 60, 44, 5, ROCK2, ROCK, 0.5);
  for (i = 0; i < f1.d.length; i += 9) f1.d[i] -= 168;
  var f2 = blob(sd + 2, 54, 38, 5, ROCK, ROCK3, 0.5);
  for (i = 0; i < f2.d.length; i += 9) f2.d[i] += 168;
  for (i = 0; i < f1.d.length; i++) M.d.push(f1.d[i]);
  for (i = 0; i < f2.d.length; i++) M.d.push(f2.d[i]);
  M.box(74, 9, 88, 22, 11, 16, 0.8, 0.25, ROCK3);
  return { d: M.d, rad: 240, h: 250 };
}

export function pCrash() {                 /* shot-down interceptor, nose in the sand */
  var M = MB(), i, sd = 57;
  /* fuselage loft, tail up out of the gouge it dug on the way in */
  var secs = [[-70, 9, 7], [-20, 16, 12], [34, 20, 14], [86, 15, 11], [128, 9, 8]];
  var loops = [];
  for (i = 0; i < secs.length; i++) {
    var z = secs[i][0], w = secs[i][1], hh = secs[i][2], yy = 4 + i * 12;
    loops.push([[w, yy - hh, z], [w * 0.5, yy + hh, z],
                [-w * 0.5, yy + hh, z], [-w, yy - hh, z]]);
  }
  for (i = 0; i < loops.length - 1; i++) M.skin(loops[i], loops[i + 1], i & 1 ? METAL2 : DARKS, 0.7);
  M.cap(loops[loops.length - 1], RUST, 4);
  /* one wing shorn off and thrown clear, the other planted in the dirt */
  M.box(64, 30, 42, 58, 3, 24, 0.5, 0.24, METAL2);
  M.box(-58, 9, 66, 44, 3, 20, -0.9, -0.12, RUST);
  M.box(0, 56, 116, 3, 22, 15, 0, 0.35, METAL);   /* snapped tail fin */
  /* gouge berms + debris trail leading back to the impact line */
  M.box(30, 5, -160, 10, 6, 110, 0.06, 0.3, ROCK2);
  M.box(-30, 5, -170, 10, 6, 120, -0.05, -0.3, ROCK2);
  for (i = 0; i < 4; i++)
    M.box(-40 + 26 * i, 6, -240 - 60 * i, 8 + 6 * ih(i, 1, sd), 5, 7,
          ih(i, 2, sd) * 3, 0.2, i & 1 ? METAL2 : DARKS);
  /* cockpit strip still faintly live */
  M.box(0, 28, 10, 2, 2, 24, 0, 0, NEONM);
  return { d: M.d, rad: 200, h: 90 };
}

var PROTO_FN = [pTower, pArch, pWall, pPylon, pHulk, pDish, pMonolith,
                pRubble, pRockA, pRockB, pSpire, pButte, pRockArch, pCrash];
var P_TOWER = 0, P_WALL = 2, P_RUBBLE = 7, P_ROCKA = 8, P_ROCKB = 9, P_SPIRE = 10, P_BUTTE = 11,
    P_ARCHR = 12, P_CRASH = 13;

/* ------------------------------------------------------------ placement */
export function lcg(seed) {
  var s = seed >>> 0;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

var protos = null, bands = null, dust = null, spots = null, apron = null, ready = false;
var _m = new Float32Array(16), _mv = new Float32Array(16), _vis = [];
export function ident(o) { o[0] = o[5] = o[10] = o[15] = 1; o[1] = o[2] = o[3] = o[4] = o[6] = o[7] = o[8] = o[9] = o[11] = o[12] = o[13] = o[14] = 0; return o; }

export function makeSpots() {
  var R = lcg(20260829), out = [], z = 0, lastBig = -9999;
  /* small = filler, mid = structures, big = the ones you feel go past,
     far = horizon silhouettes. Gaps are skewed so ruins clump then vanish. */
  var MID = [0, 1, 2, 3, 4, 5, 6, P_CRASH, P_ARCHR];
  var BIG = [0, 3, 4, 10, 6, 1, P_ARCHR, P_CRASH];
  var FIL = [P_RUBBLE, P_ROCKA, P_ROCKB, P_ROCKA, P_SPIRE, P_ROCKA];
  while (z < L - 200) {
    var g = R();
    /* regional clumping: the same gap distribution, squeezed and stretched on
       a long cycle, so ruins come in belts with genuinely empty desert between */
    var dens = 0.72 + 0.56 * ss(0.25, 0.75, 0.5 + 0.5 * sin(z / L * TAU * 2 + 0.9));
    z += (60 + g * g * 900) * dens;
    if (z >= L - 200) break;
    var u = R(), side = R() < 0.5 ? -1 : 1, p, s, x, rad;

    if (u < 0.44) {                                  /* filler scatter */
      p = FIL[(R() * FIL.length) | 0];
      s = 0.55 + R() * 1.05;
      x = side * (200 + pow(R(), 1.6) * 2500);
    } else if (u < 0.70) {                           /* mid-field structure */
      p = MID[(R() * MID.length) | 0];
      s = 0.8 + R() * 0.9;
      rad = protos ? protos[p].rad : 200;
      x = side * (430 + rad * s * 0.5 + R() * 1000);
    } else if (u < 0.82 && z - lastBig > 2300) {     /* close pass */
      lastBig = z;
      p = BIG[(R() * BIG.length) | 0];
      s = 1.35 + R() * 1.25;
      rad = protos ? protos[p].rad : 200;
      x = side * (300 + rad * s + R() * 230);
    } else {                                          /* horizon silhouette */
      p = R() < 0.62 ? P_BUTTE : P_SPIRE;
      s = (p === P_BUTTE ? 1.9 : 2.6) + R() * 2.2;
      x = side * (1250 + R() * 2600);
    }
    /* hard guarantee: nothing tall may reach into the flight envelope
       (|x| <= BX 238 plus the jet's span). Low rubble may sit anywhere. */
    var pp = protos[p];
    var need = (pp.h * s > 110) ? 300 + pp.rad * s : 150;
    if (abs(x) < need) x = side * need;
    out.push({ p: p, x: x, z: z, s: s, y: 0,
               ry: R() * TAU, rx: (R() - 0.5) * 0.05, rz: (R() - 0.5) * 0.05 });
  }
  return out;
}

/* ------------------------------------------------------------------ init */
/* small angular rock, welded straight into the terrain band so the pebble
   field costs no extra draw calls */
export function pebble(M, x, y, z, rr, hh, sd, col) {
  var n = 5, i, a, o = [], t = [];
  var ph = ih(0, 9, sd) * TAU;
  for (i = 0; i < n; i++) {
    a = ph + i / n * TAU;
    var r1 = rr * (0.6 + 0.7 * ih(i, 1, sd));
    o.push([x + cos(a) * r1, y - hh * 0.25, z + sin(a) * r1]);
    var r2 = r1 * (0.35 + 0.4 * ih(i, 2, sd));
    t.push([x + cos(a) * r2, y + hh * (0.6 + 0.6 * ih(i, 3, sd)), z + sin(a) * r2]);
  }
  M.skin(o, t, col, 0.7);
  M.cap(t, sh(col, 1.2), hh * 0.2);
}

export function buildBand(bi) {
  var M = MB(), r, c, z0 = bi * BAND, rows = BAND / ZSTEP;
  var prev = null, cur;
  for (r = 0; r <= rows; r++) {
    var za = z0 + r * ZSTEP;
    cur = [];
    for (c = 0; c < XS.length; c++) cur.push(gy(XS[c], za));
    if (prev) {
      var zl0 = (r - 1) * ZSTEP, zl1 = r * ZSTEP;
      for (c = 0; c < XS.length - 1; c++) {
        var xa = XS[c], xb = XS[c + 1];
        var ha = prev[c], hb = prev[c + 1], hc = cur[c + 1], hd = cur[c];
        var hm = (ha + hb + hc + hd) * 0.25;
        var gx = (hb - ha) / (xb - xa), gz = (hd - ha) / ZSTEP;
        var slope = sqrt(gx * gx + gz * gz) / 1.5;
        M.quad([xa, ha, zl0], [xb, hb, zl0], [xb, hc, zl1], [xa, hd, zl1],
               sandCol(hm, slope, xa, z0 + zl0));
      }
    }
    prev = cur;
  }
  /* pebble / boulder field: near-field clutter is what makes the speed read */
  for (r = 0; r < 12; r++) {
    var sd = bi * 977 + r * 31;
    var side = ih(r, 11, sd) < 0.5 ? -1 : 1;
    var px = side * (200 + pow(ih(r, 12, sd), 1.7) * 1900);
    var pz = ih(r, 13, sd) * BAND;
    var big = ih(r, 14, sd) < 0.22;
    var rr = big ? 46 + 60 * ih(r, 15, sd) : 9 + 26 * ih(r, 15, sd);
    pebble(M, px, gy(px, z0 + pz) - rr * 0.2, pz, rr, rr * (0.8 + 0.9 * ih(r, 16, sd)), sd,
           ih(r, 17, sd) < 0.5 ? ROCK : ROCK2);
  }
  return M.d;
}

export function buildDust(gyBase) {
  var v = [], i, k;
  var R = lcg(778811);
  var mot = [];
  for (i = 0; i < 110; i++)
    mot.push([(R() - 0.5) * 1500, gyBase + 14 + pow(R(), 1.7) * 230, R() * DP,
              3 + R() * 9, R() < 0.22 ? 1 : 0, 0.07 + R() * 0.15]);
  for (k = -1; k < 3; k++) {
    for (i = 0; i < mot.length; i++) {
      var mo = mot[i], x = mo[0], y = mo[1], z = mo[2] + k * DP, sz = mo[3];
      var c = mo[4] ? [0.35, 0.85, 1.0] : [1.0, 0.66, 0.36], a = mo[5];
      v.push(x - sz, y - sz, z, 0, 0, c[0], c[1], c[2], a, 0);
      v.push(x + sz, y - sz, z, 1, 0, c[0], c[1], c[2], a, 0);
      v.push(x + sz, y + sz, z, 1, 1, c[0], c[1], c[2], a, 0);
      v.push(x - sz, y - sz, z, 0, 0, c[0], c[1], c[2], a, 0);
      v.push(x + sz, y + sz, z, 1, 1, c[0], c[1], c[2], a, 0);
      v.push(x - sz, y + sz, z, 0, 1, c[0], c[1], c[2], a, 0);
    }
  }
  var arr = new Float32Array(v);
  return { buf: upload(arr), n: arr.length / 10 };
}

export function init() {
  if (ready) return;
  var i;
  protos = [];
  for (i = 0; i < PROTO_FN.length; i++) {
    var p = PROTO_FN[i]();
    protos.push({ m: mesh(new Float32Array(p.d)), rad: p.rad, h: p.h, tris: p.d.length / 27 });
  }
  spots = makeSpots();
  /* bake each ruin onto the terrain once; sunk a little so none ever floats */
  for (i = 0; i < spots.length; i++)
    spots[i].y = gy(spots[i].x, spots[i].z) - 7 * spots[i].s;
  bands = [];
  for (i = 0; i < NB; i++) bands.push(mesh(new Float32Array(buildBand(i))));

  /* far apron: one dark quad sitting just beyond the last terrain band, to
     close the sliver between the terrain edge and the horizon. Everything it
     covers is past FOG_FAR so it renders as pure haze. Deliberately kept to
     that strip — a full-size ground quad would double the fill rate for
     pixels the terrain overdraws anyway. */
  var A = MB();
  A.quad([-8000, -34, 3150], [8000, -34, 3150], [8000, -34, 6400], [-8000, -34, 6400],
         [0.10, 0.05, 0.12]);
  apron = mesh(new Float32Array(A.d));

  dust = buildDust(0);
  ready = true;
}

/* ------------------------------------------------------------------ draw */
export function draw(d) {
  if (!ready) init();
  if (d === undefined) d = (typeof S.dist === 'number' && isFinite(S.dist)) ? S.dist : 0;
  var GY = GROUND_Y, i, wz;

  /* ---- opaque: terrain bands, then ruins ----
     The lit shader's fresnel rim is tuned for ship silhouettes; on a ground
     plane seen at a grazing angle it saturates to white, so damp it. uMatte
     defaults to 0 (= untouched behaviour) and we always put it back. */
  litBegin();
  gl.uniform1f(Plit.u.uMatte, 1.0);

  /* near bands first: the depth buffer then rejects most of the far ones */
  _vis.length = 0;
  for (i = 0; i < NB; i++) {
    wz = (i * BAND - d) % L; if (wz < 0) wz += L;
    if (wz > ZFAR) wz -= L;
    if (wz + BAND < ZNEAR || wz > ZFAR) continue;
    _vis.push(wz, i);
  }
  for (i = 0; i < _vis.length; i += 2) {
    for (var j = i + 2; j < _vis.length; j += 2)
      if (_vis[j] < _vis[i]) {
        wz = _vis[i]; _vis[i] = _vis[j]; _vis[j] = wz;
        wz = _vis[i + 1]; _vis[i + 1] = _vis[j + 1]; _vis[j + 1] = wz;
      }
    ident(_m); _m[13] = GY; _m[14] = _vis[i];
    litDraw(bands[_vis[i + 1]], _m, null, 1);
  }

  ident(_m); _m[13] = GY;
  litDraw(apron, _m, null, 1);

  /* ruins keep more of the neon edge — that is what reads as silhouette */
  gl.uniform1f(Plit.u.uMatte, 0.42);
  for (i = 0; i < spots.length; i++) {
    var sp = spots[i];
    wz = (sp.z - d) % L; if (wz < 0) wz += L;
    if (wz > ZFAR) wz -= L;
    /* a big butte is wide enough to still be on screen with its origin well
       behind the camera, so the near cull has to account for its footprint */
    if (wz < ZNEAR - protos[sp.p].rad * sp.s || wz > ZFAR) continue;
    compose(_m, sp.x, GY + sp.y, wz, sp.rx, sp.ry, sp.rz, sp.s);
    litDraw(protos[sp.p].m, _m, null, 1);
  }

  gl.uniform1f(Plit.u.uMatte, 0.0);

  /* ---- additive: low dust hanging over the desert ---- */
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  gl.useProgram(Pspr.p); attribs(4);
  gl.uniform1f(Pspr.u.uFogNear, FOG_NEAR);
  gl.uniform1f(Pspr.u.uFogFar, FOG_FAR);
  ident(_m); _m[13] = GY; _m[14] = -(d % DP);
  M4.mul(_mv, vp, _m);
  gl.uniformMatrix4fv(Pspr.u.uVP, false, _mv);
  gl.bindBuffer(gl.ARRAY_BUFFER, dust.buf);
  sprPointers();
  gl.drawArrays(gl.TRIANGLES, 0, dust.n);

  /* ---- restore what we changed ---- */
  gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  gl.useProgram(Plit.p); attribs(3);
}

/* world-space ground height under a point, for anything that wants it */
export function groundAt(x, z, d) {
  if (d === undefined) d = (typeof S.dist === 'number') ? S.dist : 0;
  var wz = (z + d) % L; if (wz < 0) wz += L;
  return GROUND_Y + gy(x, wz);
}

export function stats() {
  if (!ready) return null;
  var t = 0, i;
  for (i = 0; i < protos.length; i++) t += protos[i].tris;
  return { bands: NB, bandTris: bands[0].n / 3, protoTris: t, spots: spots.length, period: L };
}

export const SCENERY = { init: init, draw: draw, groundAt: groundAt, stats: stats, PERIOD: L };

