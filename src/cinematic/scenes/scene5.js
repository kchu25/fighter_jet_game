/* ===== cinematic/scenes/scene5.js — the mass launch =====
   Four depth planes, each with its own scale, contrast, haze and rate.
   hazeVeil() (the air between the planes) is local to this scene. */
import { I } from './state.js';
import { VW, VH, T4, T5, C, rgba, rnd, sat, ramp, pulse, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, scanlines, vignette, art, dawnSky, neonGround } from './engine.js';

/* ================================================================
   SCENE 5 — the launch that bleeds.  Four depth planes, each with its
   own scale, contrast, haze and rate — but this is not a triumphant
   mass launch anymore.  The swarm that chased us out of the tunnel
   is cutting the wing down as fast as the silos can throw them up.
   By the cut, three birds are still climbing: ours, and the two
   VIPERs who punched through.
   ================================================================ */
export const SILOS = [
  { x: 300, w: 210, at: 0.26 }, { x: 690, w: 250, at: 0.38 },
  { x: 1080, w: 230, at: 0.50 }, { x: 1420, w: 180, at: 0.62 },
  { x: 120, w: 150, at: 0.74 }
];
export const L_FAR = [], L_MID = [], L_NEAR = [];
export const FG5 = [
  { at: 1.00, dir: -1, y: 812, s: 4.4, dur: 0.60, rot: 1.02 },
  { at: 3.00, dir: 1, y: 862, s: 5.3, dur: 0.54, rot: -1.16 }
];
/* which mid-plane climber the wasp band itself takes down (see the
   knot rendering after the near ribbon) */
export const WK_I = 2;
(function () {
  /* far: already up, tiny, hazed, drifting on their own headings */
  for (let i = 0; i < 21; i++) {
    L_FAR.push({
      x: -80 + i * 88 + rnd(-38, 38), y: rnd(-266, -18),
      s: rnd(0.11, 0.20), vx: rnd(13, 34) * (i % 3 ? 1 : -1),
      vy: rnd(-14, -4), rot: rnd(0.10, 0.62) * (i % 3 ? 1 : -1), ph: rnd(0, 6.28)
    });
  }
  /* mid: the launch itself, climbing out of the silos — and, for most
     of them, dying on the way up.  `die` is seconds after their own
     launch when the incoming fire finds them; 0 means they make it
     off-frame (they do not make it far, but not on camera). */
  for (let i = 0; i < 13; i++) {
    const dx = rnd(-340, 340);
    L_MID.push({
      si: i % SILOS.length, at: 0.62 + i * 0.122,
      dx: dx, s0: rnd(0.28, 0.56), climb: rnd(180, 300),
      /* it banks the way it is actually going: no two headings alike */
      rot: dx / 760 + rnd(-0.12, 0.12),
      die: 0, kind: -1, fuse: 0, spin: 0, wob: 7 + (i % 3) * 3
    });
  }
  /* The death roll.  Each kill is a hand-placed beat, not a formula:
       kind 0 — flash-vaporized.  The bolt connects and there is no
                aircraft any more; fuse is the few white-hot frames
                between the hit and there being nothing left.
       kind 1 — clipped, not killed.  It tumbles burning for `fuse`
                seconds, shedding pieces, and THEN detonates mid-fall.
       kind 2 — swatted by the swarm itself: a fist of the near wasp
                band closes over it as it punches up through the
                ribbon.  No plasma lance — the sky did this by hand.
     die-times are tuned so every hit lands at a visible altitude for
     the horizon tilt at that moment, and so the hits/detonations
     interleave into a rising drumbeat instead of stepping on each
     other (or on the radio's 0.35 s rapid-fire guard). */
  const DR = {
    0: { die: 0.86, kind: 0, fuse: 0.06, spin: 0 },                      /* hit 1.48 */
    2: { die: 1.30, kind: 2, fuse: 0.50, spin: 1.2 },                    /* swat 2.16 */
    4: { die: 1.442, kind: 1, fuse: 0.62, spin: 3.2 },                   /* hit 2.55 — VIPER 5 */
    6: { die: 1.68, kind: 0, fuse: 0.07, spin: 0 },                      /* hit 3.03 */
    8: { die: 1.854, kind: 1, fuse: 0.50, spin: -3.8 },                  /* hit 3.45 */
    10: { die: 1.90, kind: 0, fuse: 0.06, spin: 0 }                      /* hit 3.74 */
  };
  for (const k in DR) {
    const m = L_MID[k], d = DR[k];
    m.die = d.die; m.kind = d.kind; m.fuse = d.fuse; m.spin = d.spin;
  }
  /* the featured dead get deterministic trajectories, so their hits
     land where the camera tilt will have put the sky by then */
  L_MID[2].dx = -180; L_MID[2].climb = 250; L_MID[2].s0 = 0.42;   /* dies inside the wasp ribbon */
  L_MID[4].dx = 120; L_MID[4].climb = 195; L_MID[4].s0 = 0.50;   /* VIPER 5: big, centre, watched */
  L_MID[6].dx = -80; L_MID[6].climb = 210;
  L_MID[8].dx = -260; L_MID[8].climb = 190;
  L_MID[10].dx = 200; L_MID[10].climb = 180;
  /* near: fast diagonal departures right across the frame.  hitK marks
     where along its run the incoming fire clips it. */
  L_NEAR.push({ at: 0.48, dir: 1, y0: 700, y1: 128, s0: 2.5, s1: 0.72, dur: 1.12 });
  L_NEAR.push({ at: 1.40, dir: -1, y0: 772, y1: 214, s0: 3.0, s1: 0.86, dur: 0.94 });
  L_NEAR.push({ at: 2.36, dir: 1, y0: 730, y1: 86, s0: 2.7, s1: 0.68, dur: 1.30, hitK: 0.40 });
  /* slow enough that it is still mid-frame when the scene cuts: the last
     thing you see is an aircraft close enough to count the panels on. */
  L_NEAR.push({ at: 3.40, dir: -1, y0: 706, y1: 176, s0: 2.7, s1: 0.80, dur: 1.50 });
})();

