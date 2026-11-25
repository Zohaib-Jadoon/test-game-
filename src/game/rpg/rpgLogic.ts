import {
  CRAFTING_RECIPES,
  DIALOGUES,
  ITEMS,
  QUESTS,
  RAVENHOLD_MERCHANT_STOCK,
  SKILL_NODES,
} from '../../content/eidrathContent';
import type {
  DialogueChoice,
  EquipSlot,
  FactionId,
  InventoryEntry,
  QuestDefinition,
  QuestObjective,
  QuestObjectiveType,
  SaveGame,
} from '../types';

export interface DerivedPlayerStats {
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  weaponDamage: number;
  armor: number;
  poise: number;
  critChance: number;
  meleeMultiplier: number;
  rangedMultiplier: number;
  spellMultiplier: number;
  heavyStaggerMultiplier: number;
  parryWindowMs: number;
  guardMitigationPct: number;
  stealthCritBonusPct: number;
  companionDamageMultiplier: number;
  divineGainMultiplier: number;
  craftBonusPct: number;
}

export function xpRequiredForLevel(level: number): number {
  return Math.round(120 + (Math.max(1, level) - 1) * 95);
}

export function computeDerivedStats(save: SaveGame): DerivedPlayerStats {
  let maxHp = 100 + (save.player.attributes.vitality - 10) * 8 + (save.player.level - 1) * 10;
  let maxStamina = 100 + (save.player.attributes.dexterity - 10) * 5;
  let maxMana = 80 + (save.player.attributes.intelligence - 10) * 6;
  let weaponDamage = 10;
  let armor = 0;
  let poise = 10;
  let critChance = 0.05 + (save.player.attributes.dexterity - 10) * 0.008;

  let meleePct = (save.player.attributes.strength - 10) * 2.5;
  let rangedPct = (save.player.attributes.dexterity - 10) * 2.5;
  let spellPct = (save.player.attributes.intelligence - 10) * 3.0;
  let heavyStaggerPct = 0;
  let parryWindowMs = 180;
  let guardMitigationPct = 0;
  let stealthCritBonusPct = 0;
  let companionDamagePct = 0;
  let divineGainPct = (save.player.attributes.divineCapacity - 10) * 3;
  let craftBonusPct = 0;

  // Equipment bonuses + forge upgrade scaling
  for (const slot of Object.keys(save.player.equipment) as EquipSlot[]) {
    const itemId = save.player.equipment[slot];
    if (!itemId) continue;
    const item = ITEMS[itemId];
    if (!item) continue;
    const invEntry = save.player.inventory.find((e) => e.itemId === itemId);
    const upgradeLvl = invEntry?.upgradeLevel ?? 0;
    const upgradeBonus = 1 + upgradeLvl * 0.16;

    if (item.stats.damage) {
      weaponDamage = Math.max(weaponDamage, Math.round(item.stats.damage * upgradeBonus));
    }
    if (item.stats.armor) armor += Math.round(item.stats.armor * upgradeBonus);
    if (item.stats.poise) poise += item.stats.poise;
    if (item.stats.critChance) critChance += item.stats.critChance;
    if (item.stats.hpBonus) maxHp += item.stats.hpBonus;
    if (item.stats.staminaBonus) maxStamina += item.stats.staminaBonus;
    if (item.stats.manaBonus) maxMana += item.stats.manaBonus;
  }

  // Skill tree nodes (pct fields in content are decimal fractions, e.g. 0.12 = 12%)
  for (const node of SKILL_NODES) {
    const rank = save.player.skills[node.id] ?? 0;
    if (rank <= 0) continue;
    const fx = node.effects;
    if (fx.maxHp) maxHp += fx.maxHp * rank;
    if (fx.maxStamina) maxStamina += fx.maxStamina * rank;
    if (fx.maxMana) maxMana += fx.maxMana * rank;
    if (fx.meleeDamagePct) meleePct += fx.meleeDamagePct * 100 * rank;
    if (fx.rangedDamagePct) rangedPct += fx.rangedDamagePct * 100 * rank;
    if (fx.spellDamagePct) spellPct += fx.spellDamagePct * 100 * rank;
    if (fx.heavyStaggerPct) heavyStaggerPct += fx.heavyStaggerPct * 100 * rank;
    if (fx.parryWindowMs) parryWindowMs += fx.parryWindowMs * rank;
    if (fx.guardMitigationPct) guardMitigationPct += fx.guardMitigationPct * 100 * rank;
    if (fx.stealthCritPct) stealthCritBonusPct += fx.stealthCritPct * 100 * rank;
    if (fx.companionDamagePct) companionDamagePct += fx.companionDamagePct * 100 * rank;
    if (fx.divineGainPct) divineGainPct += fx.divineGainPct * 100 * rank;
    if (fx.craftBonusPct) craftBonusPct += fx.craftBonusPct * 100 * rank;
  }

  // War domain bond passive bonus
  if (save.world.domains.war === 'slain' || save.world.domains.war === 'restored') {
    meleePct += 12;
  }

  return {
    maxHp: Math.round(maxHp),
    maxStamina: Math.round(maxStamina),
    maxMana: Math.round(maxMana),
    weaponDamage,
    armor,
    poise,
    critChance: Math.min(0.65, critChance),
    meleeMultiplier: 1 + meleePct / 100,
    rangedMultiplier: 1 + rangedPct / 100,
    spellMultiplier: 1 + spellPct / 100,
    heavyStaggerMultiplier: 1 + heavyStaggerPct / 100,
    parryWindowMs,
    guardMitigationPct,
    stealthCritBonusPct,
    companionDamageMultiplier: 1 + companionDamagePct / 100,
    divineGainMultiplier: 1 + divineGainPct / 100,
    craftBonusPct,
  };
}

