# Regenerating the vendored primitives

`src/components/**` is `shadcn@4.21.0` output, written by `shadcn add` against `components.json`.
Running `shadcn add <name> --overwrite` reverts anything hand-edited in those files. Two lines are
hand-edited. Re-apply them, or `pnpm --filter @repo/ui typecheck` fails.

## The two patches

Both are `TS2375` under `exactOptionalPropertyTypes` (ADR 0023), and they are the entire typecheck
cost of the 22 vendored files. No build step and no relaxed compiler flag — see ADR 0031.

**`src/components/dropdown-menu.tsx`** — `DropdownMenuCheckboxItem` destructured `checked` out of
its props (typed `CheckedState | undefined`) and passed it straight back to a target requiring
`CheckedState`. The fix is to stop destructuring it and let the existing `{...props}` spread carry
it, which is behaviourally identical because the spread already sat after the explicit attribute:

```diff
   className,
   children,
-  checked,
   inset,
   ...props
 }: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
@@
         className
       )}
-      checked={checked}
       {...props}
```

**`src/components/sonner.tsx`** — the `theme` assertion targeted an indexed access that includes
`undefined`. Assert `NonNullable` of it:

```diff
-      theme={theme as ToasterProps["theme"]}
+      theme={theme as NonNullable<ToasterProps["theme"]>}
```

## What else is deliberately not touched

- **The `cn` import in 21 files.** Generated components import `cn` from the published `cn` package,
  not from `@repo/ui/lib/utils`, and setting `aliases.utils` does not change that. `src/lib/utils.ts`
  re-exports the same package, so there is one implementation and no import line needs patching.
  `cn@0.2.6` was measured equivalent to `twMerge(clsx(...))` — see ADR 0025.
- **`jsdoc/require-jsdoc` and `max-lines`.** Vendored output violates exactly those two rules, 103
  and 9 times. They are turned off for `src/components/**/*.tsx` only, by spreading
  `vendoredComponents()` from `@repo/eslint-config` into `eslint.config.js` — the glob has to be
  applied in this package to resolve at all. Every other ADR 0027 rule stays on, including
  `local/tsdoc-comments-only`, which costs zero because shadcn 4.21.0 emits no comments. If that
  count moves, the generator changed; do not widen the override to absorb it.
