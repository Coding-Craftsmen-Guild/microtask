import '@repo/ui/globals.css'
import { LOGO_PATH } from '@repo/ui/shell/logo'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/** Every page's icon: the CC Guild mark, the same one Microtask carries. */
export const metadata = { icons: { icon: LOGO_PATH } } satisfies Metadata

/** Props for {@link RootLayout}. */
export interface RootLayoutProps {
  /** The page. */
  readonly children: ReactNode
}

/** The document shell. Each page names its own title. */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
