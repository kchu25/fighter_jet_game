/* ===== game/combat.js — weapons, enemy spawning, hit-testing, damage/violence ===== */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp, lerp } from '../core/utils.js';
import { S, COL, EASE_LEN, SPAWN_Z, FOVY } from './state.js';
import { ATT, W, H } from '../render/gl.js';
import { camP, toScreen } from '../render/scene-draw.js';
import { mouse } from './input.js';
import { mk, shock, shard, later, sparks, burst, pop } from './fx.js';

export function aimAt(depth){
  // world point under the crosshair at a given forward depth
  const sx = mouse.has? mouse.x : W/2, sy = mouse.has? mouse.y : H/2;
  const ndx = (sx/W)*2-1, ndy = 1-(sy/H)*2;
  const tanY = Math.tan(FOVY/2), tanX = tanY*(W/H);
  const d = depth - camP[2];
  /* the camera's right vector is -X here, so screen-right is world -X */
  return { x: camP[0] - ndx*tanX*d, y: camP[1] + ndy*tanY*d };
}
export function fireGuns(){
  const aim = aimAt(1500);
  const muz = S.P.weapon==='spread' ? [-86,-44,0,44,86] : ATT.jetMuzzles.map(m=>m[0]);
  const V=3400;
  for(let i=0;i<muz.length;i++){
    const ox=muz[i], mx=S.P.x+ox, my=S.P.y+2, t=1500/V;
    let vx=(aim.x-mx)/t, vy=(aim.y-my)/t;
    if(S.P.weapon==='spread') vx += ox*2.6;
    S.shots.push({x:mx,y:my,z:26,vx,vy,vz:V,pz:26,dmg:S.P.weapon==='rapid'?1.1:2});
  }
  S.P.muzzle=.055;
  AUDIO.laser(); S.P.thr=Math.max(S.P.thr,.6);
}
export function fireMissiles(){
  const t = lockOn();
  for(const s of [-1,1])
    S.rockets.push({x:S.P.x+s*24,y:S.P.y-6,z:10,vx:s*300,vy:-60,vz:1500,t,life:3.2,pz:10});
  AUDIO.missile();
}
export function lockOn(){
  let best=null, bd=1e9;
  const list = S.boss? S.enemies.concat([S.boss]) : S.enemies;
  for(const e of list){
    if(e.z<180) continue;
    const p = toScreen(e.x,e.y,e.z); if(!p.vis) continue;
    const d = Math.hypot(p.x-(mouse.has?mouse.x:W/2), p.y-(mouse.has?mouse.y:H/2));
    if(d<320 && d<bd){ bd=d; best=e; }
  }
  return best;
}

/* ------------------------------------------------------------------ spawning */
/* both spawners take an optional overrides bag so the director can place
   formation members ({x,y,ph,spdMul,ampMul,cdMul,c}); bare calls (volley(),
   old callers) behave exactly as before */
export function spawnDrone(o={}){
  /* early drones fly nearly straight — a hard jink is unleadable at a 0.4s
     bullet flight time, so the evasion ramps in with distance */
  const ev=.55+.45*Math.min(1,S.ddist/30000);
  /* on the first-run ramp the early drones close slower and jink less, so a
     new pilot gets targets that hold still long enough to be learned on */
  const soft = S.easeT>0 ? 1-S.easeT/EASE_LEN : 1;
  /* waveN speed bonus is clamped — waves are endless, drone speed must not be */
  S.enemies.push({k:'drone',x:o.x??rnd(-250,250),y:o.y??rnd(-140,150),z:SPAWN_Z,hp:2,r:32,rz:46,
    ph:o.ph??rnd(0,6.28),amp:rnd(90,240)*ev*lerp(.45,1,soft)*(o.ampMul||1),
    spd:(rnd(1180,1480)+Math.min(25,S.waveN)*12)*(.78+.22*ev)*lerp(.66,1,soft)*(o.spdMul||1),
    c:o.c||COL.mag,roll:0,yaw:0});
}
export function spawnCruiser(o={}){
  const hp = 9+S.waveN*.65;
  S.enemies.push({k:'cruiser',x:o.x??rnd(-240,240),y:o.y??rnd(-120,130),z:SPAWN_Z,hp,max:hp,r:64,rz:64,
    ph:o.ph??rnd(0,6.28),amp:rnd(40,110)*(o.ampMul||1),spd:rnd(640,780)*(o.spdMul||1),
    c:o.c||COL.amber,roll:0,yaw:0,
    cd:rnd(.4,1.1)*(o.cdMul||1)+(S.easeT>0?1.5:0)});
}
export function spawnCrate(){
  S.crates.push({x:rnd(-220,220),y:rnd(-120,130),z:SPAWN_Z,
    kind:['shield','rapid','spread'][(Math.random()*3)|0],spin:0});
}
export function spawnBoss(){
  /* keyed off S.bossN (bosses defeated this run), not S.waveN (trash-mob waves,
     never resets) — see the S.bossN declaration above for why. 440 base is
     ~20-30s of sustained accurate fire for a first-time S.boss encounter;
     +150/S.boss keeps later encounters escalating without runaway growth. */
  const hp = 440+S.bossN*150;
  S.boss={k:'boss',x:0,y:40,z:SPAWN_Z+600,hp,max:hp,r:210,rz:150,c:COL.purple,
        phase:1,t:0,cd:1.2,dir:1,here:false,yaw:0,roll:0,list:0,hit:0,smk:0};
  S.bossWarn=2.4; AUDIO.siren();
}

