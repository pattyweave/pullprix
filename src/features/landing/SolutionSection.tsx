import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  Award,
  Flag,
  GitPullRequest,
  MapPin,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Section, SectionTitle, Eyebrow } from './Section'

const LOOP: { icon: LucideIcon; label: string }[] = [
  { icon: GitPullRequest, label: 'Review PRs' },
  { icon: Flag, label: 'Earn points' },
  { icon: MapPin, label: 'Move around the circuit' },
  { icon: Award, label: 'Unlock badges' },
  { icon: Trophy, label: 'Win the season' },
]

/** Solution — the gameplay loop, told with icons instead of prose. */
export function SolutionSection() {
  return (
    <Section className="text-center">
      <div className="flex flex-col items-center gap-3">
        <Eyebrow>The Loop</Eyebrow>
        <SectionTitle className="max-w-2xl">
          A season-long loop that rewards showing up.
        </SectionTitle>
      </div>

      {/* Horizontal on desktop, vertical on mobile */}
      <div className="mt-16 flex flex-col items-center justify-center gap-4 lg:flex-row lg:gap-2">
        {LOOP.map((step, i) => (
          <Fragment key={step.label}>
            <div className="group flex w-40 flex-col items-center gap-3">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-surface ring-1 ring-inset ring-line transition-all duration-200 group-hover:ring-accent/50 group-hover:shadow-[0_0_24px_-6px_var(--pp-accent)]">
                <step.icon className="size-6 text-accent" />
              </div>
              <span className="hud-label text-text">{step.label}</span>
            </div>
            {i < LOOP.length - 1 && (
              <ArrowRight className="size-4 shrink-0 rotate-90 text-text-faint lg:rotate-0" />
            )}
          </Fragment>
        ))}
      </div>
    </Section>
  )
}
