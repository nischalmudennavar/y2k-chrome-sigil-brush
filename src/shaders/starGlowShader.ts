import { VS } from './common';

export const starGlowShader = {
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D tScene;
    uniform vec2 uPx;
    uniform float uT;
    uniform float uGlow;
    uniform float uAberration;
    varying vec2 vUv;

    // Chromatic dispersion sampling: red shifted outward, blue shifted inward
    vec3 getSceneAb(vec2 uv) {
      if (uAberration <= 0.001) return texture2D(tScene, uv).rgb;
      vec2 dir = uv - 0.5;
      float dist = length(dir);
      vec2 disp = dir * (dist * 1.6 + 0.35) * (uAberration * 0.028);
      float r = texture2D(tScene, uv + disp).r;
      float g = texture2D(tScene, uv).g;
      float b = texture2D(tScene, uv - disp).b;
      return vec3(r, g, b);
    }

    // Fast luminance sampling for flare rays - avoids 3x redundant texture lookups per tap
    vec3 getHi(vec2 uv) {
      vec3 c = texture2D(tScene, uv).rgb;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float h = smoothstep(0.80, 0.96, luma);
      return c * pow(h, 2.2);
    }

    void main() {
      if (uGlow <= 0.001 && uAberration <= 0.001) {
        gl_FragColor = vec4(texture2D(tScene, vUv).rgb, 1.0);
        return;
      }

      vec3 base = getSceneAb(vUv);
      if (uGlow <= 0.001) {
        gl_FragColor = vec4(base, 1.0);
        return;
      }

      // 4-point primary cross directions (angled slightly for authentic anime/CD cover glint)
      vec2 dir1 = vec2(0.96, 0.28) * uPx;
      vec2 dir2 = vec2(-0.28, 0.96) * uPx;
      // 4-point secondary cross directions (45 deg offset)
      vec2 dir3 = (dir1 + dir2) * 0.707;
      vec2 dir4 = (dir1 - dir2) * 0.707;

      vec3 starPrimary = vec3(0.0);
      float wPrimary = 0.0;
      for (int i = 1; i <= 9; i++) {
        float fi = float(i);
        float d = pow(fi, 1.45) * 3.2; // spans ~35 pixels out
        float w = exp(-fi * 0.32);
        
        vec3 sA = getHi(vUv + dir1 * d) + getHi(vUv - dir1 * d);
        vec3 sB = getHi(vUv + dir2 * d) + getHi(vUv - dir2 * d);
        
        vec3 prism = vec3(1.0 + sin(fi * 0.6) * 0.2, 1.0, 1.0 + cos(fi * 0.6) * 0.25);
        starPrimary += (sA + sB) * w * prism;
        wPrimary += w * 2.0;
      }
      starPrimary /= max(wPrimary, 0.001);

      vec3 starSecondary = vec3(0.0);
      float wSec = 0.0;
      for (int i = 1; i <= 5; i++) {
        float fi = float(i);
        float d = pow(fi, 1.3) * 2.5;
        float w = exp(-fi * 0.45);
        vec3 sC = getHi(vUv + dir3 * d) + getHi(vUv - dir3 * d);
        vec3 sD = getHi(vUv + dir4 * d) + getHi(vUv - dir4 * d);
        starSecondary += (sC + sD) * w;
        wSec += w * 2.0;
      }
      starSecondary /= max(wSec, 0.001);

      // Central soft bloom corona
      vec3 halo = vec3(0.0);
      for (int j = 1; j <= 3; j++) {
        float r = float(j) * 2.8;
        halo += getHi(vUv + vec2(r, r) * uPx) +
                getHi(vUv + vec2(-r, r) * uPx) +
                getHi(vUv + vec2(r, -r) * uPx) +
                getHi(vUv + vec2(-r, -r) * uPx);
      }
      halo *= 0.10;

      // Twinkle & shimmer tied to time and spatial UV
      float twinkle = 0.88 + 0.12 * sin(uT * 3.5 + dot(vUv, vec2(90.0, -70.0)));

      // Composite starburst with screen blend onto base
      vec3 glow = (starPrimary * 3.4 + starSecondary * 1.6 + halo * 1.8) * uGlow * twinkle;
      vec3 result = 1.0 - (1.0 - base) * (1.0 - clamp(glow, 0.0, 1.0));

      gl_FragColor = vec4(result, 1.0);
    }
  `,
};

export const heightExtractShader = {
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D tF;
    uniform float uChisel;
    varying vec2 vUv;
    void main() {
      float rawH = texture2D(tF, vUv).r * 10.0;
      float nh = clamp(rawH * 0.15, 0.0, 1.0);
      float shapedH = mix(rawH, pow(nh, mix(1.0, 0.52, uChisel)) / 0.15, uChisel);
      float norm = clamp(shapedH / 8.0, 0.0, 1.0);
      float v = norm * 65535.0;
      float r = floor(v / 256.0) / 255.0;
      float g = mod(v, 256.0) / 255.0;
      gl_FragColor = vec4(r, g, 0.0, 1.0);
    }
  `,
};
