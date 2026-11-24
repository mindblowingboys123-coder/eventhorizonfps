// EVENT HORIZON - 3D MULTI-LANDSCAPE ENVIRONMENT BUILDER
import * as THREE from 'three';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.currentMapGroup = null;
    this.colliders = [];
    this.animatedObjects = [];
    this.currentMapId = 'singularity';
  }

  loadMap(mapId = 'singularity') {
    // Clear previous map
    if (this.currentMapGroup) {
      this.scene.remove(this.currentMapGroup);
      this.currentMapGroup = null;
    }
    this.colliders = [];
    this.colliders.jumpPads = [];
    this.animatedObjects = [];
    this.currentMapId = mapId;

    const mapGroup = new THREE.Group();
    let spawnPoints = [];

    switch (mapId) {
      case 'station':
        spawnPoints = this.buildAegisStation(mapGroup);
        break;
      case 'mars':
        spawnPoints = this.buildMarsOutpost(mapGroup);
        break;
      case 'halo':
        spawnPoints = this.buildHaloCity(mapGroup);
        break;
      case 'shattered':
        spawnPoints = this.buildShatteredFloor(mapGroup);
        break;
      case 'cyber':
        spawnPoints = this.buildCyberVoid(mapGroup);
        break;
      case 'singularity':
      default:
        spawnPoints = this.buildSingularityCore(mapGroup);
        break;
    }

    this.currentSpawns = spawnPoints;
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
    this.createPlatform(group, 0, 8, 45, 22, 2.5, 22, platformMat, metalTrimMat);
    this.createPlatform(group, 0, 8, -45, 22, 2.5, 22, platformMat, metalTrimMat);

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
  // 5. SHATTERED FLOOR (SINGULARITY COLLAPSE MAP)
  // ========================================================
  buildShatteredFloor(group) {
    this.addStarfield(group, 2500, 0xffb3a0);
    this.addBlackHole(group);

    const slabMat = new THREE.MeshStandardMaterial({ color: 0x3b2a3d, roughness: 0.7, metalness: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    const padColor = 0xffb3a0;

    // Static core island in the middle, with two jump pads
    this.createPlatform(group, 0, 0, 0, 12, 3, 12, slabMat, glowMat);
    this.createJumpPad(group, 4, 1.66, 4, padColor);
    this.createJumpPad(group, -4, 1.66, -4, padColor);

    // Shattered pieces of floor that orbit the core and bob up and down
    const TILE_COUNT = 10;
    const tileH = 1.2;
    for (let i = 0; i < TILE_COUNT; i++) {
      const w = 6 + (i % 3) * 1.5;
      const d = 5 + (i % 2) * 2;
      const size = new THREE.Vector3(w, tileH, d);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, tileH, d), slabMat);
      group.add(mesh);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), glowMat);
      edge.position.set(0, tileH / 2 + 0.02, 0);
      mesh.add(edge);

      // Three orbit rings; the inner ring is the one with jump pads
      const ring = i % 3;
      const radius = 16 + ring * 8;
      const dir = i % 2 ? 1 : -1;
      const state = { angle: (i / TILE_COUNT) * Math.PI * 2, t: i * 0.7 };
      const speed = dir * (3 / radius);            // about 3 units per second around the orbit
      const baseY = 4 + ring * 2.5;
      const bob = 1.2 + (i % 2) * 0.6;
      const place = (s) => new THREE.Vector3(
        Math.cos(s.angle) * radius,
        baseY + Math.sin(s.t * 0.6) * bob,
        Math.sin(s.angle) * radius
      );

      mesh.position.copy(place(state));
      const box = new THREE.Box3();
      box.setFromCenterAndSize(mesh.position, size);
      box.userData = { delta: { x: 0, y: 0, z: 0 } };
      this.colliders.push(box);

      const prev = mesh.position.clone();
      this.animatedObjects.push({
        update: (dt) => {
          state.angle += speed * dt;
          state.t += dt;
          mesh.position.copy(place(state));
          box.setFromCenterAndSize(mesh.position, size);
          // How far the tile moved this frame, so the controller can carry a player standing on it
          box.userData.delta = {
            x: mesh.position.x - prev.x,
            y: mesh.position.y - prev.y,
            z: mesh.position.z - prev.z
          };
          prev.copy(mesh.position);
        }
      });

      // Some tiles carry a jump pad that moves with them
      if (ring === 0) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.3, 16), new THREE.MeshBasicMaterial({ color: padColor }));
        pad.position.set(0, tileH / 2 + 0.16, 0);
        mesh.add(pad);
        this.colliders.jumpPads.push({
          get x() { return mesh.position.x; },
          get y() { return mesh.position.y + tileH / 2 + 0.31; },
          get z() { return mesh.position.z; },
          r: 1.5
        });
      }
    }

    // HIGH VISIBILITY LIGHTING
    const hemi = new THREE.HemisphereLight(0xffe0d0, 0x442233, 2.4);
    const amb = new THREE.AmbientLight(0xffffff, 2.0);
    const dir1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dir1.position.set(30, 50, 30);
    group.add(hemi, amb, dir1);

    return [
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(-4, 3, -4)
    ];
  }

  addBlackHole(group) {
    const blackHoleGroup = new THREE.Group();
    blackHoleGroup.position.set(0, -60, 0);
    blackHoleGroup.add(new THREE.Mesh(new THREE.SphereGeometry(35, 32, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })));

    const diskGeo = new THREE.RingGeometry(38, 90, 64);
    diskGeo.rotateX(Math.PI / 2);
    const disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({
      color: 0xff3355, side: THREE.DoubleSide, transparent: true, opacity: 0.7
    }));
    blackHoleGroup.add(disk);
    group.add(blackHoleGroup);
    this.animatedObjects.push({ update: (dt) => { disk.rotation.y += dt * 0.4; } });
  }

  // Expanding fireball from the black hole
  playBlast() {
    if (!this.currentMapGroup) return;
    const geo = new THREE.SphereGeometry(1, 24, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -60, 0);
    const group = this.currentMapGroup;
    group.add(mesh);
    let t = 0;
    const obj = {
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 1.6);
        mesh.scale.setScalar(1 + k * 130);
        mat.opacity = 0.9 * (1 - k);
        if (k >= 1) {
          group.remove(mesh);
          geo.dispose();
          mat.dispose();
          obj.done = true;
        }
      }
    };
    this.animatedObjects.push(obj);
  }

  // ========================================================
  // 6. HALO CITY (buildings on both banks, a shallow river through the middle)
  // ========================================================
  buildHaloCity(group) {
    this.addStarfield(group, 1500, 0xc8b8ff);

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.8, metalness: 0.1 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.9 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x4b5573, roughness: 0.6, metalness: 0.4 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3146, roughness: 0.5, metalness: 0.5 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x9d4edd });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1d6fb8, transparent: true, opacity: 0.7, roughness: 0.2, metalness: 0.1 });

    // Banks: solid ground on both sides of the river
    this.createPlatform(group, 0, -0.5, -65, 240, 1, 110, groundMat);
    this.createPlatform(group, 0, -0.5, 65, 240, 1, 110, groundMat);

    // River: a shallow channel between the banks that you can wade through
    this.createPlatform(group, 0, -0.375, 0, 240, 0.25, 20, bedMat);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 20), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.15, 0);
    group.add(water);
    // Wading volume: controls.js slows the player inside it
    this.colliders.water = [new THREE.Box3(new THREE.Vector3(-120, -0.5, -10), new THREE.Vector3(120, -0.1, 10))];

    // Two low bridges across the river (deck top is flush with the banks, so you walk onto them)
    this.createPlatform(group, -30, 0, 0, 6, 0.5, 24, deckMat, neonMat);
    this.createPlatform(group, 30, 0, 0, 6, 0.5, 24, deckMat, neonMat);

    // Buildings along both banks. Each one is hollow with a doorway facing the river,
    // so you can walk inside. Its roof can be climbed onto.
    const xs = [-90, -70, -50, -30, -10, 10, 30, 50, 70, 90];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1f2637, roughness: 0.7, metalness: 0.3 });
    xs.forEach((x, i) => {
      const hN = 10 + ((i * 7) % 5) * 4;
      const hS = 10 + ((i * 3 + 2) % 5) * 4;
      // North bank: door faces +z (toward the river). South bank: door faces -z.
      // Each building gets one of three staircase styles, so no two look the same
      this.buildHaloBuilding(group, x, -34, +1, hN, wallMat, neonMat, roofMat, i);
      this.buildHaloBuilding(group, x, 34, -1, hS, wallMat, neonMat, roofMat, i + 1);
    });

    // Jump pads: one in front of every building door, plus two on the banks
    xs.forEach((x) => {
      this.createJumpPad(group, x, 0.15, -24, 0x9d4edd);
      this.createJumpPad(group, x, 0.15, 24, 0x9d4edd);
    });
    this.createJumpPad(group, -60, 0.15, -18, 0x9d4edd);
    this.createJumpPad(group, 60, 0.15, 18, 0x9d4edd);

    // A ring of light high above the city
    const ring = new THREE.Mesh(new THREE.TorusGeometry(260, 5, 16, 160), new THREE.MeshBasicMaterial({ color: 0x9d4edd }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 150, 0);
    group.add(ring);

    // HIGH VISIBILITY LIGHTING
    const hemi = new THREE.HemisphereLight(0xc8b8ff, 0x332244, 2.4);
    const amb = new THREE.AmbientLight(0xffffff, 1.8);
    const dir1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dir1.position.set(30, 50, 30);
    group.add(hemi, amb, dir1);

    return [
      new THREE.Vector3(-100, 2, -60),
      new THREE.Vector3(100, 2, 60),
      new THREE.Vector3(-100, 2, 60),
      new THREE.Vector3(100, 2, -60)
    ];
  }

  // A hollow 16x14 building with a 4-wide doorway in its front wall. facing = +1 or -1
  // is the direction the door faces (along z). Walls, lintel and roof are all solid colliders,
  // so you walk in through the door and the side walls keep you inside.
  buildHaloBuilding(group, x, z, facing, h, wallMat, neonMat, roofMat, style = 0) {
    const w = 16, d = 14, t = 0.8, doorW = 4;
    const hw = w / 2, hd = d / 2;
    const frontZ = z + facing * (hd - t / 2);
    const backZ = z - facing * (hd - t / 2);

    // Back wall and both side walls
    this.createWall(group, x, h / 2, backZ, w, h, t, wallMat);
    this.createWall(group, x - hw + t / 2, h / 2, z, t, h, d, wallMat);
    this.createWall(group, x + hw - t / 2, h / 2, z, t, h, d, wallMat);

    // Front wall, split around the doorway
    const pieceW = (w - doorW) / 2;
    const pieceX = doorW / 2 + pieceW / 2;
    this.createWall(group, x - pieceX, h / 2, frontZ, pieceW, h, t, wallMat);
    this.createWall(group, x + pieceX, h / 2, frontZ, pieceW, h, t, wallMat);
    // Lintel above the doorway (the top 2 units of the front wall)
    this.createWall(group, x, h - 1, frontZ, doorW, 2, t, wallMat);

    // Roof: solid, you can stand on it
    this.createWall(group, x, h + 0.3, z, w, 0.6, d, roofMat);

    // Neon strip on the inside of the back wall, so the interior is readable
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 3, 0.3, 0.1), neonMat);
    strip.position.set(x, 3.5, backZ + facing * (t / 2 + 0.06));
    group.add(strip);

    this.buildHaloStairs(group, x, z, facing, h + 0.6, style);
  }

  // Stairs from the ground up to the roof (topY). Three styles:
  //   0: narrow run straight out from the back wall, purple
  //   1: wide run straight out from the back wall, cyan
  //   2: narrow run in the alley beside the building, orange
  // Each step is 1 unit deep and rises by at most 0.6, so the controller can walk up them.
  buildHaloStairs(group, x, z, f, topY, style) {
    const hd = 7;        // half the building depth
    const tread = 1.0;   // depth of one step
    const n = Math.ceil(topY / 0.6);
    const rise = topY / n;
    const frontFace = z + f * hd;
    const backFace = z - f * hd;

    const styles = [
      { width: 3, color: 0x9d4edd, alley: false },
      { width: 6, color: 0x00f0ff, alley: false },
      { width: 2.5, color: 0xff6b35, alley: true }
    ];
    const s = styles[((style % 3) + 3) % 3];
    const stepMat = new THREE.MeshStandardMaterial({
      color: s.color, emissive: s.color, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.4
    });

    // The run goes from low (far out) to high (at the building). The top step touches the
    // roof: the back wall for back runs, the side wall for alley runs.
    const cx = s.alley ? x + 8 + s.width / 2 : x;
    const edgeZ = s.alley ? frontFace : backFace;
    const startZ = edgeZ - f * n * tread;

    for (let k = 0; k < n; k++) {
      const top = (k + 1) * rise;
      const zc = startZ + f * (k + 0.5) * tread;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.width, top, tread), stepMat);
      mesh.position.set(cx, top / 2, zc);
      group.add(mesh);
      this.addBoxCollider(cx, top / 2, zc, s.width, top, tread);
    }
  }

  // Helper creation methods
  createPlatform(parent, x, y, z, w, h, d, mat, trimMat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    if (trimMat) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), trimMat);
      trim.position.set(x, y + h / 2 - 0.15, z);
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
    this.colliders.jumpPads.push({ x, y: y + 0.15, z, r: 1.5 });
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
    this.animatedObjects = this.animatedObjects.filter((o) => !o.done);
  }
}

// Random spawn that is as far as possible from living pilots, so nobody can wait next to a spawn.
// Picks at random among the safest half of the spawn points, so it is not predictable.
export function pickSafeSpawn(spawns, foePositions, random = Math.random) {
  if (!spawns || spawns.length === 0) return { x: 0, y: 4, z: 0 };
  const scored = spawns.map((s) => {
    let nearest = Infinity;
    for (const f of foePositions) nearest = Math.min(nearest, Math.hypot(f.x - s.x, f.z - s.z));
    return { s, nearest };
  });
  scored.sort((a, b) => b.nearest - a.nearest);
  const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
  return pool[Math.floor(random() * pool.length)].s;
}
