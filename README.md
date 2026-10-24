# PokeRogue Enemy Hover

A browser extension for [pokerogue.net](https://pokerogue.net). Hovering an enemy Pokémon's sprite in battle shows:

- its base stats and base stat total
- its starter's progress: passive, egg moves, cost reduction, natures, shiny variants, and candy against the price of a same-species egg

Trainer Pokémon, gym leaders' included, cannot be caught, so they show base stats only.

The game grays out the Poké Ball next to an enemy's name when catching it would unlock a new form, gender, shiny tier or ability. The extension grays it out for a new nature as well, for a perfect 31 IV your starter does not have yet, and, while you hold the IV Scanner, for any IV higher than your starter's.

After you choose a mint as a reward, the party screen labels each slot in place of its HP bar, the way the game labels slots for a TM:

- **New nature** in green: the mint unlocks the nature for a starter in the Pokémon's line.
- **New nature** in orange: the starter already has the nature, but a later stage up to this Pokémon does not.
- **Owned**: every stage up to this Pokémon already has the nature.
- **No effect**: the Pokémon already has the mint's nature.

Cancelling the party screen returns you to the rewards with the mint unspent. A slot keeps its HP bar when the game would unlock nothing, because the line's first stage has never been caught. For a fusion, only the first species' line counts.

In a classic run, until the Pokédex counts Meltan as fought, the biome choice that a Map offers colors the biome with the best chance of leading to a fight with one. The color is the one the game gives special Mystery Encounter choices: green in the modern theme, gold in the legacy one. Meltan never appears in the wild; only Scientist trainers carry it, they appear only in the Laboratory, the Desert and the Ancient Ruins, and their Meltan begins to evolve at wave 69.

The ranking comes from a simulation of the game's rules: random trainer waves, the Mysterious Challengers encounter, Scientist parties and evolution, with the best biome taken at every later fork. `src/meltan-route.ts` holds the resulting value of each biome at each ten-wave stage of a run, which `pnpm simulate-meltan-route` prints from `scripts/simulate-meltan-route.ts`. In practice it steers you along Plains → Grassy Field → Tall Grass → Cave → Laboratory for waves 51 to 60, and through Badlands → Desert → Ancient Ruins when the Cave does not offer the Laboratory. It works from any biome, including one a Mystery Encounter teleported you to.

Biomes within 2% of the best are colored as well. When no offered biome still reaches a Scientist before Meltan evolves, none is colored.

On the starter select screen, hovering a caught starter shows how many of the 25 natures it has unlocked. The tooltip stays hidden while a menu, filter dropdown or message covers the grid.

The tooltip uses the game's current window type and UI theme (modern or legacy). The extension reads your save data from the running game; the Poké Ball tint, the mint labels and the biome choice colors are the only things it changes.

## Install

```sh
pnpm install
pnpm build
```

**Chrome, Edge, Brave:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the `dist/` folder.

**Firefox 128+:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/manifest.json`. Temporary add-ons are removed when Firefox restarts.

Reload the game tab afterwards. The DevTools console shows `[pokerogue-enemy-hover] v<version> attached to the game` when the extension has found the game. The version comes from `package.json`, which the build also writes into `dist/manifest.json`, so the extensions page and the console both show which build is loaded.

For development, `pnpm watch` rebuilds on change; reload the extension and the game tab to pick up a new build.

## How it works

The game does not expose itself on `window`, so the content script runs in the page's own JavaScript context before any page script (`world: "MAIN"`, `run_at: "document_start"`). It installs a setter on `Object.prototype` for `domContainer`, a property that only the Phaser `Game` constructor assigns. The first assignment hands over the game instance, and the setter removes itself. From there the extension reads the `battle` scene each frame, hit-tests the pointer against the enemy sprites or the starter select grid cells, and draws the tooltip as a DOM element over the canvas. The tooltip's frame is the texture of the game's own tooltip window, whose key carries a `_legacy` suffix in the legacy theme.

The reward screen stays open beneath the party screen while you choose a reward's target, with its cursor still on the chosen reward. When that reward is a mint, the extension writes the labels into each party slot's description text, the one the game fills with "Able" or "Not able" for a TM. The game builds new slots each time the party screen opens, so the labels never outlast it.

A menu option carries only its label, in the player's language, so the extension reads the biome name files the game loads (`locales/<language>/biomes.json`) to tell which biome each label names. It wraps the option menu's `show` method, and when the biome choice opens the menu, sets the highlight color on the route's options just before the game draws them.

## When a game update breaks it

The extension depends on property and method names inside the game. Every one it uses is declared in `src/game-types.ts`, and mirrored game enums live in `src/constants.ts`. If the tooltip stops appearing, the console shows one `[pokerogue-enemy-hover]` error; compare the named member against the current game source. The game itself keeps running either way.

The Meltan route has no error to show when it goes stale. When an update changes biome links, trainer chances, the Scientist's species pool, trainer levels or Meltan's evolution, update the matching rules in `scripts/simulate-meltan-route.ts`, run `pnpm simulate-meltan-route`, and paste its output over `ROUTE_VALUES`.
