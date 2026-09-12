import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PROJECTS = new URL('../../../data/projects/', import.meta.url)
const TESTING = new URL('../src/testing/', import.meta.url)

const DERIVED = [
  ['01M240ERCRWWCN16Q5AHP1FZAQ.json', 'legacy-project.fixture.json'],
  ['01M240FB4GD6PF6V0PKZVF6FD9.json', 'legacy-project-2.fixture.json'],
]

const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '
const STAMP = '2026-01-01T00:00:00.000Z'
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TEXT_KEYS = new Set(['text', 'name'])
const STAMP_KEYS = new Set(['createdAt', 'updatedAt'])
const NO_SOURCE = 2

const numbered = new Map()

function filler(length) {
  let out = ''
  while (out.length < length) out += FILLER
  return out.slice(0, length)
}

function number(key, value) {
  const seen = numbered.get(key) ?? new Map()
  numbered.set(key, seen)
  if (!seen.has(value)) seen.set(value, seen.size)
  return seen.get(value)
}

function identifier(key, value) {
  const mark = CROCKFORD[number(key, value) % CROCKFORD.length]
  if (key === 'id') return '0'.repeat(value.length - 1) + mark
  return filler(value.length - 1).replaceAll(' ', '-') + mark
}

function neutralise(key, value) {
  if (typeof value === 'string') {
    if (STAMP_KEYS.has(key)) return STAMP
    if ((key === 'id' || key === 'token') && value.length > 0) return identifier(key, value)
    if (TEXT_KEYS.has(key)) return filler(value.length)
  }
  return walk(value)
}

function walk(node) {
  if (Array.isArray(node)) return node.map((child) => walk(child))
  if (node === null || typeof node !== 'object') return node
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, neutralise(key, value)]))
}

/**
 * Derives one fixture under `src/testing/` per production project, keeping every structural
 * fact and no customer character.
 *
 * Run it with `pnpm --filter @repo/contracts fixture:derive`. It needs `data/`, which is
 * gitignored, so it runs on a machine holding production data and nowhere else; the fixture it
 * writes is what the committed suites read instead (ADR 0026) — `@repo/contracts`'s
 * `document-facts.test.ts` and, through the same files, the Tiptap round-trip tests in
 * `apps/microtask/components/editor`. Each of those asserts fixture and source agree, on
 * whichever machine has both.
 *
 * Both projects are derived, and in `DERIVED` order: the `id` and `token` counters run across
 * the whole set, so no two fixtures can be given the same stand-in for two different values.
 *
 * Preserved exactly: every `type`, every `attrs` — so the `checked` distribution and the heading
 * level survive — array order, nesting depth, the tab count, each tab's `position`, and the key
 * set of every object. Neutralised: `text` and `name` become filler of the same length, and
 * every timestamp becomes one fixed stamp. An `id` becomes a ULID-shaped run of zeroes and a
 * `token` becomes filler, both numbered in first-seen order, so two values that differ in the
 * source still differ here and two that are equal stay equal.
 *
 * It writes nothing but those fixtures, and it never writes to `data/`.
 */
export function main() {
  for (const [from, to] of DERIVED) {
    const source = new URL(from, PROJECTS)
    if (!existsSync(source)) {
      console.error(`No file at ${fileURLToPath(source)} — this script needs a machine holding data/.`)
      process.exit(NO_SOURCE)
    }
    const derived = walk(JSON.parse(readFileSync(source, 'utf8')))
    const target = new URL(to, TESTING)
    writeFileSync(target, `${JSON.stringify(derived, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${fileURLToPath(target)}`)
  }
}

main()
