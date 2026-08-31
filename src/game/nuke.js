/* ===== game/nuke.js — tactical nuclear strikes =====
   A warhead is released high and ahead of you, falls for ~1.1s, and detonates
   on the deck. What it leaves behind is a column of fire that scrolls down the
   corridor at world speed and CANNOT be out-run, out-climbed or shot: the only
   answer is lateral. Break left or break right, and commit — the fallout ring
   is wide enough that a half-hearted jink still cooks you.

   Why it lives outside update.js: the strike is a four-beat sequence (fall →
   detonation → blast wave → drifting column) with its own clocks, and folding
   that into the entity loop would bury it. Same reasoning that split out
   director.js.

   The geometry contract, which render/scene-draw.js and render/hud-draw.js
   both read: a nuke is a vertical cylinder at (k.x, k.z) with lethal radius
   coreR(k) and a fallout annulus out to FALL_MUL*coreR. The player sits at
   z=0, so |k.z| is the approach distance and BAND is how deep the danger
   band is — nothing about the hazard is height-dependent, because "fly over
   it" must never be an answer. */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp } from '../core/utils.js';
import { S, COL, SPAWN_Z, DESPAWN_Z, GROUND_Y } from './state.js';
import { mk, shock, shard, later, sparks } from './fx.js';
import { hurt, explode, pushComms, spawnCrate } from './combat.js';

/* release geometry — tuned together, do not move one without the others.
   Fall time from REL_Y under GRAV with REL_VY is ~1.09s, during which the
   world scrolls ~1250, so a warhead released at SPAWN_Z+REL_Z detonates near
   z=2650 and the column then needs ~2.3s to reach you. Total warning ≈ 3.4s,
   which is two comfortable envelope-crossings at full stick. */
const REL_Y = 1250, REL_VY = -260, REL_Z = 500, GRAV = 2100;

const CORE_R   = 200;   // lethal column radius, fully grown
const FALL_MUL = 1.74;  // fallout annulus reaches CORE_R*FALL_MUL ≈ 348
const BAND     = 400;   // z half-depth of the danger band
const GROW     = 1.15;  // seconds for the column to reach full width
/* The band is 2*BAND deep and the world scrolls at FLOW, so a column is only
   overlapping you for ~0.7s — and hurt() ignores anything inside its 0.65s
   invulnerability window. That means a pass through the column lands exactly
   ONE tick, so that single tick has to carry the whole cost of the mistake.
   Scaled by how central the pass was: a graze off the rim is survivable, dead
   centre is 160 against a 70 shield + 100 hull and leaves you on fumes. */
const CORE_DMG = 55, CORE_DMG_MAX = 160;
const FALL_DMG = 14, FALL_DMG_MAX = 44;
const WAVE_SPD = 2400;  // blast front, faster than the world scrolls

/* Placement is deliberately never past ±175: the flight envelope is ±BX(238),
   so a column at 175 always leaves a clean pocket on the far side. Widening
   this makes strikes undodgeable, not harder. */
const MAX_OFF = 175;

/* z gap between successive warheads in a walk, and therefore the time you get
   to reverse the break. DO NOT SHRINK THIS. There is a hard cliff just under
   1900 and it is not where the raw numbers suggest: the jet crosses the full
   corridor in 0.92s and 1500 buys 1.30s, which looks like plenty, but each
   detonation also shoves you ~500/s AWAY from its ground zero — and because a
   walk alternates sides, that shove throws you straight at the next column.
   Below ~1900 you cannot both absorb the shove and reverse in time. Measured
   against an optimal dodger: 1900 costs 0% core hits, 1500 costs 71%.
   To make a walk harder, add warheads (more reversals) — never close the gap. */
const WALK_Z = [1900, 2350];

export function coreR(k){
  /* eased so the fireball punches out fast and then settles */
  const g = k.g||0, e = 1-(1-g)*(1-g);
  return 62 + (CORE_R-62)*e;
}
export function falloutR(k){ return coreR(k)*FALL_MUL; }

/* ------------------------------------------------------------------ spawn */
/* n warheads walked across the corridor: the first picks a side, each
   subsequent one lands on the OPPOSITE side and deeper, so surviving the
   first dodge immediately demands the reverse dodge. */
export function nukeStrike(n){
  if(!S.nukes) S.nukes=[];
  let side = Math.random()<.5?-1:1;
  let z = SPAWN_Z+REL_Z;
  for(let i=0;i<n;i++){
    S.nukes.push({
      x: side*rnd(115,MAX_OFF), y: REL_Y, z: z,
      vy: REL_VY, spin: rnd(0,6.28), seed: rnd(0,100),
      state:'fall', t:0, g:0, hitT:0, radT:0,
      wave:0, waveHit:false, trailT:0
    });
    /* gaps are jittered rather than uniform so a walk cannot be dodged on a
       metronome — you have to keep reading the corridor, not count beats */
    z += rnd(WALK_Z[0], WALK_Z[1]);
    side = -side;
  }
  S.nukeWarn = 4.2;
  pushComms('CONTROL','NUCLEAR LAUNCH DETECTED — BREAK AND CLEAR',1.0);
  AUDIO.nukeAlert && AUDIO.nukeAlert();
}

