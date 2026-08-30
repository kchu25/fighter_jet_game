/* ===== cinematic/art/jet.js — the player's "Wraith" interceptor =====
   jet(c, x, y, s, rot, thrust, tint): seen from BEHIND and ABOVE, nose
   toward -y. Every outline is PROJECTED FROM MODELS.jet's own vertices
   so the cinematic aircraft and the in-game mesh are the same machine. */
import { rgba, sat, mix, fillP, strokeP, seg, disc, ring, lg, blob, TAU, CY, WH } from './helpers.js';

/* ==================================================================
   3. JET — the player's "Wraith" interceptor, seen from BEHIND and
   ABOVE, nose toward -y.

   Every outline below is PROJECTED FROM MODELS.jet's own vertices so
   the cinematic aircraft and the in-game mesh are the same machine:
     - needle nose on a long, narrow, chined spine
     - two fat engine nacelles riding HIGH and close to the centreline,
       two thirds of the length, forward-facing intakes
     - hard-swept, drooping delta wings set well aft, nearly straight
       trailing edge, upturned wingtip fins
     - underslung gun pods whose barrels reach forward past the canopy
     - NO conventional tailfins: one dorsal blade on the centreline and
       one asymmetric blade on the port nacelle
   Envelope: x +/-38.6, y -47 (nose) .. +32 (tail), nozzles at y=30.
   ================================================================== */
export const JET_TINT = [120, 175, 225];

/* Cinematic camera: 64 deg above the horizon, on the centreline,
   behind the jet — the same rig game.js flies (lookAt from -Z, so
   world +X lands on SCREEN LEFT, hence the negated x).
     screen-up = Y*cos(el) + Z*sin(el)
   Built once at load: no allocation, no trig, per frame. */
