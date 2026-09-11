import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Stage {
  readonly from: string
  readonly lines: readonly string[]
}

const DOCKERFILE = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8')

const stagesOf = (text: string): Stage[] => {
  const stages: { from: string; lines: string[] }[] = []
  const lines = text
    .replaceAll(/\\\r?\n/g, ' ')
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
  RUNNER.lines
    .filter((line) => line.startsWith(`${keyword} `))
    .map((line) => line.slice(keyword.length + 1))

describe('apps/microtask/Dockerfile (ADR 0026)', () => {
  it('roots every stage in node:24-slim, and ships a runner without the pnpm and turbo of base', () => {
    const aliases = STAGES.map((stage) => stage.from.split(/\s+AS\s+/i)[1])
    STAGES.forEach((stage, index) => {
      const image = stage.from.split(/\s+/)[0] ?? ''
      expect(image === 'node:24-slim' || aliases.slice(0, index).includes(image)).toBe(true)
    })
    expect(RUNNER.from).toBe('node:24-slim AS runner')
  })

  it('prunes to microtask alone, once, positionally', () => {
    expect(DOCKERFILE.match(/turbo prune \S+/g)).toEqual(['turbo prune microtask'])
    expect(DOCKERFILE).toContain('turbo prune microtask --docker')
  })

  it('ships the standalone server with .next/static and public beside its nested server.js', () => {
    expect(inRunner('COPY')).toEqual([
      '--from=builder /repo/apps/microtask/.next/standalone ./',
      '--from=builder /repo/apps/microtask/.next/static ./apps/microtask/.next/static',
      '--from=builder /repo/apps/microtask/public ./apps/microtask/public',
    ])
    expect(inRunner('CMD')).toEqual(['["node", "apps/microtask/server.js"]'])
  })

  it('listens on every interface, because the standalone server reads no CLI flag', () => {
    expect(inRunner('ENV').join(' ')).toMatch(/\bHOSTNAME=0\.0\.0\.0\b/)
  })

  it('runs as node, set after the last step that writes and never switched back', () => {
    expect(inRunner('USER')).toEqual(['node'])
    const user = RUNNER.lines.indexOf('USER node')
    expect(RUNNER.lines.slice(user).some((line) => /^(RUN|COPY|ADD) /.test(line))).toBe(false)
  })

  it('probes the dynamic GET /login, never a static file that stays up on a failed boot', () => {
    const [probe, ...more] = inRunner('HEALTHCHECK')
    expect(more).toEqual([])
    expect(probe).toContain("require('node:http').get('http://127.0.0.1:' + process.env.PORT + '/login'")
    expect(probe).toContain('process.exit(r.statusCode === 200 ? 0 : 1)')
    expect(probe).toContain(".on('error', () => process.exit(1))")
  })

  it('bakes no secret into any stage, so the build cannot embed a real Server Actions key', () => {
    const baked = STAGES.flatMap((stage) => stage.lines.filter((line) => /^(ENV|ARG) /.test(line)))
    for (const line of baked) expect(line).not.toMatch(/SECRET|API_KEY|ENCRYPTION_KEY|PASSWORD/)
  })
})
