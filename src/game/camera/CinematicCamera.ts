import * as THREE from 'three';
import { getTerrainHeight } from '../world/frostheimTerrain';

export interface CinematicCameraConfig {
  baseFov: number;
  baseDistance: number;
  shoulderSign: 1 | -1;
  cameraShakeEnabled: boolean;
  reducedMotion: boolean;
}

export interface DialogueShot {
  npcPos: THREE.Vector3;
  playerPos: THREE.Vector3;
}

export interface BossIntroShot {
  bossPos: THREE.Vector3;
  remainingSec: number;
  totalSec: number;
}

export class CinematicCamera {
  public yaw = -Math.PI * 0.25;
  public pitch = 0.22;

  private config: CinematicCameraConfig;
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private initialized = false;
  private currentDist = 3.4;
  private currentFov = 56;
  private currentShoulder = 0.56;
  private shakeTrauma = 0;
  private shakeTimer = 0;
  private zoomPulse = 0;
  private raycaster = new THREE.Raycaster();
  private introTimer = 0;
  private bossIntro: BossIntroShot | null = null;
  private dialogueShot: DialogueShot | null = null;

  constructor(config: Partial<CinematicCameraConfig> = {}) {
    this.config = {
      baseFov: config.baseFov ?? 56,
      baseDistance: config.baseDistance ?? 3.4,
      shoulderSign: config.shoulderSign ?? 1,
      cameraShakeEnabled: config.cameraShakeEnabled ?? true,
      reducedMotion: config.reducedMotion ?? false,
    };
    this.currentDist = this.config.baseDistance;
    this.currentFov = this.config.baseFov;
  }

  public updateConfig(partial: Partial<CinematicCameraConfig>): void {
    Object.assign(this.config, partial);
  }

  public resetPose(): void {
    this.initialized = false;
    this.introTimer = 0;
    this.bossIntro = null;
    this.dialogueShot = null;
    this.shakeTimer = 0;
    this.shakeTrauma = 0;
    this.zoomPulse = 0;
  }

  public toggleShoulder(): void {
    this.config.shoulderSign = this.config.shoulderSign === 1 ? -1 : 1;
  }

  public triggerShake(durationSec: number, amplitude: number): void {
    if (!this.config.cameraShakeEnabled || this.config.reducedMotion) return;
    this.shakeTimer = Math.max(this.shakeTimer, durationSec);
    this.shakeTrauma = Math.max(this.shakeTrauma, amplitude);
  }

  public triggerZoomPulse(deltaFov: number): void {
    if (this.config.reducedMotion) return;
    this.zoomPulse = deltaFov;
  }

  public startTombOpening(playerYaw: number): void {
    this.yaw = playerYaw + Math.PI;
    this.pitch = 0.16;
    this.introTimer = this.config.reducedMotion ? 0 : 2.6;
    this.initialized = false;
  }

  public startBossIntro(bossPos: THREE.Vector3): void {
    if (this.config.reducedMotion) return;
    this.bossIntro = {
      bossPos: bossPos.clone(),
      remainingSec: 2.4,
      totalSec: 2.4,
    };
  }

  public setDialogueShot(shot: DialogueShot | null): void {
    this.dialogueShot = shot;
  }

