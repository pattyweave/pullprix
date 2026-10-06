import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TrackMap } from '../../components/hud/TrackMap'
import { driverColors, trackDrivers } from '../connected/track-drivers'
import type { DisplayStanding } from '../connected/adapter'
import { JACAREPAGUA, NOVA_CIRCUIT, SUZUKA, SPA, INTERLAGOS, type Circuit } from './circuits'
import { usePathSampler } from './usePathSampler'
import suzukaArtwork from '../../assets/tracks/suzuka-alignment.svg'
import spaArtwork from '../../assets/tracks/spa-francorchamps-alignment.svg'
import interlagosArtwork from '../../assets/tracks/interlagos-alignment.svg'
import suzukaSource from '../../assets/tracks/suzuka.svg?raw'
import spaSource from '../../assets/tracks/spa-francorchamps.svg?raw'
import interlagosSource from '../../assets/tracks/interlagos.svg?raw'
import './track-lab.css'

const sourceArtwork: Record<string, string> = { suzuka: suzukaSource, 'spa-francorchamps': spaSource, interlagos: interlagosSource }

const stressTracks: Circuit[] = [
  { id: 'test-wide', name: 'Wide oval · synthetic', viewBox: [0, 0, 1000, 260], path: 'M150 40 H850 A90 90 0 0 1 850 220 H150 A90 90 0 0 1 150 40 Z' },
  { id: 'test-tall', name: 'Tall hairpin · synthetic', viewBox: [0, 0, 260, 1000], path: 'M70 80 C70 20 190 20 190 80 L190 920 C190 980 70 980 70 920 Z' },
  { id: 'test-crossing', name: 'Crossover · synthetic', viewBox: [0, 0, 1000, 500], path: 'M500 250 C200 -40 40 30 60 250 C40 470 200 540 500 250 C800 -40 960 30 940 250 C960 470 800 540 500 250 Z' },
]
const people = ['we4ve', 'williamsaintweaver', 'Hollistud', 'weavemoney', 'pattyweave']
const colors = driverColors(people)
const samples = { september: [22, 16, 8, 8, 0], start: [0, 0, 0, 0, 0], laps: [180, 135, 98, 90, 0] }
class PreviewBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() { return this.state.error ? <p role="alert">Invalid circuit: {this.state.error}</p> : this.props.children }
}
function CircuitPreview({ circuit, rows, selected, select }: { circuit: Circuit; rows: DisplayStanding[]; selected: string; select: (id: string) => void }) {
  const sampler = usePathSampler(circuit.path)
  return <article className="track-lab-card" data-circuit={circuit.id}>
    <header><h2>{circuit.name}</h2><span>{circuit.viewBox[2]} × {circuit.viewBox[3]}</span></header>
    <div className="track-lab-map"><TrackMap circuit={circuit} drivers={trackDrivers(rows, selected, colors)} onSelectDriver={select} /></div>
    <p className="track-lab-meta">Closed loop · {Math.round(sampler.length)} path units · 90 points per lap</p>
  </article>
}
/** Development-only, deterministic sample data. Never uses private team APIs. */
export function TrackLab() {
  const [scenario, setScenario] = useState<keyof typeof samples>('september')
  const [selected, select] = useState(people[0]!)
  const [offset, setOffset] = useState(0)
  const [stress, setStress] = useState(false)
  const [focus, setFocus] = useState(false)
  const [geometryCheck, setGeometryCheck] = useState('Checking native geometry…')
  const rows: DisplayStanding[] = useMemo(() => people.map((name, i) => ({ participantId: name, displayName: name, points: samples[scenario][i]! + offset,
    rank: null, tied: false, active: true, avatarUrl: null })), [scenario, offset])
  const circuits = [SUZUKA, SPA, INTERLAGOS, JACAREPAGUA, NOVA_CIRCUIT, ...(stress ? stressTracks : [])]
  useEffect(() => {
    // Wait for Framer's DOM writes, then compare the displayed markers with
    // independent native measurements of each rendered circuit, not its sampler.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        let maximum = 0, count = 0, outside = 0, alignmentSamples = 0
        const filters = new Set<string>()
        for (const card of document.querySelectorAll('.track-lab-card')) {
          const path = card.querySelector('svg path') as SVGPathElement | null
          if (!path) continue
          const length = path.getTotalLength()
          const source = sourceArtwork[card.getAttribute('data-circuit')!]
          if (source) {
            const xml = new DOMParser().parseFromString(source, 'image/svg+xml')
            const ribbon = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            ribbon.setAttribute('d', xml.querySelector('path')!.getAttribute('d')!)
            ribbon.style.opacity = '0'
            ribbon.style.pointerEvents = 'none'
            path.ownerSVGElement!.append(ribbon)
            for (let i = 0; i < 1000; i++) {
              if (!ribbon.isPointInFill(path.getPointAtLength(i / 1000 * length))) outside++
              alignmentSamples++
            }
            ribbon.remove()
          }
          filters.add(card.querySelector('filter')!.id)
          for (const marker of card.querySelectorAll('[data-driver]')) {
            const points = rows.find(row => row.participantId === marker.getAttribute('data-driver'))!.points
            const progress = ((points / 90 % 1) + 1) % 1
            const expected = path.getPointAtLength(progress * length)
            const actual = new DOMMatrix(getComputedStyle(marker).transform)
            maximum = Math.max(maximum, Math.hypot(expected.x - actual.e, expected.y - actual.f))
            count++
          }
        }
        const expectedMaps = stress ? 8 : 5
        setGeometryCheck(count === expectedMaps * rows.length && filters.size === expectedMaps && maximum < 0.05 && outside === 0
          ? `Native geometry verified · ${count} markers on ${expectedMaps} independent circuits · maximum error ${maximum.toFixed(3)} SVG units · ${alignmentSamples - outside}/${alignmentSamples} centerline samples inside source ribbons`
          : `Geometry check needs attention · ${count} markers · maximum error ${maximum.toFixed(3)} SVG units · ${alignmentSamples - outside}/${alignmentSamples} centerline samples inside source ribbons`)
      })
    })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [rows, selected, stress, focus])
  return <main className="track-lab">
    <p className="hud-label text-accent">Local track comparison</p>
    <h1>Same drivers. Different circuits.</h1>
    <a className="underline" href="/track-lab/dashboard">Compare in the team dashboard</a>
    <p className="track-lab-description">Sample data only. September uses the five-driver test scores (22, 16, 8, 8, 0); start line puts everyone at zero. Production and the demo are unchanged.</p>
    <div className="track-lab-controls">
      <label>Scenario<select value={scenario} onChange={event => { setScenario(event.target.value as keyof typeof samples); setOffset(0) }}>
        <option value="september">September test scores</option><option value="start">Everyone at the start</option><option value="laps">Multiple laps and shared positions</option>
      </select></label>
      <label>Move the field · +{offset} points<input aria-label="Move the field" type="range" min="0" max="90" step="1" value={offset} onChange={event => setOffset(Number(event.target.value))} /></label>
      <label className="track-lab-check"><input type="checkbox" checked={stress} onChange={event => setStress(event.target.checked)} />Include synthetic geometry checks</label>
      <label className="track-lab-check"><input type="checkbox" checked={focus} onChange={event => setFocus(event.target.checked)} />Full-width previews</label>
    </div>
    <div className="track-lab-drivers" aria-label="Select driver">{rows.map(row => <button key={row.participantId} aria-pressed={selected === row.participantId} onClick={() => select(row.participantId)} style={{ borderColor: colors.get(row.participantId), color: selected === row.participantId ? colors.get(row.participantId) : undefined }}>
      <span style={{ background: colors.get(row.participantId) }} />{row.displayName}<small>{row.points} pts</small>
    </button>)}</div>
    <p className="track-lab-pending">Prepared centerlines follow the source arrows, with decoration removed and Suzuka crossing straight through. Compare the green lines against the original gray silhouettes below.</p>
    <p role="status" className="track-lab-meta">{geometryCheck}</p>
    <div className={`track-lab-grid ${focus ? 'is-focused' : ''}`}>{circuits.map(circuit => <PreviewBoundary key={circuit.id}><CircuitPreview circuit={circuit} rows={rows} selected={selected} select={select} /></PreviewBoundary>)}</div>
    <h2 className="track-lab-artwork-title">Centerline alignment · source comparison</h2>
    <div className="track-lab-grid">{[['Suzuka', suzukaArtwork], ['Spa-Francorchamps', spaArtwork], ['Interlagos', interlagosArtwork]].map(([name, src]) => <article className="track-lab-artwork" key={name}>
      <h3>{name}</h3><img src={src} alt={`${name} centerline aligned with original artwork`} /><p className="track-lab-meta">Green: sampled centerline · Gray: original source ribbon</p>
    </article>)}</div>
  </main>
}
