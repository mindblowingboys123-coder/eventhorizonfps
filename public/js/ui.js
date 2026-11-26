// EVENT HORIZON - USER INTERFACE & HUD CONTROLLER
export class UIManager {
  constructor(authManager) {
    this.auth = authManager;

    // Elements
    this.mainMenu = document.getElementById('main-menu');
    this.hudContainer = document.getElementById('hud-container');
    this.pauseMenu = document.getElementById('pause-menu');
    this.scoreboardModal = document.getElementById('scoreboard-modal');
    this.modalAccount = document.getElementById('modal-account');
    this.damageVignette = document.getElementById('damage-vignette');
    this.hitMarker = document.getElementById('hit-marker');

    // Radar Canvas
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

    // Chat
    this.chatLog = document.getElementById('chat-log');
    this.chatInputWrap = document.getElementById('chat-input-wrap');
    this.chatInput = document.getElementById('chat-input');
    this.isChatActive = false;

    this.initEventListeners();
    this.updateUserBadge();
  }

  initEventListeners() {
    window.addEventListener('pilot_profile_updated', () => {
      this.updateUserBadge();
    });

    // Chat toggle on ENTER
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        this.toggleChat();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        this.scoreboardModal.classList.add('active');
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.scoreboardModal.classList.remove('active');
      }
    });
  }

  updateUserBadge() {
    const p = this.auth.profile;
    const nameEl = document.getElementById('header-player-name');
    const rankEl = document.getElementById('header-player-rank');
    const credEl = document.getElementById('header-credits-val');

    if (nameEl) nameEl.innerText = p.name;
    if (rankEl) rankEl.innerText = `(LVL ${p.level})`;
    if (credEl) credEl.innerText = p.credits.toLocaleString();

    // Account modal fields
    const kEl = document.getElementById('stat-kills');
    const dEl = document.getElementById('stat-deaths');
    const kdEl = document.getElementById('stat-kd');
    const lvlEl = document.getElementById('stat-lvl');
    const inputName = document.getElementById('input-pilot-name');

    if (kEl) kEl.innerText = p.kills;
    if (dEl) dEl.innerText = p.deaths;
    if (kdEl) {
      const kd = p.deaths === 0 ? p.kills : (p.kills / p.deaths).toFixed(2);
      kdEl.innerText = kd;
    }
    if (lvlEl) lvlEl.innerText = p.level;
    if (inputName) inputName.value = p.name;
  }

  showMainMenu() {
    this.mainMenu.classList.remove('hidden');
    this.hudContainer.classList.add('hidden');
    this.pauseMenu.classList.add('hidden');
    this.updateUserBadge();
  }

  showHUD() {
    this.mainMenu.classList.add('hidden');
    this.hudContainer.classList.remove('hidden');
    this.pauseMenu.classList.add('hidden');
  }

  togglePauseMenu(show) {
    if (show) {
      this.pauseMenu.classList.remove('hidden');
    } else {
      this.pauseMenu.classList.add('hidden');
    }
  }

  updateVitals(health, maxHealth, shield, maxShield) {
    const hFill = document.getElementById('hud-health-fill');
    const hVal = document.getElementById('hud-health-val');
    const sFill = document.getElementById('hud-shield-fill');
    const sVal = document.getElementById('hud-shield-val');

    if (hFill && hVal) {
      const hpPct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
      hFill.style.width = hpPct + '%';
      hVal.innerText = `${Math.ceil(health)} / ${maxHealth}`;
    }

    if (sFill && sVal) {
      const spPct = Math.max(0, Math.min(100, (shield / maxShield) * 100));
      sFill.style.width = spPct + '%';
      sVal.innerText = `${Math.ceil(shield)} / ${maxShield}`;
    }
  }

  updateWeaponHUD(weapon, curAmmo, resAmmo) {
    const nameEl = document.getElementById('hud-weapon-name');
    const curEl = document.getElementById('hud-ammo-cur');
    const resEl = document.getElementById('hud-ammo-res');

    if (nameEl) nameEl.innerText = weapon.name;
    if (curEl) curEl.innerText = curAmmo;
    if (resEl) resEl.innerText = resAmmo;
  }

  showReloading(isReloading) {
    const badge = document.getElementById('hud-reload-badge');
    if (badge) {
      if (isReloading) badge.classList.add('active');
      else badge.classList.remove('active');
    }
  }

  triggerHitMarker() {
    if (this.hitMarker) {
      this.hitMarker.classList.add('active');
      setTimeout(() => {
        this.hitMarker.classList.remove('active');
      }, 100);
    }
  }

  triggerDamageFlash() {
    if (this.damageVignette) {
      this.damageVignette.classList.add('hit');
      setTimeout(() => {
        this.damageVignette.classList.remove('hit');
      }, 180);
    }
  }

  addKillFeed(killer, victim, weapon) {
    const feed = document.getElementById('hud-killfeed');
    if (!feed) return;

    const row = document.createElement('div');
    row.className = 'kill-row';
    row.innerHTML = `<b style="color:var(--primary-cyan);">${killer}</b> [${weapon}] <b style="color:#ff0055;">${victim}</b>`;
    feed.appendChild(row);

    setTimeout(() => {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, 4500);
  }

  addChatMessage(sender, text, isSystem = false) {
    if (!this.chatLog) return;

    const msg = document.createElement('div');
    msg.className = `chat-msg ${isSystem ? 'system' : ''}`;
    if (isSystem) {
      msg.innerText = text;
    } else {
      msg.innerHTML = `<span class="sender">${sender}:</span>${text}`;
    }

    this.chatLog.appendChild(msg);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;

    setTimeout(() => {
      if (msg.parentNode) {
        msg.style.opacity = '0.4';
      }
    }, 10000);
  }

  toggleChat(onSendCallback) {
    if (!this.chatInputWrap) return;
    this.isChatActive = !this.isChatActive;

    if (this.isChatActive) {
      this.chatInputWrap.classList.add('active');
      this.chatInput.focus();
    } else {
      const text = this.chatInput.value.trim();
      if (text && onSendCallback) {
        onSendCallback(text);
      }
      this.chatInput.value = '';
      this.chatInputWrap.classList.remove('active');
    }
  }

  renderRadar(playerPos, playerYaw, targets = []) {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;

    // Match the canvas to its frame exactly, with sharp pixels on high-density screens
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(1, Math.round(this.radarCanvas.clientWidth || 130));
    const px = Math.round(size * dpr);
    if (this.radarCanvas.width !== px || this.radarCanvas.height !== px) {
      this.radarCanvas.width = px;
      this.radarCanvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = size;
    const h = size;
    const center = w / 2;

    // The radar zooms out so that every pilot on the map fits, never less than 50 metres
    let range = 50;
    for (const t of targets) {
      const d = Math.hypot(t.x - playerPos.x, t.z - playerPos.z);
      if (d + 5 > range) range = d + 5;
    }

    ctx.clearRect(0, 0, w, h);

    // Outer circle
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric grid circles
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(center, center, center * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Cross lines
    ctx.beginPath();
    ctx.moveTo(center, 0); ctx.lineTo(center, h);
    ctx.moveTo(0, center); ctx.lineTo(w, center);
    ctx.stroke();

    // Self blip (center triangle pointing forward)
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.arc(center, center, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Targets (Enemies & other players)
    targets.forEach(t => {
      const dx = t.x - playerPos.x;
      const dz = t.z - playerPos.z;

      // Rotate coordinates relative to player yaw
      const cos = Math.cos(playerYaw);
      const sin = Math.sin(playerYaw);
      const rx = (dx * cos - dz * sin);
      const rz = (dx * sin + dz * cos);

      const px = center + (rx / range) * center;
      const py = center + (rz / range) * center;

      ctx.fillStyle = t.isEnemy ? '#ff0055' : '#00f0ff';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  updateScoreboard(players = []) {
    const tbody = document.getElementById('score-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    players.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--primary-cyan); font-weight:700;">${p.name}</td>
        <td>${p.skin || 'vanguard'}</td>
        <td style="color:#00ff88;">${p.kills || 0}</td>
        <td style="color:#ff0055;">${p.deaths || 0}</td>
        <td style="color:var(--primary-gold); font-weight:700;">${p.score || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}
