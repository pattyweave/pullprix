import { createRoute } from '@tanstack/react-router'

import { LandingPage } from '@/features/landing'

import { rootRoute } from './root'

/** Landing route — the marketing page. */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})
