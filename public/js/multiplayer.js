// EVENT HORIZON - MULTIPLAYER WORLD CLIENT (Firebase Realtime Database)
// Pilots share one world through the Firebase Realtime Database instead of a game server.
// Same public API and event names as the old WebSocket client, so main.js keeps working.
import * as THREE from 'three';

const ROOMS = {
  'world-hub':     { name: 'Event Horizon - World Server (Global)', map: 'singularity' },
  'aegis-station': { name: 'Aegis Space Station Arena', map: 'station' },
  'mars-outpost':  { name: 'Mars Red Dunes Colony', map: 'mars' },
  'cyber-void':    { name: 'Cyber Void Jump Arena', map: 'cyber' }
};

const SPAWN_POINTS = {
  singularity: [
    { x: 0, y: 3, z: 0 }, { x: 25, y: 5, z: 25 }, { x: -25, y: 5, z: -25 },
    { x: 30, y: 6, z: -30 }, { x: -30, y: 6, z: 30 }
  ],
  station: [
    { x: 0, y: 2, z: 0 }, { x: 18, y: 2, z: 18 }, { x: -18, y: 2, z: -18 },
    { x: 20, y: 2, z: -20 }, { x: -20, y: 2, z: 20 }
  ],
  mars: [
    { x: 0, y: 2, z: 0 }, { x: 35, y: 3, z: 35 }, { x: -35, y: 3, z: -35 },
    { x: 40, y: 4, z: -20 }, { x: -40, y: 4, z: 20 }
  ],
  cyber: [
    { x: 0, y: 4, z: 0 }, { x: 22, y: 6, z: 22 }, { x: -22, y: 6, z: -22 },
    { x: 25, y: 8, z: -25 }, { x: -25, y: 8, z: 25 }
  ]
};

const SEND_INTERVAL_MS = 100;   // 10 position updates per second keeps database usage low
const SHOT_TTL_MS = 3000;       // tracers older than this are ignored and cleaned up
const FEED_TTL_MS = 10000;      // chat and kill messages older than this are ignored and cleaned up
const HIT_MAX_AGE_MS = 5000;    // hits older than this are stale
const COMMAND_MAX_AGE_MS = 15000;
const MAX_DAMAGE = 100000;      // high enough that HORIZEN'S FINAL (99999) still kills in one shot

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function round3(v) {
  return Math.round(num(v) * 1000) / 1000;
}

