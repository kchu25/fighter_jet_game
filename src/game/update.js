/* ===== game/update.js — per-frame simulation: player, entities, projectiles ===== */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp, lerp } from '../core/utils.js';
import { S, COL, SPAWN_Z, DESPAWN_Z, BX, BY, FLOW, EASE_LEN, EASE_CALM } from './state.js';
import { ATT } from '../render/gl.js';
import { keys, mouse } from './input.js';
import { mk, sparks, shard } from './fx.js';
import { fireGuns, fireMissiles, hitScan, nearestAhead, volley, hurt, take, explode,
         carrierLaunch, carrierVolley, dreadLance, dreadWall } from './combat.js';
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
    if(e.k==='cruiser' && (e.cd-=dt)<=0 && e.z>420 && e.z<2900){
      e.cd=rnd(.95,1.7);
      const g=ATT.cruiserGuns, V=2000, t=(e.z)/V;
      for(const gp of g){
        const gx=e.x+gp[0], gy=e.y+gp[1];
        S.foes.push({x:gx,y:gy,z:e.z,vx:(S.P.x-gx)/t*.8,vy:(S.P.y-gy)/t*.8,vz:-V,dmg:8,c:COL.amber,r:26});
      }
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
      if(e.z>-70 && Math.hypot(e.x-S.P.x,e.y-S.P.y)<e.r+24){ hurt(e.k==='drone'?12:e.k==='mine'?16:22,e); continue; }
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
    const holdZ = type==='carrier'?1700 : type==='dreadnought'?1600 : 1500;
    if(!b.here){ b.z-=1500*dt; if(b.z<=holdZ){ b.z=holdZ; b.here=true; } }
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
