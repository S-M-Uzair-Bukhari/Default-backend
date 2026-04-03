#!/usr/bin/env node
/**
 * create-backend.mjs
 *
 * Small wrapper around the real backend generators.
 * - Uses the TypeScript generator when `--ts` is passed
 * - Uses the JavaScript generator otherwise
 * - Accepts direct CLI arguments or prompts for missing values with Inquirer
 * - Can optionally generate a starter GitHub Actions CI/CD workflow
 *
 * If local dependencies are missing, this script can run `npm install` automatically.
 * On the first run, it may take a moment to install `inquirer` and `tsx`.
 *
 * Simple setup for new users:
 * 1. Run `npm run create`
 * 2. Answer the setup questions
 * 3. Follow the final project instructions
 *
 * How to use this script:
 * - Run `npm run create` for a fully interactive flow
 * - Run `npm run create -- <project-name>` to create a project and choose options in the CLI
 * - The CLI can ask you to select JavaScript or TypeScript
 * - The CLI can ask you to select a database: `none`, `mongo`, or `postgres`
 * - If you already know what you want, you can pass flags directly
 *
 * Supported flags:
 * - `--ts`      Use the TypeScript generator instead of the JavaScript one
 * - `--modules` Pass a comma-separated list of modules to scaffold, such as `user,post`
 * - `--db`      Choose the database mode: `none`, `mongo`, or `postgres`
 * - `--cicd`    Prompt for and generate a starter GitHub Actions deployment workflow
 * - `--help`    Show usage instructions without generating a project
 *
 * Usage:
 * `npm run create -- <project-name> [--ts] [--modules user,post] [--db mongo|postgres|none] [--cicd]`
 * `npm run create`
 *
 * Quick CLI examples:
 * `npm run create`
 * `npm run create -- --help`
 * `npm run create -- my-api`
 *
 * More examples:
 * `npm run create -- my-api`
 * `npm run create -- my-api --modules user,post --db mongo`
 * `npm run create -- my-api --ts --modules user,post --db postgres --cicd`
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const validDbValues = new Set(["none", "mongo", "postgres"]);
const optionFlagsWithValue = new Set(["--modules", "--db"]);
const useTS = args.includes("--ts");
const wantsCICD = args.includes("--cicd");
const wantsHelp = args.includes("--help") || args.includes("-h");

const root = process.cwd();
const jsGen = path.join(root, "generators", "javaScript-backend-updated.mjs");
const tsGen = path.join(root, "generators", "typeScript-backend-updated.mts");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const inquirerDir = path.join(root, "node_modules", "inquirer");
const windowsShell = process.env.ComSpec || "cmd.exe";
let inquirerInstance = null;
let attemptedAutoInstall = false;

/**
 * Prints the supported usage patterns for this wrapper.
 */
function printUsage() {
  console.log("If local dependencies are missing, this script will run npm install automatically.");
  console.log("");
  console.log("Quick start:");
  console.log("  1. npm run create");
  console.log("  2. Answer the setup questions");
  console.log("  3. Follow the final project instructions");
  console.log("");
  console.log("Usage: npm run create -- <project-name> [--ts] [--modules user,post] [--db mongo|postgres|none] [--cicd]");
  console.log("Interactive: npm run create");
  console.log("Published CLI: npm create default-backend or npx create-default-backend");
  console.log("");
  console.log("What the CLI will ask you:");
  console.log("  Language: JavaScript (.mjs) or TypeScript (.mts)");
  console.log("  Database: none, mongo, or postgres");
  console.log("  Optional modules and optional CI/CD setup");
  console.log("");
  console.log("Examples:");
  console.log("  npm run create");
  console.log("  npm run create -- my-api --modules user,post --db mongo");
  console.log("  npm run create -- my-api --ts --modules user,post --db postgres --cicd");
}

