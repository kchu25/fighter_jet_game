/* ===== audio/cine-oneshots.js — one-shot cinematic intro SFX =====
   warp / plasma / explode / helmetOn / breath / beep / cineRiser / jetPass.
   Everything here routes into sfxGain and is scheduled against an absolute
   captured time. */
import { A } from './state.js';
import { now, gainNode, panner, pluck, osc, noise, hp, lp, bp, fclamp, clamp, budget, voice } from './primitives.js';

export function warp() {
  if (!A.ready || A.muted || !budget(6)) return;
  var t = now() + 0.002;
  var dur = 1.0;
  var arrive = t + 0.72;
  var head = gainNode(0.62);
  head.connect(A.sfxGain);
  var srcs = [];

  // --- screaming descent: detuned saw pair a tritone apart ---
  var flt = lp(6000, 5);
  flt.frequency.setValueAtTime(fclamp(7000), t);
  flt.frequency.exponentialRampToValueAtTime(fclamp(240), arrive);
  var dg = A.ctx.createGain();
  dg.gain.setValueAtTime(0.0001, t);
  dg.gain.exponentialRampToValueAtTime(0.42, t + 0.09);
  dg.gain.exponentialRampToValueAtTime(0.2, arrive);
  dg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  flt.connect(dg); dg.connect(head);

  var base = [4200, 4200 * 1.4142];
  for (var k = 0; k < 2; k++) {
    var o = osc('sawtooth', base[k], t);
    o.detune.value = k ? 21 : -17;
    o.frequency.setValueAtTime(fclamp(base[k]), t);
    o.frequency.exponentialRampToValueAtTime(fclamp(base[k] * 0.016), arrive);
    o.frequency.exponentialRampToValueAtTime(fclamp(base[k] * 0.009), t + dur);
    o.connect(flt);
    o.start(t); o.stop(t + dur + 0.03);
    srcs.push(o);
  }

  // --- reversed-sounding swell: gain rises the whole way in, then cuts ---
  var sb = bp(500, 1.1);
  sb.frequency.setValueAtTime(fclamp(420), t);
  sb.frequency.exponentialRampToValueAtTime(fclamp(4200), arrive);
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.45, arrive);
  sg.gain.exponentialRampToValueAtTime(0.0001, arrive + 0.12);
  sb.connect(sg); sg.connect(head);
  var ss = noise(t, 0.9, 0.6); ss.connect(sb); srcs.push(ss);

  // --- arrival: sub thump ---
  var so = osc('sine', 88, arrive);
  so.frequency.setValueAtTime(fclamp(88), arrive);
  so.frequency.exponentialRampToValueAtTime(fclamp(29), arrive + 0.3);
  var sog = pluck(arrive, 0.9, 0.34, 0.005);
  so.connect(sog); sog.connect(head);
  so.start(arrive); so.stop(arrive + 0.38);
  srcs.push(so);

  // --- inharmonic metallic ring on top of the arrival ---
  var rf = bp(2600, 6);
  var rg = pluck(arrive, 0.22, 0.3, 0.002);
  rf.connect(rg); rg.connect(head);
  var ra = osc('square', 1880, arrive);
  var rb = osc('square', 1880 * 1.4142, arrive);
  ra.connect(rf); rb.connect(rf);
  ra.start(arrive); ra.stop(arrive + 0.34);
  rb.start(arrive); rb.stop(arrive + 0.34);
  srcs.push(ra, rb);

  voice(head, srcs);
}

/* ---------------------------------------------------------------
   3. plasma() - dense plasma beam, ~0.8s.  Loud by design.
   --------------------------------------------------------------- */
