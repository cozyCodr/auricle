/**
 * ChartCard — the card shell around a chart figure.
 *
 * Two variants:
 *  - `hero`  — large, 2px ink border + offset shadow, a "FOCUSED · N tools
 *    registered" badge, its live tool-family chips, and a table toggle.
 *  - `small` — compact, dimmed, captioned "unfocused — tools unregistered"; the
 *    whole figure is a real <button> that focuses the chart (agent parity with
 *    the `focus_chart` tool).
 *
 * Every card carries a "View as table" toggle (real <button aria-expanded>) that
 * reveals the accessible <table> for that chart's series.
 */

import { useId, useState } from 'react'
import type { ChartMeta } from '../dashboard/charts.ts'
import { toolNamesFor, toolCountFor } from '../dashboard/surfaces.ts'
import type { ChartVariant } from './types.ts'
import type { MirrorHighlightEvent } from './highlight.ts'
import { ChartFigure } from './ChartFigure.tsx'
import { DataTable } from './DataTable.tsx'
import { tableFor } from './data.ts'

interface ChartCardProps {
  chart: ChartMeta
  variant: ChartVariant
  onFocus: (id: string) => void
  highlight?: MirrorHighlightEvent
}

/** The live tool-family chips shown on the focused hero card. */
function ToolChips({ chartId }: { chartId: string }) {
  const names = toolNamesFor(chartId)
  return (
    <div className="chips" aria-label="Registered tools for this chart">
      {names.map((n) => (
        <span key={n} className="chip chip--active">
          {n}
        </span>
      ))}
    </div>
  )
}

/** The "View as table" toggle + the revealed accessible table. */
function TableToggle({ chartId }: { chartId: string }) {
  const [open, setOpen] = useState(false)
  const tableId = useId()
  const model = tableFor(chartId)
  if (!model) return null
  return (
    <div className="card__table">
      <button
        type="button"
        className="card__table-btn"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide table' : 'View as table'}
      </button>
      {open && <DataTable model={model} id={tableId} />}
    </div>
  )
}

export function ChartCard({ chart, variant, onFocus, highlight }: ChartCardProps) {
  const titleId = useId()

  if (variant === 'hero') {
    return (
      <section className="card card--hero" aria-labelledby={titleId}>
        <div className="card__head">
          <div>
            <h2 id={titleId} className="card__title">
              {chart.title}
            </h2>
            <p className="card__sub">
              {chart.unit} · {chart.period}
            </p>
          </div>
          <div className="card__badge">
            <span className="card__badge-dot" aria-hidden="true" />
            FOCUSED · {toolCountFor(chart.id)} tool{toolCountFor(chart.id) === 1 ? '' : 's'} registered
          </div>
        </div>

        <div className="card__figure card__figure--hero">
          <ChartFigure chartId={chart.id} variant="hero" highlight={highlight} />
        </div>

        <ToolChips chartId={chart.id} />
        <TableToggle chartId={chart.id} />
      </section>
    )
  }

  // Small (unfocused) card — the figure is a focus button.
  return (
    <section className="card card--small" aria-labelledby={titleId}>
      <button type="button" className="card__focus" onClick={() => onFocus(chart.id)}>
        <span className="card__title card__title--small" id={titleId}>
          {chart.title}
        </span>
        <span className="card__caption">{chart.unit} · unfocused — tools unregistered</span>
        <span className="card__figure card__figure--small">
          <ChartFigure chartId={chart.id} variant="small" />
        </span>
        <span className="card__focus-hint">Click to focus →</span>
      </button>
      <TableToggle chartId={chart.id} />
    </section>
  )
}
