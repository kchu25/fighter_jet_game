/* ===== render/scene-draw.js — 3D scene + additive sprite-batch renderer =====
   Owns the sprite/beam batch (camR/camU/camP included) rather than splitting
   it out into gl.js: every consumer of sprite()/beam() also needs the camera
   basis vectors they're built from, so keeping them together avoids a needless
   import cycle between the gl bootstrap and the render loop. */
import { M4, compose, _e } from '../core/mat4.js';
import { clamp, rnd } from '../core/utils.js';
import {
  S, COL, FOVY, FOG_NEAR, FOG_FAR, GROUND_Y, CEIL_Y, GRID_STEP, BOLT_TAIL,
  CAM_BACK, CAM_UP
} from '../game/state.js';
import { gl, glc, W, H, attribs, upload, Plit, Pspr, Psky, MESH, ATT, skyBuf, mesh } from './gl.js';
import { MODELS } from './models.js';
import { SCENERY } from '../world/scenery.js';
import { coreR, falloutR, coreFull } from '../game/nuke.js';

/* enemy kind → mesh. The three newer hulls are uploaded here (gl.js only
   carries the original set); MESH entries are reused for the rest. */
const KMESH = {
  drone:   MESH.drone,
  cruiser: MESH.cruiser,
  striker: mesh(MODELS.striker),
  mine:    mesh(MODELS.mine),
  lancer:  mesh(MODELS.lancer),
  wasp:    mesh(MODELS.wasp),
  ravager: mesh(MODELS.ravager)
};
const BOMBMESH = mesh(MODELS.bomb);
/* boss type → mesh (the full 13-slot rotation; spawnBoss owns the order) */
const BOSSMESH = {
  mothership:  MESH.mothership,
  carrier:     mesh(MODELS.carrier),
  dreadnought: mesh(MODELS.dreadnought),
  leviathan:   mesh(MODELS.leviathan),
  warden:      mesh(MODELS.warden),
  hunter:      mesh(MODELS.hunter),
  bat:         mesh(MODELS.bat),
  phantom:     mesh(MODELS.phantom),
  hivemother:  mesh(MODELS.hivemother),
  goliath:     mesh(MODELS.goliath),
  hedra:       mesh(MODELS.hedra),
  arbalest:    mesh(MODELS.arbalest),
  reaper:      mesh(MODELS.reaper)
};
/* the bat's wings and the mother's tentacle segments are their own hulls,
   composed per frame in the boss draw: the wings hinge (roll) at their
   shoulder origins, the tentacle segments chain top-to-tip down -y */
const BATWING = [mesh(MODELS.batWingL), mesh(MODELS.batWingR)];
const MTENT   = [mesh(MODELS.motherTentA), mesh(MODELS.motherTentB), mesh(MODELS.motherTentC)];
/* fixed hull-space points where the goliath's armor seams burn once it is
   badly hurt — decorative only, so cheaper as consts than as attach entries */
const GOLSEAMS = [[-215,26,-48],[-96,-30,58],[8,52,-14],[118,-42,44],[228,14,-58]];
/* per-type phase tints, same idiom as the old inline mothership pick */
const BOSSPH = {
  mothership:  [null, [.16,0,.16], [.45,0,0]],
  carrier:     [null, [0,.15,.07], [.35,.06,0]],
  dreadnought: [null, [.18,.02,0], [.50,0,0]],
  leviathan:   [null, [.10,.14,0], [.38,.16,0]],
  warden:      [null, [.22,.11,0], [.48,.14,0]],
  hunter:      [null, [.18,0,.16], [.44,0,.30]],
  bat:         [null, [.16,.04,.12], [.42,.04,0]],
  phantom:     [null, [.20,0,.22], [.46,0,.18]],
  /* phase 1 is not null on purpose: her hull mesh is dun chitin, and at hold
     range the fog eats it — a standing bio cast keeps her reading GREEN and
     ALIVE from the first frame, then the phases push it toward sick-bright */
  hivemother:  [[.05,.16,.05], [.16,.28,.06], [.40,.32,.08]],
  goliath:     [null, [.18,.10,0], [.46,.06,0]],
  /* the crystal is "lit from inside" — a standing cyan cast through every
     facet from phase 1, cooling harder in 2, then igniting red in the rage */
  hedra:       [[.05,.15,.19], [.08,.22,.26], [.36,.12,.16]],
  arbalest:    [null, [.10,.14,.24], [.42,.08,0]],
  reaper:      [null, [.20,.02,0], [.5,0,0]]
};

/* ------------------------------------------------------------------ additive batch */
export const SPR_MAX = 4200, FL = 10;
export const sprData = new Float32Array(SPR_MAX*6*FL);
export const sprBuf  = upload(sprData, gl.DYNAMIC_DRAW);
export let sprN = 0;
export let camR=[1,0,0], camU=[0,1,0], camP=[0,0,0];

export function sv(i, x,y,z, u,v, c, a, k){
  sprData[i]=x; sprData[i+1]=y; sprData[i+2]=z;
  sprData[i+3]=u; sprData[i+4]=v;
  sprData[i+5]=c[0]; sprData[i+6]=c[1]; sprData[i+7]=c[2]; sprData[i+8]=a;
  sprData[i+9]=k;
}
export function sprite(x,y,z, size, c, a){
  if(sprN>=SPR_MAX) return;
  const i = sprN*6*FL; sprN++;
  const rx=camR[0]*size, ry=camR[1]*size, rz=camR[2]*size;
  const ux=camU[0]*size, uy=camU[1]*size, uz=camU[2]*size;
  sv(i,        x-rx-ux, y-ry-uy, z-rz-uz, 0,0, c,a,0);
  sv(i+FL,     x+rx-ux, y+ry-uy, z+rz-uz, 1,0, c,a,0);
  sv(i+FL*2,   x+rx+ux, y+ry+uy, z+rz+uz, 1,1, c,a,0);
  sv(i+FL*3,   x-rx-ux, y-ry-uy, z-rz-uz, 0,0, c,a,0);
  sv(i+FL*4,   x+rx+ux, y+ry+uy, z+rz+uz, 1,1, c,a,0);
  sv(i+FL*5,   x-rx+ux, y-ry+uy, z-rz+uz, 0,1, c,a,0);
}
export function beam(x1,y1,z1, x2,y2,z2, w, c, a){
  if(sprN>=SPR_MAX) return;
  let dx=x2-x1, dy=y2-y1, dz=z2-z1;
  const mx=(x1+x2)*.5-camP[0], my=(y1+y2)*.5-camP[1], mz=(z1+z2)*.5-camP[2];
  let sx=dy*mz-dz*my, sy=dz*mx-dx*mz, sz=dx*my-dy*mx;
  let l=Math.hypot(sx,sy,sz);
  if(l<1e-5){ sx=camR[0]; sy=camR[1]; sz=camR[2]; l=1; }
  sx=sx/l*w; sy=sy/l*w; sz=sz/l*w;
  const i = sprN*6*FL; sprN++;
  sv(i,      x1-sx,y1-sy,z1-sz, 0,0, c,a,1);
  sv(i+FL,   x1+sx,y1+sy,z1+sz, 1,0, c,a,1);
  sv(i+FL*2, x2+sx,y2+sy,z2+sz, 1,1, c,a,1);
  sv(i+FL*3, x1-sx,y1-sy,z1-sz, 0,0, c,a,1);
  sv(i+FL*4, x2+sx,y2+sy,z2+sz, 1,1, c,a,1);
  sv(i+FL*5, x2-sx,y2-sy,z2-sz, 0,1, c,a,1);
}

/* ------------------------------------------------------------------ grid */
export const gridBuf = (function(){
  const v=[];
  const push=(x,y,z,c,a)=>v.push(x,y,z, .5,.5, c[0],c[1],c[2],a, 0);
  for(let z=-500; z<=4600; z+=GRID_STEP){
    push(-3200,GROUND_Y,z,COL.cyan,.55); push(3200,GROUND_Y,z,COL.cyan,.55);
  }
  for(let x=-3200; x<=3200; x+=GRID_STEP){
    push(x,GROUND_Y,-500,COL.cyan,.5); push(x,GROUND_Y,4600,COL.cyan,.5);
  }
  for(let z=-500; z<=4600; z+=GRID_STEP*2){
    push(-2600,CEIL_Y,z,COL.mag,.20); push(2600,CEIL_Y,z,COL.mag,.20);
  }
  for(let x=-2600; x<=2600; x+=GRID_STEP*2){
    push(x,CEIL_Y,-500,COL.mag,.18); push(x,CEIL_Y,4600,COL.mag,.18);
  }
  const arr=new Float32Array(v);
  return {buf:upload(arr), n:arr.length/FL};
})();

