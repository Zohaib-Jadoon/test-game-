import * as THREE from 'three';

export const USER_TEXTURE_PATHS = {
  armorAtlas: '/assets/aistudio/sylvanas1_c523f3a7.png',
  cloakAtlas: '/assets/aistudio/sylvanas2_337ef2a8.png',
  bowAtlas: '/assets/aistudio/sylvanas_bow_0a9e2254.png',
  hair: '/assets/aistudio/hair_638a2a94.jpg',
  skin: '/assets/aistudio/skin_0f988264.jpg',
  metal: '/assets/aistudio/metal_5d15391b.jpg',
} as const;

export interface DarkFantasyTextureSet {
  armorMap: THREE.Texture;
  cloakMap: THREE.Texture;
  bowMap: THREE.Texture;
  hairMap: THREE.Texture;
  hairBump: THREE.Texture;
  skinBump: THREE.Texture;
  metalMap: THREE.Texture;
  metalBump: THREE.Texture;
  dispose: () => void;
}

let cachedSet: DarkFantasyTextureSet | null = null;

function loadTex(
  loader: THREE.TextureLoader,
  url: string,
  opts: {
    srgb: boolean;
    repeat?: [number, number];
    anisotropy: number;
    onReady?: () => void;
  },
): THREE.Texture {
  const tex = loader.load(url, () => {
    opts.onReady?.();
  });
  if (opts.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) {
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.anisotropy = opts.anisotropy;
  return tex;
}

/**
 * Loads and caches the user-supplied Dark Ranger PBR texture set so characters,
 * bows, cloaks, enemies, and gothic citadel stonework share GPU textures cleanly.
 */
export function getDarkFantasyTextures(
  maxAnisotropy: number,
  onTextureLoaded?: () => void,
): DarkFantasyTextureSet {
  if (cachedSet) {
    return cachedSet;
  }
  const loader = new THREE.TextureLoader();

  const armorMap = loadTex(loader, USER_TEXTURE_PATHS.armorAtlas, {
    srgb: true,
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const cloakMap = loadTex(loader, USER_TEXTURE_PATHS.cloakAtlas, {
    srgb: true,
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const bowMap = loadTex(loader, USER_TEXTURE_PATHS.bowAtlas, {
    srgb: true,
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const hairMap = loadTex(loader, USER_TEXTURE_PATHS.hair, {
    srgb: true,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const hairBump = loadTex(loader, USER_TEXTURE_PATHS.hair, {
    srgb: false,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
  });
  const skinBump = loadTex(loader, USER_TEXTURE_PATHS.skin, {
    srgb: false,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const metalMap = loadTex(loader, USER_TEXTURE_PATHS.metal, {
    srgb: true,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
    onReady: onTextureLoaded,
  });
  const metalBump = loadTex(loader, USER_TEXTURE_PATHS.metal, {
    srgb: false,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
  });

  const all = [armorMap, cloakMap, bowMap, hairMap, hairBump, skinBump, metalMap, metalBump];

  cachedSet = {
    armorMap,
    cloakMap,
    bowMap,
    hairMap,
    hairBump,
    skinBump,
    metalMap,
    metalBump,
    dispose: () => {
      for (const t of all) t.dispose();
      cachedSet = null;
    },
  };

  return cachedSet;
}
