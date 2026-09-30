import { privacyRoute, termsRoute, pilotRoute } from './legal'
import { createRouter } from '@tanstack/react-router'

import { installationCallbackRoute, teamSetupRoute, teamHistoryRoute } from './installation'
import { signInRoute, authCallbackRoute } from './sign-in'
import { demoRoute } from './demo'
import { indexRoute } from './index'
import { rootRoute } from './root'

const routeTree = rootRoute.addChildren([privacyRoute, termsRoute, pilotRoute, indexRoute, demoRoute, signInRoute, authCallbackRoute, installationCallbackRoute, teamSetupRoute, teamHistoryRoute])

export const router = createRouter({ routeTree })

// Register the router instance for full type-safety on Link/useNavigate/etc.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
