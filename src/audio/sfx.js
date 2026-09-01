/* ===== audio/sfx.js — one-shot combat/UI sound effects =====
   laser / missile / boom / thud / pickup / alarm / siren. */
import { A } from './state.js';
import { MAX_LASER, MAX_BOOM } from './constants.js';
import { now, gainNode, panner, pluck, osc, noise, hp, lp, bp, clamp, fclamp, mtof, budget, voice, duckPump, makeSoftCurve } from './primitives.js';

A.laserSide = 1;
export function laser() {
  if (!A.ready || A.muted) return;
  var t = now();
  if (t - A.lastLaserT < 0.042) return;           // rapid-fire guard
  if (A.laserVoices >= MAX_LASER || !budget(4)) return;
  A.lastLaserT = t;
  t += 0.002;

  A.laserSide = -A.laserSide;
  var head = gainNode(0.55);
  var pn = panner(A.laserSide * 0.38);
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);

  var dur = 0.15;
  var srcs = [];

  // 1. main downward sweep, two detuned saws through a bandpass
  var bpf = bp(1500, 3.2);
  bpf.frequency.setValueAtTime(fclamp(3200), t);
  bpf.frequency.exponentialRampToValueAtTime(fclamp(500), t + dur);
  var g1 = pluck(t, 0.55, dur, 0.002);
  bpf.connect(g1); g1.connect(head);

  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', 1900, t);
    o.detune.value = k ? 17 : -14;
    o.frequency.setValueAtTime(fclamp(1900 + A.laserSide * 60), t);
    o.frequency.exponentialRampToValueAtTime(fclamp(250), t + dur * 0.92);
    o.connect(bpf);
    o.start(t); o.stop(t + dur + 0.02);
    srcs.push(o);
  }

  // 2. bright transient click
  var nh = hp(2600);
  var ng = pluck(t, 0.34, 0.035, 0.001);
  nh.connect(ng); ng.connect(head);
  var ns = noise(t, 0.04); ns.connect(nh); srcs.push(ns);

  // 3. tiny metallic ring tail
  var ro = osc('sine', 2750, t);
  ro.frequency.exponentialRampToValueAtTime(fclamp(1650), t + 0.1);
  var rg = pluck(t, 0.09, 0.11, 0.002);
  ro.connect(rg); rg.connect(head);
  ro.start(t); ro.stop(t + 0.13);
  srcs.push(ro);

  A.laserVoices++;
  voice(head, srcs);
  setTimeout(function () { A.laserVoices--; }, 220);
  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, 400);
}

/* striker attack-run flyby: quick doppler whoosh + 3-tap bolt burst */
export function strafe(p) {
  if (!A.ready || A.muted || !budget(4)) return;
  var t = now() + 0.002;
  var head = gainNode(0.36);
  var pn = panner(clamp(p == null ? 0 : p, -1, 1));
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];
  var dur = 0.6;

  // doppler-ish whoosh: bandpassed noise sweeping up then falling away
  var wb = bp(700, 1.8);
  wb.frequency.setValueAtTime(fclamp(500), t);
  wb.frequency.exponentialRampToValueAtTime(fclamp(2200), t + dur * 0.4);
  wb.frequency.exponentialRampToValueAtTime(fclamp(320), t + dur);
  var wg = A.ctx.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.35);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  wb.connect(wg); wg.connect(head);
  var ws = noise(t, dur + 0.02, 1.1); ws.connect(wb); srcs.push(ws);

  // 3-tap rapid bolt burst as it passes the midpoint
  var bpf = hp(1100);
  bpf.connect(head);
  for (var i = 0; i < 3; i++) {
    var bt = t + 0.14 + i * 0.07;
    var o = osc('square', 1500 - i * 90, bt);
    o.frequency.exponentialRampToValueAtTime(fclamp(560 - i * 60), bt + 0.05);
    var g = pluck(bt, 0.3, 0.06, 0.001);
    o.connect(g); g.connect(bpf);
    o.start(bt); o.stop(bt + 0.08);
    srcs.push(o);
  }

  voice(head, srcs);
  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.4) * 1000);
}

/* proximity-mine arming tick: ONE cheap menacing blip per call (looped by game) */
export function mineArm() {
  if (!A.ready || A.muted) return;
  var t = now();
  if (t - A.lastMineT < 0.1) return;               // rapid-fire guard
  if (!budget(2)) return;
  A.lastMineT = t;
  t += 0.002;

  var head = gainNode(0.22);
  head.connect(A.sfxGain);
  var srcs = [];

  // minor-second pair: sine blip + quiet square a semitone up = sour edge
  var g = pluck(t, 0.5, 0.1, 0.001);
  g.connect(head);
  var a = osc('sine', 1244.5, t);                  // ~D#6
  a.connect(g);
  a.start(t); a.stop(t + 0.12);
  var b = osc('square', 1318.5, t);                // ~E6, a semitone above
  var bg = pluck(t, 0.09, 0.08, 0.001);
  b.connect(bg); bg.connect(head);
  b.start(t); b.stop(t + 0.1);
  srcs.push(a, b);

  voice(head, srcs);
}

/* lancer sniper bolt: rising charge tail into a piercing crack.
   Reads opposite to laser(): pitch goes UP, then a bright discharge snap. */
export function lance(p) {
  if (!A.ready || A.muted || !budget(4)) return;
  var t = now() + 0.002;
  var head = gainNode(0.5);
  var pn = panner(clamp(p == null ? 0 : p, -1, 1));
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];
  var charge = 0.22, dur = 0.4;

  // 1. rising charge: two detuned saws sweeping up through an opening bandpass
  var cb = bp(900, 5);
  cb.frequency.setValueAtTime(fclamp(500), t);
  cb.frequency.exponentialRampToValueAtTime(fclamp(3400), t + charge);
  var cg = A.ctx.createGain();
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(0.3, t + charge);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + charge + 0.05);
  cb.connect(cg); cg.connect(head);
  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', 300, t);
    o.detune.value = k ? 12 : -10;
    o.frequency.setValueAtTime(fclamp(300), t);
    o.frequency.exponentialRampToValueAtTime(fclamp(2400), t + charge);
    o.connect(cb);
    o.start(t); o.stop(t + charge + 0.06);
    srcs.push(o);
  }

  // 2. discharge crack: bright noise snap at the top of the charge
  var dt = t + charge;
  var dh = hp(2400);
  var dg = pluck(dt, 0.6, 0.07, 0.001);
  dh.connect(dg); dg.connect(head);
  var dn = noise(dt, 0.08, 1.5); dn.connect(dh); srcs.push(dn);

  // 3. piercing zap tail: high sine falling off fast after the crack
  var zo = osc('sine', 3600, dt);
  zo.frequency.exponentialRampToValueAtTime(fclamp(1900), dt + dur - charge);
  var zg = pluck(dt, 0.28, dur - charge, 0.001);
  zo.connect(zg); zg.connect(head);
  zo.start(dt); zo.stop(dt + dur - charge + 0.03);
  srcs.push(zo);

  voice(head, srcs);
  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.4) * 1000);
}

