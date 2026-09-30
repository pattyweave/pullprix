import { motion } from 'framer-motion'
import { Activity, Flag, Flame, ListOrdered, Rewind, ShieldCheck } from 'lucide-react'

import { Section, SectionTitle, Eyebrow } from './Section'

const FEATURES = [
  {
    icon: Flag,
    title: 'Seasonal Championships',
    desc: 'Reviews roll up into seasons with a clear start, finish, and champion.',
  },
  {
    icon: ListOrdered,
    title: 'Live Team Standings',
    desc: 'Follow qualifying review contributions as your team moves around the circuit.',
  },
  {
    icon: Activity,
    title: 'Review Health',
    desc: 'See participation, waiting PRs, and time to first review in one place.',
  },
  {
    icon: Rewind,
    title: 'Season Replay',
    desc: 'Look back through daily standings and see how the season unfolded.',
  },
  {
    icon: Flame,
    title: 'Review Streaks',
    desc: 'Reward consistency — daily streaks that keep momentum going.',
  },
  {
    icon: ShieldCheck,
    title: 'Private Team Access',
    desc: 'GitHub sign-in and verified team access keep your dashboard private.',
  },
]

/** Features — six cards, each with a subtle hover lift + glow. */
export function FeaturesSection() {
  return (
    <Section>
      <div className="flex flex-col gap-3">
        <Eyebrow>Features</Eyebrow>
        <SectionTitle className="max-w-2xl">
          Everything a season needs.
        </SectionTitle>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <motion.div
            key={f.title}
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="group flex flex-col gap-3 rounded-xl bg-surface p-6 ring-1 ring-inset ring-line transition-colors duration-200 hover:ring-accent/40"
          >
            <f.icon
              aria-hidden="true"
              size={24}
              strokeWidth={1.75}
              className="shrink-0 text-accent transition-[filter] duration-200 group-hover:drop-shadow-[0_0_8px_var(--pp-accent)]"
            />
            <h3 className="font-heading text-base font-semibold text-text">
              {f.title}
            </h3>
            <p className="text-sm leading-relaxed text-text-dim">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  )
}
