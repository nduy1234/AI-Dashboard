/**
 * MixedChart — bars + line overlay (Leads vs Meetings).
 * Replicates the old "Pipeline Generated" ComposedChart in a modern style.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

interface MixedChartProps {
  barData: number[];
  lineData: number[];
  categories: string[];
  barLabel?: string;
  lineLabel?: string;
  height?: number;
}

export function MixedChart({
  barData,
  lineData,
  categories,
  barLabel = "Leads",
  lineLabel = "Meetings",
  height = 240,
}: MixedChartProps) {
  const { baseOptions, colors } = useApexTheme();

  const options: ApexOptions = {
    ...baseOptions,
    chart: { ...baseOptions.chart, type: "line" },
    colors: [colors.accent, colors.primary],
    plotOptions: {
      bar: {
        borderRadius: 5,
        borderRadiusApplication: "end",
        columnWidth: "40%",
      },
    },
    fill: {
      type: ["gradient", "solid"],
      gradient: {
        shade: "dark",
        type: "vertical",
        shadeIntensity: 0.2,
        opacityFrom: 0.85,
        opacityTo: 0.4,
        stops: [0, 100],
      },
    },
    stroke: {
      width: [0, 2.5],
      curve: "smooth",
    },
    markers: {
      size: [0, 4],
      strokeWidth: 2,
      strokeColors: "#fff",
      hover: { size: 6 },
    },
    xaxis: { ...baseOptions.xaxis, categories },
    yaxis: { ...baseOptions.yaxis },
    legend: { ...baseOptions.legend, show: true },
    tooltip: { ...baseOptions.tooltip, shared: true, intersect: false },
  };

  return (
    <ReactApexChart
      type="line"
      series={[
        { name: barLabel, type: "bar",  data: barData  },
        { name: lineLabel, type: "line", data: lineData },
      ]}
      options={options}
      height={height}
    />
  );
}
