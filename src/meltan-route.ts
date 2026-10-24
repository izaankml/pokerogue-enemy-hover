import { BiomeId } from "./constants.ts";

/** Each biome lasts ten waves in classic, so a biome's position on a route sets the waves spent there. */
const WAVES_PER_BIOME = 10;

/** Biomes within this fraction of the best one count as equally good, since the values are simulated. */
const TIE_TOLERANCE = 0.02;

/**
 * Expected Meltan fights per 10,000 classic runs from entering a biome at each position on, when
 * every later fork takes its best biome, as printed by `scripts/simulate-meltan-route.ts`. Biomes
 * and positions not listed are worth nothing.
 */
const ROUTE_VALUES: Partial<Record<number, readonly number[]>> = {
  [BiomeId.ABYSS]: [0, 0, 22.08, 11.82, 4.4, 1.58, 0, 0],
  [BiomeId.BADLANDS]: [0, 0, 17.61, 23.53, 11.8, 4.21, 2.36, 0],
  [BiomeId.BEACH]: [0, 0, 4.4, 1.58, 0, 0, 0, 0],
  [BiomeId.CAVE]: [0, 0, 23.53, 22.08, 11.82, 4.4, 1.58, 0],
  [BiomeId.CONSTRUCTION_SITE]: [0, 0, 9.72, 3.22, 1.58, 0, 0, 0],
  [BiomeId.DESERT]: [0, 0, 5.69, 17.61, 23.53, 11.8, 4.21, 2.36],
  [BiomeId.DOJO]: [0, 0, 15.11, 6.95, 2.69, 1.18, 0, 0],
  [BiomeId.FACTORY]: [0, 0, 8.78, 16.18, 9.72, 3.22, 1.58, 0],
  [BiomeId.FAIRY_CAVE]: [0, 0, 4.07, 2.04, 0.69, 0.42, 0, 0],
  [BiomeId.FOREST]: [0, 0, 11.8, 4.21, 2.36, 0, 0, 0],
  [BiomeId.GRASS]: [0, 0, 11.82, 4.4, 1.58, 0, 0, 0],
  [BiomeId.GRAVEYARD]: [0, 0, 11.82, 4.4, 1.58, 0, 0, 0],
  [BiomeId.ICE_CAVE]: [0, 0, 2.36, 0.14, 0, 0, 0, 0],
  [BiomeId.ISLAND]: [0, 0, 4.4, 1.58, 0, 0, 0, 0],
  [BiomeId.JUNGLE]: [0, 0, 23.53, 11.8, 4.21, 2.36, 0, 0],
  [BiomeId.LABORATORY]: [0, 0, 3.22, 15.98, 32.36, 19.44, 6.44, 3.17],
  [BiomeId.LAKE]: [0, 0, 4.4, 1.58, 0, 0, 0, 0],
  [BiomeId.MEADOW]: [0, 0, 2.04, 0.69, 0.42, 0, 0, 0],
  [BiomeId.METROPOLIS]: [0, 0, 1.58, 0, 0, 0, 0, 0],
  [BiomeId.MOUNTAIN]: [0, 0, 7.23, 2.78, 1.41, 0.28, 0, 0],
  [BiomeId.PLAINS]: [0, 0, 4.4, 1.58, 0, 0, 0, 0],
  [BiomeId.POWER_PLANT]: [0, 0, 16.18, 9.72, 3.22, 1.58, 0, 0],
  [BiomeId.RUINS]: [0, 0, 3.5, 5.69, 8, 4.08, 1.38, 0.85],
  [BiomeId.SEA]: [0, 0, 11.82, 4.4, 1.58, 0, 0, 0],
  [BiomeId.SEABED]: [0, 0, 22.08, 11.82, 4.4, 1.58, 0, 0],
  [BiomeId.SLUM]: [0, 0, 3.81, 1.58, 0, 0, 0, 0],
  [BiomeId.SNOWY_FOREST]: [0, 0, 4.21, 2.36, 0.14, 0, 0, 0],
  [BiomeId.SPACE]: [0, 0, 5.69, 8, 4.08, 1.38, 0.85, 0],
  [BiomeId.SWAMP]: [0, 0, 11.82, 4.4, 1.58, 0, 0, 0],
  [BiomeId.TALL_GRASS]: [0, 0, 22.08, 11.82, 4.4, 1.58, 0, 0],
  [BiomeId.TEMPLE]: [0, 0, 17.61, 23.53, 11.8, 4.21, 2.36, 0],
  [BiomeId.VOLCANO]: [0, 0, 1.58, 0, 0, 0, 0, 0],
  [BiomeId.WASTELAND]: [0, 0, 23.53, 11.8, 4.21, 2.36, 0, 0],
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
