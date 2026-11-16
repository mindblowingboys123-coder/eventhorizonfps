// EVENT HORIZON - 3D PLAYER SKINS & CHARACTER CUSTOMIZER
import * as THREE from 'three';

export const SKIN_DEFINITIONS = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard Marine',
    rarity: 'common',
    cost: 0,
    unlocked: true,
    colors: {
      armor: 0xd0d8e8,
      secondary: 0x1e3a8a,
      visor: 0x00f0ff,
      core: 0x00f0ff
    },
    description: 'Standard issue planetary assault suit with reinforced cobalt plating.'
  },
  void_walker: {
    id: 'void_walker',
    name: 'Void Walker',
    rarity: 'legendary',
    cost: 1800,
    unlocked: false,
    colors: {
      armor: 0x120d24,
      secondary: 0x4a154b,
      visor: 0x9d4edd,
      core: 0xc77dff
    },
    description: 'Infused with dark matter harvested directly from the accretion disk.'
  },
  cyber_ronin: {
    id: 'cyber_ronin',
    name: 'Cyber Ronin',
    rarity: 'epic',
    cost: 1200,
    unlocked: false,
    colors: {
      armor: 0x111827,
      secondary: 0x0891b2,
      visor: 0x00f0ff,
      core: 0x22d3ee
    },
    description: 'Ultra-lightweight cybernetic exoskeleton designed for lethal agility.'
  },
  solar_flare: {
    id: 'solar_flare',
    name: 'Solar Flare',
    rarity: 'rare',
    cost: 800,
    unlocked: false,
    colors: {
      armor: 0x7c2d12,
      secondary: 0xea580c,
      visor: 0xffedd5,
      core: 0xff6b35
    },
    description: 'Thermal radiation suit forged to endure stellar flares and volcanic zones.'
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Spec-Ops',
    rarity: 'epic',
    cost: 1400,
    unlocked: false,
    colors: {
      armor: 0x09090b,
      secondary: 0x27272a,
      visor: 0xff0055,
      core: 0xff0055
    },
    description: 'Black-ops infiltration rig with radar-absorbent radar dampening coating.'
  },
  celestial: {
    id: 'celestial',
    name: 'Celestial Commander',
    rarity: 'mythic',
    cost: 3500,
    unlocked: false,
    colors: {
      armor: 0xf8fafc,
      secondary: 0xd97706,
      visor: 0xfef08a,
      core: 0xf59e0b
    },
    description: 'Honorary high-command battleframe embellished with pure solar gold.'
  },
  arctic_ghost: {
    id: 'arctic_ghost', name: 'Arctic Ghost', rarity: 'rare', cost: 500, unlocked: false,
    colors: { armor: 0xe8f7ff, secondary: 0x7fd8ff, visor: 0x00ffff, core: 0xbff5ff },
    description: 'Frost-white plating that blends into the Cryo Moon glacier.'
  },
  toxic_hazmat: {
    id: 'toxic_hazmat', name: 'Toxic Hazmat', rarity: 'rare', cost: 600, unlocked: false,
    colors: { armor: 0x2f3d1c, secondary: 0x6bd13a, visor: 0xc6ff00, core: 0x9dff3a },
    description: 'Sealed suit built for spore-thick jungle air.'
  },
  neon_samurai: {
    id: 'neon_samurai', name: 'Neon Samurai', rarity: 'epic', cost: 1000, unlocked: false,
    colors: { armor: 0x0b0f1f, secondary: 0xff2d6f, visor: 0xff2d6f, core: 0xffd1e0 },
    description: 'Blade-sharp black armor with pink neon veins.'
  },
  chrome_titan: {
    id: 'chrome_titan', name: 'Chrome Titan', rarity: 'epic', cost: 1300, unlocked: false,
    colors: { armor: 0xc0c8d4, secondary: 0x5a6470, visor: 0x00e0ff, core: 0xffffff },
    description: 'Polished heavy frame that reflects every laser.'
  },
  blood_moon: {
    id: 'blood_moon', name: 'Blood Moon', rarity: 'legendary', cost: 2000, unlocked: false,
    colors: { armor: 0x3a0a14, secondary: 0xb3122e, visor: 0xff8a8a, core: 0xff3b3b },
    description: 'Crimson war-plate forged under an eclipsed sky.'
  },
  galaxy_nomad: {
    id: 'galaxy_nomad', name: 'Galaxy Nomad', rarity: 'mythic', cost: 4000, unlocked: false,
    colors: { armor: 0x14113a, secondary: 0x3c2a8a, visor: 0xffe066, core: 0xb070ff },
    description: 'Star-dusted suit for pilots who have been past the horizon.'
  }
};

export class SkinManager {
  constructor() {}

