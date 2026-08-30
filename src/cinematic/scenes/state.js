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
  shake: 0, flash: 0, flashCol: [255, 255, 255],
  rumbleH: null, sirenH: null
};

