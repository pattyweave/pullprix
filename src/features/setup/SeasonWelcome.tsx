import type { ReactNode } from 'react'
import { RACING_MANIFEST } from '../themes'
import { SeasonCountdown } from './SeasonCountdown'
import { ScoringSummary } from './ScoringSummary'
import type { InstallationSetup } from './types'
export function SeasonWelcome({ season, onRollover, track }: { track?: ReactNode; season: InstallationSetup['season']; onRollover: () => void }) {
  if (season.themePack?.id !== RACING_MANIFEST.id || season.themePack?.version !== RACING_MANIFEST.version) {
    return <p role="status" className="mt-6">The current season is updating. Refresh shortly to load its theme.</p>
  }
  return <section className="mt-6" aria-labelledby="season-welcome-heading">
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Season {season.id} · {season.phase === 'final_stage' ? RACING_MANIFEST.vocabulary.finalStage : 'Race in Progress'}</p>
        <h2 id="season-welcome-heading" className="mt-2 text-2xl font-semibold">{season.name}</h2>
        <div className="mt-3"><SeasonCountdown endsAt={season.endsAt} onRollover={onRollover} /></div>
        <p className="mt-2 text-sm text-text-faint">Ends <time dateTime={season.endsAt}>{new Date(season.endsAt).toLocaleString()}</time> · your local time</p>
      </div>
      <figure className="px-5 py-4">
        {track ?? <img className="circuit-art mx-auto h-48 w-full object-contain sm:h-60" src={RACING_MANIFEST.assets.circuit} alt="Jacarepaguá circuit layout" />}
        <figcaption className="mt-2 text-center font-mono text-xs uppercase tracking-widest text-text-faint">Jacarepaguá · This season’s circuit</figcaption>
      </figure>
    </div>
    <ScoringSummary />
  </section>
}
