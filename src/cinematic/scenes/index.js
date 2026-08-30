/* ===== cinematic/scenes/index.js — public CINE barrel =====
   CINE — skippable cinematic intro sequence (2D vector, procedural).
   Scenes: 1 rocket launch + ambush, 2 the signal, 3 the pilot,
           4 catapult launch (first person), 5 mass launch,
           6 encounter -> hand-off to 3D gameplay. */
import { play, skip, stop } from './engine.js';

export const CINE = { play: play, skip: skip, stop: stop };

