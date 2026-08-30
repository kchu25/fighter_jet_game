/* ===== audio/index.js — public AUDIO barrel =====
   init() builds the whole audio graph (busses, engine, sequencer) on first
   call from a user gesture; everything else is thin re-exports assembled
   into the same {init,setEngine,...} shape the rest of the game imports
   as `AUDIO`. */
import { A } from './state.js';
import { STEP, LOOKAHEAD_MS } from './constants.js';
import { gainNode, lp, now, makeSoftCurve } from './primitives.js';
import { buildEngine, setEngine } from './engine.js';
import { laser, missile, boom, thud, pickup, alarm, siren, sectorClear, strafe, mineArm, lance } from './sfx.js';
import { applyIntensity, scheduler, setIntensity } from './scheduler.js';
import { rumble, sirenLoop, stopCine } from './cine-loops.js';
import { warp, plasma, explode, helmetOn, breath, beep, cineRiser, jetPass } from './cine-oneshots.js';

export function init() {
  if (A.ready) { try { if (A.ctx.state === 'suspended') A.ctx.resume(); } catch (e) { } return; }
  if (typeof window === 'undefined') return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  try { A.ctx = new AC({ latencyHint: 'interactive' }); }
  catch (e) { try { A.ctx = new AC(); } catch (e2) { A.ctx = null; } }
  if (!A.ctx) return;

  A.nyq = Math.max(4000, A.ctx.sampleRate * 0.5 - 400);

  /* ---- shared noise buffer (2s white noise, reused by everything) ---- */
  var len = Math.floor(A.ctx.sampleRate * 2);
  A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  var d = A.noiseBuf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  /* ---- master chain ---- */
  A.master = gainNode(A.muted ? 0 : 0.92);
  A.master.connect(A.ctx.destination);

  A.comp = A.ctx.createDynamicsCompressor();
  A.comp.threshold.value = -14;
  A.comp.knee.value = 26;
  A.comp.ratio.value = 8;
  A.comp.attack.value = 0.004;
  A.comp.release.value = 0.22;
  A.comp.connect(A.master);

  A.preComp = gainNode(1);
  A.preComp.connect(A.comp);

  A.musicGain = gainNode(0.62);
  A.musicFilter = lp(1200, 0.9);
  A.musicFilter.connect(A.musicGain);
  A.musicGain.connect(A.preComp);

  A.sfxShaper = A.ctx.createWaveShaper();
  A.sfxShaper.curve = makeSoftCurve(1.55);
  A.sfxShaper.oversample = '2x';
  A.sfxShaper.connect(A.preComp);

  A.sfxGain = gainNode(0.85);
  A.sfxGain.connect(A.sfxShaper);

  /* ---- shared tempo-synced delay (used by arp / stabs / pickup) ---- */
  A.fxDelay = A.ctx.createDelay(1.5);
  A.fxDelay.delayTime.value = STEP * 3;           // dotted 8th
  A.fxFeedback = gainNode(0.34);
  A.fxTone = A.ctx.createBiquadFilter();
  A.fxTone.type = 'bandpass';
  A.fxTone.frequency.value = 1500;
  A.fxTone.Q.value = 0.55;
  A.fxDelay.connect(A.fxFeedback);
  A.fxFeedback.connect(A.fxDelay);
  A.fxDelay.connect(A.fxTone);
  A.fxTone.connect(A.preComp);

  /* ---- music sub-busses ----
     bass/arp/pad all pass through duckBus, which the kick drum pumps on
     every hit (classic sidechain duck) - drumBus bypasses it so the kick
     doesn't duck itself. Gives the mix that "modern digital" pump feel. */
  A.duckBus = gainNode(1); A.duckBus.connect(A.musicFilter);
  A.drumBus = gainNode(0.9); A.drumBus.connect(A.musicFilter);
  A.bassBus = gainNode(0.0); A.bassBus.connect(A.duckBus);
  A.arpBus = gainNode(0.0); A.arpBus.connect(A.duckBus);
  A.padBus = gainNode(0.0); A.padBus.connect(A.duckBus);

  buildEngine();

  A.ready = true;

  // prime the sequencer
  A.intens = A.intensTarget;
  applyIntensity(now(), true);
  A.nextNoteTime = now() + 0.09;
  A.stepCount = 0;
  if (A.timerId === null) A.timerId = setInterval(scheduler, LOOKAHEAD_MS);

  try { if (A.ctx.state === 'suspended') A.ctx.resume(); } catch (e) { }
}

export function toggle() {
  A.muted = !A.muted;
  if (A.ready) {
    var t = now();
    A.master.gain.cancelScheduledValues(t);
    A.master.gain.setTargetAtTime(A.muted ? 0.0 : 0.92, t, 0.03);
  }
  return A.muted;
}

export function suspend() {
  if (!A.ready) return;
  try { if (A.ctx.state === 'running') A.ctx.suspend(); } catch (e) { }
}

export function resume() {
  if (!A.ready) return;
  try {
    if (A.ctx.state !== 'running') {
      var p = A.ctx.resume();
      if (p && p.then) p.then(function () { A.nextNoteTime = A.ctx.currentTime + 0.06; });
    }
  } catch (e) { }
}

export const AUDIO = {
  init: init,
  setEngine: setEngine,
  laser: laser,
  missile: missile,
  boom: boom,
  thud: thud,
  pickup: pickup,
  alarm: alarm,
  siren: siren,
  sectorClear: sectorClear,
  strafe: strafe,
  mineArm: mineArm,
  lance: lance,
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

