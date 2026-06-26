import { createRouter } from '@tanstack/react-router'

import { demoRoute } from './demo'
import { indexRoute } from './index'
import { rootRoute } from './root'

const routeTree = rootRoute.addChildren([indexRoute, demoRoute])

export const router = createRouter({ routeTree })

// Register the router instance for full type-safety on Link/useNavigate/etc.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
