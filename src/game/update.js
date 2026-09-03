/* ===== game/update.js — per-frame simulation: player, entities, projectiles ===== */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp, lerp } from '../core/utils.js';
import { S, COL, SPAWN_Z, DESPAWN_Z, BX, BY, FLOW, EASE_LEN, EASE_CALM } from './state.js';
import { ATT } from '../render/gl.js';
import { keys, mouse } from './input.js';
import { mk, sparks, shard, shock, later } from './fx.js';
import { fireGuns, fireMissiles, hitScan, nearestAhead, volley, hurt, take, explode,
         carrierLaunch, carrierVolley, dreadLance, dreadWall,
         sporeBarrage, levBirth, levLance,
         wardenPinwheel, wardenRing, hunterRake, hunterSpread, pushComms,
         batSpit, phanPincer, phanNova, reapCurtain, reapSpread,
         motherSweep, motherSpore, motherBirth, motherLance,
         arbMortar, arbBeamTick, golSweep, golBarrage,
         hedraLattice, hedraBurst, hedraShard } from './combat.js';
import { directorTick } from './director.js';
import { nukeTick } from './nuke.js';
import { gameOver } from '../main.js';

/* ------------------------------------------------------------------ allies
   Shared by the doomed 'fight' state and the surviving 'wing' state — the
   two must fly and shoot identically, so the movement/fire code lives once. */
function allyFly(a,dt){
  /* loose formation: slow weave around station, banking like the player */
  a.ph+=dt;
  const tx=S.P.x+a.stx+Math.cos(a.ph*.9)*26;
  const ty=a.sty+Math.sin(a.ph*1.3)*18;
  const nx=a.x+(tx-a.x)*Math.min(1,dt*2.2);
  const ny=a.y+(ty-a.y)*Math.min(1,dt*2.2);
  a.vx=(nx-a.x)/Math.max(dt,1e-4); a.vy=(ny-a.y)/Math.max(dt,1e-4);
  a.x=nx; a.y=ny;
  a.z += (a.stz-a.z)*Math.min(1,dt*1.6);
  a.roll = lerp(a.roll, clamp(-a.vx/620,-1.1,1.1), Math.min(1,dt*8));
  a.pitch= lerp(a.pitch, clamp(-a.vy/1500,-.35,.35), Math.min(1,dt*8));
  a.yaw  = lerp(a.yaw,  clamp(a.vx/2600,-.35,.35), Math.min(1,dt*7));
  a.thr=.75+.2*Math.sin(S.T*11+a.ph*5)+rnd(-.04,.04);
  if((a.fireT-=dt)<=0){
    /* real shots: they ride the S.shots loop and hitScan like the
       player's, at reduced damage — help a little, light up the sky */
    a.fireT=rnd(.5,.9);
    const tgt=nearestAhead(a), V=3400;
    let vx=0, vy=0;
    if(tgt){ const tt=Math.max(.05,(tgt.z-a.z)/V); vx=(tgt.x-a.x)/tt; vy=(tgt.y-a.y)/tt; }
    for(const o of [-16,16])
      S.shots.push({x:a.x+o,y:a.y+2,z:a.z+30,vx,vy,vz:V,pz:a.z+30,dmg:.8});
    S.parts.push(mk(a.x,a.y+2,a.z+36, rnd(-20,20),rnd(-20,20),160, COL.cyan, .08, 10));
  }
}
/* the moment an ally is hit: mayday call, then a staggered string of visible
   impacts ON the hull (closures track the ally, not a fixed world point) */
function allyDown(a){
  a.state='dying'; a.dieT=0; a.thr=.2;
  pushComms(a.cs,"MAYDAY MAYDAY — I'M HIT",1.0);
  AUDIO.mayday && AUDIO.mayday();
  for(const td of [0,.22,.45])
    later(td,0,0,0, ()=>{ if(a.state!=='dying') return;
      sparks(a.x+rnd(-14,14),a.y+rnd(-6,8),a.z, 10, 700, .9, COL.amber, 0,0,0, 0);
      shock(a.x,a.y,a.z, 6, 60, .3, 4, COL.amber, .8); });
}

