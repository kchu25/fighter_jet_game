/* ===== main.js — bootstrap: menu flow, frame loop, cinematic hookup =====
   Imports game/update.js (which imports main.js's gameOver back) — a
   deliberate circular import. It's safe because both sides only reach the
   other's binding from inside a function body, never at module-evaluation
   time, so neither side needs the other's export to exist yet when its own
   top-level code runs. */
import { AUDIO } from './audio/index.js';
import { CINE } from './cinematic/scenes/index.js';
import { rnd } from './core/utils.js';
import { loadBest, submitRun } from './core/records.js';
import { S, COL, EASE_LEN, reset } from './game/state.js';
import { update } from './game/update.js';
import { render } from './render/scene-draw.js';
import { drawHUD } from './render/hud-draw.js';
import { burst, shock, sparks, shard } from './game/fx.js';
/* circular with input.js (input imports togglePause/setPaused from here) —
   safe for the same reason as main⇄update: only touched inside functions */
import { keys, mouse, tap } from './game/input.js';

/* ------------------------------------------------------------------ loop */
export let last=0, paused=false;
export function frame(t){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(t-last)/1000||.016); last=t;   // last updates even while paused, so dt can't spike on resume
  if(S.gameOn){ if(!paused) update(dt); }
  else { S.T+=dt; S.shake*=.9; S.flash=Math.max(0,S.flash-dt*2); }
  render(); drawHUD();
}

/* ----------------------------------------------------------------- pause */
export const pausedEl=document.getElementById('paused');
export function setPaused(on){
  if(!S.gameOn || on===paused) return;
  paused=on; pausedEl.classList.toggle('hidden', !on);
  if(on) AUDIO.suspend(); else AUDIO.resume();
}
export function togglePause(){ setPaused(!paused); }

/* ------------------------------------------------------------------ flow */
export const introEl=document.getElementById('intro'), overEl=document.getElementById('over');
export const logEl=document.getElementById('log'), launchBtn=document.getElementById('launch');
/* menu transmission — three beats, typed in at 330ms/line by showMenu below:
   a dying signal → the sky is already lost → you are what's left. ALL-CAPS
   terminal voice; innerHTML, so entities are fine and cheap drama is legal */
export const LINES=[
  '&gt; INCOMING TRANSMISSION &mdash;&mdash; SIGNAL DEGRADED &mdash;&mdash; DECRYPTING&hellip;',
  '&gt; ORBITAL GRID ANNIHILATED. HIVE FLEET DESCENDING ON SECTOR 7.',
  '&gt; EVERY OTHER WING IS ASH. YOU ARE THE LAST BIRD IN THE AIR. GO.'
];
export let li=0, menuShown=false;
export function showMenu(){
  introEl.classList.remove('hidden');
  const best = loadBest();
  if(best){
    const el = document.getElementById('best');
    el.textContent = `SERVICE RECORD · BEST ${best.score.toLocaleString()} · ${(best.dist/1000).toFixed(1)} KM · ${best.kills} KILLS`;
    el.style.display = 'block';
  }
  if(menuShown){ launchBtn.classList.add('on'); return; }
  menuShown=true;
  (function pushLine(){
    if(li>=LINES.length){ launchBtn.classList.add('on'); return; }
    const d=document.createElement('div'); d.innerHTML=LINES[li++]; logEl.appendChild(d);
    setTimeout(pushLine,330);
  })();
  setTimeout(()=>launchBtn.classList.add('on'), 900);
}

export function start(){
  AUDIO.init(); reset();
  S.runNo++;
  /* the on-ramp is for a genuine first play only; every retry is full pace */
  const firstRun = !S.everDied;
  S.easeT = firstRun ? EASE_LEN : 0;
  if(firstRun){
    /* a LITTLE more open sky than a retry (reset() arms 1000) so the ease
       ramp can teach the stick — but only a little: this used to be 3400,
       which pushed a first player's opening boss past the 90s mark, and the
       playtest verdict on that was unambiguous. The bosses are the show. */
    S.nextBoss = 1600;
    S.tipT = 6; S.tipMsg = 'CLEAR AIRSPACE  ·  GET A FEEL FOR HER';
  }
  introEl.classList.add('hidden'); overEl.classList.add('hidden');
  paused=false; pausedEl.classList.add('hidden');
  /* swallow the input that LAUNCHED us: pressing Space on the menu both
     starts the run (here) and, via input.js, leaves keys[' '] latched — so
     frame 1 of every Space-launched run silently fired a missile. Same for a
     held mouse button carried across the button click. The keyup that
     eventually arrives just re-writes false onto false. */
  for(const k in keys) keys[k]=false; mouse.fire=mouse.alt=false; tap.a=0; tap.d=0;
  S.gameOn=true; S.hintT=firstRun?9:5.5; last=performance.now();
}
export function gameOver(){
  S.gameOn=false; S.everDied=true;
  /* fold the ambient beds down NOW rather than letting the watchdog notice on
     its own: a quick RE-LAUNCH otherwise rebuilds swarm/creep on top of the
     old ones still fading, and the geiger has no other off switch at all —
     its only caller is gated on S.rad>.04, which is false once you're dead */
  AUDIO.swarm && AUDIO.swarm(false);
  AUDIO.creep && AUDIO.creep(0);
  AUDIO.geiger && AUDIO.geiger(0);
  burst(S.P.x,S.P.y,0,COL.red,90,2.2); AUDIO.boom(1.8); AUDIO.setIntensity(.15);
  shock(S.P.x,S.P.y,0, 20,520,.6, 16, COL.white, 1);
  sparks(S.P.x,S.P.y,0, 40, 1400, 1.2, COL.red, 0,0,0, 0);
  for(let i=0;i<6;i++)
    shard(S.P.x,S.P.y,0, rnd(-620,620),rnd(-160,520),rnd(-620,620), rnd(.18,.34), COL.cyan, rnd(.45,.8));
  /* debrief readout — score gets toLocaleString to match fBest, so a
     five-digit run reads as a score and not a serial number */
  document.getElementById('fScore').textContent=S.score.toLocaleString();
  document.getElementById('fDist').textContent=(S.dist/1000).toFixed(1);
  document.getElementById('fKills').textContent=S.kills;
  const rec = submitRun(S.score, S.dist, S.kills);
  document.getElementById('fBest').textContent = rec.best.toLocaleString();
  document.getElementById('newrec').classList.toggle('on', rec.isRecord && S.score > 0);
  /* un-hiding flips display:none→flex, which restarts every CSS animation
     inside #over — the staggered line reveal, the record shine and the red
     wash are all choreographed in dev.html's stylesheet off this one toggle,
     so the debrief needs no per-line JS at all */
  setTimeout(()=>overEl.classList.remove('hidden'), 950);
}
launchBtn.addEventListener('click', start);
document.getElementById('again').addEventListener('click', start);
addEventListener('keydown', e=>{
  const menuUp = !introEl.classList.contains('hidden') || !overEl.classList.contains('hidden');
  if((e.key==='Enter'||e.key===' ') && !S.gameOn && menuUp){ e.preventDefault(); start(); }
});


reset();
requestAnimationFrame(frame);

let cineOk=false;
if(!window.SKIP_CINE){
  try{ cineOk = CINE.play({ onSkip: showMenu, onEnd: start }); }catch(e){ cineOk=false; }
}
if(!cineOk) showMenu();
