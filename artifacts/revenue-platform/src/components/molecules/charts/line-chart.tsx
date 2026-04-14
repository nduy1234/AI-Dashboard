/**
 * ModernLineChart — multi-line chart with smooth curves and dots.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions, ApexYAxis } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

interface LineSeries {
  name: string;
  data: number[];
  color?: string;
}

interface ModernLineChartProps {
  series: LineSeries[];
  categories: string[];
  height?: number;
  legend?: boolean;
  yUnit?: string;
}

export function ModernLineChart({
  series,
  categories,
  height = 240,
  legend = false,
  yUnit,
}: ModernLineChartProps) {
  const { baseOptions, colors } = useApexTheme();

  const defaultColors = [
    colors.primary,
    colors.emerald,
    colors.accent,
    colors.amber,
    colors.cyan,
  ];

  const chartColors = series.map((s, i) => s.color ?? defaultColors[i % defaultColors.length]);

  const options: ApexOptions = {
    ...baseOptions,
    chart: { ...baseOptions.chart, type: "line" },
    colors: chartColors,
    stroke: {
      curve: "smooth",
      width: 2.5,
    },
    markers: {
      size: 4,
      strokeWidth: 2,
      strokeColors: "#fff",
      hover: { size: 6 },
    },
    xaxis: { ...baseOptions.xaxis, categories },
    yaxis: {
      ...(baseOptions.yaxis as ApexYAxis),
      labels: {
        ...(baseOptions.yaxis as ApexYAxis)?.labels,
        ...(yUnit ? { formatter: (v: number) => `${v}${yUnit}` } : {}),
      },
    },
    legend: { ...baseOptions.legend, show: legend },
    tooltip: {
      ...baseOptions.tooltip,
      shared: true,
      intersect: false,
    },
  };

  return (
    <ReactApexChart
      type="line"
      series={series.map(({ name, data }) => ({ name, data }))}
      options={options}
      height={height}
    />
  );
}
