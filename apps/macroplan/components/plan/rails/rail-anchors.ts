/**
 * The `id` of the field that adds a feature to one rail, which is also the fragment that reaches it.
 *
 * ### Why it is a module of its own
 *
 * Two things need it and they are on opposite sides of the client boundary. `./rail-feature.tsx` gives
 * the field this id and carries `'use client'`; `../sidebar/tree-row.tsx` builds a link ending in it and
 * is server-rendered. A server component importing from a `'use client'` module gets client *references*
 * rather than the functions themselves, so calling this on the server would not work at all — which is
 * why the one line lives here, in a module neither side has to be.
 *
 * ### Why a link to a field rather than a route of its own
 *
 * There is no `new/feature` route and this does not add one. The control that creates a feature on a
 * named rail already exists and is mounted on that rail's drawer; what was missing was a way to reach it
 * that did not start by opening something else. So the sidebar links to the field that does the thing —
 * `table/row-actions.tsx`'s pattern exactly, and for its reasons: a button per rail is an island per
 * rail, and the drawer already holds the validation and the refusal wording.
 *
 * @param epicId - The rail a new feature would go on.
 * @returns The field's `id`, which `FieldShell` puts on the input itself.
 */
export const railFeatureFieldId = (epicId: string): string => `new-feature-${epicId}`
