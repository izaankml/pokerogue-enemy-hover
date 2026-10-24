import { findBiomeByName } from "./biome-names.ts";
import {
  MELTAN_SPECIES_ID,
  OPTION_SELECT_UI_HANDLER_NAME,
  SELECT_BIOME_PHASE_NAME,
  SPECIAL_OPTION_TEXT_STYLE,
} from "./constants.ts";
import type { BattleSceneView, OptionSelectConfigView, OptionSelectUiHandlerView } from "./game-types.ts";
import { pickMeltanRouteBiomes } from "./meltan-route.ts";

let wrappedHandlerList: readonly unknown[] | undefined;

/**
 * Wraps the option menus' `show`, so that the biome choice opens with the biomes on the best
 * route toward a Meltan colored. The game reads each option's color only when the menu opens.
 */
export function highlightMeltanRouteBiomes(battleScene: BattleSceneView): void {
  const handlers = battleScene.ui?.handlers;
  // The game builds a new handler list whenever it resets its UI.
  if (!handlers || handlers === wrappedHandlerList) {
    return;
  }
  wrappedHandlerList = handlers;
  for (const handler of handlers) {
    if (handler?.constructor.name !== OPTION_SELECT_UI_HANDLER_NAME) {
      continue;
    }
    const optionSelectHandler = handler as OptionSelectUiHandlerView;
    const show = optionSelectHandler.show;
    optionSelectHandler.show = args => {
      try {
        colorMeltanRouteOptions(battleScene, args[0] as OptionSelectConfigView | undefined);
      } catch (error) {
        console.error("[pokerogue-enemy-hover]", error);
      }
      return show.call(optionSelectHandler, args);
    };
  }
}

/**
 * Colors the offered biomes on the best Meltan route. Only classic runs follow the simulated
 * waves, and the hunt ends once the Pokédex counts Meltan as fought.
 */
function colorMeltanRouteOptions(battleScene: BattleSceneView, config: OptionSelectConfigView | undefined): void {
  const { phaseManager, gameMode, gameData, currentBattle } = battleScene;
  const options = config?.options;
  if (
    !options
    || phaseManager?.getCurrentPhase()?.phaseName !== SELECT_BIOME_PHASE_NAME
    || !gameMode?.isClassic
    || !gameData
    || gameData.dexData[MELTAN_SPECIES_ID]?.seenCount
    || !currentBattle
  ) {
    return;
  }
  const optionBiomes = options.map(option => findBiomeByName(option.label));
  const routeBiomes = pickMeltanRouteBiomes(
    currentBattle.waveIndex,
    optionBiomes.filter(biome => biome !== undefined),
  );
  options.forEach((option, optionIndex) => {
    const biome = optionBiomes[optionIndex];
    if (biome !== undefined && routeBiomes.includes(biome)) {
      option.color = SPECIAL_OPTION_TEXT_STYLE;
    }
  });
}
