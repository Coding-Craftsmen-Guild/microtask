import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DropZone } from './drop-zone'
import type { HarvestEntry, HarvestItem, HarvestTransfer } from './harvest'

const CHROMIUM_BATCH = 100

const fileEntry = (fullPath: string): HarvestEntry => ({
  isFile: true,
  isDirectory: false,
  fullPath,
  file: (onFile) => {
    const name = fullPath.split('/').pop() ?? ''
    queueMicrotask(() => {
      onFile(new File([name], name))
    })
  },
})

const folder = (fullPath: string, count: number): HarvestEntry => {
  const children = Array.from({ length: count }, (_, index) =>
    fileEntry(`${fullPath}/task-${String(index)}.json`),
  )
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    createReader: () => {
      let cursor = 0
      return {
        readEntries: (onEntries) => {
          const batch = children.slice(cursor, cursor + CHROMIUM_BATCH)
          cursor += batch.length
          queueMicrotask(() => {
            onEntries(batch)
          })
        },
      }
    },
  }
}

const dropOf = (entries: readonly HarvestEntry[]) => {
  let live = true
  const items: HarvestItem[] = entries.map((entry) => ({
    webkitGetAsEntry: () => (live ? entry : null),
  }))
  const transfer: HarvestTransfer = {
    get items() {
      return live ? items : []
    },
    get files() {
      return []
    },
  }
  return {
    dataTransfer: transfer as unknown as DataTransfer,
    endDispatch: () => {
      live = false
    },
  }
}

const picked = (path: string) => {
  const name = path.split('/').pop() ?? ''
  const file = new File([name], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

const mount = () => {
  const onHarvest = vi.fn()
  render(<DropZone onHarvest={onHarvest} />)
  const zone = document.body.querySelector('[data-slot="drop-zone"]')
  if (zone === null) throw new Error('the drop zone did not render')
  return { onHarvest, zone }
}

const harvested = (onHarvest: ReturnType<typeof vi.fn>) =>
  (onHarvest.mock.calls[0]?.[0] as readonly { readonly path: string }[] | undefined) ?? []

describe('DropZone', () => {
  it('picks a whole directory, which a plain file input cannot do (ADR 0018)', () => {
    mount()
    const input = screen.getByLabelText(/choose a folder/i)
    expect(input.getAttribute('webkitdirectory')).not.toBeNull()
    expect(input.getAttribute('multiple')).not.toBeNull()
    expect(input.getAttribute('type')).toBe('file')
  })

  it('harvests a pick under the paths the input reported, not under bare file names', () => {
    const { onHarvest } = mount()
    const input = screen.getByLabelText(/choose a folder/i)
    const files = [picked('volume/01P/project.json'), picked('volume/01P/tasks/01T.json')]
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    fireEvent.change(input)
    expect(harvested(onHarvest).map((one) => one.path)).toEqual([
      'volume/01P/project.json',
      'volume/01P/tasks/01T.json',
    ])
  })

  it('harvests nothing from a cancelled pick rather than throwing on an empty list', () => {
    const { onHarvest } = mount()
    const input = screen.getByLabelText(/choose a folder/i)
    Object.defineProperty(input, 'files', { configurable: true, value: null })
    fireEvent.change(input)
    expect(harvested(onHarvest)).toEqual([])
  })

  it('harvests a dropped folder whole, though the drag store protects itself the moment dispatch ends', async () => {
    const { onHarvest, zone } = mount()
    const { dataTransfer, endDispatch } = dropOf([folder('/volume', 150)])
    fireEvent.drop(zone, { dataTransfer })
    endDispatch()
    await waitFor(() => {
      expect(onHarvest.mock.calls.length).toBe(1)
    })
    expect(harvested(onHarvest).length).toBe(150)
    expect(harvested(onHarvest).map((one) => one.path)).toContain('volume/task-149.json')
  })

  it('decodes the dropped fullPath, which the server refuses while it still leads with "/"', async () => {
    const { onHarvest, zone } = mount()
    const { dataTransfer, endDispatch } = dropOf([fileEntry('/volume/01P/project.json')])
    fireEvent.drop(zone, { dataTransfer })
    endDispatch()
    await waitFor(() => {
      expect(onHarvest.mock.calls.length).toBe(1)
    })
    expect(harvested(onHarvest).map((one) => one.path)).toEqual(['volume/01P/project.json'])
  })

  it('cancels the dragover, without which the browser never fires a drop at all', () => {
    const { zone } = mount()
    expect(fireEvent.dragOver(zone, { dataTransfer: dropOf([]).dataTransfer })).toBe(false)
  })

  it('cancels the drop, without which the browser navigates away to the dropped file', () => {
    const { zone } = mount()
    expect(fireEvent.drop(zone, { dataTransfer: dropOf([]).dataTransfer })).toBe(false)
  })

  it('shows the drag is over it, and stops showing it once the drag has left again', () => {
    const { zone } = mount()
    const idle = zone.className
    fireEvent.dragEnter(zone, { dataTransfer: dropOf([]).dataTransfer })
    expect(zone.className).not.toBe(idle)
    fireEvent.dragLeave(zone)
    expect(zone.className).toBe(idle)
  })

  it('keeps showing it while the drag moves onto its own children, which fire a dragleave too', () => {
    const { zone } = mount()
    const idle = zone.className
    fireEvent.dragEnter(zone, { dataTransfer: dropOf([]).dataTransfer })
    const child = zone.querySelector('label')
    if (child === null) throw new Error('the drop zone rendered no picker to drag over')
    fireEvent.dragEnter(child, { dataTransfer: dropOf([]).dataTransfer })
    fireEvent.dragLeave(zone)
    expect(zone.className).not.toBe(idle)
  })

  it('stops showing it after a drag that hovered, though dragover repeats while the cursor sits', () => {
    const { zone } = mount()
    const idle = zone.className
    fireEvent.dragEnter(zone, { dataTransfer: dropOf([]).dataTransfer })
    for (let move = 0; move < 5; move += 1) {
      fireEvent.dragOver(zone, { dataTransfer: dropOf([]).dataTransfer })
    }
    fireEvent.dragLeave(zone)
    expect(zone.className).toBe(idle)
  })

  it('does not stay lit when a stray dragleave arrives with no enter behind it', () => {
    const { zone } = mount()
    const idle = zone.className
    fireEvent.dragLeave(zone)
    fireEvent.dragEnter(zone, { dataTransfer: dropOf([]).dataTransfer })
    fireEvent.dragLeave(zone)
    expect(zone.className).toBe(idle)
  })

  it('stops showing it once the drop lands, so the zone does not stay lit', async () => {
    const { zone } = mount()
    const idle = zone.className
    fireEvent.dragEnter(zone, { dataTransfer: dropOf([]).dataTransfer })
    const { dataTransfer, endDispatch } = dropOf([fileEntry('/volume/project.json')])
    fireEvent.drop(zone, { dataTransfer })
    endDispatch()
    await waitFor(() => {
      expect(zone.className).toBe(idle)
    })
  })
})
