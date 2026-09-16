import type {
  ConflictChoice,
  TransferGroup,
  TransferOutcome,
  TransferScope,
  TransferWriteOutcome,
} from './vocabulary'

/**
 * The shape every outcome badge shares, exported so a test can strip it and prove the outcomes
 * differ in the half that carries meaning rather than only in the half that carries geometry.
 */
export const BADGE_BASE =
  'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1'

const WILL_IMPORT = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-ok-light/20 text-ok ring-ok/40'

const REFUSED = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-gold/25 text-gold-deep ring-gold-deep/40'

const BROKEN = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-destructive/15 text-destructive ring-destructive/50'

const PASSED_OVER = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-muted text-muted-foreground ring-foreground/20'

const LANDED = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-ok/15 text-ok ring-ok/40'

const OVERWROTE = 'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 bg-brand-soft text-brand ring-brand/30'

/**
 * The paint each preview outcome carries, as whole class strings.
 *
 * Whole strings rather than a base plus an interpolated colour, because Tailwind's scanner reads
 * source as plain text and emits nothing for a name it cannot see literally — the same reason
 * `ProgressBar` holds both of its gradients as constants.
 */
export const PREVIEW_TONE: Readonly<Record<TransferOutcome, string>> = {
  importable: WILL_IMPORT,
  blocked: REFUSED,
  error: BROKEN,
}

/** What each preview outcome is called in the table. */
export const PREVIEW_LABEL: Readonly<Record<TransferOutcome, string>> = {
  importable: 'Will import',
  blocked: 'Blocked',
  error: 'Error',
}

/**
 * The paint each confirm outcome carries, as whole class strings.
 *
 * `skipped` is deliberately the only muted one and shares its paint with nothing: it is the
 * admin's own choice and not a failure, whereas `blocked` and `failed` are refusals. ADR 0018
 * was written about a preview that made a discarded file look like a handled one, so the two
 * never render alike.
 */
export const RESULT_TONE: Readonly<Record<TransferWriteOutcome, string>> = {
  created: LANDED,
  replaced: OVERWROTE,
  skipped: PASSED_OVER,
  blocked: REFUSED,
  failed: BROKEN,
}

/** What each confirm outcome is called in the table. */
export const RESULT_LABEL: Readonly<Record<TransferWriteOutcome, string>> = {
  created: 'Created',
  replaced: 'Replaced',
  skipped: 'Skipped',
  blocked: 'Blocked',
  failed: 'Failed',
}

/** What each conflict choice is called, both where it is offered and where it is reported. */
export const CHOICE_LABEL: Readonly<Record<ConflictChoice, string>> = {
  skip: 'Skip',
  new: 'Import as new',
  replace: 'Replace',
}

const KEEP_WORKING = "the existing project's links keep working."

const taskFiles = (count: number) => (count === 1 ? '1 task file' : `${String(count)} task files`)

/**
 * The sentence §7.4 and ADR 0019 both require before an admin confirms `import as new` on a
 * project the target store already holds.
 *
 * The second clause is the ADR's own wording and never varies. The first is written for the
 * count it is given rather than substituted into one template, because the template the ADR
 * quotes is the plural one and "1 share links will get new URLs" is not a sentence an admin
 * should be shown. Zero is stated rather than suppressed: a group with no links still remints
 * nothing, and saying so is what ADR 0018 asks of every row.
 *
 * @param shareLinks - How many links the dropped group asserts.
 * @returns The sentence, ready to render.
 */
export const remintNotice = (shareLinks: number): string => {
  if (shareLinks === 0) return `No share links will get new URLs; ${KEEP_WORKING}`
  if (shareLinks === 1) return `1 share link will get a new URL; ${KEEP_WORKING}`
  return `${String(shareLinks)} share links will get new URLs; ${KEEP_WORKING}`
}

/**
 * How one group's manifest/file cross-check reads (ADR 0018).
 *
 * A `manifestTaskCount` of null means no manifest was found at all, which is a different fact
 * from a manifest naming zero tasks, so the two never produce the same sentence.
 *
 * @param group - The preview row.
 * @returns The cell's text.
 */
export const taskCountLabel = (group: TransferGroup): string =>
  group.manifestTaskCount === null
    ? `No manifest · ${taskFiles(group.taskFilesFound)} found`
    : `${String(group.manifestTaskCount)} in manifest · ${String(group.taskFilesFound)} found`

/**
 * What a share link reaches, in words, naming the project in both cases.
 *
 * A task scope names its project as well as its task, because the project is the half that says
 * whether the link reaches outside the group it arrived with — which is the containment check
 * ADR 0019 makes blocking. A blocked group still lists every link it asserts, so this is the row
 * an admin reads when the reason says a scope escaped, and a bare task id is indistinguishable
 * from one of the group's own.
 *
 * @param scope - The link's scope.
 * @returns The cell's text.
 */
export const scopeLabel = (scope: TransferScope): string =>
  scope.kind === 'project'
    ? `project ${scope.projectId}`
    : `task ${scope.taskId} of project ${scope.projectId}`

/**
 * The projects a confirm has to be given a choice for.
 *
 * A project the target store does not hold needs no choice — it is simply created — which is why
 * the confirm request's list is sparse. A group carrying no project id is excluded too: it is one
 * the preview refused, and a choice is addressed by id, so there is nothing to address it by.
 *
 * One definition rather than one per caller, because the panel decides what to send and the
 * conflict list decides what to show, and the two disagreeing would offer a choice that is never
 * sent or send one that was never offered.
 *
 * @param groups - Every previewed group.
 * @returns Each colliding group beside the id a choice will name it by.
 */
export const collidingProjects = (
  groups: readonly TransferGroup[],
): readonly { readonly group: TransferGroup; readonly projectId: string }[] =>
  groups.flatMap((group) =>
    group.existsInTarget && group.projectId !== null
      ? [{ group, projectId: group.projectId }]
      : [],
  )
