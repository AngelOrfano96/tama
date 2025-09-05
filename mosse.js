// Catalogo mosse – riusabile in tutto il gioco
export const MOVES = {
  basic_attack: {
    label: 'Attacco',
    cooldownMs: 300,
    params: { reachTiles: 1.1, coneDeg: 90, baseDamage: 20 },
    run(api, self) {
      const { reachTiles, coneDeg, baseDamage } = this.params;
      const targets = api.targetsInCone(self, reachTiles, coneDeg);
      let total = 0;
      for (const t of targets) {
        const dmg = api.computeDamage(baseDamage, api.getAtk(self), api.getDef(t));
        total += api.applyDamage(t, dmg);
      }
      return { damageDealt: total };
    }
  },

  repulse: {
    label: 'Repulsione',
    cooldownMs: 3500,
    params: { radiusTiles: 2.2, knockback: 600, basePower: 12 },
    run(api, self) {
      const { radiusTiles, knockback, basePower } = this.params;
      const targets = api.targetsInRadius(self, radiusTiles);
      let total = 0;
      for (const t of targets) {
        api.addVelocity(t, api.dirFromTo(self, t), knockback);
        const falloff = api.falloff(self, t, radiusTiles, 0.5, 1.0);
        const dmg = Math.max(1, Math.round(
          api.computeDamage(basePower, api.getAtk(self), api.getDef(t)) * falloff
        ));
        total += api.applyDamage(t, dmg);
      }
      api.playFX('shockwave', self);
      return { damageDealt: total };
    }
  },
  // …le altre mosse…
  ball: {
     label: 'Lancio Palla',           // opzionale ma utile
     icon: { c:12, r:5, w:1, h:1 },   // <- coordinate sull’atlas LL_fantasy_dungeons.png (16x16)
     cooldownMs: 3500,
    run(api, self) {
      const t = api.tileSize();
      const speedPx   = 520;         // velocità proiettile
      const rangeTiles= 7;           // distanza percorsa
      const radiusPx  = t * 0.28;    // “hitbox” della palla
      const basePower = 50;          // ~50 di potenza di mossa

      api.spawnProjectile?.({
        owner: 'pet',
        x: self.px + t/2,
        y: self.py + t/2,
        facing: self.facing,     // 'up' | 'down' | 'left' | 'right'
        speed: speedPx,
        maxDistPx: rangeTiles * t,
        radiusPx,
        basePower,
        pierce: true             // attraversa i nemici
      });

      // il danno è “differito” durante il volo
      return { damageDealt: 0 };
    }
  }
};
