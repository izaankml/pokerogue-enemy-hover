import { pokerogueApi } from "#api/api";
import { BattleScene } from "#app/battle-scene";
import { AttemptCapturePhase } from "#phases/attempt-capture-phase";
import { ScanIvsPhase } from "#phases/scan-ivs-phase";
import { GameManager } from "#test/framework/game-manager";
import fs from "node:fs";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, it, vi } from "vitest";
import { type BattleSnapshot, firstDifference } from "./battle-snapshot.ts";
import { candidateActions, score } from "./encounter.ts";
import { describeState, formatTurn, readLine, Simulator } from "./simulator.ts";
import type { BattleState, TurnCommands, TurnPlan } from "./types.ts";

/**
 * Searches for commands that faint one enemy of a double battle and leave the other to catch, playing an exported
 * Endless session in the game's test harness. `run.ts` copies this folder into the game repo to run it.
 */

const SAVE_PATH = process.env.SAVE_PATH ?? "";
const LOG_PATH = process.env.LOG_PATH ?? "";
const LINE_PATH = process.env.LINE_PATH ?? "";
const SEED_SHIFT = Number(process.env.SEED_SHIFT ?? 0);
const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 30);
const BEAM_WIDTH = Number(process.env.BEAM_WIDTH ?? 10);
const REPLAY = process.env.REPLAY ?? "";
const CHECK_TRIALS = Number(process.env.CHECK_TRIALS ?? 0);
const CHECK_TURNS = Number(process.env.CHECK_TURNS ?? 10);

interface SearchNode {
  line: TurnPlan[];
  state: BattleState;
  score: number;
  /** The boundary after the line's last turn; absent once the battle cannot go on. */
  snapshot: BattleSnapshot | undefined;
  /** The fingerprint at each turn boundary along the line, to check a replay from the save against. */
  fingerprints: string[];
}

function writeLog(line: string): void {
  fs.appendFileSync(LOG_PATH, `${line}\n`);
}

function isGoal(state: BattleState): boolean {
  return state.foe.fainted && !state.catchTarget.fainted && !state.gameOver;
}

/** Every combination of candidate actions for the Pokemon on the field. */
function candidateTurns(state: BattleState): TurnCommands[] {
  const fieldMembers = state.field.map(species => state.player.find(member => member.species === species)!);
  let turnOptions: TurnCommands[] = [{}];
  for (const member of fieldMembers) {
    const extendedOptions: TurnCommands[] = [];
    for (const partialTurn of turnOptions) {
      for (const action of candidateActions(member, state)) {
        const alreadySwitching = Object.values(partialTurn).some(
          other => other?.kind === "switch" && action.kind === "switch" && other.species === action.species,
        );
        if (!alreadySwitching) {
          extendedOptions.push({ ...partialTurn, [member.species]: action });
        }
      }
    }
    turnOptions = extendedOptions;
  }
  return turnOptions;
}

/** Orders lines by fewer of your Pokemon fainted, then by more of your team's HP left. */
function compareSafety(left: BattleState, right: BattleState): number {
  const faints = (state: BattleState) => state.player.filter(member => member.fainted).length;
  const healthLeft = (state: BattleState) => state.player.reduce((sum, member) => sum + member.hp / member.maxHp, 0);
  return faints(left) - faints(right) || healthLeft(right) - healthLeft(left);
}

