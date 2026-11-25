import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  buildHeroCharacterRig,
  createContactShadowTexture,
  type BuiltinRigId,
} from './proceduralModels';

export interface ImportedAssetSummary {
  fileName: string;
  format: 'GLB' | 'GLTF' | 'FBX';
  meshCount: number;
  triangleCount: number;
  materialCount: number;
  animationNames: string[];
  normalizedScale: number;
}

export interface LoadedCustomRig {
  group: THREE.Group;
  animations: THREE.AnimationClip[];
  summary: ImportedAssetSummary;
}

function normalizeModelForArena(
  rawRoot: THREE.Object3D,
  fileName: string,
  format: 'GLB' | 'GLTF' | 'FBX',
  animations: THREE.AnimationClip[],
): LoadedCustomRig {
  const wrapper = new THREE.Group();
  rawRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(rawRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxHeight = Math.max(size.y, size.x, size.z, 0.001);
  const targetHeight = 2.15;
  const scale = targetHeight / maxHeight;

  rawRoot.scale.multiplyScalar(scale);
  rawRoot.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(rawRoot);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  // Center X/Z and ground feet flush at y = 0
  rawRoot.position.x -= scaledCenter.x;
  rawRoot.position.z -= scaledCenter.z;
  rawRoot.position.y -= scaledBox.min.y;

  let meshCount = 0;
  let triangleCount = 0;
  const materialSet = new Set<THREE.Material>();

  rawRoot.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount++;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const geo = mesh.geometry;
      if (geo) {
        if (geo.index) {
          triangleCount += Math.floor(geo.index.count / 3);
        } else if (geo.attributes.position) {
          triangleCount += Math.floor(geo.attributes.position.count / 3);
        }
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m) {
          materialSet.add(m);
          if ('envMapIntensity' in m) {
            (m as THREE.MeshStandardMaterial).envMapIntensity = 1.0;
          }
        }
      }
    }
  });

  wrapper.add(rawRoot);

  return {
    group: wrapper,
    animations,
    summary: {
      fileName,
      format,
      meshCount,
      triangleCount,
      materialCount: materialSet.size,
      animationNames: animations.map((clip) => clip.name || 'Unnamed Clip'),
      normalizedScale: Number(scale.toFixed(3)),
    },
  };
}

/**
 * Loads a Blender-exported .glb, .gltf, or .fbx binary ArrayBuffer via Three.js loaders.
 */
export async function loadBlenderAssetBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<LoadedCustomRig> {
  const lower = fileName.toLowerCase();
  const ext = lower.endsWith('.glb')
    ? 'GLB'
    : lower.endsWith('.gltf')
      ? 'GLTF'
      : lower.endsWith('.fbx')
        ? 'FBX'
        : null;

  if (!ext) {
    throw new Error('Unsupported 3D asset format. Please upload a .glb, .gltf, or .fbx file exported from Blender.');
  }

  if (ext === 'FBX') {
    const loader = new FBXLoader();
    const fbxGroup = loader.parse(buffer, '');
    const clips = fbxGroup.animations || [];
    return normalizeModelForArena(fbxGroup, fileName, 'FBX', clips);
  }

  const gltfLoader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      gltfLoader.parse(
        buffer,
        '',
        (result) => resolve({ scene: result.scene, animations: result.animations || [] }),
        (err) => reject(err instanceof Error ? err : new Error('Failed to parse GLTF/GLB asset.')),
      );
    },
  );

  return normalizeModelForArena(gltf.scene, fileName, ext, gltf.animations);
}

/**
 * Loads a Blender-exported .glb, .gltf, or .fbx File directly in the browser via Three.js loaders.
 */
export async function loadBlenderAssetFile(file: File): Promise<LoadedCustomRig> {
  const buffer = await file.arrayBuffer();
  return loadBlenderAssetBuffer(buffer, file.name);
}

/**
 * Exports one of the ready-made sculpted Skyforge hero rigs to a binary .glb file
 * that users can open in Blender, customize, and re-import.
 */
export async function exportBuiltinRigAsGlb(rigId: BuiltinRigId): Promise<Blob> {
  const shadowTex = createContactShadowTexture();
  const built = buildHeroCharacterRig(rigId, shadowTex);
  const exportScene = new THREE.Group();
  exportScene.name = `Skyforge_${rigId}`;
  exportScene.add(built.bodyGroup);

  const exporter = new GLTFExporter();
  const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      exportScene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          const json = JSON.stringify(result);
          resolve(new TextEncoder().encode(json).buffer);
        }
      },
      (err) => reject(err instanceof Error ? err : new Error('GLB export failed')),
      { binary: true },
    );
  });

  shadowTex.dispose();
  return new Blob([binary], { type: 'model/gltf-binary' });
}
