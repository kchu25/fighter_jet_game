/* ===== audio/instruments.js — the step-sequencer's voices =====
   kick/snare/hat/tom/ride (drums), bass, arpNote, lead (counter-line),
   stab (chord), pad, and the music-side riser (phrase-end sweep — distinct
   from the cinematic cineRiser in cine-oneshots.js). Driven entirely by
   scheduler.js; ride and lead feed the high-intensity-only busses that
   index.js builds and applyIntensity() crossfades. */
import { A } from './state.js';
import { now, gainNode, pluck, osc, noise, hp, lp, bp, fclamp, mtof, budget, voice, pulseOsc, getCrushCurve, duckPump } from './primitives.js';

export function kick(t, amp) {
  if (!budget(3)) return;
  var head = gainNode(amp);
  head.connect(A.drumBus);
  var srcs = [];

  // sidechain the rest of the mix to this hit - deeper/snappier as tension rises
  duckPump(t, (0.22 + 0.3 * A.intens) * Math.min(1, amp / 0.9), 0.1 + 0.1 * A.intens);

  var o = osc('sine', 165, t);
  o.frequency.exponentialRampToValueAtTime(fclamp(44), t + 0.07);
  o.frequency.exponentialRampToValueAtTime(fclamp(36), t + 0.3);
  var g = pluck(t, 1.0, 0.3, 0.002);
  o.connect(g); g.connect(head);
  o.start(t); o.stop(t + 0.34);
  srcs.push(o);

  // click transient
  var ch = hp(1600);
  var cg = pluck(t, 0.32, 0.02, 0.0008);
  ch.connect(cg); cg.connect(head);
  var cs = noise(t, 0.025, 1.5); cs.connect(ch); srcs.push(cs);

  var to = osc('triangle', 900, t);
  to.frequency.exponentialRampToValueAtTime(fclamp(220), t + 0.02);
  var tg = pluck(t, 0.22, 0.026, 0.0008);
  to.connect(tg); tg.connect(head);
  to.start(t); to.stop(t + 0.04);
  srcs.push(to);

  voice(head, srcs);
}

export function snare(t, amp, tight) {
  if (!budget(3)) return;
  var head = gainNode(amp);
  head.connect(A.drumBus);
  var srcs = [];
  var dur = tight ? 0.09 : 0.19;

  var f = bp(1900, 0.85);
  var g = pluck(t, 0.62, dur, 0.001);
  f.connect(g); g.connect(head);
  var ns = noise(t, dur + 0.02, 1.0); ns.connect(f); srcs.push(ns);

  var ch = hp(4200);
  var cg = pluck(t, 0.24, dur * 0.55, 0.0008);
  ch.connect(cg); cg.connect(head);
  var cs = noise(t, dur * 0.6, 1.7); cs.connect(ch); srcs.push(cs);

  // body tone
  var a = osc('triangle', 187, t);
  var b = osc('triangle', 246, t);
  var bg = pluck(t, 0.3, dur * 0.7, 0.001);
  a.connect(bg); b.connect(bg); bg.connect(head);
  a.start(t); a.stop(t + dur); b.start(t); b.stop(t + dur);
  srcs.push(a, b);

  voice(head, srcs);
}

export function hat(t, amp, open) {
  if (!budget(2)) return;
  var dur = open ? 0.19 : 0.035;
  var head = gainNode(amp);
  head.connect(A.drumBus);
  var f = hp(open ? 6800 : 8200);
  var f2 = bp(open ? 9000 : 11000, 0.7);
  var g = pluck(t, 0.3, dur, 0.0008);
  f.connect(f2); f2.connect(g); g.connect(head);
  var ns = noise(t, dur + 0.01, 1.2 + Math.random() * 0.3);
  ns.connect(f);
  voice(head, [ns]);
}

export function tom(t, freq, amp) {
  if (!budget(2)) return;
  var head = gainNode(amp);
  head.connect(A.drumBus);
  var o = osc('sine', freq, t);
  o.frequency.exponentialRampToValueAtTime(fclamp(freq * 0.55), t + 0.14);
  var g = pluck(t, 0.7, 0.16, 0.002);
  o.connect(g); g.connect(head);
  o.start(t); o.stop(t + 0.19);
  var nh = bp(freq * 2.4, 1.4);
  var ng = pluck(t, 0.14, 0.07, 0.001);
  nh.connect(ng); ng.connect(head);
  var ns = noise(t, 0.08, 1.0); ns.connect(nh);
  voice(head, [o, ns]);
}

