import type { PhaserGameView } from "./game-types.ts";

/**
 * Assigned exactly once, by the Phaser `Game` constructor. Neither Phaser nor
 * PokeRogue assigns it anywhere else, so a setter on `Object.prototype` for
 * this name receives the game instance.
 */
const HOOKED_PROPERTY = "domContainer";

/** Must run before the page's scripts, which is what `run_at: document_start` provides. */
export function captureGameOnCreate(onGameCreated: (game: PhaserGameView) => void): void {
  Object.defineProperty(Object.prototype, HOOKED_PROPERTY, {
    configurable: true,
    get() {
      return undefined;
    },
    set(this: object, value: unknown) {
      // Give the instance an ordinary own property so later reads and writes behave normally.
      Object.defineProperty(this, HOOKED_PROPERTY, { value, writable: true, enumerable: true, configurable: true });
      if (!isPhaserGame(this)) {
        return;
      }
      delete (Object.prototype as Record<string, unknown>)[HOOKED_PROPERTY];
      try {
        onGameCreated(this);
      } catch (error) {
        console.error("[pokerogue-enemy-hover]", error);
      }
    },
  });
}

function isPhaserGame(candidate: object): candidate is PhaserGameView {
  // The constructor assigns these two just before the hooked property.
  return Object.hasOwn(candidate, "config") && Object.hasOwn(candidate, "renderer");
}
