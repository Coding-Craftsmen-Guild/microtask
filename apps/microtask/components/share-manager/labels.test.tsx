import { describe, expect, it } from 'vitest'
import { linkName, revokeMessage, revokeTitle, revokedNotice, ROLE_LABEL, scopeLabel } from './labels'
import { shareUrlFor } from './share-url'

const P = '01HZZZZZZZZZZZZZZZZZZZZZP1'
const T = '01HZZZZZZZZZZZZZZZZZZZZZT1'
const choices = [
  { value: T, label: 'Go-live', scope: { kind: 'task', projectId: P, taskId: T } },
  { value: 'project', label: 'Whole project', scope: { kind: 'project', projectId: P } },
] as const

describe('linkName', () => {
  it('renders a blank name as "Unnamed link", which production data already holds', () => {
    expect(linkName('')).toBe('Unnamed link')
    expect(linkName('   ')).toBe('Unnamed link')
    expect(linkName('Jane at ACME')).toBe('Jane at ACME')
  })
})

describe('ROLE_LABEL', () => {
  it('keeps legacy’s two labels and names the third role', () => {
    expect(ROLE_LABEL).toEqual({ view: 'Read only', write: 'Read & write', manage: 'Manage' })
  })
})

describe('scopeLabel', () => {
  it('names the task a task-scoped link opens', () => {
    expect(scopeLabel({ kind: 'task', projectId: P, taskId: T }, choices)).toBe('Go-live')
  })

  it('names a project-scoped link as the whole project', () => {
    expect(scopeLabel({ kind: 'project', projectId: P }, choices)).toBe('Whole project')
  })

  it('says so when the task a link was scoped to has been deleted', () => {
    expect(scopeLabel({ kind: 'task', projectId: P, taskId: 'GONE' }, choices)).toBe('A deleted task')
  })
})

describe('revokeTitle', () => {
  it('quotes the name, or asks about "this link" when there is none', () => {
    expect(revokeTitle('Jane')).toBe('Revoke “Jane”?')
    expect(revokeTitle('')).toBe('Revoke this link?')
  })
})

describe('revokeMessage', () => {
  it('says access ends at once', () => {
    expect(revokeMessage('view')).toBe('Anyone using it loses access immediately. This cannot be undone.')
  })

  it('says a manage link takes the links created with it', () => {
    expect(revokeMessage('manage')).toBe(
      'Anyone using it loses access immediately, and so does every link created with it. This cannot be undone.',
    )
  })
})

describe('revokedNotice', () => {
  it('counts the cascade rather than hiding it', () => {
    expect(revokedNotice(1)).toBe('Link revoked.')
    expect(revokedNotice(3)).toBe('3 links revoked: this one and 2 created with it.')
  })
})

describe('shareUrlFor', () => {
  it('builds /s/<token> on the origin it is given', () => {
    expect(shareUrlFor('https://tasks.example.com', 'tok_ABC')).toBe('https://tasks.example.com/s/tok_ABC')
    expect(shareUrlFor('http://localhost:3000', 'tok_ABC')).toBe('http://localhost:3000/s/tok_ABC')
  })

  it('encodes the token rather than trusting it', () => {
    expect(shareUrlFor('https://a.example', 'a/b')).toBe('https://a.example/s/a%2Fb')
  })
})
