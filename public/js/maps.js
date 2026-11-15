// EVENT HORIZON - 3D MULTI-LANDSCAPE ENVIRONMENT BUILDER
import * as THREE from 'three';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.currentMapGroup = null;
    this.colliders = [];
    this.animatedObjects = [];
    this.jumpPads = [];
    this.currentMapId = 'singularity';
  }

  loadMap(mapId = 'singularity') {
    // Clear previous map
    if (this.currentMapGroup) {
      this.scene.remove(this.currentMapGroup);
      this.currentMapGroup = null;
    }
    this.colliders = [];
    this.jumpPads = [];
    this.animatedObjects = [];
    this.currentMapId = mapId;
    this.scene.fog = null;
    this.scene.background = null;

    const mapGroup = new THREE.Group();
    let spawnPoints = [];

    switch (mapId) {
      case 'station':
        spawnPoints = this.buildAegisStation(mapGroup);
        break;
      case 'mars':
        spawnPoints = this.buildMarsOutpost(mapGroup);
        break;
      case 'cyber':
        spawnPoints = this.buildCyberVoid(mapGroup);
        break;
      case 'ice':
        spawnPoints = this.buildCryoMoon(mapGroup);
        break;
      case 'singularity':
      default:
        spawnPoints = this.buildSingularityCore(mapGroup);
        break;
    }

    // Hand jump pads to the controls through the colliders array
    this.colliders.jumpPads = this.jumpPads;

    this.scene.add(mapGroup);
    this.currentMapGroup = mapGroup;

    return {
      colliders: this.colliders,
      spawnPoints: spawnPoints
    };
  }

  // ========================================================
  // 1. THE SINGULARITY CORE (EVENT HORIZON BLACK HOLE)
  // ========================================================
  buildSingularityCore(group) {
    // Starfield sky
    this.addStarfield(group, 2500, 0xa0c4ff);

    // CENTRAL EVENT HORIZON BLACK HOLE
    const blackHoleGroup = new THREE.Group();
    blackHoleGroup.position.set(0, -60, 0);

    // Pure black sphere of the singularity
    const singularityGeo = new THREE.SphereGeometry(35, 32, 32);
    const singularityMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const singularityMesh = new THREE.Mesh(singularityGeo, singularityMat);
    blackHoleGroup.add(singularityMesh);

    // Glowing Accretion Disk (Inner Ring)
    const diskGeo = new THREE.RingGeometry(38, 90, 64);
    diskGeo.rotateX(Math.PI / 2);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const diskMesh = new THREE.Mesh(diskGeo, diskMat);
    blackHoleGroup.add(diskMesh);

    // Outer Warped Accretion Ring (Orange & Violet)
    const outerDiskGeo = new THREE.RingGeometry(55, 140, 64);
    outerDiskGeo.rotateX(Math.PI / 2.3);
    const outerDiskMat = new THREE.MeshBasicMaterial({
      color: 0x9d4edd,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    const outerDiskMesh = new THREE.Mesh(outerDiskGeo, outerDiskMat);
    blackHoleGroup.add(outerDiskMesh);

    group.add(blackHoleGroup);
    this.animatedObjects.push({
      update: (delta) => {
        diskMesh.rotation.y += delta * 0.4;
        outerDiskMesh.rotation.y -= delta * 0.25;
      }
    });

    // FLOATING ASTEROID PLATFORMS
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x3b4a6b,
      roughness: 0.6,
      metalness: 0.2
    });
    const metalTrimMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.7,
      roughness: 0.3
    });
    const energyBridgeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });

    // Center Main Platform
    this.createPlatform(group, 0, 0, 0, 36, 3, 36, platformMat, metalTrimMat);

    // Energy Pillars on center platform
    this.createEnergyPillar(group, 14, 1.5, 14, 0x00f0ff);
    this.createEnergyPillar(group, -14, 1.5, 14, 0x00f0ff);
    this.createEnergyPillar(group, 14, 1.5, -14, 0x00f0ff);
    this.createEnergyPillar(group, -14, 1.5, -14, 0x00f0ff);

    // 4 Satellite Outer Platforms
    this.createPlatform(group, 45, 5, 0, 22, 2.5, 22, platformMat, metalTrimMat);
    this.createPlatform(group, -45, 5, 0, 22, 2.5, 22, platformMat, metalTrimMat);
    this.createPlatform(group, 0, 7, 45, 22, 2.5, 22, platformMat, metalTrimMat);
    this.createPlatform(group, 0, 7, -45, 22, 2.5, 22, platformMat, metalTrimMat);

    // Glowing Holographic Bridges connecting center to outer platforms
    this.createBridge(group, 27, 2.5, 0, 18, 0.2, 6, energyBridgeMat);
    this.createBridge(group, -27, 2.5, 0, 18, 0.2, 6, energyBridgeMat);
    this.createBridge(group, 0, 4, 27, 6, 0.2, 18, energyBridgeMat);
    this.createBridge(group, 0, 4, -27, 6, 0.2, 18, energyBridgeMat);

    // Jump Pads (Propels players)
    this.createJumpPad(group, 0, 1.6, 12, 0x00f0ff);
    this.createJumpPad(group, 0, 1.6, -12, 0x00f0ff);

    // HIGH VISIBILITY LIGHTING
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445577, 2.6);
    const amb = new THREE.AmbientLight(0xffffff, 2.2);
    const dir1 = new THREE.DirectionalLight(0xffffff, 3.5);
    dir1.position.set(30, 50, 30);
    const dir2 = new THREE.DirectionalLight(0x00f0ff, 2.0);
    dir2.position.set(-30, 40, -30);
    group.add(hemi, amb, dir1, dir2);

    return [
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(45, 7, 0),
      new THREE.Vector3(-45, 7, 0),
      new THREE.Vector3(0, 10, 45),
      new THREE.Vector3(0, 10, -45)
    ];
  }

  // ========================================================
  // 2. AEGIS SPACE STATION (SECTOR 7)
  // ========================================================
  buildAegisStation(group) {
    this.addStarfield(group, 1500, 0x48cae4);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.6 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const neonOrange = new THREE.MeshBasicMaterial({ color: 0xff6b35 });

    // Central Hangar Floor
    this.createPlatform(group, 0, 0, 0, 50, 2, 50, floorMat, wallMat);

    // Outer Perimeter Station Walls
    this.createWall(group, 0, 5, 25, 50, 10, 2, wallMat);
    this.createWall(group, 0, 5, -25, 50, 10, 2, wallMat);
    this.createWall(group, 25, 5, 0, 2, 10, 50, wallMat);
    this.createWall(group, -25, 5, 0, 2, 10, 50, wallMat);

    // Glowing wall strip lights
    const strip1 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.4, 0.2), neonCyan);
    strip1.position.set(0, 6, 24);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.4, 0.2), neonCyan);
    strip2.position.set(0, 6, -24);
    group.add(strip1, strip2);

    // Cargo Crates & Cover Barriers
    this.createCoverCrate(group, 8, 2, 6, 4, 3, 4, neonCyan);
    this.createCoverCrate(group, -8, 2, -6, 4, 3, 4, neonCyan);
    this.createCoverCrate(group, -12, 2, 10, 5, 3, 3, neonOrange);
    this.createCoverCrate(group, 12, 2, -10, 5, 3, 3, neonOrange);

    // Central Observation Hub Generator
    const genGeo = new THREE.CylinderGeometry(4, 5, 8, 16);
    const genMesh = new THREE.Mesh(genGeo, wallMat);
    genMesh.position.set(0, 5, 0);
    group.add(genMesh);
    this.addBoxCollider(0, 5, 0, 8, 8, 8);

    const genRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.25, 12, 32), neonCyan);
    genRing.rotation.x = Math.PI / 2;
    genRing.position.set(0, 5, 0);
    group.add(genRing);

    this.animatedObjects.push({
      update: (delta) => { genRing.rotation.z += delta * 1.5; }
    });

    // HIGH INTENSITY FLOOD LIGHTING
    const hemi = new THREE.HemisphereLight(0xffffff, 0x475569, 2.8);
    const amb = new THREE.AmbientLight(0xffffff, 2.2);
    const lightCenter = new THREE.PointLight(0xffffff, 4.0, 45);
    lightCenter.position.set(0, 8, 0);
    const light1 = new THREE.PointLight(0x00f0ff, 3.5, 35);
    light1.position.set(15, 8, 15);
    const light2 = new THREE.PointLight(0x00f0ff, 3.5, 35);
    light2.position.set(-15, 8, -15);
    group.add(hemi, amb, lightCenter, light1, light2);

    return [
      new THREE.Vector3(0, 2.5, 16),
      new THREE.Vector3(0, 2.5, -16),
      new THREE.Vector3(16, 2.5, 0),
      new THREE.Vector3(-16, 2.5, 0)
    ];
  }

  // ========================================================
  // 3. MARS RED DUNES OUTPOST
  // ========================================================
  buildMarsOutpost(group) {
    this.scene.fog = new THREE.FogExp2(0xf97316, 0.003);

    const redSandMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.8 });
    const habitatMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.6 });
    const solarPanelMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });

    // Martian terrain base
    this.createPlatform(group, 0, 0, 0, 90, 2, 90, redSandMat, redSandMat);

    // Habitat Terraforming Dome
    const domeGeo = new THREE.SphereGeometry(14, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, habitatMat);
    dome.position.set(-18, 1, -12);
    group.add(dome);
    this.addBoxCollider(-18, 7, -12, 26, 14, 26);

    // Satellite Array Tower
    const towerGeo = new THREE.CylinderGeometry(0.5, 1.5, 24, 8);
    const tower = new THREE.Mesh(towerGeo, habitatMat);
    tower.position.set(22, 12, 18);
    group.add(tower);
    this.addBoxCollider(22, 12, 18, 4, 24, 4);

    const dishGeo = new THREE.SphereGeometry(4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2.5);
    const dish = new THREE.Mesh(dishGeo, habitatMat);
    dish.position.set(22, 24, 18);
    dish.rotation.x = -Math.PI / 3;
    group.add(dish);

    // Solar Panel Banks
    for (let i = -1; i <= 1; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 12), solarPanelMat);
      panel.position.set(16 + i * 8, 3, -15);
      panel.rotation.x = 0.35;
      group.add(panel);
      this.addBoxCollider(16 + i * 8, 3, -15, 6, 3, 12);
    }

    // Rocky Martian Canyons (Barriers)
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const rockGeo = new THREE.DodecahedronGeometry(6 + Math.random() * 4);
      const rock = new THREE.Mesh(rockGeo, redSandMat);
      const rx = Math.cos(ang) * 42;
      const rz = Math.sin(ang) * 42;
      rock.position.set(rx, 4, rz);
      group.add(rock);
      this.addBoxCollider(rx, 4, rz, 10, 10, 10);
    }

    const hemi = new THREE.HemisphereLight(0xffedd5, 0x9a3412, 2.5);
    const amb = new THREE.AmbientLight(0xffffff, 2.2);
    const sun = new THREE.DirectionalLight(0xffeedd, 3.8);
    sun.position.set(30, 45, 10);
    group.add(hemi, amb, sun);

    return [
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(-25, 3, 15),
      new THREE.Vector3(25, 3, -25),
      new THREE.Vector3(5, 3, 28)
    ];
  }

  // ========================================================
  // 4. CYBER VOID ARENA
  // ========================================================
  buildCyberVoid(group) {
    this.addStarfield(group, 2000, 0x00f0ff);

    const darkGridMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.6 });
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const neonPink = new THREE.MeshBasicMaterial({ color: 0xff007f });

    // Multi-tiered cyber arenas
    this.createPlatform(group, 0, 0, 0, 60, 2, 60, darkGridMat, neonCyan);

    // Upper sniper towers
    this.createPlatform(group, 20, 10, 20, 14, 2, 14, darkGridMat, neonPink);
    this.createPlatform(group, -20, 10, -20, 14, 2, 14, darkGridMat, neonPink);
    this.createPlatform(group, 20, 10, -20, 14, 2, 14, darkGridMat, neonPink);
    this.createPlatform(group, -20, 10, 20, 14, 2, 14, darkGridMat, neonPink);

    // Center Elevated Cyber Core
    this.createPlatform(group, 0, 5, 0, 18, 2, 18, darkGridMat, neonCyan);

    // Jump pads leading to upper platforms
    this.createJumpPad(group, 10, 1.5, 10, 0x00f0ff);
    this.createJumpPad(group, -10, 1.5, -10, 0x00f0ff);
    this.createJumpPad(group, 10, 1.5, -10, 0x00f0ff);
    this.createJumpPad(group, -10, 1.5, 10, 0x00f0ff);

    // High intensity cyber arena lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x111827, 2.8);
    const amb = new THREE.AmbientLight(0xffffff, 2.4);
    const p1 = new THREE.PointLight(0x00f0ff, 4.5, 60);
    p1.position.set(0, 12, 0);
    const p2 = new THREE.PointLight(0xff007f, 3.5, 60);
    p2.position.set(0, 6, 0);
    group.add(hemi, amb, p1, p2);

    return [
      new THREE.Vector3(0, 7.5, 0),
      new THREE.Vector3(20, 12.5, 20),
      new THREE.Vector3(-20, 12.5, -20),
      new THREE.Vector3(15, 2.5, 0),
      new THREE.Vector3(-15, 2.5, 0)
    ];
  }

  // ========================================================
  // 5. CRYO MOON (FROZEN GLACIER FIELD)
  // ========================================================
  buildCryoMoon(group) {
    this.scene.background = new THREE.Color(0x0a1a30);
    this.scene.fog = new THREE.FogExp2(0x9fd8ff, 0.006);
    this.addStarfield(group, 1800, 0xd8f3ff);

    const snowMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.85 });
    const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.15, metalness: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x7c8ea6, roughness: 0.4, metalness: 0.6 });

    // Frozen lake (main floor, top surface at y = 1)
    this.createPlatform(group, 0, 0, 0, 130, 2, 130, snowMat, glowMat);

    // Research outpost in the middle (roof top at y = 9, reach it with a jump pad)
    this.createWall(group, 0, 5, 0, 16, 8, 16, hullMat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.3, 16.4), glowMat);
    band.position.set(0, 8.6, 0);
    group.add(band);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 9, 8), hullMat);
    mast.position.set(0, 13.5, 0);
    group.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 12), glowMat);
    beacon.position.set(0, 18.4, 0);
    group.add(beacon);
    this.animatedObjects.push({ update: () => { beacon.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.25); } });

    // Climbable ice shelves
    this.createPlatform(group, -22, 3, 0, 12, 2, 12, iceMat, glowMat);    // top y = 4
    this.createPlatform(group, -22, 6, 14, 10, 2, 10, iceMat, glowMat);   // top y = 7
    this.createPlatform(group, 24, 3, -10, 12, 2, 12, iceMat, glowMat);   // top y = 4
    this.createPlatform(group, 24, 6.5, -24, 10, 2, 10, iceMat, glowMat); // top y = 7.5

    // Ice pillars for cover (fixed positions so every player sees the same map)
    const pillars = [[40, 30], [-40, 30], [-38, -34], [36, 36], [14, -38], [-14, 40], [48, -4], [-50, 6], [0, -52], [8, 50]];
    pillars.forEach(([x, z], i) => {
      const h = 5 + (i % 4) * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3.2), iceMat);
      pillar.position.set(x, 1 + h / 2, z);
      group.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 3.4), glowMat);
      cap.position.set(x, 1 + h - 0.3, z);
      group.add(cap);
      this.addBoxCollider(x, 1 + h / 2, z, 3.2, h, 3.2);
    });

    // Jump pads next to the outpost (launch onto the roof)
    this.createJumpPad(group, 0, 1.15, 14, 0x66e0ff);
    this.createJumpPad(group, 0, 1.15, -14, 0x66e0ff);

    // Falling snow
    const flakeCount = 1400;
    const flakePos = new Float32Array(flakeCount * 3);
    for (let i = 0; i < flakeCount; i++) {
      flakePos[i * 3] = (Math.random() - 0.5) * 140;
      flakePos[i * 3 + 1] = Math.random() * 45;
      flakePos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const flakeGeo = new THREE.BufferGeometry();
    flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
    const snow = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85 }));
    snow.frustumCulled = false;
    group.add(snow);
    this.animatedObjects.push({
      update: (delta) => {
        const arr = flakeGeo.attributes.position.array;
        const t = performance.now() / 1500;
        for (let i = 0; i < flakeCount; i++) {
          arr[i * 3 + 1] -= delta * 4;
          arr[i * 3] += Math.sin(i + t) * delta * 0.6;
          if (arr[i * 3 + 1] < 1) arr[i * 3 + 1] = 45;
        }
        flakeGeo.attributes.position.needsUpdate = true;
      }
    });

    // Aurora ribbons in the sky
    const ribbons = [0x5dffb0, 0x66e0ff, 0xb57bff].map((col, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(260, 34),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      );
      m.position.set(0, 70 + i * 8, -110 - i * 18);
      m.rotation.x = -0.15;
      group.add(m);
      return m;
    });
    let auroraT = 0;
    this.animatedObjects.push({
      update: (delta) => {
        auroraT += delta;
        ribbons.forEach((m, i) => {
          m.position.x = Math.sin(auroraT * 0.12 + i * 2) * 30;
          m.material.opacity = 0.16 + Math.sin(auroraT * 0.6 + i) * 0.07;
        });
      }
    });

    // Cold bright lighting
    const hemi = new THREE.HemisphereLight(0xdff4ff, 0x6b8cae, 2.6);
    const amb = new THREE.AmbientLight(0xffffff, 2.0);
    const sunL = new THREE.DirectionalLight(0xcfe9ff, 3.2);
    sunL.position.set(30, 60, 20);
    const glowL = new THREE.PointLight(0x66e0ff, 3.5, 60);
    glowL.position.set(0, 12, 0);
    group.add(hemi, amb, sunL, glowL);

    return [
      new THREE.Vector3(0, 2.5, 28),
      new THREE.Vector3(28, 2.5, 0),
      new THREE.Vector3(-28, 2.5, 10),
      new THREE.Vector3(0, 2.5, -30)
    ];
  }

  // Helper creation methods
  createPlatform(parent, x, y, z, w, h, d, mat, trimMat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    if (trimMat) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), trimMat);
      trim.position.set(x, y + h / 2 - 0.3, z);
      parent.add(trim);
    }

    this.addBoxCollider(x, y, z, w, h, d);
    return mesh;
  }

  createWall(parent, x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    this.addBoxCollider(x, y, z, w, h, d);
  }

  createBridge(parent, x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    this.addBoxCollider(x, y, z, w, h, d);
  }

  createEnergyPillar(parent, x, y, z, colorHex) {
    const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 12, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, y + 6, z);
    parent.add(p);

    const beamGeo = new THREE.CylinderGeometry(0.2, 0.2, 12, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, y + 6, z);
    parent.add(beam);

    this.addBoxCollider(x, y + 6, z, 2, 12, 2);
  }

  createCoverCrate(parent, x, y, z, w, h, d, neonMat) {
    const crateGeo = new THREE.BoxGeometry(w, h, d);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(x, y, z);
    parent.add(crate);

    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1), neonMat);
    band.position.set(x, y, z);
    parent.add(band);

    this.addBoxCollider(x, y, z, w, h, d);
  }

  createJumpPad(parent, x, y, z, colorHex) {
    const padGeo = new THREE.CylinderGeometry(1.5, 1.8, 0.3, 16);
    const padMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, y, z);
    parent.add(pad);
    this.jumpPads.push({ x, y, z, r: 1.9 });
  }

  addBoxCollider(x, y, z, w, h, d) {
    const halfW = w / 2;
    const halfH = h / 2;
    const halfD = d / 2;
    const box = new THREE.Box3(
      new THREE.Vector3(x - halfW, y - halfH, z - halfD),
      new THREE.Vector3(x + halfW, y + halfH, z + halfD)
    );
    this.colliders.push(box);
  }

  addStarfield(parent, count = 2000, color = 0xffffff) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 600;
      positions[i + 1] = Math.random() * 250 - 50;
      positions[i + 2] = (Math.random() - 0.5) * 600;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ size: 1.5, color: color, transparent: true, opacity: 0.8 });
    const points = new THREE.Points(geo, mat);
    parent.add(points);
  }

  update(delta) {
    for (let i = 0; i < this.animatedObjects.length; i++) {
      this.animatedObjects[i].update(delta);
    }
  }
}
