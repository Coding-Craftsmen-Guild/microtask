import { describe, expect, it } from 'vitest'
import { linkDocumentRoot, linkPath, linkTaskPath } from './paths'
import { tabDocumentUrl } from '../tabs/save-tab'

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const REF = { projectId: '01M240ERCRWWCN16Q5AHP1FZAQ', taskId: '01M240FB4GD6PF6V0PKZVF6FD9' }

describe('the client surface’s paths (ADR 0037)', () => {
  it('puts a link at /s/<token> and a task inside a project-scoped one at /s/<token>/t/<taskId>', () => {
    expect(linkPath(TOKEN)).toBe(`/s/${TOKEN}`)
    expect(linkTaskPath(TOKEN, REF.taskId)).toBe(`/s/${TOKEN}/t/${REF.taskId}`)
  })

  it('writes documents under the token, where the link document route reads it as the credential', () => {
    const root = linkDocumentRoot(TOKEN, REF)
    expect(tabDocumentUrl(root, '01M240FB4GD6PF6V0PKZVF6FDA')).toBe(
      `/s/${TOKEN}/api/projects/${REF.projectId}/tasks/${REF.taskId}/tabs/01M240FB4GD6PF6V0PKZVF6FDA/document`,
    )
  })

  it('encodes every segment, so a hostile value cannot add one', () => {
    expect(linkPath('a/../b')).toBe('/s/a%2F..%2Fb')
    expect(linkTaskPath(TOKEN, '../x')).toBe(`/s/${TOKEN}/t/..%2Fx`)
    expect(linkDocumentRoot('a?b', { projectId: 'p/q', taskId: 't#u' })).toBe('/s/a%3Fb/api/projects/p%2Fq/tasks/t%23u/tabs')
  })
})
