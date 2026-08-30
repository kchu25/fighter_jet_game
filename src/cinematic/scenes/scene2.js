/* ===== cinematic/scenes/scene2.js — the signal (quiet red alert) =====
   A command-deck readout typed out over a breathing red-lit room. */
import { I } from './state.js';
import { VW, VH, T1, T2, C, rgba, ramp, pulse, once, sfx, glow, txt,
  stepParts, drawParts, scanlines, vignette } from './engine.js';

/* ================================================================
   SCENE 2 — the signal.  Deliberately quiet: a dark room, a relay
   terminal typing two flat sentences, a siren somewhere else in the
   building.  No slam-ins, no klaxon in your face.
   ================================================================ */
export const AL_X = 292, AL_Y = 424;              /* the readout's baseline block */
export const ALERT = [
  { s: 'ORBITAL DEFENCE PAYLOAD LOST 04:19 LOCAL.', at: 0.42, cps: 62 },
  { s: 'UNKNOWN CONTACTS INBOUND. INTERCEPTORS LAUNCH.', at: 1.32, cps: 66 }
];

export function scene2(u, dt) {
  /* the siren is two rooms away and it does not stay long */
  once('siren', T1 + 0.62, function () { I.sirenH = sfx('sirenLoop'); sfx('setIntensity', 0.36); });
  once('sirenoff', T2 - 0.95, function () { if (I.sirenH && I.sirenH.stop) { I.sirenH.stop(); I.sirenH = null; } });
  once('alhead', T1 + 0.16, function () { sfx('thud'); });

  /* --- the room: black, with the faintest red breathing in it --- */
  const bre = 0.5 + 0.5 * Math.sin(u * 1.55);
  I.c.fillStyle = 'rgb(' + Math.round(5 + 5 * bre) + ',' + Math.round(4 + 2 * bre) + ',' +
    Math.round(7 + 3 * bre) + ')';
  I.c.fillRect(0, 0, VW, VH);

  /* a single rotating-beacon wash creeping across the far wall */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  const bx = 260 + 1180 * (0.5 + 0.5 * Math.sin(u * 0.78 - 1.2));
  I.c.globalAlpha = 0.055 + 0.045 * bre;
  I.c.drawImage(glow(C.red), bx - 620, -260, 1240, 1240);
  I.c.globalAlpha = 1;
  I.c.restore();

  const on = ramp(0.06, 0.42, u);          /* the panel coming up */

  /* --- header line + hairline rules --- */
  I.c.save();
  I.c.globalAlpha = on;
  txt('SECTOR 7 COMMAND', AL_X, AL_Y - 116, 17, rgba(C.steel, 0.42), 6);
  txt('PRIORITY TRAFFIC / RELAY 04', VW - AL_X, AL_Y - 116, 17, rgba(C.steel, 0.30), 6, 'right');
  I.c.fillStyle = rgba(C.red, 0.30 + 0.14 * bre);
  I.c.fillRect(AL_X, AL_Y - 100, (VW - AL_X * 2) * on, 1);
  I.c.fillStyle = rgba(C.steel, 0.13);
  I.c.fillRect(AL_X, AL_Y + 104, (VW - AL_X * 2) * on, 1);
  I.c.restore();

  /* --- the two lines, typed out --- */
  let cur = null;
  for (let i = 0; i < ALERT.length; i++) {
    const L = ALERT[i], q = u - L.at;
    if (q < 0) continue;
    once('alline' + i, T1 + L.at, function () { sfx('beep', 0.1 + i * 0.16); });
    const n = Math.min(L.s.length, Math.floor(q * L.cps));
    const y = AL_Y - 22 + i * 54;
    const w = txt(L.s.slice(0, n), AL_X, y, 30, rgba(C.ice, 0.86), 4);
    cur = [AL_X + w + (n ? 5 : 0), y];
  }
  /* the caret sits after whatever has been typed so far */
  if (cur && pulse(u, 2.1) > 0.45) {
    I.c.fillStyle = rgba(C.ice, 0.55);
    I.c.fillRect(cur[0], cur[1] - 21, 14, 24);
  }

  /* --- footer: an authority line, small and flat --- */
  I.c.save();
  I.c.globalAlpha = ramp(1.9, 2.25, u);
  txt('AUTHENTICATED — NORTHERN COMMAND', AL_X, AL_Y + 146, 16, rgba(C.steel, 0.34), 6);
  txt('ACKNOWLEDGE', VW - AL_X, AL_Y + 146, 16, rgba(C.red, 0.40 + 0.22 * bre), 6, 'right');
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
