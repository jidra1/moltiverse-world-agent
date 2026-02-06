// Combat resolution logic

import { getTile, moveAgentToTile, logEvent } from './world.js';

function resolveCombat(world, attackerId, defenderId) {
  const attacker = world.agents[attackerId];
  const defender = world.agents[defenderId];

  if (!attacker || !defender) return { success: false, reason: 'Agent not found' };
  if (!attacker.alive || !defender.alive) return { success: false, reason: 'Agent is dead' };

  // Must be on same tile
  if (attacker.x !== defender.x || attacker.y !== defender.y) {
    return { success: false, reason: 'Target not on same tile' };
  }

  // Roll damage 10-30
  const damage = 10 + Math.floor(Math.random() * 21);
  defender.hp -= damage;

  const result = {
    success: true,
    attacker: attackerId,
    defender: defenderId,
    damage,
    defenderHp: defender.hp,
    killed: false,
    loot: null
  };

  logEvent(world, {
    type: 'combat',
    attacker: attackerId,
    defender: defenderId,
    damage,
    defenderHp: Math.max(0, defender.hp)
  });

  // Check for death
  if (defender.hp <= 0) {
    result.killed = true;
    result.loot = handleDeath(world, attacker, defender);
    attacker.kills++;
    attacker.score += 50;

    logEvent(world, {
      type: 'kill',
      killer: attackerId,
      victim: defenderId,
      loot: result.loot
    });
  }

  return result;
}

function handleDeath(world, killer, victim) {
  // Drop 50% of inventory
  const loot = {};
  for (const [resource, amount] of Object.entries(victim.inventory)) {
    const dropped = Math.floor(amount / 2);
    if (dropped > 0) {
      loot[resource] = dropped;
      killer.inventory[resource] = (killer.inventory[resource] || 0) + dropped;
      victim.inventory[resource] -= dropped;
    }
  }

  // Respawn victim at spawn zone with 50 HP
  victim.hp = 50;
  victim.alive = true;
  const spawnX = 15 + Math.floor(Math.random() * 2);
  const spawnY = 15 + Math.floor(Math.random() * 2);
  moveAgentToTile(world, victim.id, spawnX, spawnY);

  return loot;
}

export { resolveCombat };