/* ------------------------------------------------------------------ render */
export const proj=M4.create(), view=M4.create(), vp=M4.create(), mv=M4.create(), model=M4.create();
export let horizonY=.5, sunX=.5;

export function setCamera(){
  const sh = S.shake;
  const jx = sh? rnd(-sh,sh)*.6:0, jy = sh? rnd(-sh,sh)*.6:0;
  const ex=S.P.x*.30+jx, ey=S.P.y*.30+CAM_UP+jy, ez=-CAM_BACK;
  const tx=S.P.x*.46, ty=S.P.y*.46+46, tz=900;
  const cr=S.P.roll*.16;
  M4.persp(proj,FOVY,W/H,12,7000);
  M4.lookAt(view, ex,ey,ez, tx,ty,tz, Math.sin(cr),Math.cos(cr),0);
  M4.mul(vp,proj,view);
  camP=[ex,ey,ez];
  camR=[view[0],view[4],view[8]];
  camU=[view[1],view[5],view[9]];
  const h=toScreen(tx, ty+(ty-ey)*40, tz+ (tz-ez)*40);
  horizonY = 1 - clamp(h.y/H,-.5,1.5);
  sunX = clamp(.31 - (S.P.x*.30)*0.00022, .08, .92);
}
export function toScreen(x,y,z){
  const w = vp[3]*x+vp[7]*y+vp[11]*z+vp[15];
  const cx0 = vp[0]*x+vp[4]*y+vp[8]*z+vp[12];
  const cy0 = vp[1]*x+vp[5]*y+vp[9]*z+vp[13];
  if(w<=0.0001) return {x:0,y:0,w:1,vis:false};
  return {x:(cx0/w*.5+.5)*W, y:(1-(cy0/w*.5+.5))*H, w, vis:true};
}

export function litBegin(){
  gl.useProgram(Plit.p); attribs(3);
  gl.uniform3f(Plit.u.uCam, camP[0],camP[1],camP[2]);
  /* A live fireball becomes the key light. There is no second light slot in
     the lit shader and adding one would touch every draw call, but the key is
     already a direction and a warm colour — so the detonation simply TAKES it,
     swinging the sun round to point out of ground zero and bleaching the fog
     it sits in. The result is the cue that actually sells yield: every tower
     and gantry in the corridor is suddenly rim-lit from one point on the
     horizon and standing black against a white haze. It outlives the lens wash
     by seconds (S.nukeLt has its own slow clock) which is the whole reason the
     wash was allowed to get short. */
  const nl = clamp(S.nukeLt,0,1);
  if(nl>.01){
    let dx = S.nukeLtX - S.P.x*.30, dz = S.nukeLtZ + CAM_BACK;
    const dl = Math.hypot(dx,dz)||1;
    gl.uniform3f(Plit.u.uLightDir,
      -0.35*(1-nl) + (dx/dl)*nl,
       0.72*(1-nl) + 0.30*nl,
      -0.60*(1-nl) + (dz/dl)*nl);
    /* The haze bleach gets nl CUBED, and that exponent is load-bearing. The
       desert floor is one enormous grazing-angle surface, so almost every
       pixel below the horizon is at full fog — bleaching the fog therefore
       raises the floor of half the frame and is the single most
       contrast-destructive thing available here. Measured at a linear ramp it
       cost 0.15 of frame standard deviation three seconds after the
       detonation, which is the same mistake as the whiteout wearing a
       different hat. Cubed, it is a hard punch on the deck for half a second
       and effectively gone by the time the column arrives, while the light
       DIRECTION above keeps swinging for seconds — direction adds contrast,
       ambient removes it, so they get different clocks. */
    const nf = nl*nl*nl;
    gl.uniform3f(Plit.u.uFogColor,
      0.13*(1+S.bossFx) + nf*0.46, 0.03 + nf*0.30, 0.20 + nf*0.14);
  } else {
    gl.uniform3f(Plit.u.uLightDir, -0.35, 0.72, -0.60);
    gl.uniform3f(Plit.u.uFogColor, 0.13*(1+S.bossFx), 0.03, 0.20);
  }
  gl.uniform1f(Plit.u.uFogNear, FOG_NEAR);
  gl.uniform1f(Plit.u.uFogFar, FOG_FAR);
}
export function litDraw(m, mat, tint, alpha){
  gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);
  gl.vertexAttribPointer(1,3,gl.FLOAT,false,36,12);
  gl.vertexAttribPointer(2,3,gl.FLOAT,false,36,24);
  M4.mul(mv, vp, mat);
  gl.uniformMatrix4fv(Plit.u.uMVP,false,mv);
  gl.uniformMatrix4fv(Plit.u.uModel,false,mat);
  gl.uniform3f(Plit.u.uTint, tint?tint[0]:0, tint?tint[1]:0, tint?tint[2]:0);
  gl.uniform1f(Plit.u.uAlpha, alpha===undefined?1:alpha);
  gl.drawArrays(gl.TRIANGLES,0,m.n);
}

export function xform(mat, p, out){
  out[0]=mat[0]*p[0]+mat[4]*p[1]+mat[8]*p[2]+mat[12];
  out[1]=mat[1]*p[0]+mat[5]*p[1]+mat[9]*p[2]+mat[13];
  out[2]=mat[2]*p[0]+mat[6]*p[1]+mat[10]*p[2]+mat[14];
  return out;
}
const _p3=[0,0,0], _tint=[0,0,0];
export function hitTint(e,li){
  if(e.hit>0){ const f=e.hit*2.6; _tint[0]=f; _tint[1]=f*.94; _tint[2]=f; return _tint; }
  /* badly hurt hulls flicker as their lighting fails */
  if(li>.34 && Math.floor(S.T*23+e.ph*9)%6===0){ _tint[0]=.55; _tint[1]=.10; _tint[2]=.02; return _tint; }
  return null;
}

