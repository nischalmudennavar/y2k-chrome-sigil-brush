import { Point, Stroke } from '../types';
import { buildStrokeMesh, getSymmetryTransforms } from './geometry';
import { RenderPipeline } from './renderPipeline';

export type EraserMode = 'slice' | 'stroke';

export interface EraseResult {
  modified: boolean;
  removedStrokes: Stroke[];
  addedStrokes: Stroke[];
}

/**
 * Calculates distance from a point to a 2D line segment [x1, y1] -> [x2, y2]
 */
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Erases points along strokes within radius of the segment [p0, p1]
 * Supports symmetry matching and both slice/carve and whole stroke deletion
 */
export function eraseAtSegment(
  strokes: Stroke[],
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  radius: number,
  mode: EraserMode,
  screenW: number,
  screenH: number,
  pipeline: RenderPipeline
): EraseResult {
  const removedStrokes: Stroke[] = [];
  const addedStrokes: Stroke[] = [];
  let anyModified = false;

  for (let sIdx = strokes.length - 1; sIdx >= 0; sIdx--) {
    const s = strokes[sIdx];
    const pts = s.raw;
    if (!pts || pts.length < 2) continue;

    const transforms = getSymmetryTransforms(s.symmetry || 'None', screenW, screenH);

    // Check hit for each point
    const hit = new Array(pts.length).fill(false);
    let hitCount = 0;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      for (const T of transforms) {
        const [tx, ty] = T.f(p.x, p.y);
        if (distToSegment(tx, ty, p0.x, p0.y, p1.x, p1.y) <= radius) {
          hit[i] = true;
          hitCount++;
          break;
        }
      }
    }

    if (hitCount === 0) continue;

    // Stroke was hit!
    anyModified = true;
    removedStrokes.push(s);

    // Dispose old mesh
    if (s.group) {
      pipeline.root.remove(s.group);
      s.group.traverse((o: any) => o.geometry?.dispose());
    }

    // In 'stroke' mode (delete whole stroke), we don't create new sub-pieces
    if (mode === 'stroke') {
      strokes.splice(sIdx, 1);
      continue;
    }

    // In 'slice' mode, split into remaining contiguous sub-strokes
    const newPieces: Stroke[] = [];
    let currentPiece: Point[] = [];

    for (let i = 0; i < pts.length; i++) {
      if (!hit[i]) {
        currentPiece.push(pts[i]);
      } else {
        if (currentPiece.length >= 2) {
          const pieceStroke: Stroke = {
            raw: currentPiece,
            group: null,
            params: { ...s.params },
            symmetry: s.symmetry,
          };
          buildStrokeMesh(pipeline, pieceStroke, screenW, screenH, false);
          newPieces.push(pieceStroke);
        }
        currentPiece = [];
      }
    }

    if (currentPiece.length >= 2) {
      const pieceStroke: Stroke = {
        raw: currentPiece,
        group: null,
        params: { ...s.params },
        symmetry: s.symmetry,
      };
      buildStrokeMesh(pipeline, pieceStroke, screenW, screenH, false);
      newPieces.push(pieceStroke);
    }

    // Replace s with newPieces
    strokes.splice(sIdx, 1, ...newPieces);
    addedStrokes.push(...newPieces);
  }

  if (anyModified) {
    pipeline.dirty = true;
  }

  return {
    modified: anyModified,
    removedStrokes,
    addedStrokes,
  };
}
