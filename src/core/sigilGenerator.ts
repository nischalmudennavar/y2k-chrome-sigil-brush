import { BrushParams, Point, Stroke, SymmetryMode } from '../types';
import { DEFAULT_PARAMS } from '../constants/presets';
import { resample, smooth } from './geometry';

export type SigilStyle = 'cyber-gothic' | 'bio-mecha' | 'radial-seal' | 'minimal-blade';

export interface SigilGeneratorOptions {
  center?: { x: number; y: number };
  scale?: number;
  symmetry?: SymmetryMode;
  style?: SigilStyle;
  spikeDensity?: number; // 0.1 to 1.0
  spikeLength?: number;  // Multiplier, e.g. 0.8 to 2.0
  brushParams?: BrushParams;
}

// Utility: Random in range [min, max]
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Utility: Random sign (-1 or 1)
function randSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

// Evaluate cubic Bezier curve at t in [0, 1]
function cubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const m = 1 - t;
  const m2 = m * m;
  const m3 = m2 * m;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: m3 * p0.x + 3 * m2 * t * p1.x + 3 * m * t2 * p2.x + t3 * p3.x,
    y: m3 * p0.y + 3 * m2 * t * p1.y + 3 * m * t2 * p2.y + t3 * p3.y,
  };
}

// Evaluate quadratic Bezier curve at t in [0, 1]
function quadBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const m = 1 - t;
  return {
    x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
    y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y,
  };
}

/**
 * Generates an array of Point objects along a cubic Bezier curve
 */
function sampleBezierPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  steps: number = 32,
  pressureFn?: (t: number) => number
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezier(p0, p1, p2, p3, t);
    const p = pressureFn ? pressureFn(t) : Math.max(0.1, Math.sin(t * Math.PI));
    pts.push({ x: pt.x, y: pt.y, p });
  }
  return pts;
}

/**
 * Creates curved thorn/spike strokes branching out from points along a given path
 */
