'use client'

import { Button } from '@repo/ui/components/button'
import { ExportDialog } from '@repo/ui/transfer/export-dialog'
import { useState } from 'react'
import { startDownload } from './download'
import { exportUrl } from './paths'

const SECTION = 'grid justify-items-start gap-2'
const BLURB = 'text-[13px] text-muted-foreground'

/**
 * The export half of the transfer page: a button, the dialog, and the download it starts.
 *
 * The **only** thing this decides is whether the opt-in was ticked. A ticked box sends
 * `?tokens=preserve` and an unticked one sends **no parameter at all**, so the API's own default
 * is what strips the links: the app never spells `strip`, because a copy of that default here is
 * how a build that lost the plaintext-token warning would still ship a credential dump
 * (ADR 0017). The route handler forwards whatever arrives unchanged, and the API refuses anything
 * outside its enum.
 *
 * The opt-in is reset every time the dialog closes. It is a per-download decision and not a
 * setting: leaving it on would have the second download carry tokens with the warning last seen
 * minutes ago.
 */
export function ExportPanel() {
  const [open, setOpen] = useState(false)
  const [preserveTokens, setPreserveTokens] = useState(false)
  const close = () => {
    setOpen(false)
    setPreserveTokens(false)
  }
  return (
    <section className={SECTION} data-slot="export-panel">
      <Button
        onClick={() => {
          setOpen(true)
        }}
        type="button"
      >
        Export…
      </Button>
      <p className={BLURB}>
        A download carries every project in this workspace. Share links are left out unless you
        ask for them.
      </p>
      <ExportDialog
        onCancel={close}
        onExport={() => {
          close()
          startDownload(exportUrl(preserveTokens ? 'preserve' : null))
        }}
        onPreserveTokensChange={setPreserveTokens}
        open={open}
        preserveTokens={preserveTokens}
      />
    </section>
  )
}