/* ------------------------------------------------------------- detonation */
function detonate(k){
  k.state='cloud'; k.t=0; k.g=0; k.y=GROUND_Y;
  const x=k.x, y=GROUND_Y, z=k.z;

  /* the light arrives now; the SOUND and the blast front arrive later, when
     k.wave catches up to you — that gap is most of why this reads as huge */
  AUDIO.boom && AUDIO.boom(2);
  S.shake = Math.min(52, S.shake+30);

  /* ground zero: a white core inside a swelling fireball, plus the ground
     flash that lights the deck before anything has had time to rise */
  S.parts.push(mk(x,y+70,z, 0,0,0, COL.white, .55, 300, 0, 0, 2.6));
  S.parts.push(mk(x,y+70,z, 0,0,0, [1,.92,.62], .85, 420, 0, 0, 3.2));
  S.parts.push(mk(x,y+40,z, 0,0,0, [1,.52,.12], 1.5, 520, 0, 0, 3.6));
  shock(x,y+60,z,  50, 2600, 1.5, 46, COL.white, 1.3);
  shock(x,y+20,z,  30, 1900, 1.1, 66, [1,.66,.20], 1.2);
  shock(x,y,z,     40, 3200, 2.1, 30, [1,.86,.45], .9);

  /* the stem is born as a jet of fire climbing out of the crater */
  for(let i=0;i<40;i++)
    S.parts.push(mk(x+rnd(-70,70), y+rnd(0,120), z+rnd(-70,70),
      rnd(-210,210), rnd(420,1150), rnd(-210,210),
      i&1?[1,.62,.16]:COL.white, rnd(.8,1.7), rnd(60,130), 0, .5, 2.4));
  /* base surge: dirt thrown flat along the deck in every direction */
  for(let i=0;i<34;i++){
    const a=rnd(0,6.2832), sp=rnd(700,1900);
    S.parts.push(mk(x,y+rnd(0,50),z, Math.cos(a)*sp, rnd(20,180), Math.sin(a)*sp,
      i%3?[.42,.30,.22]:[1,.55,.18], rnd(1.0,2.0), rnd(70,150), 0, .35, 2.8));
  }
  for(let i=0;i<14;i++)
    shard(x+rnd(-90,90), y+rnd(0,90), z+rnd(-90,90),
      rnd(-1500,1500), rnd(300,1500), rnd(-1500,1500),
      rnd(.6,1.2), i&1?[1,.6,.2]:[.5,.42,.36], rnd(.7,1.3));

  /* staged secondaries walking outward — each is its own ring + fire pulse,
     so the fireball keeps re-blooming instead of peaking once and fading */
  for(let i=0;i<5;i++){
    later(.16+i*.19, x, y, z, (fx,fy,fz)=>{
      const rr = 240+i*220;
      shock(fx,fy+60+i*70,fz, rr*.35, rr*2.2, .8, 22+i*5, i&1?[1,.72,.26]:COL.white, .95);
      for(let j=0;j<10;j++){
        const a=rnd(0,6.2832), sp=rnd(200,700);
        S.parts.push(mk(fx+Math.cos(a)*rr*.4, fy+90+i*90+rnd(-40,40), fz+Math.sin(a)*rr*.4,
          Math.cos(a)*sp, rnd(180,620), Math.sin(a)*sp,
          j&1?[1,.58,.14]:[1,.86,.5], rnd(.7,1.4), rnd(80,170), 0, .45, 2.6));
      }
      S.shake=Math.min(52,S.shake+7);
    });
  }

  /* The set piece lands here. The boss is DELETED, not damaged: no score, no
     combo, no kill credit — the same rule the fireball already applies to
     everything else it swallows, and the whole point of the beat. The crates
     are salvage, and the only apology for a fight taken off you.
     The bossN===0 test closes a narrow race: if the player finished the boss
     during the fall, bossN has already ticked and this must not fire on
     whatever spawned next. */
  if(k.bossKill && S.boss && S.bossN===0){
    const b=S.boss;
    explode(b, b.x, b.y, b.z);
    S.boss=null; S.bossN++;
    for(let i=0;i<2;i++) spawnCrate();
    later(1.7, 0,0,0, ()=>
      pushComms('CONTROL','SPLASH. WE COULD HAVE DONE THAT AT ANY TIME.',1));
  }

  /* everything in the fireball is simply gone — no score, it is not your kill */
  for(let i=S.enemies.length-1;i>=0;i--){
    const e=S.enemies[i];
    if(Math.hypot(e.x-x, e.z-z) > 900) continue;
    later(rnd(0,.5), e.x, e.y, e.z, (fx,fy,fz)=>{
      explode({...e, x:fx, y:fy, z:fz}, fx, fy, fz);
    });
    S.enemies.splice(i,1);
  }
  /* wingmen caught in it go down the normal scripted-death path — update.js
     owns allyDown(), so this only raises the flag it watches for */
  for(const a of S.allies)
    if(a.state!=='dying' && a.state!=='rtb' && Math.hypot(a.x-x, a.z-z)<820) a.nuked=true;
}

