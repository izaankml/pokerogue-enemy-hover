// Runs the battle search in `game/` inside the local PokeRogue repo's test harness against an exported session, then
// removes the copy it placed there. See README.md in this folder.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const { values: commandLineOptions } = parseArgs({
  options: {
    /** Session export to load; defaults to the newest `*sessionData*.prsv` at the repo root. */
    save: { type: "string" },
    /** PokeRogue checkout whose test harness runs the search. */
    game: { type: "string", default: path.resolve(repoRoot, "../pokerogue/beta") },
    /** A line found earlier, to replay twice and finish with a Master Ball in place of searching. */
    replay: { type: "string" },
    /** Random lines to play through snapshots and compare with a replay from the save, in place of searching. */
    check: { type: "string", default: "0" },
    /** Turns in each line that `--check` plays. */
    "check-turns": { type: "string", default: "10" },
    /** Lines kept at each depth. */
    beam: { type: "string", default: "10" },
    /** Turns to search before giving up; 0 only logs the party and the enemies. */
    depth: { type: "string", default: "30" },
    /** A nonzero value appends to the session seed, to test a line's luck against other seeds. */
    "seed-shift": { type: "string", default: "0" },
    log: { type: "string", default: path.join(repoRoot, "battle-search.log") },
    /** Where a found line is written, for `--replay`. */
    line: { type: "string", default: path.join(repoRoot, "battle-search.line.json") },
  },
});

function newestSessionExport(): string {
  const exports = fs
    .readdirSync(repoRoot)
    .filter(fileName => fileName.endsWith(".prsv") && fileName.includes("sessionData"))
    .map(fileName => path.join(repoRoot, fileName))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (!exports[0]) {
    throw new Error(`No *sessionData*.prsv export at ${repoRoot}; pass --save`);
  }
  return exports[0];
}

const savePath = path.resolve(commandLineOptions.save ?? newestSessionExport());
const gameRoot = path.resolve(commandLineOptions.game);
const logPath = path.resolve(commandLineOptions.log);
const linePath = path.resolve(commandLineOptions.line);
const replayPath = commandLineOptions.replay === undefined ? "" : path.resolve(commandLineOptions.replay);

const scratchDirectory = path.join(gameRoot, "test/tests/scratch");
const searchCopy = path.join(scratchDirectory, "battle-search");
if (fs.existsSync(searchCopy)) {
  throw new Error(`${searchCopy} already exists; another search may be running`);
}
const createdScratchDirectory = !fs.existsSync(scratchDirectory);
fs.cpSync(path.join(import.meta.dirname, "game"), searchCopy, { recursive: true });
fs.writeFileSync(logPath, "");

console.log(`save: ${savePath}`);
console.log(`progress: tail -f ${logPath}`);

// Ctrl-C reaches vitest directly; staying alive lets the copy be removed afterwards.
const ignoreSignal = () => {};
process.on("SIGINT", ignoreSignal);
process.on("SIGTERM", ignoreSignal);

let exitCode = 1;
try {
  exitCode = await new Promise<number>((resolve, reject) => {
    const vitest = spawn(
      path.join(gameRoot, "node_modules/.bin/vitest"),
      ["run", "--silent=true", path.relative(gameRoot, path.join(searchCopy, "search.test.ts"))],
      {
        cwd: gameRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          SAVE_PATH: savePath,
          LOG_PATH: logPath,
          LINE_PATH: linePath,
          REPLAY: replayPath,
          CHECK_TRIALS: commandLineOptions.check,
          CHECK_TURNS: commandLineOptions["check-turns"],
          BEAM_WIDTH: commandLineOptions.beam,
          MAX_DEPTH: commandLineOptions.depth,
          SEED_SHIFT: commandLineOptions["seed-shift"],
        },
      },
    );
    vitest.on("error", reject);
    vitest.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} finally {
  fs.rmSync(createdScratchDirectory ? scratchDirectory : searchCopy, { recursive: true, force: true });
}

console.log(fs.readFileSync(logPath, "utf8"));
process.exit(exitCode);
