// EVENT HORIZON - 3D FIRST-PERSON CONTROLLER
import * as THREE from 'three';

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

    this.yaw -= movementX * this.mouseSensitivity;
    this.pitch -= movementY * this.mouseSensitivity;

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
        if (this.canJump) {
          const isMoon = this.auth && this.auth.profile && this.auth.profile.moonGravity;
          this.velocity.y = isMoon ? 22.0 : 12.0;
          this.canJump = false;
          if (this.sound) this.sound.playJump();
        }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.isSprinting = true;
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

    // Gravity
    const grav = (this.auth && this.auth.profile && this.auth.profile.moonGravity) ? 10.0 : 28.0;
    this.velocity.y -= grav * delta;

    // Determine speed
    let baseSpeed = 48.0;
    if (this.isSprinting && !this.isCrouching) baseSpeed = 85.0;
    if (this.isCrouching) baseSpeed = 24.0;
    if (this.auth && this.auth.profile && this.auth.profile.superSpeed) baseSpeed *= 2.5;

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
        }
      }
    }

    // Fall to void reset safety check
    if (allowedY < -40) {
      // Fell off into the Event Horizon!
      allowedX = 0;
      allowedY = 4;
      allowedZ = 0;
      this.velocity.set(0, 0, 0);
      window.dispatchEvent(new CustomEvent('player_fell_into_void'));
    }

    if (onGround) {
      this.canJump = true;
    }

    this.camera.position.x = allowedX;
    this.camera.position.y = allowedY;
    this.camera.position.z = allowedZ;
  }

  getPosition() {
    return this.camera.position;
  }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
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
