import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityPreset } from '../types';

export interface PresetRenderTuning {
  dprCap: number;
  shadowMapSize: number;
  usePostProcessing: boolean;
  bloomStrength: number;
  snowParticleCount: number;
  envIntensity: number;
}

export const PRESET_TUNING: Record<QualityPreset, PresetRenderTuning> = {
  low: { dprCap: 1.0, shadowMapSize: 1024, usePostProcessing: false, bloomStrength: 0.0, snowParticleCount: 160, envIntensity: 0.55 },
  medium: { dprCap: 1.25, shadowMapSize: 2048, usePostProcessing: true, bloomStrength: 0.22, snowParticleCount: 300, envIntensity: 0.72 },
  high: { dprCap: 1.5, shadowMapSize: 2048, usePostProcessing: true, bloomStrength: 0.28, snowParticleCount: 440, envIntensity: 0.85 },
  ultra: { dprCap: 2.0, shadowMapSize: 4096, usePostProcessing: true, bloomStrength: 0.34, snowParticleCount: 620, envIntensity: 0.96 },
};

const NordicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.34 },
    uContrast: { value: 1.06 },
    uFrostTint: { value: new THREE.Vector3(0.95, 0.98, 1.03) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uContrast;
    uniform vec3 uFrostTint;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = (texel.rgb - 0.5) * uContrast + 0.5;
      col *= uFrostTint;
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.42, 0.95, d);
      col *= mix(1.0, 1.0 - uVignette, vig);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), texel.a);
    }
  `,
};

export type HdriKey = 'snowy_forest' | 'winter_evening' | 'snowy_hillside' | 'forest_cave';

export class RealisticRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly rimLight: THREE.DirectionalLight;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private pmrem: THREE.PMREMGenerator;
  private hdriCache = new Map<HdriKey, THREE.WebGLRenderTarget>();
  private skyCache = new Map<HdriKey, THREE.Texture>();
  private pendingHdri = new Set<HdriKey>();
  private retryHdriAfter = new Map<HdriKey, number>();
  private activeHdri: HdriKey | null = null;
  private preset: QualityPreset = 'high';
  private disposed = false;

  constructor(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, preset: QualityPreset = 'high') {
    this.scene = scene;
    this.camera = camera;
    this.preset = preset;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this.hemiLight = new THREE.HemisphereLight(0xb2c9de, 0x2c343d, 0.55);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffe9cf, 2.35);
    this.sunLight.position.set(42, 62, 34);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 210;
    this.sunLight.shadow.camera.left = -56;
    this.sunLight.shadow.camera.right = 56;
    this.sunLight.shadow.camera.top = 56;
    this.sunLight.shadow.camera.bottom = -56;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x7da4c8, 0.55);
    this.rimLight.position.set(-40, 28, -50);
    this.scene.add(this.rimLight);

    this.scene.fog = new THREE.FogExp2(0x1f2a35, 0.0085);
    this.scene.background = new THREE.Color(0x1c2733);

    this.buildComposer(w, h);
    this.applyPreset(preset, w, h);
    void this.setHdri('snowy_forest');
  }

  private buildComposer(w: number, h: number): void {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.55, 0.86);
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(NordicGradeShader);
    this.composer.addPass(this.gradePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public applyPreset(preset: QualityPreset, width?: number, height?: number): void {
    this.preset = preset;
    const t = PRESET_TUNING[preset] ?? PRESET_TUNING.high;
    const dpr = Math.min(window.devicePixelRatio || 1, t.dprCap);
    this.renderer.setPixelRatio(dpr);
    if (width && height) {
      this.renderer.setSize(width, height);
    }
    this.sunLight.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
    if (this.bloomPass) {
      this.bloomPass.strength = t.bloomStrength;
    }
    this.scene.environmentIntensity = t.envIntensity;
    if (this.composer && width && height) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(width, height);
    }
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const t = PRESET_TUNING[this.preset] ?? PRESET_TUNING.high;
    const dpr = Math.min(window.devicePixelRatio || 1, t.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  }

  private getSky(key: HdriKey): THREE.Texture | THREE.Color {
    const cached = this.skyCache.get(key);
    if (cached) return cached;
    // The visible winter sky is separate from the photographed HDRI used for reflections.
    const palettes: Record<HdriKey, [string, string, string]> = {
      snowy_forest: ['#72889f', '#b6c1c8', '#647482'],
      snowy_hillside: ['#7790a6', '#bdc9d1', '#73828e'],
      winter_evening: ['#273b59', '#8494aa', '#344252'],
      forest_cave: ['#202b3a', '#566777', '#222b36'],
    };
    const [top, horizon, bottom] = palettes[key];
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Color(horizon);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.48, horizon);
    gradient.addColorStop(0.56, horizon);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sky = new THREE.CanvasTexture(canvas);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    this.skyCache.set(key, sky);
    return sky;
  }

  public setHdri(key: HdriKey): void {
    if (this.disposed) return;
    if (this.activeHdri !== key) {
      this.activeHdri = key;
      this.scene.background = this.getSky(key);
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
    }
    const cached = this.hdriCache.get(key);
    if (cached) {
      if (this.scene.environment !== cached.texture) this.scene.environment = cached.texture;
      return;
    }
    if (this.pendingHdri.has(key) || Date.now() < (this.retryHdriAfter.get(key) ?? 0)) return;
    this.pendingHdri.add(key);
    const loader = new RGBELoader();
    loader.load(
      `/assets/eidrath/hdri/${key}.hdr`,
      (hdr) => {
        this.pendingHdri.delete(key);
        if (this.disposed) { hdr.dispose(); return; }
        try {
          const target = this.pmrem.fromEquirectangular(hdr);
          this.hdriCache.set(key, target);
          this.retryHdriAfter.delete(key);
          if (this.activeHdri === key) this.scene.environment = target.texture;
        } catch {
          this.retryHdriAfter.set(key, Date.now() + 15000);
        } finally {
          hdr.dispose();
        }
      },
      undefined,
      () => {
        this.pendingHdri.delete(key);
        this.retryHdriAfter.set(key, Date.now() + 15000);
      },
    );
  }

  public updateAtmosphere(params: {
    playerPos: THREE.Vector3;
    dayPhase: number;
    inTomb: boolean;
    nearBoss: boolean;
  }): void {
    const { playerPos, dayPhase, inTomb, nearBoss } = params;
    const sunAngle = dayPhase * Math.PI * 2;
    const elev = Math.max(18, Math.sin(sunAngle) * 34 + 34);
    this.sunLight.position.set(playerPos.x + Math.cos(sunAngle) * 52, playerPos.y + elev, playerPos.z + Math.sin(sunAngle) * 44);
    this.sunLight.target.position.copy(playerPos);

    if (inTomb) {
      this.setHdri('forest_cave');
      this.sunLight.intensity = 1.15;
      this.sunLight.color.setHex(0x9fb8d4);
      this.hemiLight.intensity = 0.42;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(0x131922);
        this.scene.fog.density = 0.012;
      }
      this.renderer.toneMappingExposure = 1.02;
    } else if (nearBoss) {
      this.setHdri('winter_evening');
      this.sunLight.intensity = 2.0;
      this.sunLight.color.setHex(0xc8d8ea);
      this.hemiLight.intensity = 0.5;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(0x19232f);
        this.scene.fog.density = 0.0095;
      }
      this.renderer.toneMappingExposure = 1.05;
    } else {
      this.setHdri('snowy_forest');
      this.sunLight.intensity = 2.45;
      this.sunLight.color.setHex(0xffe8cf);
      this.hemiLight.intensity = 0.62;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(0x283645);
        this.scene.fog.density = 0.0068;
      }
      this.renderer.toneMappingExposure = 1.08;
    }
  }

  public render(): void {
    const t = PRESET_TUNING[this.preset] ?? PRESET_TUNING.high;
    if (t.usePostProcessing && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.scene.environment = null;
    this.scene.background = null;
    for (const target of this.hdriCache.values()) target.dispose();
    for (const texture of this.skyCache.values()) texture.dispose();
    this.hdriCache.clear();
    this.skyCache.clear();
    this.pendingHdri.clear();
    this.retryHdriAfter.clear();
    this.pmrem.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

export function createSoftSnowSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(235, 244, 255, 0.95)');
  grad.addColorStop(0.45, 'rgba(220, 234, 250, 0.55)');
  grad.addColorStop(1, 'rgba(220, 234, 250, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

