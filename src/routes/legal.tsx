import { PilotGuide } from '../features/pilot/PilotGuide'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './root'
import { PrivacyPage, TermsPage } from '../features/legal/LegalPages'
export const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacy', component: PrivacyPage })
export const termsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terms', component: TermsPage })

export const pilotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pilot', component: PilotGuide })