export function missile() {
  if (!A.ready || A.muted || !budget(5)) return;
  var t = now() + 0.002;
  var head = gainNode(0.6);
  head.connect(A.sfxGain);
  var srcs = [];
  var dur = 0.75;

  // ignition crack
  var ih = bp(900, 1.1);
  ih.frequency.setValueAtTime(fclamp(1800), t);
  ih.frequency.exponentialRampToValueAtTime(fclamp(420), t + 0.18);
  var ig = pluck(t, 0.7, 0.2, 0.002);
  ih.connect(ig); ig.connect(head);
  var isrc = noise(t, 0.22); isrc.connect(ih); srcs.push(isrc);

  // thruster whoosh: bandpassed noise swelling then sweeping up
  var wb = bp(400, 2.2);
  wb.frequency.setValueAtTime(fclamp(380), t);
  wb.frequency.exponentialRampToValueAtTime(fclamp(2600), t + dur * 0.8);
  wb.frequency.exponentialRampToValueAtTime(fclamp(1400), t + dur);
  var wg = A.ctx.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(0.5, t + 0.14);
  wg.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.7);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  wb.connect(wg); wg.connect(head);
  var wsrc = noise(t, dur + 0.02, 1.0); wsrc.connect(wb); srcs.push(wsrc);

  // launch pitch drop (the "thunk" of leaving the rail)
  var lo = osc('sawtooth', 340, t);
  lo.frequency.exponentialRampToValueAtTime(fclamp(70), t + 0.28);
  var lf = lp(1200, 3);
  lf.frequency.setValueAtTime(fclamp(1600), t);
  lf.frequency.exponentialRampToValueAtTime(fclamp(240), t + 0.3);
  var lg = pluck(t, 0.34, 0.32, 0.004);
  lo.connect(lf); lf.connect(lg); lg.connect(head);
  lo.start(t); lo.stop(t + 0.34);
  srcs.push(lo);

  voice(head, srcs);
}

export function boom(size) {
  if (!A.ready || A.muted) return;
  size = clamp(size == null ? 1 : size, 0.15, 2.4);
  if (A.boomVoices >= MAX_BOOM || !budget(5)) return;
  var t = now() + 0.002;
  var dur = 0.34 + 0.72 * size;
  var head = gainNode(clamp(0.5 + 0.35 * size, 0.3, 1.0));
  var pn = panner((Math.random() * 2 - 1) * 0.3);
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];

  // --- body: noise through a lowpass sweeping down ---
  var bf = lp(3000, 1.6);
  bf.frequency.setValueAtTime(fclamp(2600 / Math.pow(size, 0.5)), t);
  bf.frequency.exponentialRampToValueAtTime(fclamp(90 / size), t + dur * 0.85);
  var bg = A.ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.85, t + 0.008);
  bg.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.35);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  bf.connect(bg); bg.connect(head);
  var bs = noise(t, dur + 0.02, 0.8 + Math.random() * 0.3);
  bs.connect(bf); srcs.push(bs);

  // --- sub thump ---
  var subDur = 0.16 + 0.42 * size;
  var so = osc('sine', 120 / Math.pow(size, 0.35), t);
  so.frequency.exponentialRampToValueAtTime(fclamp(26 + 8 / size), t + subDur);
  var sg = pluck(t, clamp(0.55 + 0.3 * size, 0.4, 0.95), subDur, 0.006);
  so.connect(sg); sg.connect(head);
  so.start(t); so.stop(t + subDur + 0.03);
  srcs.push(so);

  // --- mid punch (gives it a chest hit rather than a hiss) ---
  var mo = osc('triangle', 220 / Math.pow(size, 0.3), t);
  mo.frequency.exponentialRampToValueAtTime(fclamp(55), t + 0.12);
  var mg = pluck(t, 0.3 * size, 0.14 + 0.1 * size, 0.003);
  mo.connect(mg); mg.connect(head);
  mo.start(t); mo.stop(t + 0.3 + 0.1 * size);
  srcs.push(mo);

  // --- crackle / debris tail ---
  if (size > 0.4) {
    var cStart = t + 0.05;
    var cDur = dur * 0.9;
    var ch = hp(1400);
    var cg = A.ctx.createGain();
    cg.gain.setValueAtTime(0.0001, cStart);
    // jittery decaying steps => debris rattle, no extra nodes
    var steps = 10;
    for (var i = 0; i < steps; i++) {
      var ct = cStart + (i / steps) * cDur;
      var amp = 0.22 * size * (1 - i / steps) * (0.35 + Math.random() * 0.65);
      cg.gain.setTargetAtTime(Math.max(0.0002, amp), ct, cDur / (steps * 3));
    }
    cg.gain.setTargetAtTime(0.0001, cStart + cDur, 0.05);
    ch.connect(cg); cg.connect(head);
    var cs = noise(cStart, cDur + 0.12, 1.4);
    cs.connect(ch); srcs.push(cs);
  }

  A.boomVoices++;
  setTimeout(function () { A.boomVoices--; }, (dur + 0.15) * 1000);
  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.6) * 1000);
  voice(head, srcs);
}

