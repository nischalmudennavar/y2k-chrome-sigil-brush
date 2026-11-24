import type * as THREE from 'three';

export interface BrushParams {
  width: number;
  taper: number;
  pressure: number;
  bevel: number;
  chisel: number;
  speed: number;
  iri: number;
  fusion: number;
  depth: number;
  glow: number;
  aberration: number;
  noise: number;
}

export interface VibeColors {
  accent?: string;
  accentGlow?: string;
  accentTrack?: string;
  accentAmbient?: string;
  bg?: string;
  panelBg?: string;
  panelBorder?: string;
  panelBorderTop?: string;
  readoutColor?: string;
  readoutBg?: string;
  tabActiveBg?: string;
  tabBorderTop?: string;
  toggleActiveBg?: string;
  guideColor?: string;
}

export interface VibePreset {
  name: string;
  badge: string;
  sky: [number, number, number];
  hor: [number, number, number];
  band: [number, number, number];
  ground: [number, number, number];
  bg: [number, number, number];
  iri: number;
  flat?: boolean;
  params: Partial<BrushParams>;
  theme: VibeColors;
}

export interface Point {
  x: number;
  y: number;
  p: number;
}

export interface Stroke {
  raw: Point[];
  pts?: Point[];
  group: THREE.Group | null;
  params: BrushParams;
  symmetry: SymmetryMode;
}

export interface HistoryStep {
  added: Stroke[];
  removed: Stroke[];
  label?: string;
  timestamp?: number;
}

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export interface RefImageState {
  src: string;
  naturalW: number;
  naturalH: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blend: 'normal' | 'screen' | 'multiply';
  visible: boolean;
}

export type SymmetryMode =
  | 'None'
  | 'Mirror X'
  | 'Mirror Y'
  | 'Mirror X+Y'
  | 'Radial 3'
  | 'Radial 4'
  | 'Radial 6'
  | 'Radial 8';

export type ToolMode = 'brush' | 'select' | 'eraser';
export type EraserMode = 'slice' | 'stroke';

export interface ParamDef {
  key: keyof BrushParams;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultVal: number;
  category: 'brush' | 'chrome' | 'comp';
}
