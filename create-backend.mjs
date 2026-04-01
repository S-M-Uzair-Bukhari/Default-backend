#!/usr/bin/env node
/**
 * create-backend.mjs
 *
 * Small wrapper around the real backend generators.
 * - Uses the TypeScript generator when `--ts` is passed
 * - Uses the JavaScript generator otherwise
 * - Requires a project name and forwards the remaining CLI flags
 *
 * Supported flags:
 * - `--ts`
 * - `--modules`
 * - `--db`
 *
 * Usage:
 * `node create-backend.mjs <project-name> [--ts] --modules user,post --db mongo`
 *
 * TS:
 * mongo: node create-backend.mjs <project-name> --ts --modules user,post --db mongo
 * postgres: node create-backend.mjs <project-name> --ts --modules user,post --db postgres
 *
 * JS:
 * mongo: node create-backend.mjs <project-name> --modules user,post --db mongo
 * postgres: node create-backend.mjs <project-name> --modules user,post --db postgres
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
const useTS = args.includes("--ts");
const optionFlagsWithValue = new Set(["--modules", "--db"]);

/**
 * Extracts the project name and preserves the remaining generator args.
 * The first non-flag token is treated as the project name.
 *
 * @param {string[]} rawArgs
 * @returns {{ projectName: string | null, forwardArgs: string[] }}
 */
function normalizeGeneratorArgs(rawArgs) {
  const cleanedArgs = rawArgs.filter((arg) => arg !== "--ts");
  const passthroughArgs = [];
  let projectName = null;

  for (let i = 0; i < cleanedArgs.length; i += 1) {
    const arg = cleanedArgs[i];

    if (optionFlagsWithValue.has(arg)) {
      passthroughArgs.push(arg);

      if (i + 1 < cleanedArgs.length) {
        passthroughArgs.push(cleanedArgs[i + 1]);
        i += 1;
      }

      continue;
    }

    if (arg.startsWith("--")) {
      passthroughArgs.push(arg);
      continue;
    }

    if (!projectName) {
      projectName = arg;
      continue;
    }

    passthroughArgs.push(arg);
  }

  return {
    projectName,
    forwardArgs: projectName ? [projectName, ...passthroughArgs] : passthroughArgs,
  };
}

const { projectName, forwardArgs } = normalizeGeneratorArgs(args);

const root = process.cwd();
const jsGen = path.join(root, "generators", "javaScript-backend-updated.mjs");
const tsGen = path.join(root, "generators", "typeScript-backend-updated.mts");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

/**
 * Runs a child process and exits this wrapper with the same status code.
 *
 * @param {string} command
 * @param {string[]} commandArgs
 * @returns {never}
 */
function exitWithChildResult(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });

  if (result.error) {
    console.error("Failed to run generator:", result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

if (!projectName) {
  console.error("Project name is required.");
  console.error("Usage: node create-backend.mjs <project-name> [--ts] --modules user,post --db mongo");
  console.error("Example: node create-backend.mjs my-api --ts --modules user,post --db mongo");
  process.exit(1);
}

if (useTS) {
  if (!fs.existsSync(tsGen)) {
    console.error("? Missing TS generator:", tsGen);
    process.exit(1);
  }

  if (!fs.existsSync(tsxCli)) {
    console.error("Missing local tsx runtime:", tsxCli);
    console.error("Run `npm i` in this project and try again.");
    process.exit(1);
  }

  exitWithChildResult(process.execPath, [tsxCli, tsGen, ...forwardArgs]);
} else {
  if (!fs.existsSync(jsGen)) {
    console.error("? Missing JS generator:", jsGen);
    process.exit(1);
  }

  exitWithChildResult(process.execPath, [jsGen, ...forwardArgs]);
}
