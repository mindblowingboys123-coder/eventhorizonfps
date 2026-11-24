// EVENT HORIZON - 3D FIRST-PERSON CONTROLLER
import * as THREE from 'three';

const GRAPPLE_RANGE = 70;  // how far the hook reaches
const GRAPPLE_PULL = 60;    // top pull speed toward the anchor
const GRAPPLE_STOP = 2.2;   // release distance: close enough to land or touch the wall
const STEP_UP_HEIGHT = 0.65; // the tallest step you can walk up without jumping (stairs)

export class FPSControls {
  constructor(camera, domElement, soundEngine, authManager = null) {
    this.camera = camera;
    this.domElement = domElement;
    this.sound = soundEngine;
    this.auth = authManager;

    this.isLocked = false;
    this.mouseSensitivity = 0.0022;

    // Movement states
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.canJump = false;

    // Physics & Velocities
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.playerHeight = 1.7;
    this.crouchHeight = 0.9;
    this.currentHeight = 1.7;

    // Rotation angles
    this.pitch = 0; // vertical
    this.yaw = 0;   // horizontal

    // Pitch limits
    this.minPitch = -Math.PI / 2 + 0.05;
    this.maxPitch = Math.PI / 2 - 0.05;

    // Collision solids array
    this.colliders = [];

    // Footstep timer
    this.footstepTimer = 0;

    // Admin-granted movement: speedLevel 0-3 and fly on/off (set by main.js)
    this.grants = { speedLevel: 0, fly: false };
    this.voidRespawn = null; // where falling into the void puts you (set by main.js)
    this.flyUp = false;

    // Grappling hook (hold F): anchored to a box, which may move
    this.grapple = null;
    this.grappleCooldown = 0;

    // Key event listeners
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onPointerLockChange = this.handlePointerLockChange.bind(this);

    this.init();
  }

