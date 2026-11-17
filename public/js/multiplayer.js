// EVENT HORIZON - WEBSOCKET MULTIPLAYER WORLD CLIENT
import * as THREE from 'three';

// YOUR RENDER SERVER ADDRESS (no https://, starts with wss://)
// Example: 'wss://event-horizon.onrender.com'
const SERVER_URL = 'wss://eventhorizenfps.onrender.com';

export class MultiplayerClient {
  constructor(scene, skinManager, weaponManager, soundEngine) {
    this.scene = scene;
    this.skins = skinManager;
    this.weapons = weaponManager;
    this.sound = soundEngine;

    this.ws = null;
    this.selfId = null;
    this.currentRoom = null;
    this.otherPlayers = {};
    this.isConnected = false;
    this.lastSendMoveTime = 0;
  }

  connect(roomId = 'world-hub', playerName = 'Pilot', skinId = 'vanguard', weaponId = 'rifle') {
    // Close any old connection first so a rejoin doesn't leave a ghost player behind
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }

    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.ws.send(JSON.stringify({
        type: 'join',
        room: roomId,
        name: playerName,
        skin: skinId,
        weapon: weaponId
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Error parsing multiplayer message:', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.clearAllRemotePlayers();
      console.log('Multiplayer connection closed.');
    };
  }

  // Opens a connection WITHOUT joining a room (used by the admin roster)
  connectAdminOnly() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (this.ws) { this.ws.onclose = null; this.ws.close(); }
      this.ws = new WebSocket(SERVER_URL);
      this.ws.onopen = () => { this.isConnected = true; resolve(); };
      this.ws.onerror = () => reject(new Error('socket error'));
      this.ws.onmessage = (event) => {
        try { this.handleMessage(JSON.parse(event.data)); } catch (e) {}
      };
      this.ws.onclose = () => { this.isConnected = false; };
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        this.selfId = msg.selfId;
        this.currentRoom = msg.room;

        // Spawn existing players
        for (const pid in msg.players) {
          if (pid !== this.selfId) {
            this.addRemotePlayer(msg.players[pid]);
          }
        }

        window.dispatchEvent(new CustomEvent('multiplayer_joined', {
          detail: { selfId: this.selfId, spawn: msg.spawn, room: msg.room }
        }));
        break;
      }

      case 'player_joined': {
        if (msg.player.id !== this.selfId) {
          this.addRemotePlayer(msg.player);
        }
        break;
      }

      case 'player_left': {
        this.removeRemotePlayer(msg.id);
        break;
      }

      case 'world_sync': {
        for (const pid in msg.players) {
          if (pid !== this.selfId && this.otherPlayers[pid]) {
            const pData = msg.players[pid];
            const rp = this.otherPlayers[pid];
            rp.targetPos.set(pData.x, pData.y, pData.z);
            rp.targetRot = pData.rotY;
            rp.isMoving = pData.isMoving;
            rp.health = pData.health;
            rp.shield = pData.shield;
            this.skins.updateNametag(rp.model, pData.name, pData.health, pData.maxHealth || 100);
          }
        }
        break;
      }