// Removes undefined values, which the database rejects
function clean(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function randomSpawn(map) {
  const points = SPAWN_POINTS[map] || SPAWN_POINTS.singularity;
  const pt = points[Math.floor(Math.random() * points.length)];
  return {
    x: pt.x + (Math.random() * 4 - 2),
    y: pt.y,
    z: pt.z + (Math.random() * 4 - 2)
  };
}

// Firebase handles set up by index.html: { A: auth module, D: database module, auth, db }
function fb() {
  if (!window.__eh) throw new Error('Firebase is not set up yet. Multiplayer needs Firebase (see README).');
  return window.__eh;
}

export class MultiplayerClient {
  constructor(scene, skinManager, weaponManager, soundEngine) {
    this.scene = scene;
    this.skins = skinManager;
    this.weapons = weaponManager;
    this.sound = soundEngine;

    this.selfId = null;
    this.currentRoom = null;
    this.otherPlayers = {};
    this.isConnected = false;
    this.joined = false;
    this.myRef = null;
    this.myUid = null;
    this.myName = 'Pilot';
    this.vitals = { health: 100, shield: 50 };
    this.dead = false;
    this.stats = { kills: 0, deaths: 0 };
    this.lastMap = null;
    this.serverOffset = 0;
    this.clockUnsub = null;
    this.disconnectHandler = null;
    this.unsubs = [];
    this.lastSendMoveTime = 0;

    // main.js replaces this with a God Mode check
    this.isInvincible = () => false;
  }

  // ---------- helpers ----------

  roomPath(sub) {
    return `rooms/${this.currentRoom}/${sub}`;
  }

  now() {
    return Date.now() + this.serverOffset;
  }

  startClock() {
    if (this.clockUnsub) return;
    const { D, db } = fb();
    // Firebase keeps this value up to date with the difference between our clock and the server's
    this.clockUnsub = D.onValue(D.ref(db, '.info/serverTimeOffset'), (snap) => {
      this.serverOffset = num(snap.val(), 0);
    });
  }

  // Resolves with the signed-in user (guest accounts count), or null when nobody is signed in
  waitForUser() {
    const { A, auth } = fb();
    return new Promise((resolve) => {
      let done = false;
      let unsub = null;
      unsub = A.onAuthStateChanged(auth, (user) => {
        if (done) return;
        done = true;
        resolve(user);
        if (unsub) unsub();
      });
    });
  }

  async requireUser() {
    const user = await this.waitForUser();
    if (!user) throw new Error('Sign in or play as guest to use multiplayer.');
    return user;
  }

  writeMine(fields) {
    if (!this.myRef) return;
    const { D } = fb();
    D.update(this.myRef, clean(fields)).catch((e) => console.warn('Could not update your pilot:', e));
  }

  postFeed(room, item) {
    const { D, db } = fb();
    const r = D.push(D.ref(db, `rooms/${room}/feed`), clean({ ...item, t: this.now() }));
    setTimeout(() => { D.remove(r).catch(() => {}); }, FEED_TTL_MS);
  }

  async currentMapId(room) {
    const { D, db } = fb();
    const snap = await D.get(D.ref(db, `rooms/${room}/meta/map`));
    return snap.exists() ? snap.val() : ROOMS[room].map;
  }

  // ---------- joining and leaving ----------

  connect(roomId = 'world-hub', playerName = 'Pilot', skinId = 'vanguard', weaponId = 'rifle') {
    this.disconnect();
    this.joinRoom(roomId, playerName, skinId, weaponId).catch((err) => {
      console.error('Multiplayer join failed:', err);
      alert('Could not join the world server: ' + err.message);
    });
  }

  async joinRoom(roomId, playerName, skinId, weaponId) {
    const user = await this.requireUser();
    const room = ROOMS[roomId] ? roomId : 'world-hub';
    this.startClock();

    this.currentRoom = room;
    this.myUid = user.uid;
    this.selfId = user.uid;
    this.myName = String(playerName || 'Pilot').trim().substring(0, 16) || 'Pilot';
    this.vitals = { health: 100, shield: 50 };
    this.dead = false;
    this.stats = { kills: 0, deaths: 0 };

    const spawn = randomSpawn(await this.currentMapId(room));
    const { D, db } = fb();
    this.myRef = D.ref(db, `rooms/${room}/players/${user.uid}`);

    // If this browser closes or drops off the internet, Firebase removes this pilot automatically
    this.disconnectHandler = D.onDisconnect(this.myRef);
    this.disconnectHandler.remove();

    await D.set(this.myRef, clean({
      id: user.uid,
      name: this.myName,
      skin: skinId || 'vanguard',
      weapon: weaponId || 'rifle',
      x: spawn.x, y: spawn.y, z: spawn.z,
      rotX: 0, rotY: 0,
      isMoving: false, isCrouching: false,
      health: 100, shield: 50,
      kills: 0, deaths: 0
    }));

    this.joined = true;
    this.isConnected = true;
    this.lastMap = null;
    this.attachListeners(room, user.uid);
    this.postFeed(room, { kind: 'chat', sender: 'SYSTEM', text: `${this.myName} entered the Event Horizon sector.`, isSystem: true });

    window.dispatchEvent(new CustomEvent('multiplayer_joined', {
      detail: { selfId: user.uid, spawn, room }
    }));
  }

  // Signs in as admin-capable client without joining a room (used by the admin roster)
  connectAdminOnly() {
    return this.requireUser().then((user) => {
      this.startClock();
      this.myUid = user.uid;
      this.isConnected = true;
    });
  }

  disconnect() {
    this.unsubs.forEach((u) => { try { u(); } catch (e) { /* already closed */ } });
    this.unsubs = [];

    if (this.joined && this.myRef) {
      const { D } = fb();
      this.postFeed(this.currentRoom, { kind: 'chat', sender: 'SYSTEM', text: `${this.myName} disconnected from sector.`, isSystem: true });
      if (this.disconnectHandler) this.disconnectHandler.cancel().catch(() => {});
      D.remove(this.myRef).catch(() => {});
    }

    this.disconnectHandler = null;
    this.myRef = null;
    this.joined = false;
    this.isConnected = false;
    this.currentRoom = null;
    this.lastMap = null;
    this.dead = false;
    this.clearAllRemotePlayers();
  }

  // ---------- listening to the room ----------

  attachListeners(room, me) {
    const { D, db } = fb();
    const R = (sub) => D.ref(db, `rooms/${room}/${sub}`);
    const add = (unsub) => this.unsubs.push(unsub);

    // Other pilots: positions, joins, leaves
    add(D.onChildAdded(R('players'), (snap) => {
      if (snap.key !== me && snap.val()) this.addRemotePlayer({ id: snap.key, ...snap.val() });
    }));
    add(D.onChildChanged(R('players'), (snap) => {
      if (snap.key !== me && snap.val()) this.updateRemotePlayer(snap.key, snap.val());
    }));
    add(D.onChildRemoved(R('players'), (snap) => {
      this.removeRemotePlayer(snap.key);
    }));

    // Tracers from other pilots
    add(D.onChildAdded(D.query(R('shots'), D.limitToLast(50)), (snap) => {
      const s = snap.val();
      if (!s || !s.o || !s.d || s.uid === me || this.now() - num(s.t) > SHOT_TTL_MS) return;
      const origin = new THREE.Vector3(s.o.x, s.o.y, s.o.z);
      const dir = new THREE.Vector3(s.d.x, s.d.y, s.d.z);
      this.weapons.spawnTracer(origin, dir, num(s.c, 0x00f0ff));
      if (this.sound) this.sound.playShoot(s.w || 'rifle');
    }));

    // Damage aimed at this pilot
    add(D.onChildAdded(R(`hits/${me}`), (snap) => {
      const h = snap.val();
      D.remove(snap.ref).catch(() => {});
      if (!h || this.dead || this.now() - num(h.t) > HIT_MAX_AGE_MS) return;
      this.applyHit(h);
    }));

    // Admin commands aimed at this pilot
    add(D.onChildAdded(R(`commands/${me}`), (snap) => {
      const c = snap.val();
      D.remove(snap.ref).catch(() => {});
      if (c && this.now() - num(c.t) < COMMAND_MAX_AGE_MS) this.handleCommand(c);
    }));

    // Chat and kill messages
    add(D.onChildAdded(D.query(R('feed'), D.limitToLast(30)), (snap) => {
      const f = snap.val();
      if (!f || this.now() - num(f.t) > FEED_TTL_MS) return;

      if (f.kind === 'chat') {
        window.dispatchEvent(new CustomEvent('chat_message_received', {
          detail: { sender: f.sender, text: f.text, isSystem: !!f.isSystem }
        }));
      } else if (f.kind === 'kill') {
        // The killer earns the kill
        if (f.killerId === me && f.victimId !== me) {
          this.stats.kills += 1;
          this.writeMine({ kills: this.stats.kills });
        }
        // Your own death is shown by main.js, so skip it here
        if (f.victimId !== me) {
          window.dispatchEvent(new CustomEvent('kill_feed_event', {
            detail: { killerName: f.killerName, victimName: f.victimName, weapon: f.weapon }
          }));
        }
      }
    }));

    // Landscape changes made by the admin
    let primed = false;
    add(D.onValue(R('meta/map'), (snap) => {
      const map = snap.val();
      if (!primed) {
        // First reading just records the current landscape; nothing changed yet
        primed = true;
        this.lastMap = map || null;
        return;
      }
      if (map && map !== this.lastMap) {
        this.lastMap = map;
        window.dispatchEvent(new CustomEvent('room_map_changed', { detail: { map } }));
      }
    }));
  }

  // ---------- combat ----------

  applyHit(h) {
    if (this.isInvincible()) return;

    const dmg = Math.min(MAX_DAMAGE, Math.max(0, num(h.dmg, 0)));
    let shield = this.vitals.shield;
    let health = this.vitals.health;

    // Shield absorbs damage first, the same as the old server did
    let rest = dmg;
    if (shield > 0) {
      const absorbed = Math.min(shield, rest);
      shield -= absorbed;
      rest -= absorbed;
    }
    health = Math.max(0, health - rest);

    this.vitals = { health, shield };
    this.writeMine({ health, shield });
    window.dispatchEvent(new CustomEvent('self_damaged', { detail: { damage: dmg, health, shield } }));

    if (health <= 0) this.die(h.from, h.fromName, h.w);
  }

  die(killerId, killerName, weapon) {
    this.dead = true;
    this.stats.deaths += 1;
    this.writeMine({ deaths: this.stats.deaths });
    this.postFeed(this.currentRoom, {
      kind: 'kill',
      killerId: killerId || '',
      killerName: killerName || 'The Void',
      victimId: this.myUid,
      victimName: this.myName,
      weapon: weapon || 'Plasma Rifle'
    });
    window.dispatchEvent(new CustomEvent('self_killed', {
      detail: { killerName: killerName || 'The Void', victimName: this.myName, weapon: weapon }
    }));
  }

  handleCommand(c) {
    const extra = c.extra || {};
    switch (c.action) {
      case 'kill_player': {
        this.vitals = { health: 0, shield: 0 };
        this.writeMine({ health: 0, shield: 0 });
        window.dispatchEvent(new CustomEvent('self_damaged', { detail: { damage: 0, health: 0, shield: 0 } }));
        if (!this.dead) this.die(c.from, '⚡ OVERLORD (ADMIN)', 'Orbital Singularity Cannon');
        break;
      }
      case 'heal_player': {
        this.vitals = { health: 500, shield: 500 };
        this.writeMine({ health: 500, shield: 500 });
        window.dispatchEvent(new CustomEvent('self_damaged', { detail: { damage: 0, health: 500, shield: 500 } }));
        break;
      }
      case 'force_skin': {
        this.writeMine({ skin: String(extra.skin || 'celestial') });
        break;
      }
      case 'grant_credits': {
        window.dispatchEvent(new CustomEvent('admin_credit_grant', { detail: { amount: num(extra.amount, 10000) } }));
        break;
      }
      case 'kick_player': {
        alert('Terminated by Overlord.');
        this.disconnect();
        window.location.reload();
        break;
      }
    }
  }

  // ---------- sending ----------

  setVitals(health, shield) {
    this.vitals = { health: num(health, 100), shield: num(shield, 50) };
  }

  sendMove(pos, rotX, rotY, isMoving, isCrouching) {
    if (!this.joined || !this.myRef) return;
    const t = performance.now();
    if (t - this.lastSendMoveTime < SEND_INTERVAL_MS) return;
    this.lastSendMoveTime = t;

    this.writeMine({
      x: round2(pos.x),
      y: round2(pos.y),
      z: round2(pos.z),
      rotX: round2(rotX),
      rotY: round2(rotY),
      isMoving: !!isMoving,
      isCrouching: !!isCrouching,
      health: num(this.vitals.health, 100),
      shield: num(this.vitals.shield, 50)
    });
  }

  sendShoot(origin, direction, weaponId, tracerColor) {
    if (!this.joined) return;
    const { D, db } = fb();
    const r = D.push(D.ref(db, this.roomPath('shots')), clean({
      uid: this.myUid,
      o: { x: round3(origin.x), y: round3(origin.y), z: round3(origin.z) },
      d: { x: round3(direction.x), y: round3(direction.y), z: round3(direction.z) },
      w: weaponId || 'rifle',
      c: num(tracerColor, 0x00f0ff),
      t: this.now()
    }));
    setTimeout(() => { D.remove(r).catch(() => {}); }, SHOT_TTL_MS);
  }

  sendHit(targetId, damage, weaponId) {
    if (!this.joined || !targetId || targetId === this.myUid) return;
    const { D, db } = fb();
    D.push(D.ref(db, this.roomPath(`hits/${targetId}`)), clean({
      dmg: num(damage, 20),
      from: this.myUid,
      fromName: this.myName,
      w: weaponId || 'rifle',
      t: this.now()
    }));
  }

  sendRespawn() {
    if (!this.joined) return;
    this.dead = false;
    this.vitals = { health: 100, shield: 50 };
    this.writeMine({ health: 100, shield: 50 });
  }

  sendChat(text) {
    if (!this.joined) return;
    const msg = String(text || '').trim().substring(0, 120);
    if (msg) this.postFeed(this.currentRoom, { kind: 'chat', sender: this.myName, text: msg, isSystem: false });
  }

  sendAdminAction(action, targetId = null, extra = {}) {
    if (!this.isConnected) return;
    const { D, db } = fb();
    const room = this.currentRoom || 'world-hub';

    if (action === 'change_map') {
      D.set(D.ref(db, `rooms/${room}/meta/map`), String(extra.map || 'singularity'))
        .catch((e) => console.error('Admin map change refused:', e));
    } else if (action === 'broadcast') {
      this.postFeed(room, {
        kind: 'chat',
        sender: '⚡ OVERLORD ADMIN',
        text: String(extra.text || 'SYSTEM PROTOCOLS OVERRIDDEN').substring(0, 200),
        isSystem: true
      });
    } else if (targetId) {
      D.push(D.ref(db, `rooms/${room}/commands/${targetId}`), clean({
        action,
        extra,
        from: this.myUid,
        t: this.now()
      })).catch((e) => console.error('Admin command refused:', e));
    }
  }

  async requestAdminPlayerList() {
    const room = this.currentRoom || 'world-hub';
    let list = [];
    try {
      const { D, db } = fb();
      const snap = await D.get(D.ref(db, `rooms/${room}/players`));
      const val = snap.val() || {};
      list = Object.keys(val).map((id) => ({ id, ...val[id] }));
    } catch (e) {
      console.error('Could not read the player roster:', e);
    }
    window.dispatchEvent(new CustomEvent('admin_player_list_received', { detail: list }));
  }

  // Used by the main menu server list. Returns [{ id, name, map, playerCount }]
  async fetchRoomList() {
    await this.requireUser();
    const { D, db } = fb();
    return Promise.all(Object.keys(ROOMS).map(async (id) => {
      const [playersSnap, mapSnap] = await Promise.all([
        D.get(D.ref(db, `rooms/${id}/players`)),
        D.get(D.ref(db, `rooms/${id}/meta/map`))
      ]);
      const players = playersSnap.val() || {};
      return {
        id,
        name: ROOMS[id].name,
        map: mapSnap.val() || ROOMS[id].map,
        playerCount: Object.keys(players).length
      };
    }));
  }

  // ---------- remote pilots ----------

  addRemotePlayer(data) {
    if (this.otherPlayers[data.id]) return;

    const skin = data.skin || 'vanguard';
    const name = data.name || 'Pilot';
    const health = num(data.health, 100);
    const model = this.skins.createPlayerModel(skin, name);
    model.position.set(num(data.x), num(data.y), num(data.z));
    this.scene.add(model);
    this.skins.updateNametag(model, name, health, 100);

    this.otherPlayers[data.id] = {
      id: data.id,
      name,
      skin,
      model,
      targetPos: new THREE.Vector3(num(data.x), num(data.y), num(data.z)),
      targetRot: num(data.rotY),
      isMoving: !!data.isMoving,
      health
    };
  }

  updateRemotePlayer(id, d) {
    const rp = this.otherPlayers[id];
    if (!rp) {
      this.addRemotePlayer({ id, ...d });
      return;
    }

    // A new suit means a new model
    if (d.skin && d.skin !== rp.skin) {
      this.removeRemotePlayer(id);
      this.addRemotePlayer({ id, ...d });
      return;
    }

    if (d.x !== undefined) rp.targetPos.set(num(d.x), num(d.y), num(d.z));
    if (d.rotY !== undefined) rp.targetRot = num(d.rotY);
    rp.isMoving = !!d.isMoving;
    if (d.health !== undefined) rp.health = num(d.health, rp.health);
    if (d.name) rp.name = d.name;
    this.skins.updateNametag(rp.model, rp.name, rp.health, 100);
  }

  removeRemotePlayer(id) {
    if (this.otherPlayers[id]) {
      this.scene.remove(this.otherPlayers[id].model);
      delete this.otherPlayers[id];
    }
  }

  clearAllRemotePlayers() {
    for (const id in this.otherPlayers) {
      this.scene.remove(this.otherPlayers[id].model);
    }
    this.otherPlayers = {};
  }

  update(delta) {
    for (const id in this.otherPlayers) {
      const rp = this.otherPlayers[id];
      rp.model.position.lerp(rp.targetPos, Math.min(1, delta * 15));
      rp.model.rotation.y += (rp.targetRot - rp.model.rotation.y) * Math.min(1, delta * 12);
      this.skins.animateModel(rp.model, delta, rp.isMoving);
    }
  }

  getRemotePlayerMeshes() {
    return Object.values(this.otherPlayers).map((p) => ({
      id: p.id,
      mesh: p.model,
      name: p.name
    }));
  }
}
