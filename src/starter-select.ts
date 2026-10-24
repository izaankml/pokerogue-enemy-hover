import { STARTER_CELL_AREA, STARTER_SELECT_UI_HANDLER_NAME } from "./constants.ts";
import { getNatureProgress, type ProgressItem } from "./enemy-summary.ts";
import type { BattleSceneView, DexEntryView, SpeciesView, StarterSelectUiHandlerView } from "./game-types.ts";
import { isInside } from "./geometry.ts";

export interface HoveredStarter {
  species: SpeciesView;
  dexEntry: DexEntryView;
}

export interface StarterSummary {
  kind: "starter";
  title: string;
  natures: ProgressItem;
}

/**
 * Finds the starter under the pointer on the starter select screen. Uncaught starters are left
 * out, since they have no natures unlocked.
 */
export function findHoveredStarter(battleScene: BattleSceneView, gameX: number, gameY: number): HoveredStarter | null {
  const handler = battleScene.ui?.getHandler();
  if (handler?.constructor.name !== STARTER_SELECT_UI_HANDLER_NAME) {
    return null;
  }
  const { starterContainers, filterBar, starterSelectMessageBoxContainer } = handler as StarterSelectUiHandlerView;
  // An open filter dropdown or a message box can cover the grid.
  if (filterBar?.openDropDown || starterSelectMessageBoxContainer?.visible) {
    return null;
  }
  const hoveredContainer = starterContainers?.find(container => {
    if (!container.visible) {
      return false;
    }
    const localPoint = container.getWorldTransformMatrix().applyInverse(gameX, gameY);
    return isInside(STARTER_CELL_AREA, localPoint.x, localPoint.y);
  });
  if (!hoveredContainer) {
    return null;
  }
  const { species } = hoveredContainer;
  const dexEntry = battleScene.gameData?.dexData[species.speciesId];
  return dexEntry?.caughtAttr ? { species, dexEntry } : null;
}

export function summarizeStarter({ species, dexEntry }: HoveredStarter): StarterSummary {
  return {
    kind: "starter",
    title: species.name,
    natures: getNatureProgress(dexEntry),
  };
}