/* ------------------------------------------------------------ blast front */
function waveHit(k){
  k.waveHit=true;
  /* the noise finally catches up, and the front physically throws the jet —
     shoved away from ground zero and lofted, which is the one moment the
     player is not in full control of the aircraft */
  AUDIO.nukeBoom && AUDIO.nukeBoom();
  S.shake = Math.min(56, S.shake+38);
  S.flash = Math.min(.5, S.flash+.30); S.flashC=[1,.86,.55];
  const away = S.P.x>=k.x ? 1 : -1;
  S.P.vx += away*rnd(420,640);
  S.P.vy += rnd(240,460);
  S.P.thr = Math.min(1, S.P.thr+.4);
  /* the front made visible: a ring racing past the camera */
  shock(k.x, GROUND_Y+340, k.z, 900, 3400, .7, 20, [.85,.92,1], .8);
}

/* ------------------------------------------------------------------ tick */
export function nukeTick(dt){
  if(!S.nukes) S.nukes=[];
  S.rad = 0;
  S.nukeFl = Math.max(0, S.nukeFl - dt*(.9+S.nukeFl*1.8));
  if(S.nukeWarn>0) S.nukeWarn-=dt;

  for(let i=S.nukes.length-1;i>=0;i--){
    const k=S.nukes[i];
    k.z -= S.flow*dt;
    k.t += dt;

    if(k.state==='fall'){
      k.vy -= GRAV*dt;
      k.y  += k.vy*dt;
      k.spin += dt*3.1;
      if((k.trailT-=dt)<=0){
        k.trailT=.02;
        S.parts.push(mk(k.x+rnd(-4,4), k.y+rnd(-4,4), k.z,
          rnd(-30,30), rnd(60,160), rnd(-30,30),
          Math.random()<.4?COL.white:[.8,.85,.95], rnd(.5,1.1), rnd(9,17), 0, .3, 1.4));
      }
      if(k.y<=GROUND_Y) detonate(k);
      continue;
    }

    /* ---- column phase */
    k.g = Math.min(1, k.g + dt/GROW);

    /* Teller double-flash: a knife-edge first peak, a dip, then a broader and
       brighter second peak as the fireball outruns its own shock front. This
       is the whiteout — attenuated with distance, but never below a floor,
       because even a far detonation has to blind. */
    const near = clamp(1 - (k.z-200)/3600, .55, 1);
    const f1 = Math.exp(-Math.pow(k.t/.055, 2));
    const f2 = .95*Math.exp(-Math.pow((k.t-.30)/.30, 2));
    S.nukeFl = Math.max(S.nukeFl, Math.min(1, (f1+f2)*near));

    /* blast front, expanding from the (still scrolling) ground zero */
    if(!k.waveHit){
      k.wave += WAVE_SPD*dt;
      const d = Math.hypot(S.P.x-k.x, S.P.y-GROUND_Y, k.z);
      if(k.wave >= d) waveHit(k);
    }

    /* ---- the actual hazard: lateral distance, inside the depth band */
    const az = Math.abs(k.z);
    if(az < BAND){
      const dx = Math.abs(S.P.x - k.x);
      const rc = coreR(k), rf = falloutR(k);
      if(dx < rc){
        S.rad = 1;
        if((k.hitT-=dt)<=0){
          /* 0.7s spacing clears hurt()'s 0.65s invulnerability window, so
             every tick actually lands — same trick the swarm engulf uses */
          k.hitT=.7;
          const pen = 1 - dx/rc;
          hurt(Math.round(CORE_DMG + (CORE_DMG_MAX-CORE_DMG)*pen), null);
          sparks(S.P.x, S.P.y, 10, 16, 700, 1.3, [1,.6,.15], 0,0,-1, 1);
        }
      } else if(dx < rf){
        const lvl = (1 - (dx-rc)/(rf-rc)) * (1 - az/BAND);
        S.rad = Math.max(S.rad, lvl);
        if((k.radT-=dt)<=0){
          k.radT=.75;
          hurt(Math.round(FALL_DMG + (FALL_DMG_MAX-FALL_DMG)*lvl), null);
        }
      }
    }

    if(k.z < DESPAWN_Z-700) S.nukes.splice(i,1);
  }

  if(S.rad>.04) AUDIO.geiger && AUDIO.geiger(S.rad);
}

