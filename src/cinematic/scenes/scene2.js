/* ===== cinematic/scenes/scene2.js — the signal (red-alert command room) =====
   Two and a half seconds inside the room where the loss report lands: a
   caged beacon grinding through its rotation, two operators hunched over
   their consoles, a situation table blooming red, and a wall display
   typing out the two sentences that start the war. */
import { I } from './state.js';
import { VW, VH, T1, T2, C, rgba, rnd, sat, clamp, ramp, pulse, once, sfx,
  glow, txt, part, stepParts, drawParts, scanlines, vignette } from './engine.js';

/* ================================================================
   SCENE 2 — the signal.  The siren is in the corridor and coming
   closer; the beacon over the door is already turning.  Everything
   red in the frame breathes on the siren's own 1.4 s wail cycle
   (sirenLoop's triangle LFO in audio/cine-loops.js), so the light
   and the sound land their peaks together instead of near each other.
   ================================================================ */
export const AL_X = 292, AL_Y = 424;              /* the readout's baseline block */
export const ALERT = [
  { s: 'ORBITAL DEFENCE PAYLOAD LOST 04:19 LOCAL.', at: 0.42, cps: 62 },
  { s: 'UNKNOWN CONTACTS INBOUND. INTERCEPTORS LAUNCH.', at: 1.32, cps: 66 }
];

/* the beacon head: mounted top-centre on the far wall, spinning about a
   vertical axis.  sin(psi) is where the beam lands left/right, cos(psi)
   is which way it faces — wall (wash + cage shadows) or camera (lens
   glare + the room lit from the front, shadows raking the floor). */
const BKX = 800, BKY = 96, BKSPIN = 4.6, BKPH = -0.6;

/* where the two operators sit (feet centre) — flanking the table */
const OPL = 352, OPR = 1248, OP_FY = 708;

/* the situation table, a trapezoid of dark glass low in the frame */
const TB = { x0: 492, x1: 1108, y0: 700, x2: 318, x3: 1282, y1: 898 };
let TBLG = null;                                  /* cached surface gradient */

/* one hunched silhouette: console glow spill, screen slivers either side
   of the body, desk slab, then the dark shape on top.  `mir` flips the
   slump so the pair don't read as a stamp.  headDy/armUp animate the
   only two things a 2.5 s shot has time for: a flinch and a hand going
   to a headset. */
function operator(x, mir, headDy, armUp, scrCol, flick, rimA) {
  const c = I.c;
  /* console light spilling around the body */
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.16 + 0.12 * flick;
  c.drawImage(glow(scrCol), x - 130, 468, 260, 260);
  c.globalAlpha = 1;
  c.restore();
  /* the screen itself, mostly eclipsed by the operator */
  c.fillStyle = rgba(scrCol, 0.24 + 0.14 * flick);
  c.fillRect(x - 56, 570, 112, 58);
  c.fillStyle = rgba(scrCol, 0.55 * flick);
  c.fillRect(x - 56, 570, 112, 2);
  /* desk slab between operator and wall */
  c.fillStyle = '#05060b';
  c.fillRect(x - 98, 628, 196, 16);
  c.fillStyle = rgba(scrCol, 0.14);
  c.fillRect(x - 98, 628, 196, 1.5);
  /* the body — back to camera, folded over the desk */
  c.save();
  c.translate(x, OP_FY);
  c.scale(mir, 1);
  c.fillStyle = '#020308';
  c.beginPath();
  c.moveTo(-54, 0);
  c.quadraticCurveTo(-60, -74, -32, -102);
  c.quadraticCurveTo(-6, -120, 20, -104);
  c.quadraticCurveTo(52, -86, 50, -28);
  c.lineTo(46, 0);
  c.closePath(); c.fill();
  /* head + headset band + mic nub */
  c.beginPath();
  c.ellipse(2, -128 + headDy, 18, 21, -0.12, 0, Math.PI * 2); c.fill();
  c.lineWidth = 5; c.strokeStyle = '#020308';
  c.beginPath();
  c.arc(2, -130 + headDy, 21, Math.PI * 1.05, Math.PI * 1.9); c.stroke();
  c.fillRect(18, -128 + headDy, 9, 7);
  /* arm coming up to press the earpiece */
  if (armUp > 0.01) {
    c.lineWidth = 11; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(30, -78);
    c.quadraticCurveTo(44 - 8 * armUp, -96 - 18 * armUp, 20, -118 * armUp - 6);
    c.stroke();
  }
  /* red rim off the wall light along the top of head and shoulders */
  if (rimA > 0.015) {
    c.strokeStyle = rgba(C.red, rimA); c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    c.arc(2, -128 + headDy, 20, Math.PI * 1.1, Math.PI * 1.85); c.stroke();
    c.beginPath();
    c.moveTo(-40, -100); c.quadraticCurveTo(-8, -116, 16, -104); c.stroke();
  }
  c.restore();
}