/* the comm log: one clipped transmission per loss, lower-left, so the
   ear and the eye agree about every tick of the counter.  `r` is the
   radio-crackle flavour arg; r < 0 means no radio one-shot (that loss
   already landed its thud and two crackles 0.3 s apart would trip the
   sfx rapid-fire guard). */
export const COMMS = [
  { t: 1.50, d: 0.95, r: 0.62, s: "» VIPER 2: WE'RE LIT — BREAK BREAK—" },
  { t: 2.18, d: 0.95, r: 0.40, s: '» VIPER 7: THE SWARM IS IN THE CLIMB LANE—' },
  { t: 3.20, d: 0.85, r: 0.30, s: '» CONTROL: VIPER 5 — CARRIER LOST' },
  { t: 3.50, d: 0.85, r: -1, s: "» VIPER 9: I CAN'T SHAKE TH—" },
  { t: 3.86, d: 0.60, r: 0.48, s: '» CONTROL: ABORT THE CLIMB — ABORT—' }
];

/* the air between the planes.  Warm and thick at the horizon, gone
   overhead — draw it between layers and distance does the rest. */
export function hazeVeil(hz, a) {
  const g = I.c.createLinearGradient(0, hz - 430, 0, hz + 30);
  g.addColorStop(0, 'rgba(132,54,120,0)');
  g.addColorStop(0.52, 'rgba(150,62,124,' + (a * 0.34).toFixed(3) + ')');
  g.addColorStop(0.88, 'rgba(206,80,108,' + (a * 0.72).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,124,88,' + a.toFixed(3) + ')');
  I.c.fillStyle = g; I.c.fillRect(0, hz - 430, VW, 480);
}