export function thud() {
  if (!A.ready || A.muted || !budget(4)) return;
  var t = now() + 0.002;
  var head = gainNode(0.8);
  head.connect(A.sfxGain);
  var srcs = [];

  // low body
  var o = osc('sine', 120, t);
  o.frequency.exponentialRampToValueAtTime(fclamp(38), t + 0.19);
  var g = pluck(t, 0.85, 0.3, 0.004);
  o.connect(g); g.connect(head);
  o.start(t); o.stop(t + 0.34);
  srcs.push(o);

  // hull impact noise
  var f = lp(900, 2.2);
  f.frequency.setValueAtTime(fclamp(1500), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(180), t + 0.24);
  var ng = pluck(t, 0.5, 0.26, 0.002);
  f.connect(ng); ng.connect(head);
  var ns = noise(t, 0.28, 0.7); ns.connect(f); srcs.push(ns);

  // metallic ring so it reads as "the ship" rather than a drum
  var r = osc('triangle', 196, t);
  var r2 = osc('triangle', 261, t);
  var rg = pluck(t, 0.16, 0.42, 0.003);
  var rf = bp(240, 4);
  r.connect(rf); r2.connect(rf); rf.connect(rg); rg.connect(head);
  r.start(t); r.stop(t + 0.46); r2.start(t); r2.stop(t + 0.46);
  srcs.push(r, r2);

  voice(head, srcs);
}

export function pickup() {
  if (!A.ready || A.muted || !budget(8)) return;
  var t = now() + 0.002;
  var head = gainNode(0.34);
  head.connect(A.sfxGain);
  var send = gainNode(0.3);
  head.connect(send); send.connect(A.fxDelay);
  var srcs = [];

  var notes = [72, 76, 79, 83, 84, 88];
  for (var i = 0; i < notes.length; i++) {
    var nt = t + i * 0.048;
    var f = mtof(notes[i]);
    var g = pluck(nt, 0.42 - i * 0.03, 0.16, 0.002);
    var flt = lp(f * 3.5 + 1200, 1.1);
    flt.connect(g); g.connect(head);

    var a = osc('square', f, nt);
    var b = osc('triangle', f * 2.001, nt);
    a.detune.value = -6; b.detune.value = 7;
    a.connect(flt); b.connect(flt);
    a.start(nt); a.stop(nt + 0.19);
    b.start(nt); b.stop(nt + 0.19);
    srcs.push(a, b);
  }

  // sparkle
  var sh = hp(5200);
  var sg = pluck(t, 0.16, 0.2, 0.002);
  sh.connect(sg); sg.connect(head);
  var ss = noise(t, 0.22, 1.6); ss.connect(sh); srcs.push(ss);

  voice(head, srcs);
  setTimeout(function () { try { send.disconnect(); } catch (e) { } }, 1200);
}

export function sectorClear() {
  if (!A.ready || A.muted || !budget(8)) return;
  var t = now() + 0.002;
  var head = gainNode(0.3);
  head.connect(A.sfxGain);
  var send = gainNode(0.24);
  head.connect(send); send.connect(A.fxDelay);
  var srcs = [];

  // rising A-E-A motif (A minor root/fifth/octave), soft plucked pairs
  var notes = [57, 64, 69], gap = 0.22;
  for (var i = 0; i < notes.length; i++) {
    var nt = t + i * gap;
    var f = mtof(notes[i]);
    var last = i === notes.length - 1;
    var g = pluck(nt, 0.34 + i * 0.05, last ? 0.9 : 0.42, 0.008);
    var flt = lp(f * 4 + 900, 0.9);
    flt.connect(g); g.connect(head);

    var a = osc('triangle', f, nt);
    var b = osc('sine', f * 2.002, nt);
    a.detune.value = -4; b.detune.value = 5;
    a.connect(flt); b.connect(flt);
    var end = nt + (last ? 0.95 : 0.46);
    a.start(nt); a.stop(end);
    b.start(nt); b.stop(end);
    srcs.push(a, b);
  }

  // gentle shimmer: high filtered-noise swell under the last note
  var sb = bp(6200, 1.4);
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.07, t + 0.55);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  sb.connect(sg); sg.connect(head);
  var ss = noise(t, 1.55, 1.5); ss.connect(sb); srcs.push(ss);

  // soft high sine halo, slow attack (octave above the top A)
  var ho = osc('sine', mtof(81), t);
  var hg = A.ctx.createGain();
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  ho.connect(hg); hg.connect(head);
  ho.start(t); ho.stop(t + 1.65);
  srcs.push(ho);

  // let the cue breathe: dip the music's duck bus briefly, recover ~1s
  duckPump(t, 0.3, 1.0);

  voice(head, srcs);
  setTimeout(function () { try { send.disconnect(); } catch (e) { } }, 2200);
}

/* ravager acid burst: three quick pitched-down wet 'bloop' taps + breath */
export function spit() {
  if (!A.ready || A.muted) return;
  var t = now();
  if (t - A.lastSpitT < 0.15) return;              // rapid-fire guard
  if (!budget(3)) return;
  A.lastSpitT = t;
  t += 0.002;

  var head = gainNode(0.32);
  head.connect(A.sfxGain);
  var srcs = [];

  // shared wet lowpass so the whole burst sounds hollow/gloopy
  var wf = lp(1100, 4);
  wf.connect(head);

  for (var i = 0; i < 3; i++) {
    var bt = t + i * 0.11;
    var o = osc('sine', 520 - i * 60, bt);         // each glob a bit lower
    o.frequency.exponentialRampToValueAtTime(fclamp(110 - i * 12), bt + 0.09);
    var g = pluck(bt, 0.55, 0.11, 0.002);
    o.connect(g); g.connect(wf);
    o.start(bt); o.stop(bt + 0.13);
    srcs.push(o);
  }

  // slight noise breath under the lobs (spittle hiss)
  var nb = bp(900, 1.4);
  nb.frequency.setValueAtTime(fclamp(1300), t);
  nb.frequency.exponentialRampToValueAtTime(fclamp(380), t + 0.36);
  var ng = pluck(t, 0.1, 0.38, 0.004);
  nb.connect(ng); ng.connect(head);
  var ns = noise(t, 0.4, 0.8); ns.connect(nb); srcs.push(ns);

  voice(head, srcs);
}

