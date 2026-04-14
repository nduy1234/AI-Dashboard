/**
 * ModernRadialChart — radial bar / donut-like chart for funnel or KPI gauges.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

interface RadialSeries {
  label: string;
  value: number;   // 0-100 percentage
  color?: string;
}

interface ModernRadialChartProps {
  series: RadialSeries[];
  height?: number;
}

export function ModernRadialChart({ series, height = 280 }: ModernRadialChartProps) {
  const { isDark, baseOptions, colors } = useApexTheme();

  const defaultColors = [
    colors.primary,
    colors.accent,
    colors.emerald,
    colors.amber,
    colors.cyan,
    colors.rose,
  ];

  const chartColors = series.map((s, i) => s.color ?? defaultColors[i % defaultColors.length]);
  const labelColor  = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  const valueColor  = isDark ? "#f4f5ff" : "#1a1b2e";

  const options: ApexOptions = {
    ...baseOptions,
    chart: { ...baseOptions.chart, type: "radialBar" },
    colors: chartColors,
    plotOptions: {
      radialBar: {
        offsetY: 0,
        startAngle: -135,
        endAngle: 135,
        hollow: {
          margin: 5,
          size: "40%",
          background: "transparent",
        },
        track: {
          background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          strokeWidth: "97%",
          margin: 5,
        },
        dataLabels: {
          name: {
            fontSize: "11px",
            color: labelColor,
            offsetY: 6,
          },
          value: {
            fontSize: "20px",
            fontWeight: 700,
            color: valueColor,
            offsetY: -14,
            formatter: (v: number) => `${v}%`,
          },
          total: {
            show: series.length > 1,
            label: "Avg",
            fontSize: "11px",
            color: labelColor,
            formatter: () => {
              const avg = Math.round(series.reduce((a, s) => a + s.value, 0) / series.length);
              return `${avg}%`;
            },
          },
        },
      },
    },
    labels: series.map((s) => s.label),
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      fontSize: "12px",
      fontWeight: 500,
      labels: { colors: labelColor },
      markers: { size: 6 },
      itemMargin: { horizontal: 12, vertical: 4 },
    },
    grid: { padding: { top: 10 } },
  };

  return (
    <ReactApexChart
      type="radialBar"
      series={series.map((s) => s.value)}
      options={options}
      height={height}
    />
  );
}
