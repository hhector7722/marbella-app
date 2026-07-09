#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const HOOKS_DIR = join(ROOT, '.githooks')

if (!existsSync(HOOKS_DIR)) {
  console.error('ERROR: .githooks/ directory not found')
  process.exit(1)
}

try {
  execSync(`git config core.hooksPath "${HOOKS_DIR}"`, { cwd: ROOT, stdio: 'pipe' })
  console.log(`✓ Git hooks path set to ${HOOKS_DIR}`)
} catch (err) {
  console.error('ERROR: could not set hooks path:', err.message)
  process.exit(1)
}
