/**
 * SparkLine — tiny inline area sparkline for stat cards / table cells.
 */
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useApexTheme } from "@/hooks/use-apex-theme";

interface SparkLineProps {
  data: number[];
  color?: string;
  isPositive?: boolean;
  height?: number;
  width?: number | string;
}

export function SparkLine({ data, color, isPositive = true, height = 40, width = "100%" }: SparkLineProps) {
  const { isDark, colors } = useApexTheme();

  const lineColor = color ?? (isPositive ? colors.emerald : colors.rose);

  const options: ApexOptions = {
    chart: {
      type: "area",
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
      sparkline: { enabled: true },
      animations: { enabled: true, speed: 500 },
      fontFamily: "Inter, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: [lineColor],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.3,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    stroke: { curve: "smooth", width: 1.5 },
    tooltip: { enabled: false },
    markers: { size: 0 },
    dataLabels: { enabled: false },
  };

  return (
    <ReactApexChart
      type="area"
      series={[{ data }]}
      options={options}
      height={height}
      width={width}
    />
  );
}
