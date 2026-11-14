# 🌌 EVENT HORIZON // 3D Sci-Fi FPS Game

**Event Horizon** is a feature-packed 3D First-Person Shooter (FPS) set in deep space at the edge of a gravitational singularity. Built with Three.js (WebGL), native WebSockets, and Web Audio API synthesis.

---

## 🚀 Key Features

### 1. 🌐 Real-Time Multiplayer World Server
- **Persistent Global World Hub**: Drop in with multiple players in a persistent combat sector.
- **Dedicated Arena Sectors**:
  - `The Singularity Core` (Black hole accretion disk with floating asteroid platforms & jump pads)
  - `Aegis Space Station: Sector 7` (Corridor close-quarters combat)
  - `Mars Outpost: Red Dunes` (Open tactical desert canyon warfare)
  - `Cyber Void Jump Arena` (Multi-tiered neon speed arena)
- **Authoritative Hit Registration & Synchronization**:
  - Real-time position/rotation interpolation (30Hz tick rate).
  - Synchronized laser projectile tracers and muzzle discharges.
  - Live kill feed, overhead nametags with 3D floating health bars.
  - In-game text chat (press `ENTER`) and live scoreboard (hold `TAB`).

---

### 2. 🌌 Single-Player Story Campaign
- **Chapter 01: The Silent Station**
  - Explore the breached Aegis Station.
  - Recover 3 quantum power cells while surviving rogue sentinel drones.
- **Chapter 02: Core Defense**
  - Defend the planetary reactor against 3 intensifying waves of Void Infiltrators.
- **Chapter 03: Edge of the Abyss (Boss Battle)**
  - Leap across floating asteroid platforms over the swirling Event Horizon.
  - Battle the **A.P.E.X. Void Colossus**, a multi-phase mechanical boss with orbital laser shields!

---

### 3. 🛍️ Armory & Shop (Skins, Weapons, Camos)
- **Player Suits & Skins**:
  1. **Vanguard Marine** (Standard cobalt & white arctic armor)
  2. **Void Walker** (Dark matter armor with purple cosmic energy)
  3. **Cyber Ronin** (Matte black exoskeleton with cyan neon edges)
  4. **Solar Flare** (Thermal molten hazard suit)
  5. **Obsidian Spec-Ops** (Black stealth armor with crimson optics)
  6. **Celestial Commander** (Pearlescent white armor with polished gold trim)
- **Weapon Arsenal**:
  - **Plasma Pulse Rifle**: High fire-rate cyan energy rifle (30-round mag).
  - **Horizon Scattergun**: High-damage close-range thermal shotgun (8 pellets).
  - **Singularity Railgun**: Long-range dark matter sniper beam.
  - **Void Blaster**: Infinite-ammo emergency plasma sidearm.
- **Tracer Effects & Customization**:
  - Cyan Core, Void Violet, Thermal Ember, Gamma Emerald, Solaris Gold.

---

### 4. 👤 Authentication & Persistence (Firebase In-Code + Local Guest)
- **Direct In-Code Firebase Configuration**:
  - Open `public/js/firebase-config.js` to paste your Firebase credentials:
    ```javascript
    export const FIREBASE_CONFIG = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.appspot.com",
      messagingSenderId: "...",
      appId: "..."
    };
    ```
  - When populated, the game automatically initializes the Firebase SDK and synchronizes stats, credits, and unlocked suits to Cloud Firestore!
  - **Zero-Setup Local Mode**: If no keys are added, pilot data is safely saved in local storage.

---

### 5. 💡 High-Visibility Lighting & Tactical Headlamp
- All maps upgraded with high-intensity Hemisphere, Ambient, and Directional flood lighting.
- The player helmet camera is equipped with a forward-facing tactical **SpotLight & PointLight Headlamp** ensuring crystal-clear visibility in all corridors and open asteroid fields.

---

### 5. 🔊 Procedural Web Audio Synthesizer
- 100% self-contained audio using the Web Audio API — zero missing audio file risks!
- Synthesized laser pew, shotgun boom, railgun electromagnetic discharge, hit-marker ticks, kill chimes, footsteps, jump swooshes, and an ominous ambient sub-bass drone.

---

## 🎮 Controls

| Action | Key / Input |
|---|---|
| **Move** | `W`, `A`, `S`, `D` / Arrow Keys |
| **Aim / Look** | Mouse (Pointer Lock) |
| **Fire Weapon** | Left Mouse Button |
| **Reload** | `R` |
| **Jump** | `Spacebar` |
| **Sprint** | `Shift` |
| **Crouch** | `C` |
| **Switch Weapons** | `1` (Rifle), `2` (Shotgun), `3` (Railgun), `4` (Blaster) |
| **Scoreboard** | Hold `TAB` |
| **In-Game Chat** | Press `ENTER` |
| **Pause / Menu** | `ESC` |

---

## 💻 How to Run

1. Open your terminal in the game directory:
   ```bash
   cd /Users/Rishi/.gemini/antigravity/scratch/event-horizon
   npm start
   ```
2. Navigate to `http://localhost:3000` in any modern web browser (Chrome, Safari, Edge, Firefox).
3. To test multiplayer with multiple pilots, simply open a second browser window or tab and join the same World Server room!
