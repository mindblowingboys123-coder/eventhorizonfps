// EVENT HORIZON - ARMORY & SHOP MANAGER
import { SKIN_DEFINITIONS } from './skins.js';
import { WEAPON_DEFS } from './weapons.js';
import { ABILITY_LIST } from './abilities.js';

export const ABILITY_PRICE = 20000; // credits to buy an ability outright

export const TRACER_OPTIONS = [
  { id: 'cyan', name: 'Cyan Plasma Core', color: '#00f0ff', hex: 0x00f0ff, cost: 0, unlocked: true },
  { id: 'violet', name: 'Void Violet Beam', color: '#9d4edd', hex: 0x9d4edd, cost: 400, unlocked: false },
  { id: 'orange', name: 'Thermal Ember', color: '#ff6b35', hex: 0xff6b35, cost: 400, unlocked: false },
  { id: 'emerald', name: 'Gamma Emerald', color: '#00ff88', hex: 0x00ff88, cost: 600, unlocked: false },
  { id: 'gold', name: 'Solaris Gold Pulse', color: '#ffd166', hex: 0xffd166, cost: 1000, unlocked: false },
  { id: 'cyberpunk_horizen', name: "Cyberpunk's Secret Horizen", color: '#ff2bd6', hex: 0xff2bd6, cost: 0, unlocked: true, adminOnly: true }
];

export class ShopManager {
  constructor(authManager, soundEngine) {
    this.auth = authManager;
    this.sound = soundEngine;
  }

  // Admin-only items are granted to the Overlord account automatically
  ensureAdminAccess(profile, list, id, adminOnly) {
    if (adminOnly && profile.isAdmin && !profile[list].includes(id)) profile[list].push(id);
  }

  renderSkinsTab(container) {
    if (!container) return;
    container.innerHTML = '';

    const profile = this.auth.profile;

    for (const key in SKIN_DEFINITIONS) {
      const skin = SKIN_DEFINITIONS[key];
      if (skin.adminOnly && !profile.isAdmin) continue;
      this.ensureAdminAccess(profile, 'unlockedSkins', skin.id, skin.adminOnly);
      const isUnlocked = profile.unlockedSkins.includes(skin.id);
      const isEquipped = profile.equippedSkin === skin.id;

      const card = document.createElement('div');
      card.className = 'skin-card';

      card.innerHTML = `
        <div class="skin-preview-thumb" style="border-color:${'#' + skin.colors.visor.toString(16).padStart(6, '0')}">
          <div style="width:50px; height:70px; background:${'#' + skin.colors.armor.toString(16).padStart(6, '0')}; border-radius:4px; position:relative; box-shadow:0 0 15px ${'#' + skin.colors.visor.toString(16).padStart(6, '0')};">
            <div style="width:30px; height:12px; background:${'#' + skin.colors.visor.toString(16).padStart(6, '0')}; margin:8px auto 0 auto; border-radius:2px;"></div>
            <div style="width:16px; height:16px; background:${'#' + skin.colors.core.toString(16).padStart(6, '0')}; border-radius:50%; margin:14px auto 0 auto;"></div>
          </div>
        </div>
        <h4>${skin.name}</h4>
        <div class="skin-rarity rarity-${skin.rarity}">${skin.rarity}</div>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${skin.description}</p>
        <button class="sci-btn ${isEquipped ? 'primary' : ''} btn-action-skin" data-skin="${skin.id}" style="width:100%; justify-content:center; padding:10px;">
          ${isEquipped ? 'EQUIPPED' : (isUnlocked ? 'EQUIP SUIT' : `BUY: ${skin.cost} CR`)}
        </button>
      `;

      const btn = card.querySelector('.btn-action-skin');
      btn.addEventListener('click', () => {
        if (isEquipped) return;
        if (isUnlocked) {
          this.auth.equipSkin(skin.id);
          if (this.sound) this.sound.playKillChime();
          this.renderSkinsTab(container);
        } else {
          if (this.auth.unlockSkin(skin.id, skin.cost)) {
            this.auth.equipSkin(skin.id);
            if (this.sound) this.sound.playKillChime();
            this.renderSkinsTab(container);
          } else {
            alert('Insufficient credits! Play Story Mode or World Server matches to earn more credits.');
          }
        }
      });

      container.appendChild(card);
    }
  }