/* organic impact/death ichor burst: layers UNDER boom() on bio deaths */
export function squish(size) {
  if (!A.ready || A.muted || !budget(4)) return;
  size = clamp(size == null ? 1 : size, 0.5, 2);
  var t = now() + 0.002;
  var dur = 0.25 + 0.23 * (size - 0.5);            // ~0.25s at .5, ~0.6s at 2
  var head = gainNode(clamp(0.24 + 0.1 * size, 0.2, 0.4));
  head.connect(A.sfxGain);
  var srcs = [];

  // wet splat: lowpassed noise, filter slamming shut
  var sf = lp(2200, 2.2);
  sf.frequency.setValueAtTime(fclamp(2400 / Math.pow(size, 0.4)), t);
  sf.frequency.exponentialRampToValueAtTime(fclamp(160 / size), t + dur * 0.9);
  var sg = pluck(t, 0.7, dur, 0.002);
  sf.connect(sg); sg.connect(head);
  var ss = noise(t, dur + 0.02, 0.7); ss.connect(sf); srcs.push(ss);

  // downward 'gloop' sine
  var go = osc('sine', 300 / Math.pow(size, 0.4), t);
  go.frequency.exponentialRampToValueAtTime(fclamp(52 / size), t + dur * 0.8);
  var gg = pluck(t, 0.5, dur * 0.85, 0.004);
  go.connect(gg); gg.connect(head);
  go.start(t); go.stop(t + dur);
  srcs.push(go);

  // brief comb-ish flutter: two detuned short sines beating against each other
  var ff = lp(900, 1.5);
  var fg = pluck(t + 0.02, 0.22, dur * 0.6, 0.003);
  ff.connect(fg); fg.connect(head);
  var fa = osc('sine', 170, t);
  var fb = osc('sine', 187, t);                    // ~17Hz beat = wet flutter
  fa.connect(ff); fb.connect(ff);
  fa.start(t); fa.stop(t + dur * 0.7);
  fb.start(t); fb.stop(t + dur * 0.7);
  srcs.push(fa, fb);

  voice(head, srcs);
}

/* creature/boss aggro cry: detuned saws swept up-then-down with vibrato,
   through a resonant bandpass sweep. Rare (boss beats), so it can be rich. */
export function screech(p) {
  if (!A.ready || A.muted || !budget(6)) return;
  var t = now() + 0.002;
  var dur = 1.0;
  var head = gainNode(0.5);
  var pn = panner(clamp(p == null ? 0 : p, -1, 1));
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];

  // resonant formant sweep: opens with the rise, chokes on the fall
  var f = bp(1200, 6);
  f.frequency.setValueAtTime(fclamp(700), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(2600), t + dur * 0.42);
  f.frequency.exponentialRampToValueAtTime(fclamp(480), t + dur);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.06);
  g.gain.setValueAtTime(0.55, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(head);

  // vibrato LFO shared by both saws (osc -> gain -> frequency)
  var lfo = osc('sine', 11, t);
  var lg = gainNode(0);
  lg.gain.setValueAtTime(4, t);
  lg.gain.linearRampToValueAtTime(46, t + dur * 0.5);
  lg.gain.linearRampToValueAtTime(10, t + dur);
  lfo.connect(lg);
  lfo.start(t); lfo.stop(t + dur + 0.05);
  srcs.push(lfo);

  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', 480, t);
    o.detune.value = k ? 21 : -18;
    o.frequency.setValueAtTime(fclamp(430), t);
    o.frequency.exponentialRampToValueAtTime(fclamp(1750), t + dur * 0.42);
    o.frequency.exponentialRampToValueAtTime(fclamp(300), t + dur);
    lg.connect(o.frequency);
    o.connect(f);
    o.start(t); o.stop(t + dur + 0.03);
    srcs.push(o);
  }

  // rasp: thin noise through the same formant so it screams, not hisses
  var rg = A.ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.4);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  rg.connect(f);
  var rs = noise(t, dur + 0.02, 1.5); rs.connect(rg); srcs.push(rs);

  // give the cry room over the music
  duckPump(t, 0.22, 0.8);

  voice(head, srcs);
  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.4) * 1000);
}

/* wingman radio distress: squelch static, two urgent beeps, garbled 'voice'
   blips, squelch cut. Dry + mono/center so it reads as comms, not music. */
export function mayday() {
  if (!A.ready || A.muted || !budget(6)) return;
  var t = now() + 0.002;
  var dur = 1.2;
  var head = gainNode(0.36);
  head.connect(A.sfxGain);
  var srcs = [];

  // everything speaks through one narrow voice-band radio filter
  var rf = bp(1100, 1.6);
  var rh = hp(300);
  var rl = lp(2800);
  rh.connect(rf); rf.connect(rl); rl.connect(head);

  // squelch static bed: opens with a pop, sputters, dies at the cut
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.3, t + 0.012);   // squelch open pop
  sg.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
  sg.gain.setValueAtTime(0.08, t + dur - 0.08);
  sg.gain.exponentialRampToValueAtTime(0.24, t + dur - 0.03); // squelch cut burst
  sg.gain.setValueAtTime(0.0001, t + dur);
  sg.connect(rh);
  var ss = noise(t, dur + 0.02, 1.3); ss.connect(sg); srcs.push(ss);

  // two urgent beep taps
  for (var i = 0; i < 2; i++) {
    var bt = t + 0.06 + i * 0.14;
    var bo = osc('square', 1180, bt);
    var bg = pluck(bt, 0.3, 0.07, 0.001);
    bo.connect(bg); bg.connect(rh);
    bo.start(bt); bo.stop(bt + 0.09);
    srcs.push(bo);
  }

  // garbled 'voice': fast random-stepped sine blips in the 400-900Hz band
  var vt0 = t + 0.38, blips = 7;
  for (var j = 0; j < blips; j++) {
    var vt = vt0 + j * 0.088 + Math.random() * 0.02;
    var vf = 400 + Math.random() * 500;
    var vo = osc('sine', vf, vt);
    vo.frequency.linearRampToValueAtTime(fclamp(vf * (0.85 + Math.random() * 0.3)), vt + 0.06);
    var vg = pluck(vt, 0.24 + Math.random() * 0.12, 0.07 + Math.random() * 0.03, 0.004);
    vo.connect(vg); vg.connect(rh);
    vo.start(vt); vo.stop(vt + 0.11);
    srcs.push(vo);
  }

  voice(head, srcs);
}

/* wingman radio chatter: garbled wordless voice-like transmission.
   u=0..1 urgency (faster syllables, higher pitch, more clipped).
   Squelch pop -> syllabic voice burble through a telephone band -> squelch cut. */
