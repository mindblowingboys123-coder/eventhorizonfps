// EVENT HORIZON - STORY CAMPAIGN ENGINE
import * as THREE from 'three';

export class StoryCampaign {
  constructor(scene, enemyManager, mapManager, soundEngine, authManager) {
    this.scene = scene;
    this.enemies = enemyManager;
    this.maps = mapManager;
    this.sound = soundEngine;
    this.auth = authManager;

    this.activeMission = null;
    this.currentStep = 0;
    this.wave = 1;
    this.isMissionActive = false;
    this.objectiveMarkers = [];
    this.collectibles = [];
  }

  startMission(missionIndex = 1) {
    this.activeMission = missionIndex;
    this.currentStep = 0;
    this.wave = 1;
    this.isMissionActive = true;
    this.clearObjectiveWorldObjects();

    const bossHUD = document.getElementById('hud-boss');
    if (bossHUD) bossHUD.classList.remove('active');

    const mapKeys = { 1: 'station', 2: 'mars', 3: 'singularity', 4: 'cyber', 5: 'ice', 6: 'singularity' };
    const mapData = this.maps.loadMap(mapKeys[missionIndex] || 'station');

    if (missionIndex === 1) {
      this.initMission1();
    } else if (missionIndex === 2) {
      this.initMission2();
    } else if (missionIndex === 3) {
      this.initMission3();
    } else if (missionIndex === 4) {
      this.initMission4();
    } else if (missionIndex === 5) {
      this.initMission5();
    } else if (missionIndex === 6) {
      this.initMission6();
    }

    return mapData;
  }

  clearObjectiveWorldObjects() {
    this.collectibles.forEach(c => this.scene.remove(c.mesh));
    this.collectibles = [];
    this.objectiveMarkers.forEach(m => this.scene.remove(m));
    this.objectiveMarkers = [];
    this.enemies.clear();
  }

  // --- MISSION 1: THE SILENT STATION ---
  initMission1() {
    this.updateHUDObjective('CHAPTER 01', 'Restore Auxiliary Power (0/3 Cells)');

    // Spawn 3 glowing quantum power cell canisters
    const cellPositions = [
      new THREE.Vector3(12, 2.5, 12),
      new THREE.Vector3(-12, 2.5, -12),
      new THREE.Vector3(0, 2.5, -18)
    ];

    cellPositions.forEach((pos, i) => {
      const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.collectibles.push({ mesh, id: i, collected: false });
    });

    // Spawn initial patrolling drones
    this.enemies.spawnDrone(new THREE.Vector3(10, 4, 0));
    this.enemies.spawnDrone(new THREE.Vector3(-10, 4, 0));
    this.enemies.spawnDrone(new THREE.Vector3(0, 4, 10));
  }

  // --- MISSION 2: CORE DEFENSE ---
  initMission2() {
    this.updateHUDObjective('CHAPTER 02', 'Defend Reactor: Repel Swarm Wave 1/3');
    this.spawnSwarmWave(1);
  }

