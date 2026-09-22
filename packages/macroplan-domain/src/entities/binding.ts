/**
 * What an epic is bound to in Microtask. Reserved by phase 1; written by phase 4.
 *
 * The field exists now, nullable on `PlanEpic`, so a phase-1 manifest and a phase-4 manifest are
 * the same shape: phase 4 adds a writer for this field, not a migration that adds it.
 * `sealedToken` is opaque here on purpose — verifying it is Microtask's job, at the moment a bound
 * epic is read, not a claim this entity can check. `role` is narrower than the kernel's three-way
 * `Role`: a binding never grants `write`, only enough to view or manage the linked project from
 * the timeline.
 */
export interface EpicBinding {
  readonly projectId: string
  readonly role: 'view' | 'manage'
  readonly sealedToken: string
}
