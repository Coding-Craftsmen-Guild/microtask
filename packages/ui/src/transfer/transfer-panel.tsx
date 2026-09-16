'use client'

import { useMemo } from 'react'
import { Button } from '../components/button'
import { ConflictList } from './conflict-list'
import { collidingProjects } from './outcomes'
import { PreviewTable } from './preview-table'
import { ResultTable } from './result-table'
import { useConflictChoices } from './use-conflict-choices'
import type { HarvestedFile, ProjectChoice, TransferPreview, TransferResult } from './vocabulary'

const PANEL = 'grid gap-4'
const HEADING = 'text-[13px] font-semibold'
const PATHS = 'grid max-h-40 gap-0.5 overflow-auto font-mono text-[12px] text-muted-foreground'
const MUTED = 'text-[13px] text-muted-foreground'
const ACTIONS = 'flex justify-end'

const harvested = (count: number) =>
  count === 1 ? '1 file harvested' : `${String(count)} files harvested`

/** Props for {@link TransferPanel}. */
export interface TransferPanelProps {
  /** What the browser harvested from the drop or the picker, path and all. */
  files: readonly HarvestedFile[]
  /** What the server staged and checked, or null before anything has been previewed. */
  preview: TransferPreview | null
  /** What a confirm did, or null before one has been made. */
  result: TransferResult | null
  /** Called with one choice per colliding project when the import is accepted. */
  onConfirm: (choices: readonly ProjectChoice[]) => void
}

/**
 * The shared import panel: a harvested drop, the preview it produced, and what the confirm did.
 *
 * It is product-agnostic and holds no knowledge of any product's entities — every shape it reads
 * is restated structurally in `vocabulary.ts` for the reason ADR 0014 gives — so the same panel
 * serves both apps and neither can teach it its own vocabulary.
 *
 * Every harvested path is listed rather than counted, because the failure ADR 0018 was written
 * about is a file that goes missing between the drop and the preview, and a count on one side of
 * that gap cannot be compared with the rows on the other.
 */
export function TransferPanel({ files, preview, result, onConfirm }: TransferPanelProps) {
  const collidingIds = useMemo(
    () => collidingProjects(preview?.groups ?? []).map((one) => one.projectId),
    [preview],
  )
  const choices = useConflictChoices(collidingIds)
  return (
    <section className={PANEL} data-slot="transfer-panel">
      <div>
        <h3 className={HEADING} data-slot="harvested">
          {harvested(files.length)}
        </h3>
        <ul className={PATHS}>
          {files.map((one) => (
            <li key={one.path}>{one.path}</li>
          ))}
        </ul>
      </div>
      {preview === null ? (
        <p className={MUTED}>Nothing has been previewed yet.</p>
      ) : (
        <>
          <PreviewTable groups={preview.groups} />
          <ConflictList choices={choices} groups={preview.groups} />
          <div className={ACTIONS}>
            <Button
              onClick={() => {
                onConfirm(choices.chosen)
              }}
              type="button"
            >
              Import
            </Button>
          </div>
        </>
      )}
      {result === null ? null : <ResultTable results={result.projects} />}
    </section>
  )
}
