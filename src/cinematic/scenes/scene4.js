/* ===== cinematic/scenes/scene4.js — catapult launch, first person =====
   rrect(): a rounded-rectangle path helper local to this scene's cockpit
   framing furniture. */
import { I } from './state.js';
import { VW, VH, T3, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, streakParts, scanlines, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 4 — THE CATAPULT, UNDER FIRE.  Straight behind the canopy
   now.  The base is already taking hits: the shuttle tensions while
   impacts walk down the deck, fires, and drags the whole frame down
   the tunnel in a race against the strike — out through the shockwave
   a beat before the mouth goes up behind us.  Everything here is
   motion and urgency: rails going by faster than they should, and
   fire landing closer than it should.
   ================================================================ */
export const L_SHOT = 1.35;                   /* the catapult releases */
export const L_OUT = 3.30;                   /* the mouth swallows the frame */
export const L_END = 4.2;                    /* scene length (== T4 - T3) */
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
  const open = ramp(1.75, L_OUT, u);         // the far aperture growing
  const sky = ramp(L_OUT, L_OUT + 0.20, u);  // we are outside
  const after = sat((u - L_OUT) / (L_END - L_OUT));
  const drive = spd * (1 - 0.45 * after);
  const raid = 1 - sky;                      // the strike is still landing

  /* ---------------------------------------------------- audio ---- */
  once('c4snd', T3 + 0.02, function () {
    sfx('setIntensity', 0.6);
    if (!I.rumbleH) I.rumbleH = sfx('rumble', 0.2);
    if (!I.sirenH) I.sirenH = sfx('sirenLoop');   // the klaxon rides with us
    sfx('riser', L_SHOT - 0.02);             // lands its impact exactly on the shot
  });
  if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(sat(0.18 + 0.9 * drive));
  /* the strike walking down the deck while the shuttle tensions */
  once('c4nm1', T3 + 0.42, function () {
    sfx('thud'); sfx('alarm');
    I.shake = Math.max(I.shake, 12); I.flash = Math.max(I.flash, 0.24); I.flashCol = C.orange;
    burst(LVPX - 220, LVPY - 60, 14, 520, C.orange, 0.5, 6, { d: 0.96 });
  });
  once('c4nm2', T3 + 0.94, function () {
    sfx('boom', 0.85);
    I.shake = Math.max(I.shake, 20); I.flash = Math.max(I.flash, 0.34); I.flashCol = C.red;
    burst(LVPX + 260, LVPY + 40, 16, 620, C.red, 0.55, 7, { d: 0.96 });
  });
  once('c4shot', T3 + L_SHOT, function () {
    sfx('thud'); sfx('setIntensity', 0.8);
    I.shake = Math.max(I.shake, 34); I.flash = Math.max(I.flash, 0.5); I.flashCol = C.ice;
    burst(LVPX, LVPY, 26, 900, C.ice, 0.5, 7, { d: 0.99 });
  });
  once('c4gasp', T3 + L_SHOT + 0.22, function () { sfx('breath', 2); });
  /* near-misses strobing past the tunnel mouth mid-run */
  once('c4nm3', T3 + L_SHOT + 0.55, function () {
    sfx('plasma');
    I.shake = Math.max(I.shake, 16); I.flash = Math.max(I.flash, 0.28); I.flashCol = C.orange;
    burst(LVPX + rnd(-180, 180), LVPY + rnd(-90, 90), 14, 800, C.orange, 0.4, 6, { d: 0.98 });
  });
  once('c4nm4', T3 + L_SHOT + 1.18, function () {
    sfx('boom', 1.0);
    I.shake = Math.max(I.shake, 24); I.flash = Math.max(I.flash, 0.4); I.flashCol = C.red;
    burst(LVPX + rnd(-160, 160), LVPY + rnd(-80, 80), 18, 950, C.red, 0.42, 7, { d: 0.98 });
  });
  once('c4out', T3 + L_OUT, function () {
    sfx('jetPass', 0.25); sfx('boom', 1.5); sfx('setIntensity', 0.86);
    if (I.sirenH && I.sirenH.stop) { try { I.sirenH.stop(); } catch (e) { } I.sirenH = null; }
    I.shake = Math.max(I.shake, 26); I.flash = Math.max(I.flash, 0.85); I.flashCol = C.white;
  });
  /* the strike lands on the mouth we just cleared */
  once('c4basehit', T3 + L_OUT + 0.38, function () {
    sfx('explode');
    I.shake = Math.max(I.shake, 20); I.flash = Math.max(I.flash, 0.5); I.flashCol = C.orange;
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(1);
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

  /* ---- the base erupting behind us: firelight climbing up over the
     frame edges from a blast we are no longer inside of ---- */
  const erupt = ramp(L_OUT + 0.36, L_OUT + 0.62, u);
  if (erupt > 0.01) {
    const flick = erupt * (0.62 + 0.38 * pulse(u, 8.4));
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = 0.5 * flick;
    I.c.drawImage(glow(C.orange), -320, VH - 380, 900, 760);
    I.c.drawImage(glow(C.orange), VW - 580, VH - 380, 900, 760);
    I.c.globalAlpha = 0.3 * flick;
    I.c.drawImage(glow(C.red), 380, VH - 260, 840, 620);
    I.c.restore();
    /* embers and smoke torn forward past the canopy from behind */
    if (Math.random() < 0.7) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      part(800 + sd * rnd(560, 860), rnd(560, 900), sd * rnd(-60, 60), rnd(-520, -260),
        rnd(0.3, 0.7), rnd(3, 9), Math.random() < 0.4 ? C.orange : C.dust,
        { d: 0.985, sq: Math.random() < 0.5, rot: rnd(0, 6.28), vr: rnd(-6, 6) });
    }
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
    /* impact flashes strobing somewhere ahead — hits on the deck
       around the mouth, each one a hard flicker of firelight thrown
       down the throat toward us */
    for (let i = 0; i < 3; i++) {
      const fl = tun * Math.max(0, Math.sin(u * (13 + i * 8.7) + i * 2.4)) *
        (Math.sin(u * (4.3 + i * 2.1) + i) > 0.62 ? 1 : 0);
      if (fl < 0.06) continue;
      const fx = LVPX + Math.sin(i * 5.1 + Math.floor(u * 4)) * (140 + 260 * open);
      const fy = LVPY + Math.cos(i * 3.7 + Math.floor(u * 4)) * (70 + 130 * open);
      const fr = 90 + 260 * open;
      I.c.globalAlpha = 0.5 * fl;
      I.c.drawImage(glow(i ? C.orange : C.red), fx - fr, fy - fr * 0.7, fr * 2, fr * 1.4);
      I.c.globalAlpha = 1;
    }
    /* red-alert wash strobing off the tunnel walls */
    I.c.globalAlpha = raid * (0.05 + 0.08 * pulse(u, 1.5));
    I.c.fillStyle = rgba(C.red, 1);
    I.c.fillRect(0, 0, VW, VH);
    I.c.globalAlpha = 1;
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

  /* ---- punching out through the shockwave: a vapour cone snapping
     over the frame as the mouth spits us into open sky ---- */
  const shock = (u - L_OUT + 0.02) / 0.48;
  if (shock > 0 && shock < 1) {
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    I.c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const k = sat(shock * (1.25 - i * 0.16));
      const rw = (90 + k * k * 2100) * (1 - i * 0.12);
      const rh = rw * 0.62;
      const a = (1 - k) * (0.55 - i * 0.14);
      if (a <= 0.02) continue;
      I.c.strokeStyle = rgba(i === 2 ? C.cyan : C.ice, a);
      I.c.lineWidth = 3 + 26 * (1 - k);
      I.c.beginPath();
      I.c.ellipse(LVPX, LVPY, rw, rh, 0, 0, 6.2832);
      I.c.stroke();
    }
    I.c.globalAlpha = (1 - shock) * 0.5;
    I.c.drawImage(glow(C.white), LVPX - 640, LVPY - 420, 1280, 840);
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
    /* burning debris off the strike, tumbling across the canopy —
       hot square chunks that the streak pass smears into motion */
    if (raid > 0.1 && Math.random() < 0.25 + 0.5 * spd) {
      const ang = rnd(0, 6.2832), r0 = rnd(60, 240);
      const sp2 = (380 + 1700 * spd) * rnd(0.6, 1.2);
      part(LVPX + Math.cos(ang) * r0, LVPY + Math.sin(ang) * r0 * 0.66,
        Math.cos(ang) * sp2, Math.sin(ang) * sp2 * 0.66,
        rnd(0.2, 0.45), rnd(2.5, 6), Math.random() < 0.5 ? C.orange : C.rust,
        { d: 0.998, sq: true, rot: rnd(0, 6.28), vr: rnd(-14, 14) });
    }
  }
  stepParts(dt, 0); drawParts();
  streakParts(sat(spd * 1.2) * (1 - 0.5 * after));

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
  /* master-caution wash strobing across the whole coaming, cutting
     out in ragged flickers as the airframe takes the buffeting */
  const cwFlick = (spd > 0.3 && Math.random() < 0.12) ? 0.2 : 1;
  I.c.globalAlpha = raid * (0.14 + 0.20 * pulse(u, 2.6)) * cwFlick;
  I.c.drawImage(glow(C.red), 460, 680, 700, 340);
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
    /* the tension bar filling — but this launch is not routine */
    txt('EMERG CATAPULT', 236, 262, 20, rgba(C.red, 0.5 + 0.4 * pulse(u, 3.2)), 6, 'left', 'bold');
    I.c.fillStyle = rgba(C.red, 0.18);
    I.c.fillRect(236, 278, 300, 9);
    I.c.fillStyle = rgba(C.amber, 0.62 + 0.3 * pulse(u, 6));
    I.c.fillRect(236, 278, 300 * tension, 9);
    txt('BASE UNDER ATTACK', 1364, 268, 22,
      rgba(C.red, 0.35 + 0.55 * pulse(u, 2.8)), 6, 'right', 'bold');
    if (pulse(u, 1.9) > 0.4)
      txt('⚠ GET AIRBORNE NOW ⚠', LVPX, 560, 26,
        rgba(C.red, 0.85), 8, 'center', 'bold');
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
    /* master caution flickering while fire is still landing around us */
    if (raid > 0.2 && pulse(u, 3.4) > 0.45)
      txt('⚠ MASTER CAUTION — PROXIMITY DETONATIONS', LVPX, 626, 19,
        rgba(C.red, 0.75 * raid), 5, 'center', 'bold');
    /* and the reason we ran: the mouth goes up a beat after we clear it */
    if (erupt > 0.1 && pulse(u, 2.2) > 0.35)
      txt('⚠ LAUNCH COMPLEX HIT', LVPX, 626, 22,
        rgba(C.orange, 0.85 * erupt), 6, 'center', 'bold');
  }
  I.c.restore();

  /* --------------------------------------------------- physical -- */
  if (u < L_SHOT) I.shake = Math.max(I.shake, 2.6 + 5.2 * tension * (0.5 + 0.5 * Math.sin(I.t * 44)));
  else I.shake = Math.max(I.shake, (3 + 25 * spd) * (0.55 + 0.45 * Math.sin(I.t * 63)) * (1 - 0.8 * after));

  scanlines(0.10);
  vignette(0.52 + 0.26 * spd);

  /* in from scene 3's black, out through white into the mass launch */
  const fi = 1 - ramp(0, 0.22, u);
  if (fi > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fi + ')'; I.c.fillRect(0, 0, VW, VH); }
  const wo = ramp(L_END - 0.34, L_END, u);
  if (wo > 0) { I.c.fillStyle = 'rgba(255,255,255,' + wo + ')'; I.c.fillRect(0, 0, VW, VH); }
}
