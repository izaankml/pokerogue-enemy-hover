import {
  MINT_MODIFIER_TYPE_NAME,
  MODIFIER_SELECT_UI_HANDLER_NAME,
  PARTY_UI_HANDLER_NAME,
  PartyUiMode,
  REWARD_ROW_CURSOR,
} from "./constants.ts";
import { hasNatureUnlocked } from "./enemy-summary.ts";
import type {
  BattleSceneView,
  GameDataView,
  ModifierSelectUiHandlerView,
  PartySlotView,
  PartyUiHandlerView,
  PlayerPokemonView,
  UiView,
} from "./game-types.ts";

interface SlotLabel {
  text: string;
  fill: string;
  shadow: string;
}

/**
 * Colors are the game's text styles from `src/ui/text.ts`: `SUMMARY_GREEN` for a nature new to a
 * starter, `PERFECT_IV` for one new only to a later stage, and the label's own `MESSAGE` otherwise.
 */
const SLOT_LABELS = {
  newForStarter: { text: "New nature", fill: "#78c850", shadow: "#306850" },
  newForEvolution: { text: "New nature", fill: "#f8b050", shadow: "#c07800" },
  owned: { text: "Owned", fill: "#f8f8f8", shadow: "#6b5a73" },
  noEffect: { text: "No effect", fill: "#f8f8f8", shadow: "#6b5a73" },
} as const satisfies Record<string, SlotLabel>;

/** Slots already labeled. The game builds new slots each time the party screen opens. */
const labeledSlots = new WeakSet<PartySlotView>();

/**
 * While the party screen is open to choose a mint's target, labels each slot with what the mint
 * would unlock, in place of the HP bar, as the game labels slots for a TM.
 */
export function labelPartySlotsForMint(battleScene: BattleSceneView, gameData: GameDataView): void {
  const { ui } = battleScene;
  const handler = ui?.getHandler();
  if (!ui || handler?.constructor.name !== PARTY_UI_HANDLER_NAME) {
    return;
  }
  const { partyUiMode, partySlots } = handler as PartyUiHandlerView;
  if (partyUiMode !== PartyUiMode.MODIFIER || !partySlots) {
    return;
  }
  const nature = findChosenMintNature(ui);
  if (nature === undefined) {
    return;
  }
  for (const slot of partySlots) {
    if (labeledSlots.has(slot)) {
      continue;
    }
    labeledSlots.add(slot);
    const label = getSlotLabel(slot.getPokemon(), nature, gameData);
    if (label) {
      showSlotLabel(slot, label);
    }
  }
}

/**
 * The nature of the mint chosen on the reward screen, which stays open beneath the party screen.
 * Mints are offered only as rewards, never in the shop rows.
 */
function findChosenMintNature(ui: UiView): number | undefined {
  const rewardHandler = ui.handlers?.find(handler => handler?.constructor.name === MODIFIER_SELECT_UI_HANDLER_NAME) as
    | ModifierSelectUiHandlerView
    | undefined;
  const { active, rowCursor, cursor, options } = rewardHandler ?? {};
  if (!active || rowCursor !== REWARD_ROW_CURSOR || cursor === undefined) {
    return undefined;
  }
  const modifierType = options?.[cursor]?.modifierTypeOption.type;
  return modifierType?.constructor.name === MINT_MODIFIER_TYPE_NAME ? modifierType.nature : undefined;
}

/**
 * Follows `PokemonNatureChangeModifier.apply` and `GameData.unlockSpeciesNature`, which unlock the
 * nature for the Pokémon's species and every earlier stage of its line, starters among them.
 * Returns `null` when the game would unlock nothing, leaving the slot as the game drew it.
 */
function getSlotLabel(pokemon: PlayerPokemonView, nature: number, gameData: GameDataView): SlotLabel | null {
  // The game does not let a mint be used on a Pokémon that already has its nature.
  if (pokemon.getNature() === nature) {
    return SLOT_LABELS.noEffect;
  }
  const { species } = pokemon;
  if (!gameData.dexData[species.getRootSpeciesId()]?.caughtAttr) {
    return null;
  }
  const lineSpeciesIds = [species.speciesId, ...species.getPrevolutionLevels().map(([speciesId]) => speciesId)];
  const speciesIdsGainingNature = lineSpeciesIds.filter(speciesId => {
    const dexEntry = gameData.dexData[speciesId];
    return !!dexEntry && !hasNatureUnlocked(dexEntry, nature);
  });
  // Only starters have starter data.
  if (speciesIdsGainingNature.some(speciesId => gameData.starterData[speciesId])) {
    return SLOT_LABELS.newForStarter;
  }
  return speciesIdsGainingNature.length > 0 ? SLOT_LABELS.newForEvolution : SLOT_LABELS.owned;
}

/** Shows the label in place of the HP bar, as `PartySlot.setup` does for a TM. */
function showSlotLabel(slot: PartySlotView, { text, fill, shadow }: SlotLabel): void {
  for (const hpElement of [slot.slotHpLabel, slot.slotHpBar, slot.slotHpOverlay, slot.slotHpText]) {
    hpElement.setVisible(false);
  }
  const { slotDescriptionLabel } = slot;
  slotDescriptionLabel.setText(text);
  slotDescriptionLabel.setColor(fill);
  slotDescriptionLabel.setShadowColor(shadow);
  slotDescriptionLabel.setVisible(true);
}
