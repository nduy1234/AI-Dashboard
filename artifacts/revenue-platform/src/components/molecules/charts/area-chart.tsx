/**
 * ModernAreaChart — smooth gradient area chart using ApexCharts.
 * Drop-in replacement for the old recharts AreaChart.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions, ApexYAxis } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

export interface AreaSeries {
  name: string;
  data: number[];
  color?: string;
}

interface ModernAreaChartProps {
  series: AreaSeries[];
  categories: string[];
  height?: number | string;
  /** Show multiple Y-axis unit label, e.g. "%" or "$" */
  yUnit?: string;
  /** Stack areas on top of each other */
  stacked?: boolean;
  /** Show legend */
  legend?: boolean;
}

export function ModernAreaChart({
  series,
  categories,
  height = 240,
  yUnit,
  stacked = false,
  legend = false,
}: ModernAreaChartProps) {
  const { isDark, baseOptions, colors } = useApexTheme();

  const defaultColors = [
    colors.primary,
    colors.accent,
    colors.emerald,
    colors.amber,
    colors.cyan,
  ];

  const chartColors = series.map((s, i) => s.color ?? defaultColors[i % defaultColors.length]);

  const options: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: "area",
      stacked,
    },
    colors: chartColors,
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.38,
        opacityTo: 0.02,
        stops: [0, 95],
      },
    },
    stroke: {
      curve: "smooth",
      width: 2.5,
    },
    xaxis: {
      ...baseOptions.xaxis,
      categories,
    },
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
      ...(yUnit ? { y: { formatter: (v: number) => `${v}${yUnit}` } } : {}),
    },
    markers: {
      size: 0,
      hover: { size: 5 },
    },
  };

  return (
    <ReactApexChart
      type="area"
      series={series.map(({ name, data }) => ({ name, data }))}
      options={options}
      height={height}
    />
  );
}
