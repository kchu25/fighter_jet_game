/* ===== cinematic/art/pilot.js — helmeted aircrew =====
   pilot(c, x, y, s, o): seated aircrew strapped into an ejection seat,
   seen from OUTSIDE the canopy (three-quarter / profile). See the
   option list in the banner comment below for o.turn/pitch/visor/hud/
   glow/rim/breath/tt/alpha. */
import { rgba, sat, fillP, strokeP, seg, disc, ring, ell, noise, lg, rg, blob, TAU, CY, AM } from './helpers.js';

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
export function smoothP(c, p) {
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
export function lerpP(a, b, t, out) {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  out.length = a.length;
  return out;
}
export function mixv(a, b, t) { return a + (b - a) * t; }

/* Helmet shell.  12 control points, same roles in both poses, so the
   head can be turned by lerping between them:
     0 brow front   1 front upper  2 crown front  3 crown
     4 crown back   5 occiput      6 back lower   7 behind the ear
     8 ear-flap     9 cheek edge  10 front cheek 11 brow lower      */
export const SH_A = [
  -96, -24, -86, -64, -42, -94, 16, -98, 66, -76, 94, -34,
  90, 16, 66, 50, 22, 60, -26, 44, -62, 16, -92, -4
];
export const SH_B = [
  -70, -30, -78, -66, -40, -94, 10, -98, 56, -78, 82, -38,
  78, 8, 58, 46, 26, 30, -6, 18, -38, 28, -64, 42
];
/* The jaw / lower face that hangs out of the front of the shell. */
export const JW_A = [
  -90, -10, -104, 26, -94, 58, -62, 84, -14, 80, 32, 56, -30, 30
];
export const JW_B = [
  -58, 0, -64, 34, -48, 64, -12, 82, 26, 74, 54, 40, 0, 8
];
export const SH_T = [], JW_T = [];

/* the oxygen-mask cup, half-width 65 at scale 1 */
export function maskCup(c) {
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
export function visorShape(c) {
  c.beginPath();
  c.moveTo(-58, -6);
  c.quadraticCurveTo(-68, 18, -52, 40);
  c.quadraticCurveTo(-16, 56, 30, 42);
  c.quadraticCurveTo(52, 30, 50, -8);
  c.closePath();
}

export function pilot(c, x, y, s, o) {
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
