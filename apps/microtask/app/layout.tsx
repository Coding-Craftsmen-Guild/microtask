import '@repo/ui/globals.css'
import type { ReactNode } from 'react'

/** The document shell. Nothing product-specific lives here yet. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
