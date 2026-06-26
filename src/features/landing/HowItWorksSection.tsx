import { Section, SectionTitle, Eyebrow } from './Section'

const STEPS = [
  {
    n: '01',
    title: 'Connect GitHub',
    desc: 'One install. No workflow changes for your team.',
  },
  {
    n: '02',
    title: 'Pull Prix tracks review activity',
    desc: 'Every review, comment, and approval becomes a scored event.',
  },
  {
    n: '03',
    title: 'Developers compete throughout the season',
    desc: 'Points, streaks, and standings turn reviewing into a game.',
  },
  {
    n: '04',
    title: 'Managers see healthier review participation',
    desc: 'Load spreads out. Queues shrink. The whole team shows up.',
  },
]

/** How It Works — a clean vertical 4-step timeline. */
export function HowItWorksSection() {
  return (
    <Section>
      <div className="flex flex-col gap-3">
        <Eyebrow>How It Works</Eyebrow>
        <SectionTitle className="max-w-2xl">
          Live in minutes. Healthier in a season.
        </SectionTitle>
      </div>

      <ol className="mt-12 flex flex-col">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex gap-5">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-xs font-semibold text-accent ring-1 ring-inset ring-line">
                {s.n}
              </span>
              {i < STEPS.length - 1 && (
                <span className="w-px flex-1 bg-line" />
              )}
            </div>
            {/* Copy */}
            <div className="flex flex-col gap-1 pb-10">
              <h3 className="font-heading text-lg font-semibold text-text">
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-dim">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