export const JG = (function () {
  const K = 1.20, EY = 0.438, EZ = 0.899;
  function pt(X, Y, Z) { return [-K * X, -K * (EY * Y + EZ * Z)]; }
  function fp(a) {
    const o = [];
    for (let i = 0; i < a.length; i++) {
      const q = pt(a[i][0], a[i][1], a[i][2]);
      o.push(q[0], q[1]);
    }
    return o;
  }
  function mir(p) {
    const o = [];
    for (let i = 0; i < p.length; i += 2) o.push(-p[i], p[i + 1]);
    return o;
  }
  /* [screen-left copy, screen-right copy] of a starboard-side part */
  function two(a) { const r = fp(a); return [r, mir(r)]; }
  /* one half + its mirror, walked back, closed on the centreline */
  function half(a) {
    const f = fp(a), o = f.slice();
    for (let i = f.length - 2; i >= 0; i -= 2) o.push(-f[i], f[i + 1]);
    return o;
  }
  return {
    /* central fuselage: hexLoop chine stations 44 .. -30 */
    FUSE: half([[0, -0.45, 44], [2.10, -0.50, 30], [3.10, -0.30, 20], [4.20, 0, 6],
    [4.00, 0.20, -10], [3.20, 0.40, -24], [2.40, 0.40, -30]]),
    DECK: half([[0, -0.45, 44], [0.945, 0.70, 30], [1.395, 1.50, 20], [1.89, 2.40, 6],
    [1.80, 2.80, -10], [1.44, 2.40, -24], [1.08, 1.90, -30]]),
    CHINE: two([[2.18, -0.56, 30], [3.22, -0.36, 20], [4.37, -0.06, 6]]),
    CHNB: two([[2.18, -0.56, 30], [3.22, -0.36, 20], [4.37, -0.06, 6],
    [3.36, 0.69, 6], [2.48, 0.39, 20], [1.68, 0.19, 30]]),
    /* wings: swept 41 deg, drooped 8 units, near-straight trailing edge */
    WING: two([[4.2, 1.40, 15], [26.5, -6.80, -9], [29.6, -7.20, -17], [4.8, 1.60, -23]]),
    WLE: two([[4.4, 1.62, 15], [26.5, -6.58, -9], [26.1, -6.58, -11.6], [4.7, 1.62, 12.2]]),
    WTE: two([[5.3, 1.82, -22.0], [28.9, -6.98, -16.4], [28.7, -6.98, -14.6], [5.4, 1.82, -19.4]]),
    WSH: two([[26.5, -6.80, -9], [29.6, -7.20, -17], [5.4, 1.60, -23], [16.0, -3.0, -16]]),
    TIPF: two([[26.8, -6.60, -9.5], [31.5, -0.40, -12.5], [32.2, -0.40, -16.5], [29.3, -7.20, -18.5]]),
    /* underslung gun / sensor pods, barrels well forward */
    POD: two([[7.3, -2.0, 12], [11.5, -2.0, 12], [11.5, -2.0, -8], [7.3, -2.0, -8]]),
    PODN: two([[11.5, -2.0, 12], [7.3, -2.0, 12], [8.2, -2.8, 19], [10.6, -2.8, 19]]),
    BARR: two([[8.8, -3.6, 18.5], [10.0, -3.6, 18.5], [10.0, -3.6, 26.5], [8.8, -3.6, 26.5]]),
    MUZZ: two([[8.5, -3.3, 25.2], [10.3, -3.3, 25.2], [10.3, -3.3, 26.8], [8.5, -3.3, 26.8]]),
    STRK: two([[1.9, 0, 29], [7.8, -1.0, 23.5], [7.2, -1.0, 20.5], [2.2, 0.10, 21]]),
    PYL: two([[3.0, 5.7, 4], [6.4, 5.7, 4], [6.4, 5.7, -20], [3.0, 5.7, -20]]),
    /* nacelles: slabLoop stations 9 .. -30.5, bevelled */
    NAC: two([[10.5, 7.1, 9], [12.1, 8.0, 1], [12.3, 8.1, -17], [11.8, 7.8, -27],
    [11.8, 5.6, -30.5], [3.8, 5.6, -30.5], [3.8, 7.8, -27], [3.3, 8.1, -17],
    [3.5, 8.0, 1], [5.1, 7.1, 9]]),
    NTOP: two([[9.5, 8.1, 9], [10.4, 9.7, 1], [10.5, 9.9, -17], [10.2, 9.4, -27],
    [5.4, 9.4, -27], [5.1, 9.9, -17], [5.2, 9.7, 1], [6.1, 8.1, 9]]),
    NOUT: two([[10.5, 7.1, 9], [12.1, 8.0, 1], [12.3, 8.1, -17], [11.8, 7.8, -27]]),
    NIN: two([[5.1, 7.1, 9], [3.5, 8.0, 1], [3.3, 8.1, -17], [3.8, 7.8, -27]]),
    INTK: two([[10.5, 7.1, 9], [5.1, 7.1, 9], [5.9, 5.6, 5], [9.7, 5.6, 5]]),
    ILIP: two([[6.3, 8.22, 9.1], [9.3, 8.22, 9.1], [9.3, 7.90, 7.4], [6.3, 7.90, 7.4]]),
    NPB1: two([[5.3, 9.94, -3], [10.3, 9.94, -3], [10.3, 9.94, -5], [5.3, 9.94, -5]]),
    NPB2: two([[5.4, 9.94, -12], [10.2, 9.94, -12], [10.2, 9.94, -13.4], [5.4, 9.94, -13.4]]),
    /* centreline furniture */
    SPINE: half([[0.8, 1.90, 13], [0.8, 4.90, 3], [0.8, 4.70, -20], [0.8, 1.90, -26]]),
    SPTR: half([[0.85, 4.72, 1], [0.85, 4.66, -14]]),
    BLADE: half([[0.45, 4.60, -1], [0.45, 12.40, -5], [0.45, 12.00, -7.5], [0.45, 4.40, -9]]),
    CAN: half([[0, 0.90, 31], [0.55, 0.55, 31], [1.50, 0.85, 27], [1.95, 1.25, 22.5], [1.70, 1.75, 17]]),
    CRDG: fp([[0, 0.90, 31], [0, 2.10, 27], [0, 3.00, 22.5], [0, 2.80, 17]]),
    /* the two deliberately asymmetric greebles */
    NBLD: fp([[9.0, 9.90, -4], [10.7, 13.60, -7], [10.7, 13.20, -9.5], [9.0, 9.70, -11]]),
    BLIS: fp([[-5.9, 1.10, 25.5], [-3.3, 1.10, 25.5], [-3.3, 1.10, 18.5], [-5.9, 1.10, 18.5]]),
    BLSF: fp([[-5.5, 0.70, 25.6], [-3.7, 0.70, 25.6], [-3.7, -0.70, 25.6], [-5.5, -0.70, 25.6]]),
    /* nozzles: circles in the XY plane, so they project to flat ellipses */
    NZX: K * 7.8, NZY: 30,
    THY: -K * (EY * 5.6 + EZ * -25.0),
    RX: K * 4.0, RY: K * EY * 4.0,
    BX: K * 2.4, BY: K * EY * 2.4,
    TIPX: K * 32.2, TIPY: -K * (EY * -0.4 + EZ * -14.5)
  };
})();

