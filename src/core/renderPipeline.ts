import * as THREE from 'three';
import { BrushParams, VibePreset, ViewTransform } from '../types';
import { blurShader, combineShader } from '../shaders/blurShader';
import { finalShader } from '../shaders/finalShader';
import { solidShader } from '../shaders/solidShader';
import { starGlowShader } from '../shaders/starGlowShader';

export class RenderPipeline {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  root: THREE.Group;
  camera: THREE.OrthographicCamera;

  // Full-screen quad pass helper
  private qs: THREE.Scene;
  private qc: THREE.OrthographicCamera;
  private quad: THREE.Mesh;

  // Materials
  mOut: THREE.MeshBasicMaterial;
  mChr: THREE.MeshBasicMaterial;
  blurMat: THREE.ShaderMaterial;
  cmbMat: THREE.ShaderMaterial;
  finalMat: THREE.ShaderMaterial;
  solidMat: THREE.ShaderMaterial;
  starMat: THREE.ShaderMaterial;

  // 3D mode
  scene3: THREE.Scene;
  cam3: THREE.PerspectiveCamera;
  plane: THREE.Mesh;
  d0 = 1000;

  // Render targets
  maskRT: THREE.WebGLRenderTarget | null = null;
  tmpRT: THREE.WebGLRenderTarget | null = null;
  cmbRT: THREE.WebGLRenderTarget | null = null;
  sceneRT: THREE.WebGLRenderTarget | null = null;
  blurLayers: THREE.WebGLRenderTarget[] = [];

  private floatType: THREE.TextureDataType;
  private fs = 0.5;
  dirty = true;
  private currentPr: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.currentPr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(this.currentPr);
    this.renderer.setClearColor(0x000000, 0);

    const ex = this.renderer.extensions;
    this.floatType =
      ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float')
        ? THREE.HalfFloatType
        : THREE.UnsignedByteType;

    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

    this.qs = new THREE.Scene();
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.qs.add(this.quad);

