import { ReplayBar } from '@/components/hud'
import { getDriver } from '@/features/season'
import { useReplay } from '@/features/replay'

/**
 * Season adapter for the reusable {@link ReplayBar}. Wires the replay clock to
 * the transport and surfaces the current leader's code at the cursor.
 */
export function ReplayControls() {
  const { day, totalDays, playing, toggle, setDay, snapshot } = useReplay()
  const leader = snapshot.standings[0]
  const caption = leader ? getDriver(leader.driverId)?.code : undefined

  return (
    <ReplayBar
      day={day}
      totalDays={totalDays}
      playing={playing}
      onTogglePlay={toggle}
      onScrub={setDay}
      caption={caption}
    />
  )
}
