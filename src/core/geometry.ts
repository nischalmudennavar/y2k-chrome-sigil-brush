import * as THREE from 'three';
import { BrushParams, Point, Stroke, SymmetryMode } from '../types';

export function smooth(p: Point[], it: number): Point[] {
  let current = p;
  for (let k = 0; k < it; k++) {
    const q: Point[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];
      q.push(
        { x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y, p: 0.75 * a.p + 0.25 * b.p },
        { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y, p: 0.25 * a.p + 0.75 * b.p }
      );
    }
    q.push(current[current.length - 1]);
    current = q;
  }
  return current;
}

export function resample(pts: Point[], step: number): Point[] {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const len = cum[cum.length - 1];
  if (len < 1e-6) return [pts[0], pts[0]];
  const n = Math.max(2, Math.floor(len / step) + 1);
  const out: Point[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (len * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (s - cum[j]) / segLen));
    const a = pts[j];
    const b = pts[j + 1];
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      p: a.p + (b.p - a.p) * t,
    });
  }
  return out;
}

export const pressureFactor = (p: number | null | undefined, pressureParam: number): number => {
  return Math.max(0.08, 1 + pressureParam * (2 * (p == null ? 0.5 : p) - 1));
};

const smooth01 = (x: number): number => {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
};

export function widthAt(s: number, len: number, params: BrushParams): number {
  const env = smooth01(Math.min(s, len - s) / (8 + params.taper * 140));
  return Math.max(0.5, params.width * (0.92 + 0.08 * Math.sin(s * 0.05)) * env) * 0.5;
}

export function createOrUpdateStrip(
  mesh: THREE.Mesh | null | undefined,
  pts: Array<{ x: number; y: number }>,
  hw: number[],
  mat: THREE.Material
): THREE.Mesh {
  const m: THREE.Mesh = mesh || new THREE.Mesh(new THREE.BufferGeometry(), mat);
  m.frustumCulled = false;
  m.material = mat;

  const n = pts.length;
  if (n < 2) {
    return m;
  }

  const vertCount = n * 2;
  const posCount = vertCount * 3;
  const indexCount = (n - 1) * 6;

  let g = m.geometry;
  let posAttr = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  let indexAttr = g.getIndex();

  // Check if existing geometry has sufficient capacity
  if (
    !posAttr ||
    posAttr.array.length < posCount ||
    !indexAttr ||
    indexAttr.array.length < indexCount
  ) {
    // Allocate dynamic buffer with headroom to avoid frequent reallocations
    const capacityVerts = Math.max(vertCount * 2, 256);
    const pos = new Float32Array(capacityVerts * 3);
    const idx = new (capacityVerts > 65535 ? Uint32Array : Uint16Array)((capacityVerts - 1) * 6);

    const newG = new THREE.BufferGeometry();
    posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    newG.setAttribute('position', posAttr);

    indexAttr = new THREE.BufferAttribute(idx, 1);
    indexAttr.setUsage(THREE.DynamicDrawUsage);
    newG.setIndex(indexAttr);

    g.dispose();
    m.geometry = newG;
    g = newG;
  }

  const posArray = posAttr.array as Float32Array;
  const idxArray = indexAttr.array as Uint16Array | Uint32Array;

  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, n - 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    const nx = (-ty / l) * hw[i];
    const ny = (tx / l) * hw[i];

    const idx6 = i * 6;
    posArray[idx6] = pts[i].x + nx;
    posArray[idx6 + 1] = pts[i].y + ny;
    posArray[idx6 + 2] = 0;
    posArray[idx6 + 3] = pts[i].x - nx;
    posArray[idx6 + 4] = pts[i].y - ny;
    posArray[idx6 + 5] = 0;

    if (i < n - 1) {
      const A = 2 * i;
      const t6 = i * 6;
      idxArray[t6] = A;
      idxArray[t6 + 1] = A + 2;
      idxArray[t6 + 2] = A + 1;
      idxArray[t6 + 3] = A + 1;
      idxArray[t6 + 4] = A + 2;
      idxArray[t6 + 5] = A + 3;
    }
  }

  posAttr.needsUpdate = true;
  indexAttr.needsUpdate = true;
  g.setDrawRange(0, indexCount);

  return m;
}

