import * as THREE from 'three';
import { BrushParams, Stroke } from '../../types';
import { RenderPipeline } from '../renderPipeline';
import { Bounds, buildStrokeMesh } from '../geometry';
import { heightExtractShader } from '../../shaders/starGlowShader';
import { BaseStyle, ExportMeshData } from './types';

export function buildVectorExtrudedMesh(
  strokes: Stroke[],
  bounds: Bounds,
  params: BrushParams,
  pipeline?: RenderPipeline
): ExportMeshData {
  // Ensure all strokes have their meshes fully populated
  if (pipeline) {
    strokes.forEach((s) => {
      if (!s.group || s.group.children.length === 0) {
        buildStrokeMesh(pipeline, s, window.innerWidth, window.innerHeight, false);
      }
    });
  }

  const aspect = bounds.width / bounds.height;
  const sizeX = 100 * (aspect >= 1 ? 1 : aspect);
  const sizeY = 100 * (aspect >= 1 ? 1 / aspect : 1);
  const scale = sizeX / (bounds.width || 1);
  const extrusionHeight = Math.max(1.0, (params.depth / 6.0) * 4.0); // mm

  const posList: number[] = [];
  const uvsList: number[] = [];
  const idxList: number[] = [];

  strokes.forEach((s) => {
    if (!s.group) return;
    s.group.traverse((obj: any) => {
      if (!obj.isMesh || !obj.geometry) return;
      const geom = obj.geometry as THREE.BufferGeometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const indexAttr = geom.getIndex();
      if (!posAttr || !indexAttr) return;

      const drawCount = geom.drawRange && geom.drawRange.count > 0 ? geom.drawRange.count : indexAttr.count;
      if (drawCount < 6) return;

      const n = Math.floor(drawCount / 6) + 1;
      const numVerts = n * 2;
      if (posAttr.count < numVerts) return;

      const baseOffset = posList.length / 3;

      // 1. Top vertices (z = extrusionHeight)
      for (let i = 0; i < numVerts; i++) {
        const cx = posAttr.getX(i);
        const cy = posAttr.getY(i);
        const px = (cx - bounds.cx) * scale;
        const py = (bounds.cy - cy) * scale;
        posList.push(px, py, extrusionHeight);
        uvsList.push(px / sizeX + 0.5, py / sizeY + 0.5);
      }

      // 2. Bottom vertices (z = 0.0)
      for (let i = 0; i < numVerts; i++) {
        const cx = posAttr.getX(i);
        const cy = posAttr.getY(i);
        const px = (cx - bounds.cx) * scale;
        const py = (bounds.cy - cy) * scale;
        posList.push(px, py, 0.0);
        uvsList.push(px / sizeX + 0.5, py / sizeY + 0.5);
      }

      const botOffset = baseOffset + numVerts;

      // 3. Top surface triangles (+Z outward normal)
      for (let k = 0; k < drawCount; k += 3) {
        const i0 = baseOffset + indexAttr.getX(k);
        const i1 = baseOffset + indexAttr.getX(k + 1);
        const i2 = baseOffset + indexAttr.getX(k + 2);
        idxList.push(i0, i1, i2);
      }

      // 4. Bottom surface triangles (-Z outward normal)
      for (let k = 0; k < drawCount; k += 3) {
        const i0 = botOffset + indexAttr.getX(k);
        const i1 = botOffset + indexAttr.getX(k + 1);
        const i2 = botOffset + indexAttr.getX(k + 2);
        idxList.push(i0, i2, i1);
      }

      // 5. Left Wall (connecting left boundary vertices 2*i)
      for (let i = 0; i < n - 1; i++) {
        const t0 = baseOffset + 2 * i;
        const t1 = baseOffset + 2 * (i + 1);
        const b0 = botOffset + 2 * i;
        const b1 = botOffset + 2 * (i + 1);
        idxList.push(t0, t1, b0);
        idxList.push(t1, b1, b0);
      }

      // 6. Right Wall (connecting right boundary vertices 2*i + 1)
      for (let i = 0; i < n - 1; i++) {
        const t0 = baseOffset + 2 * i + 1;
        const t1 = baseOffset + 2 * (i + 1) + 1;
        const b0 = botOffset + 2 * i + 1;
        const b1 = botOffset + 2 * (i + 1) + 1;
        idxList.push(t0, b0, t1);
        idxList.push(t1, b0, b1);
      }

      // 7. Start Cap (connecting t0, t1 to b0, b1 at start i = 0)
      const st_tl = baseOffset + 0;
      const st_tr = baseOffset + 1;
      const st_bl = botOffset + 0;
      const st_br = botOffset + 1;
      const dStart = Math.hypot(
        posAttr.getX(0) - posAttr.getX(1),
        posAttr.getY(0) - posAttr.getY(1)
      );
      if (dStart > 0.05) {
        idxList.push(st_tl, st_bl, st_tr);
        idxList.push(st_tr, st_bl, st_br);
      }

      // 8. End Cap (connecting t0, t1 to b0, b1 at end i = n - 1)
      const end_tl = baseOffset + 2 * (n - 1);
      const end_tr = baseOffset + 2 * (n - 1) + 1;
      const end_bl = botOffset + 2 * (n - 1);
      const end_br = botOffset + 2 * (n - 1) + 1;
      const dEnd = Math.hypot(
        posAttr.getX(2 * (n - 1)) - posAttr.getX(2 * (n - 1) + 1),
        posAttr.getY(2 * (n - 1)) - posAttr.getY(2 * (n - 1) + 1)
      );
      if (dEnd > 0.05) {
        idxList.push(end_tl, end_tr, end_bl);
        idxList.push(end_tr, end_br, end_bl);
      }
    });
  });

  return {
    positions: new Float32Array(posList),
    uvs: new Float32Array(uvsList),
    indices: new Uint32Array(idxList),
  };
}

