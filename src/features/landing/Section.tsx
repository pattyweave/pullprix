import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Reusable landing-page scaffolding. These keep rhythm and typography
 * consistent across every section and compose from the HUD design tokens.
 */

/** A full-width section with generous vertical breathing room. */
export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'mx-auto w-full max-w-6xl px-6 py-24 sm:py-32',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** Tiny wide-tracked eyebrow above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="hud-label text-accent">{children}</span>
}

/** Standard section heading — large, condensed, consistent with the HUD. */
export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'font-heading text-3xl font-bold leading-[1.05] tracking-tight text-text sm:text-4xl',
        className,
      )}
    >
      {children}
    </h2>
  )
}
