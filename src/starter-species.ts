import type { BattleSceneView, SpeciesView } from "./game-types.ts";

let starterSpeciesById: Map<number, SpeciesView> | null = null;

/**
 * Finds a starter species through the Pokédex page handler, which lists every starter species
 * once the UI is set up. Returns `undefined` until then.
 */
export function findStarterSpecies(battleScene: BattleSceneView, speciesId: number): SpeciesView | undefined {
  if (!starterSpeciesById) {
    const speciesList = battleScene.ui?.handlers
      ?.map(handler => handler?.allSpecies)
      .find(allSpecies => Array.isArray(allSpecies) && allSpecies.length > 0);
    if (!speciesList) {
      return undefined;
    }
    starterSpeciesById = new Map(speciesList.map(species => [species.speciesId, species]));
  }
  return starterSpeciesById.get(speciesId);
}
