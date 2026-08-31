/* ===== game/combat.js — weapons, enemy spawning, hit-testing, damage/violence ===== */
import { AUDIO } from '../audio/index.js';
import { rnd, clamp, lerp } from '../core/utils.js';
import { S, COL, EASE_LEN, SPAWN_Z, FOVY } from './state.js';
import { ATT, W, H } from '../render/gl.js';
import { camP, toScreen } from '../render/scene-draw.js';
import { mouse } from './input.js';
import { mk, shock, shard, later, sparks, burst, pop } from './fx.js';

/* ------------------------------------------------------------------ comms
   Radio traffic: short attributed lines stacked bottom-left on the HUD
   (hud-draw.js renders, update.js ages). Every push keys a garbled radio
   voice burst — urgency u (0..1) drives both the voice and the red tint
   maydays get on screen (u>=.9). */
export function pushComms(who,txt,u){
  if(!S.comms) S.comms=[];
  S.comms.push({who,txt,t:0,u:u||.5});
  while(S.comms.length>4) S.comms.shift();
  AUDIO.radio && AUDIO.radio(u||.5);
}

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
export function spawnStriker(o={}){
  /* attack-run fighter: enters from a flank, cuts toward the centre, fires
     one aimed burst, then breaks off laterally (update.js owns the run) */
  const side = o.side ?? (Math.random()<.5?-1:1);
  S.enemies.push({k:'striker',x:o.x??side*420,y:o.y??rnd(-100,120),z:SPAWN_Z,hp:3,r:36,rz:50,
    ph:o.ph??rnd(0,6.28),amp:0,spd:rnd(1600,1800)*(o.spdMul||1),
    vx:-side*rnd(260,360),vy:rnd(-40,40),side,fired:false,
    c:o.c||COL.green,roll:0,yaw:Math.PI});
}
export function spawnMine(o={}){
  /* proximity mine: slow drifting fuse, easy to shoot (generous r) */
  S.enemies.push({k:'mine',x:o.x??rnd(-260,260),y:o.y??rnd(-140,150),z:SPAWN_Z,hp:1,r:40,rz:40,
    ph:o.ph??rnd(0,6.28),amp:0,spd:rnd(480,560)*(o.spdMul||1),
    vx:0,vy:0,beepT:0,
    c:o.c||COL.red,roll:rnd(0,6.28),yaw:rnd(0,6.28)});
}
export function spawnLancer(o={}){
  /* telegraphed sniper: has max so the wounded list/smoke behaviour applies */
  const hp = 6+S.waveN*.4;
  S.enemies.push({k:'lancer',x:o.x??rnd(-220,220),y:o.y??rnd(-110,120),z:SPAWN_Z,hp,max:hp,r:52,rz:56,
    ph:o.ph??rnd(0,6.28),amp:rnd(25,60)*(o.ampMul||1),spd:rnd(560,640)*(o.spdMul||1),
    cd:rnd(1.2,2.2)*(o.cdMul||1)+(S.easeT>0?1.5:0),chg:0,
    c:o.c||COL.purple,roll:0,yaw:0});
}
export function spawnWasp(o={}){
  /* bio swarmer: flutters (fast low-amp jink) and homes weakly on the player.
     Melee only — no ranged attack; hp 1, dies to anything. vx/vy are the
     homing pull, ph drives the flutter (update.js advances it ~7/s). */
  S.enemies.push({k:'wasp',x:o.x??rnd(-250,250),y:o.y??rnd(-140,150),z:o.z??SPAWN_Z,hp:1,r:26,rz:34,
    ph:o.ph??rnd(0,6.28),amp:rnd(60,120)*(o.ampMul||1),spd:rnd(1300,1550)*(o.spdMul||1),
    vx:0,vy:0,c:o.c||COL.bio,roll:0,yaw:Math.PI});
}
export function spawnRavager(o={}){
  /* organic gunship: slow heave, constant writhe, spits fat slow glob bursts.
     Has max so the wounded list/smoke behaviour applies (writhe is blended in
     by update.js on top of the wounded list). */
  const hp = Math.min(22, 8+S.waveN*.5);
  S.enemies.push({k:'ravager',x:o.x??rnd(-230,230),y:o.y??rnd(-110,120),z:o.z??SPAWN_Z,hp,max:hp,r:60,rz:60,
    ph:o.ph??rnd(0,6.28),amp:rnd(70,130)*(o.ampMul||1),spd:rnd(560,680)*(o.spdMul||1),
    cd:rnd(2.2,3.0)*(o.cdMul||1)+(S.easeT>0?1.5:0),
    c:o.c||COL.bio,roll:0,yaw:Math.PI});
}
export function spawnSwarm(o={}){
  /* fly-swarm: one entity rendered as a seething cloud of ~24 sprites
     (scene-draw.js branches on the kind — there is deliberately NO mesh).
     Hunts the player harder than anything else airborne and ENGULFS on
     contact: continuous chip damage instead of a ram (update.js owns it).
     hp0 (not max) tracks the full pool so the wounded-hull list/smoke path
     never runs on it — a cloud can't list; it thins instead. */
  const hp=Math.min(14, 7+S.waveN*.3);
  S.enemies.push({k:'swarm',x:o.x??rnd(-230,230),y:o.y??rnd(-120,130),z:o.z??SPAWN_Z,
    hp,hp0:hp,r:55,rz:55,seed:rnd(0,100),
    ph:o.ph??rnd(0,6.28),amp:0,spd:rnd(1000,1200)*(o.spdMul||1),
    vx:0,vy:0,eng:0,engulf:false,
    c:o.c||[0.35,0.62,0.20],roll:0,yaw:Math.PI});
}
export function spawnCrate(){
  S.crates.push({x:rnd(-220,220),y:rnd(-120,130),z:SPAWN_Z,
    kind:['shield','rapid','spread'][(Math.random()*3)|0],spin:0});
}
/* friendly flight: spawns behind/below the player view and climbs to a
   station beside them, topping the formation up to 2 ships total (surviving
   'wing' ships from earlier flights count toward the cap). Each new ship
   carries a fate rolled here: at its doom time it either goes down on-screen
   ('die') or shakes the hit and stays as a permanent wingman ('wing').
   The FIRST ally event of a run guarantees exactly one survivor — the other
   still dies, because the death spectacle is the point — later events roll
   ~45% per ship. update.js owns the whole lifecycle. */
