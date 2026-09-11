'use client'

import { Button } from '@repo/ui/components/button'
import { CreateLinkForm } from './create-link-form'
import { LinkRow } from './link-row'
import type { ScopeChoice, ShareControls } from './types'
import type { ShareLinks } from './use-share-links'

/** Props for {@link ShareBody}. */
export interface ShareBodyProps {
  /** The links and their writes. */
  links: ShareLinks
  /** Which controls to draw. */
  controls: ShareControls
  /** The scopes a new link may be minted over. */
  choices: readonly ScopeChoice[]
  /** What a project-scoped link would open. */
  exposure: string
}

/** What a holder who can mint but not list is told, in place of a list that would 403. */
export const CREATE_ONLY_NOTE =
  'You can create links here, but not list, rename or revoke them. Copy a new link now: it is shown only once.'

const Listed = ({ links, controls, choices }: Omit<ShareBodyProps, 'exposure'>) => {
  if (links.state === 'loading') return <p className="text-[13px] text-muted-foreground">Loading links…</p>
  if (links.state === 'failed') {
    return (
      <div className="flex items-center gap-3">
        <p className="text-[13px] text-destructive" role="alert">{links.problem}</p>
        <Button onClick={() => void links.load()} size="sm" type="button" variant="outline">Try again</Button>
      </div>
    )
  }
  if (links.links.length === 0) {
    return <p className="border-t pt-3 text-[13px] text-muted-foreground">No links yet — add one above.</p>
  }
  return (
    <div className="grid">
      {links.links.map((link) => (
        <LinkRow choices={choices} controls={controls} key={link.token} link={link} links={links} />
      ))}
    </div>
  )
}

/** The dialog's body: the create form, what just happened, and the list — or the note in its place. */
export function ShareBody({ links, controls, choices, exposure }: ShareBodyProps) {
  const listing = controls.read
  return (
    <div className="grid max-h-[60vh] gap-4 overflow-y-auto">
      {controls.create ? <CreateLinkForm choices={choices} exposure={exposure} onCreate={links.create} /> : null}
      {links.notice !== '' ? <p className="text-[13px] text-ok" role="status">{links.notice}</p> : null}
      {links.problem !== '' && links.state !== 'failed' ? (
        <p className="text-[13px] text-destructive" role="alert">{links.problem}</p>
      ) : null}
      {listing ? null : <p className="text-[13px] text-muted-foreground">{CREATE_ONLY_NOTE}</p>}
      {listing || links.links.length > 0 ? <Listed choices={choices} controls={controls} links={links} /> : null}
    </div>
  )
}
