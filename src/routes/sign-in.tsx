import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './root'
import { AuthPage } from '../features/auth/AuthPage'
export const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: AuthPage })
export const authCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/callback', component: AuthPage })
