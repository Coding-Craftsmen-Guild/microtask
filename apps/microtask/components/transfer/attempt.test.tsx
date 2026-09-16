import { describe, expect, it } from 'vitest'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import {
  applied,
  harvestRefused,
  harvesting,
  HARVEST_FAILED,
  IDLE,
  said,
  stagedInto,
} from './attempt'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

const plan = { sessionId: SESSION, groups: [] }

const outcome = { sessionId: SESSION, projects: [] }

const files: readonly HarvestedFile[] = [
  { path: 'drop/a.json', file: new File(['a'], 'a.json') },
]

const stagedOk = stagedInto(harvesting(files), { ok: true, sessionId: SESSION, preview: plan, failures: [] })

describe('a harvest that succeeded opens a fresh attempt', () => {
  it('keeps the files, marks the attempt harvested, and goes busy', () => {
    const attempt = harvesting(files)
    expect(attempt.files).toEqual(files)
    expect(attempt.harvested).toBe(true)
    expect(attempt.busy).toBe(true)
  })

  it('is harvested even for an empty folder, which is a real thing to drop', () => {
    expect(harvesting([]).harvested).toBe(true)
  })

  it('clears the previous plan, result, failures and notice rather than merging them', () => {
    const second = harvesting(files)
    expect(second.session).toBeNull()
    expect(second.result).toBeNull()
    expect(second.failures).toEqual([])
    expect(second.notice).toBeNull()
  })
})

describe('a harvest that failed says so and leaves nothing to render a panel over', () => {
  it('carries the sentence and the reason, and no files', () => {
    const attempt = harvestRefused(new Error('the file moved mid-drag'))
    expect(attempt.notice).toContain(HARVEST_FAILED)
    expect(attempt.notice).toContain('the file moved mid-drag')
    expect(attempt.files).toEqual([])
  })

  it('is not harvested, which is what stops a panel rendering over a drop nobody read', () => {
    expect(harvestRefused(new Error('x')).harvested).toBe(false)
  })

  it('is distinguishable from an empty folder that harvested cleanly', () => {
    expect(harvesting([]).harvested).not.toBe(harvestRefused(new Error('x')).harvested)
    expect(harvesting([]).files).toEqual(harvestRefused(new Error('x')).files)
  })

  it('is not busy, so the console does not sit on a spinner for a drop that ended', () => {
    expect(harvestRefused(new Error('x')).busy).toBe(false)
  })
})

describe('a staging run that settled either carries a plan or replaces it with a sentence', () => {
  it('keeps the session, the plan and every per-file failure', () => {
    const attempt = stagedInto(harvesting(files), {
      ok: true,
      sessionId: SESSION,
      preview: plan,
      failures: [{ path: 'drop/b.json', detail: 'refused' }],
    })
    expect(attempt.session).toEqual({ sessionId: SESSION, preview: plan })
    expect(attempt.failures).toEqual([{ path: 'drop/b.json', detail: 'refused' }])
    expect(attempt.busy).toBe(false)
    expect(attempt.harvested).toBe(true)
  })

  it('drops harvested when the session itself failed, so no empty table is rendered', () => {
    const attempt = stagedInto(harvesting(files), { ok: false, detail: 'not allowed' })
    expect(attempt.harvested).toBe(false)
    expect(attempt.session).toBeNull()
    expect(attempt.notice).toBe('not allowed')
    expect(attempt.busy).toBe(false)
  })
})

describe('a confirm that landed keeps the plan beside the result', () => {
  it('records the result without discarding the preview it is joined to', () => {
    const attempt = applied(stagedOk, outcome)
    expect(attempt.result).toEqual(outcome)
    expect(attempt.session).toEqual({ sessionId: SESSION, preview: plan })
    expect(attempt.busy).toBe(false)
  })

  it('leaves a refusal readable beside the plan, so a choice can be changed and retried', () => {
    const attempt = said(stagedOk, 'the store changed under it')
    expect(attempt.notice).toBe('the store changed under it')
    expect(attempt.session).not.toBeNull()
    expect(attempt.busy).toBe(false)
  })
})

describe('the idle attempt says nothing and renders nothing', () => {
  it('holds no files, no plan, no result, no failures and no notice', () => {
    expect(IDLE).toEqual({
      files: [],
      session: null,
      result: null,
      failures: [],
      notice: null,
      busy: false,
      harvested: false,
    })
  })
})
