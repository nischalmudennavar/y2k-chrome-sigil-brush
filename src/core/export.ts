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

export type BaseStyle = 'extruded' | 'sigil' | 'sigil-surface' | 'solid' | 'surface';

export interface Model3DExportOptions {
  format: 'stl' | 'gltf';
  baseStyle: BaseStyle;
  gridRes: number;
  params: BrushParams;
  vibe: VibePreset;
  baseThickness?: number;
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

  const oldRootPos = pipeline.root.position.clone();
  const oldRootScale = pipeline.root.scale.clone();
  pipeline.root.position.set(0, 0, 0);
  pipeline.root.scale.set(1, 1, 1);
  pipeline.root.updateMatrixWorld(true);

  const bounds = getStrokesBounds(strokes, window.innerWidth, window.innerHeight);
  const expCam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

  if (framing === 'fit') {
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
  if (vibe.bg) U.uBg.value.set(...vibe.bg);
  U.uFlat.value = vibe.flat ? 1.0 : 0.0;

  const glowVal = vibe.flat ? 0 : (params.glow !== undefined ? params.glow : 0.15);
  const abVal = vibe.flat ? 0 : (params.aberration !== undefined ? params.aberration : 0.06);

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

  if (!isTransparentPNG && !vibe.flat && (params.noise === undefined || params.noise > 0.01)) {
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
  if (!strokes || strokes.length === 0) {
    onStatus?.('No strokes to export! Draw something first.');
    return;
  }

  onStatus?.(`Generating 3D ${format.toUpperCase()} (${gridRes}x${gridRes})...`);

  // Align pipeline root before computing bounds so that mesh bounding boxes match canvas coordinates
  const oldRootPos = pipeline.root.position.clone();
  const oldRootScale = pipeline.root.scale.clone();
  pipeline.root.position.set(0, 0, 0);
  pipeline.root.scale.set(1, 1, 1);
  pipeline.root.updateMatrixWorld(true);

  // Compute bounding box covering all strokes AND all symmetry branches
  const bounds = getStrokesBounds(strokes, window.innerWidth, window.innerHeight);

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

  // Read unblurred stroke mask (exact 2D vector silhouette of the stroke)
  const maskBytes = new Uint8Array(gridW * gridH * 4);
  pipeline.renderer.readRenderTargetPixels(expMaskRT, 0, 0, gridW, gridH, maskBytes);

  const mask = new Float32Array(gridW * gridH);
  let hasStroke = false;
  for (let idx = 0; idx < gridW * gridH; idx++) {
    const m = maskBytes[idx * 4] / 255.0;
    mask[idx] = m;
    if (m > 0.3) hasStroke = true;
  }
  if (!hasStroke) {
    onStatus?.('No strokes detected to export. Draw something first!');
    return;
  }

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

  const isExtruded = baseStyle === 'extruded';
  const isSigilOnly = isExtruded || baseStyle === 'sigil' || baseStyle === 'sigil-surface';
  const isSolid = isExtruded || baseStyle === 'sigil' || baseStyle === 'solid';

  // Decode high-precision 16-bit heightfield from RGBA render target
  const H = new Float32Array(gridW * gridH);
  for (let idx = 0; idx < gridW * gridH; idx++) {
    const byteR = heightBytes[idx * 4];
    const byteG = heightBytes[idx * 4 + 1];
    H[idx] = (byteR * 256 + byteG) / 65535.0;
  }

  let positions: Float32Array;
  let uvs: Float32Array;
  let indices: Uint32Array;

  if (isSigilOnly) {
    // Sigil Only: Standalone 3D mesh with smooth sub-pixel Marching Squares boundary
    // Extruded mode: uniform flat top like an extruded PNG/SVG, vertical walls, zero brim
    // Chiseled mode: sculpted relief rising directly from base, zero brim/flange
    const extrusionHeight = Math.max(1.0, (params.depth / 6.0) * 4.0); // mm
    const MASK_THRESHOLD = 0.5;

    const positionsList: number[] = [];
    const uvsList: number[] = [];
    const topIndices: number[] = [];
    const wallSegments: Array<[number, number]> = [];

    const cornerMap = new Int32Array(gridW * gridH).fill(-1);
    const horizEdgeMap = new Int32Array((gridW - 1) * gridH).fill(-1);
    const vertEdgeMap = new Int32Array(gridW * (gridH - 1)).fill(-1);

    function getCornerVertex(i: number, j: number): number {
      const idx = j * gridW + i;
      if (cornerMap[idx] !== -1) return cornerMap[idx];
      const u = i / (gridW - 1);
      const v = j / (gridH - 1);
      const px = (u - 0.5) * sizeX;
      const py = (0.5 - v) * sizeY;

      let pz: number;
      if (isExtruded) {
        pz = extrusionHeight;
      } else {
        const rawVal = H[idx];
        const hNorm = Math.min(1.0, Math.max(0.0, rawVal));
        pz = hNorm * zScale;
      }

      const vIdx = positionsList.length / 3;
      positionsList.push(px, py, pz);
      uvsList.push(u, v);
      cornerMap[idx] = vIdx;
      return vIdx;
    }

    function getHorizEdgeVertex(i: number, j: number): number {
      const edgeIdx = j * (gridW - 1) + i;
      if (horizEdgeMap[edgeIdx] !== -1) return horizEdgeMap[edgeIdx];
      const m0 = mask[j * gridW + i];
      const m1 = mask[j * gridW + (i + 1)];
      const t = Math.max(0.001, Math.min(0.999, (MASK_THRESHOLD - m0) / (m1 - m0 || 1e-6)));
      const u = (i + t) / (gridW - 1);
      const v = j / (gridH - 1);
      const px = (u - 0.5) * sizeX;
      const py = (0.5 - v) * sizeY;
      const pz = isExtruded ? extrusionHeight : 0.0;
      const vIdx = positionsList.length / 3;
      positionsList.push(px, py, pz);
      uvsList.push(u, v);
      horizEdgeMap[edgeIdx] = vIdx;
      return vIdx;
    }

    function getVertEdgeVertex(i: number, j: number): number {
      const edgeIdx = j * gridW + i;
      if (vertEdgeMap[edgeIdx] !== -1) return vertEdgeMap[edgeIdx];
      const m0 = mask[j * gridW + i];
      const m1 = mask[(j + 1) * gridW + i];
      const t = Math.max(0.001, Math.min(0.999, (MASK_THRESHOLD - m0) / (m1 - m0 || 1e-6)));
      const u = i / (gridW - 1);
      const v = (j + t) / (gridH - 1);
      const px = (u - 0.5) * sizeX;
      const py = (0.5 - v) * sizeY;
      const pz = isExtruded ? extrusionHeight : 0.0;
      const vIdx = positionsList.length / 3;
      positionsList.push(px, py, pz);
      uvsList.push(u, v);
      vertEdgeMap[edgeIdx] = vIdx;
      return vIdx;
    }

    function addPoly(poly: number[], boundaries: Array<[number, number]>) {
      for (let k = 1; k < poly.length - 1; k++) {
        topIndices.push(poly[0], poly[k], poly[k + 1]);
      }
      for (let b = 0; b < boundaries.length; b++) {
        wallSegments.push(boundaries[b]);
      }
    }

    for (let j = 0; j < gridH - 1; j++) {
      for (let i = 0; i < gridW - 1; i++) {
        const m0 = mask[j * gridW + i];
        const m1 = mask[j * gridW + (i + 1)];
        const m2 = mask[(j + 1) * gridW + (i + 1)];
        const m3 = mask[(j + 1) * gridW + i];

        const b0 = m0 >= MASK_THRESHOLD ? 1 : 0;
        const b1 = m1 >= MASK_THRESHOLD ? 2 : 0;
        const b2 = m2 >= MASK_THRESHOLD ? 4 : 0;
        const b3 = m3 >= MASK_THRESHOLD ? 8 : 0;
        const cellMask = b0 | b1 | b2 | b3;

        if (cellMask === 0) continue;

        const e0 = (b0 !== b1) ? getHorizEdgeVertex(i, j) : -1;
        const e1 = (b1 !== b2) ? getVertEdgeVertex(i + 1, j) : -1;
        const e2 = (b3 !== b2) ? getHorizEdgeVertex(i, j + 1) : -1;
        const e3 = (b0 !== b3) ? getVertEdgeVertex(i, j) : -1;

        const v0 = b0 ? getCornerVertex(i, j) : -1;
        const v1 = b1 ? getCornerVertex(i + 1, j) : -1;
        const v2 = b2 ? getCornerVertex(i + 1, j + 1) : -1;
        const v3 = b3 ? getCornerVertex(i, j + 1) : -1;

        switch (cellMask) {
          case 1: // TL
            addPoly([v0, e3, e0], [[e0, e3]]);
            break;
          case 2: // TR
            addPoly([v1, e0, e1], [[e1, e0]]);
            break;
          case 3: // TL, TR
            addPoly([v0, e3, e1, v1], [[e1, e3]]);
            break;
          case 4: // BR
            addPoly([v2, e1, e2], [[e2, e1]]);
            break;
          case 5: { // TL, BR (saddle)
            const mid = (m0 + m1 + m2 + m3) * 0.25;
            if (mid >= MASK_THRESHOLD) {
              addPoly([v0, e3, e2, v2, e1, e0], [[e0, e3], [e2, e1]]);
            } else {
              addPoly([v0, e3, e0], [[e0, e3]]);
              addPoly([v2, e1, e2], [[e2, e1]]);
            }
            break;
          }
          case 6: // TR, BR
            addPoly([v1, e0, e2, v2], [[e2, e0]]);
            break;
          case 7: // TL, TR, BR (BL outside)
            addPoly([v0, e3, e2, v2, v1], [[e2, e3]]);
            break;
          case 8: // BL
            addPoly([v3, e2, e3], [[e3, e2]]);
            break;
          case 9: // TL, BL
            addPoly([v0, v3, e2, e0], [[e0, e2]]);
            break;
          case 10: { // TR, BL (saddle)
            const mid = (m0 + m1 + m2 + m3) * 0.25;
            if (mid >= MASK_THRESHOLD) {
              addPoly([v3, e2, e1, v1, e0, e3], [[e1, e0], [e3, e2]]);
            } else {
              addPoly([v1, e0, e1], [[e1, e0]]);
              addPoly([v3, e2, e3], [[e3, e2]]);
            }
            break;
          }
          case 11: // TL, TR, BL (BR outside)
            addPoly([v0, v3, e2, e1, v1], [[e1, e2]]);
            break;
          case 12: // BR, BL
            addPoly([v3, v2, e1, e3], [[e3, e1]]);
            break;
          case 13: // TL, BR, BL (TR outside)
            addPoly([v0, v3, v2, e1, e0], [[e0, e1]]);
            break;
          case 14: // TR, BR, BL (TL outside)
            addPoly([v3, v2, v1, e0, e3], [[e3, e0]]);
            break;
          case 15: // All 4 inside
            addPoly([v3, v2, v1, v0], []);
            break;
        }
      }
    }

    const numTopVerts = positionsList.length / 3;
    if (numTopVerts === 0) {
      onStatus?.('No sigil features detected in strokes to export.');
      return;
    }

    const totalVerts = isSolid ? numTopVerts * 2 : numTopVerts;
    positions = new Float32Array(totalVerts * 3);
    uvs = new Float32Array(totalVerts * 2);

    for (let k = 0; k < positionsList.length; k++) {
      positions[k] = positionsList[k];
    }
    for (let k = 0; k < uvsList.length; k++) {
      uvs[k] = uvsList[k];
    }

    if (isSolid) {
      for (let k = 0; k < numTopVerts; k++) {
        const bIdx = numTopVerts + k;
        positions[bIdx * 3] = positionsList[k * 3];
        positions[bIdx * 3 + 1] = positionsList[k * 3 + 1];
        positions[bIdx * 3 + 2] = 0.0;
        uvs[bIdx * 2] = uvsList[k * 2];
        uvs[bIdx * 2 + 1] = uvsList[k * 2 + 1];
      }
    }

    const indicesArr: number[] = [];

    // Top surface triangles
    for (let k = 0; k < topIndices.length; k++) {
      indicesArr.push(topIndices[k]);
    }

    if (isSolid) {
      // Bottom surface triangles (reversed winding for -Z outward normal)
      for (let k = 0; k < topIndices.length; k += 3) {
        indicesArr.push(
          numTopVerts + topIndices[k],
          numTopVerts + topIndices[k + 2],
          numTopVerts + topIndices[k + 1]
        );
      }

      // Smooth perimeter wall quads along sub-pixel boundary segments
      for (const [ea, eb] of wallSegments) {
        const b_ea = numTopVerts + ea;
        const b_eb = numTopVerts + eb;
        indicesArr.push(ea, eb, b_ea);
        indicesArr.push(eb, b_eb, b_ea);
      }
    }

    indices = new Uint32Array(indicesArr);
  } else {
    // Rectangular plinth (solid block base or open surface grid)
    const basePlinthHeight = isSolid ? 2.5 : 0.0;

    const numTopVerts = gridW * gridH;
    const totalVerts = isSolid ? numTopVerts * 2 : numTopVerts;
    positions = new Float32Array(totalVerts * 3);
    uvs = new Float32Array(totalVerts * 2);

    for (let j = 0; j < gridH; j++) {
      for (let i = 0; i < gridW; i++) {
        const idx = j * gridW + i;
        const u = i / (gridW - 1);
        const v = j / (gridH - 1);

        const px = (u - 0.5) * sizeX;
        const py = (0.5 - v) * sizeY;

        const hNorm = H[idx];
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
    // Top grid surface (+Z outward normal)
    for (let j = 0; j < gridH - 1; j++) {
      for (let i = 0; i < gridW - 1; i++) {
        const i0 = j * gridW + i;
        const i1 = i0 + 1;
        const i2 = (j + 1) * gridW + i;
        const i3 = i2 + 1;
        indicesArr.push(i0, i2, i1);
        indicesArr.push(i1, i2, i3);
      }
    }

    if (isSolid) {
      // Bottom grid surface (-Z outward normal)
      for (let j = 0; j < gridH - 1; j++) {
        for (let i = 0; i < gridW - 1; i++) {
          const i0 = numTopVerts + j * gridW + i;
          const i1 = i0 + 1;
          const i2 = numTopVerts + (j + 1) * gridW + i;
          const i3 = i2 + 1;
          indicesArr.push(i0, i1, i2);
          indicesArr.push(i1, i3, i2);
        }
      }
      // Perimeter skirts
      // North
      for (let i = 0; i < gridW - 1; i++) {
        const t0 = i,
          t1 = i + 1;
        const b0 = numTopVerts + t0,
          b1 = numTopVerts + t1;
        indicesArr.push(t0, t1, b0);
        indicesArr.push(t1, b1, b0);
      }
      // South
      const lastRow = (gridH - 1) * gridW;
      for (let i = 0; i < gridW - 1; i++) {
        const t0 = lastRow + i,
          t1 = lastRow + i + 1;
        const b0 = numTopVerts + t0,
          b1 = numTopVerts + t1;
        indicesArr.push(t0, b0, t1);
        indicesArr.push(t1, b0, b1);
      }
      // West
      for (let j = 0; j < gridH - 1; j++) {
        const t0 = j * gridW,
          t1 = (j + 1) * gridW;
        const b0 = numTopVerts + t0,
          b1 = numTopVerts + t1;
        indicesArr.push(t0, b0, t1);
        indicesArr.push(t1, b0, b1);
      }
      // East
      for (let j = 0; j < gridH - 1; j++) {
        const t0 = j * gridW + (gridW - 1),
          t1 = (j + 1) * gridW + (gridW - 1);
        const b0 = numTopVerts + t0,
          b1 = numTopVerts + t1;
        indicesArr.push(t0, t1, b0);
        indicesArr.push(t1, b1, b0);
      }
    }

    indices = new Uint32Array(indicesArr);
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const vibeSlug = (vibe.badge || 'y2k').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (format === 'stl') {
    const stlBlob = createBinarySTL(positions, indices);
    const filename = `y2k-tribal-${vibeSlug}-${baseStyle}-${gridW}x${gridH}-${ts}.stl`;
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
