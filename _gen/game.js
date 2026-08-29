"use strict";
/* SKYFALL INTERCEPTOR — engine spine.
   Depends on globals: MODELS (meshes), SHADERS (glsl), AUDIO (sound). */

/* ------------------------------------------------------------------ math */
const M4 = {
  create(){ return new Float32Array(16); },
  ident(o){ o.fill(0); o[0]=o[5]=o[10]=o[15]=1; return o; },
  mul(o,a,b){
    for(let c=0;c<4;c++){
      const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
      o[c*4  ]=a[0]*b0+a[4]*b1+a[8]*b2+a[12]*b3;
      o[c*4+1]=a[1]*b0+a[5]*b1+a[9]*b2+a[13]*b3;
      o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
      o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
    }
    return o;
  },
  persp(o,fovy,asp,n,f){
    const t=1/Math.tan(fovy/2); o.fill(0);
    o[0]=t/asp; o[5]=t; o[10]=(f+n)/(n-f); o[11]=-1; o[14]=2*f*n/(n-f);
    return o;
  },
  lookAt(o,ex,ey,ez,tx,ty,tz,ux,uy,uz){
    let zx=ex-tx, zy=ey-ty, zz=ez-tz;
    let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    let xx=uy*zz-uz*zy, xy=uz*zx-ux*zz, xz=ux*zy-uy*zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    o[0]=xx; o[1]=yx; o[2]=zx; o[3]=0;
    o[4]=xy; o[5]=yy; o[6]=zy; o[7]=0;
    o[8]=xz; o[9]=yz; o[10]=zz; o[11]=0;
    o[12]=-(xx*ex+xy*ey+xz*ez);
    o[13]=-(yx*ex+yy*ey+yz*ez);
    o[14]=-(zx*ex+zy*ey+zz*ez);
    o[15]=1;
    return o;
  },
  rotX(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[5]=c;o[6]=s;o[9]=-s;o[10]=c; return o; },
  rotY(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[0]=c;o[2]=-s;o[8]=s;o[10]=c; return o; },
  rotZ(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[0]=c;o[1]=s;o[4]=-s;o[5]=c; return o; }
};
const _a=M4.create(), _b=M4.create(), _c=M4.create(), _d=M4.create(), _e=M4.create();
function compose(out, x,y,z, rx,ry,rz, s){
  M4.mul(_c, M4.rotY(_a,ry), M4.rotX(_b,rx));
  M4.mul(_d, _c, M4.rotZ(_a,rz));
  if(s!==1) for(let i=0;i<12;i++) _d[i]*=s;
  out.set(_d); out[12]=x; out[13]=y; out[14]=z; out[15]=1;
  return out;
}
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;

/* ------------------------------------------------------------------ world constants */
const SPAWN_Z=3400, DESPAWN_Z=-460, FOG_NEAR=560, FOG_FAR=3300;
const CAM_BACK=300, CAM_UP=34;
const GROUND_Y=-270, CEIL_Y=340, GRID_STEP=250;
const BX=238, BY=150;            // player flight envelope
const FLOW=1150;                 // base world scroll speed
const COL={
  cyan:[0.13,0.88,1.0], mag:[1.0,0.24,0.94], amber:[1.0,0.60,0.17],
  red:[1.0,0.17,0.30], green:[0.24,1.0,0.62], purple:[0.64,0.29,1.0], white:[1,1,1]
};
const css=c=>'rgb('+(c[0]*255|0)+','+(c[1]*255|0)+','+(c[2]*255|0)+')';

/* ------------------------------------------------------------------ gl setup */
const glc = document.getElementById('gl');
const hud = document.getElementById('hud');
const h2d = hud.getContext('2d');
const gl = glc.getContext('webgl', {antialias:true, alpha:false, powerPreference:'high-performance'})
        || glc.getContext('experimental-webgl', {antialias:true, alpha:false});
if(!gl) throw new Error('WebGL unavailable');

let W=0,H=0,DPR=1;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  glc.width = Math.round(W*DPR); glc.height = Math.round(H*DPR);
  hud.width  = Math.round(W*DPR); hud.height = Math.round(H*DPR);
  h2d.setTransform(DPR,0,0,DPR,0,0);
  gl.viewport(0,0,glc.width,glc.height);
}
addEventListener('resize', resize); resize();

function compile(type, src, tag){
  const s = gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))
    throw new Error(tag+' shader: '+gl.getShaderInfoLog(s));
  return s;
}
function program(def, attribs, tag){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, def.vs, tag+'.vs'));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, def.fs, tag+'.fs'));
  attribs.forEach((n,i)=>gl.bindAttribLocation(p,i,n));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))
    throw new Error(tag+' link: '+gl.getProgramInfoLog(p));
  const u = new Proxy({}, {get:(t,k)=> (k in t? t[k] : (t[k]=gl.getUniformLocation(p,k)))});
  return {p,u};
}
const Plit = program(SHADERS.lit, ['aPos','aNormal','aColor'], 'lit');
const Pspr = program(SHADERS.spr, ['aPos','aUV','aColor','aKind'], 'spr');
const Psky = program(SHADERS.sky, ['aPos'], 'sky');

function attribs(n){
  for(let i=0;i<4;i++){ if(i<n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); }
}
function upload(data, usage){
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage||gl.STATIC_DRAW);
  return b;
}
function mesh(verts){ return {buf:upload(verts), n:verts.length/9}; }

const MESH = {
  jet:        mesh(MODELS.jet),
  drone:      mesh(MODELS.drone),
  cruiser:    mesh(MODELS.cruiser),
  mothership: mesh(MODELS.mothership),
  crate:      mesh(MODELS.crate)
};
const ATT = MODELS.attach;

const skyBuf = upload(new Float32Array([-1,-1, 3,-1, -1,3]));

