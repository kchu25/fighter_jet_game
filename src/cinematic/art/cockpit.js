/* ===== cinematic/art/cockpit.js — static first-person furniture =====
   cockpit(c, tt, boot, sealed): ABSOLUTE 1600x900. Opaque everywhere
   except the canopy glass (approx x 190..1410, y 90..560), which is
   left untouched so the scene shows through. */
import { rgba, sat, mix, fillP, strokeP, seg, disc, ring, hash, noise, lg, rg, blob, TAU, VW, CY, AM } from './helpers.js';

/* ==================================================================
   6. COCKPIT — static first-person furniture, ABSOLUTE 1600x900.
   Opaque everywhere except the canopy glass (approx x 190..1410,
   y 90..560), which is left untouched so the scene shows through.
   ================================================================== */
export const CVH = 900;

export function gauge(c, gx, gy, r, ang, lit, label) {
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

export function cockpit(c, tt, boot, sealed) {
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

  /* ============ the glass itself ============================= */
  /* The aperture must stay CLEAR — the scene renders through it — so
     everything here is additive and faint: it should register as
     "there is a pane" in the corner of the eye, never as an overlay. */
  c.save();
  c.globalCompositeOperation = 'lighter';
  /* dual reflection streaks: the coaming and the pilot's own helmet
     mirrored as two soft diagonal bands. They are fixed to the
     airframe on purpose — reflections that do NOT track the world
     are precisely what says "curved glass between you and it". */
  c.save();
  c.translate(600, 300); c.rotate(-0.52);
  const gsA = lg(c, 'cp.glsA', -60, 0, 60, 0, [
    [0.00, 'rgba(190,220,250,0)'], [0.50, 'rgba(205,230,252,0.045)'], [1.00, 'rgba(190,220,250,0)']
  ]);
  c.fillStyle = gsA; c.fillRect(-60, -300, 120, 640);
  c.restore();
  c.save();
  c.translate(1075, 265); c.rotate(-0.52);
  const gsB = lg(c, 'cp.glsB', -34, 0, 34, 0, [
    [0.00, 'rgba(190,220,250,0)'], [0.50, 'rgba(215,236,255,0.035)'], [1.00, 'rgba(190,220,250,0)']
  ]);
  c.fillStyle = gsB; c.fillRect(-34, -260, 68, 560);
  c.restore();
  /* micro-scratches: even a polished canopy carries hairlines from
     years of wiping; deterministic so they never crawl frame-to-frame */
  for (let i = 0; i < 11; i++) {
    const h0 = hash(i * 4.7 + 1.3), h1 = hash(i * 9.1 + 6.8), h2 = hash(i * 2.3 + 12.5);
    const sx = 260 + h0 * 1080, sy = 120 + h1 * 380;
    const L = 30 + h2 * 120, an = -0.6 + h0 * 0.5;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + Math.cos(an) * L, sy + Math.sin(an) * L);
    c.strokeStyle = 'rgba(210,230,250,' + (0.015 + 0.03 * h2).toFixed(3) + ')';
    c.lineWidth = 0.8; c.stroke();
  }
  /* edge refraction: the thick acrylic bends light near the frame — a
     cold fringe hugging the bow and pillars, and a warm one over the
     dash where the instrument glow re-enters the pane, so it breathes
     with the boot state like everything else lit from below */
  c.beginPath();
  c.moveTo(0, 52); c.quadraticCurveTo(800, 136, VW, 52);
  c.strokeStyle = rgba(CY, 0.055); c.lineWidth = 14; c.stroke();
  seg(c, 208, 148, 194, 560, rgba(CY, 0.05), 12);
  seg(c, VW - 208, 148, VW - 194, 560, rgba(CY, 0.05), 12);
  c.beginPath();
  c.moveTo(170, 552); c.quadraticCurveTo(800, 596, 1430, 552);
  c.strokeStyle = rgba(AM, 0.05 + 0.06 * lit); c.lineWidth = 12; c.stroke();
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
  /* structural fasteners along the coaming lip: countersunk bolts on
     a fixed pitch, each a dark socket with an offset catch-light and
     a smear of shadow below — hardware is what makes the lip read as
     a casting instead of a drawn line */
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8, px = mix(180, 1420, t);
    const py = (1 - t) * (1 - t) * 560 + 2 * t * (1 - t) * 604 + t * t * 560 + 7;
    disc(c, px, py, 3.4, 'rgba(6,9,14,0.9)');
    disc(c, px - 0.9, py - 1, 1.4, 'rgba(175,200,230,0.28)');
    seg(c, px - 1.8, py + 1.4, px + 1.8, py + 1.8, 'rgba(0,0,0,0.5)', 1);
  }
  /* paint worn through to metal where gloved hands brace on the lip —
     deterministic nicks, brighter than the paint but far below the
     lamp highlights so they never compete with the annunciators */
  for (let i = 0; i < 6; i++) {
    const h0 = hash(i * 6.1 + 3.7), h1 = hash(i * 11.7 + 8.2);
    const t = 0.08 + h0 * 0.84, px = mix(180, 1420, t);
    const py = (1 - t) * (1 - t) * 560 + 2 * t * (1 - t) * 604 + t * t * 560;
    seg(c, px - 6 - h1 * 10, py + 3, px + 6 + h1 * 8, py + 2.4,
      'rgba(196,214,236,' + (0.05 + 0.08 * h1).toFixed(3) + ')', 1.4 + h1 * 1.6);
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

  /* ---- switch rows under the annunciators ---- */
  /* Every toggle owns its own lamp with its own state: some dark, one
     amber-caution, one slow blinker. Uniform lamps read as texture;
     individual states read as a machine somebody actually configured. */
  (function () {
    fillP(c, [700, 676, 952, 676, 952, 768, 700, 768], '#0a0e14');
    strokeP(c, [700, 676, 952, 676, 952, 768, 700, 768], 'rgba(120,145,175,0.18)', 1);
    seg(c, 700, 722, 952, 722, 'rgba(0,0,0,0.5)', 1.4);
    c.font = '8px "Courier New",monospace';
    c.fillStyle = 'rgba(130,160,195,' + (0.16 + 0.4 * lit) + ')';
    c.fillText('ARMT', 704, 688);
    c.fillText('ECS', 704, 734);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 6; k++) {
        const sx2 = 742 + k * 34, sy2 = 698 + row * 46;
        const id = row * 6 + k;
        const up = hash(id * 7.3 + 2.2) > 0.4;
        /* base collar + bat handle; the handle gets a lit near edge so
           its throw direction is legible at a glance */
        disc(c, sx2, sy2, 5, '#05070b');
        ring(c, sx2, sy2, 5, 'rgba(110,135,165,0.25)', 1);
        seg(c, sx2, sy2, sx2, sy2 + (up ? -9 : 9), '#232b36', 4);
        seg(c, sx2 - 0.8, sy2, sx2 - 0.8, sy2 + (up ? -9 : 9), 'rgba(190,212,238,0.30)', 1.2);
        disc(c, sx2, sy2 + (up ? -9 : 9), 2.6, up ? '#3a4453' : '#161c26');
        /* the lamp above each switch: staggered wake-up thresholds so
           the row ripples on with boot instead of snapping as a unit,
           and only switches thrown ON ever light */
        const thr = 0.25 + 0.6 * hash(id * 3.1 + 9.7);
        if (boot > thr && up) {
          const col2 = id === 4 ? AM : (id === 9 ? [255, 60, 90] : [64, 255, 158]);
          let g2 = boot >= 0.999 ? 1 : 0.5 + 0.5 * noise(tt * 16 + id);
          if (id === 7) g2 *= (Math.floor(tt * 1.6) & 1) ? 1 : 0.15;  /* slow blinker */
          c.fillStyle = rgba(col2, 0.8 * g2);
          c.fillRect(sx2 - 4, sy2 - 22, 8, 5);
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(c, sx2, sy2 - 19.5, 10, col2, 0.30 * g2);
          c.restore();
        } else {
          c.fillStyle = '#10151d';
          c.fillRect(sx2 - 4, sy2 - 22, 8, 5);
        }
      }
    }
  })();

  /* ---- AOA indexer: three stacked lamps left of the ALT gauge ---- */
  (function () {
    fillP(c, [332, 652, 372, 652, 372, 760, 332, 760], '#0a0e14');
    strokeP(c, [332, 652, 372, 652, 372, 760, 332, 760], 'rgba(120,145,175,0.18)', 1);
    const AOA = [[255, 60, 90], AM, [64, 255, 158]];
    for (let k = 0; k < 3; k++) {
      const ly2 = 672 + k * 34;
      disc(c, 352, ly2, 10, '#05070b');
      ring(c, 352, ly2, 10, 'rgba(110,135,165,0.3)', 1.2);
      /* red and amber only wink during the self-test ripple; on-speed
         green latches once boot settles — the classic indexer story */
      const on2 = boot >= 0.999 ? (k === 2 ? 1 : 0)
        : (boot > 0.3 + k * 0.18 ? 0.5 + 0.5 * noise(tt * 14 + k * 3) : 0);
      if (on2 > 0.02) {
        disc(c, 352, ly2, 7, rgba(AOA[k], 0.85 * on2));
        c.save();
        c.globalCompositeOperation = 'lighter';
        blob(c, 352, ly2, 20, AOA[k], 0.4 * on2);
        c.restore();
      } else disc(c, 352, ly2, 7, '#131a23');
    }
  })();

  /* ---- master warning cluster, far right ---- */
  /* Big annunciator tiles: label etched dark when out, flooded when
     lit, with enough bloom to register in peripheral vision — which
     is the entire job of a warning lamp. Boot is a lamp test: tiles
     flood in sequence, then the cluster settles (greens latch as
     "system good", ambers and FIRE drop out, MSTR breathes armed). */
  (function () {
    const WL = [
      ['MSTR', AM], ['FIRE', [255, 60, 90]], ['HYD', AM],
      ['FUEL', AM], ['OXY', [64, 255, 158]], ['GEN', [64, 255, 158]]
    ];
    fillP(c, [1372, 630, 1584, 630, 1584, 786, 1372, 786], '#0a0e14');
    strokeP(c, [1372, 630, 1584, 630, 1584, 786, 1372, 786], 'rgba(120,145,175,0.18)', 1);
    c.font = '9px "Courier New",monospace';
    c.textAlign = 'center';
    for (let k = 0; k < 6; k++) {
      const wx = 1382 + (k % 2) * 104, wy = 640 + Math.floor(k / 2) * 50;
      const col2 = WL[k][1];
      const tOn = 0.15 + k * 0.12;
      let g2 = 0;
      if (boot < 0.999) g2 = boot > tOn ? (0.55 + 0.45 * noise(tt * 12 + k * 5)) : 0;
      else g2 = (k === 4 || k === 5) ? 0.9 : (k === 0 ? 0.10 + 0.06 * Math.sin(tt * 2.1) : 0);
      c.fillStyle = '#080c12';
      c.fillRect(wx, wy, 94, 40);
      c.strokeStyle = 'rgba(110,135,165,0.28)'; c.lineWidth = 1;
      c.strokeRect(wx + 0.5, wy + 0.5, 93, 39);
      if (g2 > 0.02) {
        c.fillStyle = rgba(col2, 0.30 * g2);
        c.fillRect(wx + 2, wy + 2, 90, 36);
        c.fillStyle = rgba(col2, 0.55 + 0.45 * g2);
        c.fillText(WL[k][0], wx + 47, wy + 25);
        c.save();
        c.globalCompositeOperation = 'lighter';
        blob(c, wx + 47, wy + 20, 52, col2, 0.28 * g2);
        c.restore();
      } else {
        c.fillStyle = 'rgba(120,140,165,0.14)';
        c.fillText(WL[k][0], wx + 47, wy + 25);
      }
    }
    c.textAlign = 'left';
  })();

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
      /* vertical tape down the right bezel edge: raw data crawling
         even when nothing else on the panel changes — this is what
         keeps the screen alive in the corner of the eye */
      const sc2 = (tt * 30) % 14, base2 = Math.floor((tt * 30) / 14);
      for (let i = 0; i < 18; i++) {
        const py2 = my + 6 + i * 14 - sc2;
        if (py2 < my + 6 || py2 > my + mh - 6) continue;
        const maj2 = (((base2 + i) % 4) + 4) % 4 === 0;
        c.fillStyle = rgba(gr, maj2 ? 0.7 : 0.35);
        c.fillRect(mx + (maj2 ? 312 : 318), py2, maj2 ? 14 : 8, maj2 ? 2 : 1);
      }
      c.beginPath();
      c.moveTo(mx + 310, my + mh / 2);
      c.lineTo(mx + 320, my + mh / 2 - 6);
      c.lineTo(mx + 320, my + mh / 2 + 6);
      c.closePath();
      c.fillStyle = rgba(gr, 0.85); c.fill();
      /* heading tape inside the nav box, sliding under a fixed lubber
         mark — a second, slower crawl so the two tapes never sync up */
      const sc3 = (tt * 12) % 10, base3 = Math.floor((tt * 12) / 10);
      c.fillStyle = rgba(gr, 0.5);
      for (let i = 0; i < 11; i++) {
        const px2 = mx + 222 + i * 10 - sc3;
        if (px2 < mx + 222 || px2 > mx + 312) continue;
        const maj3 = (((base3 + i) % 3) + 3) % 3 === 0;
        c.fillRect(px2, my + 28, 1.4, maj3 ? 7 : 4);
      }
      c.fillStyle = rgba(gr, 0.9);
      c.fillRect(mx + 265, my + 24, 2, 4);
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
      /* contacts: painted when the beam crosses them, then decaying —
         phosphor lag is what says "sensor", not "clock face" */
      for (let i = 0; i < 4; i++) {
        const ca = hash(i * 13.7 + 4.1) * TAU;
        const cr = 12 + hash(i * 29.3 + 8.6) * 30;
        let lag = sw - ca; lag = ((lag % TAU) + TAU) % TAU;
        const ff = Math.max(0, 1 - lag / 2.4);
        if (ff > 0.02) {
          disc(c, Math.cos(ca) * cr, Math.sin(ca) * cr, 2.2, rgba(gr, 0.9 * ff));
          blob(c, Math.cos(ca) * cr, Math.sin(ca) * cr, 8, gr, 0.5 * ff);
        }
      }
      c.globalAlpha = lit;   /* blob() resets alpha to 1; re-arm it */
      c.restore();
      /* status strip along the bottom: a BIT progress row while the
         avionics come up, then two tiny latched cautions blinking out
         of phase — small enough to ignore, alive enough to matter */
      if (boot < 0.999) {
        for (let i = 0; i < 8; i++) {
          c.fillStyle = rgba(gr, boot * 9 > i + 0.5 ? 0.75 : 0.18);
          c.fillRect(mx + 12 + i * 13, my + mh - 16, 9, 5);
        }
      } else {
        const wk = Math.floor(tt * 1.3) & 1;
        c.font = '9px "Courier New",monospace';
        c.strokeStyle = rgba(AM, 0.55); c.lineWidth = 1;
        c.strokeRect(mx + 10.5, my + mh - 20.5, 40, 12);
        c.fillStyle = rgba(AM, wk ? 0.9 : 0.3);
        c.fillText('FUEL', mx + 15, my + mh - 11);
        c.strokeStyle = rgba(gr, 0.45);
        c.strokeRect(mx + 56.5, my + mh - 20.5, 40, 12);
        c.fillStyle = rgba(gr, wk ? 0.35 : 0.85);
        c.fillText('LNK', mx + 66, my + mh - 11);
      }
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
