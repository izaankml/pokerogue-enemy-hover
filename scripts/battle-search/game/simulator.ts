import { saveKey } from "#app/constants";
import type { Phase } from "#app/phase";
import { BattlerIndex } from "#enums/battler-index";
import { BerryType } from "#enums/berry-type";
import { BattlerTagType } from "#enums/battler-tag-type";
import { MoveId } from "#enums/move-id";
import { PokeballType } from "#enums/pokeball";
import { SpeciesId } from "#enums/species-id";
import { StatusEffect } from "#enums/status-effect";
import { UiMode } from "#enums/ui-mode";
import type { EnemyPokemon, PlayerPokemon, Pokemon } from "#field/pokemon";
import { BerryModifier } from "#modifiers/modifier";
import type { TitlePhase } from "#phases/title-phase";
import type { GameManager } from "#test/framework/game-manager";
import type { SessionSaveData } from "#types/save-data";
import { AES, enc } from "crypto-js";
import fs from "node:fs";
import { vi } from "vitest";
import { type BattleSnapshot, captureBattle } from "./battle-snapshot.ts";
import { CATCH_SLOT, REPLACEMENT_ORDER } from "./encounter.ts";
import type { BattleState, PlayerAction, PokemonState, TurnCommands, TurnPlan } from "./types.ts";

const PHASE_TIMEOUT = 60_000;

/** The test harness's phase runner, whose members are private to it. */
interface Interceptor {
  state: "running" | "interrupted" | "idling";
  run(phase: Phase): Promise<void>;
}

/** How a turn ended. */
export interface TurnOutcome {
  /** No next turn follows: the foe or the catch target fainted, the run ended or the battle was won. */
  terminal: boolean;
  gameOver: boolean;
  messages: string[];
  /** The Pokemon sent in for those that fainted, in prompt order. */
  replacements: SpeciesId[];
  /** The Pokemon that could have been sent in at the first prompt, if any of yours fainted. */
  replacementChoices: SpeciesId[];
}

export function describeState(state: PokemonState): string {
  const shields = state.shields ? ` shields=${state.shields}` : "";
  return `${state.name} ${state.hp}/${state.maxHp}${shields} ${state.status} [${state.tags.join("/")}]`;
}

function formatAction(action: PlayerAction): string {
  if (action.kind === "switch") {
    return `switch to ${SpeciesId[action.species]}`;
  }
  const target = action.target === undefined ? "" : ` -> ${BattlerIndex[action.target]}`;
  return `${MoveId[action.move]}${target}`;
}

export function formatTurn(plan: TurnPlan): string {
  const commands = Object.entries(plan.commands)
    .map(([species, action]) => `${SpeciesId[Number(species)]}: ${formatAction(action!)}`)
    .join("; ");
  const replacements = plan.replacements.map(species => SpeciesId[species]).join(", ");
  return replacements ? `${commands}; then send in ${replacements}` : commands;
}

/** Read a line written by the search; a line without replacements uses the default order. */
export function readLine(path: string): TurnPlan[] {
  const entries = JSON.parse(fs.readFileSync(path, "utf8")) as (TurnPlan | TurnCommands)[];
  return entries.map(entry =>
    "commands" in entry && "replacements" in entry
      ? (entry as TurnPlan)
      : { commands: entry as TurnCommands, replacements: [] },
  );
}

function snapshotPokemon(pokemon: Pokemon): PokemonState {
  return {
    species: pokemon.species.speciesId,
    name: pokemon.name,
    hp: pokemon.hp,
    maxHp: pokemon.getMaxHp(),
    fainted: pokemon.isFainted(),
    onField: pokemon.isOnField() && !pokemon.isFainted(),
    shields: pokemon.isBoss() ? (pokemon as EnemyPokemon).bossSegmentIndex : 0,
    status: pokemon.status ? StatusEffect[pokemon.status.effect] : "-",
    tags: pokemon.summonData.tags.map(tag => BattlerTagType[tag.tagType]),
    lastMove: pokemon.getLastXMoves(1)[0]?.move,
    turnsOnField: pokemon.summonData.waveTurnCount,
    berries: Object.fromEntries(
      pokemon
        .getHeldItems()
        .filter(item => item instanceof BerryModifier)
        .map(berry => [BerryType[berry.berryType], berry.stackCount]),
    ),
  };
}

