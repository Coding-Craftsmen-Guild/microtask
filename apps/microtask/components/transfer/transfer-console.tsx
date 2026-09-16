'use client'

import { DropZone } from '@repo/ui/transfer/drop-zone'
import { TransferPanel } from '@repo/ui/transfer/transfer-panel'
import { UploadFailures } from './upload-failures'
import { useTransfer, type TransferPorts } from './use-transfer'

const CONSOLE = 'grid gap-4'
const NOTICE = 'rounded-md bg-destructive/10 px-3 py-2 text-[13px] ring-1 ring-destructive/50'
const BUSY = 'text-[13px] text-muted-foreground'

/** Props for {@link TransferConsole}: the four actions, and nothing else. */
export type TransferConsoleProps = TransferPorts

/**
 * The import half of the transfer page: drop, stage, preview, confirm.
 *
 * The four Server Actions arrive as props from the page rather than being imported here, which
 * is the same shape every other island in this app takes: it keeps the client component drivable
 * by a test with no action machinery, and it keeps the authority where it belongs — each action
 * re-derives it from `mt_admin` on every call, so nothing this component passes is proof of
 * anything (ADR 0012).
 *
 * `onError` is supplied and is **required** by `DropZone`, because a failed harvest rejects
 * rather than resolving short and nothing outside that component can catch the rejection. It
 * surfaces as an alert, and `harvested` stays false, so a drop that half-read renders a sentence
 * rather than an empty panel above an un-highlighted zone (ADR 0018).
 */
export function TransferConsole(ports: TransferConsoleProps) {
  const transfer = useTransfer(ports)
  return (
    <section className={CONSOLE} data-slot="transfer-console">
      <DropZone onError={transfer.reject} onHarvest={transfer.harvest} />
      {transfer.notice === null ? null : (
        <p className={NOTICE} data-slot="transfer-notice" role="alert">
          {transfer.notice}
        </p>
      )}
      {transfer.busy ? (
        <p className={BUSY} data-slot="transfer-busy">
          Working…
        </p>
      ) : null}
      <UploadFailures failures={transfer.failures} />
      {transfer.harvested ? (
        <TransferPanel
          files={transfer.files}
          onConfirm={transfer.confirm}
          preview={transfer.session?.preview ?? null}
          result={transfer.result}
        />
      ) : null}
    </section>
  )
}
