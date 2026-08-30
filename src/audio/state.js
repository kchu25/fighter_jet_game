/* ===== audio/state.js — every mutable binding the audio engine touches =====
   Same rationale as game/state.js: ES module `let`/`var` bindings are
   read-only views to importers, so every field every audio submodule needs
   to mutate is bundled into one exported object instead. */
export const A = {
  ctx: null, ready: false, muted: false, nyq: 20000,

  // busses (built by index.js's init())
  preComp: null, comp: null, master: null, musicGain: null, sfxGain: null, sfxShaper: null,
  musicFilter: null, drumBus: null, bassBus: null, arpBus: null, padBus: null, duckBus: null,
  fxDelay: null, fxFeedback: null, fxTone: null,

  // cached bitcrusher curve (lo-fi digital grit on boss-only layers)
  crushCurveCache: null,

  // engine (persistent voice)
  eng: null,

  // shared noise buffer
  noiseBuf: null,

  // voice accounting
  voices: 0, laserVoices: 0, boomVoices: 0, lastLaserT: -1, lastMineT: -1,

  // music scheduler
  timerId: null, nextNoteTime: 0, stepCount: 0,

  // intensity: raw target from the game, smoothed value used for musical decisions
  intensTarget: 0, intens: 0,

  // deterministic pseudo random for musical variation
  rngState: 22222,

  // registered long-lived cinematic loop handles (see cine-loops.js)
  cineLoops: [],

  // laser() alternates pan side per shot
  laserSide: 1
};