function extractHeightfieldFromPipeline(
  pipeline: RenderPipeline,
  bounds: Bounds,
  gridRes: number,
  chisel: number
): { H: Float32Array; gridW: number; gridH: number } {
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

  const gridW = gridRes;
  const gridH = Math.max(32, Math.round(gridRes * (spanH / spanW)));

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

  // Extract height with high-precision 24-bit packing
  const heightMat = new THREE.ShaderMaterial({
    uniforms: { tF: { value: expCmbRT.texture }, uChisel: { value: chisel } },
    vertexShader: heightExtractShader.vertexShader,
    fragmentShader: heightExtractShader.fragmentShader,
  });
  pipeline.pass(heightMat, expHeightRT);

  const heightBytes = new Uint8Array(gridW * gridH * 4);
  pipeline.renderer.readRenderTargetPixels(expHeightRT, 0, 0, gridW, gridH, heightBytes);

  [expMaskRT, expTmpRT, expCmbRT, ...expL, expHeightRT].forEach((r) => r.dispose());
  heightMat.dispose();

  // Decode high-precision 24-bit heightfield
  const Hraw = new Float32Array(gridW * gridH);
  for (let idx = 0; idx < gridW * gridH; idx++) {
    const byteR = heightBytes[idx * 4] / 255.0;
    const byteG = heightBytes[idx * 4 + 1] / 255.0;
    const byteB = heightBytes[idx * 4 + 2] / 255.0;
    Hraw[idx] = byteR + byteG / 255.0 + byteB / 65025.0;
  }

  // Separable Gaussian smoothing pass on CPU to eliminate micro-terracing
  const H = new Float32Array(gridW * gridH);
  for (let j = 0; j < gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = j + dy;
        if (y < 0 || y >= gridH) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = i + dx;
          if (x < 0 || x >= gridW) continue;
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += Hraw[y * gridW + x] * w;
          weight += w;
        }
      }
      H[j * gridW + i] = sum / weight;
    }
  }

  return { H, gridW, gridH };
}

