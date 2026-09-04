/* ===== audio/cine-loops.js — long-lived cinematic loop voices =====
   rumble() (rocket thrust bed) and sirenLoop() (red-alert klaxon) return
   {set,stop} handles and register themselves in A.cineLoops so stopCine()
   can tear the whole cinematic scene down at once. */
import { A } from './state.js';
import { now, gainNode, hp, lp, bp, osc, panner, fclamp, clamp } from './primitives.js';

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

  /* slow character LFOs.  A held rumble with static params reads as a test
     tone within seconds; two sub-0.2 Hz sines at unrelated periods (so the
     composite never repeats inside the cinematic) breathe the lowpass and
     sway the broadband gain.  Depth of the filter wobble scales with level
     in set() - a throttled-up engine churns, an idle one just murmurs. */
  var wob = A.ctx.createOscillator();          // raw: osc() would fclamp 0.13 Hz up to 20
  wob.type = 'sine'; wob.frequency.value = 0.13;
  var wobG = gainNode(120);
  wob.connect(wobG); wobG.connect(nlp.frequency);
  var sway = A.ctx.createOscillator();
  sway.type = 'sine'; sway.frequency.value = 0.071;
  var swayG = gainNode(0.05);
  sway.connect(swayG); swayG.connect(ng.gain);

  try { nz.start(t); cz.start(t); sub.start(t); wob.start(t); sway.start(t); } catch (e) { }

  var stopped = false;
  var nodes = [head, nhp, nlp, ng, subG, cbp, cg, wobG, swayG];
  var srcs = [nz, cz, sub, wob, sway];
  var lastLv = 0.5;

  /* occasional deep groans: every 4.5-11s a resonant lowpassed saw moans
     down from ~52 to ~35 Hz over a couple of seconds - airframe stress,
     fuel slosh, whatever the listener's imagination supplies.  Each groan
     is a self-contained one-shot that cleans itself up via onended, so the
     long-lived loop never accumulates graph nodes; the reschedule timer is
     the only persistent state and stop() clears it. */
  var groanTimer = 0;
  function groan() {
    if (stopped || !A.ready) return;
    try {
      var gt = now() + 0.02;
      var gd = 1.6 + Math.random() * 1.3;
      var f0 = 44 + Math.random() * 14;
      var go = osc('sawtooth', f0, gt);
      go.frequency.setValueAtTime(fclamp(f0), gt);
      go.frequency.exponentialRampToValueAtTime(fclamp(f0 * 0.68), gt + gd);
      var gf = lp(150, 4);
      var gg = A.ctx.createGain();
      gg.gain.setValueAtTime(0.0001, gt);
      gg.gain.exponentialRampToValueAtTime(0.05 + 0.15 * lastLv, gt + gd * 0.35);
      gg.gain.exponentialRampToValueAtTime(0.0001, gt + gd);
      go.connect(gf); gf.connect(gg); gg.connect(head);
      go.start(gt); go.stop(gt + gd + 0.05);
      go.onended = function () {
        try { go.disconnect(); gf.disconnect(); gg.disconnect(); } catch (e) { }
        go.onended = null;
      };
    } catch (e) { }
    groanTimer = setTimeout(groan, 4500 + Math.random() * 6500);
  }
  groanTimer = setTimeout(groan, 3500 + Math.random() * 3500);

  var h = {
    set: function (v) {
      if (stopped || !A.ready) return;
      var lv = clamp(v == null ? 0.5 : v, 0, 1);
      lastLv = lv;
      var tt = now(), tc = 0.15;
      try {
        head.gain.setTargetAtTime(0.08 + 0.62 * lv, tt, tc);
        nlp.frequency.setTargetAtTime(fclamp(150 + 380 * lv + 2400 * lv * lv), tt, tc);
        sub.frequency.setTargetAtTime(fclamp(32 + 13 * lv), tt, tc);
        subG.gain.setTargetAtTime(0.32 + 0.34 * lv, tt, tc);
        cg.gain.setTargetAtTime(0.006 + 0.055 * lv, tt, tc);
        wobG.gain.setTargetAtTime(40 + 240 * lv, tt, tc);   // churn more when pushed
      } catch (e) { }
    },
    stop: function (fadeSec) {
      if (stopped) return;
      stopped = true;
      clearTimeout(groanTimer);
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
  /* rotating-beacon spatialisation: the whole voice passes through a
     stereo panner swept by a very slow LFO, so the klaxon slides around
     the room the way a physical rotating horn does. */
  var pn = panner(0);
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);

  var f = bp(1100, 2.6);
  /* trem sits between the formant filter and head: as the horn swings away
     it gets quieter AND flatter in pitch together (the doppler illusion),
     and keeping the modulation off head.gain leaves stop()'s fadeOut in
     sole command of the exit - no LFO fighting the fade. */
  var trem = gainNode(0.85);
  f.connect(trem); trem.connect(head);

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

  // growl an octave down: thickens the wail into something with a chest.
  // Half-depth pitch LFO keeps its sweep proportional to the octave.
  var c = osc('sawtooth', 295, t); c.detune.value = 4;
  var lfoPitchLo = gainNode(85);
  lfo.connect(lfoPitchLo); lfoPitchLo.connect(c.frequency);
  var cAtt = gainNode(0.4);
  c.connect(cAtt); cAtt.connect(f);

  /* the rotation itself: one ~6.8s sine drives pan position, tremolo depth
     and a +/-6 Hz pitch bend in phase.  Louder-brighter-sharper as it
     faces us, softer-flatter as it turns away - a cheap but convincing
     doppler beacon.  6.8s is deliberately incommensurate with the 1.4s
     wail cycle so the combination takes ~minutes to repeat. */
  var rot = A.ctx.createOscillator();
  rot.type = 'sine'; rot.frequency.value = 1 / 6.8;
  var rotA = gainNode(0.1);
  rot.connect(rotA); rotA.connect(trem.gain);
  var rotD = gainNode(6);
  rot.connect(rotD); rotD.connect(a.frequency); rotD.connect(b.frequency);
  var rotP = null;
  if (pn) { rotP = gainNode(0.38); rot.connect(rotP); rotP.connect(pn.pan); }

  /* big-hall echo: a filtered feedback delay fed from the wail.  0.27s
     repeats at ~1/3 feedback through a 1.5k lowpass read as the alarm
     bouncing off hangar walls; the loop dies with head on stop() and
     killNodes() physically breaks the feedback cycle afterwards. */
  var dly = A.ctx.createDelay(0.5);
  dly.delayTime.value = 0.27;
  var dsend = gainNode(0.4);
  var dlp = lp(1500, 0.7);
  var fb = gainNode(0.34);
  var dwet = gainNode(0.35);
  trem.connect(dsend); dsend.connect(dly); dly.connect(dlp);
  dlp.connect(fb); fb.connect(dly);
  dlp.connect(dwet); dwet.connect(head);

  // menacing sub under the wail
  var sub = osc('sine', 58, t);
  var subG = gainNode(0.22);
  sub.connect(subG); subG.connect(head);

  try { lfo.start(t); a.start(t); b.start(t); c.start(t); sub.start(t); rot.start(t); } catch (e) { }
  head.gain.setValueAtTime(0.0001, t);
  head.gain.exponentialRampToValueAtTime(0.4, t + 0.18);

  var stopped = false;
  var nodes = [head, f, trem, lfoPitch, lfoForm, lfoPitchLo, bAtt, cAtt, subG,
    rotA, rotD, dly, dsend, dlp, fb, dwet];
  if (pn) { nodes.push(pn); nodes.push(rotP); }
  var srcs = [lfo, a, b, c, sub, rot];

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