export function syncPlayerCaps(save: SaveGame): DerivedPlayerStats {
  const stats = computeDerivedStats(save);
  save.player.maxHp = stats.maxHp;
  save.player.maxStamina = stats.maxStamina;
  save.player.maxMana = stats.maxMana;
  save.player.hp = Math.min(save.player.hp, stats.maxHp);
  save.player.stamina = Math.min(save.player.stamina, stats.maxStamina);
  save.player.mana = Math.min(save.player.mana, stats.maxMana);
  return stats;
}

export function getItemQuantity(save: SaveGame, itemId: string): number {
  return save.player.inventory
    .filter((e) => e.itemId === itemId)
    .reduce((sum, e) => sum + e.quantity, 0);
}

export function addInventoryItem(save: SaveGame, itemId: string, quantity = 1): boolean {
  const def = ITEMS[itemId];
  if (!def || quantity <= 0) return false;
  if (def.stackable) {
    const existing = save.player.inventory.find((e) => e.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
      return true;
    }
    save.player.inventory.push({ itemId, quantity });
    return true;
  }
  for (let i = 0; i < quantity; i++) {
    save.player.inventory.push({ itemId, quantity: 1, upgradeLevel: 0 });
  }
  return true;
}

export function removeInventoryItem(save: SaveGame, itemId: string, quantity = 1): boolean {
  if (quantity <= 0 || getItemQuantity(save, itemId) < quantity) return false;
  let remaining = quantity;
  const next: InventoryEntry[] = [];
  for (const entry of save.player.inventory) {
    if (entry.itemId !== itemId || remaining <= 0) {
      next.push(entry);
      continue;
    }
    if (entry.quantity > remaining) {
      next.push({ ...entry, quantity: entry.quantity - remaining });
      remaining = 0;
    } else {
      remaining -= entry.quantity;
    }
  }
  save.player.inventory = next;

  // Unequip if no copies remain
  if (getItemQuantity(save, itemId) === 0) {
    for (const slot of Object.keys(save.player.equipment) as EquipSlot[]) {
      if (save.player.equipment[slot] === itemId) {
        delete save.player.equipment[slot];
      }
    }
  }
  syncPlayerCaps(save);
  return true;
}

