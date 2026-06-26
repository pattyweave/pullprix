import { Section, SectionTitle } from './Section'

/**
 * Footer CTA — the waitlist. The email field is a placeholder (no backend, no
 * real submission) per scope; it just looks and feels right.
 */
export function WaitlistSection() {
  return (
    <Section id="waitlist" className="text-center">
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

        <form
          className="relative flex w-full max-w-md flex-col gap-3 sm:flex-row"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="email"
            required
            placeholder="you@yourteam.dev"
            aria-label="Work email"
            className="h-11 flex-1 rounded-full border border-line-strong bg-void/60 px-5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-full bg-accent px-6 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_28px_-4px_var(--pp-accent)]"
          >
            Join Waitlist
          </button>
        </form>

        <p className="relative hud-label text-text-faint">
          No spam · early access · launching this season
        </p>
      </div>
    </Section>
  )
}