export function plasma() {
  if (!A.ready || A.muted || !budget(6)) return;
  var t = now() + 0.002;
  var dur = 0.8;
  var head = gainNode(0.78);
  head.connect(A.sfxGain);
  var srcs = [];

  // --- searing buzz: saw + square through a resonant bandpass sweep ---
  var f = bp(2400, 8);
  f.frequency.setValueAtTime(fclamp(2600), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(620), t + dur * 0.55);
  f.frequency.exponentialRampToValueAtTime(fclamp(180), t + dur);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.72, t + 0.014);
  g.gain.exponentialRampToValueAtTime(0.44, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(head);

  var a = osc('sawtooth', 190, t); a.detune.value = -19;
  var b = osc('sawtooth', 190, t); b.detune.value = 23;
  var c = osc('square', 95, t);
  a.frequency.setValueAtTime(fclamp(190), t);
  a.frequency.exponentialRampToValueAtTime(fclamp(72), t + dur);
  b.frequency.setValueAtTime(fclamp(191), t);
  b.frequency.exponentialRampToValueAtTime(fclamp(71), t + dur);
  c.frequency.setValueAtTime(fclamp(95), t);
  c.frequency.exponentialRampToValueAtTime(fclamp(36), t + dur);
  var cgn = gainNode(0.5);
  a.connect(f); b.connect(f); c.connect(cgn); cgn.connect(f);
  a.start(t); a.stop(t + dur + 0.02);
  b.start(t); b.stop(t + dur + 0.02);
  c.start(t); c.stop(t + dur + 0.02);
  srcs.push(a, b, c);

  // --- sizzle ---
  var sh = hp(3200);
  var sg = A.ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
  sg.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.55);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
  sh.connect(sg); sg.connect(head);
  var ss = noise(t, dur * 0.92, 1.5); ss.connect(sh); srcs.push(ss);

  // --- body-hitting sub ---
  var so = osc('sine', 130, t);
  so.frequency.exponentialRampToValueAtTime(fclamp(38), t + dur * 0.7);
  var sog = pluck(t, 0.85, dur * 0.8, 0.004);
  so.connect(sog); sog.connect(head);
  so.start(t); so.stop(t + dur);
  srcs.push(so);

  voice(head, srcs);
}

/* ---------------------------------------------------------------
   4. explode(size) - catastrophic destruction.  size ~1.0 .. 2.5
   --------------------------------------------------------------- */
export function explode(size) {
  if (!A.ready || A.muted || !budget(12)) return;
  size = clamp(size == null ? 1 : size, 0.6, 2.5);
  var t = now() + 0.002;
  var dur = 0.36 + 1.06 * size;                 // 1.4s @1, 3.0s @2.5
  var head = gainNode(clamp(0.55 + 0.28 * size, 0.5, 1.0));
  var pn = panner((Math.random() * 2 - 1) * 0.22);
  if (pn) { head.connect(pn); pn.connect(A.sfxGain); } else head.connect(A.sfxGain);
  var srcs = [];

  // --- blast body: noise through a lowpass that closes over time ---
  var bf = lp(3200, 1.4);
  bf.frequency.setValueAtTime(fclamp(3000 / Math.pow(size, 0.45)), t);
  bf.frequency.exponentialRampToValueAtTime(fclamp(300 / size), t + dur * 0.4);
  bf.frequency.exponentialRampToValueAtTime(fclamp(60), t + dur);
  var bg = A.ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
  bg.gain.exponentialRampToValueAtTime(0.24, t + dur * 0.3);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  bf.connect(bg); bg.connect(head);
  var bs = noise(t, dur + 0.02, 0.7 + Math.random() * 0.25);
  bs.connect(bf); srcs.push(bs);

  // --- sub drop 90 -> 28 Hz ---
  var subDur = 0.4 + 0.5 * size;
  var so = osc('sine', 90, t);
  so.frequency.setValueAtTime(fclamp(90), t);
  so.frequency.exponentialRampToValueAtTime(fclamp(28), t + subDur);
  var sog = pluck(t, clamp(0.6 + 0.3 * size, 0.5, 1.0), subDur * 1.15, 0.008);
  so.connect(sog); sog.connect(head);
  so.start(t); so.stop(t + subDur * 1.2 + 0.05);
  srcs.push(so);

  // --- debris: short randomised ticks scattered over the next ~0.8s ---
  var ticks = 6;
  for (var i = 0; i < ticks; i++) {
    var dt = t + 0.09 + Math.random() * 0.8;
    var td = 0.02 + Math.random() * 0.05;
    var th = hp(900 + Math.random() * 2200);
    var tg = pluck(dt, 0.1 + 0.14 * size * Math.random(), td, 0.001);
    th.connect(tg); tg.connect(head);
    var ts = noise(dt, td, 1.1 + Math.random() * 0.8);
    ts.connect(th); srcs.push(ts);
  }

  // --- long low tail ---
  var tf = lp(200, 0.8);
  tf.frequency.setValueAtTime(fclamp(240), t);
  tf.frequency.exponentialRampToValueAtTime(fclamp(70), t + dur);
  var tgn = A.ctx.createGain();
  tgn.gain.setValueAtTime(0.0001, t);
  tgn.gain.exponentialRampToValueAtTime(0.34 * size, t + 0.12);
  tgn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  tf.connect(tgn); tgn.connect(head);
  var tsrc = noise(t, dur + 0.02, 0.5); tsrc.connect(tf); srcs.push(tsrc);

  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 0.6) * 1000);
  voice(head, srcs);
}

