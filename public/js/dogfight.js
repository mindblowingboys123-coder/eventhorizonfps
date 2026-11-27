// EVENT HORIZON - DOGFIGHT VEHICLES
// The jet (flight, fuel and altitude) and each team's garage car (driver steers, the
// turret follows the driver's mouse, passengers shoot from their seats).
// Terminals in the hangar and the garages spawn extra vehicles, up to a limit.
// A vehicle is flown or driven by whoever sits in seat 0. When it is empty it goes back
// to its spawn spot. Positions are shared with other pilots through their player record,
// and spawned vehicles are shared through rooms/dogfight/vehicles.
import * as THREE from 'three';

export const JET_CEILING = 600;   // highest the jet can fly, in metres
export const JET_FUEL_MAX = 100;
const JET_MAX_SPEED = 120;
const JET_ACCEL = 50;
const JET_EYE = 1.4;
const CAR_EYE = 1.6;
const CAR_MAX = 16;
const CAR_REVERSE = 6;
const TERMINAL_COOLDOWN = 15000; // ms between spawns from one terminal
const TERMINAL_REACH = 4;        // metres
// Jet missiles (G, pilot only): four per jet, rearmed when you land
const MISSILE_COUNT = 4;
const MISSILE_SPEED = 90;        // metres per second
const MISSILE_LIFE = 5;          // seconds before it burns out
const MISSILE_RELOAD = 800;      // ms between shots
const MISSILE_DAMAGE = 120;
const MISSILE_RADIUS = 8;        // blast radius, metres
const EXPLOSION_TIME = 1.2;      // seconds the fireball lasts
// Passenger seat offsets inside the car (x to the right, z to the back)
const SEAT_OFFSETS = [[0, 0], [0.7, 0.5], [-0.7, -0.6], [0.7, -0.9]];

// Extra vehicles a round can have out: jets in total, garage cars per team
export const SPAWN_LIMIT = { jet: 3, car: 2 };
// Damage taken while in a jet or garage car is multiplied by this (0.5 = twice the health)
export const VEHICLE_DAMAGE_SCALE = 0.5;

// Where spawned vehicles appear, and the terminals that spawn them
export const SPAWN_SLOTS = {
  jet: [{ x: -12, z: -185, hYaw: 0 }, { x: 12, z: -185, hYaw: 0 }, { x: -12, z: -215, hYaw: 0 }, { x: 12, z: -215, hYaw: 0 }],
  red: [{ x: -158, z: 7, hYaw: Math.PI / 2 }, { x: -142, z: 7, hYaw: Math.PI / 2 }],
  blue: [{ x: 158, z: 7, hYaw: -Math.PI / 2 }, { x: 142, z: 7, hYaw: -Math.PI / 2 }]
};
export const TERMINALS = [
  { id: 'jet', name: 'JET TERMINAL', kind: 'jet', team: null, x: -22, z: -220 },
  { id: 'red', name: 'GARAGE TERMINAL', kind: 'car', team: 'red', x: -158, z: -8 },
  { id: 'blue', name: 'GARAGE TERMINAL', kind: 'car', team: 'blue', x: 158, z: -8 }
];

export const VEHICLES = {
  jet:       { kind: 'jet', name: 'JET',        seats: 1, team: null,   dock: { x: 0,    y: 0, z: -200, hYaw: 0 } },
  'car-red': { kind: 'car', name: 'GARAGE CAR', seats: 4, team: 'red',  dock: { x: -150, y: 0, z: 0,    hYaw: Math.PI / 2 } },
  'car-blue':{ kind: 'car', name: 'GARAGE CAR', seats: 4, team: 'blue', dock: { x: 150,  y: 0, z: 0,    hYaw: -Math.PI / 2 } }
};

const TEAM_TRIM = { red: 0xff4d4d, blue: 0x4d9dff };
const TEAM_CSS = { red: '#ff6b6b', blue: '#6bb6ff' };

