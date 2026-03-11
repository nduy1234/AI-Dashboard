import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  listIntegrations, 
  updateIntegration,
  getListIntegrationsQueryKey,
  type UpdateIntegrationBody
} from "@workspace/api-client-react";

export function useIntegrations() {
  return useQuery({
    queryKey: getListIntegrationsQueryKey(),
    queryFn: () => listIntegrations({ credentials: "include" }),
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateIntegrationBody }) => 
      updateIntegration(id, data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
    },
  });
}
