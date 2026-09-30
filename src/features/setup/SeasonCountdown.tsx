import { useEffect, useRef, useState } from 'react'
import { countdownLabel } from './countdown'
export function SeasonCountdown({ endsAt, onRollover }: { endsAt: string; onRollover: () => void }) {
  const notified = useRef<string | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    if (now >= Date.parse(endsAt) && notified.current !== endsAt) {
      notified.current = endsAt
      onRollover()
    }
  }, [endsAt, now, onRollover])
  return <p className="font-mono text-lg text-accent" aria-label="Season countdown">{countdownLabel(endsAt, now)}</p>
}
