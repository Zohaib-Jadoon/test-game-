export interface DocArticle {
  id: string;
  category: 'Blender 3D' | 'Architecture' | 'Security' | 'Multiplayer & Sync';
  title: string;
  summary: string;
  bullets: string[];
}

export const DEVELOPER_DOCS: DocArticle[] = [
  {
    id: 'blender-gltf-pipeline',
    category: 'Blender 3D',
    title: 'Blender 5.3 to Skyforge Arena (GLTF / GLB / FBX Pipeline)',
    summary:
      'All 5 playable heroes, 3 enemy archetypes, and arena obelisks are authored and rigged in Blender 5.3, exported as binary .glb and .fbx, and driven via Three.js SkeletonUtils + AnimationMixer.',
    bullets: [
      'Shipped rigged heroes live in public/models/heroes/ (ranger, vanguard, sentinel, ronin, ember) and enemies in public/models/enemies/ (charger, kiter, swarmer), with editable .blend sources in blender/sources/ and .fbx exports in blender/exports/.',
      'Regenerate or customize assets anytime with blender --background --python blender/build_heroes.py (and build_enemies.py); armatures use 4 baked NLA clips (Idle, Run, Attack, Dash) facing -Y in Blender (+Z in Three.js) grounded at Z = 0.',
      'AssetLoader uses SkeletonUtils.clone for safe SkinnedMesh instancing, per-instance material cloning for isolated hit-flash/telegraph tints, and case-insensitive animation clip resolution for third-party Blender/Mixamo/CGTrader .glb/.gltf/.fbx imports.',
      'The Live Blender Bridge add-on supports Blender 3.6–5.x, automatically preserving armature skinning (export_apply=False when armatures exist) and pushing directly into the selected Hero, Enemy, or Arena Prop slot.',
    ],
  },
  {
    id: 'modular-engine',
    category: 'Architecture',
    title: 'Decoupled 60fps Engine & Software-WebGL Scaling',
    summary:
      'Pure gameplay math lives in src/game/rules.ts (unit-tested with node:test), cleanly isolated from React HUD reconciliation and Three.js rendering.',
    bullets: [
      'SkyforgeEngine mounts WebGLRenderer inside an isolated ref container so HUD state updates never recreate the WebGL context or reset player state.',
      'Frame delta time is clamped to 50ms (0.05s) with sim-level hitstop (30–60ms) and trauma² camera shake.',
      'Particles use a zero-GC pooled InstancedMesh ring buffer (180 instances), and repeated scenery uses shared geometries and materials.',
      'Software WebGL fallback automatically detects SwiftShader/llvmpipe and paces frames via WebGL2 sync fences (afterDraw) without altering gameplay or visual content.',
    ],
  },
  {
    id: 'security-e2ee',
    category: 'Security',
    title: 'Zero-Trust Firestore Rules, Cloud SQL Auth & Web Crypto E2EE',
    summary:
      'Defense-in-depth across client encryption, Firebase Auth token verification, PostgreSQL parameterized Drizzle queries, and Eight-Pillar Firestore rules.',
    bullets: [
      'Direct messages are encrypted on-device with Web Crypto API ECDH (P-256) key agreement + AES-GCM 256-bit authenticated encryption before leaving the browser.',
      'Firestore separates PII (/users/{uid}/private/account) from public pilot profiles and enforces email_verified, strict key allowlists (hasOnly), and server timestamps (request.time).',
      'All Cloud SQL REST routes (/api/saves, /api/matches, /api/telemetry) verify Firebase ID tokens via firebase-admin verifyIdToken Bearer middleware and Drizzle ORM queries.',
      'WebAuthn platform authenticators allow optional biometric passkey locks for local account protection.',
    ],
  },
  {
    id: 'offline-sync-multiplayer',
    category: 'Multiplayer & Sync',
    title: 'Local 2-Player Multiplayer, Offline PWA & Cross-Platform Saves',
    summary:
      'Play seamlessly on mobile touchscreens or desktop keyboards, solo or 2-player local co-op/duel, with offline queueing and automated Cloud SQL backups.',
    bullets: [
      'Local 2P Co-op and Duel modes run simultaneously on one device (P1: WASD + Space + J/K, P2: Arrow Keys + Shift + Enter) with dynamic midpoint camera framing.',
      'Service worker caching (vite-plugin-pwa) and Firestore persistentLocalCache allow uninterrupted offline play.',
      'Offline score submissions and save updates queue locally in IndexedDB/localStorage and merge monotonically (highestWave, bestScore, totalKills) when connectivity returns.',
      'Automated Cloud SQL backups create versioned restore snapshots accessible from any mobile, tablet, or desktop browser.',
    ],
  },
];