export function equipInventoryItem(save: SaveGame, itemId: string): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def || !def.slot) return { ok: false, message: 'Item cannot be equipped.' };
  if (getItemQuantity(save, itemId) <= 0) return { ok: false, message: 'Item not in inventory.' };
  if (save.player.level < def.levelReq) {
    return { ok: false, message: `Requires level ${def.levelReq}.` };
  }

  // Two-handed weapon rule: automatically unequip incompatible offhand shield
  if (def.slot === 'mainHand' && def.twoHanded && save.player.equipment.offHand) {
    delete save.player.equipment.offHand;
  }
  // Equipping a shield while wielding a two-handed mainHand unequips the two-hander
  if (def.slot === 'offHand' && save.player.equipment.mainHand) {
    const mainDef = ITEMS[save.player.equipment.mainHand];
    if (mainDef?.twoHanded) {
      delete save.player.equipment.mainHand;
    }
  }

  save.player.equipment[def.slot] = itemId;
  syncPlayerCaps(save);
  return { ok: true, message: `Equipped ${def.name}.` };
}

export function dropInventoryItem(save: SaveGame, itemId: string): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def) return { ok: false, message: 'Unknown item.' };
  if (def.questProtected) {
    return { ok: false, message: `${def.name} is quest-critical and cannot be discarded.` };
  }
  const removed = removeInventoryItem(save, itemId, 1);
  return removed
    ? { ok: true, message: `Discarded ${def.name}.` }
    : { ok: false, message: 'Item not found.' };
}

export function useConsumableItem(save: SaveGame, itemId: string): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def || def.type !== 'consumable') return { ok: false, message: 'Not a consumable item.' };
  if (getItemQuantity(save, itemId) <= 0) return { ok: false, message: `No ${def.name} remaining.` };

  if (def.stats.healHp) {
    save.player.hp = Math.min(save.player.maxHp, save.player.hp + def.stats.healHp);
  }
  if (def.stats.restoreMana) {
    save.player.mana = Math.min(save.player.maxMana, save.player.mana + def.stats.restoreMana);
  }
  removeInventoryItem(save, itemId, 1);
  return { ok: true, message: `Used ${def.name}.` };
}

export function unlockSkillNode(save: SaveGame, skillId: string): { ok: boolean; message: string } {
  const node = SKILL_NODES.find((s) => s.id === skillId);
  if (!node) return { ok: false, message: 'Unknown skill.' };
  const currentRank = save.player.skills[skillId] ?? 0;
  if (currentRank >= node.maxRank) return { ok: false, message: `${node.name} is already maxed.` };
  if (save.player.skillPoints < node.cost) {
    return { ok: false, message: `Need ${node.cost} skill point(s).` };
  }
  for (const pre of node.prerequisites) {
    if ((save.player.skills[pre] ?? 0) <= 0) {
      const preNode = SKILL_NODES.find((s) => s.id === pre);
      return { ok: false, message: `Requires ${preNode?.name ?? pre} first.` };
    }
  }

  save.player.skillPoints -= node.cost;
  save.player.skills[skillId] = currentRank + 1;
  if (skillId === 'div_domain' && !save.player.unlockedAbilities.includes('ability_oath_wave')) {
    save.player.unlockedAbilities.push('ability_oath_wave');
  }
  syncPlayerCaps(save);
  return { ok: true, message: `Unlocked ${node.name} (Rank ${currentRank + 1}).` };
}

export function resetAllSkills(save: SaveGame): { ok: boolean; refunded: number } {
  let refunded = 0;
  for (const node of SKILL_NODES) {
    const rank = save.player.skills[node.id] ?? 0;
    if (rank > 0) {
      refunded += rank * node.cost;
    }
  }
  save.player.skills = {};
  save.player.skillPoints += refunded;
  syncPlayerCaps(save);
  return { ok: true, refunded };
}