export class DogfightManager {
  // deps: getPilots() -> [{ vehicle: {id, seat}, veh: {x,y,z,hYaw,hPitch,tYaw} }],
  //       isBlocked(x, z, feetY), notify(text), onExit({x,y,z}), camera, getTeam(),
  //       spawnVehicle(kind, team, slot) -> Promise<{ok, reason}>
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;
    this.enabled = false;
    this.visuals = {};
    this.spawned = {};
    this.spawnedSrc = null;
    this.terminalGroup = null;
    this.terminalReady = {};
    this.hud = null;
    this.scoreHud = null;
    this.cockpits = null;
    this.trim = null;
    this.missileLightMats = [];
    this.missileShots = [];
    this.fx = [];
    this.parkedLocal = {};   // where a vehicle was left, until the shared record arrives
    this.reset();
  }

  // ---------- definitions ----------
  // Spawned vehicles come from the shared record (see setSpawned)
  setSpawned(records) {
    if (records === this.spawnedSrc) return;
    this.spawnedSrc = records;
    this.spawned = {};
    for (const id of Object.keys(records || {})) {
      const r = records[id];
      if (!r || (r.kind !== 'jet' && r.kind !== 'car')) continue;
      this.spawned[id] = {
        kind: r.kind,
        name: r.kind === 'jet' ? 'JET' : 'GARAGE CAR',
        seats: r.kind === 'jet' ? 1 : 4,
        team: r.kind === 'car' ? (r.team || null) : null,
        dock: { x: Number(r.x) || 0, y: 0, z: Number(r.z) || 0, hYaw: Number(r.hYaw) || 0 }
      };
    }
  }

  allDefs() {
    return { ...VEHICLES, ...this.spawned };
  }

  defOf(id) {
    return VEHICLES[id] || this.spawned[id] || null;
  }

  kindOf(id) {
    const d = this.defOf(id);
    return d ? d.kind : null;
  }

  // ---------- cockpit ----------
  // Frames, dashboards and the team trim on the camera, so you can see you are inside
  ensureCockpits() {
    if (this.cockpits) return;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.7, metalness: 0.2 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.6, metalness: 0.4 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const trim = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.trim = trim;
    const add = (g, geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      g.add(m);
      return m;
    };

    const jet = new THREE.Group();
    add(jet, new THREE.BoxGeometry(2.8, 0.7, 0.9), dark, 0, -0.62, -0.95, -0.35);   // dashboard
    add(jet, new THREE.BoxGeometry(2.2, 0.06, 0.06), trim, 0, -0.27, -1.0, -0.35);  // team trim
    // Open canopy: no side or top frames, just a thin team rim along the top
    add(jet, new THREE.BoxGeometry(2.6, 0.04, 0.04), trim, 0, 0.95, -0.9);          // team rim
    add(jet, new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8), frame, 0, -0.78, -0.6, 0.3); // stick
    add(jet, new THREE.BoxGeometry(0.25, 0.15, 0.4), frame, 0.9, -0.7, -0.8);       // throttle
    // Four missile lights, one per missile on the wings
    for (const x of [-0.95, -0.7, 0.7, 0.95]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x7fffd4 });
      this.missileLightMats.push(mat);
      add(jet, new THREE.BoxGeometry(0.12, 0.08, 0.02), mat, x, -0.5, -1.02);
    }

    // The car has no roof, so the cabin walls are drawn from inside around you. Without them
    // the view over the rim shows only the ground and sky.
    const car = new THREE.Group();
    // Walls are tinted glass so the view stays open; the floor stays solid
    const cabin = new THREE.MeshStandardMaterial({ color: 0x2f3746, roughness: 0.8, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f3746, roughness: 0.8, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const floorY = -1.075;   // the car floor, relative to your eyes
    const topY = 0.35;       // the top of the cabin walls
    const wallH = topY - floorY;
    const midY = (floorY + topY) / 2;
    const panel = (w, h, x, y, z, rx, ry, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      car.add(m);
    };
    panel(2.2, 4.4, 0, floorY, 0, -Math.PI / 2, 0, floorMat);   // floor
    panel(4.4, wallH, -1.1, midY, 0, 0, Math.PI / 2, cabin);    // left wall
    panel(4.4, wallH, 1.1, midY, 0, 0, -Math.PI / 2, cabin);    // right wall
    panel(2.2, wallH, 0, midY, 2.2, 0, Math.PI, cabin);         // back wall (behind the driver)
    panel(2.2, wallH, 0, midY, -2.2, 0, 0, glass);              // windscreen, see-through

    add(car, new THREE.BoxGeometry(2.6, 0.6, 1.0), dark, 0, -0.55, -1.1, -0.3);    // dashboard
    add(car, new THREE.BoxGeometry(0.4, 0.12, 0.02), trim, 0, -0.42, -1.07);        // team trim gauge
    add(car, new THREE.TorusGeometry(0.22, 0.03, 8, 20), frame, 0, -0.3, -0.75, 0.9); // steering wheel
    add(car, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), frame, 0, -0.5, -0.9, 0.9); // column
    add(car, new THREE.BoxGeometry(0.08, wallH, 0.08), frame, -1.1, midY, -1.0);    // left pillar
    add(car, new THREE.BoxGeometry(0.08, wallH, 0.08), frame, 1.1, midY, -1.0);     // right pillar
    add(car, new THREE.BoxGeometry(2.4, 0.06, 0.06), frame, 0, topY, -1.0);         // roof rim
    add(car, new THREE.BoxGeometry(2.3, 0.05, 0.05), trim, 0, topY - 0.1, -1.06);   // team trim on the frame
    add(car, new THREE.BoxGeometry(0.1, 0.9, 0.1), frame, 0, -0.1, -1.0);           // centre post
    add(car, new THREE.BoxGeometry(0.6, 0.3, 0.6), seat, -0.45, -0.5, -0.4);        // driver seat back

    for (const g of [jet, car]) {
      g.visible = false;
      this.deps.camera.add(g);
    }
    this.cockpits = { jet, car };
  }

  // which: 'jet', 'car' or null. The trim takes your team's colour.
  showCockpit(which) {
    if (!this.cockpits) return;
    this.cockpits.jet.visible = which === 'jet';
    this.cockpits.car.visible = which === 'car';
    const team = this.deps.getTeam && this.deps.getTeam();
    if (this.trim) this.trim.color.set(TEAM_TRIM[team] || 0x00f0ff);
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
    this.missiles = MISSILE_COUNT;
    this.missileReady = 0;
    this.info = null;   // shared with other pilots: { id, seat }
    this.veh = null;    // shared with other pilots: vehicle position and aim
  }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.ensureCockpits();
      this.ensureTerminals();
      this.setScoreHud(true);
    } else {
      this.destroyVisuals();
      this.destroyTerminals();
      this.clearMissiles();
      this.reset();
      this.setHud(false);
      this.setScoreHud(false);
      this.showCockpit(null);
    }
  }

  // ---------- visuals ----------
  destroyVisuals() {
    for (const id of Object.keys(this.visuals)) this.scene.remove(this.visuals[id]);
    this.visuals = {};
  }

  makeJet() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x9aa4b5, metalness: 0.6, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.1 });
    const missile = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.4 });
    const warhead = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x551010, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 7, 12), skin);
    body.rotation.x = Math.PI / 2;
    body.position.y = 1.0;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 1.0, -4.2);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 12), dark);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, 1.0, 3.8);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), glass);
    canopy.scale.set(1, 0.55, 1.5);
    canopy.position.set(0, 1.35, -1.2);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 1.8), skin);
    wings.position.set(0, 1.0, 0.2);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.2), skin);
    fin.position.set(0, 1.7, 2.8);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.8), skin);
    tail.position.set(0, 1.2, 2.8);
    g.add(body, nose, engine, canopy, wings, fin, tail);

    // Missiles: two under each wing on a pylon. Each pod keeps its parts so they can be hidden when fired.
    const pods = [];
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), dark);
      pylon.position.set(side * 2.8, 0.85, -0.2);
      g.add(pylon);
      for (const x of [2.2, 3.2]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8), missile);
        m.rotation.x = Math.PI / 2;
        m.position.set(side * x, 0.76, -0.2);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 8), warhead);
        tip.rotation.x = -Math.PI / 2;
        tip.position.set(side * x, 0.76, -1.05);
        g.add(m, tip);
        pods.push({ x: side * x, y: 0.76, z: -0.2, parts: [m, tip] });
      }
    }
    g.userData.pods = pods;
    return g;
  }

  // An open-topped garage car: hull with a low rim, seats for four, a steering wheel for the
  // driver and a turret at the back. The team colour is on the paint and a stripe along the side.
  makeCar(team) {
    const g = new THREE.Group();
    const paintColour = team === 'red' ? 0x8a2a2a : 0x2a4a8a;
    const paint = new THREE.MeshStandardMaterial({ color: paintColour, roughness: 0.6, metalness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: TEAM_TRIM[team] || 0xffffff, emissive: TEAM_TRIM[team] || 0xffffff, emissiveIntensity: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(2.2, 0.15, 4.4), paint, 0, 0.45, 0);          // floor
    // Walls from the floor up to 1.5 m above it, so the driver's eyes sit inside the cabin
    add(new THREE.BoxGeometry(0.12, 1.5, 4.4), paint, -1.04, 1.2, 0);       // left side
    add(new THREE.BoxGeometry(0.12, 1.5, 4.4), paint, 1.04, 1.2, 0);        // right side
    add(new THREE.BoxGeometry(2.2, 1.5, 0.12), paint, 0, 1.2, -2.14);       // front
    add(new THREE.BoxGeometry(2.2, 1.5, 0.12), paint, 0, 1.2, 2.14);        // back
    add(new THREE.BoxGeometry(0.02, 0.1, 4.2), accent, -1.1, 1.5, 0);       // team stripe left
    add(new THREE.BoxGeometry(0.02, 0.1, 4.2), accent, 1.1, 1.5, 0);        // team stripe right
    for (const [x, z] of [[-1.15, -1.4], [1.15, -1.4], [-1.15, 1.4], [1.15, 1.4]]) {
      const w = add(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10), dark, x, 0.35, z);
      w.rotation.z = Math.PI / 2;
    }
    // Seats for four, the same places the passengers sit
    for (const [x, z] of SEAT_OFFSETS) {
      add(new THREE.BoxGeometry(0.55, 0.35, 0.55), seatMat, x, 0.72, z);
      add(new THREE.BoxGeometry(0.55, 0.5, 0.1), seatMat, x, 1.0, z + 0.25);
    }
    // Steering wheel in front of the driver seat
    const wheel = add(new THREE.TorusGeometry(0.22, 0.03, 8, 20), dark, 0, 1.15, -0.7);
    wheel.rotation.x = 0.9;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), dark, 0, 0.95, -0.9);

    // Turret at the back of the open bed: a group that turns with the driver's mouse
    const turret = new THREE.Group();
    turret.position.set(0, 0.45, 0.7);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.3, 10), dark);
    base.position.y = 0.15;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.5), dark);
    gun.position.set(0, 0.35, -0.9);
    turret.add(base, gun);
    g.add(turret);
    g.userData.turret = turret;
    return g;
  }

  // Garage and hangar terminals: walk up and press F to spawn a vehicle
  ensureTerminals() {
    if (this.terminalGroup) return;
    this.terminalGroup = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.7 });
    for (const t of TERMINALS) {
      const g = new THREE.Group();
      const screenColour = TEAM_TRIM[t.team] || 0x00f0ff;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.5), dark);
      base.position.y = 1.1;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.05), new THREE.MeshBasicMaterial({ color: screenColour }));
      screen.position.set(0, 1.4, -0.27);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: screenColour }));
      sign.position.set(0, 2.3, -0.27);
      g.add(base, screen, sign);
      g.position.set(t.x, 0, t.z);
      this.terminalGroup.add(g);
    }
    this.scene.add(this.terminalGroup);
  }

  destroyTerminals() {
    if (this.terminalGroup) this.scene.remove(this.terminalGroup);
    this.terminalGroup = null;
  }

  // Who is sitting where, from the other pilots' records
  occupancy() {
    const out = {};
    for (const p of this.deps.getPilots()) {
      const id = p.vehicle && p.vehicle.id;
      if (!id || !this.defOf(id) || !p.veh) continue;
      const o = out[id] || (out[id] = { seats: new Set(), state: null });
      const seat = Number(p.vehicle.seat) || 0;
      o.seats.add(seat);
      if (!o.state || seat === 0) o.state = p.veh;
    }
    return out;
  }

  // Moves each vehicle to its pilot, or back to its spawn spot when it is empty
  updateVisuals() {
    if (!this.enabled) return;
    const defs = this.allDefs();
    for (const id of Object.keys(this.visuals)) {
      if (!defs[id]) {
        this.scene.remove(this.visuals[id]);
        delete this.visuals[id];
      }
    }
    const occ = this.occupancy();
    for (const id of Object.keys(defs)) {
      const def = defs[id];
      if (!this.visuals[id]) {
        const g = def.kind === 'jet' ? this.makeJet() : this.makeCar(def.team);
        this.scene.add(g);
        this.visuals[id] = g;
      }
      const v = this.visuals[id];
      const dock = def.dock;
      const mine = this.active && this.vehicleId === id;
      const st = mine
        ? { x: this.x, y: this.y, z: this.z, hYaw: this.hYaw, hPitch: this.hPitch, tYaw: this.tYaw }
        : (occ[id] && occ[id].state) || this.parkedFor(id) || { x: dock.x, y: dock.y, z: dock.z, hYaw: dock.hYaw, hPitch: 0, tYaw: 0 };
      v.position.set(st.x, st.y, st.z);
      v.rotation.set(def.kind === 'jet' ? (st.hPitch || 0) : 0, st.hYaw || 0, 0, 'YXZ');
      v.visible = !mine;
      if (v.userData.turret) v.userData.turret.rotation.y = st.tYaw || 0;
    }
  }

  // ---------- spawning ----------
  // A spawn slot for this kind with no vehicle close to it, or null
  freeSlot(kind, team) {
    const slots = kind === 'jet' ? SPAWN_SLOTS.jet : (SPAWN_SLOTS[team] || []);
    const defs = this.allDefs();
    const occ = this.occupancy();
    const spots = [];
    for (const id of Object.keys(defs)) {
      spots.push(defs[id].dock);
      if (occ[id] && occ[id].state) spots.push(occ[id].state);
      const parked = this.parkedFor(id);
      if (parked) spots.push(parked);
    }
    if (this.active) spots.push({ x: this.x, z: this.z });
    for (const s of slots) {
      if (!spots.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 5)) return s;
    }
    return null;
  }

  // Press F at a terminal: spawns one vehicle of its kind, if the limit allows it
  useTerminal(camPos, team) {
    if (!this.enabled || this.active) return;
    let term = null;
    let bestD = TERMINAL_REACH;
    for (const t of TERMINALS) {
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      if (d < bestD) { bestD = d; term = t; }
    }
    if (!term) {
      this.deps.notify('Walk up to a terminal and press F.');
      return;
    }
    if (term.team && term.team !== team) {
      this.deps.notify('That terminal belongs to the other team.');
      return;
    }
    const now = performance.now();
    if (now < (this.terminalReady[term.id] || 0)) {
      this.deps.notify('The terminal is recharging.');
      return;
    }
    const slot = this.freeSlot(term.kind, term.team);
    if (!slot) {
      this.deps.notify('No free spot here. Wait for a vehicle to move.');
      return;
    }
    this.terminalReady[term.id] = now + TERMINAL_COOLDOWN;
    Promise.resolve(this.deps.spawnVehicle(term.kind, term.team, slot))
      .then((res) => {
        if (res && res.ok) {
          this.deps.notify(term.kind === 'jet' ? 'A new jet is ready in the hangar.' : 'A new garage car is ready in your garage.');
        } else {
          this.terminalReady[term.id] = 0;
          this.deps.notify((res && res.reason) || 'Could not spawn a vehicle.');
        }
      })
      .catch(() => {
        this.terminalReady[term.id] = 0;
        this.deps.notify('Could not spawn a vehicle.');
      });
  }

  // ---------- missiles (G, jet pilot only) ----------
  makeMissile() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x551010 }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.9;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.z = 1.0;
    g.add(body, tip, flame);
    return g;
  }

  // Shows the missiles still on the wings and the dashboard lights for them
  syncMissiles() {
    this.missileLightMats.forEach((m, i) => m.color.set(i < this.missiles ? 0x7fffd4 : 0x1a2a2a));
    const visual = this.vehicleId && this.visuals[this.vehicleId];
    if (visual && visual.userData.pods) {
      visual.userData.pods.forEach((pod, i) => pod.parts.forEach((p) => { p.visible = i < this.missiles; }));
    }
  }

  fireMissile() {
    if (!this.active || this.seat !== 0 || this.kindOf(this.vehicleId) !== 'jet') return;
    const visual = this.visuals[this.vehicleId];
    if (!visual || !visual.userData.pods) return;
    if (this.missiles <= 0) {
      this.deps.notify('Out of missiles. Land to rearm.');
      return;
    }
    const now = performance.now();
    if (now < this.missileReady) return;
    this.missileReady = now + MISSILE_RELOAD;
    this.missiles -= 1;
    const pod = visual.userData.pods[this.missiles];
    this.syncMissiles();

    // Launch from the pod, straight along the nose
    visual.updateMatrixWorld(true);
    const start = visual.localToWorld(new THREE.Vector3(pod.x, pod.y, pod.z));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(visual.quaternion);
    const group = this.makeMissile();
    group.quaternion.copy(visual.quaternion);
    group.position.copy(start);
    this.scene.add(group);
    this.missileShots.push({ group, pos: start.clone(), dir, life: MISSILE_LIFE });
  }

  // Blast: damages every pilot near the point through the normal hit system
  explode(at) {
    for (const t of this.deps.getTargets()) {
      const c = new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z);
      if (c.distanceTo(at) <= MISSILE_RADIUS) this.deps.sendHit(t.id, MISSILE_DAMAGE, 'Missile');
    }
    // Fireball: dark smoke, orange fire, a bright core and a shockwave ring on the ground
    const group = new THREE.Group();
    group.position.copy(at);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x333842, transparent: true, opacity: 0.5, depthWrite: false }));
    const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, depthWrite: false }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 1, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -at.y + 0.2;
    group.add(smoke, fire, core, ring);
    this.scene.add(group);
    this.fx.push({ group, life: EXPLOSION_TIME, max: EXPLOSION_TIME });
    this.animateExplosion(this.fx[this.fx.length - 1]);
  }

  // Grows the fireball from 3 to 14 metres and fades it out
  animateExplosion(f) {
    const p = 1 - f.life / f.max;
    const R = 3 + 11 * Math.sqrt(p);
    const [smoke, fire, core, ring] = f.group.children;
    smoke.scale.setScalar(R);
    smoke.material.opacity = 0.5 * (1 - p);
    fire.scale.setScalar(R * 0.75);
    fire.material.opacity = 0.8 * (1 - p);
    core.scale.setScalar(1 + R * 0.4 * (1 - p));
    core.material.opacity = 1 - p;
    ring.scale.setScalar(R * 1.3);
    ring.material.opacity = 0.9 * (1 - p);
  }

  // Moves the missiles in flight and the blasts; runs every frame in the dogfight server
  updateMissiles(delta) {
    const dt = Math.min(delta, 0.05);
    if (this.enabled) {
      const targets = this.deps.getTargets();
      for (let i = this.missileShots.length - 1; i >= 0; i--) {
        const m = this.missileShots[i];
        m.life -= dt;
        m.pos.addScaledVector(m.dir, MISSILE_SPEED * dt);
        m.group.position.copy(m.pos);
        let boom = m.life <= 0 || m.pos.y <= 0.2 || this.deps.isBlocked(m.pos.x, m.pos.z, m.pos.y);
        if (!boom) {
          for (const t of targets) {
            if (new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z).distanceTo(m.pos) < 2) { boom = true; break; }
          }
        }
        if (boom) {
          this.explode(m.pos.clone());
          this.scene.remove(m.group);
          this.missileShots.splice(i, 1);
        }
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.group);
        this.fx.splice(i, 1);
      } else {
        this.animateExplosion(f);
      }
    }
  }

  clearMissiles() {
    for (const m of this.missileShots) this.scene.remove(m.group);
    for (const f of this.fx) this.scene.remove(f.group);
    this.missileShots = [];
    this.fx = [];
  }

  // ---------- boarding ----------
  // Nearest vehicle you may use, within 6 metres
  nearestVehicle(px, pz, team) {
    const occ = this.occupancy();
    const defs = this.allDefs();
    let best = null;
    let bestD = 6;
    for (const id of Object.keys(defs)) {
      const def = defs[id];
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
    for (let i = 0; i < this.defOf(near.id).seats; i++) {
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
    const kind = this.kindOf(id);
    this.active = true;
    this.vehicleId = id;
    this.seat = seat;
    this.showCockpit(kind);
    this.x = st.x; this.y = st.y; this.z = st.z;
    this.hYaw = st.hYaw || 0;
    this.hPitch = 0;
    this.tYaw = 0;
    this.speed = 0;
    if (kind === 'jet' && seat === 0) this.fuel = JET_FUEL_MAX;
    if (kind === 'jet') {
      this.missiles = MISSILE_COUNT;
      this.missileReady = 0;
      this.syncMissiles();
    }
    this.setHud(true);
  }

  exit() {
    const kind = this.kindOf(this.vehicleId);
    const flying = kind === 'jet' && this.seat === 0 && this.y > 0.6;
    if (this.speed > 3 || flying) {
      this.deps.notify('Slow down and land before getting out.');
      return;
    }
    const side = kind === 'jet' ? 3.5 : 2.8;
    let ex = this.x + side;
    if (this.deps.isBlocked(ex, this.z, this.y)) ex = this.x - side;
    this.deps.onExit({ x: ex, y: this.y, z: this.z });
    this.forceExit();
  }

  // Leaves the vehicle where it stands, so it stays there for everyone (not back at its dock)
  parkHere() {
    if (!this.active || this.seat !== 0 || !this.defOf(this.vehicleId)) return;
    const st = { x: this.x, y: this.y, z: this.z, hYaw: this.hYaw, hPitch: this.hPitch, tYaw: this.tYaw };
    this.parkedLocal[this.vehicleId] = st;
    if (this.deps.park) this.deps.park(this.vehicleId, st);
  }

  // Where an empty vehicle was left: the shared record first, then this client's copy
  parkedFor(id) {
    const shared = this.deps.getParked ? this.deps.getParked() : {};
    return shared[id] || this.parkedLocal[id] || null;
  }

  forceExit() {
    if (!this.active) return;
    this.parkHere();
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
    if (this.active && !this.defOf(this.vehicleId)) {
      // The vehicle was removed (for example when a round restarts): step out where it stood
      this.deps.onExit({ x: this.x, y: 0, z: this.z });
      this.forceExit();
      this.deps.notify('That vehicle was removed.');
    }
    if (!this.active) {
      this.info = null;
      this.veh = null;
      return null;
    }
    const dt = Math.min(delta, 0.05);
    const id = this.vehicleId;
    const kind = this.kindOf(id);
    const pilot = this.seat === 0;

    if (kind === 'jet') {
      if (pilot) {
        this.hYaw = aim.yaw;
        this.hPitch = Math.max(-1.3, Math.min(1.3, aim.pitch));
        this.flyJet(dt, input);
        if (this.y <= 0.5 && this.missiles < MISSILE_COUNT) {
          this.missiles = MISSILE_COUNT;
          this.syncMissiles();
          this.deps.notify('Missiles rearmed.');
        }
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
    if (kind === 'jet') {
      return { x: this.x, y: this.y + JET_EYE, z: this.z, yaw: this.hYaw, pitch: this.hPitch };
    }
    if (pilot) {
      return { x: this.x, y: this.y + CAR_EYE, z: this.z, yaw: aim.yaw, pitch: aim.pitch };
    }
    const off = SEAT_OFFSETS[this.seat] || [0, 0];
    return { x: this.x + off[0], y: this.y + CAR_EYE - 0.3, z: this.z + off[1], yaw: aim.yaw, pitch: aim.pitch };
  }

  // True when the jet's body (nose, tail and wing tips) would be inside a structure at (x, y, z).
  // The body zone is the jet's height above the feet, and the feet never go below the floor top.
  hitsStructure(x, y, z) {
    const feet = Math.max(y - 0.8, 0.5);
    const fx = -Math.sin(this.hYaw), fz = -Math.cos(this.hYaw);   // forward
    const rx = Math.cos(this.hYaw), rz = -Math.sin(this.hYaw);    // right
    const pts = [
      [x, z],
      [x + fx * 4, z + fz * 4],          // nose
      [x - fx * 3.5, z - fz * 3.5],      // tail
      [x - rx * 4.5, z - rz * 4.5],      // left wing tip
      [x + rx * 4.5, z + rz * 4.5]       // right wing tip
    ];
    return pts.some(([px, pz]) => this.deps.isBlocked(px, pz, feet));
  }

  // The jet stops dead and the pilot takes a crash hit (at most one a second)
  crash() {
    this.speed = 0;
    const now = performance.now();
    if (now - (this.lastCrash || 0) > 1000) {
      this.lastCrash = now;
      this.deps.notify('Crashed into a structure!');
      if (this.deps.hurt) this.deps.hurt(30);
    }
  }

  flyJet(dt, input) {
    // Throttle burns fuel. With no fuel the engine is off and the jet glides down.
    if (input.forward && this.fuel > 0) {
      this.speed = Math.min(JET_MAX_SPEED, this.speed + JET_ACCEL * dt);
      this.fuel = Math.max(0, this.fuel - 1.2 * dt);
    } else if (input.back) {
      this.speed = Math.max(0, this.speed - 45 * dt);
    } else {
      this.speed = Math.max(0, this.speed - 6 * dt);
      this.fuel = Math.max(0, this.fuel - 0.2 * dt);
    }

    const cp = Math.cos(this.hPitch);
    const nx = this.x - Math.sin(this.hYaw) * cp * this.speed * dt;
    const ny = this.y + Math.sin(this.hPitch) * this.speed * dt;
    const nz = this.z - Math.cos(this.hYaw) * cp * this.speed * dt;
    if (this.hitsStructure(nx, ny, nz)) {
      this.crash();
    } else {
      this.x = nx; this.y = ny; this.z = nz;
    }

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
  // Your team's colour, used for the HUD accents
  teamCss() {
    const team = this.deps.getTeam && this.deps.getTeam();
    return TEAM_CSS[team] || '#00f0ff';
  }

  // The panel (bottom left), the crosshair in the middle and the compass strip at the top
  setHud(on) {
    if (!this.hud) {
      this.hud = document.createElement('div');
      this.hud.id = 'dog-hud';
      this.hud.style.cssText = 'position:fixed; left:16px; bottom:120px; z-index:50; font-family:var(--font-display); color:#e6f7ff; min-width:250px; pointer-events:none; display:none;';
      document.body.appendChild(this.hud);

      this.reticle = document.createElement('div');
      this.reticle.id = 'dog-reticle';
      this.reticle.style.cssText = 'position:fixed; left:50%; top:50%; width:0; height:0; z-index:50; pointer-events:none; display:none;';
      document.body.appendChild(this.reticle);

      this.heading = document.createElement('div');
      this.heading.id = 'dog-heading';
      this.heading.style.cssText = 'position:fixed; top:112px; left:50%; transform:translateX(-50%); z-index:50; font-family:var(--font-display); color:#e6f7ff; background:rgba(5,10,20,0.6); border-radius:4px; padding:4px 14px; letter-spacing:3px; pointer-events:none; display:none;';
      document.body.appendChild(this.heading);
    }
    const shown = on ? 'block' : 'none';
    this.hud.style.display = shown;
    this.reticle.style.display = shown;
    this.heading.style.display = shown;
    if (on) this.drawReticle();
  }

  drawReticle() {
    const c = this.teamCss();
    this.reticle.innerHTML = `
      <div style="position:absolute; left:-14px; top:-14px; width:28px; height:28px; border:2px solid ${c}; border-radius:50%; opacity:0.85; box-shadow:0 0 10px ${c};"></div>
      <div style="position:absolute; left:-1px; top:-24px; width:2px; height:8px; background:${c};"></div>
      <div style="position:absolute; left:-1px; top:16px; width:2px; height:8px; background:${c};"></div>
      <div style="position:absolute; left:-24px; top:-1px; width:8px; height:2px; background:${c};"></div>
      <div style="position:absolute; left:16px; top:-1px; width:8px; height:2px; background:${c};"></div>
      <div style="position:absolute; left:-2px; top:-2px; width:4px; height:4px; border-radius:50%; background:${c};"></div>`;
  }

  updateHud() {
    if (!this.hud || !this.active) return;
    const kind = this.kindOf(this.vehicleId);
    const c = this.teamCss();
    const teamName = (this.deps.getTeam && this.deps.getTeam()) ? this.deps.getTeam().toUpperCase() : 'NO TEAM';

    // A gauge: label, value and a glowing bar
    const bar = (label, pct, colour, value) => `
      <div style="display:flex; justify-content:space-between; font-size:0.7rem; letter-spacing:2px; color:#8aa; margin-top:6px;">
        <span>${label}</span><b style="color:#e6f7ff;">${value}</b></div>
      <div style="height:6px; background:#1b2433; border-radius:3px; margin-top:3px; overflow:hidden;">
        <div style="height:100%; width:${Math.max(0, Math.min(100, pct))}%; background:${colour}; box-shadow:0 0 8px ${colour};"></div></div>`;
    const panel = (body) => `<div style="background:linear-gradient(135deg, rgba(6,14,26,0.85), rgba(6,14,26,0.45)); border:1px solid ${c}; border-left:4px solid ${c}; border-radius:4px; padding:10px 14px; box-shadow:0 0 18px ${c}44;">${body}</div>`;

    if (kind === 'jet' && this.seat === 0) {
      const fuel = Math.round(this.fuel);
      const alt = Math.round(this.y);
      const pips = Array.from({ length: MISSILE_COUNT }, (_, i) =>
        `<span style="display:inline-block; width:14px; height:14px; margin-right:4px; border:1px solid ${c}; background:${i < this.missiles ? c : 'transparent'};"></span>`).join('');
      this.hud.innerHTML = panel(`
        <div style="font-size:0.75rem; letter-spacing:3px; color:${c};">JET · ${teamName}</div>
        ${bar('ALTITUDE', (this.y / JET_CEILING) * 100, '#7fffd4', `${alt} m`)}
        ${bar('SPEED', (this.speed / JET_MAX_SPEED) * 100, c, `${Math.round(this.speed)}`)}
        ${bar('FUEL', fuel, fuel < 20 ? '#ff4d6d' : '#00f0ff', `${fuel}%${fuel <= 0 ? ' OUT' : ''}`)}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:0.7rem; letter-spacing:2px; color:#8aa;">
          <span>MISSILES ${pips}</span><span>G FIRE</span></div>
        <div style="font-size:0.65rem; color:#6b7a90; margin-top:6px;">V land and get out</div>`);
    } else if (kind === 'jet') {
      this.hud.innerHTML = panel(`
        <div style="font-size:0.75rem; letter-spacing:3px; color:${c};">JET PASSENGER · ${teamName}</div>
        <div style="font-size:0.65rem; color:#6b7a90; margin-top:6px;">V to get out when stopped</div>`);
    } else {
      const speedPct = (Math.abs(this.speed) / CAR_MAX) * 100;
      const body = this.seat === 0
        ? `<div style="font-size:0.75rem; letter-spacing:3px; color:${c};">GARAGE CAR · DRIVER · ${teamName}</div>
           ${bar('SPEED', speedPct, c, `${Math.round(Math.abs(this.speed) * 4)} km/h`)}
           <div style="font-size:0.65rem; color:#6b7a90; margin-top:6px;">Mouse aims the turret · V to get out when stopped</div>`
        : `<div style="font-size:0.75rem; letter-spacing:3px; color:${c};">GARAGE CAR · PASSENGER · ${teamName}</div>
           <div style="font-size:0.65rem; color:#6b7a90; margin-top:6px;">Left click to shoot · V to get out when stopped</div>`;
      this.hud.innerHTML = panel(body);
    }

    // Compass strip: 0 is north, turning clockwise with the vehicle
    const deg = Math.round((((360 - this.hYaw * 180 / Math.PI) % 360) + 360) % 360) % 360;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    this.heading.innerHTML = `<span style="color:${c};">${names[Math.round(deg / 45) % 8]}</span> &nbsp;${String(deg).padStart(3, '0')}°`;
  }

  // Score, your team and round timer at the top of the screen (dogfight server only)
  setScoreHud(on) {
    if (!this.scoreHud) {
      this.scoreHud = document.createElement('div');
      this.scoreHud.id = 'dog-score';
      this.scoreHud.style.cssText = 'position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:50; font-family:var(--font-display); color:#e6f7ff; background:rgba(5,7,13,0.75); border:1px solid rgba(0,240,255,0.4); border-radius:6px; padding:8px 16px; text-align:center; pointer-events:none; display:none;';
      document.body.appendChild(this.scoreHud);
    }
    this.scoreHud.style.display = on ? 'block' : 'none';
  }

  updateScore(score, round, now, team) {
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
    const you = team
      ? `<div style="font-size:0.85rem; letter-spacing:2px; font-weight:bold; color:${TEAM_CSS[team]};">YOU ARE ON ${team.toUpperCase()} TEAM</div>`
      : '';
    this.scoreHud.innerHTML = `
      ${you}
      <div style="font-size:1.1rem;"><span style="color:#ff6b6b;">RED ${s.red || 0}</span>
        <span style="color:#8aa;"> : </span>
        <span style="color:#6bb6ff;">${s.blue || 0} BLUE</span></div>
      <div style="font-size:0.7rem; color:#8aa; margin-top:2px;">${status} · first to 20 kills</div>`;
  }
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}
