import { useQuery } from '@tanstack/react-query'

import {
  driverIdentities,
  drivers,
  reviewEvents,
  reviewHealth,
  season,
  standings,
} from './mock-data'
import type {
  Driver,
  DriverIdentity,
  DriverStanding,
  ReviewEvent,
  ReviewHealth,
  Season,
} from './types'

/**
 * Data-access hooks for the season feature.
 *
 * For the MVP these resolve static mock data through TanStack Query so the
 * component layer already talks to the same `useQuery` surface it will use once
 * a real API exists. Swapping the `queryFn` bodies for fetches is then the only
 * change required — call sites stay identical.
 */

const STALE_TIME = Infinity

export function useSeason() {
  return useQuery<Season>({
    queryKey: ['season'],
    queryFn: () => season,
    staleTime: STALE_TIME,
  })
}

export function useDrivers() {
  return useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => drivers,
    staleTime: STALE_TIME,
  })
}

export function useStandings() {
  return useQuery<DriverStanding[]>({
    queryKey: ['standings'],
    queryFn: () => standings,
    staleTime: STALE_TIME,
  })
}

export function useReviewEvents() {
  return useQuery<ReviewEvent[]>({
    queryKey: ['review-events'],
    queryFn: () => reviewEvents,
    staleTime: STALE_TIME,
  })
}

export function useReviewHealth() {
  return useQuery<ReviewHealth>({
    queryKey: ['review-health'],
    queryFn: () => reviewHealth,
    staleTime: STALE_TIME,
  })
}

export function useDriverIdentity(id: string | null | undefined) {
  return useQuery<DriverIdentity | null>({
    queryKey: ['driver-identity', id],
    queryFn: () => (id ? (driverIdentities[id] ?? null) : null),
    staleTime: STALE_TIME,
  })
}

/** Convenience lookup by id against the static driver list. */
export function getDriver(id: string): Driver | undefined {
  return drivers.find((d) => d.id === id)
}

/** Convenience lookup of a driver's racing profile. */
export function getDriverIdentity(id: string): DriverIdentity | undefined {
  return driverIdentities[id]
}
