import { BrushParams, VibePreset, ViewTransform } from '../../types';

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

export interface ExportMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}
