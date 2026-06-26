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
    desc: 'A real-time timing tower for who’s carrying review load.',
  },
  {
    icon: '🎯',
    title: 'Smart Review Suggestions',
    desc: 'Nudges the right reviewer toward the right PR before it ages out.',
  },
  {
    icon: '🏆',
    title: 'Achievements',
    desc: 'Collectible badges for the reviews that actually move the needle.',
  },
  {
    icon: '⚡',
    title: 'Review Streaks',
    desc: 'Reward consistency — daily streaks that keep momentum going.',
  },
  {
    icon: '🎮',
    title: 'Team Themes',
    desc: 'Constructors, colors, and identities your team makes their own.',
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
