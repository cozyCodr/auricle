/**
 * ChartCard — the card shell around a chart figure.
 *
 * Two variants (editorial sections — hairlines and typography, no boxes):
 *  - `hero`  — large serif headline, an italic muted "Focused — N tools
 *    listening." note, its tool family as one plain mono text run, and a
 *    table toggle.
 *  - `small` — compact, dimmed, captioned "unfocused — tools unregistered"; the
 *    whole figure is a real <button> that focuses the chart (agent parity with
 *    the `focus_chart` tool).
 *
 * Every card carries a "View as table" toggle (real <button aria-expanded>) that
 * reveals the accessible <table> for that chart's series.
 */

import { useId, useState } from 'react'
import { useAgentAvailable, useToolLog } from '../lib/agent-a11y'
import { KIND_LABEL, type ChartMeta, type ChartKind } from '../dashboard/charts.ts'
import { toolNamesFor, toolCountFor } from '../dashboard/surfaces.ts'
import type { ChartVariant } from './types.ts'
import type { MirrorHighlightEvent } from './highlight.ts'
import { ChartFigure } from './ChartFigure.tsx'
import { DataTable } from './DataTable.tsx'
import { tableFor } from './data.ts'

interface ChartCardProps {
  chart: ChartMeta
  /** The view's drawing kind; defaults to the dataset's canonical kind. */
  kind?: ChartKind
  variant: ChartVariant
  onFocus: (id: string) => void
  highlight?: MirrorHighlightEvent
}

/** Spell small counts as words for the focused note ("five tools listening"). */
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n)
}

/**
 * The focused view's tool family as ONE plain mono text run — names separated
 * by middots, the most recently invoked tool underlined in ink. No chips, no
 * lozenges: typography carries the state.
 */
function ToolRun({ chartId, available }: { chartId: string; available: boolean }) {
  const names = toolNamesFor(chartId)
  const log = useToolLog()
  const lastRun = [...log].reverse().find((e) => names.includes(e.tool))?.tool
  return (
    <p
      className="toolrun"
      aria-label={available ? 'Site Tools registered for this chart' : 'Site Tool definitions for this chart'}
    >
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <span className={`toolrun__name${n === lastRun ? ' toolrun__name--active' : ''}`}>{n}</span>
        </span>
      ))}
    </p>
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

export function ChartCard({ chart, kind, variant, onFocus, highlight }: ChartCardProps) {
  const titleId = useId()
  const agentAvailable = useAgentAvailable()
  const resolvedKind: ChartKind = kind ?? chart.kind
  // Plain-text kind note so two views of the same dataset read apart.
  const kindNote = resolvedKind === chart.kind ? '' : ` · ${KIND_LABEL[resolvedKind]}`

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
              {kindNote}
            </p>
          </div>
          {/* Focused state as italic muted plain text — no badge, no lozenge. */}
          <p className="card__focused-note">
            {agentAvailable
              ? `Focused — ${countWord(toolCountFor(chart.id))} tools listening.`
              : 'Focused — WebMCP unavailable.'}
          </p>
        </div>

        <div className="card__figure card__figure--hero">
          <ChartFigure chartId={chart.id} kind={resolvedKind} variant="hero" highlight={highlight} />
        </div>

        <ToolRun chartId={chart.id} available={agentAvailable} />
        <TableToggle chartId={chart.id} />
      </section>
    )
  }

  // Small card — the figure is a focus button. A small view still paints its
  // chart's mirror highlights (every rendered view of a chartId gets them).
  return (
    <section className="card card--small" aria-labelledby={titleId}>
      <button type="button" className="card__focus" onClick={() => onFocus(chart.id)}>
        <span className="card__title card__title--small" id={titleId}>
          {chart.title}
          {kindNote}
        </span>
        <span className="card__caption">
          {chart.unit} · unfocused — {agentAvailable ? 'Site Tools inactive' : 'WebMCP unavailable'}
        </span>
        <span className="card__figure card__figure--small">
          <ChartFigure chartId={chart.id} kind={resolvedKind} variant="small" highlight={highlight} />
        </span>
        <span className="card__focus-hint">Click to focus →</span>
      </button>
      <TableToggle chartId={chart.id} />
    </section>
  )
}
