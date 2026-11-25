# Battle search

Finds a sequence of commands that faints one enemy of a double battle and leaves the other alive to catch. It plays an exported Endless session in the PokeRogue test harness and runs a beam search over your commands.

A line it finds plays out the same way in the live game. The battle's random numbers are reseeded every turn from the wave's battle seed and the turn number, and the game saves only at the start of a wave, so refreshing and choosing Continue returns to turn 1 with the same rolls ahead. The same commands then give the same result.

## Requirements

- A PokeRogue checkout at `../pokerogue/beta` (or `--game <path>`) with its dependencies installed, on the same game version as the live game. A different version can roll differently.
- A session export (`*sessionData*.prsv`) at the root of this repo. The newest one is used unless you pass `--save <path>`.

The runner copies the `game/` folder into the checkout's `test/tests/scratch/`, runs it with vitest, and removes the copy afterwards, also when the run is stopped with Ctrl-C. The files in `game/` only compile there, so this repo's typecheck leaves them out.

## Use

1. `pnpm battle-search --depth 0` logs your party with its moves and both enemies, without searching.
2. Edit `game/encounter.ts` for the wave:
   - `CATCH_SLOT`: the enemy party index of the Pokemon to catch.
   - `REPLACEMENT_ORDER`: who to try first when one of yours faints. The search tries the others too.
   - `candidateActions`: the commands worth trying for each species. Every command added multiplies the work, so leave out the ones that cannot help.
   - `score`: how promising a state is. Only the order of the scores matters.
3. `pnpm battle-search` searches. `battle-search.log` shows the progress of each depth; follow it with `tail -f`. A found line goes to `battle-search.line.json`, and the log ends with that line played from the save turn by turn and a Master Ball thrown at the end.
4. `pnpm battle-search --replay battle-search.line.json` plays a line twice, once through the title screen and once through a reload, to check that both give the same result.
5. In the game, refresh, choose Continue, and enter the line turn by turn. `ENEMY` is the left enemy and `ENEMY_2` the right. "Then send in" names who to choose when one of yours faints. If a turn's messages differ from the log, refresh and start again from turn 1.

| Option | Default | Meaning |
| --- | --- | --- |
| `--save` | newest `*sessionData*.prsv` here | Session export to load |
| `--game` | `../pokerogue/beta` | PokeRogue checkout that runs the search |
| `--beam` | `10` | Lines kept at each depth |
| `--depth` | `30` | Turns searched before giving up; `0` only logs the party and the enemies |
| `--replay` | none | Line to replay in place of searching |
| `--check` | `0` | Random lines to check snapshots against, in place of searching |
| `--check-turns` | `10` | Turns in each line that `--check` plays |
| `--seed-shift` | `0` | Appends to the session seed, to see whether a line depends on this seed's luck |
| `--log` | `battle-search.log` | Progress and replay log |
| `--line` | `battle-search.line.json` | Where a found line is written |

## How the search works

Each depth is one turn. For every line kept from the previous depth, the search restores the battle as it stood after that line, plays each combination of candidate commands, and snapshots the result. When one of yours faints, it plays the turn again for each other Pokemon that could be sent in. It drops lines where the catch target faints or the run ends, merges lines that reach exactly the same state, and keeps the best `--beam` by `score`. At the first depth where a line faints the foe, it picks the one with the fewest of your Pokemon fainted, then the most HP left, and replays it from the save as a check.

Each turn played takes 30 to 50 ms. On wave 2830, a beam of 10 found a 12-turn line in under a minute, and a beam of 3 a 13-turn line in about 10 seconds.

### Snapshots

`game/battle-snapshot.ts` records the battle at a turn boundary: the own fields of every object reachable from the battle, the arena, both parties and the held items, as well as which Pokemon are on the field and the random number generator's state. Restoring writes those fields back into the same objects, so references between them stay valid. Species, moves, abilities and display objects are kept by reference without being recorded.

A field the snapshot cannot reach would make the search's states drift from the real game's. `pnpm battle-search --check 20` tests for this: it plays random lines through snapshots, playing a different turn before each one so that every restore has something to undo, then replays each line from the save and compares the two states at every turn boundary. A difference names the first field that differs. Run it when a new encounter brings mechanics the last one did not, such as a substitute, a weather change or a transformation. The search's own replay from the save also warns when it differs from the search.

The game keeps a few values in JavaScript `#private` fields, which the snapshot cannot read. Encore's `#addedThisTurn` is reset before every turn boundary, so it does no harm. Neutralizing Gas's `#beingRemoved` is set as the gas leaves the field, so a snapshot from before it left would restore the tag with the flag still set. Neither came up on wave 2830.

## The score for wave 2830

`score` measures the foe's HP lost in boss segments. Shields add nothing of their own, since a hit stops at the next shield and the HP left already reflects them. Each Sitrus Berry the foe holds counts as a quarter of its HP still to lose, so that making it eat the berry early is not mistaken for a setback. Fainted Pokemon of yours, and damage to the catch target, count against a line.
