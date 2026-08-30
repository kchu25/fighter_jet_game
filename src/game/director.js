/* ===== game/director.js — threat-budget spawning with sector pacing =====
   Split out of update()'s main loop: this is the one piece of per-frame logic
   that decides *what shows up*, as opposed to how existing entities move.

   Difficulty comes from enemy QUALITY (formations, speed, escorts), never raw
   count: a live threat budget caps how much can be airborne at once, and
   fights are chunked into sectors — build, peak, then a guaranteed lull — so
   the sky can't saturate into permanent spam the way the old
   shrink-the-interval-forever curve did. */
import { AUDIO } from '../audio/index.js';
import { rnd, lerp } from '../core/utils.js';
import { S, COL, EASE_CALM } from './state.js';
import { spawnBoss, spawnCruiser, spawnDrone, spawnCrate,
         spawnStriker, spawnMine, spawnLancer } from './combat.js';

const COST = { drone: 1, cruiser: 2.5, striker: 1.5, mine: .75, lancer: 2 };
function aliveCost(){ let c=0; for(const e of S.enemies) c+=COST[e.k]||1; return c; }

/* per-sector quality multipliers, all hard-capped so nothing grows forever */
function quality(){
  return Math.min(1, Math.min(1,S.ddist/40000) + .05*(S.sector-1));
}
function mults(){
  return {
    ds: Math.min(1.25, 1+.03*(S.sector-1)),   // drone speed
    da: Math.min(1.25, 1+.03*(S.sector-1)),   // drone jink amplitude
    cc: Math.max(.75, 1-.03*(S.sector-1)),    // cruiser first-shot cd
  };
}

/* ------------------------------------------------------------- formations
   ok() gates on quality q (and the old cruiser phase-in); go() places the
   members. waves:1 each — a formation is one wave for waveN bookkeeping. */
const FORMS = [
  { w:1,  cost:1,   drones:1, ok:q=>true,
    go:m=> spawnDrone({spdMul:m.ds,ampMul:m.da}) },
  { w:1,  cost:2,   drones:2, ok:q=>true,          // pair, line abreast
    go:m=>{ const x=rnd(-160,160), y=rnd(-120,120);
      spawnDrone({x:x-75,y,spdMul:m.ds,ampMul:m.da});
      spawnDrone({x:x+75,y,spdMul:m.ds,ampMul:m.da}); } },
  { w:1,  cost:3,   drones:3, ok:q=>q>.15,         // V of three
    go:m=>{ const x=rnd(-140,140), y=rnd(-100,100);
      spawnDrone({x,y:y+40,spdMul:m.ds,ampMul:m.da});
      spawnDrone({x:x-95,y:y-30,spdMul:m.ds,ampMul:m.da});
      spawnDrone({x:x+95,y:y-30,spdMul:m.ds,ampMul:m.da}); } },
  { w:1,  cost:2,   drones:2, ok:q=>q>.3,          // flank pair, closing inward
    go:m=>{ const y=rnd(-100,110);
      /* ph≈0 drifts +x, ph≈π drifts -x (update.js x += cos(ph)*amp) */
      spawnDrone({x:-240,y,ph:rnd(-.5,.5),         spdMul:m.ds*1.12,ampMul:m.da});
      spawnDrone({x: 240,y,ph:Math.PI+rnd(-.5,.5), spdMul:m.ds*1.12,ampMul:m.da}); } },
  { w:1,  cost:2.5, drones:0, ok:q=>true, cru:true,
    go:m=> spawnCruiser({cdMul:m.cc}) },
  { w:1,  cost:4.5, drones:2, ok:q=>q>.45, cru:true, // cruiser + escorts
    go:m=>{ const x=rnd(-150,150), y=rnd(-90,100);
      spawnCruiser({x,y,cdMul:m.cc});
      spawnDrone({x:x-110,y:y+30,spdMul:m.ds,ampMul:m.da});
      spawnDrone({x:x+110,y:y+30,spdMul:m.ds,ampMul:m.da}); } },
  { w:.7, cost:1.5, drones:1, ok:q=>q>.6,          // ace: fast hard-jinking single
    go:m=> spawnDrone({spdMul:m.ds*1.25,ampMul:m.da*1.6,c:COL.red}) },
  /* the new kinds all carry drones:3 so the first-run-ramp filter
     (f.drones<=1|2 && f.cost<=2.5) keeps every one of them out until easeT
     has burned off — a new pilot only ever ramps on plain drones */
  { w:.9, cost:3,   drones:3, ok:q=>q>.35,         // striker flank pair
    go:m=>{ const y=rnd(-90,110);
      spawnStriker({side:-1,y,spdMul:m.ds});
      spawnStriker({side: 1,y:y+rnd(-50,50),spdMul:m.ds}); } },
  { w:.9, cost:2.6, drones:3, ok:q=>q>.25,         // mine field of 3-4, scattered
    go:m=>{ const n=3+(Math.random()<.5?1:0), x=rnd(-120,120), y=rnd(-70,80);
      for(let i=0;i<n;i++) spawnMine({x:x+rnd(-170,170),y:y+rnd(-90,90)}); } },
  { w:.8, cost:2,   drones:3, ok:q=>q>.5,          // lancer solo
    go:m=> spawnLancer({cdMul:m.cc}) },
  { w:.7, cost:4,   drones:3, ok:q=>q>.7,          // lancer behind a drone screen
    go:m=>{ const x=rnd(-140,140), y=rnd(-80,90);
      spawnLancer({x,y,cdMul:m.cc});
      spawnDrone({x:x-100,y:y+40,spdMul:m.ds,ampMul:m.da});
      spawnDrone({x:x+100,y:y+40,spdMul:m.ds,ampMul:m.da}); } },
];