export function update(dt){
  S.T+=dt;
  const boosting=(keys['Shift']||keys['shift']) && S.P.boost>1;
  S.speed = boosting? 2.2 : 1;
  S.P.boost = boosting ? Math.max(0,S.P.boost-32*dt) : Math.min(100,S.P.boost+16*dt);
  S.P.thr = Math.max(boosting?1:.35, S.P.thr-dt*2.2);
  S.flow = FLOW*S.speed;
  S.dist += S.flow*dt;
  AUDIO.setEngine(boosting?1:0, S.speed);

  /* on-ramp clock. It burns faster while the player is actually flying and
     scoring, so an aggressive pilot pulls the real game towards them instead
     of being held in a tutorial; a passive one gets the full 26s. */
  let easeP = 1;
  if(S.easeT>0){
    const busy = (mouse.fire?1:0) + ((keys['a']||keys['d']||keys['w']||keys['s'])?1:0);
    S.easeT = Math.max(0, S.easeT - dt*(1 + busy*.55 + Math.min(2.4, S.kills*.45)));
    easeP = S.easeT>0 ? 1-S.easeT/EASE_LEN : 1;
    if(S.easeT<=0){ S.tipMsg='WEAPONS FREE  ·  GOOD HUNTING'; S.tipT=2.4; }
    else if(S.easeStage===0 && easeP>=EASE_CALM){
      S.easeStage=1; S.tipMsg='CONTACT  ·  DRONES INBOUND'; S.tipT=2.4;
    }
  }
  /* difficulty distance. The quiet opening must not silently bank scaling the
     player never actually faced, so it advances slowly while the ramp runs. */
  S.ddist += S.flow*dt*(S.easeT>0 ? .28+.72*easeP : 1);

  /* player */
  const ax=(keys['a']?1:0)-(keys['d']?1:0);
  const ay=(keys['w']?1:0)-(keys['s']?1:0);
  S.P.vx += ax*4200*dt; S.P.vy += ay*3500*dt;
  const damp=Math.pow(.0012,dt); S.P.vx*=damp; S.P.vy*=damp;
  S.P.x=clamp(S.P.x+S.P.vx*dt,-BX,BX); S.P.y=clamp(S.P.y+S.P.vy*dt,-BY,BY);
  if(Math.abs(S.P.x)>=BX) S.P.vx*=.4;
  if(Math.abs(S.P.y)>=BY) S.P.vy*=.4;
  S.P.roll  = lerp(S.P.roll,  clamp(-S.P.vx/620,-1.1,1.1), Math.min(1,dt*8));
  S.P.pitch = lerp(S.P.pitch, clamp(-S.P.vy/1500,-.35,.35), Math.min(1,dt*8));
  S.P.yaw   = lerp(S.P.yaw,   clamp(S.P.vx/2600,-.35,.35), Math.min(1,dt*7));
  if(S.P.rollT>0) S.P.rollT-=dt;
  if(S.P.inv>0) S.P.inv-=dt;
  if(S.P.muzzle>0) S.P.muzzle-=dt;
  /* fire on the airframe: a hot flare right after the hit, then smoke that
     lingers while the jet is badly damaged */
  if(S.P.burn>0){
    S.P.burn-=dt;
    if(Math.random()<.45){
      const bx=S.P.x+S.P.burnX+rnd(-3,3), by=S.P.y+S.P.burnY+rnd(-2,2);
      S.parts.push(mk(bx,by,4, rnd(-20,20),rnd(20,60),-rnd(700,1100),
        Math.random()<.55?COL.amber:COL.red, rnd(.12,.2), rnd(4,7), 0, .1, .85));
    }
  }
  if(S.P.hp<45 && S.P.hp>0){
    const w=(45-S.P.hp)/45;
    if(Math.random()<.18+w*.28)
      S.parts.push(mk(S.P.x+rnd(-12,12),S.P.y+rnd(-4,6),-6, rnd(-20,20),rnd(20,60),-rnd(800,1300),
        Math.random()<w*.45?COL.amber:COL.smoke, rnd(.28,.5), rnd(6,11), 0, .06, 1.1));
  }
  if(S.P.wepT>0 && (S.P.wepT-=dt)<=0) S.P.weapon='std';

  S.P.fireCd-=dt; S.P.misCd-=dt;
  const rate = S.P.weapon==='rapid'?.055 : S.P.weapon==='spread'?.17 : .115;
  if(mouse.fire && S.P.fireCd<=0){ fireGuns(); S.P.fireCd=rate; }
  if((mouse.alt||keys[' ']) && S.P.misCd<=0){ fireMissiles(); S.P.misCd=.62; }

  /* S.stars */
  for(const s of S.stars){
    s.z -= S.flow*1.5*dt;
    if(s.z<-200){ s.z=SPAWN_Z+rnd(200,1400); s.x=rnd(-3000,3000); s.y=rnd(-900,1500); }
  }

  directorTick(dt, easeP);
  /* S.enemies */
  const drift = S.flow-FLOW;
  let swarmNear=false;   // any fly-swarm engulfing or close → buzz loop on
  for(let i=S.enemies.length-1;i>=0;i--){
    const e=S.enemies[i];
    e.z -= (e.spd+drift)*dt;
    if(e.k==='striker'){
      /* attack run: bank across toward the centre, fire one burst at ~1900,
         then break off hard to the side and climb out */
      if(!e.fired && e.z<1900){
        e.fired=true;
        const V=2200, t=e.z/V;
        for(let j=-1;j<=1;j++)
          S.foes.push({x:e.x,y:e.y,z:e.z,
            vx:(S.P.x-e.x)/t*.85+j*130, vy:(S.P.y-e.y)/t*.85+j*40,
            vz:-V,dmg:7,c:COL.green,r:24});
        AUDIO.strafe && AUDIO.strafe();
        e.vx=(e.x>=0?1:-1)*rnd(720,900); e.vy=rnd(90,150);
      }
      e.x+=e.vx*dt; e.y+=e.vy*dt;
      e.roll = lerp(e.roll, clamp(-e.vx/420,-1.3,1.3), Math.min(1,dt*7));
      e.yaw  = lerp(e.yaw,  clamp(e.vx/900,-.6,.6)+Math.PI, Math.min(1,dt*6));
      /* breaking off is the striker's normal exit — never a combo penalty */
      if(e.fired && Math.abs(e.x)>700){ S.enemies.splice(i,1); continue; }
    } else if(e.k==='mine'){
      /* tumbling proximity fuse: drifts weakly onto the player's line */
      e.vx = lerp(e.vx, clamp((S.P.x-e.x)*.9,-150,150), Math.min(1,dt*1.3));
      e.vy = lerp(e.vy, clamp((S.P.y-e.y)*.9,-120,120), Math.min(1,dt*1.3));
      e.x+=e.vx*dt; e.y+=e.vy*dt;
      e.roll+=dt*1.9; e.yaw+=dt*1.2; e.ph+=dt;
      if(e.z<900 && (e.beepT-=dt)<=0){
        e.beepT = e.z<450?.28:.55;
        AUDIO.mineArm && AUDIO.mineArm();
      }
      if(e.z<220 && Math.hypot(e.x-S.P.x,e.y-S.P.y)<110){
        hurt(16,null); explode(e,e.x,e.y,e.z); S.enemies.splice(i,1); continue;
      }
    } else if(e.k==='swarm'){
      /* fly-swarm: hunts the player harder than anything else but wobbles,
         and slows to a crawl once close so it hangs there instead of blowing
         past — the threat is being ENGULFED, not rammed. */
      e.ph+=dt;
      if(e.z<360) e.z += (e.spd+drift)*dt*.92;   // net ~8% closing speed up close
      e.vx = lerp(e.vx, clamp((S.P.x-e.x)*1.1,-190,190), Math.min(1,dt*1.7));
      e.vy = lerp(e.vy, clamp((S.P.y-e.y)*1.1,-160,160), Math.min(1,dt*1.7));
      const wx=Math.cos(e.ph*1.4)*70, wy=Math.sin(e.ph*2.1)*50;
      e.x+=(e.vx+wx)*dt; e.y+=(e.vy+wy)*dt;
      const lat=Math.hypot(e.x-S.P.x,e.y-S.P.y);
      e.engulf = e.z<420 && e.z>-100 && lat<130;
      if(e.engulf){
        /* continuous chip damage ~5/s: the tick clears the .65s post-hit
           invulnerability window so every tick actually lands */
        if((e.eng-=dt)<=0){ e.eng=.7; hurt(3.5,null); S.hitT=Math.max(S.hitT,.3); }
      } else e.eng=Math.min(e.eng,.25);
      if(e.engulf || e.z<600) swarmNear=true;
    } else if(e.k==='wasp'){
      /* flutter: faster, tighter jink than a drone, PLUS a weak homing pull
         onto the player's line (same idiom as the mine, but stronger) */
      e.ph += dt*7;
      const sx=Math.cos(e.ph)*e.amp*1.6, sy=Math.sin(e.ph*1.7)*e.amp*1.1;
      e.vx = lerp(e.vx, clamp((S.P.x-e.x)*1.4,-260,260), Math.min(1,dt*2.2));
      e.vy = lerp(e.vy, clamp((S.P.y-e.y)*1.4,-200,200), Math.min(1,dt*2.2));
      e.x+=(sx+e.vx)*dt; e.y+=(sy+e.vy)*dt;
      e.roll = lerp(e.roll, clamp(-(sx+e.vx)/320,-1.4,1.4), Math.min(1,dt*8));
      e.yaw  = lerp(e.yaw,  clamp((sx+e.vx)/850,-.6,.6)+Math.PI, Math.min(1,dt*7));
    } else {
      e.ph += dt*(e.k==='drone'?4.2:1.6);
      let sx=Math.cos(e.ph)*e.amp*(e.k==='drone'?3.0:1.1);
      const sy=Math.sin(e.ph*1.6)*e.amp*(e.k==='drone'?1.7:.6);
      /* a charging lancer holds its lateral line — that IS the telegraph */
      if(e.k==='lancer' && e.chg>0) sx=0;
      e.x+=sx*dt; e.y+=sy*dt;
      e.roll = lerp(e.roll, clamp(-sx/380,-1.2,1.2), Math.min(1,dt*6));
      e.yaw  = lerp(e.yaw,  clamp(sx/900,-.5,.5)+Math.PI, Math.min(1,dt*6));
    }
    if(e.hit>0) e.hit=Math.max(0,e.hit-dt*7);
    if(e.max){
      const w=e.hp/e.max;
      /* a wounded hull lists and trails fire — the only way a single mesh
         can read as "coming apart" */
      e.list = w<.72 ? (1-w)*(.5+.4*Math.sin(S.T*3.1+e.ph)) : 0;
      if(w<.72 && (e.smk=(e.smk||0)-dt)<=0){
        e.smk = w<.34?.038:.09;
        const ex=e.x+rnd(-e.r*.6,e.r*.6), ey=e.y+rnd(-12,12), ez=e.z-e.rz*.5;
        S.parts.push(mk(ex,ey,ez, rnd(-45,45),rnd(20,95),-rnd(220,480),
          w<.34?COL.red:COL.amber, rnd(.55,1.2), rnd(26,48), 0, .35, 1.5));
        if(Math.random()<.6)
          S.parts.push(mk(ex,ey,ez, rnd(-500,500),rnd(-260,520),-rnd(200,700),
            COL.white, rnd(.12,.3), rnd(9,17), .05, .1));
      }
    }
    /* a ravager is never still: a slow roll/list writhe rides on top of
       whatever the wounded-list code above just wrote (healthy = writhe
       alone, wounded = writhe + list) */
    if(e.k==='ravager') e.list = (e.list||0) + .2*Math.sin(S.T*2.4+e.ph);
    if(e.k==='cruiser' && (e.cd-=dt)<=0 && e.z>420 && e.z<2900){
      e.cd=rnd(.95,1.7);
      const g=ATT.cruiserGuns, V=2000, t=(e.z)/V;
      for(const gp of g){
        const gx=e.x+gp[0], gy=e.y+gp[1];
        S.foes.push({x:gx,y:gy,z:e.z,vx:(S.P.x-gx)/t*.8,vy:(S.P.y-gy)/t*.8,vz:-V,dmg:8,c:COL.amber,r:26});
      }
    }
    if(e.k==='ravager' && (e.cd-=dt)<=0 && e.z>420 && e.z<2900){
      /* spit: a 3-glob burst — slower, fatter, more dodgeable than cruiser
         bolts (.65 lead factor, fanned laterally) */
      e.cd=rnd(2.2,3.0);
      const V=1500, t=e.z/V;
      for(let j=-1;j<=1;j++)
        S.foes.push({x:e.x,y:e.y,z:e.z,
          vx:(S.P.x-e.x)/t*.65+j*90, vy:(S.P.y-e.y)/t*.65+j*45,
          vz:-V,dmg:9,c:COL.bio,r:34});
      AUDIO.spit && AUDIO.spit();
    }
    if(e.k==='lancer' && e.z>460 && e.z<3000){
      /* hold → 0.9s visible charge → one fast bolt aimed at the player's
         position AT FIRE TIME: dodgeable by moving after the shot */
      if(e.chg>0){
        e.chg=Math.min(1,e.chg+dt/.9);
        if(e.chg>=1){
          const V=3400, t=e.z/V;
          S.foes.push({x:e.x,y:e.y,z:e.z,vx:(S.P.x-e.x)/t,vy:(S.P.y-e.y)/t,vz:-V,dmg:13,c:COL.purple,r:30});
          AUDIO.lance && AUDIO.lance();
          e.chg=0; e.cd=2.6;
        }
      } else if((e.cd-=dt)<=0) e.chg=1e-4;
    }
    if(e.z<70){
      /* the swarm never rams — its engulf tick above is its whole attack */
      if(e.k!=='swarm' && e.z>-70 && Math.hypot(e.x-S.P.x,e.y-S.P.y)<e.r+24){ hurt(e.k==='drone'?12:e.k==='mine'?16:e.k==='wasp'?8:22,e); continue; }
      /* a striker slipping out the back is not an "escape" — no combo reset */
      if(e.z<DESPAWN_Z){ S.enemies.splice(i,1); if(e.k!=='striker') S.combo=1; }
    }
  }
  AUDIO.swarm && AUDIO.swarm(swarmNear);
  /* nuclear strikes. Deliberately after the enemy loop, never inside it:
     a detonation splices S.enemies to vaporise everything at ground zero. */
  nukeTick(dt);

  /* S.boss — one object, six behaviour sets keyed by b.type. The shared
     skeleton (approach to a hold depth, phase from hp thirds, listing, rage
     smoke, hit decay) is identical for all; only movement + attack cycles
     branch. Every field a branch reads is initialised in spawnBoss(). */
  if(S.boss){
    const b=S.boss; b.t+=dt;
    const type=b.type||'mothership';
    /* the carrier hangs deeper — its threat launches at you, it doesn't.
       The hunter hangs closest: its rake has to arrive fast enough that
       sitting still in its lane is punished. The siege giants (goliath,
       arbalest, hivemother) sit deepest of all — their hulls need the room
       and their patterns cross the whole arena anyway; the bat hangs
       nearest because its entire fight is closing that gap on you. */
    const holdZ = type==='carrier'?1700 : type==='dreadnought'?1600 : type==='leviathan'?1650
                : type==='warden'?1550 : type==='hunter'?1400 : type==='bat'?1250
                : type==='phantom'?1300 : type==='hivemother'?1520 : type==='goliath'?2000
                : type==='hedra'?1500 : type==='arbalest'?1900 : type==='reaper'?1550 : 1500;
    if(!b.here){ b.z-=1500*dt; if(b.z<=holdZ){ b.z=holdZ; b.here=true;
      if(type==='leviathan') AUDIO.screech && AUDIO.screech();
      else if(type==='bat'){ AUDIO.screech && AUDIO.screech();
        pushComms('WOLF',"THAT THING'S ALIVE — WATCH ITS DIVE",.8); }
      else if(type==='hivemother'){ AUDIO.motherScream && AUDIO.motherScream();
        pushComms('CONTROL','PRIMARY TARGET — THE HIVE MOTHER. END HER.',1); }
      else if(type==='goliath') pushComms('CONTROL','ARMOR RATED BEYOND YOUR GUNS — HIT IT ANYWAY',.8); } }
    else{
      const rage=1-b.hp/b.max;
      b.phase = b.hp/b.max>.66?1 : b.hp/b.max>.33?2:3;
      if(type==='carrier'){
        /* slow broad sweep; the launch cycle is the whole fight */
        b.x += b.dir*(120+90*rage)*dt;
        if(Math.abs(b.x)>260) b.dir*=-1;
        b.y = 40+Math.sin(b.t*.7)*55;
        b.z = holdZ+Math.sin(b.t*.5)*220;
        b.yaw = Math.PI + Math.sin(b.t*.4)*.12;
        b.roll = Math.sin(b.t*.6)*.06 + rage*.14*Math.sin(b.t*3.1);
        if(b.flash>0) b.flash-=dt;
        if((b.cd-=dt)<=0){
          /* capped launch (7 live enemies max) returns false — retry soon
             rather than banking a whole missed cycle */
          b.cd = carrierLaunch(b) ? (b.phase===1?4.5 : b.phase===2?3.4 : 2.6) : .8;
        }
        if(b.phase===3 && (b.fcd-=dt)<=0){ b.fcd=2.2; carrierVolley(b); }
      } else if(type==='dreadnought'){
        /* slow menacing drift, mostly centred; alternates two telegraphed
           patterns — SPINE LANCE (1.1s charge, then one fast thick bolt) and
           WALL (slow lattice with gaps). A charge freezes the x-drift: that
           stillness IS the tell, same language as the lancer. */
        if(b.chg>0){
          b.chg=Math.min(1,b.chg+dt/1.1);
          if(b.chg>=1){
            dreadLance(b);
            b.chg=0; b.mode='wall';
            b.cd = b.phase===3?1.2 : b.phase===2?1.7 : 2.2;
          }
        } else {
          b.x += b.dir*(60+40*rage)*dt;
          if(Math.abs(b.x)>130) b.dir*=-1;
          if((b.cd-=dt)<=0){
            if(b.mode==='lance'){
              b.chg=1e-4;
              /* phase 3: the patterns interleave — the wall launches as the
                 charge begins, so it lands while the lance bolt is inbound */
              if(b.phase===3) dreadWall(b);
            } else {
              dreadWall(b); b.mode='lance';
              b.cd = b.phase===3?1.4 : b.phase===2?2.0 : 2.6;
            }
          }
        }
        b.y = 30+Math.sin(b.t*.6)*40;
        b.z = holdZ+Math.sin(b.t*.35)*140;
        b.yaw = Math.PI + Math.sin(b.t*.4)*.08;
        b.roll = Math.sin(b.t*.5)*.05 + rage*.12*Math.sin(b.t*3.0);
      } else if(type==='leviathan'){
        /* bio-titan: deep slow undulation — the whole body heaves on a big
           slow sine and never stops writhing. Attack cycle:
           phase 1  spore barrage only;
           phase 2  alternates barrage / birth (wasp pod from the maw);
           phase 3  cycles spore → birth → maw lance (1.2s charge, x-drift
           freezes — the stillness is the tell, same language as the
           dreadnought). */
        if(b.phase===3 && !b.scr3){ b.scr3=true; AUDIO.screech && AUDIO.screech(); }
        b.y = 30+Math.sin(b.t*.5)*85;
        b.z = holdZ+Math.sin(b.t*.33)*180;
        b.yaw = Math.PI + Math.sin(b.t*.35)*.10;
        b.roll = Math.sin(b.t*.45)*.14 + rage*.14*Math.sin(b.t*2.7);
        if(b.flash>0) b.flash-=dt;
        if(b.chg>0){
          b.chg=Math.min(1,b.chg+dt/1.2);
          if(b.chg>=1){ levLance(b); b.chg=0; b.cd=1.6; }
        } else {
          b.x += b.dir*(90+70*rage)*dt;
          if(Math.abs(b.x)>240) b.dir*=-1;
          if((b.cd-=dt)<=0){
            if(b.phase===1){ sporeBarrage(b); b.cd=2.8; }
            else if(b.phase===2){
              /* capped birth returns false — retry soon, like the carrier */
              if(b.alt=!b.alt){ sporeBarrage(b); b.cd=2.4; }
              else b.cd = levBirth(b) ? 3.2 : .8;
            } else {
              b.mode = b.mode==='spore'?'birth' : b.mode==='birth'?'lance' : 'spore';
              if(b.mode==='spore'){ sporeBarrage(b); b.cd=2.0; }
              else if(b.mode==='birth') b.cd = levBirth(b) ? 2.4 : .8;
              else b.chg=1e-4;
            }
          }
        }
      } else if(type==='warden'){
        /* an orbital gun platform, not a ship: it barely repositions. The
           threat is the SPIN — b.spin drives the mesh roll AND the pinwheel's
           spoke angles, so the arms you can see ARE the pattern. It reverses
           on every phase change, which is the one thing that has to be
           re-learned mid-fight; without the radio call the reversal reads as
           a glitch rather than as a beat. */
        if(b.phase!==b.pph){
          b.pph=b.phase; b.sdir*=-1;
          pushComms('CONTROL','WARDEN REVERSING — SPIN FLIPPED',.7);
        }
        b.spin = (b.spin + b.sdir*(.85+.16*b.phase)*dt) % (Math.PI*2);
        b.x += b.dir*(45+35*rage)*dt;
        if(Math.abs(b.x)>110) b.dir*=-1;
        b.y = 30+Math.sin(b.t*.4)*30;
        b.z = holdZ+Math.sin(b.t*.3)*90;
        b.yaw = Math.PI;
        b.roll = b.spin;
        if(b.flash>0) b.flash-=dt;
        if((b.cd-=dt)<=0){
          b.cd = b.phase===1?1.0 : b.phase===2?.82 : .7;
          wardenPinwheel(b);
        }
        /* the iris ring runs on its OWN clock, deliberately not a multiple of
           the pinwheel tick: the two patterns drift against each other so no
           single memorised loop clears the fight */
        if((b.fcd-=dt)<=0){
          b.fcd = b.phase===1?5 : b.phase===2?4.2 : 3.4;
          wardenRing(b);
        }
      } else if(type==='hunter'){
        /* the gimmick is MOVEMENT: it chases your position with a lag and a
           hard speed cap (230/s lateral against your ~590/s), so it can always
           be broken away from — but only by actually flying. Tracking freezes
           for the whole of a rake burst and a pounce; those committed windows
           are the only reason either attack is dodgeable, so nothing may fire
           while it is still following you. */
        const zt = holdZ+Math.sin(b.t*.5)*60;
        if(b.mode==='stalk'){
          b.x += clamp((S.P.x-b.x)*1.8,-230,230)*dt;
          /* +34 lines your lane up with the wing pods, which sit that far
             below the hull centre — the rake is fired flat, so the hull has
             to do the aiming with its own body */
          b.y += clamp((S.P.y+34-b.y)*1.4,-190,190)*dt;
          b.y = clamp(b.y,-120,150);
        }
        b.yaw = Math.PI + clamp((S.P.x-b.x)/900,-.5,.5);
        b.roll = clamp((b.x-S.P.x)/700,-.7,.7) + rage*.12*Math.sin(b.t*3.2);
        if(b.flash>0) b.flash-=dt;
        if(b.mode==='rake'){
          b.z=zt;
          if((b.cd-=dt)<=0){
            hunterRake(b);
            b.cd = b.phase===3?.055 : .075;
            if(--b.rkN<=0){ b.mode='stalk'; b.cd = b.phase===1?1.1 : b.phase===2?.85 : .65; }
          }
        } else if(b.mode==='charge'){
          b.z=zt; b.chg=Math.min(1,b.chg+dt);
          if(b.chg>=1) b.mode='pounce';
        } else if(b.mode==='pounce'){
          b.z-=2100*dt;
          if(b.z<=620){ b.z=620; hunterSpread(b); b.mode='back'; b.chg=0; }
        } else if(b.mode==='back'){
          /* climb back to the CURRENT hold depth, not a fixed one, or the
             stalk sine snaps the hull backwards the frame it resumes */
          b.z+=1150*dt;
          if(b.z>=zt){ b.z=zt; b.mode='stalk'; b.cd = b.phase===1?1.2 : b.phase===2?.95 : .75; }
        } else {
          b.z=zt;
          if((b.cd-=dt)<=0){
            if(b.alt=!b.alt){
              b.mode='rake'; b.rkN = b.phase===1?9 : b.phase===2?12 : 16;
              b.cd=.32;                 // a beat of stillness before the first round
              AUDIO.strafe && AUDIO.strafe();
            } else {
              /* the pounce telegraph: a full second of frozen nose charge
                 before it commits, which is the entire dodge window */
              b.mode='charge'; b.chg=1e-4;
              AUDIO.lance && AUDIO.lance();
            }
          }
        }
      } else if(type==='bat'){
        /* organic, not a ship: the wings never stop, and their beat rate is
           the state readout — slow deliberate strokes through the windup,
           frantic during the dive, a steady 9.5 on the circle. The fight is
           circle → scream (frozen, rearing) → committed dive at a SNAPSHOT
           of your position → climb out. Moving after the scream is the
           whole dodge; the bite only lands if you sit on the snapshot. */
        b.wingT += dt*(b.mode==='dive'?16 : b.mode==='windup'?5 : 9.5);
        if(b.phase===3 && !b.scr3){ b.scr3=true; AUDIO.screech && AUDIO.screech(); }
        if(b.mode==='windup'){
          /* drift freezes to a 30Hz tremble — stillness is the tell, same
             language as the lancer; chg drives the rear-up (list overlay) */
          b.x += Math.sin(b.t*30)*60*dt;
          b.yaw = Math.PI; b.roll = Math.sin(b.t*22)*.06;
          b.chg = Math.min(1,b.chg+dt);
          if(b.chg>=1){
            b.tx=S.P.x; b.ty=S.P.y; b.diveN++;
            b.mode='dive'; b.chg=0;
            AUDIO.strafe && AUDIO.strafe();
          }
        } else if(b.mode==='dive'){
          /* straight-line lunge at the snapshot. The z component is floored
             so the plunge always punches through your depth plane instead
             of stalling above it chasing x. */
          const spd=1750+b.phase*150,
                dx=b.tx-b.x, dy=b.ty-b.y, dz=Math.min(-140,30-b.z),
                dl=Math.max(1,Math.hypot(dx,dy,dz));
          b.x+=dx/dl*spd*dt; b.y+=dy/dl*spd*dt; b.z+=dz/dl*spd*dt;
          b.yaw=Math.PI; b.roll=Math.sin(b.wingT)*.1;
          if(b.z<160 && b.z>-40 && Math.abs(b.x-S.P.x)<85 && Math.abs(b.y-S.P.y)<75){
            /* the BITE — melee; hurt's .65s inv gate makes it one bite per
               pass. src stays null: passing the boss would explode it. */
            hurt(24,null,b);
            AUDIO.bite && AUDIO.bite(); AUDIO.screech && AUDIO.screech();
            S.shake=Math.max(S.shake,10);
          }
          if(b.z<=20) b.mode='recover';
        } else if(b.mode==='recover'){
          b.z+=1250*dt;
          b.y += (70-b.y)*Math.min(1,dt*3);
          b.yaw=Math.PI; b.roll=Math.sin(b.wingT)*.15;
          if(b.z>=holdZ){
            b.z=holdZ; b.mode='circle';
            /* phase 3: every other pass comes straight back around — the
               odd-dive quick turnaround is the phase's whole escalation */
            b.cd = (b.phase===3 && (b.diveN&1)) ? .9
                 : b.phase===1?4.2 : b.phase===2?3.2 : 2.4;
          }
        } else {
          /* circle: banking figure-8 that loosely shadows your x, chase
             rate capped so it can never snap onto you */
          const cx=Math.sin(b.t*.85)*200 + S.P.x*.25;
          b.x += clamp((cx-b.x)*2.5,-300,300)*dt;
          b.y = 70+Math.sin(b.t*1.7)*60;
          b.z = holdZ+Math.sin(b.t*.6)*90;
          b.yaw = Math.PI + Math.sin(b.t*.85)*.3;
          b.roll = Math.cos(b.t*.85)*.5;
          if((b.fcd-=dt)<=0){ b.fcd = b.phase===1?2.6 : b.phase===2?2.1 : 1.7; batSpit(b); }
          if((b.cd-=dt)<=0){ b.mode='windup'; b.chg=1e-4; AUDIO.screech && AUDIO.screech(); }
        }
      } else if(type==='phantom'){
        /* teleporter: blink 0 hover / 1 collapse (.32s) / 2 reform (.28s).
           R draws the implosion and the ghost straight off blink/bt — this
           branch only keeps the clock honest and fires the volleys. The
           nova punishes standing ON the blink-in point, and the reform IS
           its telegraph, so nothing here may cheat the timings. */
        if(b.blink===1){
          b.bt+=dt;                        // collapsing: position frozen
          if(b.bt>=.32){
            /* reappear on a flank — never on top of you, always beside */
            b.x = clamp(S.P.x + (Math.random()<.5?-1:1)*rnd(140,240), -260,260);
            b.y = clamp(S.P.y + rnd(-60,90), -100,150);
            b.z = holdZ + rnd(-80,80);
            b.blink=2; b.bt=0;
          }
        } else if(b.blink===2){
          b.bt+=dt;
          if(b.bt>=.28){
            b.blink=0; b.bt=0;
            if(b.phase>=2){ phanNova(b); b.cd=Math.max(b.cd,.9); }
          }
        } else {
          /* hover: lazy shadowing drift while the pincers and the blink
             timer both run — the pincer's safe corridor is at your CURRENT
             x, so holding still through a volley is actually correct */
          b.x += clamp((S.P.x*.3-b.x)*1.2,-160,160)*dt;
          b.y = 40+Math.sin(b.t*.8)*40;
          b.z = holdZ+Math.sin(b.t*.45)*60;
          if((b.cd-=dt)<=0){ b.cd = b.phase===1?2.4 : b.phase===2?1.9 : 1.5; phanPincer(b); }
          b.bt+=dt;
          if(b.bt >= (b.phase===1?3.2 : b.phase===2?2.6 : 2.2)){
            b.blink=1; b.bt=0; b.ox=b.x; b.oy=b.y; b.oz=b.z;
            AUDIO.blink && AUDIO.blink();
          }
        }
        b.yaw = Math.PI + Math.sin(b.t*.6)*.1;
        b.roll = Math.sin(b.t*.7)*.12 + rage*.10*Math.sin(b.t*3.0);
      } else if(type==='hivemother'){
        /* the intro's jelly, grown colossal. Everything about her is slow
           and vast; the fight is the MEMBRANE — a 6.8s breathing cycle,
           open for the first 4.2s of it. Open she attacks and takes full
           damage; closed she turtles behind .35x armor (damage() side) and
           only seeps spores. Learn the breath, burn the open windows. */
        if(b.phase===3 && !b.scr3){ b.scr3=true; AUDIO.motherScream && AUDIO.motherScream(); }
        b.pulse+=dt;
        /* target read before AND after the clock tick so the flip itself is
           caught without a latch field — each flip gets the sub throb */
        const pT=(b.openT%6.8)<4.2?1:0;
        b.openT+=dt;
        const oT=(b.openT%6.8)<4.2?1:0;
        if(oT!==pT) AUDIO.motherPulse && AUDIO.motherPulse();
        b.open = oT>b.open ? Math.min(oT,b.open+2.2*dt) : Math.max(oT,b.open-2.2*dt);
        b.y = 20+Math.sin(b.t*.4)*50;
        b.z = holdZ+Math.sin(b.t*.27)*120;
        b.yaw = Math.PI + Math.sin(b.t*.3)*.08;
        b.roll = Math.sin(b.t*.37)*.10 + rage*.10*Math.sin(b.t*2.6);
        if(b.flash>0) b.flash-=dt;
        if(b.chg>0){
          /* maw lance: 1.3s charge, x-drift frozen — the stillness is the
             tell, same language as the leviathan */
          b.chg=Math.min(1,b.chg+dt/1.3);
          if(b.chg>=1){ motherLance(b); b.chg=0; b.cd=1.8; }
        } else {
          b.x += b.dir*55*dt;
          if(Math.abs(b.x)>160) b.dir*=-1;
          if(b.open>.5){
            if((b.cd-=dt)<=0){
              if(b.phase===1){
                /* phase 1 keeps it legible: sweep and spore only */
                if(b.alt=!b.alt){ motherSweep(b); b.cd=2.8; }
                else { motherSpore(b); b.cd=2.6; }
              } else {
                b.mode = b.mode==='sweep'?'spore' : b.mode==='spore'?'birth'
                       : (b.mode==='birth'&&b.phase===3)?'lance' : 'sweep';
                if(b.mode==='sweep'){ motherSweep(b); b.cd=2.4; }
                else if(b.mode==='spore'){ motherSpore(b); b.cd=2.2; }
                /* capped birth returns false — retry soon, carrier idiom */
                else if(b.mode==='birth') b.cd = motherBirth(b) ? 2.8 : .8;
                else b.chg=1e-4;
              }
            }
          } else if(b.open<.4 && (b.fcd-=dt)<=0){
            /* armored turtle: nothing but a slow seep of spores — the quiet
               half of the breath, when shooting her is mostly wasted */
            b.fcd=2.2; motherSpore(b);
          }
        }
      } else if(type==='goliath'){
        /* siege fortress: it barely moves — the mass is the statement. The
           guns alternate a rolling hull-length sweep with an aimed cluster;
           from phase 2 the dread lattice rides its own clock so the two
           patterns drift out of sync and no memorised loop clears both.
           Its death is not the end — combat.js owns the reveal. */
        b.x += b.dir*30*dt;
        if(Math.abs(b.x)>70) b.dir*=-1;
        b.y = 10+Math.sin(b.t*.35)*25;
        b.z = holdZ+Math.sin(b.t*.25)*70;
        b.yaw = Math.PI + Math.sin(b.t*.3)*.04;
        b.roll = Math.sin(b.t*.4)*.03 + rage*.06*Math.sin(b.t*4.1);
        if(b.flash>0) b.flash-=dt;
        if((b.cd-=dt)<=0){
          if(b.alt=!b.alt){ golSweep(b); b.cd = b.phase===1?2.6 : b.phase===2?2.1 : 1.6; }
          else { golBarrage(b); b.cd = b.phase===1?2.2 : b.phase===2?1.8 : 1.4; }
        }
        if(b.phase>=2 && (b.fcd-=dt)<=0){
          b.fcd = b.phase===2?5:4;
          dreadWall(b);
        }
      } else if(type==='hedra'){
        /* crystal tumble: one spin clock scaled by three incommensurate
           factors (.53/.71/1) across list/yaw/roll — the orientation never
           repeats, so the lattice's rotation can't be memorised, only read
           off the hull. list rides the post-skeleton overlay below. */
        b.spin += dt*(.5+.25*b.phase);
        b.yaw = b.spin*.71 + Math.PI;
        b.roll = b.spin;
        /* eased onto the drift track so arrival doesn't snap it sideways */
        b.x += (Math.sin(b.t*.5)*140 - b.x)*Math.min(1,dt*3);
        b.y = 30+Math.sin(b.t*.8)*50;
        b.z = holdZ+Math.sin(b.t*.4)*100;
        if(b.flash>0) b.flash-=dt;
        if((b.cd-=dt)<=0){
          if(b.phase===1){ hedraLattice(b); b.cd=3.0; }
          else if(b.phase===2){
            if(b.alt=!b.alt) hedraLattice(b); else hedraBurst(b);
            b.cd=2.4;
          } else {
            /* mode arrives here as spawn's 'lance' — normalise once so the
               cycle opens on the lattice, its signature */
            if(b.mode!=='lat'&&b.mode!=='burst'&&b.mode!=='shard') b.mode='shard';
            b.mode = b.mode==='lat'?'burst' : b.mode==='burst'?'shard' : 'lat';
            if(b.mode==='lat') hedraLattice(b);
            else if(b.mode==='burst') hedraBurst(b);
            else hedraShard(b);
            b.cd=1.9;
          }
        }
      } else if(type==='arbalest'){
        /* siege beam: bmX locks where you WERE when the whine starts — the
           1.4s charge is the dodge window; once firing the column only
           walks 70-100/s toward you, always outrunnable. Mortars arc in
           between so parking at the far wall isn't free. The platform
           braces (x freezes) for the whole beam cycle — that stillness is
           the long tell. */
        if(b.bmS===0){ b.x += b.dir*40*dt; if(Math.abs(b.x)>90) b.dir*=-1; }
        b.y = 30+Math.sin(b.t*.4)*25;
        b.z = holdZ+Math.sin(b.t*.3)*60;
        b.yaw = Math.PI + Math.sin(b.t*.3)*.05;
        b.roll = Math.sin(b.t*.45)*.05 + rage*.08*Math.sin(b.t*3.3);
        if(b.bmS===1){
          b.bmT+=dt;
          if(b.bmT>=1.4){
            b.bmS=2; b.bmT=0; b.bmD = S.P.x>b.bmX?1:-1;
            AUDIO.beamFire && AUDIO.beamFire();
          }
        } else if(b.bmS===2){
          b.bmT+=dt;
          b.bmX += b.bmD*(55+15*b.phase)*dt;
          arbBeamTick(b,dt);
          if(b.bmT >= (b.phase===3?2.2:1.6)){
            b.bmS=0;
            b.cd = b.phase===1?3.6 : b.phase===2?2.8 : 2.2;
          }
        } else if((b.cd-=dt)<=0){
          b.bmS=1; b.bmT=0; b.bmX=S.P.x;
          AUDIO.beamUp && AUDIO.beamUp();
        }
        if((b.fcd-=dt)<=0){ b.fcd = b.phase===1?4 : b.phase===2?3 : 2.4; arbMortar(b); }
      } else if(type==='reaper'){
        /* racetrack strafer: parks at a wall, banks hard over — the bank
           is the telegraph — then commits to a full crossing dropping a
           bolt curtain with ONE wandering gap. The dodge is finding the
           gap early and riding its random walk, or slipping in behind the
           run before the fence closes. */
        if(b.flash>0) b.flash-=dt;
        if(b.mode==='cross'){
          b.x += b.dir*(520+60*b.phase+(b.phase===3?80:0))*dt;
          b.y += (b.ry-b.y)*Math.min(1,dt*4);
          b.z = holdZ+Math.sin(b.t*.7)*40;
          b.roll = lerp(b.roll, b.dir*.35 + rage*.10*Math.sin(b.t*4.2), Math.min(1,dt*6));
          b.yaw = Math.PI + b.dir*.22;
          if((b.cd-=dt)<=0){ b.cd = b.phase===3?.075:.09; reapCurtain(b); }
          /* one aimed spread per run at centre-arena, phases 2+ — punishes
             tailgating the reaper itself through the gap */
          if(b.phase>=2 && !b.alt && Math.abs(b.x)<30){ b.alt=true; reapSpread(b); }
          if(Math.abs(b.x)>340){ b.mode='turn'; b.dir*=-1; b.cd=.9; }
        } else {
          /* turn: hold at the wall it just reached, wings coming over into
             the NEXT run's bank while the curtain rack reloads */
          b.x += (-b.dir*350-b.x)*Math.min(1,dt*3);
          b.y += (40+Math.sin(b.t*.9)*30-b.y)*Math.min(1,dt*3);
          b.z = holdZ+Math.sin(b.t*.7)*40;
          b.roll = lerp(b.roll, b.dir*1.1, Math.min(1,dt*5));
          b.yaw = Math.PI + b.dir*.35;
          if((b.cd-=dt)<=0){
            b.mode='cross'; b.alt=false;
            b.ry = clamp(S.P.y+rnd(-40,60), -90, 140);
            b.cd = .09;
            AUDIO.strafe && AUDIO.strafe();
          }
        }
      } else {
        /* mothership — unchanged */
        b.x += b.dir*(190+180*rage)*dt;
        if(Math.abs(b.x)>300) b.dir*=-1;
        b.y = 40+Math.sin(b.t*.9)*70;
        b.z = holdZ+Math.sin(b.t*.6)*300;
        b.yaw = Math.PI + Math.sin(b.t*.5)*.18;
        b.roll = Math.sin(b.t*.7)*.10 + rage*.20*Math.sin(b.t*3.4);
        if((b.cd-=dt*(b.phase===3?1.8:b.phase===2?1.35:1))<=0){
          b.cd = b.phase===1?1.15 : b.phase===2?.85 : .62;
          volley(b);
        }
      }
      b.list = rage*.26*Math.sin(b.t*2.1);
      /* the two types whose identity lives in the nose add their list on
         top of the shared rage sag AFTER it, or the skeleton line would
         clobber them: the bat rears through its windup (-.35 at full
         charge) and whips nose-over as the dive commits, easing back level
         through the climb-out; the hedra's tumble needs its third axis. */
      if(type==='bat') b.list += b.mode==='windup'? -.35*b.chg
        : b.mode==='dive'? -.35+.85*clamp((holdZ+100-b.z)/220,0,1)
        : b.mode==='recover'? .5*clamp(1-(b.z-20)/400,0,1) : 0;
      else if(type==='hedra') b.list += b.spin*.53;
      /* nuke stagger: a tactical round just slapped it — the hull reels on
         two decaying wobbles and vomits fire, so the hit reads as a WOUND
         on the airframe, not just a number off the bar */
      if(b.stagT>0){ b.stagT-=dt;
        b.list += Math.sin(b.stagT*22)*.12*b.stagT;
        b.roll += Math.sin(b.stagT*17)*.09*b.stagT;
        if(Math.random()<.75){
          const sx=b.x+rnd(-b.r*.7,b.r*.7), sy=b.y+rnd(-50,70), sz=b.z+rnd(-120,120);
          S.parts.push(mk(sx,sy,sz, rnd(-90,90),rnd(40,190),-rnd(300,700),
            Math.random()<.5?COL.red:COL.amber, rnd(.5,1.1), rnd(40,80), 0, .3, 1.5));
          if(Math.random()<.4) sparks(sx,sy,sz, 3, 800, .9, COL.amber, 0,0,0, 0);
        }
      }
      if(rage>.25 && (b.smk-=dt)<=0){
        b.smk = .07-rage*.045;
        const hx=b.x+rnd(-250,250), hy=b.y+rnd(-40,60), hz=b.z+rnd(-130,150);
        S.parts.push(mk(hx,hy,hz, rnd(-70,70),rnd(30,150),-rnd(260,620),
          rage>.66?COL.red:COL.amber, rnd(.7,1.5), rnd(56,100), 0, .35, 1.6));
        sparks(hx,hy,hz, 4, 900, 1.1, COL.amber, 0,0,0, 0);
        if(rage>.6 && Math.random()<.11) shard(hx,hy,hz, rnd(-220,220),rnd(60,300),-rnd(200,500), rnd(.4,.7), b.c, rnd(.4,.75));
      }
    }
    if(b.hit>0) b.hit=Math.max(0,b.hit-dt*7);
  }

  /* S.crates */
  for(let i=S.crates.length-1;i>=0;i--){
    const k=S.crates[i]; k.z-=(950+drift)*dt; k.spin+=dt*3.4;
    if(k.z<60 && k.z>-80 && Math.hypot(k.x-S.P.x,k.y-S.P.y)<70){ take(k.kind); S.crates.splice(i,1); continue; }
    if(k.z<DESPAWN_Z) S.crates.splice(i,1);
  }

  /* S.allies — friendly flight: join → fight on your wing → at doom time,
     either the scripted on-screen death or (per the fate rolled at spawn) a
     promotion to permanent 'wing' — a survivor that flies formation across
     sectors and bosses until it either loses a hazard roll or completes two
     full sectors and banks away home. Enemies never target them, their
     tracers are real player-side shots, combo/score untouched by their loss. */
  for(let i=S.allies.length-1;i>=0;i--){
    const a=S.allies[i]; a.t+=dt;
    /* caught in a fireball — nuke.js raises the flag, the existing scripted
       death owns everything after it */
    if(a.nuked){ a.nuked=false; if(a.state!=='dying'){ allyDown(a); continue; } }
    if(a.state==='join'){
      /* fast climb-in from behind/below the camera to station on your wing */
      a.z += (a.stz-a.z)*Math.min(1,dt*2.6);
      a.y += (a.sty-a.y)*Math.min(1,dt*3.2);
      const nx=a.x+(S.P.x+a.stx-a.x)*Math.min(1,dt*2.4);
      a.vx=(nx-a.x)/Math.max(dt,1e-4); a.x=nx;
      a.thr=1;
      a.roll = lerp(a.roll, clamp(-a.vx/620,-1.1,1.1), Math.min(1,dt*8));
      a.pitch= lerp(a.pitch, -.22, Math.min(1,dt*4));
      if(a.t>1.2) a.state='fight';
    } else if(a.state==='fight'){
      allyFly(a,dt);
      if(a.t>a.doom){
        if(a.fate==='wing'){
          /* the survivor moment: shakes the hit and stays for good */
          a.state='wing'; a.joinSector=S.sector; a.hazT=0;
          pushComms(a.cs,'STILL WITH YOU — PRESS THE ATTACK',.6);
        } else allyDown(a);
      }
    } else if(a.state==='wing'){
      allyFly(a,dt);
      /* not immortal: under a boss or a high-threat peak it takes a small
         hazard roll every 10s — losing one sends it down the existing
         scripted-death path, mayday and all */
      if(S.boss || S.threat>0.8*S.threatCap){
        a.hazT+=dt;
        if(a.hazT>=10){ a.hazT=0; if(Math.random()<.12){ allyDown(a); continue; } }
      }
      /* two full sectors survived after joining → it exits ALIVE */
      if(!S.boss && S.sector>=a.joinSector+2){
        a.state='rtb'; a.rtbT=0;
        pushComms(a.cs,'WINCHESTER — RTB. GOOD HUNTING.',.5);
      }
    } else if(a.state==='rtb'){
      /* banks away climbing on afterburner — never exploded, just gone */
      a.rtbT=(a.rtbT||0)+dt; a.thr=1.6;
      a.vx = lerp(a.vx, a.side*560, Math.min(1,dt*2.2));
      a.vy = lerp(a.vy, 340, Math.min(1,dt*1.8));
      a.x+=a.vx*dt; a.y+=a.vy*dt; a.z+=260*dt;
      a.roll = lerp(a.roll, a.side*1.1, Math.min(1,dt*3));
      a.pitch= lerp(a.pitch, -.4, Math.min(1,dt*2.5));
      a.yaw  = lerp(a.yaw, a.side*.5, Math.min(1,dt*2.5));
      if(a.rtbT>5 || Math.abs(a.x)>950 || a.y>520){ S.allies.splice(i,1); continue; }
    } else {
      /* dying: catches fire, rolls inverted, noses down, drifts wide — then
         the airframe lets go */
      a.dieT+=dt;
      a.roll = lerp(a.roll, a.side*Math.PI, Math.min(1,dt*2.4));
      a.pitch= lerp(a.pitch, .7, Math.min(1,dt*1.6));
      a.vy = Math.max(-460, a.vy-620*dt);
      a.vx = lerp(a.vx, a.side*130, Math.min(1,dt*2));
      a.x+=a.vx*dt; a.y+=a.vy*dt; a.z-=120*dt;
      a.burnT+=dt;
      /* amber/red flame + smoke trail off the hull, every frame */
      S.parts.push(mk(a.x+rnd(-8,8),a.y+rnd(-3,5),a.z-20, rnd(-30,30),rnd(30,90),-rnd(300,600),
        Math.random()<.55?COL.amber:COL.red, rnd(.2,.4), rnd(8,16), 0, .15, 1.2));
      if(Math.random()<.5)
        S.parts.push(mk(a.x,a.y,a.z-26, rnd(-40,40),rnd(20,80),-rnd(200,420),
          COL.smoke, rnd(.4,.8), rnd(14,26), 0, .3, 1.5));
      if(a.dieT>1.4 || a.y<-260){
        shock(a.x,a.y,a.z, 10, 220, .55, 7, COL.amber, 1);
        shock(a.x,a.y,a.z, 6, 130, .4, 5, COL.cyan, .9);
        sparks(a.x,a.y,a.z, 26, 900, 1.2, COL.amber, 0,0,0, 0);
        for(let j=0;j<5;j++)
          shard(a.x,a.y,a.z, rnd(-380,380),rnd(-120,420),rnd(-300,300),
            rnd(.4,.8), j&1?COL.cyan:COL.amber, rnd(.4,.75));
        AUDIO.boom(1.2);
        pushComms('CONTROL',a.cs+' IS DOWN',.8);
        S.allies.splice(i,1); continue;
      }
    }
  }

  /* player S.shots */
  for(let i=S.shots.length-1;i>=0;i--){
    const s=S.shots[i]; s.pz=s.z; s.px=s.x; s.py=s.y;
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.z+=s.vz*dt;
    if(s.z>SPAWN_Z+400 || hitScan(s,s.dmg,false)) S.shots.splice(i,1);
  }
  /* missiles */
  for(let i=S.rockets.length-1;i>=0;i--){
    const m=S.rockets[i]; m.pz=m.z; m.px=m.x; m.py=m.y; m.life-=dt;
    if(m.t && (m.t.dead || (m.t!==S.boss && S.enemies.indexOf(m.t)<0))) m.t=null;
    if(!m.t) m.t=nearestAhead(m);
    if(m.t){
      const tt=Math.max(.05,(m.t.z-m.z)/m.vz);
      m.vx=lerp(m.vx,(m.t.x-m.x)/tt, Math.min(1,dt*6));
      m.vy=lerp(m.vy,(m.t.y-m.y)/tt, Math.min(1,dt*6));
    }
    m.vz=Math.min(2800,m.vz+1600*dt);
    m.x+=m.vx*dt; m.y+=m.vy*dt; m.z+=m.vz*dt;
    S.parts.push(mk(m.x,m.y,m.z, rnd(-30,30),rnd(-30,30),-rnd(180,520), COL.amber,.32,7));
    if(m.life<=0 || m.z>SPAWN_Z+400 || hitScan(m,7,true)) S.rockets.splice(i,1);
  }
  /* enemy fire */
  for(let i=S.foes.length-1;i>=0;i--){
    const s=S.foes[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.z+=s.vz*dt;
    if(s.z<60){
      if(s.z>-90 && Math.hypot(s.x-S.P.x,s.y-S.P.y)<44){ hurt(s.dmg,null,s); S.foes.splice(i,1); continue; }
      if(s.z<DESPAWN_Z) S.foes.splice(i,1);
    }
  }
  /* particles */
  if(S.parts.length>1100) S.parts.splice(0, S.parts.length-1100);
  for(let i=S.parts.length-1;i>=0;i--){
    const p=S.parts[i]; p.life-=dt;
    if(p.dg){ const d=Math.pow(p.dg,dt); p.vx*=d; p.vy*=d; p.vz*=d; }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt-S.flow*dt;
    if(p.life<=0||p.z<DESPAWN_Z) S.parts.splice(i,1);
  }
  /* shockwave S.rings */
  for(let i=S.rings.length-1;i>=0;i--){
    const g=S.rings[i]; g.life-=dt; g.z-=S.flow*dt;
    const t=1-clamp(g.life/g.max,0,1);
    g.r = g.r0+(g.r1-g.r0)*(1-(1-t)*(1-t)*(1-t));
    if(g.life<=0) S.rings.splice(i,1);
  }
  /* S.debris shards */
  for(let i=S.debris.length-1;i>=0;i--){
    const d=S.debris[i]; d.life-=dt;
    const dp=Math.pow(.42,dt); d.vx*=dp; d.vy*=dp; d.vz*=dp;
    d.vy-=340*dt;
    d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt-S.flow*dt;
    d.rx+=d.ax*dt; d.ry+=d.ay*dt; d.rz+=d.az*dt;
    if((d.tr-=dt)<=0){
      d.tr=.05;
      S.parts.push(mk(d.x,d.y,d.z, rnd(-30,30),rnd(-10,60),rnd(-60,60),
        Math.random()<.4?COL.white:d.c, rnd(.26,.62), rnd(5,10)*(.6+d.s*.8), 0, .25, 1.5));
    }
    if(d.life<=0||d.z<DESPAWN_Z) S.debris.splice(i,1);
  }
  for(let i=S.evq.length-1;i>=0;i--){
    const v=S.evq[i]; v.z-=S.flow*dt;
    if((v.t-=dt)<=0){ S.evq.splice(i,1); v.f(v.x,v.y,v.z); }
  }
  for(let i=S.pops.length-1;i>=0;i--){
    const f=S.pops[i]; f.life-=dt; f.y+=110*dt; f.z-=S.flow*dt;
    if(f.life<=0||f.z<40) S.pops.splice(i,1);
  }

  /* radio comms age out (~6s each; hud-draw fades on the same clock) */
  if(S.comms) for(let i=S.comms.length-1;i>=0;i--){
    if((S.comms[i].t+=dt)>6) S.comms.splice(i,1);
  }
  /* creep — the shared corruption curve (same formula as the scenery bands,
     so sight and sound corrupt together). Ambience bed refreshed ~1x/sec;
     past .2 the distance starts to groan, roughly once per 20-40s at full
     creep (AUDIO.groan self-throttles on top of this). */
  if(S.gameOn){
    const creep = clamp((S.dist-10000)/50000, 0, 1);
    if((S.creepT-=dt)<=0){ S.creepT=1; AUDIO.creep && AUDIO.creep(creep); }
    if(creep>.2 && Math.random()<dt*creep/22) AUDIO.groan && AUDIO.groan();
    /* one-time unsettling transmissions as the world crosses each threshold */
    const CREEPLINES=[
      [.15,'READINGS OFF THE SCALE OUT THERE… WHAT IS THAT?',.7],
      [.45,'YOUR SIGNAL IS BREAKING UP. SOMETHING IS MOVING IN THE CLOUD LAYER',.8],
      [.75,'WE HEAR IT TOO NOW. IT KNOWS YOUR NAME. COME HOME',.95],
    ];
    if(S.creepStage<CREEPLINES.length && creep>CREEPLINES[S.creepStage][0]){
      const L=CREEPLINES[S.creepStage++];
      pushComms('CONTROL',L[1],L[2]);
    }
  }
  if((S.comboT-=dt)<=0 && S.combo>1){ S.combo=Math.max(1,S.combo-1); S.comboT=1.1; }
  /* superlinear decay: a big S.flash strobes and clears instead of washing the frame */
  S.shake*=Math.pow(.03,dt); S.flash=Math.max(0,S.flash-dt*(2.4+S.flash*14));
  /* hintT ages HERE, not in drawHUD where it used to sit: the HUD draws every
     frame including pause and menus, so the controls hint was burning down at
     a hard-coded 1/60 while the game was frozen (and at half speed on a 120Hz
     display). Timers live with the other timers, on dt. */
  S.hitT=Math.max(0,S.hitT-dt); S.tipT=Math.max(0,S.tipT-dt); S.hintT=Math.max(0,S.hintT-dt);
  if(S.bossWarn>0) S.bossWarn-=dt;
  if(S.P.hp<35 && (S.alarmT-=dt)<=0){ AUDIO.alarm(); S.alarmT = S.P.hp<18?.4:.8; }
  if(S.P.hp<=0) gameOver();
}
