// Calendar identity only. Theme/content deployment remains the season tickets.
export function seasonAt(value: string) {
  const at = new Date(value)
  if (!Number.isFinite(at.getTime())) throw new Error("Invalid season timestamp")
  function firstMonday(year: number, month: number) {
    const first = new Date(Date.UTC(year, month, 1, 12))
    first.setUTCDate(1 + (8 - first.getUTCDay()) % 7)
    return first
  }
  let month = at.getUTCMonth(), year = at.getUTCFullYear()
  if (at < firstMonday(year, month)) month--
  const start = firstMonday(year, month), end = firstMonday(year, month + 1)
  return { id: start.toISOString().slice(0, 7), startsAt: start.toISOString(), endsAt: end.toISOString() }
}

