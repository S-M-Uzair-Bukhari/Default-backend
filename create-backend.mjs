#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
const useTS = args.includes("--ts");

// pass args to real generator (remove --ts)
const forwardArgs = args.filter((a) => a !== "--ts");

const root = process.cwd();
const jsGen = path.join(root, "generators", "javaScript-backend.mjs");
const tsGen = path.join(root, "generators", "typeScript-backend.mts");

if (useTS) {
  if (!fs.existsSync(tsGen)) {
    console.error("❌ Missing TS generator:", tsGen);
    process.exit(1);
  }

  // run TS generator via tsx
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(cmd, ["tsx", tsGen, ...forwardArgs], { stdio: "inherit" });
  process.exit(r.status ?? 0);
} else {
  if (!fs.existsSync(jsGen)) {
    console.error("❌ Missing JS generator:", jsGen);
    process.exit(1);
  }

  // run JS generator via node
  const r = spawnSync(process.execPath, [jsGen, ...forwardArgs], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 0);
}