export function radio(u) {
  if (!A.ready || A.muted) return;
  var t = now();
  if (t - A.lastRadioT < 0.35) return;             // rapid-fire guard
  if (!budget(5)) return;
  A.lastRadioT = t;
  t += 0.002;
  u = clamp(u == null ? 0.5 : u, 0, 1);

  var head = gainNode(0.3);
  head.connect(A.sfxGain);
  var srcs = [];

  // everything speaks through one radio band: hp -> bp -> lp -> mild clip
  var rh = hp(300);
  var rb = bp(1300, 0.8);
  var rl = lp(2800);
  var shp = A.ctx.createWaveShaper();
  shp.curve = makeSoftCurve(2.2 + 2.5 * u);        // more clipped when urgent
  rh.connect(rb); rb.connect(rl); rl.connect(shp); shp.connect(head);

  // opening squelch pop
  var sqg = pluck(t, 0.5, 0.03, 0.001);
  sqg.connect(rh);
  var sqs = noise(t, 0.04, 1.5); sqs.connect(sqg); srcs.push(sqs);

  // syllabic amplitude gate - all voiced material passes through this
  var syl = A.ctx.createGain();
  syl.gain.setValueAtTime(0.0001, t);
  syl.connect(rh);

  // carrier: saw + quiet square an octave up, pitch stepping per syllable
  var base = 110 + 50 * u + Math.random() * 20;
  var car = osc('sawtooth', base, t);
  var car2 = osc('square', base * 2, t);
  var c2g = gainNode(0.3);
  car.connect(syl);
  car2.connect(c2g); c2g.connect(syl);

  // 3-6 'syllable' pitches to step between
  var nPitch = 3 + Math.floor(Math.random() * 4);
  var pitches = [];
  for (var i = 0; i < nPitch; i++) pitches.push(base * (0.85 + Math.random() * 0.5));

  var nSyl = 5 + Math.floor(Math.random() * 3 + u * 2);    // 5-9 bursts
  if (nSyl > 9) nSyl = 9;
  var speed = 1 + 0.6 * u;
  var st = t + 0.05, endT = st;
  for (var j = 0; j < nSyl; j++) {
    var sd = (0.06 + Math.random() * 0.08) / speed;        // 60-140ms, faster w/ u
    var gap = (0.025 + Math.random() * 0.055) / speed;
    var p = pitches[Math.floor(Math.random() * nPitch)];
    // pitch step + a slow wobble across the syllable
    car.frequency.setValueAtTime(fclamp(p), st);
    car.frequency.linearRampToValueAtTime(fclamp(p * (0.92 + Math.random() * 0.16)), st + sd);
    car2.frequency.setValueAtTime(fclamp(p * 2), st);
    // amplitude gate: snap open, hold, snap shut (more clipped at high u)
    var pk = 0.5 + Math.random() * 0.25 + 0.2 * u;
    syl.gain.setValueAtTime(0.0001, st);
    syl.gain.linearRampToValueAtTime(pk, st + 0.012);
    syl.gain.setValueAtTime(pk, st + sd * (0.55 + 0.25 * u));
    syl.gain.linearRampToValueAtTime(0.0001, st + sd);
    endT = st + sd;
    st = endT + gap;
  }
  var dur = endT - t;
  car.start(t); car.stop(endT + 0.03);
  car2.start(t); car2.stop(endT + 0.03);
  srcs.push(car, car2);

  // a touch of breath noise under the voice, gated by the same envelope
  var vng = gainNode(0.06);
  vng.connect(syl);
  var vns = noise(t, dur + 0.05, 1.2); vns.connect(vng); srcs.push(vns);

  // closing squelch click
  var cqg = pluck(endT + 0.02, 0.4, 0.025, 0.001);
  cqg.connect(rh);
  var cqs = noise(endT + 0.02, 0.035, 1.6); cqs.connect(cqg); srcs.push(cqs);

  voice(head, srcs);
}

/* distant colossal monster groan: low sweep 55->38Hz with slow vibrato,
   3 staggered decaying copies = cheap cavernous reverb, breath layer under. */
export function groan() {
  if (!A.ready || A.muted) return;
  var t = now();
  if (t - A.lastGroanT < 6) return;                // far-away beast, rare
  if (!budget(6)) return;
  A.lastGroanT = t;
  t += 0.002;

  var head = gainNode(0.3);
  head.connect(A.sfxGain);
  var srcs = [];

  // distance: the tonal body speaks through a dull lowpass
  var df = lp(260, 0.8);
  df.connect(head);

  // shared slow vibrato
  var lfo = osc('sine', 2.6, t);
  var lg = gainNode(1.6);
  lfo.connect(lg);
  lfo.start(t); lfo.stop(t + 3.4);
  srcs.push(lfo);

  // 3 staggered copies at decreasing gain
  var dur = 1.6;
  var kg = [0.5, 0.24, 0.11];
  for (var k = 0; k < 3; k++) {
    var kt = t + k * 0.26;
    var o = osc(k === 1 ? 'triangle' : 'sine', 55, kt);
    o.frequency.setValueAtTime(fclamp(55), kt);
    o.frequency.exponentialRampToValueAtTime(fclamp(38), kt + dur);
    lg.connect(o.frequency);
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, kt);
    g.gain.exponentialRampToValueAtTime(kg[k], kt + 0.35);
    g.gain.setValueAtTime(kg[k], kt + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, kt + dur);
    o.connect(g); g.connect(df);
    o.start(kt); o.stop(kt + dur + 0.05);
    srcs.push(o);
  }

  // breathy exhale under the first copy
  var nf = lp(320, 1.2);
  var ng = A.ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.1, t + 0.5);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.2);
  nf.connect(ng); ng.connect(head);
  var ns = noise(t, dur * 1.2 + 0.05, 0.6); ns.connect(nf); srcs.push(ns);

  voice(head, srcs);
}

/* ---------------------------------------------------------------
   persistent ambient loops: swarm buzz + horror creep bed.
   Long-lived like the engine drone, so deliberately outside the
   budget()/voice() one-shot accounting. A watchdog interval fades
   either loop out if gameplay stops calling (game over / reset) -
   timestamps use ctx.currentTime, which freezes while suspended,
   so a paused game never falsely expires them.
   --------------------------------------------------------------- */
function ambWatch() {
  if (!A.ready) return;
  var t;
  try { t = A.ctx.currentTime; } catch (e) { return; }
  if (A.swarm && A.swarmOn && t - A.swarmLastT > 1.0) swarm(false);
  if (A.creep && A.creepLevel > 0 && t - A.creepLastT > 2.5) creep(0);
}
function ambTimerStart() {
  if (A.ambTimer === null) A.ambTimer = setInterval(ambWatch, 500);
}