/* ------------------------------------------------------------------ additive batch */
const SPR_MAX = 4200, FL = 10;
const sprData = new Float32Array(SPR_MAX*6*FL);
const sprBuf  = upload(sprData, gl.DYNAMIC_DRAW);
let sprN = 0;
let camR=[1,0,0], camU=[0,1,0], camP=[0,0,0];

function sv(i, x,y,z, u,v, c, a, k){
  sprData[i]=x; sprData[i+1]=y; sprData[i+2]=z;
  sprData[i+3]=u; sprData[i+4]=v;
  sprData[i+5]=c[0]; sprData[i+6]=c[1]; sprData[i+7]=c[2]; sprData[i+8]=a;
  sprData[i+9]=k;
}
function sprite(x,y,z, size, c, a){
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
function beam(x1,y1,z1, x2,y2,z2, w, c, a){
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
const gridBuf = (function(){
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

/* ------------------------------------------------------------------ input */
const keys={}, mouse={x:0,y:0,fire:false,alt:false,has:false};
const tap={a:0,d:0};
addEventListener('keydown', e=>{
  const k = e.key.length===1 ? e.key.toLowerCase() : e.key;
  if(!e.repeat){
    if(k==='a'||k==='d'){ const t=performance.now(); if(t-tap[k]<300) barrelRoll(k==='a'?-1:1); tap[k]=t; }
    if(k==='m') AUDIO.toggle();
  }
  keys[k]=true;
  if(k===' '||k==='ArrowUp'||k==='ArrowDown') e.preventDefault();
});
addEventListener('keyup', e=>{ keys[e.key.length===1?e.key.toLowerCase():e.key]=false; });
addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; mouse.has=true; });
addEventListener('mousedown', e=>{ if(e.button===0) mouse.fire=true; if(e.button===2) mouse.alt=true; });
addEventListener('mouseup',   e=>{ if(e.button===0) mouse.fire=false; if(e.button===2) mouse.alt=false; });
addEventListener('contextmenu', e=>e.preventDefault());
addEventListener('blur', ()=>{ for(const k in keys) keys[k]=false; mouse.fire=mouse.alt=false; AUDIO.suspend(); });
addEventListener('focus', ()=>AUDIO.resume());

/* ------------------------------------------------------------------ state */
let P, stars, enemies, shots, foes, rockets, parts, crates, pops, boss;
let dist, score, kills, combo, comboT, shake, flash, flashC, speed, flow;
let gameOn=false, T=0, spawnT, waveN, nextBoss, alarmT, tipT, hitT, bossWarn, bossFx, hintT=0;

function reset(){
  P={x:0,y:0,vx:0,vy:0,roll:0,pitch:0,yaw:0,hp:100,shield:60,boost:100,
     fireCd:0,misCd:0,weapon:'std',wepT:0,rollT:0,rollDir:1,inv:0,thr:.4};
  stars=[]; for(let i=0;i<300;i++) stars.push({x:rnd(-3000,3000),y:rnd(-900,1500),z:rnd(200,SPAWN_Z+900)});
  enemies=[]; shots=[]; foes=[]; rockets=[]; parts=[]; crates=[]; pops=[]; boss=null;
  dist=0; score=0; kills=0; combo=1; comboT=0; shake=0; flash=0; flashC=COL.white;
  speed=1; flow=FLOW; spawnT=.25; waveN=0; nextBoss=2800; alarmT=0; tipT=4.5; hitT=0;
  bossWarn=0; bossFx=0;
}

/* ------------------------------------------------------------------ actions */
function barrelRoll(dir){
  if(!gameOn || P.rollT>0) return;
  P.rollT=.55; P.rollDir=dir; P.inv=Math.max(P.inv,.6);
  AUDIO.thud();
  for(let i=0;i<22;i++)
    parts.push(mk(P.x,P.y,0, rnd(-190,190),rnd(-190,190),rnd(-420,140), COL.cyan, .45, 5));
}
function mk(x,y,z,vx,vy,vz,c,life,size){ return {x,y,z,vx,vy,vz,c,life,max:life,size}; }
function burst(x,y,z,c,n,pow){
  for(let i=0;i<n;i++){
    const a=rnd(0,6.2832), b=rnd(-1,1), r=Math.sqrt(1-b*b), sp=rnd(70,520)*pow;
    parts.push(mk(x,y,z, Math.cos(a)*r*sp, Math.sin(a)*r*sp, b*sp,
      i%3===0?COL.white:c, rnd(.3,.85), rnd(4,13)*pow));
  }
  shake=Math.min(30, shake+8*pow);
  flash=Math.min(.5, flash+.20*pow); flashC=c;
}
function pop(x,y,z,txt,c){ pops.push({x,y,z,txt,c,life:.85}); }

function aimAt(depth){
  // world point under the crosshair at a given forward depth
  const sx = mouse.has? mouse.x : W/2, sy = mouse.has? mouse.y : H/2;
  const ndx = (sx/W)*2-1, ndy = 1-(sy/H)*2;
  const tanY = Math.tan(FOVY/2), tanX = tanY*(W/H);
  const d = depth - camP[2];
  return { x: camP[0] + ndx*tanX*d, y: camP[1] + ndy*tanY*d };
}
function fireGuns(){
  const aim = aimAt(1500);
  const muz = P.weapon==='spread' ? [-86,-44,0,44,86] : ATT.jetMuzzles.map(m=>m[0]);
  const V=3400;
  for(let i=0;i<muz.length;i++){
    const ox=muz[i], mx=P.x+ox, my=P.y+2, t=1500/V;
    let vx=(aim.x-mx)/t, vy=(aim.y-my)/t;
    if(P.weapon==='spread') vx += ox*2.6;
    shots.push({x:mx,y:my,z:26,vx,vy,vz:V,pz:26,dmg:P.weapon==='rapid'?1.1:2});
  }
  P.muzzle=.055;
  AUDIO.laser(); P.thr=Math.max(P.thr,.6);
}
function fireMissiles(){
  const t = lockOn();
  for(const s of [-1,1])
    rockets.push({x:P.x+s*24,y:P.y-6,z:10,vx:s*300,vy:-60,vz:1500,t,life:3.2,pz:10});
  AUDIO.missile();
}
function lockOn(){
  let best=null, bd=1e9;
  const list = boss? enemies.concat([boss]) : enemies;
  for(const e of list){
    if(e.z<180) continue;
    const p = toScreen(e.x,e.y,e.z); if(!p.vis) continue;
    const d = Math.hypot(p.x-(mouse.has?mouse.x:W/2), p.y-(mouse.has?mouse.y:H/2));
    if(d<320 && d<bd){ bd=d; best=e; }
  }
  return best;
}

/* ------------------------------------------------------------------ spawning */
function spawnDrone(){
  /* early drones fly nearly straight — a hard jink is unleadable at a 0.4s
     bullet flight time, so the evasion ramps in with distance */
  const ev=.34+.66*Math.min(1,dist/34000);
  enemies.push({k:'drone',x:rnd(-250,250),y:rnd(-140,150),z:SPAWN_Z,hp:2,r:32,rz:46,
    ph:rnd(0,6.28),amp:rnd(90,240)*ev,spd:(rnd(1180,1480)+waveN*12)*(.78+.22*ev),c:COL.mag,roll:0,yaw:0});
}
function spawnCruiser(){
  const hp = 10+waveN*.8;
  enemies.push({k:'cruiser',x:rnd(-240,240),y:rnd(-120,130),z:SPAWN_Z,hp,max:hp,r:64,rz:64,
    ph:rnd(0,6.28),amp:rnd(40,110),spd:rnd(640,780),c:COL.amber,roll:0,yaw:0,cd:rnd(.4,1.1)});
}
function spawnCrate(){
  crates.push({x:rnd(-220,220),y:rnd(-120,130),z:SPAWN_Z,
    kind:['shield','rapid','spread'][(Math.random()*3)|0],spin:0});
}
function spawnBoss(){
  const hp = 300+waveN*70;
  boss={k:'boss',x:0,y:40,z:SPAWN_Z+600,hp,max:hp,r:210,rz:150,c:COL.purple,
        phase:1,t:0,cd:1.2,dir:1,here:false,yaw:0,roll:0};
  bossWarn=2.4; AUDIO.siren();
}

/* ------------------------------------------------------------------ update */
function update(dt){
  T+=dt;
  const boosting=(keys['Shift']||keys['shift']) && P.boost>1;
  speed = boosting? 2.2 : 1;
  P.boost = boosting ? Math.max(0,P.boost-32*dt) : Math.min(100,P.boost+16*dt);
  P.thr = Math.max(boosting?1:.35, P.thr-dt*2.2);
  flow = FLOW*speed;
  dist += flow*dt;
  AUDIO.setEngine(boosting?1:0, speed);

  /* player */
  const ax=(keys['a']?1:0)-(keys['d']?1:0);
  const ay=(keys['w']?1:0)-(keys['s']?1:0);
  P.vx += ax*4200*dt; P.vy += ay*3500*dt;
  const damp=Math.pow(.0012,dt); P.vx*=damp; P.vy*=damp;
  P.x=clamp(P.x+P.vx*dt,-BX,BX); P.y=clamp(P.y+P.vy*dt,-BY,BY);
  if(Math.abs(P.x)>=BX) P.vx*=.4;
  if(Math.abs(P.y)>=BY) P.vy*=.4;
  P.roll  = lerp(P.roll,  clamp(-P.vx/620,-1.1,1.1), Math.min(1,dt*8));
  P.pitch = lerp(P.pitch, clamp(-P.vy/1500,-.35,.35), Math.min(1,dt*8));
  P.yaw   = lerp(P.yaw,   clamp(P.vx/2600,-.35,.35), Math.min(1,dt*7));
  if(P.rollT>0) P.rollT-=dt;
  if(P.inv>0) P.inv-=dt;
  if(P.muzzle>0) P.muzzle-=dt;
  if(P.wepT>0 && (P.wepT-=dt)<=0) P.weapon='std';

  P.fireCd-=dt; P.misCd-=dt;
  const rate = P.weapon==='rapid'?.055 : P.weapon==='spread'?.17 : .115;
  if(mouse.fire && P.fireCd<=0){ fireGuns(); P.fireCd=rate; }
  if((mouse.alt||keys[' ']) && P.misCd<=0){ fireMissiles(); P.misCd=.62; }

  /* stars */
  for(const s of stars){
    s.z -= flow*1.5*dt;
    if(s.z<-200){ s.z=SPAWN_Z+rnd(200,1400); s.x=rnd(-3000,3000); s.y=rnd(-900,1500); }
  }

  /* director */
  if(!boss){
    if(score>=nextBoss){ nextBoss=score+4600+waveN*1600; spawnBoss(); }
    else if((spawnT-=dt)<=0){
      waveN++;
      const d=Math.min(1,dist/46000);
      const n=1+((Math.random()*(1.4+d*2.6))|0);
      for(let i=0;i<n;i++) (waveN>3 && Math.random()<.32+d*.24) ? spawnCruiser() : spawnDrone();
      if(Math.random()<.15) spawnCrate();
      spawnT = Math.max(.34, 1.25-d*.85)*rnd(.75,1.25);
    }
    AUDIO.setIntensity(.32+Math.min(.42, dist/50000));
  } else AUDIO.setIntensity(1);
  bossFx = lerp(bossFx, boss?1:0, Math.min(1,dt*1.5));

  /* enemies */
  const drift = flow-FLOW;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    e.z -= (e.spd+drift)*dt;
    e.ph += dt*(e.k==='drone'?4.2:1.6);
    const sx=Math.cos(e.ph)*e.amp*(e.k==='drone'?3.0:1.1);
    const sy=Math.sin(e.ph*1.6)*e.amp*(e.k==='drone'?1.7:.6);
    e.x+=sx*dt; e.y+=sy*dt;
    e.roll = lerp(e.roll, clamp(-sx/380,-1.2,1.2), Math.min(1,dt*6));
    e.yaw  = lerp(e.yaw,  clamp(sx/900,-.5,.5)+Math.PI, Math.min(1,dt*6));
    if(e.k==='cruiser' && (e.cd-=dt)<=0 && e.z>420 && e.z<2900){
      e.cd=rnd(.95,1.7);
      const g=ATT.cruiserGuns, V=2000, t=(e.z)/V;
      for(const gp of g){
        const gx=e.x+gp[0], gy=e.y+gp[1];
        foes.push({x:gx,y:gy,z:e.z,vx:(P.x-gx)/t*.8,vy:(P.y-gy)/t*.8,vz:-V,dmg:9,c:COL.amber,r:26});
      }
    }
    if(e.z<70){
      if(e.z>-70 && Math.hypot(e.x-P.x,e.y-P.y)<e.r+24){ hurt(e.k==='drone'?14:26,e); continue; }
      if(e.z<DESPAWN_Z){ enemies.splice(i,1); combo=1; }
    }
  }

  /* boss */
  if(boss){
    const b=boss; b.t+=dt;
    if(!b.here){ b.z-=1500*dt; if(b.z<=1500){ b.z=1500; b.here=true; } }
    else{
      const rage=1-b.hp/b.max;
      b.x += b.dir*(190+180*rage)*dt;
      if(Math.abs(b.x)>300) b.dir*=-1;
      b.y = 40+Math.sin(b.t*.9)*70;
      b.z = 1500+Math.sin(b.t*.6)*300;
      b.phase = b.hp/b.max>.66?1 : b.hp/b.max>.33?2:3;
      b.yaw = Math.PI + Math.sin(b.t*.5)*.18;
      b.roll = Math.sin(b.t*.7)*.10;
      if((b.cd-=dt*(b.phase===3?1.8:b.phase===2?1.35:1))<=0){
        b.cd = b.phase===1?1.15 : b.phase===2?.85 : .62;
        volley(b);
      }
    }
  }

  /* crates */
  for(let i=crates.length-1;i>=0;i--){
    const k=crates[i]; k.z-=(950+drift)*dt; k.spin+=dt*3.4;
    if(k.z<60 && k.z>-80 && Math.hypot(k.x-P.x,k.y-P.y)<70){ take(k.kind); crates.splice(i,1); continue; }
    if(k.z<DESPAWN_Z) crates.splice(i,1);
  }

  /* player shots */
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i]; s.pz=s.z; s.px=s.x; s.py=s.y;
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.z+=s.vz*dt;
    if(s.z>SPAWN_Z+400 || hitScan(s,s.dmg,false)) shots.splice(i,1);
  }
  /* missiles */
  for(let i=rockets.length-1;i>=0;i--){
    const m=rockets[i]; m.pz=m.z; m.px=m.x; m.py=m.y; m.life-=dt;
    if(m.t && (m.t.dead || (m.t!==boss && enemies.indexOf(m.t)<0))) m.t=null;
    if(!m.t) m.t=nearestAhead(m);
    if(m.t){
      const tt=Math.max(.05,(m.t.z-m.z)/m.vz);
      m.vx=lerp(m.vx,(m.t.x-m.x)/tt, Math.min(1,dt*6));
      m.vy=lerp(m.vy,(m.t.y-m.y)/tt, Math.min(1,dt*6));
    }
    m.vz=Math.min(2800,m.vz+1600*dt);
    m.x+=m.vx*dt; m.y+=m.vy*dt; m.z+=m.vz*dt;
    parts.push(mk(m.x,m.y,m.z, rnd(-30,30),rnd(-30,30),-rnd(180,520), COL.amber,.32,7));
    if(m.life<=0 || m.z>SPAWN_Z+400 || hitScan(m,7,true)) rockets.splice(i,1);
  }
  /* enemy fire */
  for(let i=foes.length-1;i>=0;i--){
    const s=foes[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.z+=s.vz*dt;
    if(s.z<60){
      if(s.z>-90 && Math.hypot(s.x-P.x,s.y-P.y)<44){ hurt(s.dmg,null); foes.splice(i,1); continue; }
      if(s.z<DESPAWN_Z) foes.splice(i,1);
    }
  }
  /* particles */
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i]; p.life-=dt;
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt-flow*dt;
    if(p.life<=0||p.z<DESPAWN_Z) parts.splice(i,1);
  }
  for(let i=pops.length-1;i>=0;i--){
    const f=pops[i]; f.life-=dt; f.y+=110*dt; f.z-=flow*dt;
    if(f.life<=0||f.z<40) pops.splice(i,1);
  }

  if((comboT-=dt)<=0 && combo>1){ combo=Math.max(1,combo-1); comboT=1.1; }
  shake*=Math.pow(.03,dt); flash=Math.max(0,flash-dt*2.4);
  hitT=Math.max(0,hitT-dt); tipT=Math.max(0,tipT-dt);
  if(bossWarn>0) bossWarn-=dt;
  if(P.hp<35 && (alarmT-=dt)<=0){ AUDIO.alarm(); alarmT = P.hp<18?.4:.8; }
  if(P.hp<=0) gameOver();
}