/* ------------------------------------------------------------------ director */
export function directorTick(dt, easeP){
  const alive = aliveCost();
  S.threat = alive;
  const q = quality();
  S.threatCap = 3.5 + 4.5*q;

  if(!S.boss){
    /* opening stretch of the first-run ramp: nothing in the sky at all, so the
       only thing to do is fly. S.spawnT is left alone, so the first wave lands
       the moment the calm lifts. */
    const calm = S.easeT>0 && easeP<EASE_CALM;
    const need = Math.min(18, 8+3*(S.sector-1));
    const prog = Math.min(1, (S.kills-S.sectorKills)/need);

    if(S.score>=S.nextBoss){ S.nextBoss=S.score+4600+S.waveN*1600; spawnBoss(); }
    else if(S.lullT>0){
      /* between-sector breather: nothing spawns, music sags, then a warning */
      if((S.lullT-=dt)<=0){ S.lullT=0; S.tipMsg='HOSTILES INBOUND'; S.tipT=2; }
    }
    else if(!calm && S.easeT<=0 && prog>=1 && alive<=1){
      /* sector clear: enough kills AND the sky nearly empty — reward + rest */
      S.tipMsg='SECTOR '+S.sector+' CLEAR'; S.tipT=3;
      S.sector++; S.sectorKills=S.kills; S.lullT=7;
      spawnCrate();
      AUDIO.sectorClear && AUDIO.sectorClear();
    }
    else if(!calm && (S.spawnT-=dt)<=0){
      /* pick a formation the budget can afford; if none fits, wait — never
         cram the sky just because the timer fired */
      const cru = S.waveN>3 && (S.easeT<=0 || easeP>.6);
      let pool = FORMS.filter(f=> f.ok(q) && (!f.cru || cru)
        && alive+f.cost<=S.threatCap);
      /* first-run ramp: keep waves at 1-2 drones, no big formations */
      if(S.easeT>0) pool = pool.filter(f=> f.drones<=(easeP<.55?1:2) && f.cost<=2.5);
      if(pool.length){
        let t=0; for(const f of pool) t+=f.w;
        let r=Math.random()*t, pick=pool[0];
        for(const f of pool){ if((r-=f.w)<=0){ pick=f; break; } }
        S.waveN++; pick.go(mults());
        if(Math.random()<(S.easeT>0?.30:.15)) spawnCrate();
        /* pacing floor: 0.9s at full quality — the old 0.4s treadmill is gone */
        S.spawnT = rnd(lerp(1.4,.9,q), lerp(2.2,1.4,q))
                 * (S.easeT>0 ? 1+2.1*(1-easeP) : 1);
      } else S.spawnT=.5; // over budget — poll again shortly
    }
    /* music tracks the sector arc: low in the lull, swelling toward the peak */
    let inten = S.lullT>0 ? .3
      : .38 + .38*prog + .18*Math.min(1, alive/S.threatCap);
    if(S.easeT>0) inten *= .55+.45*easeP;
    AUDIO.setIntensity(Math.min(1,inten));
  } else AUDIO.setIntensity(1);
  S.bossFx = lerp(S.bossFx, S.boss?1:0, Math.min(1,dt*1.5));
}