function buildSwarm() {
  var t = now();
  var s = {};
  s.head = gainNode(0.0001);
  s.head.connect(A.sfxGain);

  // slow amplitude wander so the cloud breathes
  s.wander = gainNode(0.85);
  s.wander.connect(s.head);
  s.wlfo = osc('sine', 0.31, t);
  s.wamt = gainNode(0.13);
  s.wlfo.connect(s.wamt); s.wamt.connect(s.wander.gain);
  s.wlfo.start(t);

  // fast small random FM jitter: looped noise -> tight lowpass -> osc freqs
  s.jn = A.ctx.createBufferSource();
  s.jn.buffer = A.noiseBuf; s.jn.loop = true;
  s.jf = lp(28, 0.7);
  s.jg = gainNode(9);
  s.jn.connect(s.jf); s.jf.connect(s.jg);
  s.jn.start(t);

  // 3 detuned saws = the classic fly buzz
  s.oscs = [];
  var fs = [146, 171, 193];
  for (var i = 0; i < 3; i++) {
    var o = osc('sawtooth', fs[i], t);
    o.detune.value = (i - 1) * 7;
    s.jg.connect(o.frequency);
    var og = gainNode(i === 2 ? 0.05 : 0.08);
    o.connect(og); og.connect(s.wander);
    o.start(t);
    s.oscs.push(o);
  }

  // wing shimmer: filtered noise up top
  s.sn = A.ctx.createBufferSource();
  s.sn.buffer = A.noiseBuf; s.sn.loop = true; s.sn.playbackRate.value = 1.4;
  s.sf = bp(3800, 1.8);
  s.sg = gainNode(0.03);
  s.sn.connect(s.sf); s.sf.connect(s.sg); s.sg.connect(s.wander);
  s.sn.start(t);

  A.swarm = s;
}

/* insect-swarm loop: on=true starts (idempotent, safe every frame),
   on=false fades out ~0.3s. Lazy persistent graph on A.swarm. */
export function swarm(on) {
  if (!A.ready) return;
  if (!on && !A.swarm) return;
  if (!A.swarm) buildSwarm();
  ambTimerStart();
  var t = now();
  var g = A.swarm.head.gain;
  if (on) {
    A.swarmLastT = t;
    if (A.swarmOn) return;                         // redundant call, no-op
    A.swarmOn = true;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(0.14, t + 0.5);
    } catch (e) { }
  } else {
    if (!A.swarmOn) return;
    A.swarmOn = false;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(0.0001, t + 0.3);
    } catch (e) { }
  }
}

function buildCreep() {
  var t = now();
  var c = {};
  c.head = gainNode(0.0);                          // silent at level 0
  c.head.connect(A.sfxGain);

  // dissonant drone: two detuned low sines a tritone apart
  c.a = osc('sine', 50, t);
  c.b = osc('sine', 70.7, t);
  c.b.detune.value = 6;
  c.dg = gainNode(0.5);
  c.a.connect(c.dg); c.b.connect(c.dg); c.dg.connect(c.head);
  c.a.start(t); c.b.start(t);

  // very slow pitch drift on one sine keeps the pair uneasy
  c.lfo = osc('sine', 0.11, t);
  c.lamt = gainNode(1.3);
  c.lfo.connect(c.lamt); c.lamt.connect(c.a.frequency);
  c.lfo.start(t);

  // bus for the sparse insect ticks
  c.tick = hp(3200);
  c.tick.connect(c.head);

  A.creep = c;
}

/* horror-ambience bed intensity, 0..1. Called ~1/sec by gameplay; the
   ~1s linear ramp makes the swell imperceptible. Sits UNDER the music. */
export function creep(level) {
  if (!A.ready) return;
  level = clamp(level == null ? 0 : level, 0, 1);
  if (level <= 0 && !A.creep) return;
  if (!A.creep) buildCreep();
  ambTimerStart();
  var t = now();
  A.creepLevel = level;
  if (level > 0) A.creepLastT = t;

  var g = A.creep.head.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0, g.value), t);
    g.linearRampToValueAtTime(0.085 * level, t + 1.0);
  } catch (e) { }

  // sparse random high 'insect ticks'; rate scales with level.
  // They pass through head so they scale (and vanish) with the bed.
  if (level > 0.05 && !A.muted) {
    var n = Math.random() < 0.35 + 0.6 * level ? (Math.random() < level ? 2 : 1) : 0;
    for (var i = 0; i < n; i++) {
      var tt = t + Math.random() * 0.9;
      var o = osc('square', 4200 + Math.random() * 2600, tt);
      var og = pluck(tt, 0.25 + 0.3 * level, 0.018, 0.001);
      o.connect(og); og.connect(A.creep.tick);
      o.start(tt); o.stop(tt + 0.03);
    }
  }
}