function buildSigilMarchingSquaresMesh(
  H: Float32Array,
  gridW: number,
  gridH: number,
  sizeX: number,
  sizeY: number,
  zScale: number,
  isSolid: boolean
): ExportMeshData | null {
  const MASK_THRESHOLD = 0.035;

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

    const hNorm = Math.min(1.0, Math.max(0.0, H[idx]));
    const pz = hNorm * zScale;

    const vIdx = positionsList.length / 3;
    positionsList.push(px, py, pz);
    uvsList.push(u, v);
    cornerMap[idx] = vIdx;
    return vIdx;
  }

  function getHorizEdgeVertex(i: number, j: number): number {
    const edgeIdx = j * (gridW - 1) + i;
    if (horizEdgeMap[edgeIdx] !== -1) return horizEdgeMap[edgeIdx];
    const m0 = H[j * gridW + i];
    const m1 = H[j * gridW + (i + 1)];
    const t = Math.max(0.001, Math.min(0.999, (MASK_THRESHOLD - m0) / (m1 - m0 || 1e-6)));
    const u = (i + t) / (gridW - 1);
    const v = j / (gridH - 1);
    const px = (u - 0.5) * sizeX;
    const py = (0.5 - v) * sizeY;
    const vIdx = positionsList.length / 3;
    positionsList.push(px, py, 0.0);
    uvsList.push(u, v);
    horizEdgeMap[edgeIdx] = vIdx;
    return vIdx;
  }

  function getVertEdgeVertex(i: number, j: number): number {
    const edgeIdx = j * gridW + i;
    if (vertEdgeMap[edgeIdx] !== -1) return vertEdgeMap[edgeIdx];
    const m0 = H[j * gridW + i];
    const m1 = H[(j + 1) * gridW + i];
    const t = Math.max(0.001, Math.min(0.999, (MASK_THRESHOLD - m0) / (m1 - m0 || 1e-6)));
    const u = i / (gridW - 1);
    const v = (j + t) / (gridH - 1);
    const px = (u - 0.5) * sizeX;
    const py = (0.5 - v) * sizeY;
    const vIdx = positionsList.length / 3;
    positionsList.push(px, py, 0.0);
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
      const m0 = H[j * gridW + i];
      const m1 = H[j * gridW + (i + 1)];
      const m2 = H[(j + 1) * gridW + (i + 1)];
      const m3 = H[(j + 1) * gridW + i];

      const b0 = m0 >= MASK_THRESHOLD ? 1 : 0;
      const b1 = m1 >= MASK_THRESHOLD ? 2 : 0;
      const b2 = m2 >= MASK_THRESHOLD ? 4 : 0;
      const b3 = m3 >= MASK_THRESHOLD ? 8 : 0;
      const cellMask = b0 | b1 | b2 | b3;

      if (cellMask === 0) continue;

      const e0 = b0 !== b1 ? getHorizEdgeVertex(i, j) : -1;
      const e1 = b1 !== b2 ? getVertEdgeVertex(i + 1, j) : -1;
      const e2 = b3 !== b2 ? getHorizEdgeVertex(i, j + 1) : -1;
      const e3 = b0 !== b3 ? getVertEdgeVertex(i, j) : -1;

      const v0 = b0 ? getCornerVertex(i, j) : -1;
      const v1 = b1 ? getCornerVertex(i + 1, j) : -1;
      const v2 = b2 ? getCornerVertex(i + 1, j + 1) : -1;
      const v3 = b3 ? getCornerVertex(i, j + 1) : -1;

      switch (cellMask) {
        case 1:
          addPoly([v0, e3, e0], [[e0, e3]]);
          break;
        case 2:
          addPoly([v1, e0, e1], [[e1, e0]]);
          break;
        case 3:
          addPoly([v0, e3, e1, v1], [[e1, e3]]);
          break;
        case 4:
          addPoly([v2, e1, e2], [[e2, e1]]);
          break;
        case 5: {
          const mid = (m0 + m1 + m2 + m3) * 0.25;
          if (mid >= MASK_THRESHOLD) {
            addPoly([v0, e3, e2, v2, e1, e0], [[e0, e3], [e2, e1]]);
          } else {
            addPoly([v0, e3, e0], [[e0, e3]]);
            addPoly([v2, e1, e2], [[e2, e1]]);
          }
          break;
        }
        case 6:
          addPoly([v1, e0, e2, v2], [[e2, e0]]);
          break;
        case 7:
          addPoly([v0, e3, e2, v2, v1], [[e2, e3]]);
          break;
        case 8:
          addPoly([v3, e2, e3], [[e3, e2]]);
          break;
        case 9:
          addPoly([v0, v3, e2, e0], [[e0, e2]]);
          break;
        case 10: {
          const mid = (m0 + m1 + m2 + m3) * 0.25;
          if (mid >= MASK_THRESHOLD) {
            addPoly([v3, e2, e1, v1, e0, e3], [[e1, e0], [e3, e2]]);
          } else {
            addPoly([v1, e0, e1], [[e1, e0]]);
            addPoly([v3, e2, e3], [[e3, e2]]);
          }
          break;
        }
        case 11:
          addPoly([v0, v3, e2, e1, v1], [[e1, e2]]);
          break;
        case 12:
          addPoly([v3, v2, e1, e3], [[e3, e1]]);
          break;
        case 13:
          addPoly([v0, v3, v2, e1, e0], [[e0, e1]]);
          break;
        case 14:
          addPoly([v3, v2, v1, e0, e3], [[e3, e0]]);
          break;
        case 15:
          addPoly([v3, v2, v1, v0], []);
          break;
      }
    }
  }

  // Laplacian perimeter boundary relaxation on wall edge vertices
  const wallAdj = new Map<number, number[]>();
  wallSegments.forEach(([ea, eb]) => {
    if (!wallAdj.has(ea)) wallAdj.set(ea, []);
    if (!wallAdj.has(eb)) wallAdj.set(eb, []);
    wallAdj.get(ea)!.push(eb);
    wallAdj.get(eb)!.push(ea);
  });

  for (let pass = 0; pass < 2; pass++) {
    const smoothedPos = new Map<number, [number, number]>();
    wallAdj.forEach((neighbors, vIdx) => {
      if (neighbors.length === 2) {
        const n1 = neighbors[0];
        const n2 = neighbors[1];
        const curX = positionsList[vIdx * 3];
        const curY = positionsList[vIdx * 3 + 1];
        const n1x = positionsList[n1 * 3],
          n1y = positionsList[n1 * 3 + 1];
        const n2x = positionsList[n2 * 3],
          n2y = positionsList[n2 * 3 + 1];
        smoothedPos.set(vIdx, [curX * 0.5 + (n1x + n2x) * 0.25, curY * 0.5 + (n1y + n2y) * 0.25]);
      }
    });
    smoothedPos.forEach(([nx, ny], vIdx) => {
      positionsList[vIdx * 3] = nx;
      positionsList[vIdx * 3 + 1] = ny;
    });
  }

  const numTopVerts = positionsList.length / 3;
  if (numTopVerts === 0) return null;

  const totalVerts = isSolid ? numTopVerts * 2 : numTopVerts;
  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  for (let k = 0; k < positionsList.length; k++) positions[k] = positionsList[k];
  for (let k = 0; k < uvsList.length; k++) uvs[k] = uvsList[k];

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

  const indicesArr: number[] = [...topIndices];

  if (isSolid) {
    for (let k = 0; k < topIndices.length; k += 3) {
      indicesArr.push(numTopVerts + topIndices[k], numTopVerts + topIndices[k + 2], numTopVerts + topIndices[k + 1]);
    }
    for (const [ea, eb] of wallSegments) {
      const b_ea = numTopVerts + ea;
      const b_eb = numTopVerts + eb;
      indicesArr.push(ea, eb, b_ea);
      indicesArr.push(eb, b_eb, b_ea);
    }
  }

  return { positions, uvs, indices: new Uint32Array(indicesArr) };
}