export function craftOrUpgradeRecipe(
  save: SaveGame,
  recipeId: string,
): { ok: boolean; message: string; questNotifications: string[] } {
  const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, message: 'Unknown recipe.', questNotifications: [] };
  if (recipe.requiresFlag && !save.world.flags[recipe.requiresFlag]) {
    return { ok: false, message: 'Requires blueprint or story milestone.', questNotifications: [] };
  }
  if (save.player.gold < recipe.goldCost) {
    return { ok: false, message: `Requires ${recipe.goldCost} gold.`, questNotifications: [] };
  }
  for (const ing of recipe.ingredients) {
    if (getItemQuantity(save, ing.itemId) < ing.quantity) {
      const item = ITEMS[ing.itemId];
      return {
        ok: false,
        message: `Missing ${item?.name ?? ing.itemId} (${getItemQuantity(save, ing.itemId)}/${ing.quantity}).`,
        questNotifications: [],
      };
    }
  }

  if (recipe.upgradeTargetItemId) {
    const targetEntry = save.player.inventory.find((e) => e.itemId === recipe.upgradeTargetItemId);
    if (!targetEntry) {
      const item = ITEMS[recipe.upgradeTargetItemId];
      return {
        ok: false,
        message: `You do not possess ${item?.name ?? recipe.upgradeTargetItemId}.`,
        questNotifications: [],
      };
    }
    const maxLvl = recipe.maxUpgradeLevel ?? 3;
    const curLvl = targetEntry.upgradeLevel ?? 0;
    if (curLvl >= maxLvl) {
      return { ok: false, message: `Already tempered to +${maxLvl}.`, questNotifications: [] };
    }
    // Atomic commit
    save.player.gold -= recipe.goldCost;
    for (const ing of recipe.ingredients) {
      removeInventoryItem(save, ing.itemId, ing.quantity);
    }
    targetEntry.upgradeLevel = curLvl + 1;
    syncPlayerCaps(save);
    const questNotifications = emitQuestEvent(save, 'craft', recipeId);
    return {
      ok: true,
      message: `${ITEMS[recipe.upgradeTargetItemId]?.name ?? 'Weapon'} tempered to +${targetEntry.upgradeLevel}.`,
      questNotifications,
    };
  }

  if (!recipe.outputItemId) {
    return { ok: false, message: 'Recipe has no output.', questNotifications: [] };
  }

  // Atomic commit for crafted item
  save.player.gold -= recipe.goldCost;
  for (const ing of recipe.ingredients) {
    removeInventoryItem(save, ing.itemId, ing.quantity);
  }
  addInventoryItem(save, recipe.outputItemId, recipe.outputQuantity ?? 1);
  syncPlayerCaps(save);
  const questNotifications = emitQuestEvent(save, 'craft', recipeId);
  return {
    ok: true,
    message: `Crafted ${ITEMS[recipe.outputItemId]?.name ?? recipe.outputItemId}.`,
    questNotifications,
  };
}

export function buyFromMerchant(save: SaveGame, itemId: string): { ok: boolean; message: string } {
  if (!RAVENHOLD_MERCHANT_STOCK.includes(itemId)) {
    return { ok: false, message: 'Item not sold by this merchant.' };
  }
  const def = ITEMS[itemId];
  if (!def) return { ok: false, message: 'Unknown item.' };
  if (save.player.gold < def.price) {
    return { ok: false, message: `Not enough gold (${save.player.gold}/${def.price}).` };
  }
  save.player.gold -= def.price;
  addInventoryItem(save, itemId, 1);
  return { ok: true, message: `Purchased ${def.name} for ${def.price} gold.` };
}

export function sellToMerchant(save: SaveGame, itemId: string): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def) return { ok: false, message: 'Unknown item.' };
  if (def.questProtected) {
    return { ok: false, message: `${def.name} cannot be sold.` };
  }
  if (getItemQuantity(save, itemId) <= 0) {
    return { ok: false, message: 'Item not in inventory.' };
  }
  const sellPrice = Math.max(1, Math.floor(def.price * 0.5));
  if (!removeInventoryItem(save, itemId, 1)) {
    return { ok: false, message: 'Unable to remove item.' };
  }
  save.player.gold += sellPrice;
  return { ok: true, message: `Sold ${def.name} for ${sellPrice} gold.` };
}

