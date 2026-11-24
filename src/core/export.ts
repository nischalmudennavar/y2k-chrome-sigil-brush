import { Stroke } from '../types';
import { RenderPipeline } from './renderPipeline';
import { getStrokesBounds } from './geometry';
import { ExportMeshData, Model3DExportOptions } from './export/types';
import { downloadBlob, makeExportPrefix } from './export/utils';
import { buildHeightfield3DMesh, buildVectorExtrudedMesh } from './export/meshBuilders';
import { createBinarySTL } from './export/stlExport';
import { exportGLTFModel } from './export/gltfExport';

export type { BaseStyle, ImageExportOptions, Model3DExportOptions } from './export/types';
export { downloadBlob } from './export/utils';
export { exportImage } from './export/imageExport';
export { createBinarySTL } from './export/stlExport';
export { buildVectorExtrudedMesh } from './export/meshBuilders';

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

  // Align pipeline root before computing bounds so that mesh bounding boxes match canvas coordinates
  const oldRootPos = pipeline.root.position.clone();
  const oldRootScale = pipeline.root.scale.clone();
  pipeline.root.position.set(0, 0, 0);
  pipeline.root.scale.set(1, 1, 1);
  pipeline.root.updateMatrixWorld(true);

  const bounds = getStrokesBounds(strokes, window.innerWidth, window.innerHeight);

  let meshData: ExportMeshData;
  let gridW = gridRes;
  let gridH = gridRes;

  if (baseStyle === 'extruded') {
    onStatus?.(`Generating 3D ${format.toUpperCase()} (Vector Extrusion - Infinite Precision)...`);
    const vectorMesh = buildVectorExtrudedMesh(strokes, bounds, params, pipeline);
    pipeline.root.position.copy(oldRootPos);
    pipeline.root.scale.copy(oldRootScale);
    pipeline.dirty = true;

    if (vectorMesh.positions.length === 0) {
      onStatus?.('No strokes detected to export. Draw something first!');
      return;
    }
    meshData = vectorMesh;
  } else {
    onStatus?.(`Generating 3D ${format.toUpperCase()} (${gridRes}x${gridRes} Sub-Pixel)...`);
    const result = buildHeightfield3DMesh(pipeline, bounds, baseStyle, gridRes, params, onStatus);
    pipeline.root.position.copy(oldRootPos);
    pipeline.root.scale.copy(oldRootScale);
    pipeline.dirty = true;

    if (!result) return;
    meshData = result.meshData;
    gridW = result.gridW;
    gridH = result.gridH;
  }

  const { ts, vibeSlug } = makeExportPrefix(vibe.badge);
  const styleSlug = baseStyle === 'extruded' ? 'vector-smooth' : `${baseStyle}-${gridW}x${gridH}`;

  if (format === 'stl') {
    const stlBlob = createBinarySTL(meshData.positions, meshData.indices);
    const filename = `y2k-tribal-${vibeSlug}-${styleSlug}-${ts}.stl`;
    downloadBlob(stlBlob, filename);
    onStatus?.(`Saved ${filename}`);
  } else if (format === 'gltf') {
    const filename = `y2k-tribal-${vibeSlug}-${styleSlug}-${ts}.glb`;
    await exportGLTFModel(meshData, filename, onStatus);
  }
}
