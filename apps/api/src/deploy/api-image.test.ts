import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Stage {
  readonly from: string
  readonly lines: readonly string[]
}

const DOCKERFILE = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8')

const stagesOf = (text: string): Stage[] => {
  const stages: { from: string; lines: string[] }[] = []
  const lines = text
    .replaceAll(/\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  for (const line of lines) {
    if (line.startsWith('FROM ')) stages.push({ from: line.slice(5).trim(), lines: [] })
    else stages.at(-1)?.lines.push(line)
  }
  return stages
}

const STAGES = stagesOf(DOCKERFILE)
const RUNNER = STAGES.at(-1) ?? { from: '', lines: [] }
const inRunner = (keyword: string): string[] =>
  RUNNER.lines.filter((line) => line.startsWith(`${keyword} `)).map((line) => line.slice(keyword.length + 1))

describe('apps/api/Dockerfile (ADR 0026)', () => {
  it('roots every stage in node:24-slim, and ships a runner without the pnpm and turbo of base', () => {
    const aliases = STAGES.map((stage) => stage.from.split(/\s+AS\s+/i)[1])
    STAGES.forEach((stage, index) => {
      const image = stage.from.split(/\s+/)[0] ?? ''
      expect(image === 'node:24-slim' || aliases.slice(0, index).includes(image)).toBe(true)
    })
    expect(RUNNER.from).toBe('node:24-slim AS runner')
  })

  it('prunes to the api alone, once, positionally', () => {
    expect(DOCKERFILE.match(/turbo prune \S+/g)).toEqual(['turbo prune api'])
    expect(DOCKERFILE).toContain('turbo prune api --docker')
  })

  it('ships `pnpm deploy --prod` output, never the builder workspace with its dev dependencies', () => {
    expect(DOCKERFILE).toContain('pnpm --filter=api deploy --prod /deploy')
    expect(inRunner('COPY')).toEqual(['--from=builder /deploy ./'])
  })

  it('trims the test doubles and fails its own build if a test file, src or testing dir survives', () => {
    const trim = STAGES.flatMap((stage) => stage.lines).find((line) => line.includes('/dist/testing'))
    expect(trim).toBeDefined()
    expect(trim).toContain(
      'find "$pkg" -mindepth 1 -maxdepth 1 ! -name package.json ! -name dist ! -name node_modules -exec rm -rf {} +',
    )
    expect(trim).toContain('rm -rf "$pkg/dist/testing"')
    expect(trim).toContain(
      "if { find . -path ./node_modules -prune -o -print; find -L node_modules/@repo; }" +
        " | grep -E '[.](test|spec)[.]|/(testing|src)(/|$)'; then exit 1; fi",
    )
  })

  it('runs as node, set after the last step that writes and never switched back', () => {
    expect(inRunner('USER')).toEqual(['node'])
    const user = RUNNER.lines.indexOf('USER node')
    expect(RUNNER.lines.slice(user).some((line) => /^(RUN|COPY|ADD) /.test(line))).toBe(false)
  })

  it('creates /data owned by node, so a fresh named volume inherits a root node can write to', () => {
    const user = RUNNER.lines.indexOf('USER node')
    const mkdir = RUNNER.lines.indexOf('RUN mkdir /data && chown node:node /data')
    expect(mkdir).toBeGreaterThanOrEqual(0)
    expect(mkdir).toBeLessThan(user)
  })

  it('probes GET /healthz with node:http, healthy on a 200 alone', () => {
    const [probe, ...more] = inRunner('HEALTHCHECK')
    expect(more).toEqual([])
    expect(probe).toContain("require('node:http').get('http://127.0.0.1:' + process.env.PORT + '/healthz'")
    expect(probe).toContain('process.exit(r.statusCode === 200 ? 0 : 1)')
    expect(probe).toContain(".on('error', () => process.exit(1))")
  })

  it('starts the compiled server and bakes no secret or data directory into the image', () => {
    expect(inRunner('CMD')).toEqual(['["node", "dist/server.js"]'])
    const baked = [...inRunner('ENV'), ...STAGES.flatMap((stage) => stage.lines.filter((l) => l.startsWith('ARG ')))]
    for (const line of baked) expect(line).not.toMatch(/PASSWORD|SECRET|SERVICE_KEYS|DATA_DIR/)
  })
})
