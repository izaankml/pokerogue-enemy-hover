import { highlightMeltanRouteBiomes } from "./biome-select.ts";
import {
  BATTLE_UI_HANDLER_NAMES,
  CONFIRM_UI_HANDLER_NAME,
  EVOLUTION_SCENE_UI_HANDLER_NAME,
  IV_SCANNER_MODIFIER_NAME,
  UI_CANVAS_WIDTH,
} from "./constants.ts";
import { type SummaryContext, summarizeEnemy } from "./enemy-summary.ts";
import type { BattleSceneView, EnemyPokemonView, PhaserGameView, SpriteView, UiHandlerView } from "./game-types.ts";
import { type GameRectangle, isInside } from "./geometry.ts";
import { labelPartySlotsForMint } from "./mint-labels.ts";
import { HoverOverlay, type OverlaySummary } from "./overlay.ts";
import { tintOwnedIconsForNewUnlocks } from "./owned-icon.ts";
import { findHoveredStarter, summarizeStarter } from "./starter-select.ts";
import { findStarterSpecies } from "./starter-species.ts";
import { readWindowStyle } from "./window-style.ts";

const BATTLE_SCENE_KEY = "battle";

interface PointerPosition {
  clientX: number;
  clientY: number;
}

interface ActiveBattle {
  battleScene: BattleSceneView;
  summaryContext: SummaryContext;
}

/** The pointer's position on the game canvas. */
interface CanvasPoint {
  gameX: number;
  gameY: number;
  /** CSS pixels per game UI pixel at the canvas's current size. */
  uiPixelSize: number;
}

/** An enemy or starter under the pointer. */
interface HoverTarget {
  /** Identifies the target, so the overlay is rebuilt only when the target changes. */
  key: string;
  buildSummary(): OverlaySummary;
  uiPixelSize: number;
}

/**
 * Every frame, tints owned icons for new unlocks, labels the party screen while a mint's target is
 * chosen, and shows the overlay for the enemy or starter under the pointer.
 */
export function watchGame(game: PhaserGameView): void {
  const overlay = new HoverOverlay();
  const hitTester = new EnemyHitTester();
  let pointer: PointerPosition | null = null;
  let hasLoggedError = false;

  window.addEventListener(
    "pointermove",
    event => {
      // Touch input has no hover state.
      pointer = event.pointerType === "touch" ? null : { clientX: event.clientX, clientY: event.clientY };
    },
    { capture: true, passive: true },
  );
  window.addEventListener("mouseout", event => {
    if (!event.relatedTarget) {
      pointer = null;
    }
  });
  window.addEventListener("blur", () => {
    pointer = null;
  });

  const updateFrame = (): void => {
    try {
      const battleScene = game.scene.getScene(BATTLE_SCENE_KEY) as BattleSceneView | null;
      if (battleScene) {
        highlightMeltanRouteBiomes(battleScene);
      }
      const battle = battleScene && getActiveBattle(battleScene);
      if (battle) {
        tintOwnedIconsForNewUnlocks(battle.battleScene, battle.summaryContext);
        labelPartySlotsForMint(battle.battleScene, battle.summaryContext.gameData);
      }
      const canvasPoint = pointer && toCanvasPoint(game, pointer);
      const target = canvasPoint && battleScene && findHoverTarget(battleScene, battle, canvasPoint, hitTester);
      if (pointer && battleScene && target) {
        overlay.show(target.key, target.buildSummary, pointer.clientX, pointer.clientY, {
          uiPixelSize: target.uiPixelSize,
          windowStyle: readWindowStyle(battleScene),
        });
      } else {
        overlay.hide();
      }
    } catch (error) {
      overlay.hide();
      if (!hasLoggedError) {
        hasLoggedError = true;
        console.error("[pokerogue-enemy-hover]", error);
      }
    }
    requestAnimationFrame(updateFrame);
  };
  requestAnimationFrame(updateFrame);
}

function getActiveBattle(battleScene: BattleSceneView): ActiveBattle | null {
  const { gameData } = battleScene;
  if (!battleScene.currentBattle || !gameData) {
    return null;
  }
  return {
    battleScene,
    summaryContext: {
      gameData,
      hasIvScanner:
        battleScene.modifiers?.some(modifier => modifier.constructor.name === IV_SCANNER_MODIFIER_NAME) ?? false,
      findStarterSpecies: speciesId => findStarterSpecies(battleScene, speciesId),
    },
  };
}

function toCanvasPoint(game: PhaserGameView, pointer: PointerPosition): CanvasPoint | null {
  const { canvas } = game;
  if (!canvas) {
    return null;
  }
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width === 0 || canvasRect.height === 0) {
    return null;
  }
  const gameX = ((pointer.clientX - canvasRect.left) * canvas.width) / canvasRect.width;
  const gameY = ((pointer.clientY - canvasRect.top) * canvas.height) / canvasRect.height;
  if (gameX < 0 || gameY < 0 || gameX >= canvas.width || gameY >= canvas.height) {
    return null;
  }
  return { gameX, gameY, uiPixelSize: canvasRect.width / UI_CANVAS_WIDTH };
}