  public update(
    camera: THREE.PerspectiveCamera,
    dt: number,
    params: {
      playerPos: THREE.Vector3;
      playerYaw: number;
      inCombat: boolean;
      isSprinting: boolean;
      isBossFight: boolean;
      lockedTargetPos: THREE.Vector3 | null;
      collisionMeshes: THREE.Object3D[];
    },
  ): void {
    const { playerPos, inCombat, isSprinting, isBossFight, lockedTargetPos, collisionMeshes } = params;

    // 1. Boss introduction pan
    if (this.bossIntro) {
      this.bossIntro.remainingSec -= dt;
      const t = 1 - Math.max(0, this.bossIntro.remainingSec / this.bossIntro.totalSec);
      const bp = this.bossIntro.bossPos;
      const desired = new THREE.Vector3(
        bp.x + Math.sin(t * 0.9) * 6.5,
        bp.y + 3.2,
        bp.z + 9.5 - t * 1.4,
      );
      const look = new THREE.Vector3(bp.x, bp.y + 2.3, bp.z);
      this.applySmoothed(camera, desired, look, this.config.baseFov - 6, dt * 0.8);
      if (this.bossIntro.remainingSec <= 0) {
        this.bossIntro = null;
      }
      return;
    }

    // 2. Dialogue two-shot framing
    if (this.dialogueShot) {
      const { npcPos, playerPos: pPos } = this.dialogueShot;
      const toNpc = new THREE.Vector3().subVectors(npcPos, pPos).normalize();
      const side = new THREE.Vector3(-toNpc.z, 0, toNpc.x).multiplyScalar(0.85 * this.config.shoulderSign);
      const desired = pPos.clone().addScaledVector(toNpc, -1.65).add(side);
      desired.y = Math.max(getTerrainHeight(desired.x, desired.z) + 0.6, pPos.y + 1.58);
      const look = npcPos.clone().add(new THREE.Vector3(0, 1.48, 0));
      this.applySmoothed(camera, desired, look, Math.max(44, this.config.baseFov - 8), dt);
      return;
    }

    // 3. Smooth lock-on camera orientation
    if (lockedTargetPos) {
      const targetCamYaw = Math.atan2(playerPos.x - lockedTargetPos.x, playerPos.z - lockedTargetPos.z);
      this.yaw = this.lerpAngle(this.yaw, targetCamYaw, Math.min(1, 7.5 * dt));
    }

    // 4. Contextual boom distance, shoulder offset & FOV
    let targetDist = this.config.baseDistance;
    if (isBossFight) targetDist = Math.max(this.config.baseDistance + 2.4, 5.8);
    else if (inCombat) targetDist = this.config.baseDistance + 0.45;
    else if (this.introTimer > 0) {
      this.introTimer = Math.max(0, this.introTimer - dt);
      targetDist = this.config.baseDistance + 1.4 * (this.introTimer / 2.6);
    }

    const targetShoulder = (isBossFight ? 0.35 : inCombat ? 0.64 : 0.56) * this.config.shoulderSign;
    let targetFov = this.config.baseFov + (isSprinting ? 5 : 0) + (isBossFight ? 4 : 0) + this.zoomPulse;
    this.zoomPulse *= Math.max(0, 1 - dt * 8);

    this.currentDist += (targetDist - this.currentDist) * Math.min(1, 6 * dt);
    this.currentShoulder += (targetShoulder - this.currentShoulder) * Math.min(1, 8 * dt);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, 7 * dt);
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    // 5. Compute desired camera & pivot positions
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    const pivot = new THREE.Vector3(
      playerPos.x + rightX * this.currentShoulder * 0.55,
      playerPos.y + 1.54,
      playerPos.z + rightZ * this.currentShoulder * 0.55,
    );

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * cosP,
      sinP,
      Math.cos(this.yaw) * cosP,
    ).normalize();

    // Include the complete shoulder offset in the actual collision segment.
    const desiredPos = pivot.clone().addScaledVector(dir, this.currentDist);
    desiredPos.x += rightX * this.currentShoulder * 0.45;
    desiredPos.z += rightZ * this.currentShoulder * 0.45;

    // Ground collision clamp
    const groundY = getTerrainHeight(desiredPos.x, desiredPos.z) + 0.45;
    if (desiredPos.y < groundY) {
      desiredPos.y = groundY;
    }

    // Shake trauma
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer > 0 ? this.shakeTrauma : 0;
      desiredPos.x += (Math.random() - 0.5) * decay;
      desiredPos.y += (Math.random() - 0.5) * decay;
      if (this.shakeTimer === 0) this.shakeTrauma = 0;
    }

    const lookTarget = lockedTargetPos
      ? new THREE.Vector3(
          playerPos.x * 0.42 + lockedTargetPos.x * 0.58,
          Math.max(playerPos.y + 1.38, (playerPos.y + lockedTargetPos.y) * 0.5 + 1.25),
          playerPos.z * 0.42 + lockedTargetPos.z * 0.58,
        )
      : new THREE.Vector3(
          playerPos.x + rightX * this.currentShoulder * 0.55 - Math.sin(this.yaw) * 2.4,
          playerPos.y + 1.48 - sinP * 0.6,
          playerPos.z + rightZ * this.currentShoulder * 0.55 - Math.cos(this.yaw) * 2.4,
        );

    this.applySmoothed(camera, desiredPos, lookTarget, this.currentFov, dt);
    // Resolve the *smoothed* camera, not just its destination. Pull in immediately
    // on collision and let normal smoothing move it out again when clear.
    this.constrainBoom(pivot, this.curPos, collisionMeshes);
    camera.position.copy(this.curPos);
    camera.lookAt(this.curLook);
  }

  private constrainBoom(pivot: THREE.Vector3, pos: THREE.Vector3, collisionMeshes: THREE.Object3D[]): void {
    const segment = pos.clone().sub(pivot);
    const distance = segment.length();
    if (distance < 0.05 || collisionMeshes.length === 0) return;
    const direction = segment.multiplyScalar(1 / distance);
    this.raycaster.set(pivot, direction);
    this.raycaster.near = 0.02;
    this.raycaster.far = distance;
    for (const hit of this.raycaster.intersectObjects(collisionMeshes, true)) {
      // Raycaster does not automatically skip invisible parent groups.
      let node: THREE.Object3D | null = hit.object;
      let skip = false;
      while (node) {
        if (!node.visible || /^(UCX_|ACTOR_|CHR_)/i.test(node.name)) { skip = true; break; }
        node = node.parent;
      }
      if (skip) continue;
      pos.copy(pivot).addScaledVector(direction, Math.max(0.02, hit.distance - 0.30));
      break;
    }
  }

  private applySmoothed(
    camera: THREE.PerspectiveCamera,
    desiredPos: THREE.Vector3,
    desiredLook: THREE.Vector3,
    fov: number,
    dt: number,
  ): void {
    if (!this.initialized) {
      this.curPos.copy(desiredPos);
      this.curLook.copy(desiredLook);
      this.initialized = true;
    } else {
      const alphaPos = 1 - Math.exp(-14 * dt);
      const alphaLook = 1 - Math.exp(-16 * dt);
      this.curPos.lerp(desiredPos, alphaPos);
      this.curLook.lerp(desiredLook, alphaLook);
    }
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(this.curPos);
    camera.lookAt(this.curLook);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}

