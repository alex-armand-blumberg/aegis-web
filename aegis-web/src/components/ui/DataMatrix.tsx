import type { ReactNode } from "react";

type Column = { key: string; header: string };

type DataMatrixProps = {
  columns: Column[];
  rows: Record<string, ReactNode>[];
  className?: string;
};

export function DataMatrix({ columns, rows, className = "" }: DataMatrixProps) {
  return (
    <div className={`overflow-x-auto ${className}`.trim()}>
      <table className="ui-data-matrix">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
