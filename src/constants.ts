// Mirrors of PokeRogue enums. The game inlines its enums at build time, so the
// extension cannot read them at runtime and keeps its own copies.

/** `DexAttr` bit flags from `src/enums/dex-attr.ts`. */
export const DexAttr = {
  NON_SHINY: 1n,
  SHINY: 2n,
  MALE: 4n,
  FEMALE: 8n,
  DEFAULT_VARIANT: 16n,
  VARIANT_2: 32n,
  VARIANT_3: 64n,
} as const;

/** Shiny variant bits, from the lowest tier to the highest. */
export const VARIANT_DEX_ATTRS = [DexAttr.DEFAULT_VARIANT, DexAttr.VARIANT_2, DexAttr.VARIANT_3] as const;

/** Dex bits that every species shares, as opposed to per-species form bits. */
export const SHARED_DEX_ATTR_MASK =
  DexAttr.NON_SHINY
  | DexAttr.SHINY
  | DexAttr.MALE
  | DexAttr.FEMALE
  | DexAttr.DEFAULT_VARIANT
  | DexAttr.VARIANT_2
  | DexAttr.VARIANT_3;

/** `AbilityAttr` bit flags from `src/enums/ability-attr.ts`. */
export const AbilityAttr = {
  ABILITY_1: 1,
  ABILITY_2: 2,
  ABILITY_HIDDEN: 4,
} as const;

/** `Passive.UNLOCKED` from `src/enums/passive.ts`. */
export const PASSIVE_UNLOCKED = 1;

/** `VALUE_REDUCTION_MAX` from `src/constants.ts`. */
export const VALUE_REDUCTION_MAX = 2;

export const EGG_MOVE_COUNT = 4;

/** Nature names in `Nature` enum order. */
export const NATURE_NAMES = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky",
] as const;

/** `BiomeId` from `src/enums/biome-id.ts`. */
export const BiomeId = {
  TOWN: 0,
  PLAINS: 1,
  GRASS: 2,
  TALL_GRASS: 3,
  METROPOLIS: 4,
  FOREST: 5,
  SEA: 6,
  SWAMP: 7,
  BEACH: 8,
  LAKE: 9,
  SEABED: 10,
  MOUNTAIN: 11,
  BADLANDS: 12,
  CAVE: 13,
  DESERT: 14,
  ICE_CAVE: 15,
  MEADOW: 16,
  POWER_PLANT: 17,
  VOLCANO: 18,
  GRAVEYARD: 19,
  DOJO: 20,
  FACTORY: 21,
  RUINS: 22,
  WASTELAND: 23,
  ABYSS: 24,
  SPACE: 25,
  CONSTRUCTION_SITE: 26,
  JUNGLE: 27,
  FAIRY_CAVE: 28,
  TEMPLE: 29,
  SLUM: 30,
  SNOWY_FOREST: 31,
  ISLAND: 40,
  LABORATORY: 41,
  END: 50,
} as const;

/** `SpeciesId.MELTAN` from `src/enums/species-id.ts`. */
export const MELTAN_SPECIES_ID = 808;

/**
 * `TextStyle.ME_OPTION_SPECIAL` from `src/enums/text-style.ts`, the color the game gives Mystery
 * Encounter choices with special requirements: green in the modern theme, gold in the legacy one.
 */
export const SPECIAL_OPTION_TEXT_STYLE = 55;

/** Permanent stat labels in `Stat` enum order. */
export const STAT_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;

/** Highest IV a stat can have. */
export const MAX_IV = 31;

/** Class name of the IV Scanner item, which reveals enemy IVs in the game. */
export const IV_SCANNER_MODIFIER_NAME = "IvScannerModifier";

/** Class name of a mint's item type. */
export const MINT_MODIFIER_TYPE_NAME = "PokemonNatureChangeModifierType";

/** Tint `EnemyBattleInfo` gives the owned icon when a catch would unlock something. */
export const OWNED_ICON_NEW_UNLOCK_TINT = 0x808080;

/**
 * Same-species egg candy costs from the `eggCost` of `allStarterCandyCosts` in
 * `src/data/balance/starters.ts`, indexed by starter cost minus one.
 */
export const SAME_SPECIES_EGG_CANDY_COSTS: readonly number[] = [20, 20, 15, 12, 10, 8, 7, 6, 6, 5];

/** Width of the game's UI coordinate space (`scaledCanvas` in `src/scene-base.ts`). */
export const UI_CANVAS_WIDTH = 320;

/** Nine-slice border sizes that `addWindow` in `src/ui/ui-theme.ts` uses for each theme. */
export const WINDOW_BORDER_SIZE = 8;
export const LEGACY_WINDOW_BORDER_SIZE = 6;

/** Suffix the legacy theme appends to UI texture keys. */
export const LEGACY_TEXTURE_SUFFIX = "_legacy";

/** UI handlers during which the battle field is on screen and hovering makes sense. */
export const BATTLE_UI_HANDLER_NAMES: ReadonlySet<string> = new Set([
  "BattleMessageUiHandler",
  "CommandUiHandler",
  "FightUiHandler",
  "BallUiHandler",
  "TargetSelectUiHandler",
]);

/** The yes/no prompt, which the game opens both over the battle field and over full-screen menus. */
export const CONFIRM_UI_HANDLER_NAME = "ConfirmUiHandler";

/** The evolution scene, whose handler stays `active` after it closes. */
export const EVOLUTION_SCENE_UI_HANDLER_NAME = "EvolutionSceneUiHandler";

export const STARTER_SELECT_UI_HANDLER_NAME = "StarterSelectUiHandler";

export const PARTY_UI_HANDLER_NAME = "PartyUiHandler";

/** The screen offering a reward after each wave, with the shop below the rewards. */
export const MODIFIER_SELECT_UI_HANDLER_NAME = "ModifierSelectUiHandler";

/** Row of the reward screen's cursor that holds the rewards, between the buttons and the shop rows. */
export const REWARD_ROW_CURSOR = 1;

/** The option menu, which the biome choice opens among others. */
export const OPTION_SELECT_UI_HANDLER_NAME = "OptionSelectUiHandler";

/** `phaseName` of the phase that lets a player holding a Map choose the next biome. */
export const SELECT_BIOME_PHASE_NAME = "SelectBiomePhase";

/** `PartyUiMode` values from `src/enums/party-ui-mode.ts`. */
export const PartyUiMode = {
  /** Choosing which party member an item is used on. */
  MODIFIER: 4,
} as const;

/**
 * Area of a starter select grid cell relative to its starter container, in UI pixels. Cells are
 * spaced as `calcStarterContainerPosition` in `src/ui/handlers/starter-select-ui-handler.ts`
 * places them, starting where the game draws its selection cursor.
 */
export const STARTER_CELL_AREA = { x: -1, y: 1, width: 18, height: 17 } as const;