  init() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    this.camera.rotation.order = 'YXZ';
  }

  lock() {
    this.domElement.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  handlePointerLockChange() {
    this.isLocked = document.pointerLockElement === this.domElement;
    window.dispatchEvent(new CustomEvent('pointer_lock_change', { detail: { isLocked: this.isLocked } }));
  }

  handleMouseMove(event) {
    if (!this.isLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.yaw -= movementX * this.mouseSensitivity * (this.aimMultiplier || 1);
    this.pitch -= movementY * this.mouseSensitivity * (this.aimMultiplier || 1);

    // Clamp pitch
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  handleKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        if (this.grants.fly) { this.flyUp = true; break; }
        if (this.canJump) {
          const isMoon = this.auth && this.auth.profile && this.auth.profile.moonGravity;
          this.velocity.y = isMoon ? 24.0 : 15.0;
          this.canJump = false;
          if (this.sound) this.sound.playJump();
        }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.isSprinting = true;
        break;
      case 'KeyF':
        this.fireGrapple();
        break;
      case 'KeyC':
        this.isCrouching = true;
        break;
    }
  }

  handleKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.isSprinting = false;
        break;
      case 'Space':
        this.flyUp = false;
        break;
      case 'KeyF':
        this.releaseGrapple();
        break;
      case 'KeyC':
        this.isCrouching = false;
        break;
    }
  }

  setColliders(colliders) {
    this.colliders = colliders || [];
  }

  update(delta) {
    if (!this.isLocked) return;

    // Crouch height interpolation
    const targetHeight = this.isCrouching ? this.crouchHeight : this.playerHeight;
    this.currentHeight += (targetHeight - this.currentHeight) * Math.min(1, delta * 12);

    // Friction / damping
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    if (this.grants.fly) {
      // Flight: Space rises, C descends, no gravity
      const flyTarget = ((this.flyUp ? 1 : 0) - (this.isCrouching ? 1 : 0)) * 14.0;
      this.velocity.y += (flyTarget - this.velocity.y) * Math.min(1, delta * 8);
    } else {
      // Gravity
      const grav = (this.auth && this.auth.profile && this.auth.profile.moonGravity) ? 10.0 : 28.0;
      this.velocity.y -= grav * delta;
    }

    // Ride moving platforms: move with whatever we are standing on
    if (this.groundBox && this.canJump && this.groundBox.userData && this.groundBox.userData.delta) {
      const d = this.groundBox.userData.delta;
      this.camera.position.x += d.x;
      this.camera.position.y += d.y;
      this.camera.position.z += d.z;
    }

    // Grappling hook: pull toward the anchor and let go when we arrive
    this.grappleCooldown = Math.max(0, this.grappleCooldown - delta);
    if (this.grapple) {
      const target = this.grapple.box.min.clone().add(this.grapple.offset);
      const toTarget = target.clone().sub(this.camera.position);
      const dist = toTarget.length();
      if (dist < GRAPPLE_STOP) {
        this.releaseGrapple();
      } else {
        this.velocity.copy(toTarget.multiplyScalar(1 / dist)).multiplyScalar(Math.min(GRAPPLE_PULL, 20 + dist * 2));
      }
    }

    // Jump pads: launch the player high into the air
    const pads = this.colliders.jumpPads || [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const pdx = this.camera.position.x - p.x;
      const pdz = this.camera.position.z - p.z;
      const feetY = this.camera.position.y - this.currentHeight;
      if (pdx * pdx + pdz * pdz < p.r * p.r && feetY <= p.y + 0.8 && feetY >= p.y - 1.0 && this.velocity.y <= 1) {
        this.velocity.y = 30.0;
        this.canJump = false;
        if (this.sound) this.sound.playJump();
        break;
      }
    }

    // Determine speed
    let baseSpeed = 48.0;
    if (this.isSprinting && !this.isCrouching) baseSpeed = 85.0;
    if (this.isCrouching) baseSpeed = 24.0;
    const speedMultipliers = [1, 1.5, 2.5, 4];
    const level = this.grants.speedLevel || 0;
    if (level > 0) baseSpeed *= speedMultipliers[level];
    else if (this.auth && this.auth.profile && this.auth.profile.superSpeed) baseSpeed *= 2.5;

    // Wading through the river slows you down
    const feetY = this.camera.position.y - this.currentHeight;
    const inWater = (this.colliders.water || []).some((w) =>
      this.camera.position.x > w.min.x && this.camera.position.x < w.max.x &&
      this.camera.position.z > w.min.z && this.camera.position.z < w.max.z &&
      feetY > w.min.y - 0.1 && feetY < w.max.y + 0.5);
    if (inWater) baseSpeed *= 0.55;

    // Movement direction from input
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    // Transform direction by camera yaw (horizontal only)
    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= Math.cos(this.yaw) * this.direction.z * baseSpeed * delta;
      this.velocity.x -= Math.sin(this.yaw) * this.direction.z * baseSpeed * delta;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.z -= Math.sin(this.yaw) * this.direction.x * baseSpeed * delta;
      this.velocity.x += Math.cos(this.yaw) * this.direction.x * baseSpeed * delta;
    }

    // Footstep audio
    const isMoving = (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight);
    if (isMoving && this.canJump) {
      this.footstepTimer += delta * (this.isSprinting ? 1.7 : 1.0);
      if (this.footstepTimer > 0.42) {
        this.footstepTimer = 0;
        if (this.sound) this.sound.playFootstep();
      }
    }

    // Proposed new position
    const nextX = this.camera.position.x + this.velocity.x * delta;
    const nextY = this.camera.position.y + this.velocity.y * delta;
    const nextZ = this.camera.position.z + this.velocity.z * delta;

    // Simple robust collision against boxes in this.colliders
    const playerRadius = 0.5;
    let allowedX = nextX;
    let allowedZ = nextZ;
    let allowedY = nextY;

    let onGround = false;
    let landedBox = null;

    // Floor / platform check
    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      // Check horizontal overlap with buffer
      if (
        nextX + playerRadius > box.min.x &&
        nextX - playerRadius < box.max.x &&
        nextZ + playerRadius > box.min.z &&
        nextZ - playerRadius < box.max.z
      ) {
        // Landing on top of a box/platform
        if (this.camera.position.y >= box.max.y && nextY - this.currentHeight <= box.max.y + 0.1) {
          allowedY = box.max.y + this.currentHeight;
          this.velocity.y = 0;
          onGround = true;
          landedBox = box;
        }
      }
    }

    // Walls: push the player out of any solid box they walk into from the side.
    // Boxes under our feet or above our head are ignored; landing is handled above.
    let feet = allowedY - this.currentHeight;
    const head = allowedY + 0.2;
    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      if (box.max.y <= feet + 0.3) continue;
      if (box.min.y >= head) continue;
      const minX = box.min.x - playerRadius, maxX = box.max.x + playerRadius;
      const minZ = box.min.z - playerRadius, maxZ = box.max.z + playerRadius;
      if (allowedX <= minX || allowedX >= maxX || allowedZ <= minZ || allowedZ >= maxZ) continue;
      // Stairs: a low step that we are walking into is stepped onto, not bumped into
      if (this.canJump && box.max.y - feet <= STEP_UP_HEIGHT && box.max.y - feet > 0.3 && this.velocity.y <= 0) {
        allowedY = box.max.y + this.currentHeight;
        feet = box.max.y;
        this.velocity.y = 0;
        onGround = true;
        landedBox = box;
        continue;
      }
      const pushL = allowedX - minX, pushR = maxX - allowedX;
      const pushB = allowedZ - minZ, pushF = maxZ - allowedZ;
      const least = Math.min(pushL, pushR, pushB, pushF);
      if (least === pushL) { allowedX = minX; this.velocity.x = Math.min(0, this.velocity.x); }
      else if (least === pushR) { allowedX = maxX; this.velocity.x = Math.max(0, this.velocity.x); }
      else if (least === pushB) { allowedZ = minZ; this.velocity.z = Math.min(0, this.velocity.z); }
      else { allowedZ = maxZ; this.velocity.z = Math.max(0, this.velocity.z); }
    }

    // Fall to void reset safety check
    if (allowedY < -40) {
      // Fell off into the Event Horizon!
      const vr = this.voidRespawn || { x: 0, y: 4, z: 0 };
      allowedX = vr.x;
      allowedY = vr.y;
      allowedZ = vr.z;
      this.velocity.set(0, 0, 0);
      window.dispatchEvent(new CustomEvent('player_fell_into_void'));
    }

    this.groundBox = onGround ? landedBox : null;
    if (onGround) {
      this.canJump = true;
    }

    this.camera.position.x = allowedX;
    this.camera.position.y = allowedY;
    this.camera.position.z = allowedZ;
  }

  // ---------- grappling hook ----------

  fireGrapple() {
    if (!this.isLocked || this.grapple || this.grappleCooldown > 0) return;
    const ray = new THREE.Ray(this.camera.position.clone(), this.getForwardDirection());
    const hit = new THREE.Vector3();
    let best = null;
    let bestDist = GRAPPLE_RANGE;
    for (const box of this.colliders) {
      if (!ray.intersectBox(box, hit)) continue;
      const d = ray.origin.distanceTo(hit);
      if (d > 1 && d < bestDist) {
        bestDist = d;
        best = { box, point: hit.clone() };
      }
    }
    if (!best) return;
    // Remember the anchor relative to its box, so it moves with moving platforms
    this.grapple = { box: best.box, offset: best.point.clone().sub(best.box.min) };
    if (this.sound && this.sound.playJump) this.sound.playJump();
  }

  releaseGrapple() {
    if (this.grapple) this.grappleCooldown = 0.4;
    this.grapple = null;
  }

  getPosition() {
    return this.camera.position;
  }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grapple = null;
  }

  getForwardDirection() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  dispose() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
