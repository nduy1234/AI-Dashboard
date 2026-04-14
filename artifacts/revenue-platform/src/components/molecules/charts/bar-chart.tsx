/**
 * ModernBarChart — modern column or bar chart using ApexCharts.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions, ApexYAxis } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

interface BarSeries {
  name: string;
  data: number[];
  color?: string;
}

interface ModernBarChartProps {
  series: BarSeries[];
  categories: string[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  rounded?: boolean;
  legend?: boolean;
  yUnit?: string;
}

export function ModernBarChart({
  series,
  categories,
  height = 240,
  horizontal = false,
  stacked = false,
  rounded = true,
  legend = false,
  yUnit,
}: ModernBarChartProps) {
  const { baseOptions, colors } = useApexTheme();

  const defaultColors = [
    colors.primary,
    colors.accent,
    colors.emerald,
    colors.amber,
    colors.cyan,
    colors.rose,
  ];

  const chartColors = series.map((s, i) => s.color ?? defaultColors[i % defaultColors.length]);

  const options: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: "bar",
      stacked,
    },
    colors: chartColors,
    plotOptions: {
      bar: {
        horizontal,
        borderRadius: rounded ? (horizontal ? 4 : 5) : 0,
        borderRadiusApplication: "end",
        columnWidth: series.length > 1 ? "55%" : "38%",
        barHeight: "60%",
        dataLabels: { position: "top" },
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: horizontal ? "horizontal" : "vertical",
        shadeIntensity: 0.15,
        gradientToColors: chartColors.map(c => c + "99"),
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 0.78,
        stops: [0, 100],
      },
    },
    stroke: { show: false },
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
  };

  return (
    <ReactApexChart
      type="bar"
      series={series.map(({ name, data }) => ({ name, data }))}
      options={options}
      height={height}
    />
  );
}