/**
 * Plays an exported session in the test harness. Turns run either from a fresh load of the save, which matches the
 * live game, or from a snapshot taken at a turn boundary of the same load.
 */
export class Simulator {
  public caught = false;
  private loadedFromTitle = false;
  private readonly interceptor: Interceptor;

  constructor(
    private readonly game: GameManager,
    private readonly savePath: string,
    private readonly seedShift: number,
    private readonly writeLog: (line: string) => void,
  ) {
    this.interceptor = game.phaseInterceptor as unknown as Interceptor;
    this.speedUpPhases();
  }

  /**
   * Run each phase with the harness clock advanced on every turn of the event loop, in place of waiting for the
   * clock's own one-millisecond tick and the interceptor's polling interval.
   */
  private speedUpPhases(): void {
    const interceptor = this.interceptor;
    interceptor.run = async (phase: Phase) => {
      interceptor.state = "running";
      phase.start();
      const deadline = Date.now() + PHASE_TIMEOUT;
      while (interceptor.state === "running") {
        if (Date.now() > deadline) {
          throw new Error(`${phase.phaseName} did not end within ${PHASE_TIMEOUT} ms; ${this.describeUi()}`);
        }
        await this.tick();
      }
    };
  }

  /** The UI mode and the queued prompts, for an error when a phase waits on input that never comes. */
  private describeUi(): string {
    const prompts = this.game.promptHandler["prompts"].map(
      prompt => `${prompt.phaseTarget}/${UiMode[prompt.mode]}`,
    );
    return `ui mode ${UiMode[this.game.scene.ui.mode]}, prompts [${prompts.join(", ")}]`;
  }

