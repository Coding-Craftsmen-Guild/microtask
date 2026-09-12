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
const RESERVED_HOST = 'https://example.invalid/'
const PRESERVED_KEYS = new Set(['type', 'permission'])
const STAMP_KEYS = new Set(['createdAt', 'updatedAt'])
const SHAPED_KEYS = new Set(['id', 'token'])
const URL_KEYS = new Set(['href', 'src'])
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

function mark(key, value) {
  return CROCKFORD[number(key, value) % CROCKFORD.length]
}

function identifier(key, value) {
  if (key === 'id') return '0'.repeat(value.length - 1) + mark(key, value)
  return filler(value.length - 1).replaceAll(' ', '-') + mark(key, value)
}

function locator(key, value) {
  const room = value.length - RESERVED_HOST.length
  if (room < 1) return `${RESERVED_HOST}${mark(key, value)}`
  return RESERVED_HOST + filler(room - 1).replaceAll(' ', '-') + mark(key, value)
}

function neutralise(key, value) {
  if (typeof value !== 'string') return walk(value)
  if (PRESERVED_KEYS.has(key)) return value
  if (STAMP_KEYS.has(key)) return STAMP
  if (value.length === 0) return value
  if (SHAPED_KEYS.has(key)) return identifier(key, value)
  if (URL_KEYS.has(key)) return locator(key, value)
  return filler(value.length)
}

function walk(node) {
  if (Array.isArray(node)) return node.map((child) => walk(child))
  if (node === null || typeof node !== 'object') return node
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, neutralise(key, value)]))
}

/**
 * Derives one fixture under `src/testing/` per named project, keeping every structural fact and
 * no character of the source's own content.
 *
 * Run it with `pnpm --filter @repo/contracts fixture:derive`. It needs `data/`, which is
 * gitignored: locally that is a demo dataset in the legacy layout, and on a deployment machine
 * it is the live volume. The rule below is written so that it does not matter which — the
 * fixtures are committed to a **public** repository, so the derivation is safe for the worst
 * case or it is not safe.
 *
 * **It neutralises by default and preserves by exception**, which is the whole of its safety
 * argument. An earlier version inverted that: it enumerated the keys to scrub — `text`, `name`,
 * `id`, `token`, `createdAt`, `updatedAt` — and returned every other string verbatim. Nothing
 * leaked, because the two projects it has ever run against contain no links, but
 * `marks[].attrs.href` on a ProseMirror link node is a client's URL and was in none of those
 * sets, so it would have been copied out character for character. A schema that gains a
 * free-text field must fail closed, not quietly export it.
 *
 * So every string becomes filler of the same length unless it is one of four exceptions:
 * `type` and `permission` are structural enums and survive verbatim, because the node and mark
 * names are what the round-trip proves and the permission is what the import mapping turns on;
 * a timestamp becomes one fixed stamp; an `id` becomes a ULID-shaped run of zeroes and a `token`
 * becomes dashed filler, each numbered in first-seen order so values that differ in the source
 * still differ here and values that are equal stay equal; and an `href` or `src` becomes a URL
 * under the RFC 2606 reserved `example.invalid` host, keeping the absolute-https shape that the
 * link mark's own scheme check needs while carrying no path of the source's.
 *
 * Preserved exactly: every `type`, every non-string `attrs` value — so the `checked`
 * distribution and the heading level survive — array order, nesting depth, the tab count, each
 * tab's `position`, the key set of every object, and the length of every string.
 *
 * Both projects are derived, and in `DERIVED` order, because the `id` and `token` counters run
 * across the whole set: no two fixtures can be handed the same stand-in for two different values.
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
