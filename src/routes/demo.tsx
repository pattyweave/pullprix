import { createRoute } from '@tanstack/react-router'

import { DashboardView } from '@/features/dashboard/DashboardView'
import { ReplayProvider } from '@/features/replay'

import { rootRoute } from './root'

/** /demo — the season-replay dashboard, driven by mocked timeline data. */
export const demoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/demo',
  component: DemoPage,
})

function DemoPage() {
  return (
    <ReplayProvider>
      <DashboardView />
    </ReplayProvider>
  )
}
