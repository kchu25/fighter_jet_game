/* ===== game/input.js — keyboard / mouse state ===== */
import { AUDIO } from '../audio/index.js';
import { barrelRoll } from './fx.js';
import { S } from './state.js';
/* main.js import is safe (like main⇄update): bindings only touched inside handlers */
import { togglePause, setPaused, paused } from '../main.js';

/* ------------------------------------------------------------------ input */
export const keys={}, mouse={x:0,y:0,fire:false,alt:false,has:false};
export const tap={a:0,d:0};
addEventListener('keydown', e=>{
  const k = e.key.length===1 ? e.key.toLowerCase() : e.key;
  if(!e.repeat){
    if(k==='a'||k==='d'){ const t=performance.now(); if(t-tap[k]<300) barrelRoll(k==='a'?-1:1); tap[k]=t; }
    if(k==='m') AUDIO.toggle();
    if((k==='p'||k==='Escape') && S.gameOn) togglePause();
  }
  keys[k]=true;
  if(k===' '||k==='ArrowUp'||k==='ArrowDown') e.preventDefault();
});
addEventListener('keyup', e=>{ keys[e.key.length===1?e.key.toLowerCase():e.key]=false; });
addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; mouse.has=true; });
addEventListener('mousedown', e=>{ if(e.button===0) mouse.fire=true; if(e.button===2) mouse.alt=true; });
addEventListener('mouseup',   e=>{ if(e.button===0) mouse.fire=false; if(e.button===2) mouse.alt=false; });
addEventListener('contextmenu', e=>e.preventDefault());
addEventListener('blur', ()=>{
  for(const k in keys) keys[k]=false; mouse.fire=mouse.alt=false;
  if(S.gameOn) setPaused(true); else AUDIO.suspend();   // auto-pause mid-run (suspends audio itself)
});
addEventListener('focus', ()=>{ if(!paused) AUDIO.resume(); });  // no auto-resume; unpause is a deliberate keypress
