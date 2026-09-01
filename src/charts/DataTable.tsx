/**
 * DataTable — the accessible table behind every chart's "View as table" toggle.
 *
 * Semantic `<table>` with a `<caption>` (which cites the source), `<th scope>`
 * on the header row and the row-label column, and mono right-aligned figures for
 * numeric columns. Scrolls inside its own container for long series.
 */

import type { TableModel } from './types.ts'

export function DataTable({ model, id }: { model: TableModel; id?: string }) {
  const [firstCol, ...restCols] = model.columns
  return (
    <div className="datatable" role="region" aria-label={model.caption} tabIndex={0}>
      <table id={id} className="datatable__table">
        <caption className="datatable__caption">{model.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{firstCol.label}</th>
            {restCols.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'datatable__num' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, i) => (
            <tr key={i}>
              <th scope="row">{String(row[firstCol.key])}</th>
              {restCols.map((c) => (
                <td key={c.key} className={c.numeric ? 'datatable__num' : undefined}>
                  {String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
