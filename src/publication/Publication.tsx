/**
 * Publication — Auricle's resting state: a normal climate-data publication.
 *
 * To a visitor this is the whole site: four dataset cards in the Warming
 * Stripes editorial language — serif title, source line, a real description
 * from the data envelope, and a DEEP scrollable table of every row. There are
 * NO commissioning affordances here: to a human the page is a publication; the
 * workbench underneath (create_view and the per-view tool families) is the
 * agent's secret, reached only over WebMCP.
 *
 * This module also owns the two quiet fixtures that persist across states:
 *
 *  - {@link ToolSpeechAnnouncer} — the accessibility thesis working invisibly:
 *    a zero-pixel `aria-live` region that receives every executed tool's
 *    narrated `speech`, so a screen-reader user hears every answer the agent
 *    computes while a sighted user watches it drawn — with no chat UI at all.
 *  - {@link Colophon} — the slim footer: the "Enable sound" text control (the
 *    one user gesture browsers require before the sonify tools may play) and
 *    the sources line.
 */

import { useSyncExternalStore } from 'react'
import { useToolLog } from '../lib/agent-a11y'
import { CHARTS, DATASETS, getChart } from '../dashboard/charts.ts'
// Direct paths (not the ../charts barrel) keep this file importable from the
// browserless check without dragging every SVG chart component in.
import { DataTable } from '../charts/DataTable.tsx'
import { tableFor, rowCountFor, TOTAL_ROWS } from '../charts/data.ts'
import { subscribeAudio, isAudioReady, armAudio } from '../sonify.ts'

/**
 * THE ACCESSIBILITY THESIS, WORKING INVISIBLY. Every WebMCP tool this page
 * registers returns `speech` — a full narrated answer with exact figures,
 * units, and source. This visually-hidden `aria-live="polite"` region
 * subscribes to the registry's executed-tool log and renders the latest
 * speech, so a screen reader announces every answer as it lands — zero
 * pixels, no chat surface, the same words the agent relays. The page answers
 * spatially for sighted users (charts materialize, highlights draw, sound
 * plays) and verbally for screen-reader users, from one source of truth.
 */
export function ToolSpeechAnnouncer() {
  const log = useToolLog()
  const latest = log[log.length - 1]
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {latest ? latest.speech : ''}
    </div>
  )
}

/** Live view of whether Web Audio has been armed (a user gesture resumed it). */
function useAudioReady(): boolean {
  return useSyncExternalStore(subscribeAudio, isAudioReady, () => false)
}

/**
 * The slim page footer: sources line + the "Enable sound" text control.
 * Browsers only start audio from a real click, so this stays actionable until
 * armed, then reads "Sound on". The sonify tools' refusal speech points here.
 */
export function Colophon() {
  const ready = useAudioReady()
  return (
    <footer className="colophon">
      <p className="colophon__sources">Data: NASA GISTEMP · NOAA · Our World in Data</p>
      <button
        type="button"
        className={`colophon__sound${ready ? ' colophon__sound--on' : ''}`}
        aria-pressed={ready}
        onClick={() => void armAudio()}
        title={
          ready
            ? 'Audio is enabled — charts can be played as sound'
            : 'Enable audio so charts can be played as sound'
        }
      >
        {ready ? 'Sound on' : 'Enable sound'}
      </button>
    </footer>
  )
}

/**
 * One dataset as an editorial card: serif title, source line, the envelope's
 * real description (span + headline figure, computed by the data pipeline),
 * then the FULL table — every row, scrolling inside the card, sticky header.
 * Deliberately no buttons: reading is the only human affordance.
 */
function DatasetCard({ chartId, index }: { chartId: string; index: number }) {
  const chart = getChart(chartId)
  const model = tableFor(chartId)
  const data = DATASETS[chartId as keyof typeof DATASETS]
  if (!chart || !model || !data) return null
  const live = chart.kind === 'live'
  return (
    <section
      className="pub-card"
      aria-label={`${chart.title} — full dataset`}
      style={{ animationDelay: `${(0.12 + index * 0.09).toFixed(2)}s` }}
    >
      <h2 className="pub-card__title">{chart.title}</h2>
      <p className="pub-card__source">
        {chart.source} · {rowCountFor(chartId).toLocaleString('en-US')} rows
        {live && (
          <>
            {' · '}
            <span className="pub-card__live">live</span>
          </>
        )}
      </p>
      <p className="pub-card__desc">{data.note}</p>
      <DataTable model={model} />
    </section>
  )
}

/**
 * The publication proper: the honest headline, the explainer, and the 2×2
 * grid of deep dataset cards. `leaving` plays the staggered exit animation
 * while a commissioned dashboard takes the canvas (reduced motion skips the
 * leaving stage entirely — see App's stage machine).
 */
export function Publication({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={`pub${leaving ? ' pub--leaving' : ''}`}>
      <div className="pub__lede">
        <h2 className="pub__headline">
          {TOTAL_ROWS.toLocaleString('en-US')} rows. Zero answers.
        </h2>
        <p className="pub__sub">
          This is the planet's data as a screen reader meets it — readable, row by
          row, and unanswerable. Ask, and the dashboard builds itself.
        </p>
      </div>
      <div className="pub__grid">
        {CHARTS.map((c, i) => (
          <DatasetCard key={c.id} chartId={c.id} index={i} />
        ))}
      </div>
    </div>
  )
}
