import { watchBiomeNames } from "./biome-names.ts";
import { captureGameOnCreate } from "./capture-game.ts";
import { watchGame } from "./hover-tracker.ts";

/** The `package.json` version, which the build substitutes. */
declare const EXTENSION_VERSION: string;

captureGameOnCreate(game => {
  console.info(`[pokerogue-enemy-hover] v${EXTENSION_VERSION} attached to the game`);
  watchGame(game);
});
watchBiomeNames();
