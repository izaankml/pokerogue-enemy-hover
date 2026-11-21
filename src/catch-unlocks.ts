import { AbilityAttr, DexAttr, MAX_IV, SHARED_DEX_ATTR_MASK } from "./constants.ts";
import { hasNatureUnlocked, type SummaryContext } from "./enemy-summary.ts";
import type { DexEntryView, EnemyPokemonView, SpeciesView } from "./game-types.ts";

/** Who gains an unlock: a starter, or only the caught species as a later stage of its line. */
export type UnlockScope = "starter" | "evolution";

export interface CatchUnlock {
  text: string;
  scope: UnlockScope;
}

export interface CatchUnlocksSummary {
  kind: "unlocks";
  unlocks: CatchUnlock[];
}

/** The dex bits that record whether a Pokémon was caught shiny, and at which tier. */
const SHININESS_DEX_ATTR_MASK =
  DexAttr.NON_SHINY | DexAttr.SHINY | DexAttr.DEFAULT_VARIANT | DexAttr.VARIANT_2 | DexAttr.VARIANT_3;
const GENDER_DEX_ATTR_MASK = DexAttr.MALE | DexAttr.FEMALE;
/** Form bits start above the bits every species shares. */
const FORM_DEX_ATTR_MASK = ~SHARED_DEX_ATTR_MASK;

const UNCAUGHT_DEX_ENTRY: DexEntryView = { seenCount: 0, caughtAttr: 0n, natureAttr: 0, ivs: [] };

export function summarizeCatchUnlocks(enemy: EnemyPokemonView, context: SummaryContext): CatchUnlocksSummary {
  return { kind: "unlocks", unlocks: listCatchUnlocks(enemy, context) };
}

/** Whether catching the enemy would save anything new. Candy is left out because every catch awards it. */
export function hasNewCatchUnlocks(enemy: EnemyPokemonView, context: SummaryContext): boolean {
  return !enemy.hasTrainer() && listCatchUnlocks(enemy, context).length > 0;
}

/**
 * What catching the enemy would save, by kind of unlock, following `GameData.setPokemonSpeciesCaught`
 * and `AttemptCapturePhase.catch`: dex attributes and natures go to the caught species and every
 * prevolution, abilities go to the starter, and IVs go to the nearest starter in the line.
 */
export function listCatchUnlocks(enemy: EnemyPokemonView, context: SummaryContext): CatchUnlock[] {
  const { gameData } = context;
  const { species } = enemy;
  const rootSpeciesId = species.getRootSpeciesId();
  const rootDexEntry = gameData.dexData[rootSpeciesId];
  if (!rootDexEntry?.caughtAttr) {
    return [{ text: "New Starter", scope: "starter" }];
  }
  const speciesDexEntry = gameData.dexData[species.speciesId] ?? UNCAUGHT_DEX_ENTRY;
  // Only starters have starter data. A starter such as Pikachu can itself evolve from another one.
  const speciesGainScope: UnlockScope = gameData.starterData[species.speciesId] ? "starter" : "evolution";
  const unlocks: CatchUnlock[] = [];
  const addUnlock = (text: string, gainedByRoot: boolean, gainedBySpecies: boolean): void => {
    const scope = gainedByRoot ? "starter" : gainedBySpecies ? speciesGainScope : null;
    if (scope) {
      unlocks.push({ text, scope });
    }
  };

  const dexAttr = enemy.getDexAttr();
  const rootMissingAttr = getMissingDexAttr(dexAttr, context.findStarterSpecies(rootSpeciesId), rootDexEntry);
  const speciesMissingAttr = getMissingDexAttr(dexAttr, species, speciesDexEntry);
  const dexAttrGroups: [text: string, attr: bigint][] = [
    [describeShininess(dexAttr), dexAttr & SHININESS_DEX_ATTR_MASK],
    ["Gender", dexAttr & GENDER_DEX_ATTR_MASK],
    ["Form", dexAttr & FORM_DEX_ATTR_MASK],
  ];
  for (const [text, attr] of dexAttrGroups) {
    addUnlock(text, (rootMissingAttr & attr) !== 0n, (speciesMissingAttr & attr) !== 0n);
  }

  // A species without a second ability stores its hidden ability at index 1.
  const abilityAttr =
    enemy.abilityIndex !== 1 || species.ability2 ? 1 << enemy.abilityIndex : AbilityAttr.ABILITY_HIDDEN;
  const rootStarterEntry = gameData.starterData[rootSpeciesId];
  addUnlock(
    abilityAttr === AbilityAttr.ABILITY_HIDDEN ? "Hidden Ability" : "Ability",
    !!rootStarterEntry && !(rootStarterEntry.abilityAttr & abilityAttr),
    false,
  );

  addUnlock(
    "Nature",
    !hasNatureUnlocked(rootDexEntry, enemy.nature),
    !hasNatureUnlocked(speciesDexEntry, enemy.nature),
  );

  addUnlock(
    "IV",
    hasImprovedIv(enemy, gameData.dexData[species.getRootSpeciesId(true)], context.hasIvScanner),
    false,
  );

  return unlocks;
}

/**
 * The enemy's dex attributes that `dexEntry` lacks. Without the species object, only the
 * attributes every species shares can be checked, since form support is per species.
 */
function getMissingDexAttr(dexAttr: bigint, species: SpeciesView | undefined, dexEntry: DexEntryView): bigint {
  const obtainableAttr = species?.getFullUnlocksData() ?? SHARED_DEX_ATTR_MASK;
  return dexAttr & obtainableAttr & ~dexEntry.caughtAttr;
}

/**
 * Names the shiny tier, as the shiny icon beside the enemy's name shows it, worded as the game's
 * tooltip on that icon with the tier names from `getShinyDescriptor`.
 */
function describeShininess(dexAttr: bigint): string {
  if (!(dexAttr & DexAttr.SHINY)) {
    return "Not Shiny";
  }
  if (dexAttr & DexAttr.VARIANT_3) {
    return "Shiny (Epic)";
  }
  return dexAttr & DexAttr.VARIANT_2 ? "Shiny (Rare)" : "Shiny";
}

/** Whether an IV beats the starter's: any perfect IV, and smaller gains while the IV Scanner reveals IVs. */
function hasImprovedIv(enemy: EnemyPokemonView, dexEntry: DexEntryView | undefined, hasIvScanner: boolean): boolean {
  return enemy.ivs.some((iv, statIndex) => {
    const ownedIv = dexEntry?.ivs[statIndex] ?? 0;
    return iv > ownedIv && (iv === MAX_IV || hasIvScanner);
  });
}
