import { ChevronDown, Monitor, Moon, Sun } from 'lucide-react'

import { useColorMode } from './context'
import { parseColorMode } from './appearance'

export function ColorModeSelect() {
  const { mode, setMode } = useColorMode()
  const Icon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon

  return (
    <div className="relative shrink-0">
      <Icon size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
      <select
        aria-label="Color mode"
        value={mode}
        onChange={event => setMode(parseColorMode(event.target.value))}
        className="min-h-11 w-27 appearance-none rounded-full border border-line-strong bg-surface pl-9 pr-6 text-xs text-text transition-colors hover:border-accent"
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
    </div>
  )
}
