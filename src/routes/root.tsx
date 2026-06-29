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
      <nav className="flex h-13 items-center gap-3 border-b border-line px-(--pp-gutter)">
        <Link
          to="/"
          className="transition-opacity hover:opacity-80"
          aria-label="Pull Prix — home"
        >
          <img src={logoMark} alt="Pull Prix" className="h-6 w-auto" />
        </Link>
        <span className="ml-auto">
          <Link
            to="/demo"
            className="hud-label text-text-faint transition-colors hover:text-text"
            activeProps={{ className: 'hud-label text-accent' }}
          >
            Demo
          </Link>
        </span>
      </nav>
      <Outlet />
    </div>
  )
}
