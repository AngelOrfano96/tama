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
};
