export function countdownLabel(endsAt: string, now: number) {
  const remaining = Math.max(0, Date.parse(endsAt) - now)
  if (!remaining) return 'Next season is ready'
  const minutes = Math.ceil(remaining / 60000)
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h ${minutes % 60}m remaining`
}
