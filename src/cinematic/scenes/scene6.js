/* ===== cinematic/scenes/scene6.js — the encounter =====
   Hands off to the 3D game underneath as the canvas fades (see
   engine.js's frame(), which drives the HANDOFF timing).

   Not everyone died on the way up.  Most of the wing falls away
   stricken — but two VIPERs punch through the swarm, catch our wing,
   and hold it: the same VIPER flight that joins the player in
   gameplay.  Ahead, the hive itself rises out of the horizon smoke.

   The 7 seconds run as four overlapping movements:
     0.0 .. 1.8   JEOPARDY — the survivors tumble toward camera on
                  guttering engines, trailing smoke, spinning;
     1.3 .. 2.7   RECOVERY — each punches its burner (a flare, a
                  jetPass whoosh), kills the spin, slides into slot;
     2.6 .. 5.0   MENACE  — the alien wall wakes: ignition lights run
                  down the line, charge orbs bloom on the prongs, one
                  ship takes a ranging shot that streaks past the
                  formation; the hive unfurls limbs and pulses on a
                  bass beat;
     3.7 .. 6.3   THE LINE — god-rays crown the player jet and the
                  mission text lands with a spacing ramp + flicker.

   Scene runs u = 0 .. 7.0 (T5 .. T6); handoff fade starts at
   u = 6.38 (HANDOFF = T6 - 0.62).  SACRED: the c6flash beat at
   u = 6.05 and everything the engine does after HANDOFF are timing
   contracts with the live game — do not move them. */
import { I } from './state.js';
import { VW, VH, T5, C, rgba, rnd, sat, ramp, once, sfx, glow, txt,
  part, stepParts, drawParts, burst, scanlines, vignette, art, dawnSky, neonGround } from './engine.js';
/* the charge-orb sprite the warships aim with — same drawing the
   warship uses at its own prong tips, reused here as the head of the
   ranging bolt so the projectile is visibly "one of those orbs, loose".
   EXISTING signature: warshipChargeOrb(c, tx, ty, charge, tt, side). */
import { warshipChargeOrb } from '../art/warship.js';

/* ================================================================
   SCENE 6 — the encounter, handing off to the 3D game
   ================================================================ */
export const WING = [];
(function () {
  const lay = [[-1, 0], [1, 0], [-2, 1], [2, 1], [-3, 1.8], [3, 1.8], [-1.6, 2.6], [1.6, 2.6], [0, 3.2]];
  for (let i = 0; i < lay.length; i++)
    WING.push({ x0: 800 + lay[i][0] * 86, y0: 430 + lay[i][1] * 26, s0: 0.16 + lay[i][1] * 0.03, k: 1 + i * 0.06 });
})();
/* the two that made it: WING indices -> slot offset from the player.
   These are VIPER 2 and VIPER 4 — the flight that rejoins in-game. */
export const SURV = { 1: [-172, 30], 4: [178, 50] };
/* per-survivor drama: `rec` is the second each one firewalls the
   burner and arrests its tumble (VIPER 2 first — its radio call at
   0.95 is the wind-up, the burn at 1.30 is the payoff; VIPER 4
   recovers later and calls in after).  `pan` steers its jetPass
   whoosh to its side of the frame; `sd` de-syncs the flicker maths. */
export const SURVD = { 1: { rec: 1.30, pan: -0.7, sd: 2.1 }, 4: { rec: 1.72, pan: 0.7, sd: 5.3 } };
export const ALIENS = [];
(function () {
  for (let i = 0; i < 15; i++)
    ALIENS.push({ x: 90 + i * 100 + rnd(-34, 34), d: 1.1 + i * 0.14, s: rnd(0.4, 0.72), yo: rnd(-46, 26) });
})();
/* which ship in the wall takes the ranging shot: an early riser on
   the left flank, so it is big enough on screen to read as the shooter
   and the bolt gets the full width of the frame to cross. */
