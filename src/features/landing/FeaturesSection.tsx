import { motion } from 'framer-motion'

import { Section, SectionTitle, Eyebrow } from './Section'

const FEATURES = [
  {
    icon: '🏁',
    title: 'Seasonal Championships',
    desc: 'Reviews roll up into seasons with a clear start, finish, and champion.',
  },
  {
    icon: '📈',
    title: 'Live Team Standings',
    desc: 'Follow qualifying review contributions as your team moves around the circuit.',
  },
  {
    icon: '🎯',
    title: 'Review Health',
    desc: 'See participation, waiting PRs, and time to first review in one place.',
  },
  {
    icon: '🏆',
    title: 'Season Replay',
    desc: 'Look back through daily standings and see how the season unfolded.',
  },
  {
    icon: '⚡',
    title: 'Review Streaks',
    desc: 'Reward consistency — daily streaks that keep momentum going.',
  },
  {
    icon: '🎮',
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
            <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
              {f.icon}
            </span>
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
