/**
 * Core domain types for Pull Prix — the F1-inspired PR review game.
 *
 * A "race" is a sprint/period of PR-review activity. Developers are "drivers",
 * individual review actions are "review events", and the leaderboard derived
 * from them is the set of "driver standings" for a "season".
 */

/** A single team/constructor a driver belongs to. */
export type Team =
  | 'Velocity Works'
  | 'Apex Systems'
  | 'Redline Labs'
  | 'Monsoon Tech'

/** A fictional developer competing in the championship. */
export interface Driver {
  /** Stable unique id, e.g. "drv-ada". */
  id: string
  /** Full display name. */
  name: string
  /** Three-letter abbreviation shown on the timing tower, e.g. "ADA". */
  code: string
  /** Permanent racing number. */
  number: number
  /** GitHub-style handle (mocked for now). */
  handle: string
  /** Constructor / squad the driver races for. */
  team: Team
  /** Hex accent color used across cards and the timing tower. */
  color: string
  /** Country flag emoji, purely cosmetic. */
  flag: string
}

/** The type of action a driver took during review. */
export type ReviewEventType =
  | 'approve'
  | 'request-changes'
  | 'comment'
  | 'merge'
  | 'fastest-lap' // exceptionally fast, high-quality review

/** A single scored action performed by a driver against a pull request. */
export interface ReviewEvent {
  id: string
  driverId: Driver['id']
  type: ReviewEventType
  /** PR number this event relates to. */
  pullNumber: number
  /** Short human-readable title of the PR. */
  pullTitle: string
  /** Points awarded for this event. */
  points: number
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string
  /** Optional review turnaround in minutes — fuels the "fastest lap" award. */
  turnaroundMinutes?: number
}

/** A driver's aggregated position on the leaderboard for a season. */
export interface DriverStanding {
  driverId: Driver['id']
  /** 1-based finishing position. */
  position: number
  /** Total championship points accumulated. */
  points: number
  /** Number of PRs reviewed this season. */
  reviews: number
  /** Number of approvals given. */
  approvals: number
  /** Position change since the previous race (+ gained, - lost, 0 held). */
  delta: number
  /** Gap in points behind the leader (0 for P1). */
  gapToLeader: number
  /** Whether this driver currently holds the fastest-lap award. */
  fastestLap: boolean
}

/** Lifecycle status of a season. */
export type SeasonStatus = 'upcoming' | 'live' | 'completed'

/** A full championship season with its participants and current state. */
export interface Season {
  id: string
  /** Display name, e.g. "2026 Spring Championship". */
  name: string
  /** Calendar year. */
  year: number
  status: SeasonStatus
  /** Current round (race) number within the season. */
  round: number
  /** Total number of rounds planned. */
  totalRounds: number
  /** ISO date the active round started. */
  roundStartedAt: string
  driverIds: Driver['id'][]
}

/** Overall signal/health status, mapped to the HUD's status colours. */
export type SignalStatus = 'green' | 'yellow' | 'red'

/**
 * "Race Control" view of the team's PR-review health. This is the data that
 * nudges reviewers — not a leaderboard, but the state of the review pit lane.
 */
export interface ReviewHealth {
  /** Flavor "track conditions" — atmospheric, motorsport-styled vitals. */
  conditions: {
    /** Reviews merged per day, recent trend. */
    reviewVelocity: number
    /** How the trend is moving. */
    velocityTrend: 'rising' | 'steady' | 'cooling'
    /** Qualitative team mood from review activity. */
    teamTemperature: string
    /** Overall signal/flag for the review session. */
    signal: SignalStatus
  }
  /** The useful, actionable metrics. */
  control: {
    /** Distinct people who reviewed at least one PR this week. */
    uniqueReviewers: number
    /** Open PRs with no approving review yet. */
    prsNeedingReview: number
    /** PRs that have been waiting longer than 24h. */
    prsWaitingOver24h: number
    /** Repo currently receiving the least review attention. */
    mostUnderReviewedRepo: string
  }
  /** A single recommended PR to pick up next. */
  nextReview: NextReview
}

/** Why a PR is being surfaced as the next recommended review. */
export type NextReviewReason =
  | 'unclaimed review'
  | 'low coverage repo'
  | 'aging PR'

/** A recommended PR for the viewer to pick up. */
export interface NextReview {
  repo: string
  pullNumber: number
  title: string
  /** Human-readable wait time, e.g. "31h". */
  waiting: string
  reason: NextReviewReason
}

/* ── Driver identity ──────────────────────────────────────────────────────
 * The collectible, emotionally-invested racing profile for a driver. All of
 * this is cosmetic/mocked — it makes a developer feel like *their* driver.
 */

/** Collectible rarity tiers, ascending. Drives a badge's glow + framing. */
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

/** A collectible achievement earned through review behaviour. */
export interface Badge {
  id: string
  /** Emoji icon, e.g. "🏁". */
  icon: string
  /** Display name, e.g. "Pole Position". */
  name: string
  rarity: BadgeRarity
  /** ISO date the badge was unlocked. */
  unlockedDate: string
  /** One-line description of how it was earned. */
  description: string
  /** Optional short tooltip override (defaults to the description). */
  tooltip?: string
}

/** A driver's full racing profile — stats elevated into an identity. */
export interface DriverIdentity {
  driverId: Driver['id']
  /** Earned title shown under the name, e.g. "Apex Predator". */
  title: string
  /** Top-speed flavour readout (cosmetic), in mph. */
  topSpeed: number
  /** Current consecutive-day review streak. */
  currentStreak: number
  /** Best streak ever achieved. */
  bestStreak: number
  /** Repo the driver reviews most. */
  favoriteRepo: string
  /** Reviews completed this season. */
  reviewsThisSeason: number
  /** Avg review depth — mock metric, comments + suggestions per review. */
  avgReviewDepth: number
  /** Avg first-response time, human-readable, e.g. "1h 12m". */
  avgResponseTime: string
  /** Earned badges, most prestigious first. */
  badges: Badge[]
}
