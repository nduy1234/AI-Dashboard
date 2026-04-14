import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listEmailAccounts,
  createEmailAccount,
  deleteEmailAccount,
  getListEmailAccountsQueryKey,
  type CreateEmailAccountBody,
} from "@workspace/api-client-react";

export function useEmailAccounts() {
  return useQuery({
    queryKey: getListEmailAccountsQueryKey(),
    queryFn: () => listEmailAccounts({ credentials: "include" }),
  });
}

export function useCreateEmailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmailAccountBody) =>
      createEmailAccount(data, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListEmailAccountsQueryKey() });
    },
  });
}

export function useDeleteEmailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEmailAccount(id, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListEmailAccountsQueryKey() });
    },
  });
}
