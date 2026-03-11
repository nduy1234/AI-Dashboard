import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  listCampaigns, 
  createCampaign, 
  updateCampaign, 
  deleteCampaign,
  launchCampaign,
  pauseCampaign,
  getListCampaignsQueryKey,
  type ListCampaignsParams,
  type CreateCampaignBody,
  type UpdateCampaignBody
} from "@workspace/api-client-react";

export function useCampaigns(params?: ListCampaignsParams) {
  return useQuery({
    queryKey: getListCampaignsQueryKey(params),
    queryFn: () => listCampaigns(params, { credentials: "include" }),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCampaignBody) => createCampaign(data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCampaignBody }) => 
      updateCampaign(id, data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCampaign(id, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    },
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => launchCampaign(id, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    },
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => pauseCampaign(id, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    },
  });
}
