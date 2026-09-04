/* ===== cinematic/scenes/scene3.js — the pilot =====
   Camera outside the canopy: helmet, visor, mask, harness, seat, lit
   warm from the panel below and cold from the bay lights behind. */
import { I } from './state.js';
import { VW, VH, T2, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, scanlines, vignette, art } from './engine.js';

/* ================================================================
   SCENE 3 — THE PILOT.  Camera is outside the canopy looking in at
   him: helmet, visor, mask, harness, seat, lit warm from the panel
   below and cold from the bay lights streaming past behind.
   ================================================================ */
export const BOOTLINES = [
  'APU .............. ONLINE', 'FLT CTRL ......... NOMINAL',
  'INS ALIGN ........ LOCKED', 'WEAPONS .......... ARMED',
  'O2 SUPPLY ........ 100%', 'CATAPULT ......... CHARGED'
];

/* the rest of the flight, still loose on the party line while he runs
   his checklist — same typewriter-and-beep readout as the command
   alert in scene 2, just smaller and off to the side.  Cuts off right
   as the visor comes down: the joking stops, the mask seals. */
export const RD_X = 90, RD_Y = 150;
export const RADIO = [
  { s: 'INTERCEPTOR 03: TELL ME THIS ONE IS A DRILL.', at: 0.05, cps: 82 },
  { s: 'GHOST 2: SURE. AND I AM THE TOOTH FAIRY.', at: 0.68, cps: 82 },
  { s: 'INTERCEPTOR 03: FIGURED. SEE YOU UP THERE.', at: 1.22, cps: 82 },
  { s: 'INTERCEPTOR 01: RADIO DISCIPLINE, PEOPLE.', at: 1.78, cps: 82 }
];

/* the pilot sits here in the 1600x900 frame */
export const P3X = 662, P3Y = 434, P3S = 1.18;
export const FX3 = 644, FY3 = 286;              /* focal point: his head */

/* ---- the overhead ironwork, fixed geometry so nothing re-rolls ----
   service cables hung off the gantry rail and the pipe runs.  Each one
   swings on its own decaying pendulum when a concussion arrives (see
   conc() below); f staggers their natural frequency so the bay never
   sways in lockstep like a bead curtain.  ph only seeds a per-cable
   amplitude so some lines are heavy and lazy, some light and jumpy. */
const CABLES = [
  { x: 305, y: 64, l: 210, w: 3.0, ph: 0.4, f: 1.00 },
  { x: 468, y: 58, l: 148, w: 2.2, ph: 1.7, f: 1.23 },
  { x: 700, y: 66, l: 262, w: 3.6, ph: 3.1, f: 0.85 },
  { x: 872, y: 56, l: 128, w: 2.0, ph: 4.4, f: 1.36 },
  { x: 1088, y: 66, l: 300, w: 3.2, ph: 2.3, f: 0.92 },
  { x: 1288, y: 60, l: 178, w: 2.4, ph: 5.2, f: 1.12 },
  { x: 1452, y: 66, l: 240, w: 2.8, ph: 0.9, f: 1.05 }
];
/* the three concussions that shake the ironwork: the far-off detonation
   he hears before anyone calls it in, then the two hits that land.
   x/y is where each lands at bay depth; r flags the full ring+flash
   treatment (the far one is only a shudder and a flicker of light). */
const CONC = [
  { t: 2.02, a: 6, x: 1445, y: 330, r: 0 },
  { t: 3.30, a: 26, x: 1230, y: 340, r: 1 },
  { t: 3.88, a: 34, x: 220, y: 260, r: 1 }
];
/* decaying pendulum impulse: zero until the concussion, then a ring-
   down.  f scales the swing frequency per cable; every line starts its
   swing from rest exactly when the bang arrives (physically honest —
   the whole ceiling jumps together, then drifts out of phase). */
function conc(u, f) {
  let s = 0;
  for (let i = 0; i < CONC.length; i++) {
    const q = u - CONC[i].t;
    if (q > 0) s += CONC[i].a * Math.exp(-q * 2.2) * Math.sin(q * 8.4 * f);
  }
  return s;
}
/* how hard dust should be sifting off the ceiling right now — a spike
   on each concussion that dies over about a second.  The far det only
   shakes a whisper loose; the real hits dump it. */
function sift(u) {
  let s = 0;
  for (let i = 0; i < CONC.length; i++) {
    const q = u - CONC[i].t;
    if (q > 0) s += (CONC[i].r ? 1 : 0.22) * Math.exp(-q * 3.2);
  }
  return s;
}

