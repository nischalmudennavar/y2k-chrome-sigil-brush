import { describe, expect, it, vi } from 'vitest';
import { eraseAtSegment } from '../eraser';
import { DEFAULT_PARAMS } from '../../constants/presets';
import { Stroke } from '../../types';

vi.mock('../geometry', async () => {
  const actual = await vi.importActual<typeof import('../geometry')>('../geometry');
  return {
    ...actual,
    buildStrokeMesh: vi.fn(),
  };
});

function createMockPipeline() {
  return {
    root: {
      remove: vi.fn(),
      add: vi.fn(),
    },
    dirty: false,
  } as any;
}

describe('eraseAtSegment', () => {
  it('deletes an entire stroke in stroke mode when hit', () => {
    const pipeline = createMockPipeline();
    const stroke: Stroke = {
      raw: [
        { x: 0, y: 0, p: 0.5 },
        { x: 50, y: 0, p: 0.5 },
        { x: 100, y: 0, p: 0.5 },
      ],
      group: null,
      params: { ...DEFAULT_PARAMS },
      symmetry: 'None',
    };
    const strokes = [stroke];

    const res = eraseAtSegment(
      strokes,
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      15,
      'stroke',
      800,
      600,
      pipeline
    );

    expect(res.modified).toBe(true);
    expect(res.removedStrokes).toEqual([stroke]);
    expect(res.addedStrokes).toHaveLength(0);
    expect(strokes).toHaveLength(0);
    expect(pipeline.dirty).toBe(true);
  });

  it('splits a stroke into two sub-strokes in slice mode', () => {
    const pipeline = createMockPipeline();
    const stroke: Stroke = {
      raw: [
        { x: 0, y: 0, p: 0.5 },
        { x: 20, y: 0, p: 0.5 },
        { x: 50, y: 0, p: 0.5 },
        { x: 80, y: 0, p: 0.5 },
        { x: 100, y: 0, p: 0.5 },
      ],
      group: null,
      params: { ...DEFAULT_PARAMS },
      symmetry: 'None',
    };
    const strokes = [stroke];

    const res = eraseAtSegment(
      strokes,
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      10,
      'slice',
      800,
      600,
      pipeline
    );

    expect(res.modified).toBe(true);
    expect(res.removedStrokes).toEqual([stroke]);
    expect(res.addedStrokes).toHaveLength(2);
    expect(strokes).toHaveLength(2);
    expect(strokes[0].raw.map((p) => p.x)).toEqual([0, 20]);
    expect(strokes[1].raw.map((p) => p.x)).toEqual([80, 100]);
  });

  it('leaves strokes untouched when eraser misses', () => {
    const pipeline = createMockPipeline();
    const stroke: Stroke = {
      raw: [
        { x: 0, y: 0, p: 0.5 },
        { x: 100, y: 0, p: 0.5 },
      ],
      group: null,
      params: { ...DEFAULT_PARAMS },
      symmetry: 'None',
    };
    const strokes = [stroke];

    const res = eraseAtSegment(
      strokes,
      { x: 50, y: 200 },
      { x: 50, y: 200 },
      10,
      'slice',
      800,
      600,
      pipeline
    );

    expect(res.modified).toBe(false);
    expect(strokes).toHaveLength(1);
    expect(pipeline.dirty).toBe(false);
  });
});