  spawnSwarmWave(waveNum) {
    this.wave = waveNum;
    this.updateHUDObjective('CHAPTER 02', `Defend Reactor: Repel Swarm Wave ${waveNum}/3`);

    const count = 3 + waveNum * 2;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const x = Math.cos(ang) * 28;
      const z = Math.sin(ang) * 28;
      if (waveNum === 1 || i % 2 === 0) {
        this.enemies.spawnDrone(new THREE.Vector3(x, 4, z));
      } else {
        this.enemies.spawnInfiltrator(new THREE.Vector3(x, 2, z));
      }
    }
  }

  // --- MISSION 3: EDGE OF THE ABYSS (BOSS) ---
  initMission3() {
    this.updateHUDObjective('CHAPTER 03 - BOSS', 'Confront A.P.E.X. Void Colossus');
    this.enemies.spawnBoss(new THREE.Vector3(0, 14, 0), { name: 'A.P.E.X. Void Colossus' });
    this.showBossHUD('A.P.E.X. VOID COLOSSUS');
  }

  showBossHUD(name) {
    const bossHUD = document.getElementById('hud-boss');
    const nameEl = document.getElementById('boss-name');
    const fill = document.getElementById('boss-health-fill');
    if (nameEl) nameEl.innerText = name;
    if (fill) fill.style.width = '100%';
    if (bossHUD) bossHUD.classList.add('active');
  }

  // --- MISSION 4: NEON BREACH (Cyber Void, 3 waves) ---
  initMission4() {
    this.spawnCyberWave(1);
  }

  spawnCyberWave(waveNum) {
    this.wave = waveNum;
    this.updateHUDObjective('CHAPTER 04', `Hold the Arena: Wave ${waveNum}/3`);
    const count = 4 + waveNum * 2;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const x = Math.cos(ang) * 22;
      const z = Math.sin(ang) * 22;
      if (i % 3 === 0) {
        this.enemies.spawnInfiltrator(new THREE.Vector3(x, 2.4, z));
      } else {
        this.enemies.spawnDrone(new THREE.Vector3(x, 4 + (i % 3) * 2, z));
      }
    }
  }

  // --- MISSION 5: FROZEN RELAY (Cryo Moon, collect 4 relay cores) ---
  initMission5() {
    this.updateHUDObjective('CHAPTER 05', 'Recover Relay Cores (0/4)');
    const spots = [
      new THREE.Vector3(34, 2.5, 34),
      new THREE.Vector3(-34, 2.5, 34),
      new THREE.Vector3(-34, 2.5, -34),
      new THREE.Vector3(34, 2.5, -34)
    ];
    spots.forEach((pos, i) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.7),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff })
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.collectibles.push({ mesh, id: i, collected: false, baseY: pos.y });
    });
    this.enemies.spawnDrone(new THREE.Vector3(12, 5, 12));
    this.enemies.spawnDrone(new THREE.Vector3(-12, 5, -12));
    this.enemies.spawnDrone(new THREE.Vector3(12, 5, -12));
    this.enemies.spawnInfiltrator(new THREE.Vector3(-12, 2.4, 12));
  }

  updateCores(delta, playerPos) {
    let collected = 0;
    this.collectibles.forEach(c => {
      if (!c.collected) {
        c.mesh.rotation.y += delta * 2;
        c.mesh.position.y = c.baseY + Math.sin(performance.now() / 400 + c.id) * 0.25;
        if (c.mesh.position.distanceTo(playerPos) < 2.8) {
          c.collected = true;
          this.scene.remove(c.mesh);
          if (this.sound) this.sound.playKillChime();
          // Ambush! Two infiltrators drop in around the core
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2;
            const e = this.enemies.spawnInfiltrator(new THREE.Vector3(c.mesh.position.x + Math.cos(a) * 14, 2.4, c.mesh.position.z + Math.sin(a) * 14));
            this.enemies.say(e, 'AMBUSH!!!', 2.2);
          }
        }
      }
      if (c.collected) collected++;
    });
    return collected;
  }

  // --- MISSION 6: SINGULARITY PRIME (final boss) ---
  initMission6() {
    this.updateHUDObjective('CHAPTER 06 - FINAL', 'Destroy Singularity Prime');
    this.summonTimer = 14;
    this.enemies.spawnBoss(new THREE.Vector3(0, 16, 0), { name: 'Singularity Prime', health: 2600, damage: 34, attackCooldown: 1.2 });
    this.showBossHUD('SINGULARITY PRIME');
  }

  update(delta, playerPos) {
    if (!this.isMissionActive) return;

    // Mission 1: Collect cells check
    if (this.activeMission === 1) {
      let collectedCount = 0;
      this.collectibles.forEach(c => {
        if (!c.collected) {
          c.mesh.rotation.y += delta * 2;
          if (c.mesh.position.distanceTo(playerPos) < 2.5) {
            c.collected = true;
            this.scene.remove(c.mesh);
            if (this.sound) this.sound.playKillChime();
          }
        } else {
          collectedCount++;
        }
      });

      this.updateHUDObjective('CHAPTER 01', `Restore Auxiliary Power (${collectedCount}/3 Cells)`);

      if (collectedCount >= 3 && this.currentStep === 0) {
        this.currentStep = 1;
        this.updateHUDObjective('CHAPTER 01', 'Auxiliary Power Restored! Purge Remaining Drones');
      }

      if (this.currentStep === 1 && this.enemies.enemies.length === 0) {
        this.completeMission(1, 600, 'vanguard');
      }
    }

    // Mission 2: Swarm waves check
    if (this.activeMission === 2) {
      if (this.enemies.enemies.length === 0) {
        if (this.wave < 3) {
          this.spawnSwarmWave(this.wave + 1);
        } else {
          this.completeMission(2, 1200, 'void_blaster');
        }
      }
    }

    // Mission 4: three waves in the Cyber arena
    if (this.activeMission === 4) {
      if (this.enemies.enemies.length === 0) {
        if (this.wave < 3) {
          this.spawnCyberWave(this.wave + 1);
        } else {
          this.completeMission(4, 2000, 'cyber_ronin');
        }
      }
    }

    // Mission 5: relay cores, then purge
    if (this.activeMission === 5) {
      const got = this.updateCores(delta, playerPos);
      if (this.currentStep === 0) {
        this.updateHUDObjective('CHAPTER 05', `Recover Relay Cores (${got}/4)`);
        if (got >= 4) {
          this.currentStep = 1;
          this.updateHUDObjective('CHAPTER 05', 'Relay Online! Purge Remaining Hostiles');
        }
      } else if (this.enemies.enemies.length === 0) {
        this.completeMission(5, 3000, 'solar_flare');
      }
    }

    // Mission 6: the boss keeps summoning drones
    if (this.activeMission === 6 && this.enemies.boss && this.enemies.boss.health > 0) {
      this.summonTimer -= delta;
      if (this.summonTimer <= 0 && this.enemies.enemies.length < 5) {
        this.summonTimer = 16;
        const bp = this.enemies.boss.mesh.position;
        this.enemies.say(this.enemies.boss, 'RISE, MY CHILDREN!', 2.5);
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          this.enemies.spawnDrone(new THREE.Vector3(bp.x + Math.cos(a) * 8, 6, bp.z + Math.sin(a) * 8));
        }
      }
    }

    // Mission 3 and 6: boss battle check
    if (this.activeMission === 3 || this.activeMission === 6) {
      if (this.enemies.boss) {
        const fill = document.getElementById('boss-health-fill');
        if (fill) {
          const pct = Math.max(0, (this.enemies.boss.health / this.enemies.boss.maxHealth) * 100);
          fill.style.width = pct + '%';
        }

        if (this.enemies.boss.health <= 0) {
          const bossHUD = document.getElementById('hud-boss');
          if (bossHUD) bossHUD.classList.remove('active');
          if (this.activeMission === 6) this.completeMission(6, 6000, 'celestial');
          else this.completeMission(3, 3000, 'obsidian');
        }
      }
    }
  }

  completeMission(missionId, creditReward, bonusItem) {
    this.isMissionActive = false;
    if (this.auth.profile.storyProgress) this.auth.profile.storyProgress['mission' + missionId + 'Completed'] = true;
    this.auth.addCredits(creditReward);
    this.auth.addXP(500);

    if (bonusItem && this.auth.unlockSkin) {
      this.auth.unlockSkin(bonusItem);
    }

    if (this.sound) this.sound.playKillChime();

    window.dispatchEvent(new CustomEvent('mission_completed', {
      detail: { missionId, creditReward, bonusItem }
    }));
  }

  updateHUDObjective(title, text) {
    const t = document.getElementById('hud-obj-title');
    const x = document.getElementById('hud-obj-text');
    if (t) t.innerText = title;
    if (x) x.innerText = text;
  }
}
