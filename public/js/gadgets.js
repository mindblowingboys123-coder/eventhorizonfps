// EVENT HORIZON - DEPLOYABLE GADGETS (remote car, turret, mine, decoy)
// Gadgets are drawn for you only. Damage they deal goes through the normal hit
// system, so the pilot who is hit still takes it on their own client.
import * as THREE from 'three';

const CAR_SPEED = 18;    // metres per second
const CAR_TURN = 2.2;    // radians per second
const CAR_TIME = 15;     // seconds before the car shuts down
const TURRET_RANGE = 28;
const TURRET_TIME = 10;
const TURRET_RATE = 0.6; // seconds between shots
const TURRET_DAMAGE = 14;
const MINE_LIFE = 60;
const MINE_ARM = 1.0;
const MINE_TRIGGER = 2.2;
const MINE_DAMAGE = 80;
const MINE_RADIUS = 5;
const CAR_BLAST_DAMAGE = 100;
const CAR_BLAST_RADIUS = 4;
const DECOY_TIME = 8;
const STRIKE_DELAY = 3;
const STRIKE_RADIUS = 12;
const STRIKE_DAMAGE = 150;

export class GadgetManager {
  // deps: getPilots() -> [{ id, mesh }], sendHit(id, dmg, weapon), isBlocked(x, z, feetY) -> bool
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;
    this.items = [];
    this.car = null;
    this.lastCar = null;
    this.strikes = [];
    this.reticle = null;
  }

  // Red ring on the ground that follows the aim while you choose a strike spot
  createReticle() {
    if (!this.reticle) {
      this.reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.1, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      this.reticle.rotation.x = -Math.PI / 2;
      this.scene.add(this.reticle);
    }
    this.reticle.visible = true;
  }

  moveReticle(x, z) {
    if (this.reticle) this.reticle.position.set(x, 0.1, z);
  }

  hideReticle() {
    if (this.reticle) this.reticle.visible = false;
  }

  // Calls in a strike: a warning ring, then the blast after STRIKE_DELAY seconds
  callStrike(x, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(STRIKE_RADIUS - 0.4, STRIKE_RADIUS, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.1, z);
    this.scene.add(ring);
    this.strikes.push({ x, z, life: STRIKE_DELAY, ring });
  }

  updateStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const st = this.strikes[i];
      st.life -= dt;
      if (st.life <= 0) {
        this.scene.remove(st.ring);
        this.strikes.splice(i, 1);
        this.blast(st.x, 0, st.z, STRIKE_RADIUS, STRIKE_DAMAGE, 'Airstrike');
      } else {
        st.ring.material.opacity = 0.3 + 0.4 * Math.abs(Math.sin(st.life * 6));
      }
    }
  }

  pilotsNear(x, z, radius) {
    return this.deps.getPilots().filter((p) => {
      const q = p.mesh.position;
      return Math.hypot(q.x - x, q.z - z) <= radius;
    });
  }

  blast(x, y, z, radius, damage, weapon) {
    this.pilotsNear(x, z, radius).forEach((p) => this.deps.sendHit(p.id, damage, weapon));
    this.flash(x, y, z, radius);
  }

  // A quick expanding fireball so the blast can be seen
  flash(x, y, z, radius) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat);
    mesh.position.set(x, y + 0.5, z);
    this.scene.add(mesh);
    this.items.push({ type: 'fx', mesh, life: 0.45, max: 0.45, radius });
  }

  deployTurret(x, feetY, z) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, emissive: 0xff4d6d, emissiveIntensity: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 12), dark);
    base.position.y = 0.4;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.1), dark);
    barrel.position.set(0, 0.8, 0.4);
    group.add(base, barrel);
    group.position.set(x, feetY, z);
    this.scene.add(group);
    this.items.push({ type: 'turret', mesh: group, x, z, life: TURRET_TIME, cool: 0 });
  }

  deployMine(x, feetY, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff9e00, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 14), mat);
    mesh.position.set(x, feetY + 0.08, z);
    this.scene.add(mesh);
    this.items.push({ type: 'mine', mesh, x, z, life: MINE_LIFE, arm: MINE_ARM });
  }

  deployDecoy(x, feetY, z, yaw) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.45, wireframe: true });
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat);
    mesh.position.set(x, feetY + 0.9, z);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.items.push({ type: 'decoy', mesh, life: DECOY_TIME });
  }

  deployCar(x, feetY, z, heading) {
    if (this.car) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb703, emissive: 0x553300, emissiveIntensity: 0.4 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 1.5), mat);
    mesh.position.set(x, feetY + 0.3, z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    this.car = { mesh, x, y: feetY, z, heading, life: CAR_TIME };
  }

  // Drives the car from WASD and returns the new heading and position, or null once it has ended
  driveCar(dt, input) {
    const car = this.car;
    if (!car) return null;
    car.heading -= (Number(input.left) - Number(input.right)) * CAR_TURN * dt;
    const move = (Number(input.forward) - Number(input.back)) * CAR_SPEED * dt;
    const nx = car.x - Math.sin(car.heading) * move;
    const nz = car.z - Math.cos(car.heading) * move;
    if (!this.deps.isBlocked(nx, nz, car.y)) { car.x = nx; car.z = nz; }
    car.mesh.position.set(car.x, car.y + 0.3, car.z);
    car.mesh.rotation.y = car.heading;
    car.life -= dt;

    const hitPilot = this.pilotsNear(car.x, car.z, 1.8).length > 0;
    if (hitPilot || car.life <= 0) {
      if (hitPilot) this.blast(car.x, car.y, car.z, CAR_BLAST_RADIUS, CAR_BLAST_DAMAGE, 'Remote Car');
      this.lastCar = { x: car.x, y: car.y, z: car.z };
      this.scene.remove(car.mesh);
      this.car = null;
      return null;
    }
    return { x: car.x, y: car.y, z: car.z, heading: car.heading };
  }

  update(dt) {
    this.updateStrikes(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      let gone = it.life <= 0;

      if (!gone && it.type === 'turret') {
        it.cool -= dt;
        let target = null;
        let best = TURRET_RANGE;
        for (const p of this.deps.getPilots()) {
          const d = Math.hypot(p.mesh.position.x - it.x, p.mesh.position.z - it.z);
          if (d < best) { best = d; target = p; }
        }
        if (target) {
          it.mesh.rotation.y = Math.atan2(target.mesh.position.x - it.x, target.mesh.position.z - it.z);
          if (it.cool <= 0) {
            this.deps.sendHit(target.id, TURRET_DAMAGE, 'Turret');
            it.cool = TURRET_RATE;
          }
        }
      }

      if (!gone && it.type === 'mine') {
        it.arm -= dt;
        if (it.arm <= 0 && this.pilotsNear(it.x, it.z, MINE_TRIGGER).length > 0) {
          this.blast(it.x, it.mesh.position.y, it.z, MINE_RADIUS, MINE_DAMAGE, 'Mine');
          gone = true;
        }
      }

      if (!gone && it.type === 'fx') {
        const k = 1 + (it.max - it.life) * (it.radius / it.max) * 0.5;
        it.mesh.scale.setScalar(k);
        it.mesh.material.opacity = Math.max(0, it.life / it.max) * 0.8;
      }

      if (!gone && it.type === 'decoy') {
        it.mesh.rotation.y += dt * 0.8;
      }

      if (gone) {
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  // Removes everything you have placed (on death or when leaving a match)
  clearAll() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    for (const st of this.strikes) this.scene.remove(st.ring);
    this.strikes = [];
    if (this.car) {
      this.scene.remove(this.car.mesh);
      this.car = null;
    }
  }
}
