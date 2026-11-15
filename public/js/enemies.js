// EVENT HORIZON - STORY ENEMIES & AI BOSS SYSTEM
import * as THREE from 'three';

// What the enemies are thinking (shown in speech bubbles over their heads)
const THOUGHTS = {
  drone: {
    idle: ['Scanning...', 'Beep. Boop. Hunting.', 'Is that... a human?', 'My battery is at 4%...', 'I hover. Therefore I am.', 'Zzz... target... zzz...', 'Why do I have no legs?', 'Must. Protect. The Hollow.'],
    spot: ['HUMAN SPOTTED!', 'Found you!', 'Intruder! Intruder!', 'Engaging target!'],
    hurt: ['OW!', 'Hey! Rude!', 'My circuits!', 'That actually hurt!', 'Ouch ouch ouch!'],
    low: ['Systems failing...', 'I do not feel so good...', 'Tell my mom I was a hero', 'Warning: very dead soon'],
    die: ['NOOOOOO!!!', 'I REGRET NOTHING!', 'ERROR ERROR ERROR', 'Tell the toaster I loved it', 'Not the face!!!', 'I was only 3 days old!', 'KABOOOOOM!']
  },
  infiltrator: {
    idle: ['I smell fear...', 'Silent. Deadly. Cool.', 'Hunting...', 'Come out, little human', 'Stab stab stab...', 'I am speed.'],
    spot: ['THERE YOU ARE!', 'Fresh meat!', 'You cannot run!'],
    hurt: ['You got lucky!', 'Impossible!', 'That stings!', 'Hold still!'],
    low: ['I... can still win!', 'Not like this...', 'Retreat? NEVER!'],
    die: ['IMPOSSIBLE!!!', 'The Hollow will avenge me!', 'NOOOOOO!!!', 'I was the fast one!', 'Tell them I was cool...']
  },
  boss: {
    idle: ['Kneel before the abyss.', 'You cannot win, human.', 'I have eaten stars.', 'Pathetic.', 'Your ship is gone. Forever.', 'Feel the pull...'],
    spot: ['You dare enter MY abyss?!', 'Another fly to swat.'],
    hurt: ['You SCRATCHED me?!', 'INSOLENT!', 'Is that all?!', 'Hrrrgh!'],
    low: ['This cannot be...', 'I am eternal!'],
    phase1: ["Now I'm ANGRY.", 'You will regret that!', 'The void grows hungry...'],
    phase2: ['ENOUGH!!! FEEL THE VOID!', 'I WILL NOT FALL!', 'DIE DIE DIE!!!'],
    die: ['NOOOOOO!!! THE VOID TAKES ME...', 'IMPOSSIBLE!!! NOOOO!!!']
  }
};