export const SHOOTER = 3;
/* the hive's far limbs, reaching up over the horizon as it grows —
   drawn by this scene AROUND the leviathan sprite (whose own tentacles
   hang below the carapace) so the reveal is an unfurl, not a zoom.
   dl staggers each limb's reach so they wake one after another. */
export const HLIMB = [];
(function () {
  for (let i = 0; i < 6; i++)
    HLIMB.push({
      rx: (i % 2 ? 1 : -1) * (110 + i * 22) + rnd(-18, 18),
      dir: i % 2 ? 1 : -1,
      len: 150 + rnd(0, 120),
      w: 10 + rnd(0, 8),
      sway: rnd(26, 60),
      ph: rnd(0, 6.28),
      dl: i * 0.34 + rnd(0, 0.22)
    });
})();
/* the survivors' side of the net, typed out radio-style */
export const RD6_X = 96, RD6_Y = 138;
export const RADIO6 = [
  { s: '» VIPER 2: AIRBORNE — FORMING ON YOU', at: 0.95, cps: 58, u: 0.5 },
  { s: '» VIPER 4: STILL WITH YOU, 03', at: 2.05, cps: 58, u: 0.45 }
];
export const S6MSG = 'INTERCEPTOR 03 — LEAD THE SURVIVORS. HUNT THE HIVE.';

/* ranging-shot bookkeeping: shotTip tracks the shooter's live prong
   tip every frame (from warship()'s documented return), shotFrom
   freezes it at the instant of firing so the bolt flies a straight
   line from where the muzzle actually was. */
let shotTip = null, shotFrom = null;

/* ---- the flight path, factored into pure functions of scene time.
   The survivors' fall/recovery arc and the player's climb are all
   analytic, which buys the wingtip streamers for free: sampling the
   same functions a few hundredths of a second in the past gives an
   exact ribbon of "where the wingtip just was" with no history
   buffers.  These MUST stay byte-identical to the maths the main loop
   uses, or the streamers detach from the tips. ---- */
function accf(uu) { return ramp(0.25, 3.4, uu); }
function pjYf(uu) { return 692 - accf(uu) * 92 + Math.sin(uu * 1.5) * 6; }
function survPos(i, uu) {
  const w = WING[i], sv = SURV[i], D = SURVD[i];
  const ac = accf(uu);
  const q = Math.min(0.32, ac * w.k);           // the fall it recovers from
  const form = ramp(0.85, 2.70, uu);            // the recovery + join
  const fx = 800 + (w.x0 - 800) * (1 + q * 3.4);
  const fy = w.y0 + q * 560 + q * q * 220;
  const fs = w.s0 * (1 + q * 5.2);
  const tx = 800 + sv[0] + Math.sin(uu * 1.1 + i) * 7;
  const ty = pjYf(uu) + sv[1] + Math.sin(uu * 1.6 + i * 2.1) * 9;
  /* rec: 0 before its burner lights, eased to 1 over the half second
     after — this is what kills the tumble, NOT the slower form ramp,
     so the stabilisation visibly happens AT the burn */
  const rec = sat((uu - D.rec) / 0.55);
  const tum = (1 - rec) * (0.35 + 0.65 * (1 - form));
  /* banks hard out of the dive, settles level with us — plus a real
     tumble while it is still falling: a fast wobble that the recovery
     burn damps out inside half a second */
  const rot = (1 - form) * (w.x0 - 800) * 0.004
    + Math.sin(uu * 0.9 + i) * 0.05
    + Math.sin(uu * (6.2 + i * 0.7) + D.sd) * 0.5 * tum;
  return {
    x: fx + (tx - fx) * form,
    y: fy + (ty - fy) * form,
    s: fs + (1.30 - fs) * form,
    rot: rot, form: form, rec: rec
  };
}
/* the hive's heartbeat: a sharp attack / exponential-decay envelope on
   a fixed grid.  The grid starts at 3.34 — exactly when the 'warp'
   cue scheduled at 2.62 lands its arrival thump (warp()'s descent
   takes 0.72s), so the first visible pulse of the hive is also the
   first thing you HEAR of it, and the rumble kicks below ride the
   same grid.  Ramps in over the first three beats. */