function findHoverTarget(
  battleScene: BattleSceneView,
  battle: ActiveBattle | null,
  { gameX, gameY, uiPixelSize }: CanvasPoint,
  hitTester: EnemyHitTester,
): HoverTarget | null {
  if (battle && isBattleUiShown(battleScene)) {
    const enemy = hitTester.find(battleScene, gameX, gameY);
    return (
      enemy && {
        key: `enemy:${enemy.id}`,
        buildSummary: () => summarizeEnemy(enemy, battle.summaryContext),
        uiPixelSize,
      }
    );
  }
  const starter = findHoveredStarter(battleScene, gameX, gameY);
  return (
    starter && {
      key: `starter:${starter.species.speciesId}`,
      buildSummary: () => summarizeStarter(starter),
      uiPixelSize,
    }
  );
}

/**
 * Finds the enemy under the pointer. The area its sprite last covered is remembered, so the
 * overlay stays in place while a catch shrinks and hides the sprite under a still pointer.
 */
class EnemyHitTester {
  private lastHit: { enemy: EnemyPokemonView; spriteArea: GameRectangle } | null = null;

  find(battleScene: BattleSceneView, gameX: number, gameY: number): EnemyPokemonView | null {
    const enemies = battleScene.getEnemyField(true);
    const enemy = findEnemyWithSpriteAt(battleScene, enemies, gameX, gameY);
    const sprite = enemy?.getSprite();
    if (enemy && sprite) {
      const { x, y, width, height } = sprite.getBounds();
      this.lastHit = { enemy, spriteArea: { x, y, width, height } };
      return enemy;
    }
    // Until it is caught or faints, the enemy stays on the field even while its sprite is hidden.
    const { lastHit } = this;
    if (
      lastHit
      && enemies.includes(lastHit.enemy)
      && lastHit.enemy.isOnField()
      && isInside(lastHit.spriteArea, gameX, gameY)
    ) {
      return lastHit.enemy;
    }
    this.lastHit = null;
    return null;
  }
}

function findEnemyWithSpriteAt(
  battleScene: BattleSceneView,
  enemies: readonly EnemyPokemonView[],
  gameX: number,
  gameY: number,
): EnemyPokemonView | undefined {
  const enemiesUnderPointer = enemies.filter(enemy => {
    const sprite = enemy.getSprite();
    return enemy.visible && sprite?.visible && enemy.isOnField() && sprite.getBounds().contains(gameX, gameY);
  });
  // Where sprites overlap, prefer the one with an opaque pixel under the pointer.
  return enemiesUnderPointer.length > 1
    ? (enemiesUnderPointer.find(candidate => isOpaqueAt(battleScene, candidate.getSprite(), gameX, gameY))
        ?? enemiesUnderPointer[0])
    : enemiesUnderPointer[0];
}

/** Hides the overlay while menus such as the party or summary screens cover the field. */
function isBattleUiShown(battleScene: BattleSceneView): boolean {
  const { ui } = battleScene;
  const currentHandler = ui?.getHandler();
  const handlerName = currentHandler?.constructor.name;
  if (handlerName === undefined) {
    return false;
  }
  if (BATTLE_UI_HANDLER_NAMES.has(handlerName)) {
    return true;
  }
  // A yes/no prompt, such as "Will you switch Pokémon?", keeps the field in view unless a
  // full-screen menu beneath it is still open.
  return (
    handlerName === CONFIRM_UI_HANDLER_NAME
    && (ui?.handlers ?? []).every(
      handler =>
        !handler?.active
        || handler === currentHandler
        || BATTLE_UI_HANDLER_NAMES.has(handler.constructor.name)
        || isClosedEvolutionScene(handler),
    )
  );
}

/** The evolution scene stays `active` after it closes, but hides its message window. */
function isClosedEvolutionScene(handler: UiHandlerView): boolean {
  return handler.constructor.name === EVOLUTION_SCENE_UI_HANDLER_NAME && handler.messageContainer?.visible === false;
}

function isOpaqueAt(
  battleScene: BattleSceneView,
  sprite: SpriteView | undefined,
  gameX: number,
  gameY: number,
): boolean {
  if (!sprite) {
    return false;
  }
  const localPoint = sprite.getWorldTransformMatrix().applyInverse(gameX, gameY);
  const alpha = battleScene.textures.getPixelAlpha(
    localPoint.x + sprite.displayOriginX,
    localPoint.y + sprite.displayOriginY,
    sprite.texture.key,
    sprite.frame.name,
  );
  return (alpha ?? 0) > 0;
}
