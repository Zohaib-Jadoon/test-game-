import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ITEMS } from '../content/eidrathContent';
import { attachWeaponToSocket, disposeObjectTree, instantiateSkinnedActor } from '../game/assets/manifest';

interface InventoryPreview3DProps {
  mainHandId: string | null;
  offHandId: string | null;
}

export const InventoryPreview3D: React.FC<InventoryPreview3DProps> = ({ mainHandId, offHandId }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let rafId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f141a);
    const w = Math.max(220, host.clientWidth || 260);
    const h = Math.max(280, host.clientHeight || 340);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 30);
    camera.position.set(0.35, 1.38, 2.75);
    camera.lookAt(0, 1.02, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xb8d0e8, 0x262c34, 0.9);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe7c9, 2.0);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6d9cb6, 1.2);
    rim.position.set(-2.5, 2.5, -2.5);
    scene.add(rim);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.75, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x232a32, roughness: 0.75, metalness: 0.2 }),
    );
    plinth.position.y = -0.04;
    scene.add(plinth);

    let rotRoot: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;

    void (async () => {
      try {
        const actor = await instantiateSkinnedActor('chr_kaelen');
        if (cancelled) {
          disposeObjectTree(actor.root);
          return;
        }
        rotRoot = actor.root;
        scene.add(actor.root);
        mixer = actor.mixer;
        const idle = actor.clips.get('idle');
        if (mixer && idle) {
          mixer.clipAction(idle).play();
        }
        const mainMesh = mainHandId ? ITEMS[mainHandId]?.meshAssetId ?? null : null;
        const offMesh = offHandId ? ITEMS[offHandId]?.meshAssetId ?? null : null;
        await attachWeaponToSocket(actor, mainMesh, 'hand_r');
        await attachWeaponToSocket(actor, offMesh, 'hand_l');
      } catch {
        // Offline / preview fallback silently keeps clean studio lighting plinth
      }
    })();

    let last = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (rotRoot) {
        rotRoot.rotation.y += dt * 0.45;
      }
      mixer?.update(dt);
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      disposeObjectTree(scene);
      renderer.dispose();
    };
  }, [mainHandId, offHandId]);

  return (
    <div className="eid-panel p-2 flex flex-col items-center">
      <div className="w-full flex items-center justify-between px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-[#b89552]">
        <span>Kaelen — Equipment Loadout</span>
        <span className="text-[#7fa8c4]">Live 3D</span>
      </div>
      <div ref={hostRef} className="w-full h-72 sm:h-80 overflow-hidden bg-[#0c1015] border border-[#b89552]/20" />
    </div>
  );
};

