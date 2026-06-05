#!/usr/bin/env node
/**
 * Sincroniza la sección 17 (marcadores sync) de context/LLM_PROMPT.md desde PROJECT_STATUS.md.
 * Uso:
 *   node scripts/sync-llm-prompt-from-project-status.mjs
 *   node scripts/sync-llm-prompt-from-project-status.mjs --check
 *   node scripts/sync-llm-prompt-from-project-status.mjs --from-hook  (stdin JSON de Cursor)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROJECT_STATUS_PATH = join(ROOT, "PROJECT_STATUS.md");
const LLM_PROMPT_PATH = join(ROOT, "context", "LLM_PROMPT.md");

const MAX_ITEMS = 45;
const START_MARKER = "<!-- sync:project-status:start";
const END_MARKER = "<!-- sync:project-status:end -->";

function extractFromProjectStatus(content) {
  const lines = content.split(/\r?\n/);

  const lastUpdateLine = lines.find((l) =>
    /^\*\*Última actualización:\*\*/i.test(l),
  );
  const lastUpdate = lastUpdateLine
    ? lastUpdateLine.replace(/^\*\*Última actualización:\*\*\s*/i, "").trim()
    : "desconocida";

  const endIdx = lines.findIndex((l) =>
    /^## 📌 ESTADO GENERAL/.test(l),
  );
  const sliceEnd = endIdx === -1 ? lines.length : endIdx;
  const slice = lines.slice(0, sliceEnd);

  const startIdx = slice.findIndex((l) => /^- \[[x🚧]\]/.test(l));
  if (startIdx === -1) {
    return { lastUpdate, items: [] };
  }

  const items = [];
  for (const line of slice.slice(startIdx)) {
    if (/^- \[[x🚧]\]/.test(line)) {
      if (items.length >= MAX_ITEMS) break;
      const normalized = line
        .replace(/^- \[🚧\]\s*/, "- 🚧 ")
        .replace(/^- \[x\]\s*/, "- ");
      items.push(normalized);
    } else if (/^  - /.test(line) && items.length > 0) {
      items.push(line);
    }
  }

  return { lastUpdate, items };
}

function buildSyncBlock({ lastUpdate, items }) {
  const bullets =
    items.length > 0
      ? items.join("\n")
      : "- _(Sin entradas en el changelog superior de PROJECT_STATUS.md)_";

  return `${START_MARKER} — NO EDITAR A MANO; generado por \`scripts/sync-llm-prompt-from-project-status.mjs\` -->

**Fuente**: \`PROJECT_STATUS.md\` — **última actualización:** ${lastUpdate}

Hitos recientes (mismo orden que el changelog superior de \`PROJECT_STATUS.md\`; máx. ${MAX_ITEMS} entradas):

${bullets}

${END_MARKER}`;
}

function replaceSyncRegion(llmContent, syncBlock) {
  const start = llmContent.indexOf(START_MARKER);
  const end = llmContent.indexOf(END_MARKER);

  if (start === -1 || end === -1) {
    throw new Error(
      `Marcadores ${START_MARKER} / ${END_MARKER} no encontrados en context/LLM_PROMPT.md`,
    );
  }

  const before = llmContent.slice(0, start);
  const after = llmContent.slice(end + END_MARKER.length);
  return `${before}${syncBlock}${after}`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function shouldRunFromCursorHook() {
  const raw = (await readStdin()).trim();
  if (!raw) return true;
  try {
    const data = JSON.parse(raw);
    const blob = JSON.stringify(data);
    return /PROJECT_STATUS\.md/i.test(blob);
  } catch {
    return false;
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const fromHook = process.argv.includes("--from-hook");

  if (fromHook) {
    const run = await shouldRunFromCursorHook();
    if (!run) return;
  }

  runSync(checkOnly);
}

function runSync(checkOnly) {
  const projectStatus = readFileSync(PROJECT_STATUS_PATH, "utf8");
  const llmPrompt = readFileSync(LLM_PROMPT_PATH, "utf8");
  const extracted = extractFromProjectStatus(projectStatus);
  const syncBlock = buildSyncBlock(extracted);
  const next = replaceSyncRegion(llmPrompt, syncBlock);

  if (next === llmPrompt) {
    if (checkOnly) {
      console.log("context/LLM_PROMPT.md ya está sincronizado con PROJECT_STATUS.md");
      return;
    }
    console.log("Sin cambios (ya sincronizado).");
    return;
  }

  if (checkOnly) {
    console.error(
      "context/LLM_PROMPT.md está desincronizado. Ejecuta: npm run sync:llm-prompt",
    );
    process.exit(1);
  }

  writeFileSync(LLM_PROMPT_PATH, next, "utf8");
  console.log(
    `Sincronizado context/LLM_PROMPT.md ← PROJECT_STATUS.md (${extracted.items.length} hitos, ${extracted.lastUpdate})`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
