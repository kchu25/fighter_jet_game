/* ===== audio/engine.js — the persistent jet-engine drone =====
   Built once by index.js's init(); afterward only its params are ramped
   per-frame by setEngine(boost, speed). */
import { A } from './state.js';
import { fclamp, clamp, gainNode, osc, lp, hp, bp, now } from './primitives.js';

export function buildEngine() {
  var t = now();
  var e = {};

  e.out = gainNode(0.0);
  e.out.connect(A.sfxGain);

  // amplitude flutter, so the thruster feels alive
  e.flutter = gainNode(1);
  e.flutter.connect(e.out);
  e.lfo = A.ctx.createOscillator();
  e.lfo.type = 'sine';
  e.lfo.frequency.value = 6.7;
  e.lfoAmt = gainNode(0.055);
  e.lfo.connect(e.lfoAmt);
  e.lfoAmt.connect(e.flutter.gain);
  e.lfo.start(t);

  // --- tonal core: two detuned saws through a resonant lowpass ---
  e.lp = lp(360, 4.5);
  e.lp.connect(e.flutter);

  e.sawGain = gainNode(0.34);
  e.sawGain.connect(e.lp);

  e.sawA = osc('sawtooth', 46, t); e.sawA.detune.value = -11;
  e.sawB = osc('sawtooth', 46, t); e.sawB.detune.value = 13;
  e.sub = osc('sine', 23, t);
  e.subGain = gainNode(0.5);
  e.sawA.connect(e.sawGain);
  e.sawB.connect(e.sawGain);
  e.sub.connect(e.subGain); e.subGain.connect(e.lp);
  e.sawA.start(t); e.sawB.start(t); e.sub.start(t);

  // --- broadband roar: looping noise -> lowpass ---
  e.noise = A.ctx.createBufferSource();
  e.noise.buffer = A.noiseBuf;
  e.noise.loop = true;
  e.noiseHP = hp(140);
  e.noiseLP = lp(700, 0.9);
  e.noiseGain = gainNode(0.1);
  e.noise.connect(e.noiseHP);
  e.noiseHP.connect(e.noiseLP);
  e.noiseLP.connect(e.noiseGain);
  e.noiseGain.connect(e.flutter);

  // --- turbine whine: same noise source through a narrow bandpass ---
  e.whineBP = bp(1100, 7);
  e.whineGain = gainNode(0.02);
  e.noise.connect(e.whineBP);
  e.whineBP.connect(e.whineGain);
  e.whineGain.connect(e.flutter);
  e.noise.start(t);

  // fade in so init() doesn't click
  e.out.gain.setValueAtTime(0.0001, t);
  e.out.gain.linearRampToValueAtTime(0.16, t + 0.6);

  e.lastApply = -1;
  e.boost = 0; e.speed = 1;
  A.eng = e;
}

export function setEngine(boost, speed) {
  if (!A.ready) return;
  boost = clamp(boost, 0, 1);
  speed = clamp(speed, 0.5, 3);
  var t = now();
  // only push automation ~30x/sec; avoids piling automation events at 60fps
  if (t - A.eng.lastApply < 0.032 &&
    Math.abs(boost - A.eng.boost) < 0.08 && Math.abs(speed - A.eng.speed) < 0.08) return;
  A.eng.lastApply = t; A.eng.boost = boost; A.eng.speed = speed;

  var tc = 0.09;
  var base = 42 * speed;
  A.eng.sawA.frequency.setTargetAtTime(fclamp(base), t, tc);
  A.eng.sawB.frequency.setTargetAtTime(fclamp(base * 1.006), t, tc);
  A.eng.sub.frequency.setTargetAtTime(fclamp(base * 0.5), t, tc);
  A.eng.sawA.detune.setTargetAtTime(-11 - 22 * boost, t, tc);
  A.eng.sawB.detune.setTargetAtTime(13 + 26 * boost, t, tc);

  A.eng.lp.frequency.setTargetAtTime(fclamp(240 + 1500 * boost + 320 * (speed - 1)), t, tc);
  A.eng.lp.Q.setTargetAtTime(3.5 + 5 * boost, t, tc);

  A.eng.noiseLP.frequency.setTargetAtTime(fclamp(560 + 3400 * boost + 700 * (speed - 1)), t, tc);
  A.eng.noiseGain.gain.setTargetAtTime(0.085 + 0.2 * boost, t, tc);

  A.eng.whineBP.frequency.setTargetAtTime(fclamp(950 + 2500 * boost + 850 * (speed - 1)), t, tc);
  A.eng.whineGain.gain.setTargetAtTime(0.014 + 0.075 * boost, t, tc);

  A.eng.out.gain.setTargetAtTime(0.15 + 0.17 * boost + 0.03 * (speed - 1), t, 0.12);
}

