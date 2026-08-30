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
export const LINES=[
  '&gt; INCOMING TRANSMISSION &mdash; SIGNAL DEGRADED',
  '&gt; ORBITAL GRID DOWN. HIVE FLEET IN THE ATMOSPHERE.',
  '&gt; YOU ARE THE ONLY BIRD IN THE AIR. GO.'
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
    S.nextBoss = 3400;                                  // a little more open sky first
    S.tipT = 6; S.tipMsg = 'CLEAR AIRSPACE  ·  GET A FEEL FOR HER';
  }
  introEl.classList.add('hidden'); overEl.classList.add('hidden');
  paused=false; pausedEl.classList.add('hidden');
  S.gameOn=true; S.hintT=firstRun?9:5.5; last=performance.now();
}
export function gameOver(){
  S.gameOn=false; S.everDied=true;
  burst(S.P.x,S.P.y,0,COL.red,90,2.2); AUDIO.boom(1.8); AUDIO.setIntensity(.15);
  shock(S.P.x,S.P.y,0, 20,520,.6, 16, COL.white, 1);
  sparks(S.P.x,S.P.y,0, 40, 1400, 1.2, COL.red, 0,0,0, 0);
  for(let i=0;i<6;i++)
    shard(S.P.x,S.P.y,0, rnd(-620,620),rnd(-160,520),rnd(-620,620), rnd(.18,.34), COL.cyan, rnd(.45,.8));
  document.getElementById('fScore').textContent=S.score;
  document.getElementById('fDist').textContent=(S.dist/1000).toFixed(1);
  document.getElementById('fKills').textContent=S.kills;
  const rec = submitRun(S.score, S.dist, S.kills);
  document.getElementById('fBest').textContent = rec.best.toLocaleString();
  document.getElementById('newrec').classList.toggle('on', rec.isRecord && S.score > 0);
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
