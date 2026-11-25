// EVENT HORIZON - ABILITY SYSTEM (E and Q slots)
// Pure logic with no Three.js dependency, so it can be tested without a browser.
//
// The game passes a `ctx` object into use(slot, ctx). It must provide:
//   ctx.pos            {x, y, z}   player position
//   ctx.dir            {x, z}      player's flat forward direction (normalized)
//   ctx.enemies        [{ pos:{x,y,z}, ... }]   every living hostile
//   ctx.damageEnemy(enemy, amount)
//   ctx.stunEnemy(enemy, seconds)
//   ctx.pullEnemy(enemy, x, z)      drag an enemy toward a point
//   ctx.dash(vx, vz)                set the player's horizontal velocity
//   ctx.addShield(amount)
//   ctx.deployCar()                 spawn a remote car in front of you (driven with WASD)
//   ctx.blink(distance)             teleport forward; returns false if no clear spot
//   ctx.deployTurret()              place a turret at your feet
//   ctx.deployMine()                drop a proximity mine at your feet
//   ctx.deployDecoy()               leave a hologram of yourself behind
// Abilities with purchaseOnly have no level; they are bought in the shop.

export const ABILITIES = {
  dash: {
    id: 'dash', name: 'Phase Dash', level: 2, cooldown: 6, color: '#00f0ff',
    description: 'Burst forward at high speed.',
    apply(mgr, ctx) {
      ctx.dash(ctx.dir.x * 28, ctx.dir.z * 28);
      return 0;
    }
  },
  shockwave: {
    id: 'shockwave', name: 'Shockwave', level: 4, cooldown: 10, color: '#ff8a3a',
    description: 'Blast every hostile within 14 metres for 120 damage.',
    apply(mgr, ctx) {
      const hit = within(ctx, 14);
      hit.forEach(e => ctx.damageEnemy(e, 120));
      return hit.length;
    }
  },
  shield_burst: {
    id: 'shield_burst', name: 'Shield Burst', level: 6, cooldown: 12, color: '#9d4edd',
    description: 'Instantly restore 60 shield.',
    apply(mgr, ctx) {
      ctx.addShield(60);
      return 0;
    }
  },
  overdrive: {
    id: 'overdrive', name: 'Overdrive', level: 8, cooldown: 15, color: '#ffd166',
    description: 'Double your fire rate for 6 seconds.',
    apply(mgr) {
      mgr.buffs.overdrive = 6;
      return 0;
    }
  },
  gravity_pull: {
    id: 'gravity_pull', name: 'Gravity Pull', level: 10, cooldown: 14, color: '#b57bff',
    description: 'Drag nearby hostiles in front of you and stun them for 2.5 seconds.',
    apply(mgr, ctx) {
      const hit = within(ctx, 25);
      const tx = ctx.pos.x + ctx.dir.x * 6;
      const tz = ctx.pos.z + ctx.dir.z * 6;
      hit.forEach(e => { ctx.pullEnemy(e, tx, tz); ctx.stunEnemy(e, 2.5); });
      return hit.length;
    }
  },
  cloak: {
    id: 'cloak', name: 'Cloak', level: 12, cooldown: 18, color: '#7dff3a',
    description: 'Go invisible for 5 seconds. Hostiles cannot target you.',
    apply(mgr) {
      mgr.buffs.cloak = 5;
      return 0;
    }
  },
  nova: {
    id: 'nova', name: 'Singularity Nova', level: 15, cooldown: 40, color: '#ffffff',
    description: 'Detonate a nova across the whole sector: 400 damage within 40 metres.',
    apply(mgr, ctx) {
      const hit = within(ctx, 40);
      hit.forEach(e => ctx.damageEnemy(e, 400));
      return hit.length;
    }
  },
  car: {
    id: 'car', name: 'Remote Car', purchaseOnly: true, cooldown: 30, color: '#ffb703',
    description: 'Drive a small car with W A S D for 15 seconds. It explodes on any pilot it reaches.',
    apply(mgr, ctx) {
      ctx.deployCar();
      return 0;
    }
  },
  blink: {
    id: 'blink', name: 'Blink', purchaseOnly: true, cooldown: 8, color: '#5cd6ff',
    description: 'Teleport up to 8 metres forward. Stops short of walls.',
    apply(mgr, ctx) {
      ctx.blink(8);
      return 0;
    }
  },
  turret: {
    id: 'turret', name: 'Turret', purchaseOnly: true, cooldown: 25, color: '#ff4d6d',
    description: 'Place a turret that fires at the nearest pilot in range for 10 seconds.',
    apply(mgr, ctx) {
      ctx.deployTurret();
      return 0;
    }
  },
  mine: {
    id: 'mine', name: 'Proximity Mine', purchaseOnly: true, cooldown: 12, color: '#ff9e00',
    description: 'Drop a mine. It explodes when a pilot steps close, hurting everyone nearby.',
    apply(mgr, ctx) {
      ctx.deployMine();
      return 0;
    }
  },
  decoy: {
    id: 'decoy', name: 'Decoy', purchaseOnly: true, cooldown: 30, color: '#4cc9f0',
    description: 'Leave a hologram of yourself behind and go cloaked for 8 seconds.',
    apply(mgr, ctx) {
      ctx.deployDecoy();
      mgr.buffs.cloak = 8;
      return 0;
    }
  }
};

// Abilities in shop order: level abilities by level, then the purchase-only ones
export const ABILITY_LIST = Object.values(ABILITIES).sort(
  (a, b) => (a.level ?? 999) - (b.level ?? 999)
);

function within(ctx, radius) {
  return ctx.enemies.filter(e =>
    e.pos && Math.hypot(e.pos.x - ctx.pos.x, e.pos.z - ctx.pos.z) <= radius
  );
}

export class AbilityManager {
  constructor() {
    this.slots = { E: null, Q: null };
    this.cooldowns = {};
    this.buffs = { overdrive: 0, cloak: 0 };
  }

  // Abilities the player may equip: level-unlocked ones plus anything bought
  unlockedFor(level, redeemedIds = []) {
    return ABILITY_LIST
      .filter(a => (a.level !== undefined && level >= a.level) || redeemedIds.includes(a.id))
      .map(a => a.id);
  }

  equip(slot, id, unlockedIds) {
    if (slot !== 'E' && slot !== 'Q') return false;
    if (id !== null && !unlockedIds.includes(id)) return false;
    // One ability can't sit in both slots
    if (id) for (const s of ['E', 'Q']) if (this.slots[s] === id) this.slots[s] = null;
    this.slots[slot] = id;
    return true;
  }

  update(dt) {
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    for (const k in this.buffs) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
  }

  cooldownLeft(slot) {
    const id = this.slots[slot];
    return id ? (this.cooldowns[id] || 0) : 0;
  }

  use(slot, ctx) {
    const id = this.slots[slot];
    if (!id) return { ok: false, reason: 'empty' };
    const left = this.cooldownLeft(slot);
    if (left > 0) return { ok: false, reason: 'cooldown', left };
    const def = ABILITIES[id];
    const hits = def.apply(this, ctx);
    this.cooldowns[id] = def.cooldown;
    return { ok: true, name: def.name, hits };
  }

  fireMultiplier() {
    return this.buffs.overdrive > 0 ? 2 : 1;
  }

  isCloaked() {
    return this.buffs.cloak > 0;
  }
}
