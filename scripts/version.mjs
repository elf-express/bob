#!/usr/bin/env node
// scripts/version.mjs
// Single source of truth for the version number. bob has one version field
// (root package.json); keep every future one in TARGETS. Never edit by hand.
//
//   node scripts/version.mjs            → print the current version
//   node scripts/version.mjs patch      → 0.0.1 -> 0.0.2
//   node scripts/version.mjs minor      → 0.0.2 -> 0.1.0
//   node scripts/version.mjs major      → 0.1.0 -> 1.0.0
//   node scripts/version.mjs 1.2.3      → set explicitly
//
// No dependencies on purpose: it must run on a fresh clone, before `pnpm install`.
// pnpm-lock.yaml does not record the root package version, so it is not a target.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...parts) => join(root, ...parts)

const ROOT_PKG = p('package.json')

/** Each target: the file, and a regex capturing (prefix)(version)(suffix). */
const TARGETS = [
  {
    file: ROOT_PKG,
    find: /("version"\s*:\s*")([^"]+)(")/,
  },
]

const read = (f) => readFileSync(f, 'utf8')

const current = () => {
  const m = read(ROOT_PKG).match(/"version"\s*:\s*"([^"]+)"/)
  if (!m) throw new Error('no version in root package.json')
  return m[1]
}

const bump = (version, kind) => {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) throw new Error(`not a plain semver version: ${version}`)
  let [major, minor, patch] = m.slice(1).map(Number)
  if (kind === 'major') [major, minor, patch] = [major + 1, 0, 0]
  else if (kind === 'minor') [minor, patch] = [minor + 1, 0]
  else if (kind === 'patch') patch += 1
  else throw new Error(`unknown bump: ${kind}`)
  return `${major}.${minor}.${patch}`
}

const arg = process.argv[2]

if (!arg) {
  console.log(current())
  process.exit(0)
}

const previous = current()
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg : bump(previous, arg)

let touched = 0
for (const { file, find } of TARGETS) {
  // Read and treat ENOENT as "missing" instead of checking existsSync first:
  // a check-then-read leaves a window where the file can change in between.
  let before
  try {
    before = read(file)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    console.warn(`skip (missing): ${file}`)
    continue
  }
  if (!find.test(before)) {
    throw new Error(`no version field matched in ${file}`)
  }
  const after = before.replace(find, (_, a, _old, c) => `${a}${next}${c}`)
  if (after !== before) {
    writeFileSync(file, after)
    touched++
  }
}

console.log(
  previous === next
    ? `already at ${next} (${touched} files written)`
    : `${previous} -> ${next} (${touched} files written)`,
)
