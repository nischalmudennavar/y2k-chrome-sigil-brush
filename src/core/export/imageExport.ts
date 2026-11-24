import * as THREE from 'three';
import { Stroke } from '../../types';
import { RenderPipeline } from '../renderPipeline';
import { getStrokesBounds } from '../geometry';
import { applyAnalogFXToCanvas } from '../analogNoise';
import { ImageExportOptions } from './types';
import { downloadBlob, makeExportPrefix } from './utils';

function resolveTargetDimensions(aspectRatio: string, baseDim: number): { targetW: number; targetH: number } {
  if (aspectRatio === '4:5') {
    return { targetW: Math.round(baseDim * (4 / 5)), targetH: baseDim };
  }
  if (aspectRatio === '9:16') {
    return { targetW: Math.round(baseDim * (9 / 16)), targetH: baseDim };
  }
  if (aspectRatio === '16:9') {
    return { targetW: baseDim, targetH: Math.round(baseDim * (9 / 16)) };
  }
  if (aspectRatio === '4:3') {
    return { targetW: baseDim, targetH: Math.round(baseDim * (3 / 4)) };
  }
  if (aspectRatio === 'auto') {
    const screenAspect = window.innerWidth / window.innerHeight;
    if (screenAspect > 1) {
      return { targetW: baseDim, targetH: Math.round(baseDim / screenAspect) };
    }
    return { targetW: Math.round(baseDim * screenAspect), targetH: baseDim };
  }
  return { targetW: baseDim, targetH: baseDim };
}

export async function exportImage(
  pipeline: RenderPipeline,
  strokes: Stroke[],
  opts: ImageExportOptions,
  onStatus?: (msg: string) => void
): Promise<void> {
  const { aspectRatio, resolution, framing, isTransparentPNG, view, params, vibe, time } = opts;
  onStatus?.('Rendering high-res capture...');

  const { targetW, targetH } = resolveTargetDimensions(aspectRatio, resolution || 2048);

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

  const { ts, vibeSlug } = makeExportPrefix(vibe.badge);
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
