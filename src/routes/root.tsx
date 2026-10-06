import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

import { useSignedIn } from '../features/auth/use-signed-in'
import { ColorModeSelect } from '../features/appearance/ColorModeSelect'

import logoMark from '@/assets/logo.svg'

/**
 * Root route — minimal app shell. A slim, low-contrast top strip keeps the
 * focus on the HUD canvas below.
 */
export const rootRoute = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const signedIn = useSignedIn()
  return (
    <div className="min-h-svh bg-background text-foreground">
      <nav aria-label="Main navigation" className="flex min-h-16 items-center gap-2 border-b border-line px-4 sm:gap-3 sm:px-(--pp-gutter)">
        <Link
          to="/"
          className="transition-opacity hover:opacity-80"
          aria-label="Pull Prix — home"
        >
          <img src={logoMark} alt="Pull Prix" className="brand-logo h-6 w-auto" />
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <Link
            to="/demo"
            className="hud-label inline-flex min-h-11 items-center px-2 text-text-dim transition-colors hover:text-text sm:px-3"
            activeProps={{ className: 'hud-label text-accent' }}
          >
            Demo
          </Link>
          <ColorModeSelect />
          <a href={signedIn ? "/sign-in?account=1" : "/sign-in"} aria-label={signedIn ? 'Your account' : 'Sign in'} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-strong px-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent sm:px-5">
            {signedIn ? <><span className="sm:hidden">Account</span><span className="hidden sm:inline">Your account</span></> : 'Sign in'}
          </a>
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
