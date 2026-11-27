// EVENT HORIZON - 3D FIRST-PERSON SHOOTER CORE ENGINE
import * as THREE from 'three';
import { AuthManager } from './auth.js';
import { SoundEngine } from './audio.js';
import { FPSControls } from './controls.js';
import { WeaponManager } from './weapons.js';
import { SkinManager } from './skins.js';
import { MapManager, pickSafeSpawn } from './maps.js';
import { EnemyManager } from './enemies.js';
import { StoryCampaign } from './story.js';
import { MultiplayerClient } from './multiplayer.js';
import { ShopManager, TRACER_OPTIONS } from './shop.js';
import { UIManager } from './ui.js';
import { AbilityManager, ABILITIES, ABILITY_LIST } from './abilities.js';
import { GadgetManager } from './gadgets.js';
import { DogfightManager, VEHICLE_DAMAGE_SCALE } from './dogfight.js';
const CATACLYSM_MS = 10 * 60 * 1000; // how long the centre floor stays broken
const SHATTERED_SPAWN = { x: 0, y: 3, z: 0 }; // core island on the shattered floor map


class EventHorizonGame {
  constructor() {
    this.canvas = document.getElementById('canvas-3d');
    this.gameState = 'MENU'; // 'MENU' | 'STORY' | 'MULTIPLAYER'

    // Systems
    this.auth = new AuthManager();
    this.sound = new SoundEngine();
    this.ui = new UIManager(this.auth);
    this.skins = new SkinManager();
    this.shop = new ShopManager(this.auth, this.sound);

    // Player vitals
    this.health = 100;
    this.maxHealth = 100;
    this.shield = 50;
    this.maxShield = 50;
    this.lastDamageTime = 0;
    this.isDead = false;
    this.abilities = new AbilityManager();
    this.remoteGrants = null; // grants sent by the admin during a match
    this.cataclysmAt = 0;
    this.baseMapId = 'singularity'; // the map the room is on
    this.loadedMapId = null;        // the map currently built
    this.cataclysmReadyAt = 0;
    this.lastCataclysmCheck = 0;

    // Raycaster for hit detection
    this.raycaster = new THREE.Raycaster();

    this.initThree();
    this.initModules();
    this.initUIBindings();
    this.animate = this.animate.bind(this);
    this.lastFrameTime = performance.now();

    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.baseFov = 75;
    this.camera.position.set(0, 3, 10);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;

    // Tactical Pilot Headlamp & Ambient Fill Light (crystal clear visibility)
    const headlamp = new THREE.SpotLight(0xffffff, 4.0, 50, Math.PI / 3.5, 0.4, 1.2);
    headlamp.position.set(0, 0, 0.1);
    headlamp.target.position.set(0, 0, -5);
    this.camera.add(headlamp);
    this.camera.add(headlamp.target);

    const fillLamp = new THREE.PointLight(0xffffff, 2.0, 15);
    fillLamp.position.set(0, 0, 0);
    this.camera.add(fillLamp);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initModules() {
    this.controls = new FPSControls(this.camera, this.canvas, this.sound, this.auth);
    this.weapons = new WeaponManager(this.camera, this.scene, this.sound, this.auth);
    this.maps = new MapManager(this.scene);
    this.enemies = new EnemyManager(this.scene, this.sound);
    this.story = new StoryCampaign(this.scene, this.enemies, this.maps, this.sound, this.auth);
    this.multiplayer = new MultiplayerClient(this.scene, this.skins, this.weapons, this.sound);
    this.dogfight = new DogfightManager(this.scene, {
      camera: this.camera,
      getPilots: () => this.multiplayer.getVehiclePilots(),
      isBlocked: (x, z, feetY) => this.isBlockedAt(x, z, feetY),
      notify: (text) => this.ui.addChatMessage('VEHICLE', text, true),
      onExit: (p) => this.controls.setPosition(p.x, p.y + 1.6, p.z),
      getTeam: () => this.multiplayer.team,
      spawnVehicle: (kind, team, slot) => this.multiplayer.spawnDogfightVehicle(kind, team, slot),
      getParked: () => this.multiplayer.getParked(),
      park: (id, st) => this.multiplayer.parkVehicle(id, st),
      getTargets: () => this.multiplayer.getRemotePlayerMeshes().map((p) => ({ id: p.id, pos: p.mesh.position })),
      sendHit: (id, dmg, weapon) => this.multiplayer.sendHit(id, dmg, weapon),
      hurt: (dmg) => this.takeDamage(dmg)
    });
    this.gadgets = new GadgetManager(this.scene, {
      getPilots: () => this.multiplayer.getRemotePlayerMeshes(),
      sendHit: (id, dmg, weapon) => this.multiplayer.sendHit(id, dmg, weapon),
      isBlocked: (x, z, feetY) => this.isBlockedAt(x, z, feetY)
    });
    this.multiplayer.isInvincible = () => !!(this.auth && this.auth.profile && this.auth.profile.godMode)
      || performance.now() < (this.spawnShieldUntil || 0);
    this.applyGrants();

    // Load initial menu backdrop map (The Singularity Core)
    const mapData = this.maps.loadMap('singularity');
    this.controls.setColliders(mapData.colliders);

    // Equip user profile defaults
    if (this.auth.profile.equippedWeapon) {
      this.weapons.switchWeapon(this.auth.profile.equippedWeapon);
    }
  }

  initUIBindings() {
    // Menu navigation tabs
    const navStory = document.getElementById('nav-btn-story');
    const navMP = document.getElementById('nav-btn-multiplayer');
    const navShop = document.getElementById('nav-btn-shop');
    const navSettings = document.getElementById('nav-btn-settings');
    const navAdmin = document.getElementById('nav-btn-admin');

    const viewStory = document.getElementById('view-story');
    const viewMP = document.getElementById('view-multiplayer');
    const viewShop = document.getElementById('view-shop');
    const viewSettings = document.getElementById('view-settings');
    const viewAdmin = document.getElementById('view-admin');

    const switchView = (activeBtn, activeView) => {
      [navStory, navMP, navShop, navSettings, navAdmin].forEach(b => { if (b) b.classList.remove('primary'); });
      [viewStory, viewMP, viewShop, viewSettings, viewAdmin].forEach(v => { if (v) v.style.display = 'none'; });
      activeBtn.classList.add('primary');
      activeView.style.display = 'block';
    };

    navStory.addEventListener('click', () => switchView(navStory, viewStory));
    navMP.addEventListener('click', () => {
      switchView(navMP, viewMP);
      this.fetchServerList();
    });
    navShop.addEventListener('click', () => {
      switchView(navShop, viewShop);
      this.shop.renderSkinsTab(document.getElementById('tab-content-skins'));
    });
    navSettings.addEventListener('click', () => switchView(navSettings, viewSettings));
    if (navAdmin) {
      navAdmin.addEventListener('click', () => {
        switchView(navAdmin, viewAdmin);
        this.updateAdminPanelUI();
      });
    }

    // Admin unlock check on load or event
    const checkAdminState = () => {
      if (this.auth.profile && this.auth.profile.isAdmin) {
        if (navAdmin) navAdmin.style.display = 'flex';
      }
    };
    checkAdminState();
    window.addEventListener('admin_unlocked', () => {
      checkAdminState();
      this.ui.updateUserBadge();
      alert('⚡ OVERLORD ADMIN PRIVILEGES ACTIVATED!\nThe "Admin Console" tab is now accessible in the sidebar navigation.');
    });

    // Shop Tabs
    const shopTabs = document.querySelectorAll('.shop-tabs .tab-btn');
    shopTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        shopTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;

        const skinGrid = document.getElementById('tab-content-skins');
        const wepGrid = document.getElementById('tab-content-weapons');
        const camoGrid = document.getElementById('tab-content-camos');
        const abilGrid = document.getElementById('tab-content-abilities');

        skinGrid.style.display = tab === 'skins' ? 'grid' : 'none';
        wepGrid.style.display = tab === 'weapons' ? 'grid' : 'none';
        camoGrid.style.display = tab === 'camos' ? 'grid' : 'none';
        abilGrid.style.display = tab === 'abilities' ? 'grid' : 'none';

        if (tab === 'skins') this.shop.renderSkinsTab(skinGrid);
        if (tab === 'weapons') this.shop.renderWeaponsTab(wepGrid);
        if (tab === 'camos') this.shop.renderCamosTab(camoGrid);
        if (tab === 'abilities') this.shop.renderAbilitiesTab(abilGrid);
      });
    });

    // Story Mission Selection
    const missionCards = document.querySelectorAll('.mission-card');
    let selectedMissionId = 1;
    missionCards.forEach(card => {
      card.addEventListener('click', () => {
        missionCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedMissionId = parseInt(card.dataset.mission, 10);
      });
    });

    // Launch Story Mission
    document.getElementById('btn-start-story').addEventListener('click', () => {
      this.startStoryMode(selectedMissionId);
    });

    // Multiplayer Join Buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-join-room');
      if (btn) {
        const roomId = btn.dataset.room || 'world-hub';
        this.startMultiplayerMode(roomId);
      }
    });

    // Account & Firebase Modal
    const btnOpenAccount = document.getElementById('btn-open-account');
    const badgeFirebase = document.getElementById('firebase-status-badge');
    const modalAccount = document.getElementById('modal-account');
    const btnCloseAccount = document.getElementById('btn-close-account-modal');

    if (btnOpenAccount) btnOpenAccount.addEventListener('click', () => modalAccount.classList.remove('hidden'));
    if (badgeFirebase) {
      badgeFirebase.addEventListener('click', () => {
        modalAccount.classList.remove('hidden');
        if (tabFB) tabFB.click();
      });
    }
    btnCloseAccount.addEventListener('click', () => modalAccount.classList.add('hidden'));

    // Auth Tabs inside modal
    const tabLocal = document.getElementById('auth-tab-quick');
    const tabFB = document.getElementById('auth-tab-firebase');
    const secLocal = document.getElementById('section-auth-local');
    const secFB = document.getElementById('section-auth-firebase');

    tabLocal.addEventListener('click', () => {
      tabLocal.classList.add('primary');
      tabFB.classList.remove('primary');
      secLocal.style.display = 'block';
      secFB.style.display = 'none';
    });

    tabFB.addEventListener('click', () => {
      tabFB.classList.add('primary');
      tabLocal.classList.remove('primary');
      secLocal.style.display = 'none';
      secFB.style.display = 'block';
    });

    document.getElementById('btn-save-profile').addEventListener('click', () => {
      const name = document.getElementById('input-pilot-name').value;
      this.auth.setName(name);
      modalAccount.classList.add('hidden');
      this.sound.playKillChime();
    });

    // Firebase Cloud Authentication actions
    const btnFbSignIn = document.getElementById('btn-fb-signin');
    const btnFbSignUp = document.getElementById('btn-fb-signup');
    const btnFbGuest = document.getElementById('btn-fb-guest');
    const fbUserDisplay = document.getElementById('fb-user-display');

    if (btnFbSignIn) {
      btnFbSignIn.addEventListener('click', async () => {
        const email = document.getElementById('fb-email').value;
        const pass = document.getElementById('fb-password').value;
        if (!email || !pass) return alert('Please enter both email and password.');
        try {
          const cred = await this.auth.signInWithEmail(email, pass);
          if (fbUserDisplay) fbUserDisplay.innerText = `Signed in: ${cred.user.email}`;
          alert(`🔥 Welcome back, Pilot ${cred.user.email}! Cloud stats synced.`);
          this.sound.playKillChime();
          modalAccount.classList.add('hidden');
        } catch (err) {
          alert(`Firebase Sign-in error: ${err.message}`);
        }
      });
    }

    if (btnFbSignUp) {
      btnFbSignUp.addEventListener('click', async () => {
        const email = document.getElementById('fb-email').value;
        const pass = document.getElementById('fb-password').value;
        const callsign = this.auth.profile.name;
        if (!email || !pass) return alert('Please enter both email and password.');
        try {
          const cred = await this.auth.signUpWithEmail(email, pass, callsign);
          if (fbUserDisplay) fbUserDisplay.innerText = `Registered: ${cred.user.email}`;
          alert(`🔥 Cloud Pilot Account Created for ${cred.user.email}!`);
          this.sound.playKillChime();
          modalAccount.classList.add('hidden');
        } catch (err) {
          alert(`Firebase Registration error: ${err.message}`);
        }
      });
    }

    if (btnFbGuest) {
      btnFbGuest.addEventListener('click', async () => {
        try {
          const cred = await this.auth.signInAnonymously();
          if (fbUserDisplay) fbUserDisplay.innerText = `Guest UID: ${cred.user.uid.substring(0, 10)}...`;
          alert('⚡ Cloud Guest session established with Firebase!');
          this.sound.playKillChime();
          this.ui.updateUserBadge();
          modalAccount.classList.add('hidden');
        } catch (err) {
          // If anonymous auth is not enabled in Firebase Console, fallback gracefully
          await this.auth.simulateCloudLogin();
          alert('⚡ Cloud session connected! +500 CR bonus added.');
          this.ui.updateUserBadge();
          modalAccount.classList.add('hidden');
        }
      });
    }

    // Settings Inputs
    document.getElementById('input-sens').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.controls.mouseSensitivity = val * 0.0011;
      document.getElementById('val-sens').innerText = val.toFixed(1);
    });

    document.getElementById('input-fov').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.baseFov = val;
      this.camera.fov = val;
      this.camera.updateProjectionMatrix();
      document.getElementById('val-fov').innerText = val;
    });

    document.getElementById('input-sfx').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      this.sound.setSFXVolume(val);
      document.getElementById('val-sfx').innerText = e.target.value;
    });

    document.getElementById('input-music').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      this.sound.setMusicVolume(val);
      document.getElementById('val-music').innerText = e.target.value;
    });

    // Pause Menu Controls
    document.getElementById('btn-resume-game').addEventListener('click', () => {
      this.controls.lock();
    });
    document.getElementById('btn-toggle-sound').addEventListener('click', () => {
      this.sound.toggleMute();
    });
    document.getElementById('btn-exit-to-menu').addEventListener('click', () => {
      this.returnToMenu();
    });

    // Pointer lock events
    window.addEventListener('pointer_lock_change', (e) => {
      if (this.strike) return; // the overhead targeting view frees the mouse on purpose
      if (!e.detail.isLocked && this.gameState !== 'MENU') {
        this.ui.togglePauseMenu(true);
      } else {
        this.ui.togglePauseMenu(false);
      }
    });

    // Aim down sights with right mouse (hold)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 && this.controls.isLocked && !this.isDead) this.weapons.aiming = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.weapons.aiming = false;
    });
    window.addEventListener('pointer_lock_change', (e) => {
      if (!e.detail.isLocked) this.weapons.aiming = false;
    });

    // Airstrike targeting: left click calls the strike, right click or Escape cancels
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.strike) return;
      if (e.button === 0) {
        const pt = this.pickGround(e.clientX, e.clientY);
        if (pt) this.endAirstrike(pt);
      } else if (e.button === 2) {
        this.endAirstrike(null);
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.strike) this.strike.mouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('keydown', (e) => {
      if (this.strike && e.code === 'Escape') this.endAirstrike(null);
    });

    // Hold Z to scope in (the same zoom as right-click aim, also works in a jet or car)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyZ' && !e.repeat && this.controls.isLocked && !this.isDead) this.weapons.aiming = true;
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyZ') this.weapons.aiming = false;
    });

    // Shooting with Left Click
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.controls.isLocked && !this.isDead) {
        this.triggerPlayerShoot();
      }
    });

    // Keybindings: 1-4 for weapons, R for reload
    document.addEventListener('keydown', (e) => {
      if (!this.controls.isLocked) return;
      if (e.code === 'KeyR') {
        this.weapons.reload();
      } else if (e.code === 'Digit1') {
        this.weapons.switchWeapon('rifle');
      } else if (e.code === 'Digit2') {
        this.weapons.switchWeapon('shotgun');
      } else if (e.code === 'Digit3') {
        this.weapons.switchWeapon('railgun');
      } else if (e.code === 'Digit4') {
        this.weapons.switchWeapon('blaster');
      } else if (e.code === 'KeyE') {
        this.useAbility('E');
      } else if (e.code === 'KeyQ') {
        this.useAbility('Q');
      } else if (e.code === 'KeyX') {
        this.triggerSingularityCollapse();
      } else if (e.code === 'KeyV') {
        // Board or leave a jet or garage car (dogfight server only)
        if (this.gameState === 'MULTIPLAYER' && this.multiplayer.currentRoom === 'dogfight') {
          const boarded = this.dogfight.toggleBoard(this.camera.position, this.multiplayer.team);
          if (boarded) this.controls.yaw = this.dogfight.hYaw;
        }
      } else if (e.code === 'KeyG') {
        // Fire a missile from the jet (dogfight server, jet pilot only)
        if (this.gameState === 'MULTIPLAYER' && this.multiplayer.currentRoom === 'dogfight') this.dogfight.fireMissile();
      } else if (e.code === 'KeyF') {
        // Spawn a jet or garage car at a terminal (dogfight server only)
        if (this.gameState === 'MULTIPLAYER' && this.multiplayer.currentRoom === 'dogfight') {
          this.dogfight.useTerminal(this.camera.position, this.multiplayer.team);
        }
      }
    });

    // Event listeners from multiplayer & story
    // When the server confirms our join, move us to our spawn point
    window.addEventListener('multiplayer_joined', (e) => {
      const sp = e.detail && e.detail.spawn;
      if (sp && this.gameState === 'MULTIPLAYER') {
        this.controls.setPosition(sp.x, sp.y + 2, sp.z);
      }
    });

    window.addEventListener('kill_feed_event', (e) => {
      this.ui.addKillFeed(e.detail.killerName, e.detail.victimName, e.detail.weapon);
    });

    window.addEventListener('chat_message_received', (e) => {
      this.ui.addChatMessage(e.detail.sender, e.detail.text, e.detail.isSystem);
    });

    window.addEventListener('self_damaged', (e) => {
      // The multiplayer client applies the damage; show the new health and shield here
      this.health = e.detail.health;
      this.shield = e.detail.shield;
      this.lastDamageTime = performance.now();
      if (e.detail.damage > 0) {
        this.ui.triggerDamageFlash();
        this.sound.playPlayerHurt();
      }
      this.ui.updateVitals(this.health, this.maxHealth, this.shield, this.maxShield);
    });

    window.addEventListener('self_killed', (e) => {
      this.handlePlayerDeath(e.detail.killerName || 'The Void', e.detail.killerId || null);
    });

    window.addEventListener('player_fell_into_void', () => {
      this.takeDamage(50);
    });

    window.addEventListener('mission_completed', (e) => {
      alert(`🎉 MISSION COMPLETE!\n+${e.detail.creditReward} Credits earned!`);
      this.returnToMenu();
    });

    // Admin Console Button Actions
    const btnGod = document.getElementById('btn-admin-godmode');
    const btnAmmo = document.getElementById('btn-admin-infammo');
    const btnSpeed = document.getElementById('btn-admin-speed');
    const btnGrav = document.getElementById('btn-admin-gravity');
    const btnUnlock = document.getElementById('btn-admin-unlockall');

    if (btnGod) {
      btnGod.addEventListener('click', () => {
        this.auth.toggleGodMode();
        this.sound.playKillChime();
        this.updateAdminPanelUI();
      });
    }

    if (btnAmmo) {
      btnAmmo.addEventListener('click', () => {
        this.auth.toggleInfiniteAmmo();
        this.sound.playKillChime();
        this.updateAdminPanelUI();
      });
    }

    if (btnSpeed) {
      btnSpeed.addEventListener('click', () => {
        this.auth.toggleSuperSpeed();
        this.sound.playKillChime();
        this.updateAdminPanelUI();
      });
    }

    if (btnGrav) {
      btnGrav.addEventListener('click', () => {
        this.auth.toggleMoonGravity();
        this.sound.playKillChime();
        this.updateAdminPanelUI();
      });
    }

    if (btnUnlock) {
      btnUnlock.addEventListener('click', () => {
        this.auth.unlockAllCheats();
        this.sound.playKillChime();
        this.ui.updateUserBadge();
        alert('👑 ALL SUITS, WEAPONS & CAMOS UNLOCKED (+100,000 CR)!');
      });
    }

    window.addEventListener('abilities_changed', () => {
      this.applyGrants();
      this.ui.updateUserBadge();
    });

    this.buildSelfGrantPanel();
    this.buildScopeOverlay();
    window.addEventListener('room_state', (e) => this.onRoomState(e.detail));

    window.addEventListener('grants_updated', (e) => {
      this.remoteGrants = e.detail || null;
      this.applyGrants();
    });

    // Admin Landscape Shift (For all players)
    document.querySelectorAll('.btn-admin-setmap').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetMap = btn.dataset.map || 'singularity';
        try {
          // Connects first, so the change is saved even from the main menu
          await this.multiplayer.setRoomMap(targetMap);
        } catch (e) {
          alert('Could not change the map. ' + (e && e.message ? e.message : e));
          return;
        }
        const mapData = this.maps.loadMap(targetMap);
        this.controls.setColliders(mapData.colliders);
        this.sound.playKillChime();
        alert(`🛰️ Sector landscape shifted to ${targetMap.toUpperCase()}!`);
      });
    });

    // Admin Global Broadcast
    const btnBroadcast = document.getElementById('btn-admin-send-broadcast');
    if (btnBroadcast) {
      btnBroadcast.addEventListener('click', () => {
        const input = document.getElementById('admin-broadcast-input');
        const text = input ? input.value.trim() : '';
        if (text) {
          this.multiplayer.sendAdminAction('broadcast', null, { text: text });
          this.ui.addChatMessage('⚡ OVERLORD ADMIN', text, true);
          input.value = '';
          this.sound.playKillChime();
        }
      });
    }

    // Admin: delete every pilot record in the room, then reload the roster
    const btnClearPlayers = document.getElementById('btn-admin-clear-players');
    if (btnClearPlayers) {
      btnClearPlayers.addEventListener('click', async () => {
        if (!confirm('Delete ALL pilots in this room? Live players will reappear when they next move.')) return;
        try {
          await this.multiplayer.connectAdminOnly();
          await this.multiplayer.clearRoomPlayers();
          this.multiplayer.requestAdminPlayerList();
        } catch (e) {
          alert('Could not delete the pilots. The database rules may not allow it. ' + (e && e.message ? e.message : ''));
        }
      });
    }

    // Admin Refresh Player Roster
    const btnRefPlayers = document.getElementById('btn-admin-refresh-players');
    if (btnRefPlayers) {
        btnRefPlayers.addEventListener('click', async () => {
        try {
          await this.multiplayer.connectAdminOnly();
          this.multiplayer.requestAdminPlayerList();
        } catch (e) {
          this.renderAdminPlayerRoster([{
            id: 'local_pilot',
            name: this.auth.profile.name,
            skin: this.auth.profile.equippedSkin,
            health: this.health,
            shield: this.shield
          }]);
        }
      });
    }

    // Multiplayer Admin Events
    window.addEventListener('admin_player_list_received', (e) => {
      this.renderAdminPlayerRoster(e.detail || []);
    });

    window.addEventListener('admin_credit_grant', (e) => {
      this.auth.addCredits(e.detail.amount);
      this.ui.updateUserBadge();
      this.sound.playKillChime();
      alert(`🎁 The Overlord Admin granted you +${e.detail.amount.toLocaleString()} Credits!`);
    });

    window.addEventListener('room_map_changed', (e) => {
      this.baseMapId = e.detail.map;
      this.sound.playKillChime();
      this.syncCataclysm();
    });
  }

  // ---------- singularity collapse (admin) ----------

  // Shows the shattered floor map while a collapse runs, and the room's own map otherwise
  syncCataclysm() {
    if (this.gameState !== 'MULTIPLAYER') return;
    const collapsing = this.cataclysmAt > 0 && this.multiplayer.now() - this.cataclysmAt < CATACLYSM_MS;
    const target = collapsing ? 'shattered' : (this.baseMapId || 'singularity');
    if (target !== this.loadedMapId) {
      const mapData = this.maps.loadMap(target);
      this.loadedMapId = target;
      this.controls.setColliders(mapData.colliders);
      const sp = mapData.spawnPoints[0];
      if (sp) this.controls.setPosition(sp.x, sp.y, sp.z);
    }
    this.controls.voidRespawn = collapsing ? SHATTERED_SPAWN : null;
  }

  triggerSingularityCollapse() {
    if (!(this.auth.profile && this.auth.profile.isAdmin)) return;
    if (this.gameState !== 'MULTIPLAYER' || this.baseMapId !== 'singularity') {
      this.ui.addChatMessage('⚡ COLLAPSE', 'Singularity Collapse only works on the Singularity Core map.', true);
      return;
    }
    const left = this.cataclysmReadyAt - performance.now();
    if (left > 0) {
      this.ui.addChatMessage('⚡ COLLAPSE', `Recharging: ${Math.ceil(left / 1000)}s left.`, true);
      return;
    }
    if (!confirm('Trigger the Singularity Collapse? Everyone on this server except you will be killed, and the room moves to the shattered floor for 10 minutes.')) return;
    const at = this.multiplayer.triggerCataclysm(this.baseMapId);
    if (at) {
      this.cataclysmReadyAt = performance.now() + CATACLYSM_MS;
      // Apply the collapse here at once; the server's copy of the same collapse is then ignored
      this.onRoomState({
        base: this.baseMapId,
        collapse: { at, byId: this.multiplayer.myUid, by: this.multiplayer.myName },
        firstTime: false
      });
    }
  }

  // Everything about the room's map arrives here: the base map and any collapse
  onRoomState({ base, collapse, firstTime }) {
    if (base) {
      if (!firstTime && base !== this.baseMapId) this.sound.playKillChime();
      this.baseMapId = base;
    }
    const isNew = !!collapse && collapse.at !== this.cataclysmAt;
    this.cataclysmAt = collapse ? collapse.at : 0;
    if (isNew && !firstTime) {
      this.onCataclysm(collapse);
      return;
    }
    this.syncCataclysm();
  }

  onCataclysm(detail) {
    this.cataclysmAt = detail.at;
    if (this.gameState !== 'MULTIPLAYER') return;
    this.ui.addChatMessage('⚡ COLLAPSE', `${detail.by} triggered a singularity collapse!`, true);
    this.ui.triggerDamageFlash();
    this.sound.playPlayerHurt();
    // The admin who triggered it survives; everyone else in the room is killed
    const triggeredByMe = !!detail.byId && detail.byId === this.multiplayer.myUid;
    if (!triggeredByMe && !this.isDead) this.multiplayer.die(detail.byId, detail.by, 'Singularity Collapse');
    this.syncCataclysm();
    this.maps.playBlast();
  }

  // Draws the grappling hook's line from the hand to its anchor (local to this player)
  updateRope() {
    const g = this.controls.grapple;
    if (!g) {
      if (this.ropeLine) this.ropeLine.visible = false;
      return;
    }
    if (!this.ropeLine) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.ropeLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00f0ff }));
      this.ropeLine.frustumCulled = false;
      this.scene.add(this.ropeLine);
    }
    const anchor = g.box.min.clone().add(g.offset);
    const hand = this.camera.localToWorld(new THREE.Vector3(0.2, -0.15, -0.5));
    const pos = this.ropeLine.geometry.attributes.position;
    pos.setXYZ(0, hand.x, hand.y, hand.z);
    pos.setXYZ(1, anchor.x, anchor.y, anchor.z);
    pos.needsUpdate = true;
    this.ropeLine.visible = true;
  }

  buildScopeOverlay() {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed; inset:0; pointer-events:none; opacity:0; z-index:40; background:radial-gradient(circle at 50% 50%, transparent 0 28vmin, rgba(0,0,0,0.92) 29vmin);';
    o.innerHTML = '<div style="position:absolute; left:50%; top:50%; width:58vmin; height:58vmin; margin:-29vmin 0 0 -29vmin; border:2px solid rgba(0,240,255,0.5); border-radius:50%;"></div>'
      + '<div style="position:absolute; left:0; right:0; top:50%; height:1px; background:rgba(0,240,255,0.5);"></div>'
      + '<div style="position:absolute; top:0; bottom:0; left:50%; width:1px; background:rgba(0,240,255,0.5);"></div>';
    document.body.appendChild(o);
    this.scopeOverlay = o;
  }

  // ---------- grants, speed, flight and abilities ----------

  effectiveGrants() {
    const saved = (this.auth.profile && this.auth.profile.grants) || {};
    return this.remoteGrants || {
      speedLevel: saved.speedLevel || 0,
      fly: !!saved.fly,
      abilities: saved.abilities || []
    };
  }

  applyGrants() {
    const g = this.effectiveGrants();
    this.controls.grants = { speedLevel: g.speedLevel || 0, fly: !!g.fly };

    // Granted abilities come first, then the ones this level unlocks
    const level = (this.auth.profile && this.auth.profile.level) || 1;
    const available = [...new Set([...(g.abilities || []), ...this.abilities.unlockedFor(level, this.auth.profile.unlockedAbilities || [])])];
    // Use the slots the player chose, if they are still available; fill the rest in order
    const saved = (this.auth.profile && this.auth.profile.equippedAbilities) || {};
    const pickE = available.includes(saved.E) ? saved.E : null;
    const pickQ = available.includes(saved.Q) && saved.Q !== pickE ? saved.Q : null;
    const fill = available.filter((id) => id !== pickE && id !== pickQ);
    this.abilities.slots = { E: null, Q: null };
    this.abilities.equip('E', pickE || fill.shift() || null, available);
    this.abilities.equip('Q', pickQ || fill.shift() || null, available);
  }

  useAbility(slot) {
    if (this.gameState === 'MENU' || this.isDead || this.gadgets.car || this.strike) return;
    const res = this.abilities.use(slot, this.abilityContext());
    if (res.ok) {
      this.ui.addChatMessage('⚡ ABILITY', res.hits ? `${res.name} hit ${res.hits}` : res.name, true);
    }
  }

  // ---------- airstrike targeting ----------
  beginAirstrike(onConfirm) {
    if (this.strike || this.gameState === 'MENU' || this.isDead) return;
    this.strike = {
      onConfirm,
      origin: this.camera.position.clone(),
      mouse: null
    };
    this.gadgets.createReticle();
    if (this.controls.isLocked) this.controls.unlock();
  }

  // point is the ground spot to strike, or null to cancel
  endAirstrike(point) {
    const s = this.strike;
    if (!s) return;
    this.strike = null;
    this.gadgets.hideReticle();
    this.controls.setPosition(s.origin.x, s.origin.y, s.origin.z);
    if (point) {
      this.gadgets.callStrike(point.x, point.z);
      s.onConfirm();
    }
    this.controls.lock();
  }

  // Overhead view of the map, with the reticle under the mouse
  updateStrikeView() {
    const s = this.strike;
    this.camera.position.set(s.origin.x, 90, s.origin.z);
    this.camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
    if (s.mouse) {
      const pt = this.pickGround(s.mouse.x, s.mouse.y);
      if (pt) this.gadgets.moveReticle(pt.x, pt.z);
    }
  }

  // Where the mouse points on the ground (y = 0), or null
  pickGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return rc.ray.intersectPlane(plane, hit) ? hit : null;
  }

  // True if a body standing at feetY would overlap a wall or block at (x, z)
  isBlockedAt(x, z, feetY) {
    const boxes = this.controls.colliders || [];
    return boxes.some((b) => b.min && b.max &&
      x > b.min.x - 0.4 && x < b.max.x + 0.4 &&
      z > b.min.z - 0.4 && z < b.max.z + 0.4 &&
      b.max.y > feetY + 0.2 && b.min.y < feetY + 1.6);
  }

  abilityContext() {
    const cam = this.camera.position;
    const dir = this.controls.getForwardDirection();
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();

    let enemies = [];
    if (this.gameState === 'STORY') {
      const list = [...this.enemies.enemies];
      if (this.enemies.boss) list.push(this.enemies.boss);
      enemies = list.map((e) => ({ pos: e.mesh.position, kind: 'enemy', ref: e }));
    } else if (this.gameState === 'MULTIPLAYER') {
      enemies = this.multiplayer.getRemotePlayerMeshes().map((p) => ({ pos: p.mesh.position, kind: 'pilot', ref: p }));
    }

    return {
      pos: { x: cam.x, y: cam.y, z: cam.z },
      dir: { x: flat.x, z: flat.z },
      enemies,
      damageEnemy: (e, amount) => {
        if (e.kind === 'enemy') this.enemies.damageEnemy(e.ref.id, amount);
        else if (e.kind === 'pilot') this.multiplayer.sendHit(e.ref.id, amount, 'Ability');
      },
      stunEnemy: () => {}, // stun is not built yet
      pullEnemy: (e, x, z) => {
        if (e.kind === 'enemy') { e.pos.x += (x - e.pos.x) * 0.5; e.pos.z += (z - e.pos.z) * 0.5; }
      },
      dash: (vx, vz) => { this.controls.velocity.x = vx; this.controls.velocity.z = vz; },
      startAirstrike: (onConfirm) => this.beginAirstrike(onConfirm),
      deployCar: () => this.gadgets.deployCar(cam.x, cam.y - 1.6, cam.z, this.controls.yaw),
      deployTurret: () => this.gadgets.deployTurret(cam.x, cam.y - 1.6, cam.z),
      deployMine: () => this.gadgets.deployMine(cam.x, cam.y - 1.6, cam.z),
      deployDecoy: () => this.gadgets.deployDecoy(cam.x, cam.y - 1.6, cam.z, this.controls.yaw),
      blink: (dist) => {
        // Try the full distance first, then shorter, and stop before a wall
        for (let s = dist; s >= 2; s -= 1) {
          const x = cam.x + flat.x * s;
          const z = cam.z + flat.z * s;
          if (!this.isBlockedAt(x, z, cam.y - 1.6)) {
            this.controls.setPosition(x, cam.y, z);
            return true;
          }
        }
        return false;
      },
      addShield: (n) => {
        this.shield = Math.min(this.maxShield, this.shield + n);
        this.ui.updateVitals(this.health, this.maxHealth, this.shield, this.maxShield);
      }
    };
  }

  updateAbilityHUD() {
    if (!this.abilityHud) return;
    const show = this.gameState !== 'MENU';
    this.abilityHud.style.display = show ? 'flex' : 'none';
    if (!show) return;
    const xEl = this.abilityHud.querySelector('[data-slot="X"]');
    const isAdmin = !!(this.auth.profile && this.auth.profile.isAdmin);
    xEl.style.display = isAdmin ? '' : 'none';
    if (isAdmin) {
      const left = this.cataclysmReadyAt - performance.now();
      xEl.textContent = left > 0 ? `X: COLLAPSE (${Math.ceil(left / 1000)}s)` : 'X: COLLAPSE READY';
      xEl.style.opacity = left > 0 ? '0.5' : '1';
    }
    ['E', 'Q'].forEach((slot) => {
      const id = this.abilities.slots[slot];
      const def = id ? ABILITIES[id] : null;
      const cd = this.abilities.cooldownLeft(slot);
      const el = this.abilityHud.querySelector(`[data-slot="${slot}"]`);
      el.textContent = def ? `${slot}: ${def.name}${cd > 0 ? ` (${cd.toFixed(1)}s)` : ' READY'}` : `${slot}: —`;
      el.style.opacity = def && cd <= 0 ? '1' : '0.5';
    });
  }

  buildSelfGrantPanel() {
    // Ability HUD at the bottom of the screen
    const hud = document.createElement('div');
    hud.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); display:none; gap:24px; z-index:50; font-family:var(--font-display); font-size:0.85rem; color:var(--primary-cyan); text-shadow:0 0 8px rgba(0,240,255,0.6); pointer-events:none;';
    hud.innerHTML = '<span data-slot="E"></span><span data-slot="Q"></span><span data-slot="X"></span>';
    document.body.appendChild(hud);
    this.abilityHud = hud;

    // Your own powers in the admin console
    const view = document.getElementById('view-admin');
    if (!view) return;
    const sec = document.createElement('div');
    sec.style.cssText = 'background:rgba(181,123,255,0.07); border:1px solid rgba(181,123,255,0.3); border-radius:6px; padding:16px; margin-bottom:20px;';
    sec.innerHTML = '<h4 style="font-family:var(--font-display); color:#b57bff; margin-bottom:12px; letter-spacing:1px;">0. YOUR POWERS (FOR YOURSELF)</h4><div id="self-grant-buttons" style="display:flex; gap:8px; flex-wrap:wrap;"></div>';
    view.insertBefore(sec, view.children[1] || null);

    const root = sec.querySelector('#self-grant-buttons');
    const applySelf = (next) => {
      this.auth.profile.grants = next;
      this.auth.save();
      this.applyGrants();
      this.renderGrantControls(root, next, applySelf);
    };
    const saved = this.auth.profile.grants || {};
    this.renderGrantControls(root, {
      speedLevel: saved.speedLevel || 0,
      fly: !!saved.fly,
      abilities: saved.abilities || []
    }, applySelf);
  }

  // Draws speed, flight and ability buttons into root. onChange receives the new state.
  renderGrantControls(root, state, onChange) {
    const speedNames = ['SPEED: OFF', 'SPEED ×1.5', 'SPEED ×2.5', 'SPEED ×4'];
    const copy = () => ({ speedLevel: state.speedLevel, fly: state.fly, abilities: [...state.abilities] });
    root.innerHTML = '';

    const button = (label, active, onClick) => {
      const b = document.createElement('button');
      b.className = 'sci-btn' + (active ? ' primary' : '');
      b.style.cssText = 'padding:5px 8px; font-size:0.7rem;';
      b.textContent = label;
      b.addEventListener('click', onClick);
      root.appendChild(b);
    };

    button(speedNames[state.speedLevel], state.speedLevel > 0, () => {
      const next = copy();
      next.speedLevel = (state.speedLevel + 1) % 4;
      onChange(next);
    });
    button(state.fly ? 'FLY: ON' : 'FLY: OFF', state.fly, () => {
      const next = copy();
      next.fly = !state.fly;
      onChange(next);
    });
    ABILITY_LIST.forEach((a) => {
      const on = state.abilities.includes(a.id);
      button(a.name, on, () => {
        const next = copy();
        next.abilities = on ? next.abilities.filter((id) => id !== a.id) : [...next.abilities, a.id];
        onChange(next);
      });
    });
  }

  updateAdminPanelUI() {
    const p = this.auth.profile;
    const vGod = document.getElementById('val-admin-god');
    const vAmmo = document.getElementById('val-admin-ammo');
    const vSpeed = document.getElementById('val-admin-speed');
    const vGrav = document.getElementById('val-admin-grav');

    if (vGod) {
      vGod.innerText = p.godMode ? 'ON (ACTIVE)' : 'OFF';
      vGod.style.color = p.godMode ? '#00ff88' : '#ff0055';
    }
    if (vAmmo) {
      vAmmo.innerText = p.infiniteAmmo ? 'ON (ACTIVE)' : 'OFF';
      vAmmo.style.color = p.infiniteAmmo ? '#00ff88' : '#ff0055';
    }
    if (vSpeed) {
      vSpeed.innerText = p.superSpeed ? 'ON (ACTIVE)' : 'OFF';
      vSpeed.style.color = p.superSpeed ? '#00ff88' : '#ff0055';
    }
    if (vGrav) {
      vGrav.innerText = p.moonGravity ? 'ON (ACTIVE)' : 'OFF';
      vGrav.style.color = p.moonGravity ? '#00ff88' : '#ff0055';
    }
  }

  renderAdminPlayerRoster(players = []) {
    const container = document.getElementById('admin-players-container');
    if (!container) return;
    container.innerHTML = '';

    if (players.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted); font-size:0.88rem;">No other pilots currently detected in this sector.</div>';
      return;
    }

    players.forEach(p => {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(15,23,42,0.8); border:1px solid rgba(0,240,255,0.25); padding:12px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;';
      card.innerHTML = `
        <div>
          <div style="font-family:var(--font-display); font-size:1.05rem; color:var(--primary-cyan); font-weight:bold;">
            ${p.name} <span style="font-size:0.75rem; color:var(--text-muted);">[ID: ${p.id ? p.id.substring(0,8) : 'local'}]</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">
            SUIT: <b style="color:#fff;">${p.skin || 'vanguard'}</b> | HP: <b style="color:#00ff88;">${p.health || 100}</b> | SHIELD: <b style="color:#4cc9f0;">${p.shield || 50}</b>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="sci-btn danger btn-adm-kill" data-id="${p.id}" style="padding:6px 10px; font-size:0.75rem;">⚡ VAPORIZE</button>
          <button class="sci-btn btn-adm-heal" data-id="${p.id}" style="padding:6px 10px; font-size:0.75rem;">💖 500 HP</button>
          <button class="sci-btn btn-adm-cred" data-id="${p.id}" style="padding:6px 10px; font-size:0.75rem;">💰 +10K CR</button>
          <button class="sci-btn btn-adm-skin" data-id="${p.id}" style="padding:6px 10px; font-size:0.75rem;">👕 CELESTIAL</button>
          <button class="sci-btn danger btn-adm-kick" data-id="${p.id}" style="padding:6px 10px; font-size:0.75rem;">🚪 KICK</button>
        </div>
      `;

      card.querySelector('.btn-adm-kill').addEventListener('click', () => {
        this.multiplayer.sendAdminAction('kill_player', p.id);
        this.sound.playKillChime();
      });

      card.querySelector('.btn-adm-heal').addEventListener('click', () => {
        this.multiplayer.sendAdminAction('heal_player', p.id);
        this.sound.playKillChime();
      });

      card.querySelector('.btn-adm-cred').addEventListener('click', () => {
        this.multiplayer.sendAdminAction('grant_credits', p.id, { amount: 10000 });
        this.sound.playKillChime();
        alert(`Sent +10,000 CR to ${p.name}!`);
      });

      card.querySelector('.btn-adm-skin').addEventListener('click', () => {
        this.multiplayer.sendAdminAction('force_skin', p.id, { skin: 'celestial' });
        this.sound.playKillChime();
      });

      card.querySelector('.btn-adm-kick').addEventListener('click', () => {
        this.multiplayer.sendAdminAction('kick_player', p.id);
        this.sound.playKillChime();
      });

      // Grant controls for this pilot (speed, flight, abilities)
      this.adminGrants = this.adminGrants || {};
      const grantBox = document.createElement('div');
      grantBox.style.cssText = 'width:100%; display:flex; gap:6px; flex-wrap:wrap;';
      card.appendChild(grantBox);
      const applyPilotGrants = (next) => {
        this.adminGrants[p.id] = next;
        this.multiplayer.sendAdminAction('set_grants', p.id, { grants: next });
        this.renderGrantControls(grantBox, next, applyPilotGrants);
      };
      this.renderGrantControls(grantBox, this.adminGrants[p.id] || { speedLevel: 0, fly: false, abilities: [] }, applyPilotGrants);

      container.appendChild(card);
    });
  }

  fetchServerList() {
  this.multiplayer.fetchRoomList()
    .then(rooms => {
      const countSpans = document.querySelectorAll('.srv-count');
      rooms.forEach((r, i) => {
        if (countSpans[i]) {
          countSpans[i].innerText = `ONLINE PILOTS: ${r.playerCount}`;
        }
      });
    })
    .catch(error => {
      console.error('Could not load multiplayer server list:', error);
    });
}
  // Switch to the weapon the player equipped in the Armory
  equipChosenWeapon() {
    const id = this.auth.profile.equippedWeapon;
    if (id && this.weapons.weapons[id]) this.weapons.switchWeapon(id);
  }

  startStoryMode(missionId = 1) {
    this.gameState = 'STORY';
    this.resetVitals();
    this.equipChosenWeapon();
    const mapData = this.story.startMission(missionId);
    this.controls.setColliders(mapData.colliders);

    if (mapData.spawnPoints.length > 0) {
      const sp = mapData.spawnPoints[0];
      this.controls.setPosition(sp.x, sp.y, sp.z);
    }

    this.ui.showHUD();
    this.controls.lock();
    this.sound.resume();
  }

  startMultiplayerMode(roomId = 'world-hub') {
    this.gameState = 'MULTIPLAYER';
    this.resetVitals();
    this.equipChosenWeapon();

    let mapId = 'singularity';
    if (roomId === 'aegis-station') mapId = 'station';
    if (roomId === 'mars-outpost') mapId = 'mars';
    if (roomId === 'cyber-void') mapId = 'cyber';
    if (roomId === 'halo-city') mapId = 'halo';
    if (roomId === 'dogfight') mapId = 'dogfight';

    const mapData = this.maps.loadMap(mapId);
    this.controls.setColliders(mapData.colliders);
    this.baseMapId = mapId;
    this.loadedMapId = mapId;
    this.syncCataclysm();

    this.multiplayer.connect(
      roomId,
      this.auth.profile.name,
      this.auth.profile.equippedSkin,
      this.auth.profile.equippedWeapon
    );

    this.ui.showHUD();
    this.controls.lock();
    this.sound.resume();

    // Hide story objective HUD in open multiplayer
    const objEl = document.getElementById('hud-objective');
    if (objEl) objEl.style.display = 'none';
  }

  returnToMenu() {
    this.gameState = 'MENU';
    this.controls.unlock();
    this.multiplayer.disconnect();
    this.gadgets.clearAll();
    this.remoteGrants = null;
    this.applyGrants();
    this.story.isMissionActive = false;
    this.enemies.clear();

    const mapData = this.maps.loadMap('singularity');
    this.controls.setColliders(mapData.colliders);
    this.controls.setPosition(0, 3, 10);

    this.ui.showMainMenu();
  }

  resetVitals() {
    this.health = 100;
    this.shield = 50;
    this.isDead = false;
    this.ui.updateVitals(this.health, this.maxHealth, this.shield, this.maxShield);
  }

  takeDamage(amount) {
    if (this.isDead) return;
    if (this.auth && this.auth.profile && this.auth.profile.godMode) return; // God Mode invincible
    if (this.dogfight.active) amount *= VEHICLE_DAMAGE_SCALE; // armoured jet and car
    this.lastDamageTime = performance.now();

    if (this.shield > 0) {
      if (this.shield >= amount) {
        this.shield -= amount;
        amount = 0;
      } else {
        amount -= this.shield;
        this.shield = 0;
      }
    }

    this.health = Math.max(0, this.health - amount);
    this.ui.triggerDamageFlash();
    this.sound.playPlayerHurt();
    this.ui.updateVitals(this.health, this.maxHealth, this.shield, this.maxShield);

    if (this.health <= 0) {
      this.handlePlayerDeath('Combat Hostile');
    }
  }

  pickRespawnPoint() {
    const foes = this.multiplayer.getRemotePlayerMeshes().map((p) => p.mesh.position);
    return pickSafeSpawn(this.maps.currentSpawns, foes);
  }

  handlePlayerDeath(killer, killerId = null) {
    if (this.isDead) return;
    this.isDead = true;
    if (this.strike) this.endAirstrike(null);
    this.dogfight.forceExit();
    this.gadgets.clearAll();
    this.auth.recordDeath();
    this.sound.playPlayerHurt();

    this.ui.addKillFeed(killer, this.auth.profile.name, 'Vaporizer');

    // For 2 seconds: look through the killer's eyes, or fall over where you stand
    if (this.gameState === 'MULTIPLAYER') this.multiplayer.markDead();

    // Your body falls where you stood. Only you can see it: it is not sent to other pilots.
    const base = this.camera.position.clone();
    const body = this.skins.createPlayerModel(this.auth.profile.equippedSkin, this.auth.profile.name);
    body.position.set(base.x, base.y - 1.6, base.z);
    body.rotation.y = this.controls.yaw;
    this.scene.add(body);
    this.deathBody = body;
    this.deathView = { start: performance.now(), base, yaw: this.controls.yaw };

    // After the death view: in a match, pick where to respawn; otherwise respawn at once
    setTimeout(() => {
      this.deathView = null;
      this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0, 'YXZ');
      if (this.gameState === 'MULTIPLAYER') {
        this.showRespawnPicker();
      } else {
        this.finishRespawn(this.controls.voidRespawn || { x: 0, y: 4, z: 0 }, false);
      }
    }, 2000);
  }

  // Puts the player back in the world at a chosen spawn
  finishRespawn(sp, inMatch) {
    const panel = document.getElementById('respawn-picker');
    if (panel) panel.style.display = 'none';
    if (this.deathBody) { this.scene.remove(this.deathBody); this.deathBody = null; }
    if (inMatch) this.multiplayer.sendRespawn();
    this.resetVitals();
    this.controls.setPosition(sp.x, sp.y, sp.z);
    if (inMatch) this.spawnShieldUntil = performance.now() + 2500;
  }

  // Shows a RESPAWN button. Clicking it respawns at a random spawn point
  // that has no living pilot within 15 metres (any spawn if none is clear).
  showRespawnPicker() {
    let panel = document.getElementById('respawn-picker');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'respawn-picker';
      panel.style.cssText = 'position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); font-family:var(--font-display);';
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <div style="background:#05070d; border:1px solid var(--primary-cyan); border-radius:8px; padding:24px; max-width:360px; width:calc(100% - 32px); text-align:center;">
        <h3 style="color:var(--primary-cyan); margin-bottom:16px; letter-spacing:1px;">YOU DIED</h3>
        <button class="sci-btn primary" id="respawn-button" style="width:100%; justify-content:center; padding:12px;">RESPAWN</button>
      </div>`;
    panel.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();
    panel.querySelector('#respawn-button').addEventListener('click', () => {
      // The click counts as a user gesture, so the mouse can be captured again for shooting
      this.controls.lock();
      this.finishRespawn(this.pickRandomSpawn(), true);
    });
  }

  // Random spawn point with no living pilot within 15 metres
  pickRandomSpawn() {
    const foes = this.multiplayer.getRemotePlayerMeshes().map((p) => p.mesh.position);
    let spawns = this.maps.currentSpawns || [];
    // Dogfight: respawn on your own team's side
    if (this.multiplayer.currentRoom === 'dogfight' && this.multiplayer.team) {
      const side = this.multiplayer.team;
      spawns = spawns.filter((s) => (side === 'red' ? s.x < 0 : s.x > 0));
    }
    const safe = spawns.filter((s) => foes.every((f) => Math.hypot(f.x - s.x, f.z - s.z) >= 15));
    const pool = safe.length ? safe : spawns;
    if (pool.length === 0) return { x: 0, y: 4, z: 0 };
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Dogfight: shows or hides the vehicles, keeps the score and round up to date, and shares
  // your vehicle with other pilots. Runs every frame, whatever the game state.
  dogfightFrame(delta) {
    const inDog = this.gameState === 'MULTIPLAYER' && this.multiplayer.currentRoom === 'dogfight';
    this.dogfight.setEnabled(inDog);
    if (!inDog || !this.dogfight.active) {
      this.multiplayer.vehicleInfo = null;
      this.multiplayer.vehicleVeh = null;
    }
    if (!inDog) return;
    if (this.maps.skyDome) this.maps.skyDome.position.copy(this.camera.position);
    this.dogfight.setSpawned(this.multiplayer.getSpawnedVehicles());
    this.dogfight.updateMissiles(delta);
    this.dogfight.updateVisuals();
    const t = performance.now();
    if (t - (this.dogTickAt || 0) > 1000) {
      this.dogTickAt = t;
      this.multiplayer.tickDogfight();
      this.dogfight.updateScore(this.multiplayer.score, this.multiplayer.round, this.multiplayer.now(), this.multiplayer.team);
    }
  }

  // Flying the jet or driving / riding the garage car: the camera sits in the vehicle
  updateDogfightView(delta) {
    const cam = this.dogfight.update(delta, {
      forward: this.controls.moveForward,
      back: this.controls.moveBackward,
      left: this.controls.moveLeft,
      right: this.controls.moveRight
    }, { yaw: this.controls.yaw, pitch: this.controls.pitch });
    this.multiplayer.vehicleInfo = this.dogfight.info;
    this.multiplayer.vehicleVeh = this.dogfight.veh;
    if (!cam) return;
    this.camera.position.set(cam.x, cam.y, cam.z);
    this.camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
  }

  // While driving the remote car, WASD steers it and the camera follows from behind
  updateCarView(delta) {
    const r = this.gadgets.driveCar(delta, {
      forward: this.controls.moveForward,
      back: this.controls.moveBackward,
      left: this.controls.moveLeft,
      right: this.controls.moveRight
    });
    if (!r) {
      // The car has ended: step out where it stopped
      const last = this.gadgets.lastCar;
      this.gadgets.lastCar = null;
      if (last) this.controls.setPosition(last.x, last.y + 1.6, last.z);
      return;
    }
    this.controls.yaw = r.heading;
    this.camera.position.set(r.x + Math.sin(r.heading) * 6, r.y + 3.2, r.z + Math.cos(r.heading) * 6);
    this.camera.rotation.set(-0.25, r.heading, 0, 'YXZ');
  }

  // While dead: a third-person view of your body, falling and then pulling back
  updateDeathView(now) {
    const dv = this.deathView;
    const t = Math.min(1, (now - dv.start) / 600);
    const body = this.deathBody;
    if (body) body.rotation.x = -t * Math.PI / 2; // tip backwards onto the floor

    const pull = Math.min(1, (now - dv.start) / 2000);
    const dist = 3.5 + pull * 1.5;
    const center = new THREE.Vector3(dv.base.x, dv.base.y - 0.9, dv.base.z);
    this.camera.position.set(
      center.x + Math.sin(dv.yaw) * dist,
      center.y + 1.2 + pull * 1.0,
      center.z + Math.cos(dv.yaw) * dist
    );
    this.camera.lookAt(center);
  }

  // Distance to the nearest solid wall or building along a shot (Infinity if none)
  wallDistance(origin, direction) {
    const ray = new THREE.Ray(origin, direction);
    const hit = new THREE.Vector3();
    let best = Infinity;
    for (const box of this.controls.colliders || []) {
      if (!box || !box.min || !box.max) continue;
      if (box.containsPoint(origin)) continue; // ignore boxes you are standing in
      if (ray.intersectBox(box, hit)) best = Math.min(best, origin.distanceTo(hit));
    }
    return best;
  }

  triggerPlayerShoot() {
    const origin = this.camera.position.clone();
    const dir = this.controls.getForwardDirection();
    // Admin-only trail colour (other trails are not applied yet)
    const equippedTrail = TRACER_OPTIONS.find(t => t.id === this.auth.profile.equippedTracer);
    const trailColor = equippedTrail && equippedTrail.adminOnly && this.auth.profile.isAdmin ? equippedTrail.hex : null;
    const shots = this.weapons.shoot(origin, dir, trailColor);

    if (!shots) return; // out of ammo or reloading

    // Broadcast shoot event in multiplayer
    if (this.gameState === 'MULTIPLAYER') {
      const activeWep = this.weapons.getActiveWeapon();
      this.multiplayer.sendShoot(origin, dir, activeWep.id, trailColor || activeWep.tracerColor);
    }

    // Hitscan collision check
    // Name tags are sprites, which need the camera to raycast safely
    this.raycaster.camera = this.camera;
    shots.forEach(shot => {
      this.raycaster.set(shot.origin, shot.direction);

      if (this.gameState === 'STORY') {
        // Test hits on AI enemies and boss
        const enemyMeshes = this.enemies.getEnemyMeshes();
        const intersects = this.raycaster.intersectObjects(enemyMeshes, true);

        // A shot only hits if no wall stands in front of the target
        if (intersects.length > 0 && intersects[0].distance < this.wallDistance(shot.origin, shot.direction)) {
          const hitMesh = intersects[0].object;
          // Find root enemy
          let root = hitMesh;
          while (root.parent && root.parent !== this.scene) {
            root = root.parent;
          }

          const targetEnemy = this.enemies.enemies.find(e => e.mesh === root) ||
            (this.enemies.boss && this.enemies.boss.mesh === root ? this.enemies.boss : null);

          if (targetEnemy) {
            const res = this.enemies.damageEnemy(targetEnemy.id, shot.damage);
            this.ui.triggerHitMarker();
            this.sound.playHitMarker(res && res.isDead);

            if (res && res.isDead) {
              this.auth.recordKill();
              this.ui.addKillFeed(this.auth.profile.name, targetEnemy.type.toUpperCase(), this.weapons.getActiveWeapon().name);
            }
          }
        }
      } else if (this.gameState === 'MULTIPLAYER') {
        // Test hits on other players
        const remotePlayers = this.multiplayer.getRemotePlayerMeshes();
        const targets = remotePlayers.map(p => p.mesh);
        const intersects = this.raycaster.intersectObjects(targets, true);

        // A shot only hits if no wall stands in front of the target
        if (intersects.length > 0 && intersects[0].distance < this.wallDistance(shot.origin, shot.direction)) {
          let root = intersects[0].object;
          while (root.parent && root.parent !== this.scene) {
            root = root.parent;
          }

          const hitPlayer = remotePlayers.find(p => p.mesh === root);
          if (hitPlayer) {
            this.multiplayer.sendHit(hitPlayer.id, shot.damage, this.weapons.getActiveWeapon().id);
            this.ui.triggerHitMarker();
            this.sound.playHitMarker(false);
          }
        }
      }
    });
  }

  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Natural Shield Regeneration (after 4s of taking no damage)
    if (!this.isDead && this.shield < this.maxShield && (now - this.lastDamageTime > 4000)) {
      this.shield = Math.min(this.maxShield, this.shield + delta * 15);
      this.ui.updateVitals(this.health, this.maxHealth, this.shield, this.maxShield);
    }

    // 1. MENU STATE: Cinematic orbiting camera
    if (this.gameState === 'MENU') {
      this.dogfightFrame(delta); // hides the dogfight score and team bar once you leave
      const angle = now * 0.00015;
      this.camera.position.x = Math.cos(angle) * 22;
      this.camera.position.z = Math.sin(angle) * 22;
      this.camera.position.y = 8 + Math.sin(angle * 2) * 2;
      this.camera.lookAt(0, 0, 0);
      this.maps.update(delta, this.camera.position);
    }

    // 2. ACTIVE GAME STATES (STORY & MULTIPLAYER)
    else {
      const isMoving = this.controls.moveForward || this.controls.moveBackward ||
                       this.controls.moveLeft || this.controls.moveRight;

      if (performance.now() - this.lastCataclysmCheck > 1000) {
        this.lastCataclysmCheck = performance.now();
        this.syncCataclysm();
      }
      this.abilities.update(delta);
      this.weapons.fireMultiplier = this.abilities.fireMultiplier();
      this.updateAbilityHUD();

      this.updateRope();

      // Zoom, slower mouse and scope overlay follow how far the weapon is aimed
      const adsT = this.weapons.aimT;
      const zoomFov = this.baseFov * (1 - adsT * 0.45);
      if (Math.abs(this.camera.fov - zoomFov) > 0.01) {
        this.camera.fov = zoomFov;
        this.camera.updateProjectionMatrix();
      }
      this.controls.aimMultiplier = 1 - adsT * 0.5;
      this.scopeOverlay.style.opacity = String(Math.max(0, (adsT - 0.6) / 0.4));

      this.gadgets.update(delta);
      this.dogfightFrame(delta);
      if (this.isDead && this.deathView) {
        this.updateDeathView(now);
      } else if (this.gadgets.car || this.gadgets.lastCar) {
        this.updateCarView(delta);
      } else if (this.dogfight.active) {
        this.updateDogfightView(delta);
      } else if (this.strike) {
        this.updateStrikeView();
      } else {
        this.controls.update(delta);
      }
      this.weapons.update(delta, isMoving, this.controls.isSprinting);
      this.maps.update(delta, this.camera.position);

      // Radar rendering
      const radarTargets = [];

      if (this.gameState === 'STORY') {
        this.story.update(delta, this.camera.position);
        this.enemies.update(
          delta,
          this.camera.position,
          (origin, dir, type) => {
            // Enemy laser tracer
            this.weapons.spawnTracer(origin, dir, 0xff0055, 90, 80);
          },
          (damage) => {
            this.takeDamage(damage);
          }
        );

        this.enemies.enemies.forEach(e => {
          radarTargets.push({ x: e.mesh.position.x, z: e.mesh.position.z, isEnemy: true });
        });
        if (this.enemies.boss) {
          radarTargets.push({ x: this.enemies.boss.mesh.position.x, z: this.enemies.boss.mesh.position.z, isEnemy: true });
        }
      } else if (this.gameState === 'MULTIPLAYER') {
        this.multiplayer.update(delta);
        this.multiplayer.setVitals(this.health, this.shield);
        this.multiplayer.setCloaked(this.abilities.isCloaked());
        this.multiplayer.sendMove(
          this.camera.position,
          this.controls.pitch,
          this.controls.yaw,
          isMoving,
          this.controls.isCrouching || this.controls.slideTime > 0
        );

        for (const pid in this.multiplayer.otherPlayers) {
          const rp = this.multiplayer.otherPlayers[pid];
          radarTargets.push({ x: rp.model.position.x, z: rp.model.position.z, isEnemy: false });
        }

        // Live Scoreboard update
        const myKills = this.multiplayer.stats.kills;
        const playerList = [{
          name: this.auth.profile.name,
          skin: this.auth.profile.equippedSkin,
          kills: myKills,
          deaths: this.multiplayer.stats.deaths,
          score: myKills * 100
        }, ...Object.values(this.multiplayer.otherPlayers)];
        this.ui.updateScoreboard(playerList);
      }

      this.ui.renderRadar(this.camera.position, this.controls.yaw, radarTargets);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Boot game on window load
window.addEventListener('DOMContentLoaded', () => {
  window.game = new EventHorizonGame();
});