export function grantXp(save: SaveGame, amount: number): string[] {
  const notes: string[] = [];
  if (amount <= 0) return notes;
  save.player.xp += amount;
  while (save.player.xp >= xpRequiredForLevel(save.player.level)) {
    save.player.xp -= xpRequiredForLevel(save.player.level);
    save.player.level += 1;
    save.player.skillPoints += 1;
    syncPlayerCaps(save);
    save.player.hp = save.player.maxHp;
    save.player.stamina = save.player.maxStamina;
    save.player.mana = save.player.maxMana;
    notes.push(`Level ${save.player.level} reached (+1 Skill Point)`);
  }
  return notes;
}

export function startQuest(save: SaveGame, questId: string): boolean {
  const qDef = QUESTS.find((q) => q.id === questId);
  if (!qDef) return false;
  if (save.quests[questId]) return false;
  for (const pre of qDef.prerequisites) {
    if (save.quests[pre]?.status !== 'completed') return false;
  }
  save.quests[questId] = {
    status: 'active',
    counts: {},
    rewardClaimed: false,
  };
  if (!save.trackedQuestId || save.quests[save.trackedQuestId]?.status !== 'active') {
    save.trackedQuestId = questId;
  }
  return true;
}

function isObjectiveMet(qDef: QuestDefinition, counts: Record<string, number>, obj: QuestObjective): boolean {
  return (counts[obj.id] ?? 0) >= obj.requiredCount;
}

export function emitQuestEvent(
  save: SaveGame,
  eventType: QuestObjectiveType,
  targetId: string,
  delta = 1,
): string[] {
  const notifications: string[] = [];

  for (const qDef of QUESTS) {
    const qState = save.quests[qDef.id];
    if (!qState || qState.status !== 'active') continue;

    let progressed = false;
    for (let idx = 0; idx < qDef.objectives.length; idx++) {
      const obj = qDef.objectives[idx];
      // Enforce sequential dependency on 'return' objectives so returning early doesn't complete them
      if (obj.type === 'return') {
        const priorDone = qDef.objectives
          .slice(0, idx)
          .every((prior) => prior.optional || isObjectiveMet(qDef, qState.counts, prior));
        if (!priorDone) continue;
      }

      const matchesType =
        obj.type === eventType || (obj.type === 'return' && eventType === 'talk');
      if (matchesType && obj.targetId === targetId) {
        const prev = qState.counts[obj.id] ?? 0;
        if (prev < obj.requiredCount) {
          qState.counts[obj.id] = Math.min(obj.requiredCount, prev + delta);
          progressed = true;
        }
      }
    }

    if (!progressed) continue;

    const allRequiredDone = qDef.objectives.every(
      (obj) => obj.optional || isObjectiveMet(qDef, qState.counts, obj),
    );

    if (allRequiredDone && !qState.rewardClaimed) {
      qState.status = 'completed';
      qState.rewardClaimed = true;
      save.player.gold += qDef.rewards.gold;
      if (qDef.rewards.items) {
        for (const rewardItem of qDef.rewards.items) {
          addInventoryItem(save, rewardItem.itemId, rewardItem.quantity);
        }
      }
      if (qDef.rewards.worldFlag) {
        save.world.flags[qDef.rewards.worldFlag] = true;
      }
      if (qDef.rewards.divineDomain) {
        save.world.domains[qDef.rewards.divineDomain] = 'slain';
        if (!save.player.unlockedAbilities.includes('ability_oath_wave')) {
          save.player.unlockedAbilities.push('ability_oath_wave');
        }
      }
      if (qDef.rewards.factionRep) {
        for (const [fid, rep] of Object.entries(qDef.rewards.factionRep) as Array<[FactionId, number]>) {
          save.world.factions[fid] = (save.world.factions[fid] ?? 0) + rep;
        }
      }
      const levelNotes = grantXp(save, qDef.rewards.xp);
      notifications.push(`Quest Completed: ${qDef.title} (+${qDef.rewards.xp} XP, +${qDef.rewards.gold} Gold)`);
      notifications.push(...levelNotes);

      // Unlock follow-up quests whose prerequisites are now satisfied
      for (const nextQ of QUESTS) {
        if (nextQ.prerequisites.includes(qDef.id) && startQuest(save, nextQ.id)) {
          notifications.push(`New Quest: ${nextQ.title}`);
        }
      }
      // Update tracked quest if needed
      if (save.trackedQuestId === qDef.id) {
        const nextActive = QUESTS.find((q) => save.quests[q.id]?.status === 'active');
        save.trackedQuestId = nextActive?.id ?? null;
      }
    }
  }

  return notifications;
}

