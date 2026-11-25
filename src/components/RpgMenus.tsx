import React, { useState } from 'react';
import {
  CRAFTING_RECIPES,
  FROSTHEIM_LANDMARKS,
  FROSTHEIM_WORLD_SIZE,
  ITEMS,
  LORE_ENTRIES,
  QUESTS,
  RAVENHOLD_MERCHANT_STOCK,
  SKILL_NODES,
  SKILL_TREE_LABELS,
} from '../content/eidrathContent';
import { computeDerivedStats, getItemQuantity } from '../game/rpg/rpgLogic';
import { SAVE_SLOTS, type SaveSlotId } from '../game/save/saveSystem';
import type {
  DifficultyId,
  EquipSlot,
  FactionId,
  GameSettings,
  ItemRarity,
  KeyBindings,
  QualityPreset,
  SaveGame,
  SkillTreeId,
} from '../game/types';

export type RpgMenuTab =
  | 'inventory'
  | 'skills'
  | 'map'
  | 'journal'
  | 'crafting'
  | 'merchant'
  | 'settings';

interface RpgMenusProps {
  activeTab: RpgMenuTab;
  inGame: boolean;
  save: SaveGame;
  allSaves: Array<{ slotId: SaveSlotId; save: SaveGame | null }>;
  settings: GameSettings;
  onChangeTab: (tab: RpgMenuTab) => void;
  onClose: () => void;
  onEquipItem: (itemId: string) => { ok: boolean; message: string };
  onUseItem: (itemId: string) => { ok: boolean; message: string };
  onDropItem: (itemId: string) => { ok: boolean; message: string };
  onUnlockSkill: (skillId: string) => { ok: boolean; message: string };
  onResetSkills: () => { ok: boolean; refunded: number };
  onCraftRecipe: (recipeId: string) => { ok: boolean; message: string };
  onBuyItem: (itemId: string) => { ok: boolean; message: string };
  onSellItem: (itemId: string) => { ok: boolean; message: string };
  onTrackQuest: (questId: string) => void;
  onFastTravel: (landmarkId: string) => { ok: boolean; message: string };
  onManualSave: (slotId: SaveSlotId) => { ok: boolean; message: string };
  onLoadSlot: (save: SaveGame) => void;
  onUpdateSettings: (settings: GameSettings) => void;
  onOpenDevBlender: () => void;
}

const RARITY_BADGE: Record<ItemRarity, string> = {
  common: 'text-[#D9D1BE]/80 border-[#68717A]/60',
  uncommon: 'text-[#8EC49E] border-[#8EC49E]/60',
  rare: 'text-[#6D9CB6] border-[#6D9CB6]/70',
  epic: 'text-[#B88CE0] border-[#B88CE0]/70',
  legendary: 'text-[#D9A758] border-[#9C7848]',
  mythical: 'text-[#E07A5F] border-[#E07A5F]',
  divine: 'text-[#F2EAD3] border-[#D9D1BE]',
};

const FACTION_NAMES: Record<FactionId, string> = {
  iron_covenant: 'Iron Covenant',
  arcane_circle: 'Arcane Circle',
  silent_hand: 'Silent Hand',
  silver_order: 'Silver Order',
  crown_legion: 'Crown Legion',
  free_kingdoms: 'Free Kingdoms',
  ashen_cult: 'Ashen Cult',
  eternal_forge: 'Eternal Forge',
};

const BINDING_LABELS: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: 'forward', label: 'Move Forward' },
  { key: 'backward', label: 'Move Backward' },
  { key: 'left', label: 'Strafe Left' },
  { key: 'right', label: 'Strafe Right' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'dodge', label: 'Dodge Roll' },
  { key: 'jump', label: 'Jump' },
  { key: 'interact', label: 'Interact' },
  { key: 'block', label: 'Block / Parry' },
  { key: 'ascension', label: 'Divine Ascension' },
  { key: 'sneak', label: 'Stealth Toggle' },
  { key: 'lockOn', label: 'Target Lock-On' },
];

