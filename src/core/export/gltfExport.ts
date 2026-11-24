import * as THREE from 'three';
import { ExportMeshData } from './types';
import { downloadBlob } from './utils';

export async function exportGLTFModel(
  meshData: ExportMeshData,
  filename: string,
  onStatus?: (msg: string) => void
): Promise<void> {
  const { positions, uvs, indices } = meshData;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    metalness: 0.96,
    roughness: 0.08,
    envMapIntensity: 1.5,
  });
  const mesh = new THREE.Mesh(geo, mat);

  const exportScene = new THREE.Scene();
  exportScene.add(mesh);

  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();
  exporter.parse(
    exportScene,
    (gltf) => {
      const glbBlob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
      downloadBlob(glbBlob, filename);
      onStatus?.(`Saved ${filename}`);
      geo.dispose();
      mat.dispose();
    },
    (error) => {
      console.error('GLTF export error:', error);
      onStatus?.('GLTF export failed');
      geo.dispose();
      mat.dispose();
    },
    { binary: true }
  );
}
