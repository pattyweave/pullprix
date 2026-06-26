import { Section, SectionTitle, Eyebrow } from './Section'

const PAINS = [
  {
    n: '01',
    text: 'Two engineers review every PR.',
    sub: 'The same names, every time.',
  },
  {
    n: '02',
    text: 'Everyone else disengages.',
    sub: 'Reviewing feels like a chore, not a contribution.',
  },
  {
    n: '03',
    text: 'Review queues silently grow.',
    sub: 'Until they become someone’s Monday-morning problem.',
  },
]

/** Problem — three tight pain points, no walls of text. */
export function ProblemSection() {
  return (
    <Section>
      <div className="flex flex-col gap-3">
        <Eyebrow>The Problem</Eyebrow>
        <SectionTitle className="max-w-2xl">
          The same people review everything.
        </SectionTitle>
      </div>

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-3">
        {PAINS.map((p) => (
          <div
            key={p.n}
            className="flex flex-col gap-3 bg-surface p-6"
          >
            <span className="hud-label text-text-faint">{p.n}</span>
            <p className="font-heading text-lg font-semibold leading-snug text-text">
              {p.text}
            </p>
            <p className="text-sm leading-relaxed text-text-dim">{p.sub}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
