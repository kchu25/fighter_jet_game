/* SKYFALL INTERCEPTOR - geometry module.
   Frame: +X right, +Y up, +Z forward (nose direction, away from camera).
   Every mesh: non-indexed triangles, 9 floats/vertex -> px,py,pz, nx,ny,nz, r,g,b.
   Normals are flat per-face, derived from winding. Degenerate tris are dropped. */
export const MODELS = (function () {
  "use strict";

  var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos;

  /* ---------------------------------------------------------------- builder */
  function Mesh() {
    var d = [];
    var m = {};

    m.data = d;

    m.tri = function (a, b, c, col) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(l > 1e-7)) return m;                     // degenerate -> skip
      nx /= l; ny /= l; nz /= l;
      var r = col[0], g = col[1], bb = col[2];
      d.push(a[0], a[1], a[2], nx, ny, nz, r, g, bb);
      d.push(b[0], b[1], b[2], nx, ny, nz, r, g, bb);
      d.push(c[0], c[1], c[2], nx, ny, nz, r, g, bb);
      return m;
    };

    m.quad = function (a, b, c, e, col) { m.tri(a, b, c, col); m.tri(a, c, e, col); return m; };

    /* loft between two equal-length point loops */
    m.skin = function (A, B, col, colAlt) {
      var n = A.length;
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        m.quad(A[i], A[j], B[j], B[i], (colAlt && (i & 1)) ? colAlt : col);
      }
      return m;
    };
    /* loft an open strip (does not wrap) */
    m.skinOpen = function (A, B, col) {
      for (var i = 0; i < A.length - 1; i++) m.quad(A[i], A[i + 1], B[i + 1], B[i], col);
      return m;
    };

    m.capFan = function (loop, apex, col) {
      for (var i = 0; i < loop.length; i++) m.tri(loop[i], loop[(i + 1) % loop.length], apex, col);
      return m;
    };

    m.capCenter = function (loop, col, push) {
      var cx = 0, cy = 0, cz = 0, n = loop.length;
      for (var i = 0; i < n; i++) { cx += loop[i][0]; cy += loop[i][1]; cz += loop[i][2]; }
      var c = [cx / n, cy / n, cz / n];
      if (push) { c[0] += push[0]; c[1] += push[1]; c[2] += push[2]; }
      return m.capFan(loop, c, col);
    };

    /* solid slab from a 4-point outline extruded along dir by thickness */
    m.plate = function (p0, p1, p2, p3, dir, th, col, edge) {
      var top = [p0, p1, p2, p3], bot = [], i;
      for (i = 0; i < 4; i++) bot.push([top[i][0] + dir[0] * th, top[i][1] + dir[1] * th, top[i][2] + dir[2] * th]);
      var lo = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.62];
      m.quad(top[0], top[1], top[2], top[3], col);
      m.quad(bot[3], bot[2], bot[1], bot[0], lo);
      for (i = 0; i < 4; i++) { var j = (i + 1) % 4; m.quad(top[i], top[j], bot[j], bot[i], edge || lo); }
      return m;
    };

    m.box = function (cx, cy, cz, sx, sy, sz, col, colTop) {
      var x0 = cx - sx * 0.5, x1 = cx + sx * 0.5;
      var y0 = cy - sy * 0.5, y1 = cy + sy * 0.5;
      var z0 = cz - sz * 0.5, z1 = cz + sz * 0.5;
      var lo = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.62];
      var sd = [col[0] * 0.82, col[1] * 0.82, col[2] * 0.82];
      m.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sd);
      m.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], lo);
      m.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
      m.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
      m.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], colTop || sd);
      m.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], lo);
      return m;
    };

    /* rectangular frustum along Z */
    m.rectFrust = function (cx, cy, z0, z1, w0, h0, w1, h1, col) {
      var A = [[cx + w0, cy + h0, z0], [cx - w0, cy + h0, z0], [cx - w0, cy - h0, z0], [cx + w0, cy - h0, z0]];
      var B = [[cx + w1, cy + h1, z1], [cx - w1, cy + h1, z1], [cx - w1, cy - h1, z1], [cx + w1, cy - h1, z1]];
      m.skin(A, B, col, [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78]);
      return B;
    };

    /* 4-sided spike: base square at baseY, apex pulled toward origin */
    m.spike = function (x, z, baseY, tipY, half, col, tipCol) {
      var b = [[x - half, baseY, z - half], [x + half, baseY, z - half], [x + half, baseY, z + half], [x - half, baseY, z + half]];
      var ap = [x * 0.86, tipY, z * 0.86];
      m.quad(b[3], b[2], b[1], b[0], col);
      for (var i = 0; i < 4; i++) m.tri(b[i], b[(i + 1) % 4], ap, tipCol || col);
      return m;
    };

    m.build = function () { return new Float32Array(d); };
    m.tris = function () { return d.length / 27; };
    return m;
  }

  /* ------------------------------------------------------------- primitives */
  // cross-section loop: chined hex (flat-ish top, chine at widest, flat belly)
  function hexLoop(z, w, top, bot, yOff) {
    return [
      [w, yOff, z],
      [w * 0.45, yOff + top, z],
      [-w * 0.45, yOff + top, z],
      [-w, yOff, z],
      [-w * 0.5, yOff - bot, z],
      [w * 0.5, yOff - bot, z]
    ];
  }
  // beveled rectangle loop (armored slab cross-section)
  function slabLoop(z, w, h, bev, yOff) {
    yOff = yOff || 0;
    return [
      [w, yOff + h - bev, z], [w - bev, yOff + h, z],
      [-(w - bev), yOff + h, z], [-w, yOff + h - bev, z],
      [-w, yOff - (h - bev), z], [-(w - bev), yOff - h, z],
      [w - bev, yOff - h, z], [w, yOff - (h - bev), z]
    ];
  }
  // ring in the XY plane at a given z (nozzles, forward-facing dishes)
  function ringXY(cx, cy, z, rx, ry, n, ph) {
    var o = [];
    for (var i = 0; i < n; i++) { var a = (ph || 0) + i / n * TAU; o.push([cx + rx * cos(a), cy + ry * sin(a), z]); }
    return o;
  }
  // ring in the XZ plane at a given y (discs); i=0 sits at +Z
  function ringXZ(cx, cz, y, rx, rz, n, ph) {
    var o = [];
    for (var i = 0; i < n; i++) { var a = (ph || 0) + i / n * TAU; o.push([cx + rx * sin(a), y, cz + rz * cos(a)]); }
    return o;
  }
  function mir(p) { return [-p[0], p[1], p[2]]; }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  /* recentre a mesh on its bounding box and rescale so the largest extent is
     `size`. Positions only: a uniform scale + translate leaves normals valid. */
  function fitUnit(M, size) {
    var d = M.data, i, k;
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (i = 0; i < d.length; i += 9) {
      for (k = 0; k < 3; k++) {
        if (d[i + k] < lo[k]) lo[k] = d[i + k];
        if (d[i + k] > hi[k]) hi[k] = d[i + k];
      }
    }
    var ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    var s = ext > 1e-6 ? size / ext : 1;
    var c = [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5];
    for (i = 0; i < d.length; i += 9) {
      for (k = 0; k < 3; k++) d[i + k] = (d[i + k] - c[k]) * s;
    }
    return M;
  }

  /* ===================================================================== JET
     "Wraith"-class strike craft: skinny forward-thrusting spine, small low
     canopy, sharply swept ANHEDRAL wings, underslung gun pods, and two fat
     exposed engine housings riding high on the back. Top-heavy and mean. */
  function buildJet() {
    var M = Mesh();
    var HULL = [0.150, 0.172, 0.212];   // dark charcoal-blue flank
    var HULL2 = [0.205, 0.232, 0.280];  // second flank value
    var STEEL = [0.315, 0.355, 0.415];  // lit upper facets
    var STEEL2 = [0.405, 0.445, 0.505]; // brightest upper facets
    var PANEL = [0.220, 0.260, 0.320];
    var PANEL2 = [0.180, 0.210, 0.262];
    var LINE = [0.470, 0.515, 0.580];
    var BELLY = [0.062, 0.072, 0.098];  // near-black underside
    var TRIM = [0.15, 0.85, 1.00];      // electric cyan accent
    var TRIM2 = [0.09, 0.46, 0.60];
    var CANOPY = [0.20, 0.88, 1.00];
    var NOZZ = [0.170, 0.195, 0.245];
    var DARK = [0.030, 0.036, 0.050];
    var HOLE = [0.014, 0.018, 0.028];   // intake interior
    var HOT = [0.03, 0.72, 1.00];

    /* loft with an explicit colour per facet -> real value variation */
    function skinC(A, B, cols) {
      for (var i = 0; i < A.length; i++) M.quad(A[i], A[(i + 1) % A.length], B[(i + 1) % A.length], B[i], cols[i]);
    }
    /* 8-facet palette mirrored about X (facet i of the mirrored loop) */
    var MIRR = [2, 1, 0, 7, 6, 5, 4, 3];
    function pal8(p, s) {
      if (s > 0) return p;
      var o = [], i; for (i = 0; i < 8; i++) o.push(p[MIRR[i]]); return o;
    }
    /* beveled-rect nacelle section, offset in X */
    function nac(cx, cy, z, w, h, bev) {
      var l = slabLoop(z, w, h, bev, cy), o = [], i;
      for (i = 0; i < l.length; i++) o.push([l[i][0] + cx, l[i][1], l[i][2]]);
      return o;
    }

    // --- central fuselage: long, narrow, forward-thrusting -------------------
    var S = [
      hexLoop(30, 2.10, 1.20, 1.20, -0.50),
      hexLoop(20, 3.10, 1.80, 1.90, -0.30),
      hexLoop(6, 4.20, 2.40, 2.60, 0.00),
      hexLoop(-10, 4.00, 2.60, 2.40, 0.20),
      hexLoop(-24, 3.20, 2.00, 1.80, 0.40),
      hexLoop(-30, 2.40, 1.50, 1.20, 0.40)
    ];
    // facets: 0 upper-R, 1 top deck, 2 upper-L, 3 lower-L, 4 belly, 5 lower-R
    for (var i = 0; i < S.length - 1; i++) {
      var t = (i & 1);
      skinC(S[i], S[i + 1], [
        t ? HULL2 : HULL, t ? STEEL : STEEL2, t ? HULL2 : HULL,
        t ? PANEL2 : HULL, BELLY, t ? PANEL2 : HULL
      ]);
    }
    var tip = [0, -0.45, 44];                        // needle nose
    var NCOL = [HULL2, STEEL2, HULL2, PANEL2, BELLY, PANEL2];
    for (i = 0; i < 6; i++) M.tri(S[0][i], S[0][(i + 1) % 6], tip, NCOL[i]);
    M.capCenter(S[5], DARK);                         // tail bulkhead

    // --- engine housings: bulky, high, rearward, deep circular nozzles -------
    var EX = 7.8, EY = 5.6;
    var PA = [STEEL, STEEL2, STEEL, HULL2, PANEL2, BELLY, PANEL2, HULL];
    var PB = [STEEL2, STEEL, STEEL2, HULL, PANEL, BELLY, PANEL, HULL2];
    var PC = [STEEL, LINE, STEEL, HULL2, PANEL2, BELLY, PANEL2, HULL];
    [1, -1].forEach(function (s) {
      var cx = s * EX;
      var e0 = nac(cx, EY, 9, 2.70, 2.50, 1.00);     // intake lip
      var e1 = nac(cx, EY, 1, 4.30, 4.10, 1.70);     // shoulder
      var e2 = nac(cx, EY, -17, 4.50, 4.30, 1.80);   // body
      var e3 = nac(cx, EY, -27, 4.00, 3.80, 1.60);   // tail cone start
      skinC(e0, e1, pal8(PA, s));
      skinC(e1, e2, pal8(PB, s));
      skinC(e2, e3, pal8(PC, s));
      // recessed intake
      var inl = ringXY(cx, EY, 5.0, 1.90, 1.90, 8, PI / 8);
      skinC(e0, inl, pal8([DARK, TRIM2, DARK, HOLE, HOLE, HOLE, HOLE, DARK], s));
      M.capCenter(inl, HOLE);
      // intake lip trim, a hair proud of the top bevel
      M.quad([cx - 1.5, EY + 2.62, 9.1], [cx + 1.5, EY + 2.62, 9.1],
        [cx + 1.5, EY + 2.30, 7.4], [cx - 1.5, EY + 2.30, 7.4], TRIM);
      // nozzle: rim ring (cyan top+bottom facets), flat annulus, deep cone
      var rim = ringXY(cx, EY, -30.5, 4.00, 4.00, 8, PI / 8);
      skinC(e3, rim, [NOZZ, TRIM, NOZZ, shade(NOZZ, 0.7), NOZZ, TRIM2, NOZZ, shade(NOZZ, 1.25)]);
      var inn = ringXY(cx, EY, -30.5, 2.40, 2.40, 8, PI / 8);
      M.skin(rim, inn, DARK, HOLE);
      M.capFan(inn, [cx, EY, -25.0], HOT);           // glowing throat
    });

    // --- engine pylons tying the housings to the spine -----------------------
    [1, -1].forEach(function (s) {
      M.box(s * 4.6, 3.60, -8, 3.2, 4.2, 24, PANEL2, PANEL);
    });

    // --- wings: sharply swept AND drooping (anhedral) ------------------------
    [1, -1].forEach(function (s) {
      var w0 = [s * 4.2, 1.40, 15], w1 = [s * 26.5, -6.80, -9],
        w2 = [s * 29.6, -7.20, -17], w3 = [s * 4.8, 1.60, -23];
      if (s < 0) M.plate(w3, w2, w1, w0, [0, -1, 0], 1.5, STEEL, HULL2);
      else M.plate(w0, w1, w2, w3, [0, -1, 0], 1.5, STEEL, HULL2);
      // cyan leading-edge strip, proud of the drooping top surface
      M.quad([s * 4.4, 1.62, 15], [s * 26.5, -6.58, -9],
        [s * 26.1, -6.58, -11.6], [s * 4.7, 1.62, 12.2], TRIM);
      // dim trailing-edge break
      M.quad([s * 5.3, 1.82, -22.0], [s * 28.9, -6.98, -16.4],
        [s * 28.7, -6.98, -14.6], [s * 5.4, 1.82, -19.4], PANEL2);
      // upturned wingtip fin
      var f0 = [s * 26.8, -6.60, -9.5], f1 = [s * 31.5, -0.40, -12.5],
        f2 = [s * 32.2, -0.40, -16.5], f3 = [s * 29.3, -7.20, -18.5];
      M.plate(f0, f1, f2, f3, [s * 1, 0, 0], 1.0, LINE, STEEL);
    });

    // --- underslung gun / sensor pods at the wing roots ----------------------
    [1, -1].forEach(function (s) {
      M.box(s * 9.4, -3.90, 2, 4.2, 3.8, 20, PANEL, STEEL);       // pod body
      var f = M.rectFrust(s * 9.4, -3.90, 12, 19, 2.10, 1.90, 1.20, 1.10, PANEL2);
      M.quad(f[0], f[1], f[2], f[3], HULL);                        // wedge cap
      M.box(s * 9.4, -4.20, 22.5, 1.2, 1.2, 8, LINE);              // barrel
      M.box(s * 9.4, -4.20, 26.0, 1.8, 1.8, 1.6, DARK);            // muzzle collar
      // pod flank panel break
      M.quad([s * 11.55, -2.60, 11], [s * 11.55, -2.60, -6],
        [s * 11.55, -3.30, -6], [s * 11.55, -3.30, 11], PANEL2);
    });

    // --- small low canopy blister, set well forward --------------------------
    function cSec(z, w, h, yb) {
      return [[-w, yb, z], [-w * 0.62, yb + h * 0.72, z], [0, yb + h, z], [w * 0.62, yb + h * 0.72, z], [w, yb, z]];
    }
    var C = [cSec(31, 0.55, 0.35, 0.55), cSec(27, 1.50, 1.25, 0.85),
    cSec(22.5, 1.95, 1.75, 1.25), cSec(17, 1.70, 1.05, 1.75)];
    var CC = [CANOPY, shade(CANOPY, 0.74), shade(CANOPY, 0.52)];
    for (i = 0; i < C.length - 1; i++) M.skinOpen(C[i], C[i + 1], CC[i]);
    M.tri(C[0][0], C[0][1], C[0][2], TRIM2);
    M.tri(C[0][0], C[0][2], C[0][4], TRIM2);
    M.tri(C[0][2], C[0][3], C[0][4], shade(CANOPY, 0.45));
    var L = C[C.length - 1];
    M.tri(L[2], L[1], L[0], PANEL2);
    M.tri(L[4], L[2], L[0], PANEL2);
    M.tri(L[4], L[3], L[2], HULL2);

    // --- dorsal spine ridge + blade antenna ----------------------------------
    M.plate([0.8, 1.90, 13], [0.8, 4.90, 3], [0.8, 4.70, -20], [0.8, 1.90, -26],
      [-1, 0, 0], 1.6, LINE, STEEL);
    M.quad([0.85, 4.72, 1], [0.85, 4.66, -14], [-0.85, 4.66, -14], [-0.85, 4.72, 1], TRIM);
    M.plate([0.45, 4.60, -1], [0.45, 12.40, -5], [0.45, 12.00, -7.5], [0.45, 4.40, -9],
      [-1, 0, 0], 0.9, LINE, TRIM2);

    // --- nose strakes / canards ----------------------------------------------
    [1, -1].forEach(function (s) {
      var n0 = [s * 1.9, 0.00, 29], n1 = [s * 7.8, -1.00, 23.5],
        n2 = [s * 7.2, -1.00, 20.5], n3 = [s * 2.2, 0.10, 21];
      if (s < 0) M.plate(n3, n2, n1, n0, [0, -1, 0], 0.7, STEEL2, HULL);
      else M.plate(n0, n1, n2, n3, [0, -1, 0], 0.7, STEEL2, HULL);
    });

    // --- ventral tail strakes -------------------------------------------------
    [1, -1].forEach(function (s) {
      M.plate([s * 2.8, -1.40, -18], [s * 6.2, -7.20, -23],
        [s * 5.2, -7.20, -29], [s * 2.4, -1.40, -30], [s * 1, 0, 0], 0.9, HULL2, PANEL2);
    });

    // --- asymmetric greebles: one sensor blister, one blade antenna -----------
    M.box(-4.60, 0.00, 22, 2.6, 2.2, 7, PANEL, STEEL2);
    M.quad([-5.50, -0.70, 25.6], [-3.70, -0.70, 25.6],
      [-3.70, 0.70, 25.6], [-5.50, 0.70, 25.6], TRIM2);
    M.plate([9.0, 9.90, -4], [10.7, 13.60, -7], [10.7, 13.20, -9.5], [9.0, 9.70, -11],
      [1, 0, 0], 0.7, STEEL, TRIM2);

    // --- forebody chine trim + hull panel breaks ------------------------------
    [1, -1].forEach(function (s) {
      var ch = [S[0], S[1], S[2]];
      for (var k = 0; k < ch.length - 1; k++) {
        var p = ch[k][0], q = ch[k + 1][0];
        M.quad([s * p[0] * 1.04, p[1] - 0.06, p[2]], [s * q[0] * 1.04, q[1] - 0.06, q[2]],
          [s * q[0] * 0.80, q[1] + 0.75, q[2]], [s * p[0] * 0.80, p[1] + 0.75, p[2]], TRIM);
      }
      // nacelle top panel breaks
      M.quad([s * (EX - 2.5), EY + 4.34, -3], [s * (EX + 2.5), EY + 4.34, -3],
        [s * (EX + 2.5), EY + 4.34, -5], [s * (EX - 2.5), EY + 4.34, -5], LINE);
      M.quad([s * (EX - 2.4), EY + 4.34, -12], [s * (EX + 2.4), EY + 4.34, -12],
        [s * (EX + 2.4), EY + 4.34, -13.4], [s * (EX - 2.4), EY + 4.34, -13.4], PANEL2);
      // cyan strip down the nacelle flank: keeps the shadow side readable
      M.quad([s * 12.55, EY + 1.90, -1], [s * 12.55, EY + 1.90, -20],
        [s * 12.55, EY + 1.10, -20], [s * 12.55, EY + 1.10, -1], TRIM);
      M.quad([s * 12.55, EY - 1.40, -3], [s * 12.55, EY - 1.40, -17],
        [s * 12.55, EY - 2.00, -17], [s * 12.55, EY - 2.00, -3], LINE);
    });

    return M;
  }

  /* =================================================================== DRONE */
  function buildDrone() {
    var M = Mesh();
    var HULL = [0.35, 0.06, 0.40];
    var HULL2 = [0.26, 0.04, 0.31];
    var DARK = [0.09, 0.02, 0.12];
    var TRIM = [1.00, 0.15, 0.75];
    var CORE = [1.00, 0.42, 0.92];
    var BLADE = [0.30, 0.05, 0.36];

    var S = [
      hexLoop(14, 3.0, 2.0, 2.0, 0),
      hexLoop(8, 5.2, 3.4, 3.4, 0),
      hexLoop(-1, 6.4, 4.2, 4.2, 0),
      hexLoop(-11, 4.6, 3.0, 3.0, 0),
      hexLoop(-19, 2.2, 1.4, 1.4, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], HULL, HULL2);
    M.capFan(S[4], [0, 0, -22], HULL2);

    // core recess: funnel back from the open front rim to a hot core plate
    var rim = S[0];
    var inner = hexLoop(8.6, 1.3, 0.9, 0.9, 0);
    M.skin(rim, inner, DARK);
    M.capCenter(inner, CORE);
    // rim trim
    M.skin(ringXY(0, 0, 14.2, 3.15, 2.55, 6, PI / 6), ringXY(0, 0, 13.2, 3.35, 2.75, 6, PI / 6), TRIM);

    // forward-swept blade wings
    [1, -1].forEach(function (s) {
      var p0 = [s * 4.8, 0.6, 2], p1 = [s * 26.5, 2.0, 11],
        p2 = [s * 27.0, 2.0, 4], p3 = [s * 4.5, 0.6, -11];
      if (s < 0) M.plate(p3, p2, p1, p0, [0, -1, 0], 1.2, BLADE, HULL);
      else M.plate(p0, p1, p2, p3, [0, -1, 0], 1.2, BLADE, HULL);
      M.quad([s * 4.9, 0.78, 2], [s * 26.5, 2.18, 11], [s * 26.7, 2.18, 8.6], [s * 5.1, 0.78, 0.2], TRIM);
      M.quad([s * 26.9, 2.18, 4.4], [s * 5.0, 0.78, -10.2], [s * 5.0, 0.78, -8.2], [s * 26.9, 2.18, 5.8], shade(TRIM, 0.5));
    });

    // dorsal + ventral blades
    M.plate([0.55, 4.0, 2], [0.55, 10.0, -6], [0.55, 9.6, -12], [0.55, 3.6, -14], [-1, 0, 0], 1.1, HULL2, HULL);
    M.plate([0.55, -3.8, 0], [0.55, -8.4, -6], [0.55, -8.0, -11], [0.55, -3.4, -13], [-1, 0, 0], 1.1, HULL2, HULL);

    // two forward attack spikes
    [1, -1].forEach(function (s) {
      var bx = s * 7.6, by = -2.6, bz = 4, h = 2.0;
      var b = [[bx - h, by - h, bz], [bx + h, by - h, bz], [bx + h, by + h, bz], [bx - h, by + h, bz]];
      var ap = [s * 5.4, -3.6, 24];
      M.quad(b[3], b[2], b[1], b[0], HULL2);
      for (var k = 0; k < 4; k++) M.tri(b[k], b[(k + 1) % 4], ap, k === 1 ? TRIM : HULL);
    });

    // rear thruster nacelles
    [1, -1].forEach(function (s) {
      M.box(s * 5.0, -1.0, -14, 4.0, 4.0, 12, HULL2);
      M.box(s * 5.0, -1.0, -20.4, 2.6, 2.6, 1.2, [0.85, 0.15, 0.9]);
    });

    return M;
  }

  /* ================================================================= CRUISER */
  function buildCruiser() {
    var M = Mesh();
    var HULL = [0.32, 0.14, 0.03];
    var HULL2 = [0.24, 0.10, 0.02];
    var PLATE = [0.12, 0.07, 0.04];
    var TRIM = [1.00, 0.62, 0.12];
    var BRIDGE = [0.42, 0.20, 0.05];
    var GLASS = [1.00, 0.78, 0.28];
    var DARK = [0.05, 0.04, 0.04];

    var S = [
      slabLoop(52, 6, 5, 2, 0),
      slabLoop(34, 13, 9, 3.5, 0),
      slabLoop(12, 19, 12, 4.5, 0),
      slabLoop(-14, 21, 13, 5, 0),
      slabLoop(-38, 18, 11, 4.5, 0),
      slabLoop(-54, 13, 8, 3.5, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], HULL, HULL2);
    M.capFan(S[0], [0, 0, 55], HULL2);
    M.capCenter(S[5], DARK);

    // side weapon pods on stub pylons
    [1, -1].forEach(function (s) {
      M.box(s * 28, 0, -4, 16, 8, 30, HULL2);                       // pylon
      M.box(s * 50, 0, -4, 28, 15, 46, HULL, HULL2);                // pod body
      M.box(s * 50, 8.5, -6, 24, 3, 36, PLATE);                     // pod dorsal armour
      var f = M.rectFrust(s * 50, 0, 19, 34, 14, 7.5, 6, 3.5, HULL);
      M.quad(f[0], f[1], f[2], f[3], HULL2);                        // wedge cap
      M.box(s * 46, 0, 36, 5, 5, 12, PLATE);                        // barrels
      M.box(s * 54, 0, 36, 5, 5, 12, PLATE);
    });

    // raised bridge
    M.box(0, 16, -12, 22, 8, 30, BRIDGE, HULL);
    M.box(0, 22, -14, 14, 5, 18, BRIDGE, HULL2);
    M.quad([-9, 20.2, 1.6], [9, 20.2, 1.6], [9, 12.4, 4.4], [-9, 12.4, 4.4], GLASS);

    // layered armour plates on the spine and flanks
    M.box(0, 12.9, 6, 24, 2.2, 28, PLATE);
    M.box(0, -13.0, -2, 26, 2.2, 40, PLATE);
    [1, -1].forEach(function (s) {
      M.box(s * 20.6, 2, -20, 2.4, 14, 30, PLATE);
    });

    // amber trim strips down the flanks
    [1, -1].forEach(function (s) {
      M.quad([s * 21.6, 6.6, 12], [s * 21.6, 6.6, -30], [s * 21.6, 4.4, -30], [s * 21.6, 4.4, 12], TRIM);
      M.quad([s * 19.9, 12.3, 28], [s * 21.4, 12.6, 8], [s * 21.4, 10.6, 8], [s * 19.9, 10.4, 28], TRIM);
    });

    // engine cluster
    [0, 11, -11].forEach(function (x) {
      var a = ringXY(x, -1, -50, 6.0, 6.0, 6, PI / 6);
      var b = ringXY(x, -1, -60, 5.2, 5.2, 6, PI / 6);
      M.skin(a, b, HULL2, PLATE);
      M.capCenter(b, [0.28, 0.10, 0.02]);
    });

    return M;
  }

  /* ============================================================== MOTHERSHIP */
  function buildBoss() {
    var M = Mesh();
    var HULL = [0.15, 0.07, 0.24];
    var HULL2 = [0.10, 0.045, 0.17];
    var PLATE = [0.055, 0.025, 0.10];
    var TRIM = [0.62, 0.22, 1.00];
    var DARK = [0.03, 0.012, 0.055];
    var CORE = [0.85, 0.35, 1.00];
    var N = 8, RZ = 0.743;

    function disc(y, rx) { return ringXZ(0, 0, y, rx, rx * RZ, N, 0); }

    var LY = [-58, -26, 0, 18, 34, 50, 68, 92];
    var LR = [150, 270, 350, 330, 250, 180, 118, 64];
    var rings = [];
    for (var i = 0; i < LY.length; i++) rings.push(disc(LY[i], LR[i]));
    for (i = 0; i < rings.length - 1; i++) M.skin(rings[i], rings[i + 1], i < 2 ? HULL2 : HULL, i < 2 ? PLATE : HULL2);
    M.capCenter(rings[0], PLATE);
    M.capCenter(rings[rings.length - 1], HULL2);

    // rim trim band, proud of the widest ring
    M.skin(disc(5, 352), disc(-6, 352), TRIM, shade(TRIM, 0.55));

    // radial armour ribs on the upper disc
    function surfY(r) {
      var Y = [92, 68, 50, 34, 18, 0], R = [64, 118, 180, 250, 330, 350];
      for (var k = 0; k < R.length - 1; k++) {
        if (r >= R[k] && r <= R[k + 1]) {
          var t = (r - R[k]) / (R[k + 1] - R[k]);
          return Y[k] + (Y[k + 1] - Y[k]) * t;
        }
      }
      return r < R[0] ? Y[0] : Y[Y.length - 1];
    }
    for (i = 0; i < N; i++) {
      var a = (i + 0.5) / N * TAU;
      var ux = sin(a), uz = cos(a), tx = cos(a), tz = -sin(a), W = 15;
      var r0 = 150, r1 = 300, y0 = surfY(r0) + 1, y1 = surfY(r1) + 1;
      M.plate(
        [ux * r0 * 1 + tx * W, y0, uz * r0 * RZ + tz * W * RZ],
        [ux * r1 * 1 + tx * W, y1, uz * r1 * RZ + tz * W * RZ],
        [ux * r1 * 1 - tx * W, y1, uz * r1 * RZ - tz * W * RZ],
        [ux * r0 * 1 - tx * W, y0, uz * r0 * RZ - tz * W * RZ],
        [0, 1, 0], 7, HULL, PLATE);
    }

    // forward command core: protruding housing with a deep glowing recess
    var hA = ringXY(0, 50, 105, 72, 46, N, PI / N);
    var hB = ringXY(0, 50, 172, 50, 33, N, PI / N);
    M.skin(hA, hB, HULL, HULL2);
    var hC = ringXY(0, 50, 142, 18, 12, N, PI / N);
    M.skin(hB, hC, DARK);
    M.capCenter(hC, CORE);
    // trim ring on the housing lip
    M.skin(ringXY(0, 50, 173, 51, 34, N, PI / N), ringXY(0, 50, 166, 53, 36, N, PI / N), TRIM);

    // radial pylons ending in weapon pods
    [[1, 100, 148], [-1, 100, 148], [1, -110, -62], [-1, -110, -62]].forEach(function (p) {
      var s = p[0], z = p[1], bz = p[2];
      M.box(s * 198, 44, z, 170, 12, 36, HULL2, PLATE);
      M.box(s * 262, 46, z, 56, 34, 66, HULL, HULL2);
      M.box(s * 262, 46, bz, 18, 18, 36, PLATE);
    });

    // forward chin cannons
    [1, -1].forEach(function (s) {
      M.box(s * 70, -34, 200, 22, 22, 60, HULL2, PLATE);
      M.box(s * 70, -34, 226, 12, 12, 14, PLATE);
    });

    // downward-hanging spikes
    [[0, 190], [130, 130], [-130, 130], [175, -70], [-175, -70], [0, -195], [200, 30], [-200, 30]]
      .forEach(function (p) { M.spike(p[0], p[1], -42, -98, 22, HULL2, PLATE); });

    return M;
  }

  /* ============================================================ HIVE CARRIER
     Boss #2: a broad, flat flight-deck hulk, green accents. Its silhouette is
     all horizontals — deck, sponsons, launch bays across the bow — so it reads
     as "hangar", not "gun platform". Nose at +z; attach points are negated in
     z (same raw-world-offset convention as the striker/lancer entries). */
  function buildCarrier() {
    var M = Mesh();
    var HULL = [0.060, 0.190, 0.120];
    var HULL2 = [0.040, 0.130, 0.085];
    var PLATE = [0.025, 0.075, 0.050];
    var DECK = [0.100, 0.240, 0.160];
    var TRIM = [0.24, 1.00, 0.62];
    var TRIM2 = [0.12, 0.52, 0.32];
    var DARK = [0.012, 0.035, 0.024];
    var CORE = [0.50, 1.00, 0.70];
    var GLOW = [0.20, 0.80, 0.48];

    // broad flat hull, lofted along z
    var S = [
      slabLoop(300, 150, 22, 10, 0),
      slabLoop(160, 290, 34, 14, 0),
      slabLoop(-40, 310, 38, 16, 0),
      slabLoop(-200, 260, 34, 14, 0),
      slabLoop(-300, 170, 26, 10, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], HULL, HULL2);
    M.capFan(S[0], [0, 4, 348], HULL2);              // wedge prow
    M.capCenter(S[S.length - 1], DARK);

    // raised flight deck + centreline landing strip + edge lights
    M.box(0, 44, -10, 560, 10, 540, DECK, HULL);
    M.quad([-14, 49.3, 250], [14, 49.3, 250], [14, 49.3, -270], [-14, 49.3, -270], TRIM2);
    [1, -1].forEach(function (s) {
      M.quad([s * 276, 49.3, 250], [s * 262, 49.3, 250],
        [s * 262, 49.3, -270], [s * 276, 49.3, -270], TRIM);
    });

    // three launch bays across the bow: protruding tubes with dark glowing mouths
    [-170, 0, 170].forEach(function (bx) {
      M.box(bx, -4, 255, 92, 46, 80, HULL2, PLATE);
      M.quad([bx - 36, -26, 295.6], [bx + 36, -26, 295.6],
        [bx + 36, 14, 295.6], [bx - 36, 14, 295.6], DARK);
      M.quad([bx - 28, -20, 296.2], [bx + 28, -20, 296.2],
        [bx + 28, 8, 296.2], [bx - 28, 8, 296.2], CORE);
      // trim lip over the mouth
      M.quad([bx - 40, 18, 296.0], [bx + 40, 18, 296.0],
        [bx + 40, 24, 292.0], [bx - 40, 24, 292.0], TRIM);
    });

    // command island, offset starboard on the deck
    M.box(180, 70, -120, 70, 42, 110, HULL, DECK);
    M.box(180, 100, -130, 50, 22, 60, HULL2, DECK);
    M.quad([158, 106, -101], [202, 106, -101], [202, 96, -99], [158, 96, -99], GLOW);
    M.box(180, 122, -150, 6, 24, 6, PLATE);          // mast

    // bow reactor housing with a glowing core face (carrierCore attach)
    M.box(0, 10, 296, 44, 26, 24, PLATE, HULL2);
    M.quad([-15, 2, 308.4], [15, 2, 308.4], [15, 20, 308.4], [-15, 20, 308.4], CORE);

    // side sponsons + keel fins
    [1, -1].forEach(function (s) {
      M.box(s * 300, -6, -40, 40, 26, 300, HULL2, PLATE);
      M.quad([s * 320.2, 4, 90], [s * 320.2, 4, -160],
        [s * 320.2, -4, -160], [s * 320.2, -4, 90], TRIM);
      M.plate([s * 120, -34, 60], [s * 150, -78, -20],
        [s * 140, -78, -80], [s * 110, -34, -110], [s * 1, 0, 0], 8, HULL2, PLATE);
    });

    // engine cluster at the stern
    [-140, 0, 140].forEach(function (x) {
      var a = ringXY(x, 0, -298, 30, 26, 6, PI / 6);
      var b = ringXY(x, 0, -330, 24, 20, 6, PI / 6);
      M.skin(a, b, HULL2, PLATE);
      M.capCenter(b, GLOW);
    });

    return M;
  }

  /* ============================================================= DREADNOUGHT
     Boss #3: a long red gun-spine warship. One huge central rail cannon runs
     the length of the hull and out past the prow; flank battery wings carry
     the wall guns. Nose at +z; attach points negated in z. */
  function buildDreadnought() {
    var M = Mesh();
    var HULL = [0.240, 0.060, 0.080];
    var HULL2 = [0.170, 0.040, 0.060];
    var PLATE = [0.100, 0.030, 0.050];
    var STEEL = [0.300, 0.100, 0.120];
    var TRIM = [1.00, 0.17, 0.30];
    var DARK = [0.050, 0.015, 0.022];
    var GLOW = [1.00, 0.38, 0.32];

    // long armoured hull
    var S = [
      slabLoop(300, 40, 34, 12, 0),
      slabLoop(160, 90, 60, 20, 0),
      slabLoop(0, 110, 70, 24, 0),
      slabLoop(-180, 95, 58, 20, 0),
      slabLoop(-300, 60, 40, 14, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], HULL, HULL2);
    M.capFan(S[0], [0, 0, 356], HULL2);              // armoured prow
    M.capCenter(S[S.length - 1], DARK);

    // the spine: one long rail barrel over the bow, glowing emitter at the tip
    M.box(0, 12, 320, 18, 18, 150, PLATE, STEEL);
    M.box(0, 12, 400, 28, 28, 12, DARK);
    M.box(0, 12, 393, 22, 22, 5, GLOW);
    // spine support pylons
    M.box(0, 30, 220, 12, 40, 30, HULL2);
    M.box(0, 30, 290, 10, 34, 22, HULL2);
    // red trim strips down the spine flanks
    [1, -1].forEach(function (s) {
      M.quad([s * 9.2, 18, 380], [s * 9.2, 18, 260], [s * 9.2, 8, 260], [s * 9.2, 8, 380], TRIM);
    });

    // flank battery wings: pylon, pod, three forward barrels each side
    [1, -1].forEach(function (s) {
      M.box(s * 145, 0, -20, 95, 22, 130, HULL2, PLATE);        // pylon
      M.box(s * 210, 4, -10, 70, 40, 170, HULL, HULL2);         // pod
      M.box(s * 210, 26.5, -16, 58, 6, 130, PLATE);             // pod armour
      [-30, 0, 30].forEach(function (ox) {
        M.box(s * 210 + ox, 10, 82, 8, 8, 46, STEEL);           // barrels
        M.box(s * 210 + ox, 10, 106, 11, 11, 5, DARK);          // muzzles
      });
      // pod flank trim
      M.quad([s * 245.2, 12, 50], [s * 245.2, 12, -70],
        [s * 245.2, 4, -70], [s * 245.2, 4, 50], TRIM);
    });

    // dorsal ridge fin + ventral keel blades
    M.plate([0.6, 34, -60], [0.6, 86, -110], [0.6, 82, -150], [0.6, 30, -170],
      [-1, 0, 0], 1.4, HULL2, TRIM);
    [1, -1].forEach(function (s) {
      M.plate([s * 40, -32, -120], [s * 66, -78, -170],
        [s * 60, -78, -220], [s * 36, -32, -230], [s * 1, 0, 0], 6, HULL2, PLATE);
    });

    // twin main engines
    [1, -1].forEach(function (s) {
      var a = ringXY(s * 48, 0, -302, 26, 26, 6, PI / 6);
      var b = ringXY(s * 48, 0, -338, 20, 20, 6, PI / 6);
      M.skin(a, b, HULL2, PLATE);
      M.capCenter(b, GLOW);
    });

    return M;
  }

  /* ================================================================= STRIKER
     Attack-run fighter: a sleek dart, well under the drone's bulk, hard-swept
     wings and canted twin tails. Green accents — it reads as "fast flanker". */
  function buildStriker() {
    var M = Mesh();
    var HULL = [0.10, 0.20, 0.15];
    var HULL2 = [0.07, 0.15, 0.11];
    var STEEL = [0.17, 0.31, 0.23];
    var TRIM = [0.24, 1.00, 0.62];
    var TRIM2 = [0.12, 0.50, 0.31];
    var DARK = [0.03, 0.06, 0.05];
    var HOT = [0.45, 1.00, 0.68];

    var S = [
      hexLoop(20, 1.6, 1.0, 1.0, 0),
      hexLoop(10, 3.2, 2.0, 2.2, 0),
      hexLoop(-6, 3.8, 2.4, 2.4, 0),
      hexLoop(-18, 2.6, 1.6, 1.6, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? HULL2 : HULL, STEEL);
    M.capFan(S[0], [0, -0.2, 34], STEEL);            // needle nose
    M.capCenter(S[3], DARK);

    // hard-swept main wings, green leading edge
    [1, -1].forEach(function (s) {
      var p0 = [s * 3.4, 0.3, 8], p1 = [s * 17.5, -1.4, -14],
        p2 = [s * 15.5, -1.4, -19], p3 = [s * 3.2, 0.3, -14];
      if (s < 0) M.plate(p3, p2, p1, p0, [0, -1, 0], 0.9, STEEL, HULL2);
      else M.plate(p0, p1, p2, p3, [0, -1, 0], 0.9, STEEL, HULL2);
      M.quad([s * 3.6, 0.48, 8], [s * 17.5, -1.22, -14],
        [s * 17.1, -1.22, -15.8], [s * 3.8, 0.48, 6.2], TRIM);
    });

    // canted twin tail fins
    [1, -1].forEach(function (s) {
      M.plate([s * 2.4, 1.2, -12], [s * 6.0, 6.4, -17],
        [s * 5.5, 6.2, -20], [s * 2.2, 1.1, -20], [s * 1, 0, 0], 0.7, HULL2, TRIM2);
    });

    // twin engines with hot caps
    [1, -1].forEach(function (s) {
      M.box(s * 2.8, 0.4, -19, 2.6, 2.6, 7, HULL2);
      M.box(s * 2.8, 0.4, -22.9, 1.7, 1.7, 0.8, HOT);
    });
    // ventral sensor strake
    M.plate([0.4, -2.2, 6], [0.4, -4.6, -4], [0.4, -4.4, -8], [0.4, -2.0, -10],
      [-1, 0, 0], 0.8, HULL2, TRIM2);

    return M;
  }

  /* ==================================================================== MINE
     Proximity mine: a tumbling spiky octahedron, red accents. Kept simple —
     32 tris — because there can be four of them drifting at once. */
  function buildMine() {
    var M = Mesh();
    var HULL = [0.26, 0.06, 0.09];
    var HULL2 = [0.18, 0.04, 0.07];
    var TRIM = [1.00, 0.17, 0.30];

    var R = 11;
    var eq = [[R, 0, 0], [0, 0, R], [-R, 0, 0], [0, 0, -R]];
    var top = [0, R, 0], bot = [0, -R, 0];
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      M.tri(eq[j], eq[i], top, i & 1 ? HULL2 : HULL);
      M.tri(eq[i], eq[j], bot, i & 1 ? HULL : HULL2);
    }

    // six axis spikes, red tips
    var AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    AX.forEach(function (d, k) {
      var u = d[0] ? [0, 1, 0] : [1, 0, 0];
      var v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      var h = 2.6, b = [], sgn = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (var q = 0; q < 4; q++)
        b.push([d[0] * 7 + (sgn[q][0] * u[0] + sgn[q][1] * v[0]) * h,
                d[1] * 7 + (sgn[q][0] * u[1] + sgn[q][1] * v[1]) * h,
                d[2] * 7 + (sgn[q][0] * u[2] + sgn[q][1] * v[2]) * h]);
      M.capFan(b, [d[0] * 24, d[1] * 24, d[2] * 24], k & 1 ? TRIM : HULL2);
    });

    return M;
  }

  /* ================================================================== LANCER
     Telegraphed sniper: a mid-size angular gunship built around one long rail
     barrel. Purple accents; charge glow attaches at the muzzle. */
  function buildLancer() {
    var M = Mesh();
    var HULL = [0.16, 0.09, 0.26];
    var HULL2 = [0.11, 0.06, 0.19];
    var PLATE = [0.07, 0.04, 0.12];
    var TRIM = [0.64, 0.29, 1.00];
    var DARK = [0.04, 0.02, 0.07];
    var GLOW = [0.55, 0.22, 0.85];

    var S = [
      slabLoop(26, 4, 3.4, 1.4, 0),
      slabLoop(12, 8, 6, 2.4, 0),
      slabLoop(-8, 9, 6.6, 2.6, 0),
      slabLoop(-24, 6.5, 5, 2, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], HULL, HULL2);
    M.capCenter(S[0], PLATE);
    M.capCenter(S[3], DARK);

    // the rail: one long central barrel with a glowing emitter collar
    M.box(0, 0, 26, 2.4, 2.4, 30, PLATE, HULL2);
    M.box(0, 0, 40.5, 3.4, 3.4, 2.4, DARK);
    M.box(0, 0, 38.6, 2.9, 2.9, 1.0, GLOW);

    // flank rail pods + purple trim strips
    [1, -1].forEach(function (s) {
      M.box(s * 10.5, 0, -2, 4, 5.4, 22, HULL2, PLATE);
      M.quad([s * 12.55, 1.4, 7], [s * 12.55, 1.4, -11],
        [s * 12.55, 0.4, -11], [s * 12.55, 0.4, 7], TRIM);
    });

    // dorsal fin
    M.plate([0.5, 3.4, 2], [0.5, 9.6, -8], [0.5, 9.2, -12], [0.5, 3.0, -16],
      [-1, 0, 0], 1.0, HULL2, TRIM);

    // twin engine nozzles
    [1, -1].forEach(function (s) {
      var a = ringXY(s * 10.5, 0, -13, 2.6, 2.6, 6, PI / 6);
      var b = ringXY(s * 10.5, 0, -19, 2.1, 2.1, 6, PI / 6);
      M.skin(a, b, PLATE, HULL2);
      M.capCenter(b, GLOW);
    });

    return M;
  }

  /* =================================================================== CRATE */
  function buildCrate() {
    var M = Mesh();
    var s = 17, b = 12;
    var FACE = [0.86, 0.88, 0.92];
    var CORE = [0.98, 0.99, 1.00];
    var EDGE = [0.70, 0.73, 0.79];
    var CORN = [0.60, 0.63, 0.69];

    // 6 axis faces
    [[2, 1], [2, -1], [0, 1], [0, -1], [1, 1], [1, -1]].forEach(function (f) {
      var ax = f[0], sg = f[1];
      var u = (ax + 1) % 3, v = (ax + 2) % 3;
      var pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (c) {
        var p = [0, 0, 0]; p[ax] = sg * s; p[u] = c[0] * b; p[v] = c[1] * b; return p;
      });
      var col = (ax === 2) ? CORE : FACE;
      M.quad(pts[0], pts[1], pts[2], pts[3], col);
    });

    // 12 edge chamfers + 8 corner triangles
    var vs = [];
    [-1, 1].forEach(function (i) {
      [-1, 1].forEach(function (j) {
        [-1, 1].forEach(function (k) { vs.push([i, j, k]); });
      });
    });
    // edges: pairs of axes
    for (var ax = 0; ax < 3; ax++) {
      var u = (ax + 1) % 3, v = (ax + 2) % 3;
      [-1, 1].forEach(function (su) {
        [-1, 1].forEach(function (sv) {
          var p = [], q = [], r = [], t = [];
          function mk(a1, a2, a3) { var o = [0, 0, 0]; o[ax] = a1; o[u] = a2; o[v] = a3; return o; }
          p = mk(-b, su * s, sv * b); q = mk(b, su * s, sv * b);
          r = mk(b, su * b, sv * s); t = mk(-b, su * b, sv * s);
          M.quad(p, q, r, t, EDGE);
        });
      });
    }
    vs.forEach(function (c) {
      M.tri([c[0] * s, c[1] * b, c[2] * b], [c[0] * b, c[1] * s, c[2] * b], [c[0] * b, c[1] * b, c[2] * s], CORN);
    });

    return M;
  }

  /* =================================================================== SHARD
     A torn fragment of hull plate, for the debris that sprays off a hit.
     Deliberately NOT a primitive:
       - the outline is a ragged star-shaped polygon, radii from 0.27 to 0.72,
         so three deep notches alternate with long torn points;
       - the plate is BENT along an off-centre crease LINE (not a point, which
         would read as a low pyramid), and the two wings it folds into are
         deliberately unequal: one narrow and steeply dropped, one wide and
         shallow, so no view of it is symmetric;
       - thickness runs from a chunky sheared edge down to zero at the tears,
         so the rim is a band in places and a knife edge in others;
       - one tongue of skin is peeled up off the wide wing.
     Every face is flat-shaded, so the value steps between neighbouring facets
     hard-flicker as it tumbles. All hand-tabulated: identical every load. */
  function buildShard() {
    var M = Mesh();
    var SKIN = [0.215, 0.235, 0.285];   // painted outer hull
    var SKIN2 = [0.330, 0.355, 0.415];  // lighter panel facet
    var SKIN3 = [0.130, 0.145, 0.180];  // scorched facet
    var BACK = [0.095, 0.105, 0.130];   // shadowed inner face
    var BACK2 = [0.165, 0.180, 0.220];
    var TORN = [0.600, 0.630, 0.690];   // bright raw metal at the tear
    var TORN2 = [0.395, 0.420, 0.475];
    var RIB = [0.250, 0.265, 0.310];    // sheared structure inside the edge

    /* rim: angle, radius, top height, thickness. th 0 -> a knife-edge tear.
       Verts 0 and 4 are the two ends of the crease; 1-3 are the narrow steep
       wing, 5-7 the wide shallow one. */
    var R = [
      [0.00, 0.72, 0.075, 0.000],   // crease end, long torn point
      [0.55, 0.28, -0.115, 0.150],  // deep notch, steep wing
      [1.15, 0.46, -0.090, 0.200],  // thickest sheared edge
      [1.80, 0.27, -0.140, 0.130],  // deep notch
      [2.55, 0.58, 0.055, 0.000],   // crease end, torn point
      [3.35, 0.30, -0.010, 0.075],  // deep notch
      [4.15, 0.66, -0.030, 0.185],  // wide shallow wing
      [5.30, 0.56, -0.060, 0.000]   // torn point, forked either side of vert 0
    ];
    var N = R.length;
    var C = [[0.24, 0.150, 0.02], [-0.22, 0.120, 0.135]];  // the crease line
    var BOT = [0.02, 0.000, 0.06];                          // inner-face apex
    /* which crease point each rim edge's two ends fan to; a mismatched pair
       spans the crease and gets the extra bridging triangle */
    var E = [[0, 0], [0, 0], [0, 1], [1, 1], [1, 1], [1, 1], [1, 0], [0, 0]];
    /* facet palettes: irregular on purpose, so no two neighbours match */
    var TC = [SKIN2, SKIN, SKIN3, SKIN, SKIN2, SKIN, SKIN2, SKIN3];
    var BC = [BACK, BACK2, BACK, BACK, BACK2, BACK, BACK2, BACK];
    var EC = [TORN, RIB, TORN2, RIB, TORN, TORN2, RIB, TORN2];

    var RT = [], RB = [], i, j;
    for (i = 0; i < N; i++) {
      var a = R[i][0], r = R[i][1], x = r * cos(a), z = r * sin(a);
      RT.push([x, R[i][2], z]);
      RB.push([x, R[i][2] - R[i][3], z]);
    }

    /* outer skin, fanned to the crease. The rim runs +X toward +Z, so the
       winding is reversed relative to capFan to keep the normals facing out. */
    for (i = 0; i < N; i++) {
      j = (i + 1) % N;
      if (E[i][0] === E[i][1]) M.tri(RT[j], RT[i], C[E[i][0]], TC[i]);
      else M.quad(RT[j], RT[i], C[E[i][0]], C[E[i][1]], TC[i]);
    }
    /* inner face: a plain fan, it is the side you rarely catch */
    for (i = 0; i < N; i++) { j = (i + 1) % N; M.tri(RB[i], RB[j], BOT, BC[i]); }
    /* torn edge band. Zero-thickness spans collapse and Mesh.tri drops them;
       edge 5 is skipped because the peeled tongue below caps it instead. */
    for (i = 0; i < N; i++) {
      if (i === 5) continue;
      j = (i + 1) % N;
      M.quad(RT[i], RT[j], RB[j], RB[i], EC[i]);
    }

    /* Lip of skin peeled back off the wide wing's edge. A solid wedge standing
       on rim quad 5, tapering to a knife EDGE rather than to a point: a
       point-tipped spike collapses to a hairline whenever it is seen end-on,
       which reads as a rendering artefact rather than as metal. Kept short --
       any longer and it stops being buckled plate and starts being a fin. */
    var t0 = [-0.424, 0.090, -0.080], t1 = [-0.454, 0.085, -0.543];
    M.quad(RT[5], RT[6], t1, t0, TORN);        // outer face of the tongue
    M.quad(RB[6], RB[5], t0, t1, TORN2);       // inner face
    M.tri(RT[5], t0, RB[5], RIB);              // torn ends
    M.tri(RB[6], t1, RT[6], RIB);

    return fitUnit(M, 1.0);
  }

  /* ==================================================================== emit */
  var jet = buildJet(), drone = buildDrone(), cruiser = buildCruiser(),
    boss = buildBoss(), crate = buildCrate(), shard = buildShard(),
    striker = buildStriker(), mine = buildMine(), lancer = buildLancer(),
    carrier = buildCarrier(), dreadnought = buildDreadnought();

  return {
    jet: jet.build(),
    drone: drone.build(),
    cruiser: cruiser.build(),
    striker: striker.build(),
    mine: mine.build(),
    lancer: lancer.build(),
    mothership: boss.build(),
    carrier: carrier.build(),
    dreadnought: dreadnought.build(),
    crate: crate.build(),
    shard: shard.build(),
    attach: {
      jetNozzles: [[7.8, 5.6, -30.5], [-7.8, 5.6, -30.5]],
      jetMuzzles: [[9.4, -4.2, 27.2], [-9.4, -4.2, 27.2]],
      droneCore: [0, 0, 8.8],
      /* enemy hulls fly yaw≈PI, so mesh +z is world -z; these offsets are
         applied raw in world space (same convention as cruiserEngines) */
      strikerEngines: [[2.8, 0.4, 23], [-2.8, 0.4, 23]],
      mineCore: [0, 0, 0],
      lancerNose: [0, 0, -42],
      lancerEngines: [[10.5, 0, 19], [-10.5, 0, 19]],
      cruiserGuns: [[46, 0, 42], [54, 0, 42], [-46, 0, 42], [-54, 0, 42]],
      cruiserEngines: [[0, -1, -60], [11, -1, -60], [-11, -1, -60]],
      bossCore: [0, 50, 143],
      bossGuns: [
        [262, 46, 166], [-262, 46, 166],
        [262, 46, -44], [-262, 46, -44],
        [70, -34, 233], [-70, -34, 233]
      ],
      /* carrier/dreadnought hulls fly yaw≈PI, so their mesh +z (nose) is world
         -z — these are the mesh points with z negated, applied raw like the
         striker/lancer entries */
      carrierBays: [[-170, -6, -296], [0, -6, -296], [170, -6, -296]],
      carrierCore: [0, 11, -309],
      dreadSpine: [0, 12, -400],
      dreadGuns: [
        [180, 10, -108], [-180, 10, -108],
        [210, 10, -108], [-210, 10, -108],
        [240, 10, -108], [-240, 10, -108]
      ]
    }
  };
})();
