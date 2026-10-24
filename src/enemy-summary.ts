import {
  AbilityAttr,
  DexAttr,
  EGG_MOVE_COUNT,
  MAX_IV,
  NATURE_NAMES,
  PASSIVE_UNLOCKED,
  SAME_SPECIES_EGG_CANDY_COSTS,
  SHARED_DEX_ATTR_MASK,
  STAT_LABELS,
  VALUE_REDUCTION_MAX,
  VARIANT_DEX_ATTRS,
} from "./constants.ts";
import type { DexEntryView, EnemyPokemonView, GameDataView, SpeciesView, StarterDataEntryView } from "./game-types.ts";

export interface BaseStat {
  label: string;
  value: number;
}

export interface ProgressItem {
  text: string;
  state: "done" | "missing" | "info";
}

export interface EnemySummary {
  kind: "enemy";
  title: string;
  baseStats: BaseStat[];
  baseStatTotal: number;
  /** Starter progress; empty for a trainer's Pokémon, which cannot be caught. */
  starterProgress: ProgressItem[];
}

export interface SummaryContext {
  gameData: GameDataView;
  /** Whether the player holds the IV Scanner, without which the game keeps enemy IVs hidden. */
  hasIvScanner: boolean;
  /** Looks up a starter species, which the enemy object does not reference directly. */
  findStarterSpecies(speciesId: number): SpeciesView | undefined;
}

export function summarizeEnemy(enemy: EnemyPokemonView, context: SummaryContext): EnemySummary {
  const baseStats = getBaseStats(enemy);
  return {
    kind: "enemy",
    title: `${enemy.name}  Lv. ${enemy.level}`,
    baseStats: baseStats.map((value, statIndex) => ({ label: STAT_LABELS[statIndex] ?? "?", value })),
    baseStatTotal: baseStats.reduce((total, value) => total + value, 0),
    starterProgress: enemy.hasTrainer() ? [] : listStarterProgress(enemy.species.getRootSpeciesId(), context),
  };
}

/**
 * Whether catching the enemy would save anything new, following `GameData.setPokemonSpeciesCaught`
 * and `AttemptCapturePhase.catch`: dex attributes and natures go to the caught species and every
 * prevolution, abilities go to the starter, and IVs go to the nearest starter in the line.
 * Candy is left out because every catch awards it.
 */
export function hasNewCatchUnlocks(enemy: EnemyPokemonView, context: SummaryContext): boolean {
  if (enemy.hasTrainer()) {
    return false;
  }
  const { gameData } = context;
  const { species } = enemy;
  const rootSpeciesId = species.getRootSpeciesId();
  const speciesDexEntry = gameData.dexData[species.speciesId];
  const rootDexEntry = gameData.dexData[rootSpeciesId];
  if (!speciesDexEntry?.caughtAttr || !rootDexEntry?.caughtAttr) {
    return true;
  }
  return (
    addsToDexEntry(enemy, species, speciesDexEntry)
    || addsToDexEntry(enemy, context.findStarterSpecies(rootSpeciesId), rootDexEntry)
    || addsAbility(enemy, gameData.starterData[rootSpeciesId])
    || addsIvs(enemy, gameData.dexData[species.getRootSpeciesId(true)], context.hasIvScanner)
  );
}

function getBaseStats(enemy: EnemyPokemonView): number[] {
  const baseStats = [...enemy.getSpeciesForm(true).baseStats];
  if (!enemy.isFusion()) {
    return baseStats;
  }
  // Fusions average both species, rounding up, as `Pokemon.calculateBaseStats` does.
  const fusionBaseStats = enemy.getFusionSpeciesForm(true).baseStats;
  return baseStats.map((value, statIndex) => Math.ceil((value + (fusionBaseStats[statIndex] ?? value)) / 2));
}

/**
 * Whether the catch adds a dex attribute or nature to `dexEntry`. Without the species object,
 * only the attributes every species shares can be checked, since form support is per species.
 */
function addsToDexEntry(enemy: EnemyPokemonView, species: SpeciesView | undefined, dexEntry: DexEntryView): boolean {
  const obtainableAttr = species?.getFullUnlocksData() ?? SHARED_DEX_ATTR_MASK;
  const missingAttr = enemy.getDexAttr() & obtainableAttr & ~dexEntry.caughtAttr;
  return missingAttr !== 0n || !hasNatureUnlocked(dexEntry, enemy.nature);
}

export function hasNatureUnlocked(dexEntry: DexEntryView, nature: number): boolean {
  // Bit 0 is unused; each nature's bit sits one above its `Nature` value.
  return (dexEntry.natureAttr & (1 << (nature + 1))) !== 0;
}

