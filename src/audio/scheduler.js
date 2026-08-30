/* ===== audio/scheduler.js — the 16th-note step sequencer =====
   applyIntensity() ramps the mix toward the current intensity; scheduleStep()
   decides what plays on a given step; scheduler() is the setInterval tick
   that keeps a lookahead queue of scheduled steps topped up. setIntensity()
   is the public entry point the game calls every frame. */
import { A } from './state.js';
import { STEP, SPB, BAR_STEPS, BARS, LOOP_STEPS, SCHEDULE_AHEAD, PROG, BASS_GATE, BASS_OCT, BASS_ACC, ARP_IDX, HAT_ACC } from './constants.js';
import { clamp, fclamp, drand, now } from './primitives.js';
import { kick, snare, hat, tom, bass, arpNote, stab, pad, riser } from './instruments.js';

export function applyIntensity(t, immediate) {
  var tc = immediate ? 0.001 : 0.5;
  // master music tone opens up dramatically with intensity - the rising
  // resonance on top of the sweep is what gives it that "trance filter
  // riser" sci-fi character rather than just sounding brighter
  A.musicFilter.frequency.setTargetAtTime(fclamp(520 + 15000 * Math.pow(A.intens, 1.35)), t, tc);
  A.musicFilter.Q.setTargetAtTime(0.8 + 3.4 * Math.pow(A.intens, 1.1), t, tc);
  A.musicGain.gain.setTargetAtTime(0.5 + 0.24 * A.intens, t, tc);

  A.bassBus.gain.setTargetAtTime(0.32 + 0.24 * Math.min(1, A.intens * 2.2), t, tc);
  A.drumBus.gain.setTargetAtTime(0.55 + 0.35 * A.intens, t, tc);
  A.arpBus.gain.setTargetAtTime(clamp((A.intens - 0.38) / 0.35, 0, 1) * 0.34, t, tc);
  A.padBus.gain.setTargetAtTime(clamp(1 - A.intens * 1.5, 0, 1) * 0.3 + 0.05, t, tc);
  A.fxFeedback.gain.setTargetAtTime(0.26 + 0.16 * A.intens, t, tc);
}

export function scheduleStep(step, t) {
  if (A.muted) return;

  var bar = Math.floor(step / BAR_STEPS) % BARS;
  var st = step % BAR_STEPS;
  var prog = PROG[bar];
  var chord = prog.ch;
  var I = A.intens;
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
      // fold the add9 colour tone into the arp pool (in two registers)
      // instead of just doubling the triad an octave up
      var ex = [chord[0], chord[3] - 12, chord[1], chord[2], chord[3], chord[0] + 12];
      var idx = ARP_IDX[(st + bar * 3) % 16] % ex.length;
      var n = ex[idx] + (boss ? 12 : 0);
      arpNote(t, n, STEP * (boss ? 0.85 : 1.4));
    }
  }

  /* ---------------- CHORD STABS ---------------- */
  if (I > 0.6) {
    var stabHere = (st === 6 || st === 14) || (boss && st === 10);
    if (stabHere) {
      var voicing = chord.slice(0, 4);   // full add9 stack
      if (boss) voicing = [chord[0] - 12, chord[1], chord[2], chord[3], chord[0] + 12];
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

export function scheduler() {
  if (!A.ready || !A.ctx) return;
  if (A.ctx.state !== 'running') { A.nextNoteTime = A.ctx.currentTime + 0.06; return; }

  var t = A.ctx.currentTime;

  // smooth the intensity toward its target (~25ms tick)
  var d = A.intensTarget - A.intens;
  var maxStep = 0.012;                        // ~2s for a full 0->1 sweep
  A.intens += clamp(d, -maxStep, maxStep);
  if (Math.abs(A.intensTarget - A.intens) < 0.001) A.intens = A.intensTarget;
  applyIntensity(t, false);

  /* --- backgrounded-tab guard ---------------------------------
     If setInterval was throttled, A.nextNoteTime can fall far behind
     currentTime.  Without this we'd blast a burst of notes scheduled
     in the past.  Skip forward a whole number of steps so the grid
     phase (and therefore the groove) is preserved.               */
  if (A.nextNoteTime < t - 0.05) {
    var behind = t - A.nextNoteTime;
    var skip = Math.ceil(behind / STEP);
    A.nextNoteTime += skip * STEP;
    A.stepCount += skip;
    if (A.nextNoteTime < t) A.nextNoteTime = t + 0.02;
  }

  var limit = t + SCHEDULE_AHEAD;
  var guard = 0;
  while (A.nextNoteTime < limit && guard++ < 48) {
    scheduleStep(A.stepCount % LOOP_STEPS, A.nextNoteTime);
    A.nextNoteTime += STEP;
    A.stepCount++;
  }
}

export function setIntensity(v) {
  v = clamp(v, 0, 1);
  // a sudden escalation (e.g. boss engaged) gets a quick digital riser
  // stinger on top of the smooth filter sweep already in applyIntensity
  if (A.ready && !A.muted && v - A.intensTarget > 0.22) {
    try { riser(now() + 0.01, 0.4 + 0.5 * (v - A.intensTarget)); } catch (e) { }
  }
  A.intensTarget = v;               // applied smoothly inside the scheduler
}

