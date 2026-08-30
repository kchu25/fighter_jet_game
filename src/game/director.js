/* ===== game/director.js — wave-spawn pacing & boss-intro fade =====
   Split out of update()'s main loop: this is the one piece of per-frame logic
   that decides *what shows up*, as opposed to how existing entities move. */
import { AUDIO } from '../audio/index.js';
import { rnd, lerp } from '../core/utils.js';
import { S, EASE_CALM } from './state.js';
import { spawnBoss, spawnCruiser, spawnDrone, spawnCrate } from './combat.js';

/* ------------------------------------------------------------------ director */
export function directorTick(dt, easeP){
  if(!S.boss){
    /* opening stretch of the first-run ramp: nothing in the sky at all, so the
       only thing to do is fly. S.spawnT is left alone, so the first wave lands
       the moment the calm lifts. */
    const calm = S.easeT>0 && easeP<EASE_CALM;
    if(S.score>=S.nextBoss){ S.nextBoss=S.score+4600+S.waveN*1600; spawnBoss(); }
    else if(!calm && (S.spawnT-=dt)<=0){
      S.waveN++;
      const d=Math.min(1,S.ddist/46000);
      /* wave size and pace both trimmed ~20% at the top of the ramp (2.6->2.0,
         floor .34->.4) — noticeably less screen-filling at full difficulty
         without touching the early, already-gentle end of the curve */
      let n=1+((Math.random()*(1.4+d*2.0))|0);
      if(S.easeT>0) n=Math.min(n, easeP<.55?1:2);
      /* cruisers shoot back, so they are the last thing to phase in */
      const cru = S.waveN>3 && (S.easeT<=0 || easeP>.6);
      for(let i=0;i<n;i++) (cru && Math.random()<.32+d*.24) ? spawnCruiser() : spawnDrone();
      if(Math.random()<(S.easeT>0?.30:.15)) spawnCrate();
      S.spawnT = Math.max(.4, 1.25-d*.85)*rnd(.75,1.25) * (S.easeT>0 ? 1+2.1*(1-easeP) : 1);
    }
    AUDIO.setIntensity((.32+Math.min(.42, S.ddist/50000)) * (S.easeT>0 ? .55+.45*easeP : 1));
  } else AUDIO.setIntensity(1);
  S.bossFx = lerp(S.bossFx, S.boss?1:0, Math.min(1,dt*1.5));
}
