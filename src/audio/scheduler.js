/* ===== audio/scheduler.js — the 16th-note step sequencer =====
   applyIntensity() ramps the mix toward the current intensity; scheduleStep()
   decides what plays on a given step; scheduler() is the setInterval tick
   that keeps a lookahead queue of scheduled steps topped up. setIntensity()
   is the public entry point the game calls every frame. */
import { A } from './state.js';
import { STEP, SPB, BAR_STEPS, BARS, LOOP_STEPS, SCHEDULE_AHEAD, PROG, BASS_GATE, BASS_OCT, BASS_ACC, ARP_IDX, HAT_ACC } from './constants.js';
import { clamp, fclamp, drand, now } from './primitives.js';
import { kick, snare, hat, tom, ride, bass, arpNote, lead, stab, pad, riser } from './instruments.js';

/* counter-line melody for the high-intensity lead layer: one list per bar
   of [step, midi, lengthInSteps], hand-voiced against PROG (chord tones
   plus the odd colour tone — the E-major bar climbs E→G#→B straight into
   the loop restart, which is what sells the "anthem" turn-around). Kept
   here rather than constants.js because it only exists for this scheduler
   and pairs with the lead() voice's phrasing assumptions (notes >= 2 steps). */
var LEAD_LINE = [
  [[0, 76, 3], [6, 79, 2], [8, 81, 6]],   // Am9:   E5 G5 -> A5 held
  [[0, 79, 3], [6, 76, 2], [8, 72, 6]],   // Am9:   G5 E5 -> C5 (relax)
  [[0, 72, 3], [6, 74, 2], [8, 76, 6]],   // Fadd9: C5 D5 -> E5 (maj7 colour)
  [[0, 74, 3], [6, 79, 2], [8, 83, 6]],   // Gadd9: D5 G5 -> B5 (climb)
  [[0, 79, 4], [8, 76, 6]],               // Cadd9: G5 held -> E5
  [[0, 74, 3], [6, 76, 2], [8, 79, 6]],   // Cadd9: D5 E5 -> G5
  [[0, 77, 4], [8, 81, 6]],               // Fadd9: F5 -> A5
  [[0, 76, 3], [6, 80, 2], [8, 83, 6]]    // E:     E5 G#5 -> B5 (tension in)
];

export function applyIntensity(t, immediate) {
  var tc = immediate ? 0.001 : 0.5;
  /* layer busses get a longer, bar-ish time constant (SPB*1.5 ≈ 0.6s, so
     ~95% settled in a bit over a bar at 146bpm) than the filter sweep:
     the sweep IS the drama and should chase intensity closely, but layers
     entering/leaving want to crossfade like a DJ riding faders, not step.
     Combined with the per-tick glide on A.intens itself, escalation reads
     as a swell and de-escalation as an exhale. */
  var tcb = immediate ? 0.001 : SPB * 1.5;
  // master music tone opens up dramatically with intensity - the rising
  // resonance on top of the sweep is what gives it that "trance filter
  // riser" sci-fi character rather than just sounding brighter
  A.musicFilter.frequency.setTargetAtTime(fclamp(520 + 15000 * Math.pow(A.intens, 1.35)), t, tc);
  A.musicFilter.Q.setTargetAtTime(0.8 + 3.4 * Math.pow(A.intens, 1.1), t, tc);
  // trimmed a hair from 0.24 to offset the added ride/lead layers so the
  // full-tilt master level (and comp drive) stays where it was before them
  A.musicGain.gain.setTargetAtTime(0.5 + 0.22 * A.intens, t, tc);

  // the cubic term only matters near the top: full-tilt bass gets ~1dB
  // extra into the tanh weight stage (see index.js) so it saturates harder
  A.bassBus.gain.setTargetAtTime(0.32 + 0.24 * Math.min(1, A.intens * 2.2) + 0.07 * Math.pow(A.intens, 3), t, tcb);
  A.drumBus.gain.setTargetAtTime(0.55 + 0.35 * A.intens, t, tcb);
  A.arpBus.gain.setTargetAtTime(clamp((A.intens - 0.38) / 0.35, 0, 1) * 0.34, t, tcb);
  A.padBus.gain.setTargetAtTime(clamp(1 - A.intens * 1.5, 0, 1) * 0.3 + 0.05, t, tcb);
  /* the high-intensity-only layers: ride fades in across 0.55→0.85, the
     counter-line lead across 0.7→0.95 — so the lead only fully arrives
     when a boss pins intensity to 1, and ordinary combat gets at most a
     hint of it. scheduleStep starts feeding both slightly below their
     fade windows so the crossfade always has material to fade in. */
  A.rideBus.gain.setTargetAtTime(clamp((A.intens - 0.55) / 0.3, 0, 1) * 0.5, t, tcb);
  A.leadBus.gain.setTargetAtTime(clamp((A.intens - 0.7) / 0.25, 0, 1) * 0.42, t, tcb);
  A.fxFeedback.gain.setTargetAtTime(0.26 + 0.16 * A.intens, t, tc);
}

export function scheduleStep(step, t) {
  if (A.muted) return;

  var bar = Math.floor(step / BAR_STEPS) % BARS;
  var st = step % BAR_STEPS;
  var prog = PROG[bar];
  var I = A.intens;
  /* boss mode is latched at each bar line instead of re-tested per step:
     the boss patterns (double-time bass, flutter hats, extra kicks) now
     flip on downbeats like a real arrangement change rather than mutating
     mid-bar as the smoothed intensity crawls across the threshold. The
     null check covers the first steps before init's reset has ever hit a
     bar boundary (and survives the backgrounded-tab step skip). */
  if (st === 0 || A.bossBar == null) A.bossBar = I >= 0.85;
  var boss = A.bossBar;
  var chord = prog.ch;
  /* darker mode at full tilt: on the A-minor bars the add9 colour tone (B)
     drops a semitone to Bb — a phrygian b9 snarl over the unchanged bass
     root that the arp and stabs pick up automatically. Built as a fresh
     array so PROG itself stays pristine; everything else (pads are gone by
     this intensity, lead avoids B on these bars) is unaffected. */
  if (boss && prog.root === 45) chord = [chord[0], chord[1], chord[2], chord[3] - 1];
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

  /* ---------------- RIDE (driving high-intensity percussion) --------
     accented pings on the offbeat 8ths give the top end that relentless
     forward drive; boss mode adds a quiet 16th-offbeat shimmer between
     them. Scheduled from just under rideBus's 0.55 fade-in point so the
     bar-ish crossfade in applyIntensity always has notes to reveal. */
  if (I > 0.5) {
    if (st % 4 === 2) ride(t, 0.42 + 0.18 * I, true);
    else if (boss && (st % 2) === 1) ride(t, 0.16, false);
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

  /* ---------------- COUNTER-LINE LEAD (the boss-fight anthem) -------
     slow hand-written melody over the progression, at most three notes a
     bar so it soars above the 16th-note churn instead of adding to it.
     Like the ride, scheduling starts a little below leadBus's 0.7 fade
     window so its entrance is a swell, not a switch. */
  if (I > 0.66) {
    var mel = LEAD_LINE[bar];
    for (var li = 0; li < mel.length; li++) {
      if (mel[li][0] === st) lead(t, mel[li][1], STEP * mel[li][2]);
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

