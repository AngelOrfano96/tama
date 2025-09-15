// mosse.js
export const MOVES = {
  basic_attack: {
    label: 'Attacco',
    cooldownMs: 300,
    params: { reachTiles: 1.1, coneDeg: 90, baseDamage: 20 },
    fx: {
      tile: 32,
      fps: 12,
      sizeMul: 1.10,
      offsetTiles: 0.35,
      // riga 2, colonne 6..9 (come mi avevi scritto)
      right: [ [6,2], [7,2], [8,2], [9,2] ],
      left: 'mirror:right'     // flip automatico della sequenza right
      // up/down assenti → fallback su right (ok)
    },
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
    // niente fx qui: continuiamo a usare lo shockwave “procedurale”
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

  ball: {
    label: 'Lancio Palla',
    icon: { c:12, r:5, w:1, h:1 },
    cooldownMs: 3500,
    fx: {
      tile: 32,
      fps: 14,
      sizeMul: 1.10,
      offsetTiles: 0.35,
      // esempio: 4 frame in riga 0, colonne 0..3 (cambiali coi tuoi reali)
      right: [ [11,9], [12,9], [13,9], [14,9] ],
      left: 'mirror:right',
    },
     run(api, self) {
      const t = api.tileSize();
      api.spawnProjectile?.({
        owner: 'pet',
        x: self.px + t/2,
        y: self.py + t/2,
        facing: self.facing,
        speed: 520,
        maxDistPx: 7 * t,
        radiusPx: t * 0.28,
        basePower: 50,
        pierce: true,
        // opzionale: vedi sezione 3 per sprite del proiettile
        // kind: 'ball'
      });
      return { damageDealt: 0 };
    }
  }
};