/** mulberry32, so a check picks the same turns on every run. */
function seededRandom(seed: number): () => number {
  let randomState = seed;
  return () => {
    randomState = (randomState + 0x6d2b79f5) | 0;
    let mixed = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

class Search {
  public turnsPlayed = 0;
  private readonly startedAt = Date.now();
  public readonly root: SearchNode;

  constructor(
    private readonly simulator: Simulator,
    rootSnapshot: BattleSnapshot,
    private readonly initial: BattleState,
  ) {
    this.root = { line: [], state: initial, score: score(initial, initial), snapshot: rootSnapshot, fingerprints: [] };
  }

  public elapsedSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  /** Play one turn from a node's boundary. */
  public async playFrom(
    parent: SearchNode,
    plan: TurnPlan,
    keepFields = false,
  ): Promise<{ child: SearchNode; replacementChoices: TurnPlan["replacements"] }> {
    this.simulator.restore(parent.snapshot!);
    const outcome = await this.simulator.playTurn(plan);
    this.turnsPlayed++;
    const state = this.simulator.describe(parent.line.length + 1, outcome.gameOver, outcome.messages);
    const snapshot = outcome.terminal ? undefined : this.simulator.capture(keepFields);
    const child: SearchNode = {
      line: [...parent.line, { commands: plan.commands, replacements: outcome.replacements }],
      state,
      score: score(state, this.initial),
      snapshot,
      fingerprints: snapshot ? [...parent.fingerprints, snapshot.fingerprint] : parent.fingerprints,
    };
    const replacementChoices = outcome.replacementChoices.filter(species => species !== outcome.replacements[0]);
    return { child, replacementChoices };
  }

  /** The children of a node for one turn's commands: the preferred replacement after a faint, then every other. */
  public async expand(parent: SearchNode, commands: TurnCommands): Promise<SearchNode[]> {
    const { child, replacementChoices } = await this.playFrom(parent, { commands, replacements: [] });
    const children = [child];
    for (const species of replacementChoices) {
      children.push((await this.playFrom(parent, { commands, replacements: [species] })).child);
    }
    return children;
  }
}

async function startSearch(simulator: Simulator): Promise<Search> {
  await simulator.load();
  const initial = simulator.describe(0, false, []);
  writeLog(`start: foe=${describeState(initial.foe)} catchTarget=${describeState(initial.catchTarget)}`);
  for (const line of simulator.describeParty()) {
    writeLog(`   ${line}`);
  }
  const rootSnapshot = simulator.capture(true);
  writeLog(`   a snapshot records ${rootSnapshot.fields!.length} fields`);
  return new Search(simulator, rootSnapshot, initial);
}

async function runSearch(simulator: Simulator): Promise<void> {
  const search = await startSearch(simulator);
  if (MAX_DEPTH === 0) {
    return;
  }
  let beam = [search.root];
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const children: SearchNode[] = [];
    const goals: SearchNode[] = [];
    const seenStates = new Set<string>();
    let duplicates = 0;
    for (const parent of beam) {
      for (const commands of candidateTurns(parent.state)) {
        for (const child of await search.expand(parent, commands)) {
          if (isGoal(child.state)) {
            goals.push(child);
          } else if (!child.snapshot || !Number.isFinite(child.score)) {
            continue;
          } else if (seenStates.has(child.snapshot.fingerprint)) {
            duplicates++;
          } else {
            seenStates.add(child.snapshot.fingerprint);
            children.push(child);
          }
        }
      }
    }

    if (goals.length > 0) {
      await finishWithGoal(simulator, search, goals, depth);
      return;
    }
    children.sort((left, right) => right.score - left.score);
    beam = children.slice(0, BEAM_WIDTH);
    const best = beam[0];
    writeLog(
      `depth ${depth} (${search.elapsedSeconds()}s, ${search.turnsPlayed} turns played): ${children.length} viable, `
        + `${duplicates} duplicate; best score=${Math.round(best?.score ?? 0)} `
        + (best
          ? `foe=${describeState(best.state.foe)} catchTarget=${describeState(best.state.catchTarget)} `
            + `faints=${best.state.player.filter(member => member.fainted).map(member => member.name).join(",")} `
            + `last=${formatTurn(best.line.at(-1)!)}`
          : ""),
    );
    if (beam.length === 0) {
      writeLog("RESULT no viable lines");
      return;
    }
  }
  writeLog("RESULT depth limit reached");
}

/** Keep the safest of the shortest lines, and replay it from the save as the live game would play it. */
async function finishWithGoal(simulator: Simulator, search: Search, goals: SearchNode[], depth: number) {
  goals.sort((left, right) => compareSafety(left.state, right.state));
  const chosen = goals[0];
  fs.writeFileSync(LINE_PATH, JSON.stringify(chosen.line));
  writeLog(
    `FOUND ${goals.length} line(s) at depth ${depth} after ${search.elapsedSeconds()}s and ${search.turnsPlayed} turns; `
      + "replaying the safest from the save",
  );
  const replay = await simulator.replayFromSave(chosen.line, { log: true });
  const differingTurn = chosen.fingerprints.findIndex(
    (fingerprint, index) => replay.boundaries[index]?.fingerprint !== fingerprint,
  );
  if (differingTurn !== -1) {
    writeLog(`WARNING the replay differs from the search after turn ${differingTurn + 1}; run --check to find out why`);
  }
  writeLog(`RESULT caught=${replay.caught}`);
}

/**
 * Play random lines through snapshots, playing a different turn before each one so that every restore has
 * something to undo, then replay each line from the save and compare the state at every turn boundary.
 */
async function runCheck(simulator: Simulator): Promise<void> {
  const search = await startSearch(simulator);
  const random = seededRandom(SEED_SHIFT + 1);
  const trials: { line: TurnPlan[]; boundaries: BattleSnapshot[]; final: BattleState }[] = [];
  for (let trialIndex = 0; trialIndex < CHECK_TRIALS; trialIndex++) {
    let node = search.root;
    const boundaries: BattleSnapshot[] = [];
    for (let turnIndex = 0; turnIndex < CHECK_TURNS && node.snapshot; turnIndex++) {
      const options = candidateTurns(node.state);
      const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
      await search.playFrom(node, { commands: pick(options), replacements: [] });
      const commands = pick(options);
      let { child, replacementChoices } = await search.playFrom(node, { commands, replacements: [] }, true);
      if (replacementChoices.length > 0 && random() < 0.5) {
        child = (await search.playFrom(node, { commands, replacements: [pick(replacementChoices)] }, true)).child;
      }
      node = child;
      if (node.snapshot) {
        boundaries.push(node.snapshot);
      }
    }
    trials.push({ line: node.line, boundaries, final: node.state });
  }

  let matching = 0;
  for (const [trialIndex, trial] of trials.entries()) {
    const replay = await simulator.replayFromSave(trial.line, { keepFields: true });
    const differingTurn = trial.boundaries.findIndex(
      (boundary, index) => replay.boundaries[index]?.fingerprint !== boundary.fingerprint,
    );
    const withoutMessages = (state: BattleState) => JSON.stringify({ ...state, messages: [] });
    const finalMatches = withoutMessages(replay.state) === withoutMessages(trial.final);
    const label = `check ${trialIndex + 1}: ${trial.line.length} turns`;
    if (differingTurn !== -1) {
      const replayed = replay.boundaries[differingTurn];
      const difference = replayed ? firstDifference(replayed, trial.boundaries[differingTurn]) : "no boundary";
      writeLog(`${label}, differs after turn ${differingTurn + 1}: ${difference}`);
    } else if (!finalMatches && !isGoal(trial.final)) {
      writeLog(`${label}, final state differs`);
    } else {
      matching++;
      writeLog(`${label}, matches`);
    }
  }
  writeLog(`RESULT ${matching}/${trials.length} lines match a replay from the save`);
}

describe("Battle search", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    // Use the real battle RNG in place of the framework's maximum rolls.
    BattleScene.prototype.randBattleSeedInt = function (this: BattleScene, range: number, min = 0): number {
      return this.currentBattle?.randSeedInt(range, min);
    };
    vi.spyOn(pokerogueApi, "getGameTitleStats").mockResolvedValue({ battleCount: -1, playerCount: -1 });
  });

  it("searches for a winning line", async () => {
    const simulator = new Simulator(game, SAVE_PATH, SEED_SHIFT, writeLog);
    vi.spyOn(AttemptCapturePhase.prototype, "catch").mockImplementation(function (this: AttemptCapturePhase) {
      simulator.caught = true;
      this.end();
    });
    // The IV scanner only updates UI, which the headless harness cannot render.
    vi.spyOn(ScanIvsPhase.prototype, "start").mockImplementation(function (this: ScanIvsPhase) {
      this.end();
    });
    await game.runToTitle();

    if (REPLAY) {
      const line = readLine(REPLAY);
      // Play twice: the first load goes through the title screen, the second through a reload.
      for (const pass of ["first load", "reload"]) {
        writeLog(`=== replay (${pass}) seedShift=${SEED_SHIFT}`);
        const replay = await simulator.replayFromSave(line, { log: true });
        writeLog(`RESULT caught=${replay.caught} foeFainted=${replay.state.foe.fainted}`);
      }
    } else if (CHECK_TRIALS > 0) {
      await runCheck(simulator);
    } else {
      await runSearch(simulator);
    }
  }, 7_200_000);
});