export function spawnAllies(){
  const pool=[['VIPER 2',-1],['VIPER 5',1],['VIPER 3',-1],['VIPER 6',1]]
    .filter(([cs])=>!S.allies.some(a=>a.cs===cs));
  const need=Math.min(pool.length, Math.max(0, 2-S.allies.length));
  if(need<=0) return;
  const first=S.allyFirst; S.allyFirst=false;
  const d0=rnd(5.5,7.5);
  for(let n=0;n<need;n++){
    const [cs,side]=pool[n];
    const fate = (first&&need>1) ? (n===need-1?'wing':'die')
               : (Math.random()<.45?'wing':'die');
    S.allies.push({cs,side,
      x:S.P.x+side*170, y:-120, z:-150, vx:0, vy:0,
      stx:side*rnd(160,200), sty:rnd(-20,30), stz:rnd(750,950),
      ph:rnd(0,6.28), t:0, doom:n===0?d0:d0+rnd(1.5,2.5),
      state:'join', fate, joinSector:0, hazT:0,
      roll:0, yaw:0, pitch:0, thr:.8,
      fireT:rnd(.8,1.4), burnT:0, dieT:0, hitN:0});
  }
}
export function spawnBoss(){
  /* keyed off S.bossN (bosses defeated this run), not S.waveN (trash-mob waves,
     never resets) — see the S.bossN declaration above for why. 440 base is
     ~20-30s of sustained accurate fire for a first-time S.boss encounter;
     +150/S.boss keeps later encounters escalating without runaway growth.

     Boss TYPE rotates with bossN: mothership (bolt volleys), hive carrier
     (summons trash from its bays), dreadnought (telegraphed lance + bolt
     walls), leviathan (bio shotgun + wasp births), warden (rotating pinwheel
     platform), hunter-killer (tracks your lane, rakes it, pounces). All six
     stay ONE S.boss object — lockOn/hitScan/missiles/HUD concat [S.boss] and
     must keep working unchanged. Mothership stays index 0: the first boss of
     a run is scripted as one elsewhere. The carrier runs 0.9x HP (its escorts
     soak your fire), the dreadnought 1.1x, the hunter 0.95x (it spends whole
     seconds out of your guns on a pounce). */
  const type = ['mothership','carrier','dreadnought','leviathan','warden','hunter'][S.bossN%6];
  const name = type==='carrier'?'HIVE CARRIER' : type==='dreadnought'?'DREADNOUGHT'
             : type==='leviathan'?'LEVIATHAN' : type==='warden'?'WARDEN'
             : type==='hunter'?'HUNTER-KILLER' : 'MOTHERSHIP';
  const c    = type==='carrier'?COL.green : type==='dreadnought'?COL.red
             : type==='leviathan'?COL.bio : type==='warden'?COL.amber
             : type==='hunter'?COL.mag : COL.purple;
  const hp = Math.round((440+S.bossN*150)*(type==='carrier'?.9 : type==='dreadnought'?1.1
             : type==='leviathan'?1.05 : type==='hunter'?.95 : 1));
  const r  = type==='carrier'?240 : type==='dreadnought'?170 : type==='leviathan'?230
           : type==='warden'?200 : type==='hunter'?150 : 210;
  const rz = type==='carrier'?140 : type==='dreadnought'?210 : type==='leviathan'?170
           : type==='warden'?160 : type==='hunter'?190 : 150;
  /* every field ANY type's update branch reads is initialised here, so a
     branch can never touch an undefined on its first frame:
     chg/mode = dreadnought lance state (leviathan reuses both for its maw
     lance / attack cycle, the hunter both for its pounce charge and its whole
     stalk/rake/pounce state machine), alt = carrier & leviathan wave
     alternator (hunter: rake-or-pounce toggle), flash = carrier bay-launch /
     leviathan birth / warden iris / hunter muzzle glow, fcd = carrier
     phase-3 direct-fire cd (warden: iris-ring cd), scr3 = leviathan phase-3
     screech latch, spin/sdir = warden pinwheel angle and its direction,
     pph = last frame's phase, so a branch can react to a phase CHANGE,
     rkN = hunter rake rounds left in the burst */
  S.boss={k:'boss',type,name,x:0,y:40,z:SPAWN_Z+600,hp,max:hp,r,rz,c,
        phase:1,t:0,cd:1.2,dir:1,here:false,yaw:0,roll:0,list:0,hit:0,smk:0,
        chg:0,mode:type==='hunter'?'stalk':'lance',alt:false,flash:0,fcd:2.4,scr3:false,
        spin:0,sdir:1,pph:1,rkN:0};
  /* hud prints the warn phrase raw — the leviathan's carries its own verb */
  S.bossWarn=2.4; S.bossWarnName = type==='leviathan'?'LEVIATHAN RISING' : name+' INBOUND';
  pushComms('CONTROL','ALL BIRDS — HEAVY SIGNATURE INBOUND',.9);
  AUDIO.siren();
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
/* ----------------------------------------------------- hive carrier attacks */
export function carrierLaunch(b){
  /* the carrier's threat is SUMMONS: a small wave out of its bays each cycle.
     Hard cap: never push the arena past ~7 live enemies — the director is idle
     during a boss, but the whole game was redesigned away from spam and a
     summoner must not be the way it sneaks back in. Returns false when capped
     so update() can retry on a short cd instead of eating the whole cycle. */
  const wave = b.phase===1? ['drone','drone']
    : b.phase===2? ['drone','drone','striker']
    : (b.alt=!b.alt)? ['striker','striker','mine'] : ['drone','drone','drone'];
  if(S.enemies.length+wave.length>7) return false;
  const bays=ATT.carrierBays;
  const off=(Math.random()*bays.length)|0;
  for(let i=0;i<wave.length;i++){
    const g=bays[(i+off)%bays.length];
    const x=clamp(b.x+g[0],-300,300), y=clamp(b.y+g[1],-140,150);
    if(wave[i]==='striker') spawnStriker({x,y});
    else if(wave[i]==='mine') spawnMine({x,y});
    else spawnDrone({x,y});
  }
  b.flash=.4; AUDIO.thud();
  return true;
}
export function carrierVolley(b){
  /* phase-3 only: a sparse 5-bolt aimed spread, pressure while the bays cycle */
  const V=2000, t=b.z/V;
  for(let i=0;i<5;i++){
    const a=i/4-.5, gx=b.x+a*300, gy=b.y-20;
    S.foes.push({x:gx,y:gy,z:b.z,vx:(S.P.x-gx)/t*.75+a*240,vy:(S.P.y-gy)/t*.75,
      vz:-V,dmg:9,c:COL.green,r:26});
  }
  AUDIO.thud();
}
/* ------------------------------------------------------ dreadnought attacks */
export function dreadLance(b){
  /* the lancer pattern scaled up: fired at the END of a 1.1s visible charge,
     aimed at the player's position AT FIRE TIME — dodged by moving after */
  const sp=ATT.dreadSpine, gx=b.x+sp[0], gy=b.y+sp[1], gz=b.z+sp[2];
  const V=3600, t=gz/V;
  S.foes.push({x:gx,y:gy,z:gz,vx:(S.P.x-gx)/t,vy:(S.P.y-gy)/t,vz:-V,dmg:16,c:COL.red,r:36});
  AUDIO.lance && AUDIO.lance();
}
export function dreadWall(b){
  /* a slow flat lattice spanning most of the arena, with 1-2 gaps ~180 wide —
     the dodge puzzle is finding and threading a gap before the wall lands */
  const gaps=[rnd(-170,170)];
  if(b.phase===1 || Math.random()<.55) gaps.push(rnd(-170,170));
  for(let gx=-320;gx<=320;gx+=64){
    let open=false;
    for(const g of gaps) if(Math.abs(gx-g)<90){ open=true; break; }
    if(open) continue;
    for(let gy=-130;gy<=130;gy+=65)
      S.foes.push({x:gx,y:gy,z:b.z,vx:0,vy:0,vz:-1300,dmg:9,c:COL.red,r:26});
  }
  AUDIO.thud();
}
/* -------------------------------------------------------- leviathan attacks */
export function sporeBarrage(b){
  /* loose shotgun of slow fat bio globs with ONE guaranteed safe lane —
     the dodge puzzle is spotting the gap in the spray and holding it */
  const n = b.phase===1?8 : b.phase===2?10 : 12;
  const safe = rnd(-200,200);
  const vents = ATT.levVents, V=1100, t=b.z/V;
  let placed=0, tries=0;
  while(placed<n && tries<n*4){
    tries++;
    const g = vents[(Math.random()*vents.length)|0];
    const gx=b.x+g[0], gy=b.y+g[1];
    const tx=S.P.x+rnd(-260,260), ty=S.P.y+rnd(-140,140);
    if(Math.abs(tx-safe)<95) continue;         // keep the lane clear
    S.foes.push({x:gx,y:gy,z:b.z+g[2],vx:(tx-gx)/t,vy:(ty-gy)/t,vz:-V,dmg:9,c:COL.bio,r:36});
    placed++;
  }
  AUDIO.spit && AUDIO.spit();
}
export function levBirth(b){
  /* spews a wasp pod from the maw. Same anti-flood rule as the carrier:
     never past ~7 live enemies; returns false so update() retries on a
     short cd instead of eating the whole cycle. */
  const n = 3+(Math.random()<.5?1:0);
  if(S.enemies.length+n>7) return false;
  const mw=ATT.levMaw;
  for(let i=0;i<n;i++)
    spawnWasp({x:clamp(b.x+mw[0]+rnd(-60,60),-300,300),
               y:clamp(b.y+mw[1]+rnd(-40,40),-140,150),
               z:b.z+mw[2]});
  b.flash=.4; AUDIO.squish && AUDIO.squish(.8);
  return true;
}
export function levLance(b){
  /* the dreadnought's spine lance reskinned: fired at the END of a 1.2s maw
     charge, aimed at the player's position AT FIRE TIME */
  const mw=ATT.levMaw, gx=b.x+mw[0], gy=b.y+mw[1], gz=b.z+mw[2];
  const V=3400, t=gz/V;
  S.foes.push({x:gx,y:gy,z:gz,vx:(S.P.x-gx)/t,vy:(S.P.y-gy)/t,vz:-V,dmg:15,c:COL.bio,r:36});
  AUDIO.lance && AUDIO.lance();
}
/* ----------------------------------------------------------- warden attacks */
export function wardenPinwheel(b){
  /* k spokes off the iris, each an ARM of three bolts on a lateral-speed ramp.
     One speed per spoke would land the whole tick on a single radius and leave
     the middle of the arena permanently safe; the ramp is what makes an arm
     sweep the box instead of drawing a ring. b.spin advances between ticks, so
     consecutive arms lay down a spiral — and the spin reverses on every phase
     change, which is the only thing the player has to re-learn. */
  const k = b.phase===1?3 : b.phase===2?4 : 5;
  /* Arms are SHORT in phase 1. A full three-bolt arm reaches past the envelope,
     so k of them sweep the entire box and the only survivable line is the
     rotating gap: an evasive bot that ran out a 90s clock against four of the
     other five bosses died to phase-1 warden in 41s. Two bolts leaves the outer
     band open while the spin is still being read. */
  const arm = b.phase===1?2:3;
  const V=1400, r0=40;
  for(let i=0;i<k;i++){
    const a=b.spin+i*Math.PI*2/k;
    /* the platform flies yaw≈PI, which mirrors mesh x — the fan is mirrored
       the same way or the spiral would turn against the arms you can see */
    const dx=-Math.cos(a), dy=Math.sin(a);
    for(let j=0;j<arm;j++){
      /* the bolts of an arm land on fixed radii, which would leave
         two permanently safe annuli to camp in — the creeping offset walks
         those rings outward every tick so no distance from the hub is ever
         safe twice running */
      const lat=(b.t*41)%92 + j*92;
      /* y is squeezed to the flight envelope's aspect (476x300), so one arm
         reaches the top and the side of the box at the same moment */
      S.foes.push({x:b.x+dx*r0,y:b.y+dy*r0*.66,z:b.z,
        vx:dx*lat,vy:dy*lat*.66,vz:-V,dmg:8,c:COL.amber,r:26});
    }
  }
  b.flash=.24; AUDIO.thud();
}
export function wardenRing(b){
  /* the iris opens: a ring of bolts expanding to roughly the size of the
     flight envelope with ONE sector left out. Same guaranteed-safe-lane
     philosophy as sporeBarrage, but the answer is angular — sit in the gap,
     or be inside the ring when it arrives. Phase 3 adds a tighter second ring
     on the SAME gap angle, so it stays one lane and not two puzzles. */
  const V=1300, T=b.z/V, n=26, gap=rnd(0,Math.PI*2);
  for(const m of (b.phase===3?[1,.6]:[1]))
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2;
      /* signed angular distance to the gap centre, wrapped into ±PI */
      if(Math.abs(((a-gap+Math.PI*3)%(Math.PI*2))-Math.PI) < .5) continue;
      const cs=Math.cos(a), sn=Math.sin(a);
      S.foes.push({x:b.x+cs*60,y:b.y+sn*40,z:b.z,
        vx:cs*(250*m-60)/T,vy:sn*(165*m-40)/T,vz:-V,dmg:10,c:COL.amber,r:28});
    }
  b.flash=.6; AUDIO.lance && AUDIO.lance();
}
/* ---------------------------------------------------- hunter-killer attacks */
export function hunterRake(b){
  /* one round of the rake stream, alternating wing pods. The pods are
     boresighted — each round is angled to cross the hull's own centreline at
     the player's depth, because a pair of parallel streams 124 apart would
     straddle a target sitting dead ahead and the whole point is that the lane
     it occupies is the lethal one. Still not aimed: the convergence is fixed
     geometry, and update.js freezes its tracking for the burst. Without that
     committed window the stream would just follow you, which is not hard,
     only unfair. */
  const g=ATT.hunterGuns[b.rkN&1], V=1900, gz=b.z+g[2], T=gz/V;
  S.foes.push({x:b.x+g[0],y:b.y+g[1],z:gz,
    vx:-g[0]/T+rnd(-16,16),vy:rnd(-14,14),vz:-V,dmg:8,c:COL.mag,r:24});
  b.flash=.1;
}
export function hunterSpread(b){
  /* the bottom of the pounce: a point-blank fan down its own axis, NOT aimed.
     Flight time from the dive depth is only ~0.3s, so the shot itself cannot
     be reacted to — what is dodgeable is the second of frozen charge and the
     dive that precede it, which say exactly which lane is about to be sprayed. */
  const n = b.phase===3?9:7, V=2200;
  for(let i=0;i<n;i++){
    const a=i/(n-1)-.5;
    /* it hangs a little above your lane (see the y tracking in update.js), so
       the fan is thrown DOWN into it rather than fired flat */
    S.foes.push({x:b.x,y:b.y-10,z:b.z,vx:a*900,vy:a*260-90,vz:-V,dmg:12,c:COL.mag,r:28});
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
/* organic kinds burst in ichor, not sparks — checked by kind (the leviathan
   boss is caught through e.type since its e.k is 'boss') */
export const BIOK = { wasp:1, ravager:1, leviathan:1, swarm:1 };
function isBio(e){ return !!(BIOK[e.k] || (e.type && BIOK[e.type])); }
export function impact(e,dmg,x,y,z,big,s){
  const heavy = e===S.boss || e.k==='cruiser';
  const pw = clamp(dmg*.4,.3,1.4);
  let dx=0,dy=0,dz=-1;
  if(s){ const l=Math.hypot(s.vx,s.vy,s.vz)||1; dx=-s.vx/l; dy=-s.vy/l; dz=-s.vz/l; }
  /* spray back down the shot line so the spark cone opens toward the camera */
  sparks(x,y,z, big?30:Math.min(20,9+(dmg*3|0)), (big?2100:1500)*(.65+pw*.45),
    big?1.5:1.25, (e===S.boss||isBio(e))?e.c:COL.cyan, dx,dy,dz, 1);
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
  /* organic deaths read WET: a few slow, fat, long-lived ichor blobs on top
     of the standard fireball, and a squish under the boom */
  if(isBio(e)){
    const bg = k==='boss'?2.2 : k==='ravager'?1.3 : 1;
    for(let i=0;i<3;i++)
      S.parts.push(mk(x+rnd(-R*.4,R*.4), y+rnd(-R*.3,R*.3), z+rnd(-R*.3,R*.3),
        rnd(-70,70), rnd(-30,90), rnd(-70,70),
        COL.bio, rnd(.9,1.5), rnd(30,52)*bg, 0, .5, 1.6));
    AUDIO.squish && AUDIO.squish(k==='boss'?2 : k==='ravager'?1 : .5);
    /* a killed swarm bursts: the whole cloud blows outward as green ichor */
    if(k==='swarm') sparks(x,y,z, 40, 1400, 1.3, COL.bio, 0,0,0, 0);
  }
  if(k==='boss'){
    /* each boss type dies in its own colour — c is e.c (purple/green/red) */
    shock(x,y,z, 40,1600, .95, 26, COL.white, 1);
    shock(x,y,z, 20, 820, .55, 34, c, 1);
    S.parts.push(mk(x,y,z, 0,0,0, COL.white, .26, 190, 0, 0, 1.5));
    sparks(x,y,z, 70, 2600, 1.9, c, 0,0,0, 0);
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
        for(let j=0;j<2;j++) shard(fx,fy,fz, rnd(-760,760),rnd(-160,640),rnd(-760,760), rnd(.4,.8), c, rnd(.4,.75));
        S.shake=Math.min(38,S.shake+15); S.flash=Math.min(.22,S.flash+.08); S.flashC=i&1?COL.amber:c;
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
    const pts=(e.k==='cruiser'?250:e.k==='ravager'?250:e.k==='lancer'?300:e.k==='swarm'?180:e.k==='striker'?150:e.k==='mine'?60:e.k==='wasp'?40:100)*S.combo; S.score+=pts;
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
