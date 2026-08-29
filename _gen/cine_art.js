/* ==================================================================
   CINE_ART — procedural 2D vector art library for the SKYFALL
   INTERCEPTOR cinematic intro.  No images, no libraries.
   Everything is shaded with gradients + facets so the objects read as
   machines with volume, not flat silhouettes.

   Public API (ctx is always arg 0, all state is save/restore'd):
     rocket   (c, x, y, s, rot, thrust, tt)
     warship  (c, x, y, s, alpha, charge, tt)  -> { tips:[[x,y],[x,y]] }
     jet      (c, x, y, s, rot, thrust, tint)
     pilot    (c, x, y, s, opts)               seated aircrew, 3rd person
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
  const JET_TINT = [120, 175, 225];

  /* Cinematic camera: 64 deg above the horizon, on the centreline,
     behind the jet — the same rig game.js flies (lookAt from -Z, so
     world +X lands on SCREEN LEFT, hence the negated x).
       screen-up = Y*cos(el) + Z*sin(el)
     Built once at load: no allocation, no trig, per frame. */
  const JG = (function () {
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
  const JC = {
    ink: '#060910', belly: '#0a0e14', hull: '#1a212b', hull2: '#27313d',
    panel: '#333e4c', steel: '#4a5a6e', steel2: '#61748b', line: '#8296ad'
  };

  /* Exhaust. In game the nozzles throw a cyan beam 72 units aft plus a
     white core sprite, so the plume here is cyan-cored with only a
     violet outer skirt to sit in the dawn palette. The nozzle bore is a
     flat ellipse at this camera angle, so the plume is correspondingly
     narrow at the root and flares aft. */
  function jetBurner(c, nx, thrust, tint) {
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

  function jet(c, x, y, s, rot, thrust, tint) {
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

  /* ==================================================================
  /* ==================================================================
     4. PILOT — helmeted aircrew strapped into an ejection seat, seen
     from OUTSIDE the canopy (three-quarter / profile).  This is a
     character, not a first-person prop: shell, visor, mask, harness,
     seat, lit warm from the instruments below and cold from the
     canopy behind.

       pilot(c, x, y, s, o)
         (x,y) is the notch of the throat.  The crown of the helmet
         sits at y-220*s, the shoulders at y+90*s and the torso runs
         off to y+440*s — put the origin high enough in the frame that
         the chest leaves the bottom edge.
         o.turn   0 = head in profile facing frame-LEFT (down the nose),
                  1 = head turned toward the lens.
         o.pitch  head tilt: -1 chin up .. +1 chin down onto the panel.
         o.visor  0 = visor stowed on the brow, 1 = visor snapped down.
         o.hud    0..1 HUD symbology reflected across the visor glass.
         o.glow   0..1 warm instrument key light from below-left.
         o.rim    0..1 cold canopy rim light from above-right.
         o.breath 0..1 exhale — mask fog + valve puff.
         o.tt     seconds; drives the idle breathing + airframe buzz.
         o.alpha
     ================================================================== */

  /* Closed smooth curve through a flat control-point list (quadratics
     joined at the midpoints).  Two lists of equal length can therefore
     be lerped freely, which is how the head turns. */
  function smoothP(c, p) {
    const n = p.length >> 1;
    if (n < 3) return;
    c.beginPath();
    c.moveTo((p[0] + p[(n - 1) * 2]) * 0.5, (p[1] + p[(n - 1) * 2 + 1]) * 0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      c.quadraticCurveTo(p[i * 2], p[i * 2 + 1],
        (p[i * 2] + p[j * 2]) * 0.5, (p[i * 2 + 1] + p[j * 2 + 1]) * 0.5);
    }
    c.closePath();
  }
  function lerpP(a, b, t, out) {
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    out.length = a.length;
    return out;
  }
  function mixv(a, b, t) { return a + (b - a) * t; }

  /* Helmet shell.  12 control points, same roles in both poses, so the
     head can be turned by lerping between them:
       0 brow front   1 front upper  2 crown front  3 crown
       4 crown back   5 occiput      6 back lower   7 behind the ear
       8 ear-flap     9 cheek edge  10 front cheek 11 brow lower      */
  const SH_A = [
    -96, -24, -86, -64, -42, -94, 16, -98, 66, -76, 94, -34,
    90, 16, 66, 50, 22, 60, -26, 44, -62, 16, -92, -4
  ];
  const SH_B = [
    -70, -30, -78, -66, -40, -94, 10, -98, 56, -78, 82, -38,
    78, 8, 58, 46, 26, 30, -6, 18, -38, 28, -64, 42
  ];
  /* The jaw / lower face that hangs out of the front of the shell. */
  const JW_A = [
    -90, -10, -104, 26, -94, 58, -62, 84, -14, 80, 32, 56, -30, 30
  ];
  const JW_B = [
    -58, 0, -64, 34, -48, 64, -12, 82, 26, 74, 54, 40, 0, 8
  ];
  const SH_T = [], JW_T = [];

  /* the oxygen-mask cup, half-width 65 at scale 1 */
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

  /* the drop visor, in visor space: pivot (0,0) sits on the brow bar */
  function visorShape(c) {
    c.beginPath();
    c.moveTo(-58, -6);
    c.quadraticCurveTo(-68, 18, -52, 40);
    c.quadraticCurveTo(-16, 56, 30, 42);
    c.quadraticCurveTo(52, 30, 50, -8);
    c.closePath();
  }

  function pilot(c, x, y, s, o) {
    o = o || {};
    const alpha = o.alpha == null ? 1 : sat(o.alpha);
    if (alpha <= 0.003) return;
    const turn = sat(o.turn == null ? 0.5 : o.turn);
    const pitch = o.pitch == null ? 0 : o.pitch;
    const vis = sat(o.visor == null ? 1 : o.visor);
    const hud = sat(o.hud || 0);
    const key = o.glow == null ? 1 : sat(o.glow);
    const rim = o.rim == null ? 1 : sat(o.rim);
    const breath = sat(o.breath || 0);
    const tt = o.tt || 0;
    const sweep = o.sweep || 0;                            // passing-light streak rate on the visor

    const brt = Math.sin(tt * 1.25);                       // slow breathing
    const buzz = (noise(tt * 13.0) - 0.5) * 2;             // airframe buzz
    const idleTilt = 0.028 * Math.sin(tt * 0.53 + 1.7);    // small, slow, human head sway

    /* head frame */
    const hcx = mixv(-16, 6, turn) - pitch * 8;
    const hcy = -112 + brt * 1.4 + buzz * 0.8 + pitch * 12;
    const hrot = pitch * 0.30 + mixv(-0.05, 0.03, turn) + idleTilt;
    const hcs = Math.cos(hrot), hsn = Math.sin(hrot);
    function h2b(px, py) {           // head local -> body local
      return [hcx + px * hcs - py * hsn, hcy + px * hsn + py * hcs];
    }

    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.globalAlpha = alpha;
    c.lineJoin = 'round';

    /* ==================================================================
       EJECTION SEAT — the mass behind him
       ================================================================== */
    c.save();
    c.translate(-152, -30);
    c.translate(178, 0); c.scale(1.34, 1.04); c.translate(-178, 0);
    const stG = lg(c, 'pl.seat', 30, -260, 320, 320, [
      [0.00, '#19222e'], [0.22, '#101720'], [0.60, '#0a0e15'], [1.00, '#04060a']
    ]);
    c.beginPath();
    c.moveTo(58, 460);
    c.lineTo(34, -60);
    c.quadraticCurveTo(30, -204, 104, -222);
    c.lineTo(232, -244);
    c.quadraticCurveTo(288, -246, 292, -170);
    c.lineTo(322, 460);
    c.closePath();
    c.fillStyle = stG; c.fill();
    c.strokeStyle = 'rgba(2,4,8,0.9)'; c.lineWidth = 3; c.stroke();

    /* quilted headrest pad — the helmet is silhouetted against it */
    const hrG = lg(c, 'pl.hrest', 40, -220, 240, -60, [
      [0.00, '#33404f'], [0.40, '#1f2833'], [1.00, '#0c1118']
    ]);
    c.beginPath();
    c.moveTo(46, -56);
    c.lineTo(42, -172);
    c.quadraticCurveTo(44, -206, 106, -212);
    c.lineTo(218, -224);
    c.quadraticCurveTo(258, -224, 260, -178);
    c.lineTo(264, -64);
    c.quadraticCurveTo(154, -40, 46, -56);
    c.closePath();
    c.fillStyle = hrG; c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.85)'; c.lineWidth = 2.4; c.stroke();
    for (let i = 0; i < 3; i++) {
      const px = 92 + i * 58;
      seg(c, px, -210 + i * 3, px + 4, -52 - i * 2, 'rgba(0,0,0,0.45)', 2.4);
      seg(c, px + 4, -210 + i * 3, px + 8, -52 - i * 2, 'rgba(160,195,230,0.08)', 1.2);
    }
    /* head-box wings that bracket the headrest */
    fillP(c, [40, -196, 62, -212, 66, -70, 44, -60], '#0a0f16');
    fillP(c, [258, -206, 292, -196, 296, -60, 262, -66], '#0a0f16');
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, 44, -196, 48, -62, rgba(CY, 0.16 * rim), 2);
    seg(c, 292, -194, 296, -64, rgba(CY, 0.34 * rim), 2.6);
    c.restore();

    /* seat rails + inertia-reel housing */
    fillP(c, [284, -150, 322, -140, 336, 460, 292, 460], '#080b11');
    for (let i = 0; i < 7; i++) {
      const py = -90 + i * 84;
      disc(c, 300 + i * 1.6, py, 3.6, 'rgba(6,9,14,0.9)');
      disc(c, 299 + i * 1.6, py - 1, 1.6, 'rgba(170,200,230,0.16)');
    }

    /* ejection handle — the striped loop over the head box */
    c.save();
    c.translate(190, -250);
    c.rotate(-0.08);
    c.beginPath();
    c.moveTo(-72, 8);
    c.quadraticCurveTo(-76, -14, -42, -16);
    c.lineTo(46, -20);
    c.quadraticCurveTo(76, -20, 74, 2);
    c.lineTo(62, 4);
    c.quadraticCurveTo(62, -8, 42, -8);
    c.lineTo(-40, -4);
    c.quadraticCurveTo(-60, -4, -60, 10);
    c.closePath();
    c.fillStyle = '#141821'; c.fill();
    c.save();
    c.clip();
    for (let i = -6; i < 12; i++) {
      c.save();
      c.translate(i * 15, 0); c.rotate(0.5);
      c.fillStyle = i % 2 ? 'rgba(226,172,52,0.75)' : 'rgba(16,14,10,0.9)';
      c.fillRect(-7.5, -30, 15, 60);
      c.restore();
    }
    c.restore();
    c.strokeStyle = 'rgba(2,4,8,0.9)'; c.lineWidth = 1.6; c.stroke();
    c.restore();
    c.restore();                       /* end seat transform */

    /* ==================================================================
       TORSO — flight suit, survival vest, harness
       ================================================================== */
    const shrug = breath * 4 + brt * 2.2;
    function bodyPath() {
      c.beginPath();
      c.moveTo(-268, 460);
      c.lineTo(-230, 206);
      c.quadraticCurveTo(-200, 96 - shrug, -128, 44 - shrug);
      c.quadraticCurveTo(-62, 10, 42, 6);
      c.quadraticCurveTo(144, 20, 206, 96 - shrug * 0.6);
      c.quadraticCurveTo(240, 138, 250, 244);
      c.lineTo(268, 460);
      c.closePath();
    }
    const bdG = lg(c, 'pl.body', -250, 40, 230, 380, [
      [0.00, '#38434f'], [0.20, '#28313b'], [0.52, '#1a2028'], [1.00, '#0e1319']
    ]);
    bodyPath();
    c.fillStyle = bdG; c.fill();

    c.save();
    bodyPath();
    c.clip();

    /* survival vest sitting proud of the suit */
    const vsG = lg(c, 'pl.vest', -170, 60, 180, 400, [
      [0.00, '#44525f'], [0.40, '#2b343f'], [1.00, '#12171e']
    ]);
    c.beginPath();
    c.moveTo(-196, 460);
    c.lineTo(-178, 156);
    c.quadraticCurveTo(-156, 88, -88, 62);
    c.lineTo(-30, 86);
    c.lineTo(50, 82);
    c.quadraticCurveTo(130, 96, 166, 152);
    c.lineTo(190, 460);
    c.closePath();
    c.fillStyle = vsG; c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.7)'; c.lineWidth = 2.6; c.stroke();
    /* fabric: nomex gathers where the harness pulls the vest in.
       Each fold is a dark crease with a lit lip on its upper side, and
       they fan out from the strap anchors rather than running parallel. */
    (function () {
      const FOLD = [
        /* x0,y0  cx,cy  x1,y1  strength */
        [-176, 178, -120, 206, -46, 232, 1.00],
        [-172, 214, -112, 244, -40, 268, 0.72],
        [-166, 356, -104, 372, -44, 366, 0.55],
        [162, 190, 104, 214, 30, 236, 0.90],
        [168, 232, 108, 252, 34, 268, 0.62],
        [176, 372, 116, 386, 52, 380, 0.48],
        [-96, 96, -40, 118, 26, 108, 0.66],
        [-150, 288, -96, 300, -50, 292, 0.40]
      ];
      for (let i = 0; i < FOLD.length; i++) {
        const f = FOLD[i], a = f[6];
        c.beginPath();
        c.moveTo(f[0], f[1]); c.quadraticCurveTo(f[2], f[3], f[4], f[5]);
        c.strokeStyle = 'rgba(0,0,0,' + (0.42 * a).toFixed(3) + ')';
        c.lineWidth = 4.5; c.stroke();
        c.beginPath();
        c.moveTo(f[0], f[1] - 3.6); c.quadraticCurveTo(f[2], f[3] - 3.6, f[4], f[5] - 3.2);
        c.strokeStyle = 'rgba(190,214,244,' + (0.13 * a).toFixed(3) + ')';
        c.lineWidth = 2; c.stroke();
      }
    })();
    seg(c, -18, 92, -6, 460, 'rgba(0,0,0,0.5)', 3);
    seg(c, -13, 92, -1, 460, 'rgba(165,195,225,0.08)', 1.2);
    fillP(c, [-168, 250, -56, 266, -60, 336, -172, 320], 'rgba(255,255,255,0.03)');
    strokeP(c, [-168, 250, -56, 266, -60, 336, -172, 320], 'rgba(0,0,0,0.45)', 2);
    fillP(c, [48, 262, 158, 250, 166, 322, 52, 334], 'rgba(0,0,0,0.22)');
    strokeP(c, [48, 262, 158, 250, 166, 322, 52, 334], 'rgba(0,0,0,0.45)', 2);
    /* survival radio on the near chest */
    fillP(c, [84, 136, 164, 162, 148, 232, 70, 206], '#10151d');
    strokeP(c, [84, 136, 164, 162, 148, 232, 70, 206], 'rgba(2,4,8,0.85)', 2);
    seg(c, 102, 156, 146, 170, 'rgba(150,180,210,0.12)', 2);
    c.save();
    c.globalCompositeOperation = 'lighter';
    disc(c, 134, 202, 3.2, rgba([70, 255, 158], 0.9));
    blob(c, 134, 202, 16, [70, 255, 158], 0.35);
    c.restore();

    /* harness webbing */
    const wbG = lg(c, 'pl.web', -60, 60, 40, 320, [
      [0.00, '#4c5139'], [0.42, '#353b2a'], [1.00, '#1a1e15']
    ]);
    function strap(x0, y0, x1, y1, w0, w1) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      const q = [
        x0 + nx * w0, y0 + ny * w0, x1 + nx * w1, y1 + ny * w1,
        x1 - nx * w1, y1 - ny * w1, x0 - nx * w0, y0 - ny * w0
      ];
      fillP(c, q, wbG);
      strokeP(c, q, 'rgba(2,4,8,0.7)', 1.8);
      /* the lit edge is on the side the webbing rolls toward the key */
      seg(c, x0 + nx * w0 * 0.45, y0 + ny * w0 * 0.45,
        x1 + nx * w1 * 0.45, y1 + ny * w1 * 0.45, 'rgba(210,230,255,0.16)', 1.8);
      seg(c, x0 - nx * w0 * 0.62, y0 - ny * w0 * 0.62,
        x1 - nx * w1 * 0.62, y1 - ny * w1 * 0.62, 'rgba(0,0,0,0.34)', 3);
      /* tension: the strap bites into the vest, so it casts a hard
         shadow just outboard of itself and the stitched edges pinch in */
      c.save();
      c.globalCompositeOperation = 'source-over';
      seg(c, x0 - nx * (w0 + 5), y0 - ny * (w0 + 5),
        x1 - nx * (w1 + 5), y1 - ny * (w1 + 5), 'rgba(0,0,0,0.30)', 7);
      c.restore();
      /* stitch line down the centre */
      const dsh = 5;
      const n = Math.max(2, (L / 14) | 0);
      for (let i = 0; i < n; i++) {
        const t0 = i / n + 0.012, t1 = t0 + dsh / L;
        seg(c, x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1,
          'rgba(228,238,255,0.13)', 1.1);
      }
    }
    strap(-132, 58 - shrug, -36, 216, 22, 17);
    strap(120, 76 - shrug * 0.6, 18, 214, 20, 16);
    strap(-196, 336, -24, 294, 20, 18);
    strap(186, 342, 26, 298, 20, 18);
    /* quick-release rotary buckle */
    const bkG = rg(c, 'pl.buck', -14, 240, 2, -6, 250, 40, [
      [0.00, '#c9d6e6'], [0.28, '#7c8b9f'], [0.62, '#3a4451'], [1.00, '#10141b']
    ]);
    disc(c, -4, 254, 33, 'rgba(0,0,0,0.5)');
    disc(c, -6, 251, 30, bkG);
    ring(c, -6, 251, 30, 'rgba(3,5,9,0.85)', 2.4);
    ring(c, -6, 251, 19, 'rgba(12,16,22,0.8)', 3);
    disc(c, -6, 251, 10, '#0b0f15');
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.7;
      seg(c, -6 + Math.cos(a) * 12, 251 + Math.sin(a) * 12,
        -6 + Math.cos(a) * 26, 251 + Math.sin(a) * 26, 'rgba(6,9,14,0.75)', 3);
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    ell(c, -18, 241, 9, 5, 'rgba(255,236,205,0.30)');
    c.restore();

    /* --- lighting on the body --------------------------------- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const kyG = lg(c, 'pl.key', -270, 440, 60, 50, [
      [0.00, 'rgba(255,178,88,0.72)'], [0.42, 'rgba(255,140,60,0.26)'],
      [1.00, 'rgba(255,120,40,0)']
    ]);
    c.globalAlpha = alpha * key;
    c.fillStyle = kyG; c.fillRect(-270, 10, 540, 470);
    const rmG = lg(c, 'pl.rim', 268, 30, 40, 270, [
      [0.00, 'rgba(168,240,255,0.70)'], [0.30, 'rgba(120,222,255,0.26)'],
      [1.00, 'rgba(80,200,255,0)']
    ]);
    c.globalAlpha = alpha * rim;
    c.fillStyle = rmG; c.fillRect(-60, -30, 340, 510);
    /* a low cool bounce off the canopy sill keeps the near shoulder off
       the background even when neither key nor rim is up */
    const amG = lg(c, 'pl.bamb', 0, 20, 0, 460, [
      [0.00, 'rgba(96,150,205,0.10)'], [1.00, 'rgba(60,96,150,0.02)']
    ]);
    c.globalAlpha = alpha;
    c.fillStyle = amG; c.fillRect(-280, -30, 560, 520);
    c.restore();
    /* deep shadow in the chest hollow under the chin */
    const shG = lg(c, 'pl.bshade', 0, -6, 0, 190, [
      [0.00, 'rgba(0,0,0,0.40)'], [1.00, 'rgba(0,0,0,0)']
    ]);
    c.fillStyle = shG; c.fillRect(-320, -30, 640, 240);
    c.restore();

    /* body rim strokes: warm on the panel side, cold from the canopy */
    c.save();
    c.globalCompositeOperation = 'lighter';
    bodyPath();
    const bsG = lg(c, 'pl.bstroke', -240, 0, 260, 0, [
      [0.00, 'rgba(255,158,68,0.90)'], [0.30, 'rgba(255,150,60,0.14)'],
      [0.66, 'rgba(120,225,255,0.24)'], [1.00, 'rgba(180,246,255,1)']
    ]);
    c.strokeStyle = bsG; c.lineWidth = 5.6; c.stroke();
    /* a tighter, hotter core inside the rim so the edge reads as a lit
       curve of cloth rather than a drawn outline */
    bodyPath();
    c.strokeStyle = bsG; c.lineWidth = 1.8; c.stroke();
    c.restore();

    /* ==================================================================
       NECK + COLLAR
       ================================================================== */
    const nkx = mixv(-24, -2, turn);
    fillP(c, [nkx - 38, -80, nkx + 34, -80, nkx + 42, 40, nkx - 46, 40], '#070a0f');
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, nkx + 34, -70, nkx + 40, 30, rgba(CY, 0.20 * rim), 4);
    c.restore();
    const clG = lg(c, 'pl.collar', -110, 6, 110, 78, [
      [0.00, '#333c47'], [0.38, '#1e252e'], [1.00, '#0c1016']
    ]);
    c.beginPath();
    c.moveTo(nkx - 106, 74);
    c.quadraticCurveTo(nkx - 98, 16, nkx - 44, 4);
    c.quadraticCurveTo(nkx, -4, nkx + 48, 6);
    c.quadraticCurveTo(nkx + 98, 20, nkx + 106, 76);
    c.quadraticCurveTo(nkx, 104, nkx - 106, 74);
    c.closePath();
    c.fillStyle = clG; c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.85)'; c.lineWidth = 2.4; c.stroke();
    seg(c, nkx - 94, 58, nkx + 94, 60, 'rgba(0,0,0,0.4)', 2);
    seg(c, nkx - 92, 63, nkx + 92, 65, 'rgba(170,200,230,0.09)', 1.2);

    /* ==================================================================
       MASK HOSE — from the mask down into the chest connector
       ================================================================== */
    const mkx = mixv(-74, -14, turn), mky = 34;
    const mkw = mixv(0.82, 1.06, turn);
    const hoseTop = h2b(mkx - 22 * mkw, mky + 30);
    const cnx = -150, cny = 250;
    (function () {
      const HN = 12;
      const flex = breath * 6 + brt * 3;
      const mx = hoseTop[0] - 54 - flex, my = hoseTop[1] + 104;
      for (let i = HN - 1; i >= 0; i--) {
        const q = i / (HN - 1);
        const ax = mixv(hoseTop[0], mx, q), ay = mixv(hoseTop[1], my, q);
        const bx = mixv(mx, cnx, q), by = mixv(my, cny, q);
        const px = mixv(ax, bx, q), py = mixv(ay, by, q);
        const r = mixv(11.5, 9, q);
        c.save();
        c.translate(px, py);
        c.rotate(Math.atan2(by - ay, bx - ax));
        const hgG = lg(c, 'pl.hose', 0, -12, 0, 12, [
          [0.00, '#070a11'], [0.24, '#2c3546'], [0.46, '#4c586d'],
          [0.68, '#222933'], [1.00, '#05080e']
        ]);
        c.scale(1, r / 11.5);
        c.beginPath();
        c.moveTo(-6, -11.5);
        c.quadraticCurveTo(0, -14, 6, -11.5);
        c.lineTo(6, 11.5);
        c.quadraticCurveTo(0, 14, -6, 11.5);
        c.closePath();
        c.fillStyle = hgG; c.fill();
        c.strokeStyle = 'rgba(3,5,9,0.8)'; c.lineWidth = 1.1; c.stroke();
        c.restore();
      }
      fillP(c, [cnx - 24, cny - 20, cnx + 20, cny - 24, cnx + 24, cny + 18, cnx - 20, cny + 22], '#131922');
      strokeP(c, [cnx - 24, cny - 20, cnx + 20, cny - 24, cnx + 24, cny + 18, cnx - 20, cny + 22],
        'rgba(2,4,8,0.9)', 2);
      seg(c, cnx - 14, cny - 8, cnx + 12, cny - 11, 'rgba(160,190,220,0.14)', 2);
    })();

    /* ==================================================================
       HEAD
       ================================================================== */
    c.save();
    c.translate(hcx, hcy);
    c.rotate(hrot);

    const shell = lerpP(SH_A, SH_B, turn, SH_T);
    const jaw = lerpP(JW_A, JW_B, turn, JW_T);

    /* contact shadow thrown back onto the headrest */
    c.save();
    c.globalAlpha = alpha * 0.5;
    c.translate(20, 14);
    smoothP(c, shell);
    c.fillStyle = 'rgba(0,0,0,0.62)'; c.fill();
    c.restore();
    c.globalAlpha = alpha;

    /* --- jaw / lower face (drawn under the shell) --------------- */
    smoothP(c, jaw);
    const skG = lg(c, 'pl.skin', -104, 30, 20, -10, [
      [0.00, '#98684c'], [0.30, '#5b3b2c'], [0.66, '#2c1d17'], [1.00, '#120d0b']
    ]);
    c.fillStyle = skG; c.fill();
    c.save();
    smoothP(c, jaw);
    c.clip();
    const jsG = lg(c, 'pl.jshade', 0, 10, 0, 84, [
      [0.00, 'rgba(0,0,0,0.60)'], [0.5, 'rgba(0,0,0,0.12)'], [1.00, 'rgba(0,0,0,0.56)']
    ]);
    c.fillStyle = jsG; c.fillRect(-120, -20, 240, 120);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * key;
    /* the panel light is close and low, so the jaw doesn't just get
       brighter — thin flesh over the mandible passes red through it.
       Warm amber on the lit plane rolling into a red bleed at the
       terminator is what actually makes skin read as skin. */
    const jkG = lg(c, 'pl.jkey', -110, 74, 4, 4, [
      [0.00, 'rgba(255,196,132,0.50)'], [0.30, 'rgba(240,142,86,0.24)'],
      [0.58, 'rgba(176,66,48,0.13)'], [1.00, 'rgba(120,30,26,0)']
    ]);
    c.fillStyle = jkG; c.fillRect(-120, -20, 240, 120);
    c.globalAlpha = alpha;
    c.restore();
    /* stubble / shadow under the lip line, and the crease of the cheek */
    c.beginPath();
    c.moveTo(mixv(-96, -48, turn), 34);
    c.quadraticCurveTo(mixv(-66, -18, turn), 64, mixv(-16, 30, turn), 52);
    c.strokeStyle = 'rgba(46,20,16,0.34)'; c.lineWidth = 9; c.stroke();
    c.restore();

    /* --- ear cup, bulging out of the shell's side --------------- */
    c.save();
    c.translate(mixv(26, 58, turn), mixv(16, 10, turn));
    c.scale(mixv(1, 0.30, turn), 1);
    ell(c, 0, 1, 25, 29, '#080c12');
    ell(c, -1, -1, 21, 25, '#161d26');
    ring(c, -1, -1, 21, 'rgba(3,5,9,0.9)', 2);
    /* the comms box screwed onto the cup */
    fillP(c, [-9, -9, 9, -11, 11, 8, -7, 10], '#0b1017');
    strokeP(c, [-9, -9, 9, -11, 11, 8, -7, 10], 'rgba(3,5,9,0.9)', 1.4);
    seg(c, -5, -4, 6, -5, 'rgba(170,200,230,0.16)', 1.6);
    c.save();
    c.globalCompositeOperation = 'lighter';
    ell(c, -11, -14, 5, 3, 'rgba(190,225,255,0.14)');
    c.restore();
    c.restore();
    /* comms lead dropping behind the shoulder */
    c.beginPath();
    c.moveTo(mixv(34, 66, turn), 48);
    c.quadraticCurveTo(mixv(76, 96, turn), 100, mixv(58, 82, turn), 176);
    c.strokeStyle = 'rgba(5,8,13,0.9)'; c.lineWidth = 7; c.stroke();
    c.strokeStyle = 'rgba(150,180,215,0.10)'; c.lineWidth = 2.2; c.stroke();

    /* --- shell -------------------------------------------------- */
    const hsG = lg(c, 'pl.shell', -92, -96, 80, 60, [
      [0.00, '#7d8ea5'], [0.18, '#4e5c6f'], [0.46, '#2d3745'],
      [0.74, '#1a212a'], [1.00, '#0b0f15']
    ]);
    smoothP(c, shell);
    c.fillStyle = hsG; c.fill();

    c.save();
    smoothP(c, shell);
    c.clip();
    /* crown sheen */
    const cwG = lg(c, 'pl.crown', -34, -106, 4, -12, [
      [0.00, 'rgba(206,230,255,0.30)'], [1.00, 'rgba(200,226,255,0)']
    ]);
    c.fillStyle = cwG; c.fillRect(-110, -110, 220, 110);
    /* the shell is painted gloss, so it carries a tight, bounded
       specular rather than an even sheen — a soft hot patch up on the
       crown toward the key, plus a smaller second one from the canopy */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.save();
    c.translate(mixv(-52, -20, turn), -62);
    c.rotate(-0.42); c.scale(1, 0.46);
    const spcG = rg(c, 'pl.hspec', 0, 0, 2, 0, 0, 44, [
      [0.00, 'rgba(226,240,255,0.52)'], [0.42, 'rgba(180,214,250,0.16)'],
      [1.00, 'rgba(150,200,255,0)']
    ]);
    c.fillStyle = spcG; c.fillRect(-46, -46, 92, 92);
    c.restore();
    c.save();
    c.translate(mixv(16, 44, turn), -34);
    c.rotate(0.5); c.scale(0.5, 1);
    const spc2 = rg(c, 'pl.hspec2', 0, 0, 2, 0, 0, 40, [
      [0.00, 'rgba(150,224,255,0.34)'], [1.00, 'rgba(120,200,255,0)']
    ]);
    c.globalAlpha = alpha * rim;
    c.fillStyle = spc2; c.fillRect(-42, -42, 84, 84);
    c.globalAlpha = alpha;
    c.restore();
    c.restore();
    /* the back of the shell falls away into the dark */
    const ocG = lg(c, 'pl.occ', 24, 0, 104, 0, [
      [0.00, 'rgba(0,0,0,0)'], [1.00, 'rgba(0,0,0,0.40)']
    ]);
    c.fillStyle = ocG; c.fillRect(16, -110, 96, 200);
    /* mask retention strap: it does NOT sit on the shell surface, it
       runs from the mask bayonet up the side of the helmet and over
       toward the nape, so it foreshortens hard as he turns and it is
       partly hidden behind the ear cup. */
    (function () {
      const sw = mixv(0.30, 1, turn);       // seen edge-on when turned away
      c.save();
      c.beginPath();
      c.moveTo(mixv(-78, -50, turn), 26);
      c.bezierCurveTo(mixv(-34, 2, turn), mixv(-4, -24, turn),
        mixv(30, 52, turn), mixv(-14, -22, turn),
        mixv(66, 88, turn), mixv(22, 14, turn));
      c.lineWidth = 15 * sw + 4;
      c.strokeStyle = 'rgba(0,0,0,0.42)'; c.stroke();
      c.lineWidth = 11 * sw + 2.6;
      c.strokeStyle = '#2b3441'; c.stroke();
      c.lineWidth = 3 * sw + 0.8;
      c.strokeStyle = 'rgba(198,220,248,0.16)'; c.stroke();
      c.restore();
      /* adjuster ladder-lock partway along it */
      c.save();
      c.translate(mixv(-8, 22, turn), mixv(-8, -14, turn));
      c.scale(sw, 1); c.rotate(-0.24);
      fillP(c, [-12, -10, 12, -10, 12, 10, -12, 10], '#3c4757');
      strokeP(c, [-12, -10, 12, -10, 12, 10, -12, 10], 'rgba(2,4,8,0.8)', 1.6);
      seg(c, -6, -6, -6, 6, 'rgba(0,0,0,0.6)', 2.4);
      seg(c, -8, -6, -8, 6, 'rgba(200,222,250,0.18)', 1.2);
      c.restore();
    })();
    /* moulded seam over the crown */
    c.beginPath();
    c.moveTo(mixv(-88, -66, turn), mixv(-14, -26, turn));
    c.quadraticCurveTo(mixv(-34, -12, turn), -102, mixv(58, 44, turn), mixv(-64, -70, turn));
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 4; c.stroke();
    c.strokeStyle = 'rgba(180,210,240,0.09)'; c.lineWidth = 1.4; c.stroke();
    /* Wear. A flight helmet is not a new ball — it is scuffed where it
       rubs the canopy rail and the seat, and the paint is matte enough
       to hold a faint mottle. Deterministic, so it never crawls. */
    for (let i = 0; i < 26; i++) {
      const n0 = noise(i * 2.7 + 0.5), n1 = noise(i * 5.3 + 11.2), n2 = noise(i * 1.9 + 31.7);
      const sx = -104 + n0 * 200, sy = -104 + n1 * 176;
      if (sx * sx / 11000 + sy * sy / 9000 > 1) continue;
      const L = 5 + n2 * 22, an = n0 * TAU;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(an) * L, sy + Math.sin(an) * L * 0.5);
      c.strokeStyle = (i & 1)
        ? 'rgba(186,212,242,' + (0.03 + 0.07 * n2).toFixed(3) + ')'
        : 'rgba(0,0,0,' + (0.05 + 0.10 * n1).toFixed(3) + ')';
      c.lineWidth = 0.8 + n1 * 2.2; c.stroke();
    }
    /* rubbed-through paint along the crown where the canopy rail hits */
    c.beginPath();
    c.moveTo(mixv(-74, -50, turn), -76);
    c.quadraticCurveTo(mixv(-24, -2, turn), -96, mixv(30, 42, turn), -74);
    c.strokeStyle = 'rgba(196,216,240,0.10)'; c.lineWidth = 6; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 1.6; c.stroke();
    /* squadron flash, low on the back of the shell */
    c.save();
    c.globalAlpha = alpha * (0.45 + 0.35 * key);
    c.translate(mixv(52, 66, turn), -12);
    c.scale(mixv(0.85, 0.34, turn), 1);
    fillP(c, [-22, -18, 4, -26, 14, -14, -12, -6], 'rgba(236,64,84,0.6)');
    fillP(c, [-22, -2, 4, -10, 14, 2, -12, 10], 'rgba(232,242,255,0.28)');
    c.restore();
    c.globalAlpha = alpha;
    /* warm bounce from the panel under the front edge */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * key;
    const hkG = lg(c, 'pl.hkey', -104, 70, -14, -30, [
      [0.00, 'rgba(255,182,96,0.66)'], [0.55, 'rgba(255,140,56,0.20)'],
      [1.00, 'rgba(255,130,50,0)']
    ]);
    c.fillStyle = hkG; c.fillRect(-110, -110, 220, 220);
    c.globalAlpha = alpha;
    c.restore();
    c.restore();

    /* front / lower trim band of the shell */
    c.save();
    smoothP(c, shell);
    c.clip();
    c.beginPath();
    c.moveTo(mixv(-100, -76, turn), mixv(-22, -30, turn));
    c.quadraticCurveTo(mixv(-58, -12, turn), mixv(34, 30, turn),
      mixv(24, 58, turn), mixv(58, 46, turn));
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 9; c.stroke();
    c.strokeStyle = 'rgba(178,206,238,0.13)'; c.lineWidth = 2.2; c.stroke();
    c.restore();

    /* shell rim: warm along the front, cold along the back */
    c.save();
    c.globalCompositeOperation = 'lighter';
    smoothP(c, shell);
    const hrimG = lg(c, 'pl.hrim', -98, -60, 94, 56, [
      [0.00, 'rgba(255,176,88,0.72)'], [0.24, 'rgba(255,150,60,0.06)'],
      [0.62, 'rgba(120,220,255,0.10)'], [1.00, 'rgba(184,242,255,0.86)']
    ]);
    c.strokeStyle = hrimG; c.lineWidth = 3.0; c.stroke();
    c.restore();

    /* --- the eye, while the visor is still up ------------------- */
    if (vis < 0.75) {
      const ea = alpha * (1 - vis / 0.75);
      const ex = mixv(-72, -26, turn), ey = -6;
      const ew = mixv(0.42, 1, turn);
      c.save();
      c.globalAlpha = ea;
      c.translate(ex, ey);
      c.scale(ew, 1);
      ell(c, 0, 0, 15, 8, 'rgba(14,9,9,0.9)');
      c.save();
      c.globalCompositeOperation = 'lighter';
      ell(c, -4, -2, 4.0, 2.8, 'rgba(196,228,255,0.85)');
      blob(c, -4, -2, 13, [150, 210, 255], 0.28);
      c.restore();
      c.restore();
      if (turn > 0.4) {
        c.save();
        c.globalAlpha = ea * sat((turn - 0.4) * 3);
        ell(c, 22, -6, 12, 7, 'rgba(14,9,9,0.85)');
        c.globalCompositeOperation = 'lighter';
        ell(c, 19, -8, 3.2, 2.2, 'rgba(196,228,255,0.6)');
        c.restore();
      }
      c.globalAlpha = alpha;
    }

    /* --- oxygen mask -------------------------------------------- */
    c.save();
    c.translate(mkx, mky);
    /* an MBU-style mask covers nose-to-chin: sized so only the cheeks
       and the temple stay bare, which is what stops the lower face
       reading as a bare oval with a badge stuck on it */
    c.scale(0.76 * mkw, 0.72);
    const mcG = lg(c, 'pl.mask', -66, -46, 44, 56, [
      [0.00, '#333d4a'], [0.20, '#3f4a5a'], [0.5, '#212832'],
      [0.78, '#141920'], [1.00, '#080b10']
    ]);
    maskCup(c);
    c.fillStyle = mcG; c.fill();
    c.strokeStyle = 'rgba(3,5,9,0.85)'; c.lineWidth = 3; c.stroke();
    c.save();
    maskCup(c);
    c.clip();
    fillP(c, [-65, -30, -44, -46, -6, -40, -18, -6, -56, -4], 'rgba(102,120,146,0.20)');
    fillP(c, [65, -30, 44, -46, 6, -40, 18, -6, 56, -4], 'rgba(8,11,17,0.4)');
    seg(c, -60, -4, 60, -4, 'rgba(0,0,0,0.5)', 2.4);
    seg(c, -60, -1, 60, -1, 'rgba(190,215,245,0.10)', 1.2);
    fillP(c, [-52, 16, 52, 16, 30, 46, -30, 46], 'rgba(5,7,12,0.45)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * key;
    const mkG = lg(c, 'pl.mkey', -74, 34, 6, -30, [
      [0.00, 'rgba(255,176,92,0.30)'], [1.00, 'rgba(255,150,60,0)']
    ]);
    c.fillStyle = mkG; c.fillRect(-70, -50, 140, 112);
    c.globalAlpha = alpha;
    c.restore();
    c.restore();
    /* exhalation valve */
    const vG = rg(c, 'pl.valve', -6, 19, 1, 0, 26, 18, [
      [0.00, '#dde6f2'], [0.24, '#9fadc0'], [0.52, '#4a5668'],
      [0.76, '#7f8ea3'], [1.00, '#171d25']
    ]);
    disc(c, 0, 29, 12.5, vG);
    ring(c, 0, 29, 12.5, 'rgba(4,6,11,0.85)', 2);
    ring(c, 0, 29, 7.5, 'rgba(20,26,34,0.8)', 2);
    disc(c, 0, 29, 3.6, '#0a0d13');
    /* bayonet clips reaching back to the shell */
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      c.save(); c.scale(sg, 1);
      fillP(c, [54, -28, 86, -22, 86, -6, 54, -10], '#212934');
      strokeP(c, [54, -28, 86, -22, 86, -6, 54, -10], 'rgba(3,5,9,0.85)', 1.8);
      seg(c, 62, -22, 82, -17, 'rgba(180,205,235,0.14)', 2.2);
      c.restore();
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    maskCup(c);
    const mrG = lg(c, 'pl.mrim', -66, 0, 66, 0, [
      [0.00, 'rgba(255,190,104,0.8)'], [0.34, 'rgba(255,170,80,0.05)'],
      [1.00, 'rgba(150,232,255,0.3)']
    ]);
    c.strokeStyle = mrG; c.lineWidth = 3; c.stroke();
    c.restore();
    c.restore();

    /* --- exhale: fog off the valve ------------------------------ */
    if (breath > 0.01) {
      const bp = h2b(mkx, mky + 22);
      c.save();
      c.globalCompositeOperation = 'lighter';
      blob(c, bp[0] - 18, bp[1] + 6, 30 + 24 * breath, [200, 226, 255], 0.09 * breath);
      blob(c, bp[0] - 42, bp[1] + 18, 22 + 36 * breath, [190, 215, 250], 0.06 * breath);
      c.restore();
    }

    /* --- visor --------------------------------------------------- */
    const vx = mixv(-64, -12, turn), vy = -34;
    const vw = mixv(0.56, 0.94, turn) * 0.94;
    /* reflections only read when the glass faces the lens */
    const vfx = 0.24 + 0.76 * turn;
    c.save();
    c.translate(vx, vy);
    c.scale(vw, 0.94);

    /* the glass, pivoting up onto the brow when stowed */
    c.save();
    c.rotate(mixv(-0.42, 0, vis));
    c.translate(0, mixv(-16, 6, vis));
    c.scale(1, mixv(0.22, 1, vis));
    visorShape(c);
    /* Gold-coated glass is a mirror, not a tint: the base has to stay
       near-black so the reflections read, and everything bright on it
       is a REFLECTION with a falloff, not a fill. */
    const gl = c.createLinearGradient(-58, -14, 40, 54);
    gl.addColorStop(0.00, 'rgba(' + (30 + 44 * vis) + ',' + (22 + 30 * vis) + ',10,0.94)');
    gl.addColorStop(0.34, 'rgba(' + (18 + 18 * vis) + ',' + (13 + 12 * vis) + ',8,0.95)');
    gl.addColorStop(0.72, 'rgba(10,9,8,0.96)');
    gl.addColorStop(1.00, 'rgba(' + (20 + 26 * vis) + ',' + (15 + 18 * vis) + ',8,0.94)');
    c.fillStyle = gl; c.fill();
    /* the panel's specular: a tight elongated hot spot with a steep
       falloff, sitting where the coaming would actually be mirrored */
    c.save();
    visorShape(c);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * vfx * (0.35 + 0.65 * key);
    c.save();
    c.translate(-30, 34); c.rotate(-0.30); c.scale(1, 0.34);
    const vspec = rg(c, 'pl.vspec', 0, 0, 1, 0, 0, 52, [
      [0.00, 'rgba(255,232,178,0.95)'], [0.18, 'rgba(255,196,104,0.55)'],
      [0.46, 'rgba(255,150,58,0.16)'], [1.00, 'rgba(255,130,40,0)']
    ]);
    c.fillStyle = vspec; c.fillRect(-56, -56, 112, 112);
    c.restore();
    /* and a small, much tighter cool one from the canopy bow */
    c.save();
    c.translate(26, -2); c.rotate(0.6); c.scale(0.34, 1);
    const vspec2 = rg(c, 'pl.vspec2', 0, 0, 1, 0, 0, 34, [
      [0.00, 'rgba(226,246,255,0.80)'], [0.30, 'rgba(160,222,255,0.22)'],
      [1.00, 'rgba(120,200,255,0)']
    ]);
    c.globalAlpha = alpha * vfx * (0.4 + 0.6 * rim);
    c.fillStyle = vspec2; c.fillRect(-38, -38, 76, 76);
    c.restore();
    c.globalAlpha = alpha;
    c.restore();

    c.save();
    visorShape(c);
    c.clip();
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gg = c.createLinearGradient(-62, 48, 26, -14);
    gg.addColorStop(0.00, 'rgba(255,180,80,' + (0.40 * vfx).toFixed(3) + ')');
    gg.addColorStop(0.45, 'rgba(255,132,54,' + (0.10 * vfx).toFixed(3) + ')');
    gg.addColorStop(1.00, 'rgba(150,215,255,' + (0.30 * vfx).toFixed(3) + ')');
    c.fillStyle = gg; c.fillRect(-72, -18, 144, 82);
    if (hud * vfx > 0.02) {
      c.globalAlpha = alpha * hud * vfx;
      const gc = 'rgba(120,255,196,0.85)';
      c.strokeStyle = gc; c.lineWidth = 2;
      c.beginPath(); c.arc(-4, 20, 15, 0, TAU); c.stroke();
      seg(c, -46, 20, -22, 20, gc, 2);
      seg(c, 13, 20, 37, 20, gc, 2);
      seg(c, -4, 2, -4, 9, gc, 2);
      for (let i = -1; i <= 1; i += 2) {
        const ly = 20 + i * 17 + Math.sin(tt * 0.8 + i) * 2;
        seg(c, -42, ly, -20, ly + i * 3, 'rgba(120,255,196,0.5)', 1.6);
        seg(c, 12, ly, 34, ly + i * 3, 'rgba(120,255,196,0.5)', 1.6);
      }
      blob(c, -4, 20, 52, [96, 255, 182], 0.15 * hud * vfx);
      c.globalAlpha = alpha;
    }
    /* the canopy reflected as a hard streak across the glass */
    const sp = c.createLinearGradient(-58, -6, 16, 46);
    sp.addColorStop(0.00, 'rgba(255,255,255,0)');
    sp.addColorStop(0.44, 'rgba(226,244,255,' + (0.44 * vfx).toFixed(3) + ')');
    sp.addColorStop(0.53, 'rgba(255,255,255,' + (0.80 * vfx).toFixed(3) + ')');
    sp.addColorStop(0.63, 'rgba(226,244,255,' + (0.26 * vfx).toFixed(3) + ')');
    sp.addColorStop(1.00, 'rgba(255,255,255,0)');
    c.fillStyle = sp; c.fillRect(-72, -18, 144, 82);
    /* a second, ANIMATED glint riding across the glass — the reflection
       of whatever is streaking past outside (rail lights, cloud edges,
       the other jet), independent of the static canopy-bow streak above */
    if (sweep > 0.008) {
      const sph = (tt * sweep) % 1;
      const af = sat(Math.min(sph, 1 - sph) / 0.16);
      if (af > 0.01) {
        c.save();
        c.translate(mixv(-64, 92, sph), mixv(50, -30, sph));
        c.rotate(0.5); c.scale(1, 0.085);
        const swG = rg(c, 'pl.vsweep', 0, 0, 1, 0, 0, 46, [
          [0.00, 'rgba(214,238,255,0)'], [0.50, 'rgba(228,244,255,0.9)'], [1.00, 'rgba(214,238,255,0)']
        ]);
        c.globalAlpha = alpha * vfx * af * (0.45 + 0.55 * rim);
        c.fillStyle = swG; c.fillRect(-50, -50, 100, 100);
        c.restore();
      }
    }
    c.restore();
    /* imperfection: fine grime and hairline scratches on the glass —
       deterministic so it doesn't crawl frame to frame */
    c.globalAlpha = alpha * (0.30 + 0.30 * vis);
    for (let i = 0; i < 9; i++) {
      const gx = -60 + (i * 41.3 % 128);
      const gy = -6 + (i * 27.7 % 62);
      const gr = 1.1 + (i % 4) * 0.6;
      c.beginPath(); c.arc(gx, gy, gr, 0, TAU);
      c.fillStyle = 'rgba(8,10,14,' + (0.10 + 0.05 * (i % 3)).toFixed(3) + ')';
      c.fill();
    }
    c.strokeStyle = 'rgba(230,240,250,0.10)'; c.lineWidth = 0.9;
    seg(c, -50, 30, 8, 6, 'rgba(230,240,250,0.09)', 0.8);
    seg(c, -20, -8, 30, 40, 'rgba(230,240,250,0.07)', 0.7);
    seg(c, 4, 44, 34, 20, 'rgba(10,10,12,0.10)', 0.8);
    c.globalAlpha = alpha;
    if (breath > 0.02) {
      const fg = c.createLinearGradient(0, 48, 0, 12);
      fg.addColorStop(0, 'rgba(210,232,255,' + (0.18 * breath).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(210,232,255,0)');
      c.fillStyle = fg; c.fillRect(-72, 6, 144, 48);
    }
    c.restore();
    visorShape(c);
    c.strokeStyle = 'rgba(4,6,11,0.85)'; c.lineWidth = 2.6; c.stroke();
    c.save();
    c.globalCompositeOperation = 'lighter';
    visorShape(c);
    const veG = lg(c, 'pl.vedge', -58, 0, 52, 0, [
      [0.00, 'rgba(255,206,132,1)'], [0.40, 'rgba(255,180,90,0.16)'],
      [1.00, 'rgba(200,248,255,0.92)']
    ]);
    c.strokeStyle = veG; c.lineWidth = 4.4; c.stroke();
    c.strokeStyle = veG; c.lineWidth = 1.4; c.stroke();
    c.restore();
    c.restore();

    /* --- the bloom the glass throws into the air around it ---------
       Drawn OUTSIDE the visor clip and after the edge, so it spills
       onto the shell and the mask the way a real hot highlight does. */
    if (vis > 0.05) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const bl = alpha * vis * vfx;
      blob(c, -26, 26, 96, [255, 186, 88], 0.30 * bl * (0.4 + 0.6 * key));
      blob(c, -34, 20, 54, [255, 214, 140], 0.34 * bl * (0.4 + 0.6 * key));
      blob(c, 22, 2, 46, [168, 232, 255], 0.24 * bl * (0.4 + 0.6 * rim));
      if (hud > 0.02) blob(c, -4, 20, 88, [96, 255, 182], 0.16 * bl * hud);
      /* an anamorphic smear along the visor's long axis */
      c.save();
      c.translate(-16, 22); c.rotate(-0.18); c.scale(1, 0.11);
      const anG = rg(c, 'pl.vbloom', 0, 0, 1, 0, 0, 110, [
        [0.00, 'rgba(255,216,150,0.66)'], [0.35, 'rgba(255,176,80,0.18)'],
        [1.00, 'rgba(255,150,60,0)']
      ]);
      c.globalAlpha = bl * (0.35 + 0.65 * key);
      c.fillStyle = anG; c.fillRect(-116, -116, 232, 232);
      c.restore();
      c.restore();
    }

    /* housing / track across the brow — the glass slides under it */
    c.beginPath();
    c.moveTo(-72, -18);
    c.quadraticCurveTo(-8, -38, 64, -20);
    c.lineTo(64, 4);
    c.quadraticCurveTo(-8, -14, -72, 6);
    c.closePath();
    c.fillStyle = '#1d242e'; c.fill();
    c.strokeStyle = 'rgba(2,4,8,0.9)'; c.lineWidth = 2.2; c.stroke();
    seg(c, -66, -14, 58, -18, 'rgba(184,212,242,0.16)', 2.4);
    disc(c, -64, -2, 7, '#0c1017'); disc(c, -64, -2, 3, 'rgba(170,200,230,0.34)');
    disc(c, 56, -6, 7, '#0c1017'); disc(c, 56, -6, 3, 'rgba(170,200,230,0.34)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    seg(c, -66, -16, 58, -20, rgba(AM, 0.20 * key), 2);
    c.restore();
    c.restore();

    c.restore();  /* end head */
    c.restore();  /* end pilot */
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

  /* ==================================================================
     CROWD — a distant skyline of heads-and-shoulders, for the "audience"
     angle on the launch: cheap flat dark silhouettes, never more than a
     fill + a couple of curves each.  Layout is precomputed once (like
     the cloud bank above) so a frame is just N path fills.
     ================================================================== */
  const CR_N = 26;
  const CROWD = (function () {
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
  function crowd(c, cx, y, w, scale, tt, alpha) {
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

  return {
    rocket: rocket, warship: warship, jet: jet, pilot: pilot,
    cockpit: cockpit, silo: silo, cloudBank: cloudBank, crowd: crowd
  };
})();
try { if (typeof globalThis !== 'undefined' && !globalThis.CINE_ART) globalThis.CINE_ART = CINE_ART; } catch (e) { }
