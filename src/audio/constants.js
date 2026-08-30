/* ===== audio/constants.js — tempo, voice budgets, and the fixed musical data
   (chord progression + step-sequencer gate tables) that drive the scheduler.
   All pure/immutable — no shared mutable state lives here (see state.js). */

var MAX_VOICES = 72;
var MAX_LASER = 6;
var MAX_BOOM = 9;

var BPM = 146;
var SPB = 60 / BPM;          // seconds per beat
var STEP = SPB / 4;          // 16th note
var BAR_STEPS = 16;
var BARS = 8;
var LOOP_STEPS = BAR_STEPS * BARS;
var LOOKAHEAD_MS = 25;
var SCHEDULE_AHEAD = 0.14;

/* 8 bar progression in A minor.  root = bass midi, ch = add9 voicing
   (wider synth-stack chords than a plain triad - reads more "widescreen/sci-fi") */
var PROG = [
  { root: 45, ch: [57, 60, 64, 71] },  // Am9   (A C E B)
  { root: 45, ch: [57, 60, 64, 71] },  // Am9
  { root: 41, ch: [53, 57, 60, 67] },  // Fadd9 (F A C G)
  { root: 43, ch: [55, 59, 62, 69] },  // Gadd9 (G B D A)
  { root: 48, ch: [60, 64, 67, 74] },  // Cadd9 (C E G D)
  { root: 48, ch: [60, 64, 67, 74] },  // Cadd9
  { root: 41, ch: [53, 57, 60, 67] },  // Fadd9
  { root: 40, ch: [56, 59, 64, 66] }   // E(add9) major -> tension back to Am, F# colour tone
];

// 16th gate for the bassline + octave jumps
var BASS_GATE = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1];
var BASS_OCT = [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 12, 0, 12];
var BASS_ACC = [1, 0, .7, .8, .95, 0, .7, 0, 1, 0, .7, .8, .9, .7, 0, .65];

var ARP_IDX = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 5, 3, 4, 2];
var HAT_ACC = [1, .45, .7, .45, .9, .45, .7, .5, 1, .45, .7, .45, .9, .5, .75, .6];

