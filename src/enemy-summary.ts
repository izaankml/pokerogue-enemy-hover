import {
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
import type {
  DexEntryView,
  EnemyPokemonView,
  GameDataView,
  SpeciesView,
  StarterDataEntryView,
} from "./game-types.ts";

/**
 * `done` marks complete progress, reached by every stage of the starter's line where each stage
 * saves its own; `starterOnly` marks progress the starter has completed but a later stage has not.
 */
export type ProgressState = "done" | "starterOnly" | "missing" | "info";

export interface BaseStat {
  label: string;
  value: number;
  /** Whether the starter's line has a perfect IV in this stat; `info` where starter progress is not shown. */
  ivState: ProgressState;
}

export interface ProgressItem {
  text: string;
  state: ProgressState;
}

/** The dex entries of a starter and of every later stage of its line. */
export interface LineDexEntries {
  starter: DexEntryView;
  /** `null` without the starter's species object, which alone can list its evolutions. */
  evolutions: DexEntryView[] | null;
}

export const UNCAUGHT_DEX_ENTRY: DexEntryView = { seenCount: 0, caughtAttr: 0n, natureAttr: 0, ivs: [] };

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

/** A caught starter's saved progress. */
interface StarterLine {
  speciesId: number;
  species: SpeciesView | undefined;
  starterEntry: StarterDataEntryView;
  dexEntries: LineDexEntries;
}

export function summarizeEnemy(enemy: EnemyPokemonView, context: SummaryContext): EnemySummary {
  const baseStats = enemy.calculateBaseStats();
  const starterLine = enemy.hasTrainer() ? null : findCaughtStarterLine(enemy.species.getRootSpeciesId(), context);
  return {
    kind: "enemy",
    title: `${enemy.name}  Lv. ${enemy.level}`,
    baseStats: baseStats.map((value, statIndex) => ({
      label: STAT_LABELS[statIndex] ?? "?",
      value,
      ivState: starterLine
        ? getLineProgressState(starterLine.dexEntries, dexEntry => (dexEntry.ivs[statIndex] ?? 0) >= MAX_IV)
        : "info",
    })),
    baseStatTotal: baseStats.reduce((total, value) => total + value, 0),
    starterProgress: starterLine ? listStarterProgress(starterLine, context.gameData) : [],
  };
}

export function hasNatureUnlocked(dexEntry: DexEntryView, nature: number): boolean {
  // Bit 0 is unused; each nature's bit sits one above its `Nature` value.
  return (dexEntry.natureAttr & (1 << (nature + 1))) !== 0;
}

/** Lists the dex entries of a starter's line. Without the starter's species, its evolutions are unknown. */
export function getLineDexEntries(
  gameData: GameDataView,
  starterDexEntry: DexEntryView,
  starterSpecies: SpeciesView | undefined,
): LineDexEntries {
  if (!starterSpecies) {
    return { starter: starterDexEntry, evolutions: null };
  }
  // A species that several evolution methods lead to appears once per method.
  const evolutionIds = new Set(starterSpecies.getEvolutionLevels().map(([speciesId]) => speciesId));
  return {
    starter: starterDexEntry,
    evolutions: [...evolutionIds].map(speciesId => gameData.dexData[speciesId] ?? UNCAUGHT_DEX_ENTRY),
  };
}

/**
 * Rates progress that the game saves for each stage of a line separately: `missing` until the
 * starter completes it, then `done` once every later stage has as well. Without the list of later
 * stages, it cannot be confirmed as `done`.
 */
function getLineProgressState(
  dexEntries: LineDexEntries,
  isComplete: (dexEntry: DexEntryView) => boolean,
): ProgressState {
  if (!isComplete(dexEntries.starter)) {
    return "missing";
  }
  return dexEntries.evolutions?.every(isComplete) ? "done" : "starterOnly";
}

function findCaughtStarterLine(speciesId: number, { gameData, findStarterSpecies }: SummaryContext): StarterLine | null {
  const starterEntry = gameData.starterData[speciesId];
  const dexEntry = gameData.dexData[speciesId];
  if (!starterEntry || !dexEntry?.caughtAttr) {
    return null;
  }
  const species = findStarterSpecies(speciesId);
  return { speciesId, species, starterEntry, dexEntries: getLineDexEntries(gameData, dexEntry, species) };
}

function listStarterProgress(
  { speciesId, species, starterEntry, dexEntries }: StarterLine,
  gameData: GameDataView,
): ProgressItem[] {
  const eggMoveCount = countSetBits(starterEntry.eggMoves, EGG_MOVE_COUNT);
  // A value reduction of zero leaves the base cost, which egg prices are based on.
  const eggCandyCost = getSameSpeciesEggCandyCost(gameData.getSpeciesStarterValue(speciesId, 0));
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
    getNatureProgress(dexEntries),
    getVariantProgress(dexEntries.starter, species),
    {
      text:
        eggCandyCost === null ? `${starterEntry.candyCount} Candy` : `${starterEntry.candyCount}/${eggCandyCost} Candy`,
      state: "info",
    },
  ];
}

/** How many natures the starter has unlocked, out of all of them, rated across its line. */
export function getNatureProgress(dexEntries: LineDexEntries): ProgressItem {
  return {
    text: `Natures ${countUnlockedNatures(dexEntries.starter)}/${NATURE_NAMES.length}`,
    state: getLineProgressState(dexEntries, dexEntry => countUnlockedNatures(dexEntry) === NATURE_NAMES.length),
  };
}

function countUnlockedNatures(dexEntry: DexEntryView): number {
  // Bit 0 is unused; each nature's bit sits one above its `Nature` value.
  return countSetBits(dexEntry.natureAttr >> 1, NATURE_NAMES.length);
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