  /** Advance the harness clock by one step and let timers and prompts run. */
  private async tick(): Promise<void> {
    const clock = this.game.scene.time as unknown as {
      now: number;
      preUpdate(time: number, delta: number): void;
      update(time: number, delta: number): void;
    };
    clock.preUpdate(clock.now, 1);
    clock.update(clock.now, 1);
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  private readSession(): SessionSaveData {
    const encryptedSave = fs.readFileSync(this.savePath, "utf8");
    const sessionJson = AES.decrypt(encryptedSave, saveKey).toString(enc.Utf8);
    const sessionData = this.game.scene.gameData.parseSessionData(sessionJson);
    if (this.seedShift) {
      sessionData.seed = `${sessionData.seed}${this.seedShift}`;
    }
    return sessionData;
  }

  /** Drive phases until one of the stop conditions matches, returning its label. The matching phase is not run. */
  private async runUntil(stops: Record<string, (phase: Phase) => boolean>): Promise<string> {
    const deadline = Date.now() + PHASE_TIMEOUT;
    while (true) {
      if (Date.now() > deadline) {
        throw new Error(`No phase among ${Object.keys(stops).join(", ")} within ${PHASE_TIMEOUT} ms`);
      }
      if (this.interceptor.state === "interrupted") {
        await this.tick();
        continue;
      }
      const phase = this.game.scene.phaseManager.getCurrentPhase();
      for (const [label, isStop] of Object.entries(stops)) {
        if (isStop(phase)) {
          return label;
        }
      }
      await this.interceptor.run(phase);
    }
  }

  /**
   * Load the save. The first load goes through the title screen and stops at the boundary before turn 1, where
   * {@linkcode capture} works. Later loads go through the harness's reload and stop at turn 1's command.
   */
  public async load(): Promise<void> {
    const sessionData = this.readSession();
    if (!this.loadedFromTitle) {
      vi.spyOn(this.game.scene.gameData, "getSession").mockResolvedValue(sessionData);
      const titlePhase = this.game.scene.phaseManager.getCurrentPhase() as TitlePhase;
      await titlePhase["loadSaveSlot"](0);
      await this.runUntil({ turnInit: phase => phase.is("TurnInitPhase") });
      this.loadedFromTitle = true;
      return;
    }
    // The reload helper clears player items only, so enemy items would otherwise stack on every reload.
    this.game.scene["enemyModifiers"] = [];
    this.game.reload["sessionData"] = sessionData;
    await this.game.reload.reloadSession();
  }

  /** Snapshot the battle; valid only at a turn boundary, until the next load. */
  public capture(keepFields = false): BattleSnapshot {
    if (!this.game.scene.phaseManager.getCurrentPhase().is("TurnInitPhase")) {
      throw new Error("A snapshot needs a turn boundary");
    }
    return captureBattle(this.game.scene, keepFields);
  }

  /** Put the battle back to a snapshot and start its turn afresh. */
  public restore(snapshot: BattleSnapshot): void {
    const phaseManager = this.game.scene.phaseManager;
    snapshot.restore();
    phaseManager.clearAllPhases();
    phaseManager.dynamicQueueManager.clearLastTurnOrder();
    phaseManager["currentPhase"] = phaseManager.create("TurnInitPhase");
    this.interceptor.state = "idling";
    this.game.promptHandler["prompts"].length = 0;
  }

  private getEnemies(): { foe: Pokemon; catchTarget: Pokemon } {
    const enemyParty = this.game.scene.getEnemyParty();
    return { foe: enemyParty[1 - CATCH_SLOT], catchTarget: enemyParty[CATCH_SLOT] };
  }

  public describe(turnsPlayed: number, gameOver: boolean, messages: string[]): BattleState {
    const { foe, catchTarget } = this.getEnemies();
    return {
      turnsPlayed,
      gameOver,
      player: this.game.scene.getPlayerParty().map(snapshotPokemon),
      field: this.game.scene
        .getPlayerField()
        .filter(pokemon => pokemon.isActive(true))
        .map(pokemon => pokemon.species.speciesId),
      foe: snapshotPokemon(foe),
      catchTarget: snapshotPokemon(catchTarget),
      messages,
    };
  }

  public describeParty(): string[] {
    return this.game.scene.getPlayerParty().map(pokemon => {
      const moves = pokemon.getMoveset().map(move => MoveId[move.moveId]);
      return `${SpeciesId[pokemon.species.speciesId]}: ${describeState(snapshotPokemon(pokemon))} moves=${moves.join(",")}`;
    });
  }

  /** The Pokemon that can be sent in, the encounter's preferred order first. */
  private getReserves(): PlayerPokemon[] {
    const rank = (pokemon: Pokemon) => {
      const index = REPLACEMENT_ORDER.indexOf(pokemon.species.speciesId);
      return index === -1 ? REPLACEMENT_ORDER.length : index;
    };
    return this.game.scene
      .getPlayerParty()
      .filter(member => !member.isFainted() && !member.isOnField())
      .sort((left, right) => rank(left) - rank(right));
  }

  /**
   * Play one turn from a turn boundary or from turn 1's command. With `continueAfterGoal`, a turn that faints the
   * foe runs on to the next boundary, so that a ball can be thrown.
   */
  public async playTurn(
    plan: TurnPlan,
    options: { log?: boolean | undefined; turnNumber?: number; continueAfterGoal?: boolean } = {},
  ): Promise<TurnOutcome> {
    const game = this.game;
    const field = game.scene.getPlayerField();
    if (options.log) {
      this.writeLog(`-- turn ${options.turnNumber}`);
      for (const pokemon of [...field.filter(member => member.isActive(true)), ...game.scene.getEnemyParty()]) {
        this.writeLog(`   ${describeState(snapshotPokemon(pokemon))}`);
      }
      this.writeLog(`   you: ${formatTurn(plan)}`);
    }
    game.textInterceptor.clearLogs();
    field.forEach((pokemon, fieldIndex) => {
      const action = plan.commands[pokemon.species.speciesId];
      if (!pokemon.isActive(true) || !action) {
        return;
      }
      if (action.kind === "switch") {
        const partyIndex = game.scene
          .getPlayerParty()
          .findIndex(member => member.species.speciesId === action.species);
        game.doSwitchPokemon(partyIndex);
      } else {
        game.move.select(action.move, fieldIndex as BattlerIndex.PLAYER | BattlerIndex.PLAYER_2, action.target);
      }
    });

    const reached = await this.runUntil({
      turnEnd: phase => phase.is("TurnEndPhase"),
      gameOver: phase => phase.is("GameOverPhase"),
    });
    // A command or target prompt left over once the turn ends was never needed, such as a target for a Pokemon
    // whose command was skipped; left in the queue, it would hold up the replacement prompts behind it.
    game.promptHandler["prompts"].length = 0;
    if (reached === "turnEnd") {
      await this.interceptor.run(game.scene.phaseManager.getCurrentPhase());
    }
    const readMessages = () => game.textInterceptor.logs.map(message => message.replace(/\n/g, " "));
    const outcome: TurnOutcome = {
      terminal: true,
      gameOver: reached === "gameOver",
      messages: readMessages(),
      replacements: [],
      replacementChoices: [],
    };
    const { foe, catchTarget } = this.getEnemies();
    if (outcome.gameOver || catchTarget.isFainted() || (foe.isFainted() && !options.continueAfterGoal)) {
      this.logMessages(options.log, outcome.messages);
      return outcome;
    }

    const party = game.scene.getPlayerParty();
    const reserves = this.getReserves();
    const faintedCount = game.scene.getPlayerField().filter(pokemon => pokemon.isFainted()).length;
    if (faintedCount > 0) {
      outcome.replacementChoices = reserves.map(pokemon => pokemon.species.speciesId);
    }
    for (let promptIndex = 0; promptIndex < faintedCount && reserves.length > 0; promptIndex++) {
      const requested = plan.replacements[promptIndex];
      const requestedIndex = reserves.findIndex(pokemon => pokemon.species.speciesId === requested);
      const [replacement] = reserves.splice(Math.max(requestedIndex, 0), 1);
      outcome.replacements.push(replacement.species.speciesId);
      game.doSelectPartyPokemon(party.indexOf(replacement));
    }

    const next = await this.runUntil({
      turnInit: phase => phase.is("TurnInitPhase"),
      gameOver: phase => phase.is("GameOverPhase"),
      battleEnd: phase => phase.is("BattleEndPhase"),
    });
    outcome.messages = readMessages();
    outcome.gameOver = next === "gameOver";
    outcome.terminal = next !== "turnInit";
    this.logMessages(options.log, outcome.messages);
    return outcome;
  }

  private logMessages(log: boolean | undefined, messages: string[]): void {
    if (log) {
      this.writeLog(`   messages: ${messages.join(" | ")}`);
    }
  }

  /** From the boundary after the foe faints, throw a Master Ball at the catch target. */
  public async throwMasterBall(log: boolean): Promise<boolean> {
    this.caught = false;
    this.game.textInterceptor.clearLogs();
    this.game.doThrowPokeball(PokeballType.MASTER_BALL);
    await this.game.phaseInterceptor.to("AttemptCapturePhase");
    if (log) {
      this.writeLog(`-- Master Ball -> caught=${this.caught}`);
      this.logMessages(log, this.game.textInterceptor.logs.map(message => message.replace(/\n/g, " ")));
    }
    return this.caught;
  }

  /**
   * Load the save and play a line turn by turn, as the live game would, then throw a Master Ball if the foe fainted.
   * Returns the final state and the fingerprint at each turn boundary reached.
   */
  public async replayFromSave(
    line: TurnPlan[],
    options: { log?: boolean; keepFields?: boolean } = {},
  ): Promise<{ state: BattleState; boundaries: BattleSnapshot[]; caught: boolean }> {
    await this.load();
    const boundaries: BattleSnapshot[] = [];
    let outcome: TurnOutcome | undefined;
    for (let turnIndex = 0; turnIndex < line.length; turnIndex++) {
      outcome = await this.playTurn(line[turnIndex], {
        log: options.log,
        turnNumber: turnIndex + 1,
        continueAfterGoal: turnIndex === line.length - 1,
      });
      if (!outcome.terminal) {
        boundaries.push(this.capture(options.keepFields));
      }
      const state = this.describe(turnIndex + 1, outcome.gameOver, outcome.messages);
      const lastTurn = turnIndex === line.length - 1;
      if (outcome.terminal || (lastTurn && !state.foe.fainted)) {
        return { state, boundaries, caught: false };
      }
    }
    const caught = line.length > 0 && (await this.throwMasterBall(options.log ?? false));
    return { state: this.describe(line.length, false, outcome?.messages ?? []), boundaries, caught };
  }
}
