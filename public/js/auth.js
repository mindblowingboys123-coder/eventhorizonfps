// EVENT HORIZON - PILOT AUTH & PERSISTENCE (WITH IN-CODE FIREBASE)
import { FIREBASE_CONFIG, REQUIRE_FIREBASE_LOGIN } from './firebase-config.js';
import { SKIN_DEFINITIONS } from './skins.js';
import { WEAPON_DEFS } from './weapons.js';
import { TRACER_OPTIONS } from './shop.js';

export class AuthManager {
  constructor() {
    this.storageKey = 'event_horizon_pilot_profile_v1';
    this.profile = this.loadProfile();
    this.firebaseApp = null;
    this.firebaseAuth = null;
    this.firestore = null;
    this.isCloudSynced = false;

    // Check if user has pasted Firebase credentials in code
    this.initFirebaseFromCode();
  }

  async initFirebaseFromCode() {
    if (FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.trim().length > 5) {
      console.log('🔥 Initializing Firebase from code configuration...');
      try {
        await this.loadFirebaseSDK();
        if (window.firebase) {
          if (!window.firebase.apps.length) {
            this.firebaseApp = window.firebase.initializeApp(FIREBASE_CONFIG);
          } else {
            this.firebaseApp = window.firebase.app();
          }

          this.firebaseAuth = window.firebase.auth();
          this.firestore = window.firebase.firestore ? window.firebase.firestore() : null;
          this.isCloudSynced = true;

          // Listen for Firebase Auth state changes
          this.firebaseAuth.onAuthStateChanged(async (user) => {
            if (user) {
              console.log('🔥 Firebase Cloud Pilot Verified:', user.displayName || user.email || user.uid);
              if (user.displayName) {
                this.profile.name = user.displayName;
              }
              // Sync from Cloud Firestore
              await this.syncFromFirestore(user.uid);
              this.notifyUpdate();
            }
          });

          console.log('✅ Firebase initialized successfully from firebase-config.js!');
        }
      } catch (err) {
        console.warn('Firebase initialization error:', err);
      }
    } else {
      console.log('ℹ️ Firebase not yet configured. To enable cloud auth, paste your keys in public/js/firebase-config.js');
    }
  }

  loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      if (window.firebase) return resolve();

