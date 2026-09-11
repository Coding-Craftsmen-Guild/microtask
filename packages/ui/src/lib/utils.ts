/**
 * Merges conditional class names and resolves conflicting Tailwind utilities,
 * last one winning. Re-exported from `cn`, the package the 21 vendored
 * primitives import directly, so `packages/ui` has one implementation of this
 * and no regenerable import line needs patching. The equivalence measurement
 * behind that is in `packages/ui/VENDORED.md`.
 */
export { cn } from 'cn'
