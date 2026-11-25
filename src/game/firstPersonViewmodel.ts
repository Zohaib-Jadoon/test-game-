import * as THREE from 'three';
import type { BuiltinRigId } from './proceduralModels';
import type { DarkFantasyTextureSet } from './darkFantasyTextures';
import { BLENDER_WEAPON_MODELS, loadBlenderStaticModelUrl } from './assetLoader';

export interface ViewmodelUpdateInput {
  dt: number;
  nowSec: number;
  stepPhase: number;
  horizontalSpeed: number;
  grounded: boolean;
  sprinting: boolean;
  dashing: boolean;
  attackProgress: number; // 0 when idle, 0..1 during active attack
  lookDeltaX: number;
  lookDeltaY: number;
  landDip: number;
}

export class FirstPersonViewmodel {
  public readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private rightHandGroup = new THREE.Group();
  private leftHandGroup = new THREE.Group();
  private rightWeaponSlot = new THREE.Group();
  private leftWeaponSlot = new THREE.Group();
  private rigId: BuiltinRigId;
  private disposables: Array<{ dispose: () => void }> = [];
  private disposed = false;

  private swayX = 0;
  private swayY = 0;
  private smoothBobAmp = 0;
  private smoothSprint = 0;
  private smoothDash = 0;

  constructor(rigId: BuiltinRigId, textures?: DarkFantasyTextureSet) {
    this.rigId = rigId;
    this.root.name = `FPS_Viewmodel_${rigId}`;
    this.root.add(this.pivot);
    this.rightHandGroup.add(this.rightWeaponSlot);
    this.leftHandGroup.add(this.leftWeaponSlot);
    this.pivot.add(this.rightHandGroup, this.leftHandGroup);
    this.buildGeometry(rigId, textures);
    void this.attachBlenderWeapons(rigId);
  }

  private replaceSlotWithGlb(
    slot: THREE.Group,
    template: THREE.Group,
    configure?: (clone: THREE.Group) => void,
  ): void {
    if (this.disposed) return;
    slot.clear();
    const clone = template.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    if (configure) configure(clone);
    slot.add(clone);
  }