/* driving ride/shaker tick — the high-intensity percussion layer that sits
   above the hats. Accented hits (acc) get a longer decay plus a quiet
   metallic triangle ping around 4.6kHz; unaccented boss-mode ticks are a
   single short noise src so the 16th shimmer stays cheap. Feeds rideBus,
   which applyIntensity() fades from silence below ~0.55 intensity. */
export function ride(t, amp, acc) {
  if (!budget(2)) return;
  var head = gainNode(amp);
  head.connect(A.rideBus);
  var srcs = [];
  var f = hp(7400);
  var f2 = bp(10200, 1.0);
  var g = pluck(t, 0.3, acc ? 0.13 : 0.05, 0.0008);
  f.connect(f2); f2.connect(g); g.connect(head);
  var ns = noise(t, acc ? 0.14 : 0.06, 1.25 + Math.random() * 0.2);
  ns.connect(f); srcs.push(ns);
  if (acc) {
    var o = osc('triangle', 4600 + Math.random() * 300, t);
    var og = pluck(t, 0.12, 0.16, 0.0008);
    o.connect(og); og.connect(head);
    o.start(t); o.stop(t + 0.18);
    srcs.push(o);
  }
  voice(head, srcs);
}

/* gated saw bass with a resonant filter envelope */
export function bass(t, midi, dur, accent, octave) {
  if (!budget(4)) return;
  var f0 = mtof(midi);
  var head = gainNode(0.9 * accent);
  head.connect(A.bassBus);
  var srcs = [];

  var cutBase = 170 + 900 * A.intens + 380 * accent;
  var cutPeak = cutBase * (2.6 + 3.4 * A.intens);
  var flt = lp(cutBase, 9 + 6 * A.intens);
  flt.frequency.setValueAtTime(fclamp(cutPeak), t);
  flt.frequency.exponentialRampToValueAtTime(fclamp(cutBase), t + Math.min(0.11, dur * 0.9));

  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.75, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.42, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  flt.connect(g); g.connect(head);

  // saw + square hybrid stack - the square edge reads more digital/growly
  // than a plain double-saw while the resonant lowpass keeps it from
  // getting harsh. The unison spread widens a few cents with intensity so
  // the beating between the pair gets chorus-thick exactly when the track
  // needs the bass to loom (the bus-level tanh stage in index.js then adds
  // the matching harmonic weight).
  var a = osc('sawtooth', f0, t); a.detune.value = -8 - 6 * A.intens;
  var b = osc('square', f0, t); b.detune.value = 9 + 6 * A.intens;
  var bTrim = gainNode(0.6);
  a.connect(flt);
  b.connect(bTrim); bTrim.connect(flt);
  a.start(t); a.stop(t + dur + 0.02);
  b.start(t); b.stop(t + dur + 0.02);
  srcs.push(a, b);

  // separate sub-bass layer: pure sine, its own envelope, unaffected by
  // the resonant filter so the low end always stays solid and clean; it
  // leans in a touch harder at high intensity for extra full-tilt weight
  var s = osc('sine', f0 * 0.5, t);
  var sg = pluck(t, 0.48 + 0.14 * A.intens, dur * 0.95, 0.004);
  s.connect(sg); sg.connect(head);
  s.start(t); s.stop(t + dur + 0.02);
  srcs.push(s);

  // boss: octave-up doubling, run through a bitcrusher for a snarling
  // digital edge instead of a plain extra saw
  if (octave) {
    var o2 = osc('sawtooth', f0 * 2, t); o2.detune.value = 6;
    var og = pluck(t, 0.22, dur * 0.85, 0.003);
    var of = lp(fclamp(cutBase * 3.2), 4);
    var crush = A.ctx.createWaveShaper();
    crush.curve = getCrushCurve();
    o2.connect(crush); crush.connect(of); of.connect(og); og.connect(head);
    o2.start(t); o2.stop(t + dur + 0.02);
    srcs.push(o2);
  }

  voice(head, srcs);
}

