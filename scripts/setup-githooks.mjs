#!/usr/bin/env node
/** Activa hooks de repo: git config core.hooksPath .githooks */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const preCommit = join(root, ".githooks", "pre-commit");

if (existsSync(preCommit)) {
  try {
    chmodSync(preCommit, 0o755);
  } catch {
    /* Windows puede ignorar chmod */
  }
}

const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: root,
  stdio: "inherit",
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log("Hooks activos: core.hooksPath = .githooks");
console.log("Al commitear PROJECT_STATUS.md se actualizará context/LLM_PROMPT.md");
