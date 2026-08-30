/* ===== game/state.js — shared mutable run-state (S) + world constants ===== */
import { rnd } from '../core/utils.js';

/* ------------------------------------------------------------------ world constants */
export const SPAWN_Z=3400, DESPAWN_Z=-460, FOG_NEAR=560, FOG_FAR=3300;
export const CAM_BACK=300, CAM_UP=34;
export const GROUND_Y=-270, CEIL_Y=340, GRID_STEP=250;
export const BX=238, BY=150;            // player flight envelope
export const FLOW=1150;                 // base world scroll speed
export const BOLT_TAIL=.034;            // seconds of travel drawn behind an enemy bolt
export const COL={
  cyan:[0.13,0.88,1.0], mag:[1.0,0.24,0.94], amber:[1.0,0.60,0.17],
  red:[1.0,0.17,0.30], green:[0.24,1.0,0.62], purple:[0.64,0.29,1.0], white:[1,1,1],
  smoke:[0.30,0.30,0.34]
};
export const FOVY = 62*Math.PI/180;

export const TIP_DEFAULT='WASD FLY  ·  CLICK GUNS  ·  SPACE MISSILE  ·  SHIFT BOOST  ·  AA/DD ROLL';

/* ---- first-run on-ramp ----------------------------------------------------
   A brand new pilot gets ~26s of runway: an opening stretch of empty sky to
   learn the stick on, then threats phasing back in. easeT is the seconds of
   ramp left; easeP (0..1) is how far through it we are.

   everDied / runNo live OUTSIDE reset(), which re-inits per-run state only.
   start() is reachable from the cinematic's onEnd and from the RE-LAUNCH
   button, and the only way to reach that button is to die — so gating the
   ramp on !everDied means a retry is always full difficulty, which is the
   whole point: someone who just died does not need to be taught to fly. */
export const EASE_LEN=26;      // seconds of ramp at a purely passive burn rate
export const EASE_CALM=.27;    // first 27% of the ramp is empty sky

/* ------------------------------------------------------------------ shared state bundle
   Every module that needs to read or mutate run-state does so through this one
   object (S.foo), because plain `let` bindings imported across ES modules are
   read-only views — a module other than the one that declared them cannot
   reassign them, only mutate their properties. Bundling into S sidesteps that. */
export const S = {
  P: null, stars: null, enemies: null, shots: null, foes: null, rockets: null,
  parts: null, crates: null, pops: null, boss: null, debris: null, rings: null, evq: null,
  dist: 0, ddist: 0, score: 0, kills: 0, combo: 1, comboT: 0, shake: 0, flash: 0,
  flashC: [1,1,1], speed: 1, flow: 0,
  gameOn: false, T: 0, spawnT: 0, waveN: 0, nextBoss: 0, alarmT: 0, tipT: 0, hitT: 0,
  bossWarn: 0, bossFx: 0, hintT: 0,
  bossN: 0,
  tipMsg: TIP_DEFAULT,
  easeT: 0, easeStage: 0, runNo: 0, everDied: false
};

/* bossN: how many bosses THIS run has actually defeated. Boss HP is keyed off
   this instead of waveN — waveN only counts trash-mob waves and never resets,
   so it had climbed to a large, run-length-dependent number by the time a
   player even saw their first boss, making that boss (and every boss after
   it) an unbeatable sponge. bossN starts every run at 0, so the first fight
   is always the same fair fight regardless of how long the ramp to it was. */
export function reset(){
  S.P={x:0,y:0,vx:0,vy:0,roll:0,pitch:0,yaw:0,hp:100,shield:70,boost:100,
     fireCd:0,misCd:0,weapon:'std',wepT:0,rollT:0,rollDir:1,inv:0,thr:.4,
     burn:0,burnX:0,burnY:0};
  S.stars=[]; for(let i=0;i<300;i++) S.stars.push({x:rnd(-3000,3000),y:rnd(-900,1500),z:rnd(200,SPAWN_Z+900)});
  S.enemies=[]; S.shots=[]; S.foes=[]; S.rockets=[]; S.parts=[]; S.crates=[]; S.pops=[]; S.boss=null;
  S.debris=[]; S.rings=[]; S.evq=[];
  S.dist=0; S.ddist=0; S.score=0; S.kills=0; S.combo=1; S.comboT=0; S.shake=0; S.flash=0; S.flashC=COL.white;
  S.speed=1; S.flow=FLOW; S.spawnT=.25; S.waveN=0; S.bossN=0; S.nextBoss=2800; S.alarmT=0; S.tipT=4.5; S.hitT=0;
  S.bossWarn=0; S.bossFx=0; S.easeStage=0; S.tipMsg=TIP_DEFAULT;
  /* S.easeT is deliberately NOT touched here — start() owns it, because whether
     this run gets the on-ramp depends on state that must survive reset(). */
}
