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

  /* ==================================================================== BOMB
     Free-fall nuclear warhead: blunt rounded nose at +z, a fat gunmetal
     casing with two raised lifting collars, a hot warning stripe around the
     mid-body, and four boxy swept fins in a cruciform at -z. Drawn nose-down
     by the caller. Only ever seen falling fast and small, so kept lean. */
  function buildBomb() {
    var M = Mesh();
    var STEEL = [0.255, 0.270, 0.300];  // dull gunmetal casing
    var STEEL2 = [0.190, 0.202, 0.228]; // second flank value
    var NOSE = [0.105, 0.112, 0.132];   // darker ballistic nose cone
    var NOSE2 = [0.070, 0.076, 0.092];
    var COLLAR = [0.345, 0.360, 0.395]; // raised band rings
    var DARK = [0.042, 0.046, 0.058];   // tail cap / shadowed detail
    var FIN = [0.165, 0.176, 0.205];
    var HOT = [0.92, 0.22, 0.06];       // warning stripe (red-amber)

    var N = 8, PH = PI / 8;
    function sec(z, r) { return ringXY(0, 0, z, r, r, N, PH); }

    /* casing loft, nose at +z. The two rings either side of z=0 sit a hair
       proud so the warning stripe reads as painted-on banding. */
    var S = [
      sec(29.0, 2.4),
      sec(26.5, 4.9),
      sec(21.0, 6.8),
      sec(14.0, 7.5),
      sec(4.0, 7.5),
      sec(0.2, 7.62),
      sec(-4.0, 7.62),
      sec(-12.0, 7.4),
      sec(-19.0, 7.0),
      sec(-25.0, 5.4)
    ];
    var COL = [NOSE, NOSE2, NOSE, STEEL, STEEL, HOT, STEEL, STEEL2, DARK];
    for (var i = 0; i < S.length - 1; i++)
      M.skin(S[i], S[i + 1], COL[i], shade(COL[i], 0.78));
    M.capCenter(S[0], NOSE2, [0, 0, 1]);   // blunt rounded tip at z=30
    M.capCenter(S[9], DARK);

    // two raised lifting collars clamped around the casing
    [[12.0, 9.0, 7.5], [-13.0, -16.5, 7.3]].forEach(function (c) {
      var zF = c[0], zR = c[1], rIn = c[2], rOut = rIn + 1.1;
      M.skin(sec(zF, rOut), sec(zF, rIn), COLLAR);       // forward annulus
      M.skin(sec(zF, rOut), sec(zR, rOut), COLLAR, shade(COLLAR, 0.74));
      M.skin(sec(zR, rIn), sec(zR, rOut), shade(COLLAR, 0.62));
    });

    // conduit raceway running along the spine to the fuze well
    M.box(0, 8.1, 6.0, 2.6, 2.2, 16, STEEL2, COLLAR);

    // four boxy swept fins in a cruciform
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (d) {
      var ux = d[0], uy = d[1], wx = -d[1], wy = d[0], t = 1.1;
      function p(rad, z) { return [ux * rad + wx * t, uy * rad + wy * t, z]; }
      M.plate(p(6.5, -9), p(13.2, -17), p(13.2, -28), p(4.2, -28),
        [-wx, -wy, 0], t * 2, FIN, STEEL2);
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

  /* ==================================================================== WASP
     Bio swarmer: segmented chitinous teardrop — small head, fat abdomen
     tapering to a stinger — two swept membrane wings and a pair of forward
     sting spikes. Sickly yellow-green flesh over darker chitin plates. Kept
     lean (~52 tris): they arrive five-to-eight at a time. */
  function buildWasp() {
    var M = Mesh();
    var FLESH = [0.20, 0.30, 0.08];
    var FLESH2 = [0.14, 0.22, 0.06];
    var CHIT = [0.09, 0.12, 0.05];
    var BIO = [0.55, 0.95, 0.25];
    var WING = [0.30, 0.46, 0.22];

    // body: head/thorax -> abdomen swell -> taper (nose at +z)
    var S = [
      hexLoop(8, 2.6, 1.8, 1.8, 0.2),
      hexLoop(-2, 4.2, 3.0, 3.0, -0.2),
      hexLoop(-14, 2.0, 1.5, 1.5, -0.8)
    ];
    M.skin(S[0], S[1], FLESH, CHIT);
    M.skin(S[1], S[2], FLESH2, CHIT);
    M.capFan(S[0], [0, 0.2, 16], CHIT);              // head point
    M.capFan(S[2], [0, -2.0, -26], BIO);             // rear stinger, glowing tip

    // swept membrane wings, double-sided (a single sheet vanishes edge-on
    // for half the flutter cycle otherwise)
    [1, -1].forEach(function (s) {
      var a = [s * 3.2, 1.8, 4], b = [s * 18, 4.4, -5],
        c = [s * 15.5, 4.2, -13], d = [s * 3.0, 1.6, -4];
      M.quad(a, b, c, d, WING);
      M.quad(d, c, b, a, shade(WING, 0.55));
    });
    // wing-root chitin plates
    [1, -1].forEach(function (s) {
      M.quad([s * 1.2, 2.6, 5], [s * 4.4, 2.2, 3], [s * 4.2, 2.0, -4], [s * 1.2, 2.4, -5], CHIT);
    });

    // forward sting spikes (thin double-sided blades)
    [1, -1].forEach(function (s) {
      var p0 = [s * 2.6, -1.4, 4], p1 = [s * 1.4, -2.4, 4], ap = [s * 2.4, -2.2, 15];
      M.tri(p0, p1, ap, BIO); M.tri(ap, p1, p0, shade(BIO, 0.5));
    });

    return M;
  }

  /* ================================================================= RAVAGER
     Organic gunship: bulbous pulsing abdomen aft, ribbed carapace plates down
     the back, five segmented tentacle stubs trailing behind, one asymmetric
     horn hooked off the right of its head. Nothing on it is machined — the
     silhouette is all lumps and trailing meat. */
  function buildRavager() {
    var M = Mesh();
    var FLESH = [0.24, 0.34, 0.09];
    var FLESH2 = [0.17, 0.25, 0.07];
    var CARAP = [0.10, 0.13, 0.05];
    var DARK = [0.05, 0.07, 0.03];
    var BIO = [0.55, 0.95, 0.25];
    var GLOW = [0.68, 1.00, 0.34];

    function sec(z, rx, ry, y) { return ringXY(0, y, z, rx, ry, 8, PI / 8); }

    // body loft, nose at +z, abdomen bulging aft-of-centre
    var S = [
      sec(34, 8, 7, 2),
      sec(20, 18, 15, 0),
      sec(2, 26, 22, -2),
      sec(-18, 24, 21, -3),
      sec(-34, 12, 11, -2)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? FLESH2 : FLESH, CARAP);
    M.capFan(S[0], [0, 1, 48], FLESH2);              // blunt snout
    M.capCenter(S[4], DARK);

    // ribbed carapace plates arched over the back
    [[24, 12, 15], [10, 17, 20], [-6, 18, 21], [-24, 13, 17]].forEach(function (r) {
      var z = r[0], w = r[1], yT = r[2];
      M.plate([-w, yT, z + 4], [w, yT, z + 4], [w, yT, z - 4], [-w, yT, z - 4],
        [0, 1, 0], 2.6, CARAP, DARK);
    });

    // five segmented tentacle stubs trailing aft (cone chains, 4-gon rings)
    [[10, -8], [-10, -8], [16, 3], [-16, 3], [0, -15]].forEach(function (t, k) {
      var cx = t[0], cy = t[1];
      var a = ringXY(cx, cy, -32, 3.6, 3.6, 4, PI / 4 + k);
      var b = ringXY(cx * 1.15, cy * 1.1, -46, 2.2, 2.2, 4, PI / 4 + k);
      M.skin(a, b, k & 1 ? FLESH2 : FLESH, CARAP);
      M.capFan(b, [cx * 1.3, cy * 1.2, -58], k === 4 ? BIO : FLESH2);
    });

    // asymmetric horn, hooked up-and-out off the right of the head
    var hb = [[5, 5, 28], [11, 4, 26], [10, 9, 23], [4, 8, 25]];
    M.quad(hb[3], hb[2], hb[1], hb[0], CARAP);
    M.capFan(hb, [17, 20, 34], CARAP);

    // glowing belly patch under the abdomen (spit sac — sprite rides here)
    M.quad([-8, -23.5, 8], [8, -23.5, 8], [7, -22.5, -10], [-7, -22.5, -10], GLOW);
    // a few bio pustules on the abdomen flanks
    [[24, 4, 4], [-25, 0, -6], [20, -8, -14]].forEach(function (p) {
      M.tri([p[0], p[1] + 3, p[2]], [p[0], p[1] - 2, p[2] + 3], [p[0] * 1.12, p[1], p[2] - 1], BIO);
    });

    return M;
  }

  /* =============================================================== LEVIATHAN
     Boss #4: a whale-like bio-titan in the mothership's size class. Tapered
     segmented body, a gaping maw recess at the nose, a dorsal spine ridge,
     rows of side tentacle-fins, and trailing tail tendrils. Nose at +z;
     attach points negated in z (same convention as carrier/dreadnought). */
  function buildLeviathan() {
    var M = Mesh();
    var FLESH = [0.185, 0.260, 0.075];
    var FLESH2 = [0.130, 0.195, 0.055];
    var CARAP = [0.080, 0.105, 0.040];
    var DARK = [0.030, 0.045, 0.020];
    var BIO = [0.55, 0.95, 0.25];
    var GLOW = [0.68, 1.00, 0.34];

    function sec(z, rx, ry, y) { return ringXY(0, y, z, rx, ry, 8, PI / 8); }

    // segmented body loft — big at the shoulders, tapering to the tail
    var S = [
      sec(300, 60, 45, 0),
      sec(210, 130, 95, 10),
      sec(80, 170, 120, 15),
      sec(-80, 150, 105, 20),
      sec(-220, 90, 65, 25),
      sec(-330, 40, 30, 30)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? FLESH2 : FLESH, CARAP);
    M.capCenter(S[S.length - 1], DARK);              // tail stump

    // gaping maw: the snout ring funnels back into a dark throat with a
    // glowing gullet plate (levMaw attach sits at the mouth)
    var maw = ringXY(0, -5, 255, 30, 22, 8, PI / 8);
    M.skin(S[0], maw, DARK);
    M.capCenter(maw, GLOW);
    // jaw lip teeth around the mouth rim
    for (i = 0; i < 6; i++) {
      var a = PI / 6 + i / 6 * TAU;
      var tx = 52 * cos(a), ty = 38 * sin(a);
      M.tri([tx * 0.9, ty * 0.9 - 2, 300], [tx * 1.15, ty * 1.15, 296], [tx * 0.8, ty * 0.8, 316], BIO);
    }

    // dorsal spine ridge: a row of swept fin-spikes down the back
    [[220, 88], [140, 116], [60, 132], [-20, 128], [-100, 118], [-180, 92]].forEach(function (p, k) {
      var z = p[0], yT = p[1], h = 34 + (k === 2 || k === 3 ? 14 : 0);
      M.plate([0.9, yT - 6, z + 16], [0.9, yT + h, z + 2], [0.9, yT + h - 6, z - 10], [0.9, yT - 6, z - 20],
        [-1, 0, 0], 2.6, CARAP, k & 1 ? BIO : FLESH2);
    });

    // side tentacle-fin rows, three per flank, drooping aft-and-down
    [1, -1].forEach(function (s) {
      [[150, 150], [20, 162], [-140, 132]].forEach(function (p) {
        var z = p[0], x0 = p[1];
        M.plate([s * (x0 - 45), -25, z + 32], [s * (x0 + 65), -80, z + 2],
          [s * (x0 + 50), -85, z - 40], [s * (x0 - 50), -30, z - 30],
          [0, -1, 0], 7, FLESH2, CARAP);
      });
    });

    // trailing tail tendrils (segmented cones, 4-gon rings)
    [[45, 10], [-45, 10], [25, 55], [-25, 55]].forEach(function (t, k) {
      var cx = t[0], cy = t[1];
      var a = ringXY(cx, cy, -320, 14, 14, 4, PI / 4 + k);
      var b = ringXY(cx * 1.3, cy * 1.2, -390, 8, 8, 4, PI / 4 + k);
      M.skin(a, b, k & 1 ? FLESH2 : FLESH, CARAP);
      M.capFan(b, [cx * 1.5, cy * 1.3, -450], FLESH2);
    });

    // spore vents: six diamond sphincters along the flanks — dark rim patch
    // with a glowing throat proud of it (levVents attach points sit on these;
    // sprites carry the pulse)
    [[160, 35, 120], [-160, 35, 120], [165, 30, 0], [-165, 30, 0], [140, 30, -120], [-140, 30, -120]]
      .forEach(function (v) {
        var s = v[0] > 0 ? 1 : -1, X = Math.abs(v[0]), y = v[1], z = v[2];
        var a = [s * X, y - 20, z], b = [s * X, y, z - 20], c = [s * X, y + 20, z], d = [s * X, y, z + 20];
        if (s > 0) M.quad(a, b, c, d, DARK); else M.quad(d, c, b, a, DARK);
        var a2 = [s * (X + 3), y - 9, z], b2 = [s * (X + 3), y, z - 9], c2 = [s * (X + 3), y + 9, z], d2 = [s * (X + 3), y, z + 9];
        if (s > 0) M.quad(a2, b2, c2, d2, GLOW); else M.quad(d2, c2, b2, a2, GLOW);
      });

    // belly ridge plates — keeps the underside from reading as a bare tube
    [[180, -70], [40, -95], [-100, -80]].forEach(function (p) {
      M.plate([-34, p[1], p[0] + 26], [34, p[1], p[0] + 26], [30, p[1], p[0] - 26], [-30, p[1], p[0] - 26],
        [0, -1, 0], 8, CARAP, DARK);
    });

    return M;
  }

  /* ================================================================== WARDEN
     Boss #5: an orbital gun platform, deliberately NOT a ship — no prow, no
     engines, no direction at all. A broad flat ring carried on six radial arms
     around a recessed iris, hanging face-on. update.js drives its roll from
     b.spin, so the whole silhouette turns: the arms ARE the pinwheel's tell,
     which only works because the ring reads as a clock face rather than a
     hull. Iris faces +z; attach points negated in z like every other hull. */
  function buildWarden() {
    var M = Mesh();
    var HULL = [0.230, 0.130, 0.040];
    var HULL2 = [0.160, 0.090, 0.028];
    var PLATE = [0.090, 0.050, 0.016];
    var STEEL = [0.300, 0.190, 0.070];
    var TRIM = [1.00, 0.60, 0.17];
    var DARK = [0.040, 0.022, 0.008];
    var GLOW = [1.00, 0.74, 0.34];

    var N = 12, RO = 342, RI = 268, i;
    function rr(r, z) { return ringXY(0, 0, z, r, r, N, PI / N); }

    // the ring: a flat annulus. Front face first, then back, then the two
    // walls — the hole through the middle is most of the read.
    var oF = rr(RO, 34), oB = rr(RO, -34), iF = rr(RI, 26), iB = rr(RI, -26);
    M.skin(oF, iF, HULL, HULL2);
    M.skin(iB, oB, HULL2, PLATE);
    M.skin(oB, oF, STEEL, HULL);
    M.skin(iF, iB, PLATE, DARK);
    // bright band standing proud of the outer wall
    M.skin(rr(348, -9), rr(348, 9), TRIM, shade(TRIM, 0.55));

    // six radial arms, hub to ring, each capped by a forward-poking muzzle pod
    for (i = 0; i < 6; i++) {
      var a = i / 6 * TAU, cx = cos(a), cy = sin(a), tx = -sin(a), ty = cos(a);
      var r0 = 86, r1 = 302, w = 30;
      M.plate(
        [cx * r0 - tx * w, cy * r0 - ty * w, 20],
        [cx * r1 - tx * w * 0.7, cy * r1 - ty * w * 0.7, 20],
        [cx * r1 + tx * w * 0.7, cy * r1 + ty * w * 0.7, 20],
        [cx * r0 + tx * w, cy * r0 + ty * w, 20],
        [0, 0, -1], 40, i & 1 ? HULL : HULL2, PLATE);
      var pA = ringXY(cx * 298, cy * 298, 30, 34, 34, 6, PI / 6);
      var pB = ringXY(cx * 298, cy * 298, 84, 24, 24, 6, PI / 6);
      M.skin(pA, pB, STEEL, HULL);
      M.capCenter(pB, GLOW);
    }

    // central hub: a stepped drum funnelling back into the iris throat
    M.skin(rr(112, -46), rr(98, 40), HULL, HULL2);
    M.capCenter(rr(112, -46), PLATE);
    M.skin(rr(98, 40), rr(76, 64), STEEL, HULL);
    M.skin(rr(76, 64), rr(30, 30), DARK);
    M.capCenter(rr(30, 30), GLOW);
    // iris shutter blades around the throat, alternating value so the hub
    // still reads as a turning aperture when the glow sprite is dim
    for (i = 0; i < 8; i++) {
      var ia = i / 8 * TAU, ja = ia + TAU / 8;
      M.tri([cos(ia) * 68, sin(ia) * 68, 42], [cos(ja) * 68, sin(ja) * 68, 42],
        [cos(ia) * 24, sin(ia) * 24, 36], i & 1 ? TRIM : STEEL);
    }

    // one marked arm. Six identical arms on a spinning disc strobe into a
    // static shape at the wrong rate — a single asymmetric blaze is what makes
    // the direction of rotation (and its reversal on a phase change) readable.
    M.plate([214, -22, 56], [300, -26, 56], [300, 26, 56], [214, 22, 56],
      [0, 0, -1], 8, TRIM, GLOW);

    return M;
  }

  /* =========================================================== HUNTER-KILLER
     Boss #6: a predator, not a capital ship. Lean deep fuselage, a long
     jutting sensor snout (the pounce charge sits at its tip), forward-SWEPT
     wings so the leading edges rake toward the camera, and engines sized for
     the dive. Nose at +z; attach points negated in z. */
  function buildHunter() {
    var M = Mesh();
    var HULL = [0.220, 0.055, 0.200];
    var HULL2 = [0.150, 0.035, 0.140];
    var PLATE = [0.080, 0.020, 0.075];
    var STEEL = [0.300, 0.090, 0.270];
    var TRIM = [1.00, 0.24, 0.94];
    var DARK = [0.045, 0.010, 0.040];
    var GLOW = [1.00, 0.55, 0.95];

    var S = [
      hexLoop(150, 26, 20, 18, 0),
      hexLoop(60, 54, 40, 38, 0),
      hexLoop(-40, 62, 46, 44, 0),
      hexLoop(-150, 40, 30, 26, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? HULL2 : HULL, STEEL);
    M.capFan(S[0], [0, -8, 252], STEEL);             // snout
    M.capCenter(S[3], DARK);
    // snout collar + emitter ring at the tip (hunterNose attach)
    M.box(0, -6, 200, 26, 26, 60, PLATE, STEEL);
    M.box(0, -6, 236, 34, 34, 10, DARK);
    M.box(0, -6, 231, 26, 26, 4, GLOW);

    // forward-swept wings: tip chord sits AHEAD of the root chord
    [1, -1].forEach(function (s) {
      var p0 = [s * 46, 4, 44], p1 = [s * 152, -12, 104],
        p2 = [s * 148, -12, 46], p3 = [s * 44, 4, -70];
      if (s < 0) M.plate(p3, p2, p1, p0, [0, -1, 0], 11, STEEL, HULL2);
      else M.plate(p0, p1, p2, p3, [0, -1, 0], 11, STEEL, HULL2);
      // magenta leading edge
      M.quad([s * 48, 5.2, 44], [s * 152, -10.8, 104],
        [s * 148, -10.8, 96], [s * 50, 5.2, 36], TRIM);
      // rake gun pod slung under the wing root
      M.box(s * 62, -34, 60, 26, 24, 130, HULL2, PLATE);
      M.box(s * 62, -34, 132, 12, 12, 40, STEEL);
      M.box(s * 62, -34, 154, 17, 17, 6, DARK);
    });

    // canted twin tails, raked hard back
    [1, -1].forEach(function (s) {
      M.plate([s * 30, 18, -70], [s * 76, 96, -104],
        [s * 70, 94, -146], [s * 26, 16, -152], [s * 1, 0, 0], 8, HULL2, TRIM);
    });
    // ventral strakes keep the belly from reading as a bare tube
    [1, -1].forEach(function (s) {
      M.plate([s * 22, -40, 20], [s * 52, -88, -40],
        [s * 46, -86, -96], [s * 20, -38, -110], [s * 1, 0, 0], 7, HULL2, PLATE);
    });

    // twin oversized engines
    [1, -1].forEach(function (s) {
      var a = ringXY(s * 52, 6, -140, 34, 34, 8, PI / 8);
      var b = ringXY(s * 52, 6, -186, 27, 27, 8, PI / 8);
      M.skin(a, b, HULL2, PLATE);
      var c = ringXY(s * 52, 6, -180, 17, 17, 8, PI / 8);
      M.skin(b, c, DARK);
      M.capCenter(c, GLOW);
      // flank trim strip along the nacelle
      M.quad([s * 88, 14, -132], [s * 88, 14, -186],
        [s * 88, 4, -186], [s * 88, 4, -132], TRIM);
    });

    return M;
  }

  /* ================================================================== VESPER
     Boss #7: a living thing, not a hull — nothing on it is machined. Lumpy
     fur-ridged torso, a big eared head with an open fanged maw (the bite
     tell: sprites ride batMaw and the batEye pits), hind claws tucked up
     under the rump for the dive. The wings are NOT here — they are separate
     meshes rooted at the shoulders, so scene-draw can roll them about their
     own origin as the flap hinge. Nose at +z; attach points negated in z. */
  function buildBat() {
    var M = Mesh();
    var FUR = [0.100, 0.085, 0.115];
    var FUR2 = [0.072, 0.060, 0.088];
    var CHEST = [0.160, 0.140, 0.170];
    var BONE = [0.55, 0.50, 0.44];
    var TOOTH = [0.85, 0.82, 0.74];
    var DARK = [0.032, 0.026, 0.042];
    var MAW = [0.40, 0.075, 0.105];

    /* lumpy ring: two sine harmonics on the radius, phase per ring, so the
       ridges wander down the body like matted fur instead of tiling */
    function lump(z, rx, ry, y, j, ph) {
      var o = [], n = 10, i, a, k;
      for (i = 0; i < n; i++) {
        a = i / n * TAU + PI / n;
        k = 1 + j * sin(a * 3 + ph) + j * 0.6 * sin(a * 5 + ph * 2.1);
        o.push([rx * k * cos(a), y + ry * k * sin(a), z]);
      }
      return o;
    }
    /* the belly facets get the lighter chest fur */
    function skinF(A, B) {
      for (var i = 0; i < A.length; i++) {
        var jn = (i + 1) % A.length;
        M.quad(A[i], A[jn], B[jn], B[i], (i >= 5 && i <= 8) ? CHEST : (i & 1 ? FUR2 : FUR));
      }
    }

    // torso loft, neck to rump — fat in the middle, sagging slightly
    var S = [
      lump(50, 25, 24, 10, 0.05, 0.7),
      lump(40, 38, 35, 6, 0.07, 2.1),
      lump(10, 50, 46, 0, 0.08, 4.4),
      lump(-25, 55, 50, -4, 0.08, 1.3),
      lump(-60, 42, 38, -2, 0.07, 3.6),
      lump(-85, 22, 20, 2, 0.05, 5.2)
    ];
    for (var i = 0; i < S.length - 1; i++) skinF(S[i], S[i + 1]);
    M.capCenter(S[S.length - 1], FUR2, [0, -2, -14]);  // rump, tucked tail stub

    // head: brow-heavy skull, short muzzle
    var H = [
      lump(118, 20, 16, 8, 0.04, 0.4),
      lump(101, 30, 26, 12, 0.05, 2.8),
      lump(76, 34, 30, 14, 0.05, 5.0),
      lump(56, 27, 25, 12, 0.04, 1.9)
    ];
    for (i = 0; i < H.length - 1; i++) skinF(H[i], H[i + 1]);
    M.skin(H[3], S[0], FUR2, FUR);                     // nape into shoulders

    // open maw: the muzzle ring puckers forward into a lip, then funnels
    // back into a red throat (batMaw glow rides at the mouth plane)
    var mw = ringXY(0, 3, 121, 14, 10, 10, PI / 10);
    var th = ringXY(0, 2, 98, 6, 4, 10, PI / 10);
    M.skin(H[0], mw, FUR2, DARK);
    M.skin(mw, th, MAW, shade(MAW, 0.6));
    M.capCenter(th, DARK);
    // teeth ring the lip: thin double-sided fangs, canines longest, uppers
    // pointing down and lowers up so the mouth reads open even in silhouette
    for (i = 0; i < 8; i++) {
      var a = i / 8 * TAU + PI / 8, up = sin(a) > 0 ? 1 : -1;
      var tx = 14 * cos(a), ty = 3 + 10 * sin(a);
      var dx = -sin(a) * 3.2, dy = cos(a) * 2.4;
      var fl = (i === 1 || i === 2 || i === 5 || i === 6) ? 11 : 6;
      var p0 = [tx + dx, ty + dy, 120.5], p1 = [tx - dx, ty - dy, 120.5];
      var ap = [tx * 0.55, ty - up * fl, 124];
      M.tri(p0, p1, ap, TOOTH); M.tri(ap, p1, p0, shade(TOOTH, 0.62));
    }
    // nose-leaf: the little upturned flap that says "bat" from the front
    M.tri([-3.5, 11, 120], [3.5, 11, 120], [0, 19, 116], FUR2);
    M.tri([0, 19, 116], [3.5, 11, 120], [-3.5, 11, 120], CHEST);

    // tall pointed ears, leaning out and back, with a dark inner notch
    [1, -1].forEach(function (s) {
      var b = ringXZ(s * 19, 72, 40, 9, 7, 5, s * 0.6);
      M.capFan(b, [s * 30, 96, 62], FUR2);
      M.tri([s * 14, 46, 78], [s * 24, 46, 74], [s * 28, 86, 63], DARK);
      M.tri([s * 28, 86, 63], [s * 24, 46, 74], [s * 14, 46, 78], shade(DARK, 0.7));
      // brow ridge shelving over the eye pit
      M.quad([s * 5, 22, 108], [s * 20, 20, 103], [s * 18, 16, 110], [s * 4, 18, 113], FUR2);
      // the pit itself — the eye ember sprite sits here (batEyeL/R)
      M.quad([s * 9, 20, 106], [s * 17, 19, 103], [s * 16, 14, 105], [s * 8, 15, 108], DARK);
    });

    // shoulder knots the wing meshes socket into (batWing attach roots)
    [1, -1].forEach(function (s) {
      var a2 = ringXY(s * 30, 22, 30, 10, 9, 6, PI / 6);
      var b2 = ringXY(s * 30, 22, 6, 11, 10, 6, PI / 6);
      M.skin(a2, b2, FUR, FUR2);
      M.capCenter(a2, FUR2);
    });

    // hind claws tucked under the rump, bone hooks raked back
    [1, -1].forEach(function (s) {
      var a3 = ringXY(s * 20, -30, -58, 6, 6, 4, PI / 4);
      var b3 = ringXY(s * 26, -40, -80, 3.6, 3.6, 4, PI / 4);
      M.skin(a3, b3, FUR2, FUR);
      M.capFan(b3, [s * 30, -35, -94], BONE);
    });

    // matted fur tufts scattered down the back
    [[8, 46, 30, 1], [-14, 44, 6, -1], [20, 40, -18, 1], [-6, 47, -34, -1],
    [26, 30, 52, 1], [-24, 34, -52, -1], [0, 45, -8, 1], [15, 43, 14, -1]]
      .forEach(function (p) {
        var x = p[0], y = p[1], z = p[2], d = p[3];
        M.tri([x - 4, y - 2, z], [x + 4, y - 2, z], [x + d * 5, y + 9, z - 5], FUR2);
        M.tri([x + d * 5, y + 9, z - 5], [x + 4, y - 2, z], [x - 4, y - 2, z], FUR);
      });

    return M;
  }

  /* bat wing: arm bone lofted shoulder->elbow->wrist, four finger-bone
     ridges fanning from the wrist, dark membrane cambered between them.
     The ORIGIN is the shoulder hinge — scene-draw composes the mesh at the
     batWing attach point and adds the flap into roll, so nothing here may
     stray to -x (it would sweep through the body on the upstroke). Built
     per side; the ring angle runs backwards on the mirror so lofted tube
     normals stay outward. Membranes and ridges are double-sided anyway. */
  function buildBatWing(s) {
    var M = Mesh();
    var BONE = [0.55, 0.50, 0.44];
    var BONE2 = [0.40, 0.36, 0.32];
    var MEMB = [0.150, 0.090, 0.150];
    var MEMB2 = [0.095, 0.055, 0.100];
    var FUR = [0.100, 0.085, 0.115];

    function ring(cx, cy, cz, r, n, ph) {
      var o = [], i, a;
      for (i = 0; i < n; i++) {
        a = (ph || 0) + s * (i / n) * TAU;
        o.push([s * cx, cy + r * sin(a), cz + r * cos(a)]);
      }
      return o;
    }
    // arm: furred at the shoulder, bone at the wrist, a thumb hook on top
    var A0 = ring(0, 0, 0, 10, 6, 0.3),
      A1 = ring(58, -4, 10, 7.5, 6, 0.3),
      A2 = ring(102, 0, 20, 5.5, 6, 0.3);
    M.skin(A0, A1, FUR, BONE2);
    M.skin(A1, A2, BONE2, BONE);
    M.capCenter(A0, FUR);
    M.capFan(ring(102, 2, 24, 3.2, 4, 0.5), [s * 112, 12, 40], BONE);

    // four fingers fan from the wrist; membrane sags -y between them
    var W = [102, 0, 20];
    var TIP = [[170, -7, 38], [176, -11, 4], [158, -15, -30], [122, -17, -58]];
    function fp(f, t) {
      var e = TIP[f];
      return [s * (W[0] + (e[0] - W[0]) * t),
      W[1] + (e[1] - W[1]) * t - 7 * sin(PI * t),
      W[2] + (e[2] - W[2]) * t];
    }
    var TS = [0, 0.45, 0.75, 1], f, k;
    for (f = 0; f < 3; f++) {
      for (k = 0; k < TS.length - 1; k++) {
        var qa = fp(f, TS[k]), qb = fp(f, TS[k + 1]),
          qc = fp(f + 1, TS[k + 1]), qd = fp(f + 1, TS[k]);
        M.quad(qa, qb, qc, qd, k & 1 ? MEMB2 : MEMB);
        M.quad(qd, qc, qb, qa, shade(k & 1 ? MEMB2 : MEMB, 0.62));
      }
    }
    // trailing web from the last finger back to the wing root
    var R = [s * 10, -6, -46], SH = [s * 2, -2, -8];
    for (k = 0; k < TS.length - 1; k++) {
      var wa = fp(3, TS[k]), wb = fp(3, TS[k + 1]);
      M.tri(wa, wb, R, MEMB2); M.tri(R, wb, wa, shade(MEMB2, 0.62));
    }
    M.tri(fp(3, 0), R, SH, MEMB); M.tri(SH, R, fp(3, 0), shade(MEMB, 0.62));

    // finger-bone ridges standing proud of the membrane, following its sag
    for (f = 0; f < 4; f++) {
      var P = [fp(f, 0), fp(f, 0.5), fp(f, 1)];
      for (k = 0; k < 2; k++) {
        var q0 = P[k], q1 = P[k + 1];
        M.quad([q0[0], q0[1] + 2.2, q0[2]], [q1[0], q1[1] + 2.2, q1[2]],
          [q1[0], q1[1] - 2.2, q1[2]], [q0[0], q0[1] - 2.2, q0[2]], f & 1 ? BONE2 : BONE);
        M.quad([q0[0], q0[1] - 2.2, q0[2]], [q1[0], q1[1] - 2.2, q1[2]],
          [q1[0], q1[1] + 2.2, q1[2]], [q0[0], q0[1] + 2.2, q0[2]], shade(BONE2, 0.7));
      }
    }
    // one claw off the leading finger tip
    M.tri(fp(0, 1), [s * 182, -12, 44], [s * 172, -2, 40], BONE);
    M.tri([s * 172, -2, 40], [s * 182, -12, 44], fp(0, 1), BONE2);

    return M;
  }

  /* ================================================================= PHANTOM
     Boss #8: a blade that is mostly absence — a thin manta body split into
     twin forward prongs bracketing a hollow intake throat (phanCore glows
     in it). It teleports: scene-draw shrinks and blackens this hull through
     the blink, so the read must survive tiny scale — few, large,
     high-contrast facets, one hot ring. Nose at +z; attach negated in z. */
  function buildPhantom() {
    var M = Mesh();
    var HULL = [0.120, 0.080, 0.180];
    var HULL2 = [0.082, 0.052, 0.130];
    var PLATE = [0.048, 0.030, 0.082];
    var STEEL = [0.185, 0.130, 0.270];
    var TRIM = [1.00, 0.24, 0.94];
    var DARK = [0.030, 0.018, 0.050];
    var GLOW = [1.00, 0.52, 0.96];

    // wide flat manta body
    var S = [
      slabLoop(140, 26, 11, 5, 0),
      slabLoop(80, 74, 19, 8, 0),
      slabLoop(10, 122, 25, 10, -2),
      slabLoop(-70, 92, 20, 8, -2),
      slabLoop(-135, 42, 13, 5, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? HULL2 : HULL, STEEL);
    M.capCenter(S[S.length - 1], DARK);

    // split prow: twin tines bracketing the intake (phanGuns at the tips)
    [1, -1].forEach(function (s) {
      function pr(z, w, h) {
        var l = slabLoop(z, w, h, Math.min(w, h) * 0.36, 0), o = [], k;
        for (k = 0; k < l.length; k++) o.push([l[k][0] + s * 34, l[k][1] + 2, l[k][2]]);
        return o;
      }
      var p0 = pr(130, 16, 9), p1 = pr(190, 10, 6), p2 = pr(226, 5, 3);
      M.skin(p0, p1, STEEL, HULL2);
      M.skin(p1, p2, HULL, PLATE);
      M.capFan(p2, [s * 32, 2, 246], TRIM);
      // magenta razor strip down each prong's inner face
      M.quad([s * 26, 5, 224], [s * 26, 5, 136], [s * 26, -2, 136], [s * 26, -2, 224], TRIM);
    });

    // the hollow: an intake throat between the prongs, glow plate deep in it
    var t0 = ringXY(0, 2, 132, 26, 15, 8, PI / 8);
    var t1 = ringXY(0, 2, 96, 11, 7, 8, PI / 8);
    M.skin(S[0], t0, HULL2, PLATE);                    // nose lip
    M.skin(t0, t1, DARK);
    M.capCenter(t1, GLOW);
    // proud emitter ring around the mouth — the one thing that stays bright
    // as the collapse tint drags everything else to black
    M.skin(ringXY(0, 2, 134, 30, 18, 8, PI / 8), ringXY(0, 2, 127, 33, 21, 8, PI / 8), TRIM, shade(TRIM, 0.5));

    // razor wings with a raked tip barb past the trailing edge
    [1, -1].forEach(function (s) {
      var w0 = [s * 48, 6, 66], w1 = [s * 196, -6, -34], w2 = [s * 168, -8, -66], w3 = [s * 44, 4, -52];
      if (s < 0) M.plate(w3, w2, w1, w0, [0, -1, 0], 5, STEEL, HULL2);
      else M.plate(w0, w1, w2, w3, [0, -1, 0], 5, STEEL, HULL2);
      M.quad([s * 50, 6.6, 66], [s * 196, -5.4, -34], [s * 190, -5.4, -40], [s * 52, 6.6, 58], TRIM);
      var b0 = [s * 188, -6, -38], b1 = [s * 226, -10, -90], b2 = [s * 214, -10, -102], b3 = [s * 176, -7, -58];
      if (s < 0) M.plate(b3, b2, b1, b0, [0, -1, 0], 3.5, HULL, PLATE);
      else M.plate(b0, b1, b2, b3, [0, -1, 0], 3.5, HULL, PLATE);
    });

    // canted twin tail blades, ventral keel, dorsal seam ridge
    [1, -1].forEach(function (s) {
      M.plate([s * 22, 8, -96], [s * 58, 44, -128], [s * 52, 42, -150], [s * 19, 7, -146], [s * 1, 0, 0], 4, HULL2, TRIM);
    });
    M.plate([0.5, -10, -60], [0.5, -34, -104], [0.5, -32, -128], [0.5, -9, -132], [-1, 0, 0], 3.5, HULL2, PLATE);
    M.plate([1.5, 12, 96], [1.5, 22, 20], [1.5, 20, -60], [1.5, 10, -96], [-1, 0, 0], 3, STEEL, HULL2);
    M.quad([1.55, 21.2, 10], [1.55, 21.2, -50], [-1.55, 21.2, -50], [-1.55, 21.2, 10], TRIM);

    return M;
  }

  /* ============================================================= HIVE MOTHER
     Boss #9: the colossal jelly from the intro cinematic, grown to the
     game's biggest organic. Deliberately not a dome — the apex sits well
     off-centre and a low spur runs out the other side, so the silhouette
     says "creature" before any surface detail lands (same trick as the
     cinematic carapace). Jittered disc lofts, two scalloped skirt frills,
     eight pustule blisters (spore sprites ride them), a maw funnel under
     the bell biased toward the player, and purple vein runs matching the
     cinematic's flesh tone. Tentacles are separate chained meshes. The
     membrane armor cycle is all sprites — the mesh is always the open
     animal. Attach points negated in z. */
  function buildHiveMother() {
    var M = Mesh();
    var FLESH = [0.185, 0.260, 0.075];
    var FLESH2 = [0.130, 0.195, 0.055];
    var CARAP = [0.080, 0.105, 0.040];
    var DARK = [0.030, 0.045, 0.020];
    var BIO = [0.55, 0.95, 0.25];
    var GLOW = [0.68, 1.00, 0.34];
    var VEIN = [0.375, 0.205, 0.305];
    var THROAT = [0.32, 0.16, 0.10];
    var RZ = 0.76, i;

    /* jittered bell disc: two sine harmonics on the radius so the rim
       scallops and no two heights line up; ox drifts the apex off-centre */
    function disc(y, r, ox, j, ph) {
      var o = [], n = 14, k, a, w;
      for (k = 0; k < n; k++) {
        a = k / n * TAU;
        w = 1 + j * sin(a * 3 + ph) + j * 0.55 * sin(a * 5 + ph * 2.3);
        o.push([ox + r * w * sin(a), y, RZ * r * w * cos(a)]);
      }
      return o;
    }

    // the bell, rim to apex — apex walks toward -x as it climbs
    var B = [
      disc(-40, 275, 0, 0.06, 1.1),
      disc(10, 262, -8, 0.07, 3.0),
      disc(58, 225, -18, 0.06, 5.2),
      disc(98, 170, -26, 0.05, 0.6),
      disc(128, 105, -30, 0.05, 2.4),
      disc(148, 48, -26, 0.04, 4.1)
    ];
    for (i = 0; i < B.length - 1; i++) M.skin(B[i], B[i + 1], i & 1 ? FLESH2 : FLESH, CARAP);
    M.capCenter(B[B.length - 1], FLESH, [0, 14, 0]);   // rounded apex

    // the low spur off the +x rim — the asymmetry that reads at any distance
    var sp0 = disc(-34, 64, 246, 0.08, 0.2), sp1 = disc(-2, 40, 268, 0.08, 1.7);
    for (i = 0; i < sp0.length; i++) { sp0[i][2] *= 0.72; sp1[i][2] *= 0.72; }
    M.skin(sp0, sp1, FLESH2, CARAP);
    M.capCenter(sp1, FLESH2, [10, 10, 0]);

    // two layered skirt frills under the rim, scalloped hard, double-sided
    // (the underside is what the player mostly sees)
    var s1a = disc(-42, 268, 0, 0.05, 2.0), s1b = disc(-80, 300, 4, 0.09, 2.0);
    var s2a = disc(-56, 225, -6, 0.06, 4.2), s2b = disc(-96, 250, -2, 0.10, 4.2);
    M.skin(s1b, s1a, FLESH2, CARAP);
    M.skin(s1a, s1b, shade(FLESH2, 0.55));
    M.skin(s2b, s2a, FLESH, CARAP);
    M.skin(s2a, s2b, shade(FLESH, 0.5));

    // under-bell: a dark ceiling drawing in to the maw funnel, biased +z
    // (mesh +z is the player side under yaw≈PI) — motherMaw rides the mouth
    var uB = disc(-55, 150, 0, 0.05, 3.3);
    var mw = ringXZ(0, 40, -88, 58, 46, 14, 0.2);
    var gu = ringXZ(0, 34, -58, 24, 19, 14, 0.2);
    M.skin(uB, B[0], shade(FLESH2, 0.6), shade(CARAP, 0.8));
    M.skin(mw, uB, DARK, shade(DARK, 0.8));
    M.skin(mw, gu, THROAT, shade(THROAT, 0.62));
    M.capCenter(gu, GLOW, [0, -6, 0]);
    // palps around the mouth rim, glowing tips hanging into the gape
    for (i = 0; i < 7; i++) {
      var pa = i / 7 * TAU + 0.4;
      var px = 62 * sin(pa), pz = 40 + 50 * cos(pa);
      M.tri([px - 5, -86, pz], [px + 5, -86, pz], [px * 1.08, -108, pz * 1.08 - 3], BIO);
      M.tri([px * 1.08, -108, pz * 1.08 - 3], [px + 5, -86, pz], [px - 5, -86, pz], shade(BIO, 0.5));
    }

    // eight pustule blisters erupting from the upper bell (motherPusts —
    // positions are duplicated in the attach table, keep them in sync)
    [[61, 70, 146, 17], [212, 36, 67, 20], [143, 82, -74, 15], [50, 22, -187, 18],
    [-128, 76, -129, 14], [-240, 44, -55, 16], [-209, 66, 76, 13], [-104, 29, 174, 15]]
      .forEach(function (p, k) {
        var b = ringXZ(p[0], p[2], p[1] - 4, p[3], p[3] * 0.82, 6, k);
        var t = ringXZ(p[0] + 2, p[2] - 2, p[1] + p[3] * 0.5, p[3] * 0.6, p[3] * 0.5, 6, k);
        M.skin(b, t, FLESH2, CARAP);
        M.capCenter(t, BIO, [0, p[3] * 0.35, 0]);
      });

    // purple vein runs crawling rim-to-apex, a hair proud of the bell
    var PROF = [[-40, 275, 0], [10, 262, -8], [58, 225, -18], [98, 170, -26], [126, 108, -30]];
    [0.5, 1.35, 2.6, 3.4, 4.5, 5.6].forEach(function (a, vi) {
      var dw = 0.055 + 0.02 * sin(vi * 3.1), lim = 4 - (vi & 1);
      var pt = function (row, da) {
        return [row[2] + row[1] * 1.025 * sin(a + da), row[0], RZ * row[1] * 1.025 * cos(a + da)];
      };
      for (var k = 0; k < lim; k++) {
        var A = PROF[k], Bb = PROF[k + 1];
        M.quad(pt(A, -dw), pt(A, dw), pt(Bb, dw * 0.8), pt(Bb, -dw * 0.8), VEIN);
        M.quad(pt(Bb, -dw * 0.8), pt(Bb, dw * 0.8), pt(A, dw), pt(A, -dw), shade(VEIN, 0.6));
      }
    });

    // root nubs under the rim where the tentacle chains hang (motherRoots —
    // same coordinates, z negated, in the attach table)
    [[61, 180], [154, 103], [239, 13], [162, -89], [84, -179],
    [-75, -153], [-201, -107], [-195, -2], [-196, 99], [-69, 150]]
      .forEach(function (p, k) {
        var a = ringXZ(p[0], p[1], -46, 13, 11, 6, k * 0.9);
        var b = ringXZ(p[0], p[1], -70, 8, 7, 6, k * 0.9);
        M.skin(b, a, k & 1 ? FLESH : FLESH2, CARAP);
        M.capCenter(b, CARAP);
      });

    return M;
  }

  /* hive mother tentacle segment: a tapered ~55-long tube rooted at its TOP
     (origin), hanging -y. scene-draw chains A->B->C with analytic sway
     offsets, so the segment carries wobble and sucker nubs but no built-in
     curl that would fight the chain. A is the trunk, C tapers to a lit tip. */
  function buildMotherTent(r0, r1, ph, tip) {
    var M = Mesh();
    var FLESH = [0.185, 0.260, 0.075];
    var FLESH2 = [0.130, 0.195, 0.055];
    var CARAP = [0.080, 0.105, 0.040];
    var BIO = [0.55, 0.95, 0.25];
    var rings = [], NR = 4, i;
    for (i = 0; i < NR; i++) {
      var t = i / (NR - 1);
      var r = (r0 + (r1 - r0) * t) * (1 + 0.08 * sin(t * 9 + ph));
      rings.push(ringXZ(sin(ph + t * 2.4) * 2.5, cos(ph * 1.7 + t * 2) * 2, -55 * t, r, r * 0.92, 7, ph + t));
    }
    for (i = NR - 1; i > 0; i--) M.skin(rings[i], rings[i - 1], i & 1 ? FLESH : FLESH2, CARAP);
    M.capCenter(rings[0], FLESH2);                     // plug hides the joint
    if (tip) M.capFan(rings[NR - 1], [sin(ph) * 4, -68, 2], BIO);
    else M.capCenter(rings[NR - 1], FLESH2, [0, -3, 0]);
    // sucker nubs spiralling down one side
    for (i = 0; i < 5; i++) {
      var ty = -8 - i * 9.5, a = ph + i * 1.9;
      var rr = (r0 + (r1 - r0) * (-ty / 55)) * 1.02;
      var nx = rr * sin(a), nz = rr * 0.92 * cos(a);
      M.tri([nx, ty + 3, nz], [nx * 1.18, ty - 1, nz * 1.18], [nx, ty - 4, nz], BIO);
      M.tri([nx, ty - 4, nz], [nx * 1.18, ty - 1, nz * 1.18], [nx, ty + 3, nz], shade(BIO, 0.5));
    }
    return M;
  }

  /* ================================================================= GOLIATH
     Boss #10: the biggest hull in the game, and it must LOOK it — wider than
     the warden's ring, deeper than the carrier's deck. A layered slab
     fortress: central citadel stack, flanking armour wings, a six-gun chin
     row spanning the ~600-unit rake width, gantry masts and a comm dish up
     top, four engine banks aft. All of it proudly machined — box and
     rectFrust greebles everywhere the organics forbid them. The shell is a
     coffin: when it breaks a leviathan crawls out, so the amber power seams
     double as the crack lines the reveal FX will trace. Nose at +z; attach
     points negated in z. */
  function buildGoliath() {
    var M = Mesh();
    var GUN = [0.160, 0.170, 0.190];
    var GUN2 = [0.100, 0.110, 0.130];
    var PLATE = [0.062, 0.068, 0.082];
    var STEEL = [0.230, 0.240, 0.270];
    var TRIM = [1.00, 0.60, 0.17];
    var DARK = [0.034, 0.037, 0.046];
    var GLOW = [1.00, 0.74, 0.34];
    var i;

    // main hull: five armoured slab stations, blunt ram bow
    var S = [
      slabLoop(400, 120, 55, 22, 0),
      slabLoop(240, 255, 92, 34, 0),
      slabLoop(40, 300, 100, 40, 0),
      slabLoop(-180, 272, 96, 36, 0),
      slabLoop(-345, 195, 72, 26, 0)
    ];
    for (i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? GUN2 : GUN, PLATE);
    M.capCenter(S[0], PLATE, [0, 0, 40]);              // blunt ram face
    M.capCenter(S[S.length - 1], DARK);

    // flanking armour wings: the width that dwarfs everything else
    [1, -1].forEach(function (s) {
      M.box(s * 352, 8, -30, 130, 85, 470, GUN2, PLATE);
      M.box(s * 352, 56, -60, 110, 22, 380, PLATE, GUN);
      var f = M.rectFrust(s * 352, 8, 205, 305, 60, 40, 26, 16, GUN);
      M.quad(f[0], f[1], f[2], f[3], PLATE);           // wedge cap
      // amber power seam down the outboard face — the reveal's crack line
      M.quad([s * 417.2, 22, 120], [s * 417.2, 22, -180], [s * 417.2, 10, -180], [s * 417.2, 10, 120], TRIM);
      M.box(s * 352, -42, 150, 90, 26, 120, PLATE, GUN2);   // underslung sponson
    });

    // citadel stack + gantry masts (one deliberately taller — asymmetry)
    M.box(0, 128, -70, 230, 75, 270, GUN, STEEL);
    M.box(0, 186, -100, 130, 44, 150, GUN2, STEEL);
    M.quad([-52, 152, 65.4], [52, 152, 65.4], [52, 138, 65.4], [-52, 138, 65.4], TRIM);  // command glass
    M.box(70, 230, -130, 12, 52, 12, PLATE);
    M.box(-34, 244, -150, 8, 62, 8, PLATE);
    // forward gantry arms reaching over the foredeck
    [1, -1].forEach(function (s) {
      M.box(s * 105, 152, 70, 26, 16, 230, GUN2, PLATE);
      M.box(s * 105, 122, 150, 12, 46, 14, PLATE);     // support strut
    });
    // comm dish, offset starboard: a shallow funnel facing forward
    var dA = ringXY(150, 205, -36, 34, 34, 8, PI / 8);
    var dB = ringXY(150, 205, -14, 10, 10, 8, PI / 8);
    M.skin(dA, dB, STEEL, GUN);
    M.capCenter(dB, DARK);
    M.box(150, 178, -44, 10, 30, 10, PLATE);

    // chin bar and the six-gun rake row (golGuns — mirrored in attach)
    M.box(0, -78, 275, 570, 52, 95, GUN2, PLATE);
    [-280, -180, -80, 80, 180, 280].forEach(function (x, k) {
      M.box(x, -78, 335, 54, 42, 65, k & 1 ? GUN : GUN2, STEEL);
      M.box(x, -78, 390, 17, 17, 58, STEEL);
      M.box(x, -78, 421, 25, 25, 10, DARK);
    });

    // reactor eye on the bow face, recessed behind a proud collar (golCore)
    var r0 = ringXY(0, 20, 404, 58, 44, 8, PI / 8);
    M.skin(ringXY(0, 20, 407, 68, 52, 8, PI / 8), r0, STEEL, GUN);
    M.skin(r0, ringXY(0, 20, 372, 22, 17, 8, PI / 8), DARK);
    M.capCenter(ringXY(0, 20, 372, 22, 17, 8, PI / 8), GLOW);

    // spine armour ribs + deck greeble row — texture at fortress scale
    [[180, 76], [90, 88], [-30, 92], [-150, 88], [-260, 78]].forEach(function (p) {
      M.plate([-150, p[1], p[0] + 20], [150, p[1], p[0] + 20], [150, p[1], p[0] - 20], [-150, p[1], p[0] - 20],
        [0, 1, 0], 10, GUN2, PLATE);
    });
    [-190, -95, 0, 95, 190].forEach(function (x, k) {
      M.box(x, 86, 160, 36, 18, 52, k & 1 ? PLATE : GUN2, GUN);
    });

    // keel armour + ventral fins
    M.box(0, -98, -60, 220, 40, 340, GUN2, PLATE);
    [1, -1].forEach(function (s) {
      M.plate([s * 80, -110, -180], [s * 120, -170, -240], [s * 110, -170, -300], [s * 74, -110, -310],
        [s * 1, 0, 0], 10, GUN2, PLATE);
    });

    // amber seams along the hull chines: the fortress is already cracked,
    // it just doesn't know it yet
    [1, -1].forEach(function (s) {
      M.quad([s * 260, 60, 230], [s * 302, 52, 60], [s * 302, 42, 60], [s * 260, 50, 230], TRIM);
      M.quad([s * 116, 148, 66.2], [s * 116, 148, -200], [s * 116, 136, -200], [s * 116, 136, 66.2], shade(TRIM, 0.7));
    });
    M.quad([-286, -51.6, 300], [286, -51.6, 300], [286, -51.6, 268], [-286, -51.6, 268], shade(TRIM, 0.55));

    // four engine banks aft (golVents)
    [[85, 5, 56], [-85, 5, 56], [205, -5, 44], [-205, -5, 44]].forEach(function (e) {
      var a = ringXY(e[0], e[1], -340, e[2], e[2], 8, PI / 8);
      var b = ringXY(e[0], e[1], -420, e[2] * 0.78, e[2] * 0.78, 8, PI / 8);
      M.skin(a, b, GUN2, PLATE);
      var c = ringXY(e[0], e[1], -412, e[2] * 0.5, e[2] * 0.5, 8, PI / 8);
      M.skin(b, c, DARK);
      M.capCenter(c, GLOW);
    });

    return M;
  }

  /* =================================================================== HEDRA
     Boss #11: the engine's aesthetic distilled — a regular icosahedron
     generated from the golden ratio rather than tabulated, flat-shaded by
     construction. Faces alternate two crystal tones with per-face jitter:
     a tumbling solid with identical faces strobes into a static shimmer,
     while jittered values keep every facet readable as its own plane
     through the spin. A bright seam inset on every third face and a small
     growth spike at each vertex break the perfect hull just enough to say
     "mineral", not "primitive". It tumbles on incommensurate axes, so
     there is no nose and no handedness; attach is the centre. */
  function buildHedra() {
    var M = Mesh();
    var LT = [0.30, 0.55, 0.70];
    var DK = [0.14, 0.28, 0.42];
    var SEAM = [0.13, 0.88, 1.00];
    var TIPC = [0.62, 0.90, 1.00];

    var PHI = (1 + Math.sqrt(5)) / 2;
    var R = 170 / Math.sqrt(1 + PHI * PHI);            // circumradius 170
    var V = [], F = [], i, j, k;
    [[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
    [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]]
      .forEach(function (p) { V.push([p[0] * R, p[1] * R, p[2] * R]); });
    // 20 faces = every vertex triple at mutual edge distance, wound outward
    function d2(a, b) {
      var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
      return x * x + y * y + z * z;
    }
    var e2 = 4 * R * R * 1.02;
    for (i = 0; i < 12; i++) for (j = i + 1; j < 12; j++) for (k = j + 1; k < 12; k++)
      if (d2(V[i], V[j]) < e2 && d2(V[j], V[k]) < e2 && d2(V[i], V[k]) < e2) F.push([i, j, k]);
    F.forEach(function (f, fi) {
      var a = V[f[0]], b = V[f[1]], c = V[f[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * a[0] + ny * a[1] + nz * a[2] < 0) { var t = b; b = c; c = t; }
      M.tri(a, b, c, shade(fi & 1 ? LT : DK, 1 + 0.10 * sin(fi * 7.7)));
      if (fi % 3) return;
      // crystal veining: a thin lit seam inset along one edge, lifted a
      // hair off the face so it survives the flat shading
      var g = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      function iv(p, w) {
        return [(p[0] * (1 - w) + g[0] * w) * 1.004, (p[1] * (1 - w) + g[1] * w) * 1.004,
        (p[2] * (1 - w) + g[2] * w) * 1.004];
      }
      M.quad(iv(a, 0.05), iv(b, 0.05), iv(b, 0.14), iv(a, 0.14), shade(SEAM, 0.8 + 0.2 * sin(fi * 3.3)));
    });
    // a crystal growth at each vertex — 3-sided spike along the radius
    V.forEach(function (v, vi) {
      var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      var u = [v[0] / l, v[1] / l, v[2] / l];
      var w = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var t1 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      var tl = Math.sqrt(t1[0] * t1[0] + t1[1] * t1[1] + t1[2] * t1[2]);
      t1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
      var t2 = [u[1] * t1[2] - u[2] * t1[1], u[2] * t1[0] - u[0] * t1[2], u[0] * t1[1] - u[1] * t1[0]];
      var br = 13 + 3 * sin(vi * 5.3), base = [], q, aq;
      for (q = 0; q < 3; q++) {
        aq = q / 3 * TAU + vi;
        base.push([u[0] * l * 0.94 + (cos(aq) * t1[0] + sin(aq) * t2[0]) * br,
        u[1] * l * 0.94 + (cos(aq) * t1[1] + sin(aq) * t2[1]) * br,
        u[2] * l * 0.94 + (cos(aq) * t1[2] + sin(aq) * t2[2]) * br]);
      }
      var ex = l + 26 + 9 * sin(vi * 3.3);
      M.capFan(base, [u[0] * ex, u[1] * ex, u[2] * ex], vi & 1 ? TIPC : shade(TIPC, 0.68));
    });

    return M;
  }

  /* ================================================================ ARBALEST
     Boss #12: a siege platform, not a flyer — a broad armoured crescent
     built around one enormous lens barrel dead centre. Everything on it
     exists to aim that beam column: the crescent arms brace forward, the
     nacelles are ballast, the mortar pods hang under the arms for the
     between-beams harassment. Ice-blue accents; the lens recess is where
     the bmS charge sprite swells. Nose at +z; attach points negated in z. */
  function buildArbalest() {
    var M = Mesh();
    var GUN = [0.140, 0.155, 0.185];
    var GUN2 = [0.090, 0.100, 0.125];
    var PLATE = [0.055, 0.062, 0.080];
    var STEEL = [0.210, 0.235, 0.270];
    var ICE = [0.55, 0.80, 1.00];
    var ICE2 = [0.28, 0.44, 0.62];
    var DARK = [0.030, 0.034, 0.044];
    var GLOW = [0.78, 0.92, 1.00];

    // squat central core
    var S = [
      slabLoop(130, 70, 34, 13, 0),
      slabLoop(40, 150, 48, 18, 0),
      slabLoop(-60, 165, 50, 19, 0),
      slabLoop(-160, 110, 38, 15, 0)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? GUN2 : GUN, PLATE);
    M.capCenter(S[0], PLATE, [0, 0, 26]);
    M.capCenter(S[S.length - 1], DARK);

    // crescent arms bracing forward, layered armour steps, horn tips
    [1, -1].forEach(function (s) {
      var a0 = [s * 58, 20, 96], a1 = [s * 292, 6, 150], a2 = [s * 310, 4, 60], a3 = [s * 70, 16, -80];
      if (s < 0) M.plate(a3, a2, a1, a0, [0, -1, 0], 40, GUN, GUN2);
      else M.plate(a0, a1, a2, a3, [0, -1, 0], 40, GUN, GUN2);
      var b0 = [s * 80, 34, 44], b1 = [s * 252, 24, 96], b2 = [s * 260, 22, 34], b3 = [s * 92, 32, -34];
      if (s < 0) M.plate(b3, b2, b1, b0, [0, -1, 0], 12, PLATE, GUN);
      else M.plate(b0, b1, b2, b3, [0, -1, 0], 12, PLATE, GUN);
      // ice leading edge along the brace
      M.quad([s * 64, 21, 98], [s * 288, 7, 151], [s * 282, 7, 142], [s * 70, 21, 89], ICE);
      // forward horn on the tip, lit at the point
      M.box(s * 296, 8, 130, 42, 32, 95, GUN2, PLATE);
      var f = M.rectFrust(s * 296, 8, 177, 218, 18, 13, 7, 5, GUN);
      M.quad(f[0], f[1], f[2], f[3], ICE2);
    });

    // the lens barrel: fat, forward, unmistakable (arbLens in the recess)
    var b2r = ringXY(0, 14, 205, 60, 54, 10, PI / 10);
    var b1r = ringXY(0, 14, 130, 68, 60, 10, PI / 10);
    var b0r = ringXY(0, 14, 55, 76, 68, 10, PI / 10);
    M.skin(b2r, b1r, GUN, GUN2);
    M.skin(b1r, b0r, GUN2, PLATE);
    // proud emitter ring, then the recessed lens throat with its glow plate
    M.skin(ringXY(0, 14, 200, 66, 60, 10, PI / 10), ringXY(0, 14, 190, 72, 66, 10, PI / 10), ICE, shade(ICE, 0.5));
    var rim = ringXY(0, 14, 208, 52, 47, 10, PI / 10);
    M.skin(b2r, rim, PLATE);
    M.skin(rim, ringXY(0, 14, 160, 18, 16, 10, PI / 10), DARK);
    M.capCenter(ringXY(0, 14, 160, 18, 16, 10, PI / 10), GLOW);
    // cradle clamping the barrel to the core
    M.box(0, -28, 90, 90, 34, 170, GUN2, PLATE);
    M.box(0, 54, 60, 60, 26, 120, PLATE, GUN);
    [1, -1].forEach(function (s) {
      M.plate([s * 34, 44, 110], [s * 62, 20, 150], [s * 58, 14, 120], [s * 30, 36, 84], [0, -1, 0], 8, GUN2, PLATE);
    });

    // ballast nacelles with aft nozzles
    [1, -1].forEach(function (s) {
      M.box(s * 150, 26, -70, 110, 64, 230, GUN, GUN2);
      M.box(s * 150, 62, -80, 90, 12, 180, PLATE);
      M.quad([s * 205.2, 42, 20], [s * 205.2, 42, -150], [s * 205.2, 32, -150], [s * 205.2, 32, 20], ICE2);
      var a = ringXY(s * 150, 18, -188, 34, 30, 6, PI / 6);
      var b = ringXY(s * 150, 18, -224, 26, 23, 6, PI / 6);
      M.skin(a, b, GUN2, PLATE);
      M.capCenter(b, GLOW);
    });

    // underslung mortar pods, tubes proud at the muzzle (arbMortars)
    [[110, -52, -10, 56, 44, 100, -40, 48, 74], [225, -44, 30, 48, 38, 85, -34, 88, 106]]
      .forEach(function (p) {
        [1, -1].forEach(function (s) {
          M.box(s * p[0], p[1], p[2], p[3], p[4], p[5], GUN2, PLATE);
          M.box(s * p[0], p[6], p[7] - 18, 19, 19, 38, STEEL);
          M.box(s * p[0], p[6], p[8] - 2, 25, 25, 9, DARK);
        });
      });

    // ice seam under the chin — the platform's one running light
    M.quad([-120, -44.6, 60], [120, -44.6, 60], [120, -44.6, 36], [-120, -44.6, 36], shade(ICE, 0.6));

    return M;
  }

  /* ================================================================== REAPER
     Boss #13: a strafer that lives in profile — it crosses the arena
     broadside, so the budget goes to the wing silhouette: two scythe
     crescents with notched trailing edges and raked tip barbs. Narrow
     fuselage with a red visor slit instead of a canopy, oversized engine
     banks for the run, curtain racks slung under the wings (reapRack — the
     bolt fences fall from them). Nose at +z; attach points negated in z. */
  function buildReaper() {
    var M = Mesh();
    var HULL = [0.115, 0.100, 0.130];
    var HULL2 = [0.078, 0.068, 0.092];
    var PLATE = [0.048, 0.042, 0.060];
    var STEEL = [0.175, 0.150, 0.190];
    var TRIM = [1.00, 0.17, 0.30];
    var TRIM2 = [0.52, 0.09, 0.16];
    var DARK = [0.030, 0.026, 0.038];
    var GLOW = [1.00, 0.42, 0.36];

    // lean fuselage, needle nose
    var S = [
      hexLoop(150, 26, 16, 14, 0),
      hexLoop(70, 44, 26, 22, -2),
      hexLoop(-20, 50, 30, 24, -2),
      hexLoop(-110, 36, 22, 18, 2),
      hexLoop(-165, 20, 13, 11, 4)
    ];
    for (var i = 0; i < S.length - 1; i++) M.skin(S[i], S[i + 1], i & 1 ? HULL2 : HULL, STEEL);
    M.capFan(S[0], [0, -4, 208], STEEL);
    M.capCenter(S[S.length - 1], DARK);
    // the visor: one narrow red slit where a canopy would be
    M.quad([-12, 17.8, 148], [12, 17.8, 148], [9, 13.6, 163], [-9, 13.6, 163], TRIM);

    // scythe wings: inner panel, outer crescent blade, tip barb
    [1, -1].forEach(function (s) {
      var p0 = [s * 44, 6, 60], p1 = [s * 140, -4, 10], p2 = [s * 132, -6, -66], p3 = [s * 40, 4, -44];
      var q0 = [s * 136, -4, 6], q1 = [s * 252, -16, -78], q2 = [s * 232, -18, -140], q3 = [s * 126, -6, -58];
      var r0 = [s * 246, -16, -84], r1 = [s * 272, -22, -140], r2 = [s * 260, -22, -158], r3 = [s * 236, -17, -120];
      if (s < 0) {
        M.plate(p3, p2, p1, p0, [0, -1, 0], 7, STEEL, HULL2);
        M.plate(q3, q2, q1, q0, [0, -1, 0], 5, HULL, PLATE);
        M.plate(r3, r2, r1, r0, [0, -1, 0], 3.5, HULL2, TRIM2);
      } else {
        M.plate(p0, p1, p2, p3, [0, -1, 0], 7, STEEL, HULL2);
        M.plate(q0, q1, q2, q3, [0, -1, 0], 5, HULL, PLATE);
        M.plate(r0, r1, r2, r3, [0, -1, 0], 3.5, HULL2, TRIM2);
      }
      // blood-red leading edge in two runs
      M.quad([s * 46, 6.6, 60], [s * 138, -3.4, 10], [s * 132, -3.4, 2], [s * 48, 6.6, 51], TRIM);
      M.quad([s * 140, -3.4, 4], [s * 250, -15.4, -78], [s * 242, -15.4, -86], [s * 136, -3.4, -6], TRIM);
      // notched trailing edge: dark wedges biting forward into the blade
      [[160, -8, -74], [192, -11, -100], [222, -15, -124]].forEach(function (n) {
        var n0 = [s * (n[0] - 12), n[1] + 0.5, n[2] - 14], n1 = [s * (n[0] + 12), n[1] + 0.5, n[2] - 18],
          ap = [s * n[0], n[1] + 0.5, n[2] + 16];
        M.tri(n0, n1, ap, DARK); M.tri(ap, n1, n0, DARK);
      });
    });

    // oversized engine banks (reapEngines at the nozzles)
    [1, -1].forEach(function (s) {
      var a = ringXY(s * 58, 12, -40, 30, 27, 8, PI / 8);
      var b = ringXY(s * 58, 12, -150, 26, 24, 8, PI / 8);
      M.skin(a, b, s > 0 ? HULL : HULL2, STEEL);
      var c = ringXY(s * 58, 12, -196, 20, 18, 8, PI / 8);
      M.skin(b, c, HULL2, PLATE);
      var d = ringXY(s * 58, 12, -188, 12, 11, 8, PI / 8);
      M.skin(c, d, DARK);
      M.capCenter(d, GLOW);
      M.capCenter(a, DARK, [0, 0, 6]);                 // intake face
      // red strip along the nacelle flank
      M.quad([s * 88.2, 20, -52], [s * 88.2, 20, -140], [s * 88.2, 12, -140], [s * 88.2, 12, -52], TRIM2);
    });

    // curtain racks under the wings: long dispensers with drop pips
    [1, -1].forEach(function (s) {
      M.box(s * 118, -24, -34, 70, 16, 96, HULL2, PLATE);
      [-70, -44, -14, 8].forEach(function (z) {
        M.box(s * 118, -34, z, 52, 6, 9, PLATE);
      });
      M.quad([s * 100, -37.2, 12], [s * 136, -37.2, 12], [s * 136, -37.2, 4], [s * 100, -37.2, 4], TRIM2);
    });

    // canted twin tails + dorsal razor fin
    [1, -1].forEach(function (s) {
      M.plate([s * 20, 14, -120], [s * 58, 62, -158], [s * 52, 60, -184], [s * 18, 12, -172], [s * 1, 0, 0], 5, HULL2, TRIM);
    });
    M.plate([0.6, 22, -30], [0.6, 46, -84], [0.6, 44, -112], [0.6, 20, -116], [-1, 0, 0], 3.5, STEEL, TRIM2);

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
    striker = buildStriker(), mine = buildMine(), bomb = buildBomb(),
    lancer = buildLancer(),
    carrier = buildCarrier(), dreadnought = buildDreadnought(),
    wasp = buildWasp(), ravager = buildRavager(), leviathan = buildLeviathan(),
    warden = buildWarden(), hunter = buildHunter(),
    bat = buildBat(), batWingL = buildBatWing(1), batWingR = buildBatWing(-1),
    phantom = buildPhantom(), hivemother = buildHiveMother(),
    motherTentA = buildMotherTent(15, 12, 0.9, false),
    motherTentB = buildMotherTent(12, 8.5, 2.2, false),
    motherTentC = buildMotherTent(8.5, 3.6, 3.8, true),
    goliath = buildGoliath(), hedra = buildHedra(),
    arbalest = buildArbalest(), reaper = buildReaper();

  return {
    jet: jet.build(),
    drone: drone.build(),
    cruiser: cruiser.build(),
    striker: striker.build(),
    mine: mine.build(),
    bomb: bomb.build(),
    lancer: lancer.build(),
    wasp: wasp.build(),
    ravager: ravager.build(),
    mothership: boss.build(),
    carrier: carrier.build(),
    dreadnought: dreadnought.build(),
    leviathan: leviathan.build(),
    warden: warden.build(),
    hunter: hunter.build(),
    bat: bat.build(),
    batWingL: batWingL.build(),
    batWingR: batWingR.build(),
    phantom: phantom.build(),
    hivemother: hivemother.build(),
    motherTentA: motherTentA.build(),
    motherTentB: motherTentB.build(),
    motherTentC: motherTentC.build(),
    goliath: goliath.build(),
    hedra: hedra.build(),
    arbalest: arbalest.build(),
    reaper: reaper.build(),
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
      /* bio kinds fly yaw≈PI like the rest — mesh z negated, applied raw */
      ravagerBelly: [0, -23, 1],
      levMaw: [0, -5, -290],
      levVents: [
        [160, 35, -120], [-160, 35, -120],
        [165, 30, 0], [-165, 30, 0],
        [140, 30, 120], [-140, 30, 120]
      ],
      dreadGuns: [
        [180, 10, -108], [-180, 10, -108],
        [210, 10, -108], [-210, 10, -108],
        [240, 10, -108], [-240, 10, -108]
      ],
      /* the warden SPINS, so its arm muzzles cannot be a fixed table: this is
         ONE arm tip as a radius (x) and depth (z), swept round b.spin six
         times by scene-draw. x is used as a radius and is never mirrored, but
         the hull still flies yaw≈PI — the sweep negates cos() to match. */
      wardenArm: [298, 0, -84],
      wardenIris: [0, 0, -46],
      hunterNose: [0, -6, -234],
      hunterGuns: [[62, -34, -154], [-62, -34, -154]],
      /* boss-roster expansion — same convention throughout: mesh points with
         z negated, applied raw in world space. Wing/tentacle entries are the
         ROOTS the separate meshes are composed at, not points on this hull. */
      batEyeL: [-13, 17, -105],
      batEyeR: [13, 17, -105],
      batMaw: [0, 3, -121],
      batWingL: [-30, 22, -18],
      batWingR: [30, 22, -18],
      phanCore: [0, 2, -132],
      phanGuns: [[32, 2, -244], [-32, 2, -244]],
      motherMaw: [0, -88, -40],
      motherCore: [-16, 50, 0],
      /* pustule blisters — coordinates mirror the dome table in
         buildHiveMother, lifted a hair so the sprite clears the cap */
      motherPusts: [
        [61, 76, -146], [212, 43, -67], [143, 88, 74], [50, 29, 187],
        [-128, 81, 129], [-240, 50, 55], [-209, 71, -76], [-104, 35, -174]
      ],
      /* irregular ring of tentacle roots under the rim, matching the nub
         cones — scene-draw hangs a 3-segment chain from each */
      motherRoots: [
        [61, -60, -180], [154, -60, -103], [239, -60, -13], [162, -60, 89],
        [84, -60, 179], [-75, -60, 153], [-201, -60, 107], [-195, -60, 2],
        [-196, -60, -99], [-69, -60, -150]
      ],
      golGuns: [
        [280, -78, -424], [-280, -78, -424],
        [180, -78, -424], [-180, -78, -424],
        [80, -78, -424], [-80, -78, -424]
      ],
      golCore: [0, 20, -404],
      golVents: [[85, 5, 424], [-85, 5, 424], [205, -5, 424], [-205, -5, 424]],
      hedraCore: [0, 0, 0],
      arbLens: [0, 14, -206],
      arbMortars: [[110, -40, -78], [-110, -40, -78], [225, -34, -108], [-225, -34, -108]],
      reapEngines: [[58, 12, 194], [-58, 12, 194]],
      reapRack: [[118, -32, 30], [-118, -32, 30]]
    }
  };
})();

/* ================================================= scenery landmark protos
   Everything below serves world/scenery.js, not the ship renderer above.
   These follow the SCENERY proto contract, not the ship one: each pXxx()
   returns raw { d, rad, h } floats — base resting on y = 0, rad the cull
   footprint, h the tallest point — and scenery.js wraps them in mesh() at
   its init(). The little builder here is a deliberate twin of scenery's
   MB() (same 9-float vertex layout, same half-extent box with yaw-then-
   roll) kept local so models.js stays import-free and the module graph
   stays a DAG. All of it bakes once; nothing in this section runs per
   frame, and none of it touches the MODELS closure the ships live in. */
var TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos,
    abs = Math.abs, sqrt = Math.sqrt;

function sh(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function ih(a, b, s) {
  var n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}
function MB() {
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
function ringN(n, r, y, jit, sd, sq) {
  var o = [], i, a, rr;
  for (i = 0; i < n; i++) {
    a = i / n * TAU;
    rr = r * (1 + (jit || 0) * (ih(i, 3, sd) - 0.5) / 50);
    o.push([cos(a) * rr, y + (sq ? (ih(i, 7, sd) - 0.5) * jit * 2 : 0), sin(a) * rr]);
  }
  return o;
}

/* palettes — exact copies of scenery.js's swatches so everything blends */
var BONE = [0.55, 0.52, 0.44], BONE2 = [0.42, 0.39, 0.33];
var CHITIN = [0.20, 0.17, 0.15], CHITIN2 = [0.13, 0.11, 0.10];
var FLESH2 = [0.26, 0.22, 0.19], TOXIC = [0.15, 0.85, 0.30];
var METAL = [0.30, 0.31, 0.36], METAL2 = [0.19, 0.20, 0.25];
var STONE2 = [0.37, 0.33, 0.30], STONE3 = [0.57, 0.52, 0.46];
var DARKS = [0.17, 0.15, 0.15], RUST = [0.44, 0.22, 0.13];
var NEON = [0.10, 0.80, 0.98], NEONM = [0.82, 0.14, 0.60];

/* -------------------------------------------- creep protos (mid thresholds)
   These fill the dread gap between the early lone hands and the late
   walkers: dead remains first (ribcage), then things that MOULTED here
   (cocoons), then a piece of something far too big (jaw). All static —
   the escalation is what they imply, not what they do. */

export function pRibcage() {               /* half-buried ribcage, torn open */
  var M = MB(), i, s2, side, sd = 167;
  /* spine: a sagging vertebra row, most of it swallowed by the sand */
  for (i = 0; i < 6; i++) {
    var vz = -140 + i * 56, vy = 9 + sin(i * 0.6) * 6;
    M.box(0, vy, vz, 14 - (i > 3 ? 3 : 0), 10, 20, 0,
          (ih(i, 1, sd) - 0.5) * 0.22, i & 1 ? BONE : BONE2);
    M.box(0, vy + 14, vz, 4.5, 8, 5, 0, (ih(i, 2, sd) - 0.5) * 0.5, BONE2);
  }
  /* rib pairs: box chains walked up an arc, mirrored across the spine —
     the same tip-to-base walk as pHand's fingers. A few stop short so the
     cage reads torn open by something, not built. */
  for (i = 0; i < 5; i++) {
    var rz0 = -128 + i * 58, Rr = 104 - abs(i - 2) * 13;
    for (side = -1; side <= 1; side += 2) {
      var segs = ih(i * 2 + side + 1, 3, sd) < 0.30 ? 2 : 3;
      var crook = 0.40 + 0.22 * ih(i, 4 + side, sd);
      var fx = side * (Rr + 8), fy = 2;
      for (s2 = 0; s2 < segs; s2++) {
        var hl = 30 - s2 * 6, hw = 7.5 - s2 * 1.7, roll = side * (0.30 + crook * s2);
        fx += -sin(roll) * hl; fy += cos(roll) * hl;
        M.box(fx, fy, rz0, hw, hl, hw, 0, roll, s2 & 1 ? BONE2 : BONE);
        fx += -sin(roll) * hl; fy += cos(roll) * hl;
      }
    }
  }
  /* shed ribs lying loose where they were flung */
  M.box(96, 6, 148, 26, 5, 6, 0.7, 0.22, BONE2);
  M.box(-78, 5, -186, 22, 5, 6, -0.5, 0.14, BONE);
  return { d: M.d, rad: 210, h: 150 };
}

export function pCocoons() {               /* husk cocoons — something moulted here */
  var M = MB(), i, k, sd = 173;
  for (i = 0; i < 6; i++) {
    var a = ih(i, 1, sd) * TAU, r = i ? 40 + 66 * ih(i, 2, sd) : 0;
    var cx = cos(a) * r, cz = sin(a) * r;
    var s = 0.55 + 0.7 * ih(i, 3, sd) + (i ? 0 : 0.55);  /* centre pod is the elder */
    var lean = (ih(i, 4, sd) - 0.5) * 0.55;
    /* teardrop loft: fat hip, waist, curled tip — sheared over as a whole */
    var ys = [0, 26, 52, 68], rs = [15, 19, 11, 3.5], rings = [], p;
    for (k = 0; k < 4; k++) {
      var ring = ringN(5, rs[k] * s, ys[k] * s, 9, sd + i * 11 + k, false);
      for (p = 0; p < 5; p++) { ring[p][0] += cx + sin(lean) * ring[p][1]; ring[p][2] += cz; }
      rings.push(ring);
    }
    for (k = 0; k < 3; k++) M.skin(rings[k], rings[k + 1], k & 1 ? CHITIN2 : CHITIN, 0.72);
    M.cap(rings[3], i & 1 ? CHITIN2 : FLESH2, 4 * s);
    /* one pod split down the seam, still faintly wet inside */
    if (i === 1) M.box(cx + sin(lean) * 26 * s, 26 * s, cz, 1.4, 13 * s, 1.4, 0, lean, TOXIC);
  }
  return { d: M.d, rad: 125, h: 100 };
}

export function pJaw() {                   /* torn colossal jaw, teeth to the sky */
  var M = MB(), i, sd = 181;
  /* mandible: yawed segments marched round a crescent in the ground plane */
  var n = 7;
  for (i = 0; i < n; i++) {
    var t = i / (n - 1), a = (t - 0.5) * 2.4;
    var x = sin(a) * 122, z = cos(a) * 148 - 58, yaw = -a;
    M.box(x, 15, z, 38, 17 + 6 * ih(i, 1, sd), 21, yaw,
          (ih(i, 2, sd) - 0.5) * 0.22, i & 1 ? BONE : BONE2);
    /* teeth ride the bone in pairs, leaning out along the local tangent;
       one span is shattered to a stump so the row reads broken, not new */
    var tx = cos(a) * 15, tz = -sin(a) * 15;
    if (i === 3) { M.box(x, 36, z, 8, 6, 7, yaw, 0.2, BONE2); continue; }
    M.box(x + tx, 44, z + tz, 6.5, 14, 5.5, yaw, sin(a) * 0.30, BONE);
    M.box(x + tx, 66, z + tz, 3.2, 10, 3, yaw, sin(a) * 0.44, BONE2);
    if (i & 1) M.box(x - tx, 40, z - tz, 5.5, 11, 5, yaw, sin(a) * 0.22, BONE2);
  }
  /* snapped teeth thrown clear, points down in the sand */
  M.box(150, 9, 26, 5, 12, 5, 0.6, 2.6, BONE);
  M.box(-128, 7, 118, 4.5, 10, 4.5, -0.8, 2.9, BONE2);
  return { d: M.d, rad: 200, h: 115 };
}

/* --------------------------------------------- biome signature landmarks */

export function pWreck() {                 /* colossal orbital-wreck arc — dune horizon */
  var M = MB(), i, sd = 187;
  /* a vast broken hull ring, both feet buried, the crown leaning downwind.
     One loft of rectangular sections: 4 quads a segment, cheap enough to
     scatter at horizon scale where only the silhouette survives the fog. */
  var n = 9, loops = [];
  for (i = 0; i <= n; i++) {
    var t = i / n, a = 0.18 + t * (Math.PI - 0.36);
    var y = sin(a) * 430 - 90;                       /* dips under at both ends */
    var x = -cos(a) * 340 + y * 0.20;                /* baked lean */
    var w = 34 - 14 * sin(a), th = 26 + 8 * (1 - sin(a));
    loops.push([[x - w, y - th * 0.4, -th], [x + w, y - th * 0.4, -th],
                [x + w, y + th * 0.4, th], [x - w, y + th * 0.4, th]]);
  }
  for (i = 0; i < n; i++) M.skin(loops[i], loops[i + 1], i & 1 ? METAL2 : RUST, 0.72);
  /* snapped rib spars where the rest of the ring tore away */
  M.box(66, 336, 30, 5, 30, 5, 0, 0.5 + 0.2 * ih(1, 1, sd), RUST);
  M.box(-30, 320, -28, 5, 24, 5, 0, -0.6, METAL2);
  M.box(150, 250, 34, 4, 20, 4, 0, 0.9, RUST);
  /* a shed hull chunk half-dug-in ahead of the footing */
  M.box(300, 16, 150, 40, 18, 26, 0.7, 0.28, METAL2);
  /* one dying strip of running lights along the crown */
  M.box(24, 348, 0, 60, 2.5, 2.5, 0, 0.18, NEON);
  return { d: M.d, rad: 420, h: 380 };
}

export function pGate() {                  /* leaning tower pair — a broken city gate */
  var M = MB(), i, side, sd = 191;
  for (side = -1; side <= 1; side += 2) {
    /* the two blocks lean INTO each other over a rubble-choked gap; the
       lean is baked into the box roll so the tops nearly (never) meet */
    var lean = side * (0.10 + 0.04 * ih(side + 2, 1, sd));
    var H = side < 0 ? 195 : 165, w = 46, cx = side * 152;
    M.box(cx, H, 0, w, H, w, 0, lean, side < 0 ? METAL2 : DARKS);
    /* ragged parapet slabs past the roofline, pBlocks-style */
    M.box(cx - sin(lean) * H * 2 + side * 18, H * 2 + 20, 8, w * 0.45,
          22 + 26 * ih(side + 3, 2, sd), w * 0.5, 0, lean, DARKS);
    M.box(cx - sin(lean) * H * 2 - side * 14, H * 2 + 8, -12, w * 0.4,
          12 + 20 * ih(side + 4, 3, sd), w * 0.42, 0, lean * 1.2, METAL2);
    /* snapped skybridge stubs jutting from the inner faces, failing to meet */
    M.box(cx - sin(lean) * H * 1.2 - side * (w + 26), H * 1.2, 6, 34, 8, 14,
          0, lean - side * 0.16, STONE2);
    /* one lit window column each — spans the block so both faces glow */
    M.box(cx - sin(lean) * H, H, 0, w * 0.15, H * 0.62, w + 2.5, 0, lean,
          side < 0 ? NEON : NEONM);
  }
  /* the fallen span, shattered across the gap between the feet */
  for (i = 0; i < 4; i++)
    M.box(-66 + 44 * i, 8 + 8 * ih(i, 5, sd), 30 - 60 * ih(i, 6, sd),
          17 + 10 * ih(i, 7, sd), 8, 13, ih(i, 8, sd) * 3, 0.22, i & 1 ? STONE2 : DARKS);
  return { d: M.d, rad: 235, h: 460 };
}

export function pLevi() {                  /* beached leviathan skeleton — dry seabed */
  var M = MB(), i, s2, side, sd = 197;
  /* spine: vertebrae marching down z, sagging amidships, curling at the tail */
  var n = 9;
  for (i = 0; i < n; i++) {
    var t = i / (n - 1), vz = -240 + t * 560;
    var vy = 20 + sin(t * 2.7) * 34 * (1 - t * 0.4);
    var vs = 17 - t * 9;
    M.box(0, vy, vz, vs, vs * 0.8, 26 - t * 8, 0, (ih(i, 1, sd) - 0.5) * 0.2 + t * t * 0.5,
          i & 1 ? BONE : BONE2);
  }
  /* rib arcs over the chest third — the same chain walk as pRibcage but
     taller and wider-set, so the player reads the family resemblance */
  for (i = 0; i < 4; i++) {
    var rz0 = -160 + i * 62, Rr = 128 - i * 12;
    for (side = -1; side <= 1; side += 2) {
      var segs = ih(i * 2 + side + 1, 2, sd) < 0.25 ? 2 : 3;
      var fx = side * Rr, fy = 4;
      for (s2 = 0; s2 < segs; s2++) {
        var hl = 36 - s2 * 7, roll = side * (0.26 + 0.46 * s2);
        fx += -sin(roll) * hl; fy += cos(roll) * hl;
        M.box(fx, fy, rz0, 8 - s2 * 1.8, hl, 8 - s2 * 1.8, 0, roll, s2 & 1 ? BONE2 : BONE);
        fx += -sin(roll) * hl; fy += cos(roll) * hl;
      }
    }
  }
  /* skull: brow slab, tapering snout, dark orbit sockets, jaw agape in the mud */
  M.box(0, 46, -290, 42, 30, 52, 0, -0.06, BONE);
  M.box(0, 34, -368, 26, 16, 40, 0, 0.10, BONE2);
  M.box(34, 52, -286, 8, 10, 12, 0, 0, DARKS);
  M.box(-34, 52, -286, 8, 10, 12, 0, 0, DARKS);
  M.box(0, 10, -352, 20, 7, 56, 0, 0.16, BONE2);     /* lower jaw, half sunk */
  M.box(14, 22, -384, 3, 8, 3, 0, 2.9, BONE);        /* one tooth still standing */
  /* shed ribs, flung wide of the tideline that left them */
  M.box(170, 6, -60, 30, 5, 7, 0.8, 0.2, BONE2);
  M.box(-150, 6, 120, 26, 5, 6, -0.6, 0.16, BONE);
  return { d: M.d, rad: 420, h: 205 };
}