export function arpNote(t, midi, dur) {
  if (!budget(3)) return;
  var f0 = mtof(midi);
  var head = gainNode(0.5);
  head.connect(A.arpBus);
  var send = gainNode(0.26 + 0.12 * A.intens);
  head.connect(send); send.connect(A.fxDelay);

  var flt = lp(1800 + 5200 * A.intens, 3.2);
  flt.frequency.setValueAtTime(fclamp(f0 * 6 + 2000 * A.intens), t);
  flt.frequency.exponentialRampToValueAtTime(fclamp(900 + 2400 * A.intens), t + dur);
  var g = pluck(t, 0.5, dur, 0.003);
  flt.connect(g); g.connect(head);

  var a = osc('sawtooth', f0, t); a.detune.value = -7;
  a.connect(flt);
  a.start(t); a.stop(t + dur + 0.02);

  // PWM pulse layer, width slowly breathing over real time - a cheap but
  // convincing "analog synth gone digital" movement on the lead voice
  var duty = 0.5 - 0.28 * (0.5 + 0.5 * Math.sin(t * 0.9));
  var pw = pulseOsc(f0 * 1.003, t, dur, duty);
  pw.srcs[0].detune.value = 6; pw.srcs[1].detune.value = 6;
  var bg = gainNode(0.4);
  pw.out.connect(bg); bg.connect(flt);

  voice(head, [a].concat(pw.srcs));
  setTimeout(function () { try { send.disconnect(); } catch (e) { } }, (dur + 0.4) * 1000);
}

/* soaring counter-line lead — the melodic high-intensity layer. Two saws a
   dozen-odd cents apart with delayed vibrato (the vibrato depth ramps in
   over the first third of a second, singer-style, so held notes bloom
   instead of warbling from the attack) plus a generous tempo-delay send
   for that widescreen trance-anthem tail. Feeds leadBus, which
   applyIntensity() only opens near full intensity, so this line belongs to
   boss fights and peak combat and is simply absent from the lulls. */
