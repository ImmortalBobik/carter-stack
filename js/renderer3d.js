import * as THREE from '../vendor/three.module.min.js';
import { BASE_SIZE, SLAB_H } from './engine.js';

// Curated sunlit architectural glazed-ceramic spectrum (loops seamlessly)
const PALETTE = [
  0xe8e0d4, // Warm Limestone
  0xe59c85, // Soft Terracotta
  0xecbe88, // Sunlit Apricot
  0xe7d694, // Champagne Ochre
  0xa9ceb5, // Botanical Sage
  0x9bc4d6, // Glacier Mist
  0xa9b3de, // Periwinkle Silk
  0xdca8ba  // Dusty Rose Quartz
];

function sampleSlabColor(index, outColor) {
  const step = 0.22; // ~4.5 slabs per palette stop for silky architectural gradient
  const pos = (index * step) % PALETTE.length;
  const i0 = Math.floor(pos);
  const i1 = (i0 + 1) % PALETTE.length;
  const t = pos - i0;
  const smooth = t * t * (3 - 2 * t);
  const c0 = new THREE.Color(PALETTE[i0]);
  const c1 = new THREE.Color(PALETTE[i1]);
  return outColor.copy(c0).lerp(c1, smooth);
}

function createGalleryEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x3a404c);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(28, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x4b515e, side: THREE.BackSide })
  );
  envScene.add(dome);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0xded7ca, side: THREE.DoubleSide })
  );
  floor.position.set(0, -10, 0);
  floor.rotation.x = -Math.PI * 0.5;
  envScene.add(floor);

  const topSoftbox = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.95), side: THREE.DoubleSide })
  );
  topSoftbox.position.set(0, 15, 0);
  topSoftbox.rotation.x = Math.PI * 0.5;
  envScene.add(topSoftbox);

  const coolStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 2.6, 3.4), side: THREE.DoubleSide })
  );
  coolStrip.position.set(-14, 7, -6);
  coolStrip.lookAt(0, 0, 0);
  envScene.add(coolStrip);

  const warmStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.7, 1.9), side: THREE.DoubleSide })
  );
  warmStrip.position.set(14, 6, 8);
  warmStrip.lookAt(0, 0, 0);
  envScene.add(warmStrip);

  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  return rt.texture;
}

function createPortraitTexture(src, isPlayer, maxAniso) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = isPlayer ? '#fde68a' : '#fecdd3';
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;

  const img = new Image();
  img.onload = () => {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const crop = isPlayer
      ? { sx: iw * 0.12, sy: ih * 0.04, sw: iw * 0.76, sh: ih * 0.76 }
      : { sx: iw * 0.20, sy: ih * 0.25, sw: iw * 0.60, sh: ih * 0.45 };
    ctx.clearRect(0, 0, 512, 512);
    ctx.filter = 'contrast(1.06) saturate(1.06)';
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 512, 512);
    ctx.filter = 'none';

    const vig = ctx.createRadialGradient(256, 256, 178, 256, 256, 256);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(28,25,23,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 512, 512);
    tex.needsUpdate = true;
  };
  img.src = src;
  return tex;
}