export function alarm() {
  if (!A.ready || A.muted || !budget(4)) return;
  var t = now() + 0.002;
  var dur = 0.26;
  var head = gainNode(0.42);
  head.connect(A.sfxGain);
  var srcs = [];

  var f = lp(1500, 3.5);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  g.gain.setValueAtTime(0.5, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(head);

  var a = osc('square', 356, t);
  var b = osc('square', 358.6, t);
  a.frequency.setValueAtTime(fclamp(372), t);
  a.frequency.linearRampToValueAtTime(fclamp(344), t + dur);
  b.frequency.setValueAtTime(fclamp(374.8), t);
  b.frequency.linearRampToValueAtTime(fclamp(346), t + dur);
  a.connect(f); b.connect(f);
  a.start(t); a.stop(t + dur + 0.02);
  b.start(t); b.stop(t + dur + 0.02);
  srcs.push(a, b);

  // low body under the beep
  var s = osc('sine', 89, t);
  var sg = pluck(t, 0.3, dur * 0.9, 0.006);
  s.connect(sg); sg.connect(head);
  s.start(t); s.stop(t + dur + 0.02);
  srcs.push(s);

  voice(head, srcs);
}

export function siren() {
  if (!A.ready || A.muted || !budget(8)) return;
  var t = now() + 0.002;
  var dur = 2.0;
  var head = gainNode(0.5);
  head.connect(A.sfxGain);
  var srcs = [];

  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.09);
  g.gain.setValueAtTime(0.55, t + dur - 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(head);

  var f = bp(700, 2.4);
  f.connect(g);

  // two-and-a-bit klaxon wails
  var lowF = 210, hiF = 620, cycles = 2.5, per = dur / cycles;
  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', lowF, t);
    o.detune.value = k ? 9 : -9;
    var p = o.frequency;
    p.setValueAtTime(fclamp(lowF), t);
    for (var c = 0; c < cycles; c++) {
      var c0 = t + c * per;
      p.exponentialRampToValueAtTime(fclamp(hiF), c0 + per * 0.5);
      p.exponentialRampToValueAtTime(fclamp(lowF), c0 + per);
    }
    // sweep the formant with it
    if (k === 0) {
      f.frequency.setValueAtTime(fclamp(600), t);
      for (var c2 = 0; c2 < cycles; c2++) {
        var d0 = t + c2 * per;
        f.frequency.exponentialRampToValueAtTime(fclamp(2100), d0 + per * 0.5);
        f.frequency.exponentialRampToValueAtTime(fclamp(600), d0 + per);
      }
    }
    o.connect(f);
    o.start(t); o.stop(t + dur + 0.03);
    srcs.push(o);
  }

  // menacing sub drone
  var s = osc('sine', 54, t);
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.4, t + 0.35);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(sg); sg.connect(head);
  s.start(t); s.stop(t + dur + 0.03);
  srcs.push(s);

  // air-raid noise wash
  var nb = bp(1200, 1.2);
  nb.frequency.setValueAtTime(fclamp(700), t);
  nb.frequency.exponentialRampToValueAtTime(fclamp(2400), t + dur * 0.5);
  nb.frequency.exponentialRampToValueAtTime(fclamp(700), t + dur);
  var ng = A.ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.14, t + 0.3);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  nb.connect(ng); ng.connect(head);
  var ns = noise(t, dur + 0.02, 1.0); ns.connect(nb); srcs.push(ns);

  voice(head, srcs);
}


/* ===================================================== nuclear strike suite
   Throttle clocks are module-local rather than fields on A: nothing outside
   this file reads them, and geiger() is called once per frame so it has to
   own its own rate limiting. */
var lastNukeBoomT = -99, lastGeigerT = -99;

/* NUCLEAR LAUNCH DETECTED. Deliberately not siren(): that one is a smooth
   two-cycle wail for a capital ship. This is gated — four hard stabs — and
   sours the interval with a tritone, so it reads as a civil-defence klaxon
   rather than another boss horn.

   tier scales the SAME call rather than forking it, so the three warnings are
   audibly the same instrument at three sizes and a player never has to learn a
   second alarm: 0 tactical, 1 hydrogen, 2 the arming call for a sustained
   barrage. Going up a tier lengthens the call, adds stabs and drops the whole
   thing a fifth — bigger warning, lower voice, longer to say it. */
export function nukeAlert(tier) {
  tier = tier | 0;
  if (!A.ready || A.muted || !budget(tier ? 12 : 9)) return;
  var t = now() + 0.002;
  var dur = tier === 2 ? 3.0 : tier === 1 ? 1.95 : 1.35;
  var drop = tier === 2 ? 0.62 : tier === 1 ? 0.78 : 1;   // pitch multiplier
  var head = gainNode(tier ? 0.62 : 0.5);
  head.connect(A.sfxGain);
  var srcs = [];

  // four hard-gated stabs: an alarm articulates, a siren glides
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  var stabs = tier === 2 ? 8 : tier === 1 ? 6 : 4, per = dur / stabs;
  for (var s = 0; s < stabs; s++) {
    var s0 = t + s * per;
    g.gain.setValueAtTime(0.0001, s0);
    g.gain.exponentialRampToValueAtTime(0.6, s0 + 0.014);
    g.gain.setValueAtTime(0.6, s0 + per * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, s0 + per * 0.92);
  }
  g.connect(head);

  var f = bp(900 * drop, 3.0);
  f.frequency.setValueAtTime(fclamp(1500 * drop), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(700 * drop), t + dur * 0.55);
  f.frequency.exponentialRampToValueAtTime(fclamp(2000 * drop), t + dur);
  f.connect(g);

  // the wail falls, then overshoots upward on the last stab
  var hiF = 660 * drop, loF = 392 * drop, endF = 784 * drop;
  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', hiF, t);
    o.detune.value = k ? 11 : -11;          // ~5Hz beat, sits uneasy
    var p = o.frequency;
    p.setValueAtTime(fclamp(hiF), t);
    p.exponentialRampToValueAtTime(fclamp(loF), t + dur * 0.62);
    p.exponentialRampToValueAtTime(fclamp(endF), t + dur);
    o.connect(f);
    o.start(t); o.stop(t + dur + 0.03);
    srcs.push(o);
  }
  // tritone below the wail — the sourness that says "this is not a drill"
  var tri = osc('sawtooth', hiF / 1.414, t);
  tri.frequency.setValueAtTime(fclamp(hiF / 1.414), t);
  tri.frequency.exponentialRampToValueAtTime(fclamp(loF / 1.414), t + dur * 0.62);
  var trg = gainNode(0.4);
  tri.connect(trg); trg.connect(f);
  tri.start(t); tri.stop(t + dur + 0.03);
  srcs.push(tri);

  // sub drone swelling under the whole call. On the barrage call it does not
  // settle — it keeps climbing for the whole three seconds, which is what makes
  // that one feel like something being wound up rather than announced.
  var sub = osc('sine', tier ? 30 : 38, t);
  sub.frequency.linearRampToValueAtTime(fclamp(tier === 2 ? 74 : 58), t + dur);
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(tier ? 0.75 : 0.45, t + (tier === 2 ? 1.4 : 0.4));
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  sub.connect(sg); sg.connect(head);
  sub.start(t); sub.stop(t + dur + 0.25);
  srcs.push(sub);

  // air-raid wash
  var nb = bp(1100 * drop, 1.1);
  var ng = A.ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(tier ? 0.22 : 0.13, t + 0.3);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  nb.connect(ng); ng.connect(head);
  var ns = noise(t, dur + 0.02, 1.0); ns.connect(nb); srcs.push(ns);

  voice(head, srcs);
}

/* The detonation. This is the loudest thing in the game and the only cue
   allowed to own the mix for a full second — it ducks the music hard and
   claims two slots from the boom pool so a dogfight underneath it cannot
   starve the tail. The shape is crack -> sub drop -> long rumble, which is
   what a distant airburst actually does: the report arrives, the ground
   shock follows, then several seconds of decaying roar. */
