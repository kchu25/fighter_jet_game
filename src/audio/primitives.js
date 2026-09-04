/* ===== audio/primitives.js — tiny stateless-ish DSP/graph helpers =====
   Shared by every other audio module. Anything that touches the audio graph
   reads/writes it through the A bundle from state.js. */
import { A } from './state.js';
import { MAX_VOICES } from './constants.js';

export function clamp(v, a, b) { v = +v; if (!isFinite(v)) v = a; return v < a ? a : (v > b ? b : v); }
export function fclamp(f) { f = +f; if (!isFinite(f) || f < 20) return 20; return f > A.nyq ? A.nyq : f; }
export function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function drand() { A.rngState = (A.rngState * 1664525 + 1013904223) & 0x7fffffff; return A.rngState / 0x7fffffff; }
export function now() { return A.ctx.currentTime; }

/* Track a one-shot voice so it disconnects + GCs when the last source ends. */
export function voice(head, srcs) {
  A.voices++;
  var n = srcs.length, done = 0;
  var cleanup = function () {
    done++;
    if (done < n) return;
    A.voices--;
    try { head.disconnect(); } catch (e) { }
    for (var i = 0; i < n; i++) {
      try { srcs[i].disconnect(); } catch (e) { }
      srcs[i].onended = null;
    }
    srcs.length = 0;
  };
  for (var i = 0; i < n; i++) srcs[i].onended = cleanup;
}
export function gainNode(v) { var g = A.ctx.createGain(); g.gain.value = v; return g; }

/* percussive gain envelope: 0 -> peak (attack) -> 0 (exp decay) */
export function pluck(t, peak, dur, attack) {
  var g = A.ctx.createGain();
  attack = attack || 0.003;
  peak = Math.max(0.0005, peak);
  g.gain.setValueAtTime(0.00008, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.00008, t + Math.max(dur, attack + 0.01));
  g.gain.setValueAtTime(0, t + Math.max(dur, attack + 0.01) + 0.002);
  return g;
}
export function noise(t, dur, rate) {
  var s = A.ctx.createBufferSource();
  s.buffer = A.noiseBuf;
  s.loop = true;
  if (rate) s.playbackRate.value = rate;
  s.start(t, Math.random() * 1.8);
  s.stop(t + dur + 0.005);
  return s;
}

export function osc(type, freq, t) {
  var o = A.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(fclamp(freq), t);
  return o;
}

export function lp(freq, q) { var f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }
export function hp(freq, q) { var f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }
export function bp(freq, q) { var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }
export function panner(p) {
  if (!A.ctx.createStereoPanner) return null;
  var n = A.ctx.createStereoPanner();
  n.pan.value = clamp(p, -1, 1);
  return n;
}
export function makeSoftCurve(drive) {
  var n = 1024, c = new Float32Array(n), k = drive || 1.7;
  var norm = Math.tanh(k);
  for (var i = 0; i < n; i++) {
    var x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

export function pulseOsc(freq, t, dur, duty) {
  var period = 1 / Math.max(20, freq);
  var offset = clamp(duty == null ? 0.5 : duty, 0.05, 0.95) * period;
  var a = osc('sawtooth', freq, t);
  var b = osc('sawtooth', freq, t);
  var inv = gainNode(-1);
  var sum = gainNode(0.5);
  b.connect(inv); inv.connect(sum);
  a.connect(sum);
  a.start(t); b.start(t + offset);
  a.stop(t + dur + offset + 0.02);
  b.stop(t + dur + offset + 0.02);
  return { out: sum, srcs: [a, b] };
}
export function duckPump(t, amt, rel) {
  if (!A.duckBus) return;
  var v = Math.max(0.05, 1 - amt);
  try {
    var g = A.duckBus.gain;
    /* Read the anchor value BEFORE cancelScheduledValues: cancelling a
       mid-flight release ramp snaps .value back to the ducked floor the ramp
       started from, and anchoring there would re-dip audibly. Each call then
       schedules dip + full release-to-1 as one atomic sequence, so overlapping
       pumps always end at rest no matter whose release got cancelled. */
    var cur = Math.max(0.0001, g.value);
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(v, t + 0.014);
    g.exponentialRampToValueAtTime(1, t + rel);
  } catch (e) { }
}
export function budget(n) { return A.voices + (n || 1) <= MAX_VOICES; }