export class ArchitecturalStackRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.bgColor = new THREE.Color(0xf4efe6);
    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(0xf4efe6, 24, 52);

    this.scene.environment = createGalleryEnv(this.renderer);

    // True Orthographic Isometric Architectural Camera
    this.frustumBase = 9.2;
    this.currentZoom = 1.0;
    this.camTargetY = 1.1;
    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    this.camOffset = new THREE.Vector3(14, 12.2, 14);
    this.camera.position.set(this.camOffset.x, this.camTargetY + this.camOffset.y, this.camOffset.z);
    this.camera.lookAt(0, this.camTargetY, 0);

    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.portraits = {
      normal: createPortraitTexture('assets/carter-normal.jpg', true, this.maxAniso),
      white: createPortraitTexture('assets/carter-white.jpg', false, this.maxAniso)
    };

    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.shardGeo = new THREE.OctahedronGeometry(0.08, 0);
    this.shardMat = new THREE.MeshPhysicalMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      metalness: 0.65,
      roughness: 0.12,
      clearcoat: 1
    });

    this.setupLights();
    this.buildFoundation();
    this.buildMedallions();
    this.buildAmbientMotes();

    this.placedGroup = new THREE.Group();
    this.scene.add(this.placedGroup);

    this.debrisGroup = new THREE.Group();
    this.scene.add(this.debrisGroup);

    this.placedMeshes = [];
    this.debrisMeshes = new Map();
    this.halos = [];
    this.shards = [];

    // Active gliding slab mesh
    this.activeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe59c85,
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.72,
      clearcoatRoughness: 0.12
    });
    this.activeMesh = new THREE.Mesh(this.unitBox, this.activeMat);
    this.activeMesh.castShadow = true;
    this.activeMesh.receiveShadow = true;
    this.activeMesh.visible = false;
    this.scene.add(this.activeMesh);

    this.crownHop = 0;
    this.crownPos = new THREE.Vector3(0, 1.05, 0);
    this._tmpColor = new THREE.Color();
    this._tmpBg = new THREE.Color();

    this.resize();
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xfffdf8, 0xc9bfb0, 0.72);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff7ea, 1.42);
    this.keyLight.position.set(10, 18, 7);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 48;
    const d = 10;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.radius = 2.6;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rim = new THREE.DirectionalLight(0xdbeafe, 0.56);
    rim.position.set(-10, 8, -9);
    this.scene.add(rim);
  }

  buildFoundation() {
    // Tall sunlit travertine-limestone monolith descending into morning mist
    const plinthH = 14;
    const plinthMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6dfd3,
      roughness: 0.34,
      metalness: 0.04,
      clearcoat: 0.35
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(BASE_SIZE, plinthH, BASE_SIZE), plinthMat);
    plinth.position.set(0, -plinthH * 0.5 - SLAB_H * 0.5, 0);
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    this.scene.add(plinth);

    // Subtle 18k champagne-gold collar framing floor 0 seam
    const goldTrim = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_SIZE + 0.08, 0.06, BASE_SIZE + 0.08),
      new THREE.MeshPhysicalMaterial({ color: 0xdba94e, metalness: 0.94, roughness: 0.16, clearcoat: 0.8 })
    );
    goldTrim.position.set(0, -SLAB_H * 0.5, 0);
    this.scene.add(goldTrim);
  }

  createCoinMedallion(isPlayer) {
    const group = new THREE.Group();
    const r = isPlayer ? 0.56 : 0.42;
    const rimMat = new THREE.MeshPhysicalMaterial({
      color: isPlayer ? 0xdba94e : 0xe11d48,
      metalness: 0.92,
      roughness: 0.15,
      clearcoat: 1.0
    });

    const coin = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.13, 40), rimMat);
    coin.rotation.x = Math.PI * 0.5;
    coin.castShadow = true;
    group.add(coin);

    const faceMat = new THREE.MeshStandardMaterial({
      map: isPlayer ? this.portraits.normal : this.portraits.white,
      roughness: 0.3,
      metalness: 0.02
    });
    const front = new THREE.Mesh(new THREE.CircleGeometry(r * 0.87, 40), faceMat);
    front.position.z = 0.07;
    group.add(front);

    const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.87, 40), faceMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.07;
    group.add(back);

    return group;
  }

  buildMedallions() {
    // CarterPCs floating golden crown emblem hovering above top slab
    this.crownGroup = new THREE.Group();
    this.crownCoin = this.createCoinMedallion(true);
    this.crownCoin.rotation.y = Math.PI * 0.25;
    this.crownGroup.add(this.crownCoin);
    this.scene.add(this.crownGroup);

    // White CarterPCs Personal Best altitude marker hovering beside the monument
    this.bestBeacon = new THREE.Group();
    this.bestCoin = this.createCoinMedallion(false);
    this.bestCoin.rotation.y = Math.PI * 0.25;
    this.bestBeacon.add(this.bestCoin);

    const rod = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.028, 0.028),
      new THREE.MeshPhysicalMaterial({ color: 0xe11d48, metalness: 0.85, roughness: 0.2 })
    );
    rod.position.set(-0.95, 0, 0);
    this.bestBeacon.add(rod);
    this.bestBeacon.visible = false;
    this.scene.add(this.bestBeacon);
  }

  buildAmbientMotes() {
    const count = 48;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = Math.random() * 14 - 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdba94e,
      size: 0.09,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });
    this.motes = new THREE.Points(geo, mat);
    this.scene.add(this.motes);
  }

  createSlabMesh(slab) {
    const col = sampleSlabColor(slab.colorIndex, new THREE.Color());
    const mat = new THREE.MeshPhysicalMaterial({
      color: col,
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 0.68,
      clearcoatRoughness: 0.14
    });
    const mesh = new THREE.Mesh(this.unitBox, mat);
    mesh.scale.set(slab.w, SLAB_H, slab.d);
    mesh.position.set(slab.x, slab.y, slab.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  spawnPerfectHalo(slab, expanded) {
    // Crisp glowing golden architectural frame expanding cleanly from the slab seam
    const group = new THREE.Group();
    const color = expanded ? 0xd97706 : 0xf59e0b;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const t = expanded ? 0.1 : 0.065;
    const hw = slab.w * 0.5;
    const hd = slab.d * 0.5;
    const bars = [
      [slab.w + t * 2, t, 0, -hd - t * 0.5],
      [slab.w + t * 2, t, 0, hd + t * 0.5],
      [t, slab.d, -hw - t * 0.5, 0],
      [t, slab.d, hw + t * 0.5, 0]
    ];
    for (const [bw, bd, ox, oz] of bars) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), mat);
      m.rotation.x = -Math.PI * 0.5;
      m.position.set(ox, 0, oz);
      group.add(m);
    }
    group.position.set(slab.x, slab.y - SLAB_H * 0.46, slab.z);
    this.scene.add(group);
    this.halos.push({ group, mat, life: 0.52, maxLife: 0.52, maxGrow: expanded ? 0.42 : 0.24 });

    // Golden ceramic sparkle shards bursting around the corners
    const count = expanded ? 16 : 9;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.position.set(slab.x + Math.cos(a) * hw * 0.9, slab.y, slab.z + Math.sin(a) * hd * 0.9);
      this.scene.add(m);
      this.shards.push({
        mesh: m,
        vx: Math.cos(a) * (1.8 + Math.random() * 1.4),
        vy: 1.6 + Math.random() * 1.6,
        vz: Math.sin(a) * (1.8 + Math.random() * 1.4),
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8
      });
    }
  }

  clearSceneRun() {
    for (const m of this.placedMeshes) {
      this.placedGroup.remove(m);
      m.material.dispose();
    }
    this.placedMeshes = [];
    for (const m of this.debrisMeshes.values()) {
      this.debrisGroup.remove(m);
      m.material.dispose();
    }
    this.debrisMeshes.clear();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.updateCameraFrustum();
  }

  updateCameraFrustum() {
    const aspect = this.aspect || (window.innerWidth / window.innerHeight);
    const viewH = (this.frustumBase * (aspect < 0.85 ? 1.18 : 1.0)) / this.currentZoom;
    const viewW = viewH * aspect;
    this.camera.left = -viewW * 0.5;
    this.camera.right = viewW * 0.5;
    this.camera.top = viewH * 0.5;
    this.camera.bottom = -viewH * 0.5;
    this.camera.updateProjectionMatrix();
  }

  render(state, dt, reducedMotion = false) {
    // 1. Handle FX events
    while (state.fxEvents.length > 0) {
      const fx = state.fxEvents.shift();
      if (fx.type === 'reset') {
        this.clearSceneRun();
      } else if (fx.type === 'perfect') {
        this.spawnPerfectHalo(fx.slab, fx.expanded);
        this.crownHop = 1;
      } else if (fx.type === 'slice') {
        this.crownHop = 1;
      }
    }

    // 2. Sync placed stack meshes incrementally (zero rebuild churn!)
    if (this.placedMeshes.length > state.stack.length) {
      this.clearSceneRun();
    }
    while (this.placedMeshes.length < state.stack.length) {
      const slab = state.stack[this.placedMeshes.length];
      const mesh = this.createSlabMesh(slab);
      this.placedGroup.add(mesh);
      this.placedMeshes.push(mesh);
    }

    // 3. Sync active gliding slab
    if (state.active) {
      this.activeMesh.visible = true;
      this.activeMesh.scale.set(state.active.w, SLAB_H, state.active.d);
      this.activeMesh.position.set(state.active.x, state.active.y, state.active.z);
      sampleSlabColor(state.active.colorIndex, this.activeMat.color);
    } else {
      this.activeMesh.visible = false;
    }

    // 4. Sync sliced falling debris with 3D tumble rotation
    const alive = new Set(state.debris);
    for (const [piece, mesh] of this.debrisMeshes.entries()) {
      if (!alive.has(piece)) {
        this.debrisGroup.remove(mesh);
        mesh.material.dispose();
        this.debrisMeshes.delete(piece);
      }
    }
    for (const piece of state.debris) {
      let mesh = this.debrisMeshes.get(piece);
      if (!mesh) {
        mesh = this.createSlabMesh(piece);
        this.debrisGroup.add(mesh);
        this.debrisMeshes.set(piece, mesh);
      }
      mesh.position.set(piece.x, piece.y, piece.z);
      if (!reducedMotion) {
        mesh.rotation.x += piece.rx * dt;
        mesh.rotation.z += piece.rz * dt;
      }
    }

    // 5. Animate floating CarterPCs crown medallion & White CarterPCs Best marker
    const topSlab = state.stack[state.stack.length - 1];
    if (this.crownHop > 0) this.crownHop = Math.max(0, this.crownHop - dt * 4.2);
    const bob = reducedMotion ? 0 : Math.sin(state.time * 2.8) * 0.08;
    const hopArc = reducedMotion ? 0 : Math.sin(this.crownHop * Math.PI) * 0.48;
    const targetCrownY = topSlab.y + SLAB_H * 0.5 + 0.92 + bob + hopArc;
    const lerpRate = Math.min(1, dt * 11);
    this.crownPos.x += (topSlab.x - this.crownPos.x) * lerpRate;
    this.crownPos.y += (targetCrownY - this.crownPos.y) * lerpRate;
    this.crownPos.z += (topSlab.z - this.crownPos.z) * lerpRate;
    this.crownGroup.position.copy(this.crownPos);
    if (!reducedMotion) {
      this.crownCoin.rotation.y = Math.PI * 0.25 + Math.sin(state.time * 1.4) * 0.28;
    }

    if (state.best >= 3) {
      this.bestBeacon.visible = true;
      const bestY = state.best * SLAB_H;
      this.bestBeacon.position.set(BASE_SIZE * 0.5 + 1.55, bestY + (reducedMotion ? 0 : Math.sin(state.time * 2.2) * 0.06), 0);
    } else {
      this.bestBeacon.visible = false;
    }

    // 6. Step perfect halos & sparkle shards
    for (let i = this.halos.length - 1; i >= 0; i--) {
      const h = this.halos[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.scene.remove(h.group);
        h.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        h.mat.dispose();
        this.halos.splice(i, 1);
        continue;
      }
      const t = 1 - h.life / h.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      h.group.scale.set(1 + ease * h.maxGrow, 1, 1 + ease * h.maxGrow);
      h.mat.opacity = (1 - t) * 0.85;
    }

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shards.splice(i, 1);
        continue;
      }
      s.vy -= 6.5 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += dt * 7;
      s.mesh.rotation.y += dt * 9;
      s.mesh.scale.setScalar(Math.max(0.01, s.life / s.maxLife));
    }

    // 7. Soft sky hue shift as altitude rises + smooth camera tracking (with full-tower Game Over reveal!)
    sampleSlabColor(state.score, this._tmpColor);
    this._tmpBg.setHex(0xf7f4ee).lerp(this._tmpColor, 0.14);
    this.bgColor.lerp(this._tmpBg, Math.min(1, dt * 1.8));
    this.scene.fog.color.copy(this.bgColor);

    const towerTopY = topSlab.y;
    let desiredCamY = towerTopY + 1.1;
    let desiredZoom = 1.0;

    if (state.phase === 'over' && state.score >= 3) {
      // Monument zoom-out reveal showing the entire architectural tower!
      desiredCamY = towerTopY * 0.52 + 0.6;
      const towerHeight = towerTopY + 3.6;
      desiredZoom = Math.max(0.36, Math.min(0.95, 7.2 / Math.max(7.2, towerHeight)));
    }

    const camEase = Math.min(1, dt * (state.phase === 'over' ? 3.2 : 5.5));
    this.camTargetY += (desiredCamY - this.camTargetY) * camEase;
    this.currentZoom += (desiredZoom - this.currentZoom) * camEase;
    this.updateCameraFrustum();

    this.camera.position.set(this.camOffset.x, this.camTargetY + this.camOffset.y, this.camOffset.z);
    this.camera.lookAt(0, this.camTargetY, 0);

    // Move sunlit shadow frustum upward alongside tower top
    this.keyLight.position.set(10, this.camTargetY + 18, 7);
    this.keyLight.target.position.set(0, this.camTargetY, 0);

    // Drift ambient dust motes around current altitude
    this.motes.position.y = this.camTargetY - 4;
    if (!reducedMotion) this.motes.rotation.y += dt * 0.04;

    this.renderer.render(this.scene, this.camera);
  }
}