/* cool gunmetal set, keyed from screen upper-left */
export const JC = {
  ink: '#060910', belly: '#0a0e14', hull: '#1a212b', hull2: '#27313d',
  panel: '#333e4c', steel: '#4a5a6e', steel2: '#61748b', line: '#8296ad'
};

/* Exhaust. In game the nozzles throw a cyan beam 72 units aft plus a
   white core sprite, so the plume here is cyan-cored with only a
   violet outer skirt to sit in the dawn palette. The nozzle bore is a
   flat ellipse at this camera angle, so the plume is correspondingly
   narrow at the root and flares aft. */
export function jetBurner(c, nx, thrust, tint) {
  if (thrust <= 0.005) return;
  const N = 60;                              // normalised flame length
  const L = (14 + 68 * thrust);
  c.save();
  c.translate(nx, 30);
  c.scale(1, L / N);
  const go = lg(c, 'jt.bo', 0, 0, 0, N, [
    [0.00, 'rgba(140,190,255,0.52)'],
    [0.30, 'rgba(120,120,255,0.30)'],
    [1.00, 'rgba(110,50,220,0)']
  ]);
  c.beginPath();
  c.moveTo(-5.0, 0);
  c.quadraticCurveTo(-6.2, N * 0.42, 0, N);
  c.quadraticCurveTo(6.2, N * 0.42, 5.0, 0);
  c.closePath();
  c.fillStyle = go; c.fill();
  const gi = lg(c, 'jt.bi', 0, 0, 0, N, [
    [0.00, 'rgba(255,255,255,0.95)'],
    [0.20, 'rgba(190,244,255,0.74)'],
    [0.58, 'rgba(88,214,255,0.30)'],
    [1.00, 'rgba(58,180,255,0)']
  ]);
  c.beginPath();
  c.moveTo(-2.5, 0);
  c.quadraticCurveTo(-3.1, N * 0.34, 0, N * 0.80);
  c.quadraticCurveTo(3.1, N * 0.34, 2.5, 0);
  c.closePath();
  c.fillStyle = gi; c.fill();
  c.restore();
  blob(c, nx, 30.5, 13 + 11 * thrust, tint, 0.52 * thrust);
  blob(c, nx, 30.5, 6 + 4.5 * thrust, WH, 0.58 * thrust);
}

