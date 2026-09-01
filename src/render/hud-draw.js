/* ===== render/hud-draw.js — 2D HUD overlay (reticles, bars, banners) ===== */
import { clamp, css } from '../core/utils.js';
import { S, COL, FOVY, GROUND_Y } from '../game/state.js';
import { h2d, W, H, DPR } from './gl.js';
import { lockOn } from '../game/combat.js';
import { coreR, falloutR } from '../game/nuke.js';
import { toScreen } from './scene-draw.js';
import { mouse } from '../game/input.js';

/* ------------------------------------------------------------------ hud */
/* Screen/world handedness, because it is the one thing that will silently
   invert this whole feature: the camera's right vector is -X (see aimAt in
   combat.js), so world +X is screen LEFT — and 'a' pushes +vx. A safe side of
   world +X therefore reads out as "BREAK LEFT" and is flown with the A key. */
function breakWord(safe){ return safe>0 ? 'BREAK LEFT' : 'BREAK RIGHT'; }

/* dir: +1 draws chevrons marching screen-right, -1 screen-left */
function chevrons(cx,cy,dir,size,n,alpha,color){
  h2d.strokeStyle=color; h2d.lineWidth=size*.22; h2d.lineCap='round';
  h2d.shadowColor=color; h2d.shadowBlur=16;
  for(let i=0;i<n;i++){
    h2d.globalAlpha = alpha*(.35+.65*Math.abs(Math.sin(S.T*6 - i*.8)));
    const ox = cx + dir*i*size*.9;
    h2d.beginPath();
    h2d.moveTo(ox-dir*size*.34, cy-size*.5);
    h2d.lineTo(ox+dir*size*.34, cy);
    h2d.lineTo(ox-dir*size*.34, cy+size*.5);
    h2d.stroke();
  }
  h2d.shadowBlur=0; h2d.globalAlpha=1; h2d.lineCap='butt';
}

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
  // ---- nuclear strike: the break call, and a live in-the-column readout.
  // The safe side is always -sign(column x): placement is capped at ±175 and
  // the envelope is ±238, so the far side is the one that always has room —
  // steering by the player's own offset would happily advise the pinned side.
  /* hoisted: the whiteout at the bottom of this function re-draws the break
     call on top of itself, and it must be the SAME call, not a recomputed one */
  let bSafe=0, bDir=0, bHyd=0;
  if(S.nukes && S.nukes.length){
    let nk=null, nz=1e9;
    for(const k of S.nukes){ if(k.z<-420) continue; if(k.z<nz){ nz=k.z; nk=k; } }
    if(nk){
      const safe = nk.x>=0 ? -1 : 1, sdir = safe>0 ? -1 : 1;
      bSafe=safe; bDir=sdir; bHyd=nk.hyd?1:0;
      const live = nk.state==='cloud' && nk.z<900;
      const ad = Math.abs(S.P.x-nk.x);
      const inCore = live && ad<coreR(nk);
      const inFall = live && !inCore && ad<falloutR(nk);

      if(S.nukeWarn>0){
        h2d.textAlign='center';
        h2d.globalAlpha=clamp(S.nukeWarn/1.6,0,1)*(Math.floor(S.T*9)%2?1:.45);
        h2d.fillStyle=css(COL.amber); h2d.shadowColor=css(COL.amber); h2d.shadowBlur=26;
        h2d.font='bold '+Math.min(46,W*.045)+'px "Courier New",monospace';
        h2d.fillText(bHyd?'THERMONUCLEAR RELEASE':'NUCLEAR LAUNCH DETECTED', W/2, H*.20);
        h2d.fillStyle=css(COL.red); h2d.shadowColor=css(COL.red);
        h2d.font='bold '+Math.min(34,W*.034)+'px "Courier New",monospace';
        h2d.fillText(breakWord(safe), W/2, H*.20+42);
        h2d.shadowBlur=0; h2d.globalAlpha=1;
        chevrons(W/2+sdir*Math.min(230,W*.20), H*.20+32, sdir,
          Math.min(30,W*.028), 3, .95, css(COL.red));
      }
      if(inCore || inFall){
        h2d.textAlign='center';
        const c = inCore?COL.red:COL.green;
        h2d.globalAlpha = Math.floor(S.T*11)%2?1:.5;
        h2d.fillStyle=css(c); h2d.shadowColor=css(c); h2d.shadowBlur=22;
        h2d.font='bold '+Math.min(40,W*.038)+'px "Courier New",monospace';
        h2d.fillText(inCore?'IN THE BLAST — '+breakWord(safe):'FALLOUT — KEEP GOING',
          W/2, H*.66);
        h2d.shadowBlur=0; h2d.globalAlpha=1;
        chevrons(W/2+sdir*Math.min(250,W*.22), H*.66-12, sdir,
          Math.min(28,W*.026), 3, 1, css(c));
      }
    }
  }
  /* ---- the lane strip.
     The 3D gate rails in scene-draw.js are additive, and a hydrogen column is
     bright enough to saturate most of the frame to white — at which point the
     rails, which are the actual gameplay, are invisible because nothing can be
     brighter than white. Verified in the preview: at z≈1400 a hydrogen fireball
     buries them completely.
     So the corridor is also drawn flat, as a plan view: the full ±BX envelope,
     every live column's core span in red and its fallout span in green, and
     your own x as a caret. It is immune to the scene's brightness by
     construction, and it is the one readout that says exactly where the lane
     is rather than which way to turn. Only present while columns are live. */
  if(S.nukes && S.nukes.length){
    const BXW=238, lw=Math.min(420,W*.34), lx=W/2-lw/2, ly=H*.795, lh=13;
    /* world +X is screen LEFT (see breakWord) — the strip must agree with the
       world or it is worse than nothing */
    const px = wx => lx + lw*(0.5 - clamp(wx/BXW,-1.4,1.4)*0.5);
    h2d.globalAlpha=.5; h2d.fillStyle='rgba(0,0,0,.55)';
    h2d.fillRect(lx-4,ly-4,lw+8,lh+8);
    h2d.strokeStyle='rgba(140,200,225,.55)'; h2d.lineWidth=1;
    h2d.strokeRect(lx,ly,lw,lh); h2d.globalAlpha=1;
    for(const k of S.nukes){
      if(k.z>3000 || k.z<-500) continue;
      const near=clamp(1-Math.max(0,k.z)/2600, .18, 1);
      const rc=coreR(k), rf=falloutR(k);
      const a=px(k.x+rf), b=px(k.x-rf);
      h2d.globalAlpha=near*.30; h2d.fillStyle=css(COL.green);
      h2d.fillRect(Math.min(a,b),ly,Math.abs(b-a),lh);
      const c=px(k.x+rc), d=px(k.x-rc);
      h2d.globalAlpha=near*.72; h2d.fillStyle=css(COL.red);
      h2d.fillRect(Math.min(c,d),ly,Math.abs(d-c),lh);
    }
    h2d.globalAlpha=1; h2d.fillStyle=css(COL.cyan);
    h2d.shadowColor=css(COL.cyan); h2d.shadowBlur=10;
    const cx=px(S.P.x);
    h2d.beginPath(); h2d.moveTo(cx,ly-5); h2d.lineTo(cx+5,ly-12); h2d.lineTo(cx-5,ly-12);
    h2d.closePath(); h2d.fill();
    h2d.fillRect(cx-1,ly,2,lh);
    h2d.shadowBlur=0;
  }
  /* sustained barrage: its own banner, because a session is an EVENT with a
     start, a length and an end, and the per-strike break call cannot say that.
     The counter is the promise that it stops — without it the player reads a
     rolling barrage as "the game is broken now" rather than "survive this". */
  if(S.nukeSess){
    const q=S.nukeSess;
    h2d.textAlign='center';
    h2d.globalAlpha=(Math.floor(S.T*4)%2?1:.62);
    h2d.fillStyle=css(COL.red); h2d.shadowColor=css(COL.red); h2d.shadowBlur=24;
    h2d.font='bold '+Math.min(26,W*.024)+'px "Courier New",monospace';
    h2d.fillText('SUSTAINED NUCLEAR BARRAGE', W/2, H*.115);
    h2d.shadowBlur=0; h2d.globalAlpha=.8;
    h2d.fillStyle=css(COL.amber); h2d.font='bold '+Math.min(16,W*.015)+'px "Courier New",monospace';
    h2d.fillText(q.armT>0 ? 'RELEASE IN '+q.armT.toFixed(1)
                          : 'WARHEADS REMAINING  '+q.left+' / '+q.n, W/2, H*.115+22);
    h2d.globalAlpha=1;
  }
  // radiation dose — sits under the hull bars, only present when exposed
  if(S.rad>.02){
    h2d.textAlign='left'; h2d.font='11px "Courier New",monospace';
    h2d.fillStyle=css(COL.green); h2d.globalAlpha=.55+.45*Math.abs(Math.sin(S.T*7));
    h2d.fillText('RAD', m, by+2); h2d.globalAlpha=1;
    bar(m+30, by-6, bw-30, 5, S.rad, css(COL.green));
  }
  if(S.tipT>0){
    h2d.globalAlpha=Math.min(1,S.tipT/1.2); h2d.textAlign='center';
    h2d.font='12px "Courier New",monospace'; h2d.fillStyle='#8fc9e0';
    h2d.fillText(S.tipMsg, W/2, H*.88);
    h2d.globalAlpha=1;
  }
  // damage / pickup S.flash
  if(S.flash>.002){ h2d.globalAlpha=S.flash; h2d.fillStyle=css(S.flashC); h2d.fillRect(0,0,W,H); h2d.globalAlpha=1; }
  // detonation whiteout. Kept off S.flash on purpose: that channel decays
  // superlinearly so ordinary hits strobe and clear, whereas the Teller
  // double-flash has to hang long enough to actually blind.
  if(S.nukeFl>.004){
    const fa = clamp(S.nukeFl,0,1), fh = clamp(S.nukeFlH,0,1);
    /* A GLARE, NOT A RECTANGLE. This used to be fillRect at globalAlpha=nukeFl
       and that is a strictly contrast-DESTROYING operation: every pixel moves
       the same distance toward white, so the standard deviation of the frame
       is multiplied by (1-alpha) and nothing else happens. At the hydrogen
       round's old ~0.93 hold that left a literally blank card on screen for
       the whole money shot.
       Drawn as a radial gradient pinned to ground zero instead, the same
       average brightness buys a bright core and dark corners — it ADDS
       structure, it reads as light arriving from a place, and it leaves the
       bottom of the frame (where the lane strip lives) comparatively clear.
       The tactical round keeps a nearly flat falloff so it still reads as the
       diffuse fission wash it always was; only the hydrogen one is shaped. */
    const p = toScreen(S.nukeFlX, GROUND_Y+320, S.nukeFlZ);
    const cx = p.vis ? clamp(p.x, -W*.6, W*1.6) : W*.5;
    const cy = p.vis ? clamp(p.y, -H*.6, H*1.6) : H*.42;
    /* radius measured to the far corner so the falloff is resolution- and
       position-independent: the dimmest pixel is always the furthest one */
    const R = Math.max(Math.hypot(cx,cy), Math.hypot(W-cx,cy),
                       Math.hypot(cx,H-cy), Math.hypot(W-cx,H-cy)) * 1.02;
    /* a hydrogen flash is hotter and cleaner than a fission one — it washes
       toward pure white rather than the tungsten cream of the tactical round */
    const hot = fh>.15;
    const rim = hot ? .30 : .88;   // edge brightness as a fraction of the core
    const g = h2d.createRadialGradient(cx,cy,0, cx,cy,R);
    const tint = hot ? '255,253,246' : '255,246,228';
    g.addColorStop(0,    'rgba('+tint+',1)');
    g.addColorStop(.34,  'rgba('+tint+','+(rim+(1-rim)*.66).toFixed(3)+')');
    g.addColorStop(.68,  'rgba('+tint+','+(rim+(1-rim)*.22).toFixed(3)+')');
    g.addColorStop(1,    'rgba('+tint+','+rim.toFixed(3)+')');
    h2d.globalAlpha=fa; h2d.fillStyle=g;
    h2d.fillRect(0,0,W,H); h2d.globalAlpha=1;
    /* THE FAIRNESS VALVE. The wash is allowed to take the world away; it is
       never allowed to take the dodge away. So the break call is re-drawn ON
       TOP of it in ink, using the SAME safe side computed above.
       The hydrogen spike is now ~3 frames rather than a 1.3s hold, so this
       fires for a much shorter window than it used to — but the threshold is
       unchanged and deliberately low, because the frames where the wash is
       merely bright are exactly the frames where the ordinary neon break call
       underneath is least readable. Ink on white always wins. */
    if(bDir && S.nukeFl>.28){
      const a=clamp((S.nukeFl-.28)/.35,0,1);
      h2d.textAlign='center'; h2d.globalAlpha=a*.92;
      h2d.fillStyle='#2a0406';
      h2d.font='bold '+Math.min(52,W*.05)+'px "Courier New",monospace';
      h2d.fillText(breakWord(bSafe), W/2, H*.44);
      chevrons(W/2+bDir*Math.min(260,W*.23), H*.44-14, bDir,
        Math.min(34,W*.032), 3, a, '#2a0406');
      h2d.globalAlpha=1;
    }
  }
  // fallout wash — sickly green crowding in from the frame edges
  if(S.rad>.02){
    h2d.globalAlpha=clamp(S.rad,0,1)*.45;
    h2d.strokeStyle=css(COL.green); h2d.lineWidth=76;
    h2d.shadowColor=css(COL.green); h2d.shadowBlur=68;
    h2d.strokeRect(0,0,W,H); h2d.shadowBlur=0; h2d.globalAlpha=1;
  }
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
