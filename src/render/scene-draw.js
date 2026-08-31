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
/* boss type → mesh (bosses rotate: mothership / carrier / dreadnought / leviathan) */
const BOSSMESH = {
  mothership:  MESH.mothership,
  carrier:     mesh(MODELS.carrier),
  dreadnought: mesh(MODELS.dreadnought),
  leviathan:   mesh(MODELS.leviathan)
};
/* per-type phase tints, same idiom as the old inline mothership pick */
const BOSSPH = {
  mothership:  [null, [.16,0,.16], [.45,0,0]],
  carrier:     [null, [0,.15,.07], [.35,.06,0]],
  dreadnought: [null, [.18,.02,0], [.50,0,0]],
  leviathan:   [null, [.10,.14,0], [.38,.16,0]]
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
  gl.uniform3f(Plit.u.uLightDir, -0.35, 0.72, -0.60);
  gl.uniform3f(Plit.u.uFogColor, 0.13*(1+S.bossFx), 0.03, 0.20);
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
    compose(model, S.boss.x,S.boss.y,S.boss.z, S.boss.list||0, S.boss.yaw, S.boss.roll, 1);
    const type=S.boss.type||'mothership';
    const ph=(BOSSPH[type]||BOSSPH.mothership)[S.boss.phase-1]||null;
    litDraw(BOSSMESH[type]||MESH.mothership, model, hitTint(S.boss,0)||ph, 1);
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
}