export function render(){
  setCamera();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,glc.width,glc.height);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);

  /* sky */
  gl.useProgram(Psky.p); attribs(1);
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
  gl.uniform2f(Psky.u.uRes, glc.width, glc.height);
  gl.uniform1f(Psky.u.uHorizon, horizonY);
  gl.uniform1f(Psky.u.uSunX, sunX);
  gl.uniform1f(Psky.u.uTime, S.T);
  gl.uniform1f(Psky.u.uBoss, S.bossFx);
  gl.drawArrays(gl.TRIANGLES,0,3);

  /* meshes */
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
  litBegin();

  const flick = S.P.inv>0 && Math.floor(S.T*24)%2===0;
  if(!flick){
    let roll=S.P.roll;
    if(S.P.rollT>0) roll += S.P.rollDir*(1-S.P.rollT/.55)*Math.PI*2;
    compose(model, S.P.x,S.P.y,0, S.P.pitch, S.P.yaw, roll, 1);
    litDraw(MESH.jet, model, S.hitT>0?[S.hitT*1.6,0,0]:null, 1);
  }
  for(const e of S.enemies){
    /* the fly-swarm has no hull at all — it is drawn entirely as a sprite
       cloud in buildFX(); the KMESH fallback would wrongly hang a drone
       mesh at its centre, so it is skipped here explicitly */
    if(e.k==='swarm') continue;
    const li=e.list||0;
    compose(model, e.x,e.y,e.z, li*.42, e.yaw, e.roll+li*.8, 1);
    litDraw(KMESH[e.k]||MESH.drone, model, hitTint(e,li), 1);
  }
  /* friendly wingmen: same airframe and orientation conventions as the
     player jet (yaw base 0 — they fly with you, not at you) */
  for(const a of S.allies){
    compose(model, a.x,a.y,a.z, a.pitch, a.yaw, a.roll, 1);
    litDraw(MESH.jet, model, a.state==='dying'?[.55,.08,-.05]:null, 1);
  }
  if(S.boss){
    const b=S.boss, type=b.type||'mothership';
    const ph=(BOSSPH[type]||BOSSPH.mothership)[b.phase-1]||null;
    const bmesh=BOSSMESH[type]||MESH.mothership;
    const tint=hitTint(b,0)||ph;
    if(type==='phantom' && b.blink){
      /* the lit pass runs with blending off, so uAlpha cannot fade the hull —
         the teleport is sold with scale and tint instead: the ship crushes to
         a point while its colour is pulled down to black (collapse), and the
         same ramp runs backwards on arrival (reform) */
      const k0=clamp((b.bt||0)/(b.blink===1?.32:.28),0,1);
      const k=b.blink===1?k0:1-k0, d=.9*k;
      /* a near-full-size ghost hangs at the departure point the whole blink:
         a black afterimage with a magenta edge — the "it was HERE" marker the
         arrival nova is dodged against */
      compose(model, b.ox,b.oy,b.oz, b.list||0, b.yaw, b.roll, .97);
      litDraw(bmesh, model, [-.45,-.95,-.40], 1);
      compose(model, b.x,b.y,b.z, b.list||0, b.yaw, b.roll, 1-.95*k);
      litDraw(bmesh, model, [(tint?tint[0]:0)-d,(tint?tint[1]:0)-d,(tint?tint[2]:0)-d], 1);
    } else {
      compose(model, b.x,b.y,b.z, b.list||0, b.yaw, b.roll, 1);
      litDraw(bmesh, model, tint, 1);
      if(type==='bat'){
        /* the wings are separate meshes rooted at the shoulder, so rolling
           them IS the flap hinge; the dive beats much harder than the cruise */
        const flap=Math.sin(b.wingT||0)*(b.mode==='dive'?.95:.55);
        const L=ATT.batWingL, R=ATT.batWingR;
        compose(model, b.x+L[0],b.y+L[1],b.z+L[2], b.list||0, b.yaw, b.roll+flap, 1);
        litDraw(BATWING[0], model, tint, 1);
        compose(model, b.x+R[0],b.y+R[1],b.z+R[2], b.list||0, b.yaw, b.roll-flap, 1);
        litDraw(BATWING[1], model, tint, 1);
      } else if(type==='hivemother'){
        /* ten tentacle chains, three segments each, swaying analytically off
           b.pulse — the lag grows down the chain so it drags like kelp, with
           no physics state to tick or reset */
        const pu=b.pulse||0;
        for(let i=0;i<ATT.motherRoots.length;i++){
          const rt=ATT.motherRoots[i], sway=Math.sin(pu*1.3+i*1.7);
          for(let s=0;s<3;s++){
            compose(model,
              b.x+rt[0]+sway*(6+s*14),
              b.y+rt[1]-s*54,
              b.z+rt[2]+Math.cos(pu*1.1+i)*(4+s*10),
              0, b.yaw, sway*(.18+s*.14), 1);
            litDraw(MTENT[s], model, tint, 1);
          }
        }
      }
    }
  }
  for(const d of S.debris){
    const a=clamp(d.life/d.max,0,1);
    /* the lit pass has blending off, so alpha cannot fade these — shrink them
       away over the last third of life instead of letting them pop out */
    const k = a<.34 ? a/.34 : 1;
    compose(model, d.x,d.y,d.z, d.rx,d.ry,d.rz, 1);
    for(let i=0;i<3;i++){ model[i]*=d.sx*k; model[4+i]*=d.sy*k; model[8+i]*=d.sz*k; }
    /* fresh shards read as hot metal, cooling to dead grey as they fade;
       kept dim on purpose so they stay grit inside the fireball */
    const g=a*a;
    litDraw(MESH.shard, model, [.05+g*.40, g*.10-.22, -.30], 1);
  }
  for(const k of S.crates){
    compose(model, k.x,k.y,k.z, k.spin*.7, k.spin, 0, 1);
    const c = k.kind==='shield'?COL.green : k.kind==='rapid'?COL.cyan : COL.mag;
    litDraw(MESH.crate, model, [c[0]*.55,c[1]*.55,c[2]*.55], 1);
  }
  /* falling warheads. The mesh is built nose-+Z like every other hull, so a
     +90° pitch stands it on end; the wobble is the casing coning as it falls. */
  for(const k of S.nukes||[]){
    if(k.state!=='fall') continue;
    /* the hydrogen casing is simply a bigger object in the sky, which is the
       only tell you get before it lands and the only one you need */
    compose(model, k.x,k.y,k.z,
      Math.PI/2 + Math.sin(k.spin*.7)*.13, Math.sin(k.spin*.5)*.13, k.spin,
      k.hyd?2.1:1);
    litDraw(BOMBMESH, model, k.hyd?[.44,.06,.02]:[.30,.05,.02], 1);
  }

  SCENERY.draw();

  /* additive */
  sprN=0;
  buildFX();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  gl.useProgram(Pspr.p); attribs(4);
  gl.uniform1f(Pspr.u.uFogNear, FOG_NEAR);
  gl.uniform1f(Pspr.u.uFogFar, FOG_FAR);

  // grid (scrolling, drawn as lines)
  M4.ident(_e); _e[14] = -(S.dist % GRID_STEP);
  M4.mul(mv, vp, _e);
  gl.uniformMatrix4fv(Pspr.u.uVP,false,mv);
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf.buf);
  sprPointers();
  gl.drawArrays(gl.LINES,0,gridBuf.n);

  // sprite batch
  gl.uniformMatrix4fv(Pspr.u.uVP,false,vp);
  if(sprN){
    gl.bindBuffer(gl.ARRAY_BUFFER, sprBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,sprData.subarray(0,sprN*6*FL));
    sprPointers();
    gl.drawArrays(gl.TRIANGLES,0,sprN*6);
  }
  gl.disable(gl.BLEND);
}
export function sprPointers(){
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,40,0);
  gl.vertexAttribPointer(1,2,gl.FLOAT,false,40,12);
  gl.vertexAttribPointer(2,4,gl.FLOAT,false,40,20);
  gl.vertexAttribPointer(3,1,gl.FLOAT,false,40,36);
}

