const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();

// Allow requests from your Firebase-hosted game
const allowedOrigins = [
  'https://eventhorizenfps.web.app',
  'https://eventhorizenfps.firebaseapp.com'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


const PORT = process.env.PORT || 3000;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use(express.json());

// In-memory stats / leaderboards
const leaderboard = [];
const rooms = {
  'world-hub': { id: 'world-hub', name: 'Event Horizon - World Server (Global)', map: 'singularity', players: {} },
  'aegis-station': { id: 'aegis-station', name: 'Aegis Space Station Arena', map: 'station', players: {} },
  'mars-outpost': { id: 'mars-outpost', name: 'Mars Red Dunes Colony', map: 'mars', players: {} },
  'cyber-void': { id: 'cyber-void', name: 'Cyber Void Jump Arena', map: 'cyber', players: {} }
};

// Spawn points for maps
const SPAWN_POINTS = {
  singularity: [
    { x: 0, y: 3, z: 0 },
    { x: 25, y: 5, z: 25 },
    { x: -25, y: 5, z: -25 },
    { x: 30, y: 6, z: -30 },
    { x: -30, y: 6, z: 30 }
  ],
  station: [
    { x: 0, y: 2, z: 0 },
    { x: 18, y: 2, z: 18 },
    { x: -18, y: 2, z: -18 },
    { x: 20, y: 2, z: -20 },
    { x: -20, y: 2, z: 20 }
  ],
  mars: [
    { x: 0, y: 2, z: 0 },
    { x: 35, y: 3, z: 35 },
    { x: -35, y: 3, z: -35 },
    { x: 40, y: 4, z: -20 },
    { x: -40, y: 4, z: 20 }
  ],
  cyber: [
    { x: 0, y: 4, z: 0 },
    { x: 22, y: 6, z: 22 },
    { x: -22, y: 6, z: -22 },
    { x: 25, y: 8, z: -25 },
    { x: -25, y: 8, z: 25 }
  ]
};

function getRandomSpawn(map = 'singularity') {
  const points = SPAWN_POINTS[map] || SPAWN_POINTS.singularity;
  const pt = points[Math.floor(Math.random() * points.length)];
  return {
    x: pt.x + (Math.random() * 4 - 2),
    y: pt.y,
    z: pt.z + (Math.random() * 4 - 2)
  };
}

// REST API for leaderboards and room status
app.get('/api/rooms', (req, res) => {
  const roomData = Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    map: r.map,
    playerCount: Object.keys(r.players).length
  }));
  res.json(roomData);
});

app.get('/api/leaderboard', (req, res) => {
  res.json(leaderboard.slice(0, 10));
});