export function nukeBoom(big) {
  if (!A.ready || A.muted) return;
  var t = now();
  /* The throttle has to come DOWN for the hydrogen round, not up: during a
     barrage the fronts arrive ~2.4s apart, but a hydrogen detonation lands on
     top of a tactical tail often enough that a 1.2s gate would silently eat
     the loudest cue in the game. A big one always gets through. */
  if (t - lastNukeBoomT < (big ? 0.5 : 1.2)) return;
  if (A.boomVoices >= MAX_BOOM - 2 || !budget(big ? 18 : 14)) return;
  lastNukeBoomT = t;
  t += 0.002;

  var dur = big ? 6.4 : 3.6;
  var head = gainNode(big ? 1.15 : 0.95);
  head.connect(A.sfxGain);
  var srcs = [];
  duckPump(t, big ? 0.42 : 0.55, big ? 2.8 : 1.6);

  // --- 1. the crack: a bright 50ms transient, the shock front arriving
  var ch = hp(big ? 1300 : 1800);
  var cg = pluck(t, big ? 0.85 : 0.7, big ? 0.09 : 0.05, 0.0012);
  ch.connect(cg); cg.connect(head);
  var cs = noise(t, big ? 0.13 : 0.07, 1.6); cs.connect(ch); srcs.push(cs);

  // --- 2. sub drop: 70Hz walked down to the floor over 1.2s. The big one
  // starts lower and takes twice as long to get there, so the floor moves
  // under the whole cue instead of thumping once.
  var so = osc('sine', big ? 52 : 70, t);
  so.frequency.exponentialRampToValueAtTime(fclamp(big ? 13 : 18), t + (big ? 2.4 : 1.2));
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(1.0, t + 0.03);
  sg.gain.exponentialRampToValueAtTime(0.35, t + (big ? 1.9 : 0.9));
  sg.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 3.4 : 1.9));
  so.connect(sg); sg.connect(head);
  so.start(t); so.stop(t + (big ? 3.45 : 1.95));
  srcs.push(so);

  // --- 3. mid punch, so it hits the chest and not just the floor
  var mo = osc('triangle', big ? 132 : 180, t);
  mo.frequency.exponentialRampToValueAtTime(fclamp(big ? 32 : 42), t + (big ? 0.5 : 0.3));
  var mg = pluck(t, big ? 0.75 : 0.6, big ? 0.9 : 0.55, 0.004);
  mo.connect(mg); mg.connect(head);
  mo.start(t); mo.stop(t + (big ? 1.0 : 0.6));
  srcs.push(mo);

  // --- 4. the rumble: two noise layers at different rates through a lowpass
  // closing slowly, which is what turns a bang into a rolling roar
  var rf = lp(1800, 1.1);
  rf.frequency.setValueAtTime(fclamp(1800), t);
  rf.frequency.exponentialRampToValueAtTime(fclamp(220), t + (big ? 2.2 : 1.4));
  rf.frequency.exponentialRampToValueAtTime(fclamp(60), t + dur);
  var rg = A.ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(big ? 1.0 : 0.9, t + 0.05);
  rg.gain.exponentialRampToValueAtTime(big ? 0.62 : 0.45, t + (big ? 1.8 : 1.1));
  rg.gain.exponentialRampToValueAtTime(0.12, t + (big ? 4.2 : 2.4));
  rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  rf.connect(rg); rg.connect(head);
  var r1 = noise(t, dur + 0.05, 0.55); r1.connect(rf); srcs.push(r1);
  var r2 = noise(t, dur + 0.05, 0.22); r2.connect(rf); srcs.push(r2);

  // --- 4b. the return: a second roar swelling back in ~1.5s later, the front
  // reflecting off the deck. It is the single thing that makes the hydrogen
  // round sound like it happened to a landscape rather than to a point.
  if (big) {
    var ef = lp(420, 0.9);
    ef.frequency.exponentialRampToValueAtTime(fclamp(70), t + dur);
    var eg = A.ctx.createGain();
    eg.gain.setValueAtTime(0.0001, t);
    eg.gain.setValueAtTime(0.0001, t + 1.35);
    eg.gain.exponentialRampToValueAtTime(0.55, t + 2.3);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    ef.connect(eg); eg.connect(head);
    var e1 = noise(t + 1.3, dur - 1.3, 0.4); e1.connect(ef); srcs.push(e1);
  }

  // --- 5. debris tail: same jittery stepped-gain trick boom() uses
  var dh = hp(900);
  var dg = A.ctx.createGain();
  dg.gain.setValueAtTime(0.0001, t + 0.1);
  var steps = big ? 22 : 14, dDur = dur * 0.8;
  for (var i = 0; i < steps; i++) {
    var it = t + 0.1 + (i / steps) * dDur;
    var amp = 0.3 * (1 - i / steps) * (0.3 + Math.random() * 0.7);
    dg.gain.setTargetAtTime(Math.max(0.0002, amp), it, dDur / (steps * 3));
  }
  dg.gain.setTargetAtTime(0.0001, t + 0.1 + dDur, 0.12);
  dh.connect(dg); dg.connect(head);
  var ds = noise(t + 0.1, dDur + 0.2, 1.3); ds.connect(dh); srcs.push(ds);

  A.boomVoices += 2;
  setTimeout(function () { A.boomVoices -= 2; }, (dur + 0.2) * 1000);
  voice(head, srcs);
}

/* Fallout crackle. Called every frame while the player is in the ring, so
   it self-throttles to ~12 rolls/sec and fires probabilistically — level
   squared, which gives roughly 3 clicks/sec at the core edge and near
   silence at the fringe, i.e. the rate itself reads as the dose. */
export function geiger(level) {
  if (!A.ready || A.muted) return;
  if (!(level > 0.05)) return;
  var t = now();
  if (t - lastGeigerT < 0.08) return;
  lastGeigerT = t;
  if (Math.random() > 0.25 * level * level) return;
  if (!budget(2)) return;
  t += 0.002;

  var head = gainNode(0.42);
  var pn = panner((Math.random() * 2 - 1) * 0.6);
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];

  var f = bp(3200 + Math.random() * 2600, 9);
  var g = pluck(t, 0.5, 0.022, 0.0008);
  f.connect(g); g.connect(head);
  var ns = noise(t, 0.03, 1.8); ns.connect(f); srcs.push(ns);

  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, 300);
  voice(head, srcs);
}