function installLocalDependencies() {
  console.log("Local packages are missing. Running npm install...");

  const npmInstallCommand = process.platform === "win32"
    ? { file: windowsShell, args: ["/d", "/s", "/c", "npm install"] }
    : { file: "npm", args: ["install"] };

  const result = spawnSync(npmInstallCommand.file, npmInstallCommand.args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    console.error("Failed to run npm install:", result.error.message);
    return false;
  }

  const exitCode = result.status ?? 1;

  if (exitCode !== 0) {
    console.error(`npm install exited with code ${exitCode}.`);
    return false;
  }

  return true;
}

function ensureLocalDependenciesInstalled(options = {}) {
  const needsInquirer = Boolean(options.needsInquirer);
  const needsTSX = Boolean(options.needsTSX);
  const missingInquirer = needsInquirer && !fs.existsSync(inquirerDir);
  const missingTSX = needsTSX && !fs.existsSync(tsxCli);

  if (!missingInquirer && !missingTSX) {
    return true;
  }

  if (!attemptedAutoInstall) {
    attemptedAutoInstall = true;

    if (!installLocalDependencies()) {
      return false;
    }
  }

  const stillMissingInquirer = needsInquirer && !fs.existsSync(inquirerDir);
  const stillMissingTSX = needsTSX && !fs.existsSync(tsxCli);

  if (stillMissingInquirer) {
    console.error("Missing local dependency: inquirer");
  }

  if (stillMissingTSX) {
    console.error("Missing local dependency: tsx");
  }

  return !stillMissingInquirer && !stillMissingTSX;
}

async function getInquirer() {
  if (inquirerInstance) {
    return inquirerInstance;
  }

  if (!ensureLocalDependenciesInstalled({ needsInquirer: true })) {
    throw new Error("Local dependencies could not be installed. Please run npm install and try again.");
  }

  const module = await import("inquirer");
  inquirerInstance = module.default;
  return inquirerInstance;
}

/**
 * Extracts wrapper-controlled flags while keeping any unknown flags available
 * for future passthrough support.
 *
 * @param {string[]} rawArgs
 * @returns {{
 *   projectName: string | null,
 *   dbValue: string | null,
 *   modulesValue: string | null,
 *   passthroughArgs: string[],
 *   missingValueFlags: string[]
 * }}
 */
