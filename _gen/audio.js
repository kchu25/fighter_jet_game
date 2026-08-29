/* =====================================================================
   SKYFALL INTERCEPTOR - audio module
   Fully procedural Web Audio. No files, no samples, no fetch.
   Exposes exactly one global: AUDIO
   Nothing is allocated until AUDIO.init() is called from a user gesture.
   ===================================================================== */
const AUDIO = (function () {
  'use strict';

  /* ---------------------------------------------------------------
     state (all null / inert until init)
     --------------------------------------------------------------- */
  var ctx = null;
  var ready = false;
  var muted = false;
  var nyq = 20000;

  // busses
  var preComp, comp, master, musicGain, sfxGain, sfxShaper;
  var musicFilter, drumBus, bassBus, arpBus, padBus;
  var fxDelay, fxFeedback, fxTone;

  // engine (persistent voice)
  var eng = null;

  // shared noise
  var noiseBuf = null;

  // voice accounting
  var voices = 0;
  var laserVoices = 0;
  var boomVoices = 0;
  var MAX_VOICES = 72;
  var MAX_LASER = 6;
  var MAX_BOOM = 9;
  var lastLaserT = -1;

  /* ---------------------------------------------------------------
     musical constants
     --------------------------------------------------------------- */
  var BPM = 146;
  var SPB = 60 / BPM;          // seconds per beat
  var STEP = SPB / 4;          // 16th note
  var BAR_STEPS = 16;
  var BARS = 8;
  var LOOP_STEPS = BAR_STEPS * BARS;

  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.14;

  var timerId = null;
  var nextNoteTime = 0;
  var stepCount = 0;

  // intensity: raw target from the game, smoothed value used for musical decisions
  var intensTarget = 0;
  var intens = 0;

  // 8 bar progression in A minor.  root = bass midi, ch = triad voicing
  var PROG = [
    { root: 45, ch: [57, 60, 64] },  // Am
    { root: 45, ch: [57, 60, 64] },  // Am
    { root: 41, ch: [53, 57, 60] },  // F
    { root: 43, ch: [55, 59, 62] },  // G
    { root: 48, ch: [60, 64, 67] },  // C
    { root: 48, ch: [60, 64, 67] },  // C
    { root: 41, ch: [53, 57, 60] },  // F
    { root: 40, ch: [56, 59, 64] }   // E (major -> harmonic tension back to Am)
  ];

  // 16th gate for the bassline + octave jumps
  var BASS_GATE = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1];
  var BASS_OCT = [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 12, 0, 12];
  var BASS_ACC = [1, 0, .7, .8, .95, 0, .7, 0, 1, 0, .7, .8, .9, .7, 0, .65];

  var ARP_IDX = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 5, 3, 4, 2];
  var HAT_ACC = [1, .45, .7, .45, .9, .45, .7, .5, 1, .45, .7, .45, .9, .5, .75, .6];

  /* ---------------------------------------------------------------
     tiny helpers
     --------------------------------------------------------------- */
  function clamp(v, a, b) { v = +v; if (!isFinite(v)) v = a; return v < a ? a : (v > b ? b : v); }
  function fclamp(f) { f = +f; if (!isFinite(f) || f < 20) return 20; return f > nyq ? nyq : f; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // deterministic pseudo random for musical variation
  var rngState = 22222;
  function drand() { rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff; return rngState / 0x7fffffff; }

  function now() { return ctx.currentTime; }

  /* Track a one-shot voice so it disconnects + GCs when the last source ends. */
  function voice(head, srcs) {
    voices++;
    var n = srcs.length, done = 0;
    var cleanup = function () {
      done++;
      if (done < n) return;
      voices--;
      try { head.disconnect(); } catch (e) { }
      for (var i = 0; i < n; i++) {
        try { srcs[i].disconnect(); } catch (e) { }
        srcs[i].onended = null;
      }
      srcs.length = 0;
    };
    for (var i = 0; i < n; i++) srcs[i].onended = cleanup;
  }

  function gainNode(v) { var g = ctx.createGain(); g.gain.value = v; return g; }

  /* percussive gain envelope: 0 -> peak (attack) -> 0 (exp decay) */
  function pluck(t, peak, dur, attack) {
    var g = ctx.createGain();
    attack = attack || 0.003;
    peak = Math.max(0.0005, peak);
    g.gain.setValueAtTime(0.00008, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.00008, t + Math.max(dur, attack + 0.01));
    g.gain.setValueAtTime(0, t + Math.max(dur, attack + 0.01) + 0.002);
    return g;
  }

  /* one-shot noise source reading a random slice of the shared buffer */
  function noise(t, dur, rate) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.8);
    s.stop(t + dur + 0.005);
    return s;
  }

  function osc(type, freq, t) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(fclamp(freq), t);
    return o;
  }

  function lp(freq, q) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }
  function hp(freq, q) { var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }
  function bp(freq, q) { var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fclamp(freq); if (q != null) f.Q.value = q; return f; }

  function panner(p) {
    if (!ctx.createStereoPanner) return null;
    var n = ctx.createStereoPanner();
    n.pan.value = clamp(p, -1, 1);
    return n;
  }

  /* soft saturation curve for the sfx bus - adds arcade grit, tames peaks */
  function makeSoftCurve(drive) {
    var n = 1024, c = new Float32Array(n), k = drive || 1.7;
    var norm = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / norm;
    }
    return c;
  }

  /* ---------------------------------------------------------------
     init
     --------------------------------------------------------------- */
  function init() {
    if (ready) { try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { } return; }
    if (typeof window === 'undefined') return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try { ctx = new AC({ latencyHint: 'interactive' }); }
    catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; } }
    if (!ctx) return;

    nyq = Math.max(4000, ctx.sampleRate * 0.5 - 400);

    /* ---- shared noise buffer (2s white noise, reused by everything) ---- */
    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    /* ---- master chain ---- */
    master = gainNode(muted ? 0 : 0.92);
    master.connect(ctx.destination);

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 26;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(master);

    preComp = gainNode(1);
    preComp.connect(comp);

    musicGain = gainNode(0.62);
    musicFilter = lp(1200, 0.9);
    musicFilter.connect(musicGain);
    musicGain.connect(preComp);

    sfxShaper = ctx.createWaveShaper();
    sfxShaper.curve = makeSoftCurve(1.55);
    sfxShaper.oversample = '2x';
    sfxShaper.connect(preComp);

    sfxGain = gainNode(0.85);
    sfxGain.connect(sfxShaper);

    /* ---- shared tempo-synced delay (used by arp / stabs / pickup) ---- */
    fxDelay = ctx.createDelay(1.5);
    fxDelay.delayTime.value = STEP * 3;           // dotted 8th
    fxFeedback = gainNode(0.34);
    fxTone = ctx.createBiquadFilter();
    fxTone.type = 'bandpass';
    fxTone.frequency.value = 1500;
    fxTone.Q.value = 0.55;
    fxDelay.connect(fxFeedback);
    fxFeedback.connect(fxDelay);
    fxDelay.connect(fxTone);
    fxTone.connect(preComp);

    /* ---- music sub-busses ---- */
    drumBus = gainNode(0.9); drumBus.connect(musicFilter);
    bassBus = gainNode(0.0); bassBus.connect(musicFilter);
    arpBus = gainNode(0.0); arpBus.connect(musicFilter);
    padBus = gainNode(0.0); padBus.connect(musicFilter);

    buildEngine();

    ready = true;

    // prime the sequencer
    intens = intensTarget;
    applyIntensity(now(), true);
    nextNoteTime = now() + 0.09;
    stepCount = 0;
    if (timerId === null) timerId = setInterval(scheduler, LOOKAHEAD_MS);

    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
  }

  /* ---------------------------------------------------------------
     ENGINE  (persistent - built once, only params are ramped)
     --------------------------------------------------------------- */
  function buildEngine() {
    var t = now();
    var e = {};

    e.out = gainNode(0.0);
    e.out.connect(sfxGain);

    // amplitude flutter, so the thruster feels alive
    e.flutter = gainNode(1);
    e.flutter.connect(e.out);
    e.lfo = ctx.createOscillator();
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
    e.noise = ctx.createBufferSource();
    e.noise.buffer = noiseBuf;
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
    eng = e;
  }

  function setEngine(boost, speed) {
    if (!ready) return;
    boost = clamp(boost, 0, 1);
    speed = clamp(speed, 0.5, 3);
    var t = now();
    // only push automation ~30x/sec; avoids piling automation events at 60fps
    if (t - eng.lastApply < 0.032 &&
      Math.abs(boost - eng.boost) < 0.08 && Math.abs(speed - eng.speed) < 0.08) return;
    eng.lastApply = t; eng.boost = boost; eng.speed = speed;

    var tc = 0.09;
    var base = 42 * speed;
    eng.sawA.frequency.setTargetAtTime(fclamp(base), t, tc);
    eng.sawB.frequency.setTargetAtTime(fclamp(base * 1.006), t, tc);
    eng.sub.frequency.setTargetAtTime(fclamp(base * 0.5), t, tc);
    eng.sawA.detune.setTargetAtTime(-11 - 22 * boost, t, tc);
    eng.sawB.detune.setTargetAtTime(13 + 26 * boost, t, tc);

    eng.lp.frequency.setTargetAtTime(fclamp(240 + 1500 * boost + 320 * (speed - 1)), t, tc);
    eng.lp.Q.setTargetAtTime(3.5 + 5 * boost, t, tc);

    eng.noiseLP.frequency.setTargetAtTime(fclamp(560 + 3400 * boost + 700 * (speed - 1)), t, tc);
    eng.noiseGain.gain.setTargetAtTime(0.085 + 0.2 * boost, t, tc);

    eng.whineBP.frequency.setTargetAtTime(fclamp(950 + 2500 * boost + 850 * (speed - 1)), t, tc);
    eng.whineGain.gain.setTargetAtTime(0.014 + 0.075 * boost, t, tc);

    eng.out.gain.setTargetAtTime(0.15 + 0.17 * boost + 0.03 * (speed - 1), t, 0.12);
  }

  /* ---------------------------------------------------------------
     SFX
     --------------------------------------------------------------- */
  function budget(n) { return voices + (n || 1) <= MAX_VOICES; }

  var laserSide = 1;
  function laser() {
    if (!ready || muted) return;
    var t = now();
    if (t - lastLaserT < 0.042) return;           // rapid-fire guard
    if (laserVoices >= MAX_LASER || !budget(4)) return;
    lastLaserT = t;
    t += 0.002;

    laserSide = -laserSide;
    var head = gainNode(0.55);
    var pn = panner(laserSide * 0.38);
    if (pn) { head.connect(pn); pn.connect(sfxGain); } else head.connect(sfxGain);

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
      o.frequency.setValueAtTime(fclamp(1900 + laserSide * 60), t);
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

    laserVoices++;
    voice(head, srcs);
    setTimeout(function () { laserVoices--; }, 220);
    if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, 400);
  }

  function missile() {
    if (!ready || muted || !budget(5)) return;
    var t = now() + 0.002;
    var head = gainNode(0.6);
    head.connect(sfxGain);
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
    var wg = ctx.createGain();
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

  function boom(size) {
    if (!ready || muted) return;
    size = clamp(size == null ? 1 : size, 0.15, 2.4);
    if (boomVoices >= MAX_BOOM || !budget(5)) return;
    var t = now() + 0.002;
    var dur = 0.34 + 0.72 * size;
    var head = gainNode(clamp(0.5 + 0.35 * size, 0.3, 1.0));
    var pn = panner((Math.random() * 2 - 1) * 0.3);
    if (pn) { head.connect(pn); pn.connect(sfxGain); } else head.connect(sfxGain);
    var srcs = [];

    // --- body: noise through a lowpass sweeping down ---
    var bf = lp(3000, 1.6);
    bf.frequency.setValueAtTime(fclamp(2600 / Math.pow(size, 0.5)), t);
    bf.frequency.exponentialRampToValueAtTime(fclamp(90 / size), t + dur * 0.85);
    var bg = ctx.createGain();
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
      var cg = ctx.createGain();
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

    boomVoices++;
    setTimeout(function () { boomVoices--; }, (dur + 0.15) * 1000);
    if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.6) * 1000);
    voice(head, srcs);
  }

  function thud() {
    if (!ready || muted || !budget(4)) return;
    var t = now() + 0.002;
    var head = gainNode(0.8);
    head.connect(sfxGain);
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

  function pickup() {
    if (!ready || muted || !budget(8)) return;
    var t = now() + 0.002;
    var head = gainNode(0.34);
    head.connect(sfxGain);
    var send = gainNode(0.3);
    head.connect(send); send.connect(fxDelay);
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

  function alarm() {
    if (!ready || muted || !budget(4)) return;
    var t = now() + 0.002;
    var dur = 0.26;
    var head = gainNode(0.42);
    head.connect(sfxGain);
    var srcs = [];

    var f = lp(1500, 3.5);
    var g = ctx.createGain();
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

  function siren() {
    if (!ready || muted || !budget(8)) return;
    var t = now() + 0.002;
    var dur = 2.0;
    var head = gainNode(0.5);
    head.connect(sfxGain);
    var srcs = [];

    var g = ctx.createGain();
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
    var sg = ctx.createGain();
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
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.14, t + 0.3);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    nb.connect(ng); ng.connect(head);
    var ns = noise(t, dur + 0.02, 1.0); ns.connect(nb); srcs.push(ns);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     MUSIC - instruments
     --------------------------------------------------------------- */

  function kick(t, amp) {
    if (!budget(3)) return;
    var head = gainNode(amp);
    head.connect(drumBus);
    var srcs = [];

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

  function snare(t, amp, tight) {
    if (!budget(3)) return;
    var head = gainNode(amp);
    head.connect(drumBus);
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

  function hat(t, amp, open) {
    if (!budget(2)) return;
    var dur = open ? 0.19 : 0.035;
    var head = gainNode(amp);
    head.connect(drumBus);
    var f = hp(open ? 6800 : 8200);
    var f2 = bp(open ? 9000 : 11000, 0.7);
    var g = pluck(t, 0.3, dur, 0.0008);
    f.connect(f2); f2.connect(g); g.connect(head);
    var ns = noise(t, dur + 0.01, 1.2 + Math.random() * 0.3);
    ns.connect(f);
    voice(head, [ns]);
  }

  function tom(t, freq, amp) {
    if (!budget(2)) return;
    var head = gainNode(amp);
    head.connect(drumBus);
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
  function bass(t, midi, dur, accent, octave) {
    if (!budget(4)) return;
    var f0 = mtof(midi);
    var head = gainNode(0.9 * accent);
    head.connect(bassBus);
    var srcs = [];

    var cutBase = 170 + 900 * intens + 380 * accent;
    var cutPeak = cutBase * (2.6 + 3.4 * intens);
    var flt = lp(cutBase, 9 + 6 * intens);
    flt.frequency.setValueAtTime(fclamp(cutPeak), t);
    flt.frequency.exponentialRampToValueAtTime(fclamp(cutBase), t + Math.min(0.11, dur * 0.9));

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.42, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    flt.connect(g); g.connect(head);

    var a = osc('sawtooth', f0, t); a.detune.value = -8;
    var b = osc('sawtooth', f0, t); b.detune.value = 9;
    a.connect(flt); b.connect(flt);
    a.start(t); a.stop(t + dur + 0.02);
    b.start(t); b.stop(t + dur + 0.02);
    srcs.push(a, b);

    // sub sine keeps the low end solid regardless of the filter
    var s = osc('sine', f0 * 0.5, t);
    var sg = pluck(t, 0.45, dur * 0.95, 0.004);
    s.connect(sg); sg.connect(head);
    s.start(t); s.stop(t + dur + 0.02);
    srcs.push(s);

    // boss: octave-up doubling for aggression
    if (octave) {
      var o2 = osc('sawtooth', f0 * 2, t); o2.detune.value = 6;
      var og = pluck(t, 0.22, dur * 0.85, 0.003);
      var of = lp(fclamp(cutBase * 3.2), 4);
      o2.connect(of); of.connect(og); og.connect(head);
      o2.start(t); o2.stop(t + dur + 0.02);
      srcs.push(o2);
    }

    voice(head, srcs);
  }

  function arpNote(t, midi, dur) {
    if (!budget(3)) return;
    var f0 = mtof(midi);
    var head = gainNode(0.5);
    head.connect(arpBus);
    var send = gainNode(0.26 + 0.12 * intens);
    head.connect(send); send.connect(fxDelay);

    var flt = lp(1800 + 5200 * intens, 3.2);
    flt.frequency.setValueAtTime(fclamp(f0 * 6 + 2000 * intens), t);
    flt.frequency.exponentialRampToValueAtTime(fclamp(900 + 2400 * intens), t + dur);
    var g = pluck(t, 0.5, dur, 0.003);
    flt.connect(g); g.connect(head);

    var a = osc('sawtooth', f0, t); a.detune.value = -7;
    var b = osc('square', f0, t); b.detune.value = 8;
    var bg = gainNode(0.4);
    a.connect(flt); b.connect(bg); bg.connect(flt);
    a.start(t); a.stop(t + dur + 0.02);
    b.start(t); b.stop(t + dur + 0.02);

    voice(head, [a, b]);
    setTimeout(function () { try { send.disconnect(); } catch (e) { } }, (dur + 0.4) * 1000);
  }

  /* detuned supersaw chord stab */
  function stab(t, chord, dur, nasty) {
    if (!budget(10)) return;
    var head = gainNode(0.3);
    head.connect(arpBus);
    var send = gainNode(0.22);
    head.connect(send); send.connect(fxDelay);

    var flt = lp(1000, 5.5);
    flt.frequency.setValueAtTime(fclamp(5200 + 3000 * intens), t);
    flt.frequency.exponentialRampToValueAtTime(fclamp(700), t + dur);
    var g = pluck(t, 0.55, dur, 0.004);
    flt.connect(g); g.connect(head);

    var srcs = [];
    var det = [-14, 0, 15];
    for (var i = 0; i < chord.length; i++) {
      var f0 = mtof(chord[i]);
      for (var k = 0; k < (nasty ? 3 : 2); k++) {
        var o = osc('sawtooth', f0, t);
        o.detune.value = det[k] * (nasty ? 1.6 : 1);
        o.connect(flt);
        o.start(t); o.stop(t + dur + 0.02);
        srcs.push(o);
      }
    }
    if (nasty) {
      // minor second clash against the root - boss dissonance
      var c = osc('sawtooth', mtof(chord[0] + 13), t);
      var cg = gainNode(0.4);
      c.connect(cg); cg.connect(flt);
      c.start(t); c.stop(t + dur + 0.02);
      srcs.push(c);
    }

    voice(head, srcs);
    setTimeout(function () { try { send.disconnect(); } catch (e) { } }, (dur + 0.5) * 1000);
  }

  function pad(t, chord, dur) {
    if (!budget(6)) return;
    var head = gainNode(0.22);
    head.connect(padBus);
    var flt = lp(700 + 900 * intens, 1.2);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    flt.connect(g); g.connect(head);
    var srcs = [];
    for (var i = 0; i < chord.length; i++) {
      var f0 = mtof(chord[i] - 12);
      var a = osc('sawtooth', f0, t); a.detune.value = -9;
      var b = osc('sawtooth', f0, t); b.detune.value = 11;
      a.connect(flt); b.connect(flt);
      a.start(t); a.stop(t + dur + 0.05);
      b.start(t); b.stop(t + dur + 0.05);
      srcs.push(a, b);
    }
    voice(head, srcs);
  }

  /* rising noise+saw sweep used as a phrase-end riser */
  function riser(t, dur) {
    if (!budget(4)) return;
    var head = gainNode(0.3);
    head.connect(musicFilter);
    var srcs = [];

    var f = bp(300, 1.5);
    f.frequency.setValueAtTime(fclamp(260), t);
    f.frequency.exponentialRampToValueAtTime(fclamp(9000), t + dur);
    var g = ctx.createGain();
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
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o.connect(of); of.connect(og); og.connect(head);
    o.start(t); o.stop(t + dur + 0.09);
    srcs.push(o);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     MUSIC - sequencer
     --------------------------------------------------------------- */

  function applyIntensity(t, immediate) {
    var tc = immediate ? 0.001 : 0.5;
    // master music tone opens up dramatically with intensity
    musicFilter.frequency.setTargetAtTime(fclamp(520 + 15000 * Math.pow(intens, 1.35)), t, tc);
    musicGain.gain.setTargetAtTime(0.5 + 0.24 * intens, t, tc);

    bassBus.gain.setTargetAtTime(0.32 + 0.24 * Math.min(1, intens * 2.2), t, tc);
    drumBus.gain.setTargetAtTime(0.55 + 0.35 * intens, t, tc);
    arpBus.gain.setTargetAtTime(clamp((intens - 0.38) / 0.35, 0, 1) * 0.34, t, tc);
    padBus.gain.setTargetAtTime(clamp(1 - intens * 1.5, 0, 1) * 0.3 + 0.05, t, tc);
    fxFeedback.gain.setTargetAtTime(0.26 + 0.16 * intens, t, tc);
  }

  function scheduleStep(step, t) {
    if (muted) return;

    var bar = Math.floor(step / BAR_STEPS) % BARS;
    var st = step % BAR_STEPS;
    var prog = PROG[bar];
    var chord = prog.ch;
    var I = intens;
    var boss = I >= 0.85;
    var lastBarOfPhrase = (bar === 3 || bar === 7);
    var fill = lastBarOfPhrase && st >= 12;

    /* ---------------- KICK ---------------- */
    if (st % 4 === 0) {
      kick(t, st === 0 ? 1.0 : 0.88);
    } else if (I > 0.5 && st === 10) {
      kick(t, 0.6);
    } else if (boss && (st === 7 || st === 14)) {
      kick(t, 0.55);
    }

    /* ---------------- SNARE ---------------- */
    if (st === 4 || st === 12) {
      snare(t, 0.75 + 0.2 * I, false);
    }
    if (boss && st === 14 && !fill) snare(t, 0.3, true);

    /* ---------------- FILL at phrase end ---------------- */
    if (fill && I > 0.3) {
      var sub = (st - 12);
      if (I > 0.7) {
        // 32nd snare roll
        snare(t, 0.4 + 0.14 * sub, true);
        snare(t + STEP * 0.5, 0.34 + 0.14 * sub, true);
      } else {
        tom(t, 190 - sub * 26, 0.55);
      }
    }

    /* ---------------- HATS ---------------- */
    if (I > 0.2) {
      var hatOn = (I > 0.46) ? true : (st % 2 === 0);
      if (hatOn) {
        var openHat = (st === 14 && I > 0.5 && !fill);
        hat(t, (0.24 + 0.16 * I) * HAT_ACC[st], openHat);
        if (boss && (st === 3 || st === 7 || st === 11)) {
          hat(t + STEP * 0.5, 0.14, false);   // 32nd flutter
        }
      }
    }

    /* ---------------- BASS ---------------- */
    var gate = BASS_GATE[st];
    if (I < 0.22 && (st % 2) !== 0) gate = 0;      // sparse at low intensity
    if (gate) {
      var oct = BASS_OCT[st];
      var acc = BASS_ACC[st];
      var noteLen = STEP * (boss ? 0.55 : 0.72);
      // walk down on the last two steps of a phrase-ending bar for movement
      var m = prog.root + oct;
      if (fill && st >= 14) m = prog.root + oct + (st === 14 ? 3 : 5);
      bass(t, m, noteLen, acc, boss);
    }

    /* ---------------- PAD (fills space when sparse) ---------------- */
    if (st === 0 && I < 0.62) {
      pad(t, chord, STEP * BAR_STEPS * 0.95);
    }

    /* ---------------- ARP ---------------- */
    if (I > 0.42) {
      var arpOn = (I > 0.62) ? true : (st % 2 === 0);
      if (arpOn) {
        var ex = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12];
        var idx = ARP_IDX[(st + bar * 3) % 16] % ex.length;
        var n = ex[idx] + (boss ? 12 : 0);
        arpNote(t, n, STEP * (boss ? 0.85 : 1.4));
      }
    }

    /* ---------------- CHORD STABS ---------------- */
    if (I > 0.6) {
      var stabHere = (st === 6 || st === 14) || (boss && st === 10);
      if (stabHere) {
        var voicing = [chord[0], chord[1], chord[2]];
        if (boss) voicing = [chord[0] - 12, chord[1], chord[2], chord[0] + 12];
        stab(t, voicing, boss ? 0.3 : 0.22, boss);
      }
    }

    /* ---------------- RISER into the loop / boss phrase ---------------- */
    if (I > 0.68 && bar === 7 && st === 8) {
      riser(t, SPB * 2);
    }

    // deterministic micro-variation so the loop doesn't feel photocopied
    if (I > 0.35 && st === 15 && drand() > 0.62) {
      snare(t + STEP * 0.5, 0.28, true);
    }
  }

  function scheduler() {
    if (!ready || !ctx) return;
    if (ctx.state !== 'running') { nextNoteTime = ctx.currentTime + 0.06; return; }

    var t = ctx.currentTime;

    // smooth the intensity toward its target (~25ms tick)
    var d = intensTarget - intens;
    var maxStep = 0.012;                        // ~2s for a full 0->1 sweep
    intens += clamp(d, -maxStep, maxStep);
    if (Math.abs(intensTarget - intens) < 0.001) intens = intensTarget;
    applyIntensity(t, false);

    /* --- backgrounded-tab guard ---------------------------------
       If setInterval was throttled, nextNoteTime can fall far behind
       currentTime.  Without this we'd blast a burst of notes scheduled
       in the past.  Skip forward a whole number of steps so the grid
       phase (and therefore the groove) is preserved.               */
    if (nextNoteTime < t - 0.05) {
      var behind = t - nextNoteTime;
      var skip = Math.ceil(behind / STEP);
      nextNoteTime += skip * STEP;
      stepCount += skip;
      if (nextNoteTime < t) nextNoteTime = t + 0.02;
    }

    var limit = t + SCHEDULE_AHEAD;
    var guard = 0;
    while (nextNoteTime < limit && guard++ < 48) {
      scheduleStep(stepCount % LOOP_STEPS, nextNoteTime);
      nextNoteTime += STEP;
      stepCount++;
    }
  }

  /* =================================================================
     CINEMATIC INTRO SFX
     Everything below routes into sfxGain and is scheduled against an
     absolute captured time.  Long-lived loops register themselves in
     cineLoops so stopCine() can tear the whole scene down at once.
     ================================================================= */

  var cineLoops = [];

  /* handle handed back when there is no context - same shape, all no-ops */
  function inertHandle() {
    return { set: function () { }, stop: function () { } };
  }

  function regLoop(h) { cineLoops.push(h); return h; }
  function unregLoop(h) { var i = cineLoops.indexOf(h); if (i >= 0) cineLoops.splice(i, 1); }

  function killNodes(nodes) {
    for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { } }
    nodes.length = 0;
  }

  function loopNoise(rate) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    return s;
  }

  /* Pin the param at its current automated value then ramp to silence.
     The setValueAtTime is what actually terminates a running
     setTargetAtTime - cancelScheduledValues alone would not. */
  function fadeOut(g, t, f) {
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
  function rumble(level) {
    if (!ready) return inertHandle();
    var t = now();

    var head = gainNode(0.0001);
    head.connect(sfxGain);

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
        if (stopped || !ready) return;
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

  /* ---------------------------------------------------------------
     2. warp() - warship dropping out of hyperspace, ~1.0s
     Intervals are tritones on purpose: nothing here should resolve.
     --------------------------------------------------------------- */
  function warp() {
    if (!ready || muted || !budget(6)) return;
    var t = now() + 0.002;
    var dur = 1.0;
    var arrive = t + 0.72;
    var head = gainNode(0.62);
    head.connect(sfxGain);
    var srcs = [];

    // --- screaming descent: detuned saw pair a tritone apart ---
    var flt = lp(6000, 5);
    flt.frequency.setValueAtTime(fclamp(7000), t);
    flt.frequency.exponentialRampToValueAtTime(fclamp(240), arrive);
    var dg = ctx.createGain();
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(0.42, t + 0.09);
    dg.gain.exponentialRampToValueAtTime(0.2, arrive);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    flt.connect(dg); dg.connect(head);

    var base = [4200, 4200 * 1.4142];
    for (var k = 0; k < 2; k++) {
      var o = osc('sawtooth', base[k], t);
      o.detune.value = k ? 21 : -17;
      o.frequency.setValueAtTime(fclamp(base[k]), t);
      o.frequency.exponentialRampToValueAtTime(fclamp(base[k] * 0.016), arrive);
      o.frequency.exponentialRampToValueAtTime(fclamp(base[k] * 0.009), t + dur);
      o.connect(flt);
      o.start(t); o.stop(t + dur + 0.03);
      srcs.push(o);
    }

    // --- reversed-sounding swell: gain rises the whole way in, then cuts ---
    var sb = bp(500, 1.1);
    sb.frequency.setValueAtTime(fclamp(420), t);
    sb.frequency.exponentialRampToValueAtTime(fclamp(4200), arrive);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.45, arrive);
    sg.gain.exponentialRampToValueAtTime(0.0001, arrive + 0.12);
    sb.connect(sg); sg.connect(head);
    var ss = noise(t, 0.9, 0.6); ss.connect(sb); srcs.push(ss);

    // --- arrival: sub thump ---
    var so = osc('sine', 88, arrive);
    so.frequency.setValueAtTime(fclamp(88), arrive);
    so.frequency.exponentialRampToValueAtTime(fclamp(29), arrive + 0.3);
    var sog = pluck(arrive, 0.9, 0.34, 0.005);
    so.connect(sog); sog.connect(head);
    so.start(arrive); so.stop(arrive + 0.38);
    srcs.push(so);

    // --- inharmonic metallic ring on top of the arrival ---
    var rf = bp(2600, 6);
    var rg = pluck(arrive, 0.22, 0.3, 0.002);
    rf.connect(rg); rg.connect(head);
    var ra = osc('square', 1880, arrive);
    var rb = osc('square', 1880 * 1.4142, arrive);
    ra.connect(rf); rb.connect(rf);
    ra.start(arrive); ra.stop(arrive + 0.34);
    rb.start(arrive); rb.stop(arrive + 0.34);
    srcs.push(ra, rb);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     3. plasma() - dense plasma beam, ~0.8s.  Loud by design.
     --------------------------------------------------------------- */
  function plasma() {
    if (!ready || muted || !budget(6)) return;
    var t = now() + 0.002;
    var dur = 0.8;
    var head = gainNode(0.78);
    head.connect(sfxGain);
    var srcs = [];

    // --- searing buzz: saw + square through a resonant bandpass sweep ---
    var f = bp(2400, 8);
    f.frequency.setValueAtTime(fclamp(2600), t);
    f.frequency.exponentialRampToValueAtTime(fclamp(620), t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(fclamp(180), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.72, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.44, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(head);

    var a = osc('sawtooth', 190, t); a.detune.value = -19;
    var b = osc('sawtooth', 190, t); b.detune.value = 23;
    var c = osc('square', 95, t);
    a.frequency.setValueAtTime(fclamp(190), t);
    a.frequency.exponentialRampToValueAtTime(fclamp(72), t + dur);
    b.frequency.setValueAtTime(fclamp(191), t);
    b.frequency.exponentialRampToValueAtTime(fclamp(71), t + dur);
    c.frequency.setValueAtTime(fclamp(95), t);
    c.frequency.exponentialRampToValueAtTime(fclamp(36), t + dur);
    var cgn = gainNode(0.5);
    a.connect(f); b.connect(f); c.connect(cgn); cgn.connect(f);
    a.start(t); a.stop(t + dur + 0.02);
    b.start(t); b.stop(t + dur + 0.02);
    c.start(t); c.stop(t + dur + 0.02);
    srcs.push(a, b, c);

    // --- sizzle ---
    var sh = hp(3200);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.55);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
    sh.connect(sg); sg.connect(head);
    var ss = noise(t, dur * 0.92, 1.5); ss.connect(sh); srcs.push(ss);

    // --- body-hitting sub ---
    var so = osc('sine', 130, t);
    so.frequency.exponentialRampToValueAtTime(fclamp(38), t + dur * 0.7);
    var sog = pluck(t, 0.85, dur * 0.8, 0.004);
    so.connect(sog); sog.connect(head);
    so.start(t); so.stop(t + dur);
    srcs.push(so);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     4. explode(size) - catastrophic destruction.  size ~1.0 .. 2.5
     --------------------------------------------------------------- */
  function explode(size) {
    if (!ready || muted || !budget(12)) return;
    size = clamp(size == null ? 1 : size, 0.6, 2.5);
    var t = now() + 0.002;
    var dur = 0.36 + 1.06 * size;                 // 1.4s @1, 3.0s @2.5
    var head = gainNode(clamp(0.55 + 0.28 * size, 0.5, 1.0));
    var pn = panner((Math.random() * 2 - 1) * 0.22);
    if (pn) { head.connect(pn); pn.connect(sfxGain); } else head.connect(sfxGain);
    var srcs = [];

    // --- blast body: noise through a lowpass that closes over time ---
    var bf = lp(3200, 1.4);
    bf.frequency.setValueAtTime(fclamp(3000 / Math.pow(size, 0.45)), t);
    bf.frequency.exponentialRampToValueAtTime(fclamp(300 / size), t + dur * 0.4);
    bf.frequency.exponentialRampToValueAtTime(fclamp(60), t + dur);
    var bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.24, t + dur * 0.3);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    bf.connect(bg); bg.connect(head);
    var bs = noise(t, dur + 0.02, 0.7 + Math.random() * 0.25);
    bs.connect(bf); srcs.push(bs);

    // --- sub drop 90 -> 28 Hz ---
    var subDur = 0.4 + 0.5 * size;
    var so = osc('sine', 90, t);
    so.frequency.setValueAtTime(fclamp(90), t);
    so.frequency.exponentialRampToValueAtTime(fclamp(28), t + subDur);
    var sog = pluck(t, clamp(0.6 + 0.3 * size, 0.5, 1.0), subDur * 1.15, 0.008);
    so.connect(sog); sog.connect(head);
    so.start(t); so.stop(t + subDur * 1.2 + 0.05);
    srcs.push(so);

    // --- debris: short randomised ticks scattered over the next ~0.8s ---
    var ticks = 6;
    for (var i = 0; i < ticks; i++) {
      var dt = t + 0.09 + Math.random() * 0.8;
      var td = 0.02 + Math.random() * 0.05;
      var th = hp(900 + Math.random() * 2200);
      var tg = pluck(dt, 0.1 + 0.14 * size * Math.random(), td, 0.001);
      th.connect(tg); tg.connect(head);
      var ts = noise(dt, td, 1.1 + Math.random() * 0.8);
      ts.connect(th); srcs.push(ts);
    }

    // --- long low tail ---
    var tf = lp(200, 0.8);
    tf.frequency.setValueAtTime(fclamp(240), t);
    tf.frequency.exponentialRampToValueAtTime(fclamp(70), t + dur);
    var tgn = ctx.createGain();
    tgn.gain.setValueAtTime(0.0001, t);
    tgn.gain.exponentialRampToValueAtTime(0.34 * size, t + 0.12);
    tgn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    tf.connect(tgn); tgn.connect(head);
    var tsrc = noise(t, dur + 0.02, 0.5); tsrc.connect(tf); srcs.push(tsrc);

    if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.6) * 1000);
    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     5. sirenLoop() -> { stop() }
     Red-alert klaxon.  The repetition is a triangle LFO wired straight
     into the oscillator frequency params, so it stays sample accurate
     and needs no JS timer.
     --------------------------------------------------------------- */
  function sirenLoop() {
    if (!ready) return inertHandle();
    var t = now();
    var CYCLE = 1.4;

    var head = gainNode(0.0001);
    head.connect(sfxGain);

    var f = bp(1100, 2.6);
    f.connect(head);

    // 590 +/- 170 => 420 .. 760 Hz
    var lfo = ctx.createOscillator();
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

  /* ---------------------------------------------------------------
     6. helmetOn() - oxygen mask sealing, ~1.2s
     --------------------------------------------------------------- */
  function helmetOn() {
    if (!ready || muted || !budget(5)) return;
    var t = now() + 0.002;
    var head = gainNode(0.6);
    head.connect(sfxGain);
    var srcs = [];

    // --- plastic latch: very short filtered noise transient ---
    var lf = bp(2800, 2.2);
    lf.frequency.setValueAtTime(fclamp(3400), t);
    lf.frequency.exponentialRampToValueAtTime(fclamp(1200), t + 0.03);
    var lg = pluck(t, 0.7, 0.035, 0.0008);
    lf.connect(lg); lg.connect(head);
    var ls = noise(t, 0.04, 1.4); ls.connect(lf); srcs.push(ls);

    // --- tight high click ---
    var co = osc('triangle', 5200, t);
    co.frequency.exponentialRampToValueAtTime(fclamp(2100), t + 0.014);
    var cg = pluck(t, 0.3, 0.022, 0.0006);
    co.connect(cg); cg.connect(head);
    co.start(t); co.stop(t + 0.04);
    srcs.push(co);

    // --- pressurised seal hiss: swells, then chokes off hard ---
    var hs = t + 0.055;
    var choke = t + 0.85;
    var hf = bp(1400, 1.0);
    hf.frequency.setValueAtTime(fclamp(900), hs);
    hf.frequency.exponentialRampToValueAtTime(fclamp(3000), choke - 0.1);
    hf.frequency.exponentialRampToValueAtTime(fclamp(1500), choke);
    var hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, hs);
    hg.gain.exponentialRampToValueAtTime(0.34, hs + 0.42);
    hg.gain.setValueAtTime(0.34, choke - 0.05);
    // abrupt, not a fade: the seal snaps shut
    hg.gain.linearRampToValueAtTime(0.0001, choke + 0.018);
    hf.connect(hg); hg.connect(head);
    var hn = noise(hs, choke - hs + 0.05, 1.1); hn.connect(hf); srcs.push(hn);

    // --- low thunk as it locks ---
    var to = osc('sine', 105, choke);
    to.frequency.setValueAtTime(fclamp(105), choke);
    to.frequency.exponentialRampToValueAtTime(fclamp(42), choke + 0.16);
    var tg = pluck(choke, 0.5, 0.24, 0.005);
    to.connect(tg); tg.connect(head);
    to.start(choke); to.stop(choke + 0.3);
    srcs.push(to);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     7. breath(cycles) - amplified in-mask breathing
     Close-mic'd: narrow bandpass + a lowpass lid keeps it from
     turning into wind.
     --------------------------------------------------------------- */
  function breath(cycles) {
    if (!ready || muted) return;
    var n = Math.round(clamp(cycles == null ? 2 : cycles, 1, 4));
    if (!budget(n * 2 + 2)) return;
    var t = now() + 0.002;
    var head = gainNode(0.5);
    var lid = lp(2600, 0.7);
    lid.connect(head);
    head.connect(sfxGain);
    var srcs = [];

    var IN = 0.75, OUT = 0.85, GAP = 0.1, PAUSE = 0.25;
    var per = IN + GAP + OUT + PAUSE;

    for (var i = 0; i < n; i++) {
      var c0 = t + i * per;

      // inhale: filter opens upward, effortful swell
      var inF = bp(320, 1.6);
      inF.frequency.setValueAtTime(fclamp(300), c0);
      inF.frequency.exponentialRampToValueAtTime(fclamp(1250), c0 + IN);
      var inG = ctx.createGain();
      inG.gain.setValueAtTime(0.0001, c0);
      inG.gain.exponentialRampToValueAtTime(0.34, c0 + IN * 0.72);
      inG.gain.exponentialRampToValueAtTime(0.0001, c0 + IN);
      inF.connect(inG); inG.connect(lid);
      var inS = noise(c0, IN + 0.02, 0.55); inS.connect(inF); srcs.push(inS);

      // exhale: lower, softer, filter closing
      var o0 = c0 + IN + GAP;
      var exF = bp(900, 1.3);
      exF.frequency.setValueAtTime(fclamp(880), o0);
      exF.frequency.exponentialRampToValueAtTime(fclamp(240), o0 + OUT);
      var exG = ctx.createGain();
      exG.gain.setValueAtTime(0.0001, o0);
      exG.gain.exponentialRampToValueAtTime(0.24, o0 + OUT * 0.28);
      exG.gain.exponentialRampToValueAtTime(0.0001, o0 + OUT);
      exF.connect(exG); exG.connect(lid);
      var exS = noise(o0, OUT + 0.02, 0.42); exS.connect(exF); srcs.push(exS);
    }

    voice(head, srcs);
    setTimeout(function () { try { lid.disconnect(); } catch (e) { } }, (n * per + 0.6) * 1000);
  }

  /* ---------------------------------------------------------------
     8. beep(pitch) - HUD blip, ~90ms.  Cheap: fired ~10x in a row.
     --------------------------------------------------------------- */
  function beep(pitch) {
    if (!ready || muted || !budget(3)) return;
    var p = (pitch == null || !isFinite(+pitch)) ? Math.random() : clamp(pitch, 0, 1);
    var t = now() + 0.002;
    var dur = 0.09;
    var f0 = 700 + 1500 * p;
    // low head gain so a 10-blip burst stacks without slamming the soft clipper
    var head = gainNode(0.24);
    head.connect(sfxGain);

    var flt = lp(fclamp(f0 * 4 + 1800), 1.1);
    var g = pluck(t, 0.5, dur, 0.0015);
    flt.connect(g); g.connect(head);

    var a = osc('square', f0, t);
    var b = osc('triangle', f0 * 2.002, t);
    var bg = gainNode(0.35);
    a.connect(flt); b.connect(bg); bg.connect(flt);
    a.start(t); a.stop(t + dur + 0.01);
    b.start(t); b.stop(t + dur + 0.01);

    voice(head, [a, b]);
  }

  /* ---------------------------------------------------------------
     9. riser(dur) - scene-transition tension riser landing on an
     impact at exactly t+dur.  (The music module has its own private
     riser() with a different signature; this is the cinematic one.)
     --------------------------------------------------------------- */
  function cineRiser(dur) {
    if (!ready || muted || !budget(6)) return;
    dur = clamp(dur == null ? 3 : dur, 0.4, 8);
    var t = now() + 0.002;
    var hit = t + dur;
    var head = gainNode(0.55);
    head.connect(sfxGain);
    var srcs = [];

    // --- noise through an exponentially rising bandpass ---
    var nf = bp(220, 2.6);
    nf.frequency.setValueAtTime(fclamp(200), t);
    nf.frequency.exponentialRampToValueAtTime(fclamp(9000), hit);
    var ngn = ctx.createGain();
    ngn.gain.setValueAtTime(0.0001, t);
    ngn.gain.exponentialRampToValueAtTime(0.5, hit - 0.02);
    ngn.gain.exponentialRampToValueAtTime(0.0001, hit + 0.05);
    nf.connect(ngn); ngn.connect(head);
    var ns = noise(t, dur + 0.08, 1.0); ns.connect(nf); srcs.push(ns);

    // --- saw rising two octaves ---
    var o = osc('sawtooth', 140, t);
    o.frequency.setValueAtTime(fclamp(140), t);
    o.frequency.exponentialRampToValueAtTime(fclamp(560), hit);
    var of = lp(600, 6);
    of.frequency.setValueAtTime(fclamp(500), t);
    of.frequency.exponentialRampToValueAtTime(fclamp(6500), hit);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.32, hit - 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, hit + 0.05);
    o.connect(of); of.connect(og); og.connect(head);
    o.start(t); o.stop(hit + 0.08);
    srcs.push(o);

    // --- the landing: sub drop ---
    var so = osc('sine', 120, hit);
    so.frequency.setValueAtTime(fclamp(120), hit);
    so.frequency.exponentialRampToValueAtTime(fclamp(32), hit + 0.4);
    var sg = pluck(hit, 0.95, 0.55, 0.005);
    so.connect(sg); sg.connect(head);
    so.start(hit); so.stop(hit + 0.62);
    srcs.push(so);

    // --- the landing: noise slam ---
    var hf = lp(4000, 1.2);
    hf.frequency.setValueAtTime(fclamp(4500), hit);
    hf.frequency.exponentialRampToValueAtTime(fclamp(150), hit + 0.45);
    var hg = pluck(hit, 0.7, 0.5, 0.002);
    hf.connect(hg); hg.connect(head);
    var hs = noise(hit, 0.52, 0.8); hs.connect(hf); srcs.push(hs);

    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     10. jetPass(pan) - doppler flyby, ~1.5s.  Travels -pan -> +pan.
     --------------------------------------------------------------- */
  function jetPass(pan) {
    if (!ready || muted || !budget(4)) return;
    var p = clamp(pan == null ? 1 : pan, -1, 1);
    var t = now() + 0.002;
    var dur = 1.5;
    var mid = t + dur * 0.45;
    var head = gainNode(0.7);
    var pn = panner(-p);
    if (pn) {
      try {
        pn.pan.setValueAtTime(clamp(-p, -1, 1), t);
        pn.pan.linearRampToValueAtTime(clamp(p, -1, 1), t + dur);
      } catch (e) { }
      head.connect(pn); pn.connect(sfxGain);
    } else head.connect(sfxGain);
    var srcs = [];

    // --- roar: bandpass rises on approach, falls on departure ---
    var f = bp(400, 1.5);
    f.frequency.setValueAtTime(fclamp(340), t);
    f.frequency.exponentialRampToValueAtTime(fclamp(2200), mid);
    f.frequency.exponentialRampToValueAtTime(fclamp(280), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75, mid);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(head);
    var ns = noise(t, dur + 0.02, 1.0); ns.connect(f); srcs.push(ns);

    // --- low rumble tail, peaks slightly after the pass ---
    var rf = lp(220, 1.0);
    rf.frequency.setValueAtTime(fclamp(320), t);
    rf.frequency.exponentialRampToValueAtTime(fclamp(90), t + dur + 0.5);
    var rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.45, mid + 0.12);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    rf.connect(rg); rg.connect(head);
    var rs = noise(t, dur + 0.52, 0.55); rs.connect(rf); srcs.push(rs);

    if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 1.1) * 1000);
    voice(head, srcs);
  }

  /* ---------------------------------------------------------------
     11. stopCine() - kill every cinematic loop.  Idempotent, and safe
     with nothing running.  Touches no bus gain.
     --------------------------------------------------------------- */
  function stopCine() {
    var list = cineLoops.slice(0);
    cineLoops.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i].stop(0.08); } catch (e) { }
    }
  }

  /* ---------------------------------------------------------------
     public control
     --------------------------------------------------------------- */
  function setIntensity(v) {
    v = clamp(v, 0, 1);
    intensTarget = v;               // applied smoothly inside the scheduler
  }

  function toggle() {
    muted = !muted;
    if (ready) {
      var t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0.0 : 0.92, t, 0.03);
    }
    return muted;
  }

  function suspend() {
    if (!ready) return;
    try { if (ctx.state === 'running') ctx.suspend(); } catch (e) { }
  }

  function resume() {
    if (!ready) return;
    try {
      if (ctx.state !== 'running') {
        var p = ctx.resume();
        if (p && p.then) p.then(function () { nextNoteTime = ctx.currentTime + 0.06; });
      }
    } catch (e) { }
  }

  return {
    init: init,
    setEngine: setEngine,
    laser: laser,
    missile: missile,
    boom: boom,
    thud: thud,
    pickup: pickup,
    alarm: alarm,
    siren: siren,
    setIntensity: setIntensity,
    toggle: toggle,
    suspend: suspend,
    resume: resume,

    /* cinematic intro suite */
    rumble: rumble,
    warp: warp,
    plasma: plasma,
    explode: explode,
    sirenLoop: sirenLoop,
    helmetOn: helmetOn,
    breath: breath,
    beep: beep,
    riser: cineRiser,
    jetPass: jetPass,
    stopCine: stopCine
  };
})();

/* `const` at script scope is not a property of the global object; mirror it so
   the module is reachable from any evaluation context (and from non-browser
   smoke tests) under the same single name. No side effects. */
try { if (typeof globalThis !== 'undefined' && !globalThis.AUDIO) globalThis.AUDIO = AUDIO; } catch (e) { }
