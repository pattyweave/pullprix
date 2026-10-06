import { useLayoutEffect, useState, type ReactNode } from 'react'

import { applyColorMode, COLOR_MODE_KEY, parseColorMode, readColorMode, type ColorMode } from './appearance'
import { ColorModeContext } from './context'

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(readColorMode)

  useLayoutEffect(() => {
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
    setMode(next)
    try {
      window.localStorage.setItem(COLOR_MODE_KEY, next)
    } catch {
      // Restricted storage still allows switching for the current page.
    }
  }

  return <ColorModeContext.Provider value={{ mode, setMode: chooseMode }}>{children}</ColorModeContext.Provider>
}
