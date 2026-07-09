#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const PROJECT_STATUS = join(ROOT, 'PROJECT_STATUS.md')
const LLM_PROMPT = join(ROOT, 'context', 'LLM_PROMPT.md')

const MAX_ENTRIES = 45

const isCheck = process.argv.includes('--check')

function extractEntries(text) {
  const entries = []
  const lines = text.split('\n')
  for (const line of lines) {
    const cleaned = line.replace(/\r$/, '')
    const match = cleaned.match(/^- \[x\] (.+)$/)
    if (match) {
      entries.push(match[1])
      if (entries.length >= MAX_ENTRIES) break
    }
  }
  return entries
}

function buildSection(entries, sourceLine) {
  const lines = []
  lines.push('<!-- sync:project-status:start — NO EDITAR A MANO; generado por `scripts/sync-llm-prompt-from-project-status.mjs` -->')
  lines.push('')
  lines.push(sourceLine)
  lines.push('')
  lines.push('Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):')
  lines.push('')
  for (const entry of entries) {
    lines.push(`- ${entry}`)
  }
  lines.push('')
  lines.push('<!-- sync:project-status:end -->')
  return lines.join('\n')
}

function getSourceLine(text) {
  const lines = text.split('\n')
  for (const line of lines) {
    const cleaned = line.replace(/\r$/, '')
    const match = cleaned.match(/^\*\*Última actualización:\*\* (.+)$/)
    if (match) {
      return `**Fuente**: \`PROJECT_STATUS.md\` — **última actualización:** ${match[1]}`
    }
  }
  return '**Fuente**: `PROJECT_STATUS.md`'
}

function main() {
  const statusText = readFileSync(PROJECT_STATUS, 'utf-8')
  const promptText = readFileSync(LLM_PROMPT, 'utf-8')

  const entries = extractEntries(statusText)
  const sourceLine = getSourceLine(statusText)
  const newSection = buildSection(entries, sourceLine)

  const startMarker = '<!-- sync:project-status:start'
  const endMarker = '<!-- sync:project-status:end -->'

  const startIdx = promptText.indexOf(startMarker)
  const endIdx = promptText.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1) {
    console.error('ERROR: markers sync:project-status no encontrados en context/LLM_PROMPT.md')
    process.exit(1)
  }

  const before = promptText.slice(0, startIdx)
  const after = promptText.slice(endIdx + endMarker.length)

  const newPrompt = before + newSection + after

  if (isCheck) {
    if (promptText === newPrompt) {
      console.log('✓ sync:project-status section is up to date')
      process.exit(0)
    } else {
      console.error('✗ sync:project-status section is OUT OF DATE. Run without --check to update.')
      process.exit(1)
    }
  }

  writeFileSync(LLM_PROMPT, newPrompt, 'utf-8')
  console.log('✓ context/LLM_PROMPT.md sync:project-status section updated')
}

main()