export class EnemyManager {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.sound = soundEngine;
    this.enemies = [];
    this.boss = null;
    this.floaters = [];
  }

  // ---------- SPEECH BUBBLES ----------
  makeBubble(yOffset, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, yOffset, 0);
    sprite.scale.set(4.2 * scale, 1.05 * scale, 1);
    sprite.renderOrder = 999;
    sprite.visible = false;
    sprite.raycast = () => {}; // bullets pass through speech bubbles
    return { sprite, canvas, ctx, tex, timer: 0 };
  }

  drawBubble(b, text, color) {
    const ctx = b.ctx, cw = b.canvas.width;
    ctx.clearRect(0, 0, cw, b.canvas.height);
    ctx.font = 'bold 44px Rajdhani, Arial, sans-serif';
    const w = Math.min(496, ctx.measureText(text).width + 48);
    const x = (cw - w) / 2, y = 12, h = 74, r = 18;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 12, 26, 0.9)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    // little tail pointing down at the speaker
    ctx.beginPath();
    ctx.moveTo(cw / 2 - 12, y + h - 1);
    ctx.lineTo(cw / 2, y + h + 28);
    ctx.lineTo(cw / 2 + 12, y + h - 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, y + h / 2 + 2, 470);
    b.tex.needsUpdate = true;
  }

  attachBrain(e, group, yOffset, scale, color) {
    e.bubble = this.makeBubble(yOffset, scale);
    e.bubbleColor = color;
    e.thinkTimer = 1 + Math.random() * 4;
    e.spotted = false;
    e.saidLow = false;
    group.add(e.bubble.sprite);
  }

  disposeBrain(e) {
    if (!e.bubble) return;
    e.bubble.tex.dispose();
    e.bubble.sprite.material.dispose();
  }

  pick(e, key) {
    const set = THOUGHTS[e.type] || THOUGHTS.drone;
    const list = set[key] || set.idle;
    return list[Math.floor(Math.random() * list.length)];
  }

  say(e, text, seconds = 2.2, color) {
    if (!e || !e.bubble) return;
    this.drawBubble(e.bubble, text, color || e.bubbleColor || '#00f0ff');
    e.bubble.sprite.visible = true;
    e.bubble.timer = seconds;
  }

  think(e, delta, dist) {
    const b = e.bubble;
    if (!b) return;
    if (b.timer > 0) {
      b.timer -= delta;
      if (b.timer <= 0) b.sprite.visible = false;
      return;
    }
    if (!e.spotted && dist < e.shootRange * 1.5) {
      e.spotted = true;
      this.say(e, this.pick(e, 'spot'), 2);
      return;
    }
    e.thinkTimer -= delta;
    if (e.thinkTimer <= 0) {
      e.thinkTimer = 5 + Math.random() * 6;
      this.say(e, this.pick(e, 'idle'), 2.6);
    }
  }

  reactHurt(e) {
    if (!e.bubble) return;
    if (!e.saidLow && e.health < e.maxHealth * 0.3) {
      e.saidLow = true;
      this.say(e, this.pick(e, 'low'), 2.4);
    } else if (Math.random() < 0.3) {
      this.say(e, this.pick(e, 'hurt'), 1.6);
    }
  }

  reactBoss(b, before) {
    const max = b.maxHealth;
    if (b.health <= 0) {
      if (!b.dead) {
        b.dead = true;
        this.say(b, this.pick(b, 'die'), 8);
      }
    } else if (before > max * 0.66 && b.health <= max * 0.66) {
      this.say(b, this.pick(b, 'phase1'), 3);
    } else if (before > max * 0.33 && b.health <= max * 0.33) {
      this.say(b, this.pick(b, 'phase2'), 3);
    } else if (Math.random() < 0.12) {
      this.say(b, this.pick(b, 'hurt'), 1.6);
    }
  }

  spawnFloater(pos, text, color) {
    const b = this.makeBubble(0, 1);
    this.drawBubble(b, text, color || '#ff4d79');
    b.sprite.visible = true;
    b.sprite.position.copy(pos).add(new THREE.Vector3(0, 1.7, 0));
    this.scene.add(b.sprite);
    this.floaters.push({ sprite: b.sprite, tex: b.tex, life: 2.4 });
  }

  removeFloater(f) {
    this.scene.remove(f.sprite);
    f.tex.dispose();
    f.sprite.material.dispose();
  }
  clear() {
    for (let i = 0; i < this.enemies.length; i++) {
      this.disposeBrain(this.enemies[i]);
      this.scene.remove(this.enemies[i].mesh);
    }
    this.enemies = [];
    if (this.boss) {
      this.disposeBrain(this.boss);
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
    for (let i = 0; i < this.floaters.length; i++) this.removeFloater(this.floaters[i]);
    this.floaters = [];
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

    this.attachBrain(enemy, group, 1.7, 1, '#ff4d79');
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

    this.attachBrain(enemy, group, 2.0, 1, '#b57bff');
    this.enemies.push(enemy);
    return enemy;
  }

  spawnBoss(position, opts = {}) {
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

    const hp = opts.health || 1200;
    this.boss = {
      id: 'apex_colossus',
      type: 'boss',
      name: opts.name || 'A.P.E.X. Void Colossus',
      mesh: group,
      shield1,
      shield2,
      health: hp,
      maxHealth: hp,
      speed: 4.5,
      attackCooldown: opts.attackCooldown || 1.5,
      lastAttackTime: 0,
      shootRange: 50,
      damage: opts.damage || 30,
      hoverOffset: 0
    };
    this.attachBrain(this.boss, group, 7.2, 2.6, '#ffd166');
    this.say(this.boss, 'You dare enter MY abyss?!', 3.5, '#ffd166');

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
      this.think(e, delta, dist);

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
      this.think(b, delta, dist);
      b.mesh.lookAt(playerPos.x, b.mesh.position.y, playerPos.z);

      if (b.health > 0 && time - b.lastAttackTime >= b.attackCooldown) {
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

    // 3. Floating last words (bubbles that drift up after an enemy dies)
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= delta;
      f.sprite.position.y += delta * 1.6;
      f.sprite.material.opacity = Math.max(0, Math.min(1, f.life / 0.6));
      if (f.life <= 0) {
        this.removeFloater(f);
        this.floaters.splice(i, 1);
      }
    }
  }

  damageEnemy(enemyId, amount) {
    if (this.boss && (enemyId === 'boss' || enemyId === this.boss.id)) {
      const b = this.boss;
      const before = b.health;
      b.health -= amount;
      this.reactBoss(b, before);
      return { isDead: b.health <= 0, remaining: b.health, target: b };
    }

    const enemy = this.enemies.find(e => e.id === enemyId);
    if (!enemy) return null;

    enemy.health -= amount;
    const isDead = enemy.health <= 0;

    if (!isDead) this.reactHurt(enemy);

    if (isDead) {
      this.spawnFloater(enemy.mesh.position, this.pick(enemy, 'die'), enemy.bubbleColor);
      this.disposeBrain(enemy);
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
