import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, PLAN_A } from '../testing/plan-fixture'
import { BIND_PROJECT_HINTS, BindProjectForm } from './bind-project-form'
import type { BindProjectWrite } from './bind-project-form'

afterEach(cleanup)

const PROJECT = '01MTPPPPPPPPPPPPPPPPPPPPP1'

const served = (): ActionResult<ReturnType<typeof planScreenModel>> => ({
  ok: true,
  value: planScreenModel(atlasPlan()),
})

const refused = (detail: string) => ({ ok: false as const, detail })

const show = (bind: BindProjectWrite) =>
  render(<BindProjectForm bind={bind} epicId={EPIC_1} planId={PLAN_A} />)

const field = (): HTMLElement => screen.getByLabelText('Microtask project to bind this rail to')

const type = (value: string): void => {
  fireEvent.change(field(), { target: { value } })
}

const submit = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Bind project' }))
}

describe('binding a rail by naming its project', () => {
  it('sends the project and the role, and no token of any kind', async () => {
    const bind = vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite
    show(bind)
    type(PROJECT)
    submit()
    await vi.waitFor(() => {
      expect(bind).toHaveBeenCalledWith(PLAN_A, EPIC_1, { projectId: PROJECT, role: 'view' })
    })
  })

  it('sends manage when manage is chosen, those being the two a bridge means anything at', async () => {
    const bind = vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite
    show(bind)
    type(PROJECT)
    fireEvent.change(screen.getByLabelText('Role to bind at'), { target: { value: 'manage' } })
    submit()
    await vi.waitFor(() => {
      expect(bind).toHaveBeenCalledWith(PLAN_A, EPIC_1, { projectId: PROJECT, role: 'manage' })
    })
  })

  it('offers only the two roles a binding may be declared at, and never write', () => {
    show(vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite)
    const options = [...document.querySelectorAll('option')].map((one) => one.getAttribute('value'))
    expect(options).toEqual(['view', 'manage'])
  })

  it('trims what was typed, so a pasted id with a stray space still names its project', async () => {
    const bind = vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite
    show(bind)
    type(`  ${PROJECT} `)
    submit()
    await vi.waitFor(() => {
      expect(bind).toHaveBeenCalledWith(PLAN_A, EPIC_1, { projectId: PROJECT, role: 'view' })
    })
  })

  it('asks for a project rather than sending an empty one, and makes no request', async () => {
    const bind = vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite
    show(bind)
    submit()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', BIND_PROJECT_HINTS.empty)
    expect(bind).not.toHaveBeenCalled()
  })

  it('clears the field once the rail is bound, there being nothing left to send', async () => {
    const bind = vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite
    show(bind)
    type(PROJECT)
    submit()
    await vi.waitFor(() => {
      expect(field()).toHaveProperty('value', '')
    })
  })

  // Two authorities are asked and they fail differently — may not bind rails here, may not share that
  // project there — so the API's own sentence is rendered rather than one this form invents.
  it('shows the API’s own refusal verbatim, since the two gates fail for different reasons', async () => {
    const detail = 'You may not share that project.'
    const bind = vi.fn(() => Promise.resolve(refused(detail))) as unknown as BindProjectWrite
    show(bind)
    type(PROJECT)
    submit()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', detail)
  })

  it('keeps what was typed after a refusal, so a retry is not a retype', async () => {
    const bind = vi.fn(() => Promise.resolve(refused('no'))) as unknown as BindProjectWrite
    show(bind)
    type(PROJECT)
    submit()
    await screen.findByRole('alert')
    expect(field()).toHaveProperty('value', PROJECT)
  })

  it('says nothing at all before anything is submitted', () => {
    show(vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // A project id is in the URL of every page of that project in Microtask, so none of the masking,
  // autoComplete-off and never-repopulate reasoning `bind-fields.tsx` carries applies here.
  it('treats the id as ordinary text rather than as a secret', () => {
    show(vi.fn(() => Promise.resolve(served())) as unknown as BindProjectWrite)
    expect(field().getAttribute('type')).toBe('text')
    expect(field().getAttribute('autocomplete')).toBeNull()
  })
})
