import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function workspaceGlobs() {
  const lines = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8').split(/\r?\n/)
  const globs = []
  let inside = false
  for (const line of lines) {
    if (!inside) {
      if (line.trimEnd() === 'packages:') inside = true
      continue
    }
    if (/^\S/.test(line)) break
    const entry = /^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (entry) globs.push(entry[1])
  }
  return globs
}

function expand(glob) {
  return glob.split('/').reduce(
    (dirs, segment) =>
      dirs.flatMap((dir) => {
        if (segment !== '*') {
          const next = join(dir, segment)
          return existsSync(next) ? [next] : []
        }
        return readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(dir, entry.name))
      }),
    [ROOT],
  )
}

function* leaves(node, trail) {
  if (typeof node === 'string') {
    yield { trail: trail.length === 0 ? ['.'] : trail, target: node }
    return
  }
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) yield* leaves(value, [...trail, key])
}

function wildcardMatches(directory, target) {
  const [head, tail] = target.split('*')
  const base = join(directory, head)
  if (!existsSync(base) || !statSync(base).isDirectory()) return 0
  let matches = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name)
      if (entry.isDirectory()) walk(next)
      else if (next.endsWith(tail)) matches += 1
    }
  }
  walk(base)
  return matches
}

function checkPackage(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const where = relative(ROOT, directory).split('\\').join('/')
  const rows = []
  for (const { trail, target } of leaves(manifest.exports ?? {}, [])) {
    const path = join(directory, target)
    const matches = target.includes('*') ? wildcardMatches(directory, target) : null
    const resolved = matches === null ? existsSync(path) && statSync(path).isFile() : matches > 0
    rows.push({
      package: manifest.name ?? where,
      where,
      trail: trail.join(' '),
      target,
      matches,
      status: resolved ? 'ok' : 'MISSING',
    })
  }
  return rows
}

function unscheduled(directories) {
  const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8'))
  const scheduled = new Set(turbo.tasks?.['//#check-exports']?.dependsOn ?? [])
  return directories
    .map((directory) => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')))
    .filter((manifest) => typeof manifest.scripts?.build === 'string')
    .map((manifest) => manifest.name)
    .filter((name) => !scheduled.has(`${name}#build`))
}

const directories = workspaceGlobs()
  .flatMap(expand)
  .filter((directory) => existsSync(join(directory, 'package.json')))
  .sort()

const unbuilt = unscheduled(directories)
if (unbuilt.length > 0) {
  console.error(
    `turbo.json does not build these before checking their exports: ${unbuilt.join(', ')}`,
  )
  console.error('add "<name>#build" to tasks["//#check-exports"].dependsOn')
  process.exit(1)
}

const rows = directories.flatMap(checkPackage)
const missing = rows.filter((row) => row.status === 'MISSING')
const wildcards = rows.filter((row) => row.matches !== null)

for (const row of rows) {
  if (row.status === 'ok' && row.matches === null) continue
  const count = row.matches === null ? '' : `  (${String(row.matches)} file(s))`
  console.log(`${row.status}  ${row.package}  exports["${row.trail}"] -> ${row.target}${count}`)
}

const withExports = new Set(rows.map((row) => row.where)).size
console.log(
  `checked ${String(rows.length)} exports targets across ${String(withExports)} of ${String(directories.length)} workspace packages`,
)

if (wildcards.length > 0) {
  const files = wildcards.reduce((total, row) => total + row.matches, 0)
  console.log(
    `${String(wildcards.length)} wildcard target(s) resolved to ${String(files)} file(s) on disk`,
  )
}

if (missing.length > 0) {
  console.error(
    `${String(missing.length)} declared exports target(s) do not exist on disk after build`,
  )
  process.exit(1)
}