export function lead(t, midi, dur) {
  if (!budget(3)) return;
  var f0 = mtof(midi);
  var head = gainNode(0.5);
  head.connect(A.leadBus);
  var send = gainNode(0.3);
  head.connect(send); send.connect(A.fxDelay);

  var flt = lp(1900 + 4200 * A.intens, 1.3);
  flt.frequency.setValueAtTime(fclamp(2600 + 4200 * A.intens), t);
  flt.frequency.exponentialRampToValueAtTime(fclamp(1500 + 3200 * A.intens), t + Math.min(0.5, dur));
  var rel = Math.max(0.06, dur * 0.25);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.025);
  g.gain.setValueAtTime(0.5, t + Math.max(0.03, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  flt.connect(g); g.connect(head);

  var a = osc('sawtooth', f0, t); a.detune.value = -6;
  var b = osc('sawtooth', f0, t); b.detune.value = 7;
  a.connect(flt); b.connect(flt);
  a.start(t); a.stop(t + dur + 0.08);
  b.start(t); b.stop(t + dur + 0.08);

  var v = osc('sine', 5.3, t);
  var vAmt = A.ctx.createGain();
  vAmt.gain.setValueAtTime(0, t);
  vAmt.gain.linearRampToValueAtTime(10, t + Math.min(0.35, dur * 0.6));
  v.connect(vAmt); vAmt.connect(a.detune); vAmt.connect(b.detune);
  v.start(t); v.stop(t + dur + 0.08);

  voice(head, [a, b, v]);
  setTimeout(function () { try { send.disconnect(); } catch (e) { } }, (dur + 0.5) * 1000);
}

/* detuned supersaw chord stab */
export function stab(t, chord, dur, nasty) {
  if (!budget(10)) return;
  var head = gainNode(0.3);
  head.connect(A.arpBus);
  var send = gainNode(0.22);
  head.connect(send); send.connect(A.fxDelay);

  var flt = lp(1000, 5.5);
  flt.frequency.setValueAtTime(fclamp(5200 + 3000 * A.intens), t);
  flt.frequency.exponentialRampToValueAtTime(fclamp(700), t + dur);
  var g = pluck(t, 0.55, dur, 0.004);
  flt.connect(g); g.connect(head);

  var srcs = [];
  var det = [-14, 0, 15];
  for (var i = 0; i < chord.length; i++) {
    var f0 = mtof(chord[i]);
    var kmax = nasty ? 3 : 2;
    for (var k = 0; k < kmax; k++) {
      // boss stacks get one unison voice swapped for a duty-varied pulse
      // instead of another saw - a "synth stack" of saw + pulse reads
      // more digital than pure supersaw
      if (nasty && k === 2) {
        var duty = 0.3 + 0.15 * Math.sin(t * 1.7 + i);
        var pw = pulseOsc(f0, t, dur, duty);
        pw.srcs[0].detune.value = det[k] * 1.6;
        pw.srcs[1].detune.value = det[k] * 1.6;
        pw.out.connect(flt);
        srcs.push(pw.srcs[0], pw.srcs[1]);
      } else {
        var o = osc('sawtooth', f0, t);
        o.detune.value = det[k] * (nasty ? 1.6 : 1);
        o.connect(flt);
        o.start(t); o.stop(t + dur + 0.02);
        srcs.push(o);
      }
    }
  }
  if (nasty) {
    // minor second clash against the root - ring-modulated for a
    // metallic/alien snarl instead of a plain dissonant saw
    var c = osc('sawtooth', mtof(chord[0] + 13), t);
    var ringLFO = osc('sine', mtof(chord[0] + 13) * 0.5, t);
    var ringAmt = gainNode(0.35);
    var ringGain = gainNode(0);      // base 0 -> output = carrier * modulator (true ring mod)
    ringLFO.connect(ringAmt); ringAmt.connect(ringGain.gain);
    c.connect(ringGain); ringGain.connect(flt);
    c.start(t); c.stop(t + dur + 0.02);
    ringLFO.start(t); ringLFO.stop(t + dur + 0.02);
    srcs.push(c, ringLFO);
  }

  voice(head, srcs);
  setTimeout(function () { try { send.disconnect(); } catch (e) { } }, (dur + 0.5) * 1000);
}

export function pad(t, chord, dur) {
  if (!budget(8)) return;      // 4-note (add9) voicings now, was 3
  var head = gainNode(0.22);
  head.connect(A.padBus);
  var flt = lp(700 + 900 * A.intens, 1.2);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  flt.connect(g); g.connect(head);

  // slow filter shimmer across the sustain - subtle, futuristic movement
  // rather than a static drone
  var lfo = osc('sine', 0.18, t);
  var lfoAmt = gainNode(220 + 260 * A.intens);
  lfo.connect(lfoAmt); lfoAmt.connect(flt.frequency);
  lfo.start(t); lfo.stop(t + dur + 0.05);

  var srcs = [lfo];
  for (var i = 0; i < chord.length; i++) {
    var f0 = mtof(chord[i] - 12);
    // saw + square hybrid: the square layer gives a bit of "digital choir"
    // brightness on top of the saw body, trimmed so it doesn't overpower
    var a = osc('sawtooth', f0, t); a.detune.value = -9;
    var b = osc('square', f0, t); b.detune.value = 11;
    var bTrim = gainNode(0.55);
    a.connect(flt);
    b.connect(bTrim); bTrim.connect(flt);
    a.start(t); a.stop(t + dur + 0.05);
    b.start(t); b.stop(t + dur + 0.05);
    srcs.push(a, b);
  }
  voice(head, srcs);
}

/* rising noise+saw sweep used as a phrase-end riser */
export function riser(t, dur) {
  if (!budget(4)) return;
  var head = gainNode(0.3);
  head.connect(A.musicFilter);
  var srcs = [];

  var f = bp(300, 1.5);
  f.frequency.setValueAtTime(fclamp(260), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(9000), t + dur);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  f.connect(g); g.connect(head);
  var ns = noise(t, dur + 0.08, 1.0); ns.connect(f); srcs.push(ns);

  var o = osc('sawtooth', 110, t);
  o.frequency.exponentialRampToValueAtTime(fclamp(1760), t + dur);
  var of = lp(2500, 6);
  of.frequency.setValueAtTime(fclamp(500), t);
  of.frequency.exponentialRampToValueAtTime(fclamp(6000), t + dur);
  var og = A.ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.9);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  o.connect(of); of.connect(og); og.connect(head);
  o.start(t); o.stop(t + dur + 0.09);
  srcs.push(o);

  voice(head, srcs);
}

