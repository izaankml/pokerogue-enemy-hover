// Monte Carlo model of the classic-mode rules that decide whether a run fights a Meltan. It prints
// `ROUTE_VALUES` for `src/meltan-route.ts`. Each part names the game code it mirrors.

import { parseArgs } from "node:util";
import type { BiomeId } from "../src/constants.ts";

type BiomeName = keyof typeof BiomeId;

const { values: commandLineOptions } = parseArgs({
  options: {
    /** Simulated runs for each Scientist biome at each position. */
    runs: { type: "string", default: "800000" },
    /** Generated Scientist parties for each wave. */
    "party-samples": { type: "string", default: "120000" },
  },
});
const RUN_COUNT = Number(commandLineOptions.runs);
const PARTY_SAMPLE_COUNT = Number(commandLineOptions["party-samples"]);

// #region Random numbers

/** A fixed seed, so the same options always print the same table. */
let randomState = 0x9e3779b9;

/** mulberry32 */
function random(): number {
  randomState = (randomState + 0x6d2b79f5) | 0;
  let mixed = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

const randomInt = (range: number): number => Math.floor(random() * range);

// #endregion

// #region Biomes (src/data/balance/biomes/*.ts)

/** A next biome, or one offered only with a chance of one in the given weight. */
type BiomeLink = BiomeName | [biome: BiomeName, weight: number];

/** `biomeLinks` of each biome. Seasonal events add links of their own, which are left out. */
const BIOME_LINKS: Partial<Record<BiomeName, readonly BiomeLink[]>> = {
  TOWN: ["PLAINS"],
  PLAINS: ["GRASS", "METROPOLIS", "LAKE"],
  GRASS: ["TALL_GRASS"],
  TALL_GRASS: ["FOREST", "CAVE"],
  METROPOLIS: ["SLUM"],
  FOREST: ["JUNGLE", "MEADOW"],
  SEA: ["SEABED", "ICE_CAVE"],
  SWAMP: ["GRAVEYARD", "TALL_GRASS"],
  BEACH: ["SEA", ["ISLAND", 2]],
  LAKE: ["BEACH", "SWAMP", "CONSTRUCTION_SITE"],
  SEABED: ["CAVE", ["VOLCANO", 3]],
  MOUNTAIN: ["VOLCANO", ["WASTELAND", 2], ["SPACE", 3]],
  BADLANDS: ["DESERT", "MOUNTAIN"],
  CAVE: ["BADLANDS", "LAKE", ["LABORATORY", 2]],
  DESERT: ["RUINS", ["CONSTRUCTION_SITE", 2]],
  ICE_CAVE: ["SNOWY_FOREST"],
  MEADOW: ["PLAINS", "FAIRY_CAVE"],
  POWER_PLANT: ["FACTORY"],
  VOLCANO: ["BEACH", ["ICE_CAVE", 3]],
  GRAVEYARD: ["ABYSS"],
  DOJO: ["PLAINS", ["JUNGLE", 2], ["TEMPLE", 2]],
  FACTORY: ["PLAINS", ["LABORATORY", 2]],
  RUINS: ["MOUNTAIN", ["FOREST", 2]],
  WASTELAND: ["BADLANDS"],
  ABYSS: ["CAVE", ["SPACE", 2], ["WASTELAND", 2]],
  SPACE: ["RUINS"],
  CONSTRUCTION_SITE: ["POWER_PLANT", ["DOJO", 2]],
  JUNGLE: ["TEMPLE"],
  FAIRY_CAVE: ["ICE_CAVE", ["SPACE", 2]],
  TEMPLE: ["DESERT", ["SWAMP", 2], ["RUINS", 2]],
  SLUM: ["CONSTRUCTION_SITE", ["SWAMP", 2]],
  SNOWY_FOREST: ["FOREST", ["MOUNTAIN", 2], ["LAKE", 2]],
  ISLAND: ["SEA"],
  LABORATORY: ["CONSTRUCTION_SITE", "ISLAND"],
};

/** `trainerChance` of each biome: a wave can hold a random trainer with a chance of one in this. */
const TRAINER_CHANCE: Partial<Record<BiomeName, number>> = {
  TOWN: 0,
  PLAINS: 6,
  GRASS: 6,
  TALL_GRASS: 8,
  METROPOLIS: 4,
  FOREST: 8,
  SEA: 12,
  SWAMP: 8,
  BEACH: 6,
  LAKE: 6,
  SEABED: 16,
  MOUNTAIN: 8,
  BADLANDS: 8,
  CAVE: 6,
  DESERT: 6,
  ICE_CAVE: 12,
  MEADOW: 8,
  POWER_PLANT: 8,
  VOLCANO: 12,
  GRAVEYARD: 12,
  DOJO: 4,
  FACTORY: 8,
  RUINS: 12,
  WASTELAND: 12,
  ABYSS: 16,
  SPACE: 16,
  CONSTRUCTION_SITE: 6,
  JUNGLE: 12,
  FAIRY_CAVE: 12,
  TEMPLE: 16,
  SLUM: 6,
  SNOWY_FOREST: 8,
  ISLAND: 12,
  LABORATORY: 16,
};

/**
 * Random trainer types with their chance out of 512, from `Arena.randomTrainerType`: tiers below
 * an empty one fall back to the next tier up. Only the three biomes with Scientists matter.
 */
const TRAINER_TYPE_WEIGHTS: Partial<Record<BiomeName, readonly [trainerType: string, weight: number][]>> = {
  LABORATORY: [["SCIENTIST", 512]],
  DESERT: [
    ["BACKPACKER", 178],
    ["SCIENTIST", 178],
    ["RUIN_MANIAC", 156],
  ],
  RUINS: [
    ["PSYCHIC", 356 / 3],
    ["RUIN_MANIAC", 356 / 3],
    ["SCIENTIST", 356 / 3],
    ["ACE_TRAINER", 39],
    ["BLACK_BELT", 39],
    ["COLLECTOR", 39],
    ["HEX_MANIAC", 39],
  ],
};
const SCIENTIST_BIOMES = new Set(Object.keys(TRAINER_TYPE_WEIGHTS) as BiomeName[]);

function rollTrainerType(biome: BiomeName): string {
  const trainerTypeWeights = TRAINER_TYPE_WEIGHTS[biome]!;
  let roll = random() * 512;
  for (const [trainerType, weight] of trainerTypeWeights) {
    roll -= weight;
    if (roll < 0) {
      return trainerType;
    }
  }
  return trainerTypeWeights.at(-1)![0];
}

// #endregion

// #region Battles (GameMode.isWaveTrainer, src/data/trainers/fixed-battle-configs.ts)

const FIXED_BATTLE_WAVES = new Set([5, 8, 25, 35, 55, 62, 64, 66, 95]);

/** Gym leaders fight on waves 20, 50 and 80, or on 30, 60 and 90 when offset. */
const isGymWave = (wave: number, isGymOffset: boolean): boolean => wave % 30 === (isGymOffset ? 0 : 20);

// #endregion

// #region Trainer parties (Trainer.getPartyLevels, Trainer.genNewPartyMemberSpecies)

/** `PartyMemberStrength` values from `src/enums/party-member-strength.ts`. */
const PartyMemberStrength = { AVERAGE: 3, STRONG: 4, STRONGER: 5 } as const;

/** `Trainer.getPartyLevels` for one slot of the given strength. */
function getPartyMemberLevel(wave: number, strength: number): number {
  const baseLevel = 1 + wave / 2 + (wave / 25) ** 2;
  let multiplier = strength === PartyMemberStrength.STRONGER ? 1.24 : 1.12;
  let levelOffset = 0;
  if (strength < PartyMemberStrength.STRONG) {
    multiplier = Math.min(multiplier + 0.025 * Math.floor(wave / 25), 1.225);
    levelOffset = -Math.floor((wave / 50) * (PartyMemberStrength.STRONG - strength));
  }
  return Math.ceil(baseLevel * multiplier) + levelOffset;
}

/**
 * Chance that a normal trainer's Meltan stays unevolved, from `determineEnemySpecies` in
 * `src/ai/ai-species-gen.ts`: it evolves when a random level from 50 to 55 is at most its own.
 */
function getMeltanUnevolvedChance(level: number): number {
  return 1 - Math.min(Math.max((level - 49) / 6, 0), 1);
}

/** Bit flags for the types that a balanced party template keeps from repeating. */
const PokemonType = {
  NORMAL: 1 << 0,
  WATER: 1 << 2,
  ELECTRIC: 1 << 3,
  GRASS: 1 << 4,
  ICE: 1 << 5,
  POISON: 1 << 7,
  GROUND: 1 << 8,
  FLYING: 1 << 9,
  PSYCHIC: 1 << 10,
  BUG: 1 << 11,
  ROCK: 1 << 12,
  GHOST: 1 << 13,
  DRAGON: 1 << 14,
  STEEL: 1 << 15,
  FAIRY: 1 << 16,
} as const;

interface PoolSpecies {
  name: string;
  /** The types of the species at the levels it is fought at, as `PokemonType` flags. */
  types: number;
}

const poolSpecies = (name: string, ...types: number[]): PoolSpecies => ({
  name,
  types: types.reduce((combinedTypes, type) => combinedTypes | type, 0),
});

/** The Scientist's species pools in `src/data/trainers/trainer-config.ts`, from the common tier to the ultra rare one. */
const SCIENTIST_SPECIES_POOL: readonly (readonly PoolSpecies[])[] = [
  [
    poolSpecies("MAGNEMITE", PokemonType.ELECTRIC, PokemonType.STEEL),
    poolSpecies("GRIMER", PokemonType.POISON),
    poolSpecies("DROWZEE", PokemonType.PSYCHIC),
    poolSpecies("VOLTORB", PokemonType.ELECTRIC),
    poolSpecies("KOFFING", PokemonType.POISON),
  ],
  [
    poolSpecies("BALTOY", PokemonType.GROUND, PokemonType.PSYCHIC),
    poolSpecies("BRONZOR", PokemonType.STEEL, PokemonType.PSYCHIC),
    poolSpecies("FERROSEED", PokemonType.GRASS, PokemonType.STEEL),
    poolSpecies("KLINK", PokemonType.STEEL),
    poolSpecies("CHARJABUG", PokemonType.BUG, PokemonType.ELECTRIC),
    poolSpecies("BLIPBUG", PokemonType.BUG, PokemonType.PSYCHIC),
    poolSpecies("HELIOPTILE", PokemonType.ELECTRIC, PokemonType.NORMAL),
  ],
  [
    poolSpecies("ABRA", PokemonType.PSYCHIC),
    poolSpecies("DITTO", PokemonType.NORMAL),
    poolSpecies("PORYGON", PokemonType.NORMAL),
    poolSpecies("ELEKID", PokemonType.ELECTRIC),
    poolSpecies("ROTOM", PokemonType.ELECTRIC, PokemonType.GHOST),
    poolSpecies("SOLOSIS", PokemonType.PSYCHIC),
    poolSpecies("GALAR_WEEZING", PokemonType.POISON, PokemonType.FAIRY),
  ],
  [
    poolSpecies("OMANYTE", PokemonType.ROCK, PokemonType.WATER),
    poolSpecies("KABUTO", PokemonType.ROCK, PokemonType.WATER),
    poolSpecies("AERODACTYL", PokemonType.ROCK, PokemonType.FLYING),
    poolSpecies("LILEEP", PokemonType.ROCK, PokemonType.GRASS),
    poolSpecies("ANORITH", PokemonType.ROCK, PokemonType.BUG),
    poolSpecies("CRANIDOS", PokemonType.ROCK),
    poolSpecies("SHIELDON", PokemonType.ROCK, PokemonType.STEEL),
    poolSpecies("TIRTOUGA", PokemonType.WATER, PokemonType.ROCK),
    poolSpecies("ARCHEN", PokemonType.ROCK, PokemonType.FLYING),
    poolSpecies("TYRUNT", PokemonType.ROCK, PokemonType.DRAGON),
    poolSpecies("AMAURA", PokemonType.ROCK, PokemonType.ICE),
    poolSpecies("ARCTOVISH", PokemonType.WATER, PokemonType.ICE),
    poolSpecies("ARCTOZOLT", PokemonType.ELECTRIC, PokemonType.ICE),
    poolSpecies("DRACOVISH", PokemonType.WATER, PokemonType.DRAGON),
    poolSpecies("DRACOZOLT", PokemonType.ELECTRIC, PokemonType.DRAGON),
  ],
  [poolSpecies("MELTAN", PokemonType.STEEL)],
];
const ULTRA_RARE_TIER = 4;

/** Rolls a pool tier out of 512, as `Trainer.genNewPartyMemberSpecies` does, then a species within it. */
function rollPoolSpecies(): PoolSpecies {
  const tierValue = randomInt(512);
  const tier = tierValue >= 156 ? 0 : tierValue >= 32 ? 1 : tierValue >= 6 ? 2 : tierValue >= 1 ? 3 : ULTRA_RARE_TIER;
  const tierSpecies = SCIENTIST_SPECIES_POOL[tier]!;
  return tierSpecies[randomInt(tierSpecies.length)]!;
}

interface PartySlot {
  level: number;
  /** Whether the slot's template rerolls species that share a type with the party. */
  isBalanced: boolean;
}

/** Retries `Trainer.genNewPartyMemberSpecies` makes for a slot before it keeps the last species rolled. */
const SPECIES_RETRY_LIMIT = 25;

/**
 * Expected number of unevolved Meltan in one generated party. Each roll that could be Meltan adds
 * its chance of being an accepted, unevolved Meltan, which keeps the estimate's variance low.
 */
function getExpectedMeltanInParty(slots: readonly PartySlot[], meltanChancePerRoll: number): number {
  const partySpeciesNames = new Set<string>();
  let partyTypes = 0;
  let expectedMeltan = 0;
  for (const { level, isBalanced } of slots) {
    for (let attempt = 0; attempt <= SPECIES_RETRY_LIMIT; attempt++) {
      const isLastAttempt = attempt === SPECIES_RETRY_LIMIT;
      // A Meltan roll is kept unless a balanced template already has a Steel type.
      if (isLastAttempt || !isBalanced || !(partyTypes & PokemonType.STEEL)) {
        if (!partySpeciesNames.has("MELTAN")) {
          expectedMeltan += meltanChancePerRoll * getMeltanUnevolvedChance(level);
        }
      }
      const rolledSpecies = rollPoolSpecies();
      const hasTypeClash = isBalanced && (partyTypes & rolledSpecies.types) !== 0;
      if (isLastAttempt || (!hasTypeClash && !partySpeciesNames.has(rolledSpecies.name))) {
        partySpeciesNames.add(rolledSpecies.name);
        partyTypes |= rolledSpecies.types;
        break;
      }
    }
  }
  return expectedMeltan;
}

/** Expected unevolved Meltan in a Scientist's party at each wave. */
interface MeltanPartyTables {
  /** A random trainer's party, from the default `TWO_AVG` template. */
  normal: number[];
  /** The hard party of Mysterious Challengers' second option. */
  hard: number[];
}

const LAST_SIMULATED_WAVE = 80;

function buildMeltanPartyTables(): MeltanPartyTables {
  const meltanChancePerRoll = (1 / 512) * (1 / SCIENTIST_SPECIES_POOL[ULTRA_RARE_TIER]!.length);
  const normal: number[] = [];
  const hard: number[] = [];
  for (let wave = 1; wave <= LAST_SIMULATED_WAVE; wave++) {
    const averageLevel = getPartyMemberLevel(wave, PartyMemberStrength.AVERAGE);
    const normalSlots = [averageLevel, averageLevel].map(level => ({ level, isBalanced: false }));
    // One balanced STRONGER slot and min(ceil(wave / 20), 5) balanced AVERAGE ones, with a
    // `levelAdditiveModifier` of 1 adding wave / 10 levels, rounded.
    const levelBonus = Math.round(wave / 10);
    const hardSlots = [
      { level: getPartyMemberLevel(wave, PartyMemberStrength.STRONGER) + levelBonus, isBalanced: true },
      ...Array.from({ length: Math.min(Math.ceil(wave / 20), 5) }, () => ({
        level: averageLevel + levelBonus,
        isBalanced: true,
      })),
    ];
    let normalTotal = 0;
    let hardTotal = 0;
    for (let sample = 0; sample < PARTY_SAMPLE_COUNT; sample++) {
      normalTotal += getExpectedMeltanInParty(normalSlots, meltanChancePerRoll);
      hardTotal += getExpectedMeltanInParty(hardSlots, meltanChancePerRoll);
    }
    normal[wave] = normalTotal / PARTY_SAMPLE_COUNT;
    hard[wave] = hardTotal / PARTY_SAMPLE_COUNT;
  }
  return { normal, hard };
}

// #endregion

// #region Runs (BattleScene.isWaveMysteryEncounter, BattleScene.getMysteryEncounter)

/**
 * Great-tier mystery encounters in each Scientist biome; other biomes stand for theirs with an
 * unrelated third one. Bug-Type Superfan is left out, since it needs a Bug type in the party.
 */
const GREAT_ENCOUNTERS: Partial<Record<BiomeName, readonly string[]>> = {
  LABORATORY: ["MYSTERIOUS_CHALLENGERS", "DELIBIRDY"],
  DESERT: ["MYSTERIOUS_CHALLENGERS", "DELIBIRDY"],
  RUINS: ["MYSTERIOUS_CHALLENGERS", "DELIBIRDY", "DANCING_LESSONS"],
};
const DEFAULT_GREAT_ENCOUNTERS: readonly string[] = ["MYSTERIOUS_CHALLENGERS", "DELIBIRDY", "OTHER"];

/** Expected Meltan fights at each wave of a run along `route`, which gives the biome of each ten waves. */
function simulateRuns(route: readonly BiomeName[], lastWave: number, partyTables: MeltanPartyTables): Float64Array {
  const meltanFightsByWave = new Float64Array(lastWave + 1);
  const trainerRolls = new Uint8Array(lastWave + 3);
  for (let run = 0; run < RUN_COUNT; run++) {
    const isGymOffset = random() < 0.5;
    let encounterSpawnChance = 3;
    let encounterCount = 0;
    let lastEncounterWave = -100;
    let lastEncounterType = "";
    let commonEncountersSeen = 0;
    let greatEncountersSeen = 0;
    let delibirdyCount = 0;
    for (let wave = 1; wave <= lastWave; wave++) {
      const biome = route[Math.floor((wave - 1) / 10)]!;
      const trainerChance = TRAINER_CHANCE[biome]!;
      trainerRolls[wave] = trainerChance > 0 && random() < 1 / trainerChance ? 1 : 0;

      // A random trainer needs no fixed battle, gym leader or earlier trainer within two waves.
      let isWild = true;
      let isRandomTrainer = false;
      if (FIXED_BATTLE_WAVES.has(wave) || isGymWave(wave, isGymOffset)) {
        isWild = false;
      } else if (wave % 10 !== 0 && wave % 10 !== 1) {
        const waveBase = Math.floor(wave / 10) * 10;
        let isAllowed = trainerChance > 0;
        for (
          let nearbyWave = Math.max(wave - 2, waveBase + 2);
          isAllowed && nearbyWave <= Math.min(wave + 2, waveBase + 10);
          nearbyWave++
        ) {
          if (nearbyWave === wave) {
            continue;
          }
          if (isGymWave(nearbyWave, isGymOffset) || FIXED_BATTLE_WAVES.has(nearbyWave)) {
            isAllowed = false;
          } else if (nearbyWave < wave && trainerRolls[nearbyWave]) {
            isAllowed = false;
          }
        }
        isRandomTrainer = isAllowed && trainerRolls[wave] === 1;
        isWild = !isRandomTrainer;
      }

      if (isRandomTrainer && SCIENTIST_BIOMES.has(biome) && rollTrainerType(biome) === "SCIENTIST") {
        meltanFightsByWave[wave]! += partyTables.normal[wave]!;
      }

      const canHaveEncounter = isWild && wave % 10 !== 0 && wave % 10 !== 1 && wave >= 10 && wave <= 180;
      if (!canHaveEncounter) {
        continue;
      }
      const expectedEncounterCount = (12 / 170) * (wave - 10);
      const favoredSpawnChance =
        encounterSpawnChance + Math.min((expectedEncounterCount - encounterCount) * 15, 128);
      const spawns = wave > 3 + lastEncounterWave && randomInt(256) < favoredSpawnChance;
      if (!spawns) {
        encounterSpawnChance += 3;
        continue;
      }
      encounterSpawnChance = 3;
      encounterCount++;
      lastEncounterWave = wave;

      const tierWeights = [66 - 6 * commonEncountersSeen, 40 - 4 * greatEncountersSeen, 19, 3] as const;
      const totalWeight = tierWeights[0] + tierWeights[1] + tierWeights[2] + tierWeights[3];
      const tierValue = randomInt(totalWeight);
      let tier =
        tierValue > totalWeight - tierWeights[0] ? 0
        : tierValue > totalWeight - tierWeights[0] - tierWeights[1] ? 1
        : tierValue > totalWeight - tierWeights[0] - tierWeights[1] - tierWeights[2] ? 2
        : 3;
      // Rogue encounters need wave 30; Ultra always has one, so only Rogue falls back early.
      if (tier === 3 && wave < 30) {
        tier = 2;
      }
      let encounterType = "OTHER";
      if (tier === 1) {
        const candidates = (GREAT_ENCOUNTERS[biome] ?? DEFAULT_GREAT_ENCOUNTERS).filter(
          candidate => candidate !== lastEncounterType && !(candidate === "DELIBIRDY" && delibirdyCount >= 4),
        );
        if (candidates.length === 0) {
          tier = 0;
        } else {
          encounterType = candidates[randomInt(candidates.length)]!;
        }
      }
      if (tier === 0) {
        commonEncountersSeen++;
      } else if (tier === 1) {
        greatEncountersSeen++;
      }
      if (encounterType === "DELIBIRDY") {
        delibirdyCount++;
      }
      lastEncounterType = encounterType;

      if (encounterType === "MYSTERIOUS_CHALLENGERS" && SCIENTIST_BIOMES.has(biome)) {
        // Option 1 is a random biome trainer; option 2 rerolls up to five times for a different type.
        const normalTrainerType = rollTrainerType(biome);
        let hardTrainerType = rollTrainerType(biome);
        for (let retry = 0; retry < 5 && hardTrainerType === normalTrainerType; retry++) {
          hardTrainerType = rollTrainerType(biome);
        }
        const normalMeltan = normalTrainerType === "SCIENTIST" ? partyTables.normal[wave]! : 0;
        const hardMeltan = hardTrainerType === "SCIENTIST" ? partyTables.hard[wave]! : 0;
        meltanFightsByWave[wave]! += Math.max(normalMeltan, hardMeltan);
      }
    }
  }
  return meltanFightsByWave.map(meltanFights => meltanFights / RUN_COUNT);
}

// #endregion

// #region Route planning

/** A route to each position that passes no Scientist biome, so a biome's value does not depend on the biomes before it. */
const NEUTRAL_ROUTE: readonly BiomeName[] = [
  "TOWN",
  "PLAINS",
  "GRASS",
  "TALL_GRASS",
  "CAVE",
  "BADLANDS",
  "MOUNTAIN",
  "VOLCANO",
];

/**
 * The first position a Scientist biome can be offered at. Before it, a run is in Town, then the
 * Plains or a biome Teleporting Hijinks sends it to, and none of those offers a Scientist biome.
 */
const FIRST_SCIENTIST_POSITION = 3;
/** Meltan always evolves by wave 75, so later positions are worth nothing. */
const LAST_USEFUL_POSITION = 7;
/** The first biome choice comes at the end of wave 20, so earlier positions are never read. */
const FIRST_READ_POSITION = 2;

/** Expected Meltan fights during the ten waves spent in `biome` at `position`. */
function getBiomeValue(biome: BiomeName, position: number, partyTables: MeltanPartyTables): number {
  const route = NEUTRAL_ROUTE.slice();
  route[position] = biome;
  const meltanFightsByWave = simulateRuns(route, position * 10 + 10, partyTables);
  let total = 0;
  for (let wave = position * 10 + 1; wave <= position * 10 + 10; wave++) {
    total += meltanFightsByWave[wave]!;
  }
  return total;
}

/** Each set of biomes the choice can offer, with its chance. */
function listOfferSets(links: readonly BiomeLink[]): { biomes: BiomeName[]; chance: number }[] {
  let offerSets: { biomes: BiomeName[]; chance: number }[] = [{ biomes: [], chance: 1 }];
  for (const link of links) {
    const [biome, weight]: [BiomeName, number] = Array.isArray(link) ? link : [link, 1];
    offerSets = offerSets.flatMap(offerSet =>
      weight === 1
        ? [{ biomes: [...offerSet.biomes, biome], chance: offerSet.chance }]
        : [
            { biomes: [...offerSet.biomes, biome], chance: offerSet.chance / weight },
            { biomes: offerSet.biomes, chance: offerSet.chance * (1 - 1 / weight) },
          ],
    );
  }
  return offerSets.filter(offerSet => offerSet.biomes.length > 0);
}

/** Expected Meltan fights from entering each biome at each position, taking the best biome at every later fork. */
function planRoutes(biomeValues: ReadonlyMap<string, number>): (biome: BiomeName, position: number) => number {
  const routeValues = new Map<string, number>();
  const getRouteValue = (biome: BiomeName, position: number): number => {
    if (position > LAST_USEFUL_POSITION) {
      return 0;
    }
    const key = `${biome}@${position}`;
    const cachedValue = routeValues.get(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }
    let nextValue = 0;
    for (const { biomes, chance } of listOfferSets(BIOME_LINKS[biome]!)) {
      nextValue += chance * Math.max(...biomes.map(nextBiome => getRouteValue(nextBiome, position + 1)));
    }
    const routeValue = (biomeValues.get(key) ?? 0) + nextValue;
    routeValues.set(key, routeValue);
    return routeValue;
  };
  return getRouteValue;
}

// #endregion

// #region Report

const partyTables = buildMeltanPartyTables();
const biomeValues = new Map<string, number>();
for (const biome of SCIENTIST_BIOMES) {
  for (let position = FIRST_SCIENTIST_POSITION; position <= LAST_USEFUL_POSITION; position++) {
    biomeValues.set(`${biome}@${position}`, getBiomeValue(biome, position, partyTables));
  }
}
const getRouteValue = planRoutes(biomeValues);

// Town is where every run starts, and no link leads back to it.
const tableBiomes = (Object.keys(BIOME_LINKS) as BiomeName[]).filter(biome => biome !== "TOWN").sort();
console.log("const ROUTE_VALUES: Partial<Record<number, readonly number[]>> = {");
for (const biome of tableBiomes) {
  const row = Array.from({ length: LAST_USEFUL_POSITION + 1 }, (_, position) =>
    position < FIRST_READ_POSITION ? 0 : Math.round(getRouteValue(biome, position) * 10000 * 100) / 100,
  );
  if (row.some(value => value > 0)) {
    console.log(`  [BiomeId.${biome}]: [${row.join(", ")}],`);
  }
}
console.log("};");

// #endregion
