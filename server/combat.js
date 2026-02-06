// Combat resolution logic

import { getTile, moveAgentToTile, inventoryCount, logEvent, AGENT_CLASSES, getNightDamageMultiplier } from './world.js';
import { areAllied } from './alliance.js';

const SAFE_ZONES = new Set(['spawn', 'market']);
const ATTACK_COOLDOWN = 2; // ticks
const ATTACK_SELF_COST = 5; // HP cost to attacker

function resolveCombat(world, attackerId, defenderId) {
  const attacker = world.agents[attackerId];
  const defender = world.agents[defenderId];

  if (!attacker || !defender) return { success: false, reason: 'Agent not found' };
  if (!attacker.alive || !defender.alive) return { success: false, reason: 'Agent is dead' };

  // Must be on same tile
  if (attacker.x !== defender.x || attacker.y !== defender.y) {
    return { success: false, reason: 'Target not on same tile' };
  }

  // Alliance check — no friendly fire
  if (areAllied(attackerId, defenderId)) {
    return { success: false, reason: 'Cannot attack an alliance member' };
  }

  // Safe zone check
  const tile = getTile(world, attacker.x, attacker.y);
  if (SAFE_ZONES.has(tile.type)) {
    return { success: false, reason: `No combat allowed in ${tile.type} zone` };
  }

  // Attack cooldown check
  const lastAttack = attacker.lastAttackTick || 0;
  if (world.tick - lastAttack < ATTACK_COOLDOWN) {
    const remaining = ATTACK_COOLDOWN - (world.tick - lastAttack);
    return { success: false, reason: `Attack on cooldown (${remaining} tick${remaining > 1 ? 's' : ''} remaining)` };
  }

  // Combat cost — attacker takes HP
  attacker.hp -= ATTACK_SELF_COST;
  attacker.lastAttackTick = world.tick;

  // Roll damage 10-30, apply class & night multipliers
  const baseDamage = 10 + Math.floor(Math.random() * 21);
  const classMultiplier = (AGENT_CLASSES[attacker.class]?.damageMultiplier) || 1;
  const nightMultiplier = getNightDamageMultiplier(world);
  const damage = Math.floor(baseDamage * classMultiplier * nightMultiplier);
  defender.hp -= damage;

  const result = {
    success: true,
    attacker: attackerId,
    defender: defenderId,
    damage,
    attackerHp: attacker.hp,
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

  // Check if attacker killed themselves from combat cost
  if (attacker.hp <= 0) {
    attacker.hp = 50;
    attacker.alive = true;
    const spawnX = 31 + Math.floor(Math.random() * 2);
    const spawnY = 31 + Math.floor(Math.random() * 2);
    moveAgentToTile(world, attacker.id, spawnX, spawnY);
  }

  // Check for defender death
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
  // Drop 100% of inventory, capped by killer's remaining capacity (max 20)
  const loot = {};
  const killerTotal = inventoryCount(killer);
  let killerSpace = 20 - killerTotal;

  for (const [resource, amount] of Object.entries(victim.inventory)) {
    if (amount <= 0) continue;
    const canTake = Math.min(amount, killerSpace);
    if (canTake > 0) {
      loot[resource] = canTake;
      killer.inventory[resource] = (killer.inventory[resource] || 0) + canTake;
      killerSpace -= canTake;
    }
    // Victim loses everything regardless
    victim.inventory[resource] = 0;
  }

  // Score penalty on death
  victim.score = Math.max(0, victim.score - 25);

  // Respawn victim at spawn zone with 50 HP
  victim.hp = 50;
  victim.alive = true;
  const spawnX = 31 + Math.floor(Math.random() * 2);
  const spawnY = 31 + Math.floor(Math.random() * 2);
  moveAgentToTile(world, victim.id, spawnX, spawnY);

  return loot;
}

export { resolveCombat };
