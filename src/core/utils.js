/* ===== core/utils.js — small numeric / color helpers ===== */
export const rnd=(a,b)=>a+Math.random()*(b-a);
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const css=c=>'rgb('+(c[0]*255|0)+','+(c[1]*255|0)+','+(c[2]*255|0)+')';
