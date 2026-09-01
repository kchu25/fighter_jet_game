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

/* ===================================================== the hydrogen tier ===
   A second, rarer, much larger warhead. It is NOT a separate entity: it sets
   k.hyd and every radius, damage, timing and visual term below reads the flag,
   so it flows through the same geometry contract both renderers already use.
   Forking the code path would have meant forking the fairness argument too.

   THE PLACEMENT GEOMETRY, WORKED OUT — this is the part that has to be right.
   A column at k.x with lethal radius rc kills for |x-k.x| < rc, and the flight
   envelope is ±BX(238). Placement is always on one side, so the survivable
   lane is the far side and its width is:

       lane = (k.x - rc) - (-BX) = BX + k.x - rc

   which INCREASES with k.x. That is the opposite of the intuition that a fat
   column should be pulled inboard: moving it in eats the far-side lane from
   the wrong end. The number that guarantees fairness is the MINIMUM offset,
   not the maximum, and the tactical round's real guarantee is its floor of
   115 (lane = 238+115-200 = 153, its worst case).

   So the hydrogen round is placed FURTHER OUT, not nearer in, and its floor is
   chosen to preserve a comparable lane against a 300 core:

       HYD_OFF[0]=196  ->  lane = 238+196-300 = 134   (worst case)
       HYD_OFF[1]=268  ->  lane = 238+268-300 = 206   (best case)

   134 is a real lane — the jet is ~46 wide and crosses the corridor at ~660/s
   — but it is pinned against the wall, so the dodge is now "commit all the way
   out", not "drift to the quiet half". Meanwhile the core still covers
   [-104, +496] at the worst case, i.e. the whole centre and the whole near
   half: there is nowhere to hide but that outboard strip.

   Fallout gets its own, TIGHTER multiplier — 1.28 against the tactical 1.74 —
   and this is the correction that makes the tier work at all. On the shared
   1.74 the hydrogen annulus reached 522 and swallowed the far wall, so every
   round doses you no matter how well you fly. Measured: a bot with a perfect
   0% core-hit record still took 338 damage across one 15-warhead session
   against a 170-point pool, i.e. it died twice over having never once been in
   a fireball. That is an HP tax, which is the one thing this weapon must not
   be. At 1.28 the annulus is 384 and the floor placement leaves a 50-wide
   strip against the far wall that is genuinely clean:

       offset 196 -> lane [-238,-104] (134 wide), clean [-238,-188] (50 wide)
       offset 268 -> lane [-238, -32] (206 wide), clean [-238,-116] (122 wide)

   So the hydrogen round is the one that punishes a HALF break. It is the
   fireball that grew, not the ring; the fallout damage stays high precisely
   because there is now somewhere to stand that avoids all of it. */
const HYD_FALL_MUL = 1.28;
const HYD_CORE   = 300;
const HYD_GROW   = 1.45;  // slower bloom; still full width ~0.5s before the band
const HYD_DMG    = 75,  HYD_DMG_MAX = 205;   // dead centre is fatal, and should be
const HYD_FALL   = 22,  HYD_FALL_MAX = 66;
const HYD_WAVE   = 1500;  // slower front: flash first, wall of sound much later
const HYD_OFF    = [196, 268];
/* Wider than WALK_Z for the same reason WALK_Z is wide: the lane you must
   reach is further outboard AND the front shoves harder (620..900), so the
   reversal costs more. 2500 buys 2.17s of scroll against a ~0.65s traverse. */
const HYD_WALK_Z = [2500, 3050];

export function coreR(k){
  /* eased so the fireball punches out fast and then settles */
  const g = k.g||0, e = 1-(1-g)*(1-g);
  const R = k.hyd ? HYD_CORE : CORE_R, r0 = k.hyd ? 96 : 62;
  return r0 + (R-r0)*e;
}
export function falloutR(k){ return coreR(k)*(k.hyd?HYD_FALL_MUL:FALL_MUL); }
/* The fully-grown lethal radius for a tier. Read-only, and it exists for the
   RENDERER: coreR() eases from a seed up to this over GROW seconds because the
   hazard has to grow into its damage, but a fireball is at its widest the
   instant it exists and it is the cloud above it that grows. Sizing the glare
   off coreR() made the flash of a 300-radius warhead 96 units across, which is
   most of why the set piece needed a full-frame white rect to feel like
   anything. Nothing here may feed a damage or placement term. */
