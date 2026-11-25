import { BattlerIndex } from "#enums/battler-index";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import type { BattleState, PlayerAction, PokemonState } from "./types.ts";

// The rules for one wave: edit this file for each new encounter.

/** Enemy party index of the Pokemon to catch; the other enemy is the foe. */
export const CATCH_SLOT = 1;

/**
 * Who comes in when one of yours faints, first choice first: the tank, then the flinch and damage Pokemon.
 * The search also tries every other choice, so the order only sets which is tried first.
 */
export const REPLACEMENT_ORDER = [
  SpeciesId.PYUKUMUKU,
  SpeciesId.GOURGEIST,
  SpeciesId.KYOGRE,
  SpeciesId.CHIEN_PAO,
  SpeciesId.TEDDIURSA,
  SpeciesId.SHUCKLE,
];

/** The commands worth trying for one Pokemon on the field. Fewer candidates make a wider or deeper search affordable. */
export function candidateActions(pokemon: PokemonState, state: BattleState): PlayerAction[] {
  const foeCured = state.foe.tags.includes("SALT_CURED");
  const benchAlive = (species: SpeciesId) =>
    state.player.some(member => member.species === species && !member.fainted && !member.onField);
  const switchTo = (species: SpeciesId): PlayerAction[] => (benchAlive(species) ? [{ kind: "switch", species }] : []);
  switch (pokemon.species) {
    case SpeciesId.GOURGEIST:
      return [
        { kind: "move", move: MoveId.ROCK_SLIDE },
        { kind: "move", move: MoveId.DARK_VOID },
        ...(pokemon.turnsOnField <= 1 ? [{ kind: "move", move: MoveId.MAT_BLOCK } as PlayerAction] : []),
      ];
    case SpeciesId.KYOGRE:
      return [
        { kind: "move", move: MoveId.HURRICANE, target: BattlerIndex.ENEMY },
        { kind: "move", move: MoveId.PROTECT },
        ...(foeCured ? [] : switchTo(SpeciesId.PYUKUMUKU)),
      ];
    case SpeciesId.PYUKUMUKU:
      return [
        ...(foeCured ? [] : [{ kind: "move", move: MoveId.SALT_CURE, target: BattlerIndex.ENEMY } as PlayerAction]),
        { kind: "move", move: MoveId.BANEFUL_BUNKER },
        { kind: "move", move: MoveId.CURSE },
        ...(foeCured ? switchTo(SpeciesId.KYOGRE) : []),
      ];
    case SpeciesId.CHIEN_PAO:
      return [
        { kind: "move", move: MoveId.ICICLE_CRASH, target: BattlerIndex.ENEMY },
        { kind: "move", move: MoveId.ICICLE_CRASH, target: BattlerIndex.ENEMY_2 },
      ];
    case SpeciesId.TEDDIURSA:
      return [{ kind: "move", move: MoveId.FAKE_OUT, target: BattlerIndex.ENEMY_2 }];
    default:
      return [{ kind: "move", move: MoveId.ROCK_SLIDE }];
  }
}

/**
 * The HP a Pokemon has yet to lose: its HP, plus a quarter of its maximum for each Sitrus Berry, which it eats on
 * dropping below half. Other berries are left out, since this battle's moves do not set them off.
 */
function hpToLose(pokemon: PokemonState): number {
  return pokemon.hp + ((pokemon.berries.SITRUS ?? 0) * pokemon.maxHp) / 4;
}

/**
 * How promising a state is: higher is better, and negative infinity drops the line. `initial` is the state before
 * turn 1. Only the order of the scores matters.
 */
export function score(state: BattleState, initial: BattleState): number {
  if (state.catchTarget.fainted || state.gameOver) {
    return Number.NEGATIVE_INFINITY;
  }
  const memberFainted = (species: SpeciesId) =>
    state.player.find(member => member.species === species)?.fainted ?? false;
  const faints = state.player.filter(member => member.fainted).length;
  // Measured in boss segments of HP. Shields get no weight of their own: a hit stops at the next shield,
  // so the HP left already accounts for them.
  const segmentsOf = (pokemon: PokemonState, initialPokemon: PokemonState) =>
    ((hpToLose(initialPokemon) - hpToLose(pokemon)) / pokemon.maxHp) * (initialPokemon.shields + 1);
  const foeProgress = segmentsOf(state.foe, initial.foe);
  const catchTargetRisk = segmentsOf(state.catchTarget, initial.catchTarget);
  return (
    foeProgress * 1000
    + (state.foe.tags.includes("SALT_CURED") ? 1500 : 0)
    - faints * 2500
    - (memberFainted(SpeciesId.GOURGEIST) ? 2000 : 0)
    - (memberFainted(SpeciesId.PYUKUMUKU) ? 3000 : 0)
    - catchTargetRisk * 300
  );
}
