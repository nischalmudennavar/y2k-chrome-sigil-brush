import { finalShader } from './finalShader';

export const solidShader = {
  vertexShader: `
    uniform sampler2D tF;
    uniform float uDepth, uChisel;
    varying vec2 vUv;
    varying vec3 vView;
    void main() { 
      vUv = uv; 
      vec3 p = position; 
      float rawH = texture2D(tF, uv).r * 10.0;
      float nh = clamp(rawH * 0.15, 0.0, 1.0);
      float shapedH = mix(rawH, pow(nh, mix(1.0, 0.52, uChisel)) / 0.15, uChisel);
      p.z = shapedH * uDepth;
      vec4 wp = modelMatrix * vec4(p, 1.0); 
      vView = cameraPosition - wp.xyz; 
      gl_Position = projectionMatrix * viewMatrix * wp; 
    }
  `,
  fragmentShader: finalShader.fragmentShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv; varying vec3 vView;')
    .replace('vec3 v = normalize(vec3((u - 0.5) * vec2(0.9, 0.6), 1.0));', 'vec3 v = normalize(vView);')
    .replace(
      'gl_FragColor = vec4(mix(bg, mix(vec3(0.01), col, A), O), alpha);',
      'gl_FragColor = vec4(mix(vec3(0.01), col, A), O);'
    )
    .replace(
      'gl_FragColor = vec4(mix(uBg, uSky, O), alpha);',
      'gl_FragColor = vec4(uSky, O);'
    ),
};
