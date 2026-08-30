/* ===== core/mat4.js — 4x4 matrix helpers ===== */
export const M4 = {
  create(){ return new Float32Array(16); },
  ident(o){ o.fill(0); o[0]=o[5]=o[10]=o[15]=1; return o; },
  mul(o,a,b){
    for(let c=0;c<4;c++){
      const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
      o[c*4  ]=a[0]*b0+a[4]*b1+a[8]*b2+a[12]*b3;
      o[c*4+1]=a[1]*b0+a[5]*b1+a[9]*b2+a[13]*b3;
      o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
      o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
    }
    return o;
  },
  persp(o,fovy,asp,n,f){
    const t=1/Math.tan(fovy/2); o.fill(0);
    o[0]=t/asp; o[5]=t; o[10]=(f+n)/(n-f); o[11]=-1; o[14]=2*f*n/(n-f);
    return o;
  },
  lookAt(o,ex,ey,ez,tx,ty,tz,ux,uy,uz){
    let zx=ex-tx, zy=ey-ty, zz=ez-tz;
    let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    let xx=uy*zz-uz*zy, xy=uz*zx-ux*zz, xz=ux*zy-uy*zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    o[0]=xx; o[1]=yx; o[2]=zx; o[3]=0;
    o[4]=xy; o[5]=yy; o[6]=zy; o[7]=0;
    o[8]=xz; o[9]=yz; o[10]=zz; o[11]=0;
    o[12]=-(xx*ex+xy*ey+xz*ez);
    o[13]=-(yx*ex+yy*ey+yz*ez);
    o[14]=-(zx*ex+zy*ey+zz*ez);
    o[15]=1;
    return o;
  },
  rotX(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[5]=c;o[6]=s;o[9]=-s;o[10]=c; return o; },
  rotY(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[0]=c;o[2]=-s;o[8]=s;o[10]=c; return o; },
  rotZ(o,t){ const c=Math.cos(t),s=Math.sin(t); M4.ident(o); o[0]=c;o[1]=s;o[4]=-s;o[5]=c; return o; }
};
export const _a=M4.create(), _b=M4.create(), _c=M4.create(), _d=M4.create(), _e=M4.create();
export function compose(out, x,y,z, rx,ry,rz, s){
  M4.mul(_c, M4.rotY(_a,ry), M4.rotX(_b,rx));
  M4.mul(_d, _c, M4.rotZ(_a,rz));
  if(s!==1) for(let i=0;i<12;i++) _d[i]*=s;
  out.set(_d); out[12]=x; out[13]=y; out[14]=z; out[15]=1;
  return out;
}
