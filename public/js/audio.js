
// EVENT HORIZON - PROCEDURAL WEB AUDIO SYNTHESIZER
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.isMuted = false;
    this.droneOsc = null;
    this.ambientPlaying = false;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.6;

    // NEW: Background music playlist
    this.backgroundSongs = [
      'audio/space-theme-1.mp3',
      'audio/space-theme-2.mp3',
      'audio/space-theme-3.mp3'
    ];

    this.currentSongIndex = 0;
    this.backgroundAudio = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.startAmbientDrone();
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : 1.0,
        this.ctx.currentTime
      );
    }

    // NEW: Also mute background music
    if (this.backgroundAudio) {
      this.backgroundAudio.muted = this.isMuted;
    }

    return !this.isMuted;
  }

  setSFXVolume(val) {
    this.sfxVolume = val;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(val, this.ctx.currentTime);
    }
  }

  setMusicVolume(val) {
    this.musicVolume = val;

    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(val, this.ctx.currentTime);
    }

    // NEW: Also control playlist volume
    if (this.backgroundAudio) {
      this.backgroundAudio.volume = Math.max(0, Math.min(1, val));
    }
  }

  // --- WEAPON SOUND EFFECTS ---
  playShoot(weaponType = 'rifle') {
    this.init();
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    switch (weaponType) {
      case 'rifle': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(850, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.13);
        break;
      }

      case 'shotgun': {
        const bufferSize = this.ctx.sampleRate * 0.25;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2500, t);
        filter.frequency.exponentialRampToValueAtTime(200, t + 0.22);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t);
        sub.frequency.exponentialRampToValueAtTime(35, t + 0.2);
        subGain.gain.setValueAtTime(0.5, t);
        subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        sub.connect(subGain);
        subGain.connect(this.sfxGain);

        whiteNoise.start(t);
        sub.start(t);
        sub.stop(t + 0.22);
        break;
      }

      case 'railgun': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1600, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.45);

        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.46);
        break;
      }

      case 'blaster': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, t);
        osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.1);
        break;
      }
    }
  }

  playHitMarker(isLethal = false) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isLethal ? 1800 : 1200, t);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.07);

    if (isLethal) {
      setTimeout(() => this.playKillChime(), 60);
    }
  }

  playKillChime() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [659.25, 880, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      gain.gain.setValueAtTime(0.2, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.25);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.26);
    });
  }

  playPlayerHurt() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.18);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  playReload() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.frequency.setValueAtTime(700, t);
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc1.connect(g1);
    g1.connect(this.sfxGain);
    osc1.start(t);
    osc1.stop(t + 0.09);

    setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.frequency.setValueAtTime(1100, t2);
      g2.gain.setValueAtTime(0.2, t2);
      g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.1);
      osc2.connect(g2);
      g2.connect(this.sfxGain);
      osc2.start(t2);
      osc2.stop(t2 + 0.11);
    }, 400);
  }

  playJump() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(450, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  playFootstep() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.06);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // --- AMBIENT SPACE DRONE / SYNTH BACKGROUND ---
  startAmbientDrone() {
    if (this.ambientPlaying || !this.ctx) return;
    this.ambientPlaying = true;

    const oscSub = this.ctx.createOscillator();
    const oscHarm = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(55, this.ctx.currentTime);

    oscHarm.type = 'sawtooth';
    oscHarm.frequency.setValueAtTime(110, this.ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    oscSub.connect(filter);
    oscHarm.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    oscSub.start();
    oscHarm.start();

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  // ==========================================
  // NEW: BACKGROUND MUSIC PLAYLIST
  // ==========================================

  playBackgroundMusic() {
    if (!this.backgroundSongs.length) {
      console.warn('No background songs configured.');
      return;
    }

    if (!this.backgroundAudio) {
      this.backgroundAudio = new Audio();

      this.backgroundAudio.volume = Math.max(
        0,
        Math.min(1, this.musicVolume)
      );

      this.backgroundAudio.muted = this.isMuted;

      this.backgroundAudio.addEventListener('ended', () => {
        this.nextBackgroundSong();
      });
    }

    this.backgroundAudio.src =
      this.backgroundSongs[this.currentSongIndex];

    this.backgroundAudio.loop = false;

    this.backgroundAudio.play().catch(error => {
      console.warn('Background music playback failed:', error);
    });
  }

  nextBackgroundSong() {
    if (!this.backgroundSongs.length) return;

    this.currentSongIndex =
      (this.currentSongIndex + 1) % this.backgroundSongs.length;

    this.playBackgroundMusic();
  }

  previousBackgroundSong() {
    if (!this.backgroundSongs.length) return;

    this.currentSongIndex =
      (this.currentSongIndex - 1 + this.backgroundSongs.length) %
      this.backgroundSongs.length;

    this.playBackgroundMusic();
  }

  pauseBackgroundMusic() {
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
    }
  }

  resumeBackgroundMusic() {
    if (this.backgroundAudio) {
      this.backgroundAudio.play().catch(error => {
        console.warn('Music resume failed:', error);
      });
    }
  }

  stopBackgroundMusic() {
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
      this.backgroundAudio.currentTime = 0;
    }
  }
}