function nearestAhead(m){
  let best=null,bd=1e9; const list=boss?enemies.concat([boss]):enemies;
  for(const e of list){ if(e.z<m.z+100) continue;
    const d=Math.hypot(e.x-m.x,e.y-m.y)+(e.z-m.z)*.3; if(d<bd){bd=d;best=e;} }
  return best;
}
function volley(b){
  const n = b.phase===1?8 : b.phase===2?11 : 15;
  const guns = ATT.bossGuns, V=2100, t=b.z/V;
  if(b.phase>=2 && Math.random()<.55) for(let i=0;i<3;i++) spawnDrone();
  for(let i=0;i<n;i++){
    const a=(i/(n-1)-.5), g=guns[i%guns.length];
    const gx=b.x+g[0], gy=b.y+g[1];
    let vx,vy;
    if(b.phase===3){ vx=a*980; vy=Math.sin(b.t*2.2+i)*230+(P.y-gy)/t*.35; }
    else if(b.phase===2){ vx=(P.x-gx)/t*.8+a*320; vy=(P.y-gy)/t*.8+a*110; }
    else { vx=a*760; vy=(P.y-gy)/t*.45; }
    foes.push({x:gx,y:gy,z:b.z,vx,vy,vz:-V,dmg:13,c:COL.purple,r:30});
  }
  AUDIO.thud();
}
function hitScan(s,dmg,big){
  const list = boss? enemies.concat([boss]) : enemies;
  /* test the whole span the shot swept this frame, or it tunnels through
     fast closers whenever a frame runs long */
  const dz=s.z-s.pz, mid=(s.z+s.pz)*.5, half=Math.abs(dz)*.5;
  for(const e of list){
    if(Math.abs(e.z-mid) > half+e.rz) continue;
    /* walk the shot back to the target's depth before testing laterally —
       using the end-of-frame x/y throws the aim off by a whole frame of drift */
    const f = dz? clamp((e.z-s.pz)/dz,0,1) : 1;
    const hx = s.px+(s.x-s.px)*f, hy = s.py+(s.y-s.py)*f;
    if(Math.hypot(e.x-hx,e.y-hy) > e.r+(big?46:40)) continue;
    damage(e,dmg,hx,hy,e.z,big); return true;
  }
  return false;
}
function damage(e,dmg,x,y,z,big){
  e.hp-=dmg;
  burst(x,y,z, e===boss?COL.purple:COL.cyan, big?26:6, big?1.0:.34);
  AUDIO.boom(big?.85:.26);
  if(e.hp>0){ e.hit=.12; return; }
  e.dead=true; kills++;
  if(e===boss){
    burst(e.x,e.y,e.z,COL.purple,110,2.4); AUDIO.boom(2);
    const pts=5000*combo; score+=pts; pop(e.x,e.y,e.z,'+'+pts,COL.purple);
    boss=null; combo=Math.min(9,combo+2); comboT=4;
    for(let i=0;i<3;i++) spawnCrate();
  } else {
    const i=enemies.indexOf(e); if(i>=0) enemies.splice(i,1);
    burst(e.x,e.y,e.z,e.c, e.k==='cruiser'?40:20, e.k==='cruiser'?1.15:.6);
    AUDIO.boom(e.k==='cruiser'?1:.55);
    const pts=(e.k==='cruiser'?250:100)*combo; score+=pts;
    pop(e.x,e.y,e.z,'+'+pts,e.c);
    combo=Math.min(9,combo+1); comboT=2.6;
    if(Math.random()<.07) spawnCrate();
  }
}
function hurt(dmg,src){
  if(P.inv>0) return;
  if(src){ burst(src.x,src.y,src.z,COL.red,28,1.1); const i=enemies.indexOf(src); if(i>=0) enemies.splice(i,1); }
  if(P.shield>0){ const a=Math.min(P.shield,dmg); P.shield-=a; dmg-=a; }
  P.hp-=dmg; combo=1; P.inv=.55; hitT=.42;
  shake=Math.min(34,shake+16); flash=Math.min(.55,flash+.28); flashC=COL.red;
  AUDIO.thud();
}
function take(kind){
  AUDIO.pickup();
  if(kind==='shield'){ P.shield=Math.min(100,P.shield+55); P.hp=Math.min(100,P.hp+22); pop(P.x,P.y,320,'SHIELD',COL.green); }
  if(kind==='rapid'){ P.weapon='rapid'; P.wepT=13; pop(P.x,P.y,320,'RAPID FIRE',COL.cyan); }
  if(kind==='spread'){ P.weapon='spread'; P.wepT=13; pop(P.x,P.y,320,'SPREAD',COL.mag); }
  flash=Math.min(.4,flash+.18); flashC=COL.green;
}

