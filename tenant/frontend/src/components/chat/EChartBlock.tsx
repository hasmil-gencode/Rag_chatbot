import { useRef } from "react";
import ReactECharts from "echarts-for-react";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";

interface EChartBlockProps {
  option: Record<string, any>;
  title?: string;
  compact?: boolean;
}

export function EChartBlock({ option, title = "Chart", compact = false }: EChartBlockProps) {
  const chartRef = useRef<any>(null);
  const [expanded, setExpanded] = useState(false);
  const mapAxis = (axis: any): any => {
    if (Array.isArray(axis)) return axis.map(mapAxis);
    if (!axis || typeof axis !== "object") return axis;
    return {
      ...axis,
      axisLabel: { ...(axis.axisLabel || {}), color: '#ccc' },
      axisLine: { ...(axis.axisLine || {}), lineStyle: { ...(axis.axisLine?.lineStyle || {}), color: '#555' } },
      splitLine: { ...(axis.splitLine || {}), lineStyle: { ...(axis.splitLine?.lineStyle || {}), color: '#333' } },
    };
  };

  const seriesList = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  const hasPie = seriesList.some((s: any) => s?.type === "pie");
  const hasCartesian = Boolean(option.xAxis || option.yAxis || seriesList.some((s: any) => ["bar", "line"].includes(s?.type)));
  const shouldHideSingleSeriesLegend = hasCartesian && seriesList.length <= 1;

  // Apply dark mode friendly defaults (override text colors)
  const darkOption: any = {
    ...option,
    backgroundColor: 'transparent',
    textStyle: { ...(option.textStyle || {}), color: '#e0e0e0' },
    title: {
      ...(option.title || {}),
      top: option.title?.top ?? 8,
      left: option.title?.left ?? 'center',
      textStyle: { ...(option.title?.textStyle || {}), color: '#e0e0e0', fontSize: option.title?.textStyle?.fontSize ?? 16 },
    },
    legend: shouldHideSingleSeriesLegend
      ? { ...(option.legend || {}), show: false }
      : {
          ...(option.legend || {}),
          top: hasPie ? undefined : (option.legend?.top ?? 42),
          bottom: hasPie ? (option.legend?.bottom ?? 0) : option.legend?.bottom,
          textStyle: { ...(option.legend?.textStyle || {}), color: '#ccc' },
    },
    grid: hasCartesian
      ? { ...(option.grid || {}), top: shouldHideSingleSeriesLegend ? 78 : 102, left: 48, right: 24, bottom: 58, containLabel: true }
      : option.grid,
    tooltip: { ...(option.tooltip || {}), backgroundColor: '#333', textStyle: { color: '#fff' } },
  };
  if (darkOption.xAxis) darkOption.xAxis = mapAxis(darkOption.xAxis);
  if (darkOption.yAxis) darkOption.yAxis = mapAxis(darkOption.yAxis);
  // Pie chart label colors
  if (darkOption.series && !Array.isArray(darkOption.series)) darkOption.series = [darkOption.series];
  if (darkOption.series) darkOption.series = darkOption.series.map((s: any) => s.type === 'pie' ? { ...s, label: { ...(s.label || {}), color: '#e0e0e0' } } : s);

  const downloadImage = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const url = instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = "chart.png";
    a.click();
  };

  return (
    <div className={`not-prose ${compact ? "my-0" : "my-4"} w-full min-w-0 border rounded-lg overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-background shadow-2xl flex flex-col" : ""}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
        <span className="text-[10px] font-medium text-muted-foreground truncate">{title}</span>
        <div className="flex items-center gap-1">
          <button onClick={downloadImage} className="p-1 rounded hover:bg-muted transition-colors" title="Download PNG">
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-muted transition-colors" title={expanded ? "Minimize" : "Expand"}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>
      <div className={expanded ? "flex-1" : ""}>
        <ReactECharts ref={chartRef} option={darkOption} style={{ height: expanded ? "100%" : compact ? "310px" : "350px", minHeight: compact ? "260px" : "300px", width: "100%" }} />
      </div>
    </div>
  );
}
