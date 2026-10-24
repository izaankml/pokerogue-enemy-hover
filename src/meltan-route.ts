import { BiomeId } from "./constants.ts";

/** Each biome lasts ten waves in classic, so a biome's position on a route sets the waves spent there. */
const WAVES_PER_BIOME = 10;

/** Biomes within this fraction of the best one count as equally good, since the values are simulated. */
const TIE_TOLERANCE = 0.02;

/**
 * Expected Meltan fights per 10,000 classic runs from entering a biome at each position on, when
 * every later fork takes its best biome, from a simulation of the game's rules. Biomes and
 * positions not listed are worth nothing.
 */
const ROUTE_VALUES: Partial<Record<number, readonly number[]>> = {
  [BiomeId.BADLANDS]: [0, 0, 8.75, 11.31, 5.71, 2.55, 1.53, 0],
  [BiomeId.BEACH]: [0, 0, 2.56, 1.04, 0, 0, 0, 0],
  [BiomeId.CAVE]: [0, 0, 11.31, 10.46, 5.66, 2.56, 1.04, 0],
  [BiomeId.CONSTRUCTION_SITE]: [0, 0, 4.38, 1.8, 1.04, 0, 0, 0],
  [BiomeId.DESERT]: [0, 0, 3.11, 8.75, 11.31, 5.71, 2.55, 1.53],
  [BiomeId.DOJO]: [0, 0, 7.34, 3.49, 1.66, 0.76, 0, 0],
  [BiomeId.FAIRY_CAVE]: [0, 0, 2.02, 0.96, 0.41, 0.28, 0, 0],
  [BiomeId.FOREST]: [0, 0, 5.71, 2.55, 1.53, 0, 0, 0],
  [BiomeId.GRASS]: [0, 0, 5.66, 2.56, 1.04, 0, 0, 0],
  [BiomeId.GRAVEYARD]: [0, 0, 5.66, 2.56, 1.04, 0, 0, 0],
  [BiomeId.ICE_CAVE]: [0, 0, 1.53, 0.09, 0, 0, 0, 0],
  [BiomeId.ISLAND]: [0, 0, 2.56, 1.04, 0, 0, 0, 0],
  [BiomeId.JUNGLE]: [0, 0, 11.31, 5.71, 2.55, 1.53, 0, 0],
  [BiomeId.LABORATORY]: [0, 0, 1.8, 8.27, 15.2, 8.76, 3.59, 2.09],
  [BiomeId.LAKE]: [0, 0, 2.56, 1.04, 0, 0, 0, 0],
  [BiomeId.MEADOW]: [0, 0, 1.04, 0.41, 0.28, 0, 0, 0],
  [BiomeId.METROPOLIS]: [0, 0, 1.04, 0, 0, 0, 0, 0],
  [BiomeId.MOUNTAIN]: [0, 0, 3.51, 1.6, 0.9, 0.19, 0, 0],
  [BiomeId.PLAINS]: [0, 0, 2.56, 1.04, 0, 0, 0, 0],
  [BiomeId.POWER_PLANT]: [0, 0, 7.6, 4.38, 1.8, 1.04, 0, 0],
  [BiomeId.RUINS]: [0, 0, 2.08, 3.11, 3.94, 1.92, 0.82, 0.56],
  [BiomeId.SEA]: [0, 0, 5.66, 2.56, 1.04, 0, 0, 0],
  [BiomeId.SEABED]: [0, 0, 10.46, 5.66, 2.56, 1.04, 0, 0],
  [BiomeId.SPACE]: [0, 0, 3.11, 3.94, 1.92, 0.82, 0.56, 0],
  [BiomeId.SWAMP]: [0, 0, 5.66, 2.56, 1.04, 0, 0, 0],
  [BiomeId.TALL_GRASS]: [0, 0, 10.46, 5.66, 2.56, 1.04, 0, 0],
  [BiomeId.TEMPLE]: [0, 0, 8.75, 11.31, 5.71, 2.55, 1.53, 0],
  [BiomeId.VOLCANO]: [0, 0, 1.04, 0, 0, 0, 0, 0],
  [BiomeId.WASTELAND]: [0, 0, 11.31, 5.71, 2.55, 1.53, 0, 0],
};

/**
 * Picks the offered biomes worth the most toward fighting a Meltan, choosing at the end of
 * `waveIndex`. Returns none when no offered biome still leads to a Scientist in time.
 */
export function pickMeltanRouteBiomes(waveIndex: number, offeredBiomes: readonly number[]): number[] {
  const nextPosition = Math.floor((waveIndex - 1) / WAVES_PER_BIOME) + 1;
  const valueOf = (biome: number): number => ROUTE_VALUES[biome]?.[nextPosition] ?? 0;
  const bestValue = Math.max(0, ...offeredBiomes.map(valueOf));
  if (bestValue === 0) {
    return [];
  }
  return offeredBiomes.filter(biome => valueOf(biome) >= bestValue * (1 - TIE_TOLERANCE));
}
