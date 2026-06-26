import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'

import { Chip } from '@/components/hud'

import { DashboardPreview } from './DashboardPreview'

/**
 * Hero — headline + CTAs on the left, the live dashboard preview on the right.
 * The preview is the hero of the page; copy is tight and gets out of its way.
 */
export function HeroSection() {
  return (
    <header className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-24 pt-20 lg:grid-cols-[1fr_1.15fr] lg:gap-10 lg:pt-28">
      {/* Copy */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-start gap-6"
      >
        <Chip>Season-based code review</Chip>

        <h1 className="font-heading text-5xl font-bold leading-[0.98] tracking-tight text-text sm:text-6xl">
          Turn PR Reviews
          <br />
          Into <span className="hud-glow-accent">Race Day.</span>
        </h1>

        <p className="max-w-md text-base leading-relaxed text-text-dim">
          Pull Prix transforms code reviews into seasonal competitions that
          reward participation, consistency, and quality — not just speed.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a
            href="#waitlist"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_28px_-4px_var(--pp-accent)]"
          >
            Join the Waitlist
          </a>
          <Link
            to="/demo"
            className="flex items-center gap-2 rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
          >
            <Play className="size-3.5 fill-current" />
            Watch Demo
          </Link>
        </div>
      </motion.div>

      {/* Live dashboard preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        className="relative"
      >
        {/* Ambient glow behind the frame */}
        <div
          aria-hidden
          className="absolute -inset-8 -z-10 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, var(--pp-accent), transparent 70%)',
          }}
        />
        <DashboardPreview />
      </motion.div>
    </header>
  )
}