  private async attachBlenderWeapons(rigId: BuiltinRigId): Promise<void> {
    if (typeof fetch !== 'function') return;
    try {
      if (rigId === 'ranger') {
        const [bow, arrow] = await Promise.all([
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.rangerBow),
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.rangerArrow),
        ]);
        this.replaceSlotWithGlb(this.leftWeaponSlot, bow);
        this.replaceSlotWithGlb(this.rightWeaponSlot, arrow, (c) => {
          c.position.set(-0.08, 0.04, -0.02);
        });
      } else if (rigId === 'ronin') {
        const odachi = await loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.roninOdachi);
        this.replaceSlotWithGlb(this.rightWeaponSlot, odachi);
      } else if (rigId === 'sentinel') {
        const [hammer, shield] = await Promise.all([
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.sentinelWarhammer),
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.sentinelShield),
        ]);
        this.replaceSlotWithGlb(this.rightWeaponSlot, hammer);
        this.replaceSlotWithGlb(this.leftWeaponSlot, shield);
      } else {
        const [glaive, shield] = await Promise.all([
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.vanguardGlaive),
          loadBlenderStaticModelUrl(BLENDER_WEAPON_MODELS.sentinelShield),
        ]);
        this.replaceSlotWithGlb(this.rightWeaponSlot, glaive);
        this.replaceSlotWithGlb(this.leftWeaponSlot, shield, (c) => {
          c.scale.setScalar(0.88);
        });
      }
    } catch {
      // Keep procedural fallback geometry when offline or uncached
    }
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildGeometry(rigId: BuiltinRigId, textures?: DarkFantasyTextureSet): void {
    // Skyrim Dragonborn Iron/Steel & Fur-Trimmed Gauntlet materials
    const palette =
      rigId === 'ranger'
        ? { armor: 0x3a2f27, trim: 0x9aa3ad, glow: 0x7dd3fc, accent: 0xd6c7b2 }
        : rigId === 'sentinel'
          ? { armor: 0x454b54, trim: 0xb6955a, glow: 0x7dd3fc, accent: 0xcbd5e1 }
          : rigId === 'ronin'
            ? { armor: 0x3b3532, trim: 0xc29e58, glow: 0x7dd3fc, accent: 0xe2e8f0 }
            : { armor: 0x414852, trim: 0xa68a56, glow: 0x7dd3fc, accent: 0xd4c8b4 };

    const armorMat = this.track(
      new THREE.MeshStandardMaterial({
        color: palette.armor,
        map: textures?.metalMap ?? null,
        bumpMap: textures?.metalBump ?? null,
        bumpScale: 0.025,
        roughness: 0.44,
        metalness: 0.72,
      }),
    );
    const trimMat = this.track(
      new THREE.MeshStandardMaterial({
        color: palette.trim,
        map: textures?.metalMap ?? null,
        bumpMap: textures?.metalBump ?? null,
        bumpScale: 0.02,
        roughness: 0.30,
        metalness: 0.86,
      }),
    );
    const leatherMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x2b1e16,
        roughness: 0.82,
        metalness: 0.06,
      }),
    );
    const furMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x4b433c,
        roughness: 0.94,
        metalness: 0.0,
      }),
    );
    const glowMat = this.track(
      new THREE.MeshStandardMaterial({
        color: palette.glow,
        emissive: palette.glow,
        emissiveIntensity: 2.2,
        roughness: 0.18,
        metalness: 0.1,
      }),
    );
    const accentGlowMat = this.track(
      new THREE.MeshStandardMaterial({
        color: palette.accent,
        roughness: 0.55,
      }),
    );

    // Skyrim Nordic Steel & Wolf-Fur Forearm Gauntlet
    const buildGauntlet = (side: -1 | 1) => {
      const g = new THREE.Group();
      const forearm = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.052, 0.064, 0.36, 10)),
        armorMat,
      );
      forearm.rotation.x = Math.PI / 2;
      forearm.position.set(0, -0.02, 0.22);
      const furCuff = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(0.062, 0.020, 7, 12)),
        furMat,
      );
      furCuff.position.set(0, -0.02, 0.11);
      const cuff = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(0.056, 0.011, 6, 12)),
        trimMat,
      );
      cuff.position.set(0, -0.02, 0.055);
      const glove = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.088, 0.072, 0.11)),
        leatherMat,
      );
      glove.position.set(0, -0.01, 0.01);
      const knuckle = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.092, 0.028, 0.05)),
        trimMat,
      );
      knuckle.position.set(0, 0.022, -0.01);
      g.add(forearm, furCuff, cuff, glove, knuckle);
      g.rotation.z = side * 0.14;
      return g;
    };

    if (rigId === 'ranger') {
      // Left hand holds the Carved Recurve Shadowbow tilted cleanly on left-front
      this.leftHandGroup.position.set(-0.27, -0.22, -0.58);
      this.leftHandGroup.rotation.set(0.06, 0.18, -0.34);
      this.leftHandGroup.add(buildGauntlet(-1));

      const bowCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.44, 0.09),
        new THREE.Vector3(0, 0.31, -0.06),
        new THREE.Vector3(0, 0.15, -0.10),
        new THREE.Vector3(0, 0.0, -0.04),
        new THREE.Vector3(0, -0.15, -0.10),
        new THREE.Vector3(0, -0.31, -0.06),
        new THREE.Vector3(0, -0.44, 0.09),
      ]);
      const bowLimbs = new THREE.Mesh(
        this.track(new THREE.TubeGeometry(bowCurve, 24, 0.022, 8, false)),
        trimMat,
      );
      const riser = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.045, 0.16, 0.065)),
        armorMat,
      );
      riser.position.set(0, 0, -0.05);
      const bowGem = new THREE.Mesh(
        this.track(new THREE.OctahedronGeometry(0.028, 0)),
        glowMat,
      );
      bowGem.position.set(0, 0, -0.09);
      const bowString = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.86, 6)),
        accentGlowMat,
      );
      bowString.position.set(0, 0, 0.085);
      this.leftWeaponSlot.add(bowLimbs, riser, bowGem, bowString);

      // Right hand holds nocked Crimson Shadow Arrow
      this.rightHandGroup.position.set(0.24, -0.25, -0.50);
      this.rightHandGroup.rotation.set(0.04, -0.16, 0.14);
      this.rightHandGroup.add(buildGauntlet(1));

      const shaft = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.0085, 0.0085, 0.62, 6)),
        trimMat,
      );
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(-0.08, 0.04, -0.22);
      const tip = new THREE.Mesh(
        this.track(new THREE.ConeGeometry(0.026, 0.12, 4)),
        glowMat,
      );
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(-0.08, 0.04, -0.55);
      const fletch = new THREE.Mesh(
        this.track(new THREE.ConeGeometry(0.022, 0.08, 4)),
        accentGlowMat,
      );
      fletch.rotation.x = Math.PI / 2;
      fletch.position.set(-0.08, 0.04, 0.08);
      this.rightWeaponSlot.add(shaft, tip, fletch);
      return;
    }

    // Melee Hero Viewmodels (Vanguard Glaive, Sentinel Warhammer + Tower Shield, Ronin Bloodmoon Odachi)
    this.rightHandGroup.position.set(0.32, -0.28, -0.56);
    this.rightHandGroup.rotation.set(0.16, -0.20, 0.18);
    this.rightHandGroup.add(buildGauntlet(1));

    if (rigId === 'ronin') {
      const grip = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.016, 0.018, 0.28, 8)),
        leatherMat,
      );
      grip.rotation.x = Math.PI * 0.36;
      grip.position.set(-0.02, 0.02, -0.02);
      const tsuba = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.062, 0.062, 0.016, 12)),
        trimMat,
      );
      tsuba.rotation.x = Math.PI * 0.36;
      tsuba.position.set(-0.02, 0.09, -0.14);
      const blade = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.016, 0.86, 0.052)),
        trimMat,
      );
      blade.rotation.x = -Math.PI * 0.14;
      blade.position.set(-0.02, 0.44, -0.34);
      const glowEdge = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.020, 0.84, 0.018)),
        glowMat,
      );
      glowEdge.rotation.x = -Math.PI * 0.14;
      glowEdge.position.set(-0.02, 0.44, -0.37);
      this.rightWeaponSlot.add(grip, tsuba, blade, glowEdge);
    } else if (rigId === 'sentinel') {
      const haft = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 8)),
        trimMat,
      );
      haft.rotation.x = -0.22;
      haft.position.set(0, 0.22, -0.12);
      const hammerHead = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.18, 0.19, 0.26)),
        armorMat,
      );
      hammerHead.rotation.x = -0.22;
      hammerHead.position.set(0, 0.50, -0.19);
      const coreBand = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.195, 0.08, 0.12)),
        glowMat,
      );
      coreBand.rotation.x = -0.22;
      coreBand.position.set(0, 0.50, -0.19);
      this.rightWeaponSlot.add(haft, hammerHead, coreBand);

      // Filigree Tower Shield edge on Left Hand
      this.leftHandGroup.position.set(-0.38, -0.30, -0.52);
      this.leftHandGroup.rotation.set(0.08, 0.45, -0.12);
      const shieldBody = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.06, 0.56, 0.34)),
        armorMat,
      );
      const shieldTrim = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.072, 0.50, 0.28)),
        trimMat,
      );
      const shieldGem = new THREE.Mesh(
        this.track(new THREE.OctahedronGeometry(0.055, 0)),
        glowMat,
      );
      shieldGem.position.set(0.04, 0.04, 0);
      this.leftWeaponSlot.add(shieldBody, shieldTrim, shieldGem);
    } else {
      // Dread Vanguard Runic Glaive + Kite Shield
      const pole = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.019, 0.021, 0.82, 8)),
        trimMat,
      );
      pole.rotation.x = -0.35;
      pole.position.set(0, 0.18, -0.16);
      const blade = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.028, 0.46, 0.11)),
        glowMat,
      );
      blade.rotation.x = -0.35;
      blade.position.set(0, 0.54, -0.32);
      const guard = new THREE.Mesh(
        this.track(new THREE.OctahedronGeometry(0.062, 0)),
        trimMat,
      );
      guard.position.set(0, 0.34, -0.23);
      this.rightWeaponSlot.add(pole, blade, guard);

      this.leftHandGroup.position.set(-0.36, -0.32, -0.54);
      this.leftHandGroup.rotation.set(0.10, 0.42, -0.14);
      const kite = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.05, 0.40, 0.25)),
        armorMat,
      );
      const kiteGem = new THREE.Mesh(
        this.track(new THREE.OctahedronGeometry(0.045, 0)),
        glowMat,
      );
      kiteGem.position.set(0.032, 0.02, 0);
      this.leftWeaponSlot.add(kite, kiteGem);
    }
  }

  public update(input: ViewmodelUpdateInput): void {
    const dt = Math.min(0.05, Math.max(0.001, input.dt));
    const damp = 1 - Math.exp(-14 * dt);

    // Mouse-look inertia sway
    const targetSwayX = Math.max(-0.045, Math.min(0.045, -input.lookDeltaX * 0.28));
    const targetSwayY = Math.max(-0.035, Math.min(0.035, input.lookDeltaY * 0.24));
    this.swayX += (targetSwayX - this.swayX) * damp;
    this.swayY += (targetSwayY - this.swayY) * damp;

    // Grounded stride-synced figure-8 weapon bob
    const moveRatio = input.grounded ? Math.min(1, input.horizontalSpeed / 9.0) : 0;
    this.smoothBobAmp += (moveRatio - this.smoothBobAmp) * (1 - Math.exp(-10 * dt));
    this.smoothSprint += ((input.sprinting && moveRatio > 0.3 ? 1 : 0) - this.smoothSprint) * (1 - Math.exp(-10 * dt));
    this.smoothDash += ((input.dashing ? 1 : 0) - this.smoothDash) * (1 - Math.exp(-18 * dt));

    const breathY = Math.sin(input.nowSec * 2.1) * 0.0045;
    const bobX = Math.cos(input.stepPhase) * 0.022 * this.smoothBobAmp;
    const bobY = -Math.abs(Math.sin(input.stepPhase)) * 0.024 * this.smoothBobAmp;

    this.pivot.position.set(
      this.swayX + bobX,
      this.swayY + bobY + breathY - input.landDip * 0.14 - this.smoothDash * 0.05,
      this.smoothDash * 0.08,
    );
    this.pivot.rotation.set(
      -this.smoothSprint * 0.09 - input.landDip * 0.12,
      this.swayX * 0.8 + this.smoothSprint * 0.10,
      -this.swayX * 1.1 - this.smoothSprint * 0.08,
    );

    // Attack animation curve (bow draw-and-snap vs melee slash cleave)
    const ap = input.attackProgress;
    if (this.rigId === 'ranger') {
      if (ap > 0) {
        const snap = Math.sin(ap * Math.PI);
        this.rightHandGroup.position.z = -0.50 + snap * 0.16;
        this.rightHandGroup.position.x = 0.24 - snap * 0.08;
        this.leftHandGroup.position.z = -0.58 + snap * 0.06;
        this.leftHandGroup.rotation.x = 0.06 + snap * 0.16;
      } else {
        this.rightHandGroup.position.set(0.24, -0.25, -0.50);
        this.leftHandGroup.position.set(-0.27, -0.22, -0.58);
        this.leftHandGroup.rotation.set(0.06, 0.18, -0.34);
      }
    } else {
      if (ap > 0) {
        const swing = Math.sin(ap * Math.PI);
        this.rightHandGroup.position.set(
          0.32 - swing * 0.44,
          -0.28 + swing * 0.12,
          -0.56 - swing * 0.14,
        );
        this.rightHandGroup.rotation.set(
          0.16 - swing * 0.95,
          -0.20 + swing * 1.15,
          0.18 + swing * 1.05,
        );
      } else {
        this.rightHandGroup.position.set(0.32, -0.28, -0.56);
        this.rightHandGroup.rotation.set(0.16, -0.20, 0.18);
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