export function helmetOn() {
  if (!A.ready || A.muted || !budget(5)) return;
  var t = now() + 0.002;
  var head = gainNode(0.6);
  head.connect(A.sfxGain);
  var srcs = [];

  // --- plastic latch: very short filtered noise transient ---
  var lf = bp(2800, 2.2);
  lf.frequency.setValueAtTime(fclamp(3400), t);
  lf.frequency.exponentialRampToValueAtTime(fclamp(1200), t + 0.03);
  var lg = pluck(t, 0.7, 0.035, 0.0008);
  lf.connect(lg); lg.connect(head);
  var ls = noise(t, 0.04, 1.4); ls.connect(lf); srcs.push(ls);

  // --- tight high click ---
  var co = osc('triangle', 5200, t);
  co.frequency.exponentialRampToValueAtTime(fclamp(2100), t + 0.014);
  var cg = pluck(t, 0.3, 0.022, 0.0006);
  co.connect(cg); cg.connect(head);
  co.start(t); co.stop(t + 0.04);
  srcs.push(co);

  // --- pressurised seal hiss: swells, then chokes off hard ---
  var hs = t + 0.055;
  var choke = t + 0.85;
  var hf = bp(1400, 1.0);
  hf.frequency.setValueAtTime(fclamp(900), hs);
  hf.frequency.exponentialRampToValueAtTime(fclamp(3000), choke - 0.1);
  hf.frequency.exponentialRampToValueAtTime(fclamp(1500), choke);
  var hg = A.ctx.createGain();
  hg.gain.setValueAtTime(0.0001, hs);
  hg.gain.exponentialRampToValueAtTime(0.34, hs + 0.42);
  hg.gain.setValueAtTime(0.34, choke - 0.05);
  // abrupt, not a fade: the seal snaps shut
  hg.gain.linearRampToValueAtTime(0.0001, choke + 0.018);
  hf.connect(hg); hg.connect(head);
  var hn = noise(hs, choke - hs + 0.05, 1.1); hn.connect(hf); srcs.push(hn);

  // --- low thunk as it locks ---
  var to = osc('sine', 105, choke);
  to.frequency.setValueAtTime(fclamp(105), choke);
  to.frequency.exponentialRampToValueAtTime(fclamp(42), choke + 0.16);
  var tg = pluck(choke, 0.5, 0.24, 0.005);
  to.connect(tg); tg.connect(head);
  to.start(choke); to.stop(choke + 0.3);
  srcs.push(to);

  voice(head, srcs);
}

/* ---------------------------------------------------------------
   7. breath(cycles) - amplified in-mask breathing
   Close-mic'd: narrow bandpass + a lowpass lid keeps it from
   turning into wind.
   --------------------------------------------------------------- */