// WebSocket Multiplayer Management
wss.on('connection', (ws) => {
  let playerId = 'usr_' + Math.random().toString(36).substring(2, 9);
  let currentRoom = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join': {
          const roomId = data.room || 'world-hub';
          if (!rooms[roomId]) {
            rooms[roomId] = { id: roomId, name: 'Custom Arena', map: 'singularity', players: {} };
          }
          currentRoom = roomId;

          const spawn = getRandomSpawn(rooms[roomId].map);
          const newPlayer = {
            id: playerId,
            name: (data.name && data.name.trim().substring(0, 16)) || 'Astronaut-' + playerId.substring(4),
            skin: data.skin || 'vanguard',
            weapon: data.weapon || 'rifle',
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            rotX: 0,
            rotY: 0,
            health: 100,
            maxHealth: 100,
            shield: 50,
            maxShield: 50,
            kills: 0,
            deaths: 0,
            score: 0,
            isMoving: false,
            isCrouching: false
          };

          rooms[roomId].players[playerId] = newPlayer;
          ws.playerId = playerId;
          ws.roomId = roomId;

          // Send welcome packet with current players and room info
          ws.send(JSON.stringify({
            type: 'init',
            selfId: playerId,
            room: rooms[roomId],
            spawn: spawn,
            players: rooms[roomId].players
          }));

          // Notify other players in the same room
          broadcastToRoom(roomId, {
            type: 'player_joined',
            player: newPlayer
          }, playerId);

          // Broadcast system chat
          broadcastToRoom(roomId, {
            type: 'chat',
            sender: 'SYSTEM',
            text: `${newPlayer.name} entered the Event Horizon sector.`,
            isSystem: true
          });
          break;
        }

        case 'move': {
          if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].players[playerId]) return;
          const p = rooms[currentRoom].players[playerId];
          p.x = data.x;
          p.y = data.y;
          p.z = data.z;
          p.rotX = data.rotX;
          p.rotY = data.rotY;
          p.isMoving = !!data.isMoving;
          p.isCrouching = !!data.isCrouching;
          break;
        }

        case 'shoot': {
          if (!currentRoom) return;
          broadcastToRoom(currentRoom, {
            type: 'player_shoot',
            id: playerId,
            origin: data.origin,
            direction: data.direction,
            weaponId: data.weaponId,
            tracerColor: data.tracerColor
          }, playerId);
          break;
        }

        case 'hit': {
          if (!currentRoom || !rooms[currentRoom]) return;
          const targetId = data.targetId;
          const target = rooms[currentRoom].players[targetId];
          const attacker = rooms[currentRoom].players[playerId];

          if (target && target.health > 0) {
            let dmg = Math.max(5, Math.min(100, data.damage || 20));

            // Absorb with shield first
            if (target.shield > 0) {
              if (target.shield >= dmg) {
                target.shield -= dmg;
                dmg = 0;
              } else {
                dmg -= target.shield;
                target.shield = 0;
              }
            }

            target.health = Math.max(0, target.health - dmg);

            // Inform everyone of hit update
            broadcastToRoom(currentRoom, {
              type: 'player_damaged',
              targetId: targetId,
              attackerId: playerId,
              health: target.health,
              shield: target.shield
            });

            // If player died
            if (target.health <= 0) {
              target.deaths++;
              if (attacker) {
                attacker.kills++;
                attacker.score += 100;
                updateLeaderboard(attacker.name, attacker.kills);
              }

              broadcastToRoom(currentRoom, {
                type: 'player_killed',
                victimId: targetId,
                victimName: target.name,
                killerId: playerId,
                killerName: attacker ? attacker.name : 'The Void',
                weapon: data.weaponId || 'Plasma Rifle'
              });
            }
          }
          break;
        }

        case 'respawn': {
          if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].players[playerId]) return;
          const p = rooms[currentRoom].players[playerId];
          const spawn = getRandomSpawn(rooms[currentRoom].map);
          p.health = 100;
          p.shield = 50;
          p.x = spawn.x;
          p.y = spawn.y;
          p.z = spawn.z;

          broadcastToRoom(currentRoom, {
            type: 'player_respawned',
            player: p
          });
          break;
        }

        case 'change_skin': {
          if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].players[playerId]) return;
          rooms[currentRoom].players[playerId].skin = data.skin;
          broadcastToRoom(currentRoom, {
            type: 'player_updated',
            player: rooms[currentRoom].players[playerId]
          });
          break;
        }

        case 'admin_action': {
          const auth = data.auth || {};
          const isAuthed = ws.isAdmin || (auth.email && auth.email.trim().toLowerCase() === 'hacker@gmail.com' && auth.password === 'H@CK#R123!');
          if (!isAuthed) {
            ws.send(JSON.stringify({ type: 'admin_error', message: 'Access Denied: Invalid Overlord Credentials' }));
            return;
          }
          ws.isAdmin = true;

          const action = data.action;
          const targetId = data.targetId;
          const roomId = currentRoom || 'world-hub';

          const targetRoomId = targetId
          ? Object.keys(rooms).find(
              id => rooms[id].players[targetId]
            )
          : null;

          switch (action) {
            case 'kill_player': {
              if (rooms[roomId] && rooms[roomId].players[targetId]) {
                const target = rooms[roomId].players[targetId];
                target.health = 0;
                target.deaths++;
                broadcastToRoom(roomId, {
                  type: 'player_damaged',
                  targetId: targetId,
                  attackerId: playerId,
                  health: 0,
                  shield: 0
                });
                broadcastToRoom(roomId, {
                  type: 'player_killed',
                  victimId: targetId,
                  victimName: target.name,
                  killerId: playerId,
                  killerName: '⚡ OVERLORD (ADMIN)',
                  weapon: 'Orbital Singularity Cannon'
                });
              }
              break;
            }

            case 'heal_player': {
              if (rooms[roomId] && rooms[roomId].players[targetId]) {
                const target = rooms[roomId].players[targetId];
                target.health = 500;
                target.shield = 500;
                broadcastToRoom(roomId, {
                  type: 'player_damaged',
                  targetId: targetId,
                  attackerId: playerId,
                  health: 500,
                  shield: 500
                });
              }
              break;
            }

            case 'force_skin': {
              if (rooms[roomId] && rooms[roomId].players[targetId]) {
                rooms[roomId].players[targetId].skin = data.skin || 'celestial';
                broadcastToRoom(roomId, {
                  type: 'player_updated',
                  player: rooms[roomId].players[targetId]
                });
              }
              break;
            }

            case 'change_map': {
              if (rooms[roomId]) {
                rooms[roomId].map = data.map || 'singularity';
                broadcastToRoom(roomId, {
                  type: 'room_map_changed',
                  map: data.map
                });
                broadcastToRoom(roomId, {
                  type: 'chat',
                  sender: '⚡ OVERLORD ADMIN',
                  text: `Sector landscape shifted to ${data.map.toUpperCase()}!`,
                  isSystem: true
                });
              }
              break;
            }

            case 'grant_credits': {
              wss.clients.forEach(c => {
                if (c.playerId === targetId && c.readyState === WebSocket.OPEN) {
                  c.send(JSON.stringify({ type: 'credit_grant', amount: data.amount || 10000 }));
                }
              });
              break;
            }

            case 'kick_player': {
              wss.clients.forEach(c => {
                if (c.playerId === targetId && c.readyState === WebSocket.OPEN) {
                  c.send(JSON.stringify({ type: 'kicked', reason: 'Terminated by Overlord.' }));
                  c.close();
                }
              });
              break;
            }

            case 'broadcast': {
              broadcastToRoom(roomId, {
                type: 'chat',
                sender: '⚡ OVERLORD ADMIN',
                text: data.text || 'SYSTEM PROTOCOLS OVERRIDDEN',
                isSystem: true
              });
              break;
            }

            case 'get_players': {
              const pList = [];

              // Collect players from EVERY room
              for (const [roomId, room] of Object.entries(rooms)) {
                for (const player of Object.values(room.players)) {
                  pList.push({
                    ...player,
                    roomId: roomId,
                    roomName: room.name
                  });
                }
              }

              // Send the complete global player roster
              ws.send(JSON.stringify({
                type: 'admin_player_list',
                players: pList
              }));

              break;
            }
          }
          break;
        }

        case 'chat': {
          if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].players[playerId]) return;
          const text = (data.text || '').trim().substring(0, 120);
          if (text) {
            broadcastToRoom(currentRoom, {
              type: 'chat',
              sender: rooms[currentRoom].players[playerId].name,
              text: text
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error('Socket message parse error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[playerId]) {
      const leavingPlayer = rooms[currentRoom].players[playerId];
      delete rooms[currentRoom].players[playerId];

      broadcastToRoom(currentRoom, {
        type: 'player_left',
        id: playerId
      });

      broadcastToRoom(currentRoom, {
        type: 'chat',
        sender: 'SYSTEM',
        text: `${leavingPlayer.name} disconnected from sector.`,
        isSystem: true
      });
    }
  });
});

// Broadcast helper
function broadcastToRoom(roomId, msgObj, excludeId = null) {
  const jsonStr = JSON.stringify(msgObj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId && client.playerId !== excludeId) {
      client.send(jsonStr);
    }
  });
}

// 30Hz World Sync Tick for position interpolation
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerKeys = Object.keys(room.players);
    if (playerKeys.length > 0) {
      const syncData = {
        type: 'world_sync',
        timestamp: Date.now(),
        players: room.players
      };
      const jsonStr = JSON.stringify(syncData);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
          client.send(jsonStr);
        }
      });
    }
  }
}, 33); // ~30 fps

function updateLeaderboard(name, kills) {
  let entry = leaderboard.find(e => e.name === name);
  if (entry) {
    entry.kills = Math.max(entry.kills, kills);
  } else {
    leaderboard.push({ name, kills, date: new Date().toLocaleDateString() });
  }
  leaderboard.sort((a, b) => b.kills - a.kills);
}

// Heartbeat ping
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🌌 EVENT HORIZON - 3D FPS WORLD SERVER ONLINE`);
  console.log(`🚀 Access at http://localhost:${PORT}`);
  console.log(`===============================================`);
});
