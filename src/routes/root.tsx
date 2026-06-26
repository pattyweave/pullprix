import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

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
          className="hud-label text-text transition-colors hover:text-accent"
        >
          ◢ Pull Prix
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