export function generateSpikesForPath(
  parentPts: Point[],
  options: {
    count?: number;
    baseLength?: number;
    lengthMultiplier?: number;
    center?: { x: number; y: number };
    brushParams?: BrushParams;
    symmetry?: SymmetryMode;
    curlFavor?: number; // -1, 0, or 1
  } = {}
): Stroke[] {
  if (parentPts.length < 3) return [];

  const {
    count = 6,
    baseLength = 55,
    lengthMultiplier = 1.0,
    center = { x: parentPts[0].x, y: parentPts[0].y },
    brushParams = DEFAULT_PARAMS,
    symmetry = 'Mirror X',
    curlFavor = 0,
  } = options;

  // Resample parent path for uniform spacing
  const smoothed = smooth(parentPts, 2);
  const uniformPts = resample(smoothed, 3.0);
  const n = uniformPts.length;
  if (n < 4) return [];

  const spikes: Stroke[] = [];
  // Exclude initial and terminal 8% of points to keep clean joints
  const startIdx = Math.floor(n * 0.08);
  const endIdx = Math.floor(n * 0.92);
  const usableLen = endIdx - startIdx;
  if (usableLen < count) return [];

  const step = Math.floor(usableLen / (count + 1));

  for (let k = 0; k < count; k++) {
    const idx = startIdx + Math.floor((k + 0.5) * step) + Math.floor(randRange(-step * 0.25, step * 0.25));
    const safeIdx = Math.max(1, Math.min(n - 2, idx));

    const base = uniformPts[safeIdx];
    const prev = uniformPts[safeIdx - 1];
    const next = uniformPts[safeIdx + 1];

    // Compute normalized tangent
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const normTx = tx / tLen;
    const normTy = ty / tLen;

    // Normal vectors (-ty, tx) and (ty, -tx)
    let nx = -normTy;
    let ny = normTx;

    // Check if normal points outward from center
    const toBaseX = base.x - center.x;
    const toBaseY = base.y - center.y;
    if (toBaseX * nx + toBaseY * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Direction angle: blend normal with tangent for an aggressive backward/forward barb
    const angleRad = randRange(0.7, 1.25); // ~40 to ~70 degrees
    const dirX = Math.cos(angleRad) * nx + Math.sin(angleRad) * normTx * randSign();
    const dirY = Math.cos(angleRad) * ny + Math.sin(angleRad) * normTy * randSign();
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const uDirX = dirX / dirLen;
    const uDirY = dirY / dirLen;

    // Spike curve control points
    const len = baseLength * lengthMultiplier * randRange(0.7, 1.3);
    const curlSign = curlFavor !== 0 ? curlFavor : randSign();
    const curlNormalX = -uDirY * curlSign;
    const curlNormalY = uDirX * curlSign;

    const p0 = { x: base.x, y: base.y };
    const p1 = {
      x: base.x + uDirX * (len * 0.5) + curlNormalX * (len * 0.22),
      y: base.y + uDirY * (len * 0.5) + curlNormalY * (len * 0.22),
    };
    const p2 = {
      x: base.x + uDirX * len + curlNormalX * (len * 0.1),
      y: base.y + uDirY * len + curlNormalY * (len * 0.1),
    };

    // Sample quadratic curve with tapering pressure
    const spikeSteps = 10;
    const spikePts: Point[] = [];
    for (let s = 0; s <= spikeSteps; s++) {
      const u = s / spikeSteps;
      const pt = quadBezier(p0, p1, p2, u);
      // High pressure at base (p=1.0) for liquid fusion, tapering to razor tip (p=0.05)
      const p = Math.max(0.04, Math.pow(1 - u, 0.75));
      spikePts.push({ x: pt.x, y: pt.y, p });
    }

    spikes.push({
      raw: spikePts,
      group: null,
      params: {
        ...brushParams,
        width: Math.max(6, brushParams.width * 0.85),
      },
      symmetry,
    });
  }

  return spikes;
}

/**
 * Generates a single random cybernetic path decorated with spikes
 */
export function generateRandomPathWithSpikes(options: {
  center?: { x: number; y: number };
  span?: number;
  spikeCount?: number;
  brushParams?: BrushParams;
  symmetry?: SymmetryMode;
}): Stroke[] {
  const {
    center = { x: 500, y: 500 },
    span = 300,
    spikeCount = 6,
    brushParams = DEFAULT_PARAMS,
    symmetry = 'Mirror X',
  } = options;

  // Generate random sweeping control points
  const p0 = {
    x: center.x + randRange(-span * 0.2, span * 0.2),
    y: center.y - randRange(span * 0.3, span * 0.6),
  };
  const p1 = {
    x: center.x + randRange(span * 0.3, span * 0.7),
    y: center.y - randRange(span * 0.1, span * 0.4),
  };
  const p2 = {
    x: center.x + randRange(span * 0.4, span * 0.8),
    y: center.y + randRange(span * 0.1, span * 0.4),
  };
  const p3 = {
    x: center.x + randRange(-span * 0.1, span * 0.5),
    y: center.y + randRange(span * 0.3, span * 0.7),
  };

  const rawPath = sampleBezierPath(p0, p1, p2, p3, 36, (t) =>
    Math.max(0.2, Math.sin(t * Math.PI) * 1.2)
  );

  const mainStroke: Stroke = {
    raw: rawPath,
    group: null,
    params: { ...brushParams },
    symmetry,
  };

  const spikes = generateSpikesForPath(rawPath, {
    count: spikeCount,
    baseLength: span * 0.2,
    center,
    brushParams,
    symmetry,
  });

  return [mainStroke, ...spikes];
}

/**
 * Generates complete cyber-tribal sigils in different curated aesthetics
 */
export function generateRandomSigil(options: SigilGeneratorOptions = {}): Stroke[] {
  const center = options.center || {
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 500,
  };

  const scale = options.scale || Math.min(center.x, center.y) * 0.75 || 320;
  const symmetry = options.symmetry || 'Mirror X';
  const style = options.style || 'cyber-gothic';
  const density = options.spikeDensity !== undefined ? options.spikeDensity : 0.7;
  const spikeLenMult = options.spikeLength || 1.0;
  const params = options.brushParams || DEFAULT_PARAMS;

  const strokes: Stroke[] = [];

  // Helper to create & record a stroke
  const addStroke = (pts: Point[], widthMult: number = 1.0) => {
    strokes.push({
      raw: pts,
      group: null,
      params: {
        ...params,
        width: Math.max(4, params.width * widthMult),
      },
      symmetry,
    });
  };

  if (style === 'cyber-gothic') {
    // 1. Central Vertical Spine
    const spineHeight = scale * 1.35;
    const spineTop = { x: center.x, y: center.y - spineHeight * 0.5 };
    const spineMid1 = { x: center.x + randRange(-scale * 0.08, scale * 0.08), y: center.y - spineHeight * 0.15 };
    const spineMid2 = { x: center.x + randRange(-scale * 0.08, scale * 0.08), y: center.y + spineHeight * 0.15 };
    const spineBot = { x: center.x, y: center.y + spineHeight * 0.5 };

    const spinePts = sampleBezierPath(spineTop, spineMid1, spineMid2, spineBot, 40, (t) => {
      // Bulge slightly in center nodes for chrome highlight
      const midBulge = Math.sin(t * Math.PI);
      return Math.max(0.25, 0.5 + 0.65 * midBulge);
    });
    addStroke(spinePts, 1.15);

    // Spine Thorns
    const spineSpikes = generateSpikesForPath(spinePts, {
      count: Math.round(5 * density),
      baseLength: scale * 0.16,
      lengthMultiplier: spikeLenMult,
      center,
      brushParams: params,
      symmetry,
    });
    strokes.push(...spineSpikes);

    // 2. Primary Upper Horns / Wings
    const wingCount = Math.round(randRange(2, 3));
    for (let w = 0; w < wingCount; w++) {
      const yOffset = (w - (wingCount - 1) / 2) * (scale * 0.42);
      const wingSpan = scale * randRange(0.65, 0.95);
      const dropY = randRange(scale * 0.1, scale * 0.35);

      const p0 = { x: center.x, y: center.y + yOffset };
      const p1 = { x: center.x + wingSpan * 0.35, y: center.y + yOffset - dropY * randRange(0.8, 1.4) };
      const p2 = { x: center.x + wingSpan * 0.85, y: center.y + yOffset - dropY * randRange(0.2, 0.7) };
      const p3 = { x: center.x + wingSpan * randRange(0.7, 1.05), y: center.y + yOffset + dropY * randRange(0.5, 1.1) };

      const wingPts = sampleBezierPath(p0, p1, p2, p3, 36, (t) => Math.max(0.2, Math.sin(t * Math.PI) * 1.1));
      addStroke(wingPts, randRange(0.85, 1.05));

      // Spikes along each wing
      const wingSpikes = generateSpikesForPath(wingPts, {
        count: Math.round(randRange(4, 7) * density),
        baseLength: scale * 0.18,
        lengthMultiplier: spikeLenMult,
        center,
        brushParams: params,
        symmetry,
      });
      strokes.push(...wingSpikes);

      // Terminal barbed stinger at wingtip
      const tipPt = wingPts[wingPts.length - 1];
      const preTip = wingPts[wingPts.length - 3];
      const tipDirX = tipPt.x - preTip.x;
      const tipDirY = tipPt.y - preTip.y;
      const tipLen = Math.hypot(tipDirX, tipDirY) || 1;
      const tipUx = tipDirX / tipLen;
      const tipUy = tipDirY / tipLen;

      const stingerLen = scale * 0.22 * spikeLenMult;
      const stingerPts: Point[] = [
        { x: tipPt.x, y: tipPt.y, p: 0.9 },
        { x: tipPt.x + tipUx * (stingerLen * 0.5) - tipUy * (stingerLen * 0.15), y: tipPt.y + tipUy * (stingerLen * 0.5) + tipUx * (stingerLen * 0.15), p: 0.5 },
        { x: tipPt.x + tipUx * stingerLen, y: tipPt.y + tipUy * stingerLen, p: 0.05 },
      ];
      addStroke(stingerPts, 0.8);
    }
  } else if (style === 'bio-mecha') {
    // Sharp sickle blades & aggressive graduated fin spikes
    const bladeCount = Math.round(randRange(3, 4));
    for (let i = 0; i < bladeCount; i++) {
      const radius = scale * (0.35 + i * 0.22);
      const angleStart = -Math.PI * 0.45 + i * 0.2;
      const angleEnd = Math.PI * 0.35 + i * 0.15;

      const p0 = {
        x: center.x + Math.cos(angleStart) * (radius * 0.3),
        y: center.y + Math.sin(angleStart) * (radius * 0.3),
      };
      const p1 = {
        x: center.x + Math.cos(angleStart + 0.4) * radius * 1.2,
        y: center.y + Math.sin(angleStart + 0.4) * radius * 1.2,
      };
      const p2 = {
        x: center.x + Math.cos(angleEnd - 0.2) * radius,
        y: center.y + Math.sin(angleEnd - 0.2) * radius,
      };
      const p3 = {
        x: center.x + Math.cos(angleEnd) * (radius * 0.7),
        y: center.y + Math.sin(angleEnd) * (radius * 0.7),
      };

      const bladePts = sampleBezierPath(p0, p1, p2, p3, 32, (t) => Math.max(0.2, (1 - t) * 1.3));
      addStroke(bladePts, 1.0);

      // Dense graduated fin spikes
      const bladeSpikes = generateSpikesForPath(bladePts, {
        count: Math.round(randRange(5, 9) * density),
        baseLength: scale * 0.22,
        lengthMultiplier: spikeLenMult,
        center,
        brushParams: params,
        symmetry,
        curlFavor: 1,
      });
      strokes.push(...bladeSpikes);
    }
  } else if (style === 'radial-seal') {
    // Concentric ring segments and starburst radiating thorn crowns
    const rings = 3;
    for (let r = 0; r < rings; r++) {
      const ringRadius = scale * (0.3 + r * 0.28);
      const arcSpan = Math.PI * 0.75;
      const startAngle = randRange(-0.2, 0.2);

      const p0 = {
        x: center.x + Math.cos(startAngle) * ringRadius,
        y: center.y + Math.sin(startAngle) * ringRadius,
      };
      const p1 = {
        x: center.x + Math.cos(startAngle + arcSpan * 0.33) * ringRadius * 1.1,
        y: center.y + Math.sin(startAngle + arcSpan * 0.33) * ringRadius * 1.1,
      };
      const p2 = {
        x: center.x + Math.cos(startAngle + arcSpan * 0.66) * ringRadius * 1.1,
        y: center.y + Math.sin(startAngle + arcSpan * 0.66) * ringRadius * 1.1,
      };
      const p3 = {
        x: center.x + Math.cos(startAngle + arcSpan) * ringRadius,
        y: center.y + Math.sin(startAngle + arcSpan) * ringRadius,
      };

      const ringPts = sampleBezierPath(p0, p1, p2, p3, 30, () => 0.85);
      addStroke(ringPts, 0.9);

      const radialSpikes = generateSpikesForPath(ringPts, {
        count: Math.round(randRange(4, 8) * density),
        baseLength: scale * 0.17,
        lengthMultiplier: spikeLenMult,
        center,
        brushParams: params,
        symmetry,
      });
      strokes.push(...radialSpikes);
    }
  } else {
    // minimal-blade: Sleek sweeping chrome scythes
    const sickleSpan = scale * 0.9;
    const p0 = { x: center.x, y: center.y - sickleSpan * 0.65 };
    const p1 = { x: center.x + sickleSpan * 0.8, y: center.y - sickleSpan * 0.2 };
    const p2 = { x: center.x + sickleSpan * 0.6, y: center.y + sickleSpan * 0.35 };
    const p3 = { x: center.x, y: center.y + sickleSpan * 0.7 };

    const pts = sampleBezierPath(p0, p1, p2, p3, 40, (t) => Math.max(0.15, Math.sin(t * Math.PI) * 1.3));
    addStroke(pts, 1.2);

    const spikes = generateSpikesForPath(pts, {
      count: Math.round(7 * density),
      baseLength: scale * 0.24,
      lengthMultiplier: spikeLenMult,
      center,
      brushParams: params,
      symmetry,
    });
    strokes.push(...spikes);
  }

  return strokes;
}

/**
 * Attaches spikes along any pre-existing user-drawn stroke!
 */
export function addSpikesToExistingStroke(
  parentStroke: Stroke,
  spikeCount: number = 6,
  spikeLengthMult: number = 1.0,
  center?: { x: number; y: number }
): Stroke[] {
  const pts = parentStroke.pts && parentStroke.pts.length > 0 ? parentStroke.pts : parentStroke.raw;
  if (!pts || pts.length < 3) return [];

  const actualCenter = center || {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };

  return generateSpikesForPath(pts, {
    count: spikeCount,
    lengthMultiplier: spikeLengthMult,
    center: actualCenter,
    brushParams: parentStroke.params,
    symmetry: parentStroke.symmetry,
  });
}