export function coreFull(k){ return k.hyd ? HYD_CORE : CORE_R; }

function mkWarhead(x, z, hyd, extra){
  const k = {
    x: x, y: REL_Y, z: z,
    vy: REL_VY, spin: rnd(0,6.28), seed: rnd(0,100),
    state:'fall', t:0, g:0, hitT:0, radT:0,
    wave:0, waveHit:false, trailT:0, hyd: !!hyd
  };
  if(extra) Object.assign(k, extra);
  /* every hydrogen round in the game is built here, so this is the one place
     the "have they actually seen one yet" flag can be set without the callers
     having to remember to. The scheduler reads it to stop forcing. */
  if(k.hyd) S.hydSeen = true;
  return k;
}
/* the x-placement for a tier, on a given side */
function offFor(hyd, side){
  return side * (hyd ? rnd(HYD_OFF[0], HYD_OFF[1]) : rnd(115, MAX_OFF));
}
/* the gap between two adjacent warheads: whenever EITHER of them is hydrogen
   the pair is spaced on the hydrogen budget, because the reversal is only as
   easy as the harder of the two lanes */
function gapFor(a, b){
  const g = (a||b) ? HYD_WALK_Z : WALK_Z;
  return rnd(g[0], g[1]);
}

/* ------------------------------------------------------------------ spawn */
/* n warheads walked across the corridor: the first picks a side, each
   subsequent one lands on the OPPOSITE side and deeper, so surviving the
   first dodge immediately demands the reverse dodge. */
export function nukeStrike(n, hydP, forceHyd){
  if(!S.nukes) S.nukes=[];
  hydP = hydP||0;
  let side = Math.random()<.5?-1:1;
  let z = SPAWN_Z+REL_Z;
  let prevH=false, anyH=false;
  /* One warhead in the walk can be PROMOTED rather than rolled. A probability
     alone is not a guarantee, and a feature nobody sees does not exist: at the
     old 12% against a two-warhead walk, ~78% of first eligible walks contained
     no hydrogen round at all, so the tier routinely went unseen for minutes —
     or for a whole run, since dying resets the sector. Not index 0: the beat
     is a walk that ESCALATES mid-dodge, so the promoted round wants to be one
     you are already committed away from. */
  const fi = forceHyd ? (n>1 ? 1+((Math.random()*(n-1))|0) : 0) : -1;
  for(let i=0;i<n;i++){
    /* per-warhead tier roll, so a walk can be all-tactical, all-hydrogen, or
       a mix — a mixed walk is the nastiest read, because the lane you have to
       reach moves outboard without warning halfway through */
    const h = (i===fi) || Math.random() < hydP;
    /* gaps are jittered rather than uniform so a walk cannot be dodged on a
       metronome — you have to keep reading the corridor, not count beats */
    if(i>0) z += gapFor(h, prevH);
    S.nukes.push(mkWarhead(offFor(h, side), z, h));
    prevH = h; anyH = anyH || h;
    side = -side;
  }
  S.nukeWarn = anyH ? 5.2 : 4.2;
  pushComms('CONTROL', anyH ? 'THERMONUCLEAR RELEASE — BREAK NOW, BREAK HARD'
                            : 'NUCLEAR LAUNCH DETECTED — BREAK AND CLEAR', 1.0);
  AUDIO.nukeAlert && AUDIO.nukeAlert(anyH?1:0);
}