function beatEnv(uu) {
  if (uu < 3.34) return 0;
  const p = (uu - 3.34) / 0.72;
  const f = p - Math.floor(p);
  return Math.exp(-4.2 * f) * Math.min(1, 0.4 + p * 0.3);
}

export function scene6(u, dt) {
  const A = art();
  const hz = 470;
  const acc = accf(u);
  const be = beatEnv(u);
  const pjY = pjYf(u);

  once('c6snd', T5 + 0.05, function () {
    sfx('setIntensity', 0.9);
    if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.8);
  });
  once('c6riser', T5 + 3.90, function () { sfx('riser', 2.7); });
  /* the wall waking up: warp's screaming descent starts here and its
     arrival thump lands at +0.72 — the downbeat of the hive's pulse
     grid and the frame the ignition wave is sweeping the line */
  once('c6warp', T5 + 2.62, function () { sfx('warp'); });
  /* bass beats: kick the existing rumble bed up on each hive pulse and
     let it settle a quarter-second later.  rumble.set() slews with a
     0.15s time constant, so this reads as a heavy sub throb, not a
     click.  Two latches per beat, five beats to the handoff. */
  for (let b = 0; b < 5; b++) {
    once('c6bt' + b, T5 + 3.34 + b * 0.72, function () {
      if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(1.0);
    });
    once('c6btd' + b, T5 + 3.60 + b * 0.72, function () {
      if (I.rumbleH && I.rumbleH.set) I.rumbleH.set(0.8);
    });
  }

  dawnSky(hz, 0.6);
  if (A) A.cloudBank(I.c, hz - 120, 96, I.t * 0.6, [110, 34, 120], 0.38);
  neonGround(hz, I.t * 2.2 + acc * 6, 0.9);

  /* alien wall on the horizon — and, from 2.6 on, its menace beat:
     an ignition flash runs ship-to-ship down the line (85ms apart, a
     visible wave of the fleet powering up), then every ship starts
     feeding its prong orbs via warship()'s charge argument. */
  for (let i = 0; i < ALIENS.length; i++) {
    const al = ALIENS[i], q = sat((u - al.d) / 4.4);
    if (q <= 0) continue;
    const s = al.s * (0.05 + q * q * 0.95);
    const y = hz + al.yo - 8 + q * 44;
    /* -- ignition pop: a wide, flat violet flare behind the hull that
       spikes and dies in half a second.  Drawn BEFORE the ship so the
       silhouette punches out of its own light. -- */
    const igT = 2.62 + i * 0.085;
    const pop = u > igT ? Math.max(0, 1 - (u - igT) / 0.55) : 0;
    if (pop > 0.01) {
      I.c.save(); I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = 0.6 * pop * pop;
      I.c.drawImage(glow(C.violet), al.x - 170 * s - 40, y - 30 * s - 14, 340 * s + 80, 60 * s + 28);
      I.c.globalAlpha = 0.75 * pop * pop;
      I.c.drawImage(glow(C.white), al.x - 70 * s - 16, y - 12 * s - 6, 140 * s + 32, 24 * s + 12);
      I.c.restore();
    }
    /* -- prong charge: the SHOOTER runs its orbs to full and fires at
       4.52 (they die away discharged); the rest of the line blooms to
       a partial, staggered charge and HOLDS it into the handoff — the
       threat the player is about to fly into. -- */
    const h = 0.5 + 0.5 * Math.sin(i * 7.3);
    let ch;
    if (i === SHOOTER) ch = u > 4.52 ? Math.max(0, 1 - (u - 4.52) * 3) : ramp(3.35, 4.42, u);
    else ch = ramp(3.6 + h * 0.5, 5.2, u) * (0.30 + 0.35 * h);
    const ret = A ? A.warship(I.c, al.x, y, s, Math.min(1, q * 3), ch, I.t) : null;
    if (i === SHOOTER && ret && ret.tips) shotTip = ret.tips[1];
    /* -- once lit, a running underglow that breathes on the hive's
       beat, tying the whole wall to the same heartbeat -- */
    if (u > igT + 0.4) {
      I.c.save(); I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = (0.10 + 0.16 * be) * q;
      I.c.drawImage(glow(C.mag), al.x - 80 * s, y - 10 * s, 160 * s, 40 * s);
      I.c.restore();
    }
    if (q > 0.55 && Math.random() < 0.02) {
      I.c.save(); I.c.globalCompositeOperation = 'lighter';
      I.c.drawImage(glow(C.mag), al.x - 60, y - 60, 120, 120);
      I.c.restore();
    }
  }
  /* and, dead centre, the thing that owns them: the hive leviathan
     rising out of the horizon smoke, growing the whole scene — and
     PULSING: its scale and altitude ride the beat envelope, so the
     growth reads as a thing breathing itself larger, not a zoom */
  const lq = ramp(1.5, 5.4, u);
  const hs = 0.42 + lq * 1.05 + be * 0.045 * lq;   // beat pump on the scale
  const hy = hz + 58 - lq * 76 - be * 5 * lq;      // it lifts on each pulse
  const hA = Math.min(1, lq * 2.4) * 0.85;
  if (lq > 0.01) {
    /* -- far limbs unfurling over the horizon.  Segmented quadratics
       like the leviathan's own tentacles, but REACHING: each one's
       endpoint extends with its own staggered ramp, so over 2.2-5.6s
       the silhouette visibly opens like a hand.  Drawn before the
       leviathan so the carapace buries the roots. -- */
    I.c.save();
    I.c.lineCap = 'round';
    for (let i = 0; i < HLIMB.length; i++) {
      const L = HLIMB[i];
      const ext = ramp(2.25 + L.dl, 4.4 + L.dl, u);
      if (ext <= 0.01) continue;
      const rx = 800 + L.rx * hs, ry = hy + 26 * hs;
      const sw = Math.sin(u * 0.5 + L.ph) * L.sway * 0.5;
      const ex = rx + L.dir * (60 + L.len * 0.75 * ext) * hs + sw * hs;
      const ey = ry - L.len * ext * hs * (0.95 + 0.1 * Math.sin(u * 0.8 + L.ph));
      const cx = rx + L.dir * 30 * hs + sw * 0.4 * hs;
      const cy = ry - L.len * ext * hs * 0.5;
      let lx = rx, ly = ry;
      for (let k = 1; k <= 6; k++) {
        const t = k / 6, mt = 1 - t;
        const qx = mt * mt * rx + 2 * mt * t * cx + t * t * ex;
        const qy = mt * mt * ry + 2 * mt * t * cy + t * t * ey;
        const v = 1 - t * 0.6;                    // value falls off tipward
        I.c.strokeStyle = 'rgba(' + (30 * v + 6 | 0) + ',' + (13 * v + 3 | 0) + ',' +
          (26 * v + 6 | 0) + ',' + (hA * (0.9 - t * 0.3)).toFixed(3) + ')';
        I.c.lineWidth = Math.max(0.8, L.w * hs * (1 - t * 0.8));
        I.c.beginPath(); I.c.moveTo(lx, ly); I.c.lineTo(qx, qy); I.c.stroke();
        lx = qx; ly = qy;
      }
      /* sickly tip-light flaring on the beat: proof of a pulse, not a
         scale animation */
      if (i % 2 === 0 && be > 0.05) {
        I.c.save(); I.c.globalCompositeOperation = 'lighter';
        const tr = (7 + 9 * be) * hs;
        I.c.globalAlpha = 0.30 * be * hA;
        I.c.drawImage(glow(C.green), lx - tr, ly - tr, tr * 2, tr * 2);
        I.c.restore();
      }
    }
    I.c.restore();
    if (A && A.leviathan) A.leviathan(I.c, 800, hy, hs, hA, I.t);
    /* the beat itself made visible: a bio-light bloom out of the smoke
       under the carapace, in sync with the rumble kicks */
    if (be > 0.04) {
      I.c.save(); I.c.globalCompositeOperation = 'lighter';
      I.c.globalAlpha = 0.22 * be * hA;
      I.c.drawImage(glow(C.green), 800 - 260 * hs, hy - 200 * hs, 520 * hs, 340 * hs);
      I.c.globalAlpha = 0.16 * be * hA;
      I.c.drawImage(glow(C.mag), 800 - 150 * hs, hy - 90 * hs, 300 * hs, 200 * hs);
      I.c.restore();
    }
  }
  /* the swarm streaming off it, over our heads */
  if (A && A.waspSwarm) {
    const swa = ramp(1.9, 3.4, u);
    A.waspSwarm(I.c, -120, 210, VW + 240, 130, I.t * 1.3, 0.40 * swa, -1, 1.1);
    A.waspSwarm(I.c, -120, 356, VW + 240, 90, I.t, 0.28 * swa, 1, 0.8);
  }

  /* the player's interceptor: position first, drawn after the wing so
     the survivors tuck in behind and beside it */
  const pjS = 2.35 - acc * 0.85;

  /* most of the wing, falling away behind us — stricken, trailing
     smoke, dropping out of the fight one by one.  But not all of it:
     the two SURV slots punch through, arrest the fall, and slide up
     into formation on our wing instead. */
  for (let i = 0; i < WING.length; i++) {
    const w = WING[i];
    const sv = SURV[i];
    if (sv) {
      /* survivor: same fall-toward-camera start, caught mid-arc and
         eased into the slot beside the player — but now it EARNS the
         recovery: engine guttering, smoke, tumble, then the burn. */
      const D = SURVD[i];
      const P = survPos(i, u);
      const x = P.x, y = P.y, s = P.s;
      /* engine state: a coughing, flickering fraction of thrust while
         it falls, slammed to full the instant the recovery burn fires */
      const gut = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(u * 23 + D.sd * 4)) *
        (0.5 + 0.5 * Math.sin(u * 7.7 + D.sd));
      const th = gut + (1 - gut) * P.rec;
      /* the burn itself: one latched flare + whoosh per survivor, at
         its own moment (VIPER 2 at 1.30, VIPER 4 at 1.72) */
      once('c6rec' + i, T5 + D.rec, function () {
        sfx('jetPass', D.pan);
        I.shake = Math.max(I.shake, 5);
        burst(x, y, 14, 260 * (s * 0.4 + 0.6), C.cyan, 0.5, 6 * (s * 0.5 + 0.5), { d: 0.93 });
        burst(x, y, 6, 200, C.white, 0.35, 5, { d: 0.93 });
      });
      /* flare bloom for the half second after the burn — an expanding,
         fading sheet of light that silhouettes the recovering jet */
      if (P.rec > 0 && P.rec < 1) {
        const e = 1 - P.rec;
        const fr = (46 + 130 * P.rec) * (s * 0.5 + 0.5);
        I.c.save(); I.c.globalCompositeOperation = 'lighter';
        I.c.globalAlpha = 0.7 * e;
        I.c.drawImage(glow(C.ice), x - fr, y - fr, fr * 2, fr * 2);
        I.c.globalAlpha = 0.9 * e;
        I.c.drawImage(glow(C.cyan), x - fr * 0.5, y + 26 * s - fr * 0.5, fr, fr);
        I.c.restore();
      }
      if (A) A.jet(I.c, x, y, s, P.rot, th, [128, 186, 214]);
      if (P.rec < 1) {
        /* jeopardy trails while the engine is still dying: sooty smoke
           shed upward along the fall line, guttering orange flame at
           the nozzle, and the odd white-hot ember spat clear */
        part(x + rnd(-6, 6) * s, y - 22 * s, rnd(-20, 20), rnd(-70, -16), rnd(0.5, 1.0),
          rnd(9, 17) * (s * 0.5 + 0.4), C.smoke, { add: false, d: 0.96, gr: 22 });
        if (Math.random() < 0.7)
          part(x + rnd(-5, 5) * s, y + 28 * s, rnd(-26, 26), rnd(-30, 40), rnd(0.16, 0.34),
            rnd(6, 12) * (s * 0.5 + 0.4), Math.random() < 0.7 ? C.orange : C.red, { d: 0.92, gr: 8 });
        if (Math.random() < 0.22)
          part(x, y + 24 * s, rnd(-90, 90), rnd(-40, 90), rnd(0.3, 0.55), rnd(2, 4), C.amber, { d: 0.97 });
      }
      /* healthy exhaust only once the burner is actually alight — while
         it gutters, the flame/smoke above carry the trail, and the gaps
         where nothing comes out at all are the point */
      if (th > 0.5)
        for (let k = 0; k < 2; k++)
          part(x + rnd(-8, 8) * s, y + 30 * s, rnd(-24, 24), 140 + 240 * acc,
            rnd(0.25, 0.55), rnd(5, 11) * (s * 0.5 + 0.3), k ? C.cyan : C.white, { d: 0.9, gr: 16 });
      /* wingtip streamers as it slots in: ribbons of "where the tip
         just was", sampled straight off the analytic flight path */
      if (P.form > 0.55) {
        const a2 = (P.form - 0.55) / 0.45;
        I.c.save(); I.c.globalCompositeOperation = 'lighter';
        I.c.lineCap = 'round';
        for (let sd = -1; sd <= 1; sd += 2) {
          let px0 = 0, py0 = 0;
          for (let k = 0; k <= 7; k++) {
            const Pk = k === 0 ? P : survPos(i, u - k * 0.036);
            const cr = Math.cos(Pk.rot), sr = Math.sin(Pk.rot);
            const tx2 = Pk.x + (cr * sd * 36 - sr * 8) * Pk.s;
            const ty2 = Pk.y + (sr * sd * 36 + cr * 8) * Pk.s;
            if (k > 0) {
              const f = k / 7;
              I.c.globalAlpha = a2 * 0.5 * (1 - f);
              I.c.strokeStyle = rgba(C.ice, 1);
              I.c.lineWidth = Math.max(0.8, 2.6 * Pk.s * (1 - f * 0.7));
              I.c.beginPath(); I.c.moveTo(px0, py0); I.c.lineTo(tx2, ty2); I.c.stroke();
            }
            px0 = tx2; py0 = ty2;
          }
        }
        I.c.restore();
      }
      continue;
    }
    const q = acc * w.k;
    const s = w.s0 * (1 + q * 5.2);
    const x = 800 + (w.x0 - 800) * (1 + q * 3.4);
    const y = w.y0 + q * 560 + q * q * 220;
    if (y > VH + 240 || x < -400 || x > VW + 400) continue;
    const hurt = i !== 7;                     // one more limps clear off-frame
    if (A) A.jet(I.c, x, y, s,
      (w.x0 - 800) * 0.0012 + (hurt ? q * (i % 2 ? 0.9 : -0.9) : 0),
      hurt ? 0 : 0.85, hurt ? [104, 96, 104] : [124, 150, 186]);
    if (q > 0.1 && i % 2 === 0)
      part(x, y + 30 * s, rnd(-16, 16), 120 + 260 * q, rnd(0.3, 0.6),
        rnd(5, 13) * (s + 0.4), hurt ? (Math.random() < 0.35 ? C.orange : C.smoke) : C.cyan,
        { add: !hurt || Math.random() < 0.35, d: 0.92 });
  }
  once('c6last', T5 + 1.15, function () {
    sfx('boom', 1.0); I.shake = Math.max(I.shake, 10);
    I.flash = Math.max(I.flash, 0.22); I.flashCol = C.orange;
  });

  /* ---- the hero shot: as the formation locks, a crown of god-rays
     blooms behind the player jet — a slow-rotating fan of light with a
     cold halo, in before the mission text and gone before the flash.
     Everything about it converges the eye on the lead aircraft. ---- */
  const gr = ramp(2.55, 3.5, u) * (1 - ramp(5.65, 6.2, u));
  if (gr > 0.01) {
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = 0.20 * gr;
    I.c.drawImage(glow(C.ice), 800 - 230, pjY - 20 - 230, 460, 460);
    for (let i = 0; i < 9; i++) {
      const a = -1.5708 + (i - 4) * 0.36 + Math.sin(I.t * 0.21 + i * 1.7) * 0.06;
      const ln = (300 + 110 * Math.sin(I.t * 0.6 + i * 2.3)) * (0.7 + 0.3 * gr);
      const wd = 0.055 + 0.03 * Math.sin(I.t * 0.9 + i);
      I.c.globalAlpha = 0.09 * gr * (0.55 + 0.45 * Math.sin(I.t * 1.6 + i * 1.9));
      I.c.fillStyle = rgba(C.ice, 1);
      I.c.beginPath();
      I.c.moveTo(800, pjY - 16);
      I.c.lineTo(800 + Math.cos(a - wd) * ln, pjY - 16 + Math.sin(a - wd) * ln);
      I.c.lineTo(800 + Math.cos(a + wd) * ln, pjY - 16 + Math.sin(a + wd) * ln);
      I.c.closePath(); I.c.fill();
    }
    I.c.restore();
  }

  /* the player's interceptor pulling to the front */
  if (A) A.jet(I.c, 800, pjY, pjS, Math.sin(u * 0.9) * 0.05, 1, C.cyan);
  for (let k = 0; k < 2; k++)
    part(800 + rnd(-12, 12) * pjS, pjY + 32 * pjS, rnd(-40, 40), rnd(160, 340),
      rnd(0.3, 0.6), rnd(8, 18) * pjS * 0.6, k ? C.cyan : C.white, { d: 0.9, gr: 22 });

  /* speed streaks — the three of them banking away together */
  const st = ramp(4.5, 6.3, u);
  if (st > 0) {
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    I.c.strokeStyle = rgba(C.ice, 0.5 * st); I.c.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * 6.2832 + I.t * 0.4;
      const r0 = 120 + ((i * 137 + I.t * 900 * st) % 900);
      const len = 60 + 260 * st;
      I.c.globalAlpha = 0.5 * st * (r0 / 1000);
      I.c.beginPath();
      I.c.moveTo(800 + Math.cos(a) * r0, pjY - 120 + Math.sin(a) * r0 * 0.55);
      I.c.lineTo(800 + Math.cos(a) * (r0 + len), pjY - 120 + Math.sin(a) * (r0 + len) * 0.55);
      I.c.stroke();
    }
    I.c.restore();
  }

  stepParts(dt, 0); drawParts(false); drawParts(true);

  /* ---- the ranging shot: the SHOOTER's orb comes off the prong at
     4.52 and streaks the width of the frame, growing as it nears —
     crossing IN FRONT of the formation (drawn after the jets) and
     missing high over VIPER 4's canopy on its way off-screen.  The
     head is the warship's own charge-orb sprite, loose. ---- */
  once('c6shot', T5 + 4.52, function () {
    sfx('plasma'); I.shake = Math.max(I.shake, 7);
    shotFrom = shotTip ? [shotTip[0], shotTip[1]] : [390, hz - 10];
  });
  const bk = (u - 4.52) / 0.62;
  if (shotFrom && bk > 0 && bk < 1) {
    const ke = Math.pow(bk, 1.6);                 // it accelerates at us
    const bx = shotFrom[0] + (1900 - shotFrom[0]) * ke;
    const by = shotFrom[1] + (700 - shotFrom[1]) * ke;
    const dx = 1900 - shotFrom[0], dy = 700 - shotFrom[1];
    const dn = Math.hypot(dx, dy) || 1;
    const ux = dx / dn, uy = dy / dn;
    const tl = 90 + 420 * ke;                     // trail stretches with speed
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    const bg2 = I.c.createLinearGradient(bx, by, bx - ux * tl, by - uy * tl);
    bg2.addColorStop(0, rgba(C.white, 0.9));
    bg2.addColorStop(0.22, rgba(C.mag, 0.7));
    bg2.addColorStop(1, 'rgba(0,0,0,0)');
    I.c.strokeStyle = bg2; I.c.lineCap = 'round';
    I.c.lineWidth = 2.5 + 22 * ke;
    I.c.beginPath(); I.c.moveTo(bx, by); I.c.lineTo(bx - ux * tl, by - uy * tl); I.c.stroke();
    I.c.lineWidth = 1 + 9 * ke;
    I.c.strokeStyle = rgba(C.white, 0.75);
    I.c.beginPath(); I.c.moveTo(bx, by); I.c.lineTo(bx - ux * tl * 0.35, by - uy * tl * 0.35); I.c.stroke();
    I.c.restore();
    warshipChargeOrb(I.c, bx, by, 0.5 + 0.5 * ke, I.t, 1);
  }
  /* the near-miss registering on the airframe: a kick and a magenta
     wash as the bolt crosses the formation line */
  once('c6shotby', T5 + 4.94, function () {
    I.shake = Math.max(I.shake, 10);
    I.flash = Math.max(I.flash, 0.12); I.flashCol = C.mag;
  });

  /* ---- radio: the survivors checking in as they slot in beside us.
     Typed out like scene 3's party line, faded before the handoff. ---- */
  const rdFade = 1 - ramp(4.9, 5.5, u);
  if (rdFade > 0.01) {
    for (let i = 0; i < RADIO6.length; i++) {
      const L = RADIO6[i], q = u - L.at;
      if (q < 0) continue;
      once('c6rd' + i, T5 + L.at, function () { sfx('radio', L.u); sfx('beep', 0.10 + i * 0.06); });
      const n = Math.min(L.s.length, Math.floor(q * L.cps));
      txt(L.s.slice(0, n), RD6_X, RD6_Y + i * 32, 19, rgba(C.ice, 0.78 * rdFade), 2);
    }
  }

  /* the mission, in one line — no longer alone up here.  Same words,
     same window (3.7 .. 6.3), but it LANDS now: letter-spacing starts
     wide and compresses home as it fades in, a soft cyan glow bed sits
     under it, a white pop marks the instant it settles, and a lighter
     double-exposure ghost breathes over it with the odd hard flicker
     dropout — projected onto the canopy, not typeset on the frame. */
  if (u > 3.7 && u < 6.3) {
    const ta = ramp(3.7, 4.2, u);
    const a = ta * (1 - ramp(5.8, 6.3, u));
    const sp = 8 + 30 * (1 - ta);               // spacing ramp: wide -> home
    const drop = (Math.sin(u * 57.3) * Math.sin(u * 17.1) > 0.965) ? 0.4 : 1;
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    I.c.globalAlpha = 0.15 * a;
    I.c.drawImage(glow(C.cyan), VW / 2 - 560, 820 - 64, 1120, 110);
    I.c.restore();
    txt(S6MSG, VW / 2, 820, 26, rgba(C.cyan, a * 0.92 * drop), sp, 'center');
    I.c.save(); I.c.globalCompositeOperation = 'lighter';
    txt(S6MSG, VW / 2, 820 + Math.sin(u * 31) * 1.3, 26,
      rgba(C.ice, a * 0.30 * (0.4 + 0.6 * Math.sin(u * 3.4)) * drop), sp + 2, 'center');
    const lp = ramp(4.05, 4.2, u) * (1 - ramp(4.2, 4.5, u));   // the settle pop
    if (lp > 0.02) txt(S6MSG, VW / 2, 820, 26, rgba(C.white, lp * 0.45), sp, 'center');
    I.c.restore();
  }
  once('c6flash', T5 + 6.05, function () { I.flash = 0.9; I.flashCol = C.ice; I.shake = 22; });
  scanlines(0.10);
  vignette(0.55);
}
