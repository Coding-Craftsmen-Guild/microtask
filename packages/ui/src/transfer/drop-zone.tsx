'use client'

import { useState } from 'react'
import type { DragEvent, InputHTMLAttributes } from 'react'
import { harvestDrop, harvestPick } from './harvest'
import type { HarvestedFile } from './vocabulary'

const IDLE =
  'grid gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center text-[13px]'

const OVER =
  'grid gap-2 rounded-lg border-2 border-dashed border-brand bg-brand-soft p-6 text-center text-[13px]'

const HINT = 'text-muted-foreground'
const CHOOSE = 'cursor-pointer underline underline-offset-2'
const FIELD = 'sr-only'

const DIRECTORY = {
  multiple: true,
  type: 'file',
  webkitdirectory: '',
} as InputHTMLAttributes<HTMLInputElement>

/** Props for {@link DropZone}. */
export interface DropZoneProps {
  /** Called with everything the drop or the pick harvested, each file under its decoded path. */
  onHarvest: (files: readonly HarvestedFile[]) => void
}

/**
 * The drop target and directory picker an import starts from.
 *
 * Two details are load-bearing, and ADR 0018 names both because both fail silently. The picker is
 * `<input type="file" webkitdirectory multiple>`, which is the only input that can pick a folder
 * — a plain one reports bare file names, and a `tasks/01T.json` with no path is an orphan the
 * server can only refuse. And the drop handler hands `dataTransfer` to {@link harvestDrop}
 * **before** anything is awaited: once dispatch ends the drag data store is protected again, so a
 * handler that awaits first harvests an empty drop and reports it as a successful one.
 *
 * The dragover is cancelled because a browser that keeps its default never fires a drop at all,
 * and it does nothing else: it repeats for as long as a drag hovers, so counting it would light
 * the zone permanently. The highlight counts enters against leaves instead of tracking a boolean,
 * because a drag moving onto one of the zone's own children fires a dragleave for the zone on the
 * way — a move within the target, not a departure from it — and the child's enter arrives first.
 *
 * A harvest that fails rejects rather than resolving short: a drop reporting fewer files than it
 * carried is the failure ADR 0018 exists to prevent, so nothing here turns one into an empty
 * success.
 */
export function DropZone({ onHarvest }: DropZoneProps) {
  const [depth, setDepth] = useState(0)
  const enter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDepth((deeper) => deeper + 1)
  }
  const hover = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
  }
  const leave = () => {
    setDepth((deeper) => Math.max(0, deeper - 1))
  }
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const harvesting = harvestDrop(event.dataTransfer)
    setDepth(0)
    void harvesting.then(onHarvest)
  }
  return (
    <section
      className={depth > 0 ? OVER : IDLE}
      data-slot="drop-zone"
      onDragEnter={enter}
      onDragLeave={leave}
      onDragOver={hover}
      onDrop={drop}
    >
      <p>Drop a project folder, a workspace volume, or a bundle here.</p>
      <label className={CHOOSE}>
        Or choose a folder
        <input
          {...DIRECTORY}
          className={FIELD}
          onChange={(event) => {
            onHarvest(harvestPick(event.target.files))
          }}
        />
      </label>
      <p className={HINT}>Everything dropped is previewed before anything is written.</p>
    </section>
  )
}
