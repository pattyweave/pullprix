import { createContext, useContext } from 'react'

import type { ColorMode } from './appearance'

export const ColorModeContext = createContext<{
  mode: ColorMode
  setMode: (mode: ColorMode) => void
} | null>(null)

export function useColorMode() {
  const context = useContext(ColorModeContext)
  if (!context) throw new Error('useColorMode must be used within ColorModeProvider')
  return context
}
