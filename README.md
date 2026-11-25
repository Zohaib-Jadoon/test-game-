# Skyforge Arena

Responsive 3D indie action-arena game for mobile, tablet, and desktop built with Three.js, React 19, TypeScript, Express, Firebase, Drizzle PostgreSQL, and a live Blender 5.3 3D character pipeline.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Use `http://localhost:3000/?autostart=1` to jump directly into Solo Survival.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Express API + Vite HMR dev server on port 3000 |
| `npm run build` | Production client bundle + Workbox PWA service worker (`dist/`) |
| `npm run lint` | Strict TypeScript typecheck (`tsc --noEmit`) |
| `npm test` | Run unit tests (`rules`, `crypto`, `blenderBridge`, `assetLoader`) |

## Blender 5.3 Character & Asset Pipeline

All shipped characters, enemies, and arena obelisks are built, rigged, and animated in Blender 5.3:

- **Runtime `.glb` assets** (precached by PWA Workbox for offline play):
  - `public/models/heroes/`: `ranger.glb`, `vanguard.glb`, `sentinel.glb`, `ronin.glb`, `ember.glb` (18-bone humanoid armatures with `Idle`, `Run`, `Attack`, `Dash` NLA animation clips)
  - `public/models/enemies/`: `charger.glb`, `kiter.glb`, `swarmer.glb` (`Idle`, `Run`, `Attack` clips)
  - `public/models/props/`: `citadel_obelisk.glb`
- **Editable `.blend` sources**: `blender/sources/*.blend`
- **Cross-engine `.fbx` exports**: `blender/exports/*.fbx`
- **Generator scripts**:
  ```powershell
  blender --background --python blender/build_heroes.py
  blender --background --python blender/build_enemies.py
  ```

### Live Blender Bridge & Custom Imports

1. Open **Citadel Hub > Blender Forge**.
2. Drag-and-drop any `.glb`, `.gltf`, or `.fbx` file into the **Player 1 Hero**, **Arena Props (x4)**, or **Enemy Models** slot. `src/game/assetLoader.ts` normalizes scale, grounds feet at `y = 0`, clones rigged `SkinnedMesh` hierarchies via `SkeletonUtils.clone`, and binds animation clips automatically.
3. Click **Start Live Bridge**, download the pre-configured `skyforge_blender_bridge.py` add-on, install it in Blender 3.6–5.x, and push updates directly from Blender (`N` sidebar > **Skyforge**) or auto-sync on `Ctrl+S`.

## Gameplay & Controls

- **Modes**: Solo Survival (5 waves), Local 2P Co-op, Local 2P Duel (first to 5 KOs).
- **Desktop**:
  - Player 1: `WASD` move, `Space` dash, `J` or Left-Click attack/volley, `K` or Right-Click Nova, `P` / `Esc` pause, `M` mute.
  - Player 2: `Arrow Keys` move, `Shift` dash, `Enter` / `/` attack.
- **Mobile & Tablet**: Responsive virtual thumbstick and touch action pads (`Volley`, `Dash`, `Nova`).

## Backend, Cloud Sync, Security & Offline Architecture

- **Firebase Auth & Real-Time Firestore** (`src/lib/firebase.ts`, `firestore.rules`): Google sign-in, live `onSnapshot` leaderboards, offline `persistentLocalCache`, strict zero-trust Firestore rules (`security_spec.md`), and scoped E2EE messaging.
- **PostgreSQL Cross-Platform Saves & Telemetry** (`src/db/`, `server.ts`): Drizzle ORM schema for `users`, versioned `cloud_saves` backups, `match_history`, and `performance_logs`. Configure either `DATABASE_URL` or `SQL_HOST`/`SQL_DB_NAME`/`SQL_USER`/`SQL_PASSWORD` in `.env` (see `.env.example`).
- **Offline PWA & Monotonic Queue Replay** (`vite.config.ts`, `src/App.tsx`): Workbox precaches JS, CSS, textures, and `.glb` models. Offline progress, scores, and encrypted messages queue locally and flush automatically on reconnect.
- **End-to-End Encrypted Social Chat** (`src/utils/crypto.ts`, `src/components/hub/SocialE2EETab.tsx`): Client-side Web Crypto `ECDH P-256` key agreement + `AES-GCM 256` authenticated encryption; only ciphertext and IV leave the browser or touch local storage.
- **OS Biometric Passkey Lock** (`src/utils/biometrics.ts`): Uses WebAuthn platform authenticators (`Windows Hello`, `Face ID`, `Touch ID`, `Android BiometricPrompt`); no raw biometric templates or facial data are stored.
- **API Hardening & Low-Latency Monitoring** (`server.ts`, `src/components/hub/DocsMonitorTab.tsx`): Firebase ID token verification on SQL routes, fixed-window rate limiting, security headers, `X-Response-Time` header, `/api/health` readiness endpoint, and optional Gemini low-latency (`/api/ai/quick-tip`) + deep analysis (`/api/ai/deep-analysis`) endpoints.
- **Internationalization & Themes** (`src/utils/i18n.ts`): English, Spanish, Japanese, and French plus persistent Dark/Daylight themes and global Hub search.