export function scene2(u, dt) {
  /* the siren rides in early and stays under the whole card now — it
     hands the room to scene 3's rumble instead of dying mid-shot */
  once('siren', T1 + 0.62, function () { I.sirenH = sfx('sirenLoop'); sfx('setIntensity', 0.36); });
  once('sirenoff', T2 - 0.30, function () { if (I.sirenH && I.sirenH.stop) { I.sirenH.stop(); I.sirenH = null; } });
  once('alhead', T1 + 0.16, function () { sfx('thud'); });
  /* line two is the sentence that matters: one alarm stab, a small frame
     flash, and the music steps up under it */
  once('alwarn', T1 + 1.32, function () {
    sfx('alarm'); sfx('setIntensity', 0.44);
    I.flash = Math.max(I.flash, 0.12); I.flashCol = C.red;
    I.shake = Math.max(I.shake, 2.5);
  });
  once('alack', T1 + 1.96, function () { sfx('radio', 0.35); });
  once('almap', T1 + 0.55, function () { sfx('beep', 0.06); });

  /* --- the beat: locked to sirenLoop's 1.4 s triangle LFO.  Before the
     siren arrives the room breathes slow; the ramp crossfades the slow
     breath into the wail so nothing pops when the loop starts. --- */
  const sir = ramp(0.62, 0.95, u);
  const p14 = (Math.max(0, u - 0.62) / 1.4) % 1;
  const tri = p14 < 0.25 ? p14 * 4 : p14 < 0.75 ? 2 - p14 * 4 : p14 * 4 - 4;
  const slow = 0.5 + 0.5 * Math.sin(u * 1.55);
  const beat = slow * (1 - sir) + (0.5 + 0.5 * tri) * sir;

  /* --- the room: black, red climbing into it on the beat --- */
  I.c.fillStyle = 'rgb(' + Math.round(5 + 9 * beat * (0.35 + 0.65 * sir)) + ',' +
    Math.round(4 + 2 * beat) + ',' + Math.round(8 + 2 * (1 - beat)) + ')';
  I.c.fillRect(0, 0, VW, VH);

  /* far wall panel seams + the wall/floor junction, so the wash has
     something to slide across instead of a void */
  I.c.fillStyle = 'rgba(0,0,0,0.35)';
  I.c.fillRect(150, 40, 2, 552); I.c.fillRect(560, 40, 2, 552);
  I.c.fillRect(1040, 40, 2, 552); I.c.fillRect(1450, 40, 2, 552);
  I.c.fillStyle = 'rgba(0,0,0,0.5)'; I.c.fillRect(0, 592, VW, 2);
  I.c.fillStyle = rgba(C.red, 0.04 + 0.05 * beat); I.c.fillRect(0, 590, VW, 1.5);

  /* --- the beacon: where the head points this frame --- */
  const psi = u * BKSPIN + BKPH;
  const hx = BKX + 1150 * Math.sin(psi);            /* beam landfall, left/right */
  const cw = Math.cos(psi);
  const wallFace = Math.max(0, cw);                  /* lighting the wall */
  const roomFace = Math.max(0, -cw);                 /* lighting us */

  /* wall wash: a broad skirt plus a hot core riding the beat */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = (0.10 + 0.10 * beat) * wallFace;
  I.c.drawImage(glow(C.red), hx - 560, -210, 1120, 1120);
  I.c.globalAlpha = 0.11 * wallFace;
  I.c.drawImage(glow(C.red), hx - 240, 100, 480, 480);
  /* the beam itself: three shafts, not one wedge — the cage around the
     lamp splits the light, and the sub-shafts slide within the fan as
     the head turns, which is what reads as "machine", not "gradient" */
  for (let k = 0; k < 3; k++) {
    const ph = ((psi * 1.7 + k * 2.094) % 6.2832 + 6.2832) % 6.2832;
    const off = (ph / 6.2832 - 0.5) * 480;
    const ka = Math.max(0, 1 - Math.abs(off) / 300);
    if (ka < 0.03) continue;
    I.c.globalAlpha = 0.085 * wallFace * ka;
    I.c.fillStyle = rgba(C.red, 1);
    I.c.beginPath();
    I.c.moveTo(BKX, BKY + 6);
    I.c.lineTo(hx + off - 70, 600); I.c.lineTo(hx + off + 70, 600);
    I.c.closePath(); I.c.fill();
  }
  /* light pooling on the floor under the wash */
  I.c.globalAlpha = 0.08 * wallFace;
  I.c.save(); I.c.scale(1, 0.35);
  I.c.drawImage(glow(C.red), hx - 340, 1810, 680, 680);
  I.c.restore();
  I.c.globalAlpha = 1;
  I.c.restore();

  /* cage-bar shadows sweeping THROUGH the wash — dark bands the lamp's
     own cage drags across the wall.  Drawn before the readout so the
     wall takes the shadow but the emissive display does not. */
  for (let i = 0; i < 3; i++) {
    const ph = ((psi * 2.3 + i * 2.094) % 6.2832 + 6.2832) % 6.2832 / 6.2832;
    const a = 0.16 * wallFace * Math.max(0, 1 - Math.abs(ph - 0.5) * 2.4);
    if (a < 0.02) continue;
    const bxx = hx + (ph - 0.5) * 640;
    I.c.fillStyle = 'rgba(0,0,0,' + a + ')';
    I.c.fillRect(bxx - 26, 104, 52, 488);
    I.c.fillRect(bxx - 13, 104, 26, 488);
  }

  /* two wall-dome alarm lamps, anti-phase so the pair reads as a system */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  const dwake = 0.18 + 0.82 * sir;
  I.c.globalAlpha = (0.10 + 0.42 * beat) * dwake;
  I.c.drawImage(glow(C.red), 128 - 80, 196 - 80, 160, 160);
  I.c.globalAlpha = (0.10 + 0.42 * (1 - beat)) * dwake;
  I.c.drawImage(glow(C.red), 1472 - 80, 196 - 80, 160, 160);
  I.c.restore();
  for (let d = 0; d < 2; d++) {
    const dx = d ? 1472 : 128, da = d ? 1 - beat : beat;
    I.c.fillStyle = '#07080d'; I.c.fillRect(dx - 20, 200, 40, 7);
    I.c.fillStyle = rgba(C.red, (0.25 + 0.6 * da) * dwake);
    I.c.beginPath(); I.c.arc(dx, 200, 14, Math.PI, 0); I.c.fill();
  }

  /* ceiling conduit sagging across the top — silhouettes for the wash to
     pass behind, with a red top-edge graze when the beam is near */
  I.c.strokeStyle = '#030408'; I.c.lineWidth = 4;
  I.c.beginPath(); I.c.moveTo(-30, 64); I.c.quadraticCurveTo(430, 152, 900, 58); I.c.stroke();
  I.c.beginPath(); I.c.moveTo(700, 40); I.c.quadraticCurveTo(1150, 132, 1630, 78); I.c.stroke();
  const cg = wallFace * Math.max(0, 1 - Math.abs(hx - 800) / 700);
  if (cg > 0.03) {
    I.c.strokeStyle = rgba(C.red, 0.20 * cg); I.c.lineWidth = 1.5;
    I.c.beginPath(); I.c.moveTo(-30, 62); I.c.quadraticCurveTo(430, 150, 900, 56); I.c.stroke();
  }

  /* the fixture itself: stem, housing, caged lens, and a hot filament
     slit that slides with sin(psi) so you can see the head turning even
     when the beam is out of frame */
  I.c.fillStyle = '#05060a';
  I.c.fillRect(BKX - 4, 0, 8, 34); I.c.fillRect(BKX - 22, 30, 44, 10);
  I.c.fillStyle = '#0a0c12'; I.c.fillRect(BKX - 30, 40, 60, 46);
  I.c.fillStyle = rgba(C.red, 0.30 + 0.45 * roomFace + 0.15 * beat);
  I.c.fillRect(BKX - 22, 48, 44, 30);
  I.c.fillStyle = rgba(C.white, 0.35 + 0.5 * roomFace);
  I.c.fillRect(BKX + Math.sin(psi) * 16 - 2, 50, 4, 26);
  I.c.fillStyle = '#05060a';                         /* the cage over the lens */
  I.c.fillRect(BKX - 14, 46, 3, 34); I.c.fillRect(BKX - 1, 46, 3, 34);
  I.c.fillRect(BKX + 12, 46, 3, 34); I.c.fillRect(BKX - 22, 61, 44, 3);
  if (roomFace > 0.02) {
    /* lens glare when it faces the camera: bloom plus a thin flare line */
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    const gs = 150 + 340 * roomFace * (0.7 + 0.3 * beat);
    I.c.globalAlpha = 0.22 + 0.42 * roomFace;
    I.c.drawImage(glow(C.red), BKX - gs / 2, 63 - gs / 2, gs, gs);
    I.c.globalAlpha = 0.30 * roomFace * roomFace;
    I.c.fillStyle = rgba(C.red, 1);
    I.c.fillRect(BKX - 300 * roomFace, 62, 600 * roomFace, 2);
    I.c.restore();
  }

  /* ============= the wall display: page-in, type, freeze ============= */
  const on = ramp(0.06, 0.42, u);          /* CRT unfolding vertically */
  I.c.save();
  I.c.translate(0, AL_Y + 6); I.c.scale(1, 0.08 + 0.92 * on); I.c.translate(0, -(AL_Y + 6));
  if (u > 1.32 && u < 1.47) I.c.translate(rnd(-2.4, 2.4), rnd(-1.2, 1.2));

  /* --- header line + hairline rules --- */
  I.c.save();
  I.c.globalAlpha = on;
  txt('SECTOR 7 COMMAND', AL_X, AL_Y - 116, 17, rgba(C.steel, 0.42), 6);
  txt('PRIORITY TRAFFIC / RELAY 04', VW - AL_X, AL_Y - 116, 17, rgba(C.steel, 0.30), 6, 'right');
  /* live sub-header: the alert condition stamps in, the clock never stops */
  if (u > 0.50) {
    txt('ALERT STATE: RED', AL_X, AL_Y - 92, 14,
      rgba(C.red, 0.45 + 0.35 * beat), 5);
  }
  const cs = Math.floor((u * 100 + 37) % 100);
  txt('04:19:' + (cs < 10 ? '0' : '') + cs, VW - AL_X, AL_Y - 92, 14, rgba(C.steel, 0.30), 5, 'right');
  I.c.fillStyle = rgba(C.red, 0.30 + 0.14 * beat);
  I.c.fillRect(AL_X, AL_Y - 100, (VW - AL_X * 2) * on, 1);
  I.c.fillStyle = rgba(C.steel, 0.13);
  I.c.fillRect(AL_X, AL_Y + 104, (VW - AL_X * 2) * on, 1);
  I.c.restore();

  /* --- the two lines: garbage pre-roll, cursor-driven type with a
     terminal flicker, the newest glyph burning white then cooling --- */
  let cur = null, typing = false;
  for (let i = 0; i < ALERT.length; i++) {
    const L = ALERT[i], q = u - L.at;
    const y = AL_Y - 22 + i * 54;
    if (q < 0) {
      /* the relay chews static for a beat before the line resolves */
      if (q > -0.15) {
        let gs = ''; const gl = 4 + (Math.random() * 24 | 0);
        for (let k = 0; k < gl; k++) gs += '█▓▒░ '[(Math.random() * 5) | 0];
        txt(gs, AL_X, y, 30, rgba(i ? C.red : C.ice, 0.12 + 0.14 * Math.random()), 4);
      }
      continue;
    }
    once('alline' + i, T1 + L.at, function () { sfx('beep', 0.1 + i * 0.16); });
    const n = Math.min(L.s.length, Math.floor(q * L.cps));
    if (n < L.s.length) typing = true;
    if (!n) { cur = [AL_X, y]; continue; }
    /* line 1 is procedure; line 2 is the war — it types in red */
    const col = i ? C.red : C.ice, cA = i ? 0.92 : 0.86;
    const flick = (q < 0.26 && Math.random() < 0.30) ? 0.45 : 1;
    const wA = n > 1 ? txt(L.s.slice(0, n - 1), AL_X, y, 30, rgba(col, cA * flick), 4) : 0;
    const bx0 = AL_X + (n > 1 ? wA + 4 : 0);
    const wB = txt(L.s[n - 1], bx0, y, 30, rgba(col, cA * flick), 4);
    const brt = sat(1 - (q - n / L.cps + 1 / L.cps) / 0.20);
    if (brt > 0.02) txt(L.s[n - 1], bx0, y, 30, rgba(C.white, 0.85 * brt), 4);
    cur = [bx0 + wB + 5, y];
  }
  /* the caret: solid while the relay is still feeding, blinking once the
     message freezes — the difference between "receiving" and "received" */
  if (cur && (typing || pulse(u, 2.1) > 0.45)) {
    I.c.fillStyle = rgba(C.ice, typing ? 0.72 : 0.55);
    I.c.fillRect(cur[0], cur[1] - 21, 14, 24);
  }
  /* a red rule sweeps under line two once it lands, holding the eye
     there through the fade */
  const ul = ramp(2.03, 2.22, u);
  if (ul > 0.01) {
    I.c.fillStyle = rgba(C.red, 0.5 * ul);
    I.c.fillRect(AL_X, AL_Y + 46, (VW - AL_X * 2) * 0.62 * ul, 2);
  }

  /* --- footer: the authority line, now beating with the siren --- */
  I.c.save();
  I.c.globalAlpha = ramp(1.9, 2.25, u);
  txt('AUTHENTICATED — NORTHERN COMMAND', AL_X, AL_Y + 146, 16, rgba(C.steel, 0.34), 6);
  txt('ACKNOWLEDGE', VW - AL_X, AL_Y + 146, 16, rgba(C.red, 0.34 + 0.44 * beat), 6, 'right');
  I.c.restore();
  I.c.restore();                                    /* end CRT transform */
  if (on < 0.999) {
    /* the bright fold line while the display unrolls */
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = (1 - on) * 0.55;
    I.c.fillStyle = rgba(C.ice, 1);
    I.c.fillRect(AL_X - 40, AL_Y + 4, VW - AL_X * 2 + 80, 2.5);
    I.c.globalAlpha = (1 - on) * 0.35;
    I.c.drawImage(glow(C.ice), 800 - 220, AL_Y - 215, 440, 440);
    I.c.restore();
  }

  /* ============= the situation table: where the war is a shape ======= */
  const spread = ramp(0.35, 2.35, u);      /* the contact blob growing */
  I.c.save();
  I.c.beginPath();
  I.c.moveTo(TB.x0, TB.y0); I.c.lineTo(TB.x1, TB.y0);
  I.c.lineTo(TB.x3, TB.y1); I.c.lineTo(TB.x2, TB.y1);
  I.c.closePath(); I.c.clip();
  if (!TBLG) {
    TBLG = I.c.createLinearGradient(0, TB.y0, 0, TB.y1);
    TBLG.addColorStop(0, '#170407'); TBLG.addColorStop(1, '#270509');
  }
  I.c.fillStyle = TBLG; I.c.fillRect(TB.x2, TB.y0, TB.x3 - TB.x2, TB.y1 - TB.y0);
  /* projection grid, converging like the glass is tilted away from us */
  I.c.strokeStyle = rgba(C.red, 0.09 + 0.03 * beat); I.c.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    I.c.beginPath();
    I.c.moveTo(TB.x0 + i * (TB.x1 - TB.x0) / 8, TB.y0);
    I.c.lineTo(TB.x2 + i * (TB.x3 - TB.x2) / 8, TB.y1);
    I.c.stroke();
  }
  for (let k = 0; k <= 4; k++) {
    const f = Math.pow(k / 4, 1.55), gy = TB.y0 + f * (TB.y1 - TB.y0);
    const gw = (TB.x1 - TB.x0) + f * ((TB.x3 - TB.x2) - (TB.x1 - TB.x0));
    I.c.beginPath(); I.c.moveTo(800 - gw / 2, gy); I.c.lineTo(800 + gw / 2, gy); I.c.stroke();
  }
  /* the contact mass at the north edge: a blob that will not stop
     growing, threat rings peeling off it, hostile pips creeping south */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = (0.28 + 0.26 * beat) * spread;
  const bs = 90 + 160 * spread;
  I.c.drawImage(glow(C.red), 800 - bs / 2, 714 - bs / 2, bs, bs);
  I.c.restore();
  for (let i = 0; i < 3; i++) {
    const f = (u * 0.5 + i / 3) % 1;
    const ra = 0.30 * (1 - f) * spread;
    if (ra < 0.02) continue;
    I.c.strokeStyle = rgba(C.red, ra); I.c.lineWidth = 1.5;
    I.c.beginPath();
    I.c.ellipse(800, 714, 40 + f * 250 * spread, (40 + f * 250 * spread) * 0.30, 0, 0, Math.PI * 2);
    I.c.stroke();
  }
  if (spread > 0.25) txt('RAID 04 — TRACK UNSTABLE', 800, 746, 11, rgba(C.red, 0.55 * spread), 3, 'center');
  const CSX = [-160, -46, 88, 188];
  for (let i = 0; i < 4; i++) {
    if (u < 0.5 + i * 0.33) continue;
    const p = sat(0.10 + (u - 0.5 - i * 0.33) * 0.07);
    const px = 800 + CSX[i] * (1 - p), py = 714 + (848 - 714) * p;
    if (pulse(u, 2.8 + i * 0.31) < 0.35) continue;
    I.c.fillStyle = rgba(C.red, 0.85);
    I.c.beginPath();
    I.c.moveTo(px, py + 5); I.c.lineTo(px - 6, py - 4); I.c.lineTo(px + 6, py - 4);
    I.c.closePath(); I.c.fill();
  }
  /* our own marker and its sweep, still calmly doing its job */
  const ang = u * 2.4;
  I.c.strokeStyle = rgba(C.cyan, 0.14); I.c.lineWidth = 1.5;
  I.c.beginPath(); I.c.moveTo(800, 848);
  I.c.lineTo(800 + Math.cos(ang) * 230, 848 - Math.sin(ang) * 69); I.c.stroke();
  I.c.strokeStyle = rgba(C.cyan, 0.45 + 0.30 * pulse(u, 1.2)); I.c.lineWidth = 2;
  I.c.strokeRect(800 - 7, 848 - 7, 14, 14);
  txt('S7', 814, 852, 10, rgba(C.cyan, 0.4), 2);
  I.c.restore();                                    /* end table clip */
  I.c.fillStyle = rgba(C.red, 0.20 + 0.15 * beat);  /* lit table rim */
  I.c.fillRect(TB.x0, TB.y0 - 2, TB.x1 - TB.x0, 2);

  /* ============= the people: two operators, one flinch =============== */
  /* floor shadows first, raked by wherever the beam is this frame — as
     hx sweeps through an operator the shadow swings under them and
     hardens, which is the "moving shadows" the bare wash never gave */
  for (let s = 0; s < 2; s++) {
    const ox = s ? OPR : OPL;
    const prox = Math.exp(-Math.pow((hx - ox) / 320, 2));
    const sa = (0.05 + 0.30 * prox) * (0.45 + 0.55 * roomFace);
    if (sa < 0.03) continue;
    const sh = clamp((ox - hx) * 0.5, -360, 360);
    I.c.fillStyle = 'rgba(0,0,0,' + sa + ')';
    I.c.beginPath();
    I.c.moveTo(ox - 50, OP_FY - 2);
    I.c.quadraticCurveTo(ox + sh * 0.4 - 30, 800, ox + sh - 66, VH);
    I.c.lineTo(ox + sh + 66, VH);
    I.c.quadraticCurveTo(ox + sh * 0.35 + 54, 802, ox + 50, OP_FY - 2);
    I.c.closePath(); I.c.fill();
  }
  /* left operator sees line two and comes up off the desk; right one is
     already keying his headset to make the call */
  const flinch = ramp(1.34, 1.54, u) * (1 - 0.3 * ramp(1.95, 2.35, u));
  const bobL = Math.sin(u * 3.1) * 1.5, bobR = Math.sin(u * 2.6 + 1.9) * 1.5;
  const rimL = 0.28 * wallFace * Math.exp(-Math.pow((hx - OPL) / 300, 2)) + 0.06 * beat * sir;
  const rimR = 0.28 * wallFace * Math.exp(-Math.pow((hx - OPR) / 300, 2)) + 0.06 * beat * sir;
  const flkL = 0.7 + 0.3 * Math.random();
  /* his screen loses the plot for a moment when the contacts resolve */
  const scRt = (u > 1.32 && u < 1.62 && Math.random() < 0.5) ? C.red : C.cyan;
  operator(OPL, 1, bobL - 9 * flinch, 0, C.green, flkL, rimL);
  operator(OPR, -1, bobR, ramp(1.48, 1.86, u), scRt, 0.7 + 0.3 * Math.random(), rimR);

  /* ============= foreground: console backs framing the shot ========== */
  I.c.fillStyle = '#04050a';
  I.c.beginPath();
  I.c.moveTo(0, VH); I.c.lineTo(0, 796); I.c.lineTo(150, 812);
  I.c.lineTo(330, 856); I.c.lineTo(330, VH); I.c.closePath(); I.c.fill();
  I.c.beginPath();
  I.c.moveTo(VW, VH); I.c.lineTo(VW, 796); I.c.lineTo(VW - 150, 812);
  I.c.lineTo(VW - 330, 856); I.c.lineTo(VW - 330, VH); I.c.closePath(); I.c.fill();
  /* status LEDs on the near racks: one on the beat, one steady, one that
     only starts blinking once the second line has landed */
  for (let s = 0; s < 2; s++) {
    const m = s ? -1 : 1, e = s ? VW : 0;
    I.c.fillStyle = rgba(C.red, 0.25 + 0.6 * beat);
    I.c.fillRect(e + m * 52, 838, 5, 5);
    I.c.fillStyle = rgba(C.amber, 0.4);
    I.c.fillRect(e + m * 86, 846, 5, 5);
    if (u > 1.4 && pulse(u, 5) > 0.5) {
      I.c.fillStyle = rgba(C.green, 0.5);
      I.c.fillRect(e + m * 120, 854, 5, 5);
    }
  }

  /* dust hanging in the beam — deterministic motes, lit only where the
     shaft actually is at their height, plus a little pooled drift */
  for (let i = 0; i < 9; i++) {
    const mx = 60 + (i * 211.7) % 1480 + Math.sin(u * 0.5 + i * 1.7) * 14;
    const my = 130 + (i * 137.3) % 420 + (u * (6 + (i % 3) * 4)) % 40;
    const bcx = BKX + (hx - BKX) * (my - BKY) / 500;
    const ma = 0.14 * wallFace * Math.max(0, 1 - Math.abs(mx - bcx) / (70 + (my - BKY) * 0.5));
    if (ma < 0.02) continue;
    I.c.fillStyle = rgba(C.ice, ma);
    I.c.fillRect(mx, my, 2, 2);
  }
  if (Math.random() < 0.10)
    part(rnd(120, 1480), rnd(120, 640), rnd(-8, 8), rnd(2, 10),
      rnd(1.2, 2.4), rnd(0.6, 1.2), C.red, { d: 0.99, a: 0.12 });

  /* one full-frame red lift on the beat + the lens facing us — the whole
     room inhaling with the siren instead of near it */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.fillStyle = rgba(C.red, 0.024 * beat * sir + 0.055 * roomFace * (0.4 + 0.6 * beat));
  I.c.fillRect(0, 0, VW, VH);
  I.c.restore();

  stepParts(dt, 0); drawParts();
  scanlines(0.16);
  vignette(0.80);

  /* dip in from scene 1's black, and back out of it */
  const fi = 1 - ramp(0, 0.24, u);
  if (fi > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fi + ')'; I.c.fillRect(0, 0, VW, VH); }
  const fo = ramp(T2 - 0.34, T2, u + T1);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo + ')'; I.c.fillRect(0, 0, VW, VH); }
}