function normalizeGeneratorArgs(rawArgs) {
  const cleanedArgs = rawArgs.filter(
    (arg) => !["--ts", "--cicd", "--help", "-h"].includes(arg)
  );
  const passthroughArgs = [];
  const missingValueFlags = [];
  let projectName = null;
  let dbValue = null;
  let modulesValue = null;

  for (let i = 0; i < cleanedArgs.length; i += 1) {
    const arg = cleanedArgs[i];

    if (optionFlagsWithValue.has(arg)) {
      const nextArg = cleanedArgs[i + 1];

      if (nextArg && !nextArg.startsWith("--")) {
        if (arg === "--db") {
          dbValue = nextArg;
        }

        if (arg === "--modules") {
          modulesValue = nextArg;
        }

        i += 1;
      } else {
        missingValueFlags.push(arg);
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
    dbValue,
    modulesValue,
    passthroughArgs,
    missingValueFlags,
  };
}

/**
 * Normalizes a module name to the canonical scaffold name.
 *
 * @param {string} moduleName
 * @returns {string}
 */
function normalizeModuleName(moduleName) {
  const normalized = moduleName
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  if (normalized === "users") {
    return "user";
  }

  return normalized;
}

/**
 * Converts a comma-separated modules string into a trimmed, unique array.
 *
 * @param {string | null} modulesValue
 * @returns {string[]}
 */
function parseModules(modulesValue) {
  if (!modulesValue) {
    return [];
  }

  return [...new Set(
    modulesValue
      .split(",")
      .map((moduleName) => normalizeModuleName(moduleName))
      .filter(Boolean)
  )];
}

/**
 * Builds the final argv list that will be forwarded to the selected generator.
 *
 * @param {{
 *   projectName: string,
 *   db: string,
 *   modules: string[],
 *   passthroughArgs: string[],
 *   shouldForwardDb: boolean
 * }} config
 * @returns {string[]}
 */
function buildForwardArgs(config) {
  const forwardArgs = [config.projectName];

  if (config.modules.length > 0) {
    forwardArgs.push("--modules", config.modules.join(","));
  }

  if (config.shouldForwardDb) {
    forwardArgs.push("--db", config.db);
  }

  forwardArgs.push(...config.passthroughArgs);
  return forwardArgs;
}

/**
 * Uses prompts only when the CLI is incomplete or invalid.
 * A zero-argument run opens the full creation wizard.
 *
 * @param {string[]} rawArgs
 * @returns {Promise<{
 *   projectName: string,
 *   useTS: boolean,
 *   db: string,
 *   modules: string[],
 *   passthroughArgs: string[],
 *   shouldForwardDb: boolean,
 *   setupCICD: boolean
 * }>}
 */
async function resolveGeneratorConfig(rawArgs) {
  const normalized = normalizeGeneratorArgs(rawArgs);
  const fullWizard = rawArgs.length === 0;
  const rawDb = normalized.dbValue ? normalized.dbValue.toLowerCase() : null;
  const hasMissingProjectName = !normalized.projectName;
  const hasProjectOnlyInput = Boolean(normalized.projectName)
    && normalized.dbValue === null
    && normalized.modulesValue === null
    && normalized.passthroughArgs.length === 0
    && normalized.missingValueFlags.length === 0;
  const hasInvalidDb = rawDb !== null && !validDbValues.has(rawDb);
  const needsLanguagePrompt = fullWizard || (hasProjectOnlyInput && !useTS);
  const needsDbPrompt =
    fullWizard
    || normalized.missingValueFlags.includes("--db")
    || hasInvalidDb
    || hasProjectOnlyInput;
  const needsModulesPrompt =
    fullWizard
    || normalized.missingValueFlags.includes("--modules")
    || hasProjectOnlyInput;
  const needsCICDPrompt = (fullWizard || hasProjectOnlyInput) && !wantsCICD;
  const shouldPrompt =
    fullWizard
    || hasMissingProjectName
    || needsLanguagePrompt
    || needsDbPrompt
    || needsModulesPrompt
    || needsCICDPrompt;

  if (!shouldPrompt) {
    return {
      projectName: normalized.projectName,
      useTS,
      db: rawDb ?? "none",
      modules: parseModules(normalized.modulesValue),
      passthroughArgs: normalized.passthroughArgs,
      shouldForwardDb: rawDb !== null,
      setupCICD: wantsCICD,
    };
  }

  const inquirer = await getInquirer();
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "Project name:",
      default: normalized.projectName ?? "",
      when: () => fullWizard || hasMissingProjectName,
      validate: (value) => value.trim() ? true : "Project name is required.",
    },
    {
      type: "rawlist",
      name: "language",
      message: "Choose your backend language:",
      choices: [
        { name: "JavaScript (.mjs) - standard JavaScript backend", value: "js" },
        { name: "TypeScript (.mts) - typed TypeScript backend", value: "ts" },
      ],
      default: useTS ? 1 : 0,
      when: () => needsLanguagePrompt,
    },
    {
      type: "rawlist",
      name: "db",
      message: "Select your database option:",
      choices: [
        { name: "None - generate the backend without database setup", value: "none" },
        { name: "MongoDB - configure the project for Mongo", value: "mongo" },
        { name: "Postgres - configure the project for Postgres", value: "postgres" },
      ],
      default: rawDb === "mongo" ? 1 : rawDb === "postgres" ? 2 : 0,
      when: () => needsDbPrompt,
    },
    {
      type: "input",
      name: "modules",
      message: "Modules (comma-separated, optional):",
      default: normalized.modulesValue ?? "",
      when: () => needsModulesPrompt,
    },
    {
      type: "confirm",
      name: "setupCICD",
      message: "Create a starter GitHub Actions CI/CD workflow too?",
      default: true,
      when: () => needsCICDPrompt,
    },
  ]);

  return {
    projectName: (answers.projectName ?? normalized.projectName ?? "").trim(),
    useTS: needsLanguagePrompt ? answers.language === "ts" : useTS,
    db: needsDbPrompt ? answers.db : rawDb ?? "none",
    modules: needsModulesPrompt
      ? parseModules(answers.modules ?? "")
      : parseModules(normalized.modulesValue),
    passthroughArgs: normalized.passthroughArgs,
    shouldForwardDb: rawDb !== null || needsDbPrompt,
    setupCICD: wantsCICD || Boolean(answers.setupCICD),
  };
}

