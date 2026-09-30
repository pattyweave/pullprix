import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

import logoMark from '@/assets/logo.svg'

/**
 * Root route — minimal app shell. A slim, low-contrast top strip keeps the
 * focus on the HUD canvas below.
 */
export const rootRoute = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <nav aria-label="Main navigation" className="flex min-h-16 items-center gap-3 border-b border-line px-(--pp-gutter)">
        <Link
          to="/"
          className="transition-opacity hover:opacity-80"
          aria-label="Pull Prix — home"
        >
          <img src={logoMark} alt="Pull Prix" className="h-6 w-auto" />
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <Link
            to="/demo"
            className="hud-label inline-flex min-h-11 items-center px-3 text-text-dim transition-colors hover:text-text"
            activeProps={{ className: 'hud-label text-accent' }}
          >
            Demo
          </Link>
          <Link to="/sign-in" className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">
            Sign in
          </Link>
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
