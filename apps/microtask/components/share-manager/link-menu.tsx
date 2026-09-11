'use client'

import type { RoleValue } from '@repo/contracts'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { useState } from 'react'
import { OptionsMenu, type MenuEntry } from '../task-tree/options-menu'
import { revokeMessage, revokeTitle, ROLE_LABEL } from './labels'
import type { Link, ShareControls } from './types'
import type { ShareLinks } from './use-share-links'

const ROLES: readonly RoleValue[] = ['view', 'write', 'manage']

/** Props for {@link LinkMenu}. */
export interface LinkMenuProps {
  /** The link. */
  link: Link
  /** The manager's state, for the writes. */
  links: ShareLinks
  /** Which controls to draw. */
  controls: ShareControls
}

/**
 * A link's options: Rename, a role change per role with the current one disabled, and Revoke.
 *
 * Rename and the role changes are a PATCH that **keeps the token**, so the client's URL keeps
 * working (ADR 0035). A rename may clear the name — production data holds an unnamed link, and
 * the prompt allows the empty answer for exactly that.
 */
export function LinkMenu({ link, links, controls }: LinkMenuProps) {
  const [opened, open] = useState<'rename' | 'revoke' | null>(null)
  const close = () => open(null)
  const roles: MenuEntry[] = ROLES.map((role) => ({
    id: `role:${role}`,
    label: `Set to ${ROLE_LABEL[role].toLowerCase()}`,
    disabled: role === link.role,
    onSelect: () => void links.update(link.token, { role }),
  }))
  const items: MenuEntry[] = [
    ...(controls.update ? [{ id: 'rename', label: 'Rename', onSelect: () => open('rename') }, ...roles] : []),
    ...(controls.revoke ? [{ id: 'revoke', label: 'Revoke link', danger: true, onSelect: () => open('revoke') }] : []),
  ]
  return (
    <>
      <OptionsMenu items={items} label="Link options" />
      <PromptDialog
        allowEmpty
        defaultValue={link.name}
        label="Who is it for?"
        onCancel={close}
        onSubmit={(name) => {
          close()
          void links.update(link.token, { name })
        }}
        open={opened === 'rename'}
        placeholder="Jane at ACME"
        submitLabel="Save"
        title="Name this link"
      />
      <ConfirmDialog
        confirmLabel="Revoke"
        danger
        message={revokeMessage(link.role)}
        onCancel={close}
        onConfirm={() => {
          close()
          void links.revoke(link.token)
        }}
        open={opened === 'revoke'}
        title={revokeTitle(link.name)}
      />
    </>
  )
}
