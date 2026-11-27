// EVENT HORIZON - DOGFIGHT VEHICLES
// The jet (flight, fuel and altitude) and each team's garage car (driver steers, the
// turret follows the driver's mouse, passengers shoot from their seats).
// A vehicle is flown or driven by whoever sits in seat 0. When it is empty it goes back
// to its hangar or garage. Positions are shared with other pilots through their player record.
import * as THREE from 'three';

export const JET_CEILING = 600;   // highest the jet can fly, in metres
export const JET_FUEL_MAX = 100;
const JET_MAX_SPEED = 70;
const JET_EYE = 1.4;
const CAR_EYE = 1.6;
const CAR_MAX = 16;
const CAR_REVERSE = 6;
// Passenger seat offsets inside the car (x to the right, z to the back)
const SEAT_OFFSETS = [[0, 0], [0.7, 0.5], [-0.7, -0.6], [0.7, -0.9]];

export const VEHICLES = {
  jet:       { name: 'JET',        seats: 1, team: null,  dock: { x: 0,    y: 0, z: -200, hYaw: 0 } },
  'car-red': { name: 'GARAGE CAR', seats: 4, team: 'red', dock: { x: -150, y: 0, z: 0,    hYaw: Math.PI / 2 } },
  'car-blue':{ name: 'GARAGE CAR', seats: 4, team: 'blue', dock: { x: 150,  y: 0, z: 0,    hYaw: -Math.PI / 2 } }
};

