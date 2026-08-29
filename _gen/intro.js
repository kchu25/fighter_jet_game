/* ==================================================================
   CINE — skippable cinematic intro sequence (2D vector, procedural)
   Scenes: 1 rocket launch + ambush, 2 the signal, 3 the pilot,
           4 catapult launch (first person), 5 mass launch,
           6 encounter -> hand-off to 3D gameplay.
   ================================================================== */
const CINE = (function () {
  'use strict';

  const VW = 1600, VH = 900;

  /* ---- scene boundaries (absolute seconds) ---- */
  const T1 = 12.8;              // 0    .. 12.8  incident
  const T2 = T1 + 2.5;          // 12.8 .. 15.3  the signal (quiet alert)
  const T3 = T2 + 4.5;          // 15.3 .. 19.8  the pilot
  const T4 = T3 + 3.2;          // 19.8 .. 23.0  catapult launch, first person
  const T5 = T4 + 4.4;          // 23.0 .. 27.4  mass launch
  const T6 = T5 + 5.0;          // 27.4 .. 32.4  encounter
  const HANDOFF = T6 - 0.62;    // gameplay starts under the fading canvas

  let cv = null, c = null, W = 0, H = 0, dpr = 1, sc = 1, ox = 0, oy = 0;
  let raf = 0, t = 0, last = 0;
  let phase = 'idle';           // idle | attract | play | out
  let outT = 0, outMode = '';
  let cbEnd = null, cbSkip = null, ended = false;
  let shake = 0, flash = 0, flashCol = [255, 255, 255];
  let rumbleH = null, sirenH = null;
  const fired = {};             // one-shot event latches

  /* ------------------------------------------------------------ util */
  const C = {
    white: [255, 255, 255], ice: [196, 245, 255], cyan: [58, 224, 255],
    blue: [70, 140, 255], mag: [255, 60, 240], violet: [176, 84, 255],
    red: [255, 44, 72], orange: [255, 150, 52], amber: [255, 214, 128],
    green: [64, 255, 158], smoke: [122, 124, 140], steel: [176, 190, 206]
  };
  function rgba(k, a) { return 'rgba(' + k[0] + ',' + k[1] + ',' + k[2] + ',' + a + ')'; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sat(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  /* smoothstep ramp between two absolute times */
  function ramp(a, b, x) { const q = sat((x - a) / (b - a || 1e-6)); return q * q * (3 - 2 * q); }
  function pulse(x, hz) { return 0.5 + 0.5 * Math.sin(x * hz * 6.2832); }

  function once(key, when, fn) { if (!fired[key] && t >= when) { fired[key] = 1; fn(); } }
  function sfx(name, arg) {
    try {
      const A = window.AUDIO;
      if (A && typeof A[name] === 'function') return A[name](arg);
    } catch (e) { }
    return null;
  }

  /* cached radial-glow sprites, keyed by colour (avoids per-particle gradients) */
  const sprites = {};
  function glow(k) {
    const key = k[0] + ',' + k[1] + ',' + k[2];
    let s = sprites[key];
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    const x = s.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + key + ',1)');
    g.addColorStop(0.32, 'rgba(' + key + ',0.55)');
    g.addColorStop(1, 'rgba(' + key + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    sprites[key] = s; return s;
  }

  function txt(s, x, y, size, col, sp, align, weight) {
    c.font = (weight ? weight + ' ' : '') + size + 'px "Courier New",monospace';
    let total = 0, i;
    for (i = 0; i < s.length; i++) total += c.measureText(s[i]).width + sp;
    total -= sp;
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    c.fillStyle = col;
    for (i = 0; i < s.length; i++) { c.fillText(s[i], px, y); px += c.measureText(s[i]).width + sp; }
    return total;
  }

  /* ------------------------------------------------------- particles */
  const parts = [];
  function part(x, y, vx, vy, life, r, col, o) {
    if (parts.length > 1400) parts.shift();
    o = o || {};
    parts.push({
      x: x, y: y, vx: vx, vy: vy, l: life, L: life, r: r, c: col,
      g: o.g || 0, d: o.d == null ? 0.9 : o.d, gr: o.gr || 0,
      add: o.add !== false, sq: !!o.sq, rot: o.rot || 0, vr: o.vr || 0, a: o.a == null ? 1 : o.a
    });
  }
  function stepParts(dt, dcam) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.l -= dt;
      if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt + (dcam || 0);
      p.vy += p.g * dt;
      const dd = Math.pow(p.d, dt * 60);
      p.vx *= dd; p.vy *= dd;
      p.r += p.gr * dt; p.rot += p.vr * dt;
      if (p.r < 0.4) p.r = 0.4;
    }
  }
  function drawParts(filterAdd) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (filterAdd !== undefined && p.add !== filterAdd) continue;
      const a = sat(p.l / p.L) * p.a;
      c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      c.globalAlpha = p.add ? a : a * 0.62;
      if (p.sq) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = rgba(p.c, 1); c.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        c.restore();
      } else {
        c.drawImage(glow(p.c), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
  function burst(x, y, n, spd, col, life, r, o) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), s = rnd(spd * 0.25, spd);
      part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * 0.45, life), rnd(r * 0.5, r), col, o);
    }
  }

  /* --------------------------------------------------------- backdrop */
  function starField(seed, n, cam, alpha) {
    let s = seed;
    for (let i = 0; i < n; i++) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const x = (s / 0x7fffffff) * VW;
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const y0 = (s / 0x7fffffff) * VH * 1.6 - VH * 0.3;
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const d = 0.3 + (s / 0x7fffffff) * 0.7;
      let y = y0 + cam * d * 0.05;
      y = ((y % (VH * 1.6)) + VH * 1.6) % (VH * 1.6) - VH * 0.3;
      const a = alpha * d * (0.5 + 0.5 * Math.sin(t * 2.4 + i));
      if (a <= 0.02) continue;
      c.fillStyle = rgba(C.white, a);
      c.fillRect(x, y, d > 0.85 ? 2 : 1, d > 0.85 ? 2 : 1);
    }
  }

  function scanlines(a) {
    c.globalAlpha = a; c.fillStyle = '#000';
    for (let y = 0; y < VH; y += 3) c.fillRect(0, y, VW, 1);
    c.globalAlpha = 1;
  }
  function vignette(a) {
    const g = c.createRadialGradient(VW / 2, VH / 2, VH * 0.28, VW / 2, VH / 2, VH * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  }

  function art() { return window.CINE_ART || null; }

  /* ================================================================
     SCENE 1 — the inciting incident, in three movements:
       1   0.0 ..  3.2   the rocket goes up.  Nothing else happens.
       2   3.2 ..  7.0   something is out there.  You never see it whole.
       3   8.3 .. 12.8   you see what it came off.
     ================================================================ */
  const IGN = 0.95, LIFT = 1.85;
  const FIRE = 6.58, BOOM = 7.02;
  const HUGE = 8.32;            /* the prow starts crossing the right edge */
  const HUGE_V = 556;           /* px/s of hull dragged past the lens */
  const PAD_Y = 605, GND_Y = 700;
  /* where the unseen things are when they discharge.  Never drawn lit. */
  const STRIKE = [[1286, 178], [252, 250], [828, 92]];
  let camAlt = 0, camPrev = 0, rkX = 800, rkY = PAD_Y, rkRot = 0;

  /* ---------------------------------------------------------------
     The small craft.  A path, and only ever a path: either filled with
     something darker than the sky it is standing in front of, or one
     hairline of its leading edge catching light for a few frames.  It
     is never lit enough to be read as a machine.
     --------------------------------------------------------------- */
  const DART = [0, -30, 4, -11, 15, -6, 33, 12, 24, 16, 8, 9, 5, 20, 11, 27,
    0, 24, -11, 27, -5, 20, -8, 9, -24, 16, -33, 12, -15, -6, -4, -11];
  function dartPt(i, x, y, s, co, si) {
    const px = DART[i * 2] * s, py = DART[i * 2 + 1] * s;
    return [x + px * co - py * si, y + px * si + py * co];
  }
  function dartDark(x, y, s, rot, a) {
    const co = Math.cos(rot), si = Math.sin(rot);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const p = dartPt(i, x, y, s, co, si);
      if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]);
    }
    c.closePath();
    c.fillStyle = 'rgba(0,0,3,' + (0.92 * a).toFixed(3) + ')';
    c.fill();
    c.strokeStyle = 'rgba(104,132,180,' + (0.085 * a).toFixed(3) + ')';
    c.lineWidth = 1; c.stroke();
  }
  /* a few frames of light down the starboard leading edge, and nothing else */
  function dartEdge(x, y, s, rot, a, col) {
    if (a <= 0.01) return;
    const co = Math.cos(rot), si = Math.sin(rot);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.strokeStyle = rgba(col || C.ice, sat(a));
    c.lineWidth = Math.max(1, 1.5 * s);
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = dartPt(i, x, y, s, co, si);
      if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]);
    }
    c.stroke();
    c.restore();
  }

  /* the curve of the world, far below — a scale reference, and something
     for the dark shapes (and later the shadow) to bite into */
  function planetLimb(a) {
    if (a <= 0.004) return;
    const R = 5400, cx = 690, cy = 764 + R;
    const A0 = Math.PI * 1.42, A1 = Math.PI * 1.58;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = '#02030a';
    c.beginPath(); c.arc(cx, cy, R, A0, A1);
    c.lineTo(VW + 220, VH + 220); c.lineTo(-220, VH + 220); c.closePath(); c.fill();
    /* sparse settlement light along the terminator: this is a planet */
    c.globalCompositeOperation = 'lighter';
    let s = 7717;
    for (let i = 0; i < 46; i++) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const fx = (s / 0x7fffffff);
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const fy = (s / 0x7fffffff);
      const x = -60 + fx * (VW + 120);
      const yy = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx))) + 6 + fy * 92;
      c.globalAlpha = a * (0.10 + 0.32 * fy) * (0.55 + 0.45 * Math.sin(t * 1.7 + i));
      c.fillStyle = rgba(C.amber, 1);
      c.fillRect(x, yy, 1.6, 1.6);
    }
    /* airglow */
    c.globalAlpha = a * 0.5;
    c.lineWidth = 34; c.strokeStyle = 'rgba(46,92,190,0.10)';
    c.beginPath(); c.arc(cx, cy, R + 22, A0, A1); c.stroke();
    c.lineWidth = 5; c.strokeStyle = 'rgba(150,206,255,0.30)';
    c.beginPath(); c.arc(cx, cy, R + 3, A0, A1); c.stroke();
    c.restore();
  }

  /* ---- MOVEMENT 2 -------------------------------------------------
     Six looks, none of them clean.  Everything here is drawn on top of
     the rocket and its exhaust, because whatever it is, it is between
     the lens and the launch.
     ----------------------------------------------------------------- */
  function movement2(u) {
    let q;

    /* 3.22 — a shape crosses the top of frame.  Small, high, almost unlit:
       one flicker off a wing and then nothing. */
    q = (u - 3.22) / 0.66;
    if (q > 0 && q < 1) {
      const a = Math.min(1, Math.sin(q * Math.PI) * 2.6);
      const x = 1512 - q * 430, y = 150 + q * 52;
      dartDark(x, y, 0.78, 2.05, a);
      if (q > 0.30 && q < 0.42)
        dartEdge(x, y, 0.78, 2.05, (1 - Math.abs(q - 0.36) / 0.06) * 0.55);
    }

    /* 4.00 — a wing edge takes the sun.  Two frames.  Gone. */
    q = (u - 4.00) / 0.34;
    if (q > 0 && q < 1) {
      const x = 388 + q * 104, y = 306 - q * 40;
      const a = Math.pow(1 - q, 2.4);
      dartDark(x, y, 0.94, -1.12, Math.min(1, Math.sin(q * Math.PI) * 2.2) * 0.7);
      dartEdge(x, y, 0.94, -1.12, a * 0.95);
    }

    /* 4.50 — a shadow crosses the stack.  There is nothing above it. */
    q = (u - 4.50) / 0.94;
    if (q > 0 && q < 1) {
      const sx = 1460 - q * 1560, sy = 232 + q * 130;
      const a = Math.sin(q * Math.PI);
      c.save();
      c.globalAlpha = a * 0.92;
      c.drawImage(glow([0, 0, 3]), sx - 600, sy - 220, 1200, 440);
      c.restore();
    }

    /* 5.02 — something far larger passes the bottom corner, three
       quarters of it outside the frame. */
    q = (u - 5.02) / 0.78;
    if (q > 0 && q < 1) {
      const a = Math.min(1, Math.sin(q * Math.PI) * 2.1);
      const bx = -300 + q * 760, by = 828 - q * 104;
      dartDark(bx, by, 4.7, 1.44 - q * 0.12, a);
      if (q > 0.40 && q < 0.62)
        dartEdge(bx, by, 4.7, 1.44 - q * 0.12, (1 - Math.abs(q - 0.51) / 0.11) * 0.42);
    }

    /* 5.50 — three of them, echelon, across the top.  One glints. */
    q = (u - 5.50) / 0.80;
    if (q > 0 && q < 1) {
      const a = Math.min(1, Math.sin(q * Math.PI) * 2.4);
      for (let i = 0; i < 3; i++) {
        const p = q - i * 0.12; if (p < 0) continue;
        const x = 1700 - p * 1220 - i * 128, y = 146 + i * 64 + p * 50;
        const s = 0.74 + i * 0.07;
        dartDark(x, y, s, 1.98, a);
        /* the sky is at its blackest up here: an occluder alone reads as
           nothing, so each one takes the sun briefly, in turn. */
        const gq = 0.30 + i * 0.17;
        if (q > gq - 0.07 && q < gq + 0.07)
          dartEdge(x, y, s, 1.98, (1 - Math.abs(q - gq) / 0.07) * (0.88 - i * 0.14));
      }
    }

    /* 6.06 — they are around the stack now.  Three lights, one blink
       each, at ranges you have no way of judging. */
    for (let i = 0; i < STRIKE.length; i++) {
      const p = (u - (6.04 + i * 0.14)) / 0.32;
      if (p <= 0 || p >= 1) continue;
      const a = Math.sin(p * Math.PI);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = a * 0.5;
      c.drawImage(glow(C.violet), STRIKE[i][0] - 56, STRIKE[i][1] - 56, 112, 112);
      c.globalAlpha = a;
      c.fillStyle = rgba(C.mag, 1);
      c.fillRect(STRIKE[i][0] - 1.5, STRIKE[i][1] - 1.5, 3, 3);
      c.restore();
    }

    /* the discharge lights them, badly, for a fifth of a second */
    if (u >= FIRE && u < FIRE + 0.22) {
      const a = 1 - (u - FIRE) / 0.22;
      const rots = [2.34, 0.84, 1.62];
      for (let i = 0; i < STRIKE.length; i++) {
        dartDark(STRIKE[i][0], STRIKE[i][1], 0.92, rots[i], 1);
        dartEdge(STRIKE[i][0], STRIKE[i][1], 0.92, rots[i], a * 0.85, C.mag);
      }
    }
  }

  /* ---- MOVEMENT 3 -------------------------------------------------
     The belly of something that does not fit in the frame.  The whole
     effect is occlusion and duration: an edge arrives and simply keeps
     arriving, and the sky goes out behind it.
     ----------------------------------------------------------------- */
  function bellyY(d) {
    if (d <= 0) return -560;
    return -330 + 1220 * (1 - Math.exp(-d / 660));
  }
  function colossus(u) {
    const q = u - HUGE;
    if (q <= 0) return;
    const px = VW + 210 - q * HUGE_V;      /* the prow */

    /* its shadow runs ahead of the hull and never comes back */
    const sg = c.createLinearGradient(px - 520, 0, px + 660, 0);
    sg.addColorStop(0, 'rgba(0,0,2,0)');
    sg.addColorStop(1, 'rgba(0,0,2,0.64)');
    c.fillStyle = sg; c.fillRect(0, 0, VW, VH);
    /* stars die just ahead of the edge, before the edge itself shows */
    c.save(); c.globalAlpha = 0.5;
    c.drawImage(glow([0, 0, 3]), px - 700, -640, 1400, 1400);
    c.restore();

    /* ---- the hull ---- */
    c.beginPath();
    c.moveTo(-140, -560);
    for (let x = -140; x <= VW + 140; x += 14) c.lineTo(x, Math.max(-560, bellyY(x - px)));
    c.lineTo(VW + 140, -560);
    c.closePath();
    /* the hull is not black — it is a dark surface, and it has to read as
       one or the size of it means nothing */
    const hg = c.createLinearGradient(0, -340, 0, 960);
    hg.addColorStop(0, '#191d2a');
    hg.addColorStop(0.46, '#141824');
    hg.addColorStop(1, '#0e111b');
    c.fillStyle = hg;
    c.save();
    c.fill();
    c.clip();
    /* structure, kept coarse — ribs 430px apart, so the eye has something
       to measure the length against */
    c.strokeStyle = 'rgba(112,146,200,0.10)'; c.lineWidth = 3;
    for (let k = 1; k < 11; k++) {
      const rx = px + k * 430;
      c.beginPath(); c.moveTo(rx, -560); c.lineTo(rx - 190, 1020); c.stroke();
    }
    /* three trenches running back down the belly, parallel to the edge */
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let x = -140; x <= VW + 140; x += 22) {
        const y = bellyY(x - px) - (74 + k * 168);
        if (x === -140) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = 'rgba(122,156,215,' + (0.16 - k * 0.045) + ')';
      c.lineWidth = 30 - k * 9; c.stroke();
      c.strokeStyle = 'rgba(0,0,4,0.5)'; c.lineWidth = 2; c.stroke();
    }
    c.restore();

    /* ---- the light on it: one bloomed hairline down the leading edge ---- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.beginPath();
    let started = false;
    for (let x = Math.max(-140, px); x <= VW + 140; x += 10) {
      const y = bellyY(x - px);
      if (y < -560) continue;
      if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
    }
    if (started) {
      const mk = function (a0, a1, a2) {
        const rg = c.createLinearGradient(px, 0, px + 1250, 0);
        rg.addColorStop(0, 'rgba(206,228,255,' + a0 + ')');
        rg.addColorStop(0.26, 'rgba(158,188,246,' + a1 + ')');
        rg.addColorStop(0.66, 'rgba(126,158,228,' + a2 + ')');
        rg.addColorStop(1, 'rgba(120,150,220,0)');
        return rg;
      };
      c.strokeStyle = mk(0.20, 0.11, 0.05); c.lineWidth = 22; c.stroke();
      c.strokeStyle = mk(0.55, 0.28, 0.13); c.lineWidth = 6; c.stroke();
      c.strokeStyle = mk(0.95, 0.52, 0.24); c.lineWidth = 2.2; c.stroke();
    }
    /* running lights, 470px apart, slow */
    for (let k = 0; k < 12; k++) {
      const lx = px + 250 + k * 470;
      if (lx < -160 || lx > VW + 160) continue;
      const ly = bellyY(lx - px) - 24;
      if (ly < -180) continue;
      const bl = 0.42 + 0.36 * Math.sin(t * 0.85 + k * 1.7);
      const col = k % 3 ? C.amber : C.violet;
      c.globalAlpha = bl * 0.7;
      c.drawImage(glow(col), lx - 70, ly - 70, 140, 140);
      c.globalAlpha = bl;
      c.fillStyle = rgba(col, 1);
      c.fillRect(lx - 2.5, ly - 2.5, 5, 5);
    }
    c.globalAlpha = 1;
    c.restore();

    /* ---- things that came off it, for scale ---- */
    for (let k = 0; k < 4; k++) {
      const ex = px + 470 + k * 300 - q * 132;
      if (ex < -60 || ex > VW + 60) continue;
      const ey = bellyY(ex - px) + 96 + k * 52;
      if (ey > VH + 40 || ey < -40) continue;
      dartDark(ex, ey, 0.28, 1.92, 0.85);
      if ((k + Math.floor(t * 1.7)) % 5 === 0) dartEdge(ex, ey, 0.28, 1.92, 0.55);
    }
  }

  function scene1(u, dt) {
    /* --- flight profile --- */
    let alt = 0;
    if (u > LIFT) { const q = u - LIFT; alt = 26 * q * q * q + 42 * q * q; }
    if (u > BOOM) alt = 26 * Math.pow(BOOM - LIFT, 3) + 42 * Math.pow(BOOM - LIFT, 2);
    camPrev = camAlt;
    camAlt = Math.max(0, alt - 300);
    const dcam = camAlt - camPrev;
    const space = sat(camAlt / 1500);
    const dead = u > BOOM;

    rkX = 800 + ramp(2.9, BOOM, u) * 96;
    rkY = PAD_Y - Math.min(alt, 300);
    rkRot = ramp(2.5, BOOM, u) * 0.26;

    /* --- sky --- */
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#01020a');
    g.addColorStop(0.55, space > 0.5 ? '#02030c' : '#070c22');
    g.addColorStop(1, space > 0.8 ? '#03040e' : ('rgb(' + Math.round(18 + 40 * (1 - space)) + ',' +
      Math.round(10 + 22 * (1 - space)) + ',' + Math.round(38 + 30 * (1 - space)) + ')'));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    starField(9173, 300, camAlt, 0.25 + 0.65 * space);
    planetLimb(ramp(0.30, 0.72, space));

    /* --- ground complex (only while it is on screen) --- */
    const gy = GND_Y + camAlt;
    if (gy < VH + 260) {
      const hz = c.createLinearGradient(0, gy - 200, 0, gy);
      hz.addColorStop(0, 'rgba(0,0,0,0)');
      hz.addColorStop(1, 'rgba(46,16,70,0.55)');
      c.fillStyle = hz; c.fillRect(0, gy - 200, VW, 200);
      c.fillStyle = '#05060e'; c.fillRect(0, gy, VW, VH);
      c.strokeStyle = rgba(C.violet, 0.32); c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, gy); c.lineTo(VW, gy); c.stroke();
      /* gantry + service towers */
      c.fillStyle = '#0a0d1a';
      c.fillRect(rkX + 46, gy - 250, 26, 250);
      c.fillRect(rkX - 96, gy - 190, 18, 190);
      for (let i = 0; i < 6; i++) c.fillRect(rkX + 30, gy - 236 + i * 40, 46, 7);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const lx = 120 + i * 220;
        c.drawImage(glow(C.amber), lx - 26, gy - 34, 52, 52);
      }
      c.globalCompositeOperation = 'source-over';
      /* pad hardware */
      c.fillStyle = '#0c1120'; c.fillRect(rkX - 74, gy - 26, 148, 26);
    }

    /* --- ignition --- */
    once('ign', IGN, function () {
      shake = 9; rumbleH = sfx('rumble', 0.35);
      sfx('setIntensity', 0.28);
    });
    const thr = u < IGN ? 0 : sat((u - IGN) / 0.75);
    if (rumbleH && rumbleH.set) rumbleH.set(dead ? 0 : 0.35 + 0.65 * thr);
    if (u > IGN && !dead) {
      shake = Math.max(shake, u < LIFT ? 5 + 6 * Math.sin(u * 42) : 3.2);
      /* exhaust + ground smoke */
      const nz = rkY + 96;
      part(rkX + rnd(-7, 7), nz + rnd(0, 18), rnd(-28, 28), rnd(150, 320),
        rnd(0.3, 0.6), rnd(7, 15), Math.random() < 0.4 ? C.white : C.orange, { gr: 16, d: 0.93 });
      /* the pad billow only exists while the stack is still near the tower */
      if (gy < VH + 200 && u < LIFT + 1.6)
        part(rkX + rnd(-52, 52), gy - rnd(0, 24), rnd(-330, 330), rnd(-50, 20),
          rnd(1.0, 1.9), rnd(14, 32), C.smoke, { add: false, gr: 30, d: 0.955, a: 0.5 });
    }

    /* smoke sits behind the vehicle; the additive fire goes in front later */
    stepParts(dt, dcam);
    drawParts(false);

    /* --- the rocket --- */
    const A = art();
    if (!dead && A) A.rocket(c, rkX, rkY, 0.95, rkRot, thr, t);

    /* --- the strike (drawn later, over the exhaust) --- */
    once('sight', 3.22, function () { sfx('setIntensity', 0.34); });
    once('fire', FIRE, function () {
      sfx('plasma'); shake = Math.max(shake, 13); flash = 0.24; flashCol = C.violet;
    });
    if (u > FIRE && u < BOOM + 0.14 && Math.random() < 0.6)
      burst(rkX, rkY - 20, 3, 420, C.amber, 0.45, 13, { g: 200 });

    /* --- destruction --- */
    once('boom', BOOM, function () {
      sfx('explode', 2.3); shake = 40; flash = 1; flashCol = C.white;
      sfx('setIntensity', 0.5);
      if (rumbleH && rumbleH.stop) { rumbleH.stop(0.35); rumbleH = null; }
      burst(rkX, rkY - 10, 90, 900, C.white, 0.7, 40, { g: 90, d: 0.9 });
      /* short lives, and enough speed that they disperse instead of piling
         into one bright ball: the sky has to be black again by 8.0 */
      burst(rkX, rkY - 10, 110, 700, C.orange, 0.80, 46, { g: 130, d: 0.93, gr: 20 });
      burst(rkX, rkY - 10, 60, 520, C.amber, 1.05, 44, { g: 60, d: 0.95, gr: 24 });
      burst(rkX, rkY - 10, 46, 300, C.smoke, 2.7, 70, { add: false, g: -20, d: 0.96, gr: 46, a: 0.55 });
      for (let i = 0; i < 34; i++) {
        const a2 = rnd(0, 6.2832), sp = rnd(220, 820);
        part(rkX, rkY - 10, Math.cos(a2) * sp, Math.sin(a2) * sp, rnd(1.6, 3.2),
          rnd(3, 11), i % 3 ? C.steel : C.amber, { sq: true, g: 320, d: 0.995, vr: rnd(-9, 9) });
      }
    });
    if (dead) {
      const q = u - BOOM;
      /* fireball + shockwave */
      c.globalCompositeOperation = 'lighter';
      /* it has to be gone before the silence: the reveal needs a dark sky */
      const fb = 230 * Math.exp(-q * 2.5) + 26;
      c.globalAlpha = sat(1.05 - q * 1.15) * sat(1.05 - q * 1.15);
      c.drawImage(glow(C.orange), rkX - fb, rkY - 10 - fb, fb * 2, fb * 2);
      c.drawImage(glow(C.white), rkX - fb * 0.4, rkY - 10 - fb * 0.4, fb * 0.8, fb * 0.8);
      c.globalAlpha = 1;
      if (q < 0.85) {
        const rq = q / 0.85;
        c.strokeStyle = rgba(C.amber, (1 - rq) * (1 - rq) * 0.55); c.lineWidth = 16 * (1 - rq) + 1;
        c.beginPath(); c.arc(rkX, rkY - 10, 60 + 900 * rq, 0, 6.2832); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }

    drawParts(true);

    /* ---- MOVEMENT 2: whatever it is, it is in front of all of that ---- */
    if (u > 3.1 && u < FIRE + 0.24) movement2(u);

    /* the lances, over everything, including the exhaust they cut through */
    if (u > FIRE && u < BOOM + 0.14) {
      const life = sat((u - FIRE) / 0.07) * (1 - ramp(BOOM, BOOM + 0.14, u));
      c.save();
      c.globalCompositeOperation = 'lighter';
      const passes = [[28, C.violet, 0.20], [11, C.mag, 0.5], [3.2, C.white, 1]];
      for (let i = 0; i < STRIKE.length; i++) {
        const jitter = Math.sin(t * 88 + i * 2.1) * 2.6;
        for (let p = 0; p < 3; p++) {
          c.strokeStyle = rgba(passes[p][1], passes[p][2] * life);
          c.lineWidth = passes[p][0] * (0.85 + 0.15 * Math.sin(t * 60 + p));
          c.beginPath(); c.moveTo(STRIKE[i][0], STRIKE[i][1]);
          c.lineTo(rkX + jitter, rkY - 20 + jitter); c.stroke();
        }
        c.globalAlpha = life * 0.7;
        c.drawImage(glow(C.mag), STRIKE[i][0] - 66, STRIKE[i][1] - 66, 132, 132);
        c.globalAlpha = 1;
      }
      const bl = 100 + 34 * Math.sin(t * 40);
      c.drawImage(glow(C.white), rkX - bl / 2, rkY - 20 - bl / 2, bl, bl);
      c.restore();
    }

    /* ---- MOVEMENT 3: the stillness, then the thing itself ---- */
    once('quiet', BOOM + 0.30, function () { sfx('setIntensity', 0.16); });
    once('huge', HUGE - 0.85, function () {
      rumbleH = sfx('rumble', 0.10); sfx('setIntensity', 0.30);
    });
    once('hugeon', HUGE + 1.30, function () {
      sfx('thud'); shake = Math.max(shake, 8); sfx('setIntensity', 0.46);
    });
    once('hugeoff', T1 - 0.40, function () {
      if (rumbleH && rumbleH.stop) { rumbleH.stop(0.4); rumbleH = null; }
    });
    if (u > HUGE - 0.85) {
      const adv = ramp(HUGE - 0.85, HUGE + 3.2, u);
      if (rumbleH && rumbleH.set) rumbleH.set(0.10 + 0.85 * adv);
      shake = Math.max(shake, 1.2 + 3.4 * adv * (0.6 + 0.4 * Math.sin(t * 7.3)));
    }
    colossus(u);

    /* slate */
    if (u < 3.0) {
      const a = ramp(0.3, 0.8, u) * (1 - ramp(2.3, 3.0, u));
      txt('CAPE ORION  //  04:17 LOCAL', 96, 108, 22, rgba(C.green, a * 0.9), 5);
      txt('MERIDIAN  HEAVY  —  ORBITAL DEFENCE PAYLOAD', 96, 144, 17, rgba(C.green, a * 0.6), 4);
    }
    /* the report of the loss, alone in the frame — and swallowed by what
       arrives next */
    if (u > BOOM + 0.55 && u < HUGE + 0.9) {
      const a = ramp(BOOM + 0.55, BOOM + 1.0, u) * (1 - ramp(HUGE + 0.15, HUGE + 0.9, u));
      txt('TELEMETRY LOST', VW / 2, 806, 30, rgba(C.red, a * (0.5 + 0.5 * pulse(t, 2.4))), 12, 'center');
    }
    vignette(0.52 + 0.16 * space - 0.30 * ramp(HUGE, HUGE + 1.4, u));
    /* fade to black into the alert */
    const fo = ramp(T1 - 0.58, T1, u);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 2 — the signal.  Deliberately quiet: a dark room, a relay
     terminal typing two flat sentences, a siren somewhere else in the
     building.  No slam-ins, no klaxon in your face.
     ================================================================ */
  const AL_X = 292, AL_Y = 424;              /* the readout's baseline block */
  const ALERT = [
    { s: 'ORBITAL DEFENCE PAYLOAD LOST 04:19 LOCAL.', at: 0.42, cps: 62 },
    { s: 'UNKNOWN CONTACTS INBOUND. INTERCEPTORS LAUNCH.', at: 1.32, cps: 66 }
  ];

  function scene2(u, dt) {
    /* the siren is two rooms away and it does not stay long */
    once('siren', T1 + 0.62, function () { sirenH = sfx('sirenLoop'); sfx('setIntensity', 0.36); });
    once('sirenoff', T2 - 0.95, function () { if (sirenH && sirenH.stop) { sirenH.stop(); sirenH = null; } });
    once('alhead', T1 + 0.16, function () { sfx('thud'); });

    /* --- the room: black, with the faintest red breathing in it --- */
    const bre = 0.5 + 0.5 * Math.sin(u * 1.55);
    c.fillStyle = 'rgb(' + Math.round(5 + 5 * bre) + ',' + Math.round(4 + 2 * bre) + ',' +
      Math.round(7 + 3 * bre) + ')';
    c.fillRect(0, 0, VW, VH);

    /* a single rotating-beacon wash creeping across the far wall */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const bx = 260 + 1180 * (0.5 + 0.5 * Math.sin(u * 0.78 - 1.2));
    c.globalAlpha = 0.055 + 0.045 * bre;
    c.drawImage(glow(C.red), bx - 620, -260, 1240, 1240);
    c.globalAlpha = 1;
    c.restore();

    const on = ramp(0.06, 0.42, u);          /* the panel coming up */

    /* --- header line + hairline rules --- */
    c.save();
    c.globalAlpha = on;
    txt('SECTOR 7 COMMAND', AL_X, AL_Y - 116, 17, rgba(C.steel, 0.42), 6);
    txt('PRIORITY TRAFFIC / RELAY 04', VW - AL_X, AL_Y - 116, 17, rgba(C.steel, 0.30), 6, 'right');
    c.fillStyle = rgba(C.red, 0.30 + 0.14 * bre);
    c.fillRect(AL_X, AL_Y - 100, (VW - AL_X * 2) * on, 1);
    c.fillStyle = rgba(C.steel, 0.13);
    c.fillRect(AL_X, AL_Y + 104, (VW - AL_X * 2) * on, 1);
    c.restore();

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
      c.fillStyle = rgba(C.ice, 0.55);
      c.fillRect(cur[0], cur[1] - 21, 14, 24);
    }

    /* --- footer: an authority line, small and flat --- */
    c.save();
    c.globalAlpha = ramp(1.9, 2.25, u);
    txt('AUTHENTICATED — NORTHERN COMMAND', AL_X, AL_Y + 146, 16, rgba(C.steel, 0.34), 6);
    txt('ACKNOWLEDGE', VW - AL_X, AL_Y + 146, 16, rgba(C.red, 0.40 + 0.22 * bre), 6, 'right');
    c.restore();

    stepParts(dt, 0); drawParts();
    scanlines(0.16);
    vignette(0.80);

    /* dip in from scene 1's black, and back out of it */
    const fi = 1 - ramp(0, 0.24, u);
    if (fi > 0) { c.fillStyle = 'rgba(0,0,0,' + fi + ')'; c.fillRect(0, 0, VW, VH); }
    const fo = ramp(T2 - 0.34, T2, u + T1);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 3 — THE PILOT.  Camera is outside the canopy looking in at
     him: helmet, visor, mask, harness, seat, lit warm from the panel
     below and cold from the bay lights streaming past behind.
     ================================================================ */
  const BOOTLINES = [
    'APU .............. ONLINE', 'FLT CTRL ......... NOMINAL',
    'INS ALIGN ........ LOCKED', 'WEAPONS .......... ARMED',
    'O2 SUPPLY ........ 100%', 'CATAPULT ......... CHARGED'
  ];

  /* the pilot sits here in the 1600x900 frame */
  const P3X = 662, P3Y = 434, P3S = 1.18;
  const FX3 = 644, FY3 = 286;              /* focal point: his head */

  function scene3(u, dt) {
    const A = art();
    const spool = ramp(2.9, 4.5, u);         // the jet coming up to power
    const boot = ramp(0.42, 2.90, u);
    const snap = ramp(2.16, 2.32, u);        // the visor coming down
    const sealed = ramp(2.32, 2.92, u);      // HUD blooming across it
    const fade = 1 - ramp(4.16, 4.5, u);

    once('c3rumble', T2 + 0.15, function () {
      rumbleH = sfx('rumble', 0.12); sfx('setIntensity', 0.45);
    });
    if (rumbleH && rumbleH.set) rumbleH.set(0.12 + 0.30 * spool);

    /* ---- camera: slow push-in with a live hand-held drift ---- */
    const inch = ramp(0, 4.4, u);
    const zoom = 1.02 + 0.15 * inch + 0.05 * spool;
    const cdx = Math.sin(u * 0.44 + 1.1) * 15 + Math.sin(u * 1.9) * 2.5 - 34 * inch;
    const cdy = Math.cos(u * 0.31) * 8 + 26 * ramp(2.4, 4.4, u);
    function push(p) {
      c.save();
      const z = 1 + (zoom - 1) * p;
      c.translate(FX3 + cdx * p, FY3 + cdy * p);
      c.scale(z, z);
      c.translate(-FX3, -FY3);
    }

    /* ================= 1. the launch bay, far behind ============ */
    c.fillStyle = '#02030a'; c.fillRect(0, 0, VW, VH);
    push(0.40);
    const bgG = c.createLinearGradient(0, 0, 260, VH);
    bgG.addColorStop(0, '#04050e');
    bgG.addColorStop(0.52, '#0a0a1c');
    bgG.addColorStop(1, '#120823');
    c.fillStyle = bgG; c.fillRect(-300, -300, VW + 600, VH + 600);

    /* pools of haze that the pilot silhouettes against */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.30 * fade;
    c.drawImage(glow(C.violet), 720, 30, 900, 760);
    c.globalAlpha = 0.16 * fade;
    c.drawImage(glow(C.mag), 380, 180, 760, 640);
    c.globalAlpha = 0.20 * fade;
    c.drawImage(glow(C.cyan), 960, 120, 620, 560);
    c.globalAlpha = 1;

    /* ceiling strip lights of the tunnel streaming past */
    const VPX = 1215, VPY = 384;
    const spd = 0.09 + spool * 0.34;
    for (let i = 0; i < 17; i++) {
      const f = (i + (t * spd) % 1) / 17;
      const d = Math.pow(f, 2.25);
      const lx = VPX - d * 2250, ly = VPY - d * 210;
      const lw = 24 + d * 400 + spool * d * 180;
      const a = (0.08 + 0.85 * f) * fade;
      c.fillStyle = rgba(C.ice, a * 0.42);
      c.fillRect(lx - lw, ly, lw, 2.5 + d * 8);
      c.fillStyle = rgba(C.cyan, a * 0.18);
      c.fillRect(lx - lw * 0.72, ly + 7 + d * 9, lw * 0.72, 2 + d * 4);
      if (f > 0.30) {
        c.globalAlpha = a * 0.22;
        c.drawImage(glow(C.ice), lx - lw, ly - 34 - d * 40, lw, 70 + d * 80);
        c.globalAlpha = 1;
      }
      /* deck reflection under them */
      c.fillStyle = rgba(C.amber, a * 0.10);
      c.fillRect(lx - lw * 0.8, VPY + 210 + d * 460, lw * 0.8, 2 + d * 6);
    }
    c.restore();

    /* silhouetted bay structure so the depth has edges */
    c.fillStyle = '#04050c';
    c.fillRect(1360, 60, 74, 700);
    c.fillRect(1300, 300, 180, 26);
    c.fillRect(150, -40, 60, 520);
    for (let i = 0; i < 5; i++) c.fillRect(120, 40 + i * 96, 130, 16);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.5 * fade;
    c.drawImage(glow(C.amber), 1300, 500, 190, 190);
    c.globalAlpha = 0.32 * fade;
    c.drawImage(glow(C.red), 120, 420, 180, 180);
    c.globalAlpha = 1;
    c.restore();
    c.restore();

    /* ================= 2. inside the canopy ===================== */
    push(0.92);
    /* rear canopy bow, arching up behind his shoulder */
    c.beginPath();
    c.moveTo(1104, VH + 40);
    c.quadraticCurveTo(1216, 320, 934, -40);
    c.strokeStyle = '#070a11'; c.lineWidth = 42; c.stroke();
    c.strokeStyle = 'rgba(120,150,190,0.10)'; c.lineWidth = 5; c.stroke();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath();
    c.moveTo(1084, VH + 40);
    c.quadraticCurveTo(1196, 320, 914, -40);
    c.strokeStyle = rgba(C.ice, 0.30 * fade); c.lineWidth = 3; c.stroke();
    c.restore();
    /* the far cockpit wall / rear deck */
    c.fillStyle = 'rgba(4,6,12,0.85)';
    c.beginPath();
    c.moveTo(1120, VH); c.lineTo(1216, 330); c.lineTo(VW, 190);
    c.lineTo(VW, VH); c.closePath(); c.fill();
    c.restore();

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
    if (A) A.pilot(c, P3X, P3Y, P3S, {
      turn: sat(turn), pitch: pitch, visor: sat(visor),
      hud: sealed * (0.82 + 0.18 * pulse(u, 3.1)),
      glow: 0.50 + 0.50 * boot,
      rim: 0.45 + 0.55 * ramp(0.4, 2.7, u) + 0.3 * spool,
      breath: sat(breath), tt: t, alpha: 1
    });
    c.restore();

    once('helm', T2 + 2.24, function () {
      sfx('helmetOn'); shake = Math.max(shake, 5); flash = Math.max(flash, 0.16);
      flashCol = C.ice;
      for (let i = 0; i < 16; i++)
        part(FX3 + rnd(-70, 70), FY3 - 18 + rnd(-16, 16), rnd(-160, 160), rnd(-90, 60),
          rnd(0.25, 0.55), rnd(2, 5), C.ice, { d: 0.9 });
    });
    once('brth', T2 + 2.82, function () { sfx('breath', 3); });

    /* ================= 4. foreground: glass + panel ============== */
    push(1.5);
    /* the instrument coaming across the bottom-left — the key light */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = (0.20 + 0.34 * boot) * fade;
    c.drawImage(glow(C.amber), -180, 470, 1000, 700);
    c.globalAlpha = (0.14 + 0.24 * boot) * fade;
    c.drawImage(glow(C.green), 60, 520, 620, 480);
    c.globalAlpha = 1;
    c.restore();

    c.save();
    c.translate(250, 742);
    c.rotate(-0.115);
    /* bezel */
    c.fillStyle = '#080b12';
    c.fillRect(-300, -128, 620, 300);
    c.fillStyle = '#141a24';
    c.fillRect(-286, -116, 592, 268);
    c.fillStyle = '#04070a';
    c.fillRect(-262, -100, 544, 214);
    /* the MFD itself */
    c.save();
    c.beginPath(); c.rect(-262, -100, 544, 214); c.clip();
    c.fillStyle = 'rgba(10,26,20,0.9)'; c.fillRect(-262, -100, 544, 214);
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
    c.fillStyle = 'rgba(120,255,190,0.05)';
    c.fillRect(-262, -100 + ((t * 190) % 214), 544, 22);
    const scG = c.createLinearGradient(-262, -100, 120, 114);
    scG.addColorStop(0, 'rgba(190,255,225,0.10)');
    scG.addColorStop(0.6, 'rgba(190,255,225,0)');
    c.fillStyle = scG; c.fillRect(-262, -100, 544, 214);
    c.restore();
    /* a row of hard switches below the screen */
    for (let i = 0; i < 8; i++) {
      c.fillStyle = '#0a0e15';
      c.fillRect(-250 + i * 68, 124, 44, 22);
      c.fillStyle = i % 3 === 0 ? rgba(C.amber, 0.55 * boot) : 'rgba(150,180,210,0.14)';
      c.fillRect(-244 + i * 68, 130, 14, 10);
    }
    c.restore();

    /* the canopy rail crossing in front of him */
    c.beginPath();
    c.moveTo(-60, 880);
    c.quadraticCurveTo(700, 646, VW + 60, 300);
    c.strokeStyle = '#05070d'; c.lineWidth = 52; c.stroke();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath();
    c.moveTo(-60, 856);
    c.quadraticCurveTo(700, 622, VW + 60, 276);
    c.strokeStyle = rgba(C.ice, 0.34 * fade); c.lineWidth = 3.5; c.stroke();
    c.beginPath();
    c.moveTo(-60, 852);
    c.quadraticCurveTo(700, 618, VW + 60, 272);
    c.strokeStyle = rgba(C.amber, 0.14 * fade); c.lineWidth = 8; c.stroke();
    c.restore();
    c.restore();

    /* ---- reflections sliding over the canopy glass ---- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = (t * (0.10 + 0.22 * spool) + i * 0.37) % 1;
      const gx = -520 + ph * 2600;
      c.save();
      c.translate(gx, 0);
      c.rotate(0.34);
      const rgG = c.createLinearGradient(-150, 0, 150, 0);
      rgG.addColorStop(0, 'rgba(150,220,255,0)');
      rgG.addColorStop(0.5, 'rgba(180,232,255,' + (0.055 + 0.05 * spool) * fade + ')');
      rgG.addColorStop(1, 'rgba(150,220,255,0)');
      c.fillStyle = rgG;
      c.fillRect(-150, -700, 300, 2200);
      c.restore();
    }
    c.restore();

    /* dust and lint drifting through the light */
    if (Math.random() < 0.10)
      part(rnd(0, VW), rnd(0, VH), rnd(-26, 10), rnd(-16, 16),
        rnd(1.4, 3.0), rnd(0.5, 1.1), Math.random() < 0.4 ? C.amber : C.ice,
        { d: 0.99, a: 0.16 });

    /* ---- engines coming up under him, right before we cut inside ---- */
    if (spool > 0) shake = Math.max(shake, 1.5 + 4.5 * spool * (0.6 + 0.4 * Math.sin(t * 46)));

    stepParts(dt, 0); drawParts();
    scanlines(0.13);
    vignette(0.62 + 0.22 * sealed);

    /* fade from black in, and back to black — we cut behind his eyes */
    const fi = 1 - ramp(0, 0.55, u);
    if (fi > 0) { c.fillStyle = 'rgba(0,0,0,' + fi + ')'; c.fillRect(0, 0, VW, VH); }
    const fo = ramp(4.2, 4.5, u);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 4 — THE CATAPULT.  Straight behind the canopy now.  The
     shuttle tensions, fires, and drags the whole frame down the tunnel
     until the deck runs out and the world opens.  Everything here is
     motion: no panel, no instruments, just the rails going by faster
     than they should.
     ================================================================ */
  const L_SHOT = 0.80;                   /* the catapult releases */
  const L_OUT = 2.55;                   /* the mouth swallows the frame */
  const LVPX = 800, LVPY = 396;         /* vanishing point */

  /* rounded-rect sub-path, used for the canopy aperture */
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function scene4(u, dt) {
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
      if (!rumbleH) rumbleH = sfx('rumble', 0.2);
      sfx('riser', L_SHOT - 0.02);             // lands its impact exactly on the shot
    });
    if (rumbleH && rumbleH.set) rumbleH.set(sat(0.18 + 0.9 * drive));
    once('c4shot', T3 + L_SHOT, function () {
      sfx('thud'); sfx('setIntensity', 0.8);
      shake = Math.max(shake, 34); flash = Math.max(flash, 0.5); flashCol = C.ice;
      burst(LVPX, LVPY, 26, 900, C.ice, 0.5, 7, { d: 0.99 });
    });
    once('c4gasp', T3 + L_SHOT + 0.22, function () { sfx('breath', 2); });
    once('c4out', T3 + L_OUT, function () {
      sfx('jetPass', 0.25); sfx('setIntensity', 0.86);
      shake = Math.max(shake, 15); flash = Math.max(flash, 0.85); flashCol = C.white;
    });

    /* ---------------------------------------------------- world ---- */
    c.fillStyle = '#010206'; c.fillRect(0, 0, VW, VH);

    /* the sky we punch out into, revealed underneath the tunnel */
    if (sky > 0) {
      c.save();
      c.globalAlpha = sky;
      const hz = 512 - 70 * after;
      dawnSky(hz, 0);
      neonGround(hz, t * 3.2, 0.5);
      if (A) A.cloudBank(c, hz - 210, 92, t * 1.4, [120, 40, 130], 0.30);
      c.restore();
    }

    /* ---- the launch tunnel ----
       Each rib is redrawn at the positions it occupied over the last few
       milliseconds; the resulting smear IS the acceleration.  The number
       of ghosts is driven by speed, so the tunnel visibly tears apart. */
    const tun = 1 - sky;
    if (tun > 0.002) {
      c.save();
      c.globalCompositeOperation = 'lighter';
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
          c.strokeStyle = rgba(C.ice, a * 0.55); c.lineWidth = 1 + d * 10;
          c.beginPath();
          c.moveTo(LVPX - hw * 0.84, LVPY - hh);
          c.lineTo(LVPX + hw * 0.84, LVPY - hh); c.stroke();
          /* deck rails */
          c.strokeStyle = rgba(C.amber, a * 0.36); c.lineWidth = 1 + d * 7;
          c.beginPath();
          c.moveTo(LVPX - hw, LVPY + hh);
          c.lineTo(LVPX + hw, LVPY + hh); c.stroke();
          if (!head) continue;
          /* wall ribs either side */
          c.strokeStyle = rgba(C.cyan, a * 0.32); c.lineWidth = 1 + d * 5;
          c.beginPath();
          c.moveTo(LVPX - hw, LVPY - hh * 0.58); c.lineTo(LVPX - hw, LVPY + hh * 0.58); c.stroke();
          c.beginPath();
          c.moveTo(LVPX + hw, LVPY - hh * 0.58); c.lineTo(LVPX + hw, LVPY + hh * 0.58); c.stroke();
          /* hot marker lights on both walls, ticking past */
          if (i % 3 === 0) {
            c.globalAlpha = a * 0.55;
            const mw = 40 + d * 120, mh = 26 + d * 120;
            c.drawImage(glow(C.red), LVPX - hw - mw * 0.5, LVPY - mh * 0.5, mw, mh);
            c.drawImage(glow(C.red), LVPX + hw - mw * 0.5, LVPY - mh * 0.5, mw, mh);
            c.globalAlpha = 1;
          }
        }
      }
      /* the two catapult rails converging on the vanishing point */
      c.strokeStyle = rgba(C.ice, (0.18 + 0.3 * spd) * tun); c.lineWidth = 2 + 2 * spd;
      for (let s = -1; s <= 1; s += 2) {
        c.beginPath();
        c.moveTo(LVPX + s * 26, LVPY + 24);
        c.lineTo(LVPX + s * 900, VH + 200); c.stroke();
      }
      /* the whole throat glows hotter the harder we are driven down it */
      if (spd > 0.05) {
        c.globalAlpha = 0.30 * spd * tun;
        c.drawImage(glow(C.cyan), LVPX - 900, LVPY - 560, 1800, 1120);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    /* ---- the opening at the end of the deck ---- */
    if (open > 0 && sky < 1) {
      const ow = 74 + open * open * 1900;
      const oh = 50 + open * open * 1180;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1 - sky * 0.5;
      const og = c.createRadialGradient(LVPX, LVPY, 0, LVPX, LVPY, Math.max(ow, oh));
      og.addColorStop(0, rgba(C.ice, 0.92));
      og.addColorStop(0.38, rgba([255, 150, 120], 0.42));
      og.addColorStop(0.72, rgba(C.mag, 0.20));
      og.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = og;
      c.fillRect(LVPX - ow, LVPY - oh, ow * 2, oh * 2);
      c.restore();
    }

    /* ---- speed streaks blowing out of the vanishing point ---- */
    if (spd > 0.015) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      const len = 34 + 1150 * spd;
      for (let i = 0; i < 96; i++) {
        const ang = i * 2.39996;
        const ca = Math.cos(ang), sa = Math.sin(ang) * 0.66;
        const r0 = ((i * 197.3 + travel * 300) % 1500);
        const k = r0 / 1500;
        c.globalAlpha = spd * 0.9 * k * (1 - 0.3 * sky);
        c.strokeStyle = rgba(i % 5 ? C.ice : C.white, 1);
        c.lineWidth = 1 + 5 * spd * k;
        c.beginPath();
        c.moveTo(LVPX + ca * r0, LVPY + sa * r0);
        c.lineTo(LVPX + ca * (r0 + len * (0.4 + k)), LVPY + sa * (r0 + len * (0.4 + k)));
        c.stroke();
      }
      c.restore();
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
    c.save();
    c.beginPath();
    c.rect(0, 0, VW, VH);
    rrect(ax, ay, apw * 2, aph * 2, 210);
    c.fillStyle = '#020308';
    c.fill('evenodd');
    /* rail highlight around the glass */
    c.beginPath(); rrect(ax, ay, apw * 2, aph * 2, 210);
    c.strokeStyle = 'rgba(140,170,205,0.16)'; c.lineWidth = 26; c.stroke();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); rrect(ax + 6, ay + 6, apw * 2 - 12, aph * 2 - 12, 204);
    c.strokeStyle = rgba(C.ice, 0.22 + 0.30 * spd); c.lineWidth = 2.5; c.stroke();
    c.restore();
    /* the coaming lip: a silhouette, not a panel */
    c.fillStyle = '#03050b';
    c.beginPath();
    c.moveTo(0, VH); c.lineTo(0, 800);
    c.quadraticCurveTo(800, 726, VW, 800); c.lineTo(VW, VH);
    c.closePath(); c.fill();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.28 + 0.3 * ramp(0, 1.2, u);
    c.drawImage(glow(C.amber), 120, 700, 560, 300);
    c.globalAlpha = 0.20;
    c.drawImage(glow(C.green), 980, 706, 460, 260);
    c.globalAlpha = 1;
    c.restore();
    c.restore();

    /* canopy glass: a bright bar of reflection dragged across by the speed */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const ph = ((t * (0.2 + 2.6 * spd) + i * 0.5) % 1);
      const gx = -400 + ph * 2400;
      c.save(); c.translate(gx, 0); c.rotate(0.3);
      const rgG = c.createLinearGradient(-170, 0, 170, 0);
      rgG.addColorStop(0, 'rgba(150,220,255,0)');
      rgG.addColorStop(0.5, 'rgba(190,236,255,' + (0.04 + 0.07 * spd) + ')');
      rgG.addColorStop(1, 'rgba(150,220,255,0)');
      c.fillStyle = rgG; c.fillRect(-170, -700, 340, 2300);
      c.restore();
    }
    c.restore();

    /* --------------------------------------------------- the HUD --- */
    c.save();
    c.globalCompositeOperation = 'lighter';
    /* fixed centre pipper — the still point the whole world rushes past */
    const pa = 0.30 + 0.30 * spd;
    c.strokeStyle = rgba(C.green, pa); c.lineWidth = 2;
    c.beginPath(); c.arc(LVPX, LVPY, 17, 0, 6.2832); c.stroke();
    for (let s = -1; s <= 1; s += 2) {
      c.beginPath(); c.moveTo(LVPX + s * 26, LVPY); c.lineTo(LVPX + s * 62, LVPY); c.stroke();
    }
    c.beginPath(); c.moveTo(LVPX, LVPY - 26); c.lineTo(LVPX, LVPY - 44); c.stroke();

    if (u < L_SHOT) {
      /* the only text before the shot: the tension bar filling */
      txt('CATAPULT', 236, 262, 20, rgba(C.green, 0.66), 6);
      c.fillStyle = rgba(C.green, 0.18);
      c.fillRect(236, 278, 300, 9);
      c.fillStyle = rgba(C.green, 0.62 + 0.3 * pulse(u, 6));
      c.fillRect(236, 278, 300 * tension, 9);
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
    c.restore();

    /* --------------------------------------------------- physical -- */
    if (u < L_SHOT) shake = Math.max(shake, 1.6 + 4.4 * tension * (0.5 + 0.5 * Math.sin(t * 44)));
    else shake = Math.max(shake, (3 + 21 * spd) * (0.55 + 0.45 * Math.sin(t * 63)) * (1 - 0.8 * after));

    scanlines(0.10);
    vignette(0.52 + 0.26 * spd);

    /* in from scene 3's black, out through white into the mass launch */
    const fi = 1 - ramp(0, 0.22, u);
    if (fi > 0) { c.fillStyle = 'rgba(0,0,0,' + fi + ')'; c.fillRect(0, 0, VW, VH); }
    const wo = ramp(2.86, 3.2, u);
    if (wo > 0) { c.fillStyle = 'rgba(255,255,255,' + wo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     shared sky for scenes 5 + 6
     ================================================================ */
  function dawnSky(hz, dark) {
    const g = c.createLinearGradient(0, -160, 0, hz);
    g.addColorStop(0, dark > 0.5 ? '#01020a' : '#06071c');
    g.addColorStop(0.44, '#150a34');
    g.addColorStop(0.73, '#3e0d52');
    g.addColorStop(0.90, '#8f1355');
    g.addColorStop(1, '#ff5f3e');
    c.fillStyle = g; c.fillRect(0, -200, VW, hz + 200);
    /* sun */
    c.save(); c.globalCompositeOperation = 'lighter';
    const sg = c.createLinearGradient(0, hz - 250, 0, hz + 30);
    sg.addColorStop(0, rgba([255, 220, 90], 0.95));
    sg.addColorStop(0.55, rgba([255, 110, 60], 0.9));
    sg.addColorStop(1, rgba([255, 40, 120], 0.85));
    c.save();
    c.beginPath(); c.arc(430, hz - 20, 230, 0, 6.2832); c.clip();
    c.fillStyle = sg; c.fillRect(190, hz - 260, 480, 300);
    c.fillStyle = 'rgba(10,2,20,0.85)';
    for (let i = 0; i < 9; i++) c.fillRect(190, hz - 190 + i * 26, 480, 4 + i * 1.6);
    c.restore();
    c.globalAlpha = 0.4;
    c.drawImage(glow([255, 90, 120]), 430 - 420, hz - 20 - 420, 840, 840);
    c.restore();
    /* horizon band */
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(C.mag, 0.5); c.fillRect(0, hz - 3, VW, 5);
    c.globalAlpha = 0.35; c.drawImage(glow(C.mag), 0, hz - 90, VW, 180);
    c.restore();
  }
  function neonGround(hz, scroll, alpha) {
    c.fillStyle = '#08030f'; c.fillRect(0, hz, VW, VH - hz + 200);
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const f = (i + (scroll % 1)) / 22;
      const y = hz + Math.pow(f, 2.5) * (VH - hz) * 2.6;
      if (y > VH + 60) break;
      c.strokeStyle = rgba(C.cyan, alpha * (0.08 + 0.5 * f));
      c.beginPath(); c.moveTo(0, y); c.lineTo(VW, y); c.stroke();
    }
    c.strokeStyle = rgba(C.cyan, alpha * 0.22);
    for (let i = -13; i <= 13; i++) {
      c.beginPath(); c.moveTo(800 + i * 24, hz); c.lineTo(800 + i * 430, VH + 90); c.stroke();
    }
    c.restore();
  }

  /* ================================================================
     SCENE 5 — the mass launch.  Four depth planes, each with its own
     scale, contrast, haze and — the part that actually does the work —
     its own rate.  A near jet crosses the frame in one second; a far
     one covers a twentieth of it in the whole scene.
     ================================================================ */
  const SILOS = [
    { x: 300, w: 210, at: 0.26 }, { x: 690, w: 250, at: 0.38 },
    { x: 1080, w: 230, at: 0.50 }, { x: 1420, w: 180, at: 0.62 },
    { x: 120, w: 150, at: 0.74 }
  ];
  const L_FAR = [], L_MID = [], L_NEAR = [];
  const FG5 = [
    { at: 1.00, dir: -1, y: 812, s: 4.4, dur: 0.60, rot: 1.02 },
    { at: 3.00, dir: 1, y: 862, s: 5.3, dur: 0.54, rot: -1.16 }
  ];
  (function () {
    /* far: already up, tiny, hazed, drifting on their own headings */
    for (let i = 0; i < 21; i++) {
      L_FAR.push({
        x: -80 + i * 88 + rnd(-38, 38), y: rnd(-266, -18),
        s: rnd(0.11, 0.20), vx: rnd(13, 34) * (i % 3 ? 1 : -1),
        vy: rnd(-14, -4), rot: rnd(0.10, 0.62) * (i % 3 ? 1 : -1), ph: rnd(0, 6.28)
      });
    }
    /* mid: the launch itself, climbing out of the silos */
    for (let i = 0; i < 13; i++) {
      const dx = rnd(-340, 340);
      L_MID.push({
        si: i % SILOS.length, at: 0.62 + i * 0.122,
        dx: dx, s0: rnd(0.28, 0.56), climb: rnd(180, 300),
        /* it banks the way it is actually going: no two headings alike */
        rot: dx / 760 + rnd(-0.12, 0.12)
      });
    }
    /* near: fast diagonal departures right across the frame */
    L_NEAR.push({ at: 0.48, dir: 1, y0: 700, y1: 128, s0: 2.5, s1: 0.72, dur: 1.12 });
    L_NEAR.push({ at: 1.40, dir: -1, y0: 772, y1: 214, s0: 3.0, s1: 0.86, dur: 0.94 });
    L_NEAR.push({ at: 2.36, dir: 1, y0: 730, y1: 86, s0: 2.7, s1: 0.68, dur: 1.04 });
    /* slow enough that it is still mid-frame when the scene cuts: the last
       thing you see is an aircraft close enough to count the panels on. */
    L_NEAR.push({ at: 3.40, dir: -1, y0: 706, y1: 176, s0: 2.7, s1: 0.80, dur: 1.50 });
  })();

  /* the air between the planes.  Warm and thick at the horizon, gone
     overhead — draw it between layers and distance does the rest. */
  function hazeVeil(hz, a) {
    const g = c.createLinearGradient(0, hz - 430, 0, hz + 30);
    g.addColorStop(0, 'rgba(132,54,120,0)');
    g.addColorStop(0.52, 'rgba(150,62,124,' + (a * 0.34).toFixed(3) + ')');
    g.addColorStop(0.88, 'rgba(206,80,108,' + (a * 0.72).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,124,88,' + a.toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, hz - 430, VW, 480);
  }

  function scene5(u, dt) {
    const A = art();
    const tilt = ramp(0.3, 4.0, u) * 215;
    const hz = 646 + tilt;
    const pan = ramp(0, 4.4, u) * 250;      /* the camera slews; parallax by z */

    once('c5snd', T4 + 0.05, function () {
      sfx('setIntensity', 0.72);
      if (rumbleH && rumbleH.set) rumbleH.set(0.55);
    });
    once('c5pass1', T4 + 0.94, function () { sfx('jetPass', -1); });
    once('c5pass2', T4 + 1.78, function () { sfx('jetPass', 1); });
    once('c5pass3', T4 + 3.30, function () { sfx('jetPass', 1); });

    stepParts(dt, 0);
    dawnSky(hz, 0);

    /* ---- PLANE 1 (z~0.08): specks.  Low contrast, washed out, slow. ---- */
    if (A) for (let i = 0; i < L_FAR.length; i++) {
      const f = L_FAR[i];
      const x = f.x + f.vx * u - pan * 0.05;
      const y = hz + f.y + f.vy * u + Math.sin(u * 0.7 + f.ph) * 3;
      c.save();
      c.globalAlpha = 0.40 + 0.16 * Math.sin(f.ph);
      A.jet(c, x, y, f.s, f.rot, 0.45, [188, 128, 168]);
      c.restore();
    }
    hazeVeil(hz, 0.40);

    /* a cloud deck between the far and middle distance, so aircraft
       genuinely pass behind something */
    if (A) A.cloudBank(c, hz - 244, 98, t * 0.55, [120, 40, 130], 0.44);
    hazeVeil(hz, 0.15);

    /* ---- the ground plane ---- */
    neonGround(hz, t * 0.5, 0.85);
    for (let i = 0; i < SILOS.length; i++) {
      const s = SILOS[i];
      const open = ramp(s.at, s.at + 0.55, u);
      if (A) A.silo(c, s.x - pan * 0.16, hz + 66, s.w, open, C.cyan);
      if (open > 0.4 && Math.random() < 0.4)
        part(s.x - pan * 0.16 + rnd(-s.w / 2, s.w / 2), hz + 60, rnd(-30, 30), rnd(-40, -8),
          rnd(1.2, 2.4), rnd(22, 50), C.smoke, { add: false, d: 0.96, gr: 26 });
    }

    /* ---- PLANE 2 (z~0.4): the launch.  Mid scale, mid rate. ---- */
    for (let i = 0; i < L_MID.length; i++) {
      const m = L_MID[i], q = u - m.at;
      if (q < 0) continue;
      const sl = SILOS[m.si];
      const climb = m.climb * q + 122 * q * q;
      const x = sl.x + m.dx * sat(q / 2.4) - pan * 0.30;
      const y = hz + 46 - climb;
      const sc = Math.max(0.05, m.s0 * (1 - sat(q / 3.2) * 0.70));
      if (y < -220) continue;
      c.save();
      c.globalAlpha = 0.90;
      if (A) A.jet(c, x, y, sc, m.rot * sat(q / 1.5), 1, [116, 148, 196]);
      c.restore();
      if (i % 2 === 0)
        part(x, y + 30 * sc, rnd(-20, 20), 185 + 150 * q, rnd(0.4, 0.9),
          rnd(5, 13) * (sc + 0.30), i % 4 ? C.cyan : C.white, { d: 0.93, gr: 12 });
    }

    drawParts(false); drawParts(true);
    hazeVeil(hz, 0.07);

    /* ---- PLANE 3 (z~0.8): near.  Dark, saturated, and gone in a
       second — they overtake and cross in front of everything. ---- */
    for (let i = 0; i < L_NEAR.length; i++) {
      const n = L_NEAR[i], k = (u - n.at) / n.dur;
      if (k <= 0 || k >= 1) continue;
      function px(kk) { return 800 + n.dir * (kk - 0.5) * 2300 - pan * 0.55; }
      function py(kk) { return n.y0 + (n.y1 - n.y0) * (kk * kk * 0.7 + kk * 0.3); }
      const x = px(k), y = py(k), sc = n.s0 + (n.s1 - n.s0) * k;
      const kp = Math.max(0, k - 0.10), xp = px(kp), yp = py(kp);
      /* the trail lies along the actual heading, so the bank reads right */
      c.save();
      c.globalCompositeOperation = 'lighter';
      const cg = c.createLinearGradient(x, y, xp, yp);
      cg.addColorStop(0, rgba(C.ice, 0.42));
      cg.addColorStop(0.28, rgba(C.cyan, 0.18));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      c.strokeStyle = cg; c.lineCap = 'round'; c.lineWidth = 9 * sc;
      c.beginPath();
      c.moveTo(x - (x - xp) * 0.07, y - (y - yp) * 0.07);
      c.lineTo(xp, yp); c.stroke();
      c.restore();
      const rot = n.dir * (0.66 - 0.34 * k);
      if (A) {
        c.save(); c.globalAlpha = 0.30;
        A.jet(c, x - (x - xp) * 0.22, y - (y - yp) * 0.22, sc, rot, 1, [70, 96, 140]);
        c.restore();
        A.jet(c, x, y, sc, rot, 1, [82, 112, 158]);
      }
      shake = Math.max(shake, 6 * Math.sin(sat(k) * Math.PI));
    }

    /* ---- PLANE 4 (z~1): one aircraft close enough that the frame
       cannot hold it.  This is what everything else is measured by. ---- */
    for (let i = 0; i < FG5.length; i++) {
      const f = FG5[i], k = (u - f.at) / f.dur;
      if (k <= 0 || k >= 1) continue;
      const yb = f.y + tilt * 0.16;
      for (let g = 3; g >= 0; g--) {
        const kk = k - g * 0.030;
        if (kk < 0) continue;
        c.save();
        c.globalAlpha = g === 0 ? 1 : 0.20 / g;
        if (A) A.jet(c, 800 + f.dir * (kk - 0.5) * 3500,
          yb - Math.sin(kk * Math.PI) * 56, f.s, f.rot, 1, [46, 62, 92]);
        c.restore();
      }
      for (let q2 = 0; q2 < 5; q2++)
        part(800 + f.dir * (k - 0.62) * 3500, yb - 70 + rnd(-46, 46),
          -f.dir * rnd(320, 940), rnd(-140, 70), rnd(0.2, 0.46), rnd(14, 34),
          q2 ? C.cyan : C.white, { d: 0.90, gr: 42, a: 0.7 });
      shake = Math.max(shake, 17 * Math.sin(k * Math.PI));
    }

    if (u > 0.45 && u < 3.2) {
      const a = ramp(0.45, 0.95, u) * (1 - ramp(2.6, 3.2, u));
      txt('SILO CLUSTER 7  —  SCRAMBLE ORDER EXECUTED', VW / 2, 118, 24,
        rgba(C.cyan, a * 0.9), 7, 'center');
    }
    vignette(0.62);
    const fo = ramp(T5 - 0.45, T5, u + T4);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo * 0.85 + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 6 — the encounter, handing off to the 3D game
     ================================================================ */
  const WING = [];
  (function () {
    const lay = [[-1, 0], [1, 0], [-2, 1], [2, 1], [-3, 1.8], [3, 1.8], [-1.6, 2.6], [1.6, 2.6], [0, 3.2]];
    for (let i = 0; i < lay.length; i++)
      WING.push({ x0: 800 + lay[i][0] * 86, y0: 430 + lay[i][1] * 26, s0: 0.16 + lay[i][1] * 0.03, k: 1 + i * 0.06 });
  })();
  const ALIENS = [];
  (function () {
    for (let i = 0; i < 15; i++)
      ALIENS.push({ x: 90 + i * 100 + rnd(-34, 34), d: 1.1 + i * 0.14, s: rnd(0.4, 0.72), yo: rnd(-46, 26) });
  })();

  function scene6(u, dt) {
    const A = art();
    const hz = 470;
    const acc = ramp(0.25, 2.7, u);

    once('c6snd', T5 + 0.05, function () {
      sfx('setIntensity', 0.9);
      if (rumbleH && rumbleH.set) rumbleH.set(0.8);
    });
    once('c6riser', T5 + 1.75, function () { sfx('riser', 2.7); });

    dawnSky(hz, 0.6);
    if (A) A.cloudBank(c, hz - 120, 96, t * 0.6, [110, 34, 120], 0.38);
    neonGround(hz, t * 2.2 + acc * 6, 0.9);

    /* alien wall on the horizon */
    for (let i = 0; i < ALIENS.length; i++) {
      const al = ALIENS[i], q = sat((u - al.d) / 3.1);
      if (q <= 0) continue;
      const s = al.s * (0.05 + q * q * 0.95);
      const y = hz + al.yo - 8 + q * 44;
      if (A) A.warship(c, al.x, y, s, Math.min(1, q * 3), 0, t);
      if (q > 0.55 && Math.random() < 0.02) {
        c.save(); c.globalCompositeOperation = 'lighter';
        c.drawImage(glow(C.mag), al.x - 60, y - 60, 120, 120);
        c.restore();
      }
    }

    /* wingmen falling back past the camera */
    for (let i = 0; i < WING.length; i++) {
      const w = WING[i], q = acc * w.k;
      const s = w.s0 * (1 + q * 5.2);
      const x = 800 + (w.x0 - 800) * (1 + q * 3.4);
      const y = w.y0 + q * 560;
      if (y > VH + 240 || x < -400 || x > VW + 400) continue;
      if (A) A.jet(c, x, y, s, (w.x0 - 800) * 0.0012, 0.85, [124, 150, 186]);
      if (q > 0.1 && i % 2 === 0)
        part(x, y + 30 * s, rnd(-16, 16), 120 + 260 * q, rnd(0.3, 0.6), rnd(5, 13) * (s + 0.4), C.cyan, { d: 0.92 });
    }

    /* the player's interceptor pulling to the front */
    const pjS = 2.35 - acc * 0.85;
    const pjY = 692 - acc * 92 + Math.sin(u * 1.5) * 6;
    if (A) A.jet(c, 800, pjY, pjS, Math.sin(u * 0.9) * 0.05, 1, C.cyan);
    for (let k = 0; k < 2; k++)
      part(800 + rnd(-12, 12) * pjS, pjY + 32 * pjS, rnd(-40, 40), rnd(160, 340),
        rnd(0.3, 0.6), rnd(8, 18) * pjS * 0.6, k ? C.cyan : C.white, { d: 0.9, gr: 22 });

    /* speed streaks */
    const st = ramp(2.8, 4.6, u);
    if (st > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(C.ice, 0.5 * st); c.lineWidth = 2;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * 6.2832 + t * 0.4;
        const r0 = 120 + ((i * 137 + t * 900 * st) % 900);
        const len = 60 + 260 * st;
        c.globalAlpha = 0.5 * st * (r0 / 1000);
        c.beginPath();
        c.moveTo(800 + Math.cos(a) * r0, pjY - 120 + Math.sin(a) * r0 * 0.55);
        c.lineTo(800 + Math.cos(a) * (r0 + len), pjY - 120 + Math.sin(a) * (r0 + len) * 0.55);
        c.stroke();
      }
      c.restore();
    }

    stepParts(dt, 0); drawParts(false); drawParts(true);

    if (u > 0.45 && u < 3.0) {
      const a = ramp(0.45, 0.95, u) * (1 - ramp(2.4, 3.0, u));
      txt('INTERCEPTOR 01  —  YOU HAVE THE LEAD', VW / 2, 820, 26, rgba(C.cyan, a), 8, 'center');
    }
    once('c6flash', T5 + 4.05, function () { flash = 0.9; flashCol = C.ice; shake = 22; });
    vignette(0.55);
  }

  /* ================================================================
     attract card (also unlocks the AudioContext)
     ================================================================ */
  function attract(dt) {
    c.fillStyle = '#04050c'; c.fillRect(0, 0, VW, VH);
    starField(4471, 130, 0, 0.5);
    const g = c.createRadialGradient(VW / 2, 400, 40, VW / 2, 400, 780);
    g.addColorStop(0, 'rgba(40,10,60,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    txt('SKYFALL', VW / 2, 396, 108, rgba(C.white, 0.96), 22, 'center', 'bold');
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
    txt('SKYFALL', VW / 2, 396, 108, rgba(C.cyan, 0.8), 22, 'center', 'bold');
    c.restore();
    txt('I N T E R C E P T O R', VW / 2, 448, 24, rgba(C.cyan, 0.85), 12, 'center');
    txt('⚠  ALIEN INCURSION — SECTOR 7  ⚠', VW / 2, 300, 22, rgba(C.red, 0.55 + 0.45 * pulse(t, 1.3)), 9, 'center');

    const a = 0.4 + 0.6 * pulse(t, 0.7);
    txt('CLICK OR PRESS ANY KEY TO BEGIN', VW / 2, 604, 28, rgba(C.white, a), 11, 'center');
    txt('AUDIO ON — HEADPHONES RECOMMENDED', VW / 2, 654, 17, rgba(C.green, 0.45), 6, 'center');
    stepParts(dt, 0); drawParts();
    scanlines(0.22); vignette(0.72);
  }

  /* ================================================================
     chrome: skip prompt + progress
     ================================================================ */
  function chrome() {
    const a = 0.35 + 0.5 * pulse(t, 0.8);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(VW - 452, VH - 78, 420, 40);
    txt('▸ PRESS ANY KEY OR CLICK TO SKIP', VW - 42, VH - 51, 19, rgba(C.white, a), 4, 'right');
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(0, VH - 4, VW, 4);
    c.fillStyle = rgba(C.cyan, 0.55); c.fillRect(0, VH - 4, VW * sat(t / T6), 4);
    c.restore();
  }

  /* ================================================================
     frame
     ================================================================ */
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    sc = Math.max(W / VW, H / VH);
    ox = (W - VW * sc) / 2; oy = (H - VH * sc) / 2;
  }

  function frame(ms) {
    if (phase === 'idle') return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ms - last) / 1000 || 0.016);
    last = ms;
    if (phase !== 'attract') t += dt;

    if (cv.width !== Math.round(W * dpr) || W !== window.innerWidth || H !== window.innerHeight) fit();

    shake *= Math.pow(0.02, dt);
    flash = Math.max(0, flash - dt * 2.6);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.save();
    c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + (shake ? rnd(-shake, shake) : 0)),
      dpr * (oy + (shake ? rnd(-shake, shake) : 0)));
    c.beginPath(); c.rect(0, 0, VW, VH); c.clip();

    try {
      if (phase === 'attract') attract(dt);
      else if (t < T1) scene1(t, dt);
      else if (t < T2) scene2(t - T1, dt);
      else if (t < T3) scene3(t - T2, dt);
      else if (t < T4) scene4(t - T3, dt);
      else if (t < T5) scene5(t - T4, dt);
      else scene6(t - T5, dt);
    } catch (e) {
      c.restore(); finish('skip'); return;
    }

    if (flash > 0.002) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = rgba(flashCol, flash * flash);
      c.fillRect(0, 0, VW, VH);
      c.globalCompositeOperation = 'source-over';
    }
    if (phase === 'play') chrome();
    c.restore();

    /* hand the frame over to the live game underneath, then fade out */
    if (phase === 'play' && t >= HANDOFF) {
      if (!ended) { ended = true; if (cbEnd) { try { cbEnd(); } catch (e) { } } }
      const k = sat((t - HANDOFF) / (T6 - HANDOFF));
      cv.style.opacity = String(1 - k);
      if (k >= 1) finish('end');
    }
    if (phase === 'out') {
      outT += dt;
      cv.style.opacity = String(Math.max(0, 1 - outT / 0.28));
      if (outT > 0.3) finish(outMode);
    }
  }

  /* ================================================================
     lifecycle
     ================================================================ */
  /* gate on the cinematic's own clock, not wall time, so the first frames after
     the start gesture cannot immediately re-trigger as a skip */
  function onKey(e) {
    if (phase === 'attract') { e.preventDefault(); begin(); return; }
    if (phase === 'play' && t > 0.35) skip();
  }
  function onPtr() {
    if (phase === 'attract') { begin(); return; }
    if (phase === 'play' && t > 0.35) skip();
  }
  function listen(on) {
    const f = on ? window.addEventListener : window.removeEventListener;
    f('keydown', onKey, true);
    f('mousedown', onPtr, true);
    f('touchstart', onPtr, true);
  }

  function begin() {
    if (phase !== 'attract') return;
    sfx('init');
    sfx('setIntensity', 0.2);
    phase = 'play'; t = 0;
  }

  function skip() {
    if (phase !== 'play') return;
    phase = 'out'; outMode = 'skip'; outT = 0;
    sfx('stopCine'); rumbleH = null; sirenH = null;
    sfx('setIntensity', 0.15);
  }

  function finish(mode) {
    if (phase === 'idle') return;
    phase = 'idle';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    listen(false);
    sfx('stopCine'); rumbleH = null; sirenH = null;
    parts.length = 0;
    if (cv) { cv.style.display = 'none'; cv.style.opacity = '1'; }
    if (mode === 'skip' && cbSkip) { try { cbSkip(); } catch (e) { } }
    if (mode === 'end' && !ended && cbEnd) { ended = true; try { cbEnd(); } catch (e) { } }
  }

  function play(opts) {
    opts = opts || {};
    cbEnd = opts.onEnd || null; cbSkip = opts.onSkip || null;
    cv = document.getElementById('cine');
    if (!cv || !cv.getContext) { if (cbSkip) cbSkip(); return false; }
    c = cv.getContext('2d');
    if (!c) { if (cbSkip) cbSkip(); return false; }
    cv.style.display = 'block'; cv.style.opacity = '1';
    fit();
    for (const k in fired) delete fired[k];
    parts.length = 0;
    t = 0; last = performance.now(); shake = 0; flash = 0; ended = false;
    phase = 'attract';
    listen(true);
    raf = requestAnimationFrame(frame);
    return true;
  }

  return { play: play, skip: skip, stop: function () { finish(''); } };
})();

try { if (typeof globalThis !== 'undefined' && !globalThis.CINE) globalThis.CINE = CINE; } catch (e) { }
