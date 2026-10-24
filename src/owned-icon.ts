import { OWNED_ICON_NEW_UNLOCK_TINT } from "./constants.ts";
import { hasNewCatchUnlocks, type SummaryContext } from "./enemy-summary.ts";
import type { BattleSceneView, EnemyPokemonView } from "./game-types.ts";

/** How often each enemy is checked again, since a catch elsewhere can change what is new. */
const RECHECK_INTERVAL_MS = 1000;

const lastCheckTimes = new WeakMap<EnemyPokemonView, number>();

/**
 * Tints the owned icon of each enemy whose catch would unlock something, extending the game's
 * own tint for new forms, genders, shinies and abilities to natures and IVs. It only adds the
 * tint, so the game's own decision always stands.
 */
export function tintOwnedIconsForNewUnlocks(battleScene: BattleSceneView, context: SummaryContext): void {
  const now = performance.now();
  for (const enemy of battleScene.getEnemyField(true)) {
    const ownedIcon = enemy.battleInfo?.ownedIcon;
    if (!ownedIcon?.visible || ownedIcon.tintTopLeft === OWNED_ICON_NEW_UNLOCK_TINT) {
      continue;
    }
    if (now - (lastCheckTimes.get(enemy) ?? Number.NEGATIVE_INFINITY) < RECHECK_INTERVAL_MS) {
      continue;
    }
    lastCheckTimes.set(enemy, now);
    if (hasNewCatchUnlocks(enemy, context)) {
      ownedIcon.setTint(OWNED_ICON_NEW_UNLOCK_TINT);
    }
  }
}
