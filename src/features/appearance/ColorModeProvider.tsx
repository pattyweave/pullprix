import { useLayoutEffect, useState, type ReactNode } from 'react'

import { applyColorMode, COLOR_MODE_KEY, parseColorMode, readColorMode, type ColorMode } from './appearance'
import { ColorModeContext } from './context'
import { featureFlags } from '../../config/feature-flags'

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setMode] = useState(readColorMode)
  const mode = featureFlags.colorMode ? preference : 'dark'

  useLayoutEffect(() => {
    if (!featureFlags.colorMode) {
      applyColorMode('dark', false)
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { applyColorMode(mode, media.matches) }
    apply()
    media.addEventListener('change', apply)

    const sync = (event: StorageEvent) => {
      if (event.key !== COLOR_MODE_KEY && event.key !== null) return
      // Accessing localStorage itself can throw when the browser blocks it.
      try {
        if (event.storageArea !== window.localStorage) return
        setMode(parseColorMode(event.newValue))
      } catch { /* Keep the current page's preference when storage is blocked. */ }
    }
    window.addEventListener('storage', sync)
    return () => {
      media.removeEventListener('change', apply)
      window.removeEventListener('storage', sync)
    }
  }, [mode])

  function chooseMode(next: ColorMode) {
    if (!featureFlags.colorMode) return
    setMode(next)
    try {
      window.localStorage.setItem(COLOR_MODE_KEY, next)
    } catch {
      // Restricted storage still allows switching for the current page.
    }
  }

  return <ColorModeContext.Provider value={{ mode, setMode: chooseMode }}>{children}</ColorModeContext.Provider>
}