/* ------------------------------------------------------------- detonation */
function detonate(k){
  k.state='cloud'; k.t=0; k.g=0; k.y=GROUND_Y;
  const x=k.x, y=GROUND_Y, z=k.z;
  /* One scale term drives the whole set piece so the two tiers cannot drift
     apart: h is 0 for tactical, 1 for hydrogen, and P is the linear blow-up. */
  const h = k.hyd?1:0, P = 1+h*.85;
  /* ...except for ember RADIUS, which gets its own, far gentler blow-up. P is
     applied to counts, speeds and offsets, and all three of those are things a
     bigger bomb should have more of. Radius is not: the ember pass is ~370
     additive sprites clustered on ground zero, so scaling each one 1.85x scales
     the AREA 3.4x and every one of them lands on top of every other. Measured
     at t=2.0 the ember pass alone carried the frame from .26 to .68 mean
     luminance — the fireball, the cloud and the flash were all innocent, and
     the hydrogen round was washing out because it threw more, bigger sparks.
     More embers, spread further, each no fatter: that reads as bigger. */
  const PS = 1+h*.25;

  /* the light arrives now; the SOUND and the blast front arrive later, when
     k.wave catches up to you — that gap is most of why this reads as huge.
     Which is exactly why the hydrogen round gets almost nothing here: a full
     boom(2) runs 1.78s and paints over the deliberate silence that the 7.6s
     hydrogen front is supposed to break. The tactical round is close enough
     and small enough that its own crack at flash time still reads right. */
  AUDIO.boom && AUDIO.boom(h ? .5 : 2);
  S.shake = Math.min(52+h*16, S.shake+30+h*16);

  /* ground zero: a white core inside a swelling fireball, plus the ground
     flash that lights the deck before anything has had time to rise */
  S.parts.push(mk(x,y+70,z, 0,0,0, COL.white, .55+h*.5, 300*PS, 0, 0, 2.6));
  S.parts.push(mk(x,y+70,z, 0,0,0, [1,.92,.62], .85+h*.7, 420*PS, 0, 0, 3.2));
  /* ...and the outermost ground flash does NOT get a life bonus either. At 2.9s
     it was still alive, 650 units across, when the column had scrolled to the
     camera — a soft orange disc covering the whole frame at the one moment the
     column is meant to be a wall going past. It is the flash, so it dies with
     the flash. */
  S.parts.push(mk(x,y+40,z, 0,0,0, [1,.52,.12], 1.5+h*.5, 520*PS, 0, 0, 3.6));
  shock(x,y+60,z,  50, 2600*P, 1.5+h*.7, 46, COL.white, 1.3);
  shock(x,y+20,z,  30, 1900*P, 1.1+h*.6, 66, [1,.66,.20], 1.2);
  shock(x,y,z,     40, 3200*P, 2.1+h*1.1, 30, [1,.86,.45], .9);
  /* the hydrogen round gets the extra beat a two-stage device earns: a second
     ring punched THROUGH the first one a fifth of a second later */
  if(h) later(.21, x, y, z, (fx,fy,fz)=>{
    shock(fx,fy+90,fz, 260, 5200, 1.7, 40, COL.white, 1.4);
    shock(fx,fy+30,fz, 120, 4200, 2.4, 54, [1,.80,.36], 1.1);
    S.shake=Math.min(68,S.shake+26);
  });

  /* the stem is born as a jet of fire climbing out of the crater */
  for(let i=0;i<40+h*34;i++)
    S.parts.push(mk(x+rnd(-70,70)*P, y+rnd(0,120), z+rnd(-70,70)*P,
      rnd(-210,210)*P, rnd(420,1150)*P, rnd(-210,210)*P,
      i&1?[1,.62,.16]:COL.white, rnd(.8,1.7)+h*.2, rnd(60,130)*PS, 0, .5, 2.4));
  /* base surge: dirt thrown flat along the deck in every direction. The
     hydrogen bonus is on SPEED, not on count or life: these are the embers that
     are still alive when the column reaches the player, and by then they are a
     few metres off the lens, so every extra one is another soft blob smeared
     over the frame at the exact moment the column is supposed to be the
     subject. Measured at t=3.3, the ember pass cost .040 of frame std. */
  for(let i=0;i<34+h*12;i++){
    const a=rnd(0,6.2832), sp=rnd(700,1900)*P;
    S.parts.push(mk(x,y+rnd(0,50),z, Math.cos(a)*sp, rnd(20,180), Math.sin(a)*sp,
      i%3?[.42,.30,.22]:[1,.55,.18], rnd(1.0,2.0)+h*.3, rnd(70,150)*PS, 0, .35, 2.8));
  }
  for(let i=0;i<14+h*12;i++)
    shard(x+rnd(-90,90)*P, y+rnd(0,90), z+rnd(-90,90)*P,
      rnd(-1500,1500)*P, rnd(300,1500)*P, rnd(-1500,1500)*P,
      rnd(.6,1.2)*P, i&1?[1,.6,.2]:[.5,.42,.36], rnd(.7,1.3));

  /* staged secondaries walking outward — each is its own ring + fire pulse,
     so the fireball keeps re-blooming instead of peaking once and fading */
  for(let i=0;i<5+h*4;i++){
    later(.16+i*(.19+h*.05), x, y, z, (fx,fy,fz)=>{
      const rr = (240+i*220)*P;
      shock(fx,fy+60+i*70,fz, rr*.35, rr*2.2, .8+h*.4, 22+i*5, i&1?[1,.72,.26]:COL.white, .95);
      for(let j=0;j<10+h*3;j++){
        const a=rnd(0,6.2832), sp=rnd(200,700)*P;
        S.parts.push(mk(fx+Math.cos(a)*rr*.4, fy+90+i*90+rnd(-40,40), fz+Math.sin(a)*rr*.4,
          Math.cos(a)*sp, rnd(180,620)*P, Math.sin(a)*sp,
          j&1?[1,.58,.14]:[1,.86,.5], rnd(.7,1.4)+h*.2, rnd(80,170)*PS, 0, .45, 2.6));
      }
      S.shake=Math.min(52+h*16,S.shake+7+h*5);
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
    if(Math.hypot(e.x-x, e.z-z) > 900*P) continue;
    later(rnd(0,.5), e.x, e.y, e.z, (fx,fy,fz)=>{
      explode({...e, x:fx, y:fy, z:fz}, fx, fy, fz);
    });
    S.enemies.splice(i,1);
  }
  /* wingmen caught in it go down the normal scripted-death path — update.js
     owns allyDown(), so this only raises the flag it watches for */
  for(const a of S.allies)
    if(a.state!=='dying' && a.state!=='rtb' && Math.hypot(a.x-x, a.z-z)<820*P) a.nuked=true;
}

/* ------------------------------------------------------------ blast front */
function waveHit(k){
  k.waveHit=true;
  const h = k.hyd?1:0;
  /* the noise finally catches up, and the front physically throws the jet —
     shoved away from ground zero and lofted, which is the one moment the
     player is not in full control of the aircraft.
     The hydrogen shove is bigger, but only because HYD_WALK_Z bought the time
     to absorb it: at ~0.1s velocity half-life a 900 shove displaces ~134 and
     costs ~0.25s of authority, against 2.17s of gap. Raising one without the
     other is exactly the mistake WALK_Z's comment warns about. */
  AUDIO.nukeBoom && AUDIO.nukeBoom(h);
  S.shake = Math.min(56+h*20, S.shake+38+h*20);
  S.flash = Math.min(.5+h*.22, S.flash+.30+h*.16); S.flashC=[1,.86,.55];
  const away = S.P.x>=k.x ? 1 : -1;
  S.P.vx += away*(h?rnd(620,900):rnd(420,640));
  S.P.vy += h?rnd(340,640):rnd(240,460);
  S.P.thr = Math.min(1, S.P.thr+.4+h*.2);
  /* the front made visible: a ring racing past the camera */
  shock(k.x, GROUND_Y+340, k.z, 900, 3400*(1+h*.7), .7+h*.4, 20, [.85,.92,1], .8);
  if(h) shock(k.x, GROUND_Y+180, k.z, 1400, 5200, 1.2, 26, [1,.90,.70], .6);
}

/* ------------------------------------------------------------------ tick */
export function nukeTick(dt){
  if(!S.nukes) S.nukes=[];
  S.rad = 0;
  /* The hydrogen wash is pulled down about four times faster than the tactical
     one. Its spike is allowed to be genuinely opaque ONLY because it does not
     last: the nukeFlH term in the rate is what buys the knife edge, and without
     it this decay alone (2.7/s at full) floors the frame at 0.85 white for a
     tenth of a second no matter what curve feeds it. */
  S.nukeFl = Math.max(0, S.nukeFl - dt*(.9 + S.nukeFl*1.8 + S.nukeFlH*9.0));
  S.nukeFlH = Math.max(0, S.nukeFlH - dt*5.2);
  /* the light on the world, which deliberately outlives the wash on the lens */
  S.nukeLt = Math.max(0, S.nukeLt - dt*(.30+S.nukeLt*.55));
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
          Math.random()<.4?COL.white:[.8,.85,.95], rnd(.5,1.1), rnd(9,17)*(k.hyd?2.1:1), 0, .3, 1.4));
      }
      if(k.y<=GROUND_Y) detonate(k);
      continue;
    }

    /* ---- column phase */
    const hy = k.hyd?1:0;
    k.g = Math.min(1, k.g + dt/(hy?HYD_GROW:GROW));

    /* Teller double-flash: a knife-edge first peak, a dip, then a broader and
       brighter second peak as the fireball outruns its own shock front. This
       is the whiteout — attenuated with distance, but never below a floor,
       because even a far detonation has to blind.

       THE HYDROGEN CURVE CHANGED, AND THIS IS THE REASON. It used to be a
       near-opaque hold of ~1.3s, i.e. the ENTIRE window between the detonation
       and the column reaching the band. Measured frame by frame against the
       tactical round at matched timestamps, it had LOWER contrast at every
       single one of them — mean luma .92/.94 against .70/.58, standard
       deviation .064/.069 against .090/.127. The bigger weapon literally
       showed less picture. "More epic" had been built as "more white", and a
       whiteout is the absence of an image: the fireball, the double cap, the
       skirt and the silhouetted deck were all happening underneath it where
       nobody could see them.

       So the hydrogen flash is now the sharper thing, not the longer thing: a
       genuinely opaque spike of about three frames (f1 is twice as tall and
       half as wide as the tactical one) collapsing into a translucent bloom
       (f2 is a THIRD of what it was) that the fireball reads through. The
       spectacle moved into the world — nukeFX() in render/scene-draw.js now
       carries the glare as an additive disc at ground zero, which is depth
       tested and so silhouettes the scenery instead of erasing it. */
    const near = clamp(1 - (k.z-200)/3600, hy?.74:.55, 1);
    const f1 = (hy?2.4:1)*Math.exp(-Math.pow(k.t/(hy?.038:.055), 2));
    const f2 = (hy?.34:.95)*Math.exp(-Math.pow((k.t-(hy?.26:.30))/(hy?.40:.30), 2));
    const fl = Math.min(1, (f1+f2)*near);
    S.nukeFl = Math.max(S.nukeFl, fl);
    if(hy) S.nukeFlH = Math.max(S.nukeFlH, fl);
    /* the glare has to be centred on SOMETHING, and it is whichever live
       detonation is currently the brightest — not the nearest, which would
       snap the centre across the frame the moment a second column caught up */
    if(fl >= S.nukeFl-1e-6){ S.nukeFlX = k.x; S.nukeFlZ = k.z; }
    /* the light on the world runs on its own, much slower clock: the wash is
       gone in a fifth of a second but the deck stays lit by the fireball for
       as long as there is a fireball.
       The hydrogen tail used to run to 3.4s at a 1.5 gain, which plateaued the
       bleach at FULL for the first 1.1s and still had it at half strength when
       the column arrived at the player. By then the fireball is the brightest
       thing in the frame on its own merits and the bleach was only fogging the
       far half of the deck — measured at t=3.3 it cost .025 of frame std and
       made the hydrogen round LOWER contrast than the tactical one. Shorter and
       slightly softer: still lit for the whole approach, gone by arrival. */
    const lt = Math.min(1, (hy?1.35:.62) * clamp(1-k.t/(hy?2.4:1.8), 0, 1) * near);
    if(lt > S.nukeLt){ S.nukeLt = lt; S.nukeLtX = k.x; S.nukeLtZ = k.z; }

    /* blast front, expanding from the (still scrolling) ground zero */
    if(!k.waveHit){
      k.wave += (hy?HYD_WAVE:WAVE_SPD)*dt;
      const d = Math.hypot(S.P.x-k.x, S.P.y-GROUND_Y, k.z);
      if(k.wave >= d) waveHit(k);
    }

    /* ---- the actual hazard: lateral distance, inside the depth band.
       BAND is deliberately NOT scaled by tier: 2*BAND of depth against FLOW is
       ~0.7s of overlap, which is exactly one hurt() tick, and "one tick carries
       the whole cost of the mistake" is the invariant the damage numbers are
       balanced against. A deeper hydrogen band would land two ticks and turn a
       survivable graze into an unavoidable kill. */
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
          const d0 = hy?HYD_DMG:CORE_DMG, d1 = hy?HYD_DMG_MAX:CORE_DMG_MAX;
          hurt(Math.round(d0 + (d1-d0)*pen), null);
          sparks(S.P.x, S.P.y, 10, hy?26:16, hy?1100:700, 1.3, [1,.6,.15], 0,0,-1, 1);
        }
      } else if(dx < rf){
        const lvl = (1 - (dx-rc)/(rf-rc)) * (1 - az/BAND);
        S.rad = Math.max(S.rad, lvl);
        if((k.radT-=dt)<=0){
          k.radT=.75;
          const d0 = hy?HYD_FALL:FALL_DMG, d1 = hy?HYD_FALL_MAX:FALL_DMG_MAX;
          hurt(Math.round(d0 + (d1-d0)*lvl), null);
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
  /* Stays TACTICAL on purpose. The beat is about who pulled the trigger, not
     about yield, and the hydrogen round's placement floor (±196) would put the
     column off the boss it is supposed to delete. */
  S.nukes.push(mkWarhead(
    clamp(b?b.x:0, -MAX_OFF, MAX_OFF), (b?b.z:1500) + S.flow*BN_FALL,
    false, {bossKill:true}));
  S.nukeWarn = 4.2;
  pushComms('CONTROL','SHOT OUT — CLEAR THE AXIS',1);
}

/* ------------------------------------------------------- barrage sessions */
/* The scheduler's rule is that two live WALKS in the corridor at once leaves
   no clean lane anywhere in it, and that rule is not negotiable. A session
   does not break it — it is ONE walk that never ends. Instead of committing n
   warheads up front, the session holds a single side-alternating cursor and
   releases the next round only once the world has scrolled a full HYD_WALK_Z
   past the last one, so the spacing along the corridor is bit-for-bit the
   spacing a hand-authored hydrogen walk would have had. It just never runs out.

   The consequence worth knowing: releases are ~2.4s apart and a column lives
   ~3.3s from detonation to despawn, so at most TWO columns exist at once and
   they are 2500+ apart in z. Never two in the danger band. */
const SESS_SECTOR = 3;    // not before the run has taught the ordinary strike
const SESS_ARM    = 2.4;  // seconds between the flash traffic and the first release

function sessionStart(){
  const s = S.sector;
  /* Long enough to stop being a strike and start being weather. At sector 4
     that is 11 warheads ≈ 27s of continuous release; by sector 12 it is the
     16 cap ≈ 39s. */
  const n = Math.min(16, 8 + Math.round(s*.75));
  S.nukeSess = { n:n, left:n, fired:0, side: Math.random()<.5?-1:1,
                 gapLeft:0, armT:SESS_ARM, t:0 };
  /* hud-draw.js hangs its own sustained banner off S.nukeSess directly rather
     than borrowing bossWarn, which belongs to the sector arc and would be
     stomped by (or stomp) a real capital-ship call. */
  S.nukeWarn = SESS_ARM + 2.2;
  pushComms('CONTROL','FLASH TRAFFIC — THERMONUCLEAR BARRAGE, MULTIPLE INBOUND',1.4);
  later(1.9, 0,0,0, ()=> pushComms('CONTROL','THEY ARE NOT AIMING AT YOU. STAY ALIVE ANYWAY',1.2));
  AUDIO.nukeAlert && AUDIO.nukeAlert(2);
}

function sessionEnd(msg){
  const q = S.nukeSess;
  S.nukeSess = null;
  /* The exit is a real breather, not a seam: nothing else may release until
     the last column of the session has scrolled clear and then some. */
  S.nukeSessT = rnd(84, 150) - Math.min(42, S.sector*3.2);
  S.nukeT = Math.max(S.nukeT, rnd(16,26));
  if(msg) pushComms('CONTROL', msg, 1.0);
  return q;
}

function sessionTick(dt){
  const q = S.nukeSess;
  q.t += dt;
  /* The sky THINS for the strike — it does not empty. Giving back 55% of each
     frame's spawn countdown roughly halves the formation rate for the duration,
     which is done this way rather than through lullT (whose side effects, music
     sag and an ally spawn on release, belong to the sector arc) and rather than
     by clamping spawnT (which re-asserts every frame and so blocks spawns
     outright). Blocking them outright was tried and it is worse: a fully
     committed break is clean of fallout by construction, so an empty sky turns
     a 40-second barrage into a 40-second pause. The fight has to continue,
     because the actual cost of a session is that you are PINNED to the wall
     and cannot manoeuvre to fight while you are there. */
  S.spawnT += dt*.55;
  /* A boss arriving mid-session ends it: "never mid-boss" outranks the event,
     and a capital ship plus a rolling barrage has no lane at all. */
  if(S.boss){ sessionEnd('BARRAGE ABORTED — DANGER CLOSE'); return; }
  if(q.armT>0){ q.armT-=dt; return; }

  if((q.gapLeft -= S.flow*dt) > 0) return;
  S.nukes.push(mkWarhead(offFor(true, q.side), SPAWN_Z+REL_Z, true));
  q.side = -q.side;
  q.gapLeft = rnd(HYD_WALK_Z[0], HYD_WALK_Z[1]);
  q.fired++; q.left--;
  /* one klaxon at the top and one on the last release; a klaxon per warhead
     would turn the whole session into an alarm and stop meaning anything */
  if(q.left===1) AUDIO.nukeAlert && AUDIO.nukeAlert(1);
  if(q.fired===3) pushComms('CONTROL','WALKING IT DOWN THE CORRIDOR — KEEP MOVING',1.0);
  if(q.left<=0) sessionEnd('LAST ROUND OUT — RIDE IT OUT');
}

/* --------------------------------------------------------------- schedule */
/* Called from the director. SCHEDULED strikes are an EVENT, not a spawn
   channel: they only land in open sky (never mid-boss, never on the first-run
   ramp) and never overlap each other, because two live WALKS in the corridor
   at once leaves no clean lane anywhere in it. The first-boss set piece above
   is the deliberate exception and books its own drop. */
export function nukeSchedule(dt){
  bossNukeTick(dt);
  if(!S.nukes) S.nukes=[];
  if(S.nukeSess){ sessionTick(dt); return; }
  if(S.nukeSessT>0) S.nukeSessT-=dt;

  const clear = !(S.boss || S.easeT>0 || S.sector<2 || S.lullT>0) && !S.nukes.length;
  /* The session clock is checked BEFORE the ordinary one and pre-empts it, so
     a session is never queued behind a routine strike that happens to be
     mid-countdown. Same wall-time rule as nukeT: gates hold back the release,
     never the countdown. */
  /* A barrage is a hydrogen event, so it must not be the pilot's INTRODUCTION
     to hydrogen. Measured without this gate, a strong run opened its session at
     52.5s and met its first hydrogen round at 54.9s — i.e. the tier and the
     sustained version of the tier arrived as one thing, which reads as noise
     rather than as an escalation. Requiring hydSeen forces the intended order:
     ordinary strike, then a walk with one hydrogen round in it, then a barrage. */
  if(S.nukeSessT<=0 && S.sector>=SESS_SECTOR && S.hydSeen && clear){ sessionStart(); return; }

  /* The clock runs on wall time and the gates only hold back the RELEASE. If
     the countdown itself were gated it would barely advance: bosses alone eat
     most of a run, so a strike armed behind them lands minutes late, or never.
     Once it is armed it stays armed and fires the moment the sky is its own. */
  if(S.nukeT>0 && (S.nukeT-=dt)>0) return;
  if(!clear) return;
  const s = S.sector;
  /* Uneven on purpose. A third of the time the next strike is already on its
     way before the last column is off the screen; the rest of the time you get
     a breather that shortens as the run goes on. A fixed interval would let
     you park in a lane and count, which is exactly the autopilot this hazard
     exists to break. */
  S.nukeT = Math.random()<.34 ? rnd(6,11)
                              : rnd(15,26) - Math.min(8, s*.7);
  /* Warheads walk across the corridor on alternating sides, so n is literally
     how many times you are made to reverse the break. hydP is the per-warhead
     chance the round is a hydrogen one: rare enough early that the ordinary
     strike is still the thing you learn, common enough deep that a routine
     walk stops being routine. */
  /* Measured against an autopiloted run that never dies: at the old sector-3
     gate the first hydrogen round landed at 47.8s of strong play, 54.8s of
     average play and 146.8s of weak play — and a real pilot who dies drops
     back to sector 1 and starts that clock again. The tier was effectively
     invisible. It opens at sector 2 now, and the FIRST eligible walk always
     carries one, so it is seen once on a guarantee and thereafter on a curve. */
  const hydP = s>=9 ? .55 : s>=7 ? .42 : s>=5 ? .32 : s>=3 ? .22 : .1;
  /* The guarantee waits for the SECOND strike, not the first. Forcing it on
     the first put a hydrogen round in the very first strike a pilot ever saw,
     which inverts the teaching order: the tactical round is what establishes
     "break left or right and commit", and the hydrogen round only reads as an
     escalation if there is something for it to escalate FROM. One ordinary
     strike first, then the promotion. */
  S.nukeN = (S.nukeN||0) + 1;
  nukeStrike(s>=9 ? 5 : s>=6 ? 4 : s>=4 ? 3 : 2, hydP, !S.hydSeen && s>=2 && S.nukeN>=2);
}
