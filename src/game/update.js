/* ===== game/update.js — per-frame simulation: player, entities, projectiles ===== */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp, lerp } from '../core/utils.js';
import { S, COL, SPAWN_Z, DESPAWN_Z, BX, BY, FLOW, EASE_LEN, EASE_CALM } from './state.js';
import { ATT } from '../render/gl.js';
import { keys, mouse } from './input.js';
import { mk, sparks, shard, shock, later } from './fx.js';
import { fireGuns, fireMissiles, hitScan, nearestAhead, volley, hurt, take, explode,
         carrierLaunch, carrierVolley, dreadLance, dreadWall,
         sporeBarrage, levBirth, levLance } from './combat.js';
import { directorTick } from './director.js';
import { gameOver } from '../main.js';

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
      if(e.z>-70 && Math.hypot(e.x-S.P.x,e.y-S.P.y)<e.r+24){ hurt(e.k==='drone'?12:e.k==='mine'?16:e.k==='wasp'?8:22,e); continue; }
      /* a striker slipping out the back is not an "escape" — no combo reset */
      if(e.z<DESPAWN_Z){ S.enemies.splice(i,1); if(e.k!=='striker') S.combo=1; }
    }
  }

  /* S.boss — one object, three behaviour sets keyed by b.type. The shared
     skeleton (approach to a hold depth, phase from hp thirds, listing, rage
     smoke, hit decay) is identical for all; only movement + attack cycles
     branch. Every field a branch reads is initialised in spawnBoss(). */
  if(S.boss){
    const b=S.boss; b.t+=dt;
    const type=b.type||'mothership';
    /* the carrier hangs deeper — its threat launches at you, it doesn't */
    const holdZ = type==='carrier'?1700 : type==='dreadnought'?1600 : type==='leviathan'?1650 : 1500;
    if(!b.here){ b.z-=1500*dt; if(b.z<=holdZ){ b.z=holdZ; b.here=true;
      if(type==='leviathan') AUDIO.screech && AUDIO.screech(); } }
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

  /* S.allies — friendly two-ship: join → fight on your wing → scripted death.
     Doomed by design (the fiction is "you are the only bird in the air", so
     any company must be temporary). Enemies never target them, their tracers
     are real player-side shots, and combo/score are untouched by their loss. */
  for(let i=S.allies.length-1;i>=0;i--){
    const a=S.allies[i]; a.t+=dt;
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
      if(a.t>a.doom){
        /* the moment it's hit: mayday call, then a staggered string of
           visible impacts ON the hull (closures track the ally, not a fixed
           world point — the ally holds station while the world drifts) */
        a.state='dying'; a.dieT=0; a.thr=.2;
        AUDIO.mayday && AUDIO.mayday();
        for(const td of [0,.22,.45])
          later(td,0,0,0, ()=>{ if(a.state!=='dying') return;
            sparks(a.x+rnd(-14,14),a.y+rnd(-6,8),a.z, 10, 700, .9, COL.amber, 0,0,0, 0);
            shock(a.x,a.y,a.z, 6, 60, .3, 4, COL.amber, .8); });
      }
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
        S.tipMsg=a.cs+' IS DOWN'; S.tipT=2.5;
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

  if((S.comboT-=dt)<=0 && S.combo>1){ S.combo=Math.max(1,S.combo-1); S.comboT=1.1; }
  /* superlinear decay: a big S.flash strobes and clears instead of washing the frame */
  S.shake*=Math.pow(.03,dt); S.flash=Math.max(0,S.flash-dt*(2.4+S.flash*14));
  S.hitT=Math.max(0,S.hitT-dt); S.tipT=Math.max(0,S.tipT-dt);
  if(S.bossWarn>0) S.bossWarn-=dt;
  if(S.P.hp<35 && (S.alarmT-=dt)<=0){ AUDIO.alarm(); S.alarmT = S.P.hp<18?.4:.8; }
  if(S.P.hp<=0) gameOver();
}