export class DogfightManager {
  // deps: getPilots() -> [{ vehicle: {id, seat}, veh: {x,y,z,hYaw,hPitch,tYaw} }],
  //       isBlocked(x, z, feetY), notify(text), onExit({x,y,z})
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;
    this.enabled = false;
    this.visuals = {};
    this.hud = null;
    this.scoreHud = null;
    this.cockpits = null;
    this.reset();
  }

  // Frames and dashboards on the camera, so you can see you are inside
  ensureCockpits() {
    if (this.cockpits) return;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.6, metalness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const add = (g, geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      g.add(m);
    };

    const jet = new THREE.Group();
    add(jet, new THREE.BoxGeometry(2.8, 0.7, 0.9), dark, 0, -0.62, -0.95, -0.35);   // dashboard
    add(jet, new THREE.BoxGeometry(2.2, 0.06, 0.06), glow, 0, -0.36, -1.0, -0.35);  // glowing strip
    add(jet, new THREE.BoxGeometry(0.16, 1.6, 0.16), dark, -1.25, 0.2, -0.8);      // left frame
    add(jet, new THREE.BoxGeometry(0.16, 1.6, 0.16), dark, 1.25, 0.2, -0.8);       // right frame
    add(jet, new THREE.BoxGeometry(2.6, 0.16, 0.16), dark, 0, 1.0, -0.8);          // top frame
    add(jet, new THREE.BoxGeometry(0.1, 0.9, 0.1), dark, 0, 0.6, -0.8);            // centre post

    const car = new THREE.Group();
    add(car, new THREE.BoxGeometry(2.6, 0.6, 1.0), dark, 0, -0.55, -1.1, -0.3);    // dashboard
    add(car, new THREE.BoxGeometry(0.16, 1.3, 0.16), dark, -1.1, 0.3, -1.0);       // left pillar
    add(car, new THREE.BoxGeometry(0.16, 1.3, 0.16), dark, 1.1, 0.3, -1.0);        // right pillar
    add(car, new THREE.BoxGeometry(2.4, 0.16, 0.16), dark, 0, 0.95, -1.0);         // roof frame
    add(car, new THREE.BoxGeometry(0.1, 0.8, 0.1), dark, 0, 0.5, -1.0);            // centre post

    for (const g of [jet, car]) {
      g.visible = false;
      this.deps.camera.add(g);
    }
    this.cockpits = { jet, car };
  }

  showCockpit(which) {
    if (!this.cockpits) return;
    this.cockpits.jet.visible = which === 'jet';
    this.cockpits.car.visible = which === 'car';
  }

  reset() {
    this.active = false;
    this.vehicleId = null;
    this.seat = 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.hYaw = 0; this.hPitch = 0;
    this.tYaw = 0;
    this.speed = 0;
    this.fuel = JET_FUEL_MAX;
    this.info = null;   // shared with other pilots: { id, seat }
    this.veh = null;    // shared with other pilots: vehicle position and aim
  }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.ensureVisuals();
      this.ensureCockpits();
      this.setScoreHud(true);
    } else {
      this.destroyVisuals();
      this.reset();
      this.setHud(false);
      this.setScoreHud(false);
      this.showCockpit(null);
    }
  }

  // ---------- visuals ----------
  ensureVisuals() {
    if (Object.keys(this.visuals).length) return;
    for (const id of Object.keys(VEHICLES)) {
      const g = id === 'jet' ? this.makeJet() : this.makeCar(VEHICLES[id].team);
      this.scene.add(g);
      this.visuals[id] = g;
    }
  }

  destroyVisuals() {
    for (const id of Object.keys(this.visuals)) this.scene.remove(this.visuals[id]);
    this.visuals = {};
  }

  makeJet() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x9aa4b5, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 7, 10), skin);
    body.rotation.x = Math.PI / 2;
    body.position.y = 1.0;
    const wings = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 1.8), skin);
    wings.position.set(0, 1.0, 0.2);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.2), skin);
    fin.position.set(0, 1.7, 2.8);
    g.add(body, wings, fin);
    return g;
  }

  makeCar(team) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: team === 'red' ? 0x8a2a2a : 0x2a4a8a, roughness: 0.6, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 4.4), paint);
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), dark);
    cabin.position.y = 1.35;
    // Turret on the roof: a group that turns with the driver's mouse
    const turret = new THREE.Group();
    turret.position.set(0, 1.75, 0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.35, 10), dark);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.5), dark);
    gun.position.set(0, 0.12, -0.9);
    turret.add(base, gun);
    g.add(body, cabin, turret);
    g.userData.turret = turret;
    return g;
  }

  // Who is sitting where, from the other pilots' records
  occupancy() {
    const out = {};
    for (const p of this.deps.getPilots()) {
      const id = p.vehicle && p.vehicle.id;
      if (!id || !VEHICLES[id] || !p.veh) continue;
      const o = out[id] || (out[id] = { seats: new Set(), state: null });
      const seat = Number(p.vehicle.seat) || 0;
      o.seats.add(seat);
      if (!o.state || seat === 0) o.state = p.veh;
    }
    return out;
  }

  // Moves each vehicle to its pilot, or back to its dock when it is empty
  updateVisuals() {
    if (!this.enabled) return;
    const occ = this.occupancy();
    for (const id of Object.keys(VEHICLES)) {
      const v = this.visuals[id];
      if (!v) continue;
      const dock = VEHICLES[id].dock;
      const mine = this.active && this.vehicleId === id;
      const st = mine
        ? { x: this.x, y: this.y, z: this.z, hYaw: this.hYaw, hPitch: this.hPitch, tYaw: this.tYaw }
        : (occ[id] && occ[id].state) || { x: dock.x, y: dock.y, z: dock.z, hYaw: dock.hYaw, hPitch: 0, tYaw: 0 };
      v.position.set(st.x, st.y, st.z);
      v.rotation.set(id === 'jet' ? (st.hPitch || 0) : 0, st.hYaw || 0, 0, 'YXZ');
      v.visible = !mine;
      if (v.userData.turret) v.userData.turret.rotation.y = st.tYaw || 0;
    }
  }

  // ---------- boarding ----------
  // Nearest vehicle you may use, within 6 metres
  nearestVehicle(px, pz, team) {
    const occ = this.occupancy();
    let best = null;
    let bestD = 6;
    for (const id of Object.keys(VEHICLES)) {
      const def = VEHICLES[id];
      if (def.team && def.team !== team) continue; // the other team's garage car is off limits
      const o = occ[id];
      const st = (o && o.state) || def.dock;
      const d = Math.hypot(st.x - px, st.z - pz);
      if (d < bestD) { bestD = d; best = { id, occ: o, st }; }
    }
    return best;
  }

  toggleBoard(camPos, team) {
    if (!this.enabled) return false;
    if (this.active) { this.exit(); return false; }
    const near = this.nearestVehicle(camPos.x, camPos.z, team);
    if (!near) {
      this.deps.notify('No vehicle close enough. Walk up to a jet or your team\'s garage car.');
      return false;
    }
    const used = near.occ ? near.occ.seats : new Set();
    let seat = -1;
    for (let i = 0; i < VEHICLES[near.id].seats; i++) {
      if (!used.has(i)) { seat = i; break; }
    }
    if (seat < 0) {
      this.deps.notify('That vehicle is full.');
      return false;
    }
    this.board(near.id, seat, near.st);
    return true;
  }

  board(id, seat, st) {
    this.active = true;
    this.vehicleId = id;
    this.seat = seat;
    this.showCockpit(id);
    this.x = st.x; this.y = st.y; this.z = st.z;
    this.hYaw = st.hYaw || 0;
    this.hPitch = 0;
    this.tYaw = 0;
    this.speed = 0;
    if (id === 'jet' && seat === 0) this.fuel = JET_FUEL_MAX;
    this.setHud(true);
  }

  exit() {
    const flying = this.vehicleId === 'jet' && this.seat === 0 && this.y > 0.6;
    if (this.speed > 3 || flying) {
      this.deps.notify('Slow down and land before getting out.');
      return;
    }
    const side = this.vehicleId === 'jet' ? 3.5 : 2.8;
    let ex = this.x + side;
    if (this.deps.isBlocked(ex, this.z, this.y)) ex = this.x - side;
    this.deps.onExit({ x: ex, y: this.y, z: this.z });
    this.forceExit();
  }

  forceExit() {
    if (!this.active) return;
    this.active = false;
    this.vehicleId = null;
    this.info = null;
    this.veh = null;
    this.setHud(false);
    this.showCockpit(null);
  }

  // ---------- movement ----------
  // Returns the camera for this frame, or null when not in a vehicle.
  // aim is the mouse look: { yaw, pitch }
  update(delta, input, aim) {
    if (!this.active) {
      this.info = null;
      this.veh = null;
      return null;
    }
    const dt = Math.min(delta, 0.05);
    const id = this.vehicleId;
    const pilot = this.seat === 0;

    if (id === 'jet') {
      if (pilot) {
        this.hYaw = aim.yaw;
        this.hPitch = Math.max(-1.3, Math.min(1.3, aim.pitch));
        this.flyJet(dt, input);
      }
    } else if (pilot) {
      this.driveCar(dt, input);
      this.tYaw = aim.yaw - this.hYaw; // the turret follows the mouse
    } else {
      // Passengers ride along with the car
      const occ = this.occupancy()[id];
      if (occ && occ.state) {
        this.x = occ.state.x; this.y = occ.state.y; this.z = occ.state.z;
        this.hYaw = occ.state.hYaw || 0;
      }
    }

    this.info = { id, seat: this.seat };
    this.veh = {
      x: round2(this.x), y: round2(this.y), z: round2(this.z),
      hYaw: round2(this.hYaw), hPitch: round2(this.hPitch),
      tYaw: round2(this.tYaw), fuel: Math.round(this.fuel)
    };
    this.updateHud();

    // Camera
    if (id === 'jet') {
      return { x: this.x, y: this.y + JET_EYE, z: this.z, yaw: this.hYaw, pitch: this.hPitch };
    }
    if (pilot) {
      return { x: this.x, y: this.y + CAR_EYE, z: this.z, yaw: aim.yaw, pitch: aim.pitch };
    }
    const off = SEAT_OFFSETS[this.seat] || [0, 0];
    return { x: this.x + off[0], y: this.y + CAR_EYE - 0.3, z: this.z + off[1], yaw: aim.yaw, pitch: aim.pitch };
  }

  flyJet(dt, input) {
    // Throttle burns fuel. With no fuel the engine is off and the jet glides down.
    if (input.forward && this.fuel > 0) {
      this.speed = Math.min(JET_MAX_SPEED, this.speed + 35 * dt);
      this.fuel = Math.max(0, this.fuel - 1.2 * dt);
    } else if (input.back) {
      this.speed = Math.max(0, this.speed - 45 * dt);
    } else {
      this.speed = Math.max(0, this.speed - 6 * dt);
      this.fuel = Math.max(0, this.fuel - 0.2 * dt);
    }

    const cp = Math.cos(this.hPitch);
    this.x += -Math.sin(this.hYaw) * cp * this.speed * dt;
    this.y += Math.sin(this.hPitch) * this.speed * dt;
    this.z += -Math.cos(this.hYaw) * cp * this.speed * dt;

    // Below stall speed the jet drops
    if (this.speed < 22) this.y -= (22 - this.speed) * 1.2 * dt;
    if (this.y > JET_CEILING) this.y = JET_CEILING;
    if (this.y <= 0) {
      this.y = 0;
      this.speed = Math.min(this.speed, 12); // landing slows the jet
    }
  }

  driveCar(dt, input) {
    if (input.forward && !input.back) this.speed = Math.min(CAR_MAX, this.speed + 12 * dt);
    else if (input.back) this.speed = Math.max(-CAR_REVERSE, this.speed - 14 * dt);
    else if (this.speed > 0) this.speed = Math.max(0, this.speed - 6 * dt);
    else this.speed = Math.min(0, this.speed + 6 * dt);

    if (Math.abs(this.speed) > 0.5) {
      this.hYaw += (Number(input.left) - Number(input.right)) * 1.6 * dt;
    }
    const nx = this.x - Math.sin(this.hYaw) * this.speed * dt;
    const nz = this.z - Math.cos(this.hYaw) * this.speed * dt;
    if (!this.deps.isBlocked(nx, nz, this.y)) {
      this.x = nx;
      this.z = nz;
    } else {
      this.speed = 0;
    }
  }

  // ---------- HUD ----------
  setHud(on) {
    if (!this.hud) {
      this.hud = document.createElement('div');
      this.hud.id = 'dog-hud';
      this.hud.style.cssText = 'position:fixed; left:16px; bottom:120px; z-index:50; font-family:var(--font-display); color:#e6f7ff; background:rgba(5,7,13,0.75); border:1px solid rgba(0,240,255,0.4); border-radius:6px; padding:10px 12px; min-width:200px; pointer-events:none; display:none;';
      document.body.appendChild(this.hud);
    }
    this.hud.style.display = on ? 'block' : 'none';
  }

  updateHud() {
    if (!this.hud || !this.active) return;
    if (this.vehicleId === 'jet' && this.seat === 0) {
      const fuel = Math.round(this.fuel);
      const alt = Math.round(this.y);
      const altPct = Math.min(100, (this.y / JET_CEILING) * 100);
      this.hud.innerHTML = `
        <div style="font-size:0.8rem; letter-spacing:1px;">ALTITUDE <b>${alt} m</b> <span style="color:#7fa;">/ ${JET_CEILING} m</span></div>
        <div style="height:6px; background:#1b2433; border-radius:3px; margin:4px 0 8px;"><div style="height:100%; width:${altPct}%; background:#7fffd4; border-radius:3px;"></div></div>
        <div style="font-size:0.8rem; letter-spacing:1px;">FUEL <b>${fuel}%</b>${fuel <= 0 ? ' <span style="color:#ff4d6d;">OUT OF FUEL</span>' : ''}</div>
        <div style="height:6px; background:#1b2433; border-radius:3px; margin:4px 0 8px;"><div style="height:100%; width:${fuel}%; background:${fuel < 20 ? '#ff4d6d' : '#00f0ff'}; border-radius:3px;"></div></div>
        <div style="font-size:0.7rem; color:#8aa;">SPEED ${Math.round(this.speed)} · V to land and get out</div>`;
    } else {
      const label = this.vehicleId === 'jet' ? 'JET PASSENGER'
        : (this.seat === 0 ? 'GARAGE CAR · DRIVER' : 'GARAGE CAR · PASSENGER');
      this.hud.innerHTML = `<div style="font-size:0.8rem; letter-spacing:1px;">${label}</div>
        <div style="font-size:0.7rem; color:#8aa; margin-top:4px;">V to get out when stopped</div>`;
    }
  }

  // Score and round timer at the top of the screen (dogfight server only)
  setScoreHud(on) {
    if (!this.scoreHud) {
      this.scoreHud = document.createElement('div');
      this.scoreHud.id = 'dog-score';
      this.scoreHud.style.cssText = 'position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:50; font-family:var(--font-display); color:#e6f7ff; background:rgba(5,7,13,0.75); border:1px solid rgba(0,240,255,0.4); border-radius:6px; padding:8px 16px; text-align:center; pointer-events:none; display:none;';
      document.body.appendChild(this.scoreHud);
    }
    this.scoreHud.style.display = on ? 'block' : 'none';
  }

  updateScore(score, round, now) {
    if (!this.scoreHud || this.scoreHud.style.display === 'none') return;
    const s = score || { red: 0, blue: 0 };
    let status = '';
    if (round && round.winner) {
      const won = round.winner === 'draw' ? 'DRAW' : `${String(round.winner).toUpperCase()} WINS`;
      status = `${won} · next round soon`;
    } else if (round && round.end) {
      const left = Math.max(0, Math.ceil((round.end - now) / 1000));
      status = `ROUND ${round.n || 1} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`;
    }
    this.scoreHud.innerHTML = `
      <div style="font-size:1.1rem;"><span style="color:#ff6b6b;">RED ${s.red || 0}</span>
        <span style="color:#8aa;"> : </span>
        <span style="color:#6bb6ff;">${s.blue || 0} BLUE</span></div>
      <div style="font-size:0.7rem; color:#8aa; margin-top:2px;">${status} · first to 20 kills</div>`;
  }
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}
