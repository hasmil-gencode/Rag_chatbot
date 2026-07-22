import { EChartBlock } from "./EChartBlock";
import type { ChatArtifact } from "@/lib/api";

interface DashboardBlockProps {
  artifact: ChatArtifact;
}

export function DashboardBlock({ artifact }: DashboardBlockProps) {
  const charts = Array.isArray(artifact.charts) ? artifact.charts.filter((chart) => chart?.option) : [];
  const kpis = Array.isArray(artifact.kpis) ? artifact.kpis : [];
  const rows = Array.isArray(artifact.table) ? artifact.table.slice(0, 8) : [];
  const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];

  if (charts.length === 0) return null;

  return (
    <div className="not-prose my-4 w-full min-w-0 border rounded-lg overflow-hidden bg-background">
      <div className="px-3 py-2 bg-muted/50 border-b">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dashboard</p>
        <h3 className="text-sm font-semibold text-foreground">{artifact.title || "Analysis Dashboard"}</h3>
      </div>

      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 border-b">
          {kpis.map((kpi, index) => (
            <div key={`${kpi.label}-${index}`} className="rounded-md border px-3 py-2 bg-muted/20">
              <p className="text-[10px] text-muted-foreground truncate">{kpi.label}</p>
              <p className="text-lg font-semibold text-foreground truncate">{String(kpi.value ?? "-")}</p>
              {kpi.detail !== undefined && (
                <p className="text-[10px] text-muted-foreground truncate">{String(kpi.detail)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3">
        {charts.map((chart, index) => (
          <div key={chart.id || `${chart.title}-${index}`} className={chart.size === "large" ? "xl:col-span-2" : ""}>
            <EChartBlock option={chart.option} title={chart.title} compact />
          </div>
        ))}
      </div>

      {rows.length > 0 && headers.length > 0 && (
        <div className="px-3 pb-3">
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t">
                    {headers.map((header) => (
                      <td key={header} className="px-2 py-1.5 text-foreground">
                        {String(row[header] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
