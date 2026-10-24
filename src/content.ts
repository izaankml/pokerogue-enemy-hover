import { watchBiomeNames } from "./biome-names.ts";
import { captureGameOnCreate } from "./capture-game.ts";
import { watchGame } from "./hover-tracker.ts";

captureGameOnCreate(game => {
  console.info("[pokerogue-enemy-hover] attached to the game");
  watchGame(game);
});
watchBiomeNames();
