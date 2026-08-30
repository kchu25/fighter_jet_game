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

export function scene3(u, dt) {
  const A = art();
  const spool = ramp(2.9, 4.5, u);         // the jet coming up to power
  const boot = ramp(0.42, 2.90, u);
  const snap = ramp(2.16, 2.32, u);        // the visor coming down
  const sealed = ramp(2.32, 2.92, u);      // HUD blooming across it
  const fade = 1 - ramp(4.16, 4.5, u);

  once('c3rumble', T2 + 0.15, function () {
    I.rumbleH = sfx('rumble', 0.12); sfx('setIntensity', 0.45);
  });
  if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.12 + 0.30 * spool);

  /* ---- camera: slow push-in with a live hand-held drift ---- */
  const inch = ramp(0, 4.4, u);
  const zoom = 1.02 + 0.15 * inch + 0.05 * spool;
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
    I.c.fillStyle = rgba(C.ice, a * 0.42);
    I.c.fillRect(lx - lw, ly, lw, 2.5 + d * 8);
    I.c.fillStyle = rgba(C.cyan, a * 0.18);
    I.c.fillRect(lx - lw * 0.72, ly + 7 + d * 9, lw * 0.72, 2 + d * 4);
    if (f > 0.30) {
      I.c.globalAlpha = a * 0.22;
      I.c.drawImage(glow(C.ice), lx - lw, ly - 34 - d * 40, lw, 70 + d * 80);
      I.c.globalAlpha = 1;
    }
    /* deck reflection under them */
    I.c.fillStyle = rgba(C.amber, a * 0.10);
    I.c.fillRect(lx - lw * 0.8, VPY + 210 + d * 460, lw * 0.8, 2 + d * 6);
  }
  I.c.restore();

  /* silhouetted bay structure so the depth has edges */
  I.c.fillStyle = '#04050c';
  I.c.fillRect(1360, 60, 74, 700);
  I.c.fillRect(1300, 300, 180, 26);
  I.c.fillRect(150, -40, 60, 520);
  for (let i = 0; i < 5; i++) I.c.fillRect(120, 40 + i * 96, 130, 16);
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.5 * fade;
  I.c.drawImage(glow(C.amber), 1300, 500, 190, 190);
  I.c.globalAlpha = 0.32 * fade;
  I.c.drawImage(glow(C.red), 120, 420, 180, 180);
  I.c.globalAlpha = 1;
  I.c.restore();
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
    rim: 0.45 + 0.55 * ramp(0.4, 2.7, u) + 0.3 * spool,
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

  /* ---- the strike arrives EARLY: the base takes its first hits while
     he is still on the rail.  The routine launch becomes a scramble. ---- */
  const raid = ramp(3.26, 3.52, u);
  once('c3hit1', T2 + 3.30, function () {
    sfx('boom', 0.7); sfx('alarm');
    I.shake = Math.max(I.shake, 15); I.flash = Math.max(I.flash, 0.34); I.flashCol = C.orange;
    for (let i = 0; i < 12; i++)
      part(1230 + rnd(-90, 90), 340 + rnd(-60, 60), rnd(-220, 220), rnd(-160, 120),
        rnd(0.3, 0.7), rnd(3, 8), i % 3 ? C.orange : C.red, { d: 0.94 });
  });
  once('c3siren', T2 + 3.46, function () { sfx('siren'); });
  once('c3hit2', T2 + 3.88, function () {
    sfx('boom', 1.1); sfx('alarm');
    I.shake = Math.max(I.shake, 22); I.flash = Math.max(I.flash, 0.42); I.flashCol = C.red;
    for (let i = 0; i < 14; i++)
      part(220 + rnd(-100, 100), 260 + rnd(-90, 90), rnd(-260, 260), rnd(-180, 140),
        rnd(0.3, 0.8), rnd(3, 9), i % 3 ? C.orange : C.red, { d: 0.94 });
  });
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
