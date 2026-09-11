import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities,
 * last one winning. This is the helper every vendored shadcn primitive imports.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