/* ------------------------------------------------------------------ render */
const FOVY = 62*Math.PI/180;
const proj=M4.create(), view=M4.create(), vp=M4.create(), mv=M4.create(), model=M4.create();
let horizonY=.5, sunX=.5;

function setCamera(){
  const sh = shake;
  const jx = sh? rnd(-sh,sh)*.6:0, jy = sh? rnd(-sh,sh)*.6:0;
  const ex=P.x*.30+jx, ey=P.y*.30+CAM_UP+jy, ez=-CAM_BACK;
  const tx=P.x*.46, ty=P.y*.46+46, tz=900;
  const cr=P.roll*.16;
  M4.persp(proj,FOVY,W/H,12,7000);
  M4.lookAt(view, ex,ey,ez, tx,ty,tz, Math.sin(cr),Math.cos(cr),0);
  M4.mul(vp,proj,view);
  camP=[ex,ey,ez];
  camR=[view[0],view[4],view[8]];
  camU=[view[1],view[5],view[9]];
  const h=toScreen(tx, ty+(ty-ey)*40, tz+ (tz-ez)*40);
  horizonY = 1 - clamp(h.y/H,-.5,1.5);
  sunX = clamp(.31 - (P.x*.30)*0.00022, .08, .92);
}
function toScreen(x,y,z){
  const w = vp[3]*x+vp[7]*y+vp[11]*z+vp[15];
  const cx0 = vp[0]*x+vp[4]*y+vp[8]*z+vp[12];
  const cy0 = vp[1]*x+vp[5]*y+vp[9]*z+vp[13];
  if(w<=0.0001) return {x:0,y:0,w:1,vis:false};
  return {x:(cx0/w*.5+.5)*W, y:(1-(cy0/w*.5+.5))*H, w, vis:true};
}

