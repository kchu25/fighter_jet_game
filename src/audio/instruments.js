/* ===== audio/instruments.js — the step-sequencer's voices =====
   kick/snare/hat/tom (drums), bass, arpNote, stab (chord), pad, and the
   music-side riser (phrase-end sweep — distinct from the cinematic
   cineRiser in cine-oneshots.js). Driven entirely by scheduler.js. */
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
  // getting harsh
  var a = osc('sawtooth', f0, t); a.detune.value = -8;
  var b = osc('square', f0, t); b.detune.value = 9;
  var bTrim = gainNode(0.6);
  a.connect(flt);
  b.connect(bTrim); bTrim.connect(flt);
  a.start(t); a.stop(t + dur + 0.02);
  b.start(t); b.stop(t + dur + 0.02);
  srcs.push(a, b);

  // separate sub-bass layer: pure sine, its own envelope, unaffected by
  // the resonant filter so the low end always stays solid and clean
  var s = osc('sine', f0 * 0.5, t);
  var sg = pluck(t, 0.48, dur * 0.95, 0.004);
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

