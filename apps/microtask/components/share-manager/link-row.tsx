'use client'

import type { RoleValue } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useRef, useState } from 'react'
import { copyLink } from './copy'
import { linkName, ROLE_LABEL, scopeLabel } from './labels'
import { LinkMenu } from './link-menu'
import { shareUrlFor } from './share-url'
import type { Link, ScopeChoice, ShareControls } from './types'
import type { ShareLinks } from './use-share-links'

/** What a failed copy says, instead of legacy's unconditional "Link copied". */
export const COPY_FAILED = 'Could not copy. The link is selected — press Ctrl+C (⌘C on a Mac) to copy it.'

const BADGE: Readonly<Record<RoleValue, string>> = {
  view: 'rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand',
  write: 'rounded-full bg-gold/25 px-2 py-0.5 text-[12px] font-medium text-foreground',
  manage: 'rounded-full bg-brand px-2 py-0.5 text-[12px] font-medium text-white',
}

const originNow = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

/** Props for {@link LinkRow}. */
export interface LinkRowProps {
  /** The link, token included — this row exists only inside the opened dialog. */
  link: Link
  /** The manager's state, for the writes. */
  links: ShareLinks
  /** Which controls to draw. */
  controls: ShareControls
  /** The scopes, to name what the link opens. */
  choices: readonly ScopeChoice[]
}

/**
 * One link: its name or `Unnamed link`, its role and what it opens, then its URL, Copy, and its
 * options. The URL is built on the origin this page was requested from.
 */
export function LinkRow({ link, links, controls, choices }: LinkRowProps) {
  const url = shareUrlFor(originNow(), link.token)
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<boolean | null>(null)
  const copy = async () => {
    if (field.current !== null) setCopied(await copyLink(field.current, url))
  }
  return (
    <div className="grid gap-2 border-t py-3" data-testid="link-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{linkName(link.name)}</span>
        <span className={BADGE[link.role]}>{ROLE_LABEL[link.role]}</span>
        <span className="text-[12.5px] text-muted-foreground">{scopeLabel(link.scope, choices)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input aria-label={`Share URL for ${linkName(link.name)}`} readOnly ref={field} value={url} />
        <Button onClick={() => void copy()} size="sm" type="button" variant="outline">
          Copy
        </Button>
        <LinkMenu controls={controls} link={link} links={links} />
      </div>
      {copied === null ? null : (
        <p className={copied ? 'text-[12.5px] text-ok' : 'text-[12.5px] text-destructive'} role="status">
          {copied ? 'Link copied.' : COPY_FAILED}
        </p>
      )}
    </div>
  )
}