export function jet(c, x, y, s, rot, thrust, tint) {
  thrust = thrust == null ? 0 : sat(thrust);
  const T = tint || JET_TINT;
  /* the airframe's painted TRIM is electric cyan in the mesh; pull the
     caller's tint toward it so the markings stay recognisably the same
     livery whatever colour the scene asks the exhaust to be */
  const TR = [mix(T[0], CY[0], 0.55), mix(T[1], CY[1], 0.55), mix(T[2], CY[2], 0.55)];

  c.save();
  c.translate(x, y);
  c.rotate(rot || 0);
  c.scale(s, s);
  c.lineJoin = 'round';

  /* ================= 1. underslung gun / sensor pods ============
     These hang below everything and their barrels run forward past
     the canopy, so they are laid down first and stay visible either
     side of the needle nose. */
  const podG = [
    lg(c, 'jt2.pdL', -14, 0, -8, 0, [[0, '#131a23'], [0.5, '#3b4859'], [1, '#1b2029']]),
    lg(c, 'jt2.pdR', 8, 0, 14, 0, [[0, '#161d27'], [0.5, '#2b3542'], [1, '#0f151c']])
  ];
  for (let i = 0; i < 2; i++) {
    fillP(c, JG.POD[i], podG[i]);
    fillP(c, JG.PODN[i], i ? '#232c37' : '#33404f');
    strokeP(c, JG.POD[i], 'rgba(5,8,13,0.85)', 0.8);
    fillP(c, JG.BARR[i], i ? '#4c5a6b' : '#6d8098');
    fillP(c, JG.MUZZ[i], '#0a0e14');
    strokeP(c, JG.BARR[i], 'rgba(5,8,13,0.7)', 0.6);
  }

  /* ================= 2. nose strakes / canards ================== */
  for (let i = 0; i < 2; i++) {
    fillP(c, JG.STRK[i], i ? '#2b3644' : '#48586c');
    strokeP(c, JG.STRK[i], 'rgba(6,9,14,0.8)', 0.7);
  }

  /* ================= 3. wings ==================================
     Hard sweep, big droop, tips almost level with the trailing edge:
     the tell-tale Wraith planform. Key from screen upper-left. */
  const wgL = lg(c, 'jt2.wL', -39, 0, -5, 0, [
    [0, '#1b232e'], [0.20, '#3f4f63'], [0.52, '#63788f'], [0.80, '#313d4c'], [1, '#182029']
  ]);
  const wgR = lg(c, 'jt2.wR', 5, 0, 39, 0, [
    [0, '#151d26'], [0.24, '#2a3441'], [0.60, '#3c4959'], [0.86, '#1b232d'], [1, '#0e141b']
  ]);
  const wg = [wgL, wgR];
  for (let i = 0; i < 2; i++) {
    fillP(c, JG.WING[i], wg[i]);
    /* the drooping outboard panel turns away from the key */
    fillP(c, JG.WSH[i], i ? 'rgba(4,7,11,0.50)' : 'rgba(4,7,11,0.34)');
    fillP(c, JG.WTE[i], 'rgba(0,0,0,0.35)');
    strokeP(c, JG.WING[i], 'rgba(5,8,13,0.9)', 0.9);
  }
  /* cyan leading-edge strip — the mesh carries the same TRIM band */
  c.save();
  c.globalCompositeOperation = 'lighter';
  fillP(c, JG.WLE[0], rgba(TR, 0.44));
  fillP(c, JG.WLE[1], rgba(TR, 0.28));
  c.restore();

  /* ================= 4. upturned wingtip fins =================== */
  for (let i = 0; i < 2; i++) {
    fillP(c, JG.TIPF[i], i ? '#3d4a5c' : '#66798f');
    strokeP(c, JG.TIPF[i], 'rgba(5,8,13,0.85)', 0.8);
  }

  /* ================= 5. fuselage spine ========================== */
  const fuG = lg(c, 'jt2.fu', -5.2, 0, 5.2, 0, [
    [0.00, '#0e141b'], [0.16, '#374557'], [0.42, '#6b7f97'],
    [0.60, '#485870'], [0.86, '#202834'], [1.00, '#0c1118']
  ]);
  fillP(c, JG.FUSE, fuG);
  /* upper deck facet: the flat top of the chined hex section */
  const dkG = lg(c, 'jt2.dk', -2.4, 0, 2.4, 0, [
    [0, '#556880'], [0.45, '#8296ad'], [1, '#39465a']
  ]);
  fillP(c, JG.DECK, dkG);
  strokeP(c, JG.FUSE, 'rgba(5,8,13,0.9)', 0.9);
  /* forebody chine trim: the mesh runs a broad cyan TRIM band down
     each chine, and it is the single loudest marking on the nose */
  c.save();
  c.globalCompositeOperation = 'lighter';
  fillP(c, JG.CHNB[0], rgba(TR, 0.30));
  fillP(c, JG.CHNB[1], rgba(TR, 0.19));
  strokeP(c, JG.CHINE[0], rgba(TR, 0.70), 1.2);
  strokeP(c, JG.CHINE[1], rgba(TR, 0.46), 1.2);
  c.restore();
  /* panel breaks across the spine */
  seg(c, -4.2, -4, 4.2, -4, 'rgba(0,0,0,0.30)', 0.6);
  seg(c, -4.6, 14, 4.6, 14, 'rgba(0,0,0,0.30)', 0.6);
  seg(c, -4.6, 15.0, 4.6, 15.0, 'rgba(200,222,248,0.10)', 0.5);
  /* starboard sensor blister, forward and to one side only */
  fillP(c, JG.BLIS, '#39465a');
  strokeP(c, JG.BLIS, 'rgba(5,8,13,0.8)', 0.6);

  /* ================= 6. canopy ================================== */
  const cnG = lg(c, 'jt2.cn', 0, -34, 0, -19, [
    [0.00, 'rgba(120,235,255,0.55)'], [0.35, 'rgba(38,150,190,0.85)'],
    [1.00, 'rgba(12,34,48,0.95)']
  ]);
  fillP(c, JG.CAN, cnG);
  strokeP(c, JG.CAN, 'rgba(6,10,16,0.8)', 0.7);
  strokeP(c, JG.CRDG, 'rgba(190,240,255,0.30)', 0.6);

  /* ================= 7. dorsal spine ridge + blade antenna ====== */
  fillP(c, JG.SPINE, lg(c, 'jt2.sp', -1.2, 0, 1.2, 0, [
    [0, '#61748b'], [0.55, '#333e4c'], [1, '#171e28']
  ]));
  strokeP(c, JG.SPINE, 'rgba(4,7,12,0.75)', 0.6);
  c.save();
  c.globalCompositeOperation = 'lighter';
  fillP(c, JG.SPTR, rgba(TR, 0.48));
  c.restore();
  fillP(c, JG.BLADE, '#8ea2b8');
  strokeP(c, JG.BLADE, 'rgba(4,7,12,0.85)', 0.5);

  /* ================= 8. engine pylons + nacelles ================
     Fat, high, and hugging the spine — the single biggest silhouette
     difference from a conventional fighter. */
  for (let i = 0; i < 2; i++) fillP(c, JG.PYL[i], '#1c2430');
  const nacG = [
    lg(c, 'jt2.nL', -15, 0, -4, 0, [
      [0, '#151d26'], [0.20, '#46586d'], [0.50, '#6b7f97'], [0.78, '#38445a'], [1, '#1a222c']
    ]),
    lg(c, 'jt2.nR', 4, 0, 15, 0, [
      [0, '#1a222c'], [0.24, '#333e4d'], [0.58, '#465366'], [0.82, '#1e2732'], [1, '#0f151c']
    ])
  ];
  const ntG = [
    lg(c, 'jt2.tL', -13, 0, -6, 0, [[0, '#4d5e73'], [0.5, '#7f93aa'], [1, '#445265']]),
    lg(c, 'jt2.tR', 6, 0, 13, 0, [[0, '#3d4959'], [0.5, '#556478'], [1, '#2b3542']])
  ];
  for (let i = 0; i < 2; i++) {
    fillP(c, JG.NAC[i], nacG[i]);
    fillP(c, JG.NTOP[i], ntG[i]);
    /* recessed forward intake: a dark trapezoid narrowing aft */
    fillP(c, JG.INTK[i], '#05080d');
    /* panel breaks on the nacelle deck */
    fillP(c, JG.NPB1[i], 'rgba(190,212,238,0.16)');
    fillP(c, JG.NPB2[i], 'rgba(0,0,0,0.34)');
    strokeP(c, JG.NAC[i], 'rgba(4,7,12,0.9)', 1.0);
    strokeP(c, JG.NIN[i], 'rgba(0,0,0,0.55)', 0.9);
    /* cyan strip down the flank keeps the shadow side readable —
       exactly the trick the mesh plays with its TRIM quads */
    c.save();
    c.globalCompositeOperation = 'lighter';
    strokeP(c, JG.NOUT[i], rgba(TR, i ? 0.26 : 0.42), 1.0);
    fillP(c, JG.ILIP[i], rgba(TR, i ? 0.42 : 0.62));
    c.restore();
  }
  /* the one asymmetric blade, on the port nacelle only */
  fillP(c, JG.NBLD, '#7b8fa6');
  strokeP(c, JG.NBLD, 'rgba(4,7,12,0.85)', 0.6);

  /* ================= 9. nozzles =================================
     Circular in the mesh, but this camera flattens them to slots.  */
  const hot = 0.18 + 0.82 * thrust;
  for (let i = 0; i < 2; i++) {
    const nx = (i ? 1 : -1) * JG.NZX;
    c.save();
    c.translate(nx, JG.NZY);
    c.beginPath(); c.ellipse(0, 0, JG.RX, JG.RY, 0, 0, TAU);
    c.fillStyle = i ? '#232c37' : '#3b4757'; c.fill();
    c.strokeStyle = 'rgba(5,8,13,0.85)'; c.lineWidth = 0.8; c.stroke();
    /* the throat is a cone, so its lit interior stretches forward */
    c.beginPath(); c.ellipse(0, -1.4, JG.BX, JG.BY + 2.2, 0, 0, TAU);
    c.fillStyle = '#070a10'; c.fill();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); c.ellipse(0, -1.2, JG.BX * 0.86, JG.BY + 1.9, 0, 0, TAU);
    c.fillStyle = rgba(T, 0.38 * hot); c.fill();
    c.beginPath(); c.ellipse(0, -1.0, JG.BX * 0.42, JG.BY + 0.9, 0, 0, TAU);
    c.fillStyle = rgba(WH, 0.55 * hot); c.fill();
    c.restore();
    c.restore();
    /* cyan rim trim on the nozzle ring */
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, nx - JG.RX, JG.NZY - JG.RY * 0.62, nx + JG.RX, JG.NZY - JG.RY * 0.62,
      rgba(TR, 0.40), 0.9);
    blob(c, nx, JG.NZY, 12, T, 0.32 * hot);
    c.restore();
  }

  /* ================ 10. afterburners (additive, aft) ============ */
  c.save();
  c.globalCompositeOperation = 'lighter';
  jetBurner(c, -JG.NZX, thrust, T);
  jetBurner(c, JG.NZX, thrust, T);
  c.restore();

  /* ================ 11. trim lights ============================
     The mesh has no red/green navs — it is lit with the same cyan
     TRIM everywhere — so the tips and the blade tip glow cyan. */
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const tx = (i ? 1 : -1) * JG.TIPX;
    disc(c, tx, JG.TIPY, 1.1, rgba(TR, 0.9));
    blob(c, tx, JG.TIPY, 8, TR, 0.34);
  }
  disc(c, 0, 1.0, 1.0, rgba(TR, 0.8));
  blob(c, 0, 1.0, 6, TR, 0.28);
  c.restore();

  c.restore();
}
