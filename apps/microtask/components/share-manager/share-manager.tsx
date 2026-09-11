'use client'

import { Button } from '@repo/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog'
import { useState } from 'react'
import { GOLD } from '../projects/create-project'
import { plural } from '../projects/summary'
import { ShareBody } from './share-body'
import type { ScopeChoice, ShareActions, ShareControls } from './types'
import { useShareLinks } from './use-share-links'

/**
 * What the dialog says about the three roles.
 *
 * Deliberately **not** legacy's hint, which claimed nobody could add, rename or delete tabs while
 * read & write links could add them — stale copy the parity inventory says not to carry forward.
 */
export const SHARE_HINT =
  'One link per person. Read only links can look; read & write links can also edit and add tabs; manage links can also delete, reorder and share.'

/** Props for {@link ShareManager}: no token among them, only a count. */
export interface ShareManagerProps {
  /** The project the links belong to. */
  projectId: string
  /** The task a task page's manager is scoped to: it lists that task's links only. */
  taskId?: string
  /** How many links there are, counted on the server; `undefined` when the caller was not told. */
  count: number | undefined
  /** Which controls to draw, from `capabilities()` — never from role. */
  controls: ShareControls
  /** The scopes a new link may be minted over, tasks first. */
  choices: readonly ScopeChoice[]
  /** Every folder and task a project-scoped link would open, said before one is minted. */
  exposure: string
  /** The reads and writes. */
  actions: ShareActions
}

/**
 * The gold Share button, and the dialog whose links **load when it opens**.
 *
 * The page renders a count and nothing else: a token-bearing list passed to a client component is
 * serialised into the Flight payload and lands in the HTML, which is the credential dump ADR 0033
 * exists to prevent. So tokens reach the browser only when an admin opens the one dialog that
 * exists to show them, and are dropped again when it closes.
 */
export function ShareManager(props: ShareManagerProps) {
  const { controls, count } = props
  const [open, setOpen] = useState(false)
  const links = useShareLinks(props.projectId, props.taskId ?? null, props.actions, controls.read)
  const change = (next: boolean) => {
    setOpen(next)
    if (next) void links.load()
    else links.forget()
  }
  if (!controls.read && !controls.create) return null
  return (
    <div className="flex items-center gap-2.5">
      {count !== undefined && count > 0 ? <span className="text-[13px] text-muted-foreground">{plural(count, 'share link')}</span> : null}
      <Button className={GOLD} onClick={() => change(true)} type="button">
        Share
      </Button>
      <Dialog onOpenChange={change} open={open}>
        <DialogContent className="sm:max-w-[560px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{props.taskId === undefined ? 'Share this project' : 'Share this task'}</DialogTitle>
            <DialogDescription>{SHARE_HINT}</DialogDescription>
          </DialogHeader>
          <ShareBody choices={props.choices} controls={controls} exposure={props.exposure} links={links} />
          <DialogFooter>
            <Button onClick={() => change(false)} type="button" variant="outline">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
