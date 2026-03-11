import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  listLeads, 
  createLead, 
  updateLead, 
  deleteLead,
  getListLeadsQueryKey,
  importLeads,
  verifyLeadEmails,
  type ListLeadsParams,
  type CreateLeadBody,
  type UpdateLeadBody,
  type ImportLeadsBody,
  type VerifyEmailsBody
} from "@workspace/api-client-react";

export function useLeads(params?: ListLeadsParams) {
  return useQuery({
    queryKey: getListLeadsQueryKey(params),
    queryFn: () => listLeads(params, { credentials: "include" }),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeadBody) => createLead(data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLeadBody }) => 
      updateLead(id, data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLead(id, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    },
  });
}

export function useImportLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportLeadsBody) => importLeads(data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    },
  });
}

export function useVerifyLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VerifyEmailsBody) => verifyLeadEmails(data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    },
  });
}
