import { describe, expect, it } from 'vitest';
import {
  getStrokesBounds,
  getSymmetryTransforms,
  pressureFactor,
  resample,
  smooth,
  widthAt,
} from '../geometry';
import { DEFAULT_PARAMS } from '../../constants/presets';
import { Point, Stroke } from '../../types';

describe('geometry helpers', () => {
  it('smooth preserves endpoints and subdivides interior segments', () => {
    const pts: Point[] = [
      { x: 0, y: 0, p: 0.5 },
      { x: 100, y: 0, p: 1.0 },
      { x: 100, y: 100, p: 0.5 },
    ];
    const result = smooth(pts, 1);
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
    expect(result.length).toBe(6);
  });

  it('resample distributes points evenly along arc length', () => {
    const pts: Point[] = [
      { x: 0, y: 0, p: 0.5 },
      { x: 100, y: 0, p: 0.5 },
    ];
    const result = resample(pts, 25);
    expect(result.length).toBe(5);
    expect(result[0].x).toBeCloseTo(0);
    expect(result[2].x).toBeCloseTo(50);
    expect(result[4].x).toBeCloseTo(100);
  });

  it('pressureFactor clamps minimum and scales around neutral 0.5', () => {
    expect(pressureFactor(0.5, 1)).toBeCloseTo(1);
    expect(pressureFactor(1, 1)).toBeCloseTo(2);
    expect(pressureFactor(0, 1)).toBeCloseTo(0.08);
    expect(pressureFactor(null, 1)).toBeCloseTo(1);
  });

  it('widthAt tapers smoothly near ends and peaks in the middle', () => {
    const params = { ...DEFAULT_PARAMS, width: 20, taper: 0.5 };
    const startW = widthAt(0, 400, params);
    const midW = widthAt(200, 400, params);
    const endW = widthAt(400, 400, params);
    expect(midW).toBeGreaterThan(startW);
    expect(midW).toBeGreaterThan(endW);
  });

  it('getSymmetryTransforms generates expected branch counts', () => {
    expect(getSymmetryTransforms('None', 800, 600)).toHaveLength(1);
    expect(getSymmetryTransforms('Mirror X', 800, 600)).toHaveLength(2);
    expect(getSymmetryTransforms('Mirror X+Y', 800, 600)).toHaveLength(4);
    expect(getSymmetryTransforms('Radial 6', 800, 600)).toHaveLength(6);
  });

  it('getStrokesBounds includes mirrored branches', () => {
    const stroke: Stroke = {
      raw: [
        { x: 100, y: 200, p: 0.5 },
        { x: 150, y: 250, p: 0.5 },
      ],
      group: null,
      params: { ...DEFAULT_PARAMS, width: 20 },
      symmetry: 'Mirror X',
    };
    const bounds = getStrokesBounds([stroke], 1000, 1000);
    // Mirrored branch sits around x = 850..900
    expect(bounds.maxX).toBeGreaterThan(850);
    expect(bounds.minX).toBeLessThan(120);
  });
});
