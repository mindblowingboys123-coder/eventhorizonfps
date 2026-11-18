// EVENT HORIZON - 3D SCI-FI WEAPON SYSTEM & VIEWMODELS
import * as THREE from 'three';

export const WEAPON_DEFS = {
  rifle: {
    id: 'rifle',
    name: 'Plasma Pulse Rifle',
    damage: 24,
    fireRate: 0.12, // seconds between shots
    magSize: 30,
    reserveAmmo: 150,
    reloadTime: 1.5,
    bulletSpeed: 140,
    tracerColor: 0x00f0ff,
    recoilAmount: 0.04,
    description: 'Rapid-cycle cyan energy rifle. Standard military issue for orbital vanguard troops.'
  },
  shotgun: {
    id: 'shotgun',
    name: 'Horizon Scattergun',
    damage: 14, // per pellet (x8 pellets)
    pelletCount: 8,
    spread: 0.08,
    fireRate: 0.75,
    magSize: 8,
    reserveAmmo: 48,
    reloadTime: 2.2,
    bulletSpeed: 110,
    tracerColor: 0xff6b35,
    recoilAmount: 0.12,
    description: 'Devastating close-range thermal shotgun discharging ionized tungsten shards.'
  },
  railgun: {
    id: 'railgun',
    name: 'Singularity Railgun',
    damage: 95,
    fireRate: 1.2,
    magSize: 4,
    reserveAmmo: 20,
    reloadTime: 2.8,
    bulletSpeed: 280,
    tracerColor: 0x9d4edd,
    recoilAmount: 0.18,
    description: 'Hyper-velocity electromagnetic accelerator firing concentrated dark matter slugs.'
  },
  blaster: {
    id: 'blaster',
    name: 'Void Blaster',
    damage: 18,
    fireRate: 0.22,
    magSize: 15,
    reserveAmmo: 999, // infinite backup
    reloadTime: 1.1,
    bulletSpeed: 130,
    tracerColor: 0x00ff88,
    recoilAmount: 0.03,
    description: 'Lightweight sidearm utilizing cold-plasma batteries. Never depletes reserve energy.'
  },
  minigun: {
    id: 'minigun', name: 'Storm Minigun', damage: 14, fireRate: 0.06, magSize: 100, reserveAmmo: 400,
    reloadTime: 3.2, bulletSpeed: 150, tracerColor: 0xffe066, recoilAmount: 0.025, len: 0.7, price: 1200,
    description: 'Spins up a hailstorm of plasma. Eats ammo, shreds everything.'
  },
  mortar: {
    id: 'mortar', name: 'Gravity Mortar', damage: 55, pelletCount: 3, spread: 0.03, fireRate: 1.3, magSize: 4,
    reserveAmmo: 24, reloadTime: 2.6, bulletSpeed: 90, tracerColor: 0x66ff99, recoilAmount: 0.2, len: 0.6, price: 1500,
    description: 'Fires three gravity-bound slugs at once. Slow, heavy, devastating.'
  },
  ghost: {
    id: 'ghost', name: 'Ghost SMG', damage: 9, fireRate: 0.05, magSize: 40, reserveAmmo: 200,
    reloadTime: 1.3, bulletSpeed: 170, tracerColor: 0xd8f3ff, recoilAmount: 0.02, len: 0.4, price: 900,
    description: 'Quiet, fast, and very accurate at close range.'
  },
  eventlance: {
    id: 'eventlance', name: 'Event Lance', damage: 20, fireRate: 1.6, magSize: 2, reserveAmmo: 16,
    reloadTime: 2.4, bulletSpeed: 400, tracerColor: 0xff4fd8, recoilAmount: 0.22, len: 0.9, price: 2500,
    description: 'One clean shot through the horizon. Two shots per magazine.'
  },
  horizen: {
    id: 'horizen', name: "HORIZEN'S FINAL", damage: 50, fireRate: 10, magSize: 1, reserveAmmo: 5,
    reloadTime: 0.1, bulletSpeed: 500, tracerColor: 0xffffff, recoilAmount: 0.3, len: 0.9, price: 0, redeemOnly: true,
    tag: 'THE ONLY WEAPON IN THE MULTIVERSE THAT CAN KILL ANYTHING IN ONE SHOT.',
    description: 'Forged at the edge of the event horizon. Redeem-only legendary.'
  },
  cyberpunk_horizen: {
    id: 'cyberpunk_horizen', name: "Cyberpunk's Secret Horizen", damage: 500, fireRate: 0.1, magSize: 30, reserveAmmo: 150,
    reloadTime: 1.5, bulletSpeed: 150, tracerColor: 0xff2bd6, recoilAmount: 0.04, len: 0.5, price: 0, adminOnly: true,
    description: 'Admin-only prototype forged in a forbidden build. Neon magenta plasma.'
  }
};