  createPlayerModel(skinId = 'vanguard', playerName = 'Pilot') {
    const skin = SKIN_DEFINITIONS[skinId] || SKIN_DEFINITIONS.vanguard;
    const group = new THREE.Group();

    // Materials
    const armorMat = new THREE.MeshStandardMaterial({
      color: skin.colors.armor,
      roughness: 0.4,
      metalness: 0.7
    });

    const secMat = new THREE.MeshStandardMaterial({
      color: skin.colors.secondary,
      roughness: 0.5,
      metalness: 0.5
    });

    const visorMat = new THREE.MeshBasicMaterial({
      color: skin.colors.visor
    });

    const coreMat = new THREE.MeshBasicMaterial({
      color: skin.colors.core
    });

    // 1. Head & Helmet
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.5, 0);

    const helmetGeo = new THREE.BoxGeometry(0.32, 0.35, 0.34);
    const helmet = new THREE.Mesh(helmetGeo, armorMat);
    headGroup.add(helmet);

    // Glowing Visor
    const visorGeo = new THREE.BoxGeometry(0.24, 0.1, 0.04);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.04, -0.17);
    headGroup.add(visor);
    group.add(headGroup);

    // 2. Torso
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.95, 0);

    const chestGeo = new THREE.BoxGeometry(0.48, 0.6, 0.28);
    const chest = new THREE.Mesh(chestGeo, armorMat);
    torsoGroup.add(chest);

    // Back Thruster / Power Core
    const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.12);
    const pack = new THREE.Mesh(packGeo, secMat);
    pack.position.set(0, 0.05, 0.18);
    torsoGroup.add(pack);

    // Core light on chest
    const chestCore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16).rotateX(Math.PI / 2), coreMat);
    chestCore.position.set(0, 0.1, -0.15);
    torsoGroup.add(chestCore);
    group.add(torsoGroup);

    // 3. Arms
    const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.14);
    const leftArm = new THREE.Mesh(armGeo, secMat);
    leftArm.position.set(-0.32, 0.95, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, secMat);
    rightArm.position.set(0.32, 0.95, 0);
    group.add(rightArm);

    // Weapon prop in right hand
    const gunProp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.38), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    gunProp.position.set(0.25, 0.85, -0.22);
    group.add(gunProp);

    // 4. Legs
    const legGeo = new THREE.BoxGeometry(0.16, 0.65, 0.18);
    const leftLeg = new THREE.Mesh(legGeo, armorMat);
    leftLeg.position.set(-0.14, 0.33, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, armorMat);
    rightLeg.position.set(0.14, 0.33, 0);
    group.add(rightLeg);

    // 5. Overhead Nametag & Health Bar Sprite
    const nametagCanvas = document.createElement('canvas');
    nametagCanvas.width = 256;
    nametagCanvas.height = 64;
    const nametagCtx = nametagCanvas.getContext('2d');

    const nametagTexture = new THREE.CanvasTexture(nametagCanvas);
    const nametagSpriteMat = new THREE.SpriteMaterial({ map: nametagTexture, depthTest: false });
    const nametagSprite = new THREE.Sprite(nametagSpriteMat);
    nametagSprite.position.set(0, 2.05, 0);
    nametagSprite.scale.set(1.6, 0.4, 1);
    group.add(nametagSprite);

    group.userData = {
      head: headGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      nametagCanvas,
      nametagCtx,
      nametagTexture,
      name: playerName,
      health: 100,
      maxHealth: 100,
      walkCycle: 0,
      skinId: skinId
    };

    this.updateNametag(group, playerName, 100, 100);

    return group;
  }

  updateNametag(model, name, health, maxHealth) {
    const { nametagCtx, nametagCanvas, nametagTexture } = model.userData;
    if (!nametagCtx) return;

    nametagCtx.clearRect(0, 0, nametagCanvas.width, nametagCanvas.height);

    // Name text
    nametagCtx.font = 'bold 22px Orbitron, sans-serif';
    nametagCtx.fillStyle = '#00f0ff';
    nametagCtx.textAlign = 'center';
    nametagCtx.shadowColor = 'black';
    nametagCtx.shadowBlur = 4;
    nametagCtx.fillText(name, 128, 26);

    // Health bar outline
    nametagCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    nametagCtx.fillRect(28, 38, 200, 12);

    // Health bar fill
    const pct = Math.max(0, Math.min(1, health / maxHealth));
    nametagCtx.fillStyle = pct > 0.3 ? '#00f0ff' : '#ff0055';
    nametagCtx.fillRect(30, 40, 196 * pct, 8);

    nametagTexture.needsUpdate = true;
  }

  animateModel(model, delta, isMoving = false) {
    if (!model || !model.userData) return;
    const { leftLeg, rightLeg, leftArm, rightArm } = model.userData;

    if (isMoving) {
      model.userData.walkCycle += delta * 10;
      const swing = Math.sin(model.userData.walkCycle) * 0.45;

      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.8;
      rightArm.rotation.x = swing * 0.5;
    } else {
      // Idle relaxation
      leftLeg.rotation.x *= 0.8;
      rightLeg.rotation.x *= 0.8;
      leftArm.rotation.x *= 0.8;
      rightArm.rotation.x *= 0.8;
    }
  }
}