export function scene3(u, dt) {
  const A = art();
  const spool = ramp(2.9, 4.5, u);         // the jet coming up to power
  const boot = ramp(0.42, 2.90, u);
  const snap = ramp(2.16, 2.32, u);        // the visor coming down
  const sealed = ramp(2.32, 2.92, u);      // HUD blooming across it
  const fade = 1 - ramp(4.16, 4.5, u);
  const alert = ramp(2.95, 3.16, u);       // klaxon called — before anything lands
  const kb = 0.30 + 0.70 * Math.pow(0.5 + 0.5 * Math.sin((u - 2.95) * 8.4), 2);
  /* the hits also relight HIM for a beat — fed into the pilot rim below */
  let hitRim = 0;
  for (let i = 0; i < CONC.length; i++) {
    const hq = u - CONC[i].t;
    if (CONC[i].r && hq > 0 && hq < 0.14) hitRim = Math.max(hitRim, 1 - hq / 0.14);
  }

  once('c3rumble', T2 + 0.15, function () {
    I.rumbleH = sfx('rumble', 0.12); sfx('setIntensity', 0.45);
  });
  if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.12 + 0.30 * spool);

  /* ---- camera: slow push-in with a live hand-held drift ---- */
  const inch = ramp(0, 4.4, u);
  /* the base creep, plus a deliberate lean-in while he turns to the
     lens — the camera wants to know what he knows — and a last small
     press as the spool comes up */
  const zoom = 1.02 + 0.15 * inch + 0.022 * ramp(1.45, 2.16, u) + 0.05 * spool;
  const cdx = Math.sin(u * 0.44 + 1.1) * 15 + Math.sin(u * 1.9) * 2.5 - 34 * inch;
  const cdy = Math.cos(u * 0.31) * 8 + 26 * ramp(2.4, 4.4, u);
  function push(p) {
    I.c.save();
    const z = 1 + (zoom - 1) * p;
    I.c.translate(FX3 + cdx * p, FY3 + cdy * p);
    I.c.scale(z, z);
    I.c.translate(-FX3, -FY3);
  }

  /* ================= 1. the launch bay, far behind ============ */
  I.c.fillStyle = '#02030a'; I.c.fillRect(0, 0, VW, VH);
  push(0.40);
  const bgG = I.c.createLinearGradient(0, 0, 260, VH);
  bgG.addColorStop(0, '#04050e');
  bgG.addColorStop(0.52, '#0a0a1c');
  bgG.addColorStop(1, '#120823');
  I.c.fillStyle = bgG; I.c.fillRect(-300, -300, VW + 600, VH + 600);

  /* pools of haze that the pilot silhouettes against */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.30 * fade;
  I.c.drawImage(glow(C.violet), 720, 30, 900, 760);
  I.c.globalAlpha = 0.16 * fade;
  I.c.drawImage(glow(C.mag), 380, 180, 760, 640);
  I.c.globalAlpha = 0.20 * fade;
  I.c.drawImage(glow(C.cyan), 960, 120, 620, 560);
  I.c.globalAlpha = 1;

  /* ceiling strip lights of the tunnel streaming past */
  const VPX = 1215, VPY = 384;
  const spd = 0.09 + spool * 0.34;
  for (let i = 0; i < 17; i++) {
    const f = (i + (I.t * spd) % 1) / 17;
    const d = Math.pow(f, 2.25);
    const lx = VPX - d * 2250, ly = VPY - d * 210;
    const lw = 24 + d * 400 + spool * d * 180;
    const a = (0.08 + 0.85 * f) * fade;
    I.c.fillStyle = rgba(C.ice, a * 0.42 * (1 - alert * 0.55));
    I.c.fillRect(lx - lw, ly, lw, 2.5 + d * 8);
    I.c.fillStyle = rgba(C.cyan, a * 0.18 * (1 - alert * 0.55));
    I.c.fillRect(lx - lw * 0.72, ly + 7 + d * 9, lw * 0.72, 2 + d * 4);
    /* the klaxon steals the tunnel: every strip goes red on the beat */
    if (alert > 0.01) {
      I.c.fillStyle = rgba(C.red, a * 0.55 * alert * kb);
      I.c.fillRect(lx - lw, ly, lw, 2.5 + d * 8);
    }
    if (f > 0.30) {
      I.c.globalAlpha = a * 0.22;
      I.c.drawImage(glow(C.ice), lx - lw, ly - 34 - d * 40, lw, 70 + d * 80);
      I.c.globalAlpha = 1;
    }
    /* deck reflection under them — bleeding red once the alert is up */
    I.c.fillStyle = rgba(C.amber, a * 0.10 * (1 - alert * 0.6));
    I.c.fillRect(lx - lw * 0.8, VPY + 210 + d * 460, lw * 0.8, 2 + d * 6);
    if (alert > 0.01) {
      I.c.fillStyle = rgba(C.red, a * 0.09 * alert * kb);
      I.c.fillRect(lx - lw * 0.8, VPY + 210 + d * 460, lw * 0.8, 2 + d * 6);
    }
  }
  I.c.restore();

  /* ---- the hits, at bay depth: each one is a hard flash that relights
     the whole bay for a handful of frames.  Drawn UNDER the ironwork on
     purpose — every silhouette that follows cuts a true shadow out of
     this light, which is what sells "something just went off in here"
     instead of "a glow appeared" ---- */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < CONC.length; i++) {
    const H = CONC[i], q = u - H.t;
    if (q < 0 || q > 0.085) continue;
    const fa = (1 - q / 0.085) * (H.r ? 1 : 0.28) * fade;
    I.c.globalAlpha = 0.9 * fa;                       // white core
    I.c.drawImage(glow(C.white), H.x - 190, H.y - 190, 380, 380);
    I.c.globalAlpha = 0.7 * fa;                       // orange skirt
    I.c.drawImage(glow(C.orange), H.x - 460, H.y - 460, 920, 920);
    I.c.globalAlpha = 0.30 * fa;                      // bounce off the deck
    I.c.drawImage(glow(C.amber), H.x - 320, 560, 640, 480);
    I.c.fillStyle = rgba(C.orange, 0.10 * fa);        // flat lift, whole wall
    I.c.fillRect(-300, -300, VW + 600, VH + 600);
  }
  I.c.globalAlpha = 1;
  I.c.restore();

  /* silhouetted bay structure so the depth has edges */
  I.c.fillStyle = '#04050c';
  I.c.fillRect(1360, 60, 74, 700);
  I.c.fillRect(1300, 300, 180, 26);
  I.c.fillRect(150, -40, 60, 520);
  for (let i = 0; i < 5; i++) I.c.fillRect(120, 40 + i * 96, 130, 16);
  /* far piping runs walking back along the ceiling — flange collars
     every few metres, one drop leg with an elbow — the clutter a real
     bay ceiling is made of, all of it half-eaten by haze so it stays
     behind the pilot instead of competing with him */
  I.c.fillStyle = 'rgba(6,9,18,0.92)';
  I.c.fillRect(-80, 16, 1560, 9);
  I.c.fillRect(-80, 42, 1620, 6);
  for (let i = 0; i < 11; i++) {
    I.c.fillRect(-40 + i * 150, 12, 7, 17);
    if (i % 3 === 1) I.c.fillRect(-38 + i * 150, 38, 5, 13);
  }
  I.c.fillRect(1178, 25, 8, 250);
  I.c.fillRect(1178, 268, 74, 8);
  /* far scaffold tower, X-braced, standing deeper in the haze */
  I.c.fillStyle = 'rgba(5,7,15,0.85)';
  I.c.fillRect(478, 96, 9, 360); I.c.fillRect(566, 96, 9, 360);
  I.c.strokeStyle = 'rgba(5,7,15,0.85)'; I.c.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    const sy = 110 + i * 118;
    I.c.beginPath();
    I.c.moveTo(482, sy); I.c.lineTo(571, sy + 112);
    I.c.moveTo(571, sy); I.c.lineTo(482, sy + 112);
    I.c.stroke();
  }
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.5 * fade;
  I.c.drawImage(glow(C.amber), 1300, 500, 190, 190);
  I.c.globalAlpha = 0.32 * fade;
  I.c.drawImage(glow(C.red), 120, 420, 180, 180);
  /* rotating alarm beacons: two red sweeps deep in the bay that start
     the moment the klaxon calls it, before anything has landed — the
     light says it first, and HE hears it before we do */
  if (alert > 0.01) {
    const b1 = Math.pow(Math.max(0, Math.sin((u - 2.95) * 7.6)), 3);
    const b2 = Math.pow(Math.max(0, Math.sin((u - 2.95) * 7.6 + 3.14)), 3);
    I.c.globalAlpha = alert * b1 * 0.55 * fade;
    I.c.drawImage(glow(C.red), 150, 150, 460, 460);
    I.c.globalAlpha = alert * b2 * 0.50 * fade;
    I.c.drawImage(glow(C.red), 1050, 90, 480, 480);
  }
  /* each real hit throws a distinct concussion ring: a fast hot hoop
     and a slower, thicker pressure ring chasing it — squashed flat so
     they read as pressure walking across the bay floor, not a bubble */
  for (let i = 0; i < CONC.length; i++) {
    const H = CONC[i], q = u - H.t;
    if (!H.r || q < 0 || q > 0.55) continue;
    const t1 = q / 0.55;
    I.c.globalAlpha = (1 - t1) * 0.55 * fade;
    I.c.strokeStyle = rgba(C.amber, 1);
    I.c.lineWidth = 3.5 * (1 - t1) + 0.8;
    I.c.beginPath();
    I.c.ellipse(H.x, H.y, 26 + t1 * 640, (26 + t1 * 640) * 0.38, 0, 0, 6.2832);
    I.c.stroke();
    const t2 = q / 0.38;
    if (t2 < 1) {
      I.c.globalAlpha = (1 - t2) * 0.8 * fade;
      I.c.strokeStyle = rgba(i === 2 ? C.red : C.orange, 1);
      I.c.lineWidth = 6 * (1 - t2) + 1;
      I.c.beginPath();
      I.c.ellipse(H.x, H.y, 12 + t2 * 380, (12 + t2 * 380) * 0.38, 0, 0, 6.2832);
      I.c.stroke();
    }
  }
  I.c.globalAlpha = 1;
  I.c.restore();
  I.c.restore();

  /* ---- the mid ironwork: gantry crane, hoist and the hanging service
     cables, one parallax step nearer than the back wall so the bay
     reads as a volume instead of a matte painting.  All of it is black
     steel that only exists where bay light — or a hit flash — happens
     to be behind it. ---- */
  push(0.52);
  I.c.fillStyle = '#04060d';
  /* main crane rail across the top, with its under-truss */
  I.c.fillRect(-80, 46, VW + 160, 14);
  I.c.fillRect(-80, 88, VW + 160, 6);
  I.c.strokeStyle = '#04060d'; I.c.lineWidth = 4;
  I.c.beginPath();
  for (let i = 0; i < 18; i++) {
    const tx = -60 + i * 96;
    I.c.moveTo(tx, 60); I.c.lineTo(tx + 48, 88);
    I.c.moveTo(tx + 96, 60); I.c.lineTo(tx + 48, 88);
  }
  I.c.stroke();
  /* strobe housings bolted under the rail (lit further down) */
  I.c.fillRect(322, 94, 16, 12); I.c.fillRect(1250, 94, 16, 12);
  /* one faint lit edge so the rail parts from the wall behind it */
  I.c.fillStyle = 'rgba(120,150,190,0.07)';
  I.c.fillRect(-80, 46, VW + 160, 1.5);
  /* crane trolley + hook block hanging over the empty cradle — the
     longest pendulum in the room, so it swings widest and slowest */
  const tsw = conc(u, 0.66) * 1.5 * fade;
  I.c.fillStyle = '#04060d';
  I.c.fillRect(946, 54, 86, 26);
  I.c.strokeStyle = '#04060d'; I.c.lineWidth = 3;
  I.c.beginPath();
  I.c.moveTo(978, 80);
  I.c.quadraticCurveTo(978 + tsw * 0.4, 145, 978 + tsw, 204);
  I.c.moveTo(1000, 80);
  I.c.quadraticCurveTo(1000 + tsw * 0.4, 145, 1000 + tsw, 204);
  I.c.stroke();
  I.c.fillRect(966 + tsw, 202, 46, 30);
  I.c.beginPath();
  I.c.arc(989 + tsw, 246, 12, -0.6, 3.5);
  I.c.lineWidth = 6; I.c.stroke();
  /* the hanging service cables.  Idle they only breathe with the air;
     when a concussion lands the whole ceiling jumps at once, then each
     line rings down at its own frequency and they drift out of phase */
  for (let i = 0; i < CABLES.length; i++) {
    const L = CABLES[i];
    const dx = conc(u, L.f) * (0.55 + 0.45 * Math.sin(L.ph)) * fade
      + Math.sin(I.t * 0.5 + L.ph) * 2;
    I.c.beginPath();
    I.c.moveTo(L.x, L.y);
    I.c.quadraticCurveTo(L.x + dx * 0.35, L.y + L.l * 0.55, L.x + dx, L.y + L.l);
    I.c.strokeStyle = '#04060d'; I.c.lineWidth = L.w; I.c.stroke();
    I.c.fillStyle = '#04060d';
    I.c.fillRect(L.x + dx - 3, L.y + L.l - 2, 6, 9);   // tail fitting
  }
  /* emergency strobes: dead until the first hit lands, then popping
     hard double-flashes off the rail for the rest of the shot */
  const strb = ramp(3.44, 3.52, u) * fade;
  if (strb > 0.01) {
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const sx = i ? 1258 : 330;
      const cyc = (u * 1.85 + i * 0.47) % 1;
      if (!(cyc < 0.05 || (cyc > 0.11 && cyc < 0.16))) continue;  // double-pop
      I.c.globalAlpha = strb;
      I.c.drawImage(glow(C.white), sx - 26, 82, 52, 52);
      I.c.globalAlpha = strb * 0.8;
      I.c.drawImage(glow(C.red), sx - 130, -22, 260, 260);
    }
    I.c.restore();
  }
  I.c.restore();

  /* ================= 2. inside the canopy ===================== */
  push(0.92);
  /* rear canopy bow, arching up behind his shoulder */
  I.c.beginPath();
  I.c.moveTo(1104, VH + 40);
  I.c.quadraticCurveTo(1216, 320, 934, -40);
  I.c.strokeStyle = '#070a11'; I.c.lineWidth = 42; I.c.stroke();
  I.c.strokeStyle = 'rgba(120,150,190,0.10)'; I.c.lineWidth = 5; I.c.stroke();
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.beginPath();
  I.c.moveTo(1084, VH + 40);
  I.c.quadraticCurveTo(1196, 320, 914, -40);
  I.c.strokeStyle = rgba(C.ice, 0.30 * fade); I.c.lineWidth = 3; I.c.stroke();
  I.c.restore();
  /* the far cockpit wall / rear deck */
  I.c.fillStyle = 'rgba(4,6,12,0.85)';
  I.c.beginPath();
  I.c.moveTo(1120, VH); I.c.lineTo(1216, 330); I.c.lineTo(VW, 190);
  I.c.lineTo(VW, VH); I.c.closePath(); I.c.fill();
  I.c.restore();

  /* ================= 3. the pilot ============================= */
  /* choreography: head down on the panel -> lifts and turns to lens
     -> visor snaps -> settles forward down the catapult */
  const lift = ramp(0.70, 1.85, u);
  const toLens = ramp(1.45, 2.16, u);
  const away = ramp(3.20, 4.30, u);        // he squares up down the catapult
  const turn = 0.34 + 0.58 * toLens - 0.44 * away;
  const pitch = 0.80 - 0.72 * lift - 0.16 * ramp(3.6, 4.5, u)
    + 0.05 * Math.sin(u * 0.8);
  const visor = snap * (1 + 0.10 * Math.sin(Math.min(1, (u - 2.16) * 26)) * (1 - snap));
  /* he starts breathing on the mask once it is sealed */
  const bcyc = Math.max(0, Math.sin((u - 2.74) * 2.5));
  const breath = ramp(2.78, 3.08, u) * (0.35 + 0.65 * bcyc * bcyc);

  push(1);
  if (A) A.pilot(I.c, P3X, P3Y, P3S, {
    turn: sat(turn), pitch: pitch, visor: sat(visor),
    hud: sealed * (0.82 + 0.18 * pulse(u, 3.1)),
    glow: 0.50 + 0.50 * boot,
    rim: 0.45 + 0.55 * ramp(0.4, 2.7, u) + 0.3 * spool + 0.5 * hitRim,
    breath: sat(breath), tt: I.t, alpha: 1,
    sweep: 0.16 + 0.34 * sealed + 0.45 * spool
  });
  I.c.restore();

  once('helm', T2 + 2.24, function () {
    sfx('helmetOn'); I.shake = Math.max(I.shake, 5); I.flash = Math.max(I.flash, 0.16);
    I.flashCol = C.ice;
    for (let i = 0; i < 16; i++)
      part(FX3 + rnd(-70, 70), FY3 - 18 + rnd(-16, 16), rnd(-160, 160), rnd(-90, 60),
        rnd(0.25, 0.55), rnd(2, 5), C.ice, { d: 0.9 });
  });
  once('brth', T2 + 2.82, function () { sfx('breath', 3); });

  /* ================= 4. foreground: glass + panel ============== */
  push(1.5);
  /* the instrument coaming across the bottom-left — the key light */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = (0.20 + 0.34 * boot) * fade;
  I.c.drawImage(glow(C.amber), -180, 470, 1000, 700);
  I.c.globalAlpha = (0.14 + 0.24 * boot) * fade;
  I.c.drawImage(glow(C.green), 60, 520, 620, 480);
  I.c.globalAlpha = 1;
  I.c.restore();

  I.c.save();
  I.c.translate(250, 742);
  I.c.rotate(-0.115);
  /* bezel */
  I.c.fillStyle = '#080b12';
  I.c.fillRect(-300, -128, 620, 300);
  I.c.fillStyle = '#141a24';
  I.c.fillRect(-286, -116, 592, 268);
  I.c.fillStyle = '#04070a';
  I.c.fillRect(-262, -100, 544, 214);
  /* the MFD itself */
  I.c.save();
  I.c.beginPath(); I.c.rect(-262, -100, 544, 214); I.c.clip();
  I.c.fillStyle = 'rgba(10,26,20,0.9)'; I.c.fillRect(-262, -100, 544, 214);
  for (let i = 0; i < BOOTLINES.length; i++) {
    const at = 0.42 + i * 0.22;
    if (u < at) continue;
    once('bt' + i, T2 + at, function () { sfx('beep', 0.2 + i * 0.13); });
    const flick = (u - at < 0.3 && Math.random() < 0.35) ? 0.3 : 1;
    txt(BOOTLINES[i], -238, -62 + i * 32, 21,
      rgba(C.green, 0.92 * flick * fade), 2);
  }
  if (boot > 0.98 && pulse(u, 2.2) > 0.35)
    txt('CLEARED FOR LAUNCH', -238, 96, 22, rgba(C.cyan, 0.95 * fade), 4, 'left', 'bold');
  /* screen scan + curvature */
  I.c.fillStyle = 'rgba(120,255,190,0.05)';
  I.c.fillRect(-262, -100 + ((I.t * 190) % 214), 544, 22);
  const scG = I.c.createLinearGradient(-262, -100, 120, 114);
  scG.addColorStop(0, 'rgba(190,255,225,0.10)');
  scG.addColorStop(0.6, 'rgba(190,255,225,0)');
  I.c.fillStyle = scG; I.c.fillRect(-262, -100, 544, 214);
  I.c.restore();
  /* a row of hard switches below the screen. one of them (WEAPONS
     ARMED, see BOOTLINES[3]) waits dark until his glove actually
     throws it — the rest just wake up on their own boot schedule */
  const SWI = 5, HAND_T0 = 1.28, HAND_PRESS = 1.60, HAND_T1 = 1.97;
  const swLit = ramp(HAND_PRESS, HAND_PRESS + 0.24, u);
  for (let i = 0; i < 8; i++) {
    I.c.fillStyle = '#0a0e15';
    I.c.fillRect(-250 + i * 68, 124, 44, 22);
    const lit = i === SWI ? swLit : (i % 3 === 0 ? boot : 0);
    I.c.fillStyle = lit > 0.01 ? rgba(C.amber, 0.55 * lit) : 'rgba(150,180,210,0.14)';
    I.c.fillRect(-244 + i * 68, 130, 14, 10);
  }
  /* ---- his glove reaching in to throw it ---- */
  if (u > HAND_T0 - 0.18 && u < HAND_T1 + 0.15) {
    const appr = ramp(HAND_T0, HAND_PRESS, u);
    const retr = ramp(HAND_PRESS + 0.18, HAND_T1, u);
    const hLift = (1 - appr) * 150 + retr * 190;
    const swCx = -250 + SWI * 68 + 22, swCy = 135;
    const hx = swCx + 22 - 14 * retr, hy = swCy - hLift;
    I.c.save();
    I.c.translate(hx, hy);
    I.c.rotate(0.30 - 0.10 * retr);
    /* nomex sleeve cuff */
    I.c.beginPath();
    I.c.moveTo(-32, -74); I.c.lineTo(26, -84); I.c.lineTo(32, -44); I.c.lineTo(-26, -36);
    I.c.closePath();
    I.c.fillStyle = '#12151b'; I.c.fill();
    I.c.strokeStyle = 'rgba(200,214,230,0.10)'; I.c.lineWidth = 1.4; I.c.stroke();
    /* gloved hand, back-of-hand toward us */
    const hg = I.c.createLinearGradient(-26, -40, 22, 16);
    hg.addColorStop(0, '#1c2027'); hg.addColorStop(0.55, '#101318'); hg.addColorStop(1, '#050608');
    I.c.beginPath();
    I.c.moveTo(-24, -40);
    I.c.quadraticCurveTo(-30, -8, -16, 12);
    I.c.quadraticCurveTo(-2, 24, 12, 15);
    I.c.quadraticCurveTo(24, 6, 21, -22);
    I.c.quadraticCurveTo(19, -40, -4, -44);
    I.c.closePath();
    I.c.fillStyle = hg; I.c.fill();
    I.c.strokeStyle = 'rgba(0,0,0,0.55)'; I.c.lineWidth = 1.2; I.c.stroke();
    /* knuckle seams */
    I.c.strokeStyle = 'rgba(0,0,0,0.4)'; I.c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      I.c.beginPath();
      I.c.moveTo(-14 + k * 10, -34); I.c.lineTo(-18 + k * 12, 6);
      I.c.stroke();
    }
    /* warm rim off the panel below, cool rim off the bay light behind */
    I.c.strokeStyle = rgba(C.amber, 0.40 * (0.3 + 0.7 * boot)); I.c.lineWidth = 2;
    I.c.beginPath(); I.c.moveTo(-16, 10); I.c.quadraticCurveTo(-2, 22, 12, 13); I.c.stroke();
    I.c.strokeStyle = 'rgba(170,210,255,0.20)'; I.c.lineWidth = 1.4;
    I.c.beginPath(); I.c.moveTo(-22, -34); I.c.lineTo(-28, -6); I.c.stroke();
    I.c.restore();
    once('swtap', T2 + HAND_PRESS, function () {
      sfx('beep', 0.32); I.shake = Math.max(I.shake, 2.5);
    });
    const pressGlow = sat(1 - Math.abs(u - HAND_PRESS) / 0.10);
    if (pressGlow > 0.02) {
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = pressGlow * 0.85;
      I.c.fillStyle = rgba(C.amber, 1);
      I.c.beginPath(); I.c.arc(swCx, swCy, 6 + 14 * pressGlow, 0, Math.PI * 2); I.c.fill();
      I.c.restore();
    }
  }
  I.c.restore();

  /* the canopy rail crossing in front of him */
  I.c.beginPath();
  I.c.moveTo(-60, 880);
  I.c.quadraticCurveTo(700, 646, VW + 60, 300);
  I.c.strokeStyle = '#05070d'; I.c.lineWidth = 52; I.c.stroke();
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.beginPath();
  I.c.moveTo(-60, 856);
  I.c.quadraticCurveTo(700, 622, VW + 60, 276);
  I.c.strokeStyle = rgba(C.ice, 0.34 * fade); I.c.lineWidth = 3.5; I.c.stroke();
  I.c.beginPath();
  I.c.moveTo(-60, 852);
  I.c.quadraticCurveTo(700, 618, VW + 60, 272);
  I.c.strokeStyle = rgba(C.amber, 0.14 * fade); I.c.lineWidth = 8; I.c.stroke();
  I.c.restore();
  I.c.restore();

  /* ---- reflections sliding over the canopy glass ---- */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ph = (I.t * (0.10 + 0.22 * spool) + i * 0.37) % 1;
    const gx = -520 + ph * 2600;
    I.c.save();
    I.c.translate(gx, 0);
    I.c.rotate(0.34);
    const rgG = I.c.createLinearGradient(-150, 0, 150, 0);
    rgG.addColorStop(0, 'rgba(150,220,255,0)');
    rgG.addColorStop(0.5, 'rgba(180,232,255,' + (0.055 + 0.05 * spool) * fade + ')');
    rgG.addColorStop(1, 'rgba(150,220,255,0)');
    I.c.fillStyle = rgG;
    I.c.fillRect(-150, -700, 300, 2200);
    I.c.restore();
  }
  I.c.restore();

  /* ---- canopy imperfection: grime and hairline scratches on the
     OUTER glass, sitting between us and him — fixed to the screen,
     not the reflections, so it reads as a physical surface ---- */
  if (fade > 0.02) {
    I.c.save();
    I.c.globalAlpha = fade * 0.5;
    for (let i = 0; i < 14; i++) {
      const gx = (i * 173.7) % VW, gy = 40 + (i * 121.3) % (VH - 80);
      const gr = 1.2 + (i % 5) * 0.7;
      I.c.beginPath(); I.c.arc(gx, gy, gr, 0, Math.PI * 2);
      I.c.fillStyle = 'rgba(10,12,16,' + (0.10 + 0.04 * (i % 3)) + ')';
      I.c.fill();
    }
    I.c.strokeStyle = 'rgba(230,238,248,0.05)'; I.c.lineWidth = 1;
    I.c.beginPath(); I.c.moveTo(220, 60); I.c.lineTo(420, 610); I.c.stroke();
    I.c.beginPath(); I.c.moveTo(980, 30); I.c.lineTo(860, 300); I.c.stroke();
    I.c.strokeStyle = 'rgba(8,9,12,0.07)';
    I.c.beginPath(); I.c.moveTo(1180, 500); I.c.lineTo(1420, 560); I.c.stroke();
    I.c.restore();
  }

  /* dust and lint drifting through the light */
  if (Math.random() < 0.10)
    part(rnd(0, VW), rnd(0, VH), rnd(-26, 10), rnd(-16, 16),
      rnd(1.4, 3.0), rnd(0.5, 1.1), Math.random() < 0.4 ? C.amber : C.ice,
      { d: 0.99, a: 0.16 });

  /* ---- engines coming up under him, right before we cut inside ---- */
  if (spool > 0) I.shake = Math.max(I.shake, 1.5 + 4.5 * spool * (0.6 + 0.4 * Math.sin(I.t * 46)));

  /* ---- radio chatter: the rest of the flight, waiting it out too ---- */
  const rdFade = fade * (1 - ramp(1.86, 2.30, u));
  if (rdFade > 0.01) {
    for (let i = 0; i < RADIO.length; i++) {
      const L = RADIO[i], q = u - L.at;
      if (q < 0) continue;
      once('rd' + i, T2 + L.at, function () { sfx('beep', 0.08 + i * 0.05); });
      const n = Math.min(L.s.length, Math.floor(q * L.cps));
      txt(L.s.slice(0, n), RD_X, RD_Y + i * 30, 17, rgba(C.steel, 0.62 * rdFade), 2);
    }
  }

  /* ---- anticipation: he hears it before the net does.  A far-off
     detonation somewhere beyond the blast doors at 2.02 — right as his
     hand leaves the panel — then the perimeter call, then the klaxon.
     The visor snap at 2.16 stops being procedure and becomes an
     answer: he already knew. ---- */
  const raid = ramp(3.26, 3.52, u);
  once('c3fardet', T2 + 2.02, function () {
    sfx('thud'); I.shake = Math.max(I.shake, 3);
  });
  once('c3perim', T2 + 2.42, function () { sfx('beep', 0.6); sfx('radio', 0.4); });
  const perim = ramp(2.42, 2.60, u) * (1 - ramp(3.12, 3.26, u));
  if (perim > 0.01 && pulse(u, 2.2) > 0.30)
    txt('⚠ PERIMETER CONTACT — SECTOR GATE 4 — STAND BY', VW / 2, 96, 20,
      rgba(C.amber, 0.85 * perim), 5, 'center', 'bold');
  once('c3klax', T2 + 2.95, function () { sfx('alarm'); sfx('setIntensity', 0.6); });
  if (alert > 0.01 && raid < 0.6) {
    /* the pre-hit red wash over the whole frame, beating with the
       klaxon — hands the scene to the raid wash below once it lands */
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = alert * (1 - raid) * (0.030 + 0.055 * kb);
    I.c.fillStyle = rgba(C.red, 1);
    I.c.fillRect(0, 0, VW, VH);
    I.c.restore();
  }

  /* ---- the strike arrives EARLY: the base takes its first hits while
     he is still on the rail.  The routine launch becomes a scramble. ---- */
  once('c3hit1', T2 + 3.30, function () {
    sfx('boom', 0.7); sfx('thud'); sfx('alarm');
    I.shake = Math.max(I.shake, 15); I.flash = Math.max(I.flash, 0.34); I.flashCol = C.orange;
    for (let i = 0; i < 12; i++)
      part(1230 + rnd(-90, 90), 340 + rnd(-60, 60), rnd(-220, 220), rnd(-160, 120),
        rnd(0.3, 0.7), rnd(3, 8), i % 3 ? C.orange : C.red, { d: 0.94 });
    /* sparks raining off the hit — heavy, gravity-owned, white-hot cores */
    for (let i = 0; i < 18; i++)
      part(1230 + rnd(-70, 70), 340 + rnd(-40, 40), rnd(-120, 120), rnd(40, 240),
        rnd(0.5, 1.0), rnd(1, 2.4), i % 4 ? C.amber : C.white, { g: 340, d: 0.985 });
    /* and a few tumbling black chunks knocked off the ironwork */
    for (let i = 0; i < 5; i++)
      part(1230 + rnd(-60, 60), 340 + rnd(-40, 40), rnd(-180, 180), rnd(-60, 160),
        rnd(0.5, 0.9), rnd(2, 5), C.smoke,
        { g: 300, d: 0.97, sq: true, rot: rnd(0, 6.28), vr: rnd(-9, 9), add: false });
  });
  once('c3siren', T2 + 3.46, function () { sfx('siren'); });
  once('c3hit2', T2 + 3.88, function () {
    sfx('boom', 1.1); sfx('explode', 0.6); sfx('alarm');
    I.shake = Math.max(I.shake, 22); I.flash = Math.max(I.flash, 0.42); I.flashCol = C.red;
    for (let i = 0; i < 14; i++)
      part(220 + rnd(-100, 100), 260 + rnd(-90, 90), rnd(-260, 260), rnd(-180, 140),
        rnd(0.3, 0.8), rnd(3, 9), i % 3 ? C.orange : C.red, { d: 0.94 });
    for (let i = 0; i < 20; i++)
      part(220 + rnd(-90, 90), 260 + rnd(-50, 50), rnd(-150, 150), rnd(40, 260),
        rnd(0.5, 1.1), rnd(1, 2.6), i % 4 ? C.amber : C.white, { g: 360, d: 0.985 });
    for (let i = 0; i < 6; i++)
      part(220 + rnd(-70, 70), 260 + rnd(-50, 50), rnd(-200, 200), rnd(-80, 180),
        rnd(0.5, 1.0), rnd(2, 5), C.smoke,
        { g: 320, d: 0.97, sq: true, rot: rnd(0, 6.28), vr: rnd(-10, 10), add: false });
  });
  /* severed lines up in the dark keep dripping sparks after each hit,
     and the shaken ceiling sifts dust down through the light — both
     decay analytically off the CONC table, no per-frame state */
  for (let i = 0; i < CONC.length; i++) {
    const H = CONC[i], q = u - H.t;
    if (H.r && q > 0.1 && q < 1.3 && Math.random() < 0.30 * Math.exp(-q * 2.0))
      part(H.x + rnd(-90, 90), H.y + rnd(-30, 10), rnd(-30, 30), rnd(20, 90),
        rnd(0.4, 0.9), rnd(0.8, 1.8), Math.random() < 0.3 ? C.white : C.amber,
        { g: 380, d: 0.99 });
  }
  const sk = sift(u);
  if (sk > 0.02 && Math.random() < Math.min(0.75, sk * 0.9))
    part(rnd(140, 1500), rnd(50, 150), rnd(-8, 8), rnd(26, 60),
      rnd(0.8, 1.7), rnd(0.6, 1.6), Math.random() < 0.5 ? C.dust : C.sand,
      { g: 70, d: 0.995, a: 0.20 });
  if (raid > 0.01) {
    /* distant impact flares flickering deep in the bay */
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const fl = raid * Math.max(0, Math.sin(u * (17 + i * 7.3) + i * 2.1)) *
        (Math.sin(u * (5.1 + i * 1.7)) > 0.55 ? 1 : 0);
      if (fl < 0.05) continue;
      I.c.globalAlpha = 0.34 * fl;
      I.c.drawImage(glow(i ? C.orange : C.red),
        180 + i * 520 - 140, 200 + (i % 2) * 180 - 140, 280, 280);
    }
    /* red-alert wash strobing through the bay lighting */
    I.c.globalAlpha = raid * (0.05 + 0.09 * pulse(u, 1.5));
    I.c.fillStyle = rgba(C.red, 1);
    I.c.fillRect(0, 0, VW, VH);
    I.c.restore();
    if (pulse(u, 2.6) > 0.35)
      txt('⚠ BASE UNDER ATTACK — SCRAMBLE SCRAMBLE SCRAMBLE ⚠', VW / 2, 96, 24,
        rgba(C.red, 0.9 * raid), 6, 'center', 'bold');
    I.shake = Math.max(I.shake, 3.5 * raid);
  }

  stepParts(dt, 0); drawParts();
  scanlines(0.13);
  vignette(0.62 + 0.22 * sealed);

  /* fade from black in, and back to black — we cut behind his eyes */
  const fi = 1 - ramp(0, 0.55, u);
  if (fi > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fi + ')'; I.c.fillRect(0, 0, VW, VH); }
  const fo = ramp(4.2, 4.5, u);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo + ')'; I.c.fillRect(0, 0, VW, VH); }
}