export function strip(
  pts: Array<{ x: number; y: number }>,
  hw: number[],
  mat: THREE.Material
): THREE.Mesh {
  return createOrUpdateStrip(null, pts, hw, mat);
}

export function ribbon(
  pts: Point[],
  extra: number,
  mat: THREE.Material,
  params: BrushParams,
  existingMesh?: THREE.Mesh
): THREE.Mesh {
  const al: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    al.push(al[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const len = al[al.length - 1];
  const hw = al.map(
    (s, i) => widthAt(s, len, params) * pressureFactor(pts[i].p, params.pressure) + extra
  );
  return createOrUpdateStrip(existingMesh, pts, hw, mat);
}

export function buildStrokeParts(
  s: { pts: Point[] },
  extra: number,
  mat: THREE.Material,
  order: number,
  params: BrushParams,
  existingMeshes?: THREE.Mesh[]
): THREE.Mesh[] {
  const existingRibbon = existingMeshes && existingMeshes.length > 0 ? existingMeshes[0] : undefined;
  const m = ribbon(s.pts, extra, mat, params, existingRibbon);
  m.renderOrder = order;
  return [m];
}

export function buildStrokeMesh(
  pipeline: { root: THREE.Group; mChr: THREE.Material; dirty: boolean },
  s: Stroke,
  width: number,
  height: number,
  isDrawing: boolean = false
): void {
  const p = s.params;
  const sym = s.symmetry || 'None';
  if (!s.raw || s.raw.length < 2) {
    if (s.group) {
      pipeline.root.remove(s.group);
      s.group.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
      });
      s.group = null;
    }
    pipeline.dirty = true;
    return;
  }

  // Faster smoothing and resampling during active drawing, fine resolution on finish
  const smoothIterations = isDrawing ? 2 : 3;
  const resampleStep = isDrawing ? 3.0 : 1.5;

  const smoothed = smooth(s.raw, smoothIterations);
  const pts = resample(smoothed, resampleStep);
  s.pts = pts;

  const transforms = getSymmetryTransforms(sym, width, height);

  let g = s.group as THREE.Group | null;
  if (!g) {
    g = new THREE.Group();
    s.group = g;
    pipeline.root.add(g);
  }

  let meshIdx = 0;
  const existingChildren = g.children.filter((c: any) => c.isMesh) as THREE.Mesh[];

  for (const T of transforms) {
    const c = {
      pts: pts.map((q) => {
        const [x, y] = T.f(q.x, q.y);
        return { x, y, p: q.p };
      }),
    };

    const chromeReuse = existingChildren[meshIdx] || null;
    const chrMeshes = buildStrokeParts(
      c,
      0,
      pipeline.mChr,
      1,
      p,
      chromeReuse ? [chromeReuse] : undefined
    );
    chrMeshes.forEach((m) => {
      if (!m.parent) g!.add(m);
      meshIdx++;
    });
  }

  // Clean up excess meshes if symmetry count decreased
  while (g.children.length > meshIdx) {
    const excess = g.children.pop();
    if (excess) {
      (excess as any).geometry?.dispose();
    }
  }

  pipeline.dirty = true;
}

export interface TransformDefinition {
  f: (x: number, y: number) => [number, number];
  d: number;
}

