import '@repo/ui/globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { LOGO_PATH } from '../components/shared/logo'

/** Every page's icon: the CC Guild logo, as on all four pages of the app being replaced. */
export const metadata = { icons: { icon: LOGO_PATH } } satisfies Metadata

/** The document shell. Each page names its own title. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
