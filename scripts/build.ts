import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const projectPath = (relativePath: string): string => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));

const outputDirectory = projectPath("dist");
const buildOptions: esbuild.BuildOptions = {
  entryPoints: [projectPath("src/content.ts")],
  outfile: projectPath("dist/content.js"),
  bundle: true,
  // Content scripts run as classic scripts, not modules.
  format: "iife",
  target: "es2022",
  logLevel: "info",
};

await mkdir(outputDirectory, { recursive: true });
await copyFile(projectPath("static/manifest.json"), projectPath("dist/manifest.json"));

if (process.argv.includes("--watch")) {
  const buildContext = await esbuild.context(buildOptions);
  await buildContext.watch();
} else {
  await esbuild.build(buildOptions);
}
