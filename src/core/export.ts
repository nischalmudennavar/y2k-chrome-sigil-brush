import * as THREE from 'three';
import { BrushParams, Stroke, VibePreset, ViewTransform } from '../types';
import { RenderPipeline } from './renderPipeline';
import { getStrokesBounds } from './geometry';
import { applyAnalogFXToCanvas } from './analogNoise';
import { heightExtractShader } from '../shaders/starGlowShader';

export interface ImageExportOptions {
  aspectRatio: string;
  resolution: number;
  framing: 'fit' | 'view';
  isTransparentPNG: boolean;
  view: ViewTransform;
  params: BrushParams;
  vibe: VibePreset;
  time: number;
}

export interface Model3DExportOptions {
  format: 'stl' | 'gltf';
  baseStyle: 'solid' | 'surface';
  gridRes: number;
  params: BrushParams;
  vibe: VibePreset;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export async function exportImage(
  pipeline: RenderPipeline,
  strokes: Stroke[],
  opts: ImageExportOptions,
  onStatus?: (msg: string) => void
): Promise<void> {
  const { aspectRatio, resolution, framing, isTransparentPNG, view, params, vibe, time } = opts;
  onStatus?.('Rendering high-res capture...');

  const baseDim = resolution || 2048;
  let targetW = baseDim;
  let targetH = baseDim;

  if (aspectRatio === '4:5') {
    targetW = Math.round(baseDim * (4 / 5));
    targetH = baseDim;
  } else if (aspectRatio === '9:16') {
    targetW = Math.round(baseDim * (9 / 16));
    targetH = baseDim;
  } else if (aspectRatio === '16:9') {
    targetW = baseDim;
    targetH = Math.round(baseDim * (9 / 16));
  } else if (aspectRatio === '4:3') {
    targetW = baseDim;
    targetH = Math.round(baseDim * (3 / 4));
  } else if (aspectRatio === 'auto') {
    const screenAspect = window.innerWidth / window.innerHeight;
    if (screenAspect > 1) {
      targetW = baseDim;
      targetH = Math.round(baseDim / screenAspect);
    } else {
      targetH = baseDim;
      targetW = Math.round(baseDim * screenAspect);
    }
  }

  const bounds = getStrokesBounds(strokes, window.innerWidth, window.innerHeight);
  const expCam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  const oldRootPos = pipeline.root.position.clone();
  const oldRootScale = pipeline.root.scale.clone();

  if (framing === 'fit') {
    pipeline.root.position.set(0, 0, 0);
    pipeline.root.scale.set(1, 1, 1);
    const margin = 1.25;
    const artW = bounds.width * margin;
    const artH = bounds.height * margin;
    const fitAspect = targetW / targetH;
    const artAspect = artW / artH;
    let spanW = artW;
    let spanH = artH;
    if (fitAspect > artAspect) {
      spanW = artH * fitAspect;
    } else {
      spanH = artW / fitAspect;
    }
    expCam.left = bounds.cx - spanW / 2;
    expCam.right = bounds.cx + spanW / 2;
    expCam.top = bounds.cy - spanH / 2;
    expCam.bottom = bounds.cy + spanH / 2;
  } else {
    expCam.left = (0 - view.x) / view.scale;
    expCam.right = (window.innerWidth - view.x) / view.scale;
    expCam.top = (0 - view.y) / view.scale;
    expCam.bottom = (window.innerHeight - view.y) / view.scale;
    pipeline.root.position.set(0, 0, 0);
    pipeline.root.scale.set(1, 1, 1);
  }
  expCam.updateProjectionMatrix();

  const expFw = Math.max(2, targetW >> 1);
  const expFh = Math.max(2, targetH >> 1);

  const expMaskRT = pipeline.createRT(targetW, targetH, THREE.UnsignedByteType);
  const expTmpRT = pipeline.createRT(expFw, expFh, THREE.HalfFloatType);
  const expCmbRT = pipeline.createRT(expFw, expFh, THREE.HalfFloatType);
  const expL = [
    pipeline.createRT(expFw, expFh, THREE.HalfFloatType),
    pipeline.createRT(expFw, expFh, THREE.HalfFloatType),
    pipeline.createRT(expFw, expFh, THREE.HalfFloatType),
  ];
  const expSceneRT = pipeline.createRT(targetW, targetH, THREE.HalfFloatType);
  const expFinalRT = pipeline.createRT(targetW, targetH, THREE.UnsignedByteType);

  // Render mask
  pipeline.renderer.setRenderTarget(expMaskRT);
  pipeline.renderer.clear();
  pipeline.renderer.render(pipeline.scene, expCam);

  const camSpanW = expCam.right - expCam.left;
  const expFS = expFw / camSpanW;
  let expSrc = expMaskRT.texture;
  const B = pipeline.blurMat.uniforms;
  [3, 6, 12].forEach((s, k) => {
    B.sig.value = s * expFS;
    B.t.value = expSrc;
    B.dir.value.set(1 / expFw, 0);
    pipeline.pass(pipeline.blurMat, expTmpRT);

    B.t.value = expTmpRT.texture;
    B.dir.value.set(0, 1 / expFh);
    pipeline.pass(pipeline.blurMat, expL[k]);

    expSrc = expL[k].texture;
  });

  const C = pipeline.cmbMat.uniforms;
  C.t1.value = expL[0].texture;
  C.t2.value = expL[1].texture;
  C.t3.value = expL[2].texture;
  pipeline.pass(pipeline.cmbMat, expCmbRT);

  // Final pass setup
  const U = pipeline.finalMat.uniforms;
  U.tMask.value = expMaskRT.texture;
  U.tF.value = expCmbRT.texture;
  U.uPx.value.set(1 / targetW, 1 / targetH);
  U.uFT.value.set(1 / expFw, 1 / expFh);
  U.uFS.value = expFS;
  U.uAlphaBg.value = isTransparentPNG ? 0.0 : 1.0;

  const glowVal = params.glow !== undefined ? params.glow : 0.15;
  const abVal = params.aberration !== undefined ? params.aberration : 0.06;

  if (!isTransparentPNG && (glowVal > 0.001 || abVal > 0.001)) {
    pipeline.pass(pipeline.finalMat, expSceneRT);
    pipeline.starMat.uniforms.tScene.value = expSceneRT.texture;
    pipeline.starMat.uniforms.uPx.value.set(1 / targetW, 1 / targetH);
    pipeline.starMat.uniforms.uT.value = time;
    pipeline.starMat.uniforms.uGlow.value = glowVal;
    pipeline.starMat.uniforms.uAberration.value = abVal;
    pipeline.pass(pipeline.starMat, expFinalRT);
  } else {
    pipeline.pass(pipeline.finalMat, expFinalRT);
  }

  // Read pixels
  const pixels = new Uint8Array(targetW * targetH * 4);
  pipeline.renderer.readRenderTargetPixels(expFinalRT, 0, 0, targetW, targetH, pixels);

  // Restore live state
  pipeline.root.position.copy(oldRootPos);
  pipeline.root.scale.copy(oldRootScale);
  U.tMask.value = pipeline.maskRT?.texture || null;
  U.tF.value = pipeline.cmbRT?.texture || null;
  U.uPx.value.set(1 / pipeline.renderer.domElement.width, 1 / pipeline.renderer.domElement.height);
  U.uFT.value.set(1 / (pipeline.tmpRT?.width || 1), 1 / (pipeline.tmpRT?.height || 1));
  U.uFS.value = 0.5;
  U.uAlphaBg.value = 1.0;
  pipeline.dirty = true;

  // Dispose export RTs
  [expMaskRT, expTmpRT, expCmbRT, ...expL, expSceneRT, expFinalRT].forEach((r) => r.dispose());

  // Flip Y onto 2D canvas
  const outCvs = document.createElement('canvas');
  outCvs.width = targetW;
  outCvs.height = targetH;
  const ctx = outCvs.getContext('2d');
  if (!ctx) return;

  const imgData = ctx.createImageData(targetW, targetH);
  const data = imgData.data;

  for (let y = 0; y < targetH; y++) {
    const srcRow = (targetH - 1 - y) * targetW * 4;
    const dstRow = y * targetW * 4;
    data.set(pixels.subarray(srcRow, srcRow + targetW * 4), dstRow);
  }
  ctx.putImageData(imgData, 0, 0);

  if (!isTransparentPNG && (params.noise === undefined || params.noise > 0.01)) {
    applyAnalogFXToCanvas(ctx, targetW, targetH, params.noise !== undefined ? params.noise : 0.1);
  }

  const vibeSlug = (vibe.badge || 'y2k').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `y2k-tribal-${vibeSlug}-${targetW}x${targetH}-${isTransparentPNG ? 'transparent' : 'art'}-${ts}.${isTransparentPNG ? 'png' : 'jpg'}`;

  outCvs.toBlob(
    (blob) => {
      if (!blob) {
        onStatus?.('Export failed');
        return;
      }
      downloadBlob(blob, filename);
      onStatus?.(`Saved ${filename}`);
    },
    isTransparentPNG ? 'image/png' : 'image/jpeg',
    0.96
  );
}

export function createBinarySTL(positions: Float32Array, indices: Uint32Array): Blob {
  const numTris = indices.length / 3;
  const buffer = new ArrayBuffer(84 + numTris * 50);
  const view = new DataView(buffer);

  const headerStr = 'Binary STL - Y2K Chrome Tribal Brush Watertight Solid';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0);
  }
  view.setUint32(80, numTris, true);

  let offset = 84;
  const p = positions;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = p[i0],
      ay = p[i0 + 1],
      az = p[i0 + 2];
    const bx = p[i1],
      by = p[i1 + 1],
      bz = p[i1 + 2];
    const cx = p[i2],
      cy = p[i2 + 1],
      cz = p[i2 + 2];

    const abx = bx - ax,
      aby = by - ay,
      abz = bz - az;
    const acx = cx - ax,
      acy = cy - ay,
      acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    view.setFloat32(offset, nx, true);
    offset += 4;
    view.setFloat32(offset, ny, true);
    offset += 4;
    view.setFloat32(offset, nz, true);
    offset += 4;

    view.setFloat32(offset, ax, true);
    offset += 4;
    view.setFloat32(offset, ay, true);
    offset += 4;
    view.setFloat32(offset, az, true);
    offset += 4;

    view.setFloat32(offset, bx, true);
    offset += 4;
    view.setFloat32(offset, by, true);
    offset += 4;
    view.setFloat32(offset, bz, true);
    offset += 4;

    view.setFloat32(offset, cx, true);
    offset += 4;
    view.setFloat32(offset, cy, true);
    offset += 4;
    view.setFloat32(offset, cz, true);
    offset += 4;

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'application/octet-stream' });
}

