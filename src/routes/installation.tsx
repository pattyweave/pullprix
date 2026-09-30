import { SeasonHistoryRoute } from '../features/connected/SeasonHistory'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './root'
import { TeamRoute } from '../features/connected/TeamDashboard'
import { InstallationPage } from '../features/setup/InstallationPage'
export const installationCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: '/installations/callback', component: InstallationPage })
export const teamSetupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/teams/$installationId', component: TeamRoute })

export const teamHistoryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/teams/$installationId/history', component: SeasonHistoryRoute })