export function buildFX(){
  for(const s of S.stars){
    if(S.speed>1.4) beam(s.x,s.y,s.z, s.x,s.y,s.z+520, 2.6, COL.white, .55);
    else sprite(s.x,s.y,s.z, 4.5, COL.white, .7);
  }
  // engine flames
  let roll=S.P.roll; if(S.P.rollT>0) roll += S.P.rollDir*(1-S.P.rollT/.55)*Math.PI*2;
  compose(model, S.P.x,S.P.y,0, S.P.pitch, S.P.yaw, roll, 1);
  const th=.55+S.P.thr*.85;
  for(const nz of ATT.jetNozzles){
    xform(model,nz,_p3);
    const bx=_p3[0],by=_p3[1],bz=_p3[2];
    xform(model,[nz[0],nz[1],nz[2]-72*th],_p3);
    beam(bx,by,bz,_p3[0],_p3[1],_p3[2], 4.5+2*th, COL.cyan, .55+th*.3);
    sprite(bx,by,bz, 7+3.5*th, COL.white, .5);
  }
  if(S.P.muzzle>0) for(const mz of ATT.jetMuzzles){
    xform(model,mz,_p3);
    sprite(_p3[0],_p3[1],_p3[2], 9, COL.cyan, 1.0);
  }
  /* ally engine glow — same nozzle pattern as the player's, cyan and
     thr-scaled; a dying ship adds flame sprites riding the hull. This loop
     re-composes `model`, so it must come after everything reading the
     player's transform above. */
  for(const a of S.allies){
    compose(model, a.x,a.y,a.z, a.pitch, a.yaw, a.roll, 1);
    const ath=.55+a.thr*.85;
    for(const nz of ATT.jetNozzles){
      xform(model,nz,_p3);
      const bx=_p3[0],by=_p3[1],bz=_p3[2];
      xform(model,[nz[0],nz[1],nz[2]-72*ath],_p3);
      beam(bx,by,bz,_p3[0],_p3[1],_p3[2], 4.5+2*ath, COL.cyan, .55+ath*.3);
      sprite(bx,by,bz, 7+3.5*ath, COL.white, .5);
    }
    if(a.state==='dying'){
      sprite(a.x, a.y+2, a.z-8, 26+10*Math.sin(S.T*21), COL.amber, .8);
      sprite(a.x, a.y+4, a.z-4, 15, COL.red, .7);
    }
  }
  for(const s of S.shots){
    beam(s.x,s.y,s.z, s.x-s.vx*.028, s.y-s.vy*.028, s.z-s.vz*.028, 4.5, COL.cyan, 1.35);
    sprite(s.x,s.y,s.z, 12, COL.white, .95);
  }
  for(const m of S.rockets){
    beam(m.x,m.y,m.z, m.x,m.y,m.z-90, 6, COL.amber, 1.2);
    sprite(m.x,m.y,m.z, 15, COL.white, 1);
  }
  /* Incoming fire reads as a tracer round, not a lamp: a short streak laid
     along its own velocity carries the "fast ordnance" cue, and the head is
     kept small and just under the additive clip point so it stops blooming
     into a soft ball — which matters most in a 15-bolt S.boss volley, where the
     old fat halos merged into one wall of white.
     The streak foreshortens to nothing on a bolt coming straight down the z
     axis at you, i.e. exactly the one you must dodge, so the round head is
     what keeps those legible and is deliberately not shrunk any further. */
  for(const s of S.foes){
    const r=s.r, tx=s.x-s.vx*BOLT_TAIL, ty=s.y-s.vy*BOLT_TAIL, tz=s.z-s.vz*BOLT_TAIL;
    beam(s.x,s.y,s.z, tx,ty,tz, r*.52, s.c,      .40);
    beam(s.x,s.y,s.z, tx,ty,tz, r*.19, COL.white, .85);
    sprite(s.x,s.y,s.z, r*.56, s.c,      .85);
    sprite(s.x,s.y,s.z, r*.20, COL.white, .85);
  }
  for(const p of S.parts){
    const a=clamp(p.life/p.max,0,1);
    if(p.st) beam(p.x,p.y,p.z, p.x-p.vx*p.st,p.y-p.vy*p.st,p.z-p.vz*p.st, p.size*.42, p.c, a*a*2.0);
    else if(p.gw) sprite(p.x,p.y,p.z, p.size*(1+(1-a)*p.gw), p.c, a*a*1.15);
    else sprite(p.x,p.y,p.z, p.size*(.5+a), p.c, a*1.3);
  }
  for(const g of S.rings){
    const a=clamp(g.life/g.max,0,1), al=g.a*a*a, n=18;
    let px=g.x+camR[0]*g.r, py=g.y+camR[1]*g.r, pz=g.z+camR[2]*g.r;
    for(let i=1;i<=n;i++){
      const th=i/n*6.2832, cs=Math.cos(th)*g.r, sn=Math.sin(th)*g.r;
      const nx=g.x+camR[0]*cs+camU[0]*sn, ny=g.y+camR[1]*cs+camU[1]*sn, nz=g.z+camR[2]*cs+camU[2]*sn;
      beam(px,py,pz, nx,ny,nz, g.w*(.3+a*.7), g.c, al);
      px=nx; py=ny; pz=nz;
    }
  }
  for(const d of S.debris){
    const a=clamp(d.life/d.max,0,1);
    sprite(d.x,d.y,d.z, (4+9*d.s)*(.35+a*.65), COL.amber, a*a*.8);
  }
  for(const e of S.enemies){
    if(e.k==='drone'){ const c=ATT.droneCore;
      sprite(e.x+c[0],e.y+c[1],e.z+c[2], 12+Math.sin(S.T*9+e.ph)*3, COL.red, 1.1);
    } else if(e.k==='striker'){
      for(const g of ATT.strikerEngines)
        sprite(e.x+g[0],e.y+g[1],e.z+g[2], 9, COL.green, .95);
    } else if(e.k==='mine'){
      /* blink rate tracks proximity, same thresholds as the arming beep */
      const rate = e.z<450?9 : e.z<900?4 : 1.6;
      if(Math.floor(S.T*rate+e.ph)%2===0)
        sprite(e.x,e.y,e.z, 17, COL.red, 1.15);
      sprite(e.x,e.y,e.z, 7, COL.red, .55);
    } else if(e.k==='lancer'){
      if(e.chg>0){ const n=ATT.lancerNose;
        sprite(e.x+n[0],e.y+n[1],e.z+n[2], 10+52*e.chg, COL.purple, .45+.8*e.chg);
        sprite(e.x+n[0],e.y+n[1],e.z+n[2], 4+20*e.chg, COL.white, .5+.6*e.chg);
      }
      for(const g of ATT.lancerEngines)
        sprite(e.x+g[0],e.y+g[1],e.z+g[2], 10, COL.purple, .9);
    } else if(e.k==='swarm'){
      /* the whole enemy: ~24 dark flies seething around a drifting centre,
         each on its own pseudo-random lissajous of S.T (seeded per fly, so
         the paths are stable frame-to-frame). Hits thin the cloud — sprite
         count scales with the hp fraction — and a couple of brighter green
         glints sell the wet-carapace shimmer. */
      const frac=clamp(e.hp/(e.hp0||10),0,1);
      const n=Math.max(5,(24*frac)|0);
      for(let i=0;i<n;i++){
        const s1=Math.sin(i*12.9898+e.seed)*43758.5453, r1=s1-Math.floor(s1);
        const s2=Math.sin(i*78.233 +e.seed)*24634.6345, r2=s2-Math.floor(s2);
        const s3=Math.sin(i*39.425 +e.seed)*15731.7431, r3=s3-Math.floor(s3);
        const fx=e.x+Math.sin(S.T*(1.7+r1*2.8)+r2*6.28)*e.r*(.3+r3*.75);
        const fy=e.y+Math.sin(S.T*(2.2+r2*2.3)+r1*6.28)*e.r*.8*(.3+r1*.7);
        const fz=e.z+Math.cos(S.T*(1.4+r3*2.5)+r2*6.28)*e.r*.7;
        sprite(fx,fy,fz, 3.5+r2*3, [0.25,0.30,0.12], .95);
        if(i%5===0) sprite(fx,fy,fz, 2.2, [0.42,0.90,0.30], .9);
      }
      /* faint sickly haze so the cloud reads as one mass, not confetti */
      sprite(e.x,e.y,e.z, e.r*1.4, [0.10,0.14,0.05], .35);
    } else if(e.k==='wasp'){
      /* single small bio dot pulsing fast */
      sprite(e.x,e.y,e.z, 8+Math.sin(S.T*9+e.ph)*3, COL.bio, 1.0);
    } else if(e.k==='ravager'){
      /* abdomen glow: slow pulse, swelling right before it spits */
      const bl=ATT.ravagerBelly, sw = e.cd<.4 ? Math.min(1,1-e.cd/.4) : 0;
      sprite(e.x+bl[0],e.y+bl[1],e.z+bl[2],
        (16+5*Math.sin(S.T*2.2+e.ph))*(1+sw*.9), COL.bio, .8+sw*.6);
    } else for(const g of ATT.cruiserEngines)
      sprite(e.x+g[0],e.y+g[1],e.z+g[2], 11, COL.red, .95);
  }
  if(S.boss){
    const b=S.boss, pl=.75+.25*Math.sin(b.t*5), type=b.type||'mothership';
    if(type==='carrier'){
      /* bay glows swell hard on a launch beat (b.flash set by carrierLaunch) */
      const fl=Math.max(0,b.flash||0);
      for(const g of ATT.carrierBays){
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], (34+18*Math.sin(b.t*4+g[0]))*(1+fl*3), COL.green, .8+fl*1.4);
        if(fl>0) sprite(b.x+g[0],b.y+g[1],b.z+g[2], 20+70*fl, COL.white, fl*1.2);
      }
      const c=ATT.carrierCore;
      sprite(b.x+c[0],b.y+c[1],b.z+c[2], 70*pl, b.phase===3?COL.amber:COL.green, 1.0);
      sprite(b.x+c[0],b.y+c[1],b.z+c[2], 26*pl, COL.white, 1.1);
    } else if(type==='dreadnought'){
      /* spine glow grows with the lance charge — the whole telegraph */
      const sp=ATT.dreadSpine, ch=b.chg||0;
      sprite(b.x+sp[0],b.y+sp[1],b.z+sp[2], 26+220*ch, COL.red, .5+1.1*ch);
      sprite(b.x+sp[0],b.y+sp[1],b.z+sp[2], 10+80*ch, COL.white, .5+.9*ch);
      for(const g of ATT.dreadGuns)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 14, COL.red, .85);
    } else if(type==='leviathan'){
      /* maw glow grows with the lance charge and flares on a birth (b.flash);
         vent glows pulse out of phase with each other */
      const mw=ATT.levMaw, ch=b.chg||0, fl=Math.max(0,b.flash||0);
      sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], (40+16*Math.sin(b.t*2.6))*(1+fl*2)+240*ch, COL.bio, .6+1.1*ch+fl);
      sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], 14+90*ch, COL.white, .4+.9*ch);
      for(const g of ATT.levVents)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 18+8*Math.sin(b.t*3+g[0]*.07+g[2]*.05), COL.bio, .8);
    } else if(type==='warden'){
      /* arm muzzles swept round b.spin, which is also the hull's roll, so the
         glows stay welded to the arms they belong to. The x term is negated
         because the platform flies yaw≈PI (mesh +x is world -x) — the same
         mirror wardenPinwheel() applies to the bolts it emits. */
      const sp=b.spin||0, fl=Math.max(0,b.flash||0), A=ATT.wardenArm, ir=ATT.wardenIris;
      for(let i=0;i<6;i++){
        const a=sp+i*Math.PI/3;
        sprite(b.x-Math.cos(a)*A[0], b.y+Math.sin(a)*A[0], b.z+A[2],
          15+9*fl, COL.amber, .85+fl);
      }
      /* the iris carries the tell for both patterns: a short hot pulse on
         every pinwheel tick, a much bigger one when the ring opens */
      sprite(b.x+ir[0],b.y+ir[1],b.z+ir[2], (54+10*Math.sin(b.t*3))*(1+fl*2.2), COL.amber, .7+fl*1.3);
      sprite(b.x+ir[0],b.y+ir[1],b.z+ir[2], 20+90*fl, COL.white, .5+fl);
    } else if(type==='hunter'){
      /* the pounce charge is the whole telegraph — the nose swells for a full
         second before it commits, and stays lit through the dive */
      const ch=b.chg||0, fl=Math.max(0,b.flash||0), n=ATT.hunterNose;
      /* kept deliberately small for a charge glow: the hull is barely 300
         across and the dreadnought-scale flare swallowed it whole, which cost
         the pounce its other tell — seeing which way the nose is pointed */
      sprite(b.x+n[0],b.y+n[1],b.z+n[2], 14+86*ch, COL.mag, .45+1.1*ch);
      sprite(b.x+n[0],b.y+n[1],b.z+n[2], 6+30*ch, COL.white, .4+.8*ch);
      /* wing pods, the only lights on the far-facing side of the hull that
         are not occluded by it — they carry the rake's muzzle flash */
      for(const g of ATT.hunterGuns)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 11+34*fl, COL.mag, .55+fl*3);
    } else if(type==='bat'){
      /* the eyes are its only lights — it is an animal, not a machine — and
         the uneven pulse keeps them alive-looking rather than lamp-like */
      for(const g of [ATT.batEyeL,ATT.batEyeR])
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 7+2.5*Math.sin(b.t*7+g[0]), COL.red, .95);
      if(b.mode==='windup'){
        /* the maw lights while it rears back and two screech rings roll out of
           it — the full second of tell the committed dive is dodged on */
        const ch=b.chg||0, mw=ATT.batMaw;
        sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], 12+70*ch, COL.red, .5+.9*ch);
        sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], 5+26*ch, COL.white, .4+.7*ch);
        ring(b.x+mw[0],b.y+mw[1],b.z+mw[2], 30+230*ch, 5, COL.red, .7*(1-ch*.55), 14);
        ring(b.x+mw[0],b.y+mw[1],b.z+mw[2], 10+140*ch, 3.5, COL.purple, .55*(1-ch*.4), 12);
      }
      if(b.mode==='dive')
        /* speed streaks off the wing roots — it is ordnance now, not a flier */
        for(const g of [ATT.batWingL,ATT.batWingR])
          beam(b.x+g[0],b.y+g[1],b.z+g[2], b.x+g[0],b.y+g[1]+14,b.z+g[2]+170, 7, COL.purple, .4);
    } else if(type==='phantom'){
      const bl=b.blink||0, c=ATT.phanCore;
      if(bl===0){
        /* core + gun-tip swell (the ravager idiom) only while the hull is
           actually here to carry them */
        sprite(b.x+c[0],b.y+c[1],b.z+c[2], 30+8*Math.sin(b.t*4), COL.mag, .85);
        sprite(b.x+c[0],b.y+c[1],b.z+c[2], 12, COL.white, .7);
        const sw=b.cd<.5?1-b.cd/.5:0;
        for(const g of ATT.phanGuns)
          sprite(b.x+g[0],b.y+g[1],b.z+g[2], (9+4*Math.sin(b.t*6+g[0]))*(1+sw*1.2), COL.mag, .5+sw*.8);
      } else if(bl===1){
        /* implosion: a ring crushing onto the departure point plus sparks
           spiralling in — covers the mesh crush and marks where it WAS */
        const k=clamp((b.bt||0)/.32,0,1), rr=130-110*k;
        ring(b.ox,b.oy,b.oz, 12+150*(1-k), 5, COL.mag, .5+.7*k, 16);
        sprite(b.ox,b.oy,b.oz, 20+60*k, COL.white, .5+.8*k);
        for(let i=0;i<6;i++){
          const a=i*1.047+b.t*9;
          sprite(b.ox+Math.cos(a)*rr, b.oy+Math.sin(a)*rr*.7, b.oz, 8, COL.mag, .8);
        }
      } else {
        /* reform: a flash ring expanding off the arrival point — phase 3 puts
           a nova here, so this IS the "get off the blink-in spot" warning */
        const k=clamp((b.bt||0)/.28,0,1);
        ring(b.x,b.y,b.z, 20+190*k, 6*(1-k*.6), COL.mag, .9*(1-k*.7), 16);
        sprite(b.x,b.y,b.z, 12+90*(1-k), COL.white, 1.1*(1-k*.5));
        sprite(b.x,b.y,b.z, 160*(1-k), COL.mag, .5);
      }
    } else if(type==='hivemother'){
      const op=b.open==null?1:b.open, pu=b.pulse||0, ch=b.chg||0, fl=Math.max(0,b.flash||0);
      /* pustules breathe out of phase, and all swell together just before a
         spore volley — whichever clock (open cd / closed fcd) is about to fire */
      const nc=Math.min(b.cd??9,b.fcd??9), sw=nc<.4?1-nc/.4:0;
      /* pustule glows are sized for her hold range — anything under ~20 world
         units projects to a couple of pixels out there and vanishes */
      for(const g of ATT.motherPusts)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2],
          (22+8*Math.sin(pu*2.1+g[0]*.13+g[1]*.09))*(1+sw*.8), COL.bio, .6+sw*.6);
      /* standing bioluminescent aura: the "it is a living thing" read that the
         chitin mesh alone cannot give at fog distance — breathes with pulse */
      const au=.22+.07*Math.sin(pu*1.15);
      sprite(b.x,b.y+26,b.z, 470+26*Math.sin(pu*.9), COL.bio, au);
      sprite(b.x,b.y-40,b.z+30, 320, COL.bio, au*.7);
      /* maw: lance charge growth + birth flare, the leviathan idiom */
      const mw=ATT.motherMaw;
      sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], (34+12*Math.sin(pu*1.7))*(1+fl*2)+220*ch, COL.bio, .5+1.1*ch+fl);
      sprite(b.x+mw[0],b.y+mw[1],b.z+mw[2], 12+80*ch, COL.white, .35+.9*ch);
      /* the core is the armor gauge: the open bell glows hot, closed goes dim */
      const co=ATT.motherCore;
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], (40+90*op)*pl, COL.bio, .3+.9*op);
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], (14+34*op)*pl, COL.white, .2+.8*op);
      if(op<.4){
        /* membrane film: dim overlapping bio haze sheathing the bell plus a
           slow shimmer ring — the "your shots are eating armor" tell */
        const sh=(.25+.10*Math.sin(b.t*2.3))*(1-op*2);
        sprite(b.x,b.y+20,b.z, 300, COL.bio, sh);
        sprite(b.x-70,b.y-30,b.z+40, 220, COL.bio, sh*.7);
        sprite(b.x+80,b.y+60,b.z-30, 240, COL.bio, sh*.6);
        ring(b.x,b.y+10,b.z, 265+14*Math.sin(b.t*1.3), 7, COL.bio, .30*(1-op*2), 18);
      }
    } else if(type==='goliath'){
      const fl=Math.max(0,b.flash||0), co=ATT.golCore;
      /* the reactor eye is the one soft-looking point on a hull this armored */
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], (60+14*Math.sin(b.t*2.4))*(1+fl), COL.amber, .9+fl*.8);
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], 24*pl, COL.white, .8);
      for(const g of ATT.golVents)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 20+7*Math.sin(b.t*3+g[0]*.02), COL.amber, .75);
      /* the chin row strobes on every sweep/barrage beat (b.flash) */
      for(const g of ATT.golGuns){
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 12+30*fl, COL.amber, .5+fl*2.2);
        if(fl>0) sprite(b.x+g[0],b.y+g[1],b.z+g[2], 8+18*fl, COL.white, fl*1.2);
      }
      /* past the midpoint the hull itself starts burning: fixed seam embers
         whose glow tracks how hurt it is — a fortress-sized health bar */
      const rage=1-b.hp/b.max;
      if(rage>.4) for(const g of GOLSEAMS)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 13+6*Math.sin(b.t*5+g[0]*.05), COL.amber, (rage-.4)*1.4);
    } else if(type==='hedra'){
      const fl=Math.max(0,b.flash||0), sp=b.spin||0, co=ATT.hedraCore;
      /* the crystal is lit from inside, and the whole core strobes on an
         attack — the only muzzle it has */
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], (80+18*Math.sin(b.t*2.1))*(1+fl*1.6), COL.cyan, .85+fl*1.2);
      sprite(b.x+co[0],b.y+co[1],b.z+co[2], 26+12*Math.sin(b.t*3.3)+50*fl, COL.white, .6+fl);
      /* vertex glints riding the tumble — decorative, but they sell the spin
         the lattice orientation is keyed to. Sized for hold range: under ~10
         world units they project to a pixel and die. */
      for(let i=0;i<6;i++){
        const a1=sp*1.31+i*1.0472, a2=sp*.87+i*2.4;
        sprite(b.x+Math.cos(a1)*Math.cos(a2)*165, b.y+Math.sin(a2)*135, b.z+Math.sin(a1)*Math.cos(a2)*140,
          13+5*Math.sin(b.t*7+i), COL.cyan, .6+.35*Math.sin(b.t*9+i*2.6));
      }
    } else if(type==='arbalest'){
      const ln=ATT.arbLens, s=b.bmS||0;
      if(s===1){
        /* charge: the lens swells over the full 1.4s, and a thin pulsing line
           marks the locked column — locked at charge START, so the line never
           follows you: the dodge is simply not being on it when it fires */
        const k=clamp((b.bmT||0)/1.4,0,1);
        sprite(b.x+ln[0],b.y+ln[1],b.z+ln[2], 20+150*k, COL.ice, .5+1.0*k);
        sprite(b.x+ln[0],b.y+ln[1],b.z+ln[2], 8+60*k, COL.white, .4+.9*k);
        beam(b.bmX,GROUND_Y,300, b.bmX,CEIL_Y,300, 3+2*Math.sin(S.T*18), COL.ice, .35+.25*Math.sin(S.T*14));
      } else if(s===2){
        /* fire: the column drawn at several z slices so it reads as a wall of
           light, not a line — hot white core inside a soft ice sheath, plus a
           splash where it grinds along the deck */
        const fz=.85+.15*Math.sin(S.T*47);
        for(const zz of [0,450,900,1350]){
          beam(b.bmX,GROUND_Y,zz, b.bmX,CEIL_Y,zz, 26, COL.ice, .55*fz);
          beam(b.bmX,GROUND_Y,zz, b.bmX,CEIL_Y,zz, 9, COL.white, .8*fz);
        }
        sprite(b.bmX,GROUND_Y+40,180, 130*fz, COL.ice, .9);
        sprite(b.bmX,GROUND_Y+26,180, 55, COL.white, .9*fz);
        sprite(b.x+ln[0],b.y+ln[1],b.z+ln[2], 120*fz, COL.ice, 1.2);
        sprite(b.x+ln[0],b.y+ln[1],b.z+ln[2], 46, COL.white, 1.1);
      } else
        sprite(b.x+ln[0],b.y+ln[1],b.z+ln[2], 24+7*Math.sin(b.t*2.6), COL.ice, .6);
      /* mortar pods swell before a lob (the ravager idiom, on the mortar fcd) */
      const msw=b.fcd<.4?1-b.fcd/.4:0;
      for(const g of ATT.arbMortars)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], (10+4*Math.sin(b.t*3+g[0]*.06))*(1+msw), COL.ice, .45+msw*.7);
    } else if(type==='reaper'){
      /* reapCurtain only sets flash to .08, so the rack strobe normalizes it —
         at ~10 drops/s that reads as a near-continuous burn during a run */
      const fs=clamp((b.flash||0)/.08,0,1), cross=b.mode==='cross', dir=b.dir||1;
      for(const g of ATT.reapEngines)
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], (13+4*Math.sin(b.t*8+g[0]))*(cross?1.7:1), COL.red, cross?.95:.6);
      if(cross)
        /* wingtip streaks trailing against the travel — pure speed read */
        for(const s2 of [-1,1])
          beam(b.x+s2*170, b.y+18, b.z, b.x+s2*170-dir*150, b.y+18, b.z, 6, COL.red, .4);
      for(const g of ATT.reapRack){
        sprite(b.x+g[0],b.y+g[1],b.z+g[2], 10+16*fs, COL.red, .45+fs*.9);
        if(fs>0) sprite(b.x+g[0],b.y+g[1],b.z+g[2], 6+10*fs, COL.white, fs*.8);
      }
    } else {
      const c=ATT.bossCore;
      sprite(b.x+c[0],b.y+c[1],b.z+c[2], 120*pl, b.phase===3?COL.red:COL.green, 1.1);
      sprite(b.x+c[0],b.y+c[1],b.z+c[2], 46*pl, COL.white, 1.2);
      for(const g of ATT.bossGuns) sprite(b.x+g[0],b.y+g[1],b.z+g[2], 16, COL.mag, .9);
    }
  }
  for(const k of S.crates){
    const c = k.kind==='shield'?COL.green : k.kind==='rapid'?COL.cyan : COL.mag;
    sprite(k.x,k.y,k.z, 30+Math.sin(S.T*6)*5, c, .8);
  }
  nukeFX();
}

