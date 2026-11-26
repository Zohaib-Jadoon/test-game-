import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import config from './ready-scenes.json';

type Triple = [number, number, number];
type Collider = { x: number; z: number; radius: number };
type SceneRecord = { id: string; file: string; source: string; license: string };
type Title = SceneRecord & { position: Triple; target: Triple };
type Zone = SceneRecord & { x: number; z: number; yaw: number; scale: number; radius: number; omit: string[]; colliders: Collider[] };
export type LoadedReadyZone = Omit<Zone, 'omit'> & { root: THREE.Group; omit: Set<string> };
const approvedLicenses = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0']);
const loader = new GLTFLoader();
function valid(record: SceneRecord): boolean {
  return Boolean(record && /^[a-z0-9_-]+$/.test(record.id) && /^\/assets\/eidrath\/ready-scenes\/[a-z0-9_-]+\.glb$/.test(record.file) && /^https:\/\//.test(record.source) && approvedLicenses.has(record.license));
}
async function load(record: SceneRecord): Promise<THREE.Group> {
  if (!valid(record)) throw new Error('Invalid ready-scene metadata');
  const { scene } = await loader.loadAsync(record.file);
  scene.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return scene;
}
function triple(value: unknown): value is Triple { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite); }
export async function loadReadyTitle(): Promise<{ root: THREE.Group; position: THREE.Vector3; target: THREE.Vector3 } | null> {
  const title = config.title as Title | null;
  if (!title) return null;
  try {
    if (!triple(title.position) || !triple(title.target)) throw new Error('Invalid authored camera');
    return { root: await load(title), position: new THREE.Vector3(...title.position), target: new THREE.Vector3(...title.target) };
  } catch (error) { console.warn('Ready title unavailable:', error); return null; }
}
export async function loadReadyZones(): Promise<LoadedReadyZone[]> {
  const zones: LoadedReadyZone[] = [];
  for (const zone of config.zones as Zone[]) {
    try {
      if (![zone.x, zone.z, zone.yaw, zone.scale, zone.radius].every(Number.isFinite) || zone.scale <= 0 || zone.radius <= 0 || zone.radius > 45 ||
          !Array.isArray(zone.omit) || !zone.omit.every(id => /^env_[a-z0-9_]+$/.test(id)) ||
          !Array.isArray(zone.colliders) || zone.colliders.length === 0 ||
          !zone.colliders.every(c => [c.x, c.z, c.radius].every(Number.isFinite) && c.radius > 0 && Math.hypot(c.x - zone.x, c.z - zone.z) <= zone.radius)) throw new Error('Invalid zone or collider metadata');
      if (zones.some(existing => Math.hypot(existing.x-zone.x, existing.z-zone.z) < existing.radius+zone.radius)) throw new Error('Overlapping scene zones');
      const root = await load(zone);
      root.position.set(zone.x, 0, zone.z);
      root.rotation.y = zone.yaw;
      root.scale.setScalar(zone.scale);
      zones.push({ ...zone, root, omit: new Set(zone.omit) });
    } catch (error) { console.warn('Ready zone rejected:', zone?.id, error); }
  }
  return zones;
}
