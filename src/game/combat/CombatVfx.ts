import * as THREE from 'three';

interface RibbonSample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  maxTtl: number;
  gravity: number;
}

export class CombatVfx {
  private scene: THREE.Object3D;
  private trailSamples: RibbonSample[] = [];
  private trailMesh: THREE.Mesh;
  private trailGeo: THREE.BufferGeometry;
  private trailMat: THREE.MeshBasicMaterial;
  private maxSamples = 14;
  private particles: BurstParticle[] = [];
  private sharedSparkGeo = new THREE.OctahedronGeometry(0.045, 0);
  private sharedDustGeo = new THREE.DodecahedronGeometry(0.14, 0);

  constructor(parentGroup: THREE.Object3D) {
    this.scene = parentGroup;
    this.trailGeo = new THREE.BufferGeometry();
    const verts = new Float32Array(this.maxSamples * 2 * 3);
    const uvs = new Float32Array(this.maxSamples * 2 * 2);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    this.trailGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0xc8d8e6,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;
    this.scene.add(this.trailMesh);
  }

  public addWeaponTrailSample(baseWorld: THREE.Vector3, tipWorld: THREE.Vector3, colorHex = 0xc8d8e6): void {
    this.trailMat.color.setHex(colorHex);
    this.trailSamples.unshift({
      base: baseWorld.clone(),
      tip: tipWorld.clone(),
      age: 0,
    });
    if (this.trailSamples.length > this.maxSamples) {
      this.trailSamples.pop();
    }
    this.rebuildTrailGeometry();
  }

  public clearWeaponTrail(): void {
    this.trailSamples = [];
    this.trailMesh.visible = false;
  }

  private rebuildTrailGeometry(): void {
    if (this.trailSamples.length < 2) {
      this.trailMesh.visible = false;
      return;
    }
    this.trailMesh.visible = true;
    const pos = this.trailGeo.attributes.position as THREE.BufferAttribute;
    const uv = this.trailGeo.attributes.uv as THREE.BufferAttribute;
    const indices: number[] = [];
    const n = this.trailSamples.length;
    for (let i = 0; i < n; i++) {
      const s = this.trailSamples[i];
      pos.setXYZ(i * 2, s.base.x, s.base.y, s.base.z);
      pos.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
      const u = i / (n - 1);
      uv.setXY(i * 2, u, 0);
      uv.setXY(i * 2 + 1, u, 1);
      if (i < n - 1) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    this.trailGeo.setIndex(indices);
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    this.trailGeo.setDrawRange(0, indices.length);
  }

  public spawnImpactSparks(pos: THREE.Vector3, kind: 'steel' | 'parry' | 'frost' | 'fire' | 'oath'): void {
    const colorMap: Record<typeof kind, number> = {
      steel: 0xf4b266,
      parry: 0x8fd4ff,
      frost: 0x9be0ff,
      fire: 0xff7b36,
      oath: 0x7cb7d4,
    };
    const count = kind === 'parry' ? 16 : 10;
    const col = colorMap[kind];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedSparkGeo, mat);
      mesh.position.copy(pos);
      const speed = 2.4 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      const vy = 1.2 + Math.random() * 3.8;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(theta) * speed,
        vy,
        vz: Math.sin(theta) * speed,
        ttl: 0.32 + Math.random() * 0.22,
        maxTtl: 0.54,
        gravity: 11.5,
      });
    }
  }

  public spawnSnowDust(pos: THREE.Vector3, count = 8): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcad6e0,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedDustGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.9,
        pos.y + 0.15,
        pos.z + (Math.random() - 0.5) * 0.9,
      );
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 1.8;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 0.6 + Math.random() * 1.2,
        vz: Math.sin(ang) * spd,
        ttl: 0.45 + Math.random() * 0.25,
        maxTtl: 0.70,
        gravity: 2.2,
      });
    }
  }

  public update(dt: number): void {
    // Age & fade weapon ribbon trail
    if (this.trailSamples.length > 0) {
      for (let i = this.trailSamples.length - 1; i >= 0; i--) {
        this.trailSamples[i].age += dt;
        if (this.trailSamples[i].age > 0.16) {
          this.trailSamples.splice(i, 1);
        }
      }
      this.rebuildTrailGeometry();
    }

    // Update burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const ratio = Math.max(0, p.ttl / p.maxTtl);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
      p.mesh.scale.setScalar(0.5 + (1 - ratio) * 0.7);
    }
  }

  public dispose(): void {
    this.clearWeaponTrail();
    this.scene.remove(this.trailMesh);
    this.trailGeo.dispose();
    this.trailMat.dispose();
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.sharedSparkGeo.dispose();
    this.sharedDustGeo.dispose();
  }
}