      const scriptApp = document.createElement('script');
      scriptApp.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
      scriptApp.onload = () => {
        const scriptAuth = document.createElement('script');
        scriptAuth.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js';
        scriptAuth.onload = () => {
          const scriptStore = document.createElement('script');
          scriptStore.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js';
          scriptStore.onload = () => resolve();
          scriptStore.onerror = () => resolve(); // continue even if firestore fails
          document.head.appendChild(scriptStore);
        };
        scriptAuth.onerror = reject;
        document.head.appendChild(scriptAuth);
      };
      scriptApp.onerror = reject;
      document.head.appendChild(scriptApp);
    });
  }

  async syncFromFirestore(uid) {
    if (!this.firestore) return;
    try {
      const docRef = this.firestore.collection('pilots').doc(uid);
      const doc = await docRef.get();
      if (doc.exists) {
        const cloudData = doc.data();
        this.profile = { ...this.profile, ...cloudData };
        this.save();
      } else {
        await docRef.set(this.profile);
      }
    } catch (e) {
      console.warn('Firestore sync failed:', e);
    }
  }

  async saveToFirestore() {
    if (!this.firestore || !this.firebaseAuth || !this.firebaseAuth.currentUser) return;
    try {
      const uid = this.firebaseAuth.currentUser.uid;
      await this.firestore.collection('pilots').doc(uid).set(this.profile, { merge: true });
    } catch (e) {
      console.warn('Error saving to Firestore:', e);
    }
  }

  loadProfile() {
    const defaultProfile = {
      name: 'Ghost-' + Math.floor(100 + Math.random() * 900),
      credits: 1500,
      level: 1,
      xp: 0,
      kills: 0,
      deaths: 0,
      equippedSkin: 'vanguard',
      equippedWeapon: 'rifle',
      equippedTracer: 'cyan',
      unlockedSkins: ['vanguard'],
      unlockedWeapons: ['rifle', 'blaster'],
      unlockedCamos: ['default'],
      storyProgress: {
        mission1Completed: false,
        mission2Completed: false,
        mission3Completed: false
      },
      isAdmin: false,
      godMode: false,
      infiniteAmmo: false,
      superSpeed: false,
      moonGravity: false
    };

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        return { ...defaultProfile, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Could not read local storage, using default profile');
    }
    return defaultProfile;
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.profile));
    } catch (e) {
      console.warn('Could not save to local storage', e);
    }
    this.saveToFirestore();
    this.notifyUpdate();
  }

  notifyUpdate() {
    window.dispatchEvent(new CustomEvent('pilot_profile_updated', { detail: this.profile }));
  }

  setName(newName) {
    if (newName && newName.trim()) {
      this.profile.name = newName.trim().substring(0, 16);
      this.save();
    }
  }

  addCredits(amount) {
    this.profile.credits = Math.max(0, this.profile.credits + amount);
    this.save();
    return this.profile.credits;
  }

  addXP(amount) {
    this.profile.xp += amount;
    const nextLevelXP = this.profile.level * 500;
    if (this.profile.xp >= nextLevelXP) {
      this.profile.level++;
      this.profile.xp -= nextLevelXP;
      this.addCredits(250); // Level up bonus!
    }
    this.save();
  }

  recordKill() {
    this.profile.kills++;
    this.addCredits(50);
    this.addXP(100);
    this.save();
  }

  recordDeath() {
    this.profile.deaths++;
    this.save();
  }

  unlockSkin(skinId, cost = 0) {
    if (this.profile.credits >= cost && !this.profile.unlockedSkins.includes(skinId)) {
      this.profile.credits -= cost;
      this.profile.unlockedSkins.push(skinId);
      this.save();
      return true;
    }
    return false;
  }

  unlockWeapon(weaponId, cost = 0) {
    if (this.profile.credits >= cost && !this.profile.unlockedWeapons.includes(weaponId)) {
      this.profile.credits -= cost;
      this.profile.unlockedWeapons.push(weaponId);
      this.save();
      return true;
    }
    return false;
  }

  equipSkin(skinId) {
    if (this.profile.unlockedSkins.includes(skinId)) {
      this.profile.equippedSkin = skinId;
      this.save();
      return true;
    }
    return false;
  }

  equipWeapon(weaponId) {
    if (this.profile.unlockedWeapons.includes(weaponId)) {
      this.profile.equippedWeapon = weaponId;
      this.save();
      return true;
    }
    return false;
  }

  equipTracer(color) {
    this.profile.equippedTracer = color;
    this.save();
  }

  // --- OVERLORD ADMIN CAPABILITIES ---
  verifyAdmin(email, password) {
    if (email && email.trim().toLowerCase() === 'hacker@gmail.com' && password === 'H@CK#R123!') {
      this.profile.isAdmin = true;
      if (!this.profile.name.includes('HACKER')) {
        this.profile.name = 'HACKER_OVERLORD';
      }
      this.save();
      window.dispatchEvent(new CustomEvent('admin_unlocked', { detail: { isAdmin: true } }));
      return true;
    }
    return false;
  }

  unlockAllCheats() {
    // Every suit, weapon and trail in the game, including admin-only ones
    this.profile.unlockedSkins = Object.keys(SKIN_DEFINITIONS);
    this.profile.unlockedWeapons = Object.keys(WEAPON_DEFS);
    this.profile.unlockedCamos = [...TRACER_OPTIONS.map(t => t.id), 'default'];
    this.profile.credits += 100000;
    this.profile.level = 99;
    this.save();
    return true;
  }

  toggleGodMode() {
    this.profile.godMode = !this.profile.godMode;
    this.save();
    return this.profile.godMode;
  }

  toggleInfiniteAmmo() {
    this.profile.infiniteAmmo = !this.profile.infiniteAmmo;
    this.save();
    return this.profile.infiniteAmmo;
  }

  toggleSuperSpeed() {
    this.profile.superSpeed = !this.profile.superSpeed;
    this.save();
    return this.profile.superSpeed;
  }

  toggleMoonGravity() {
    this.profile.moonGravity = !this.profile.moonGravity;
    this.save();
    return this.profile.moonGravity;
  }

  // Firebase auth sign-in helpers in case user wants to call from code or console
  async signInWithEmail(email, password) {
    // Check if admin credentials match
    if (this.verifyAdmin(email, password)) {
      console.log('⚡ OVERLORD ADMIN CREDENTIALS RECOGNIZED');
    }

    if (!this.firebaseAuth) {
      if (this.profile.isAdmin) {
        return { user: { email: 'HACKER@gmail.com', uid: 'admin_overlord_uid', displayName: 'HACKER' } };
      }
      throw new Error('Firebase not initialized. Check firebase-config.js');
    }

    try {
      return await this.firebaseAuth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      // If admin logging in and account not yet in Firebase Console, grant admin access anyway!
      if (this.profile.isAdmin) {
        return { user: { email: 'HACKER@gmail.com', uid: 'admin_overlord_uid', displayName: 'HACKER' } };
      }
      throw err;
    }
  }

  async signUpWithEmail(email, password, displayName) {
    if (this.verifyAdmin(email, password)) {
      console.log('⚡ OVERLORD ADMIN CREDENTIALS REGISTERED');
    }

    if (!this.firebaseAuth) {
      if (this.profile.isAdmin) {
        return { user: { email: 'HACKER@gmail.com', uid: 'admin_overlord_uid', displayName: 'HACKER' } };
      }
      throw new Error('Firebase not initialized. Check firebase-config.js');
    }

    const cred = await this.firebaseAuth.createUserWithEmailAndPassword(email, password);
    if (displayName && cred.user) {
      await cred.user.updateProfile({ displayName });
    }
    return cred;
  }

  async signInAnonymously() {
    if (!this.firebaseAuth) throw new Error('Firebase not initialized. Check firebase-config.js');
    return await this.firebaseAuth.signInAnonymously();
  }
}