export function nearestAhead(m){
  let best=null,bd=1e9; const list=S.boss?S.enemies.concat([S.boss]):S.enemies;
  for(const e of list){ if(e.z<m.z+100) continue;
    const d=Math.hypot(e.x-m.x,e.y-m.y)+(e.z-m.z)*.3; if(d<bd){bd=d;best=e;} }
  return best;
}
export function volley(b){
  const n = b.phase===1?8 : b.phase===2?11 : 15;
  const guns = ATT.bossGuns, V=2100, t=b.z/V;
  if(b.phase>=2 && Math.random()<.55) for(let i=0;i<3;i++) spawnDrone();
  for(let i=0;i<n;i++){
    const a=(i/(n-1)-.5), g=guns[i%guns.length];
    const gx=b.x+g[0], gy=b.y+g[1];
    let vx,vy;
    if(b.phase===3){ vx=a*980; vy=Math.sin(b.t*2.2+i)*230+(S.P.y-gy)/t*.35; }
    else if(b.phase===2){ vx=(S.P.x-gx)/t*.8+a*320; vy=(S.P.y-gy)/t*.8+a*110; }
    else { vx=a*760; vy=(S.P.y-gy)/t*.45; }
    S.foes.push({x:gx,y:gy,z:b.z,vx,vy,vz:-V,dmg:11,c:COL.purple,r:30});
  }
  AUDIO.thud();
}
export function hitScan(s,dmg,big){
  const list = S.boss? S.enemies.concat([S.boss]) : S.enemies;
  /* test the whole span the shot swept this frame, or it tunnels through
     fast closers whenever a frame runs long */
  const dz=s.z-s.pz, mid=(s.z+s.pz)*.5, half=Math.abs(dz)*.5;
  for(const e of list){
    if(Math.abs(e.z-mid) > half+e.rz) continue;
    /* walk the shot back to the target's depth before testing laterally —
       using the end-of-frame x/y throws the aim off by a whole frame of drift */
    const f = dz? clamp((e.z-s.pz)/dz,0,1) : 1;
    const hx = s.px+(s.x-s.px)*f, hy = s.py+(s.y-s.py)*f;
    if(Math.hypot(e.x-hx,e.y-hy) > e.r+(big?40:24)) continue;
    damage(e,dmg,hx,hy,e.z,big,s); return true;
  }
  return false;
}
/* --------------------------------------------------------------- violence */
export function impact(e,dmg,x,y,z,big,s){
  const heavy = e===S.boss || e.k==='cruiser';
  const pw = clamp(dmg*.4,.3,1.4);
  let dx=0,dy=0,dz=-1;
  if(s){ const l=Math.hypot(s.vx,s.vy,s.vz)||1; dx=-s.vx/l; dy=-s.vy/l; dz=-s.vz/l; }
  /* spray back down the shot line so the spark cone opens toward the camera */
  sparks(x,y,z, big?30:Math.min(20,9+(dmg*3|0)), (big?2100:1500)*(.65+pw*.45),
    big?1.5:1.25, e===S.boss?COL.purple:COL.cyan, dx,dy,dz, 1);
  shock(x,y,z, heavy?16:9, (heavy?170:100)*(.55+pw*.6), big?.34:.25,
    heavy?9:6.5, COL.white, big?1.5:1.35);
  S.parts.push(mk(x,y,z, dx*120,dy*120,dz*120, COL.white, big?.14:.10,
    (big?42:26)*(.8+pw*.4), 0, .2, big?1.9:1.8));
  S.parts.push(mk(x,y,z, 0,0,0, e.c, big?.20:.15, (big?30:18)*(.8+pw*.4), 0, 0, 2.4));
  if(heavy) for(let i=0;i<(big?2:1);i++)
    if(Math.random()<(big?.7:.35))
      shard(x,y,z, rnd(-300,300)+dx*320, rnd(20,320), rnd(-300,300)+dz*320,
        e===S.boss?rnd(.45,.8):rnd(.26,.46), e.c, rnd(.24,.44));
  e.hit = Math.min(1, (e.hit||0) + (big?1:.62));
  S.shake = Math.min(30, S.shake + (big?9:2.6)*(.6+pw));
  /* deliberately no fullscreen S.flash on ordinary hits — it washes the frame out */
  if(big){ S.flash=Math.min(.15,S.flash+.055); S.flashC=e.c; }
  AUDIO.boom(big?.8:.24);
}
export function explode(e,x,y,z){
  const k = e===S.boss?'boss' : e.k;
  const c = e.c, R = e.r;
  if(k==='boss'){
    shock(x,y,z, 40,1600, .95, 26, COL.white, 1);
    shock(x,y,z, 20, 820, .55, 34, COL.purple, 1);
    S.parts.push(mk(x,y,z, 0,0,0, COL.white, .26, 190, 0, 0, 1.5));
    sparks(x,y,z, 70, 2600, 1.9, COL.purple, 0,0,0, 0);
    for(let i=0;i<15;i++)
      shard(x+rnd(-R,R), y+rnd(-70,70), z+rnd(-140,140),
        rnd(-1100,1100), rnd(-300,820), rnd(-1100,1100), rnd(.55,1.1), i&1?c:COL.mag, rnd(.45,.85));
    S.shake=38; S.flash=Math.min(.38,S.flash+.34); S.flashC=COL.white;
    AUDIO.boom(2);
    /* four staggered secondaries walking across the hull */
    for(let i=0;i<4;i++){
      const ox=rnd(-R*.9,R*.9), oy=rnd(-50,60), oz=rnd(-130,130);
      later(.12+i*.17, x+ox,y+oy,z+oz, (fx,fy,fz)=>{
        shock(fx,fy,fz, 24, 560, .5, 14, COL.white, .95);
        for(let j=0;j<6;j++)
          S.parts.push(mk(fx,fy,fz, rnd(-190,190),rnd(-120,190),rnd(-190,190),
            j&1?COL.amber:COL.red, rnd(.4,.75), rnd(66,112), 0, .3, 1.9));
        sparks(fx,fy,fz, 26, 1700, 1.4, COL.amber, 0,0,0, 0);
        for(let j=0;j<2;j++) shard(fx,fy,fz, rnd(-760,760),rnd(-160,640),rnd(-760,760), rnd(.4,.8), COL.purple, rnd(.4,.75));
        S.shake=Math.min(38,S.shake+15); S.flash=Math.min(.22,S.flash+.08); S.flashC=i&1?COL.amber:COL.purple;
        AUDIO.boom(1.5);
      });
    }
    return;
  }
  const big = k==='cruiser';
  shock(x,y,z, big?22:12, big?520:265, big?.5:.36, big?13:8, COL.white, 1.15);
  shock(x,y,z, big?12:7, big?320:160, big?.32:.24, big?18:12, c, 1.0);
  S.parts.push(mk(x,y,z, 0,0,0, COL.white, big?.19:.13, big?86:44, 0, 0, 1.5));
  for(let i=0;i<(big?7:4);i++)
    S.parts.push(mk(x+rnd(-R*.5,R*.5),y+rnd(-R*.3,R*.3),z+rnd(-R*.4,R*.4),
      rnd(-130,130),rnd(-70,150),rnd(-130,130),
      i&1?COL.amber:c, rnd(.3,.6)*(big?1.4:1), big?rnd(52,80):rnd(26,40), 0, .3, 1.8));
  sparks(x,y,z, big?46:28, big?2100:1500, big?1.35:1, c, 0,0,0, 0);
  for(let i=0;i<(big?7:3);i++)
    shard(x,y,z, rnd(-760,760),rnd(-200,600),rnd(-760,760),
      big?rnd(.42,.82):rnd(.22,.42), i%3?c:COL.white, rnd(.36,.66));
  S.shake=Math.min(34, S.shake+(big?22:11));
  S.flash=Math.min(.30, S.flash+(big?.19:.11)); S.flashC=c;
  AUDIO.boom(big?1.1:.6);
  if(big) later(.11,x,y,z,(fx,fy,fz)=>{
    shock(fx,fy,fz, 30, 380, .38, 11, COL.amber, .85);
    for(let i=0;i<5;i++)
      S.parts.push(mk(fx,fy,fz, rnd(-210,210),rnd(-90,210),rnd(-210,210),
        COL.amber, rnd(.35,.65), rnd(56,92), 0, .3, 1.8));
    sparks(fx,fy,fz, 18, 1500, 1.1, COL.amber, 0,0,0, 0);
    S.shake=Math.min(34,S.shake+9); AUDIO.boom(.8);
  });
}
export function damage(e,dmg,x,y,z,big,s){
  e.hp-=dmg;
  impact(e,dmg,x,y,z,big,s);
  if(e.hp>0) return;
  e.dead=true; S.kills++;
  explode(e,e.x,e.y,e.z);
  if(e===S.boss){
    const pts=5000*S.combo; S.score+=pts; pop(e.x,e.y,e.z,'+'+pts,COL.purple);
    S.boss=null; S.bossN++; S.combo=Math.min(9,S.combo+2); S.comboT=4;
    for(let i=0;i<3;i++) spawnCrate();
  } else {
    const i=S.enemies.indexOf(e); if(i>=0) S.enemies.splice(i,1);
    const pts=(e.k==='cruiser'?250:100)*S.combo; S.score+=pts;
    pop(e.x,e.y,e.z,'+'+pts,e.c);
    S.combo=Math.min(9,S.combo+1); S.comboT=2.6;
    if(Math.random()<.07) spawnCrate();
  }
}
export function hurt(dmg,src,s){
  if(S.P.inv>0) return;
  if(src){ explode(src,src.x,src.y,src.z); const i=S.enemies.indexOf(src); if(i>=0) S.enemies.splice(i,1); }
  const shielded = S.P.shield>0;
  if(S.P.shield>0){ const a=Math.min(S.P.shield,dmg); S.P.shield-=a; dmg-=a; }
  S.P.hp-=dmg; S.combo=1; S.P.inv=.65; S.hitT=.42;
  S.shake=Math.min(34,S.shake+16); S.flash=Math.min(.55,S.flash+.28); S.flashC=COL.red;
  AUDIO.thud();
  /* strike the hull where the round came in, so the hit reads on the aircraft
     and not only as a red wash over the whole screen */
  const src2 = s||src;
  let ox = src2? clamp(src2.x-S.P.x,-26,26) : rnd(-22,22);
  let oy = src2? clamp(src2.y-S.P.y,-12,12) : rnd(-8,10);
  const hx=S.P.x+ox, hy=S.P.y+oy, hz=6;
  const hc = shielded? COL.cyan : COL.amber;
  sparks(hx,hy,hz, 9, 300, .45, hc, 0,.25,-1, 1);
  shock(hx,hy,hz, 5, 30, .17, 2.4, shielded?COL.cyan:COL.white, .8);
  S.parts.push(mk(hx,hy,hz, 0,0,0, COL.white, .08, 12, 0, .2, 1.15));
  if(!shielded){
    /* torn skin and a burning scar that keeps smoking after the S.flash is gone */
    for(let i=0;i<2;i++)
      if(Math.random()<.7)
        shard(hx,hy,hz, rnd(-160,160),rnd(30,180),rnd(-300,-90), rnd(.13,.22), COL.cyan, rnd(.24,.44));
    S.P.burn = Math.min(2.2, (S.P.burn||0) + (dmg>=20?1.5:.95));
    S.P.burnX = ox; S.P.burnY = oy;
  }
}
export function take(kind){
  AUDIO.pickup();
  if(kind==='shield'){ S.P.shield=Math.min(100,S.P.shield+55); S.P.hp=Math.min(100,S.P.hp+22); pop(S.P.x,S.P.y,320,'SHIELD',COL.green); }
  if(kind==='rapid'){ S.P.weapon='rapid'; S.P.wepT=13; pop(S.P.x,S.P.y,320,'RAPID FIRE',COL.cyan); }
  if(kind==='spread'){ S.P.weapon='spread'; S.P.wepT=13; pop(S.P.x,S.P.y,320,'SPREAD',COL.mag); }
  S.flash=Math.min(.4,S.flash+.18); S.flashC=COL.green;
}
