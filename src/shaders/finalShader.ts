import { VS } from './common';

export const finalShader = {
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D tMask, tF;
    uniform vec2 uPx, uFT, uPtr;
    uniform float uFS, uT, uBevel, uChisel, uThr, uIri, uFlat, uAlphaBg;
    uniform vec3 uSky, uHor, uBand, uGround, uBg;
    varying vec2 vUv;

    float H(vec2 u) {
      float h = texture2D(tF, u).r * 10.0;
      if (uChisel > 0.001) {
        float nh = clamp(h * 0.15, 0.0, 1.0);
        float peaked = pow(nh, mix(1.0, 0.52, uChisel)) / 0.15;
        h = mix(h, peaked, uChisel);
      }
      return h;
    }

    vec3 env(vec3 r) {
      float x = r.x, y = r.y;
      
      // Bryce 3D Split Horizon: sharp contrast boundary between ground and sky
      vec3 sky = mix(uHor * 0.65, uSky, smoothstep(0.0, 0.85, y));
      vec3 ground = mix(uGround, vec3(0.008, 0.012, 0.02), smoothstep(0.0, -0.65, y));
      
      // Hard horizon line split (signature Bryce 3D / late 90s CGI)
      float horizonCut = smoothstep(-0.012, 0.012, y);
      vec3 c = mix(ground, sky, horizonCut);
      
      // Blinding white-hot razor horizon specular burn
      float horFlash = exp(-abs(y) * 26.0) * 1.55;
      c += uHor * horFlash;
      
      // Bryce reflective ground striations below the horizon (y < 0)
      if (y < 0.0) {
        float groundWave = smoothstep(0.35, 0.9, sin(x * 14.0 / (max(-y, 0.03) + 0.06) + 1.2));
        c += uGround * 0.5 * groundWave * smoothstep(0.0, -0.12, y);
      }
      
      // High-contrast studio softbox reflection bands in the sky (y > 0)
      float bar1 = exp(-pow((y - 0.28) * 8.5, 2.0));
      float bar2 = exp(-pow((y - 0.62) * 7.5, 2.0)) * smoothstep(-0.35, 0.45, x);
      float bar3 = exp(-pow((y - 0.86) * 11.0, 2.0));
      c += uBand * (bar1 * 0.95 + bar2 * 0.75 + bar3 * 0.5);
      
      // Classic geometric chrome light breaks
      float w = smoothstep(0.80, 0.93, sin(x * 3.8 + y * 1.8 + 0.7));
      float d = smoothstep(0.52, 0.82, sin(x * 2.4 - y * 3.1 + 2.0));
      c = mix(c, vec3(1.0), w * 0.95);
      c *= (1.0 - 0.8 * d * (1.0 - w));
      
      // Oil-slick / titanium anodized dispersion along reflection curvature
      c += uIri * (0.5 + 0.5 * cos(6.28 * (vec3(0.0, 0.33, 0.67) + y * 1.1 + x * 0.45))) * (1.0 - w * 0.6);
      return clamp(c, 0.0, 1.2);
    }

    void main() {
      vec2 u = vUv, o = uPx * 0.5;
      vec4 m = (texture2D(tMask, u + o) + texture2D(tMask, u - o) + texture2D(tMask, u + vec2(o.x, -o.y)) + texture2D(tMask, u + vec2(-o.x, o.y))) * 0.25;
      vec4 f = texture2D(tF, u);
      float fa = uThr > 0.0 ? smoothstep(uThr - 0.025, uThr + 0.025, f.g) : 0.0;
      float fo = uThr > 0.0 ? smoothstep(uThr - 0.025, uThr + 0.025, f.b) : 0.0;
      float A = max(m.r, fa);
      float O = max(max(m.g, fo), A);
      
      // Plain Flat Black & White Vector Trace Mode
      if (uFlat > 0.5) {
        float alpha = mix(uAlphaBg, 1.0, O);
        gl_FragColor = vec4(mix(uBg, uSky, O), alpha);
        return;
      }
      
      vec2 e = uFT;
      float hC = H(u);
      float hL = H(u - vec2(e.x, 0.0));
      float hR = H(u + vec2(e.x, 0.0));
      float hD = H(u - vec2(0.0, e.y));
      float hU = H(u + vec2(0.0, e.y));
      
      float gx = (hR - hL) * uFS * 0.5;
      float gy = (hU - hD) * uFS * 0.5;
      vec2 g = vec2(gx, gy);
      float gMag = length(g);
      
      // Chisel ridge facet calculation:
      // Converts rounded balloon gradients into crisp planar knife-edge facets
      if (uChisel > 0.001) {
        vec2 gDir = gMag > 1e-4 ? g / gMag : vec2(0.0);
        float facetSlope = mix(gMag, 0.52 * smoothstep(0.04, 0.35, hC), 0.75 * uChisel);
        g = mix(g, gDir * facetSlope, uChisel);
      }
      
      vec3 n = normalize(vec3(-g.x * uBevel, -g.y * uBevel, 1.0));
      vec3 v = normalize(vec3((u - 0.5) * vec2(0.9, 0.6), 1.0));
      vec3 r = reflect(-v, n);
      
      float a = uT * 0.35 + uPtr.x * 1.6;
      float b = sin(uT * 0.23) * 0.7 + uPtr.y * 1.1;
      r.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * r.xz;
      r.yz = mat2(cos(b), -sin(b), sin(b), cos(b)) * r.yz;
      
      vec3 col = mix(vec3(0.01), env(r), smoothstep(0.05, 0.4, n.z));
      
      // Medial ridge specular glint along the knife-edge spine
      if (uChisel > 0.001) {
        float lap = (hL + hR + hD + hU - 4.0 * hC);
        float spine = clamp(-lap * 2.8, 0.0, 1.0) * smoothstep(0.12, 0.5, hC);
        col += uChisel * spine * (uHor * 0.8 + vec3(0.2));
      }
      
      vec3 bg = uBg;
      float alpha = mix(uAlphaBg, 1.0, O);
      gl_FragColor = vec4(mix(bg, mix(vec3(0.01), col, A), O), alpha);
    }
  `,
};
