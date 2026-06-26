import { useState } from 'react'
import { motion, useMotionValue } from 'framer-motion'

import type { Circuit } from '@/features/track/circuits'
import { usePathSampler } from '@/features/track/usePathSampler'
import type { PathSampler } from '@/features/track/usePathSampler'
import { cn } from '@/lib/utils'

/** Spring used for the selection emphasis (scale + glow), restrained. */
const EMPHASIS = { type: 'spring', stiffness: 320, damping: 30 } as const

/**
 * A driver placed on the circuit. Presentation-only and domain-agnostic: the
 * parent maps its data into these, so TrackMap never references a store.
 */
export interface TrackDriver {
  id: string
  /** Short label rendered beside the marker (e.g. initials). */
  label?: string
  /** Lap progress, 0 (start/finish) → 1 (full lap). Clamped on sample. */
  progress: number
  /** Marker fill; falls back to the accent colour. */
  color?: string
  /** Emphasised marker (larger + glow), e.g. the selected/leading driver. */
  highlight?: boolean
}

export interface TrackMapProps {
  circuit: Circuit
  drivers: TrackDriver[]
  /** Marker radius in viewBox units. */
  markerRadius?: number
  /**
   * Zoom factor relative to a contain-fit (1 = fully visible, letterboxed).
   * Values > 1 enlarge the track so its empty corners bleed past the edges
   * (and tuck behind the opaque corner panels). Default 1.
   */
  scale?: number
  /** Fired with a driver id when its marker is clicked. */
  onSelectDriver?: (id: string) => void
  className?: string
}

/**
 * The visual centrepiece: a glowing circuit with driver markers positioned by
 * lap progress.
 *
 * Motion: each marker springs its `progress` scalar and re-samples the path
 * every frame, so the marker stays *exactly on the racing line* as it moves —
 * it follows the curve rather than cutting straight across. Changing a driver's
 * `progress` (a new replay day, an overtake) eases it along the track for free.
 * Selection gently enlarges the marker; hover lifts its glow. Springs are
 * highly damped for a restrained, premium feel.
 */
export function TrackMap({
  circuit,
  drivers,
  markerRadius,
  scale = 1,
  onSelectDriver,
  className,
}: TrackMapProps) {
  const sampler = usePathSampler(circuit.path)
  const [, , vbW, vbH] = circuit.viewBox

  // Stroke/marker sizes are authored against a 1000-unit-wide reference and
  // scaled to whatever viewBox the imported circuit uses, so any track looks
  // consistent. `markerRadius` (if passed) overrides the scaled default.
  const k = vbW / 1000
  const stroke = { halo: 26 * k, base: 14 * k, line: 3 * k, sector: 4 * k }
  const radius = markerRadius ?? Math.max(5, 9 * k)

  // Pad the viewBox slightly so marker labels and edge glow are never clipped.
  const [vbX, vbY] = circuit.viewBox
  const pad = vbW * 0.06
  const paddedViewBox = [
    vbX - pad,
    vbY - pad,
    vbW + pad * 2,
    vbH + pad * 2,
  ].join(' ')

  // --- Rendering ----------------------------------------------------------
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center',
        className,
      )}
    >
      <svg
        viewBox={paddedViewBox}
        // Fit within the container on BOTH axes (preserveAspectRatio default
        // xMidYMid meet), then optionally zoom past the fit-box via transform
        // so the track's empty corners bleed behind the corner panels.
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
        className="h-full max-h-full w-full max-w-full"
        role="img"
        aria-label={`${circuit.name} with ${drivers.length} drivers`}
      >
        <defs>
          <filter
            id="track-bloom"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Soft outer halo */}
        <path
          d={circuit.path}
          fill="none"
          stroke="oklch(0.64 0.05 320 / 35%)"
          strokeWidth={stroke.halo}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#track-bloom)"
        />
        {/* Dark base ribbon */}
        <path
          d={circuit.path}
          fill="none"
          stroke="oklch(0.30 0.01 320)"
          strokeWidth={stroke.base}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bright racing line */}
        <path
          d={circuit.path}
          fill="none"
          stroke="oklch(0.92 0.01 300)"
          strokeWidth={stroke.line}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Coloured sector overlays */}
        {circuit.sectors?.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke.sector}
            strokeLinecap="round"
          />
        ))}

        {/* Driver markers — path-locked, gliding, selectable, hover-lit */}
        {drivers.map((d) => (
          <DriverMarker
            key={d.id}
            driver={d}
            sampler={sampler}
            radius={radius}
            k={k}
            labelSize={Math.round(vbW / 90)}
            onSelect={onSelectDriver}
          />
        ))}

        {/* Start/finish tick */}
        <StartLine sampler={sampler} size={vbH / 28} />
      </svg>
    </div>
  )
}

/**
 * A single animated driver marker. Position glides via a damped spring (so
 * `progress` changes and overtakes animate); selection enlarges it; hover
 * lifts a soft glow. Restrained throughout — no bounce, no spin.
 */
function DriverMarker({
  driver: d,
  sampler,
  radius,
  k,
  labelSize,
  onSelect,
}: {
  driver: TrackDriver
  sampler: PathSampler
  radius: number
  k: number
  labelSize: number
  onSelect?: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = d.color ?? 'var(--pp-accent)'
  const active = d.highlight || hovered
  const labelY = -((d.highlight ? radius + 4 * k : radius) + 8 * k)

  // Position is sampled from the path at the current progress and written to
  // motion values directly — so the marker is always exactly on the racing
  // line. The replay clock supplies a smoothly-interpolated progress each
  // frame, so motion comes from the data, not a second spring layer.
  const pt = sampler.pointAt(d.progress)
  const x = useMotionValue(pt.x)
  const y = useMotionValue(pt.y)
  x.set(pt.x)
  y.set(pt.y)

  return (
    <motion.g
      data-driver={d.id}
      style={{ x, y, cursor: onSelect ? 'pointer' : 'default' }}
      onClick={onSelect ? () => onSelect(d.id) : undefined}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      {/* Inner group carries the emphasis scale so it composes with position. */}
      <motion.g
        initial={false}
        animate={{ scale: d.highlight ? 1.22 : 1 }}
        transition={EMPHASIS}
      >
        {/* Soft glow halo — lifts on selection or hover. */}
        <motion.circle
          r={radius + 4 * k}
          fill={color}
          initial={false}
          animate={{ opacity: d.highlight ? 0.28 : hovered ? 0.18 : 0 }}
          transition={EMPHASIS}
        />
        <circle
          r={d.highlight ? radius : radius - 2 * k}
          fill={color}
          stroke="var(--pp-void)"
          strokeWidth={2 * k}
          style={active ? { filter: `drop-shadow(0 0 10px ${color})` } : undefined}
        />
      </motion.g>

      {d.label && (
        <text
          y={labelY}
          textAnchor="middle"
          className="fill-text font-mono"
          fontSize={labelSize}
          letterSpacing={1}
        >
          {d.label}
        </text>
      )}
    </motion.g>
  )
}

/** A small perpendicular tick at the start/finish line (progress 0). */
function StartLine({
  sampler,
  size,
}: {
  sampler: ReturnType<typeof usePathSampler>
  size: number
}) {
  const { x, y, angle } = sampler.pointAt(0)
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle + 90})`}>
      <rect
        x={-1}
        y={-size / 2}
        width={2}
        height={size}
        fill="var(--pp-text-faint)"
      />
    </g>
  )
}