/**
 * Prompts for the optional workflow content after the scaffold is generated.
 *
 * @returns {Promise<{
 *   deploymentService: string,
 *   deployCommand: string,
 *   sshKeySecretName: string,
 *   setupNgrok: boolean
 * }>}
 */
async function promptForCICDConfig() {
  const inquirer = await getInquirer();
  const answers = await inquirer.prompt([
    {
      type: "rawlist",
      name: "deploymentService",
      message: "Where do you want to deploy your app?",
      choices: ["AWS", "DigitalOcean", "Heroku", "Custom"],
      default: 0,
    },
    {
      type: "input",
      name: "deployCommand",
      message: "Deployment command to run in GitHub Actions:",
      default: 'echo "Replace this step with your real deployment command."',
      validate: (value) => value.trim() ? true : "A deploy command is required.",
    },
    {
      type: "input",
      name: "sshKeySecretName",
      message: "GitHub secret name for an SSH private key (optional):",
      default: "",
    },
    {
      type: "confirm",
      name: "setupNgrok",
      message: "Add an ngrok reminder to the workflow?",
      default: false,
    },
  ]);

  return {
    deploymentService: answers.deploymentService,
    deployCommand: answers.deployCommand.trim(),
    sshKeySecretName: answers.sshKeySecretName.trim(),
    setupNgrok: answers.setupNgrok,
  };
}

/**
 * Writes a starter GitHub Actions workflow into the generated project.
 *
 * @param {string} projectDir
 * @param {{
 *   deploymentService: string,
 *   deployCommand: string,
 *   sshKeySecretName: string,
 *   setupNgrok: boolean
 * }} cicdConfig
 * @returns {string}
 */
function createCICDWorkflow(projectDir, cicdConfig) {
  const workflowDir = path.join(projectDir, ".github", "workflows");
  const workflowPath = path.join(workflowDir, "deploy.yml");
  const sshEnvLine = cicdConfig.sshKeySecretName
    ? `          SSH_PRIVATE_KEY: \${{ secrets.${cicdConfig.sshKeySecretName} }}\n`
    : "";

  const workflowContent = `name: CI/CD Pipeline

# Generated by create-backend.mjs.
# Replace the placeholder deploy step and secrets before using this workflow in production.

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test --if-present

      - name: Build project
        run: npm run build --if-present

      - name: Deploy to ${cicdConfig.deploymentService}
        env:
${sshEnvLine}          USE_NGROK: "${String(cicdConfig.setupNgrok)}"
        shell: bash
        run: |
          echo "Deploy target: ${cicdConfig.deploymentService}"
          if [ -n "\${SSH_PRIVATE_KEY:-}" ]; then
            echo "SSH key secret is available for this workflow."
          fi
          if [ "\${USE_NGROK}" = "true" ]; then
            echo "Add your ngrok start command here if you need a tunnel during deployment."
          fi
          ${cicdConfig.deployCommand}
`;

  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(workflowPath, workflowContent, "utf8");
  return workflowPath;
}