    this.mOut = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.mChr = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: null },
        dir: { value: new THREE.Vector2() },
        sig: { value: 1 },
      },
      vertexShader: blurShader.vertexShader,
      fragmentShader: blurShader.fragmentShader,
    });

    this.cmbMat = new THREE.ShaderMaterial({
      uniforms: {
        t1: { value: null },
        t2: { value: null },
        t3: { value: null },
      },
      vertexShader: combineShader.vertexShader,
      fragmentShader: combineShader.fragmentShader,
    });

    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: null },
        tF: { value: null },
        uPx: { value: new THREE.Vector2() },
        uFT: { value: new THREE.Vector2() },
        uFS: { value: 0.5 },
        uT: { value: 0 },
        uBevel: { value: 3.5 },
        uChisel: { value: 0.7 },
        uThr: { value: -1 },
        uPtr: { value: new THREE.Vector2() },
        uSky: { value: new THREE.Vector3(0.98, 0.45, 0.78) },
        uHor: { value: new THREE.Vector3(1.0, 0.92, 0.98) },
        uBand: { value: new THREE.Vector3(0.65, 0.85, 1.0) },
        uGround: { value: new THREE.Vector3(0.26, 0.04, 0.18) },
        uBg: { value: new THREE.Vector3(0.075, 0.022, 0.07) },
        uIri: { value: 0.06 },
        uDepth: { value: 6.0 },
        uAlphaBg: { value: 1.0 },
        uFlat: { value: 0.0 },
      },
      vertexShader: finalShader.vertexShader,
      fragmentShader: finalShader.fragmentShader,
    });

    this.solidMat = new THREE.ShaderMaterial({
      uniforms: this.finalMat.uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexShader: solidShader.vertexShader,
      fragmentShader: solidShader.fragmentShader,
    });

    this.scene3 = new THREE.Scene();
    this.cam3 = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.solidMat);
    this.plane.frustumCulled = false;
    this.scene3.add(this.plane);

    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uPx: { value: new THREE.Vector2() },
        uT: { value: 0 },
        uGlow: { value: 0.15 },
        uAberration: { value: 0.06 },
      },
      vertexShader: starGlowShader.vertexShader,
      fragmentShader: starGlowShader.fragmentShader,
    });
  }

  createRT(w: number, h: number, type: THREE.TextureDataType): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qs, this.qc);
  }

  resize(w: number, h: number, customPr?: number) {
    const pr = customPr ?? this.currentPr;
    this.currentPr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();

    const mw = Math.round(w * pr);
    const mh = Math.round(h * pr);
    const fw = Math.max(2, mw >> 1);
    const fh = Math.max(2, mh >> 1);

    // Reuse existing GPU render targets if dimensions have not changed
    const needsRTRealloc =
      !this.maskRT ||
      this.maskRT.width !== mw ||
      this.maskRT.height !== mh ||
      !this.tmpRT ||
      this.tmpRT.width !== fw ||
      this.tmpRT.height !== fh ||
      this.blurLayers.length < 3;

    if (!needsRTRealloc) {
      this.cam3.aspect = w / h;
      this.cam3.updateProjectionMatrix();
      this.d0 = (h / 2) / Math.tan((this.cam3.fov * Math.PI) / 360);
      this.dirty = true;
      return;
    }

    [this.maskRT, this.tmpRT, this.cmbRT, this.sceneRT, ...this.blurLayers].forEach((rt) =>
      rt?.dispose()
    );

    this.maskRT = this.createRT(mw, mh, THREE.UnsignedByteType);
    this.tmpRT = this.createRT(fw, fh, this.floatType);
    this.cmbRT = this.createRT(fw, fh, this.floatType);
    this.sceneRT = this.createRT(mw, mh, this.floatType);
    this.blurLayers = [
      this.createRT(fw, fh, this.floatType),
      this.createRT(fw, fh, this.floatType),
      this.createRT(fw, fh, this.floatType),
    ];

    this.fs = fw / w;
    const U = this.finalMat.uniforms;
    U.tMask.value = this.maskRT.texture;
    U.tF.value = this.cmbRT.texture;
    U.uPx.value.set(1 / mw, 1 / mh);
    U.uFT.value.set(1 / fw, 1 / fh);
    U.uFS.value = this.fs;

    this.cam3.aspect = w / h;
    this.cam3.updateProjectionMatrix();
    this.d0 = (h / 2) / Math.tan((this.cam3.fov * Math.PI) / 360);

    this.plane.geometry.dispose();
    this.plane.geometry = new THREE.PlaneGeometry(
      w,
      h,
      Math.min(180, Math.round(w / 6)),
      Math.min(180, Math.round(h / 6))
    );

    this.dirty = true;
  }

  setInteractiveQuality(_interactive: boolean) {
    // Retain pre-allocated GPU render targets during drawing to eliminate texture churn and GC pauses.
  }

  computeFields(fast: boolean = false) {
    if (!this.maskRT || !this.tmpRT || !this.cmbRT || this.blurLayers.length < 3) return;
    this.renderer.setRenderTarget(this.maskRT);
    this.renderer.render(this.scene, this.camera);

    const fw = this.tmpRT.width;
    const fh = this.tmpRT.height;
    let src = this.maskRT.texture;

    const B = this.blurMat.uniforms;
    const sigmas = fast ? [4, 10] : [3, 6, 12];
    const passCount = fast ? 2 : 3;

    for (let k = 0; k < passCount; k++) {
      B.sig.value = sigmas[k] * this.fs;
      B.t.value = src;
      B.dir.value.set(1 / fw, 0);
      this.pass(this.blurMat, this.tmpRT);

      B.t.value = this.tmpRT!.texture;
      B.dir.value.set(0, 1 / fh);
      this.pass(this.blurMat, this.blurLayers[k]);

      src = this.blurLayers[k].texture;
    }

    const C = this.cmbMat.uniforms;
    C.t1.value = this.blurLayers[0].texture;
    C.t2.value = this.blurLayers[1].texture;
    C.t3.value = fast ? this.blurLayers[1].texture : this.blurLayers[2].texture;
    this.pass(this.cmbMat, this.cmbRT);
  }

  private syncVibeUniforms(vibe: VibePreset) {
    const U = this.finalMat.uniforms;
    if (vibe.sky) U.uSky.value.set(...vibe.sky);
    if (vibe.hor) U.uHor.value.set(...vibe.hor);
    if (vibe.band) U.uBand.value.set(...vibe.band);
    if (vibe.ground) U.uGround.value.set(...vibe.ground);
    if (vibe.bg) U.uBg.value.set(...vibe.bg);
    U.uFlat.value = vibe.flat ? 1.0 : 0.0;
  }

  applyTheme(vibe: VibePreset) {
    this.syncVibeUniforms(vibe);
    this.dirty = true;
  }

  updateUniforms(
    params: BrushParams,
    vibe: VibePreset,
    ptr: { x: number; y: number },
    t: number
  ) {
    const U = this.finalMat.uniforms;
    U.uT.value = t;
    this.syncVibeUniforms(vibe);
    U.uIri.value = params.iri + (vibe.iri || 0);
    U.uBevel.value = params.bevel;
    U.uChisel.value = params.chisel !== undefined ? params.chisel : 0.7;
    U.uThr.value = params.fusion > 0 ? 0.5 - 0.3 * params.fusion : -1;
    U.uPtr.value.set(ptr.x, ptr.y);
    U.uDepth.value = params.depth;
  }

  private renderMainPass(
    target: THREE.WebGLRenderTarget | null,
    params: BrushParams,
    mode3d: boolean,
    orb: { y: number; p: number; z: number }
  ) {
    if (mode3d) {
      const d = this.d0 * orb.z;
      const cp = Math.cos(orb.p);
      this.cam3.position.set(
        d * Math.sin(orb.y) * cp,
        d * Math.sin(orb.p),
        d * Math.cos(orb.y) * cp
      );
      this.cam3.lookAt(0, 0, 0);
      this.finalMat.uniforms.uDepth.value = params.depth;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene3, this.cam3);
    } else {
      this.pass(this.finalMat, target);
    }
  }

  render(
    params: BrushParams,
    mode3d: boolean,
    _autoOrbit: boolean,
    orb: { y: number; p: number; z: number },
    t: number,
    glowEnabled: boolean = true,
    aberrationEnabled: boolean = true,
    fastMode: boolean = false
  ) {
    if (this.dirty) {
      this.computeFields(fastMode);
      this.dirty = false;
    }

    if (this.maskRT && this.cmbRT) {
      this.finalMat.uniforms.tMask.value = this.maskRT.texture;
      this.finalMat.uniforms.tF.value = this.cmbRT.texture;
    }

    const glowVal = glowEnabled ? (params.glow !== undefined ? params.glow : 0.15) : 0;
    const abVal = aberrationEnabled ? (params.aberration !== undefined ? params.aberration : 0.06) : 0;
    const mw = this.renderer.domElement.width;
    const mh = this.renderer.domElement.height;

    if ((glowVal > 0.001 || abVal > 0.001) && this.sceneRT) {
      this.renderMainPass(this.sceneRT, params, mode3d, orb);
      this.starMat.uniforms.tScene.value = this.sceneRT.texture;
      this.starMat.uniforms.uPx.value.set(1 / mw, 1 / mh);
      this.starMat.uniforms.uT.value = t;
      this.starMat.uniforms.uGlow.value = glowVal;
      this.starMat.uniforms.uAberration.value = abVal;
      this.pass(this.starMat, null);
    } else {
      this.renderMainPass(null, params, mode3d, orb);
    }
  }

  applyViewTransform(view: ViewTransform) {
    this.root.position.set(view.x, view.y, 0);
    this.root.scale.set(view.scale, view.scale, 1);
    this.dirty = true;
  }

  dispose() {
    [this.maskRT, this.tmpRT, this.cmbRT, this.sceneRT, ...this.blurLayers].forEach((rt) =>
      rt?.dispose()
    );
    this.quad.geometry.dispose();
    this.plane.geometry.dispose();
    [
      this.mOut,
      this.mChr,
      this.blurMat,
      this.cmbMat,
      this.finalMat,
      this.solidMat,
      this.starMat,
    ].forEach((mat) => mat.dispose());
    this.renderer.dispose();
  }
}
