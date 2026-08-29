/* ==================================================================
   CINE_ART — procedural 2D vector art library for the SKYFALL
   INTERCEPTOR cinematic intro.  No images, no libraries.
   Everything is shaded with gradients + facets so the objects read as
   machines with volume, not flat silhouettes.

   Public API (ctx is always arg 0, all state is save/restore'd):
     rocket   (c, x, y, s, rot, thrust, tt)
     warship  (c, x, y, s, alpha, charge, tt)  -> { tips:[[x,y],[x,y]] }
     jet      (c, x, y, s, rot, thrust, tint)
     glove    (c, x, y, s, rot, mirror, alpha)
     mask     (c, x, y, s, rot, alpha)
     cockpit  (c, tt, boot, sealed)            absolute 1600x900
     silo     (c, x, y, w, open, glowCol)
     cloudBank(c, y, h, tt, tint, alpha)
   ================================================================== */
const CINE_ART = (function () {
  'use strict';

  const TAU = Math.PI * 2;
  const VW = 1600;

  /* ------------------------------------------------------------ util */
  function rgba(k, a) {
    return 'rgba(' + (k[0] | 0) + ',' + (k[1] | 0) + ',' + (k[2] | 0) + ',' + a + ')';
  }
  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* Build a closed path from a flat [x0,y0,x1,y1,...] array. */
  function path(c, p) {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.closePath();
  }
  function fillP(c, p, st) { path(c, p); c.fillStyle = st; c.fill(); }
  function strokeP(c, p, st, w) { path(c, p); c.strokeStyle = st; c.lineWidth = w; c.stroke(); }
  function seg(c, x0, y0, x1, y1, st, w) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.strokeStyle = st; c.lineWidth = w == null ? 1 : w; c.stroke();
  }
  function disc(c, x, y, r, st) {
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = st; c.fill();
  }
  function ring(c, x, y, r, st, w) {
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = st; c.lineWidth = w; c.stroke();
  }
  function ell(c, x, y, rx, ry, st) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = st; c.fill();
  }

  /* Deterministic hash noise — no Math.random anywhere, so every frame
     is reproducible from tt alone. */
  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }
  /* smooth 1-D value noise */
  function noise(x) {
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
  const gcache = typeof WeakMap === 'function' ? new WeakMap() : null;
  const gfallback = {};
  function bucket(c) {
    if (!gcache) return gfallback;
    let m = gcache.get(c);
    if (!m) { m = {}; gcache.set(c, m); }
    return m;
  }
  function lg(c, key, x0, y0, x1, y1, stops) {
    const m = bucket(c);
    let g = m[key];
    if (g) return g;
    g = c.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    m[key] = g;
    return g;
  }
  function rg(c, key, x0, y0, r0, x1, y1, r1, stops) {
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
  const sprites = {};
  function glowSprite(k) {
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
  function blob(c, x, y, r, col, a) {
    if (a <= 0.004 || r <= 0) return;
    c.globalAlpha = a > 1 ? 1 : a;
    c.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    c.globalAlpha = 1;
  }

  /* palette */
  const CY = [58, 224, 255], WH = [255, 255, 255], MG = [255, 60, 240],
    VI = [176, 84, 255], AM = [255, 186, 96], OR = [255, 122, 40];

  /* ==================================================================
     1. ROCKET — "SPEACE-X" two-stage orbital launch vehicle
     nose tip y=-120, engine bells y=+95, body half-width 17
     ================================================================== */

  /* Plume is drawn in a normalised 0..150 vertical space and squashed
     with a transform, so its gradients can be cached even though its
     length changes every frame. */
  function rocketPlume(c, thrust, tt) {
    if (thrust <= 0.001) return;
    const flick = 1 + 0.12 * Math.sin(tt * 41.3) * (0.5 + 0.5 * Math.sin(tt * 17.7 + 1.3));
    const L = (40 + 150 * thrust) * flick;
    const y0 = 93;
    const N = 150;                       // normalised plume height

    c.save();
    c.globalCompositeOperation = 'lighter';

    /* nozzle-plane bloom sits in unscaled space */
    blob(c, 0, y0 + 2, 34 + 26 * thrust, AM, 0.5 * thrust);
    blob(c, 0, y0 + 2, 18 + 12 * thrust, WH, 0.55 * thrust);

    c.save();
    c.translate(0, y0);
    c.scale(1, L / N);

    /* --- outer amber cone ------------------------------------- */
    const go = lg(c, 'rk.plume.out', 0, 0, 0, N, [
      [0.00, 'rgba(255,214,150,0.85)'],
      [0.18, 'rgba(255,150,54,0.62)'],
      [0.55, 'rgba(255,96,30,0.30)'],
      [1.00, 'rgba(200,40,10,0)']
    ]);
    c.beginPath();
    c.moveTo(-20, 0);
    c.quadraticCurveTo(-27, N * 0.42, -2, N);
    c.lineTo(2, N);
    c.quadraticCurveTo(27, N * 0.42, 20, 0);
    c.closePath();
    c.fillStyle = go;
    c.globalAlpha = 0.5 + 0.5 * thrust;
    c.fill();

    /* --- mid orange sheath ------------------------------------ */
    const gm = lg(c, 'rk.plume.mid', 0, 0, 0, N, [
      [0.00, 'rgba(255,236,196,0.9)'],
      [0.30, 'rgba(255,178,70,0.55)'],
      [1.00, 'rgba(255,110,30,0)']
    ]);
    c.beginPath();
    c.moveTo(-12, 0);
    c.quadraticCurveTo(-15, N * 0.4, -1, N * 0.9);
    c.lineTo(1, N * 0.9);
    c.quadraticCurveTo(15, N * 0.4, 12, 0);
    c.closePath();
    c.fillStyle = gm;
    c.fill();

    /* --- white-hot core --------------------------------------- */
    const gc = lg(c, 'rk.plume.core', 0, 0, 0, N, [
      [0.00, 'rgba(255,255,255,0.98)'],
      [0.22, 'rgba(255,248,225,0.8)'],
      [0.62, 'rgba(255,206,140,0.28)'],
      [1.00, 'rgba(255,170,90,0)']
    ]);
    c.beginPath();
    c.moveTo(-4.6, 0);
    c.quadraticCurveTo(-5.4, N * 0.34, 0, N * 0.72);
    c.quadraticCurveTo(5.4, N * 0.34, 4.6, 0);
    c.closePath();
    c.fillStyle = gc;
    c.fill();
    c.restore();

    /* --- shock diamonds: brighter than the core so they read ---- */
    const dn = 5;
    for (let i = 0; i < dn; i++) {
      const f = (i + 0.4) / dn;
      const dy = y0 + L * f * 0.66;
      const rx = (8.4 - i * 1.15) * (0.82 + 0.18 * Math.sin(tt * 24 + i * 1.7));
      const ry = rx * 1.8;
      const a = (1 - f * 0.8) * 0.95 * thrust;
      if (rx <= 0.5) continue;
      blob(c, 0, dy, rx * 3.6, AM, a * 0.5);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(255,255,255,1)';
      c.beginPath();
      c.moveTo(0, dy - ry); c.lineTo(rx, dy); c.lineTo(0, dy + ry); c.lineTo(-rx, dy);
      c.closePath(); c.fill();
      /* thin waist between diamonds */
      c.fillStyle = 'rgba(255,236,190,0.8)';
      c.beginPath();
      c.moveTo(0, dy + ry); c.lineTo(rx * 0.3, dy + ry * 1.5);
      c.lineTo(0, dy + ry * 2); c.lineTo(-rx * 0.3, dy + ry * 1.5);
      c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    c.restore();
  }

  function rocket(c, x, y, s, rot, thrust, tt) {
    thrust = thrust || 0; tt = tt || 0;
    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    c.scale(s, s);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    /* ---------- plume goes BEHIND the vehicle ---------- */
    rocketPlume(c, thrust, tt);

    const HW = 17;                     // body half width
    const BT = -62, BB = 62;           // body top / bottom
    const NT = -120;                   // nose tip

    /* ---------- aft fins: foreshortened pair first (far side) ---- */
    const finFar = lg(c, 'rk.finFar', -12, 0, 12, 0, [
      [0, '#161b26'], [0.5, '#39424f'], [1, '#10141c']
    ]);
    fillP(c, [-11, 52, -5, 52, -8, 96, -15, 96], finFar);
    fillP(c, [11, 52, 5, 52, 8, 96, 15, 96], finFar);

    /* ---------- big silhouette fins (left / right) --------------- */
    const finL = lg(c, 'rk.finL', -38, 0, -15, 0, [
      [0, '#0e1119'], [0.55, '#2b3340'], [1, '#59647a']
    ]);
    fillP(c, [-16, 46, -16, 97, -38, 99, -30, 62], finL);
    strokeP(c, [-16, 46, -16, 97, -38, 99, -30, 62], 'rgba(120,150,185,0.35)', 0.9);
    seg(c, -18, 58, -30, 68, 'rgba(0,0,0,0.5)', 1.2);

    const finR = lg(c, 'rk.finR', 15, 0, 38, 0, [
      [0, '#4a5566'], [0.5, '#232a36'], [1, '#0c0f16']
    ]);
    fillP(c, [16, 46, 16, 97, 38, 99, 30, 62], finR);
    strokeP(c, [16, 46, 16, 97, 38, 99, 30, 62], 'rgba(90,110,140,0.3)', 0.9);
    seg(c, 18, 58, 30, 68, 'rgba(0,0,0,0.5)', 1.2);

    /* ---------- engine skirt ------------------------------------ */
    const skirt = lg(c, 'rk.skirt', -21, 0, 21, 0, [
      [0.00, '#191d27'], [0.16, '#40495a'], [0.36, '#78859a'],
      [0.60, '#4a5466'], [0.85, '#1d222d'], [1.00, '#0d1017']
    ]);
    fillP(c, [-HW, BB, HW, BB, 21, 84, -21, 84], skirt);
    seg(c, -19.5, 72, 19.5, 72, 'rgba(0,0,0,0.55)', 1.1);
    seg(c, -19.3, 73.4, 19.3, 73.4, 'rgba(190,210,235,0.16)', 0.8);

    /* ---------- bell nozzles ------------------------------------ */
    const bellG = lg(c, 'rk.bell', -7, 0, 7, 0, [
      [0, '#0a0c11'], [0.42, '#4c5464'], [0.62, '#6f7a8c'], [1, '#0e1117']
    ]);
    const bx = [-11.5, 0, 11.5];
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(bx[i], 0);
      fillP(c, [-4.6, 83, 4.6, 83, 6.8, 95, -6.8, 95], bellG);
      /* mouth */
      ell(c, 0, 95, 6.8, 2.3, '#06070b');
      c.beginPath();
      c.ellipse(0, 95, 6.8, 2.3, 0, 0, TAU);
      c.strokeStyle = 'rgba(160,180,205,0.4)'; c.lineWidth = 0.8; c.stroke();
      if (thrust > 0.02) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        ell(c, 0, 95, 5.4, 1.7, rgba(AM, 0.55 * thrust));
        ell(c, 0, 95, 3.0, 1.0, rgba(WH, 0.8 * thrust));
        c.restore();
      }
      /* cooling channel ribs */
      for (let k = -2; k <= 2; k++) {
        seg(c, k * 1.9, 84, k * 2.7, 94, 'rgba(0,0,0,0.35)', 0.55);
      }
      c.restore();
    }

    /* ---------- main body: cylindrical shading ------------------ */
    const bodyG = lg(c, 'rk.body', -HW, 0, HW, 0, [
      [0.00, '#2f3644'], [0.08, '#5d6779'], [0.22, '#a8b3c4'],
      [0.36, '#eef3fa'], [0.46, '#d3dbe7'], [0.66, '#8d99ab'],
      [0.86, '#414a5b'], [1.00, '#1c212c']
    ]);
    c.fillStyle = bodyG;
    c.fillRect(-HW, BT, HW * 2, BB - BT);

    /* ---------- ogive nose cone --------------------------------- */
    const noseG = lg(c, 'rk.nose', -HW, 0, HW, 0, [
      [0.00, '#39414f'], [0.10, '#707b8d'], [0.34, '#f2f6fc'],
      [0.52, '#c3ccda'], [0.78, '#5d6779'], [1.00, '#242a36']
    ]);
    c.beginPath();
    c.moveTo(0, NT);
    c.quadraticCurveTo(-10.5, -100, -15.0, -80);
    c.quadraticCurveTo(-17.0, -70, -HW, BT);
    c.lineTo(HW, BT);
    c.quadraticCurveTo(17.0, -70, 15.0, -80);
    c.quadraticCurveTo(10.5, -100, 0, NT);
    c.closePath();
    c.fillStyle = noseG;
    c.fill();
    /* nose tip cap + seam */
    seg(c, -15.6, -76, 15.6, -76, 'rgba(0,0,0,0.4)', 0.8);
    seg(c, -15.4, -74.8, 15.4, -74.8, 'rgba(230,240,255,0.22)', 0.7);
    disc(c, 0, NT + 2.5, 2.0, '#c9d4e2');

    /* ---------- grid fins near the top -------------------------- */
    const gfG = lg(c, 'rk.gf', 16, 0, 33, 0, [[0, '#525c6e'], [1, '#191e28']]);
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      c.save();
      c.scale(sgn, 1);
      fillP(c, [16, -66, 31, -62, 31, -44, 16, -47], gfG);
      c.save();
      path(c, [16, -66, 31, -62, 31, -44, 16, -47]);
      c.clip();
      c.strokeStyle = 'rgba(10,13,19,0.75)';
      c.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) seg(c, 16 + i * 3.8, -68, 16 + i * 3.8, -42, 'rgba(10,13,19,0.75)', 0.8);
      for (let i = 0; i < 4; i++) seg(c, 14, -64 + i * 5.4, 33, -62 + i * 5.4, 'rgba(10,13,19,0.6)', 0.8);
      c.restore();
      strokeP(c, [16, -66, 31, -62, 31, -44, 16, -47], 'rgba(150,175,205,0.4)', 0.9);
      c.restore();
    }
    /* foreshortened grid fins (front/back) — thin slivers on the body */
    fillP(c, [-6, -66, 6, -66, 6, -47, -6, -47], 'rgba(24,29,38,0.85)');
    for (let i = 0; i < 4; i++) seg(c, -6, -64 + i * 5, 6, -64 + i * 5, 'rgba(120,140,168,0.25)', 0.6);

    /* ---------- interstage band + seams ------------------------- */
    const isG = lg(c, 'rk.is', -HW, 0, HW, 0, [
      [0.00, '#12151d'], [0.20, '#333a48'], [0.38, '#5d6779'],
      [0.62, '#3b4351'], [1.00, '#0b0d13']
    ]);
    c.fillStyle = isG;
    c.fillRect(-HW, -8, HW * 2, 16);
    seg(c, -HW, -8, HW, -8, 'rgba(0,0,0,0.7)', 1.1);
    seg(c, -HW, 8, HW, 8, 'rgba(0,0,0,0.7)', 1.1);
    seg(c, -HW, -6.6, HW, -6.6, 'rgba(200,220,245,0.2)', 0.7);
    seg(c, -HW, 9.3, HW, 9.3, 'rgba(200,220,245,0.16)', 0.7);
    for (let i = 0; i < 7; i++) {
      const px = -14 + i * 4.7;
      seg(c, px, -7, px, 7, 'rgba(0,0,0,0.35)', 0.6);
    }

    /* ---------- horizontal panel seams -------------------------- */
    const seams = [-52, -40, 18, 30, 54];
    for (let i = 0; i < seams.length; i++) {
      seg(c, -HW, seams[i], HW, seams[i], 'rgba(0,0,0,0.42)', 0.75);
      seg(c, -HW, seams[i] + 1.1, HW, seams[i] + 1.1, 'rgba(255,255,255,0.16)', 0.6);
    }
    /* vertical stringer seams */
    seg(c, -8.5, BT, -8.5, 62, 'rgba(0,0,0,0.18)', 0.6);
    seg(c, 7.5, BT, 7.5, 62, 'rgba(0,0,0,0.22)', 0.6);

    /* ---------- roll-alignment black & white pattern ------------ */
    for (let i = 0; i < 6; i++) {
      c.fillStyle = (i & 1) ? '#e9eef6' : '#0d1016';
      c.fillRect(-HW + i * (HW * 2 / 6), 34, HW * 2 / 6, 11);
    }
    seg(c, -HW, 34, HW, 34, 'rgba(0,0,0,0.5)', 0.7);
    seg(c, -HW, 45, HW, 45, 'rgba(0,0,0,0.5)', 0.7);
    /* long vertical roll stripe on the shaded side */
    c.fillStyle = 'rgba(12,15,21,0.85)';
    c.fillRect(11.5, -52, 3.2, 34);

    /* ---------- greebles: conduit, vents, sensor pods ----------- */
    c.fillStyle = '#2b323e';
    c.fillRect(-15.2, -34, 3.0, 40);          // raceway conduit
    seg(c, -13.7, -34, -13.7, 6, 'rgba(190,210,235,0.28)', 0.6);
    c.fillStyle = '#1a1f29';
    c.fillRect(9.5, 14, 6.0, 4.5);            // vent
    c.fillRect(9.5, 20, 6.0, 2.2);
    disc(c, -12, 20, 2.0, '#39424f');         // sensor pod
    disc(c, -12, 20, 0.9, '#8ea3bd');
    /* umbilical fairing */
    fillP(c, [-17, 46, -22, 50, -22, 58, -17, 60], '#232a35');

    /* ---------- rim light / bounce ------------------------------ */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const rimG = lg(c, 'rk.rim', -HW, 0, -HW + 5, 0, [
      [0, 'rgba(58,224,255,0.55)'], [1, 'rgba(58,224,255,0)']
    ]);
    c.fillStyle = rimG;
    c.fillRect(-HW, BT, 5, BB - BT);      // body only: never spills past the silhouette
    /* matching rim along the tapering nose edge */
    c.beginPath();
    c.moveTo(-15.0, -80);
    c.quadraticCurveTo(-17.0, -70, -HW, BT);
    c.lineTo(-HW + 4, BT);
    c.quadraticCurveTo(-13.4, -70, -11.6, -79);
    c.closePath();
    c.fillStyle = rgba(CY, 0.30);
    c.fill();
    /* amber bounce from the plume up the lower right */
    const bnc = lg(c, 'rk.bnc', 0, 96, 0, 30, [
      [0, 'rgba(255,150,60,0.5)'], [1, 'rgba(255,150,60,0)']
    ]);
    c.globalAlpha = 0.25 + 0.6 * thrust;
    c.fillStyle = bnc;
    c.fillRect(-HW, 30, HW * 2, 66);
    c.globalAlpha = 1;
    c.restore();

    /* ---------- "SPEACE-X" lettering, vertical down the body ---- */
    c.save();
    c.translate(-2.5, -30);
    c.rotate(Math.PI / 2);
    c.font = 'bold 9px "Courier New",monospace';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(16,20,28,0.9)';
    c.fillText('SPEACE-X', 0, 0);
    c.restore();
    /* second, smaller mark on the first stage, clear of the checkers */
    c.save();
    c.translate(-2.0, 48);
    c.rotate(Math.PI / 2);
    c.font = 'bold 5px "Courier New",monospace';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(20,25,34,0.7)';
    c.fillText('SPEACE-X', 0, 0);
    c.restore();

    /* ---------- outline to seat it against the sky -------------- */
    c.beginPath();
    c.moveTo(0, NT);
    c.quadraticCurveTo(-10.5, -100, -15.0, -80);
    c.quadraticCurveTo(-17.0, -70, -HW, BT);
    c.lineTo(-HW, BB);
    c.lineTo(HW, BB);
    c.lineTo(HW, BT);
    c.quadraticCurveTo(17.0, -70, 15.0, -80);
    c.quadraticCurveTo(10.5, -100, 0, NT);
    c.closePath();
    c.strokeStyle = 'rgba(6,8,13,0.55)';
    c.lineWidth = 1.0;
    c.stroke();

    c.restore();
  }

  /* ==================================================================
     2. WARSHIP — alien capital ship, from slightly above and in front
     ~300 wide, ~90 tall, centred on the origin.
     Prong tips (local) at (-118, 38) and (118, 38).
     ================================================================== */
  const PTX = 118, PTY = 38;

  /* main manta hull silhouette, forward-swept, prongs reaching at us */
  const WS_HULL = [
    -150, 4, -74, -22, 0, -34, 74, -22, 150, 4,
    PTX, PTY, 46, 15, 0, 25, -46, 15, -PTX, PTY
  ];

  function warshipChargeOrb(c, tx, ty, charge, tt, side) {
    if (charge <= 0.001) return;
    const k = charge * charge;
    /* pre-fire flicker gets faster and deeper as it tops out */
    const fl = 0.78 + 0.22 * noise(tt * (6 + 26 * charge) + side * 11.7)
      + 0.14 * charge * Math.sin(tt * 55 + side * 2.1);
    const r = (7 + 40 * k) * fl;

    c.save();
    c.globalCompositeOperation = 'lighter';

    /* radiating spikes */
    const n = 9;
    const spin = tt * (0.5 + 2.2 * charge) * (side ? 1 : -1);
    c.fillStyle = rgba(MG, 0.5 * charge);
    for (let i = 0; i < n; i++) {
      const a = spin + i * TAU / n;
      const len = r * (1.6 + 1.9 * noise(i * 3.3 + tt * 5 + side));
      const w = r * 0.16;
      const ca = Math.cos(a), sa = Math.sin(a);
      c.beginPath();
      c.moveTo(tx + ca * len, ty + sa * len);
      c.lineTo(tx - sa * w, ty + ca * w);
      c.lineTo(tx + sa * w, ty - ca * w);
      c.closePath();
      c.fill();
    }

    blob(c, tx, ty, r * 3.4, MG, 0.42 * charge);
    blob(c, tx, ty, r * 1.7, VI, 0.55 * charge);
    blob(c, tx, ty, r * 1.05, MG, 0.85 * charge);
    blob(c, tx, ty, r * 0.55, WH, 0.5 + 0.5 * k);
    disc(c, tx, ty, r * 0.30 * fl, rgba(WH, 0.35 + 0.65 * k));
    c.restore();
  }

  function warship(c, x, y, s, alpha, charge, tt) {
    alpha = alpha == null ? 1 : sat(alpha);
    charge = sat(charge || 0);
    tt = tt || 0;

    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.globalAlpha = alpha;
    c.lineJoin = 'round';

    /* ---------- faint outer bloom so it sits in the scene -------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    blob(c, 0, 0, 240, VI, 0.10 * alpha);
    blob(c, 0, 6, 150, MG, 0.07 * alpha);
    c.restore();

    /* ---------- hull underside: a thick dark slab under everything,
       offset down so the ship reads as a solid with depth ---------- */
    const bellyG = lg(c, 'ws.belly', 0, -20, 0, 36, [
      [0.00, '#0a0110'], [0.55, '#170a2e'], [1.00, '#2a1550']
    ]);
    fillP(c, [-150, 10, -74, -14, 0, -26, 74, -14, 150, 10,
      PTX, PTY + 9, 46, 22, 0, 33, -46, 22, -PTX, PTY + 9], bellyG);

    /* ---------- main hull top surface ---------------------------- */
    const hullG = lg(c, 'ws.hull', 0, -40, 0, 44, [
      [0.00, '#5a1c80'], [0.20, '#3a1052'], [0.55, '#240833'], [1.00, '#160421']
    ]);
    fillP(c, WS_HULL, hullG);

    /* ---------- upper wing facets (the form turns across them) --- */
    /* left wing faces the key light, right wing falls into shadow */
    const wingL = lg(c, 'ws.wingL', -150, 0, -30, 0, [
      [0, '#3a1152'], [0.42, '#642a8c'], [0.78, '#421660'], [1, '#26093a']
    ]);
    const wingR = lg(c, 'ws.wingR', 30, 0, 150, 0, [
      [0, '#210832'], [0.45, '#421660'], [0.8, '#2a0b3e'], [1, '#170526']
    ]);
    fillP(c, [-150, 4, -74, -22, -34, -14, -46, 15], wingL);
    fillP(c, [150, 4, 74, -22, 34, -14, 46, 15], wingR);
    /* outboard shadow wedge so the wings are not one flat value */
    fillP(c, [-150, 4, -112, -9, -104, 4, -132, 12], 'rgba(8,1,14,0.55)');
    fillP(c, [150, 4, 112, -9, 104, 4, 132, 12], 'rgba(8,1,14,0.7)');
    /* inboard lit panel */
    fillP(c, [-74, -22, -34, -14, -40, 2, -84, -4], 'rgba(120,44,164,0.30)');
    fillP(c, [74, -22, 34, -14, 40, 2, 84, -4], 'rgba(90,32,126,0.16)');

    /* leading-edge chamfer: a bright band where the top meets the
       swept edge — this is what makes the silhouette feel machined */
    fillP(c, [-150, 4, -74, -22, -72, -14, -145, 10], 'rgba(150,58,205,0.75)');
    fillP(c, [150, 4, 74, -22, 72, -14, 145, 10], 'rgba(112,40,158,0.55)');
    fillP(c, [-74, -22, 0, -34, 0, -26, -72, -14], 'rgba(176,72,232,0.7)');
    fillP(c, [74, -22, 0, -34, 0, -26, 72, -14], 'rgba(132,50,182,0.5)');

    /* ---------- ribbed plating ----------------------------------- */
    c.save();
    path(c, WS_HULL);
    c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.42)';
    c.lineWidth = 1.1;
    for (let i = 1; i < 9; i++) {
      const f = i / 9;
      c.beginPath();
      c.moveTo(-150 + f * 132, 4 - f * 18);
      c.quadraticCurveTo(-110 + f * 90, 24 - f * 6, -PTX + f * 74, PTY - f * 12);
      c.stroke();
      c.beginPath();
      c.moveTo(150 - f * 132, 4 - f * 18);
      c.quadraticCurveTo(110 - f * 90, 24 - f * 6, PTX - f * 74, PTY - f * 12);
      c.stroke();
    }
    /* a couple of brighter plate highlights */
    c.strokeStyle = 'rgba(150,70,200,0.20)';
    c.lineWidth = 0.9;
    for (let i = 2; i < 8; i += 2) {
      const f = i / 9;
      c.beginPath();
      c.moveTo(-150 + f * 132, 5.4 - f * 18);
      c.quadraticCurveTo(-110 + f * 90, 25.4 - f * 6, -PTX + f * 74, PTY + 1.4 - f * 12);
      c.stroke();
    }
    c.restore();

    /* ---------- recessed underbelly trench ----------------------- */
    const trG = lg(c, 'ws.trench', 0, -12, 0, 28, [
      [0, '#08000f'], [0.5, '#12031d'], [1, '#05000a']
    ]);
    fillP(c, [-52, -14, 52, -14, 34, 30, -34, 30], trG);
    /* trench walls: a lit inner face on one side, black on the other,
       so the recess actually reads as a recess */
    fillP(c, [-52, -14, -40, -14, -26, 30, -34, 30], 'rgba(96,34,138,0.42)');
    fillP(c, [52, -14, 40, -14, 26, 30, 34, 30], 'rgba(4,0,8,0.8)');
    strokeP(c, [-52, -14, 52, -14, 34, 30, -34, 30], 'rgba(0,0,0,0.9)', 1.6);
    /* trench ribs */
    for (let i = 0; i < 7; i++) {
      const f = i / 6, yy = -11 + f * 38;
      const hw = 48 - f * 15;
      seg(c, -hw, yy, hw, yy, 'rgba(0,0,0,0.6)', 1.0);
      seg(c, -hw, yy + 1.3, hw, yy + 1.3, 'rgba(140,58,190,0.18)', 0.8);
    }
    /* glowing magenta core slit */
    const pulseK = 0.62 + 0.2 * Math.sin(tt * 1.7) + 0.18 * charge + 0.1 * noise(tt * 9);
    c.save();
    c.globalCompositeOperation = 'lighter';
    blob(c, 0, 8, 86, MG, 0.34 * pulseK);
    blob(c, 0, 8, 40, VI, 0.30 * pulseK);
    c.globalAlpha = pulseK;
    fillP(c, [-7.5, -11, 7.5, -11, 5.0, 27, -5.0, 27], rgba(MG, 0.9));
    fillP(c, [-3.2, -9, 3.2, -9, 2.0, 25, -2.0, 25], rgba(WH, 0.95));
    c.globalAlpha = 1;
    c.restore();

    /* ---------- raised armoured spine / bridge ------------------- */
    const spineG = lg(c, 'ws.spine', 0, -52, 0, -4, [
      [0, '#7a2ba6'], [0.35, '#4a1668'], [1, '#1c0729']
    ]);
    const SP = [-38, -24, -22, -50, 22, -50, 38, -24, 26, -8, -26, -8];
    /* cast shadow onto the hull so the spine sits proud of it */
    fillP(c, [-38, -22, 38, -22, 40, -4, -40, -4], 'rgba(4,0,9,0.6)');
    fillP(c, SP, spineG);
    /* left facet catches the key light, right facet falls off hard */
    fillP(c, [-38, -24, -22, -50, 0, -50, 0, -8, -26, -8], 'rgba(140,52,190,0.42)');
    fillP(c, [38, -24, 22, -50, 0, -50, 0, -8, 26, -8], 'rgba(6,1,12,0.55)');
    /* top deck plate — a flat, brighter facet reading as the roof */
    fillP(c, [-22, -50, 22, -50, 26, -42, -26, -42], 'rgba(178,80,232,0.34)');
    strokeP(c, SP, 'rgba(0,0,0,0.7)', 1.3);
    /* armour ribs down the spine flanks */
    for (let i = 0; i < 4; i++) {
      const yy = -44 + i * 9;
      seg(c, -36 + i * 1.6, yy, -24 + i * 1.0, yy, 'rgba(0,0,0,0.45)', 0.9);
      seg(c, 36 - i * 1.6, yy, 24 - i * 1.0, yy, 'rgba(0,0,0,0.45)', 0.9);
    }
    /* bridge blister with a glowing viewport band */
    fillP(c, [-16, -46, 16, -46, 12, -35, -12, -35], '#0b0212');
    strokeP(c, [-16, -46, 16, -46, 12, -35, -12, -35], 'rgba(0,0,0,0.8)', 1.1);
    c.save();
    c.globalCompositeOperation = 'lighter';
    fillP(c, [-13.6, -44, 13.6, -44, 10.4, -39, -10.4, -39], rgba(MG, 0.6 + 0.3 * charge));
    blob(c, 0, -41, 36, MG, 0.24 + 0.2 * charge);
    c.restore();
    /* spine antennae greebles */
    seg(c, -8, -44, -11, -58, 'rgba(150,70,200,0.55)', 1.2);
    seg(c, 6, -44, 8, -54, 'rgba(150,70,200,0.4)', 1.0);
    disc(c, -11, -58, 1.6, rgba(MG, 0.8));

    /* ---------- the two forward prongs --------------------------- */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save();
      c.scale(sg, 1);
      const prG = lg(c, 'ws.prong', -152, 0, -100, 0, [
        [0, '#3a1052'], [0.38, '#5a1e80'], [0.72, '#280a39'], [1, '#10031a']
      ]);
      /* shadowed under-face first, offset down: gives the prong girth */
      fillP(c, [-148, 10, -136, 8, -PTX - 1, PTY + 6, -PTX + 14, PTY + 4, -130, 18], '#0a0110');
      fillP(c, [-150, 4, -138, 2, -PTX - 3, PTY - 2, -PTX, PTY + 3, -PTX + 14, PTY - 1, -132, 12], prG);
      /* top chamfer catches magenta */
      fillP(c, [-150, 4, -138, 2, -PTX - 3, PTY - 2, -PTX - 8, PTY + 2], 'rgba(160,58,215,0.62)');
      /* inner shadow face so the prong is not one flat value */
      fillP(c, [-132, 12, -PTX + 14, PTY - 1, -PTX + 10, PTY + 2, -128, 15], 'rgba(6,1,12,0.7)');
      /* emitter housing near the tip */
      fillP(c, [-PTX - 12, PTY - 12, -PTX + 2, PTY - 8, -PTX + 4, PTY + 2, -PTX - 10, PTY - 1], '#20072e');
      strokeP(c, [-PTX - 12, PTY - 12, -PTX + 2, PTY - 8, -PTX + 4, PTY + 2, -PTX - 10, PTY - 1], 'rgba(0,0,0,0.6)', 1);
      seg(c, -PTX - 9, PTY - 9, -PTX + 1, PTY - 5, 'rgba(150,70,200,0.35)', 0.9);
      c.restore();
    }

    /* ---------- wing greebles: turret blisters, vents, pods ------
       these give the hull a sense of scale; without them a 300-unit
       ship just reads as a big flat shape */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      const lit = sg < 0;                        // left side faces the key
      c.save();
      c.scale(sg, 1);
      /* dorsal turret blister */
      fillP(c, [-104, -3, -86, -9, -78, -1, -96, 5], lit ? '#5e2486' : '#2c0d40');
      fillP(c, [-104, -3, -86, -9, -87, -6, -103, -0.5], 'rgba(190,88,244,0.45)');
      strokeP(c, [-104, -3, -86, -9, -78, -1, -96, 5], 'rgba(0,0,0,0.65)', 1.0);
      seg(c, -99, -1.5, -84, -6.5, 'rgba(0,0,0,0.4)', 0.9);
      /* recessed vent bank */
      fillP(c, [-72, 2, -56, -3, -53, 3, -69, 8], '#100320');
      for (let k = 0; k < 4; k++) {
        seg(c, -70 + k * 4.4, 3.4, -67 + k * 4.4, -2.6, 'rgba(150,62,205,0.35)', 0.9);
      }
      /* outboard sensor pod on a short pylon */
      fillP(c, [-132, 6, -124, 3, -122, 8, -130, 11], lit ? '#4a1a6a' : '#230a34');
      disc(c, -127, 7, 1.8, rgba(CY, 0.7));
      c.restore();
    }

    /* ---------- hull light pinpricks ----------------------------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const h1 = hash(i * 2.7), h2 = hash(i * 5.1 + 9);
      const lx = (h1 * 2 - 1) * 138;
      const ly = -18 + h2 * 44 + Math.abs(lx) * 0.12;
      const tw = 0.45 + 0.55 * noise(tt * 2.4 + i * 3.1);
      const col = (i % 5 === 0) ? CY : MG;
      disc(c, lx, ly, 1.0, rgba(col, 0.85 * tw));
      blob(c, lx, ly, 6, col, 0.30 * tw);
    }
    c.restore();

    /* ---------- hot magenta rim light along the top edges -------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-150, 4); c.lineTo(-74, -22); c.lineTo(0, -34); c.lineTo(74, -22); c.lineTo(150, 4);
    c.strokeStyle = rgba(MG, 0.34); c.lineWidth = 2.4; c.stroke();
    c.strokeStyle = rgba(WH, 0.30); c.lineWidth = 0.9; c.stroke();
    /* prong top edges */
    c.beginPath();
    c.moveTo(-150, 4); c.lineTo(-PTX - 3, PTY - 2);
    c.moveTo(150, 4); c.lineTo(PTX + 3, PTY - 2);
    c.strokeStyle = rgba(MG, 0.22); c.lineWidth = 1.8; c.stroke();
    c.restore();

    /* ---------- cold violet bounce underneath -------------------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath();
    c.moveTo(-PTX, PTY); c.lineTo(-46, 15); c.lineTo(0, 25); c.lineTo(46, 15); c.lineTo(PTX, PTY);
    c.strokeStyle = 'rgba(110,70,220,0.34)'; c.lineWidth = 2.6; c.stroke();
    c.restore();

    /* ---------- charging weapon orbs at the prong tips ----------- */
    warshipChargeOrb(c, -PTX, PTY, charge, tt, 0);
    warshipChargeOrb(c, PTX, PTY, charge, tt, 1);

    c.restore();

    /* tips in FINAL CALLER COORDINATES (no rotation on this ship) */
    return {
      tips: [
        [x - PTX * s, y + PTY * s],
        [x + PTX * s, y + PTY * s]
      ]
    };
  }

  /* ==================================================================
     3. JET — player interceptor seen from BEHIND, nose toward -y
     ~92 wingspan (x +/-46), ~80 long (y -40 .. +40)
     ================================================================== */
  const JET_TINT = [120, 175, 225];

  function jetBurner(c, nx, thrust, tint) {
    if (thrust <= 0.005) return;
    const N = 60;                              // normalised flame length
    const L = (12 + 52 * thrust);
    c.save();
    c.translate(nx, 30);
    c.scale(1, L / N);
    const go = lg(c, 'jt.bo', 0, 0, 0, N, [
      [0.00, 'rgba(190,150,255,0.60)'],
      [0.34, 'rgba(150,90,255,0.34)'],
      [1.00, 'rgba(110,50,220,0)']
    ]);
    c.beginPath();
    c.moveTo(-6.6, 0);
    c.quadraticCurveTo(-7.4, N * 0.42, 0, N);
    c.quadraticCurveTo(7.4, N * 0.42, 6.6, 0);
    c.closePath();
    c.fillStyle = go; c.fill();
    const gi = lg(c, 'jt.bi', 0, 0, 0, N, [
      [0.00, 'rgba(255,255,255,0.95)'],
      [0.20, 'rgba(190,244,255,0.72)'],
      [0.58, 'rgba(88,214,255,0.28)'],
      [1.00, 'rgba(58,180,255,0)']
    ]);
    c.beginPath();
    c.moveTo(-3.3, 0);
    c.quadraticCurveTo(-3.8, N * 0.34, 0, N * 0.78);
    c.quadraticCurveTo(3.8, N * 0.34, 3.3, 0);
    c.closePath();
    c.fillStyle = gi; c.fill();
    c.restore();
    blob(c, nx, 31, 15 + 12 * thrust, tint, 0.5 * thrust);
    blob(c, nx, 31, 7 + 5 * thrust, WH, 0.55 * thrust);
  }

  function jet(c, x, y, s, rot, thrust, tint) {
    thrust = thrust == null ? 0 : sat(thrust);
    const T = tint || JET_TINT;

    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    c.scale(s, s);
    c.lineJoin = 'round';

    /* ---------- wings: leading-edge (far) darker slab first ------ */
    /* the leading edge is the FAR edge in this rear view, so it is the
       thickness face that catches almost no light */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save();
      c.scale(sg, 1);
      fillP(c, [6, -10, 46, 10, 46, 14, 6, -6], '#0a0e16');
      c.restore();
    }

    /* ---------- wing top surfaces (lighter, with dihedral) ------- */
    const wL = lg(c, 'jt.wL', -46, 0, -6, 0, [
      [0, '#1d2632'], [0.24, '#3d4d61'], [0.55, '#5b7089'], [0.82, '#2f3a49'], [1, '#161c24']
    ]);
    const wR = lg(c, 'jt.wR', 6, 0, 46, 0, [
      [0, '#121820'], [0.24, '#2b3644'], [0.6, '#414f61'], [0.85, '#1c242e'], [1, '#0e131a']
    ]);
    fillP(c, [-6, -6, -46, 14, -46, 18, -9, 27], wL);
    fillP(c, [6, -6, 46, 14, 46, 18, 9, 27], wR);
    /* outboard shadow wedge + inboard lit panel: the wing is a surface
       turning away from the light, not one flat swatch */
    fillP(c, [-46, 14, -32, 7, -30, 22, -46, 18], 'rgba(4,7,11,0.42)');
    fillP(c, [46, 14, 32, 7, 30, 22, 46, 18], 'rgba(4,7,11,0.55)');
    fillP(c, [-6, -6, -24, 3, -21, 25, -9, 27], 'rgba(150,180,210,0.10)');
    /* wing trailing-edge thickness (near face, catches bounce) */
    fillP(c, [-46, 18, -9, 27, -9, 29.5, -45, 20.5], 'rgba(120,150,185,0.22)');
    fillP(c, [46, 18, 9, 27, 9, 29.5, 45, 20.5], 'rgba(90,115,145,0.16)');

    /* wing panel seams */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save(); c.scale(sg, 1);
      seg(c, 14, 2.5, 16, 22, 'rgba(0,0,0,0.35)', 0.7);
      seg(c, 26, 8.5, 27, 24, 'rgba(0,0,0,0.32)', 0.7);
      seg(c, 36, 13, 37, 25.5, 'rgba(0,0,0,0.28)', 0.6);
      c.restore();
    }
    /* accent trim strip along the leading edge (tinted) */
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, -8, -6.6, -45, 13.4, rgba(T, 0.5), 1.5);
    seg(c, 8, -6.6, 45, 13.4, rgba(T, 0.32), 1.5);
    c.restore();

    /* ---------- horizontal stabs / tailerons -------------------- */
    const stG = lg(c, 'jt.st', -26, 0, 26, 0, [
      [0, '#38465a'], [0.5, '#1e2733'], [1, '#141b24']
    ]);
    fillP(c, [-8, 18, -25, 27, -25, 31, -9, 31], stG);
    fillP(c, [8, 18, 25, 27, 25, 31, 9, 31], stG);

    /* ---------- twin canted vertical stabilisers ---------------- */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save();
      c.scale(sg, 1);
      /* the fin sits well above the wing so it must read light against
         the dark wing behind it, with a dark inboard face for thickness */
      const fG = lg(c, 'jt.fin', 4, 0, 26, 0, [
        [0, '#8a9fb8'], [0.30, '#6a7c93'], [0.68, '#3b4757'], [1, '#141a22']
      ]);
      fillP(c, [4.5, 2, 22, -10, 26, 3, 10, 25], fG);
      /* cast shadow onto the wing under the fin root */
      fillP(c, [4.5, 2, 10, 25, 14, 26, 8, 3], 'rgba(4,7,11,0.55)');
      /* inboard (shadowed) face gives the fin real thickness */
      fillP(c, [4.5, 2, 22, -10, 23.2, -6.6, 5.6, 5.0], 'rgba(6,9,14,0.85)');
      strokeP(c, [4.5, 2, 22, -10, 26, 3, 10, 25], 'rgba(6,9,14,0.75)', 1.0);
      /* rudder hinge line */
      seg(c, 13, 12, 24, 0.5, 'rgba(0,0,0,0.4)', 0.7);
      c.save();
      c.globalCompositeOperation = 'lighter';
      seg(c, 5.0, 2.8, 21.4, -9.0, rgba(T, 0.5), 1.2);
      c.restore();
      c.restore();
    }

    /* ---------- fuselage ---------------------------------------- */
    const fuG = lg(c, 'jt.fu', -8, 0, 8, 0, [
      [0.00, '#141a23'], [0.16, '#33404f'], [0.40, '#6c7f96'],
      [0.55, '#4b5b6e'], [0.82, '#232c38'], [1.00, '#0e131a']
    ]);
    c.beginPath();
    c.moveTo(0, -40);
    c.quadraticCurveTo(-4.5, -30, -6.4, -10);
    c.lineTo(-8.0, 24);
    c.lineTo(-15.5, 33);
    c.lineTo(15.5, 33);
    c.lineTo(8.0, 24);
    c.lineTo(6.4, -10);
    c.quadraticCurveTo(4.5, -30, 0, -40);
    c.closePath();
    c.fillStyle = fuG; c.fill();

    /* raised dorsal spine */
    const spG = lg(c, 'jt.sp', -3.4, 0, 3.4, 0, [
      [0, '#43526a'], [0.4, '#8fa4bd'], [1, '#2b3542']
    ]);
    c.beginPath();
    c.moveTo(0, -34);
    c.quadraticCurveTo(-2.6, -22, -3.4, -2);
    c.lineTo(-3.0, 22);
    c.lineTo(3.0, 22);
    c.lineTo(3.4, -2);
    c.quadraticCurveTo(2.6, -22, 0, -34);
    c.closePath();
    c.fillStyle = spG; c.fill();
    seg(c, 0, -32, 0, 21, 'rgba(255,255,255,0.16)', 0.7);
    /* spine shadow line where it meets the deck */
    seg(c, -3.9, -2, -3.6, 22, 'rgba(0,0,0,0.5)', 0.8);
    seg(c, 3.9, -2, 3.6, 22, 'rgba(0,0,0,0.5)', 0.8);

    /* fuselage panel seams */
    seg(c, -6.2, 2, 6.2, 2, 'rgba(0,0,0,0.30)', 0.6);
    seg(c, -7.0, 12, 7.0, 12, 'rgba(0,0,0,0.30)', 0.6);
    seg(c, -7.0, 13.1, 7.0, 13.1, 'rgba(210,230,255,0.12)', 0.5);
    /* small dorsal greebles: flush intake lip + blade antenna */
    fillP(c, [-2.0, -18, 2.0, -18, 1.6, -13.5, -1.6, -13.5], 'rgba(14,19,27,0.75)');
    seg(c, -1.9, -13.6, 1.9, -13.6, 'rgba(190,215,240,0.22)', 0.6);
    seg(c, 0, -24, 0, -30, 'rgba(150,180,210,0.45)', 0.9);

    /* ---------- tail bulkhead + engine nozzles ------------------ */
    fillP(c, [-15.5, 33, 15.5, 33, 14, 37, -14, 37], '#080b11');
    const nzX = 8.2, nzY = 30;
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      const nx = sg * nzX;
      /* outer housing */
      const nG = rg(c, 'jt.nz' + i, nx - 3, nzY - 3, 1, nx, nzY, 8.4, [
        [0, '#6b7b90'], [0.55, '#333e4c'], [1, '#0d1117']
      ]);
      disc(c, nx, nzY, 8.4, nG);
      ring(c, nx, nzY, 8.4, 'rgba(8,11,17,0.8)', 1.1);
      /* petal ring */
      c.save();
      c.beginPath(); c.arc(nx, nzY, 6.6, 0, TAU); c.clip();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.7;
      for (let k = 0; k < 10; k++) {
        const a = k * TAU / 10;
        seg(c, nx, nzY, nx + Math.cos(a) * 8, nzY + Math.sin(a) * 8, 'rgba(0,0,0,0.45)', 0.7);
      }
      c.restore();
      disc(c, nx, nzY, 5.6, '#0a0d13');
      ring(c, nx, nzY, 5.6, 'rgba(160,185,215,0.30)', 0.9);
      /* hot inner plate */
      const hot = 0.18 + 0.82 * thrust;
      c.save();
      c.globalCompositeOperation = 'lighter';
      disc(c, nx, nzY, 4.4, rgba(T, 0.30 * hot));
      disc(c, nx, nzY, 2.6, rgba(WH, 0.5 * hot));
      blob(c, nx, nzY, 13, T, 0.35 * hot);
      c.restore();
    }

    /* ---------- afterburners (additive, trailing toward +y) ----- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    jetBurner(c, -nzX, thrust, T);
    jetBurner(c, nzX, thrust, T);
    c.restore();

    /* ---------- wingtip navigation lights ----------------------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const navL = [255, 70, 96], navR = [64, 255, 158];
    disc(c, -45, 16, 1.5, rgba(navL, 0.95));
    blob(c, -45, 16, 11, navL, 0.5);
    disc(c, 45, 16, 1.5, rgba(navR, 0.95));
    blob(c, 45, 16, 11, navR, 0.5);
    /* spine strobe */
    disc(c, 0, -30, 1.2, rgba(T, 0.85));
    blob(c, 0, -30, 8, T, 0.35);
    c.restore();

    c.restore();
  }

  /* ==================================================================
     4. GLOVE — pilot's gloved hand + forearm, first person,
     reaching UP from the bottom of frame. ~120 long.
     y +50 (cuff) .. y -70 (fingertips)
     ================================================================== */

  /* one tapered, creased finger segment chain */
  function finger(c, bx, by, segs) {
    /* segs: [ [len, ang, w0, w1], ... ] applied cumulatively */
    c.save();
    c.translate(bx, by);
    for (let i = 0; i < segs.length; i++) {
      const L = segs[i][0], A = segs[i][1], w0 = segs[i][2], w1 = segs[i][3];
      c.rotate(A);
      const g = lg(c, 'gl.fs' + i, -w0, 0, w0, 0, [
        [0, '#3d465c'], [0.28, '#5b6880'], [0.6, '#252c3b'], [1, '#111621']
      ]);
      c.beginPath();
      c.moveTo(-w0, 0);
      c.lineTo(-w1, -L + w1);
      c.quadraticCurveTo(-w1, -L, 0, -L);
      c.quadraticCurveTo(w1, -L, w1, -L + w1);
      c.lineTo(w0, 0);
      c.closePath();
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(5,8,14,0.75)'; c.lineWidth = 0.8; c.stroke();
      /* knuckle crease at the base of each segment */
      c.beginPath();
      c.moveTo(-w0 * 0.92, -1.6);
      c.quadraticCurveTo(0, -4.2, w0 * 0.92, -1.6);
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.0; c.stroke();
      c.beginPath();
      c.moveTo(-w0 * 0.9, -0.2);
      c.quadraticCurveTo(0, -2.6, w0 * 0.9, -0.2);
      c.strokeStyle = 'rgba(180,205,235,0.14)'; c.lineWidth = 0.7; c.stroke();
      /* cyan rim down the left edge of the segment */
      c.save();
      c.globalCompositeOperation = 'lighter';
      seg(c, -w0 + 0.4, -1, -w1 + 0.3, -L + w1, rgba(CY, 0.28), 1.0);
      c.restore();
      c.translate(0, -L);
    }
    c.restore();
  }

  function glove(c, x, y, s, rot, mirror, alpha) {
    alpha = alpha == null ? 1 : sat(alpha);
    if (alpha <= 0.002) return;

    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    c.scale(s, s);
    if (mirror) c.scale(-1, 1);
    c.globalAlpha = alpha;
    c.lineJoin = 'round';

    /* ---------- forearm gauntlet -------------------------------- */
    const armG = lg(c, 'gl.arm', -18, 0, 18, 0, [
      [0.00, '#0c1018'], [0.14, '#252d3e'], [0.36, '#48546c'],
      [0.58, '#2b3344'], [0.84, '#151a25'], [1.00, '#090c13']
    ]);
    c.beginPath();
    c.moveTo(-17, 52);
    c.lineTo(-16, 18);
    c.quadraticCurveTo(-15, 6, -14, 2);
    c.lineTo(14, 2);
    c.quadraticCurveTo(15, 6, 16, 18);
    c.lineTo(17, 52);
    c.closePath();
    c.fillStyle = armG; c.fill();

    /* segmented armour plates on the gauntlet */
    const plG = lg(c, 'gl.pl', -15, 0, 15, 0, [
      [0, '#161c29'], [0.3, '#3a4459'], [0.62, '#232a39'], [1, '#0d1119']
    ]);
    fillP(c, [-15.4, 30, 15.4, 30, 15.0, 20, -15.0, 20], plG);
    fillP(c, [-14.6, 17, 14.6, 17, 14.2, 8, -14.2, 8], plG);
    strokeP(c, [-15.4, 30, 15.4, 30, 15.0, 20, -15.0, 20], 'rgba(4,6,11,0.8)', 0.9);
    strokeP(c, [-14.6, 17, 14.6, 17, 14.2, 8, -14.2, 8], 'rgba(4,6,11,0.8)', 0.9);
    seg(c, -14.8, 21.2, 14.8, 21.2, 'rgba(190,215,245,0.14)', 0.7);
    seg(c, -14.0, 9.2, 14.0, 9.2, 'rgba(190,215,245,0.12)', 0.7);

    /* ribbed cuff */
    for (let i = 0; i < 6; i++) {
      const yy = 52 - i * 3.4;
      seg(c, -16.8 + i * 0.12, yy, 16.8 - i * 0.12, yy, 'rgba(0,0,0,0.5)', 1.3);
      seg(c, -16.6 + i * 0.12, yy + 1.3, 16.6 - i * 0.12, yy + 1.3, 'rgba(160,190,220,0.13)', 0.8);
    }
    /* cyan status LED + label block */
    fillP(c, [4, 24, 13, 24, 13, 29, 4, 29], '#080b12');
    c.save();
    c.globalCompositeOperation = 'lighter';
    disc(c, 8.5, 26.5, 1.7, rgba(CY, 0.95));
    blob(c, 8.5, 26.5, 10, CY, 0.45);
    c.restore();
    fillP(c, [-13, 23, -5, 23, -5, 27, -13, 27], '#1b2130');
    seg(c, -12, 25, -6, 25, 'rgba(140,170,200,0.35)', 0.7);

    /* ---------- padded palm / back-of-hand ---------------------- */
    const palmG = lg(c, 'gl.palm', -19, 0, 19, 0, [
      [0.00, '#0d111a'], [0.16, '#2b3446'], [0.38, '#586880'],
      [0.60, '#333c4e'], [0.86, '#171d29'], [1.00, '#0a0d14']
    ]);
    c.beginPath();
    c.moveTo(-14, 4);
    c.quadraticCurveTo(-19, -6, -17.5, -18);
    c.quadraticCurveTo(-16, -28, -8, -30);
    c.lineTo(12, -28);
    c.quadraticCurveTo(18, -25, 18, -14);
    c.quadraticCurveTo(18, -4, 14, 4);
    c.closePath();
    c.fillStyle = palmG; c.fill();
    c.strokeStyle = 'rgba(4,6,11,0.7)'; c.lineWidth = 1.0; c.stroke();

    /* quilted padding on the back of the hand */
    c.save();
    c.beginPath();
    c.moveTo(-14, 4);
    c.quadraticCurveTo(-19, -6, -17.5, -18);
    c.quadraticCurveTo(-16, -28, -8, -30);
    c.lineTo(12, -28);
    c.quadraticCurveTo(18, -25, 18, -14);
    c.quadraticCurveTo(18, -4, 14, 4);
    c.closePath();
    c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.42)'; c.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++) seg(c, i * 7.4, -32, i * 7.4 + 2, 6, 'rgba(0,0,0,0.42)', 0.9);
    for (let i = 0; i < 3; i++) seg(c, -20, -24 + i * 10, 20, -26 + i * 10, 'rgba(0,0,0,0.34)', 0.9);
    /* knuckle bumps */
    for (let i = 0; i < 4; i++) {
      ell(c, -11 + i * 8.6, -26, 4.2, 3.0, 'rgba(120,150,185,0.16)');
    }
    c.restore();

    /* ---------- thumb (distinct, off the near side) ------------- */
    c.save();
    c.translate(-12.5, -9);
    c.rotate(-0.34);
    const thG = lg(c, 'gl.th', -7, 0, 7, 0, [
      [0, '#39435a'], [0.3, '#5a6880'], [0.65, '#232b3a'], [1, '#0e131c']
    ]);
    c.beginPath();
    c.moveTo(-7, 4); c.lineTo(-6.4, -13);
    c.quadraticCurveTo(-6.0, -18, -1.5, -18.5);
    c.quadraticCurveTo(3.0, -19, 3.6, -13);
    c.lineTo(4.4, 4);
    c.closePath();
    c.fillStyle = thG; c.fill();
    c.strokeStyle = 'rgba(4,6,11,0.75)'; c.lineWidth = 0.9; c.stroke();
    seg(c, -6.4, -12, 3.6, -12.6, 'rgba(0,0,0,0.5)', 1.0);
    /* thumb tip pad */
    c.translate(-1.2, -18.5);
    c.rotate(-0.5);
    c.beginPath();
    c.moveTo(-5.4, 1); c.lineTo(-4.6, -11);
    c.quadraticCurveTo(-4.2, -15, 0, -15);
    c.quadraticCurveTo(4.0, -15, 4.0, -11);
    c.lineTo(4.6, 1);
    c.closePath();
    c.fillStyle = thG; c.fill();
    c.strokeStyle = 'rgba(4,6,11,0.75)'; c.lineWidth = 0.9; c.stroke();
    c.restore();

    /* ---------- four fingers, curled as if gripping ------------- */
    /* base x, base y, then [len, angle, w0, w1] per segment */
    const F = [
      [-9.5, -28, [[17, -0.10, 5.4, 4.7], [13, 0.52, 4.6, 4.0], [9, 0.60, 3.9, 3.2]]],
      [-0.6, -30, [[19, -0.02, 5.6, 4.9], [14, 0.55, 4.8, 4.1], [9.5, 0.62, 4.0, 3.2]]],
      [7.8, -29, [[17.5, 0.08, 5.4, 4.6], [13, 0.58, 4.5, 3.9], [9, 0.64, 3.8, 3.0]]],
      [15.4, -25, [[13.5, 0.20, 4.6, 3.9], [10.5, 0.60, 3.8, 3.3], [7.5, 0.66, 3.2, 2.6]]]
    ];
    for (let i = 0; i < F.length; i++) finger(c, F[i][0], F[i][1], F[i][2]);

    /* ---------- lighting: cyan rim one edge, warm bounce other ---
       Clipped to the arm+palm silhouette so no light spills onto the
       background — a rectangle of glow here would betray the vector. */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath();
    c.moveTo(-17, 52);
    c.lineTo(-16, 18);
    c.quadraticCurveTo(-15, 6, -14, 4);
    c.quadraticCurveTo(-19, -6, -17.5, -18);
    c.quadraticCurveTo(-16, -28, -8, -30);
    c.lineTo(12, -28);
    c.quadraticCurveTo(18, -25, 18, -14);
    c.quadraticCurveTo(18, -4, 14, 4);
    c.quadraticCurveTo(15, 6, 16, 18);
    c.lineTo(17, 52);
    c.closePath();
    c.clip();
    const rimG = lg(c, 'gl.rim', -19, 0, -11, 0, [
      [0, 'rgba(58,224,255,0.5)'], [1, 'rgba(58,224,255,0)']
    ]);
    c.fillStyle = rimG;
    c.fillRect(-19, -34, 9, 90);
    const wrmG = lg(c, 'gl.wrm', 19, 0, 7, 0, [
      [0, 'rgba(255,168,88,0.34)'], [1, 'rgba(255,168,88,0)']
    ]);
    c.fillStyle = wrmG;
    c.fillRect(7, -32, 12, 88);
    c.restore();

    c.restore();
  }

  /* ==================================================================
     5. MASK — pilot's oxygen mask, face on. ~130 wide (x +/-65).
     NOTE: the breathing hose trails well past the nominal bounds,
     down to roughly (-125, +125) in local units.
     ================================================================== */
  function maskCup(c) {
    c.beginPath();
    c.moveTo(-65, -30);
    c.quadraticCurveTo(-62, -44, -44, -46);
    c.lineTo(44, -46);
    c.quadraticCurveTo(62, -44, 65, -30);
    c.quadraticCurveTo(66, -8, 52, 16);
    c.quadraticCurveTo(38, 42, 16, 51);
    c.quadraticCurveTo(0, 56, -16, 51);
    c.quadraticCurveTo(-38, 42, -52, 16);
    c.quadraticCurveTo(-66, -8, -65, -30);
    c.closePath();
  }

  function mask(c, x, y, s, rot, alpha) {
    alpha = alpha == null ? 1 : sat(alpha);
    if (alpha <= 0.002) return;

    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    c.scale(s, s);
    c.globalAlpha = alpha;
    c.lineJoin = 'round';

    /* ---------- corrugated breathing hose (behind the cup) ------ */
    /* chain of overlapping ribbed segments, tapering as it recedes */
    const HN = 14;
    c.save();
    for (let i = HN - 1; i >= 0; i--) {
      const t = i / (HN - 1);
      /* quadratic path from under the cup out to the lower left */
      const px = mix(mix(-22, -74, t), mix(-74, -122, t), t);
      const py = mix(mix(40, 66, t), mix(66, 124, t), t);
      /* tangent for segment orientation */
      const tx = mix(-74 - -22, -122 - -74, t);
      const ty = mix(66 - 40, 124 - 66, t);
      const a = Math.atan2(ty, tx);
      const r = mix(16.5, 8.5, t);
      c.save();
      c.translate(px, py);
      c.rotate(a);
      const hgG = lg(c, 'mk.hose', 0, -18, 0, 18, [
        [0.00, '#0b0e15'], [0.20, '#39445a'], [0.42, '#5c6b86'],
        [0.62, '#2b3443'], [1.00, '#070a10']
      ]);
      c.save();
      c.scale(1, r / 16.5);
      c.beginPath();
      c.moveTo(-7, -16.5);
      c.quadraticCurveTo(0, -19.5, 7, -16.5);
      c.lineTo(7, 16.5);
      c.quadraticCurveTo(0, 19.5, -7, 16.5);
      c.closePath();
      c.fillStyle = hgG; c.fill();
      c.strokeStyle = 'rgba(3,5,9,0.75)'; c.lineWidth = 1.2; c.stroke();
      /* rib highlight */
      c.beginPath();
      c.moveTo(-2.4, -16.0);
      c.quadraticCurveTo(-2.4, 0, -2.4, 16.0);
      c.strokeStyle = 'rgba(175,205,240,0.16)'; c.lineWidth = 2.0; c.stroke();
      c.restore();
      c.restore();
    }
    c.restore();
    /* hose collar where it enters the cup */
    ell(c, -22, 38, 15, 13, '#0d1119');

    /* ---------- strap tabs + buckles ---------------------------- */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save();
      c.scale(sg, 1);
      const tbG = lg(c, 'mk.tab', 58, 0, 84, 0, [
        [0, '#39424f'], [0.4, '#5e6a7c'], [1, '#161b24']
      ]);
      fillP(c, [56, -36, 82, -30, 82, -12, 56, -14], tbG);
      strokeP(c, [56, -36, 82, -30, 82, -12, 56, -14], 'rgba(4,6,11,0.8)', 1.1);
      /* buckle */
      fillP(c, [68, -30, 80, -27, 80, -16, 68, -17], '#0a0d13');
      strokeP(c, [70, -28, 78, -26, 78, -19, 70, -20], 'rgba(180,200,225,0.55)', 1.6);
      seg(c, 74, -27, 74, -19, 'rgba(180,200,225,0.4)', 1.2);
      c.restore();
    }

    /* ---------- mic boom stub (right side) ---------------------- */
    c.save();
    c.translate(52, 6);
    c.rotate(0.55);
    const mbG = lg(c, 'mk.mb', 0, -6, 0, 6, [
      [0, '#4d5768'], [0.45, '#6e7c92'], [1, '#12161e']
    ]);
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(26, -4.6);
    c.quadraticCurveTo(31, -4.6, 31, 0);
    c.quadraticCurveTo(31, 4.6, 26, 4.6);
    c.lineTo(0, 6);
    c.closePath();
    c.fillStyle = mbG; c.fill();
    c.strokeStyle = 'rgba(4,6,11,0.8)'; c.lineWidth = 1.0; c.stroke();
    for (let i = 0; i < 4; i++) seg(c, 8 + i * 5, -5.4, 8 + i * 5, 5.4, 'rgba(0,0,0,0.4)', 0.8);
    disc(c, 27, 0, 3.0, '#080b11');
    c.restore();

    /* ---------- main rubber cup --------------------------------- */
    const cupG = lg(c, 'mk.cup', -66, -46, 40, 56, [
      [0.00, '#2b3240'], [0.22, '#3b4454'], [0.48, '#242b38'],
      [0.74, '#161b25'], [1.00, '#0a0d13']
    ]);
    maskCup(c);
    c.fillStyle = cupG; c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.8)'; c.lineWidth = 1.6; c.stroke();

    c.save();
    maskCup(c);
    c.clip();

    /* upper cheek facets so the form turns */
    fillP(c, [-65, -30, -44, -46, -6, -40, -18, -6, -56, -4], 'rgba(88,102,124,0.22)');
    fillP(c, [65, -30, 44, -46, 6, -40, 18, -6, 56, -4], 'rgba(10,13,19,0.30)');
    /* lower jaw shadow */
    fillP(c, [-52, 16, 52, 16, 30, 46, -30, 46], 'rgba(6,8,13,0.45)');
    /* seam between the moulded halves */
    seg(c, -60, -4, 60, -4, 'rgba(0,0,0,0.55)', 1.6);
    seg(c, -60, -2.2, 60, -2.2, 'rgba(190,215,245,0.12)', 0.9);
    /* stitched edge following the rim */
    c.beginPath();
    c.moveTo(-58, -28);
    c.quadraticCurveTo(-59, -8, -46, 14);
    c.quadraticCurveTo(-33, 37, 0, 46);
    c.quadraticCurveTo(33, 37, 46, 14);
    c.quadraticCurveTo(59, -8, 58, -28);
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.0;
    c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);

    /* specular sheen along the top of the cup */
    const shG = lg(c, 'mk.sheen', 0, -48, 0, -10, [
      [0, 'rgba(215,238,255,0.34)'], [1, 'rgba(215,238,255,0)']
    ]);
    c.beginPath();
    c.moveTo(-58, -30);
    c.quadraticCurveTo(-46, -45, -8, -44);
    c.quadraticCurveTo(34, -43, 56, -30);
    c.quadraticCurveTo(30, -22, -6, -23);
    c.quadraticCurveTo(-40, -24, -58, -30);
    c.closePath();
    c.fillStyle = shG; c.fill();

    /* cyan rim light down the left */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const rimG = lg(c, 'mk.rim', -66, 0, -48, 0, [
      [0, 'rgba(58,224,255,0.34)'], [1, 'rgba(58,224,255,0)']
    ]);
    c.fillStyle = rimG;
    c.fillRect(-66, -48, 20, 106);
    c.restore();
    c.restore();

    /* ---------- chromed exhalation valve ------------------------ */
    const vx = 0, vy = 26;
    /* housing shadow so it sits proud of the rubber */
    ell(c, vx, vy + 2.5, 19, 18, 'rgba(0,0,0,0.55)');
    const vG = rg(c, 'mk.valve', vx - 6, vy - 7, 1, vx, vy, 18, [
      [0.00, '#e7eef8'], [0.22, '#a9b6c8'], [0.50, '#4f5b6d'],
      [0.74, '#8998ad'], [1.00, '#1a2029']
    ]);
    disc(c, vx, vy, 17.5, vG);
    ring(c, vx, vy, 17.5, 'rgba(4,6,11,0.8)', 1.4);
    ring(c, vx, vy, 14.0, 'rgba(20,26,34,0.85)', 1.6);
    ring(c, vx, vy, 11.0, 'rgba(210,228,248,0.35)', 1.0);
    ring(c, vx, vy, 8.0, 'rgba(20,26,34,0.7)', 1.4);
    disc(c, vx, vy, 5.4, '#0b0e15');
    /* radial valve slots */
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + 0.15;
      seg(c, vx + Math.cos(a) * 8.6, vy + Math.sin(a) * 8.6,
        vx + Math.cos(a) * 13.4, vy + Math.sin(a) * 13.4, 'rgba(6,9,14,0.7)', 1.4);
    }
    /* chrome specular hotspot */
    c.save();
    c.globalCompositeOperation = 'lighter';
    ell(c, vx - 6, vy - 8, 5.5, 3.4, 'rgba(255,255,255,0.5)');
    blob(c, vx - 6, vy - 8, 12, WH, 0.22);
    c.restore();

    /* ---------- two small hardware greebles --------------------- */
    disc(c, -34, 30, 2.6, '#0a0d13');
    disc(c, -34, 30, 1.2, 'rgba(170,195,225,0.5)');
    fillP(c, [24, 34, 36, 31, 37, 38, 25, 41], '#12171f');

    c.restore();
  }

  /* ==================================================================
     7. SILO — underground hangar launch door in the ground plane.
     Perspective trapezoid, wider at the near (bottom) edge.
     Designed at a nominal near-width of 200 and scaled by w/200.
     NOTE: the upward light bloom reaches ~1.6*w above the door.
     ================================================================== */
  const SL_NW = 100;   // near half width
  const SL_FW = 62;    // far half width
  const SL_D = 58;     // half depth on screen

  function siloDoor(c, sgn, off, glowCol) {
    /* one armoured half-door, slid outward by `off` */
    c.save();
    c.translate(sgn * off, 0);
    const near = sgn * SL_NW, far = sgn * SL_FW;
    const p = [0, -SL_D, far, -SL_D, near, SL_D, 0, SL_D];

    const dG = lg(c, 'sl.door' + (sgn > 0 ? 'R' : 'L'), 0, -SL_D, 0, SL_D, [
      [0.00, '#1b2029'], [0.35, '#333c49'], [0.72, '#242b36'], [1.00, '#12161d']
    ]);
    fillP(c, p, dG);

    c.save();
    path(c, p); c.clip();

    /* structural ribs running with the perspective */
    for (let i = 1; i < 5; i++) {
      const f = i / 5;
      seg(c, sgn * mix(0, SL_FW, f), -SL_D, sgn * mix(0, SL_NW, f), SL_D, 'rgba(0,0,0,0.45)', 1.2);
      seg(c, sgn * mix(0, SL_FW, f) + sgn * 1.2, -SL_D, sgn * mix(0, SL_NW, f) + sgn * 1.6, SL_D,
        'rgba(190,215,245,0.10)', 0.9);
    }
    /* cross seams */
    for (let i = 1; i < 3; i++) {
      const f = i / 3, yy = -SL_D + f * SL_D * 2;
      const hw = mix(SL_FW, SL_NW, f);
      seg(c, 0, yy, sgn * hw, yy, 'rgba(0,0,0,0.4)', 1.0);
    }

    /* hazard chevrons: a narrow warning band hugging the inner edge */
    c.save();
    c.beginPath();
    c.moveTo(0, -SL_D);
    c.lineTo(sgn * (SL_FW * 0.155), -SL_D);
    c.lineTo(sgn * (SL_NW * 0.155), SL_D);
    c.lineTo(0, SL_D);
    c.closePath();
    c.clip();
    c.fillStyle = '#12151b';
    c.fillRect(-SL_NW, -SL_D * 1.2, SL_NW * 2, SL_D * 2.4);
    c.fillStyle = 'rgba(196,162,44,0.85)';
    for (let i = -1; i < 9; i++) {
      const yy = -SL_D + i * 15;
      c.beginPath();
      c.moveTo(-SL_NW, yy);
      c.lineTo(-SL_NW, yy + 7);
      c.lineTo(SL_NW, yy + 7 + 26);
      c.lineTo(SL_NW, yy + 26);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.restore();

    /* raised edge highlight (the door has thickness) */
    strokeP(c, p, 'rgba(6,9,14,0.75)', 1.4);
    seg(c, 0, -SL_D, sgn * 0, SL_D, 'rgba(0,0,0,0)', 0.1);
    /* inner-edge top light catches the slot glow */
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, 0, -SL_D, 0, SL_D, rgba(glowCol, 0.5), 3.0);
    c.restore();
    c.restore();
  }

  function silo(c, x, y, w, open, glowCol) {
    open = sat(open || 0);
    const G = glowCol || CY;
    const k = (w || 200) / (SL_NW * 2);

    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.lineJoin = 'round';

    /* ---------- concrete surround ------------------------------- */
    const sur = [-SL_FW - 26, -SL_D - 14, SL_FW + 26, -SL_D - 14,
      SL_NW + 42, SL_D + 18, -SL_NW - 42, SL_D + 18];
    const surG = lg(c, 'sl.sur', 0, -SL_D - 14, 0, SL_D + 18, [
      [0, '#171a22'], [0.5, '#22262f'], [1, '#101319']
    ]);
    fillP(c, sur, surG);
    strokeP(c, sur, 'rgba(6,8,12,0.8)', 1.4);
    /* deck plate seams on the apron */
    c.save(); path(c, sur); c.clip();
    for (let i = -3; i <= 3; i++) {
      seg(c, i * 34, -SL_D - 14, i * 52, SL_D + 18, 'rgba(0,0,0,0.35)', 1.0);
    }
    c.restore();

    /* ---------- the open slot ----------------------------------- */
    const off = open * (SL_NW * 0.98);
    if (open > 0.004) {
      /* light spilling onto the surrounding ground */
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1;
      const spill = rg(c, 'sl.spill', 0, 0, 1, 0, 0, 200, [
        [0.00, rgba(G, 0.55)], [0.28, rgba(G, 0.22)], [1.00, rgba(G, 0)]
      ]);
      c.save();
      c.scale(1, 0.5);
      c.globalAlpha = open;
      c.fillStyle = spill;
      c.fillRect(-200, -200, 400, 400);
      c.restore();
      c.restore();

      /* the slot itself */
      const slot = [-off * (SL_FW / SL_NW) - 0, -SL_D, off * (SL_FW / SL_NW), -SL_D,
        off, SL_D, -off, SL_D];
      /* keep the slot reading as glowCol; white only in the hot core */
      const slotG = lg(c, 'sl.slot.' + (G[0] | 0) + (G[1] | 0) + (G[2] | 0), 0, -SL_D, 0, SL_D, [
        [0.00, rgba(G, 0.45)], [0.30, rgba(G, 0.95)], [1.00, rgba(G, 0.7)]
      ]);
      fillP(c, slot, '#000');
      c.save();
      c.globalCompositeOperation = 'lighter';
      fillP(c, slot, slotG);
      /* hot centre line: narrow, so the colour survives around it */
      c.globalAlpha = 0.85;
      fillP(c, [-off * 0.16, -SL_D, off * 0.16, -SL_D, off * 0.24, SL_D, -off * 0.24, SL_D],
        'rgba(255,255,255,0.75)');
      c.globalAlpha = 1;

      /* upward light bloom */
      const upG = lg(c, 'sl.up', 0, 0, 0, -300, [
        [0.00, rgba(G, 0.42)], [0.35, rgba(G, 0.16)], [1.00, rgba(G, 0)]
      ]);
      c.globalAlpha = open;
      c.beginPath();
      c.moveTo(-off * 1.05, SL_D);
      c.lineTo(off * 1.05, SL_D);
      c.lineTo(off * 2.6, -300);
      c.lineTo(-off * 2.6, -300);
      c.closePath();
      c.fillStyle = upG; c.fill();
      blob(c, 0, 0, 90 + 120 * open, G, 0.35 * open);
      c.globalAlpha = 1;
      c.restore();
    }

    /* ---------- the two armoured door halves -------------------- */
    siloDoor(c, -1, off, G);
    siloDoor(c, 1, off, G);

    /* ---------- approach lights around the opening -------------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const hw = mix(SL_FW, SL_NW, f) + mix(26, 42, f) * 0.55;
      const yy = mix(-SL_D - 14, SL_D + 18, f) * 0.92;
      const a = 0.55 + 0.45 * hash(i * 3.7);
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        disc(c, sgn * hw, yy, 1.7, rgba(G, 0.85 * a));
        blob(c, sgn * hw, yy, 9, G, 0.32 * a);
      }
    }
    /* threshold bar of lights across the near edge */
    for (let i = -4; i <= 4; i++) {
      const px = i * 22;
      disc(c, px, SL_D + 14, 1.5, rgba(AM, 0.7));
      blob(c, px, SL_D + 14, 7, AM, 0.22);
    }
    c.restore();

    c.restore();
  }

  /* ==================================================================
     6. COCKPIT — static first-person furniture, ABSOLUTE 1600x900.
     Opaque everywhere except the canopy glass (approx x 190..1410,
     y 90..560), which is left untouched so the scene shows through.
     ================================================================== */
  const CVH = 900;

  function gauge(c, gx, gy, r, ang, lit, label) {
    c.save();
    c.translate(gx, gy);
    const bz = rg(c, 'cp.gz' + r, -r * 0.4, -r * 0.5, r * 0.1, 0, 0, r * 1.16, [
      [0, '#525c6e'], [0.62, '#2a323e'], [1, '#0d1015']
    ]);
    disc(c, 0, 0, r * 1.16, bz);
    ring(c, 0, 0, r * 1.16, 'rgba(4,6,10,0.9)', 2);
    ring(c, 0, 0, r * 1.02, 'rgba(180,205,235,0.18)', 1.2);
    const fc = rg(c, 'cp.gf' + r, 0, -r * 0.4, r * 0.05, 0, 0, r, [
      [0, '#141a22'], [1, '#05070b']
    ]);
    disc(c, 0, 0, r, fc);

    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI * 1.22 + (i / 20) * Math.PI * 1.72;
      const maj = (i % 5 === 0);
      const r0 = r * (maj ? 0.72 : 0.82);
      seg(c, Math.cos(a) * r0, Math.sin(a) * r0,
        Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92,
        'rgba(' + (maj ? '180,225,255' : '110,145,175') + ',' + (0.25 + 0.6 * lit) + ')',
        maj ? 2.0 : 1.0);
    }
    c.beginPath();
    c.arc(0, 0, r * 0.87, -Math.PI * 0.06, Math.PI * 0.5);
    c.strokeStyle = 'rgba(255,60,80,' + (0.2 + 0.6 * lit) + ')';
    c.lineWidth = 3; c.stroke();

    c.font = '9px "Courier New",monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(150,200,235,' + (0.15 + 0.6 * lit) + ')';
    c.fillText(label, 0, r * 0.5);

    c.save();
    c.rotate(ang);
    c.beginPath();
    c.moveTo(-r * 0.16, 0);
    c.lineTo(0, -2.6);
    c.lineTo(r * 0.9, 0);
    c.lineTo(0, 2.6);
    c.closePath();
    c.fillStyle = 'rgba(255,' + ((90 + 90 * lit) | 0) + ',' + ((70 + 40 * lit) | 0) + ',' + (0.35 + 0.65 * lit) + ')';
    c.fill();
    c.restore();
    disc(c, 0, 0, 3.4, '#1c222c');
    disc(c, 0, 0, 1.6, 'rgba(190,215,240,' + (0.2 + 0.6 * lit) + ')');

    c.save();
    c.beginPath(); c.arc(0, 0, r * 1.02, 0, TAU); c.clip();
    const sp = lg(c, 'cp.gs' + r, -r, -r, r * 0.4, r * 0.3, [
      [0, 'rgba(220,240,255,0.16)'], [1, 'rgba(220,240,255,0)']
    ]);
    c.fillStyle = sp;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();

    if (lit > 0.02) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      blob(c, 0, 0, r * 1.7, CY, 0.10 * lit);
      c.restore();
    }
    c.restore();
  }

  function cockpit(c, tt, boot, sealed) {
    tt = tt || 0;
    boot = sat(boot == null ? 1 : boot);
    sealed = sat(sealed || 0);

    /* booting avionics flicker; rock solid once boot reaches 1 */
    const fk = boot >= 0.999 ? 1
      : (0.45 + 0.55 * noise(tt * 22)) * (hash(Math.floor(tt * 30)) > 0.08 ? 1 : 0.25);
    const lit = boot * fk;

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.lineJoin = 'round';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';

    /* ============ canopy bezel arching across the top ========== */
    const bzG = lg(c, 'cp.bez', 0, 0, 0, 120, [
      [0.00, '#0a0d13'], [0.45, '#232a36'], [0.78, '#394554'], [1.00, '#0d1117']
    ]);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(VW, 0);
    c.lineTo(VW, 40);
    c.quadraticCurveTo(800, 124, 0, 40);
    c.closePath();
    c.fillStyle = bzG; c.fill();
    c.beginPath();
    c.moveTo(VW, 40);
    c.quadraticCurveTo(800, 124, 0, 40);
    c.strokeStyle = 'rgba(4,6,10,0.9)'; c.lineWidth = 3; c.stroke();
    c.beginPath();
    c.moveTo(VW, 34);
    c.quadraticCurveTo(800, 116, 0, 34);
    c.strokeStyle = 'rgba(150,180,215,0.16)'; c.lineWidth = 1.4; c.stroke();
    for (let i = 1; i < 26; i++) {
      const t = i / 26;
      const px = mix(0, VW, t);
      const py = (1 - t) * (1 - t) * 40 + 2 * t * (1 - t) * 124 + t * t * 40;
      disc(c, px, py - 16, 2.4, 'rgba(10,13,18,0.8)');
      disc(c, px - 0.6, py - 16.8, 1.1, 'rgba(170,195,225,0.22)');
    }
    c.beginPath();
    c.moveTo(60, 18);
    c.quadraticCurveTo(800, 92, 1540, 18);
    c.strokeStyle = 'rgba(90,110,138,0.28)'; c.lineWidth = 6; c.stroke();
    c.strokeStyle = 'rgba(6,9,14,0.5)'; c.lineWidth = 2; c.stroke();

    /* ============ A-pillars ==================================== */
    for (let i = 0; i < 2; i++) {
      const R = i === 1;
      c.save();
      if (R) { c.translate(VW, 0); c.scale(-1, 1); }
      const pl = [0, 0, 330, 0, 200, 140, 186, 560, 128, CVH, 0, CVH];
      const plG = lg(c, 'cp.pil', 0, 0, 210, 0, [
        [0.00, '#0b0e14'], [0.30, '#2b3441'], [0.62, '#414d5e'],
        [0.86, '#1a2029'], [1.00, '#080b10']
      ]);
      fillP(c, pl, plG);
      c.beginPath();
      c.moveTo(330, 0); c.lineTo(200, 140); c.lineTo(186, 560); c.lineTo(128, CVH);
      c.strokeStyle = 'rgba(3,5,9,0.9)'; c.lineWidth = 4; c.stroke();
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.beginPath();
      c.moveTo(322, 0); c.lineTo(193, 140); c.lineTo(179, 560); c.lineTo(121, CVH);
      c.strokeStyle = rgba(CY, 0.12 + 0.16 * lit); c.lineWidth = 2.4; c.stroke();
      c.restore();
      c.beginPath();
      c.moveTo(120, 0); c.lineTo(120, CVH);
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2; c.stroke();
      for (let k = 0; k < 9; k++) {
        const py = 60 + k * 96;
        const ix = py < 140 ? mix(330, 200, py / 140) : mix(200, 128, (py - 140) / (CVH - 140));
        disc(c, ix - 26, py, 3.0, 'rgba(8,11,16,0.85)');
        disc(c, ix - 26.7, py - 0.8, 1.3, 'rgba(165,190,220,0.2)');
        seg(c, 20, py, ix - 44, py, 'rgba(0,0,0,0.28)', 1.2);
      }
      c.restore();
    }

    /* ============ centre rib down the glass ==================== */
    const rbG = lg(c, 'cp.rib', 786, 0, 818, 0, [
      [0.00, '#080b10'], [0.22, '#3b4655'], [0.42, '#5b6a7e'],
      [0.70, '#212831'], [1.00, '#070a0f']
    ]);
    c.fillStyle = rbG;
    c.beginPath();
    c.moveTo(788, 82);
    c.lineTo(816, 82);
    c.lineTo(812, 566);
    c.lineTo(792, 566);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.85)'; c.lineWidth = 1.6; c.stroke();
    for (let k = 0; k < 8; k++) {
      const py = 110 + k * 58;
      disc(c, 802, py, 2.6, 'rgba(8,11,16,0.8)');
      disc(c, 801.3, py - 0.8, 1.1, 'rgba(165,190,220,0.22)');
    }
    /* HUD combiner glass hanging off the rib */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.10 + 0.22 * lit;
    c.fillStyle = rgba([70, 255, 170], 1);
    c.fillRect(640, 150, 324, 2);
    c.fillRect(640, 150, 2, 116);
    c.fillRect(962, 150, 2, 116);
    c.globalAlpha = 1;
    c.restore();

    /* ============ dashboard / coaming ========================== */
    const dsG = lg(c, 'cp.dash', 0, 560, 0, CVH, [
      [0.00, '#2b3340'], [0.14, '#1a212b'], [0.42, '#12171f'], [1.00, '#080b10']
    ]);
    c.beginPath();
    c.moveTo(0, 520);
    c.lineTo(150, 560);
    c.quadraticCurveTo(800, 604, 1450, 560);
    c.lineTo(VW, 520);
    c.lineTo(VW, CVH);
    c.lineTo(0, CVH);
    c.closePath();
    c.fillStyle = dsG; c.fill();
    c.beginPath();
    c.moveTo(150, 560);
    c.quadraticCurveTo(800, 604, 1450, 560);
    c.strokeStyle = 'rgba(3,5,9,0.9)'; c.lineWidth = 6; c.stroke();
    c.beginPath();
    c.moveTo(150, 568);
    c.quadraticCurveTo(800, 612, 1450, 568);
    c.strokeStyle = 'rgba(140,170,205,0.14)'; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < 30; i++) {
      const t = i / 29, px = mix(160, 1440, t);
      const py = (1 - t) * (1 - t) * 560 + 2 * t * (1 - t) * 604 + t * t * 560 + 14;
      seg(c, px, py, px, py + 7, 'rgba(0,0,0,0.4)', 1.6);
    }
    fillP(c, [180, 620, 700, 612, 700, CVH, 180, CVH], 'rgba(255,255,255,0.018)');
    fillP(c, [960, 610, 1430, 620, 1430, CVH, 960, CVH], 'rgba(0,0,0,0.20)');
    seg(c, 700, 606, 700, CVH, 'rgba(0,0,0,0.45)', 2);
    seg(c, 960, 606, 960, CVH, 'rgba(0,0,0,0.45)', 2);
    seg(c, 703, 606, 703, CVH, 'rgba(150,180,210,0.07)', 1);

    /* ---- raked side consoles filling the outer lower corners ---- */
    for (let i = 0; i < 2; i++) {
      const R = i === 1;
      c.save();
      if (R) { c.translate(VW, 0); c.scale(-1, 1); }
      const cG = lg(c, 'cp.cons', 0, 560, 0, CVH, [
        [0.00, '#39434f'], [0.10, '#232b36'], [0.55, '#161c25'], [1.00, '#0a0e14']
      ]);
      /* console box angled away from the viewer */
      fillP(c, [0, 540, 174, 596, 150, CVH, 0, CVH], cG);
      /* lit top chamfer */
      fillP(c, [0, 540, 174, 596, 172, 610, 0, 555], 'rgba(168,198,228,0.16)');
      seg(c, 174, 596, 150, CVH, 'rgba(0,0,0,0.55)', 3);
      /* recessed breaker panel */
      fillP(c, [20, 618, 138, 654, 130, 742, 18, 704], '#080b11');
      strokeP(c, [20, 618, 138, 654, 130, 742, 18, 704], 'rgba(140,170,200,0.16)', 1, true);
      for (let k = 0; k < 8; k++) {
        const cx = 32 + (k % 4) * 27, ry = k < 4 ? 0 : 40;
        const yy = 634 + (k % 4) * 11 + ry;
        c.fillStyle = '#141a23';
        c.fillRect(cx, yy, 18, 9);
        if (boot > (k + 1) / 9) {
          const cc = k % 3 === 0 ? [64, 255, 158] : (k % 3 === 1 ? [58, 224, 255] : AM);
          c.fillStyle = rgba(cc, 0.7 * (boot >= 0.999 ? 1 : 0.5 + 0.5 * noise(tt * 15 + k)));
          c.fillRect(cx + 1, yy + 1, 16, 7);
        }
      }
      /* stubby guarded switches below */
      for (let k = 0; k < 3; k++) {
        const sx = 34 + k * 34, sy = 776 + k * 6;
        fillP(c, [sx, sy, sx + 24, sy + 7, sx + 24, sy + 30, sx, sy + 23], '#1c232d');
        seg(c, sx + 12, sy + 6, sx + 12, sy + 20, 'rgba(200,214,232,0.5)', 3);
        seg(c, sx, sy, sx + 24, sy + 7, 'rgba(180,205,232,0.14)', 1.5);
      }
      c.restore();
    }

    /* ---- two round analogue gauges ---- */
    const a1 = -Math.PI * 1.22 + (0.5 + 0.5 * Math.sin(tt * 0.63)) * Math.PI * 1.72 * boot;
    const a2 = -Math.PI * 1.22 + (0.5 + 0.5 * Math.sin(tt * 1.07 + 2.1)) * Math.PI * 1.72 * boot;
    gauge(c, 452, 728, 60, a1, lit, 'ALT');
    gauge(c, 610, 742, 46, a2, lit, 'IAS');

    /* ---- indicator square row ---- */
    for (let i = 0; i < 12; i++) {
      const px = 706 + i * 20, py = 640;
      c.fillStyle = '#0a0d13';
      c.fillRect(px, py, 15, 15);
      c.strokeStyle = 'rgba(120,145,175,0.22)'; c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, 14, 14);
      if (boot > (i + 0.6) / 12) {
        const col = i < 8 ? [64, 255, 158] : (i < 10 ? AM : [255, 60, 90]);
        const fl = boot >= 0.999 ? 1 : 0.6 + 0.4 * noise(tt * 18 + i);
        c.fillStyle = rgba(col, 0.85 * fl);
        c.fillRect(px + 2, py + 2, 11, 11);
        c.save();
        c.globalCompositeOperation = 'lighter';
        blob(c, px + 7.5, py + 7.5, 15, col, 0.35 * fl);
        c.restore();
      }
    }
    c.font = '10px "Courier New",monospace';
    c.textAlign = 'left';
    c.fillStyle = 'rgba(140,175,205,' + (0.2 + 0.5 * lit) + ')';
    c.fillText('SYS BUS', 706, 632);

    /* ---- throttle quadrant, left ---- */
    (function () {
      const qx = 210, qy = 636, qw = 92, qh = 210;
      const qG = lg(c, 'cp.quad', qx, 0, qx + qw, 0, [
        [0, '#0a0d13'], [0.4, '#242c37'], [1, '#0c1016']
      ]);
      c.fillStyle = qG;
      c.fillRect(qx, qy, qw, qh);
      c.strokeStyle = 'rgba(3,5,9,0.9)'; c.lineWidth = 2;
      c.strokeRect(qx, qy, qw, qh);
      c.fillStyle = '#04060a';
      c.fillRect(qx + 34, qy + 16, 22, qh - 40);
      for (let i = 0; i <= 8; i++) {
        const py = qy + 22 + i * (qh - 52) / 8;
        seg(c, qx + 60, py, qx + 82, py, 'rgba(140,170,200,' + (0.14 + 0.4 * lit) + ')', 1.2);
      }
      c.font = '9px "Courier New",monospace';
      c.textAlign = 'left';
      c.fillStyle = 'rgba(140,175,205,' + (0.18 + 0.5 * lit) + ')';
      c.fillText('MIL', qx + 62, qy + 34);
      c.fillText('IDLE', qx + 62, qy + qh - 22);
      /* lever advances with boot plus a slow idle wobble */
      const adv = sat(boot * 0.82 + 0.06 * Math.sin(tt * 0.9));
      const ly = qy + qh - 30 - adv * (qh - 62);
      seg(c, qx + 45, ly, qx + 45, qy + qh - 24, 'rgba(0,0,0,0.6)', 8);
      const lvG = lg(c, 'cp.lev', qx + 22, 0, qx + 70, 0, [
        [0, '#12171f'], [0.35, '#4c586b'], [1, '#0e1219']
      ]);
      c.fillStyle = lvG;
      c.beginPath();
      c.moveTo(qx + 20, ly + 16);
      c.lineTo(qx + 20, ly - 6);
      c.quadraticCurveTo(qx + 20, ly - 18, qx + 45, ly - 18);
      c.quadraticCurveTo(qx + 70, ly - 18, qx + 70, ly - 6);
      c.lineTo(qx + 70, ly + 16);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(3,5,9,0.9)'; c.lineWidth = 1.6; c.stroke();
      seg(c, qx + 24, ly - 10, qx + 66, ly - 10, 'rgba(170,200,230,0.18)', 1.4);
      for (let i = 0; i < 4; i++) seg(c, qx + 28 + i * 12, ly - 4, qx + 28 + i * 12, ly + 12, 'rgba(0,0,0,0.5)', 2);
      c.save();
      c.globalCompositeOperation = 'lighter';
      disc(c, qx + 45, ly + 6, 2.6, rgba(CY, 0.5 + 0.5 * lit));
      blob(c, qx + 45, ly + 6, 14, CY, 0.3 * lit);
      c.restore();
    })();

    /* ---- MFD screen, right ---- */
    (function () {
      const mx = 1000, my = 618, mw = 330, mh = 226;
      const hG = lg(c, 'cp.mfdh', mx - 14, 0, mx + mw + 14, 0, [
        [0, '#39424f'], [0.5, '#1a2029'], [1, '#0a0d13']
      ]);
      c.fillStyle = hG;
      c.fillRect(mx - 14, my - 14, mw + 28, mh + 28);
      c.strokeStyle = 'rgba(3,5,9,0.9)'; c.lineWidth = 2;
      c.strokeRect(mx - 14, my - 14, mw + 28, mh + 28);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = '#0d1117';
        c.fillRect(mx + 8 + i * 64, my + mh + 2, 44, 10);
        c.strokeStyle = 'rgba(130,160,190,0.2)'; c.lineWidth = 1;
        c.strokeRect(mx + 8.5 + i * 64, my + mh + 2.5, 43, 9);
      }
      c.fillStyle = '#03080a';
      c.fillRect(mx, my, mw, mh);
      c.save();
      c.beginPath(); c.rect(mx, my, mw, mh); c.clip();
      if (lit > 0.01) {
        const gr = [64, 255, 158];
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = lit;
        c.font = '11px "Courier New",monospace';
        c.textAlign = 'left';
        const rows = 15, sp = 17;
        const scroll = (tt * 26) % sp;
        for (let i = -1; i < rows; i++) {
          const py = my + 14 + i * sp - scroll;
          const idx = Math.floor((tt * 26) / sp) + i;
          const h1 = hash(idx * 1.7), h2 = hash(idx * 3.1 + 5);
          c.fillStyle = rgba(gr, 0.30 + 0.5 * h1);
          const wA = 30 + h1 * 110;
          c.fillRect(mx + 10, py - 7, wA, 2);
          c.fillRect(mx + 16 + wA, py - 7, 16 + h2 * 40, 2);
          if (((idx % 4) + 4) % 4 === 0) {
            c.fillStyle = rgba(gr, 0.8);
            c.fillText('>NAV ' + (4096 + (((idx * 37) % 8999) + 8999) % 8999).toString(16).toUpperCase(), mx + 10, py + 2);
          }
        }
        c.strokeStyle = rgba(gr, 0.45); c.lineWidth = 1;
        c.strokeRect(mx + 216.5, my + 20.5, 100, 74);
        c.fillStyle = rgba(gr, 0.55);
        c.fillRect(mx + 222, my + 78, (0.5 + 0.5 * Math.sin(tt * 1.4)) * 88, 8);
        c.strokeRect(mx + 221.5, my + 77.5, 89, 9);
        c.save();
        c.translate(mx + 266, my + 158);
        ring(c, 0, 0, 46, rgba(gr, 0.3), 1);
        ring(c, 0, 0, 26, rgba(gr, 0.2), 1);
        const sw = (tt * 1.6) % TAU;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, 46, sw - 0.5, sw);
        c.closePath();
        c.fillStyle = rgba(gr, 0.22); c.fill();
        seg(c, 0, 0, Math.cos(sw) * 46, Math.sin(sw) * 46, rgba(gr, 0.7), 1.4);
        c.restore();
        c.globalAlpha = 1;
        c.restore();
        /* CRT scanlines + screen bloom */
        c.fillStyle = 'rgba(0,0,0,0.28)';
        for (let py = my; py < my + mh; py += 3) c.fillRect(mx, py, mw, 1);
        c.save();
        c.globalCompositeOperation = 'lighter';
        blob(c, mx + mw / 2, my + mh / 2, 220, [64, 255, 158], 0.10 * lit);
        c.restore();
      }
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 2;
      c.strokeRect(mx, my, mw, mh);
    })();

    /* ---- instrument bounce up onto the coaming ---- */
    if (lit > 0.01) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const bnc = lg(c, 'cp.bnc', 0, 620, 0, 540, [
        [0, 'rgba(90,190,255,0.20)'], [1, 'rgba(90,190,255,0)']
      ]);
      c.globalAlpha = lit;
      c.fillStyle = bnc;
      c.fillRect(150, 540, 1300, 90);
      c.globalAlpha = 1;
      c.restore();
    }

    /* ============ sealed: mask edges + breathing fog =========== */
    if (sealed > 0.004) {
      /* out-of-focus mask edges intruding from the bottom corners;
         the blur is faked by stacking expanding low-alpha fills */
      for (let i = 0; i < 2; i++) {
        const R = i === 1;
        c.save();
        if (R) { c.translate(VW, 0); c.scale(-1, 1); }
        for (let k = 0; k < 10; k++) {
          const grow = (9 - k) * 15;
          c.globalAlpha = sealed * (k === 9 ? 0.72 : 0.11);
          c.fillStyle = '#04060b';
          c.beginPath();
          c.moveTo(-60, CVH + 60);
          c.lineTo(-60, 168 - grow * 0.8);
          /* blurred rubber lip sweeping across the corner */
          c.quadraticCurveTo(150 - grow * 0.2, 250 - grow * 0.7, 268 + grow * 0.35, 470 - grow * 0.5);
          c.quadraticCurveTo(372 + grow * 0.7, 672 - grow * 0.3, 470 + grow * 0.9, 812 - grow * 0.2);
          c.quadraticCurveTo(536 + grow, 890, 560 + grow, CVH + 60);
          c.closePath();
          c.fill();
        }
        c.globalAlpha = 1;
        c.restore();
      }
      /* breathing fog haze along the very bottom */
      const br = 0.62 + 0.38 * Math.sin(tt * 1.15);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const fg = lg(c, 'cp.fog', 0, CVH, 0, CVH - 210, [
        [0.00, 'rgba(180,215,245,0.18)'],
        [0.45, 'rgba(150,195,235,0.08)'],
        [1.00, 'rgba(140,190,230,0)']
      ]);
      c.globalAlpha = sealed * (0.5 + 0.5 * br);
      c.fillStyle = fg;
      c.fillRect(0, CVH - 210, VW, 210);
      c.globalAlpha = 1;
      c.restore();
    }

    c.restore();
  }

  /* ==================================================================
     8. CLOUD BANK — cheap stylised vector cloud band, full 1600 wide.
     Lobe layout is generated once into module scope and reused, so a
     frame is just ~90 ellipse fills and one cached gradient.
     ================================================================== */
  const CB_N = 30;
  const CB = (function () {
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

  function cloudBank(c, y, h, tt, tint, alpha) {
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

  return {
    rocket: rocket, warship: warship, jet: jet, glove: glove,
    mask: mask, cockpit: cockpit, silo: silo, cloudBank: cloudBank
  };
})();
try { if (typeof globalThis !== 'undefined' && !globalThis.CINE_ART) globalThis.CINE_ART = CINE_ART; } catch (e) { }