export function breath(cycles) {
  if (!A.ready || A.muted) return;
  var n = Math.round(clamp(cycles == null ? 2 : cycles, 1, 4));
  if (!budget(n * 2 + 2)) return;
  var t = now() + 0.002;
  var head = gainNode(0.5);
  var lid = lp(2600, 0.7);
  lid.connect(head);
  head.connect(A.sfxGain);
  var srcs = [];

  var IN = 0.75, OUT = 0.85, GAP = 0.1, PAUSE = 0.25;
  var per = IN + GAP + OUT + PAUSE;

  for (var i = 0; i < n; i++) {
    var c0 = t + i * per;

    // inhale: filter opens upward, effortful swell
    var inF = bp(320, 1.6);
    inF.frequency.setValueAtTime(fclamp(300), c0);
    inF.frequency.exponentialRampToValueAtTime(fclamp(1250), c0 + IN);
    var inG = A.ctx.createGain();
    inG.gain.setValueAtTime(0.0001, c0);
    inG.gain.exponentialRampToValueAtTime(0.34, c0 + IN * 0.72);
    inG.gain.exponentialRampToValueAtTime(0.0001, c0 + IN);
    inF.connect(inG); inG.connect(lid);
    var inS = noise(c0, IN + 0.02, 0.55); inS.connect(inF); srcs.push(inS);

    // exhale: lower, softer, filter closing
    var o0 = c0 + IN + GAP;
    var exF = bp(900, 1.3);
    exF.frequency.setValueAtTime(fclamp(880), o0);
    exF.frequency.exponentialRampToValueAtTime(fclamp(240), o0 + OUT);
    var exG = A.ctx.createGain();
    exG.gain.setValueAtTime(0.0001, o0);
    exG.gain.exponentialRampToValueAtTime(0.24, o0 + OUT * 0.28);
    exG.gain.exponentialRampToValueAtTime(0.0001, o0 + OUT);
    exF.connect(exG); exG.connect(lid);
    var exS = noise(o0, OUT + 0.02, 0.42); exS.connect(exF); srcs.push(exS);
  }

  voice(head, srcs);
  setTimeout(function () { try { lid.disconnect(); } catch (e) { } }, (n * per + 0.6) * 1000);
}

/* ---------------------------------------------------------------
   8. beep(pitch) - HUD blip, ~90ms.  Cheap: fired ~10x in a row.
   --------------------------------------------------------------- */
export function beep(pitch) {
  if (!A.ready || A.muted || !budget(3)) return;
  var p = (pitch == null || !isFinite(+pitch)) ? Math.random() : clamp(pitch, 0, 1);
  var t = now() + 0.002;
  var dur = 0.09;
  var f0 = 700 + 1500 * p;
  // low head gain so a 10-blip burst stacks without slamming the soft clipper
  var head = gainNode(0.24);
  head.connect(A.sfxGain);

  var flt = lp(fclamp(f0 * 4 + 1800), 1.1);
  var g = pluck(t, 0.5, dur, 0.0015);
  flt.connect(g); g.connect(head);

  var a = osc('square', f0, t);
  var b = osc('triangle', f0 * 2.002, t);
  var bg = gainNode(0.35);
  a.connect(flt); b.connect(bg); bg.connect(flt);
  a.start(t); a.stop(t + dur + 0.01);
  b.start(t); b.stop(t + dur + 0.01);

  voice(head, [a, b]);
}

/* ---------------------------------------------------------------
   9. riser(dur) - scene-transition tension riser landing on an
   impact at exactly t+dur.  (The music module has its own private
   riser() with a different signature; this is the cinematic one.)
   --------------------------------------------------------------- */
