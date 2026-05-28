#!/usr/bin/env node
/** Cursor afterFileEdit: sincroniza LLM_PROMPT si se editó PROJECT_STATUS.md */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SYNC = join(ROOT, "scripts", "sync-llm-prompt-from-project-status.mjs");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const raw = Buffer.concat(chunks).toString("utf8").trim();

let run = !raw;
if (raw) {
  try {
    run = /PROJECT_STATUS\.md/i.test(JSON.stringify(JSON.parse(raw)));
  } catch {
    run = false;
  }
}

if (!run) process.exit(0);

const result = spawnSync(process.execPath, [SYNC], {
  cwd: ROOT,
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
