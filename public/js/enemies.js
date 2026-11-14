// EVENT HORIZON - STORY ENEMIES & AI BOSS SYSTEM
import * as THREE from 'three';

export class EnemyManager {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.sound = soundEngine;
    this.enemies = [];
    this.boss = null;
  }

  clear() {
    for (let i = 0; i < this.enemies.length; i++) {
      this.scene.remove(this.enemies[i].mesh);
    }
    this.enemies = [];
    if (this.boss) {
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
  }

  spawnDrone(position) {
    const group = new THREE.Group();

    // Drone central sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9, roughness: 0.2 })
    );
    group.add(sphere);

    // Red glowing optical sensor
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff0055 })
    );
    eye.position.set(0, 0, -0.6);
    group.add(eye);

    // Quad thruster fins
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.4, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.8 })
      );
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.set(Math.cos(i * Math.PI / 2) * 0.8, Math.sin(i * Math.PI / 2) * 0.8, 0.2);
      group.add(fin);
    }

    group.position.copy(position);
    this.scene.add(group);

    const enemy = {
      id: 'drone_' + Math.random().toString(36).substr(2, 6),
      type: 'drone',
      mesh: group,
      health: 60,
      maxHealth: 60,
      speed: 7.5,
      attackCooldown: 1.2,
      lastAttackTime: 0,
      shootRange: 28,
      damage: 15,
      hoverOffset: Math.random() * Math.PI * 2
    };

    this.enemies.push(enemy);
    return enemy;
  }

  spawnInfiltrator(position) {
    const group = new THREE.Group();

    // Sleek predatory cyber combatant
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e1065, metalness: 0.7, roughness: 0.3 })
    );
    body.rotation.x = Math.PI;
    group.add(body);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x9d4edd })
    );
    core.position.set(0, 0.2, 0);
    group.add(core);

    group.position.copy(position);
    this.scene.add(group);

    const enemy = {
      id: 'infiltrator_' + Math.random().toString(36).substr(2, 6),
      type: 'infiltrator',
      mesh: group,
      health: 90,
      maxHealth: 90,
      speed: 11.0,
      attackCooldown: 0.8,
      lastAttackTime: 0,
      shootRange: 16,
      damage: 22,
      hoverOffset: Math.random() * Math.PI * 2
    };

    this.enemies.push(enemy);
    return enemy;
  }

  spawnBoss(position) {
    const group = new THREE.Group();

    // Giant central boss core
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(3.5),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 })
    );
    group.add(core);

    // Glowing internal heart
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xff0055 })
    );
    group.add(heart);

    // Rotating shield orbitals
    const shield1 = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.3, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5400 })
    );
    const shield2 = new THREE.Mesh(
      new THREE.TorusGeometry(6.4, 0.3, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0x9d4edd })
    );
    shield2.rotation.x = Math.PI / 2;
    group.add(shield1, shield2);

    group.position.copy(position);
    this.scene.add(group);

    this.boss = {
      id: 'apex_colossus',
      type: 'boss',
      mesh: group,
      shield1,
      shield2,
      health: 1200,
      maxHealth: 1200,
      speed: 4.5,
      attackCooldown: 1.5,
      lastAttackTime: 0,
      shootRange: 50,
      damage: 30,
      hoverOffset: 0
    };

    return this.boss;
  }

  update(delta, playerPos, onEnemyShoot, onPlayerDamage) {
    const time = performance.now() / 1000;

    // 1. Regular Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.hoverOffset += delta * 2;

      // Hover bobbing
      e.mesh.position.y += Math.sin(e.hoverOffset) * 0.02;

      // Look at player
      e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);

      // Distance to player
      const dist = e.mesh.position.distanceTo(playerPos);

      // Move toward player if not too close
      if (dist > 8) {
        const moveDir = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();
        moveDir.y = 0; // stay on level
        e.mesh.position.addScaledVector(moveDir, e.speed * delta);
      }

      // Attack if in range
      if (dist <= e.shootRange && time - e.lastAttackTime >= e.attackCooldown) {
        e.lastAttackTime = time;
        const shootDir = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();

        if (onEnemyShoot) {
          onEnemyShoot(e.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), shootDir, e.type);
        }

        // Damage player if line of sight
        if (Math.random() < 0.6) {
          if (onPlayerDamage) onPlayerDamage(e.damage);
        }
      }
    }

    // 2. Boss
    if (this.boss) {
      const b = this.boss;
      b.hoverOffset += delta;
      b.mesh.position.y = 12 + Math.sin(b.hoverOffset * 0.8) * 2.5;

      // Rotate orbital rings
      b.shield1.rotation.y += delta * 1.8;
      b.shield2.rotation.x += delta * 1.2;

      const dist = b.mesh.position.distanceTo(playerPos);
      b.mesh.lookAt(playerPos.x, b.mesh.position.y, playerPos.z);

      if (time - b.lastAttackTime >= b.attackCooldown) {
        b.lastAttackTime = time;
        const shootDir = new THREE.Vector3().subVectors(playerPos, b.mesh.position).normalize();

        if (onEnemyShoot) {
          // Boss fires triple burst
          onEnemyShoot(b.mesh.position.clone(), shootDir, 'boss');
        }

        if (Math.random() < 0.75) {
          if (onPlayerDamage) onPlayerDamage(b.damage);
        }
      }
    }
  }

  damageEnemy(enemyId, amount) {
    if (this.boss && (enemyId === 'boss' || enemyId === this.boss.id)) {
      this.boss.health -= amount;
      return { isDead: this.boss.health <= 0, remaining: this.boss.health, target: this.boss };
    }

    const enemy = this.enemies.find(e => e.id === enemyId);
    if (!enemy) return null;

    enemy.health -= amount;
    const isDead = enemy.health <= 0;

    if (isDead) {
      this.scene.remove(enemy.mesh);
      this.enemies = this.enemies.filter(e => e.id !== enemyId);
    }

    return { isDead, remaining: enemy.health, target: enemy };
  }

  getEnemyMeshes() {
    const list = this.enemies.map(e => e.mesh);
    if (this.boss) list.push(this.boss.mesh);
    return list;
  }
}
