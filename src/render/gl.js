/* ===== render/gl.js — WebGL bootstrap: context, programs, buffers, meshes ===== */
import { MODELS } from './models.js';
import { SHADERS } from './shaders.js';

/* ------------------------------------------------------------------ gl setup */
export const glc = document.getElementById('gl');
export const hud = document.getElementById('hud');
export const h2d = hud.getContext('2d');
export const gl = glc.getContext('webgl', {antialias:true, alpha:false, powerPreference:'high-performance'})
        || glc.getContext('experimental-webgl', {antialias:true, alpha:false});
if(!gl) throw new Error('WebGL unavailable');

export let W=0,H=0,DPR=1;
export function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  glc.width = Math.round(W*DPR); glc.height = Math.round(H*DPR);
  hud.width  = Math.round(W*DPR); hud.height = Math.round(H*DPR);
  h2d.setTransform(DPR,0,0,DPR,0,0);
  gl.viewport(0,0,glc.width,glc.height);
}
addEventListener('resize', resize); resize();

export function compile(type, src, tag){
  const s = gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))
    throw new Error(tag+' shader: '+gl.getShaderInfoLog(s));
  return s;
}
export function program(def, attribs, tag){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, def.vs, tag+'.vs'));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, def.fs, tag+'.fs'));
  attribs.forEach((n,i)=>gl.bindAttribLocation(p,i,n));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))
    throw new Error(tag+' link: '+gl.getProgramInfoLog(p));
  const u = new Proxy({}, {get:(t,k)=> (k in t? t[k] : (t[k]=gl.getUniformLocation(p,k)))});
  return {p,u};
}
export const Plit = program(SHADERS.lit, ['aPos','aNormal','aColor'], 'lit');
export const Pspr = program(SHADERS.spr, ['aPos','aUV','aColor','aKind'], 'spr');
export const Psky = program(SHADERS.sky, ['aPos'], 'sky');

export function attribs(n){
  for(let i=0;i<4;i++){ if(i<n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); }
}
export function upload(data, usage){
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage||gl.STATIC_DRAW);
  return b;
}
export function mesh(verts){ return {buf:upload(verts), n:verts.length/9}; }

export const MESH = {
  jet:        mesh(MODELS.jet),
  drone:      mesh(MODELS.drone),
  cruiser:    mesh(MODELS.cruiser),
  mothership: mesh(MODELS.mothership),
  crate:      mesh(MODELS.crate),
  shard:      mesh(MODELS.shard)
};
export const ATT = MODELS.attach;

export const skyBuf = upload(new Float32Array([-1,-1, 3,-1, -1,3]));
