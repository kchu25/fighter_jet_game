/* SKYFALL INTERCEPTOR - GLSL module
   WebGL 1 / GLSL ES 1.00. No textures, everything procedural.
   Defines exactly one global: SHADERS */
export const SHADERS = {

/* ============================================================
   lit : low-poly ship meshes.
   TRIANGLES, depth test + write on, blending off, culling OFF.
   loc0 aPos, loc1 aNormal, loc2 aColor
   ============================================================ */
lit: {
vs: `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;

uniform mat4 uMVP;
uniform mat4 uModel;

varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vCol;
varying float vDepth;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWPos = wp.xyz;
  /* rigid model matrix: transforming the normal as a direction is enough,
     and avoids mat3(mat4) which GLSL ES 1.00 forbids */
  vWNrm = (uModel * vec4(aNormal, 0.0)).xyz;
  vCol = aColor;

  vec4 cp = uMVP * vec4(aPos, 1.0);
  vDepth = cp.w;
  gl_Position = cp;
}
`,
fs: `
precision mediump float;

varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vCol;
varying float vDepth;

uniform vec3 uCam;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform float uAlpha;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
/* 0.0 = the usual neon fresnel edge (default for an unset uniform, so every
   existing draw call is untouched). 1.0 = matte, for huge grazing-angle
   surfaces like the desert floor, where a full-strength rim washes to white. */
uniform float uMatte;

void main() {
  /* winding is inconsistent and culling is off -> face the normal at us */
  vec3 N = normalize(vWNrm);
  if (!gl_FrontFacing) N = -N;

  vec3 V = normalize(uCam - vWPos);
  vec3 L = normalize(uLightDir);

  /* --- key: warm sunset sun ------------------------------------ */
  float ndl = max(dot(N, L), 0.0);
  vec3 keyCol = vec3(1.00, 0.72, 0.48) * 1.30;

  /* --- fill: cool cyan bounce from the opposite side ------------ */
  float ndf = max(dot(N, -L), 0.0);
  vec3 fillCol = vec3(0.24, 0.46, 0.92) * 0.42;

  /* --- ambient: cool indigo sky above, warm magenta ground below -
     the two tones sit a touch further apart than the old pair (more
     blue up top, more red underneath) so curvature alone rolls a hull
     cool-to-warm even before the key light lands on it */
  float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyAmb = vec3(0.095, 0.105, 0.260);
  vec3 gndAmb = vec3(0.440, 0.085, 0.300);
  vec3 amb = mix(gndAmb, skyAmb, up);

  /* side-facing normals catch the sunset band itself: a faint ember
     wash, strongest where N is horizontal and gone at the poles, so
     fuselage flanks pick up the horizon's colour in level flight */
  float horizN = 1.0 - abs(N.y);
  amb += vec3(0.30, 0.13, 0.05) * horizN * horizN * horizN * 0.40;

  /* extra horizon bounce: undersides pick up the neon grid glow */
  float under = pow(clamp(-N.y, 0.0, 1.0), 1.5);
  amb += vec3(0.55, 0.08, 0.42) * under * 0.55;

  /* --- FRESNEL RIM : the neon edge, the whole point -------------
     A grazing-angle ground plane has fres ~= 1 everywhere, so a full rim
     washes the desert to white. uMatte damps it; it also lets the four
     pow() calls be skipped entirely on the big terrain fills. */
  float fres = 1.0 - max(dot(N, V), 0.0);
  float rimK = 1.0 - clamp(uMatte, 0.0, 1.0);

  /* --- composite ------------------------------------------------ */
  vec3 col = vCol * (amb + keyCol * ndl + fillCol * ndf);

  if (rimK > 0.004) {
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    /* two-lobe metal response: a tight mirror core riding on a wide,
       faint sheen. The core stays sun-coloured; the sheen borrows the
       hull albedo, which is the cue that tips paint from plastic over
       into brushed metal. */
    float spec = pow(ndh, 96.0);
    float sheen = pow(ndh, 12.0);
    float rim = pow(fres, 3.0);
    float hotRim = pow(fres, 9.0);

    /* rim hue: cyan on the up-facing edges, magenta on the low ones */
    vec3 rimCol = mix(vec3(1.00, 0.14, 0.72), vec3(0.32, 0.94, 1.00), up);
    rimCol *= (0.55 + 0.85 * vCol);

    col += keyCol * spec * 1.55 * rimK;
    col += keyCol * mix(vec3(1.0), vCol * 1.60, 0.60) * sheen * 0.30 * rimK;
    col += rimCol * rim * 2.10 * rimK;
    col += vec3(1.0) * hotRim * 0.45 * rimK;
  }

  /* additive emissive (damage flashes / boss phases) */
  col += uTint * (0.85 + 0.95 * fres);

  /* Floor at black BEFORE the rolloff: col/(1+col) has a pole at -1, so a
     strongly negative tint (the phantom's decloak drives channels to ~-1.7
     at grazing fresnel) flips to a huge POSITIVE there and a blackout tint
     renders as neon. Sub--1 was never a meaningful colour — clamp it. */
  col = max(col, vec3(0.0));

  /* gentle highlight rolloff so neons bloom instead of clipping flat */
  col = mix(col, col / (1.0 + col), 0.35);

  /* --- fog: dissolve into the horizon haze ---------------------- */
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  fog = fog * fog * (3.0 - 2.0 * fog);
  /* hold the fresnel edge ~10% out of the haze so a distant hull keeps a
     readable silhouette line while its faces dissolve evenly. rimK gates
     the matte terrain, where fres ~= 1 everywhere and the hold would lift
     the whole floor out of the fog it is supposed to sink into. */
  fog *= 1.0 - 0.10 * fres * fres * fres * rimK;
  col = mix(col, uFogColor, fog);

  gl_FragColor = vec4(col, uAlpha);
}
`
},

/* ============================================================
   spr : every additive FX in one batch.
   TRIANGLES (sprites/beams) + LINES (grid), blend ONE,ONE,
   depth test on, depth write off.
   loc0 aPos, loc1 aUV, loc2 aColor, loc3 aKind
   ============================================================ */
spr: {
vs: `
attribute vec3 aPos;
attribute vec2 aUV;
attribute vec4 aColor;
attribute float aKind;

uniform mat4 uVP;

varying vec2 vUV;
varying vec4 vCol;
varying float vKind;
varying float vDepth;

void main() {
  vUV = aUV;
  vCol = aColor;
  vKind = aKind;
  vec4 cp = uVP * vec4(aPos, 1.0);
  vDepth = cp.w;
  gl_Position = cp;
}
`,
fs: `
precision mediump float;

varying vec2 vUV;
varying vec4 vCol;
varying float vKind;
varying float vDepth;

uniform float uFogNear;
uniform float uFogFar;

void main() {
  vec2 uv = vUV;

  /* ---- kind 0.0 : soft radial dot ----------------------------- */
  float d = length(uv - vec2(0.5)) * 2.0;
  float rr = clamp(1.0 - d, 0.0, 1.0);
  float radial = rr * rr * (3.0 - 2.0 * rr);      /* == 1.0 at uv 0.5,0.5 */

  /* ---- kind 1.0 : beam, sharp core across U, tapered along V --- */
  float du = clamp(abs(uv.x - 0.5) * 2.0, 0.0, 1.0);
  float bu = 1.0 - du;
  float core = mix(bu * bu, bu * bu * bu * bu * bu * bu, 0.5);
  float dv = clamp(abs(uv.y - 0.5) * 2.0, 0.0, 1.0);
  float taper = clamp(1.0 - dv * dv * dv, 0.0, 1.0);
  float beam = core * taper;                      /* == 1.0 at uv 0.5,0.5 */

  /* grid LINES arrive with uv (0.5,0.5): both branches give 1.0,
     so the blend below is 1.0 for any aKind. */
  float shape = mix(radial, beam, clamp(vKind, 0.0, 1.0));

  float a = shape * vCol.a;

  /* ---- melt into the haze instead of popping ------------------- */
  float fade = 1.0 - clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  fade = fade * fade * (3.0 - 2.0 * fade);
  a *= fade;

  if (a < 0.003) discard;

  /* ---- additive hot core: burn toward white at high intensity --- */
  vec3 rgb = vCol.rgb;
  float heat = clamp(shape * shape * shape * vCol.a * 1.35, 0.0, 1.0);
  rgb = mix(rgb, vec3(1.0), heat * 0.80);
  rgb *= (0.80 + 0.60 * shape);

  /* premultiplied for ONE,ONE */
  gl_FragColor = vec4(rgb * a, a);
}
`
},

/* ============================================================
   sky : full-screen triangle, depth test disabled, drawn first.
   loc0 aPos (clip space vec2)
   ============================================================ */
sky: {
vs: `
attribute vec2 aPos;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`,
fs: `
precision mediump float;

varying vec2 vNdc;

uniform vec2 uRes;
uniform float uHorizon;
uniform float uSunX;
uniform float uTime;
uniform float uBoss;

void main() {
  vec2 uv = vNdc * 0.5 + 0.5;            /* 0..1, y=0 bottom */
  float boss = clamp(uBoss, 0.0, 1.0);
  float aspect = max(uRes.x, 1.0) / max(uRes.y, 1.0);

  float above = uv.y - uHorizon;
  float tUp = clamp(above / max(1.0 - uHorizon, 0.001), 0.0, 1.0);
  float tDn = clamp(-above / max(uHorizon, 0.001), 0.0, 1.0);

  /* ---------- upper sky: indigo -> violet -> magenta -> ember --- */
  vec3 cInk    = vec3(0.015, 0.010, 0.065);
  vec3 cIndigo = vec3(0.075, 0.045, 0.210);
  vec3 cViolet = vec3(0.290, 0.075, 0.470);
  vec3 cMag    = vec3(0.900, 0.150, 0.520);
  vec3 cEmber  = vec3(1.000, 0.480, 0.180);

  vec3 sky = mix(cEmber, cMag, smoothstep(0.000, 0.055, tUp));
  sky = mix(sky, cViolet, smoothstep(0.035, 0.230, tUp));
  sky = mix(sky, cIndigo, smoothstep(0.180, 0.560, tUp));
  sky = mix(sky, cInk,    smoothstep(0.520, 1.000, tUp));

  /* ---------- below the horizon: darker, magenta ground haze ---- */
  vec3 gnd = mix(vec3(0.330, 0.055, 0.300), vec3(0.055, 0.012, 0.100),
                 smoothstep(0.0, 0.28, tDn));
  gnd = mix(gnd, vec3(0.012, 0.004, 0.035), smoothstep(0.22, 0.85, tDn));

  vec3 col = mix(gnd, sky, step(uHorizon, uv.y));

  /* ---------- faint high-altitude banding ------------------------
     slow shallow strata in the upper sky, bowed by x*x so they read
     as curved shells of air seen edge-on instead of flat screen
     stripes. Biased to 0..1 so the dips never fight the zenith ink. */
  float bow = vNdc.x * vNdc.x * 0.35;
  float strata = sin((tUp + bow) * 22.0 - uTime * 0.060) * 0.6
               + sin((tUp + bow) * 37.0 + uTime * 0.040) * 0.4;
  col += vec3(0.030, 0.024, 0.080) * (0.5 + 0.5 * strata)
         * smoothstep(0.30, 0.80, tUp);

  /* ---------- drifting haze striations -------------------------- */
  float n = sin(uv.x *  6.0 + uTime * 0.070) * 0.55
          + sin(uv.x * 11.3 - uTime * 0.053) * 0.30
          + sin(uv.x * 19.7 + uTime * 0.110) * 0.15;

  float cl = exp(-abs(above - 0.075 - n * 0.013) * 62.0)
           + exp(-abs(above - 0.140 + n * 0.011) * 46.0) * 0.70
           + exp(-abs(above - 0.228 - n * 0.015) * 34.0) * 0.42
           + exp(-abs(above - 0.340 + n * 0.018) * 26.0) * 0.24;
  cl *= smoothstep(0.0, 0.045, above);

  /* ---------- the sun ------------------------------------------- */
  float sunR = 0.165;
  vec2 p = vec2((uv.x - uSunX) * aspect, above);
  float sd = length(p) / sunR;

  /* horizontal nearness to the sun, used to warm the horizon glow */
  float sunNear = pow(clamp(1.0 - abs(uv.x - uSunX) * aspect * 0.85, 0.0, 1.0), 2.0);

  /* ---------- warm scatter turn around the sun -------------------
     a wide forward-scatter skirt plus a tighter core bend the whole
     gradient warm near the sun: two depths of air instead of one
     linear glow. A mix, not an add, so it turns the hue without
     stacking more brightness under the halo. */
  float scat = exp(-sd * 0.45) * 0.62 + exp(-sd * sd * 2.10) * 0.38;
  col = mix(col, col * vec3(1.10, 0.96, 0.82) + vec3(0.100, 0.045, 0.008),
            scat * 0.60);

  col += mix(vec3(0.95, 0.35, 0.78), vec3(1.00, 0.62, 0.34), sunNear)
         * cl * (0.20 + 0.42 * sunNear);

  /* ---------- layered horizon dust -------------------------------
     thin dark streaks drifting between the bright haze bands:
     multiplicative, so they read as occluding layers of dusty air
     rather than yet more glow. Applied before the disc draw, whose
     mix() overwrites them, so the sun itself stays crisp. */
  float dph = sin(uv.x * 9.1 - uTime * 0.041)
            + sin(uv.x * 15.7 + uTime * 0.026) * 0.6;
  float dust = exp(-abs(above - 0.052 - dph * 0.008) * 90.0) * 0.50
             + exp(-abs(above - 0.105 + dph * 0.010) * 70.0) * 0.35
             + exp(-abs(above - 0.185 - dph * 0.012) * 55.0) * 0.25;
  dust *= smoothstep(0.0, 0.030, above);
  col *= 1.0 - dust * 0.34;

  /* vertical yellow -> orange -> hot pink across the disc */
  float sy = clamp(p.y / sunR * 0.5 + 0.5, 0.0, 1.0);
  vec3 sunCol = mix(vec3(0.98, 0.10, 0.46), vec3(0.99, 0.36, 0.09),
                    smoothstep(0.02, 0.52, sy));
  sunCol = mix(sunCol, vec3(0.99, 0.83, 0.26), smoothstep(0.48, 1.00, sy));

  /* signature scanline slices, gaps thicken toward the bottom */
  float f = fract(p.y / sunR * 6.0 - uTime * 0.045);
  float thick = mix(0.70, 0.015, smoothstep(-0.05, 0.88, sy));
  float slice = smoothstep(thick - 0.045, thick + 0.045, f);

  float disc = 1.0 - smoothstep(0.975, 1.005, sd);
  /* the half sinking below the horizon reads dimmer, as if in haze */
  float sink = mix(0.55, 1.0, smoothstep(-0.03, 0.06, above));
  float discMask = disc * slice * sink;
  col = mix(col, sunCol * 1.06, discMask);

  /* soft bloom halo -- damped inside the disc so the vertical
     yellow->orange->pink gradient doesn't clip to flat white */
  float halo = pow(clamp(1.0 - sd * 0.40, 0.0, 1.0), 3.0);
  halo *= 1.0 - discMask * 0.82;
  col += mix(vec3(1.00, 0.30, 0.55), vec3(1.00, 0.55, 0.22), sy) * halo * 0.60;

  /* ---------- atmospheric glow band hugging the horizon --------- */
  float pulse = 1.0 + boss * 0.42 * sin(uTime * 4.2);
  float hb = exp(-abs(above) * 34.0) * pulse;
  hb += exp(-abs(above) * 8.0) * 0.30;
  col += mix(vec3(0.95, 0.28, 0.62), vec3(1.00, 0.66, 0.30), sunNear)
         * hb * (0.34 + 0.85 * sunNear);

  /* ---------- boss: shift the whole palette to crimson ----------- */
  float luma = dot(col, vec3(0.36, 0.50, 0.14));
  vec3 menace = vec3(luma) * vec3(1.70, 0.20, 0.24) + col * 0.16;
  menace += vec3(0.25, 0.0, 0.03) * exp(-abs(above) * 12.0)
            * (0.6 + 0.4 * sin(uTime * 2.6));
  /* ambient dread: a slow blood glow breathing down from the zenith,
     deliberately off-tempo from the horizon pulse above it, so a full
     boss bar feels enclosing from both sides, not a flat red filter */
  menace += vec3(0.16, 0.010, 0.028) * tUp
            * (0.55 + 0.45 * sin(uTime * 1.7 + 2.6));
  col = mix(col, menace, boss * 0.90);

  /* ---------- vignette ------------------------------------------ */
  vec2 q = (uv - 0.5) * vec2(1.06, 1.0);
  float vig = smoothstep(1.05, 0.22, length(q));
  col *= mix(0.52, 1.0, vig);

  /* ---------- dither: kills banding in the big gradients --------
     small coefficients keep the sin() argument inside mediump range */
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(0.00714, 0.01131))) * 4375.545);
  col += (dn - 0.5) * 0.0045;

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`
}

};
