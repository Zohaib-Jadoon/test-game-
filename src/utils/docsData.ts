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
    title: 'Blender to Skyforge Arena (GLTF / GLB / FBX Pipeline)',
    summary:
      'Export rigged characters or custom arena champions directly from Blender 4.x and hot-swap them into the live Three.js WebGL arena.',
    bullets: [
      'In Blender, apply all transforms (Ctrl+A -> All Transforms) and orient your character facing +Y (exported to +Z in glTF) with feet grounded at Z = 0.',
      'Export via File -> Export -> glTF 2.0 (.glb) with Include: Selected Objects, Transform: +Y Up, and Animation: NLA Tracks / Baked Animations enabled.',
      'For legacy FBX rigs, export Binary FBX (Scale 1.0, Apply Scalings: FBX Units Scale); Skyforge AssetLoader auto-normalizes height to 2.1m and anchors the pivot at y = 0.',
      'Use the "Export Hero .GLB" button in the Blender Forge tab to download a ready-made Skyforge Vanguard rig, modify its armor or colors in Blender, and drop it straight back into the game.',
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