  renderWeaponsTab(container) {
    if (!container) return;
    container.innerHTML = '';
    const profile = this.auth.profile;

    for (const key in WEAPON_DEFS) {
      const w = WEAPON_DEFS[key];
      if (w.adminOnly && !profile.isAdmin) continue;
      this.ensureAdminAccess(profile, 'unlockedWeapons', w.id, w.adminOnly);
      const isUnlocked = profile.unlockedWeapons.includes(w.id);
      const isEquipped = profile.equippedWeapon === w.id;

      const card = document.createElement('div');
      card.className = 'skin-card';

      card.innerHTML = `
        <div class="skin-preview-thumb">
          <div style="font-family:var(--font-display); font-size:1.4rem; color:var(--primary-cyan);">
            ${w.name.substring(0, 3).toUpperCase()}
          </div>
        </div>
        <h4>${w.name}</h4>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
          DAMAGE: <b>${w.damage}</b> | MAG: <b>${w.magSize}</b>
        </div>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${w.description}</p>
        <button class="sci-btn ${isEquipped ? 'primary' : ''} btn-action-wep" data-weapon="${w.id}" style="width:100%; justify-content:center; padding:10px;">
          ${isEquipped ? 'EQUIPPED' : (isUnlocked ? 'EQUIP WEAPON' : 'UNLOCK: 800 CR')}
        </button>
      `;

      const btn = card.querySelector('.btn-action-wep');
      btn.addEventListener('click', () => {
        if (isEquipped) return;
        if (isUnlocked) {
          this.auth.equipWeapon(w.id);
          if (this.sound) this.sound.playKillChime();
          this.renderWeaponsTab(container);
        } else {
          if (this.auth.unlockWeapon(w.id, 800)) {
            this.auth.equipWeapon(w.id);
            if (this.sound) this.sound.playKillChime();
            this.renderWeaponsTab(container);
          } else {
            alert('Insufficient credits to unlock weapon.');
          }
        }
      });

      container.appendChild(card);
    }
  }

  // Abilities: buy the ones your level has not unlocked yet
  renderAbilitiesTab(container) {
    if (!container) return;
    container.innerHTML = '';
    const profile = this.auth.profile;
    const owned = profile.unlockedAbilities || [];

    ABILITY_LIST.forEach((a) => {
      const byLevel = a.level !== undefined && (profile.level || 1) >= a.level;
      const bought = owned.includes(a.id);
      const card = document.createElement('div');
      card.className = 'skin-card';

      let action;
      if (byLevel) action = `<div style="color:#00ff88; font-size:0.85rem;">Unlocked at level ${a.level}</div>`;
      else if (bought) action = `<div style="color:#00ff88; font-size:0.85rem;">Owned</div>`;
      else action = `<button class="sci-btn primary btn-buy-ability" style="width:100%; justify-content:center; padding:10px;">BUY · ${ABILITY_PRICE.toLocaleString()} CR</button>`;

      card.innerHTML = `
        <h4>${a.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${a.description}</p>
        ${action}
      `;

      const btn = card.querySelector('.btn-buy-ability');
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.auth.buyAbility(a.id, ABILITY_PRICE)) {
            this.sound.playKillChime();
            window.dispatchEvent(new CustomEvent('abilities_changed'));
            this.renderAbilitiesTab(container);
          } else {
            alert(`Not enough credits. An ability costs ${ABILITY_PRICE.toLocaleString()} CR.`);
          }
        });
      }
      // Pick which ability goes in the E slot and which in the Q slot
      if (byLevel || bought) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
        ['E', 'Q'].forEach((slot) => {
          const b = document.createElement('button');
          b.className = 'sci-btn';
          b.style.cssText = 'flex:1; justify-content:center; padding:8px 4px; font-size:0.75rem; white-space:nowrap;';
          const current = (profile.equippedAbilities || {})[slot] === a.id;
          b.textContent = (current ? 'IN ' : 'SET ') + slot;
          b.addEventListener('click', () => {
            this.auth.setEquippedAbility(slot, a.id);
            window.dispatchEvent(new CustomEvent('abilities_changed'));
            this.renderAbilitiesTab(container);
          });
          row.appendChild(b);
        });
        card.appendChild(row);
      }
      container.appendChild(card);
    });
  }

  renderCamosTab(container) {
    if (!container) return;
    container.innerHTML = '';
    const profile = this.auth.profile;

    TRACER_OPTIONS.forEach(t => {
      if (t.adminOnly && !profile.isAdmin) return;
      const isUnlocked = t.adminOnly ? true : (t.cost === 0 || profile.unlockedCamos.includes(t.id));
      const isEquipped = profile.equippedTracer === t.id;

      const card = document.createElement('div');
      card.className = 'skin-card';

      card.innerHTML = `
        <div class="skin-preview-thumb">
          <div style="width:60px; height:8px; background:${t.color}; border-radius:4px; box-shadow:0 0 15px ${t.color};"></div>
        </div>
        <h4>${t.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Changes energy bullet beam color and impact discharge.</p>
        <button class="sci-btn ${isEquipped ? 'primary' : ''} btn-action-camo" style="width:100%; justify-content:center; padding:10px;">
          ${isEquipped ? 'EQUIPPED' : (isUnlocked ? 'EQUIP TRACER' : `BUY: ${t.cost} CR`)}
        </button>
      `;

      const btn = card.querySelector('.btn-action-camo');
      btn.addEventListener('click', () => {
        if (isEquipped) return;
        if (isUnlocked) {
          this.auth.equipTracer(t.id);
          if (this.sound) this.sound.playKillChime();
          this.renderCamosTab(container);
        } else {
          if (this.auth.profile.credits >= t.cost) {
            this.auth.profile.credits -= t.cost;
            this.auth.profile.unlockedCamos.push(t.id);
            this.auth.equipTracer(t.id);
            this.auth.save();
            if (this.sound) this.sound.playKillChime();
            this.renderCamosTab(container);
          } else {
            alert('Insufficient credits to unlock tracer effect.');
          }
        }
      });

      container.appendChild(card);
    });
  }
}