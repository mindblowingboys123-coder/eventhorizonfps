// EVENT HORIZON - MULTIPLAYER WORLD CLIENT (Firebase Realtime Database, compat SDK)
// Pilots share one world through the Realtime Database instead of a game server.
// Uses the same Firebase connection as auth.js (window.firebase), so no extra setup
// besides databaseURL in firebase-config.js. Same public API and event names as before.
import * as THREE from 'three';

const ROOMS = {
  'world-hub':     { name: 'Event Horizon - World Server (Global)', map: 'singularity' },
  'aegis-station': { name: 'Aegis Space Station Arena', map: 'station' },
  'mars-outpost':  { name: 'Mars Red Dunes Colony', map: 'mars' },
  'cyber-void':    { name: 'Cyber Void Jump Arena', map: 'cyber' },
  'halo-city':     { name: 'Halo City River District', map: 'halo' },
  'dogfight':      { name: 'Dogfight - Red vs Blue', map: 'dogfight' }
};

// Dogfight rounds
const ROUND_MS = 5 * 60 * 1000; // a round lasts 5 minutes...
const WIN_PAUSE_MS = 10000;     // ...then a 10 second pause before the next one
const WIN_KILLS = 20;           // or the first team to 20 kills wins

const SPAWN_POINTS = {
  dogfight: [{ x: -60, y: 4, z: -30 }, { x: -60, y: 4, z: 30 }, { x: 60, y: 4, z: -30 }, { x: 60, y: 4, z: 30 }],
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
  halo: [
    { x: -100, y: 2, z: -60 }, { x: 100, y: 2, z: 60 }, { x: -100, y: 2, z: 60 }, { x: 100, y: 2, z: -60 }
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
const SDK_VERSION = '10.8.0';   // same version auth.js loads

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) { return Math.round(num(v) * 100) / 100; }
function round3(v) { return Math.round(num(v) * 1000) / 1000; }

// Removes undefined values, which the database rejects
function clean(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function randomSpawn(map, team) {
  let points = SPAWN_POINTS[map] || SPAWN_POINTS.singularity;
  // Dogfight: red starts on the west side, blue on the east side
  if (map === 'dogfight' && team) points = points.filter((p) => (team === 'red' ? p.x < 0 : p.x > 0));
  const pt = points[Math.floor(Math.random() * points.length)];
  return {
    x: pt.x + (Math.random() * 4 - 2),
    y: pt.y,
    z: pt.z + (Math.random() * 4 - 2)
  };
}

// Waits until auth.js has initialised Firebase, then makes sure the database library is loaded
function loadDatabaseSDK() {
  return new Promise((resolve, reject) => {
    if (window.firebase && window.firebase.database) return resolve();
    const s = document.createElement('script');
    s.src = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database-compat.js`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Firebase database library.'));
    document.head.appendChild(s);
  });
}

async function getDatabase() {
  const started = Date.now();
  while (!(window.firebase && window.firebase.apps && window.firebase.apps.length)) {
    if (Date.now() - started > 15000) {
      throw new Error('Firebase is not set up. Check js/firebase-config.js.');
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  await loadDatabaseSDK();

  const options = window.firebase.app().options || {};
  if (!options.databaseURL) {
    throw new Error('Add databaseURL to FIREBASE_CONFIG in js/firebase-config.js (copy it from the Realtime Database page).');
  }
  return window.firebase.database();
}

// Resolves with the signed-in user (guest accounts count), or null when nobody is signed in
function waitForUser() {
  return new Promise((resolve) => {
    const auth = window.firebase.auth();
    let done = false;
    let unsub = null;
    unsub = auth.onAuthStateChanged((user) => {
      if (done) return;
      done = true;
      resolve(user);
      if (unsub) unsub();
    });
  });
}

export class MultiplayerClient {
  constructor(scene, skinManager, weaponManager, soundEngine) {
    this.scene = scene;
    this.skins = skinManager;
    this.weapons = weaponManager;
    this.sound = soundEngine;

    this.db = null;
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
    this.clockStarted = false;
    this.listenerCleanups = [];
    this.lastSendMoveTime = 0;
    this.cloaked = false;

    // main.js replaces this with a God Mode check
    this.isInvincible = () => false;
  }

  // ---------- helpers ----------

  async ready() {
    if (!this.db) this.db = await getDatabase();
    return this.db;
  }

  roomRef(sub) {
    return this.db.ref(`rooms/${this.currentRoom}/${sub}`);
  }

  listen(ref, event, cb) {
    ref.on(event, cb);
    this.listenerCleanups.push(() => ref.off(event, cb));
  }

  now() {
    return Date.now() + this.serverOffset;
  }

  startClock() {
    if (this.clockStarted) return;
    this.clockStarted = true;
    // Firebase keeps this value up to date with the difference between our clock and the server's
    this.db.ref('.info/serverTimeOffset').on('value', (snap) => {
      this.serverOffset = num(snap.val(), 0);
    });
  }

  async requireUser() {
    await this.ready();
    const user = await waitForUser();
    if (!user) throw new Error('Sign in or play as guest to use multiplayer.');
    return user;
  }

  writeMine(fields) {
    if (!this.myRef) return;
    this.myRef.update(clean(fields)).catch((e) => console.warn('Could not update your pilot:', e));
  }

  postFeed(room, item) {
    const ref = this.db.ref(`rooms/${room}/feed`).push(clean({ ...item, t: this.now() }));
    setTimeout(() => { ref.remove().catch(() => {}); }, FEED_TTL_MS);
  }

  async currentMapId(room) {
    const snap = await this.db.ref(`rooms/${room}/meta/map`).once('value');
    return snap.exists() ? this.parseRoomMap(snap.val()).base : ROOMS[room].map;
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

    // Stop listening to the room we were in before, so its events cannot reach this one
    this.listenerCleanups.forEach((off) => { try { off(); } catch (e) { /* already closed */ } });
    this.listenerCleanups = [];

    this.currentRoom = room;
    this.myUid = user.uid;
    this.selfId = user.uid;
    this.myName = String(playerName || 'Pilot').trim().substring(0, 16) || 'Pilot';
    this.vitals = { health: 100, shield: 50 };
    this.dead = false;
    this.stats = { kills: 0, deaths: 0 };
    this.team = room === 'dogfight' ? await this.chooseTeam() : null;

    const spawn = randomSpawn(await this.currentMapId(room), this.team);
    this.myRef = this.db.ref(`rooms/${room}/players/${user.uid}`);

    // If this browser closes or drops off the internet, Firebase removes this pilot automatically
    this.myRef.onDisconnect().remove();

    await this.myRef.set(clean({
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

  // Signs in as an admin-capable client without joining a room (used by the admin roster)
  async connectAdminOnly() {
    const user = await this.requireUser();
    this.startClock();
    this.myUid = user.uid;
    this.isConnected = true;
  }

  disconnect() {
    this.listenerCleanups.forEach((off) => { try { off(); } catch (e) { /* already closed */ } });
    this.listenerCleanups = [];

    if (this.joined && this.myRef) {
      this.postFeed(this.currentRoom, { kind: 'chat', sender: 'SYSTEM', text: `${this.myName} disconnected from sector.`, isSystem: true });
      this.myRef.onDisconnect().cancel().catch(() => {});
      this.myRef.remove().catch(() => {});
    }

    this.myRef = null;
    this.joined = false;
    this.isConnected = false;
    this.lastRoom = this.currentRoom || this.lastRoom || null;
    this.currentRoom = null;
    this.lastMap = null;
    this.dead = false;
    this.clearAllRemotePlayers();
  }

  // ---------- listening to the room ----------

  attachListeners(room, me) {
    const R = (sub) => this.db.ref(`rooms/${room}/${sub}`);

    // Other pilots: positions, joins, leaves
    this.listen(R('players'), 'child_added', (snap) => {
      if (snap.key !== me && snap.val()) this.addRemotePlayer({ id: snap.key, ...snap.val() });
    });
    this.listen(R('players'), 'child_changed', (snap) => {
      if (snap.key !== me && snap.val()) this.updateRemotePlayer(snap.key, snap.val());
    });
    this.listen(R('players'), 'child_removed', (snap) => {
      this.removeRemotePlayer(snap.key);
    });

    // Tracers from other pilots
    this.listen(R('shots').limitToLast(50), 'child_added', (snap) => {
      const s = snap.val();
      if (!s || !s.o || !s.d || s.uid === me || this.now() - num(s.t) > SHOT_TTL_MS) return;
      const origin = new THREE.Vector3(s.o.x, s.o.y, s.o.z);
      const dir = new THREE.Vector3(s.d.x, s.d.y, s.d.z);
      this.weapons.spawnTracer(origin, dir, num(s.c, 0x00f0ff));
      if (this.sound) this.sound.playShoot(s.w || 'rifle');
    });

    // Damage aimed at this pilot
    this.listen(R(`hits/${me}`), 'child_added', (snap) => {
      const h = snap.val();
      snap.ref.remove().catch(() => {});
      if (!h || this.dead || this.now() - num(h.t) > HIT_MAX_AGE_MS) return;
      this.applyHit(h);
    });

    // Admin commands aimed at this pilot
    this.listen(R(`commands/${me}`), 'child_added', (snap) => {
      const c = snap.val();
      snap.ref.remove().catch(() => {});
      if (c && this.now() - num(c.t) < COMMAND_MAX_AGE_MS) this.handleCommand(c);
    });

    // Chat and kill messages
    this.listen(R('feed').limitToLast(30), 'child_added', (snap) => {
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
    });

    // Room map and Singularity Collapse share one value (meta/map), so they always arrive together
    let roomPrimed = false;
    let lastRoomRaw = null;
    if (room === 'dogfight') {
      this.listen(R('score'), 'value', (snap) => { this.score = snap.val() || { red: 0, blue: 0 }; });
      this.listen(R('round'), 'value', (snap) => { this.round = snap.val() || null; });
    }
    this.listen(R('meta/map'), 'value', (snap) => {
      const raw = snap.val() ? String(snap.val()) : null;
      if (raw === lastRoomRaw) return;
      lastRoomRaw = raw;
      const firstTime = !roomPrimed;
      roomPrimed = true;
      // Only the room you are in may change your map
      if (room !== this.currentRoom) return;
      window.dispatchEvent(new CustomEvent('room_state', {
        detail: { ...this.parseRoomMap(raw), firstTime }
      }));
    });
  }

  setCloaked(cloaked) {
    this.cloaked = !!cloaked;
  }

  // Other pilots see you disappear the moment you die (main.js shows your body only to you)
  markDead() {
    if (this.dead) return;
    this.dead = true;
    this.writeMine({ dead: true });
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

  triggerCataclysm(base = 'singularity') {
    if (!this.isConnected || !this.db || !this.currentRoom) return 0;
    const at = this.now();
    const name = String(this.myName || 'OVERLORD').replace(/\|/g, '/');
    // The collapse is written into the room's map value, keeping the base map so it can return later
    this.db.ref(`rooms/${this.currentRoom}/meta/map`)
      .set(`c|${at}|${this.myUid}|${name}|${base}`)
      .catch((e) => {
        console.error('Singularity collapse refused:', e);
        const fbUser = window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null;
        const who = !fbUser ? 'Not signed in to Firebase.'
          : fbUser.email ? 'Signed in as ' + fbUser.email + (fbUser.emailVerified ? ' (verified).' : ' (email NOT verified).')
          : 'Signed in as a guest (no email). Sign in with the admin email instead.';
        if (fbUser && fbUser.email && !fbUser.emailVerified) {
          if (confirm('The server refused the Singularity Collapse. ' + who + '\n\nSend a verification email to ' + fbUser.email + '? Click the link in it, then sign out and back in.')) {
            fbUser.sendEmailVerification()
              .then(() => alert('Verification email sent. Click the link in it (check spam), then sign out and back in.'))
              .catch((err) => alert('Could not send the verification email: ' + err.message));
          }
        } else {
          alert('The server refused the Singularity Collapse. ' + who);
        }
      });
    return at;
  }

  // meta/map is a plain map id, or "c|<at>|<byUid>|<byName>|<baseMap>" during a collapse
  parseRoomMap(raw) {
    if (!raw) return { base: null, collapse: null };
    const s = String(raw);
    if (!s.startsWith('c|')) return { base: s, collapse: null };
    const [, at, byId, by, base] = s.split('|');
    return {
      base: base || 'singularity',
      collapse: { at: Number(at) || 0, byId: byId || '', by: by || 'OVERLORD' }
    };
  }

  // ---------- dogfight: teams, kills and rounds ----------
  // The team with fewer pilots gets the next one
  async chooseTeam() {
    let red = 0;
    let blue = 0;
    try {
      const snap = await this.db.ref('rooms/dogfight/players').once('value');
      const all = snap.val() || {};
      for (const uid of Object.keys(all)) {
        if (uid === this.myUid || !all[uid]) continue;
        if (all[uid].team === 'red') red++;
        else if (all[uid].team === 'blue') blue++;
      }
    } catch (e) {
      console.warn('Could not count the teams', e);
    }
    return red <= blue ? 'red' : 'blue';
  }

  // Your death counts as a kill for the killer's team (the victim's client saves it, once)
  dogfightKill(killerId) {
    if (this.currentRoom !== 'dogfight' || !killerId || !this.db) return;
    const killer = this.otherPlayers[killerId];
    const team = killer && killer.team;
    if (!team) return;
    this.db.ref(`rooms/dogfight/score/${team}`)
      .transaction((v) => (Number(v) || 0) + 1)
      .then((res) => {
        if (res.committed && Number(res.snapshot.val()) >= WIN_KILLS) this.endRound(team);
      })
      .catch((e) => console.warn('Score not saved', e));
  }

  endRound(winner) {
    this.db.ref('rooms/dogfight/round').transaction((cur) => {
      if (!cur || cur.winner) return cur;
      return { ...cur, winner, won: this.now() };
    }).catch((e) => console.warn('Round not ended', e));
  }

  // Called about once a second on the dogfight server: starts, ends and restarts rounds
  tickDogfight() {
    if (this.currentRoom !== 'dogfight' || !this.db) return;
    const now = this.now();
    const round = this.round;
    const roundRef = this.db.ref('rooms/dogfight/round');
    if (!round) {
      roundRef.transaction((cur) => cur || { n: 1, end: now + ROUND_MS, winner: null, won: null }).catch(() => {});
      return;
    }
    if (!round.winner && round.end && now >= round.end) {
      const s = this.score || {};
      const red = Number(s.red) || 0;
      const blue = Number(s.blue) || 0;
      this.endRound(red === blue ? 'draw' : (red > blue ? 'red' : 'blue'));
      return;
    }
    if (round.winner && round.won && now >= round.won + WIN_PAUSE_MS) {
      roundRef.transaction((cur) => {
        if (!cur || !cur.winner || now < (cur.won || 0) + WIN_PAUSE_MS) return cur;
        return { n: (cur.n || 1) + 1, end: now + ROUND_MS, winner: null, won: null };
      }).then((res) => {
        if (res.committed) this.db.ref('rooms/dogfight/score').set({ red: 0, blue: 0 });
      }).catch(() => {});
    }
  }

  // Pilots in vehicles, for the dogfight vehicles to draw and to count seats
  getVehiclePilots() {
    return Object.values(this.otherPlayers)
      .filter((p) => p.vehicle && p.veh)
      .map((p) => ({ id: p.id, vehicle: p.vehicle, veh: p.veh, team: p.team }));
  }

  die(killerId, killerName, weapon) {
    this.dead = true;
    this.stats.deaths += 1;
    this.writeMine({ deaths: this.stats.deaths, dead: true });
    this.dogfightKill(killerId);
    this.postFeed(this.currentRoom, {
      kind: 'kill',
      killerId: killerId || '',
      killerName: killerName || 'The Void',
      victimId: this.myUid,
      victimName: this.myName,
      weapon: weapon || 'Plasma Rifle'
    });
    window.dispatchEvent(new CustomEvent('self_killed', {
      detail: { killerId: killerId || null, killerName: killerName || 'The Void', victimName: this.myName, weapon: weapon }
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
      case 'set_grants': {
        window.dispatchEvent(new CustomEvent('grants_updated', { detail: extra.grants || null }));
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

    // pos is the camera (eye height). Other pilots need the feet position, or their models float.
    const feetOffset = isCrouching ? 0.9 : 1.7; // same heights controls.js uses
    this.writeMine({
      x: round2(pos.x),
      y: round2(pos.y - feetOffset),
      z: round2(pos.z),
      rotX: round2(rotX),
      rotY: round2(rotY),
      isMoving: !!isMoving,
      isCrouching: !!isCrouching,
      health: num(this.vitals.health, 100),
      shield: num(this.vitals.shield, 50),
      cloaked: this.cloaked,
      dead: !!this.dead,
      team: this.team || null,
      vehicle: this.vehicleInfo || null,
      veh: this.vehicleVeh || null
    });
  }

  sendShoot(origin, direction, weaponId, tracerColor) {
    if (!this.joined) return;
    const ref = this.roomRef('shots').push(clean({
      uid: this.myUid,
      o: { x: round3(origin.x), y: round3(origin.y), z: round3(origin.z) },
      d: { x: round3(direction.x), y: round3(direction.y), z: round3(direction.z) },
      w: weaponId || 'rifle',
      c: num(tracerColor, 0x00f0ff),
      t: this.now()
    }));
    setTimeout(() => { ref.remove().catch(() => {}); }, SHOT_TTL_MS);
  }

  sendHit(targetId, damage, weaponId) {
    if (!this.joined || !targetId || targetId === this.myUid) return;
    this.roomRef(`hits/${targetId}`).push(clean({
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
    this.writeMine({ health: 100, shield: 50, dead: false });
  }

  sendChat(text) {
    if (!this.joined) return;
    const msg = String(text || '').trim().substring(0, 120);
    if (msg) this.postFeed(this.currentRoom, { kind: 'chat', sender: this.myName, text: msg, isSystem: false });
  }

  sendAdminAction(action, targetId = null, extra = {}) {
    if (!this.isConnected || !this.db) return;
    const room = this.currentRoom || this.lastRoom || 'world-hub';

    if (action === 'change_map') {
      this.db.ref(`rooms/${room}/meta/map`).set(String(extra.map || 'singularity'))
        .catch((e) => console.error('Admin map change refused:', e));
    } else if (action === 'broadcast') {
      this.postFeed(room, {
        kind: 'chat',
        sender: '⚡ OVERLORD ADMIN',
        text: String(extra.text || 'SYSTEM PROTOCOLS OVERRIDDEN').substring(0, 200),
        isSystem: true
      });
    } else if (targetId) {
      // Firebase logs a refused write on its own, so no catch is needed here
      this.db.ref(`rooms/${room}/commands/${targetId}`).push(clean({
        action,
        extra,
        from: this.myUid,
        t: this.now()
      }));
    }
  }

  // Admin: saves the map for the room you are in, or the World Server from the menu
  async setRoomMap(mapId) {
    await this.connectAdminOnly();
    const room = this.currentRoom || this.lastRoom || 'world-hub';
    await this.db.ref(`rooms/${room}/meta/map`).set(String(mapId || 'singularity'));
    return room;
  }

  // Deletes every pilot record in the room you are in (or last were in). Live players reappear on their next move.
  async clearRoomPlayers() {
    const room = this.currentRoom || this.lastRoom || 'world-hub';
    await this.ready();
    await this.db.ref(`rooms/${room}/players`).remove();
    return room;
  }

  async requestAdminPlayerList() {
    const room = this.currentRoom || this.lastRoom || 'world-hub';
    let list = [];
    try {
      await this.ready();
      const snap = await this.db.ref(`rooms/${room}/players`).once('value');
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
    return Promise.all(Object.keys(ROOMS).map(async (id) => {
      const [playersSnap, mapSnap] = await Promise.all([
        this.db.ref(`rooms/${id}/players`).once('value'),
        this.db.ref(`rooms/${id}/meta/map`).once('value')
      ]);
      const players = playersSnap.val() || {};
      return {
        id,
        name: ROOMS[id].name,
        map: mapSnap.val() ? this.parseRoomMap(mapSnap.val()).base : ROOMS[id].map,
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
    // Invisible box around the body that shots hit (the visible parts are too thin to hit reliably)
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.8, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(0, 0.9, 0);
    hitbox.name = 'pilot-hitbox';
    model.add(hitbox);
    this.scene.add(model);
    model.visible = !data.cloaked && !data.dead && !data.vehicle;
    this.skins.updateNametag(model, name, health, 100);

    this.otherPlayers[data.id] = {
      id: data.id,
      name,
      skin,
      model,
      targetPos: new THREE.Vector3(num(data.x), num(data.y), num(data.z)),
      targetRot: num(data.rotY),
      pitch: num(data.rotX),
      isMoving: !!data.isMoving,
      health,
      kills: num(data.kills),
      deaths: num(data.deaths),
      score: num(data.kills) * 100,
      cloaked: !!data.cloaked,
      team: data.team || null,
      vehicle: data.vehicle || null,
      veh: data.veh || null
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
    if (d.rotX !== undefined) rp.pitch = num(d.rotX);
    if (d.team !== undefined) rp.team = d.team || null;
    if (d.vehicle !== undefined) rp.vehicle = d.vehicle || null;
    if (d.veh !== undefined) rp.veh = d.veh || null;
    rp.isMoving = !!d.isMoving;
    if (d.health !== undefined) rp.health = num(d.health, rp.health);
    if (d.dead !== undefined) rp.dead = !!d.dead;
    if (d.cloaked !== undefined) rp.cloaked = !!d.cloaked;
    rp.model.visible = !rp.cloaked && !rp.dead && !rp.vehicle;
    if (d.kills !== undefined) { rp.kills = num(d.kills); rp.score = rp.kills * 100; }
    if (d.deaths !== undefined) rp.deaths = num(d.deaths);
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
    // Cloaked and dead pilots cannot be shot
    return Object.values(this.otherPlayers).filter((p) => !p.cloaked && !p.dead && !(this.currentRoom === 'dogfight' && this.team && p.team === this.team)).map((p) => ({
      id: p.id,
      mesh: p.model,
      name: p.name
    }));
  }
}
