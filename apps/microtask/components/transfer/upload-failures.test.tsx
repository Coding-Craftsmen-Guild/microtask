import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileFailure } from './stage-drop'
import { UploadFailures } from './upload-failures'

const rows = (): readonly Element[] => [
  ...document.body.querySelectorAll('[data-slot="upload-failures"] li'),
]

const textsOf = (slot: string): readonly string[] =>
  [...document.body.querySelectorAll(`[data-slot="${slot}"]`)].map((node) => node.textContent ?? '')

const complaining = () => {
  const said: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    said.push(args.map((one) => String(one)).join(' '))
  })
  return { said, spy }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('every file that did not make it gets a row, with its own reason', () => {
  it('renders nothing at all when nothing failed, so a clean drop shows no alert', () => {
    render(<UploadFailures failures={[]} />)
    expect(document.body.querySelector('[data-slot="upload-failures"]')).toBeNull()
  })

  it('renders one row per failure and never collapses two into one', () => {
    const failures: readonly FileFailure[] = [
      { path: 'drop/a.json', detail: 'one reason' },
      { path: 'drop/b.json', detail: 'another reason' },
      { path: 'drop/c.json', detail: 'a third reason' },
    ]
    render(<UploadFailures failures={failures} />)
    expect(rows()).toHaveLength(3)
    expect(textsOf('failed-path')).toEqual(['drop/a.json', 'drop/b.json', 'drop/c.json'])
    expect(textsOf('failed-reason')).toEqual(['one reason', 'another reason', 'a third reason'])
  })

  it('keeps each reason against its own file, so two different refusals read differently', () => {
    render(
      <UploadFailures
        failures={[
          { path: 'drop/big.json', detail: 'an import accepts at most 262,144 bytes at a time.' },
          { path: 'drop/late.json', detail: 'This import session is no longer there.' },
        ]}
      />,
    )
    const reasons = textsOf('failed-reason')
    expect(new Set(reasons).size).toBe(2)
    expect(reasons[0]).toContain('262,144')
    expect(reasons[1]).not.toContain('262,144')
  })

  it('counts in the heading, and says "1 file" rather than "1 files"', () => {
    render(<UploadFailures failures={[{ path: 'a', detail: 'x' }]} />)
    expect(document.body.querySelector('h3')?.textContent).toBe('1 file was not staged')
  })

  it('says how many when there is more than one', () => {
    render(
      <UploadFailures
        failures={[
          { path: 'a', detail: 'x' },
          { path: 'b', detail: 'y' },
        ]}
      />,
    )
    expect(document.body.querySelector('h3')?.textContent).toBe('2 files were not staged')
  })

  it('announces the list, so a screen reader hears that files went missing', () => {
    render(<UploadFailures failures={[{ path: 'a', detail: 'x' }]} />)
    expect(document.body.querySelector('[data-slot="upload-failures"]')?.getAttribute('role')).toBe(
      'alert',
    )
  })
})

describe('two failures at one harvested path are two rows, keyed apart', () => {
  const twice: readonly FileFailure[] = [
    { path: 'drop/a.json', detail: 'the first one' },
    { path: 'drop/a.json', detail: 'the second one' },
  ]

  it('renders both rows with both reasons', () => {
    render(<UploadFailures failures={twice} />)
    expect(rows()).toHaveLength(2)
    expect(textsOf('failed-reason')).toEqual(['the first one', 'the second one'])
  })

  it('draws no duplicate-key complaint, which is what would let React drop one of them', () => {
    const { said } = complaining()
    render(<UploadFailures failures={twice} />)
    expect(said.filter((one) => one.includes('same key'))).toEqual([])
  })

  it('draws that complaint for a list keyed by path alone, which is what makes the check real', () => {
    const { said } = complaining()
    render(
      <ul>
        {twice.map((failure) => (
          <li key={failure.path}>{failure.detail}</li>
        ))}
      </ul>,
    )
    expect(said.filter((one) => one.includes('same key'))).not.toEqual([])
  })
})
