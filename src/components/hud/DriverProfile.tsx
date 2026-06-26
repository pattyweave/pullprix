import { Flame } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from './Badge'
import type { BadgeProps } from './Badge'
import { Stat } from './Stat'

/**
 * A driver's racing profile — the stats-into-identity card. Presentation-only
 * and domain-agnostic: the parent maps its data into this shape, so it can be
 * reused for any driver, in any layout, with no store coupling.
 *
 * It is built to feel like opening your profile in a racing game: a numbered
 * identity block, an earned title, a glowing streak hero, a collectible badge
 * case, and a telemetry stat grid.
 */

export interface ProfileBadge extends Omit<BadgeProps, 'compact' | 'className'> {
  id: string
}

export interface DriverProfileData {
  name: string
  code: string
  number: number
  team: string
  teamColor: string
  flag?: string
  /** Optional avatar image URL; falls back to a numbered placeholder. */
  avatarUrl?: string
  title: string
  topSpeed: number
  currentStreak: number
  bestStreak: number
  favoriteRepo: string
  reviewsThisSeason: number
  avgReviewDepth: number
  avgResponseTime: string
  badges: ProfileBadge[]
}

export interface DriverProfileProps {
  data: DriverProfileData
  className?: string
}

export function DriverProfile({ data, className }: DriverProfileProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ── Identity block ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Avatar
          number={data.number}
          teamColor={data.teamColor}
          avatarUrl={data.avatarUrl}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-heading text-4xl font-bold uppercase leading-none tracking-tight text-text">
              {data.code}
            </h2>
            {data.flag && <span className="text-lg leading-none">{data.flag}</span>}
          </div>
          {/* Earned title — the emotional hook. */}
          <span
            className="hud-label"
            style={{ color: data.teamColor }}
          >
            {data.title}
          </span>
        </div>
      </div>

      {/* Team line with colour stripe */}
      <div className="flex items-center gap-2">
        <span
          className="hud-accent-bar h-3.5"
          style={{ backgroundColor: data.teamColor }}
          aria-hidden
        />
        <span className="hud-label text-text-dim">
          {data.team} · Driver {String(data.number).padStart(2, '0')}
        </span>
      </div>

      {/* ── Streak hero ────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-2">
          <span className="hud-display hud-glow-accent flex items-center gap-2">
            <Flame className="size-9 text-accent" />
            {data.currentStreak}
          </span>
          <span className="hud-label mb-2 text-text-dim">Day streak</span>
        </div>
        <div className="flex flex-col items-end gap-1 pb-1">
          <span className="hud-label">Top Speed</span>
          <span className="hud-value tabular text-text-dim">
            {data.topSpeed}
            <span className="ml-1 text-[0.7em] text-text-faint">mph</span>
          </span>
        </div>
      </div>

      {/* ── Badge case ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="hud-label text-text-dim">Season Badges</span>
          <span className="hud-label text-text-faint">{data.badges.length}</span>
        </div>
        {/* Icon-only collectibles — dense; hover any for the full story. */}
        <div className="flex flex-wrap gap-1.5">
          {data.badges.map((b) => (
            <Badge
              key={b.id}
              icon={b.icon}
              name={b.name}
              rarity={b.rarity}
              description={b.description}
              unlockedDate={b.unlockedDate}
              tooltip={b.tooltip}
              compact
            />
          ))}
        </div>
      </div>

      {/* ── Telemetry grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <Stat label="Reviews / Season" value={data.reviewsThisSeason} />
        <Stat label="Best Streak" value={`${data.bestStreak}d`} />
        <Stat label="Avg Depth" value={data.avgReviewDepth.toFixed(1)} />
        <Stat label="Avg Response" value={data.avgResponseTime} />
        <Stat
          label="Favorite Repo"
          value={data.favoriteRepo}
          tone="info"
          className="col-span-2"
        />
      </div>
    </div>
  )
}

/** Numbered, team-coloured avatar block; uses an image when supplied. */
function Avatar({
  number,
  teamColor,
  avatarUrl,
}: {
  number: number
  teamColor: string
  avatarUrl?: string
}) {
  return (
    <div
      className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{
        backgroundColor: `color-mix(in oklch, ${teamColor} 22%, var(--pp-surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${teamColor} 50%, transparent)`,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        <span
          className="font-heading text-2xl font-bold tabular leading-none"
          style={{ color: teamColor }}
        >
          {number}
        </span>
      )}
    </div>
  )
}
