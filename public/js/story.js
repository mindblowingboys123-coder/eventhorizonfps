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

    let mapKey = 'station';
    if (missionIndex === 2) mapKey = 'mars';
    if (missionIndex === 3) mapKey = 'singularity';

    const mapData = this.maps.loadMap(mapKey);

    if (missionIndex === 1) {
      this.initMission1();
    } else if (missionIndex === 2) {
      this.initMission2();
    } else if (missionIndex === 3) {
      this.initMission3();
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
    this.updateHUDObjective('CHAPTER 03 - FINAL', 'Confront A.P.E.X. Void Colossus');
    const boss = this.enemies.spawnBoss(new THREE.Vector3(0, 14, 0));

    // Show Boss UI
    const bossHUD = document.getElementById('hud-boss');
    if (bossHUD) bossHUD.classList.add('active');
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

    // Mission 3: Boss battle check
    if (this.activeMission === 3) {
      if (this.enemies.boss) {
        const fill = document.getElementById('boss-health-fill');
        if (fill) {
          const pct = Math.max(0, (this.enemies.boss.health / this.enemies.boss.maxHealth) * 100);
          fill.style.width = pct + '%';
        }

        if (this.enemies.boss.health <= 0) {
          const bossHUD = document.getElementById('hud-boss');
          if (bossHUD) bossHUD.classList.remove('active');
          this.completeMission(3, 3000, 'obsidian');
        }
      }
    }
  }

  completeMission(missionId, creditReward, bonusItem) {
    this.isMissionActive = false;
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
