/* ===== game/fx.js — particle / debris / shockwave primitives =====
   Small stateless(ish) spawners shared by combat.js, game/update.js and
   main.js. Kept separate from render/scene-draw.js's buildFX(), which only
   *draws* what these push into S.parts/S.debris/S.rings — these two never
   need to see each other. */
import { AUDIO } from '../audio/index.js';
import { rnd } from '../core/utils.js';
import { S, COL } from './state.js';

/* ------------------------------------------------------------------ actions */
export function barrelRoll(dir){
  if(!S.gameOn || S.P.rollT>0) return;
  S.P.rollT=.55; S.P.rollDir=dir; S.P.inv=Math.max(S.P.inv,.6);
  AUDIO.thud();
  for(let i=0;i<22;i++)
    S.parts.push(mk(S.P.x,S.P.y,0, rnd(-190,190),rnd(-190,190),rnd(-420,140), COL.cyan, .45, 5));
}
/* st: streak factor (drawn as a beam trailing v*st). dg: drag base/sec.
   gw: grow factor, for fireball puffs that swell as they fade. */
export function mk(x,y,z,vx,vy,vz,c,life,size,st,dg,gw){
  return {x,y,z,vx,vy,vz,c,life,max:life,size,st:st||0,dg:dg||0,gw:gw||0};
}
export function shock(x,y,z,r0,r1,life,w,c,a){
  if(S.rings.length>26) S.rings.shift();
  S.rings.push({x,y,z,r:r0,r0,r1,w,c,a,life,max:life});
}
/* Torn fragments, deliberately kept sub-legible: small, fast-tumbling and gone
   in well under a second, so they read as grit thrown off the blast rather than
   as countable objects. MODELS.shard is already an irregular torn plate (half
   extents ~0.44 x 0.19 x 0.50), so the per-axis factors only jitter its
   proportions — the old heavy squash would flatten it back into a slab.
   SHARD_U converts that unit mesh to world units. */
export const SHARD_U = 26;
export function shard(x,y,z,vx,vy,vz,s,c,life){
  if(S.debris.length>44) S.debris.shift();
  const b = s*SHARD_U;
  S.debris.push({x,y,z,vx,vy,vz,c,life,max:life,s,
    rx:rnd(0,6.28),ry:rnd(0,6.28),rz:rnd(0,6.28),
    ax:rnd(-22,22),ay:rnd(-22,22),az:rnd(-22,22),
    sx:b*rnd(.7,1.25),sy:b*rnd(.6,1.5),sz:b*rnd(.75,1.5),tr:0});
}
/* staged explosions: the payload fires later but keeps drifting with the world */
export function later(t,x,y,z,f){ S.evq.push({t,x,y,z,f}); }
export function sparks(x,y,z,n,sp,wid,c,dx,dy,dz,bias){
  for(let i=0;i<n;i++){
    const a=rnd(0,6.2832), b=rnd(-1,1), r=Math.sqrt(1-b*b), v=sp*rnd(.4,1);
    const w=bias?rnd(.25,1):0;
    S.parts.push(mk(x,y,z, (Math.cos(a)*r+dx*w)*v, (Math.sin(a)*r+dy*w)*v, (b+dz*w)*v,
      i&3?COL.white:c, rnd(.16,.42), rnd(9,20)*wid, rnd(.045,.075), .09));
  }
}
export function burst(x,y,z,c,n,pow){
  for(let i=0;i<n;i++){
    const a=rnd(0,6.2832), b=rnd(-1,1), r=Math.sqrt(1-b*b), sp=rnd(70,520)*pow;
    S.parts.push(mk(x,y,z, Math.cos(a)*r*sp, Math.sin(a)*r*sp, b*sp,
      i%3===0?COL.white:c, rnd(.3,.85), rnd(4,13)*pow));
  }
  S.shake=Math.min(30, S.shake+8*pow);
  S.flash=Math.min(.5, S.flash+.20*pow); S.flashC=c;
}
export function pop(x,y,z,txt,c){ S.pops.push({x,y,z,txt,c,life:.85}); }
