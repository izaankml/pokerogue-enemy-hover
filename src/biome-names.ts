import { BiomeId } from "./constants.ts";

/** The game's biome name file for one language, such as `/locales/en/biomes.json`. */
const BIOME_NAMES_FILE_PATH = /\/locales\/[^/]+\/biomes\.json$/;

const biomeIdsByName = new Map<string, number>();
const readFileUrls = new Set<string>();

/**
 * Reads every biome name file the game loads, so that a menu label in the player's language, or
 * in the English the game falls back to, leads back to its biome.
 */
export function watchBiomeNames(): void {
  new PerformanceObserver(entryList => {
    for (const { name: fileUrl } of entryList.getEntries()) {
      // Reading a file adds an entry of its own, which the set of read files skips.
      if (readFileUrls.has(fileUrl) || !BIOME_NAMES_FILE_PATH.test(new URL(fileUrl).pathname)) {
        continue;
      }
      readFileUrls.add(fileUrl);
      readBiomeNames(fileUrl).catch(error => console.error("[pokerogue-enemy-hover]", error));
    }
  }).observe({ type: "resource", buffered: true });
}

export function findBiomeByName(name: string): number | undefined {
  return biomeIdsByName.get(name);
}

async function readBiomeNames(fileUrl: string): Promise<void> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Biome names at ${fileUrl} returned HTTP ${response.status}`);
  }
  const namesByKey: Record<string, unknown> = await response.json();
  for (const [biomeKey, biomeId] of Object.entries(BiomeId)) {
    const name = namesByKey[toLocaleKey(biomeKey)];
    if (typeof name === "string") {
      biomeIdsByName.set(name, biomeId);
    }
  }
}

/** The game's locale keys are its enum keys in camel case, such as `tallGrass` for `TALL_GRASS`. */
function toLocaleKey(enumKey: string): string {
  return enumKey.toLowerCase().replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());
}
