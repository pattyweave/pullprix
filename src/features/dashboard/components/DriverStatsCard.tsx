import { DriverProfile } from '@/components/hud'
import type { DriverProfileData, ProfileBadge } from '@/components/hud'
import { useDriverIdentity } from '@/features/season'
import type { Driver, DriverStanding } from '@/features/season'

interface DriverStatsCardProps {
  driver: Driver
  standing?: DriverStanding
}

/**
 * Season adapter for the reusable {@link DriverProfile}. Maps the focused
 * driver, their standing, and their (mocked) racing identity into the profile
 * card's data shape. All cosmetic/mocked — no persistence, no GitHub.
 */
export function DriverStatsCard({ driver, standing }: DriverStatsCardProps) {
  const { data: identity } = useDriverIdentity(driver.id)

  const badges: ProfileBadge[] =
    identity?.badges.map((b) => ({
      id: b.id,
      icon: b.icon,
      name: b.name,
      rarity: b.rarity,
      description: b.description,
      unlockedDate: b.unlockedDate,
      tooltip: b.tooltip,
    })) ?? []

  const data: DriverProfileData = {
    name: driver.name,
    code: driver.code,
    number: driver.number,
    team: driver.team,
    teamColor: driver.color,
    flag: driver.flag,
    title: identity?.title ?? 'Privateer',
    topSpeed: identity?.topSpeed ?? 0,
    currentStreak: identity?.currentStreak ?? 0,
    bestStreak: identity?.bestStreak ?? 0,
    favoriteRepo: identity?.favoriteRepo ?? '—',
    reviewsThisSeason: identity?.reviewsThisSeason ?? standing?.reviews ?? 0,
    avgReviewDepth: identity?.avgReviewDepth ?? 0,
    avgResponseTime: identity?.avgResponseTime ?? '—',
    badges,
  }

  return <DriverProfile data={data} />
}