      case 'player_shoot': {
        if (msg.id !== this.selfId) {
          const origin = new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z);
          const dir = new THREE.Vector3(msg.direction.x, msg.direction.y, msg.direction.z);
          this.weapons.spawnTracer(origin, dir, msg.tracerColor || 0x00f0ff);
          if (this.sound) {
            this.sound.playShoot(msg.weaponId || 'rifle');
          }
        }
        break;
      }

      case 'player_damaged': {
        if (msg.targetId === this.selfId) {
          window.dispatchEvent(new CustomEvent('self_damaged', {
            detail: { health: msg.health, shield: msg.shield }
          }));
        } else if (this.otherPlayers[msg.targetId]) {
          const rp = this.otherPlayers[msg.targetId];
          this.skins.updateNametag(rp.model, rp.name, msg.health, 100);
        }
        break;
      }

      case 'player_killed': {
        window.dispatchEvent(new CustomEvent('kill_feed_event', { detail: msg }));
        if (msg.victimId === this.selfId) {
          window.dispatchEvent(new CustomEvent('self_killed', { detail: msg }));
        }
        break;
      }

      case 'player_respawned': {
        if (msg.player.id === this.selfId) {
          window.dispatchEvent(new CustomEvent('self_respawned', { detail: msg.player }));
        } else if (this.otherPlayers[msg.player.id]) {
          const rp = this.otherPlayers[msg.player.id];
          rp.targetPos.set(msg.player.x, msg.player.y, msg.player.z);
          rp.model.position.copy(rp.targetPos);
          this.skins.updateNametag(rp.model, rp.name, 100, 100);
        }
        break;
      }

      case 'chat': {
        window.dispatchEvent(new CustomEvent('chat_message_received', { detail: msg }));
        break;
      }

      case 'admin_player_list': {
        window.dispatchEvent(new CustomEvent('admin_player_list_received', { detail: msg.players }));
        break;
      }

      case 'credit_grant': {
        window.dispatchEvent(new CustomEvent('admin_credit_grant', { detail: { amount: msg.amount } }));
        break;
      }

      case 'kicked': {
        alert(msg.reason || 'You were disconnected by the Admin Overlord.');
        window.location.reload();
        break;
      }

      case 'room_map_changed': {
        window.dispatchEvent(new CustomEvent('room_map_changed', { detail: { map: msg.map } }));
        break;
      }
    }
  }

  addRemotePlayer(data) {
    if (this.otherPlayers[data.id]) return;

    const model = this.skins.createPlayerModel(data.skin, data.name);
    model.position.set(data.x, data.y, data.z);
    this.scene.add(model);

    this.otherPlayers[data.id] = {
      id: data.id,
      name: data.name,
      skin: data.skin,
      model: model,
      targetPos: new THREE.Vector3(data.x, data.y, data.z),
      targetRot: 0,
      isMoving: false,
      health: data.health || 100
    };
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

  sendMove(pos, rotX, rotY, isMoving, isCrouching) {
    if (!this.isConnected || !this.ws) return;
    const now = performance.now();
    if (now - this.lastSendMoveTime > 30) { // ~33hz
      this.lastSendMoveTime = now;
      this.ws.send(JSON.stringify({
        type: 'move',
        x: Number(pos.x.toFixed(2)),
        y: Number(pos.y.toFixed(2)),
        z: Number(pos.z.toFixed(2)),
        rotX: Number(rotX.toFixed(2)),
        rotY: Number(rotY.toFixed(2)),
        isMoving: isMoving,
        isCrouching: isCrouching
      }));
    }
  }

  sendShoot(origin, direction, weaponId, tracerColor) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      type: 'shoot',
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      weaponId: weaponId,
      tracerColor: tracerColor
    }));
  }

  sendHit(targetId, damage, weaponId) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      type: 'hit',
      targetId: targetId,
      damage: damage,
      weaponId: weaponId
    }));
  }

  sendRespawn() {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'respawn' }));
  }

  sendChat(text) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'chat', text: text }));
  }

  update(delta) {
    // Interpolate remote players
    for (const id in this.otherPlayers) {
      const rp = this.otherPlayers[id];
      // Smooth movement LERP
      rp.model.position.lerp(rp.targetPos, Math.min(1, delta * 15));
      // Smooth rotation LERP
      rp.model.rotation.y += (rp.targetRot - rp.model.rotation.y) * Math.min(1, delta * 12);

      // Animate walking
      this.skins.animateModel(rp.model, delta, rp.isMoving);
    }
  }

  getRemotePlayerMeshes() {
    return Object.values(this.otherPlayers).map(p => ({
      id: p.id,
      mesh: p.model,
      name: p.name
    }));
  }

  sendAdminAction(action, targetId = null, extra = {}) {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({
      type: 'admin_action',
      auth: { email: 'HACKER@gmail.com', password: 'H@CK#R123!' },
      action: action,
      targetId: targetId,
      ...extra
    }));
  }

  requestAdminPlayerList() {
    this.sendAdminAction('get_players');
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clearAllRemotePlayers();
    this.isConnected = false;
  }
}