export const RpgMenus: React.FC<RpgMenusProps> = ({
  activeTab,
  inGame,
  save,
  allSaves,
  settings,
  onChangeTab,
  onClose,
  onEquipItem,
  onUseItem,
  onDropItem,
  onUnlockSkill,
  onResetSkills,
  onCraftRecipe,
  onBuyItem,
  onSellItem,
  onTrackQuest,
  onFastTravel,
  onManualSave,
  onLoadSlot,
  onUpdateSettings,
  onOpenDevBlender,
}) => {
  const [feedback, setFeedback] = useState<string>('');
  const [invFilter, setInvFilter] = useState<'all' | 'weapon' | 'armor' | 'consumable' | 'material' | 'quest'>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    save.player.equipment.mainHand ?? save.player.inventory[0]?.itemId ?? null,
  );
  const [selectedTree, setSelectedTree] = useState<SkillTreeId>('warrior');
  const [journalSub, setJournalSub] = useState<'quests' | 'lore' | 'world'>('quests');
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [listeningBind, setListeningBind] = useState<keyof KeyBindings | null>(null);

  const stats = computeDerivedStats(save);
  const allTabs: Array<{ id: RpgMenuTab; label: string; hideOnTitle?: boolean }> = [
    { id: 'inventory', label: 'Inventory', hideOnTitle: true },
    { id: 'skills', label: `Skills (${save.player.skillPoints})`, hideOnTitle: true },
    { id: 'map', label: 'World Map', hideOnTitle: true },
    { id: 'journal', label: 'Journal & Lore', hideOnTitle: true },
    { id: 'crafting', label: 'Forge', hideOnTitle: true },
    { id: 'merchant', label: 'Merchant', hideOnTitle: true },
    { id: 'settings', label: 'Save & Settings' },
  ];
  const tabs = allTabs.filter((t) => inGame || !t.hideOnTitle);

  const runAction = (res: { ok: boolean; message: string }) => {
    setFeedback(res.message);
  };

  const filteredInv = save.player.inventory.filter((entry) => {
    const def = ITEMS[entry.itemId];
    if (!def) return false;
    if (invFilter === 'all') return true;
    if (invFilter === 'weapon') return def.type === 'weapon' || def.type === 'shield';
    return def.type === invFilter;
  });

  const selectedItem = selectedItemId ? ITEMS[selectedItemId] ?? null : null;
  const equippedInSelectedSlot =
    selectedItem?.slot && save.player.equipment[selectedItem.slot]
      ? ITEMS[save.player.equipment[selectedItem.slot]!] ?? null
      : null;

  const handleBindKeyCapture = (e: React.KeyboardEvent) => {
    if (!listeningBind) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      setListeningBind(null);
      return;
    }
    onUpdateSettings({
      ...settings,
      bindings: { ...settings.bindings, [listeningBind]: e.code },
    });
    setFeedback(`Rebound ${listeningBind} to ${e.code}.`);
    setListeningBind(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#101417]/88 flex items-center justify-center p-3 sm:p-6"
      onKeyDown={listeningBind ? handleBindKeyCapture : undefined}
      tabIndex={-1}
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col border border-[#9C7848]/80 bg-[#1B2024] text-[#D9D1BE] shadow-2xl">
        {/* Top Tab Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#68717A]/35 px-4 py-3 bg-[#161A1E]">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onChangeTab(tab.id);
                  setFeedback('');
                }}
                className={`px-3 py-1.5 text-xs uppercase tracking-[0.14em] border transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#9C7848] bg-[#282F35] text-[#D9D1BE] font-semibold'
                    : 'border-transparent text-[#D9D1BE]/70 hover:border-[#68717A]/60 hover:text-[#D9D1BE]'
                }`}
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {inGame && (
              <span className="text-xs font-mono text-[#9C7848]">
                Lv.{save.player.level} · {save.player.gold} Gold
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 border border-[#68717A] hover:border-[#9C7848] text-xs uppercase tracking-widest"
            >
              [Esc] Close
            </button>
          </div>
        </div>

        {feedback && (
          <div className="px-4 py-1.5 bg-[#242B31] border-b border-[#9C7848]/40 text-xs text-[#6D9CB6]">
            {feedback}
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* INVENTORY & EQUIPMENT */}
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Equipped Gear & Derived Stats */}
              <div className="lg:col-span-4 space-y-3">
                <div className="border border-[#68717A]/40 bg-[#22272B] p-3.5 space-y-2">
                  <h3
                    className="text-sm uppercase tracking-[0.15em] text-[#9C7848]"
                    style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                  >
                    Kaelen — Equipped
                  </h3>
                  {(['mainHand', 'offHand', 'chest', 'cloak', 'amulet'] as EquipSlot[]).map((slot) => {
                    const id = save.player.equipment[slot];
                    const def = id ? ITEMS[id] : null;
                    const entry = id ? save.player.inventory.find((e) => e.itemId === id) : null;
                    return (
                      <div key={slot} className="flex items-center justify-between text-xs border-b border-[#68717A]/20 pb-1">
                        <span className="uppercase text-[10px] text-[#68717A]">{slot}</span>
                        <span className="text-[#D9D1BE]">
                          {def ? `${def.name}${entry?.upgradeLevel ? ` +${entry.upgradeLevel}` : ''}` : '— Empty —'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border border-[#68717A]/40 bg-[#22272B] p-3.5 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#9C7848]">Weapon Power</span>
                    <span>{stats.weaponDamage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9C7848]">Armor Rating</span>
                    <span>{stats.armor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9C7848]">Poise</span>
                    <span>{stats.poise}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9C7848]">Crit Chance</span>
                    <span>{Math.round(stats.critChance * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9C7848]">Parry Window</span>
                    <span>{stats.parryWindowMs} ms</span>
                  </div>
                </div>
              </div>

              {/* Center: Filterable Satchel */}
              <div className="lg:col-span-4 space-y-2.5">
                <div className="flex flex-wrap gap-1">
                  {(['all', 'weapon', 'armor', 'consumable', 'material', 'quest'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInvFilter(f)}
                      className={`px-2 py-1 text-[10px] uppercase border ${
                        invFilter === f ? 'border-[#9C7848] bg-[#2a3137]' : 'border-[#68717A]/40 text-[#D9D1BE]/70'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {filteredInv.map((entry, idx) => {
                    const def = ITEMS[entry.itemId];
                    if (!def) return null;
                    const isEquipped = Object.values(save.player.equipment).includes(entry.itemId);
                    return (
                      <button
                        key={`${entry.itemId}_${idx}`}
                        type="button"
                        onClick={() => setSelectedItemId(entry.itemId)}
                        className={`w-full text-left p-2.5 border transition-colors flex items-center justify-between ${
                          selectedItemId === entry.itemId
                            ? 'border-[#9C7848] bg-[#293036]'
                            : 'border-[#68717A]/35 bg-[#22272B]/80 hover:border-[#9C7848]/60'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-[#D9D1BE]">
                            {def.name}
                            {entry.upgradeLevel ? ` +${entry.upgradeLevel}` : ''}
                            {entry.quantity > 1 ? ` ×${entry.quantity}` : ''}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-[#68717A]">
                            {def.rarity} · {def.type}
                            {def.twoHanded ? ' · 2H' : ''}
                          </div>
                        </div>
                        {isEquipped && (
                          <span className="text-[10px] px-1.5 py-0.5 border border-[#6D9CB6] text-[#6D9CB6] uppercase">
                            Equipped
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Item Details & Stat Comparison */}
              <div className="lg:col-span-4 border border-[#68717A]/45 bg-[#22272B] p-4 flex flex-col justify-between gap-4">
                {selectedItem ? (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          className="text-base uppercase tracking-wider text-[#D9D1BE]"
                          style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                        >
                          {selectedItem.name}
                        </h4>
                        <span className={`text-[10px] uppercase px-2 py-0.5 border ${RARITY_BADGE[selectedItem.rarity]}`}>
                          {selectedItem.rarity}
                        </span>
                      </div>
                      <p className="text-xs text-[#D9D1BE]/75 italic leading-relaxed">{selectedItem.lore}</p>

                      <div className="border-t border-[#68717A]/30 pt-2 space-y-1 text-xs font-mono">
                        {selectedItem.stats.damage && (
                          <div className="flex justify-between">
                            <span>Damage</span>
                            <span>
                              {selectedItem.stats.damage}
                              {equippedInSelectedSlot?.stats.damage && equippedInSelectedSlot.id !== selectedItem.id && (
                                <span
                                  className={
                                    selectedItem.stats.damage >= equippedInSelectedSlot.stats.damage
                                      ? 'text-[#8EC49E] ml-1'
                                      : 'text-[#D47A74] ml-1'
                                  }
                                >
                                  ({selectedItem.stats.damage - equippedInSelectedSlot.stats.damage >= 0 ? '+' : ''}
                                  {selectedItem.stats.damage - equippedInSelectedSlot.stats.damage})
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {selectedItem.stats.armor && (
                          <div className="flex justify-between">
                            <span>Armor</span>
                            <span>{selectedItem.stats.armor}</span>
                          </div>
                        )}
                        {selectedItem.stats.healHp && (
                          <div className="flex justify-between">
                            <span>Restores HP</span>
                            <span>+{selectedItem.stats.healHp}</span>
                          </div>
                        )}
                        {selectedItem.stats.restoreMana && (
                          <div className="flex justify-between">
                            <span>Restores Mana</span>
                            <span>+{selectedItem.stats.restoreMana}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#9C7848]">
                          <span>Value / Weight</span>
                          <span>
                            {selectedItem.price}g / {selectedItem.weight}kg
                          </span>
                        </div>
                      </div>
                      {selectedItem.twoHanded && (
                        <p className="text-[11px] text-[#9C7848]">
                          Two-handed weapon: equipping automatically unequips an offhand shield.
                        </p>
                      )}
                      {selectedItem.questProtected && (
                        <p className="text-[11px] text-[#6D9CB6]">Quest-protected artifact (cannot be discarded or sold).</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedItem.slot && (
                        <button
                          type="button"
                          onClick={() => runAction(onEquipItem(selectedItem.id))}
                          className="flex-1 py-2 border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 text-xs uppercase tracking-widest"
                        >
                          Equip
                        </button>
                      )}
                      {selectedItem.type === 'consumable' && (
                        <button
                          type="button"
                          onClick={() => runAction(onUseItem(selectedItem.id))}
                          className="flex-1 py-2 border border-[#6D9CB6] bg-[#6D9CB6]/20 hover:bg-[#6D9CB6]/35 text-xs uppercase tracking-widest"
                        >
                          Use
                        </button>
                      )}
                      {!selectedItem.questProtected && (
                        <button
                          type="button"
                          onClick={() => runAction(onDropItem(selectedItem.id))}
                          className="px-3 py-2 border border-[#7D3834]/75 hover:bg-[#7D3834]/30 text-xs uppercase"
                        >
                          Drop
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[#68717A]">Select an item to inspect its lore and statistics.</p>
                )}
              </div>
            </div>
          )}

          {/* SEVEN SKILL TREES */}
          {activeTab === 'skills' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SKILL_TREE_LABELS) as SkillTreeId[]).map((tid) => (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setSelectedTree(tid)}
                      className={`px-3 py-1.5 text-xs uppercase tracking-wider border ${
                        selectedTree === tid
                          ? 'border-[#9C7848] bg-[#2a3137] text-[#D9D1BE]'
                          : 'border-[#68717A]/40 text-[#D9D1BE]/70 hover:border-[#9C7848]/60'
                      }`}
                    >
                      {SKILL_TREE_LABELS[tid].name}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#9C7848]">
                    Available Skill Points: {save.player.skillPoints}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const r = onResetSkills();
                      setFeedback(`Refunded ${r.refunded} skill point(s).`);
                    }}
                    className="px-2.5 py-1 text-[11px] uppercase border border-[#7D3834]/70 hover:bg-[#7D3834]/25"
                  >
                    Reset Trees
                  </button>
                </div>
              </div>

              <p className="text-xs text-[#9C7848]">{SKILL_TREE_LABELS[selectedTree].focus}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SKILL_NODES.filter((s) => s.tree === selectedTree).map((node) => {
                  const rank = save.player.skills[node.id] ?? 0;
                  const prereqsMet = node.prerequisites.every((p) => (save.player.skills[p] ?? 0) > 0);
                  const maxed = rank >= node.maxRank;
                  return (
                    <div
                      key={node.id}
                      className={`border p-4 flex flex-col justify-between gap-3 ${
                        rank > 0 ? 'border-[#9C7848] bg-[#262D33]' : 'border-[#68717A]/45 bg-[#22272B]'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4
                            className="text-sm uppercase tracking-wider text-[#D9D1BE]"
                            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                          >
                            {node.name}
                          </h4>
                          <span className="text-xs font-mono text-[#6D9CB6]">
                            Rank {rank}/{node.maxRank}
                          </span>
                        </div>
                        <p className="text-xs text-[#D9D1BE]/80 leading-relaxed">{node.description}</p>
                        {node.prerequisites.length > 0 && (
                          <p className="text-[11px] text-[#9C7848]">
                            Requires:{' '}
                            {node.prerequisites
                              .map((pid) => SKILL_NODES.find((x) => x.id === pid)?.name ?? pid)
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={maxed || !prereqsMet || save.player.skillPoints < node.cost}
                        onClick={() => runAction(onUnlockSkill(node.id))}
                        className="w-full py-2 text-xs uppercase tracking-widest border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {maxed ? 'Mastered' : `Unlock (${node.cost} pt)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FROSTHEIM WORLD MAP & FAST TRAVEL */}
          {activeTab === 'map' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 border border-[#68717A]/50 bg-[#171E24] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="uppercase tracking-widest text-[#9C7848]">Frostheim Atlas (500m × 500m)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                      className="px-2 py-0.5 border border-[#68717A]/50"
                    >
                      −
                    </button>
                    <span className="font-mono text-[11px]">{Math.round(mapZoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => Math.min(2, Number((z + 0.25).toFixed(2))))}
                      className="px-2 py-0.5 border border-[#68717A]/50"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="relative w-full aspect-square max-h-[430px] overflow-hidden border border-[#9C7848]/40 bg-[#1F2A33]">
                  <svg
                    viewBox="-250 -250 500 500"
                    className="w-full h-full"
                    style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center center' }}
                  >
                    {/* Snow relief contours & Frozen Lake */}
                    <circle cx={0} cy={0} r={224} fill="#2A3640" stroke="#4D5C68" strokeWidth={3} strokeDasharray="6 6" />
                    <circle cx={96} cy={-58} r={28} fill="#4E7287" opacity={0.75} />

                    {/* Winding Frostheim Roads */}
                    <polyline
                      points="-145,145 -72,92 -10,36 6,-116 6,-146"
                      fill="none"
                      stroke="#7D7265"
                      strokeWidth={4}
                      strokeDasharray="6 4"
                    />
                    <polyline points="-10,36 -96,-12" fill="none" stroke="#7D7265" strokeWidth={3} />
                    <polyline points="-10,36 84,18 112,-74" fill="none" stroke="#7D7265" strokeWidth={3} />

                    {/* Landmarks (Fog-of-War revealed upon discovery) */}
                    {FROSTHEIM_LANDMARKS.map((lm) => {
                      const discovered = save.world.discoveredLandmarks.includes(lm.id);
                      return (
                        <g key={lm.id} transform={`translate(${lm.x}, ${lm.z})`}>
                          <circle
                            r={discovered ? 9 : 6}
                            fill={discovered ? (lm.kind === 'keep' ? '#7D3834' : '#9C7848') : '#3B444D'}
                            stroke="#D9D1BE"
                            strokeWidth={discovered ? 2 : 1}
                            opacity={discovered ? 1 : 0.45}
                          />
                          <text
                            y={18}
                            textAnchor="middle"
                            fontSize={11}
                            fill={discovered ? '#D9D1BE' : '#68717A'}
                          >
                            {discovered ? lm.name : 'Undiscovered'}
                          </text>
                        </g>
                      );
                    })}

                    {/* Player Position Marker */}
                    <g transform={`translate(${save.player.x}, ${save.player.z})`}>
                      <circle r={7} fill="#6D9CB6" stroke="#FFFFFF" strokeWidth={2} />
                    </g>
                  </svg>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-2">
                <h4
                  className="text-sm uppercase tracking-[0.16em] text-[#9C7848]"
                  style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                >
                  Discovered Waypoints ({save.world.discoveredLandmarks.length}/{FROSTHEIM_LANDMARKS.length})
                </h4>
                <div className="space-y-2 max-h-[410px] overflow-y-auto pr-1">
                  {FROSTHEIM_LANDMARKS.map((lm) => {
                    const discovered = save.world.discoveredLandmarks.includes(lm.id);
                    return (
                      <div key={lm.id} className="border border-[#68717A]/40 bg-[#22272B] p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-[#D9D1BE]">
                            {discovered ? lm.name : '??? (Unexplored)'}
                          </div>
                          <div className="text-[11px] text-[#68717A]">
                            {discovered ? lm.subtitle : `Region: Frostheim (${Math.round(FROSTHEIM_WORLD_SIZE / 2)}m radius)`}
                          </div>
                        </div>
                        {discovered && lm.fastTravel && (
                          <button
                            type="button"
                            onClick={() => runAction(onFastTravel(lm.id))}
                            className="px-2.5 py-1 text-[10px] uppercase border border-[#6D9CB6] text-[#6D9CB6] hover:bg-[#6D9CB6]/20 shrink-0"
                          >
                            Travel
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* QUEST JOURNAL, LORE CODEX & WORLD CONSEQUENCE */}
          {activeTab === 'journal' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['quests', 'lore', 'world'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setJournalSub(s)}
                    className={`px-3 py-1 text-xs uppercase border ${
                      journalSub === s ? 'border-[#9C7848] bg-[#293036]' : 'border-[#68717A]/40 text-[#D9D1BE]/70'
                    }`}
                  >
                    {s === 'quests' ? 'Quests' : s === 'lore' ? 'Lore Codex' : 'Domains & Factions'}
                  </button>
                ))}
              </div>

              {journalSub === 'quests' && (
                <div className="space-y-3">
                  {QUESTS.map((q) => {
                    const st = save.quests[q.id];
                    if (!st) return null;
                    const tracked = save.trackedQuestId === q.id;
                    return (
                      <div key={q.id} className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase tracking-widest text-[#9C7848] mr-2">
                              {q.category} · {st.status}
                            </span>
                            <h4
                              className="text-base text-[#D9D1BE] inline"
                              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                            >
                              {q.title}
                            </h4>
                          </div>
                          {st.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => onTrackQuest(q.id)}
                              className={`px-2.5 py-1 text-[10px] uppercase border ${
                                tracked ? 'border-[#6D9CB6] text-[#6D9CB6]' : 'border-[#68717A]/60 text-[#D9D1BE]/75'
                              }`}
                            >
                              {tracked ? 'Tracked' : 'Track'}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[#D9D1BE]/80">{q.summary}</p>
                        <ul className="space-y-1 text-xs pt-1">
                          {q.objectives.map((obj) => {
                            const count = st.counts[obj.id] ?? 0;
                            const done = count >= obj.requiredCount;
                            return (
                              <li key={obj.id} className={done ? 'text-[#8EC49E] line-through' : 'text-[#D9D1BE]'}>
                                {done ? '✓ ' : '◇ '}
                                {obj.description} ({Math.min(count, obj.requiredCount)}/{obj.requiredCount})
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {journalSub === 'lore' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {LORE_ENTRIES.filter((l) => save.world.unlockedLore.includes(l.id)).map((entry) => (
                    <div key={entry.id} className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-widest text-[#9C7848]">{entry.category}</div>
                      <h4 className="text-sm font-semibold text-[#D9D1BE]" style={{ fontFamily: "'Cinzel', Georgia, serif" }}>
                        {entry.title}
                      </h4>
                      <p className="text-xs text-[#D9D1BE]/80 leading-relaxed">{entry.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {journalSub === 'world' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-2">
                    <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Seven Divine Domains</h4>
                    {Object.entries(save.world.domains).map(([domain, state]) => (
                      <div key={domain} className="flex justify-between text-xs border-b border-[#68717A]/20 pb-1">
                        <span className="uppercase">{domain}</span>
                        <span className={state === 'bound' ? 'text-[#68717A]' : 'text-[#6D9CB6] font-semibold'}>
                          {state.toUpperCase()}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 text-xs text-[#D9D1BE]/75 flex justify-between">
                      <span>Lyra Loyalty: {save.companion.loyalty}/100</span>
                      <span>Corruption: {save.world.corruption}/100</span>
                    </div>
                  </div>

                  <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-2">
                    <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Faction Standing</h4>
                    {(Object.keys(FACTION_NAMES) as FactionId[]).map((fid) => (
                      <div key={fid} className="flex justify-between text-xs border-b border-[#68717A]/20 pb-1">
                        <span>{FACTION_NAMES[fid]}</span>
                        <span className="font-mono text-[#D9D1BE]">{save.world.factions[fid] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BORIN'S FORGE — CRAFTING & UPGRADES */}
          {activeTab === 'crafting' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CRAFTING_RECIPES.map((rcp) => {
                const locked = Boolean(rcp.requiresFlag && !save.world.flags[rcp.requiresFlag]);
                const enoughGold = save.player.gold >= rcp.goldCost;
                const enoughIngs = rcp.ingredients.every((ing) => getItemQuantity(save, ing.itemId) >= ing.quantity);
                const hasUpgradeBase = !rcp.upgradeTargetItemId || getItemQuantity(save, rcp.upgradeTargetItemId) > 0;
                const canCraft = !locked && enoughGold && enoughIngs && hasUpgradeBase;
                return (
                  <div key={rcp.id} className="border border-[#68717A]/45 bg-[#22272B] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-semibold text-[#D9D1BE]" style={{ fontFamily: "'Cinzel', Georgia, serif" }}>
                          {rcp.name}
                        </h4>
                        <span className="text-xs font-mono text-[#9C7848]">{rcp.goldCost}g</span>
                      </div>
                      <p className="text-xs text-[#D9D1BE]/75">{rcp.description}</p>
                      <div className="text-[11px] space-y-0.5 pt-1">
                        {rcp.ingredients.map((ing) => {
                          const have = getItemQuantity(save, ing.itemId);
                          return (
                            <div key={ing.itemId} className={have >= ing.quantity ? 'text-[#8EC49E]' : 'text-[#D47A74]'}>
                              • {ITEMS[ing.itemId]?.name ?? ing.itemId}: {have}/{ing.quantity}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canCraft}
                      onClick={() => runAction(onCraftRecipe(rcp.id))}
                      className="w-full py-2 text-xs uppercase tracking-widest border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {locked ? 'Blueprint Locked' : rcp.upgradeTargetItemId ? 'Temper Weapon' : 'Forge / Brew'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* RAVENHOLD MERCHANT */}
          {activeTab === 'merchant' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Buy Supplies & Gear</h4>
                {RAVENHOLD_MERCHANT_STOCK.map((itemId) => {
                  const def = ITEMS[itemId];
                  if (!def) return null;
                  return (
                    <div key={itemId} className="border border-[#68717A]/40 bg-[#22272B] p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-[#D9D1BE]">{def.name}</div>
                        <div className="text-[11px] text-[#68717A]">{def.lore.slice(0, 68)}...</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => runAction(onBuyItem(itemId))}
                        className="px-3 py-1.5 text-xs font-mono border border-[#9C7848] hover:bg-[#9C7848]/25 shrink-0"
                      >
                        Buy {def.price}g
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Sell From Satchel (50% value)</h4>
                {save.player.inventory.map((entry, idx) => {
                  const def = ITEMS[entry.itemId];
                  if (!def) return null;
                  const sellVal = Math.max(1, Math.floor(def.price * 0.5));
                  return (
                    <div
                      key={`sell_${entry.itemId}_${idx}`}
                      className="border border-[#68717A]/40 bg-[#22272B] p-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="text-xs text-[#D9D1BE]">
                        {def.name} ×{entry.quantity}
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(def.questProtected)}
                        onClick={() => runAction(onSellItem(entry.itemId))}
                        className="px-3 py-1 text-xs font-mono border border-[#68717A] hover:border-[#9C7848] disabled:opacity-40"
                      >
                        {def.questProtected ? 'Protected' : `Sell +${sellVal}g`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SAVE SLOTS, SETTINGS, ACCESSIBILITY & DEV TOOLS */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: Save / Load Slots + Gameplay & Graphics */}
              <div className="space-y-4">
                {inGame && (
                  <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-2">
                    <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Chronicle Save Slots (v1)</h4>
                    {SAVE_SLOTS.map((slotId) => {
                      const found = allSaves.find((s) => s.slotId === slotId)?.save ?? null;
                      return (
                        <div key={slotId} className="flex items-center justify-between gap-2 border-b border-[#68717A]/20 pb-2 text-xs">
                          <div>
                            <div className="uppercase text-[#9C7848] font-mono">{slotId.replace('_', ' ')}</div>
                            <div className="text-[#D9D1BE]/80">
                              {found ? `${found.regionName} · Lv.${found.player.level}` : 'Empty slot'}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            {slotId !== 'autosave' && (
                              <button
                                type="button"
                                onClick={() => runAction(onManualSave(slotId))}
                                className="px-2.5 py-1 border border-[#9C7848] text-[10px] uppercase"
                              >
                                Save
                              </button>
                            )}
                            {found && (
                              <button
                                type="button"
                                onClick={() => onLoadSlot(found)}
                                className="px-2.5 py-1 border border-[#6D9CB6] text-[#6D9CB6] text-[10px] uppercase"
                              >
                                Load
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-3 text-xs">
                  <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Graphics, Audio & Accessibility</h4>

                  <div className="flex items-center justify-between">
                    <span>Difficulty</span>
                    <select
                      value={settings.difficulty}
                      onChange={(e) => onUpdateSettings({ ...settings, difficulty: e.target.value as DifficultyId })}
                      className="bg-[#171B1E] border border-[#68717A]/60 px-2 py-1"
                    >
                      <option value="story">Story</option>
                      <option value="normal">Normal</option>
                      <option value="hard">Hard</option>
                      <option value="oathsworn">Oathsworn</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Graphics Preset</span>
                    <select
                      value={settings.quality}
                      onChange={(e) => onUpdateSettings({ ...settings, quality: e.target.value as QualityPreset })}
                      className="bg-[#171B1E] border border-[#68717A]/60 px-2 py-1"
                    >
                      <option value="low">Low (Mobile / Max FPS)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (2K Shadows)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Master Volume ({Math.round(settings.masterVolume * 100)}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.masterVolume}
                      onChange={(e) => onUpdateSettings({ ...settings, masterVolume: Number(e.target.value) })}
                      className="accent-[#9C7848]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(
                      [
                        ['muted', 'Mute Audio'],
                        ['subtitles', 'Subtitles'],
                        ['cameraShake', 'Camera Shake'],
                        ['reducedMotion', 'Reduced Motion'],
                        ['highContrastCues', 'High-Contrast Cues'],
                      ] as const
                    ).map(([prop, label]) => (
                      <label key={prop} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings[prop]}
                          onChange={(e) => onUpdateSettings({ ...settings, [prop]: e.target.checked })}
                          className="accent-[#9C7848]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Remappable Controls & Developer-Only Blender Tools */}
              <div className="space-y-4">
                <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-2 text-xs">
                  <h4 className="text-sm uppercase tracking-widest text-[#9C7848]">Remappable Controls</h4>
                  <p className="text-[11px] text-[#68717A]">Click any binding and press a new key (Esc cancels).</p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {BINDING_LABELS.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setListeningBind(b.key)}
                        className={`px-2.5 py-1.5 border text-left flex items-center justify-between ${
                          listeningBind === b.key
                            ? 'border-[#6D9CB6] bg-[#6D9CB6]/20'
                            : 'border-[#68717A]/40 bg-[#1B2024] hover:border-[#9C7848]'
                        }`}
                      >
                        <span>{b.label}</span>
                        <span className="font-mono text-[10px] text-[#9C7848]">
                          {listeningBind === b.key ? 'PRESS KEY...' : settings.bindings[b.key]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Developer-only Blender Asset Forge (isolated outside player menus) */}
                <div className="border border-[#68717A]/40 bg-[#181D21] p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#68717A]">Developer Tools</div>
                    <div className="text-xs text-[#D9D1BE]">Blender 5.3 Live Bridge & 55-Asset Manifest</div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDevBlender}
                    className="px-3 py-1.5 text-xs uppercase border border-[#68717A] hover:border-[#6D9CB6] text-[#6D9CB6]"
                  >
                    Open Forge
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