export function scene5(u, dt) {
  const A = art();
  const tilt = ramp(0.3, 4.0, u) * 215;
  const hz = 646 + tilt;
  const pan = ramp(0, 4.4, u) * 250;      /* the camera slews; parallax by z */

  once('c5snd', T4 + 0.05, function () {
    sfx('setIntensity', 0.72);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.55);
  });
  once('c5pass1', T4 + 0.94, function () { sfx('jetPass', -1); });
  once('c5pass2', T4 + 1.78, function () { sfx('jetPass', 1); });
  once('c5pass3', T4 + 3.30, function () { sfx('jetPass', 1); });
  /* the ground shock deepens as the field starts taking losses, and a
     riser leans into the cut to scene 6 exactly as the last kill lands */
  once('c5rmb2', T4 + 2.60, function () { if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.72); });
  once('c5riser', T4 + 3.45, function () { sfx('riser', 0.95); });

  stepParts(dt, 0);
  dawnSky(hz, 0);

  /* ---- PLANE 1 (z~0.08): specks.  Low contrast, washed out, slow.
     Each drags a hairline contrail that lengthens with time on camera,
     so the high sky slowly fills with a lattice of crossing tracks —
     the scramble is much bigger than the birds you can count. ---- */
  if (A) for (let i = 0; i < L_FAR.length; i++) {
    const f = L_FAR[i];
    const x = f.x + f.vx * u - pan * 0.05;
    const y = hz + f.y + f.vy * u + Math.sin(u * 0.7 + f.ph) * 3;
    const mv = Math.hypot(f.vx, f.vy) || 1;
    const ln = Math.min(130, (Math.abs(f.vx) + 6) * u * 0.6);
    if (ln > 4) {
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.strokeStyle = rgba(C.white, 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(f.ph)));
      I.c.lineWidth = 1;
      I.c.beginPath();
      I.c.moveTo(x, y);
      I.c.lineTo(x - (f.vx / mv) * ln, y - (f.vy / mv) * ln);
      I.c.stroke();
      I.c.restore();
    }
    I.c.save();
    I.c.globalAlpha = 0.40 + 0.16 * Math.sin(f.ph);
    A.jet(I.c, x, y, f.s, f.rot, 0.45, [188, 128, 168]);
    I.c.restore();
  }
  /* ---- the living half of the strike: bio-wasps pouring across the
     sky in two counter-streaming bands, high over the launch field ---- */
  if (A && A.waspSwarm) {
    A.waspSwarm(I.c, -pan * 0.08 - 100, hz - 470, VW + 200, 90, I.t, 0.45, -1, 0.8);
    A.waspSwarm(I.c, -pan * 0.12 - 100, hz - 336, VW + 200, 130, I.t * 1.25, 0.6, 1, 1.0);
  }
  hazeVeil(hz, 0.40);

  /* the thing the swarm is pouring out of: a colossal tentacled bulk
     looming in the smoke on the horizon, never fully lit */
  if (A && A.leviathan) A.leviathan(I.c, 1230 - pan * 0.18, hz - 44, 0.85, ramp(1.3, 3.3, u) * 0.55, I.t);

  /* a cloud deck between the far and middle distance, so aircraft
     genuinely pass behind something */
  if (A) A.cloudBank(I.c, hz - 244, 98, I.t * 0.55, [120, 40, 130], 0.44);
  hazeVeil(hz, 0.15);

  /* ---- the ground plane ---- */
  neonGround(hz, I.t * 0.5, 0.85);
  for (let i = 0; i < SILOS.length; i++) {
    const s = SILOS[i];
    const open = ramp(s.at, s.at + 0.55, u);
    if (A) A.silo(I.c, s.x - pan * 0.16, hz + 66, s.w, open, C.cyan);
    if (open > 0.4 && Math.random() < 0.4)
      part(s.x - pan * 0.16 + rnd(-s.w / 2, s.w / 2), hz + 60, rnd(-30, 30), rnd(-40, -8),
        rnd(1.2, 2.4), rnd(22, 50), C.smoke, { add: false, d: 0.96, gr: 26 });
  }
  /* launch flashes: every mid-plane departure kicks a flash out of its
     silo mouth.  Drawn UNDER the smoke pool (the smoke particles land
     later in drawParts), so each flash reads as light forcing its way
     up through the column from inside — thirteen of them rolling
     across the field is what makes this a barrage and not a sortie. */
  for (let i = 0; i < L_MID.length; i++) {
    const m = L_MID[i], lk = (u - m.at) / 0.42;
    if (lk <= 0 || lk >= 1) continue;
    const sl = SILOS[m.si];
    const fx2 = sl.x - pan * 0.16, fy = hz + 58;
    const fa = (1 - lk) * (1 - lk);
    I.c.save();
    I.c.globalCompositeOperation = 'lighter';
    /* mouth core: amber blooming out of white */
    I.c.globalAlpha = fa * 0.85;
    const fr = sl.w * (0.30 + 0.55 * lk);
    I.c.drawImage(glow(C.amber), fx2 - fr, fy - fr * 0.7, fr * 2, fr * 1.4);
    I.c.globalAlpha = fa * 0.65;
    I.c.drawImage(glow(C.white), fx2 - fr * 0.4, fy - fr * 0.4, fr * 0.8, fr * 0.8);
    /* the shaft: exhaust light thrown up the inside of the column */
    I.c.globalAlpha = fa * 0.42;
    const sg = I.c.createLinearGradient(0, fy - 260 - 180 * lk, 0, fy);
    sg.addColorStop(0, 'rgba(255,190,90,0)');
    sg.addColorStop(1, 'rgba(255,190,90,0.7)');
    I.c.fillStyle = sg;
    I.c.fillRect(fx2 - 15, fy - 260 - 180 * lk, 30, 260 + 180 * lk);
    I.c.restore();
    /* one-shots per launch: a ring of thrown ejecta smoke lit amber,
       and a floor thud on every fifth bird so the barrage has a pulse
       without burying the kill audio */
    once('c5lp' + i, T4 + m.at, function () {
      for (let e = 0; e < 5; e++)
        part(fx2 + rnd(-sl.w * 0.4, sl.w * 0.4), fy + rnd(-4, 8), rnd(-110, 110), rnd(-70, -16),
          rnd(1.1, 1.8), rnd(16, 34), C.smoke, { add: false, d: 0.95, gr: 30 });
      for (let e = 0; e < 3; e++)
        part(fx2 + rnd(-20, 20), fy, rnd(-80, 80), rnd(-220, -90),
          rnd(0.3, 0.55), rnd(4, 9), C.amber, { d: 0.94, g: 320 });
      if (i % 5 === 0) sfx('thud');
      I.shake = Math.max(I.shake, 4);
    });
  }

  /* ---- PLANE 2 (z~0.4): the launch.  Mid scale, mid rate — and the
     incoming fire finding them one by one as they climb. ---- */
  let lost = 0, lastHit = -9;
  let wkX = 0, wkY = 0, wkSeen = false;
  for (let i = 0; i < L_MID.length; i++) {
    const m = L_MID[i], q = u - m.at;
    if (q < 0) continue;
    const hit = m.die > 0 && q >= m.die;              // the bolt has connected
    const qd = hit ? Math.min(q - m.die, m.fuse) : 0; // tumble time, frozen at the blast
    const qe = m.die > 0 ? q - m.die - m.fuse : -1;   // time since the detonation
    const dead = m.die > 0 && qe >= 0;                // nothing left but the fireball
    if (hit) { lost++; if (m.at + m.die > lastHit) lastHit = m.at + m.die; }
    const qc = hit ? m.die : q;                       // climb time freezes at the hit
    const sl = SILOS[m.si];
    const climb = m.climb * qc + 122 * qc * qc;
    let x = sl.x + m.dx * sat(qc / 2.4) - pan * 0.30 + m.dx * 0.06 * qd;
    let y = hz + 46 - climb + 240 * qd + 380 * qd * qd;
    if (m.kind === 1) x += Math.sin(qd * m.wob) * 30 * qd;   // the spiral: a widening corkscrew
    const sc = Math.max(0.05, m.s0 * (1 - sat(qc / 3.2) * 0.70));
    /* the wasp-kill target point: recomputed from the frozen climb time
       every frame (module state would go stale across replays) so the
       knot renderer after the near ribbon knows exactly where the band
       and the climber's path cross */
    if (i === WK_I) {
      const hc = Math.min(q, m.die);
      const hcl = m.climb * hc + 122 * hc * hc;
      wkX = sl.x + m.dx * sat(hc / 2.4) - pan * 0.30;
      wkY = hz + 46 - hcl;
      wkSeen = true;
    }
    /* the contrail lattice: every climber strokes its whole arc from
       silo mouth to nose, faded toward the launch end.  Costs nothing
       from the particle pool, persists as long as the bird does (and
       thins out over ~1.6 s once it is gone), and by mid-scene the sky
       over the field is a crosshatch of thirteen interleaved arcs. */
    const qEnd = Math.min(q, m.die > 0 ? m.die : q);
    const gf = m.die > 0 ? sat(1 - (q - m.die - m.fuse) / 1.6) : 1;
    if (qEnd > 0.15 && gf > 0.02) {
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      const x0 = sl.x - pan * 0.30, y0 = hz + 46;
      const tg = I.c.createLinearGradient(x0, y0, x, y);
      tg.addColorStop(0, 'rgba(0,0,0,0)');
      tg.addColorStop(1, rgba(C.ice, 0.13 * gf));
      I.c.strokeStyle = tg; I.c.lineWidth = 1.2 + 1.8 * m.s0; I.c.lineCap = 'round';
      I.c.beginPath();
      for (let sgm = 0; sgm <= 5; sgm++) {
        const tq = qEnd * sgm / 5;
        const cl2 = m.climb * tq + 122 * tq * tq;
        const sx = sl.x + m.dx * sat(tq / 2.4) - pan * 0.30;
        const sy = hz + 46 - cl2;
        if (sgm === 0) I.c.moveTo(sx, sy); else I.c.lineTo(sx, sy);
      }
      I.c.stroke();
      I.c.restore();
    }
    if (y < -220 || y > VH + 120) continue;
    /* the bolt that is about to take it: a hard magenta lance from
       above, drawn for the last fraction of a second of its life.
       The wasp-swatted bird gets no lance — the sky does that one
       by hand, and the knot closing over it is its own warning. */
    if (m.die > 0 && m.kind !== 2 && q > m.die - 0.16 && q < m.die + 0.05) {
      const bk = sat((q - (m.die - 0.16)) / 0.16);
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.strokeStyle = rgba(C.mag, 0.85 * bk);
      I.c.lineWidth = 2.5 + 2 * sc; I.c.lineCap = 'round';
      I.c.beginPath();
      I.c.moveTo(x + 170, y - 640 + 640 * bk);
      I.c.lineTo(x + 170 * (1 - bk), y - 640 * (1 - bk));
      I.c.stroke();
      I.c.restore();
    }
    /* ---- the sound and one-shot debris of each kill, latched via
       once() so replays of the cinematic re-arm cleanly ---- */
    if (m.die > 0) {
      const tH = T4 + m.at + m.die, tD = tH + m.fuse;
      if (m.kind !== 2) once('c5z' + i, tH - 0.16, function () { sfx('plasma'); });
      once('c5h' + i, tH, function () {
        /* the HIT.  Not yet the kill for the tumblers — the moment the
           airframe stops being an aircraft and starts being wreckage. */
        I.shake = Math.max(I.shake, 7);
        if (m.kind === 2) {
          /* swatted: a wet green concussion, no plasma crack */
          sfx('thud');
          burst(x, y, 7, 240, C.green, 0.5, 5 + 4 * sc, { d: 0.94 });
          burst(x, y, 3, 160, C.smoke, 0.8, 7 * (sc + 0.3), { add: false, d: 0.95, gr: 20 });
        } else if (m.kind === 1) {
          sfx('thud');
          burst(x, y, 5, 220, C.mag, 0.4, 4 + 3 * sc, { d: 0.94 });
        }
        if (m.kind !== 0) {
          /* it sheds a wing on the way over: one big tumbling hull
             plate plus a couple of glinting fragments, all on gravity */
          part(x, y, rnd(60, 150) * (m.dx > 0 ? -1 : 1), rnd(-160, -60), rnd(1.0, 1.5),
            (6 + 5 * sc), C.steel, { sq: true, vr: rnd(7, 12) * (i % 2 ? 1 : -1), g: 430, d: 0.985, a: 0.95 });
          for (let e = 0; e < 2; e++)
            part(x, y, rnd(-140, 140), rnd(-120, 40), rnd(0.5, 0.8), rnd(2.5, 4.5), C.amber, { d: 0.93, g: 380 });
        }
      });
      once('c5d' + i, tD, function () {
        /* the DETONATION — sized and voiced by kind */
        if (m.kind === 0) {
          sfx('explode', 1.45);
          I.shake = Math.max(I.shake, 13);
          I.flash = Math.max(I.flash, 0.20); I.flashCol = C.orange;
          burst(x, y, 14 + 8 * sc, 280 + 220 * sc, C.orange, 0.7, 5 + 6 * sc, { d: 0.95 });
          burst(x, y, 6, 340, C.white, 0.35, 4 + 3 * sc, { d: 0.94 });
        } else if (m.kind === 1) {
          sfx('explode', 1.2);
          I.shake = Math.max(I.shake, 11);
          burst(x, y, 12 + 6 * sc, 260 + 180 * sc, C.orange, 0.7, 5 + 5 * sc, { d: 0.95 });
          burst(x, y, 5, 240, C.mag, 0.4, 4 + 4 * sc, { d: 0.95 });
        } else {
          sfx('explode', 0.95);
          I.shake = Math.max(I.shake, 9);
          burst(x, y, 9 + 5 * sc, 230 + 160 * sc, C.orange, 0.65, 5 + 4 * sc, { d: 0.95 });
          burst(x, y, 5, 200, C.green, 0.45, 4 + 3 * sc, { d: 0.94 });
        }
        /* what every blast leaves behind: a hanging smudge that the
           later kills then light up from behind, and embers on gravity */
        for (let e = 0; e < 3; e++)
          part(x + rnd(-14, 14), y + rnd(-10, 10), rnd(-24, 24), rnd(-36, 10),
            rnd(1.5, 2.2), rnd(14, 26) * (sc + 0.4), C.smoke, { add: false, d: 0.965, gr: 26 });
        for (let e = 0; e < 3; e++)
          part(x, y, rnd(-120, 120), rnd(-140, -20), rnd(0.8, 1.3), rnd(2, 4),
            C.orange, { d: 0.96, g: 400 });
      });
    }
    /* ---- the four ways a climber can look this frame ---- */
    if (dead) {
      /* post-detonation: a fast expanding shock ring and a collapsing
         core where the aircraft used to be.  After 0.3 s there is only
         the smoke the once() left in the pool. */
      if (qe < 0.30) {
        const rk = qe / 0.30;
        I.c.save();
        I.c.globalCompositeOperation = 'lighter';
        const big = m.kind === 0 ? 1.3 : 1.0;
        I.c.globalAlpha = (1 - rk) * 0.85;
        const fr2 = (34 + 150 * rk) * (sc + 0.45) * big;
        I.c.drawImage(glow(C.orange), x - fr2, y - fr2, fr2 * 2, fr2 * 2);
        if (qe < 0.12) {
          I.c.globalAlpha = (1 - qe / 0.12);
          const wr = 26 * (sc + 0.5) * big;
          I.c.drawImage(glow(C.white), x - wr, y - wr, wr * 2, wr * 2);
        }
        I.c.globalAlpha = (1 - rk) * 0.5;
        I.c.strokeStyle = rgba(m.kind === 2 ? C.green : C.amber, 1);
        I.c.lineWidth = 2.5;
        I.c.beginPath();
        I.c.arc(x, y, (16 + 240 * rk) * (sc + 0.4) * big, 0, 6.2832);
        I.c.stroke();
        I.c.restore();
      }
      continue;                                        // no airframe left to draw
    }
    if (hit && m.kind === 0) {
      /* flash-vaporize: for a few frames the whole silhouette burns
         white and a cross-flare blows out of it, then the detonation
         once() erases it.  No tumble, no wreck — just gone. */
      const vk = sat(qd / m.fuse);
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = 0.9;
      if (A) A.jet(I.c, x, y, sc, m.rot * sat(qc / 1.5), 0, [255, 255, 255]);
      const fl = (60 + 120 * vk) * (sc + 0.4);
      I.c.strokeStyle = rgba(C.white, 0.9 - 0.4 * vk); I.c.lineWidth = 2; I.c.lineCap = 'round';
      I.c.beginPath();
      I.c.moveTo(x - fl, y); I.c.lineTo(x + fl, y);
      I.c.moveTo(x, y - fl * 0.55); I.c.lineTo(x, y + fl * 0.55);
      I.c.stroke();
      const wr = 30 * (sc + 0.5);
      I.c.drawImage(glow(C.white), x - wr, y - wr, wr * 2, wr * 2);
      I.c.restore();
      continue;
    }
    if (hit) {
      /* the tumble: kind 1 winds up into a fast spiral, kind 2 comes
         off the swat in a flat wobbling spin.  Alpha flickers as the
         hull rolls its lit side away from the sun. */
      const rot = m.kind === 1
        ? m.rot * sat(qc / 1.5) + m.spin * qd * (2.0 + 6.0 * qd)
        : m.rot * sat(qc / 1.5) + Math.sin(qd * 9) * 0.9 + qd * m.spin;
      I.c.save();
      I.c.globalAlpha = 0.9 * (0.78 + 0.22 * Math.sin(qd * 34 + i * 2));
      if (A) A.jet(I.c, x, y, sc, rot, 0, [96, 84, 92]);
      I.c.restore();
      /* the burning fall: a RAGGED plume, not a column.  The stutter
         gate opens and shuts as it tumbles (burning side up, burning
         side away), sizes swing wide, and the smoke is thrown off the
         spin instead of laid neatly behind. */
      if (Math.sin(q * 41 + i * 1.7) > -0.35) {
        part(x + rnd(-9, 9), y + rnd(-10, 2), rnd(-40, 40) + m.dx * 0.05, rnd(-70, 10),
          rnd(0.6, 1.2), rnd(5, 17) * (sc + 0.3), C.smoke, { add: false, d: 0.97, gr: rnd(10, 28) });
        if (Math.random() < 0.55)
          part(x + rnd(-6, 6), y, rnd(-50, 50), rnd(-40, 30), rnd(0.2, 0.4),
            rnd(4, 9) * (sc + 0.3), Math.random() < 0.3 ? C.amber : C.orange, { d: 0.93, gr: 8 });
      }
      /* and it keeps shedding: glinting hull chips spun off on gravity */
      if (Math.random() < 0.12)
        part(x, y, rnd(-160, 160), rnd(-60, 40), rnd(0.6, 1.0), rnd(2, 3.5) * (sc + 0.4),
          C.steel, { sq: true, vr: rnd(-13, 13), g: 460, d: 0.985, a: 0.85 });
      continue;
    }
    /* still climbing */
    I.c.save();
    I.c.globalAlpha = 0.90;
    if (A) A.jet(I.c, x, y, sc, m.rot * sat(qc / 1.5), 1, [116, 148, 196]);
    I.c.restore();
    /* Sub-step the contrail.  These climb at ~700 px/s by the top of
       the arc, so one particle per frame lands them ~12 px apart and
       the trail reads as a dotted line rather than a column of gas.
       Two per frame now (the stroked lattice arc above carries the
       persistence for free), which funds the death debris elsewhere
       in this loop without brushing the pool cap. */
    const dy = (m.climb + 244 * qc) / 60;
    for (let k = 0; k < 2; k++) {
      const f = k / 2;
      part(x + rnd(-2, 2), y + 30 * sc + dy * f, rnd(-20, 20), 185 + 150 * q,
        rnd(0.4, 0.9), rnd(5, 13) * (sc + 0.30), i % 4 ? C.cyan : C.white,
        { d: 0.93, gr: 12, a: 0.5 });
    }
  }

  drawParts(false); drawParts(true);
  hazeVeil(hz, 0.07);

  /* a nearer ribbon of the swarm sweeping across the middle air — the
     climbers are punching up through this */
  if (A && A.waspSwarm)
    A.waspSwarm(I.c, -pan * 0.4 - 150, 296, VW + 300, 190, I.t * 1.5, 0.32, 1, 1.6);
  /* the fist: a dense knot of the same band that breaks out of the
     ribbon, slides across, and closes over climber WK_I at exactly its
     die-time — the one kill the sky makes with its hands instead of a
     bolt.  Rendered with waspSwarm itself squeezed into a small moving
     window, so it is literally the band's own creatures; the bell
     curve dips it from the ribbon's altitude onto the crossing point
     and back as it passes. */
  if (A && A.waspSwarm && wkSeen) {
    const wm = L_MID[WK_I];
    const w0 = wm.at + wm.die - 0.55, w1 = wm.at + wm.die + 0.38;
    if (u > w0 && u < w1) {
      const kk = (u - w0) / (w1 - w0);
      const KH = 0.55 / 0.93;                      // window fraction at the swat
      const bell = Math.exp(-Math.pow((kk - KH) / 0.26, 2));
      const kx = wkX + (kk - KH) * 640;
      const ky = 296 + (wkY - 296) * bell;
      const ka = Math.pow(Math.sin(kk * Math.PI), 0.7) * 0.6;
      A.waspSwarm(I.c, kx - 84, ky, 168, 66, I.t * 2.4, ka, 1, 0.9);
    }
  }

  /* ---- PLANE 3 (z~0.8): near.  Dark, saturated, and gone in a
     second — they overtake and cross in front of everything.  Their
     trails outlive them: once a bird is off-frame its track hangs and
     thins for another second-and-a-bit, stacking the big diagonal
     strokes of the lattice. ---- */
  for (let i = 0; i < L_NEAR.length; i++) {
    const n = L_NEAR[i], kRaw = (u - n.at) / n.dur;
    if (kRaw <= 0) continue;
    const gone = kRaw >= 1;
    const k = Math.min(kRaw, 1);
    function px(kk) { return 800 + n.dir * (kk - 0.5) * 2300 - pan * 0.55; }
    function py(kk) {
      let yy = n.y0 + (n.y1 - n.y0) * (kk * kk * 0.7 + kk * 0.3);
      /* clipped mid-run: the climb-out breaks and it falls away */
      if (n.hitK && kk > n.hitK) { const dk = kk - n.hitK; yy += 1500 * dk * dk; }
      return yy;
    }
    const x = px(k), y = py(k), sc = n.s0 + (n.s1 - n.s0) * k;
    const struck = n.hitK && k > n.hitK;
    if (n.hitK && kRaw > n.hitK) {
      /* the near kill counts on the same board as the mid-plane ones */
      lost++;
      if (n.at + n.hitK * n.dur > lastHit) lastHit = n.at + n.hitK * n.dur;
    }
    if (n.hitK) {
      once('c5nearZ', T4 + n.at + (n.hitK - 0.07) * n.dur, function () { sfx('plasma'); });
      once('c5nearhit', T4 + n.at + n.hitK * n.dur, function () {
        sfx('explode', 1.4); sfx('thud');
        I.shake = Math.max(I.shake, 18);
        I.flash = Math.max(I.flash, 0.3); I.flashCol = C.orange;
        burst(x, y, 22, 700, C.orange, 0.7, 10, { d: 0.96 });
        burst(x, y, 10, 500, C.mag, 0.45, 8, { d: 0.96 });
        /* this close, the wing it loses is a set piece of its own */
        part(x, y, -n.dir * rnd(180, 300), rnd(-260, -120), 1.4, 9 * sc * 0.4,
          C.steel, { sq: true, vr: rnd(9, 14), g: 520, d: 0.985, a: 0.95 });
      });
    }
    /* the trail lies along the actual heading, so the bank reads right;
       a longer sampled window than the old two-point segment, so the
       curve of the climb-out (and the broken arc of the struck one)
       survives into the hanging track */
    const fade = gone ? sat(1 - (kRaw - 1) * n.dur / 1.3) : 1;
    if (fade > 0.02) {
      const k0 = Math.max(0, k - 0.55);
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      const cg = I.c.createLinearGradient(px(k0), py(k0), x, y);
      cg.addColorStop(0, 'rgba(0,0,0,0)');
      cg.addColorStop(0.72, rgba(C.cyan, 0.18 * fade));
      cg.addColorStop(1, rgba(C.ice, 0.42 * fade));
      I.c.strokeStyle = cg; I.c.lineCap = 'round'; I.c.lineWidth = 9 * sc;
      I.c.beginPath();
      for (let sgm = 0; sgm <= 7; sgm++) {
        const kk = k0 + (k - k0) * sgm / 7;
        if (sgm === 0) I.c.moveTo(px(kk), py(kk)); else I.c.lineTo(px(kk), py(kk));
      }
      I.c.stroke();
      I.c.restore();
    }
    if (gone) continue;                              // airframe left; track lingers
    const kp = Math.max(0, k - 0.10), xp = px(kp), yp = py(kp);
    const rot = n.dir * (0.66 - 0.34 * k) + (struck ? (k - n.hitK) * 3.4 * n.dir : 0);
    if (A) {
      I.c.save(); I.c.globalAlpha = 0.30;
      A.jet(I.c, x - (x - xp) * 0.22, y - (y - yp) * 0.22, sc, rot, struck ? 0 : 1, [70, 96, 140]);
      I.c.restore();
      A.jet(I.c, x, y, sc, rot, struck ? 0 : 1, struck ? [96, 84, 92] : [82, 112, 158]);
    }
    if (struck && Math.random() < 0.85)
      part(x, y, rnd(-60, 60), rnd(-80, 40), rnd(0.5, 1.1), rnd(10, 24) * sc * 0.5,
        Math.random() < 0.4 ? C.orange : C.smoke, { add: Math.random() < 0.4, d: 0.96, gr: 26 });
    I.shake = Math.max(I.shake, 6 * Math.sin(sat(k) * Math.PI));
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
      I.c.save();
      I.c.globalAlpha = g === 0 ? 1 : 0.20 / g;
      if (A) A.jet(I.c, 800 + f.dir * (kk - 0.5) * 3500,
        yb - Math.sin(kk * Math.PI) * 56, f.s, f.rot, 1, [46, 62, 92]);
      I.c.restore();
    }
    for (let q2 = 0; q2 < 5; q2++)
      part(800 + f.dir * (k - 0.62) * 3500, yb - 70 + rnd(-46, 46),
        -f.dir * rnd(320, 940), rnd(-140, 70), rnd(0.2, 0.46), rnd(14, 34),
        q2 ? C.cyan : C.white, { d: 0.90, gr: 42, a: 0.7 });
    I.shake = Math.max(I.shake, 17 * Math.sin(k * Math.PI));
  }

  if (u > 0.45 && u < 2.2) {
    const a = ramp(0.45, 0.95, u) * (1 - ramp(1.7, 2.2, u));
    txt('SILO CLUSTER 7  —  SCRAMBLE THROUGH THE SWARM', VW / 2, 118, 24,
      rgba(C.cyan, a * 0.9), 7, 'center');
  }
  /* one of them does not make it — heard, not just seen.  This is
     VIPER 5, the kind-1 spiral at i=4: the mayday keys the instant the
     bolt clips it (2.55) and the carrier dies mid-word at 3.17, the
     exact frame its airframe detonates.  CONTROL's flat "CARRIER
     LOST" then lands in the comm log three frames later. */
  once('c5mayday', T4 + 2.55, function () { sfx('radio', 1.0); });
  if (u > 2.55 && u < 3.20) {
    const a = ramp(2.55, 2.75, u) * (u < 3.14 ? 1 : sat(1 - (u - 3.14) / 0.06));
    txt("» VIPER 5: MAYDAY MAYDAY — I'M HIT, I'M—", VW / 2, 756, 21,
      rgba(C.orange, a * 0.9), 5, 'center');
  }
  /* the comm log: every loss lands one clipped transmission lower-left,
     latest wins, each with its own crackle (or riding the thud its
     kill already made — see COMMS.r). */
  for (let i = 0; i < COMMS.length; i++) {
    const cm = COMMS[i];
    if (cm.r >= 0) once('c5cm' + i, T4 + cm.t, function () { sfx('radio', cm.r); });
    if (u > cm.t && u < cm.t + cm.d + 0.22) {
      const a = ramp(cm.t, cm.t + 0.10, u) * (1 - ramp(cm.t + cm.d, cm.t + cm.d + 0.22, u));
      txt(cm.s, 64, 838, 15, rgba(C.ice, a * 0.72), 3);
    }
  }
  /* the tally that sets up the whole game: everyone else is dying on
     the way up.  It POPS on every tick — the hit lands, the counter
     jumps, the radio spits, all in the same beat. */
  if (lost > 0) {
    const pop = 1 - sat((u - lastHit) / 0.42);
    const a = 0.55 + 0.45 * pulse(u, 2.6);
    const ty = (u < 2.2 ? 162 : 118) + 2 * pop;
    txt('⚠ INTERCEPTORS LOST: 0' + lost, VW / 2, ty, 26 + 9 * pop * pop,
      rgba(C.red, Math.min(1, a + 0.5 * pop)), 8, 'center', 'bold');
    if (pop > 0.55) {
      I.c.save();
      I.c.globalCompositeOperation = 'lighter';
      txt('⚠ INTERCEPTORS LOST: 0' + lost, VW / 2, ty, 26 + 9 * pop * pop,
        rgba(C.white, (pop - 0.55) * 1.1), 8, 'center', 'bold');
      I.c.restore();
    }
  }
  if (u > 3.55) {
    const a = ramp(3.55, 3.95, u);
    txt('INTERCEPTOR 03 +2 — STILL CLIMBING', VW / 2, 806, 22,
      rgba(C.cyan, a * 0.85), 7, 'center');
  }
  scanlines(0.10);
  vignette(0.62);
  const fo = ramp(T5 - 0.45, T5, u + T4);
  if (fo > 0) { I.c.fillStyle = 'rgba(0,0,0,' + fo * 0.85 + ')'; I.c.fillRect(0, 0, VW, VH); }
}
