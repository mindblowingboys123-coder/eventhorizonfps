// EVENT HORIZON - 3D FIRST-PERSON SHOOTER CORE ENGINE
import * as THREE from 'three';
import { AuthManager } from './auth.js';
import { SoundEngine } from './audio.js';
import { FPSControls } from './controls.js';
import { WeaponManager } from './weapons.js';
import { SkinManager } from './skins.js';
import { MapManager } from './maps.js';
import { EnemyManager } from './enemies.js';
import { StoryCampaign } from './story.js';
import { MultiplayerClient } from './multiplayer.js';
import { ShopManager } from './shop.js';
import { UIManager } from './ui.js';

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

        skinGrid.style.display = tab === 'skins' ? 'grid' : 'none';
        wepGrid.style.display = tab === 'weapons' ? 'grid' : 'none';
        camoGrid.style.display = tab === 'camos' ? 'grid' : 'none';

        if (tab === 'skins') this.shop.renderSkinsTab(skinGrid);
        if (tab === 'weapons') this.shop.renderWeaponsTab(wepGrid);
        if (tab === 'camos') this.shop.renderCamosTab(camoGrid);
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
      if (!e.detail.isLocked && this.gameState !== 'MENU') {
        this.ui.togglePauseMenu(true);
      } else {
        this.ui.togglePauseMenu(false);
      }
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
      }
    });

    // Event listeners from multiplayer & story
    window.addEventListener('kill_feed_event', (e) => {
      this.ui.addKillFeed(e.detail.killerName, e.detail.victimName, e.detail.weapon);
    });

    window.addEventListener('chat_message_received', (e) => {
      this.ui.addChatMessage(e.detail.sender, e.detail.text, e.detail.isSystem);
    });

    window.addEventListener('self_damaged', (e) => {
      this.takeDamage(15);
    });

    window.addEventListener('self_killed', (e) => {
      this.handlePlayerDeath(e.detail.killerName || 'The Void');
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

    // Admin Landscape Shift (For all players)
    document.querySelectorAll('.btn-admin-setmap').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMap = btn.dataset.map || 'singularity';
        if (this.multiplayer.isConnected) {
          this.multiplayer.sendAdminAction('change_map', null, { map: targetMap });
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
      const mapData = this.maps.loadMap(e.detail.map);
      this.controls.setColliders(mapData.colliders);
      if (mapData.spawnPoints.length > 0) {
        this.controls.setPosition(mapData.spawnPoints[0].x, mapData.spawnPoints[0].y, mapData.spawnPoints[0].z);
      }
      this.sound.playKillChime();
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

      container.appendChild(card);
    });
  }

  fetchServerList() {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(rooms => {
        const countSpans = document.querySelectorAll('.srv-count');
        rooms.forEach((r, i) => {
          if (countSpans[i]) {
            countSpans[i].innerText = `ONLINE PILOTS: ${r.playerCount}`;
          }
        });
      })
      .catch(() => {});
  }

  startStoryMode(missionId = 1) {
    this.gameState = 'STORY';
    this.resetVitals();
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

    let mapId = 'singularity';
    if (roomId === 'aegis-station') mapId = 'station';
    if (roomId === 'mars-outpost') mapId = 'mars';
    if (roomId === 'cyber-void') mapId = 'cyber';

    const mapData = this.maps.loadMap(mapId);
    this.controls.setColliders(mapData.colliders);

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

  handlePlayerDeath(killer) {
    if (this.isDead) return;
    this.isDead = true;
    this.auth.recordDeath();
    this.sound.playPlayerHurt();

    this.ui.addKillFeed(killer, this.auth.profile.name, 'Vaporizer');

    // Respawn after 2.5 seconds
    setTimeout(() => {
      if (this.gameState === 'MULTIPLAYER') {
        this.multiplayer.sendRespawn();
      }
      this.resetVitals();
      this.controls.setPosition(0, 4, 0);
    }, 2500);
  }

  triggerPlayerShoot() {
    const origin = this.camera.position.clone();
    const dir = this.controls.getForwardDirection();
    const shots = this.weapons.shoot(origin, dir);

    if (!shots) return; // out of ammo or reloading

    // Broadcast shoot event in multiplayer
    if (this.gameState === 'MULTIPLAYER') {
      const activeWep = this.weapons.getActiveWeapon();
      this.multiplayer.sendShoot(origin, dir, activeWep.id, activeWep.tracerColor);
    }

    // Hitscan collision check
    shots.forEach(shot => {
      this.raycaster.set(shot.origin, shot.direction);

      if (this.gameState === 'STORY') {
        // Test hits on AI enemies and boss
        const enemyMeshes = this.enemies.getEnemyMeshes();
        const intersects = this.raycaster.intersectObjects(enemyMeshes, true);

        if (intersects.length > 0) {
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

        if (intersects.length > 0) {
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
      const angle = now * 0.00015;
      this.camera.position.x = Math.cos(angle) * 22;
      this.camera.position.z = Math.sin(angle) * 22;
      this.camera.position.y = 8 + Math.sin(angle * 2) * 2;
      this.camera.lookAt(0, 0, 0);
      this.maps.update(delta);
    }

    // 2. ACTIVE GAME STATES (STORY & MULTIPLAYER)
    else {
      const isMoving = this.controls.moveForward || this.controls.moveBackward ||
                       this.controls.moveLeft || this.controls.moveRight;

      this.controls.update(delta);
      this.weapons.update(delta, isMoving, this.controls.isSprinting);
      this.maps.update(delta);

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
        this.multiplayer.sendMove(
          this.camera.position,
          this.controls.pitch,
          this.controls.yaw,
          isMoving,
          this.controls.isCrouching
        );

        for (const pid in this.multiplayer.otherPlayers) {
          const rp = this.multiplayer.otherPlayers[pid];
          radarTargets.push({ x: rp.model.position.x, z: rp.model.position.z, isEnemy: false });
        }

        // Live Scoreboard update
        const playerList = [{
          name: this.auth.profile.name,
          skin: this.auth.profile.equippedSkin,
          kills: this.auth.profile.kills,
          deaths: this.auth.profile.deaths,
          score: this.auth.profile.kills * 100
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
