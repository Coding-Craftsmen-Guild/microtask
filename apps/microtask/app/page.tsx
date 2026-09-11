import { Button } from '@repo/ui/components/button'

/** Renders one vendored primitive so the Tailwind pipeline is exercised end to end. */
export default function Home() {
  return (
    <main className="grid min-h-dvh max-w-prose p-8">
      <Button>Microtask</Button>
    </main>
  )
}
