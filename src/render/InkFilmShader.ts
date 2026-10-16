// Full-screen composite that turns a toon-shaded render into an inked, filmed 1930s cartoon:
//  - ink lines from depth discontinuities and creases (screen-space, with "line boil")
//  - watercolor-style atmospheric haze from depth
//  - sepia-leaning grade, film grain, gate flicker, dust, scratches and a heavy vignette

export const InkFilmShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uNear;
    uniform float uFar;
    uniform float uLine;
    uniform float uBoil;
    uniform vec3 uInk;
    uniform vec3 uHaze;
    uniform float uHazeStart;
    uniform float uHazeDist;
    uniform float uHazeMax;
    uniform float uGrain;
    uniform float uFlicker;
    uniform float uScratch;
    uniform float uVignette;
    uniform float uSepia;
    uniform float uSat;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uEdgeOn;
    varying vec2 vUv;

    float h12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vn(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float linZ(float d) {
      return uNear * uFar / (uFar - d * (uFar - uNear));
    }
    float W(vec2 uv) { return 1.0 / linZ(texture2D(tDepth, uv).x); }
    vec3 NRM(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    float nDiff(vec3 a, vec3 b) {
      float la = length(a);
      float lb = length(b);
      if (la < 0.5 || lb < 0.5) return 0.0;
      return 1.0 - dot(a, b) / (la * lb);
    }

    void main() {
      float frame = floor(uTime * 12.0);
      vec2 px = 1.0 / uRes;

      // ---- Line boil: edges are detected at a slightly wobbling position that changes 12x/sec.
      vec2 wob = vec2(vn(vUv * uRes / 70.0 + frame * 7.13), vn(vUv * uRes / 70.0 + 17.7 + frame * 3.71)) - 0.5;
      vec2 uv = vUv + wob * px * 2.4 * uBoil;

      float dRaw = texture2D(tDepth, vUv).x;
      float z0 = linZ(dRaw);
      bool isSky = dRaw > 0.999999;

      float edge = 0.0;
      if (uEdgeOn > 0.5) {
        vec2 o = px * uLine;
        float wc = W(uv);
        float wl = W(uv - vec2(o.x, 0.0));
        float wr = W(uv + vec2(o.x, 0.0));
        float wd = W(uv - vec2(0.0, o.y));
        float wu = W(uv + vec2(0.0, o.y));
        float w1 = W(uv + o);
        float w2 = W(uv - o);
        float w3 = W(uv + vec2(o.x, -o.y));
        float w4 = W(uv + vec2(-o.x, o.y));
        float wmax = max(max(max(wl, wr), max(wu, wd)), max(max(w1, w2), max(w3, w4)));
        float zc = 1.0 / wc;
        // Silhouettes: some neighbour is much nearer than the local linear depth trend explains.
        // (On a plane seen at a grazing angle 1/z changes linearly, so the trend absorbs it.)
        float trend = max(max(abs(wr - wl), abs(wu - wd)), max(abs(w1 - w2), abs(w3 - w4)) * 0.7) * 0.5;
        float gap = (wmax - wc - trend * 1.25) / max(wc, 1e-6);
        float sil = smoothstep(0.015, 0.045, gap);
        // Creases: the surface normal turns sharply.
        vec3 nc = NRM(uv);
        float nd = max(max(nDiff(nc, NRM(uv - vec2(o.x, 0.0))), nDiff(nc, NRM(uv + vec2(o.x, 0.0)))),
                       max(nDiff(nc, NRM(uv - vec2(0.0, o.y))), nDiff(nc, NRM(uv + vec2(0.0, o.y)))));
        float crease = smoothstep(0.22, 0.45, nd) * (1.0 - smoothstep(70.0, 200.0, zc));
        float fade = 1.0 - smoothstep(uFar * 0.16, uFar * 0.5, min(zc, 1.0 / wmax));
        edge = max(sil, crease) * fade;
      }

      vec3 col = texture2D(tColor, vUv).rgb;

      // ---- Watercolor haze
      float haze = isSky ? 0.0 : (1.0 - exp(-max(z0 - uHazeStart, 0.0) / uHazeDist)) * uHazeMax;
      col = mix(col, uHaze, haze);
      vec3 ink = mix(uInk, uHaze, clamp(haze * 1.1, 0.0, 0.85));
      col = mix(col, ink, edge);

      // ---- Flash (hits, lightning, super)
      col = mix(col, uFlashColor, uFlash);

      // to display space for the film treatment
      vec4 outc = linearToOutputTexel(vec4(col, 1.0));
      vec3 c = outc.rgb;

      // ---- Grade: a little sepia and warmth, gentle contrast.
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 sep = vec3(l) * vec3(1.08, 0.97, 0.80);
      c = mix(c, sep, uSepia);
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * 1.06 + 0.5;
      c *= vec3(1.02, 1.0, 0.94);

      // ---- Paper tooth (static) + film grain (24fps)
      float f24 = floor(uTime * 24.0);
      float paper = vn(gl_FragCoord.xy / 2.5) * 0.5 + vn(gl_FragCoord.xy / 37.0) * 0.5;
      c *= 0.965 + 0.05 * paper;
      float g = h12(gl_FragCoord.xy + f24 * 61.7) - 0.5;
      c += g * uGrain;

      // ---- Gate flicker
      c *= 1.0 + (h12(vec2(f24, 3.3)) - 0.5) * uFlicker;

      // ---- Dust specks & hairline scratches
      if (uScratch > 0.0) {
        vec2 cell = floor(gl_FragCoord.xy / 7.0);
        float r = h12(cell + f24 * 13.1);
        if (r > 0.99975) {
          vec2 cc = (cell + 0.5) * 7.0;
          float dd = length(gl_FragCoord.xy - cc);
          c = mix(c, vec3(0.12, 0.08, 0.05), smoothstep(3.2, 1.5, dd) * 0.75 * uScratch);
        }
        for (int i = 0; i < 2; i++) {
          float fi = float(i);
          float on = step(0.72, h12(vec2(floor(uTime * 6.0) + fi * 9.1, 7.7)));
          float sx = h12(vec2(floor(uTime * 6.0), fi * 3.1)) + sin(vUv.y * 9.0 + fi) * 0.003;
          float dx = abs(vUv.x - sx) * uRes.x;
          c = mix(c, vec3(0.95, 0.9, 0.78), smoothstep(1.2, 0.0, dx) * on * 0.45 * uScratch);
        }
      }

      // ---- Vignette (rounded-rect, like a projected frame)
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      float v = smoothstep(0.95, 0.32, length(q * vec2(0.82, 1.0)));
      c *= mix(1.0, v, uVignette);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};
