/* ==================================================================
   CINE — skippable cinematic intro sequence (2D vector, procedural)
   Scenes: 1 rocket launch + ambush, 2 red alert, 3 cockpit mask-up,
           4 mass launch, 5 encounter -> hand-off to 3D gameplay.
   ================================================================== */
const CINE = (function () {
  'use strict';

  const VW = 1600, VH = 900;

  /* ---- scene boundaries (absolute seconds) ---- */
  const T1 = 10.6;              // 0    .. 10.6  incident
  const T2 = T1 + 3.9;          // 10.6 .. 14.5  red alert
  const T3 = T2 + 6.5;          // 14.5 .. 21.0  cockpit
  const T4 = T3 + 5.2;          // 21.0 .. 26.2  mass launch
  const T5 = T4 + 5.9;          // 26.2 .. 32.1  encounter
  const HANDOFF = T5 - 0.62;    // gameplay starts under the fading canvas

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
     SCENE 1 — the inciting incident
     ================================================================ */
  const IGN = 1.25, LIFT = 2.35, WARP = 6.05, LOCK = 6.95, FIRE = 7.8, BOOM = 8.3;
  const PAD_Y = 605, GND_Y = 700;
  const SHIPS = [
    { x: 322, y: 232, s: 1.00, tw: WARP },
    { x: 1298, y: 158, s: 0.86, tw: WARP + 0.26 },
    { x: 838, y: 104, s: 0.66, tw: WARP + 0.52 }
  ];
  let camAlt = 0, camPrev = 0, rkX = 800, rkY = PAD_Y, rkRot = 0;

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

    rkX = 800 + ramp(3.4, BOOM, u) * 96;
    rkY = PAD_Y - Math.min(alt, 300);
    rkRot = ramp(3.0, BOOM, u) * 0.26;

    /* --- sky --- */
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#01020a');
    g.addColorStop(0.55, space > 0.5 ? '#02030c' : '#070c22');
    g.addColorStop(1, space > 0.8 ? '#03040e' : ('rgb(' + Math.round(18 + 40 * (1 - space)) + ',' +
      Math.round(10 + 22 * (1 - space)) + ',' + Math.round(38 + 30 * (1 - space)) + ')'));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    starField(9173, 150, camAlt, 0.25 + 0.65 * space);

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

    /* --- alien arrival --- */
    let tips = null;
    for (let i = 0; i < SHIPS.length; i++) {
      const sh = SHIPS[i], q = u - sh.tw;
      if (q < 0) continue;
      once('warp' + i, sh.tw, function () { sfx('warp'); shake = Math.max(shake, 7); });
      /* warp streak + ring */
      if (q < 0.62) {
        c.globalCompositeOperation = 'lighter';
        if (q < 0.17) {
          const w = sat(q / 0.17);
          c.globalAlpha = 1 - w * 0.35;
          c.fillStyle = rgba(C.white, 1);
          c.fillRect(sh.x - 1400 * w, sh.y - 2, 2800 * w, 4);
        }
        const rq = sat((q - 0.12) / 0.5);
        if (rq > 0) {
          c.globalAlpha = (1 - rq) * 0.85; c.lineWidth = 6 * (1 - rq) + 1;
          c.strokeStyle = rgba(C.violet, 1);
          c.beginPath(); c.ellipse(sh.x, sh.y, 60 + 340 * rq * sh.s, (18 + 96 * rq) * sh.s, 0, 0, 6.2832);
          c.stroke();
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
      const a = ramp(sh.tw + 0.18, sh.tw + 0.6, u);
      const ch = dead ? 0 : ramp(LOCK, FIRE, u) * (u > FIRE + 0.6 ? 0 : 1);
      if (A) {
        const r = A.warship(c, sh.x, sh.y + Math.sin(t * 0.9 + i) * 5, sh.s, a, ch, t);
        if (r && r.tips) { SHIPS[i]._tips = r.tips; if (!tips) tips = r.tips; }
      }
    }
    once('lock', LOCK, function () { sfx('beep', 0.9); sfx('beep', 0.4); });

    /* target brackets on the doomed rocket */
    if (u > LOCK && u < BOOM) {
      const a = ramp(LOCK, LOCK + 0.25, u) * (0.55 + 0.45 * pulse(t, 6));
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(C.mag, a); c.lineWidth = 3;
      const bw = 72, bh = 132, cx = rkX, cy = rkY - 6, k = 26;
      const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let i = 0; i < 4; i++) {
        const sx = cs[i][0], sy = cs[i][1];
        c.beginPath();
        c.moveTo(cx + sx * bw, cy + sy * bh - sy * k); c.lineTo(cx + sx * bw, cy + sy * bh);
        c.lineTo(cx + sx * bw - sx * k, cy + sy * bh); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }

    /* --- plasma beams --- */
    once('fire', FIRE, function () { sfx('plasma'); shake = Math.max(shake, 16); flash = 0.35; flashCol = C.mag; });
    if (u > FIRE && u < BOOM + 0.16) {
      const life = sat((u - FIRE) / 0.1) * (1 - ramp(BOOM, BOOM + 0.16, u));
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < SHIPS.length; i++) {
        const tp = SHIPS[i]._tips; if (!tp) continue;
        for (let j = 0; j < tp.length; j++) {
          const jitter = Math.sin(t * 90 + j * 3 + i) * 3;
          const passes = [[30, C.mag, 0.20], [13, C.mag, 0.5], [4.5, C.white, 1]];
          for (let p = 0; p < 3; p++) {
            c.strokeStyle = rgba(passes[p][1], passes[p][2] * life);
            c.lineWidth = passes[p][0] * (0.85 + 0.15 * Math.sin(t * 60 + p));
            c.beginPath(); c.moveTo(tp[j][0], tp[j][1]);
            c.lineTo(rkX + jitter, rkY - 20 + jitter); c.stroke();
          }
        }
      }
      const bl = 120 + 40 * Math.sin(t * 40);
      c.drawImage(glow(C.white), rkX - bl / 2, rkY - 20 - bl / 2, bl, bl);
      c.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.6)
        burst(rkX, rkY - 20, 4, 460, C.amber, 0.5, 16, { g: 200 });
    }

    /* --- destruction --- */
    once('boom', BOOM, function () {
      sfx('explode', 2.3); shake = 40; flash = 1; flashCol = C.white;
      sfx('setIntensity', 0.5);
      if (rumbleH && rumbleH.stop) { rumbleH.stop(0.35); rumbleH = null; }
      burst(rkX, rkY - 10, 90, 900, C.white, 0.7, 40, { g: 90, d: 0.9 });
      burst(rkX, rkY - 10, 110, 640, C.orange, 1.5, 54, { g: 130, d: 0.93, gr: 30 });
      burst(rkX, rkY - 10, 70, 380, C.amber, 2.2, 60, { g: 60, d: 0.95, gr: 40 });
      burst(rkX, rkY - 10, 60, 300, C.smoke, 3.4, 70, { add: false, g: -20, d: 0.96, gr: 46 });
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
      const fb = 260 * Math.exp(-q * 0.9) + 60;
      c.globalAlpha = sat(1.1 - q * 0.45);
      c.drawImage(glow(C.orange), rkX - fb, rkY - 10 - fb, fb * 2, fb * 2);
      c.drawImage(glow(C.white), rkX - fb * 0.4, rkY - 10 - fb * 0.4, fb * 0.8, fb * 0.8);
      c.globalAlpha = 1;
      if (q < 1.1) {
        const rq = q / 1.1;
        c.strokeStyle = rgba(C.amber, (1 - rq) * 0.8); c.lineWidth = 14 * (1 - rq) + 1;
        c.beginPath(); c.arc(rkX, rkY - 10, 60 + 900 * rq, 0, 6.2832); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }

    drawParts(true);

    /* slate */
    if (u < 3.4) {
      const a = ramp(0.3, 0.9, u) * (1 - ramp(2.7, 3.4, u));
      txt('CAPE ORION  //  04:17 LOCAL', 96, 108, 22, rgba(C.green, a * 0.9), 5);
      txt('SPEACE-X  HEAVY  —  ORBITAL DEFENCE PAYLOAD', 96, 144, 17, rgba(C.green, a * 0.6), 4);
    }
    if (u > BOOM + 0.9 && u < T1 - 0.2) {
      const a = ramp(BOOM + 0.9, BOOM + 1.4, u) * (1 - ramp(T1 - 0.9, T1 - 0.2, u));
      txt('TELEMETRY LOST', VW / 2, 806, 30, rgba(C.red, a * (0.5 + 0.5 * pulse(t, 2.4))), 12, 'center');
    }
    vignette(0.55 + 0.2 * space);
    /* fade to black into the alert */
    const fo = ramp(T1 - 0.7, T1, u);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 2 — the red alert
     ================================================================ */
  const ALERT = [
    { s: 'SPEACE-X LAUNCH DESTROYED', at: 0.18 },
    { s: 'ALIEN FLEET APPROACHING', at: 1.16 },
    { s: 'ALL PILOTS TO INTERCEPTORS', at: 2.14 }
  ];
  function scene2(u, dt) {
    once('siren', T1 + 0.05, function () { sirenH = sfx('sirenLoop'); sfx('setIntensity', 0.62); });
    once('sirenoff', T2 - 0.45, function () { if (sirenH && sirenH.stop) { sirenH.stop(); sirenH = null; } });

    const beat = pulse(u, 1.28);
    c.fillStyle = 'rgb(' + Math.round(14 + 40 * beat) + ',0,' + Math.round(4 + 10 * beat) + ')';
    c.fillRect(0, 0, VW, VH);

    /* hazard chevrons */
    c.save();
    c.globalAlpha = 0.16 + 0.1 * beat;
    c.fillStyle = rgba(C.red, 1);
    const off = (u * 190) % 180;
    for (let x = -VH; x < VW + VH; x += 180) {
      c.beginPath();
      c.moveTo(x + off, 0); c.lineTo(x + off + 74, 0);
      c.lineTo(x + off + 74 - VH, VH); c.lineTo(x + off - VH, VH);
      c.closePath(); c.fill();
    }
    c.restore();

    /* warning triangle */
    c.save();
    c.translate(VW / 2, 372);
    const ts = 1 + 0.04 * Math.sin(u * 7);
    c.scale(ts, ts);
    c.globalAlpha = 0.20 + 0.16 * beat;
    c.strokeStyle = rgba(C.red, 1); c.lineWidth = 12; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -210); c.lineTo(200, 150); c.lineTo(-200, 150); c.closePath(); c.stroke();
    c.fillStyle = rgba(C.red, 1);
    c.fillRect(-16, -110, 32, 160); c.fillRect(-16, 76, 32, 34);
    c.restore();

    /* headline slam-ins */
    for (let i = 0; i < ALERT.length; i++) {
      const q = u - ALERT[i].at;
      if (q < 0) continue;
      once('albeep' + i, T1 + ALERT[i].at, function () { sfx('beep', 0.15 + i * 0.3); sfx('thud'); });
      const inn = ramp(0, 0.16, q);
      const y = 300 + i * 92;
      const size = 46 * (1 + (1 - inn) * 0.45);
      const jit = q < 0.3 ? rnd(-4, 4) : (Math.random() < 0.06 ? rnd(-5, 5) : 0);
      c.save(); c.globalCompositeOperation = 'lighter';
      if (q < 0.4) {
        txt(ALERT[i].s, VW / 2 + 7 + jit, y, size, rgba(C.red, 0.85 * inn), 9, 'center', 'bold');
        txt(ALERT[i].s, VW / 2 - 7 + jit, y, size, rgba([0, 200, 255], 0.7 * inn), 9, 'center', 'bold');
      }
      c.restore();
      txt(ALERT[i].s, VW / 2 + jit, y, size, rgba(C.white, inn), 9, 'center', 'bold');
    }

    /* top + bottom status bands */
    c.fillStyle = rgba(C.red, 0.9); c.fillRect(0, 96, VW, 4); c.fillRect(0, 704, VW, 4);
    if (pulse(u, 2.6) > 0.4)
      txt('SECTOR 7  —  DEFCON 1  —  NORAD OVERRIDE', VW / 2, 74, 22, rgba(C.red, 0.95), 8, 'center');

    /* ticker */
    const tick = '▲ SPEACE-X LAUNCH DESTROYED ▲ ALIEN FLEET APPROACHING ▲ ALL PILOTS TO INTERCEPTORS ';
    c.font = '24px "Courier New",monospace';
    const tw = c.measureText(tick).width;
    c.fillStyle = rgba(C.red, 0.75);
    let sx = -((u * 300) % tw);
    while (sx < VW) { c.fillText(tick, sx, 764); sx += tw; }

    stepParts(dt, 0); drawParts();
    scanlines(0.30);
    vignette(0.7);
    const fo = ramp(T2 - 0.35, T2, u + T1);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 3 — the pilot, first person
     ================================================================ */
  const BOOTLINES = [
    'APU .............. ONLINE', 'FLT CTRL ......... NOMINAL',
    'INS ALIGN ........ LOCKED', 'WEAPONS .......... ARMED',
    'O2 SUPPLY ........ 100%', 'CATAPULT ......... CHARGED'
  ];
  function scene3(u, dt) {
    const A = art();
    const cat = ramp(4.75, 6.5, u);          // catapult wind-up
    const boot = ramp(0.45, 3.2, u);
    const sealed = ramp(2.5, 3.05, u);

    once('c3rumble', T2 + 0.15, function () {
      rumbleH = sfx('rumble', 0.12); sfx('setIntensity', 0.45);
    });
    if (rumbleH && rumbleH.set) rumbleH.set(0.12 + 0.88 * cat);

    /* ---- outside: the launch tunnel ---- */
    const vpx = 800, vpy = 330;
    c.fillStyle = '#02030a'; c.fillRect(0, 0, VW, VH);
    const speed = 0.6 + cat * 14;
    /* receding floor + ceiling strip lights */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const f = ((i + (t * speed) % 1) / 26);
      const d = Math.pow(f, 2.6);
      const y = vpy + d * 640, y2 = vpy - d * 420;
      const hw = 40 + d * 1300;
      const a = (0.1 + 0.75 * f) * (1 - ramp(6.15, 6.5, u));
      c.strokeStyle = rgba(C.cyan, a * 0.5); c.lineWidth = 1 + d * 7;
      c.beginPath(); c.moveTo(vpx - hw, y); c.lineTo(vpx + hw, y); c.stroke();
      c.strokeStyle = rgba(C.amber, a * 0.35);
      c.beginPath(); c.moveTo(vpx - hw * 0.8, y2); c.lineTo(vpx + hw * 0.8, y2); c.stroke();
      if (cat > 0.05) {
        c.strokeStyle = rgba(C.white, a * cat * 0.5); c.lineWidth = 2 + d * 4;
        c.beginPath(); c.moveTo(vpx - hw, y); c.lineTo(vpx - hw - 200 * cat, y); c.stroke();
        c.beginPath(); c.moveTo(vpx + hw, y); c.lineTo(vpx + hw + 200 * cat, y); c.stroke();
      }
    }
    /* the opening at the far end */
    const ow = 90 + cat * 1500, oh = 60 + cat * 900;
    const og = c.createRadialGradient(vpx, vpy, 0, vpx, vpy, Math.max(ow, oh));
    og.addColorStop(0, rgba(C.ice, 0.9)); og.addColorStop(0.5, rgba(C.mag, 0.35));
    og.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = og; c.fillRect(vpx - ow, vpy - oh, ow * 2, oh * 2);
    c.restore();

    /* ---- cockpit furniture ---- */
    if (A) A.cockpit(c, t, boot, sealed);

    /* ---- HUD boot readout (over the glass) ---- */
    for (let i = 0; i < BOOTLINES.length; i++) {
      const at = 0.5 + i * 0.24;
      if (u < at) continue;
      once('bt' + i, T2 + at, function () { sfx('beep', 0.2 + i * 0.13); });
      const flick = (u - at < 0.3 && Math.random() < 0.35) ? 0.3 : 1;
      txt(BOOTLINES[i], 250, 168 + i * 34, 20,
        rgba(C.green, 0.85 * flick * (1 - ramp(4.4, 5.0, u))), 3);
    }
    if (boot > 0.98 && pulse(u, 2.2) > 0.35 && u < 6.1)
      txt('CLEARED FOR LAUNCH', 1360, 200, 26, rgba(C.cyan, 0.95), 6, 'right', 'bold');

    /* ---- gloves + mask ---- */
    const rise = ramp(0.9, 2.45, u);
    const away = ramp(2.6, 3.3, u);
    if (A && rise > 0 && away < 1) {
      const ga = 1 - away;
      /* the mask is carried up into the lens: it rises, swells as it nears the
         face, then rushes past the camera as it seats */
      const my = 1040 - rise * 400 - away * 130;
      const ms = 0.9 + rise * 1.7 + away * 2.9;
      const gx = 66 * ms + 46;               // gloves grip the cup, so they track its width
      const gy = my + 26 * ms + away * 260;
      A.glove(c, 800 - gx, gy, ms * 0.62, -0.5 + rise * 0.34, false, ga);
      A.glove(c, 800 + gx, gy, ms * 0.62, 0.5 - rise * 0.34, true, ga);
      A.mask(c, 800, my, ms, Math.sin(u * 1.6) * 0.05 * (1 - rise), ga);
    }
    once('helm', T2 + 2.38, function () { sfx('helmetOn'); shake = Math.max(shake, 5); });
    once('brth', T2 + 3.0, function () { sfx('breath', 3); });

    /* ---- catapult ---- */
    once('cat', T2 + 4.75, function () { sfx('riser', 1.6); });
    if (cat > 0) shake = Math.max(shake, 3 + 22 * cat * (0.6 + 0.4 * Math.sin(t * 55)));

    stepParts(dt, 0); drawParts();
    scanlines(0.14);
    vignette(0.5 + 0.25 * sealed);

    /* fade from black in, white out at the end */
    const fi = 1 - ramp(0, 0.55, u);
    if (fi > 0) { c.fillStyle = 'rgba(0,0,0,' + fi + ')'; c.fillRect(0, 0, VW, VH); }
    const wo = ramp(6.12, 6.5, u);
    if (wo > 0) { c.fillStyle = 'rgba(255,255,255,' + wo + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     shared sky for scenes 4 + 5
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
     SCENE 4 — the mass launch
     ================================================================ */
  const SILOS = [
    { x: 300, w: 210, at: 0.30 }, { x: 690, w: 250, at: 0.46 },
    { x: 1080, w: 230, at: 0.62 }, { x: 1420, w: 180, at: 0.78 },
    { x: 120, w: 150, at: 0.94 }
  ];
  const FLEET = [];
  (function () {
    for (let i = 0; i < 15; i++) {
      const si = i % SILOS.length;
      FLEET.push({
        si: si, at: 0.62 + i * 0.115,
        dx: rnd(-260, 260), sp: rnd(300, 470), s0: rnd(0.5, 0.78), rot: rnd(-0.3, 0.3)
      });
    }
  })();

  function scene4(u, dt) {
    const A = art();
    const tilt = ramp(0.4, 4.4, u) * 215;
    const hz = 646 + tilt;

    once('c4snd', T3 + 0.05, function () {
      sfx('setIntensity', 0.72);
      if (rumbleH && rumbleH.set) rumbleH.set(0.55);
    });
    once('c4pass1', T3 + 1.55, function () { sfx('jetPass', -1); });
    once('c4pass2', T3 + 3.05, function () { sfx('jetPass', 1); });

    dawnSky(hz, 0);
    if (A) A.cloudBank(c, hz - 200, 88, t, [120, 40, 130], 0.34);
    neonGround(hz, t * 0.5, 0.85);

    /* silo doors */
    for (let i = 0; i < SILOS.length; i++) {
      const s = SILOS[i];
      const open = ramp(s.at, s.at + 0.55, u);
      if (A) A.silo(c, s.x, hz + 66, s.w, open, C.cyan);
      if (open > 0.4 && Math.random() < 0.4)
        part(s.x + rnd(-s.w / 2, s.w / 2), hz + 60, rnd(-30, 30), rnd(-40, -8),
          rnd(1.2, 2.4), rnd(22, 50), C.smoke, { add: false, d: 0.96, gr: 26 });
    }

    /* the fleet */
    for (let i = 0; i < FLEET.length; i++) {
      const f = FLEET[i], q = u - f.at;
      if (q < 0) continue;
      const s = SILOS[f.si];
      const climb = 120 * q + 205 * q * q;
      const x = s.x + f.dx * sat(q / 2.2);
      const y = hz + 50 - climb;
      const sc = Math.max(0.06, f.s0 * (1 - sat(q / 3.0) * 0.86));
      if (y < -160) continue;
      const rot = f.rot * sat(q / 1.4);
      if (A) A.jet(c, x, y, sc, rot, 1, [130, 160, 200]);
      if (i % 2 === 0)
        part(x, y + 30 * sc, rnd(-24, 24), 220 + 190 * q, rnd(0.45, 0.95),
          rnd(6, 16) * (sc + 0.35), i % 4 ? C.cyan : C.white, { d: 0.93, gr: 14 });
    }

    /* two hero passes across the foreground */
    for (let h = 0; h < 2; h++) {
      const at = 1.35 + h * 1.5, q = u - at;
      if (q < 0 || q > 1.5) continue;
      const dir = h ? 1 : -1;
      const x = 800 + dir * (q - 0.75) * 2100;
      const y = 300 + tilt * 0.4 + Math.sin(q * 2) * 40 + h * 120;
      const sc = 1.15 + 0.5 * Math.sin(q * 2.1);
      /* a drawn contrail sells the speed; the particles only fray its edge */
      const tl = 620 * sc;
      c.save(); c.globalCompositeOperation = 'lighter';
      const cg = c.createLinearGradient(x, 0, x - dir * tl, 0);
      cg.addColorStop(0, rgba(C.ice, 0.5)); cg.addColorStop(0.25, rgba(C.cyan, 0.22));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      c.strokeStyle = cg; c.lineCap = 'round';
      c.lineWidth = 9 * sc;
      c.beginPath(); c.moveTo(x - dir * 34 * sc, y + 22 * sc); c.lineTo(x - dir * tl, y + 22 * sc); c.stroke();
      c.restore();
      if (A) A.jet(c, x, y, sc, dir * 0.55, 1, [150, 190, 230]);
      for (let k = 0; k < 4; k++)
        part(x - dir * 46 * sc, y + 22 * sc + rnd(-5, 5), -dir * rnd(90, 260), rnd(-26, 44),
          rnd(0.18, 0.4), rnd(4, 9) * sc, k ? C.cyan : C.white, { d: 0.88, gr: 26 });
      shake = Math.max(shake, 7 * (1 - Math.abs(q - 0.75) / 0.75));
    }

    stepParts(dt, 0); drawParts(false); drawParts(true);

    if (u > 0.5 && u < 3.4) {
      const a = ramp(0.5, 1.0, u) * (1 - ramp(2.8, 3.4, u));
      txt('SILO CLUSTER 7  —  SCRAMBLE ORDER EXECUTED', VW / 2, 118, 24,
        rgba(C.cyan, a * 0.9), 7, 'center');
    }
    vignette(0.62);
    const fo = ramp(T4 - 0.45, T4, u + T3);
    if (fo > 0) { c.fillStyle = 'rgba(0,0,0,' + fo * 0.85 + ')'; c.fillRect(0, 0, VW, VH); }
  }

  /* ================================================================
     SCENE 5 — the encounter, handing off to the 3D game
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

  function scene5(u, dt) {
    const A = art();
    const hz = 470;
    const acc = ramp(0.25, 2.7, u);

    once('c5snd', T4 + 0.05, function () {
      sfx('setIntensity', 0.9);
      if (rumbleH && rumbleH.set) rumbleH.set(0.8);
    });
    once('c5riser', T4 + 1.85, function () { sfx('riser', 3.0); });

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
    const st = ramp(3.1, 5.0, u);
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
    once('c5flash', T4 + 4.85, function () { flash = 0.9; flashCol = C.ice; shake = 22; });
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
    c.fillStyle = rgba(C.cyan, 0.55); c.fillRect(0, VH - 4, VW * sat(t / T5), 4);
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
      else scene5(t - T4, dt);
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
      const k = sat((t - HANDOFF) / (T5 - HANDOFF));
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
