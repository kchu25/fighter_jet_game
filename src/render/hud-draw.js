/* ===== render/hud-draw.js — 2D HUD overlay (reticles, bars, banners) ===== */
import { clamp, css } from '../core/utils.js';
import { S, COL, FOVY } from '../game/state.js';
import { h2d, W, H, DPR } from './gl.js';
import { lockOn } from '../game/combat.js';
import { toScreen } from './scene-draw.js';
import { mouse } from '../game/input.js';

/* ------------------------------------------------------------------ hud */
export function bar(x,y,w,h,v,c){
  h2d.fillStyle='rgba(255,255,255,.10)'; h2d.fillRect(x,y,w,h);
  h2d.shadowColor=c; h2d.shadowBlur=10; h2d.fillStyle=c;
  h2d.fillRect(x,y,w*clamp(v,0,1),h); h2d.shadowBlur=0;
}
export function drawHUD(){
  h2d.setTransform(DPR,0,0,DPR,0,0);
  h2d.clearRect(0,0,W,H);
  if(!S.gameOn) return;
  const m=28, bw=Math.min(300,W*.24), by=H-m;

  // reticles
  const t=lockOn();
  const list=S.boss?S.enemies.concat([S.boss]):S.enemies;
  for(const e of list){
    if(e.z<260) continue;
    const p=toScreen(e.x,e.y,e.z); if(!p.vis) continue;
    if(p.x<-80||p.x>W+80||p.y<-80||p.y>H+80) continue;
    const r=clamp(e.r*1.5/p.w*(H/(2*Math.tan(FOVY/2)))*1.0, 14, 260);
    const on=(e===t);
    h2d.globalAlpha=on?.95:.22;
    h2d.strokeStyle=on?css(COL.red):css(COL.cyan);
    h2d.lineWidth=on?2:1;
    if(on){ h2d.shadowColor=css(COL.red); h2d.shadowBlur=14; }
    const c=r*.4;
    h2d.beginPath();
    h2d.moveTo(p.x-r,p.y-r+c); h2d.lineTo(p.x-r,p.y-r); h2d.lineTo(p.x-r+c,p.y-r);
    h2d.moveTo(p.x+r-c,p.y-r); h2d.lineTo(p.x+r,p.y-r); h2d.lineTo(p.x+r,p.y-r+c);
    h2d.moveTo(p.x+r,p.y+r-c); h2d.lineTo(p.x+r,p.y+r); h2d.lineTo(p.x+r-c,p.y+r);
    h2d.moveTo(p.x-r+c,p.y+r); h2d.lineTo(p.x-r,p.y+r); h2d.lineTo(p.x-r,p.y+r-c);
    h2d.stroke(); h2d.shadowBlur=0;
    if(on){ h2d.fillStyle=css(COL.red); h2d.font='11px "Courier New",monospace';
      h2d.textAlign='center'; h2d.fillText('LOCK',p.x,p.y-r-8); }
    h2d.globalAlpha=1;
  }
  // ally callsign tags — quiet cyan labels, flipping to a red MAYDAY flash
  for(const a of S.allies||[]){
    const p=toScreen(a.x,a.y,a.z); if(!p.vis) continue;
    h2d.textAlign='center'; h2d.font='10px "Courier New",monospace';
    if(a.state==='dying'){
      if(Math.floor(S.T*8)%2){ h2d.globalAlpha=.9; h2d.fillStyle=css(COL.red);
        h2d.fillText(a.dieT<.5?a.cs:'MAYDAY', p.x, p.y-26); }
    } else {
      h2d.globalAlpha=.55; h2d.fillStyle=css(COL.cyan);
      h2d.fillText(a.cs, p.x, p.y-26);
    }
    h2d.globalAlpha=1;
  }
  // S.score popups
  for(const f of S.pops){
    const p=toScreen(f.x,f.y,f.z); if(!p.vis) continue;
    h2d.globalAlpha=clamp(f.life/.85,0,1);
    h2d.fillStyle=css(f.c); h2d.textAlign='center';
    h2d.font='bold '+clamp(2600/p.w,11,34)+'px "Courier New",monospace';
    h2d.shadowColor=css(f.c); h2d.shadowBlur=12;
    h2d.fillText(f.txt,p.x,p.y); h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  // crosshair
  const mx=mouse.has?mouse.x:W/2, my=mouse.has?mouse.y:H/2;
  h2d.strokeStyle=css(COL.cyan); h2d.lineWidth=1.6; h2d.globalAlpha=.9;
  h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=10;
  h2d.beginPath();
  h2d.moveTo(mx-22,my); h2d.lineTo(mx-8,my); h2d.moveTo(mx+8,my); h2d.lineTo(mx+22,my);
  h2d.moveTo(mx,my-22); h2d.lineTo(mx,my-8); h2d.moveTo(mx,my+8); h2d.lineTo(mx,my+22);
  h2d.stroke(); h2d.beginPath(); h2d.arc(mx,my,3,0,6.3); h2d.stroke();
  h2d.shadowBlur=0; h2d.globalAlpha=1;

  // radio comms — stacked bottom-left just above the HULL readout; newest at
  // the bottom, each line fading out over its ~6s life (update.js ages t).
  // Cyan for routine traffic, red tint for maydays (u>=.9).
  if(S.comms && S.comms.length){
    h2d.textAlign='left'; h2d.font='11px "Courier New",monospace';
    let cy=by-52;
    for(let i=S.comms.length-1;i>=0;i--){
      const c=S.comms[i];
      h2d.globalAlpha=clamp((6-c.t)/1.5,0,1)*.85;
      h2d.fillStyle=c.u>=.9?css(COL.red):css(COL.cyan);
      h2d.fillText('» '+c.who+': '+c.txt, m, cy);
      cy-=15;
    }
    h2d.globalAlpha=1;
  }

  // bars
  h2d.textAlign='left'; h2d.font='12px "Courier New",monospace';
  h2d.fillStyle='#7fa8bd'; h2d.fillText('HULL', m, by-30);
  bar(m, by-24, bw, 9, S.P.hp/100, S.P.hp<35?css(COL.red):css(COL.green));
  bar(m, by-11, bw, 5, S.P.shield/100, css(COL.cyan));
  h2d.textAlign='right';
  h2d.fillStyle='#7fa8bd'; h2d.fillText('BOOST', W-m, by-30);
  bar(W-m-bw, by-24, bw, 9, S.P.boost/100, css(COL.amber));

  // S.score / distance
  h2d.textAlign='left'; h2d.font='bold 30px "Courier New",monospace';
  h2d.fillStyle='#eaffff'; h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=14;
  h2d.fillText(String(S.score).padStart(6,'0'), m, m+24); h2d.shadowBlur=0;
  if(S.combo>1){ h2d.font='bold 17px "Courier New",monospace'; h2d.fillStyle=css(COL.mag);
    h2d.shadowColor=css(COL.mag); h2d.shadowBlur=12; h2d.fillText('x'+S.combo,m,m+48); h2d.shadowBlur=0; }
  if((S.kills||0)>0){ h2d.font='12px "Courier New",monospace'; h2d.fillStyle='#7fa8bd';
    h2d.globalAlpha=.75; h2d.fillText('K '+S.kills, m, m+(S.combo>1?66:46)); h2d.globalAlpha=1; }
  h2d.textAlign='right'; h2d.font='15px "Courier New",monospace'; h2d.fillStyle='#8fc9e0';
  h2d.fillText((S.dist/1000).toFixed(1)+' KM', W-m, m+16);
  if(S.P.weapon!=='std'){
    h2d.fillStyle=S.P.weapon==='rapid'?css(COL.cyan):css(COL.mag);
    h2d.fillText(S.P.weapon.toUpperCase()+'  '+S.P.wepT.toFixed(1)+'s', W-m, m+38);
  }
  // sector / threat
  const sy=S.P.weapon!=='std'?m+58:m+38;
  h2d.font='13px "Courier New",monospace';
  if((S.lullT||0)>0){
    h2d.fillStyle=css(COL.green); h2d.globalAlpha=.55+.35*Math.abs(Math.sin(S.T*3));
    h2d.fillText('SECTOR CLEAR', W-m, sy); h2d.globalAlpha=1;
  }else{
    h2d.fillStyle='#8fc9e0'; h2d.globalAlpha=.8;
    h2d.fillText('SECTOR '+(S.sector||1), W-m, sy); h2d.globalAlpha=1;
  }
  if(S.threat!==undefined&&S.threatCap!==undefined){
    const n=Math.min(8,Math.round(S.threatCap)), lit=clamp(Math.round(S.threat),0,n);
    for(let i=0;i<n;i++){
      h2d.globalAlpha=i<lit?.6:.16;
      h2d.fillStyle=i<lit?css(COL.amber):'#8fc9e0';
      h2d.fillRect(W-m-(n-i)*7, sy+7, 4, 8);
    }
    h2d.globalAlpha=1;
  }
  // S.boss bar
  if(S.boss){
    const w=Math.min(560,W*.55), x=W/2-w/2, y=m+2;
    h2d.textAlign='center'; h2d.font='12px "Courier New",monospace';
    const bc=S.boss.c||COL.purple;
    h2d.fillStyle=css(bc); h2d.fillText((S.boss.name||'MOTHERSHIP')+' :: PHASE '+S.boss.phase, W/2, y-4);
    const hit=clamp(S.boss.hit||0,0,1);
    let c=S.boss.phase===3?css(COL.red):css(bc);
    if(hit>0){ c='rgba(255,255,255,'+(.4+.6*hit).toFixed(2)+')'; }
    bar(x,y,w,12, S.boss.hp/S.boss.max, c);
    h2d.fillStyle='rgba(0,0,0,.55)';
    h2d.fillRect(x+w*.66-1, y, 2, 12); h2d.fillRect(x+w*.33-1, y, 2, 12);
  }
  if(S.bossWarn>0 && Math.floor(S.T*8)%2){
    h2d.globalAlpha=clamp(S.bossWarn/2.4,0,1); h2d.textAlign='center'; h2d.fillStyle=css(COL.red);
    h2d.shadowColor=css(COL.red); h2d.shadowBlur=24;
    h2d.font='bold '+Math.min(60,W*.06)+'px "Courier New",monospace';
    h2d.fillText('WARNING', W/2, H*.28);
    h2d.font='bold '+Math.min(24,W*.026)+'px "Courier New",monospace';
    /* the warn phrase carries its own verb ('… INBOUND' / 'LEVIATHAN RISING') */
    h2d.fillText(S.bossWarnName||'MOTHERSHIP INBOUND', W/2, H*.28+34);
    h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  if(S.tipT>0){
    h2d.globalAlpha=Math.min(1,S.tipT/1.2); h2d.textAlign='center';
    h2d.font='12px "Courier New",monospace'; h2d.fillStyle='#8fc9e0';
    h2d.fillText(S.tipMsg, W/2, H*.88);
    h2d.globalAlpha=1;
  }
  // damage / pickup S.flash
  if(S.flash>.002){ h2d.globalAlpha=S.flash; h2d.fillStyle=css(S.flashC); h2d.fillRect(0,0,W,H); h2d.globalAlpha=1; }
  if(S.hitT>0){ h2d.globalAlpha=S.hitT*.9; h2d.strokeStyle=css(COL.red); h2d.lineWidth=26;
    h2d.shadowColor=css(COL.red); h2d.shadowBlur=50; h2d.strokeRect(0,0,W,H);
    h2d.shadowBlur=0; h2d.globalAlpha=1; }
  if(S.hintT>0){
    S.hintT-=1/60;
    const a=Math.min(1,S.hintT)*.9;
    h2d.globalAlpha=a; h2d.textAlign='center';
    h2d.font='600 '+Math.round(H*.021)+'px "Courier New",monospace';
    h2d.fillStyle=css(COL.cyan); h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=14;
    h2d.fillText('W CLIMB   S DIVE   A/D BANK   CLICK GUNS   SPACE MISSILE   SHIFT BOOST   AA/DD ROLL',
      W/2, H*.955);
    h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
  if(S.P.hp<35){ h2d.globalAlpha=.08+.13*Math.abs(Math.sin(S.T*6));
    h2d.strokeStyle=css(COL.red); h2d.lineWidth=44; h2d.strokeRect(0,0,W,H); h2d.globalAlpha=1; }
}