export class WeaponManager {
  constructor(camera, scene, soundEngine, authManager = null) {
    this.camera = camera;
    this.scene = scene;
    this.sound = soundEngine;
    this.auth = authManager;

    // Viewmodel root attached to camera
    this.viewmodelRoot = new THREE.Group();
    this.camera.add(this.viewmodelRoot);

    // Active weapon state
    this.currentWeaponId = 'rifle';
    this.weapons = {};
    for (const key in WEAPON_DEFS) {
      this.weapons[key] = {
        ...WEAPON_DEFS[key],
        currentMag: WEAPON_DEFS[key].magSize,
        reserve: WEAPON_DEFS[key].reserveAmmo
      };
    }

    // Active meshes
    this.weaponMeshes = {};
    this.activeMesh = null;

    // Timers & Animations
    this.lastShotTime = 0;
    this.isReloading = false;
    this.reloadProgress = 0;
    this.recoilOffset = new THREE.Vector3();
    this.recoilRot = new THREE.Vector3();
    this.swayTime = 0;

    // Active projectiles / tracers
    this.tracers = [];

    this.createWeaponMeshes();
    this.switchWeapon('rifle');
  }

  createWeaponMeshes() {
    // 1. Plasma Pulse Rifle
    const rifleGroup = new THREE.Group();
    // Body chassis
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.1, 0.42);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.3, metalness: 0.8 });
    const rifleBody = new THREE.Mesh(bodyGeo, darkMat);
    rifleGroup.add(rifleBody);

    // Cyan Neon Conduits
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const conduitGeo = new THREE.BoxGeometry(0.084, 0.02, 0.25);
    const conduit = new THREE.Mesh(conduitGeo, neonMat);
    conduit.position.set(0, 0.03, -0.05);
    rifleGroup.add(conduit);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 12);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, darkMat);
    barrel.position.set(0, 0.02, -0.3);
    rifleGroup.add(barrel);

    // Muzzle tip
    const tipGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12);
    tipGeo.rotateX(Math.PI / 2);
    const muzzleTip = new THREE.Mesh(tipGeo, neonMat);
    muzzleTip.position.set(0, 0.02, -0.42);
    rifleGroup.add(muzzleTip);

    // Holo Sight
    const sightGeo = new THREE.BoxGeometry(0.04, 0.04, 0.06);
    const sight = new THREE.Mesh(sightGeo, neonMat);
    sight.position.set(0, 0.08, 0);
    rifleGroup.add(sight);

    this.weaponMeshes['rifle'] = rifleGroup;
    this.viewmodelRoot.add(rifleGroup);

    // 2. Horizon Scattergun (Shotgun)
    const shotgunGroup = new THREE.Group();
    const sgBodyGeo = new THREE.BoxGeometry(0.1, 0.12, 0.46);
    const sgBody = new THREE.Mesh(sgBodyGeo, darkMat);
    shotgunGroup.add(sgBody);

    const orangeNeon = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
    // Dual Heavy Barrels
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 12).rotateX(Math.PI / 2), darkMat);
    b1.position.set(-0.025, 0.03, -0.34);
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 12).rotateX(Math.PI / 2), darkMat);
    b2.position.set(0.025, 0.03, -0.34);
    shotgunGroup.add(b1, b2);

    const sgVent = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.03, 0.2), orangeNeon);
    sgVent.position.set(0, -0.02, 0);
    shotgunGroup.add(sgVent);

    this.weaponMeshes['shotgun'] = shotgunGroup;
    this.viewmodelRoot.add(shotgunGroup);

    // 3. Singularity Railgun
    const railGroup = new THREE.Group();
    const railBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.58), darkMat);
    railGroup.add(railBody);

    const purpleNeon = new THREE.MeshBasicMaterial({ color: 0x9d4edd });
    // Magnetic rail guides
    const railGuideTop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.42), purpleNeon);
    railGuideTop.position.set(0, 0.06, -0.28);
    const railGuideBot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.42), purpleNeon);
    railGuideBot.position.set(0, -0.06, -0.28);
    railGroup.add(railGuideTop, railGuideBot);

    // Rail Core Sphere
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), purpleNeon);
    coreMesh.position.set(0, 0, 0.05);
    railGroup.add(coreMesh);

    this.weaponMeshes['railgun'] = railGroup;
    this.viewmodelRoot.add(railGroup);

    // 4. Void Blaster (Pistol)
    const blasterGroup = new THREE.Group();
    const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.24), darkMat);
    blasterGroup.add(pBody);

    const greenNeon = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), darkMat);
    pGrip.position.set(0, -0.1, 0.06);
    pGrip.rotation.x = -0.3;
    blasterGroup.add(pGrip);

    const pStripe = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.015, 0.16), greenNeon);
    pStripe.position.set(0, 0.04, -0.02);
    blasterGroup.add(pStripe);

    this.weaponMeshes['blaster'] = blasterGroup;
    this.viewmodelRoot.add(blasterGroup);

    // Generic viewmodels for the newer weapons
    for (const key in WEAPON_DEFS) {
      if (this.weaponMeshes[key]) continue;
      const def = WEAPON_DEFS[key];
      const g = new THREE.Group();
      const len = def.len || 0.5;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, len), darkMat));
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, len * 0.7), new THREE.MeshBasicMaterial({ color: def.tracerColor }));
      glow.position.set(0, 0.07, -len * 0.1);
      g.add(glow);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), new THREE.MeshBasicMaterial({ color: def.tracerColor }));
      tip.rotateX(Math.PI / 2);
      tip.position.set(0, 0.02, -len / 2 - 0.02);
      g.add(tip);
      this.weaponMeshes[key] = g;
      this.viewmodelRoot.add(g);
    }

    // Hide all initially
    for (const key in this.weaponMeshes) {
      this.weaponMeshes[key].visible = false;
    }
  }

  switchWeapon(weaponId) {
    if (!this.weapons[weaponId]) return;
    this.currentWeaponId = weaponId;
    this.isReloading = false;

    for (const key in this.weaponMeshes) {
      this.weaponMeshes[key].visible = (key === weaponId);
    }
    this.activeMesh = this.weaponMeshes[weaponId];

    // Position viewmodel nicely in bottom right of view
    if (weaponId === 'blaster') {
      this.activeMesh.position.set(0.2, -0.18, -0.38);
    } else if (weaponId === 'railgun') {
      this.activeMesh.position.set(0.24, -0.22, -0.48);
    } else {
      this.activeMesh.position.set(0.22, -0.2, -0.44);
    }

    window.dispatchEvent(new CustomEvent('weapon_switched', {
      detail: { weapon: this.weapons[weaponId] }
    }));
  }

  getActiveWeapon() {
    return this.weapons[this.currentWeaponId];
  }

  canShoot() {
    const curTime = performance.now() / 1000;
    const w = this.getActiveWeapon();
    const isInf = this.auth && this.auth.profile && this.auth.profile.infiniteAmmo;
    if (isInf) return true;
    return (
      !this.isReloading &&
      w.currentMag > 0 &&
      curTime - this.lastShotTime >= w.fireRate / (this.fireMultiplier || 1)
    );
  }

  shoot(origin, direction, customTracerColor = null) {
    if (!this.canShoot()) {
      if (this.getActiveWeapon().currentMag <= 0 && !this.isReloading) {
        this.reload();
      }
      return null;
    }

    const curTime = performance.now() / 1000;
    this.lastShotTime = curTime;
    const w = this.getActiveWeapon();
    const isInf = this.auth && this.auth.profile && this.auth.profile.infiniteAmmo;
    if (!isInf) {
      w.currentMag--;
    } else {
      w.currentMag = w.magSize;
    }

    // Recoil kick
    this.recoilOffset.z += w.recoilAmount;
    this.recoilRot.x += w.recoilAmount * 1.5;

    // Play Sound
    if (this.sound) {
      this.sound.playShoot(w.id);
    }

    // Spawn Tracer(s)
    const tracerColor = customTracerColor || w.tracerColor;
    const shotsFired = [];

    if (w.pelletCount && w.pelletCount > 1) {
      for (let i = 0; i < w.pelletCount; i++) {
        const spreadDir = direction.clone();
        spreadDir.x += (Math.random() - 0.5) * w.spread;
        spreadDir.y += (Math.random() - 0.5) * w.spread;
        spreadDir.z += (Math.random() - 0.5) * w.spread;
        spreadDir.normalize();

        this.spawnTracer(origin, spreadDir, tracerColor, w.bulletSpeed, 1.2);
        shotsFired.push({ origin, direction: spreadDir, damage: w.damage });
      }
    } else {
      this.spawnTracer(origin, direction, tracerColor, w.bulletSpeed, 1.8);
      shotsFired.push({ origin, direction, damage: w.damage });
    }

    window.dispatchEvent(new CustomEvent('ammo_updated', {
      detail: { current: w.currentMag, reserve: w.reserve }
    }));

    return shotsFired;
  }

  spawnTracer(startPos, direction, colorHex, speed = 140, maxDist = 200) {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.copy(startPos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);

    this.scene.add(mesh);
    this.tracers.push({
      mesh,
      direction: direction.clone(),
      speed: speed,
      distanceTraveled: 0,
      maxDist: maxDist
    });
  }

  reload() {
    const w = this.getActiveWeapon();
    if (this.isReloading || w.currentMag === w.magSize || w.reserve <= 0) return;

    this.isReloading = true;
    this.reloadProgress = 0;

    if (this.sound) this.sound.playReload();

    window.dispatchEvent(new CustomEvent('reload_started', {
      detail: { reloadTime: w.reloadTime }
    }));

    setTimeout(() => {
      const needed = w.magSize - w.currentMag;
      const amount = Math.min(needed, w.reserve);
      w.currentMag += amount;
      if (w.id !== 'blaster') {
        w.reserve -= amount;
      }
      this.isReloading = false;

      window.dispatchEvent(new CustomEvent('ammo_updated', {
        detail: { current: w.currentMag, reserve: w.reserve }
      }));
      window.dispatchEvent(new CustomEvent('reload_finished'));
    }, w.reloadTime * 1000);
  }

  update(delta, isMoving = false, isSprinting = false) {
    // 1. Update Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      const step = t.speed * delta;
      t.mesh.position.addScaledVector(t.direction, step);
      t.distanceTraveled += step;

      if (t.distanceTraveled >= t.maxDist) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // 2. Viewmodel Bobbing & Recoil Recovery
    if (this.activeMesh) {
      // Idle sway & walk bob
      this.swayTime += delta * (isSprinting ? 14 : (isMoving ? 8 : 2));
      const bobX = Math.cos(this.swayTime * 0.5) * (isMoving ? 0.015 : 0.002);
      const bobY = Math.sin(this.swayTime) * (isMoving ? 0.015 : 0.003);

      // Spring back recoil
      this.recoilOffset.multiplyScalar(Math.pow(0.001, delta));
      this.recoilRot.multiplyScalar(Math.pow(0.001, delta));

      // Reload animation: dip weapon down
      let reloadY = 0;
      if (this.isReloading) {
        reloadY = -0.15 * Math.sin(Math.PI * (this.reloadProgress / this.getActiveWeapon().reloadTime));
      }

      const basePos = (this.currentWeaponId === 'blaster')
        ? new THREE.Vector3(0.2, -0.18, -0.38)
        : (this.currentWeaponId === 'railgun'
          ? new THREE.Vector3(0.24, -0.22, -0.48)
          : new THREE.Vector3(0.22, -0.2, -0.44));

      this.activeMesh.position.x = basePos.x + bobX;
      this.activeMesh.position.y = basePos.y + bobY + reloadY;
      this.activeMesh.position.z = basePos.z + this.recoilOffset.z;

      this.activeMesh.rotation.x = this.recoilRot.x;
      this.activeMesh.rotation.y = bobX * 1.5;
    }
  }
}
