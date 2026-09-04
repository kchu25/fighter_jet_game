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
/* One ring into the capped pool. Kept as a private helper so shock() can pay
   the 26-ring cap once per ring it actually spawns, echoes included. */
function ring(x,y,z,r0,r1,life,w,c,a){
  if(S.rings.length>26) S.rings.shift();
  S.rings.push({x,y,z,r:r0,r0,r1,w,c,a,life,max:life});
}
export function shock(x,y,z,r0,r1,life,w,c,a){
  ring(x,y,z,r0,r1,life,w,c,a);
  /* Big detonations get an occasional inner echo — a thinner, fainter ring
     trailing inside the main front, like the double crack of a real blast
     wave. Only for wide sweeps (span>380 filters out hull-hit ticks) and only
     sometimes, so nuke volleys don't silently double their ring budget. */
  if(r1-r0>380 && Math.random()<.55)
    ring(x,y,z, r0*.7, r0+(r1-r0)*.62, life*.82, w*.55, c, a*.4);
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
    const vx=(Math.cos(a)*r+dx*w)*v, vy=(Math.sin(a)*r+dy*w)*v, vz=(b+dz*w)*v;
    /* The back third of the batch are the "tail-end" sparks: they live longer
       and take a spawn-time downward kick. update.js applies no gravity to
       parts (only the dg drag), so the droop has to be baked into the launch
       velocity — drag then eats the outward speed first and leaves the sag,
       which reads as embers arcing down out of the flash. */
    const tail = i*3>=n*2;
    S.parts.push(mk(x,y,z, vx, tail?vy-rnd(30,110):vy, vz,
      i&1?c:COL.white, tail?rnd(.28,.5):rnd(.16,.42), rnd(9,20)*wid,
      rnd(.045,.075), tail?.07:.09));
    /* Every tinted spark gets a hot white head: same launch line, a hair
       faster and fatter but dead in a blink, so the streak flares white then
       cools through the tint as the longer-lived body outlives it. A single
       particle can't change colour mid-life (the renderer beams one fixed c),
       hence the paired spawn. */
    if(i&1) S.parts.push(mk(x,y,z, vx*1.05, vy*1.05, vz*1.05,
      COL.white, rnd(.07,.15), rnd(11,24)*wid, rnd(.05,.08), .09));
  }
}
/* A composed explosion rather than a bare spray: white core pop, the tinted
   shrapnel cloud, a couple of dim smoke puffs swelling out of it, and a few
   embers that outlive everything else. All counts ride n/pow so a small call
   stays a small crackle; the extras top out at ~10 parts over the base n. */
export function burst(x,y,z,c,n,pow){
  /* core flash: 1-2 stationary white blooms, gone in a tenth of a second but
     swelling as they die (gw) — the overexposed instant before the fireball */
  const cores = (pow>=1||n>=20)?2:1;
  for(let i=0;i<cores;i++)
    S.parts.push(mk(x,y,z, 0,0,0, COL.white, rnd(.09,.16),
      rnd(24,40)*(.7+pow*.6), 0, 0, rnd(1.4,1.8)));
  /* the original tinted spray, untouched — this is the body of the blast */
  for(let i=0;i<n;i++){
    const a=rnd(0,6.2832), b=rnd(-1,1), r=Math.sqrt(1-b*b), sp=rnd(70,520)*pow;
    S.parts.push(mk(x,y,z, Math.cos(a)*r*sp, Math.sin(a)*r*sp, b*sp,
      i%3===0?COL.white:c, rnd(.3,.85), rnd(4,13)*pow));
  }
  /* smoke: slow dim-grey puffs (additive sprites, so "dark" means barely-lit
     haze, same idiom as the update.js contrail smoke) that drift up, drag to
     a stop and grow — what hangs where the flash was */
  const puffs = 1+Math.min(4,(n/18)|0);
  for(let i=0;i<puffs;i++)
    S.parts.push(mk(x+rnd(-9,9),y+rnd(-6,8),z+rnd(-8,8),
      rnd(-70,70),rnd(-10,110),rnd(-60,60),
      COL.smoke, rnd(.45,.85), rnd(15,28)*(.6+pow*.45), 0, .3, rnd(1.2,1.8)));
  /* embers: 2-3 small hot flecks flung out then parked by hard drag, living
     past the whole fireball so the site keeps glinting after the boom */
  const emb = 2+(pow>1?1:0);
  for(let i=0;i<emb;i++)
    S.parts.push(mk(x,y,z,
      rnd(-260,260)*Math.min(pow,1.4), rnd(-160,60), rnd(-240,240)*Math.min(pow,1.4),
      i&1?COL.amber:c, rnd(.7,1.15), rnd(3.5,7), 0, .15));
  S.shake=Math.min(30, S.shake+8*pow);
  S.flash=Math.min(.5, S.flash+.20*pow); S.flashC=c;
}
/* Deliberately bare: hud-draw sizes pops purely from screen depth (2600/p.w)
   and fades on life/.85, so there is no consumed field through which a birth
   scale-pop could be expressed — any easing would need renderer changes. */
export function pop(x,y,z,txt,c){ S.pops.push({x,y,z,txt,c,life:.85}); }