export function cineRiser(dur) {
  if (!A.ready || A.muted || !budget(6)) return;
  dur = clamp(dur == null ? 3 : dur, 0.4, 8);
  var t = now() + 0.002;
  var hit = t + dur;
  var head = gainNode(0.55);
  head.connect(A.sfxGain);
  var srcs = [];

  // --- noise through an exponentially rising bandpass ---
  var nf = bp(220, 2.6);
  nf.frequency.setValueAtTime(fclamp(200), t);
  nf.frequency.exponentialRampToValueAtTime(fclamp(9000), hit);
  var ngn = A.ctx.createGain();
  ngn.gain.setValueAtTime(0.0001, t);
  ngn.gain.exponentialRampToValueAtTime(0.5, hit - 0.02);
  ngn.gain.exponentialRampToValueAtTime(0.0001, hit + 0.05);
  nf.connect(ngn); ngn.connect(head);
  var ns = noise(t, dur + 0.08, 1.0); ns.connect(nf); srcs.push(ns);

  // --- saw rising two octaves ---
  var o = osc('sawtooth', 140, t);
  o.frequency.setValueAtTime(fclamp(140), t);
  o.frequency.exponentialRampToValueAtTime(fclamp(560), hit);
  var of = lp(600, 6);
  of.frequency.setValueAtTime(fclamp(500), t);
  of.frequency.exponentialRampToValueAtTime(fclamp(6500), hit);
  var og = A.ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.32, hit - 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, hit + 0.05);
  o.connect(of); of.connect(og); og.connect(head);
  o.start(t); o.stop(hit + 0.08);
  srcs.push(o);

  // --- the landing: sub drop ---
  var so = osc('sine', 120, hit);
  so.frequency.setValueAtTime(fclamp(120), hit);
  so.frequency.exponentialRampToValueAtTime(fclamp(32), hit + 0.4);
  var sg = pluck(hit, 0.95, 0.55, 0.005);
  so.connect(sg); sg.connect(head);
  so.start(hit); so.stop(hit + 0.62);
  srcs.push(so);

  // --- the landing: noise slam ---
  var hf = lp(4000, 1.2);
  hf.frequency.setValueAtTime(fclamp(4500), hit);
  hf.frequency.exponentialRampToValueAtTime(fclamp(150), hit + 0.45);
  var hg = pluck(hit, 0.7, 0.5, 0.002);
  hf.connect(hg); hg.connect(head);
  var hs = noise(hit, 0.52, 0.8); hs.connect(hf); srcs.push(hs);

  voice(head, srcs);
}

/* ---------------------------------------------------------------
   10. jetPass(pan) - doppler flyby, ~1.5s.  Travels -pan -> +pan.
   --------------------------------------------------------------- */
export function jetPass(pan) {
  if (!A.ready || A.muted || !budget(4)) return;
  var p = clamp(pan == null ? 1 : pan, -1, 1);
  var t = now() + 0.002;
  var dur = 1.5;
  var mid = t + dur * 0.45;
  var head = gainNode(0.7);
  var pn = panner(-p);
  if (pn) {
    try {
      pn.pan.setValueAtTime(clamp(-p, -1, 1), t);
      pn.pan.linearRampToValueAtTime(clamp(p, -1, 1), t + dur);
    } catch (e) { }
    head.connect(pn); pn.connect(A.sfxGain);
  } else head.connect(A.sfxGain);
  var srcs = [];

  // --- roar: bandpass rises on approach, falls on departure ---
  var f = bp(400, 1.5);
  f.frequency.setValueAtTime(fclamp(340), t);
  f.frequency.exponentialRampToValueAtTime(fclamp(2200), mid);
  f.frequency.exponentialRampToValueAtTime(fclamp(280), t + dur);
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.75, mid);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(head);
  var ns = noise(t, dur + 0.02, 1.0); ns.connect(f); srcs.push(ns);

  // --- low rumble tail, peaks slightly after the pass ---
  var rf = lp(220, 1.0);
  rf.frequency.setValueAtTime(fclamp(320), t);
  rf.frequency.exponentialRampToValueAtTime(fclamp(90), t + dur + 0.5);
  var rg = A.ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.45, mid + 0.12);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  rf.connect(rg); rg.connect(head);
  var rs = noise(t, dur + 0.52, 0.55); rs.connect(rf); srcs.push(rs);

  if (pn) setTimeout(function () { try { pn.disconnect(); } catch (e) { } }, (dur + 1.1) * 1000);
  voice(head, srcs);
}