/**
 * Runs the selected generator and optionally captures its output.
 *
 * @param {boolean} shouldUseTS
 * @param {string[]} forwardArgs
 * @param {{ captureOutput?: boolean }} [options]
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runGenerator(shouldUseTS, forwardArgs, options = {}) {
  const captureOutput = Boolean(options.captureOutput);
  const spawnOptions = captureOutput
    ? { stdio: "pipe", encoding: "utf8" }
    : { stdio: "inherit" };

  if (shouldUseTS) {
    if (!ensureLocalDependenciesInstalled({ needsTSX: true })) {
      return { exitCode: 1, stdout: "", stderr: "" };
    }

    if (!fs.existsSync(tsGen)) {
      console.error("Missing TS generator:", tsGen);
      return { exitCode: 1, stdout: "", stderr: "" };
    }

    if (!fs.existsSync(tsxCli)) {
      console.error("Missing local tsx runtime:", tsxCli);
      return { exitCode: 1, stdout: "", stderr: "" };
    }

    const result = spawnSync(
      process.execPath,
      [tsxCli, tsGen, ...forwardArgs],
      spawnOptions
    );

    if (result.error) {
      console.error("Failed to run TypeScript generator:", result.error.message);
      return {
        exitCode: 1,
        stdout: captureOutput ? result.stdout ?? "" : "",
        stderr: captureOutput ? result.stderr ?? "" : "",
      };
    }

    return {
      exitCode: result.status ?? 1,
      stdout: captureOutput ? result.stdout ?? "" : "",
      stderr: captureOutput ? result.stderr ?? "" : "",
    };
  }

  if (!fs.existsSync(jsGen)) {
    console.error("Missing JS generator:", jsGen);
    return { exitCode: 1, stdout: "", stderr: "" };
  }

  const result = spawnSync(process.execPath, [jsGen, ...forwardArgs], spawnOptions);

  if (result.error) {
    console.error("Failed to run JavaScript generator:", result.error.message);
    return {
      exitCode: 1,
      stdout: captureOutput ? result.stdout ?? "" : "",
      stderr: captureOutput ? result.stderr ?? "" : "",
    };
  }

  return {
    exitCode: result.status ?? 1,
    stdout: captureOutput ? result.stdout ?? "" : "",
    stderr: captureOutput ? result.stderr ?? "" : "",
  };
}

/**
 * Detects prompt cancellation so we can exit quietly.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPromptCancellation(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ExitPromptError"
  );
}

async function main() {
  if (wantsHelp) {
    printUsage();
    return;
  }

  const config = await resolveGeneratorConfig(args);
  const forwardArgs = buildForwardArgs(config);
  const generatorResult = runGenerator(config.useTS, forwardArgs, {
    captureOutput: config.setupCICD,
  });
  let printedBufferedOutput = false;

  const printBufferedOutput = () => {
    if (printedBufferedOutput || !config.setupCICD) {
      return;
    }

    if (generatorResult.stdout) {
      process.stdout.write(generatorResult.stdout);
    }

    if (generatorResult.stderr) {
      process.stderr.write(generatorResult.stderr);
    }

    printedBufferedOutput = true;
  };

  if (generatorResult.exitCode !== 0) {
    printBufferedOutput();
    console.error(`Backend generator exited with code ${generatorResult.exitCode}.`);
    process.exit(generatorResult.exitCode);
  }

  if (!config.setupCICD) {
    return;
  }

  const projectDir = path.join(root, config.projectName);

  if (!fs.existsSync(projectDir)) {
    printBufferedOutput();
    console.error("Project directory was not found after generation:", projectDir);
    process.exit(1);
  }

  const cicdConfig = await promptForCICDConfig();
  const workflowPath = createCICDWorkflow(projectDir, cicdConfig);

  printBufferedOutput();
  console.log(`CI/CD workflow created successfully at ${workflowPath}`);
}

main().catch((error) => {
  if (isPromptCancellation(error)) {
    console.error("Operation cancelled.");
    process.exit(1);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error("Failed to run create-backend.mjs:", message);
  process.exit(1);
});






