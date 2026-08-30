/* ===== cinematic/scenes/scene4.js — catapult launch, first person =====
   rrect(): a rounded-rectangle path helper local to this scene's cockpit
   framing furniture. */
import { I } from './state.js';
import { VW, VH, T3, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, scanlines, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 4 — THE CATAPULT.  Straight behind the canopy now.  The
   shuttle tensions, fires, and drags the whole frame down the tunnel
   until the deck runs out and the world opens.  Everything here is
   motion: no panel, no instruments, just the rails going by faster
   than they should.
   ================================================================ */
export const L_SHOT = 0.80;                   /* the catapult releases */
export const L_OUT = 2.55;                   /* the mouth swallows the frame */
export const LVPX = 800, LVPY = 396;         /* vanishing point */

/* rounded-rect sub-path, used for the canopy aperture */
export function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  I.c.moveTo(x + r, y);
  I.c.arcTo(x + w, y, x + w, y + h, r);
  I.c.arcTo(x + w, y + h, x, y + h, r);
  I.c.arcTo(x, y + h, x, y, r);
  I.c.arcTo(x, y, x + w, y, r);
  I.c.closePath();
}

export function scene4(u, dt) {
  const A = art();
  /* travel is the integral of velocity, so the ribs genuinely accelerate
     instead of just running at a higher constant rate */
  const q = Math.max(0, u - L_SHOT);
  const travel = 0.55 * u + q * (1.6 + 9.6 * q);
  const vel = 0.55 + (q > 0 ? 1.6 + 19.2 * q : 0);
  const spd = sat(vel / 34);                 // 0..1 "how pinned are you"
  const tension = ramp(0.08, L_SHOT, u);     // the wind-up before release
  const open = ramp(1.05, L_OUT, u);         // the far aperture growing
  const sky = ramp(L_OUT, L_OUT + 0.20, u);  // we are outside
  const after = sat((u - L_OUT) / (3.2 - L_OUT));
  const drive = spd * (1 - 0.45 * after);

  /* ---------------------------------------------------- audio ---- */
  once('c4snd', T3 + 0.02, function () {
    sfx('setIntensity', 0.6);
    if (!I.rumbleH) I.rumbleH = sfx('rumble', 0.2);
    sfx('riser', L_SHOT - 0.02);             // lands its impact exactly on the shot
  });
  if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(sat(0.18 + 0.9 * drive));
  once('c4shot', T3 + L_SHOT, function () {
    sfx('thud'); sfx('setIntensity', 0.8);
    I.shake = Math.max(I.shake, 34); I.flash = Math.max(I.flash, 0.5); I.flashCol = C.ice;
    burst(LVPX, LVPY, 26, 900, C.ice, 0.5, 7, { d: 0.99 });
  });
  once('c4gasp', T3 + L_SHOT + 0.22, function () { sfx('breath', 2); });
  once('c4out', T3 + L_OUT, function () {
    sfx('jetPass', 0.25); sfx('setIntensity', 0.86);
    I.shake = Math.max(I.shake, 15); I.flash = Math.max(I.flash, 0.85); I.flashCol = C.white;
  });

  /* ---------------------------------------------------- world ---- */
  I.c.fillStyle = '#010206'; I.c.fillRect(0, 0, VW, VH);

  /* the sky we punch out into, revealed underneath the tunnel */
  if (sky > 0) {
    I.c.save();
    I.c.globalAlpha = sky;
    const hz = 512 - 70 * after;
    dawnSky(hz, 0);
    neonGround(hz, I.t * 3.2, 0.5);
    if (A) A.cloudBank(I.c, hz - 210, 92, I.t * 1.4, [120, 40, 130], 0.30);
    I.c.restore();
  }

  /* ---- the launch tunnel ----
     Each rib is redrawn at the positions it occupied over the last few
     milliseconds; the resulting smear IS the acceleration.  The number
     of ghosts is driven by speed, so the tunnel visibly tears apart. */
  const tun = 1 - sky;
  if (tun > 0.002) {
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    const N = 20;
    const M = 1 + Math.round(6 * spd);
    for (let m = M - 1; m >= 0; m--) {
      const tv = travel - m * 0.62 * spd;
      const ga = (m === 0 ? 1 : 0.62 / (1 + m * 0.85));
      const head = m === 0;
      for (let i = 0; i < N; i++) {
        const f = (i + (tv % 1 + 1) % 1) / N;
        const d = Math.pow(f, 2.7);
        const hw = 58 + d * 2700;
        const hh = 38 + d * 1660;
        const a = (0.04 + 0.92 * f) * tun * ga;
        /* ceiling strip light */
        I.c.strokeStyle = rgba(C.ice, a * 0.55); I.c.lineWidth = 1 + d * 10;
        I.c.beginPath();
        I.c.moveTo(LVPX - hw * 0.84, LVPY - hh);
        I.c.lineTo(LVPX + hw * 0.84, LVPY - hh); I.c.stroke();
        /* deck rails */
        I.c.strokeStyle = rgba(C.amber, a * 0.36); I.c.lineWidth = 1 + d * 7;
        I.c.beginPath();
        I.c.moveTo(LVPX - hw, LVPY + hh);
        I.c.lineTo(LVPX + hw, LVPY + hh); I.c.stroke();
        if (!head) continue;
        /* wall ribs either side */
        I.c.strokeStyle = rgba(C.cyan, a * 0.32); I.c.lineWidth = 1 + d * 5;
        I.c.beginPath();
        I.c.moveTo(LVPX - hw, LVPY - hh * 0.58); I.c.lineTo(LVPX - hw, LVPY + hh * 0.58); I.c.stroke();
        I.c.beginPath();
        I.c.moveTo(LVPX + hw, LVPY - hh * 0.58); I.c.lineTo(LVPX + hw, LVPY + hh * 0.58); I.c.stroke();
        /* hot marker lights on both walls, ticking past */
        if (i % 3 === 0) {
          I.c.globalAlpha = a * 0.55;
          const mw = 40 + d * 120, mh = 26 + d * 120;
          I.c.drawImage(glow(C.red), LVPX - hw - mw * 0.5, LVPY - mh * 0.5, mw, mh);
          I.c.drawImage(glow(C.red), LVPX + hw - mw * 0.5, LVPY - mh * 0.5, mw, mh);
          I.c.globalAlpha = 1;
        }
      }
    }
    /* the two catapult rails converging on the vanishing point */
    I.c.strokeStyle = rgba(C.ice, (0.18 + 0.3 * spd) * tun); I.c.lineWidth = 2 + 2 * spd;
    for (let s = -1; s <= 1; s += 2) {
      I.c.beginPath();
      I.c.moveTo(LVPX + s * 26, LVPY + 24);
      I.c.lineTo(LVPX + s * 900, VH + 200); I.c.stroke();
    }
    /* the whole throat glows hotter the harder we are driven down it */
    if (spd > 0.05) {
      I.c.globalAlpha = 0.30 * spd * tun;
      I.c.drawImage(glow(C.cyan), LVPX - 900, LVPY - 560, 1800, 1120);
      I.c.globalAlpha = 1;
    }
    I.c.restore();
  }

  /* ---- the opening at the end of the deck ---- */
  if (open > 0 && sky < 1) {
    const ow = 74 + open * open * 1900;
    const oh = 50 + open * open * 1180;
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = 1 - sky * 0.5;
    const og = I.c.createRadialGradient(LVPX, LVPY, 0, LVPX, LVPY, Math.max(ow, oh));
    og.addColorStop(0, rgba(C.ice, 0.92));
    og.addColorStop(0.38, rgba([255, 150, 120], 0.42));
    og.addColorStop(0.72, rgba(C.mag, 0.20));
    og.addColorStop(1, 'rgba(0,0,0,0)');
    I.c.fillStyle = og;
    I.c.fillRect(LVPX - ow, LVPY - oh, ow * 2, oh * 2);
    I.c.restore();
  }

  /* ---- speed streaks blowing out of the vanishing point ---- */
  if (spd > 0.015) {
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.lineCap = 'round';
    const len = 34 + 1150 * spd;
    for (let i = 0; i < 96; i++) {
      const ang = i * 2.39996;
      const ca = Math.cos(ang), sa = Math.sin(ang) * 0.66;
      const r0 = ((i * 197.3 + travel * 300) % 1500);
      const k = r0 / 1500;
      I.c.globalAlpha = spd * 0.9 * k * (1 - 0.3 * sky);
      I.c.strokeStyle = rgba(i % 5 ? C.ice : C.white, 1);
      I.c.lineWidth = 1 + 5 * spd * k;
      I.c.beginPath();
      I.c.moveTo(LVPX + ca * r0, LVPY + sa * r0);
      I.c.lineTo(LVPX + ca * (r0 + len * (0.4 + k)), LVPY + sa * (r0 + len * (0.4 + k)));
      I.c.stroke();
    }
    I.c.restore();
  }

  /* grit and vapour torn past the canopy */
  if (u > L_SHOT) {
    const n = 1 + Math.floor(spd * 4);
    for (let k = 0; k < n; k++) {
      const ang = rnd(0, 6.2832), r0 = rnd(24, 190);
      const sp2 = (260 + 1500 * spd) * rnd(0.5, 1.2);
      part(LVPX + Math.cos(ang) * r0, LVPY + Math.sin(ang) * r0 * 0.66,
        Math.cos(ang) * sp2, Math.sin(ang) * sp2 * 0.66,
        rnd(0.18, 0.42), rnd(1.6, 5), Math.random() < 0.28 ? C.white : C.ice,
        { d: 0.998, gr: 20 });
    }
  }
  stepParts(dt, 0); drawParts();

  /* ---------------------------------------------- the canopy ----- */
  /* everything outside the aperture is airframe.  This, and nothing
     else, is what puts the viewer inside the jet. */
  const apw = 700 + 56 * spd, aph = 362 + 28 * spd;
  const ax = 800 - apw, ay = 442 - aph;
  I.c.save();
  I.c.beginPath();
  I.c.rect(0, 0, VW, VH);
  rrect(ax, ay, apw * 2, aph * 2, 210);
  I.c.fillStyle = '#020308';
  I.c.fill('evenodd');
  /* rail highlight around the glass */
  I.c.beginPath(); rrect(ax, ay, apw * 2, aph * 2, 210);
  I.c.strokeStyle = 'rgba(140,170,205,0.16)'; I.c.lineWidth = 26; I.c.stroke();
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.beginPath(); rrect(ax + 6, ay + 6, apw * 2 - 12, aph * 2 - 12, 204);
  I.c.strokeStyle = rgba(C.ice, 0.22 + 0.30 * spd); I.c.lineWidth = 2.5; I.c.stroke();
  I.c.restore();
  /* the coaming lip: a silhouette, not a panel */
  I.c.fillStyle = '#03050b';
  I.c.beginPath();
  I.c.moveTo(0, VH); I.c.lineTo(0, 800);
  I.c.quadraticCurveTo(800, 726, VW, 800); I.c.lineTo(VW, VH);
  I.c.closePath(); I.c.fill();
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  I.c.globalAlpha = 0.28 + 0.3 * ramp(0, 1.2, u);
  I.c.drawImage(glow(C.amber), 120, 700, 560, 300);
  I.c.globalAlpha = 0.20;
  I.c.drawImage(glow(C.green), 980, 706, 460, 260);
  I.c.globalAlpha = 1;
  I.c.restore();
  I.c.restore();

  /* canopy glass: a bright bar of reflection dragged across by the speed */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const ph = ((I.t * (0.2 + 2.6 * spd) + i * 0.5) % 1);
    const gx = -400 + ph * 2400;
    I.c.save(); I.c.translate(gx, 0); I.c.rotate(0.3);
    const rgG = I.c.createLinearGradient(-170, 0, 170, 0);
    rgG.addColorStop(0, 'rgba(150,220,255,0)');
    rgG.addColorStop(0.5, 'rgba(190,236,255,' + (0.04 + 0.07 * spd) + ')');
    rgG.addColorStop(1, 'rgba(150,220,255,0)');
    I.c.fillStyle = rgG; I.c.fillRect(-170, -700, 340, 2300);
    I.c.restore();
  }
  I.c.restore();

  /* --------------------------------------------------- the HUD --- */
  I.c.save();
  I.c.globalCompositeOperation = 'lighter';
  /* fixed centre pipper — the still point the whole world rushes past */
  const pa = 0.30 + 0.30 * spd;
  I.c.strokeStyle = rgba(C.green, pa); I.c.lineWidth = 2;
  I.c.beginPath(); I.c.arc(LVPX, LVPY, 17, 0, 6.2832); I.c.stroke();
  for (let s = -1; s <= 1; s += 2) {
    I.c.beginPath(); I.c.moveTo(LVPX + s * 26, LVPY); I.c.lineTo(LVPX + s * 62, LVPY); I.c.stroke();
  }
  I.c.beginPath(); I.c.moveTo(LVPX, LVPY - 26); I.c.lineTo(LVPX, LVPY - 44); I.c.stroke();

  if (u < L_SHOT) {
    /* the only text before the shot: the tension bar filling */
    txt('CATAPULT', 236, 262, 20, rgba(C.green, 0.66), 6);
    I.c.fillStyle = rgba(C.green, 0.18);
    I.c.fillRect(236, 278, 300, 9);
    I.c.fillStyle = rgba(C.green, 0.62 + 0.3 * pulse(u, 6));
    I.c.fillRect(236, 278, 300 * tension, 9);
  } else {
    const kts = Math.round(38 + vel * 13.4);
    txt(String(kts), 236, 268, 44, rgba(C.green, 0.80), 6);
    txt('KTS', 236, 296, 17, rgba(C.green, 0.40), 5);
    /* the right slot carries the g load, then hands over to AIRBORNE */
    if (after <= 0.04)
      txt((1 + 3.6 * spd).toFixed(1) + ' G', 1364, 268, 26,
        rgba(spd > 0.7 ? C.amber : C.green, 0.72), 6, 'right');
    else if (pulse(u, 2.4) > 0.3)
      txt('AIRBORNE', 1364, 268, 26, rgba(C.cyan, 0.85), 8, 'right', 'bold');
  }
  I.c.restore();

  /* --------------------------------------------------- physical -- */
  if (u < L_SHOT) I.shake = Math.max(I.shake, 1.6 + 4.4 * tension * (0.5 + 0.5 * Math.sin(I.t * 44)));
  else I.shake = Math.max(I.shake, (3 + 21 * spd) * (0.55 + 0.45 * Math.sin(I.t * 63)) * (1 - 0.8 * after));

  scanlines(0.10);
  vignette(0.52 + 0.26 * spd);

  /* in from scene 3's black, out through white into the mass launch */
  const fi = 1 - ramp(0, 0.22, u);
  if (fi > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fi + ')'; I.c.fillRect(0, 0, VW, VH); }
  const wo = ramp(2.86, 3.2, u);
  if (wo > 0) { I.c.fillStyle = 'rgba(255,255,255,' + wo + ')'; I.c.fillRect(0, 0, VW, VH); }
}
