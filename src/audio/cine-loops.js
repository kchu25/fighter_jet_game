/* ===== audio/cine-loops.js — long-lived cinematic loop voices =====
   rumble() (rocket thrust bed) and sirenLoop() (red-alert klaxon) return
   {set,stop} handles and register themselves in A.cineLoops so stopCine()
   can tear the whole cinematic scene down at once. */
import { A } from './state.js';
import { now, gainNode, hp, lp, bp, osc, fclamp, clamp } from './primitives.js';

/* handle handed back when there is no context - same shape, all no-ops */
export function inertHandle() {
  return { set: function () { }, stop: function () { } };
}

export function regLoop(h) { A.cineLoops.push(h); return h; }
export function unregLoop(h) { var i = A.cineLoops.indexOf(h); if (i >= 0) A.cineLoops.splice(i, 1); }

export function killNodes(nodes) {
  for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { } }
  nodes.length = 0;
}

export function loopNoise(rate) {
  var s = A.ctx.createBufferSource();
  s.buffer = A.noiseBuf;
  s.loop = true;
  if (rate) s.playbackRate.value = rate;
  return s;
}

/* Pin the param at its current automated value then ramp to silence.
   The setValueAtTime is what actually terminates a running
   setTargetAtTime - cancelScheduledValues alone would not. */
export function fadeOut(g, t, f) {
  try {
    var v = Math.max(0.0001, g.gain.value);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + f);
  } catch (e) { }
}

/* ---------------------------------------------------------------
   1. rumble(level) -> { set(level), stop(fadeSec) }
   Sustained rocket thrust bed.  Long lived, so deliberately outside
   the budget()/voice() one-shot accounting.
   --------------------------------------------------------------- */
export function rumble(level) {
  if (!A.ready) return inertHandle();
  var t = now();

  var head = gainNode(0.0001);
  head.connect(A.sfxGain);

  // broadband thrust: looping noise, lowpass opens with level
  var nz = loopNoise(0.85);
  var nhp = hp(26);
  var nlp = lp(220, 1.2);
  var ng = gainNode(0.85);
  nz.connect(nhp); nhp.connect(nlp); nlp.connect(ng); ng.connect(head);

  // sub bed
  var sub = osc('sine', 34, t);
  var subG = gainNode(0.5);
  sub.connect(subG); subG.connect(head);

  // crackle: same noise material, faster + narrow band, sits on top
  var cz = loopNoise(1.9);
  var cbp = bp(2400, 1.3);
  var cg = gainNode(0.01);
  cz.connect(cbp); cbp.connect(cg); cg.connect(head);

  try { nz.start(t); cz.start(t); sub.start(t); } catch (e) { }

  var stopped = false;
  var nodes = [head, nhp, nlp, ng, subG, cbp, cg];
  var srcs = [nz, cz, sub];

  var h = {
    set: function (v) {
      if (stopped || !A.ready) return;
      var lv = clamp(v == null ? 0.5 : v, 0, 1);
      var tt = now(), tc = 0.15;
      try {
        head.gain.setTargetAtTime(0.08 + 0.62 * lv, tt, tc);
        nlp.frequency.setTargetAtTime(fclamp(150 + 380 * lv + 2400 * lv * lv), tt, tc);
        sub.frequency.setTargetAtTime(fclamp(32 + 13 * lv), tt, tc);
        subG.gain.setTargetAtTime(0.32 + 0.34 * lv, tt, tc);
        cg.gain.setTargetAtTime(0.006 + 0.055 * lv, tt, tc);
      } catch (e) { }
    },
    stop: function (fadeSec) {
      if (stopped) return;
      stopped = true;
      unregLoop(h);
      var f = (fadeSec == null) ? 0.6 : clamp(fadeSec, 0.02, 8);
      var tt = 0;
      try { tt = now(); } catch (e) { }
      fadeOut(head, tt, f);
      for (var i = 0; i < srcs.length; i++) { try { srcs[i].stop(tt + f + 0.04); } catch (e) { } }
      setTimeout(function () { killNodes(nodes); killNodes(srcs); }, (f + 0.2) * 1000);
    }
  };

  h.set(level == null ? 0.5 : level);
  return regLoop(h);
}

export function sirenLoop() {
  if (!A.ready) return inertHandle();
  var t = now();
  var CYCLE = 1.4;

  var head = gainNode(0.0001);
  head.connect(A.sfxGain);

  var f = bp(1100, 2.6);
  f.connect(head);

  // 590 +/- 170 => 420 .. 760 Hz
  var lfo = A.ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 1 / CYCLE;
  var lfoPitch = gainNode(170);
  var lfoForm = gainNode(900);
  lfo.connect(lfoPitch);
  lfo.connect(lfoForm);
  lfoForm.connect(f.frequency);

  var a = osc('sawtooth', 590, t); a.detune.value = -5;
  var b = osc('sawtooth', 593, t); b.detune.value = 8;   // slow mechanical beating
  lfoPitch.connect(a.frequency);
  lfoPitch.connect(b.frequency);
  var bAtt = gainNode(0.7);
  a.connect(f); b.connect(bAtt); bAtt.connect(f);

  // menacing sub under the wail
  var sub = osc('sine', 58, t);
  var subG = gainNode(0.22);
  sub.connect(subG); subG.connect(head);

  try { lfo.start(t); a.start(t); b.start(t); sub.start(t); } catch (e) { }
  head.gain.setValueAtTime(0.0001, t);
  head.gain.exponentialRampToValueAtTime(0.4, t + 0.18);

  var stopped = false;
  var nodes = [head, f, lfoPitch, lfoForm, bAtt, subG];
  var srcs = [lfo, a, b, sub];

  var h = {
    set: function () { },
    stop: function () {
      if (stopped) return;
      stopped = true;
      unregLoop(h);
      var tt = 0;
      try { tt = now(); } catch (e) { }
      fadeOut(head, tt, 0.25);
      for (var i = 0; i < srcs.length; i++) { try { srcs[i].stop(tt + 0.3); } catch (e) { } }
      setTimeout(function () { killNodes(nodes); killNodes(srcs); }, 460);
    }
  };
  return regLoop(h);
}

export function stopCine() {
  var list = A.cineLoops.slice(0);
  A.cineLoops.length = 0;
  for (var i = 0; i < list.length; i++) {
    try { list[i].stop(0.08); } catch (e) { }
  }
}