export async function export3DModel(
  pipeline: RenderPipeline,
  strokes: Stroke[],
  opts: Model3DExportOptions,
  onStatus?: (msg: string) => void
): Promise<void> {
  const { format, baseStyle, gridRes, params, vibe } = opts;
  const isSolid = baseStyle === 'solid';
  onStatus?.(`Generating 3D ${format.toUpperCase()} (${gridRes}x${gridRes})...`);

  const bounds = getStrokesBounds(strokes, window.innerWidth, window.innerHeight);
  const oldRootPos = pipeline.root.position.clone();
  const oldRootScale = pipeline.root.scale.clone();

  pipeline.root.position.set(0, 0, 0);
  pipeline.root.scale.set(1, 1, 1);

  const margin = 1.15;
  const spanW = bounds.width * margin;
  const spanH = bounds.height * margin;

  const expCam = new THREE.OrthographicCamera(
    bounds.cx - spanW / 2,
    bounds.cx + spanW / 2,
    bounds.cy - spanH / 2,
    bounds.cy + spanH / 2,
    -10,
    10
  );
  expCam.updateProjectionMatrix();

  const M = gridRes;
  const N = Math.max(32, Math.round(gridRes * (spanH / spanW)));
  const gridW = M;
  const gridH = N;

  const expMaskRT = pipeline.createRT(gridW, gridH, THREE.UnsignedByteType);
  const expTmpRT = pipeline.createRT(gridW, gridH, THREE.HalfFloatType);
  const expCmbRT = pipeline.createRT(gridW, gridH, THREE.HalfFloatType);
  const expL = [
    pipeline.createRT(gridW, gridH, THREE.HalfFloatType),
    pipeline.createRT(gridW, gridH, THREE.HalfFloatType),
    pipeline.createRT(gridW, gridH, THREE.HalfFloatType),
  ];
  const expHeightRT = pipeline.createRT(gridW, gridH, THREE.UnsignedByteType);

  pipeline.renderer.setRenderTarget(expMaskRT);
  pipeline.renderer.clear();
  pipeline.renderer.render(pipeline.scene, expCam);

  const expFS = gridW / spanW;
  let expSrc = expMaskRT.texture;
  const B = pipeline.blurMat.uniforms;
  [3, 6, 12].forEach((s, k) => {
    B.sig.value = s * expFS;
    B.t.value = expSrc;
    B.dir.value.set(1 / gridW, 0);
    pipeline.pass(pipeline.blurMat, expTmpRT);

    B.t.value = expTmpRT.texture;
    B.dir.value.set(0, 1 / gridH);
    pipeline.pass(pipeline.blurMat, expL[k]);

    expSrc = expL[k].texture;
  });

  const C = pipeline.cmbMat.uniforms;
  C.t1.value = expL[0].texture;
  C.t2.value = expL[1].texture;
  C.t3.value = expL[2].texture;
  pipeline.pass(pipeline.cmbMat, expCmbRT);

  // Extract height
  const heightMat = new THREE.ShaderMaterial({
    uniforms: { tF: { value: expCmbRT.texture }, uChisel: { value: params.chisel } },
    vertexShader: heightExtractShader.vertexShader,
    fragmentShader: heightExtractShader.fragmentShader,
  });
  pipeline.pass(heightMat, expHeightRT);

  const heightBytes = new Uint8Array(gridW * gridH * 4);
  pipeline.renderer.readRenderTargetPixels(expHeightRT, 0, 0, gridW, gridH, heightBytes);

  // Restore live pipeline
  pipeline.root.position.copy(oldRootPos);
  pipeline.root.scale.copy(oldRootScale);
  pipeline.dirty = true;

  [expMaskRT, expTmpRT, expCmbRT, ...expL, expHeightRT].forEach((r) => r.dispose());
  heightMat.dispose();

  const aspect = gridW / gridH;
  const sizeX = 100 * (aspect >= 1 ? 1 : aspect);
  const sizeY = 100 * (aspect >= 1 ? 1 / aspect : 1);
  const zScale = (params.depth / 6.0) * 14.0;
  const basePlinthHeight = isSolid ? 2.5 : 0.0;

  const numTopVerts = gridW * gridH;
  const totalVerts = isSolid ? numTopVerts * 2 : numTopVerts;
  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  for (let j = 0; j < gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      const idx = j * gridW + i;
      const u = i / (gridW - 1);
      const v = j / (gridH - 1);

      const px = (u - 0.5) * sizeX;
      const py = (0.5 - v) * sizeY;

      const byteIdx = (j * gridW + i) * 4;
      const hNorm = heightBytes[byteIdx] / 255.0;
      const pz = basePlinthHeight + hNorm * zScale;

      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;

      if (isSolid) {
        const bIdx = numTopVerts + idx;
        positions[bIdx * 3] = px;
        positions[bIdx * 3 + 1] = py;
        positions[bIdx * 3 + 2] = 0.0;
        uvs[bIdx * 2] = u;
        uvs[bIdx * 2 + 1] = v;
      }
    }
  }

  const indicesArr: number[] = [];
  // Top grid surface
  for (let j = 0; j < gridH - 1; j++) {
    for (let i = 0; i < gridW - 1; i++) {
      const i0 = j * gridW + i;
      const i1 = i0 + 1;
      const i2 = (j + 1) * gridW + i;
      const i3 = i2 + 1;
      indicesArr.push(i0, i1, i2);
      indicesArr.push(i1, i3, i2);
    }
  }

  if (isSolid) {
    // Bottom grid surface
    for (let j = 0; j < gridH - 1; j++) {
      for (let i = 0; i < gridW - 1; i++) {
        const i0 = numTopVerts + j * gridW + i;
        const i1 = i0 + 1;
        const i2 = numTopVerts + (j + 1) * gridW + i;
        const i3 = i2 + 1;
        indicesArr.push(i0, i2, i1);
        indicesArr.push(i1, i2, i3);
      }
    }
    // Perimeter skirts
    for (let i = 0; i < gridW - 1; i++) {
      const t0 = i,
        t1 = i + 1;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, b0, t1);
      indicesArr.push(t1, b0, b1);
    }
    const lastRow = (gridH - 1) * gridW;
    for (let i = 0; i < gridW - 1; i++) {
      const t0 = lastRow + i,
        t1 = lastRow + i + 1;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, t1, b0);
      indicesArr.push(t1, b1, b0);
    }
    for (let j = 0; j < gridH - 1; j++) {
      const t0 = j * gridW,
        t1 = (j + 1) * gridW;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, t1, b0);
      indicesArr.push(t1, b1, b0);
    }
    for (let j = 0; j < gridH - 1; j++) {
      const t0 = j * gridW + (gridW - 1),
        t1 = (j + 1) * gridW + (gridW - 1);
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, b0, t1);
      indicesArr.push(t1, b0, b1);
    }
  }

  const indices = new Uint32Array(indicesArr);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const vibeSlug = (vibe.badge || 'y2k').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (format === 'stl') {
    const stlBlob = createBinarySTL(positions, indices);
    const filename = `y2k-tribal-${vibeSlug}-${isSolid ? 'solid' : 'surface'}-${gridW}x${gridH}-${ts}.stl`;
    downloadBlob(stlBlob, filename);
    onStatus?.(`Saved ${filename}`);
  } else if (format === 'gltf') {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.96,
      roughness: 0.08,
      envMapIntensity: 1.5,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const exportScene = new THREE.Scene();
    exportScene.add(mesh);

    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    exporter.parse(
      exportScene,
      (gltf) => {
        const glbBlob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
        const filename = `y2k-tribal-${vibeSlug}-${gridW}x${gridH}-${ts}.glb`;
        downloadBlob(glbBlob, filename);
        onStatus?.(`Saved ${filename}`);
        geo.dispose();
        mat.dispose();
      },
      (error) => {
        console.error('GLTF export error:', error);
        onStatus?.('GLTF export failed');
      },
      { binary: true }
    );
  }
}
