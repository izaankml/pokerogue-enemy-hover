import type { BattlerIndex } from "#enums/battler-index";
import type { MoveId } from "#enums/move-id";
import type { SpeciesId } from "#enums/species-id";

export type PlayerAction =
  | { kind: "move"; move: MoveId; target?: BattlerIndex }
  | { kind: "switch"; species: SpeciesId };

/** One turn of commands, keyed by the species in each field slot. */
export type TurnCommands = Partial<Record<SpeciesId, PlayerAction>>;

/** A turn's commands, and the Pokemon sent in for any of yours that faint during it, in prompt order. */
export interface TurnPlan {
  commands: TurnCommands;
  replacements: SpeciesId[];
}

export interface PokemonState {
  species: SpeciesId;
  name: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
  onField: boolean;
  shields: number;
  status: string;
  tags: string[];
  lastMove: MoveId | undefined;
  turnsOnField: number;
  /** Berries held, by `BerryType` name, with how many of each. */
  berries: Partial<Record<string, number>>;
}

export interface BattleState {
  turnsPlayed: number;
  gameOver: boolean;
  player: PokemonState[];
  field: SpeciesId[];
  /** The enemy that must faint. */
  foe: PokemonState;
  /** The enemy to catch. */
  catchTarget: PokemonState;
  messages: string[];
}
