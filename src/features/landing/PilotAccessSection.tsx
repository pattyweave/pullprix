import { Section, SectionTitle } from './Section'
import { Link } from '@tanstack/react-router'

/**
 * Real entry points for invited teams and prospective pilot participants.
 */
export function PilotAccessSection() {
  return (
    <Section id="pilot-access" className="text-center">
      <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 overflow-hidden rounded-2xl bg-surface px-6 py-16 ring-1 ring-inset ring-line">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 -z-0 size-64 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, var(--pp-accent), transparent 70%)',
          }}
        />

        <SectionTitle className="relative max-w-xl">
          Ready to make code reviews{' '}
          <span className="hud-glow-accent">fun again?</span>
        </SectionTitle>

        <p className="relative max-w-lg text-text-dim">Already part of a pilot team? Sign in with your GitHub account or open the team link from your organization owner.</p>
        <div
          className="relative flex w-full max-w-md flex-col gap-3 sm:flex-row"
        >
          <Link to="/sign-in" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Sign in with GitHub</Link>
          <Link to="/pilot" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-line-strong px-6 py-3 text-sm font-semibold hover:border-accent hover:text-accent">Explore the pilot</Link>
        </div>

        <p className="relative hud-label text-text-faint">
          Private pilot · GitHub sign-in · Guided setup
        </p>
        <div className="relative flex flex-wrap justify-center gap-5 text-sm text-text-dim"><Link to="/privacy" className="underline underline-offset-4">Privacy</Link><Link to="/terms" className="underline underline-offset-4">Terms</Link></div>
      </div>
    </Section>
  )
}