function buildPlinthGridMesh(
  H: Float32Array,
  gridW: number,
  gridH: number,
  sizeX: number,
  sizeY: number,
  zScale: number,
  isSolid: boolean
): ExportMeshData {
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
      const pz = basePlinthHeight + H[idx] * zScale;

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
    for (let i = 0; i < gridW - 1; i++) {
      const t0 = i,
        t1 = i + 1;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, t1, b0, t1, b1, b0);
    }
    const lastRow = (gridH - 1) * gridW;
    for (let i = 0; i < gridW - 1; i++) {
      const t0 = lastRow + i,
        t1 = lastRow + i + 1;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, b0, t1, t1, b0, b1);
    }
    for (let j = 0; j < gridH - 1; j++) {
      const t0 = j * gridW,
        t1 = (j + 1) * gridW;
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, b0, t1, t1, b0, b1);
    }
    for (let j = 0; j < gridH - 1; j++) {
      const t0 = j * gridW + (gridW - 1),
        t1 = (j + 1) * gridW + (gridW - 1);
      const b0 = numTopVerts + t0,
        b1 = numTopVerts + t1;
      indicesArr.push(t0, t1, b0, t1, b1, b0);
    }
  }

  return { positions, uvs, indices: new Uint32Array(indicesArr) };
}

export function buildHeightfield3DMesh(
  pipeline: RenderPipeline,
  bounds: Bounds,
  baseStyle: Exclude<BaseStyle, 'extruded'>,
  gridRes: number,
  params: BrushParams,
  onStatus?: (msg: string) => void
): { meshData: ExportMeshData; gridW: number; gridH: number } | null {
  const { H, gridW, gridH } = extractHeightfieldFromPipeline(pipeline, bounds, gridRes, params.chisel);

  let hasStroke = false;
  for (let idx = 0; idx < H.length; idx++) {
    if (H[idx] > 0.02) {
      hasStroke = true;
      break;
    }
  }
  if (!hasStroke) {
    onStatus?.('No strokes detected to export. Draw something first!');
    return null;
  }

  const aspect = gridW / gridH;
  const sizeX = 100 * (aspect >= 1 ? 1 : aspect);
  const sizeY = 100 * (aspect >= 1 ? 1 / aspect : 1);
  const zScale = (params.depth / 6.0) * 14.0;

  const isSigilOnly = baseStyle === 'sigil' || baseStyle === 'sigil-surface';
  const isSolid = baseStyle === 'sigil' || baseStyle === 'solid';

  if (isSigilOnly) {
    const meshData = buildSigilMarchingSquaresMesh(H, gridW, gridH, sizeX, sizeY, zScale, isSolid);
    if (!meshData) {
      onStatus?.('No sigil features detected in strokes to export.');
      return null;
    }
    return { meshData, gridW, gridH };
  }

  const meshData = buildPlinthGridMesh(H, gridW, gridH, sizeX, sizeY, zScale, isSolid);
  return { meshData, gridW, gridH };
}
