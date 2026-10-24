import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const projectPath = (relativePath: string): string => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));

const readJson = async (relativePath: string): Promise<unknown> =>
  JSON.parse(await readFile(projectPath(relativePath), "utf8"));

// `package.json` holds the extension's version, which the build writes into the manifest and the
// content script logs when it attaches.
const { version } = (await readJson("package.json")) as { version: string };
const extensionManifest = (await readJson("static/manifest.json")) as Record<string, unknown>;

const outputDirectory = projectPath("dist");
const buildOptions: esbuild.BuildOptions = {
  entryPoints: [projectPath("src/content.ts")],
  outfile: projectPath("dist/content.js"),
  bundle: true,
  // Content scripts run as classic scripts, not modules.
  format: "iife",
  target: "es2022",
  logLevel: "info",
  define: { EXTENSION_VERSION: JSON.stringify(version) },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(projectPath("dist/manifest.json"), `${JSON.stringify({ ...extensionManifest, version }, null, 2)}\n`);

if (process.argv.includes("--watch")) {
  const buildContext = await esbuild.context(buildOptions);
  await buildContext.watch();
} else {
  await esbuild.build(buildOptions);
}
