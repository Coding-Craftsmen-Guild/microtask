'use client'

import { Input } from '@repo/ui/components/input'
import { useState } from 'react'
import { inTreeOrder } from '../projects/summary'
import { CreateBar } from './create-bar'
import { TreeProvider, useTree, type TreeScope } from './tree-context'
import { TreeBody } from './tree-body'
import { groupsOf, filtered } from './tree-model'

/** Props for {@link TaskTree}: everything it reads, none of it a share token. */
export type TaskTreeProps = TreeScope

const TreeProblem = () => {
  const { problem } = useTree()
  return problem === '' ? null : (
    <p className="text-[13px] text-destructive" role="alert">
      {problem}
    </p>
  )
}

/**
 * The project page's folder tree and task list, searchable in place.
 *
 * Every control is drawn from `controls` — `capabilities()` for a link holder, everything for an
 * admin — and never from a role (ADR 0038). Where the folder list is refused, as it is for a task
 * scope, the tasks are drawn flat with no folder names at all, because a folder name can itself
 * identify another client (ADR 0011).
 *
 * The search is a names-only filter over the manifest the page already holds (ADR 0021), so it
 * sends nothing and can show nothing the page was not already given.
 */
export function TaskTree(scope: TaskTreeProps) {
  const [term, setTerm] = useState('')
  const groups = scope.controls.folders
    ? groupsOf(scope.folders, scope.tasks)
    : [{ folder: null, tasks: inTreeOrder(scope.folders, scope.tasks) }]
  const empty = scope.tasks.length === 0 && (scope.folders.length === 0 || !scope.controls.folders)
  return (
    <TreeProvider scope={scope}>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Search tasks and folders"
            className="min-w-48 flex-1"
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search tasks and folders…"
            type="search"
            value={term}
          />
          <CreateBar />
        </div>
        <TreeProblem />
        <TreeBody empty={empty} groups={filtered(groups, term)} term={term} />
      </section>
    </TreeProvider>
  )
}