function litBegin(){
  gl.useProgram(Plit.p); attribs(3);
  gl.uniform3f(Plit.u.uCam, camP[0],camP[1],camP[2]);
  gl.uniform3f(Plit.u.uLightDir, -0.35, 0.72, -0.60);
  gl.uniform3f(Plit.u.uFogColor, 0.13*(1+bossFx), 0.03, 0.20);
  gl.uniform1f(Plit.u.uFogNear, FOG_NEAR);
  gl.uniform1f(Plit.u.uFogFar, FOG_FAR);
}
function litDraw(m, mat, tint, alpha){
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

function xform(mat, p, out){
  out[0]=mat[0]*p[0]+mat[4]*p[1]+mat[8]*p[2]+mat[12];
  out[1]=mat[1]*p[0]+mat[5]*p[1]+mat[9]*p[2]+mat[13];
  out[2]=mat[2]*p[0]+mat[6]*p[1]+mat[10]*p[2]+mat[14];
  return out;
}
const _p3=[0,0,0];

function render(){
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
  gl.uniform1f(Psky.u.uTime, T);
  gl.uniform1f(Psky.u.uBoss, bossFx);
  gl.drawArrays(gl.TRIANGLES,0,3);

  /* meshes */
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
  litBegin();

  const flick = P.inv>0 && Math.floor(T*24)%2===0;
  if(!flick){
    let roll=P.roll;
    if(P.rollT>0) roll += P.rollDir*(1-P.rollT/.55)*Math.PI*2;
    compose(model, P.x,P.y,0, P.pitch, P.yaw, roll, 1);
    litDraw(MESH.jet, model, hitT>0?[hitT*1.6,0,0]:null, 1);
  }
  for(const e of enemies){
    compose(model, e.x,e.y,e.z, 0, e.yaw, e.roll, 1);
    litDraw(e.k==='drone'?MESH.drone:MESH.cruiser, model, e.hit>0?[.9,.9,.9]:null, 1);
    if(e.hit>0) e.hit-=0.02;
  }
  if(boss){
    compose(model, boss.x,boss.y,boss.z, 0, boss.yaw, boss.roll, 1);
    const ph=boss.phase===3?[.45,0,0]:boss.phase===2?[.16,0,.16]:null;
    litDraw(MESH.mothership, model, ph, 1);
  }
  for(const k of crates){
    compose(model, k.x,k.y,k.z, k.spin*.7, k.spin, 0, 1);
    const c = k.kind==='shield'?COL.green : k.kind==='rapid'?COL.cyan : COL.mag;
    litDraw(MESH.crate, model, [c[0]*.55,c[1]*.55,c[2]*.55], 1);
  }

  /* additive */
  sprN=0;
  buildFX();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  gl.useProgram(Pspr.p); attribs(4);
  gl.uniform1f(Pspr.u.uFogNear, FOG_NEAR);
  gl.uniform1f(Pspr.u.uFogFar, FOG_FAR);

  // grid (scrolling, drawn as lines)
  M4.ident(_e); _e[14] = -(dist % GRID_STEP);
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
function sprPointers(){
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,40,0);
  gl.vertexAttribPointer(1,2,gl.FLOAT,false,40,12);
  gl.vertexAttribPointer(2,4,gl.FLOAT,false,40,20);
  gl.vertexAttribPointer(3,1,gl.FLOAT,false,40,36);
}

function buildFX(){
  for(const s of stars){
    if(speed>1.4) beam(s.x,s.y,s.z, s.x,s.y,s.z+520, 2.6, COL.white, .55);
    else sprite(s.x,s.y,s.z, 4.5, COL.white, .7);
  }
  // engine flames
  let roll=P.roll; if(P.rollT>0) roll += P.rollDir*(1-P.rollT/.55)*Math.PI*2;
  compose(model, P.x,P.y,0, P.pitch, P.yaw, roll, 1);
  const th=.55+P.thr*.85;
  for(const nz of ATT.jetNozzles){
    xform(model,nz,_p3);
    const bx=_p3[0],by=_p3[1],bz=_p3[2];
    xform(model,[nz[0],nz[1],nz[2]-72*th],_p3);
    beam(bx,by,bz,_p3[0],_p3[1],_p3[2], 4.5+2*th, COL.cyan, .55+th*.3);
    sprite(bx,by,bz, 7+3.5*th, COL.white, .5);
  }
  if(P.muzzle>0) for(const mz of ATT.jetMuzzles){
    xform(model,mz,_p3);
    sprite(_p3[0],_p3[1],_p3[2], 9, COL.cyan, 1.0);
  }
  for(const s of shots){
    beam(s.x,s.y,s.z, s.x-s.vx*.028, s.y-s.vy*.028, s.z-s.vz*.028, 4.5, COL.cyan, 1.35);
    sprite(s.x,s.y,s.z, 12, COL.white, .95);
  }
  for(const m of rockets){
    beam(m.x,m.y,m.z, m.x,m.y,m.z-90, 6, COL.amber, 1.2);
    sprite(m.x,m.y,m.z, 15, COL.white, 1);
  }
  for(const s of foes){
    sprite(s.x,s.y,s.z, s.r, s.c, 1.25);
    sprite(s.x,s.y,s.z, s.r*.45, COL.white, 1.1);
  }
  for(const p of parts){
    const a=clamp(p.life/p.max,0,1);
    sprite(p.x,p.y,p.z, p.size*(.5+a), p.c, a*1.3);
  }
  for(const e of enemies){
    if(e.k==='drone'){ const c=ATT.droneCore;
      sprite(e.x+c[0],e.y+c[1],e.z+c[2], 12+Math.sin(T*9+e.ph)*3, COL.red, 1.1);
    } else for(const g of ATT.cruiserEngines)
      sprite(e.x+g[0],e.y+g[1],e.z+g[2], 11, COL.red, .95);
  }
  if(boss){
    const c=ATT.bossCore, pl=.75+.25*Math.sin(boss.t*5);
    sprite(boss.x+c[0],boss.y+c[1],boss.z+c[2], 120*pl, boss.phase===3?COL.red:COL.green, 1.1);
    sprite(boss.x+c[0],boss.y+c[1],boss.z+c[2], 46*pl, COL.white, 1.2);
    for(const g of ATT.bossGuns) sprite(boss.x+g[0],boss.y+g[1],boss.z+g[2], 16, COL.mag, .9);
  }
  for(const k of crates){
    const c = k.kind==='shield'?COL.green : k.kind==='rapid'?COL.cyan : COL.mag;
    sprite(k.x,k.y,k.z, 30+Math.sin(T*6)*5, c, .8);
  }
}

/* ------------------------------------------------------------------ hud */
function bar(x,y,w,h,v,c){
  h2d.fillStyle='rgba(255,255,255,.10)'; h2d.fillRect(x,y,w,h);
  h2d.shadowColor=c; h2d.shadowBlur=10; h2d.fillStyle=c;
  h2d.fillRect(x,y,w*clamp(v,0,1),h); h2d.shadowBlur=0;
}
function drawHUD(){
  h2d.setTransform(DPR,0,0,DPR,0,0);
  h2d.clearRect(0,0,W,H);
  if(!gameOn) return;
  const m=28, bw=Math.min(300,W*.24), by=H-m;

  // reticles
  const t=lockOn();
  const list=boss?enemies.concat([boss]):enemies;
  for(const e of list){
    if(e.z<260) continue;
    const p=toScreen(e.x,e.y,e.z); if(!p.vis) continue;
    if(p.x<-80||p.x>W+80||p.y<-80||p.y>H+80) continue;
    const r=clamp(e.r*1.5/p.w*(H/(2*Math.tan(FOVY/2)))*1.0, 14, 260);
    const on=(e===t);
    h2d.globalAlpha=on?.95:.22;
    h2d.strokeStyle=on?css(COL.red):css(COL.cyan);
    h2d.lineWidth=on?2:1;
    if(on){ h2d.shadowColor=css(COL.red); h2d.shadowBlur=14; }
    const c=r*.4;
    h2d.beginPath();
    h2d.moveTo(p.x-r,p.y-r+c); h2d.lineTo(p.x-r,p.y-r); h2d.lineTo(p.x-r+c,p.y-r);
    h2d.moveTo(p.x+r-c,p.y-r); h2d.lineTo(p.x+r,p.y-r); h2d.lineTo(p.x+r,p.y-r+c);
    h2d.moveTo(p.x+r,p.y+r-c); h2d.lineTo(p.x+r,p.y+r); h2d.lineTo(p.x+r-c,p.y+r);
    h2d.moveTo(p.x-r+c,p.y+r); h2d.lineTo(p.x-r,p.y+r); h2d.lineTo(p.x-r,p.y+r-c);
    h2d.stroke(); h2d.shadowBlur=0;
    if(on){ h2d.fillStyle=css(COL.red); h2d.font='11px "Courier New",monospace';
      h2d.textAlign='center'; h2d.fillText('LOCK',p.x,p.y-r-8); }
    h2d.globalAlpha=1;
  }
  // score popups
  for(const f of pops){
    const p=toScreen(f.x,f.y,f.z); if(!p.vis) continue;
    h2d.globalAlpha=clamp(f.life/.85,0,1);
    h2d.fillStyle=css(f.c); h2d.textAlign='center';
    h2d.font='bold '+clamp(2600/p.w,11,34)+'px "Courier New",monospace';
    h2d.shadowColor=css(f.c); h2d.shadowBlur=12;
    h2d.fillText(f.txt,p.x,p.y); h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  // crosshair
  const mx=mouse.has?mouse.x:W/2, my=mouse.has?mouse.y:H/2;
  h2d.strokeStyle=css(COL.cyan); h2d.lineWidth=1.6; h2d.globalAlpha=.9;
  h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=10;
  h2d.beginPath();
  h2d.moveTo(mx-22,my); h2d.lineTo(mx-8,my); h2d.moveTo(mx+8,my); h2d.lineTo(mx+22,my);
  h2d.moveTo(mx,my-22); h2d.lineTo(mx,my-8); h2d.moveTo(mx,my+8); h2d.lineTo(mx,my+22);
  h2d.stroke(); h2d.beginPath(); h2d.arc(mx,my,3,0,6.3); h2d.stroke();
  h2d.shadowBlur=0; h2d.globalAlpha=1;

  // bars
  h2d.textAlign='left'; h2d.font='12px "Courier New",monospace';
  h2d.fillStyle='#7fa8bd'; h2d.fillText('HULL', m, by-30);
  bar(m, by-24, bw, 9, P.hp/100, P.hp<35?css(COL.red):css(COL.green));
  bar(m, by-11, bw, 5, P.shield/100, css(COL.cyan));
  h2d.textAlign='right';
  h2d.fillStyle='#7fa8bd'; h2d.fillText('BOOST', W-m, by-30);
  bar(W-m-bw, by-24, bw, 9, P.boost/100, css(COL.amber));

  // score / distance
  h2d.textAlign='left'; h2d.font='bold 30px "Courier New",monospace';
  h2d.fillStyle='#eaffff'; h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=14;
  h2d.fillText(String(score).padStart(6,'0'), m, m+24); h2d.shadowBlur=0;
  if(combo>1){ h2d.font='bold 17px "Courier New",monospace'; h2d.fillStyle=css(COL.mag);
    h2d.shadowColor=css(COL.mag); h2d.shadowBlur=12; h2d.fillText('x'+combo,m,m+48); h2d.shadowBlur=0; }
  h2d.textAlign='right'; h2d.font='15px "Courier New",monospace'; h2d.fillStyle='#8fc9e0';
  h2d.fillText((dist/1000).toFixed(1)+' KM', W-m, m+16);
  if(P.weapon!=='std'){
    h2d.fillStyle=P.weapon==='rapid'?css(COL.cyan):css(COL.mag);
    h2d.fillText(P.weapon.toUpperCase()+'  '+P.wepT.toFixed(1)+'s', W-m, m+38);
  }
  // boss bar
  if(boss){
    const w=Math.min(560,W*.55), x=W/2-w/2, y=m+2;
    h2d.textAlign='center'; h2d.font='12px "Courier New",monospace';
    h2d.fillStyle=css(COL.purple); h2d.fillText('MOTHERSHIP :: PHASE '+boss.phase, W/2, y-4);
    bar(x,y,w,12, boss.hp/boss.max, boss.phase===3?css(COL.red):css(COL.purple));
  }
  if(bossWarn>0 && Math.floor(T*8)%2){
    h2d.globalAlpha=clamp(bossWarn/2.4,0,1); h2d.textAlign='center'; h2d.fillStyle=css(COL.red);
    h2d.shadowColor=css(COL.red); h2d.shadowBlur=24;
    h2d.font='bold '+Math.min(60,W*.06)+'px "Courier New",monospace';
    h2d.fillText('WARNING', W/2, H*.28);
    h2d.font='bold '+Math.min(24,W*.026)+'px "Courier New",monospace';
    h2d.fillText('MOTHERSHIP INBOUND', W/2, H*.28+34);
    h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  if(tipT>0){
    h2d.globalAlpha=Math.min(1,tipT/1.2); h2d.textAlign='center';
    h2d.font='12px "Courier New",monospace'; h2d.fillStyle='#8fc9e0';
    h2d.fillText('WASD FLY  ·  CLICK GUNS  ·  SPACE MISSILE  ·  SHIFT BOOST  ·  AA/DD ROLL', W/2, H*.88);
    h2d.globalAlpha=1;
  }
  // damage / pickup flash
  if(flash>.002){ h2d.globalAlpha=flash; h2d.fillStyle=css(flashC); h2d.fillRect(0,0,W,H); h2d.globalAlpha=1; }
  if(hitT>0){ h2d.globalAlpha=hitT*.9; h2d.strokeStyle=css(COL.red); h2d.lineWidth=26;
    h2d.shadowColor=css(COL.red); h2d.shadowBlur=50; h2d.strokeRect(0,0,W,H);
    h2d.shadowBlur=0; h2d.globalAlpha=1; }
  if(hintT>0){
    hintT-=1/60;
    const a=Math.min(1,hintT)*.9;
    h2d.globalAlpha=a; h2d.textAlign='center';
    h2d.font='600 '+Math.round(H*.021)+'px "Courier New",monospace';
    h2d.fillStyle=css(COL.cyan); h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=14;
    h2d.fillText('W CLIMB   S DIVE   A/D BANK   CLICK GUNS   SPACE MISSILE   SHIFT BOOST   AA/DD ROLL',
      W/2, H*.955);
    h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  if(P.hp<35){ h2d.globalAlpha=.08+.13*Math.abs(Math.sin(T*6));
    h2d.strokeStyle=css(COL.red); h2d.lineWidth=44; h2d.strokeRect(0,0,W,H); h2d.globalAlpha=1; }
}

/* ------------------------------------------------------------------ loop */
let last=0;
function frame(t){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(t-last)/1000||.016); last=t;
  if(gameOn) update(dt); else { T+=dt; shake*=.9; flash=Math.max(0,flash-dt*2); }
  render(); drawHUD();
}

/* ------------------------------------------------------------------ flow */
const introEl=document.getElementById('intro'), overEl=document.getElementById('over');
const logEl=document.getElementById('log'), launchBtn=document.getElementById('launch');
const LINES=[
  '&gt; INCOMING TRANSMISSION &mdash; SIGNAL DEGRADED',
  '&gt; ORBITAL GRID DOWN. HIVE FLEET IN THE ATMOSPHERE.',
  '&gt; YOU ARE THE ONLY BIRD IN THE AIR. GO.'
];
let li=0, menuShown=false;
function showMenu(){
  introEl.classList.remove('hidden');
  if(menuShown){ launchBtn.classList.add('on'); return; }
  menuShown=true;
  (function pushLine(){
    if(li>=LINES.length){ launchBtn.classList.add('on'); return; }
    const d=document.createElement('div'); d.innerHTML=LINES[li++]; logEl.appendChild(d);
    setTimeout(pushLine,330);
  })();
  setTimeout(()=>launchBtn.classList.add('on'), 900);
}

function start(){
  AUDIO.init(); reset();
  introEl.classList.add('hidden'); overEl.classList.add('hidden');
  gameOn=true; hintT=5.5; last=performance.now();
}
function gameOver(){
  gameOn=false;
  burst(P.x,P.y,0,COL.red,90,2.2); AUDIO.boom(1.8); AUDIO.setIntensity(.15);
  document.getElementById('fScore').textContent=score;
  document.getElementById('fDist').textContent=(dist/1000).toFixed(1);
  document.getElementById('fKills').textContent=kills;
  setTimeout(()=>overEl.classList.remove('hidden'), 950);
}
launchBtn.addEventListener('click', start);
document.getElementById('again').addEventListener('click', start);
addEventListener('keydown', e=>{
  const menuUp = !introEl.classList.contains('hidden') || !overEl.classList.contains('hidden');
  if((e.key==='Enter'||e.key===' ') && !gameOn && menuUp){ e.preventDefault(); start(); }
});

reset();
requestAnimationFrame(frame);

let cineOk=false;
if(!window.SKIP_CINE && window.CINE){
  try{ cineOk = CINE.play({ onSkip: showMenu, onEnd: start }); }catch(e){ cineOk=false; }
}
if(!cineOk) showMenu();