/* ---------------------------------------------------------- nuclear column
   The sprite batch is purely ADDITIVE (ONE,ONE), so nothing here can darken
   the frame — a smoke column has to be built out of light. That turns out to
   be right for this subject: the cloud is lit from inside by its own fireball,
   so the ash tones are dim warm greys that read as haze, and the heat term
   simply blends them up toward fire. As the cloud cools it dims rather than
   greying, which is the only honest way to do smoke in an additive pass. */
const N_FIRE=[1,.55,.14], N_EMBER=[1,.78,.34], N_ASH=[.26,.21,.23], N_DIRT=[.50,.36,.26];
const _nc=[0,0,0];
function nmix(a,b,t){
  _nc[0]=a[0]+(b[0]-a[0])*t; _nc[1]=a[1]+(b[1]-a[1])*t; _nc[2]=a[2]+(b[2]-a[2])*t;
  return _nc;
}
function ring(x,y,z,r,w,c,a,n){
  let px=x+camR[0]*r, py=y+camR[1]*r, pz=z+camR[2]*r;
  for(let i=1;i<=n;i++){
    const th=i/n*6.2832, cs=Math.cos(th)*r, sn=Math.sin(th)*r;
    const nx=x+camR[0]*cs+camU[0]*sn, ny=y+camR[1]*cs+camU[1]*sn, nz=z+camR[2]*cs+camU[2]*sn;
    beam(px,py,pz, nx,ny,nz, w, c, a);
    px=nx; py=ny; pz=nz;
  }
}
function nukeFX(){
  for(const k of S.nukes||[]){
    if(k.state==='fall'){
      /* the warhead itself, so it is trackable against a black sky */
      const fs = k.hyd?2.0:1;
      sprite(k.x,k.y,k.z, 16*fs, COL.white, .9);
      sprite(k.x,k.y,k.z, 34*fs, COL.red, .5);
      if(k.hyd) sprite(k.x,k.y,k.z, 96, [1,.5,.15], .28);
      continue;
    }
    /* hy is the ONE tier term in here. Every radius already scales for free
       through coreR(k); what it cannot carry is height, lifetime and detail
       count, so those are the only things that read the flag. */
    const hy  = k.hyd?1:0;
    const x=k.x, z=k.z, age=k.t, g=k.g;
    const e   = 1-(1-g)*(1-g);
    /* the hydrogen cloud stays molten for more than twice as long, because the
       flash no longer hides the first second and a half of it and the tier now
       has to hold up to being LOOKED at for its whole life */
    const hot = clamp(1-age/(3.2+hy*4.4), 0, 1);  // how molten it still is
    const rc  = coreR(k), rf = falloutR(k);
    /* The hydrogen cloud's LOWER cap sits lower than the tactical one, which is
       the single least intuitive number in this file and the one that finally
       made the silhouette appear.
       The camera leaves about one frame half-height of world above the horizon:
       at z=1600, where the column is the subject, that is ~1270 units above the
       deck. This term used to carry 2.15x, then 1.62x, and at BOTH the cap, the
       skirt and the second stack were off the top of the frame at every
       distance the column is legible at — measured, the cap was at 1650 with
       1270 available. The tier's signature silhouette existed only in the
       source; on screen it was a bright dome on the horizon.
       So the lower cap takes NO height bonus at all: it sits exactly where a
       tactical cap sits, ~1150 up, which is the tallest thing that still fits,
       and the second cap goes above it. That is also the only height at which
       the shape survives the sprite radii — every element here is drawn with
       blobs about 60% as wide as the structure they describe, so at the .72x I
       tried first the stem, the cap and the skirt all overlapped into a single
       bell. A mushroom needs the cap to stand at least twice its own radius off
       the deck before the gap under it is wider than the blobs drawing it.
       The tier's extra bulk therefore goes into WIDTH (capR, skirt) and into
       the second cap — the axes the frame has room on. */
    const topY = GROUND_Y + (200 + 940*e + Math.min(300, age*46));
    /* The hydrogen cap does NOT get a width bonus on top of that. rc is already
       the hydrogen core, so the cap is wider than a tactical one for free; the
       extra .24 on top of it put the cap radius (579) within fifty units of the
       cap's own height off the deck (621), and a cap as wide as it is tall is a
       DOME. What makes a mushroom read is the ratio, not the size. */
    const capR = rc*(1.35+.55*e)*(1+hy*.05);

    /* Sprites melt into the haze — see the fade in the spr fragment shader —
       and a warhead detonates at z ~= 2650, where that fade is down to about
       five percent. Everything else in the game wants exactly that; a nuclear
       fireball is the one object that must not be politely absorbed by the
       horizon, and this is the other half of why the old set piece had to lean
       on a full-frame white rect. It was not that the fireball was too small,
       it was that the fog had already erased it. So the glare divides the fade
       back out and arrives at full strength however far away it is. */
    let ff = 1 - clamp((z + CAM_BACK - FOG_NEAR)/(FOG_FAR-FOG_NEAR), 0, 1);
    ff = ff*ff*(3-2*ff);
    const defog = Math.min(22, 1/Math.max(.045, ff));
    /* The cloud gets its own, much gentler share of the same correction so the
       mushroom is legible while it is still out at the fog wall. The exponent
       is EIGHT, and that is the whole trick: the cloud is ~190 overlapping
       additive sprites, so a lift big enough to rescue it at 4km saturates it
       into a featureless white bell by 2km — exactly the band where the
       mushroom is supposed to become the subject. A high exponent keeps the
       lift pinned to the last few hundred metres of fog and leaves the readable
       band alone. Measured: at a quartic the t=2.0 frame was a white dome; at
       an eighth it has a cap, a waist and sky either side of the stem. */
    const fq = 1-ff;
    /* ...and then the whole hydrogen cloud is scaled DOWN, which looks backwards
       and is not. The batch is additive, and the hydrogen cloud draws roughly
       three times the sprites of the tactical one for the same picture — a
       fatter stem, a skirt, a second stack, a throat — so at equal per sprite
       alpha every one of those extra layers stacks toward saturation and the
       whole thing turns into one flat white mass with no cap, no neck and no
       skirt in it. Detail count and per-sprite alpha have to move in opposite
       directions or more structure buys less structure.
       The curve is therefore a DIP, not a ramp: 1.0 at the pass-by, ~.73 in the
       middle distance, 2.5 at the fog wall. Each end is set by a different
       failure. Near, the column is supposed to be a WALL you fly past, and
       anything under about .8 left a haze you could read the skyline through
       (measured .211 frame std against the tactical round's .296). In the
       middle it is supposed to be a SHAPE, and that is the band where 190
       overlapping sprites clip to white and delete their own structure. Far, it
       is supposed to still exist at all, against a fog fade of about 5%. */
    const cd = hy ? 1.00 - .52*fq + 2.05*Math.pow(fq,8) : 1;

    /* --- THE GLARE. This is the hydrogen round's whiteout, moved off the lens
       and into the world, and moving it is the entire fix. The HUD version was
       a fillRect: it could only push every pixel the same distance toward white
       and so could only ever delete the picture. An additive disc at ground
       zero is the same brightness in the middle and nothing at the corners, and
       — because the sprite pass is depth TESTED — every tower, gantry and hull
       nearer than the fireball punches a hard black silhouette through it. Same
       blinding, except now there is something to be blinded BY.
       Alphas well above 1 are deliberate: the batch is ONE,ONE and the shader
       multiplies by the fog fade, so these are what a saturated core costs once
       four kilometres of haze have been divided back out. */
    const gf = clamp(1-age/(hy?.85:.50), 0, 1), gq = gf*gf;
    if(hy && gf>0){
      const gy = GROUND_Y+170+300*(1-gf), gr = coreFull(k)*(1+1.7*(1-gf));
      const ga = gq*defog;
      sprite(x,gy,z, gr*9.5, [1,.60,.22], ga*2.4);
      sprite(x,gy,z, gr*5.4, [1,.86,.52], ga*3.2);
      sprite(x,gy,z, gr*2.9, [1,.98,.88], ga*4.0);
      sprite(x,gy,z, gr*1.5, COL.white,   gf*defog*5.0);
    }

    /* --- the fireball, before it has climbed into a stem */
    /* The hydrogen fireball is SHORTER LIVED than the tactical one, which is
       the opposite of what "more epic" wants to write and is nonetheless the
       whole point. Its job is to blind, and the glare above already does that
       for the first .85s; what has to be epic afterwards is the MUSHROOM, and
       the mushroom cannot be the subject while a fireball scaled off a 300-unit
       core is still sitting in front of it. Measured: at a 2.0s life the t=2.0
       frame was a single saturated white ball 2.6x the height of the screen
       with no cap, no stem and no horizon in it. So the fireball hands off at
       ~1.05s and the cloud takes the frame. */
    const fb = clamp(1-age/(hy?1.05:1.5), 0, 1);
    if(fb>0){
      const fy = GROUND_Y+130 + (1-fb)*380*(1+hy*1.5);
      /* ...and it does not balloon on the way out either. rc is ALREADY the
         hydrogen core, so a 1.5x growth on top of it is 1.5x of something that
         was big to begin with — the growth term is the one place the two tiers
         must not both scale. */
      const fr = rc*(.95 + (hy?.55:1.5)*(1-fb));
      /* the hydrogen halo is cubed where the tactical one is squared so it gets
         out of the way on its own; the hard white heart is the part that stays */
      const fo = hy ? fb*fb*fb : fb*fb;
      sprite(x,fy,z, fr*2.3, [1,.72,.30], fo*1.10);
      sprite(x,fy,z, fr*1.25, [1,.94,.72], fo*1.45);
      sprite(x,fy,z, fr*.55,  COL.white,   fb*1.6);
      /* the hydrogen fireball keeps a hard white heart long after the tactical
         one has gone orange — the stage that is still burning, not cooling */
      if(hy){
        sprite(x,fy,z, fr*1.9, [1,.55,.16], fo*.34);
        sprite(x,fy+60,z, fr*.30, COL.white, fb*2.2);
      }
    }

    /* --- stem: narrow at the crater, waisted, flaring up into the cap */
    /* the hydrogen STEM is narrower in proportion, for the same reason the cap
       is: rc already carries the tier's scale, and a stem that arrives at the
       cap only 1.6x narrower than the cap is not a stem, it is the bottom of a
       dome. At .48 the ratio is 2:1 and there is sky either side of it. */
    const NS=18+hy*14, stemR=rc*(.58-hy*.10);
    for(let i=0;i<NS;i++){
      const u=i/(NS-1);
      const sy = GROUND_Y + u*(topY-GROUND_Y);
      const r  = stemR*(.5 + .55*Math.sin(u*1.5708) + .75*u*u);
      const wob = Math.sin(S.T*.9 + u*5.1 + k.seed)*r*.30;
      const heat = clamp(hot*(1-u*.45) + (1-u)*.40, 0, 1);
      for(let j=0;j<3;j++){
        const a = S.T*.45 + j*2.0944 + u*4.3 + k.seed;
        /* hydrogen stem blobs are TIGHTER, not fatter. At 1.55 the sprite is
           half again as wide as the ring it sits on, so the stem's painted
           width was ~490 against a 460 cap radius and there was no waist in the
           silhouette at all — the thing that separates a mushroom from a bell
           is sky either side of the stem, and that only exists if the blobs
           drawing the stem are narrower than the gap they have to leave. */
        sprite(x+wob+Math.cos(a)*r*.55, sy, z+Math.sin(a)*r*.55,
          r*(hy?1.10:1.55), nmix(N_ASH,N_FIRE,heat), (.26+.38*heat)*cd);
      }
    }

    /* --- cap: three stacked rings make a dome, and the underside glows,
       which is the single cue that reads as "mushroom" at a glance */
    const RR=[1,.72,.38], RY=[0,92,152], RN=[14,10,6];
    for(let b=0;b<3;b++){
      const rr=RR[b]*capR, yy=topY+RY[b]*(.4+.6*e), heat=clamp(hot*.7,0,1);
      for(let i=0;i<RN[b];i++){
        const a=i/RN[b]*6.2832 + S.T*.16 + b*.7 + k.seed;
        const pulse=1+.13*Math.sin(S.T*1.6+i+b);
        sprite(x+Math.cos(a)*rr, yy, z+Math.sin(a)*rr,
          capR*.60*pulse, nmix(N_ASH,N_EMBER,heat), (.24+.30*heat)*cd);
      }
    }
    sprite(x, topY-46, z, capR*1.35, nmix(N_ASH,N_FIRE,hot*.9), (.28+.50*hot)*cd);
    /* --- hydrogen only: the skirt and the second, higher cap. A thermonuclear
       cloud reads as two stacked mushrooms with a flat condensation skirt slung
       under the lower one, and that silhouette is the whole point of the tier —
       at a glance you know which bomb just went off. */
    if(hy){
      /* The skirt is a flat disc, not a ring: a Wilson cloud is a sheet of
         condensed air with nothing inside it, and drawing only the rim read as
         a second, thinner mushroom. Two radii of sprites give it a filled
         underside that stays legible now that it is not behind a whiteout. */
      const skY = GROUND_Y + (topY-GROUND_Y)*.16, skR = capR*2.10;
      /* ...and it is a SILHOUETTE element, so it is only worth drawing while the
         column can still be seen whole. Once the pass-by starts, a disc four cap
         radii across sits between the camera and everything else and all it does
         is lift the frame off black: measured, it cost .034 of frame std at
         t=3.3, which was the single reason the hydrogen round still had less
         contrast than the tactical one at the moment of closest approach. */
      const skV = clamp((z-380)/700, 0, 1);
      for(let b=0;b<2;b++){
        const rr = skR*(b?.58:1), nS = b?16:30;
        for(let i=0;i<nS;i++){
          const a=i/nS*6.2832 + S.T*.10 + b*.55 + k.seed;
          sprite(x+Math.cos(a)*rr, skY+b*22, z+Math.sin(a)*rr,
            capR*(b?.22:.26), nmix(N_ASH,N_EMBER,hot*.45), ((b?.20:.30)+.30*hot)*cd*skV);
        }
      }
      /* ...and the upper cap takes the height the lower one gave up, so the pair
         still stand taller than a tactical column while both remaining inside
         the frame. Its crown grazes the top edge at closest approach, which is
         wanted: a shape you cannot quite fit in view reads as bigger than one
         that sits comfortably inside it. */
      const upY = topY + 330*(.4+.6*e), upR = capR*.80;
      for(let b=0;b<3;b++){
        const rr=[1,.74,.42][b]*upR, yy=upY+b*116*(.4+.6*e), nS=[14,10,6][b];
        for(let i=0;i<nS;i++){
          const a=i/nS*6.2832 + S.T*.13 + b*.9 + k.seed;
          sprite(x+Math.cos(a)*rr, yy, z+Math.sin(a)*rr,
            capR*.56*(1+.12*Math.sin(S.T*1.4+i)), nmix(N_ASH,N_EMBER,hot*.6), (.20+.28*hot)*cd);
        }
      }
      sprite(x, upY-30, z, capR*1.05, nmix(N_ASH,N_FIRE,hot*.8), (.20+.38*hot)*cd);
      /* the throat between the two caps, so they read as one column that
         necked rather than as two clouds that happen to be stacked */
      for(let i=0;i<7;i++){
        const u=i/6, yy=topY+90+(upY-topY-90)*u;
        sprite(x+Math.sin(S.T*.8+u*3+k.seed)*capR*.10, yy, z,
          capR*(.46-.10*u), nmix(N_ASH,N_FIRE,hot*.75), (.16+.26*hot)*cd);
      }
    }

    /* --- base surge: the dirt ring thrown flat along the deck */
    const bs=clamp(age/(2.4+hy*1.4),0,1), br=rc*(.8+2.5*bs);
    for(let i=0;i<12+hy*8;i++){
      const a=i/(12+hy*8)*6.2832+k.seed;
      sprite(x+Math.cos(a)*br, GROUND_Y+34+46*bs, z+Math.sin(a)*br,
        rc*.8, nmix(N_ASH,N_DIRT,hot*.6), (1-bs)*.45);
    }

    /* --- internal lightning: bright pops inside the column while it burns */
    for(let i=0;i<1+hy*2;i++)
      if(hot>.15 && Math.random()<.4)
        sprite(x+rnd(-rc,rc), GROUND_Y+rnd(120,topY-GROUND_Y), z+rnd(-rc,rc),
          rnd(40,115)*(1+hy*.8), [1,.90,.70], rnd(.3,.9)*hot);

    /* --- blast front, still outrunning the cloud. The hydrogen front travels
       SLOWER (HYD_WAVE) and much further, so the ring hangs in the frame for
       seconds instead of flicking past — the sound arriving late is the cue. */
    if(!k.waveHit && k.wave>60){
      const wa=clamp(1-k.wave/(hy?7000:4200),0,1)*(hy?1.0:.8);
      ring(x, GROUND_Y+340, z, k.wave, 14+hy*10, [.86,.93,1], wa, 26);
      ring(x, GROUND_Y+340, z, k.wave*.86, 7+hy*6, [1,.88,.62], wa*.6, 20);
      if(hy) ring(x, GROUND_Y+140, z, k.wave*.62, 9, [1,.72,.34], wa*.45, 20);
    }

    /* --- the gates. Everything above is spectacle; THESE are the gameplay.
       Two red rails at the lethal radius and two green ones at the fallout
       edge, standing floor-to-ceiling so the safe lane is unmistakable from
       any altitude — the whole hazard is lateral, and it has to be legible
       through a sky already full of fire. */
    if(z>-320 && z<3200){
      const al=clamp(1-Math.abs(z)/2400, .14, .85);
      /* the hydrogen gates run floor-to-well-above-the-ceiling and pulse, so
         they stay readable through a whiteout that is nearly opaque */
      const gt = hy ? 1+.35*Math.sin(S.T*9) : 1;
      for(const s of [-1,1]){
        beam(x+s*rc, GROUND_Y, z, x+s*rc, 430+hy*380, z, (6.5+hy*4)*gt, [1,.20,.26], al*.95);
        beam(x+s*rf, GROUND_Y, z, x+s*rf, 300+hy*180, z, 3.5+hy*2, [.50,1,.30], al*.40);
      }
    }
  }
}
