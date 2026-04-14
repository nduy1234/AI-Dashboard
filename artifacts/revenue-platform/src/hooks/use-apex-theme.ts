import { useTheme } from "@/components/theme-provider";
import type { ApexOptions } from "apexcharts";

/**
 * Returns a base ApexCharts options object that adapts to light/dark theme.
 * Merge with chart-specific options using spread or deepmerge.
 */
export function useApexTheme(): {
  isDark: boolean;
  baseOptions: ApexOptions;
  colors: { primary: string; accent: string; emerald: string; amber: string; cyan: string; rose: string };
} {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    primary:  "#7c6ff7",   // purple-ish primary
    accent:   "#a78bfa",   // lighter violet accent
    emerald:  "#34d399",
    amber:    "#fbbf24",
    cyan:     "#22d3ee",
    rose:     "#fb7185",
  };

  const gridColor   = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const labelColor  = isDark ? "rgba(255,255,255,0.4)"  : "rgba(0,0,0,0.38)";
  const tooltipBg   = isDark ? "#1e1f2e"                : "#ffffff";
  const tooltipBorder = isDark ? "#2d2e42"              : "#e5e7eb";

  const baseOptions: ApexOptions = {
    chart: {
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "Inter, Plus Jakarta Sans, sans-serif",
      animations: {
        enabled: true,
        speed: 600,
        animateGradually: { enabled: true, delay: 80 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
    },
    theme: { mode: isDark ? "dark" : "light" },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 4, bottom: 0, left: 4 },
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels: {
        style: { colors: labelColor, fontSize: "11px", fontWeight: 500 },
      },
    },
    yaxis: {
      labels: {
        style: { colors: labelColor, fontSize: "11px", fontWeight: 500 },
      },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      style: { fontSize: "12px" },
      x: { show: true },
    },
    dataLabels: { enabled: false },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "right",
      fontSize: "12px",
      fontWeight: 500,
      labels: { colors: labelColor },
      markers: { size: 6 },
      itemMargin: { horizontal: 10 },
    },
    states: {
      hover: { filter: { type: "lighten" } },
      active: { filter: { type: "darken" } },
    },
  };

  return { isDark, baseOptions, colors };
}
