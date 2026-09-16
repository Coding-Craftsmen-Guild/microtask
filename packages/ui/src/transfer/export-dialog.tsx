'use client'

import { Button } from '../components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog'
import { cancelWhenClosed } from '../shell/dismiss'

const OPTION = 'flex items-center gap-2 text-[13px]'
const WARNING = 'rounded-md bg-destructive/10 px-3 py-2 text-[13px] ring-1 ring-destructive/50'
const STRIPPED = 'text-[13px] text-muted-foreground'

/** Props for {@link ExportDialog}. */
export interface ExportDialogProps {
  /** Whether the dialog is mounted and modal. */
  open: boolean
  /** Whether the download will carry share links and their tokens. */
  preserveTokens: boolean
  /** Called with the new setting when the opt-in is toggled. */
  onPreserveTokensChange: (preserve: boolean) => void
  /** Called when the download is accepted. */
  onExport: () => void
  /** Called on Cancel, Escape, and any other dismissal. */
  onCancel: () => void
}

/**
 * The export dialog, whose whole job is to make the credential half of an export a decision.
 *
 * Stripping is the default for a manual download and preserving is opt-in (ADR 0017), so the
 * plaintext-token warning is rendered by the opt-in being on rather than standing on the page
 * permanently: a warning that is always there is one an admin stops reading, and the moment it
 * has to land is the moment the setting that makes it true is switched on.
 */
export function ExportDialog({
  open,
  preserveTokens,
  onPreserveTokensChange,
  onExport,
  onCancel,
}: ExportDialogProps) {
  return (
    <Dialog onOpenChange={cancelWhenClosed(onCancel)} open={open}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Share links are left out of a download unless you ask for them, because carrying them
            turns the file into a credential dump rather than a copy of the data.
          </DialogDescription>
        </DialogHeader>
        <label className={OPTION}>
          <input
            checked={preserveTokens}
            onChange={(event) => {
              onPreserveTokensChange(event.target.checked)
            }}
            type="checkbox"
          />
          Preserve share tokens — needed for migration
        </label>
        {preserveTokens ? (
          <p className={WARNING} data-slot="token-warning">
            This export will contain live share tokens in plaintext. Anyone who opens the file can
            use every link it carries, and deleting the file does not revoke them.
          </p>
        ) : (
          <p className={STRIPPED} data-slot="stripped-notice">
            Share links will be omitted from the file entirely.
          </p>
        )}
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onExport} type="button">
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