export function getTrackedQuestObjective(save: SaveGame): {
  quest: QuestDefinition | null;
  objective: QuestObjective | null;
} {
  const activeId =
    save.trackedQuestId && save.quests[save.trackedQuestId]?.status === 'active'
      ? save.trackedQuestId
      : QUESTS.find((q) => save.quests[q.id]?.status === 'active')?.id ?? null;
  if (!activeId) return { quest: null, objective: null };
  const quest = QUESTS.find((q) => q.id === activeId) ?? null;
  if (!quest) return { quest: null, objective: null };
  const qState = save.quests[activeId];
  const objective =
    quest.objectives.find((obj) => (qState.counts[obj.id] ?? 0) < obj.requiredCount) ?? null;
  return { quest, objective };
}

export function applyDialogueChoice(
  save: SaveGame,
  nodeId: string,
  choiceId: string,
): {
  choice: DialogueChoice | null;
  nextNodeId: string | null;
  openUi: 'crafting' | 'merchant' | null;
  notifications: string[];
} {
  const node = DIALOGUES[nodeId];
  if (!node) return { choice: null, nextNodeId: null, openUi: null, notifications: [] };
  const choice = node.choices.find((c) => c.id === choiceId) ?? null;
  if (!choice) return { choice: null, nextNodeId: null, openUi: null, notifications: [] };

  const notifications: string[] = [];
  const fx = choice.effects;
  if (fx) {
    if (fx.setFlag) {
      save.world.flags[fx.setFlag] = true;
      if (fx.setFlag === 'lyra_joined') {
        save.companion.activeId = 'lyra';
        notifications.push('Lyra joined as your companion.');
      }
    }
    if (fx.lyraLoyalty) {
      save.companion.loyalty = Math.max(0, Math.min(100, save.companion.loyalty + fx.lyraLoyalty));
      notifications.push(
        fx.lyraLoyalty > 0 ? `Lyra's trust increased (+${fx.lyraLoyalty}).` : `Lyra disapproved (${fx.lyraLoyalty}).`,
      );
    }
    if (fx.corruption) {
      save.world.corruption = Math.max(0, Math.min(100, save.world.corruption + fx.corruption));
    }
    if (fx.factionRep) {
      for (const [fid, rep] of Object.entries(fx.factionRep) as Array<[FactionId, number]>) {
        save.world.factions[fid] = (save.world.factions[fid] ?? 0) + rep;
      }
    }
    if (fx.grantItem) {
      addInventoryItem(save, fx.grantItem.itemId, fx.grantItem.quantity);
      const item = ITEMS[fx.grantItem.itemId];
      if (item) notifications.push(`Received ${item.name}.`);
    }
    if (fx.startQuestId && startQuest(save, fx.startQuestId)) {
      const q = QUESTS.find((entry) => entry.id === fx.startQuestId);
      if (q) notifications.push(`Quest Started: ${q.title}`);
    }
    if (fx.triggerEvent) {
      notifications.push(...emitQuestEvent(save, fx.triggerEvent.type, fx.triggerEvent.targetId));
    }
  }

  return {
    choice,
    nextNodeId: choice.nextNodeId,
    openUi: fx?.openUi ?? null,
    notifications,
  };
}