/* ------------------------------------------------- first-boss set piece */
/* Once per run, the opening boss is not yours to kill. Partway through the
   fight CONTROL calls a release and the thing you have been grinding down is
   deleted by one warhead — dropped close enough that the column it leaves
   still has to be flown around.

   It has to be the FIRST boss. The beat only works on the fight you assumed
   was the test, and only the first time; on any later boss it would read as a
   mechanic rather than a betrayal.

   This is the one strike that ignores every gate in nukeSchedule (it fires
   DURING a boss, which is otherwise forbidden), so it is scheduled here
   instead. The normal scheduler stays suppressed throughout on its own: the
   boss blocks it, and then the live column does. */
const BN_WARN = 3.2;   // seconds of warning between the release call and the drop
const BN_FALL = 1.086; // fall time from REL_Y — see the release-geometry block

function bossNukeTick(dt){
  if(S.bossNuke>=2) return;
  if(S.bossNuke===0){
    const b = S.boss;
    if(!b || S.bossN>0 || !b.here) return;
    /* The floor comes first and is not negotiable: the beat is a fight being
       taken away, so there has to have BEEN a fight. A rapid-fire pickup can
       put the boss under 60% within a couple of seconds of it arriving, and
       firing then reads as a scripted cutscene rather than a betrayal.
       Past the floor, either trigger is enough — the timer covers a pilot who
       cannot dent it, the hp gate covers one who is shredding it, and without
       that gate a fast run would finish the boss and never see this at all. */
    if(b.t < 8) return;
    if(b.t < 15 && b.hp/b.max > .6) return;
    S.bossNuke=1; S.bossNukeT=BN_WARN;
    S.bossWarn=2.4; S.bossWarnName='BREAK OFF — DANGER CLOSE';
    pushComms('CONTROL','TAC RELEASE AUTHORISED — BREAK OFF NOW',1);
    AUDIO.nukeAlert && AUDIO.nukeAlert();
    return;
  }
  if((S.bossNukeT-=dt)>0) return;
  S.bossNuke=2;

  /* Aimed to detonate ON the boss: the warhead scrolls with the world all the
     way down, so it is released a full fall's worth of scroll further out.
     x is still clamped to MAX_OFF even though a boss can sit wider than that —
     the column must leave the player a pocket, and a boss hull is wide enough
     that the hit still reads from the far side of the clamp. */
  const b = S.boss;
  S.nukes.push({
    x: clamp(b?b.x:0, -MAX_OFF, MAX_OFF), y: REL_Y, z: (b?b.z:1500) + S.flow*BN_FALL,
    vy: REL_VY, spin: rnd(0,6.28), seed: rnd(0,100),
    state:'fall', t:0, g:0, hitT:0, radT:0,
    wave:0, waveHit:false, trailT:0, bossKill:true
  });
  S.nukeWarn = 4.2;
  pushComms('CONTROL','SHOT OUT — CLEAR THE AXIS',1);
}

/* --------------------------------------------------------------- schedule */
/* Called from the director. SCHEDULED strikes are an EVENT, not a spawn
   channel: they only land in open sky (never mid-boss, never on the first-run
   ramp) and never overlap each other, because two live WALKS in the corridor
   at once leaves no clean lane anywhere in it. The first-boss set piece above
   is the deliberate exception and books its own drop. */
export function nukeSchedule(dt){
  bossNukeTick(dt);
  /* The clock runs on wall time and the gates only hold back the RELEASE. If
     the countdown itself were gated it would barely advance: bosses alone eat
     most of a run, so a strike armed behind them lands minutes late, or never.
     Once it is armed it stays armed and fires the moment the sky is its own. */
  if(S.nukeT>0 && (S.nukeT-=dt)>0) return;
  if(S.boss || S.easeT>0 || S.sector<2 || S.lullT>0){ return; }
  if(S.nukes && S.nukes.length){ return; }
  const s = S.sector;
  /* Uneven on purpose. A third of the time the next strike is already on its
     way before the last column is off the screen; the rest of the time you get
     a breather that shortens as the run goes on. A fixed interval would let
     you park in a lane and count, which is exactly the autopilot this hazard
     exists to break. */
  S.nukeT = Math.random()<.34 ? rnd(6,11)
                              : rnd(15,26) - Math.min(8, s*.7);
  /* Warheads walk across the corridor on alternating sides, so n is literally
     how many times you are made to reverse the break. */
  nukeStrike(s>=9 ? 5 : s>=6 ? 4 : s>=4 ? 3 : 2);
}
