import { privacyRoute, termsRoute, pilotRoute } from './legal'
import { createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'

import { installationCallbackRoute, teamSetupRoute, teamHistoryRoute } from './installation'
import { signInRoute, authCallbackRoute } from './sign-in'
import { demoRoute } from './demo'
import { indexRoute } from './index'
import { rootRoute } from './root'

// The comparison lab is local-only and omitted from production routing/bundles.
const developmentRoutes = import.meta.env.DEV ? [createRoute({
  getParentRoute: () => rootRoute,
  path: '/track-lab',
  component: lazyRouteComponent(() => import('../features/track/TrackLab'), 'TrackLab'),
}), createRoute({
  getParentRoute: () => rootRoute,
  path: '/track-lab/dashboard',
  component: lazyRouteComponent(() => import('../features/track/DashboardTrackLab'), 'DashboardTrackLab'),
})] : []
const routeTree = rootRoute.addChildren([...developmentRoutes, privacyRoute, termsRoute, pilotRoute, indexRoute, demoRoute, signInRoute, authCallbackRoute, installationCallbackRoute, teamSetupRoute, teamHistoryRoute])

export const router = createRouter({ routeTree })

// Register the router instance for full type-safety on Link/useNavigate/etc.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