function addsAbility(enemy: EnemyPokemonView, starterEntry: StarterDataEntryView | undefined): boolean {
  // A species without a second ability stores its hidden ability at index 1.
  const abilityAttr =
    enemy.abilityIndex !== 1 || enemy.species.ability2 ? 1 << enemy.abilityIndex : AbilityAttr.ABILITY_HIDDEN;
  return !!starterEntry && !(starterEntry.abilityAttr & abilityAttr);
}

/** A new perfect IV always counts; smaller gains count only while the IV Scanner reveals IVs. */
function addsIvs(enemy: EnemyPokemonView, dexEntry: DexEntryView | undefined, hasIvScanner: boolean): boolean {
  return enemy.ivs.some((iv, statIndex) => {
    const ownedIv = dexEntry?.ivs[statIndex] ?? 0;
    return iv > ownedIv && (iv === MAX_IV || hasIvScanner);
  });
}

function listStarterProgress(rootSpeciesId: number, { gameData, findStarterSpecies }: SummaryContext): ProgressItem[] {
  const starterEntry = gameData.starterData[rootSpeciesId];
  const rootDexEntry = gameData.dexData[rootSpeciesId];
  if (!starterEntry || !rootDexEntry?.caughtAttr) {
    return [];
  }
  const eggMoveCount = countSetBits(starterEntry.eggMoves, EGG_MOVE_COUNT);
  // A value reduction of zero leaves the base cost, which egg prices are based on.
  const eggCandyCost = getSameSpeciesEggCandyCost(gameData.getSpeciesStarterValue(rootSpeciesId, 0));
  return [
    {
      text: starterEntry.passiveAttr & PASSIVE_UNLOCKED ? "Passive" : "Passive Locked",
      state: starterEntry.passiveAttr & PASSIVE_UNLOCKED ? "done" : "missing",
    },
    {
      text: `Egg Moves ${eggMoveCount}/${EGG_MOVE_COUNT}`,
      state: eggMoveCount === EGG_MOVE_COUNT ? "done" : "missing",
    },
    {
      text: `Cost Reduction ${starterEntry.valueReduction}/${VALUE_REDUCTION_MAX}`,
      state: starterEntry.valueReduction >= VALUE_REDUCTION_MAX ? "done" : "missing",
    },
    getNatureProgress(rootDexEntry),
    getVariantProgress(rootDexEntry, findStarterSpecies(rootSpeciesId)),
    {
      text:
        eggCandyCost === null ? `${starterEntry.candyCount} Candy` : `${starterEntry.candyCount}/${eggCandyCost} Candy`,
      state: "info",
    },
  ];
}

/** How many natures the dex entry has unlocked, out of all of them. */
export function getNatureProgress(dexEntry: DexEntryView): ProgressItem {
  // Bit 0 is unused; each nature's bit sits one above its `Nature` value.
  const natureCount = countSetBits(dexEntry.natureAttr >> 1, NATURE_NAMES.length);
  return {
    text: `Natures ${natureCount}/${NATURE_NAMES.length}`,
    state: natureCount === NATURE_NAMES.length ? "done" : "missing",
  };
}

/**
 * How many shiny variants the dex entry has unlocked, out of those the species has sprites for.
 * Without the species object, the total is unknown and only the unlocked count is shown.
 */
function getVariantProgress(dexEntry: DexEntryView, species: SpeciesView | undefined): ProgressItem {
  // Non-shiny catches set the default variant bit too, so variants count only once a shiny is caught.
  const shinyAttr = dexEntry.caughtAttr & DexAttr.SHINY ? dexEntry.caughtAttr : 0n;
  const obtainableAttr = species?.getFullUnlocksData() ?? SHARED_DEX_ATTR_MASK;
  const obtainableVariants = VARIANT_DEX_ATTRS.filter(variantAttr => obtainableAttr & variantAttr);
  const variantCount = obtainableVariants.filter(variantAttr => shinyAttr & variantAttr).length;
  if (!species) {
    return { text: `Variants ${variantCount}`, state: "info" };
  }
  return {
    text: `Variants ${variantCount}/${obtainableVariants.length}`,
    state: variantCount === obtainableVariants.length ? "done" : "missing",
  };
}

/** Mirrors `getSameSpeciesEggCandyCounts` in `src/data/balance/starters.ts`. */
function getSameSpeciesEggCandyCost(starterCost: number): number | null {
  return SAME_SPECIES_EGG_CANDY_COSTS[starterCost - 1] ?? null;
}

function countSetBits(bitField: number, bitCount: number): number {
  let setBitCount = 0;
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex++) {
    if (bitField & (1 << bitIndex)) {
      setBitCount++;
    }
  }
  return setBitCount;
}
