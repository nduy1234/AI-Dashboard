import { useQuery } from "@tanstack/react-query";
import { 
  getDashboardStats, 
  getDashboardCharts,
  getGetDashboardStatsQueryKey,
  getGetDashboardChartsQueryKey
} from "@workspace/api-client-react";

export function useDashboardStats() {
  return useQuery({
    queryKey: getGetDashboardStatsQueryKey(),
    queryFn: () => getDashboardStats({ credentials: "include" }),
  });
}

export function useDashboardCharts() {
  return useQuery({
    queryKey: getGetDashboardChartsQueryKey(),
    queryFn: () => getDashboardCharts({ credentials: "include" }),
  });
}
