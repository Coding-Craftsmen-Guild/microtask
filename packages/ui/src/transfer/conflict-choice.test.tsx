import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConflictChoiceField } from './conflict-choice'
import type { ConflictChoice } from './vocabulary'

const field = (value: ConflictChoice, shareLinks = 3) => {
  const onChange = vi.fn()
  render(
    <ConflictChoiceField
      name="Acme rollout"
      onChange={onChange}
      projectId="01PROJECT"
      shareLinks={shareLinks}
      value={value}
    />,
  )
  return onChange
}

const notice = () => document.querySelector('[data-slot="remint-notice"]')

describe('ConflictChoiceField', () => {
  it('offers exactly the three choices §7.4 names, and no fourth', () => {
    field('skip')
    expect(screen.getAllByRole('radio').length).toBe(3)
    for (const label of ['Skip', 'Import as new', 'Replace']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
  })

  it('states the remint consequence verbatim while import as new is the choice in force', () => {
    field('new')
    expect(notice()?.textContent).toBe(
      "3 share links will get new URLs; the existing project's links keep working.",
    )
  })

  it('says nothing about reminting under skip or replace, which preserve the tokens', () => {
    field('skip')
    expect(notice()).toBeNull()
  })

  it('says nothing about reminting under replace, the choice that keeps every token', () => {
    field('replace')
    expect(notice()).toBeNull()
  })

  it('counts the links the dropped group asserts rather than a fixed number', () => {
    field('new', 1)
    expect(notice()?.textContent).toBe(
      "1 share link will get a new URL; the existing project's links keep working.",
    )
  })

  it('reports the choice the admin picked', async () => {
    const onChange = field('skip')
    await userEvent.click(screen.getByLabelText('Import as new'))
    expect(onChange.mock.calls).toEqual([['new']])
  })

  it('checks only the choice in force, so the radio group cannot show two answers', () => {
    field('replace')
    const checked = screen.getAllByRole('radio').filter((one) => (one as HTMLInputElement).checked)
    expect(checked.length).toBe(1)
    expect((checked[0] as HTMLInputElement).value).toBe('replace')
  })

  it('falls back to the project id when the dropped group carries no name', () => {
    const onChange = vi.fn()
    render(
      <ConflictChoiceField
        name=""
        onChange={onChange}
        projectId="01PROJECT"
        shareLinks={0}
        value="skip"
      />,
    )
    expect(screen.getByText('01PROJECT already exists')).toBeTruthy()
  })
})
