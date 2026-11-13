import { VS } from './common';

export const blurShader = {
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D t;
    uniform vec2 dir;
    uniform float sig;
    varying vec2 vUv;
    void main() {
      vec4 s = vec4(0.0);
      float w = 0.0;
      for (int i = -8; i <= 8; i++) {
        float f = float(i) * 0.375;
        float k = exp(-0.5 * f * f);
        s += k * texture2D(t, vUv + dir * f * sig);
        w += k;
      }
      gl_FragColor = s / w;
    }
  `,
};

export const combineShader = {
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D t1, t2, t3;
    varying vec2 vUv;
    void main() {
      vec4 a = texture2D(t1, vUv);
      vec4 b = texture2D(t2, vUv);
      vec4 c = texture2D(t3, vUv);
      float h = 1.2 * a.r + 2.3 * b.r + 3.4 * c.r;
      gl_FragColor = vec4(h * 0.1, b.r, b.g, 1.0);
    }
  `,
};