export function getSymmetryTransforms(
  mode: SymmetryMode,
  width: number,
  height: number
): TransformDefinition[] {
  const cx = width / 2;
  const cy = height / 2;
  const I: TransformDefinition = { f: (x, y) => [x, y], d: 1 };
  const mx: TransformDefinition = { f: (x, y) => [2 * cx - x, y], d: -1 };
  const my: TransformDefinition = { f: (x, y) => [x, 2 * cy - y], d: -1 };
  const mxy: TransformDefinition = { f: (x, y) => [2 * cx - x, 2 * cy - y], d: 1 };

  if (mode === 'Mirror X') return [I, mx];
  if (mode === 'Mirror Y') return [I, my];
  if (mode === 'Mirror X+Y') return [I, mx, my, mxy];
  if (mode.startsWith('Radial')) {
    const n = parseInt(mode.split(' ')[1], 10) || 4;
    return Array.from({ length: n }, (_, i) => {
      const a = (i * 2 * Math.PI) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return {
        f: (x: number, y: number) => [
          cx + (x - cx) * c - (y - cy) * s,
          cy + (x - cx) * s + (y - cy) * c,
        ],
        d: 1,
      };
    });
  }
  return [I];
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function getStrokesBounds(strokes: Stroke[], defaultW = 1000, defaultH = 1000): Bounds {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  strokes.forEach((s) => {
    // 1. Check existing mesh geometry bounding boxes if meshes are built
    if (s.group) {
      s.group.traverse((obj: any) => {
        if (obj.isMesh && obj.geometry) {
          if (!obj.geometry.boundingBox) {
            obj.geometry.computeBoundingBox();
          }
          const bb = obj.geometry.boundingBox;
          if (bb && !bb.isEmpty() && isFinite(bb.min.x) && isFinite(bb.max.x)) {
            if (bb.min.x < minX) minX = bb.min.x;
            if (bb.max.x > maxX) maxX = bb.max.x;
            if (bb.min.y < minY) minY = bb.min.y;
            if (bb.max.y > maxY) maxY = bb.max.y;
          }
        }
      });
    }

    // 2. Also transform points using all symmetry transforms to ensure every branch is fully covered
    const sym = s.symmetry || 'None';
    const transforms = getSymmetryTransforms(sym, defaultW, defaultH);
    const strokeWidth = (s.params?.width || 30) * 1.5;
    const halfW = strokeWidth / 2;
    const pts = (s.pts && s.pts.length > 0) ? s.pts : (s.raw || []);

    pts.forEach((p) => {
      for (const T of transforms) {
        const [tx, ty] = T.f(p.x, p.y);
        if (tx - halfW < minX) minX = tx - halfW;
        if (tx + halfW > maxX) maxX = tx + halfW;
        if (ty - halfW < minY) minY = ty - halfW;
        if (ty + halfW > maxY) maxY = ty + halfW;
      }
    });
  });

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    minX = defaultW * 0.25;
    maxX = defaultW * 0.75;
    minY = defaultH * 0.25;
    maxY = defaultH * 0.75;
  }

  const w = Math.max(60, maxX - minX);
  const h = Math.max(60, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: w,
    height: h,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * Distance from point P to line segment AB
 */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-6) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return Math.hypot(px - qx, py - qy);
}

/**
 * Finds the index of the closest stroke to a given canvas coordinate (px, py),
 * taking into account stroke thickness and all symmetry reflections.
 */
export function findClosestStroke(
  strokes: Stroke[],
  px: number,
  py: number,
  defaultW: number = 1000,
  defaultH: number = 1000,
  extraTolerance: number = 16
): { index: number; distance: number } | null {
  if (strokes.length === 0) return null;

  let bestIndex = -1;
  let minDistance = Infinity;

  // Search in reverse order so topmost (most recently drawn) stroke is preferred
  for (let sIdx = strokes.length - 1; sIdx >= 0; sIdx--) {
    const s = strokes[sIdx];
    const pts = s.pts && s.pts.length > 0 ? s.pts : s.raw || [];
    if (pts.length === 0) continue;

    const sym = s.symmetry || 'None';
    const transforms = getSymmetryTransforms(sym, defaultW, defaultH);
    const strokeWidth = s.params?.width || 20;
    const threshold = Math.max(extraTolerance, strokeWidth / 2 + extraTolerance);

    let strokeMinDist = Infinity;

    for (const T of transforms) {
      if (pts.length === 1) {
        const [tx, ty] = T.f(pts[0].x, pts[0].y);
        const d = Math.hypot(px - tx, py - ty);
        if (d < strokeMinDist) strokeMinDist = d;
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = T.f(pts[i].x, pts[i].y);
          const [bx, by] = T.f(pts[i + 1].x, pts[i + 1].y);
          const d = distToSegment(px, py, ax, ay, bx, by);
          if (d < strokeMinDist) {
            strokeMinDist = d;
          }
        }
      }
    }

    if (strokeMinDist <= threshold && strokeMinDist < minDistance) {
      minDistance = strokeMinDist;
      bestIndex = sIdx;
    }
  }

  return bestIndex !== -1 ? { index: bestIndex, distance: minDistance } : null;
}
