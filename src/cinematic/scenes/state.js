/* ===== cinematic/scenes/state.js — shared cinematic playback state =====
   Every module in cinematic/scenes/ reads and writes this one bundle
   instead of its own module-local `let`s -- see game/state.js for why
   (an imported `let` binding is a read-only view in the importing
   module; a shared object's properties are freely mutable from anywhere). */
export const I = {
  cv: null, c: null, W: 0, H: 0, dpr: 1, sc: 1, ox: 0, oy: 0,
  raf: 0, t: 0, last: 0,
  phase: 'idle',              // idle | attract | play | out
  outT: 0, outMode: '',
  cbEnd: null, cbSkip: null, ended: false,
  done: false,                /* latched once EITHER terminal callback (cbEnd/cbSkip) has
                                 fired -- after that, no later skip/finish may fire the
                                 other one (a late skip after the HANDOFF must not slam
                                 the menu on top of the already-running game) */
  shake: 0, flash: 0, flashCol: [255, 255, 255],
  flashPrev: 0,               /* I.flash as of the end of the previous frame; the engine
                                 compares against it after scene dispatch to catch the
                                 rising edge of a new flash (scenes only ever Math.max
                                 into I.flash, so a jump above this is always a fresh
                                 detonation, never the tail of an old one decaying) */
  flashEcho: 0,               /* frames of chromatic-fringe ghost left to draw after a
                                 flash spike -- latched to 2 on the rising edge, counted
                                 down by the engine, purely presentational */
  rumbleH: null, sirenH: null
};

